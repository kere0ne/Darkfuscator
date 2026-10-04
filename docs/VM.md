# Interpreter architecture

The generated program executes Darkfuscator's own instruction set. This page
explains the runtime: dispatch, handlers, audits, and locks.

## Architecture at a glance

- **Register-based.** Each Lua function (proto) has its own register frame
  (R), a register count (nparams, maxreg), upvalues, constants (K), an
  instruction list (I), and child protos.
- **Handler-table dispatch.** One table slot holds one opcode handler; control
  flow only exists in the dispatch chain and inside the handlers. There is no
  single interpreter function to read and no central switch to lift.
- **Native operators.** Every operation is carried out by a native Luau
  operator, so metamethods, coercion, integer semantics, coroutines, pcall and
  error messages behave exactly as they do in the original script.

## Per-build randomization

Every build reshuffles:

- **Opcode ids.** 16-bit random ids, one per instruction, unique per build,
  plus dead ids that map to harmless no-ops.
- **Slot names.** The program table's slots (payload, checksums, decoder, seal)
  get generated collision-checked names.
- **Handler bodies.** Each used opcode gets up to six different bodies (the
  same semantics wrapped in provably-dead opaque predicates); dispatch picks
  one per call, so a lifted interpreter can never be matched against one body.
- **Payload key material.** Key, XOR stream seed, rolling seed, seal, and the
  base64 alphabet are per-build and embedded in the build.

## Encrypted bytecode loading

The payload unpacks in order (see docs/BYTECODE.md): base64 with the build's
own shuffled alphabet, then the three cipher layers unwrapped, then the LZSS
dictionary pass, then the integrity checksums recompute and compare. Any
mismatch errors with "Darkfuscator integrity check failed" (fail closed).

## Runtime instruction decoding

Instructions unpack once at load (opcode id + three operands + optional
extension operands, zigzag varints) into per-proto lists; handlers read them
through by()/vr() readers. Operand encryption: the unpacked operand values are
covered by the checksums, and the payload is covered by the ciphers, so
tampering with either fails closed.

## Error handling

- Instruction-stream unpacking errors surface as integrity failures (fail
  closed), never as silently degraded behavior.
- Original-script errors keep their messages and positions (native operators).
- pcall around the entry call behaves like the original script's.

## Anti-tamper

- **Bytecode integrity.** Two rolling checksums (mod 65521 / 65519) cover the
  full plaintext proto stream, recomputed inside the generated VM before any
  instruction unpacks.
- **VM validation + tamper detection.** The anti-tamper option wraps the
  loader in a chunked wrapper that re-audits the environment on a heartbeat
  (fast / full options) and re-raises the seal; stripping the audit out never
  decrypts (the seal is an input to the ciphers).
- **Avoiding unstable methods.** No stack-overflow or crash tricks: the
  wrapper only raises errors, and the wrapper's own statements are
  semantics-neutral so legitimate execution never breaks.

## Environment hiding + audits

- captureGlobals grabs the caller's environment with getfenv(), so globals
  bind to the caller rather than a fixed table (environment hiding).
- envChecks option: anti-env probes (0/1/2 strength). The passing audit
  produces an environment-derived value that is a required input to payload
  decryption (the seal), so a build with the audit stripped out never
  decrypts.
- envLock: probes confirm a genuine Roblox client; refusal outside (fail
  closed).
- lockPlace / lockUniverse: execution binding to a Roblox place / universe.
