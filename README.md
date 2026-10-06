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


## v5.0 behavior

**Every build ships maximum protection by default.** The engine defaults are the
strongest profile: strict anti-environment audit, full anti-tamper loader,
monstrous junk, `confuse` naming, compression. The web UI has no settings panel;
the CLI still accepts `--preset lightweight|balanced|maximum` and explicit flags
when you need a lighter build.

**Failures are silent.** A tampered, dumped, or non-Roblox environment gets no
message: the environment audit and anti-tamper battery stop the program quietly,
before a single byte decrypts, and a failure caught by the Heartbeat re-audit
hangs the thread. No error text names the protector or the check that tripped.

**Two VM dispatch architectures.** Each build randomly picks between a shuffled
compare ladder and a scrambled numeric jump table (opcode id maps straight to a
handler reference, dead ids included), with 8 different handler bodies per used
opcode at full junk and 20 provably-dead opaque predicates in the pool. There is
no single interpreter loop to lift, and no two builds look alike.

## Folder structure

```
bin/                 CLI interface
  luau-obfuscator.js luau-obfuscator <input.luau> <output.luau> --preset maximum
examples/            example scripts: plain input + obfuscated build
docs/                architecture, VM, and bytecode format explanations
references/anti-env/ reference anti-environment logger sources (incl. AEL v1.10, wynfuscate harness)
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

## /v1 API (Cloudflare Pages Functions)

| Endpoint | Method | What it does |
|---|---|---|
| `/v1/protect` | POST | `{ source, preset?, seed?, options? }` → `{ ok, preset, output, bytes }`. Presets: `lightweight`, `balanced` (default), `maximum`. 200 KB source cap. |
| `/v1/protect` | GET | Self-describing usage document. |
| `/v1/health` | GET | `{ ok, name, version, engine, time }` liveness. |

Example:

```sh
curl -s https://darkfuscator.pages.dev/v1/protect \
  -H 'content-type: application/json' \
  -d '{"source":"print(1+1)","preset":"balanced"}'
```

The engine runs server-side per request (the same pipeline the web UI runs
client-side); no account, no key.

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
| junk | 0-3 | decoy dispatch branches; 3 = monstrous (~100k junk statements). **Default: 3** |
| guard | 0-2 | anti-environment audit strength |
| envChecks | 0-2 | anti-env probes; the passing audit feeds the decryption seal |
| antiTamper | 0-2 | chunked loader wrapper + heartbeat re-audit: off / fast / full. **Default: 2** |
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

## Accounts, API keys and the public API (v5.1)

Every account automatically gets a personal API key (`dk_live_...`). Passwords
are PBKDF2-SHA-256 hashed (120k iterations, per-user salt) and never stored in
plaintext. API keys are stored as a SHA-256 lookup hash plus an AES-GCM
encrypted copy (key derived from the AUTH_SECRET env var), so only the owner
can reveal their key from the dashboard.

- `POST /api/auth/signup` `{username, email, password}` — creates the account,
  its API key and a 7-day httpOnly session cookie.
- `POST /api/auth/login` `{identifier, password}` — username or email.
- `POST /api/auth/logout`, `GET /api/auth/me` — session lifecycle.
- `POST /api/auth/account` — change password / email / username (current
  password required for each).
- `GET /api/me/key` — your key (masked + full for the owner), created date,
  last-used, usage counters.
- `POST /api/me/key/regenerate` — rotates the key; the old key is deleted from
  the lookup table immediately.
- `GET /api/me/usage` — usage stats + last 20 requests (status, bytes, ms; no
  source or key material is ever logged).
- `POST /api/v1/obfuscate` — the public API: Bearer key auth, per-key rate
  limits (30/min, 1000/day), body validation, per-user usage accounting.
  `{source, preset?, options?, seed?}` -> `{success, requestId, preset, bytes,
  durationMs, result}`.
- `POST /api/v1/protect` — authenticated alias of `/api/v1/obfuscate`.
- `GET /api/v1/health` — liveness + version.

The developer documentation lives at `/docs` (docs.html): base URL, auth
scheme, endpoint reference, options, status codes, rate limits and cURL /
JavaScript / Python / Lua examples. No real key material appears in the docs.

Backend notes: Cloudflare Pages Functions + KV (`DARKFUSCATOR_KV`); set
`AUTH_SECRET` (or `ADMIN_TOKEN`) as an environment variable — never hardcode
secrets into the frontend. CORS is open on `/api/v1/*` (API-key auth) and
intentionally absent on `/api/auth/*` + `/api/me/*` (same-origin cookies).
Rate limiting uses short-TTL KV counters; auth endpoints are additionally
capped per IP (20/min).

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
