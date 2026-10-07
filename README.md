# Darkfuscator v6

A Luau obfuscator that compiles readable Lua into **encrypted custom bytecode running inside a proprietary VM**. The output contains no Lua source and no Lua bytecode for a decompiler to read: it is a serialized, encrypted instruction stream decoded at runtime by an interpreter whose handlers live one table slot each.

## What every build gets

- **VM compiler** — readable Lua is compiled to custom bytecode that runs inside a proprietary VM. No loadstring in the core, nothing to hook.
- **Obfuscator** — variable/function renaming, string encryption, control-flow flattening, dead code injection.
- **Per-request randomization** — opcodes, names and structure shuffle every run, so no two payloads match.
- **Anti-tamper** — integrity checks detect and reject modified bytecode, with multi-layer encryption and a chunked encrypted loader.
- **Decompiler resistance** — standard Lua decompilers output garbage: there is no Lua bytecode to read in the first place.
- **Heavy junk** — up to 220k dead statements (about 2 MB) of dense arithmetic noise at junk level 4; 100k / 900 KB at level 3.
- **Nested VM** — up to 10 stacked, independently randomized VMs; the stack auto-caps when the payload outgrows nesting.
- **Hidden anti-tamper** — the 29-check battery ships obfuscated through Darkfuscator itself, so no check code, names or warn strings are readable.
- **Accounts + saved keys** — sign up on the site and dk_live_ keys are saved to your account; create, list and revoke them on the Account page.
- **Silent failure** — detection paths scramble the seal or wipe material quietly; there is no branded error string to grep for.

## Folder structure

```
bin/luau-obfuscator.js   CLI entry point
site/                    web UI (index.html, docs.html, styles.css, js/*)
site/js/luau-lexer.js    lexer
site/js/luau-parser.js   parser + scope resolution
site/js/vm-compile.js    AST -> register bytecode compiler
site/js/vm-emit.js       bytecode -> encrypted self-contained build
site/js/app.js           UI wiring (always maximum)
tests/run.js             differential execution tests vs the real Luau VM
tests/fuzz.js            randomised option soak
tools/                   packaging + standalone builder + luau runtime
```

## Installation

Dependency-free JavaScript; the CLI needs Node 18+.

```bash
git clone https://github.com/kere0ne/Darkfuscator
cd Darkfuscator
node bin/luau-obfuscator.js --help
```

The web UI needs nothing installed: open `site/index.html`, or host `site/` on any static host (Cloudflare Pages: no build command, output directory `site`).

## Usage

```bash
luau-obfuscator input.luau output.luau --preset maximum
luau-obfuscator input.luau output.luau --seed 1337
luau-obfuscator input.luau output.luau --config cfg.json
```

Presets: `lightweight`, `balanced`, `maximum` (default). Knobs: `--seed`, `--junk 0-4`, `--guard 0-2`, `--env-checks 0-2`, `--anti-tamper 0-2`, `--vm-layers 1-10`, `--name-style short|random|confuse`, `--lock-place`, `--lock-universe`, `--env-lock`, `--no-minify`, `--no-watermark`.

Full documentation, the VM architecture explanation, the bytecode format, and the runtime security model live at `docs.html` (and mirrored on the site sidebar).

## Tests

```bash
node tests/run.js      # 243 checks: parse agreement + differential execution
node tests/fuzz.js 20  # randomised configs stay valid
```

## Limits

Client-side protection raises the cost of analysis sharply; it does not make a client-side payload impossible to inspect on the machine that runs it.
