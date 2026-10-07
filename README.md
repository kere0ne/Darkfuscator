# Darkfuscator

Darkfuscator is a Luau protection platform and custom-VM engine. It transforms supported Luau through a real lexer, parser, semantic analysis, conservative AST/bytecode optimization, custom register bytecode compiler, build-specific serializer, and generated VM loader. It does not return renamed source or a canned payload.

> Client-side obfuscation raises the cost of reverse engineering; it cannot make code impossible to inspect or change on a machine that executes it. Keep secrets and authoritative decisions on trusted server-side systems.

## Implemented compatibility

- **Luau** environments that provide the ordinary primitives used by the generated VM, including `bit32`.
- **Roblox Luau**, with optional numeric place and universe bindings when explicitly selected.

Generic Lua, unknown runtimes, and executor-specific environments are not advertised as supported. Parse-verified output is still not a replacement for testing protected scripts in their intended runtime.

## What a build does

- Parses Luau and resolves scope information before compilation.
- Performs semantics-preserving literal and bytecode optimizations.
- Compiles the supported input to custom register bytecode rather than shipping readable source.
- Uses fresh per-build randomization for generated names, opcode identifiers, handler ordering, byte layout, string encoding, and payload serialization. A supplied text or numeric seed makes this structure reproducible.
- Supports FAST, BALANCED, and SECURE runtime layouts; optional RLE compression is a size pass, not a security claim.
- Can add payload integrity verification. A failed check returns before bytecode runs; it does not generate destructive loops or runtime probes.
- Re-parses generated output before returning it.

The serializer uses build-specific encoding and integrity checks to increase analysis cost. It is not presented as a cryptographic secrecy boundary.

## Platform

The hosted platform in `site/` includes server-backed registration, email verification, password reset, sessions, projects, source-retention choices, build history, API keys, usage logs, documentation, and account/security controls. The backend invokes the same engine and validates accepted options; interface controls are sent to real endpoints rather than simulated in the browser.

`/offline` is deliberately different: it is a local-engine workspace with no account, server storage, history, email, or API-key behavior. Build a single-file local version with:

```bash
node tools/build-standalone.js
```

This regenerates `darkfuscator-standalone.html` from the current local page and engine.

## Repository layout

```text
bin/luau-obfuscator.js   CLI entry point
site/                    platform shells, docs, local engine page, and browser engine
site/js/luau-lexer.js    lexer
site/js/luau-parser.js   parser and scope resolution
site/js/pipeline.js      conservative AST optimization
site/js/vm-compile.js    AST to custom register bytecode
site/js/vm-emit.js       bytecode serialization and generated VM loader
tools/serve.js           development platform server
tests/                   parser, differential, fuzz, and UI regression tests
```

## CLI

The CLI requires Node.js 18 or later and runs the real engine:

```bash
node bin/luau-obfuscator.js --help
node bin/luau-obfuscator.js input.luau output.luau --preset maximum
node bin/luau-obfuscator.js input.luau --seed release-2026 --integrity 2
node bin/luau-obfuscator.js input.luau --config build-options.json
```

Supported flags are `--seed`, `--junk 0-4`, `--guard 0-2`, `--integrity 0-2`, `--vm-layers 1-10`, `--vm-mode fast|balanced|secure`, `--name-style short|random|confuse`, `--compression`, `--no-compression`, `--no-minify`, `--no-watermark`, `--no-capture-globals`, `--lock-place`, `--lock-universe`, `--config`, and `--quiet`.

The JSON config uses the engine option names: `preset`, `seed`, `junk`, `guard`, `antiTamper` (integrity level), `vmLayers`, `vmMode`, `nameStyle`, `minify`, `watermark`, `captureGlobals`, `compression`, `lockPlace`, and `lockUniverse`. Unsupported keys are rejected by the CLI.

## Development and checks

```bash
npm install
npm start
node tests/run.js
node tests/fuzz.js 20
node tests/ui-test.js
node tests/run-antitamper.js
node tools/build-standalone.js
```

For the full browser platform, use the local server rather than opening an authenticated route from disk. The Cloudflare Pages redirect rules in `site/_redirects` map deep app and documentation routes to their appropriate shells.
