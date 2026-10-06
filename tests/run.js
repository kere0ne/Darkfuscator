#!/usr/bin/env node
/*
 * Darkfuscator test harness.
 *
 * 1. Parses every file in tests/corpus with the JS Luau parser and checks the
 *    real Luau VM agrees about whether it is valid.
 * 2. Obfuscates each valid file with several VM build configs and (a) re-parses
 *    the output,
 *    (b) runs original + obfuscated through the real Luau VM and compares
 *    stdout, exit code and the resulting global state.
 *
 * Usage: node tests/run.js [--verbose] [--filter=name]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function findLuau() {
  if (process.env.LUAU_BIN) return process.env.LUAU_BIN;
  var candidates = [
    path.join(__dirname, '..', '..', 'tools', 'luau'),   // sibling of the project (dev checkout)
    path.join(__dirname, '..', 'tools', 'luau'),         // inside the project (release zip)
    path.join(__dirname, 'tools', 'luau'),
    'luau'                                              // on PATH
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i] === 'luau') return candidates[i];
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  return candidates[0];
}
const LUAU = findLuau();
const DARK = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
// v5 default profile ships the full anti-tamper loader, which (by design)
// silently refuses to run outside a genuine Roblox client. The suite executes
// builds with the luau CLI to compare behavior, so it forces the wrapper off;
// presets and the wrapper itself are covered in tools/test-cli.js.
const _baseObf = DARK.obfuscate.bind(DARK);
DARK.obfuscate = (src, o) => _baseObf(src, Object.assign({ antiTamper: 0 }, o));
const Parser = require(path.join(__dirname, '..', 'site', 'js', 'luau-parser.js'));

const CORPUS = path.join(__dirname, 'corpus');
const BAD = path.join(__dirname, 'invalid');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'darkf-'));

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const FILTER = (args.find(a => a.startsWith('--filter=')) || '').split('=')[1];

let pass = 0, fail = 0;
const failures = [];

function log(ok, label, detail) {
  if (ok) { pass++; console.log('  \x1b[32mPASS\x1b[0m ' + label); }
  else {
    fail++; failures.push(label + (detail ? ' :: ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + label + (detail ? '\n       ' + String(detail).split('\n').slice(0, 6).join('\n       ') : ''));
  }
}

function runLuau(file) {
  try {
    const stdout = execFileSync(LUAU, [file], { encoding: 'utf8', timeout: 30000 });
    return { code: 0, out: stdout, err: '' };
  } catch (e) {
    if (e.status === undefined) throw e;
    return {
      code: e.status,
      out: e.stdout === undefined ? '' : String(e.stdout),
      err: e.stderr === undefined ? '' : String(e.stderr)
    };
  }
}

function normalize(text, file) {
  return String(text)
    .split('\n').map(l => l.replace(/^.*\.(luau|lua):(\d+):/g, 'FILE:$2:').replace(/\s+$/, '')).join('\n')
    .replace(/\r/g, '');
}

// strip line numbers from runtime error messages: obfuscation shifts lines
function loose(text) {
  return normalize(text).replace(/:\d+:/g, ':L:').replace(/line \d+/g, 'line L');
}

const WRAPPER_HEAD = 'local __darkf_main = function(...)\n';
const WRAPPER_TAIL = `
end
local __darkf_rets = table.pack(__darkf_main(...))
print("__RETS__", __darkf_rets.n)
for __i = 1, __darkf_rets.n do
  local __v = __darkf_rets[__i]
  local __ty = type(__v)
  print("__RET" .. __i .. "__", __ty, (__ty == "number" or __ty == "string" or __ty == "boolean") and tostring(__v) or __ty)
end
local __darkf_env = getfenv and getfenv() or _G
local __darkf_keys = {}
for __k, __v in pairs(__darkf_env) do
  local __ty = type(__v)
  local __val = (__ty == "number" or __ty == "string" or __ty == "boolean") and tostring(__v) or __ty
  __darkf_keys[#__darkf_keys + 1] = tostring(__k) .. "=" .. __val
end
table.sort(__darkf_keys)
print("__STATE__", table.concat(__darkf_keys, "|"))
`;

function writeProgram(dir, name, src, wrap) {
  const file = path.join(dir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, wrap ? WRAPPER_HEAD + src + '\n' + WRAPPER_TAIL : src);
  return file;
}

// ---------------------------------------------------------------- 1. corpus
console.log('\n\x1b[1mDifferential execution tests (real Luau VM)\x1b[0m');
if (!fs.existsSync(LUAU)) {
  console.log('  \x1b[33mSKIP\x1b[0m luau binary not found at ' + LUAU + ' (set LUAU_BIN)');
}

// Every build is a bytecode VM build; these vary the knobs that reach it.
const BUILD_CONFIGS = [
  { label: 'normal', opts: { junk: 1, minify: true, nameStyle: 'random', watermark: true } },
  { label: 'lean', opts: { junk: 0, minify: true, nameStyle: 'short', watermark: false } },
  { label: 'heavy', opts: { junk: 2, minify: false, nameStyle: 'confuse', watermark: true } }
];

const corpusFiles = fs.existsSync(CORPUS) ? fs.readdirSync(CORPUS).filter(f => f.endsWith('.luau')).sort() : [];
for (const file of corpusFiles) {
  if (FILTER && !file.includes(FILTER)) continue;
  const src = fs.readFileSync(path.join(CORPUS, file), 'utf8');
  const base = path.basename(file, '.luau');
  console.log('\n' + file);

  // --- parser must accept it
  let parsed = null, parseErr = null;
  try { parsed = Parser.parse(src); } catch (e) { parseErr = e; }
  if (parseErr) { log(false, 'js parser accepts ' + file, parseErr.message + ' @' + parseErr.line); continue; }
  log(true, 'js parser accepts ' + file);

  const origFile = writeProgram(path.join(TMP, 'orig', base), 'prog.luau', src, false);
  const origRun = runLuau(origFile);
  const origStateFile = writeProgram(path.join(TMP, 'origstate', base), 'prog.luau', src, true);
  const origState = runLuau(origStateFile);

  for (const cfg of BUILD_CONFIGS) {
    for (const seed of [1, 7, 99]) {
      const label = `${cfg.label}/seed${seed}`;
      let res;
      try { res = DARK.obfuscate(src, Object.assign({ seed: seed }, cfg.opts)); }
      catch (e) { log(false, label + ' obfuscate', 'threw: ' + e.message); continue; }
      if (!res.ok) { log(false, label + ' obfuscate', JSON.stringify(res.error)); continue; }

      // output must re-parse
      let reErr = null;
      try { Parser.parse(res.output); } catch (e) { reErr = e; }
      if (reErr) { log(false, label + ' output parses', reErr.message + ' @' + reErr.line); continue; }

      const obfFile = writeProgram(path.join(TMP, 'obf', base, label.replace('/', '-')), 'prog.luau', res.output, false);
      const obfRun = runLuau(obfFile);
      const obfStateFile = writeProgram(path.join(TMP, 'obfstate', base, label.replace('/', '-')), 'prog.luau', res.output, true);
      const obfState = runLuau(obfStateFile);

      const sameOut = loose(origRun.out) === loose(obfRun.out);
      const sameCode = origRun.code === obfRun.code;
      const sameState = loose(origState.out) === loose(obfState.out);

      if (sameOut && sameCode && sameState) {
        log(true, label.padEnd(18) + `runtime identical (${res.output.length} chars, ${res.stats.ms}ms)`);
      } else {
        let detail = '';
        if (!sameCode) detail += `exit ${origRun.code} vs ${obfRun.code}\n`;
        if (!sameOut) detail += diffSummary(loose(origRun.out), loose(obfRun.out), 'stdout');
        if (!sameState) detail += diffSummary(loose(origState.out), loose(obfState.out), 'state');
        log(false, label.padEnd(18) + 'runtime differs', detail + '\n--- output was ---\n' + res.output.slice(0, 1200));
      }
    }
  }
}

function diffSummary(a, b, what) {
  const la = a.split('\n'), lb = b.split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      return `${what} line ${i + 1}:\n  orig: ${JSON.stringify(la[i])}\n  obf : ${JSON.stringify(lb[i])}`;
    }
  }
  return `${what}: (identical lines, different length)`;
}

// ------------------------------------------------- 2. invalid input handling
console.log('\n\x1b[1mRejects invalid Luau (agreement with the VM)\x1b[0m');
const badFiles = fs.existsSync(BAD) ? fs.readdirSync(BAD).filter(f => f.endsWith('.luau')).sort() : [];
for (const file of badFiles) {
  const src = fs.readFileSync(path.join(BAD, file), 'utf8');
  let jsErr = null;
  try { Parser.parse(src); } catch (e) { jsErr = e; }
  const tmpFile = writeProgram(path.join(TMP, 'bad'), 'prog.luau', src, false);
  const vm = runLuau(tmpFile);
  const vmRejects = vm.code !== 0;
  const label = file.padEnd(22);
  if (jsErr && vmRejects) log(true, label + 'both reject' + (VERBOSE ? ' — ' + jsErr.message : ''));
  else if (!jsErr && vmRejects) log(false, label + 'js accepted, VM rejected', vm.err.split('\n')[0]);
  else if (jsErr && !vmRejects) log(false, label + 'js rejected, VM accepted', jsErr.message);
  else log(false, label + 'both accepted (not actually invalid)');
}

// --------------------------------------- 2b. fuzz-driven regression configs
// These exact configurations once produced output the Luau VM rejected
// (junk snippets glued straight onto a number -> `10if`). They are pinned here
// so the failure can never come back silently.
console.log('\n\x1b[1mRegression: options that used to emit invalid Luau\x1b[0m');
const REGRESS = [
  ['05-scope.luau',    { nameStyle: 'short',   minify: false, junk: 1, watermark: true,  seed: 387278181 }],
  ['05-scope.luau',    { nameStyle: 'short',   minify: false, junk: 2,  watermark: false, seed: 2415086635 }],
  ['05-scope.luau',    { nameStyle: 'confuse', minify: false, junk: 2,  watermark: false, seed: 2027809715 }],
  ['04-interp.luau',   { nameStyle: 'confuse', minify: false, junk: 1,  watermark: false, seed: 387278278 }],
  ['08-varargs.luau',  { nameStyle: 'short',   minify: false, junk: 2,  watermark: true,  seed: 1013905682 }],
  ['12-comments.luau', { nameStyle: 'short',   minify: false, junk: 1,  watermark: false, seed: 2654437313 }],
  ['14-robloxish.luau',{ nameStyle: 'short',   minify: false, junk: 1, watermark: false, seed: 2415087023 }]
];

for (const [file, opts] of REGRESS) {
  const src = fs.readFileSync(path.join(CORPUS, file), 'utf8');
  const base = path.basename(file, '.luau');
  const label = (base + '/' + opts.seed).padEnd(30);
  let res;
  try { res = DARK.obfuscate(src, opts); }
  catch (e) { log(false, label + 'obfuscate', 'threw: ' + e.message); continue; }
  if (!res.ok) { log(false, label + 'obfuscate', JSON.stringify(res.error)); continue; }
  let reErr = null;
  try { Parser.parse(res.output); } catch (e) { reErr = e; }
  if (reErr) { log(false, label + 'output parses', reErr.message + ' @' + reErr.line); continue; }

  const tag = base + '-' + opts.seed;
  const origRun = runLuau(writeProgram(path.join(TMP, 'reg-orig', tag), 'prog.luau', src, false));
  const origState = runLuau(writeProgram(path.join(TMP, 'reg-origstate', tag), 'prog.luau', src, true));
  const obfRun = runLuau(writeProgram(path.join(TMP, 'reg-obf', tag), 'prog.luau', res.output, false));
  const obfState = runLuau(writeProgram(path.join(TMP, 'reg-obfstate', tag), 'prog.luau', res.output, true));
  const okOut = loose(origRun.out) === loose(obfRun.out) && origRun.code === obfRun.code;
  const okState = loose(origState.out) === loose(obfState.out);
  if (okOut && okState) log(true, label + `runtime identical (${res.output.length} chars)`);
  else {
    let detail = '';
    if (origRun.code !== obfRun.code) detail += `exit ${origRun.code} vs ${obfRun.code}\n`;
    if (loose(origRun.out) !== loose(obfRun.out)) detail += diffSummary(loose(origRun.out), loose(obfRun.out), 'stdout');
    if (!okState) detail += diffSummary(loose(origState.out), loose(obfState.out), 'state');
    log(false, label + 'runtime differs', detail);
  }
}

// ------------------------------------- 2c. randomised configs must stay valid
// A quick soak: lots of random option combinations, checked for syntactic
// validity (the VM round-trip for every combination lives in tests/fuzz.js).
console.log('\n\x1b[1mSoak: 20 random option sets per corpus file stay valid\x1b[0m');
{
  let built = 0, bad = 0, firstBad = '';
  for (const file of corpusFiles) {
    const src = fs.readFileSync(path.join(CORPUS, file), 'utf8');
    for (let i = 0; i < 20; i++) {
      const res = DARK.obfuscate(src, {
        nameStyle: ['short', 'random', 'confuse'][i % 3],
        minify: i % 4 !== 0,
        junk: i % 3,
        watermark: i % 5 === 0,
        seed: 1000 + i * 7919 + file.length
      });
      built++;
      if (!res.ok) { bad++; if (!firstBad) firstBad = file + ' :: ' + JSON.stringify(res.error); continue; }
      try { Parser.parse(res.output); }
      catch (e) { bad++; if (!firstBad) firstBad = file + ' :: ' + e.message + ' @' + e.line; }
    }
  }
  log(bad === 0, `${built - bad}/${built} random builds produced valid Luau`, firstBad);
}

// ---------------------------------------------------------- 3. big real file
console.log('\n\x1b[1mStress: the supplied 189 KB protected sample\x1b[0m');
const bigPath = path.join(__dirname, '..', 'site', 'assets', 'protected-sample.luau');
if (fs.existsSync(bigPath)) {
  const src = fs.readFileSync(bigPath, 'utf8');
  let t = Date.now();
  let parsed = null, e1 = null;
  try { parsed = Parser.parse(src); } catch (e) { e1 = e; }
  if (e1) log(false, 'parse 189KB sample', e1.message + ' @line ' + e1.line);
  else {
    log(true, `parse 189KB sample (${Date.now() - t}ms, ${parsed.symbols.length} locals)`);
    t = Date.now();
    const r = DARK.obfuscate(src, { seed: 5, junk: 1, nameStyle: 'random' });
    if (!r.ok) log(false, 'obfuscate 189KB sample', JSON.stringify(r.error));
    else {
      // the real Luau VM must agree the output is syntactically valid: both
      // versions fail at runtime (they need Roblox's task.defer) with the same error
      const origErr = loose(runLuau(bigPath).err || runLuau(bigPath).out);
      const obfPath = path.join(TMP, 'big-obf.luau');
      fs.writeFileSync(obfPath, r.output);
      const obfRun = runLuau(obfPath);
      const obfErr = loose(obfRun.err || obfRun.out);
      if (obfRun.code !== 0 && /Expected|Malformed|Unexpected|Ambiguous/.test(obfErr)) {
        log(false, 'real Luau VM accepts obfuscated sample', obfErr.split('\n')[0]);
      } else {
        log(true, 'real Luau VM accepts obfuscated sample (same runtime error as input)');
      }
      let e2 = null;
      try { Parser.parse(r.output); } catch (e) { e2 = e; }
      if (e2) log(false, 'obfuscated sample re-parses', e2.message + ' @line ' + e2.line);
      else log(true, `obfuscate 189KB sample (${Date.now() - t}ms, ${src.length} -> ${r.output.length} chars)`);
    }
  }
}

// ------------------------------------------------------------------- summary
console.log('\n' + '='.repeat(64));
console.log(`${pass} passed, ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(' - ' + f));
}
console.log('tmp dir: ' + TMP);
process.exit(fail ? 1 : 0);
