# 🎃 Darkfuscator v4 — hardened bytecode VM build

**Open `index.html`** — it is a self-contained build: double-click it, no server, no install.
**Upload the `site/` folder** to Cloudflare Pages to publish it (no build step).

A **static Cloudflare Pages site** that obfuscates Luau entirely in the browser. Darkfuscator does not rely on unsafe token renaming: it **compiles your script to register bytecode**, packs that bytecode into an
encrypted payload, and emits a self-contained interpreter that executes it — the same shape as the
commercial "Brander" style builds.

Every transform is proved by running the original and the obfuscated script through the **real Luau
VM** (0.741) and comparing stdout, exit code and the entire global environment.

```
site/                 ← upload this folder to Cloudflare Pages (no build step)
  index.html          landing page + obfuscator
  docs/index.html     /docs
  styles.css          Halloween theme
  js/luau-lexer.js    real Luau tokenizer
  js/luau-parser.js   recursive-descent parser + scope resolver
  js/vm-compile.js    AST → register bytecode (41 opcodes, closures, upvalues, varargs)
  js/vm-emit.js       bytecode → encrypted payload + interpreter build
  js/obfuscate.js     pipeline: parse → compile → emit → re-parse
  js/app.js           UI
  assets/             sample scripts + the 189 KB Brander reference
  _headers, _redirects
tests/                differential suite against the real Luau VM
tools/                standalone builder, bytecode fuzzer, zip packager
                      (+ the Luau 0.741 binary used by the tests, Linux x86-64)
darkfuscator-standalone.html   one self-contained file (works from file://)
```

---

## How a build works

| Stage | What happens |
|---|---|
| 1. Lex + parse | A real Luau lexer and recursive-descent parser build an AST with full scope resolution (`--!strict` directives, interpolated strings, compound assignment, generics, type syntax, varargs, `continue`). |
| 2. Compile | The AST becomes **register bytecode**: 41 opcodes (`LOADK`, `GETTABLE`, `CALL`, `CALLM`, `RETURN`, `RETURNT`, `VARARG`, `CLOSURE`, `FORPREP`, `TFORCALL`, `SELF`, …). Every function in your script becomes one proto; captured locals become shared upvalue boxes; varargs, multiple returns and tail calls have their own opcodes. |
| 3. Pack | Protos, constants and the string/number pool are serialised to a byte blob, then encrypted (per-byte key stream) and encoded as a single long string literal. Identifiers, strings and numbers only exist inside that payload. |
| 4. Emit | A generated interpreter is written around it: one table slot per opcode handler, hex-indexed register and constant tables, a randomised hex `elseif` dispatch chain with dead branches, boxed upvalues, memoised string decoding, and 1–4 character random identifiers. |
| 5. Verify | The finished source is **re-parsed with the same parser**. If it does not compile you get an error, never broken code. |

The result looks like the reference build:

```lua
return ({["rand"]=(function(a,b,c) … end), ["slot2"]=(function(a,b,c) … end), …})
  :entry(getfenv and getfenv() or _ENV or _G);
```

## Options

| Option | Values | Meaning |
|---|---|---|
| `junk` | `0` · `1` (default) · `2` | Strength. Adds dead `elseif` branches to the dispatch chain (12 / 30) and decoy slots to the program table (8 / 24). `0` is the leanest build. |
| `guard` | `0` · `1` (default) · `2` | Environment audit before decryption. `1` verifies builtins and the environment table; `2` adds executor-toolkit detection and a runtime bytecode checksum; `0` skips the audit. |
| `nameStyle` | `short` · `random` (default) · `confuse` | Generated identifier shape: 2 chars of `a-z0-9`, 2–4 mixed-case chars, or glyphs that read alike (`il1IO0`). |
| `minify` | `true` (default) | One-line output instead of one statement per line. |
| `watermark` | `true` (default) | Header comment. |
| `seed` | number / `null` | Same source + seed ⇒ byte-identical build. |

There are no presets: the bytecode VM is the only pipeline.

## Guarantees

* `tests/run.js` — **246 checks**: a 21-file corpus built with 3 configurations × 3 seeds, each
  executed in the real Luau VM and compared on **stdout, exit code and the whole global
  environment**; 25 intentionally broken files rejected by both the JS parser and Luau; the
  configurations a fuzzing run once broke are pinned as regression tests; 300 random builds are
  soaked for syntactic validity; the 189 KB reference script is compiled and re-parsed. The corpus
  also covers the four bugs the fuzzers found: upvalue writes, block scoping, multi-value `return`
  expansions and generic function expressions.
