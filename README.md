# Darkfuscator

A Luau/Lua 5.1 obfuscator with a **custom bytecode virtual machine**. Readable
Lua goes in; a self-contained interpreter build ships out. There is no standard
Lua bytecode in the payload, so standard decompilers have nothing to read.

```
-- This file is protected by Darkfuscator
return ({["iIsy"]="uzzcL4k2VWrv3kcNTptSpyGjsGamYcM63f...", ...}):entry(env)
```

**Everything is a bytecode VM build**: the AST is compiled to register
bytecode, serialised, compressed, encrypted, and shipped inside a per-build
randomized interpreter. Renaming, string encryption, control-flow flattening,
opaque predicates, dead code, execution locks, and integrity checksums are all
part of that pipeline.

## Folder structure

```
bin/                 CLI interface
  luau-obfuscator.js luau-obfuscator <input.luau> <output.luau> --preset maximum
examples/            example scripts: plain input + obfuscated build
docs/                architecture, VM, and bytecode format explanations
references/anti-env/ reference anti-environment logger sources
site/                publishable web build (index.html, engine, publishable service)
  js/                engine: lexer, parser, compiler, compression, emitter, orchestrator
  functions/api/     loader artifact service (Cloudflare Pages Functions)
  dashboard.html     artifact dashboard: loader IDs, requests, request logs, editor
  js/dashboard.js    dashboard wiring
tests/               unit tests: run.js suite, corpus, invalid scripts, fuzz
tools/               builders and harnesses (standalone HTML, zips, API tests)
README.md            this file
VERSION              engine version
```

Engine files (site/js/):

| File | Pipeline stage |
|---|---|
| luau-lexer.js | lexer: tokens, scopes, references |
| luau-parser.js | parser: tokens to AST |
| vm-compile.js | compiler: AST to register bytecode (the IR), constant pool |
| lz.js | compression module: LZSS dictionary pass |
| vm-emit.js | emitter: byte serialization, encryption, per-build interpreter |
| obfuscate.js | orchestrator: defaults, option merging, re-parse verification |

## Installation

CLI (needs Node 18+):

```sh
git clone https://github.com/kere0ne/Darkfuscator && cd Darkfuscator
npm link           # or run ./bin/luau-obfuscator.js directly
```

Web: open `site/index.html` in a browser. Everything runs client-side; no
server needed to build. Published site needs Cloudflare Pages (see docs).

## CLI usage

```sh
luau-obfuscator input.luau output.luau --preset maximum
luau-obfuscator input.luau --preset lightweight --seed 42 --stdout
luau-obfuscator input.luau --config my.json
```

Option precedence (last wins): engine defaults < preset < config file < flags.

Config file (JSON), read from --config or ./darkfuscator.config.json:

```json
{
  "junk": 2,
  "guard": 2,
  "envChecks": 2,
  "antiTamper": 2,
  "nameStyle": "confuse",
  "lockPlace": "1234567890"
}
```

| Option | Values | What it does |
|---|---|---|
| junk | 0-3 | decoy dispatch branches; 3 = monstrous (~100k junk statements) |
| guard | 0-2 | anti-environment audit strength |
| envChecks | 0-2 | anti-env probes; the passing audit feeds the decryption seal |
| antiTamper | 0-2 | chunked loader wrapper + heartbeat re-audit: off / fast / full |
| nameStyle | short / random / confuse | generated identifier style |
| minify | true / false | one-line output |
| compress | true / false | LZSS payload compression pass |
| watermark | true / false | leading protection comment |
| captureGlobals | true / false | grab the caller environment with getfenv() |
| envLock | true / false | run only inside a genuine Roblox client |
| lockPlace / lockUniverse | place / universe id | execution binding |
| seed | integer | reproducible builds |

## Programmatic API

```js
const DK = require('./site/js/obfuscate.js');
const res = DK.obfuscate(src, { junk: 2, seed: 123 });
// res.ok, res.output, res.stats, res.options, res.warnings
DK.validate(src) // syntax check
```

The result is re-parsed with the real Luau parser before it is returned:
Darkfuscator refuses to ship anything that is not valid, runnable Luau.

## Tests

```sh
npm test            # full engine suite
node tools/test-api.js   # loader artifact service (mock storage)
node tools/test-cli.js   # CLI + presets + compression roundtrip
```

## Docs

- docs/ARCHITECTURE.md — pipeline stages, how the spec maps to files
- docs/VM.md — interpreter architecture: dispatch, handlers, audits, locks
- docs/BYTECODE.md — instruction set, serialization, compression, encryption

## Performance notes

- A lightweight build lands ~10x the source size; a maximum build ~1 MB+
  (monstrous junk profile), by design.
- Compilation of a small source takes ~0.2s; a maximum profile build ~2s.
- The VM adds overhead vs native Lua (runtime decode + dispatch); the payload
  decompression pass costs one linear pass at load.

## Honest limitations

- Client-side code is always eventually dumpable: a build that runs in memory
  can be dumped from memory. The integrity checksums and heartbeat audits
  make modification fail closed, and the server-side loader artifact service
  can expire or revoke builds, but no client-side obfuscation is absolute.
- The loader artifact token rides in the loader URL and can be replayed while
  a build is valid; treat revocation as an audit tool, not an unbreakable key.
- Keep tokens and credentials out of distributed archives (see your security
  practice); secrets belong in environment variables or vaults.

## License

ISC
