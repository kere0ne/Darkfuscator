# Darkfuscator pipeline

How a source script becomes an interpreter build, and how the spec's stages
map to the files.

## Stages

```
source .luau
   |
   v
1. lexer            luau-lexer.js       tokens, scope starts, identifier starts
2. parser           luau-parser.js      tokens to AST; references and symbols
3. compiler         vm-compile.js       AST to register bytecode (the IR)
   |                                    constant pool (shared across protos)
   |                                    scope resolution, upvalue tracking
   v
4. serialization    vm-emit.js          byte stream: proto headers, constants,
   |                                    instruction operands (zigzag varints)
   v
5. compression      lz.js               LZSS dictionary pass (window 4096)
   |
   v
6. encryption       vm-emit.js          three layers (see docs/BYTECODE.md)
   |                                    + per-build shuffled base64 alphabet
   v
7. interpreter      vm-emit.js          per-build randomized interpreter build:
                                        random opcode ids, per-used-opcode
                                        handler table slots, several different
                                        handler bodies per opcode, decoder
                                        with checksums and the audit seal
   v
8. verification     obfuscate.js        the build is re-parsed with the real
                                        Luau parser; invalid output is never
                                        returned
```

## Notes on specific stages

**Compiler (IR).** The register bytecode produced by vm-compile.js is the
intermediate representation. It mirrors Lua function structure (nparams,
isvararg, maxreg, upvalues, constants, instruction list, child protos), so
closures, varargs, multi-returns, and coroutines behave like the original.

**Optimizer.** The pipeline deliberately keeps behavior preservation as the
priority, so there is no aggressive optimization pass: scope resolution,
constant pooling (deduplication), and the obfuscation transformations carry
the weight. Behavior is verified at two points: the build is re-parsed, and
the test suite executes corpus scripts natively and through the VM and
compares output byte for byte.

**Verification.** obfuscate() re-parses the finished build and refuses to
return anything that is not valid Luau. The CLI then prints stats (sizes, LZSS
ratio, ms, seed) so a broken profile shows up immediately.

## Service stages (loader artifacts)

The published site can ship artifacts with server-side validation:

```
functions/api/_lib.js    storage, IDs, tokens, response editor, assess()
functions/api/builds.js  create/list artifacts
functions/api/builds/[id].js  detail, editor (expiry/revocation/redirect), delete
functions/api/loader/[id].js  loader endpoint: validates ID + token, serves
                                   payload or the state's custom response
site/dashboard.html           dashboard: loader IDs, request logs, message editor,
                              preview before publish, expiry/revocation controls
```

Request logs cap at 100 shown (oldest reversed), stored cap 200; user agent and
country metadata are stored, no payload bytes.