* `tests/fuzz.js` — random option sets per corpus file, each VM-compared (`node tests/fuzz.js 100`
  ⇒ 1 600 comparisons, `--big` adds the 189 KB script).
* `tools/vmfuzz.js` — a grammar-based random Luau generator that diffs random programs against
  their VM build. It found three real bugs (swapped `SETUPVAL` operands, boxes built at the capture
  site instead of the declaration, and declarations leaking out of `if` blocks); all three now have
  corpus tests. `node tools/vmfuzz.js 600` ⇒ 600/600 matched.
* `tests/ui-test.js` — 24 end-to-end jsdom tests driving the real page.

## Known limits

* `setfenv` / `getfenv` **introspection of your own functions** is not emulated. A build's functions
  run inside the interpreter, so `getfenv(1)` returns the interpreter's environment, not a per-closure
  one. Ordinary code never notices; the 189 KB Brander reference does (its loader asserts on
  environment identity) and is therefore excluded from the execution diff — see `BUILD_ONLY` in
  `tests/fuzz.js`.
* `debug.info` / `debug.traceback` report interpreter frames, not your original function names or
  line numbers. Runtime error messages themselves are preserved.
* Very large scripts cost interpreter time: the 189 KB reference compiles in ~0.5 s and runs
  roughly an order of magnitude slower than native.

> Obfuscation raises the cost of reading code — it is **not** a security boundary. There is no
> executor-specific detection, no hooks, no environment traps and no bypass behaviour anywhere in
> this project.

## Running the tests

```bash
# 1. get the reference Luau VM (used only for testing).
#    The release zip already ships tools/luau (Linux x86-64); otherwise:
curl -sL -o luau-ubuntu.zip \
  https://github.com/luau-lang/luau/releases/download/0.741/luau-ubuntu.zip
unzip -o luau-ubuntu.zip -d tools
#    or point elsewhere:  LUAU_BIN=/path/to/luau node tests/run.js

node tests/run.js            # 246 differential, reject, regression + soak tests
node tests/fuzz.js 100       # random option sets, VM-compared
node tools/vmfuzz.js 600     # random programs vs. their VM build
npm install jsdom && node tests/ui-test.js   # 24 UI tests (optional)
```

## Using the engine directly

```js
const res = Darkfuscator.obfuscate(source, {
  nameStyle: 'random',  // short | random | confuse
  junk: 1,              // 0 | 1 | 2
  guard: 1,             // 0 | 1 | 2
  minify: true,
  watermark: true,
  seed: 12345           // null = random
});
// res = { ok, output, stats, warnings, error? }
// res.stats = { engine:'vm', seed, ms, protos, opcodes, bytecodeBytes,
//               payloadChars, inputChars, outputChars, ratio, times }
```

`Darkfuscator.validate(src)` and `Darkfuscator.parse(src)` are also public. Each file works both as
a plain `<script>` and via `require()` in Node.

## Deploying

**Dashboard (no CLI needed)**
1. `node tools/make-zip.js` and unzip it, or just take the `site/` folder.
2. Cloudflare dashboard → **Workers & Pages** → your `darkfuscator` project → **Create deployment**.
3. Drag the **contents** of `site/` (not the folder itself) onto the upload box — `index.html`,
   `docs/`, `styles.css`, `js/`, `assets/`, `_headers`, `_redirects`, `robots.txt`.
4. **Save and deploy.** There is no build step: build command and output directory stay empty.

**Wrangler**

```bash
wrangler pages deploy site --project-name darkfuscator
```

The current `darkfuscator.pages.dev` deployment is an older "safe mode" build (it only strips
comments); deploying `site/` replaces it with the bytecode VM version.

`/docs` resolves to `docs/index.html` on its own. Want everything as one file?
`node tools/build-standalone.js` writes `darkfuscator-standalone.html` (CSS, JS and all examples
embedded — opens straight from disk).

Want one archive of everything? `node tools/make-zip.js` writes `darkfuscator.zip`: the site,
the single-file build, the tests, the tools and this README.

---

