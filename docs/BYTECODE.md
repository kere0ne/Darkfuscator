# Bytecode format

The container is one Lua table literal shaped `({...}):entry(env)`. Slots:

- payload: six-bit packed, ciphered, LZSS-compressed proto stream
- check1 / check2: rolling build-time checksums over the plaintext stream
- decoder: unpacks base64, unwraps ciphers, unpacks the dictionary pass,
  recomputes checksums, then unpacks the proto tree
- seal: audit input (populated by the passing environment audit)

## Instruction set

Proprietary instruction set mirroring Lua 5.1 semantics: LOADK, LOADNIL,
LOADBOOL, MOVE, BOX, NEWTABLE, GETTABLE, SETTABLE, SETLISTM, GETUPVAL,
SETUPVAL, GETGLOBAL, SETGLOBAL, ADD, SUB, MUL, DIV, IDIV, MOD, POW, UNM, NOT,
LEN, CONCAT, EQ, LT, LE, TEST, JMP, FORPREP, FORLOOP, TFORCALL, CALL, CALLM,
RETURN, RETURNT, RETURNV, CLOSURE, VARARG, VARARGN, SELF, RETURNM.

Extension operands cover multi-value ops (CALLM nresults, CONCAT list length,
SETLISTM, VARARGN, RETURNV). SELF covers method-call coverage.

## Custom opcode mapping

Each opcode id is a random 16-bit number, unique per build (randomized opcode
layouts). Dead ids (up to 30 per build) unpack to harmless no-ops. The id table
is embedded per build, so a lifted id table from one build says nothing about
another.

## Operand encryption + instruction encoding

Operands encode as zigzag varints (signed, so backwards jump offsets encode
compactly); instructions encode as opcode id + three operands + an optional
extension-operand list. Operands are covered by the checksums and the whole
stream by the ciphers.

## Constant pools

Per-proto constant lists encode with a type byte: 0 nil, 1 bool, 2 number (as
string), 3 string. Per-proto sharing: the same constant used repeatedly encodes
once and is referenced by index. The compile pipeline pools constants across
protos where shared.

## Constant deduplication + compact instruction packing

The compile pipeline deduplicates repeated constants into pooled references;
the serialization layer packs values at 6 bits per character (not 8), which
compacts by about 25% before compression; zigzag varints keep small values to
one byte.

## Run-length + repeated instruction patterns

The dictionary pass subsumes run-length encoding (a run is an LZ match with
distance 1, up to 18 bytes per token); repeated instruction sequences match
within the 4096-byte window, up to 64 bytes per token.

## Dictionary compression

The LZSS pass (lz.js): 8 tokens per flag byte (LSB first), flag bit 1 =
literal byte, flag bit 0 = match. Match token: b1 = (dist-1) & 0xFF, b2 =
((dist-1) >> 8) << 4 | (len-3). Window 4096 bytes, match length 3..18, greedy
matching over a 3-byte-prefix hash chain, newest-first walk, up to 64
candidates. The stream starts with a plain varint of the decompressed length.

Observed ratios: ~0.37x on low-entropy input, ~0.15x on long runs, ~0.53x on
mixed, no gain on random (compress() returns null and the raw stream ships).

## Encryption (three layers)

On the packed stream, in order (unwrapped in reverse):

1. **Add-cipher.** byte = (byte + key + i*13 + seal) mod 256. Key 1..254.
2. **XOR stream.** byte ^= (xk + i*37 + seal) mod 256. xk 1..254.
3. **Rolling XOR.** byte ^= rkk; rkk = (ciphered byte + i) mod 256. Seed 1..254.
   Key N+1 derives from stored byte N, so the stream cannot be peeled
   byte-independently: every byte depends on every byte before it.

The seal (environment audit input) is embedded per build; builds that strip
the audit never decrypt (fail closed).

## Packing + alphabet

Values pack at 6 bits per character into a 64-character alphabet that is
shuffled per build and embedded in the build.

## Verification

Two rolling checksums (mod 65521 / 65519) encode into the container; the
generated VM recomputes them after unpacking the dictionary pass and refuses a
tampered payload.
