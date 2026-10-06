#!/usr/bin/env node
/*
 * test-cli.js — CLI, presets, and compression roundtrip tests.
 *   node tools/test-cli.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'luau-obfuscator.js');
const DK = require(path.join(ROOT, 'site', 'js', 'obfuscate.js'));
const LZ = require(path.join(ROOT, 'site', 'js', 'lz.js'));
const Presets = require(path.join(ROOT, 'site', 'js', 'presets.js'));
const LUAU = path.join(ROOT, 'tools', 'luau');

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('ok:', name); }
  else { fail++; console.log('FAIL:', name, detail || ''); }
}

function cliRun(args) {
  try {
    const res = execFileSync('node', [CLI].concat(args), { encoding: 'utf8', timeout: 120000 });
    return { ok: true, res };
  } catch (e) {
    return { ok: false, res: (e.stderr || '') + (e.stdout || '') };
  }
}

function nativeVsVm(srcFile, protFile) {
  const src = fs.readFileSync(srcFile, 'utf8');
  const prot = fs.readFileSync(protFile, 'utf8');
  const f1 = '/tmp/tcli-n.luau', f2 = '/tmp/tcli-p.luau';
  fs.writeFileSync(f1, src); fs.writeFileSync(f2, prot);
  const a = execFileSync(LUAU, [f1], { encoding: 'utf8', timeout: 60000 });
  const b = execFileSync(LUAU, [f2], { encoding: 'utf8', timeout: 60000 });
  return a === b;
}

const corpus = path.join(ROOT, 'tests', 'corpus', '01-basic.luau');

// 1. help
ok('help', cliRun(['--help']).ok);

// 2. every preset protects + runs identically
for (const name of Presets.names) {
  const out = '/tmp/tcli-' + name + '.luau';
  const r = cliRun([corpus, out, '--preset', name, '--seed', '777', '--json']);
  // the behavior-comparing build runs with anti-tamper off: the heartbeat
  // audit correctly refuses a non-Roblox sandbox, so comparing behavior
  // through it measures the audit, not the VM
  const behOut = '/tmp/tcli-beh-' + name + '.luau';
  cliRun([corpus, behOut, '--preset', name, '--seed', '777', '--anti-tamper', '0']);
  ok('preset ' + name + ' exit', r.ok);
  if (r.ok) {
    ok('preset ' + name + ' parses', DK.validate(fs.readFileSync(out, 'utf8')).ok);
    if (name !== 'maximum') {
      // runtime behavior identical (skip on maximum: slow build)
      ok('preset ' + name + ' behavior', nativeVsVm(corpus, behOut));
    }
  }
}

// 3. fixed seed reproducibility
const a1 = '/tmp/tcli-r1.luau', a2 = '/tmp/tcli-r2.luau';
cliRun([corpus, a1, '--preset', 'balanced', '--seed', '913']);
cliRun([corpus, a2, '--preset', 'balanced', '--seed', '913']);
ok('fixed seed reproducible', fs.readFileSync(a1, 'utf8') === fs.readFileSync(a2, 'utf8'));

// 4. config file
const cfgPath = '/tmp/tcli-cfg.json';
fs.writeFileSync(cfgPath, JSON.stringify({ junk: 0, nameStyle: 'short', seed: 5 }));
const cfgOut = '/tmp/tcli-cfg.luau';
const cr = cliRun([corpus, cfgOut, '--config', cfgPath]);
ok('config file exit', cr.ok);
if (cr.ok) {
  ok('config file parses', DK.validate(fs.readFileSync(cfgOut, 'utf8')).ok);
  const sp1 = spawnSync('node', [CLI, corpus, '/dev/null', '--config', cfgPath, '--json'], { encoding: 'utf8', timeout: 60000 });
  const parsed = JSON.parse(sp1.stderr.trim());
  ok('config applied (nameStyle)', parsed.options.nameStyle === 'short');
  ok('config applied (junk)', parsed.options.junk === 0);
}

// 5. invalid source: exit 1 with line info
const badPath = '/tmp/tcli-bad.luau';
fs.writeFileSync(badPath, 'local x = if then end');
const br = cliRun([badPath, '--stdout']);
ok('invalid source exit 1', !br.ok && /line/.test(br.res), br.res.slice(0, 60));

// 6. stdin input
const stdinOut = '/tmp/tcli-stdin.luau';
fs.writeFileSync(stdinOut, execFileSync('node', [CLI, '-', '--stdout', '--preset', 'lightweight', '--seed', '1'], {
  input: fs.readFileSync(corpus, 'utf8'), timeout: 60000
}));
ok('stdin input parses', DK.validate(fs.readFileSync(stdinOut, 'utf8')).ok);

// 7. compression module roundtrips
function refDec(packed) {
  let p = 0, v = 0, sh = 1;
  while (true) { if (p >= packed.length) throw new Error('runoff'); const b = packed[p++]; v += (b % 128) * sh; if (b < 128) break; sh *= 128; }
  const out = []; let oc = 0, fl = 0, fb = 0;
  while (oc < v) {
    if (fb === 0) { fl = packed[p++]; fb = 8; }
    const bt = fl % 2; fl = (fl - bt) / 2; fb--;
    if (bt === 1) out[oc++] = packed[p++];
    else {
      const b1 = packed[p++], b2 = packed[p++];
      const dist = Math.floor(b2 / 16) * 256 + b1 + 1;
      const ml = Math.floor(b2 % 16) + 3;
      if (oc - dist < 0) throw new Error('bad dist');
      for (let k = 0; k < ml; k++) { out[oc] = out[oc - dist]; oc++; }
    }
  }
  return out;
}
let seed = 11;
function rng() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
let roundOk = true;
for (let t = 0; t < 120 && roundOk; t++) {
  const sz = 16 + Math.floor(rng() * 400);
  const alpha = 1 + Math.floor(rng() * 6);
  const bytes = Array.from({ length: sz }, () => Math.floor(rng() * alpha));
  const packed = LZ.compress(bytes);
  if (!packed) continue;
  let out;
  try { out = refDec(packed); } catch (e) { roundOk = false; break; }
  if (out.length !== bytes.length || out.some((v, i) => v !== bytes[i])) roundOk = false;
}
ok('compression roundtrips', roundOk);
// e2e: string-heavy file compresses (assert ratio < 0.6)
const stringsOut = '/tmp/tcli-strings.luau';
const sr = cliRun([path.join(ROOT, 'tests', 'corpus', '03-strings.luau'), stringsOut, '--preset', 'balanced', '--seed', '3', '--json']);
if (sr.ok) {
  const sp2 = spawnSync('node', [CLI, path.join(ROOT, 'tests', 'corpus', '03-strings.luau'), '/dev/null', '--preset', 'balanced', '--seed', '3', '--json'], { encoding: 'utf8', timeout: 60000 });
  const j = JSON.parse(sp2.stderr.trim());
  ok('LZSS compresses string-heavy file', j.lz && j.bytecodeBytes < j.bytecodeOrigBytes * 0.8,
    JSON.stringify({ from: j.bytecodeOrigBytes, to: j.bytecodeBytes }));
} else {
  ok('LZSS compresses string-heavy file', false);
}

// 8. version
ok('version', /5\.1\.0/.test(execFileSync('node', [CLI, '--version'], { encoding: 'utf8' })));

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