© 2026 Darkfuscator


## Anti-tamper loader (v4.4)

`antiTamper` wraps the finished build in a chunked loader: the protected program is split
into numeric byte chunks, encrypted per chunk at Full strength, and a wrapper verifies the
client (instances, DataModel properties, LocalPlayer, character, core services, engine data
types, environment identity) before decrypting, loading and running it. Heartbeat re-runs
the battery every half second after start. Fast mode skips the encryption pass.

## Anti-environment (v4.4)

`envChecks` controls the audit: at Strict the unseal key is derived from environment probes
instead of shipped in the file, impossible environment states scramble the seal silently
(junk decode, no patchable error), and service behaviour signatures only a live client
reproduces feed the key. `envLock` additionally refuses to decode outside a genuine Roblox
client. Decoded material self-wipes after use and a deferred re-audit destroys the
interpreter material if a hook is detected mid-run (anti-dump).

## Hardened runtime

v4.3 keeps the parser/compiler/VM pipeline and hardens what wraps it:

- **Two-layer payload cipher.** The compiled program is encrypted with a per-byte key stream followed by a per-position XOR pass, both seed-derived, before it is encoded as one string literal.
- **Integrity metadata.** After decryption the runtime recalculates two rolling checks over the bytecode and refuses to execute if either differs. At `guard 2` the root function's bytecode is also re-summed at runtime against a checksum baked into the payload, so a payload patched after decode refuses to run.
- **Environment audit (`guard`).** Before anything is decrypted, the build audits its environment and errors out (`Darkfuscator protected program: environment audit failed`) when the environment looks tampered with: spoofed `tostring`, stubbed builtins, a proxy environment that does not persist writes, `getfenv(0)` inconsistency, or (at `guard 2`) executor toolkits (`hookfunction`, `newcclosure`, `getgenv`, `getrenv`, `readfile`, `writefile`) present without a real DataModel underneath. The audit is passive: it never crashes or loops on purpose, so a clean environment always passes.
- **Payload scrubbing.** The encoded blob, alphabet and integrity metadata are cleared from the runtime table after successful decoding.
- **Handler variants.** Every used opcode is emitted with two or three (`junk 1`/`junk 2`) different handler bodies, each wrapped in provably-dead opaque predicates, and dispatch picks one per instruction at runtime. There is no single body per opcode for a deobfuscator to lift.
- **Lazy encrypted string constants.** String literals stay encrypted inside the payload (behind a per-build mask of their own) and are decoded only when a handler first reads them, so dumping the decoded program does not reveal them, and a decoded entry is replaced by its plaintext only on first use.
- **Audit seal.** The payload cipher is sealed with a build constant that the environment audit hands over only on success: strip or stub the audit and the payload never decrypts (the build fails closed), rather than running unguarded.
- **Anti-debug timing.** At `guard 2` the audit times a fixed arithmetic loop against `os.clock()`; a debugger or an environment that throttles every operation fails the audit before the payload decodes. The threshold keeps roughly 100x headroom over a normal Luau VM, so clean runs never trip it.
- **Execution locks.** With `lockPlace` and/or `lockUniverse` set, the build verifies `game.PlaceId` / `game.GameId` before the guard runs and refuses every other environment (the luau CLI and any DataModel-less host included) with `Darkfuscator protected program: execution locked`. Nothing decrypts outside the place you named.
- **Decoy game logic.** At strength 1 and up, realistic-looking game strings (leaderstats, RemoteEvent fires, DataStore calls) are woven into the constant pool behind the never-open decoy gate; under the lazy-string layer they are never even decoded at runtime.
- **Randomized layout.** Handler names, dispatch IDs and decoy slots vary between builds.

This is tamper resistance, not an impossible-to-dump guarantee. If code must execute on a client, a sufficiently capable observer can instrument the runtime and recover behavior. Darkfuscator therefore focuses on increasing extraction cost without relying on executor-specific anti-analysis tricks.

## Supplied AntiEnv files

The uploaded AntiEnv samples are retained as reference material under `references/anti-env/`. They contain environment probes and deliberate failure loops. They are **not injected verbatim**: those traps can break ordinary Luau/Roblox execution and are not a reliable compatibility layer. Their ideas are distilled into the passive `guard` audit instead, which checks the environment safely and refuses to run when it looks tampered with.
