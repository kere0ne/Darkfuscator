#!/usr/bin/env node
/*
 * Randomised differential fuzzing.
 *
 * For every corpus file it builds many random option combinations and seeds,
 * obfuscates, then runs the original and the obfuscated script through the real
 * Luau VM and compares stdout, exit code and the resulting global environment.
 *
 *   node tests/fuzz.js [iterationsPerFile]
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
const CORPUS = path.join(__dirname, 'corpus');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'darkfuzz-'));

const ITER = Number(process.argv.slice(2).find(a => /^\d+$/.test(a)) || 10);
const BIG = process.argv.includes('--big');

const WRAP_HEAD = 'local __m = function(...)\n';
const WRAP_TAIL = `
end
local __r = table.pack(__m(...))
print("__RETS__", __r.n)
for __i = 1, __r.n do
  local __v = __r[__i]
  local __t = type(__v)
  print("__RET" .. __i .. "__", __t, (__t == "number" or __t == "string" or __t == "boolean") and tostring(__v) or __t)
end
local __e = getfenv and getfenv() or _G
local __k = {}
for __a, __b in pairs(__e) do
  local __t = type(__b)
  __k[#__k + 1] = tostring(__a) .. "=" .. ((__t == "number" or __t == "string" or __t == "boolean") and tostring(__b) or __t)
end
table.sort(__k)
print("__STATE__", table.concat(__k, "|"))
`;

function run(file) {
  try { return { code: 0, out: execFileSync(LUAU, [file], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) {
    // keep stdout plus only the first stderr line: stack traces carry paths and
    // line numbers that legitimately differ between original and obfuscated code
    const err = String(e.stderr || '').split('\n')[0];
    return { code: e.status, out: String(e.stdout || '') + '\nERR ' + err, err };
  }
}
const norm = s => String(s).replace(/^.*\.(luau|lua):(\d+):/gm, 'FILE:$2:').replace(/:\d+:/g, ':L:');

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

let total = 0, failures = 0;
// The Brander reference build cannot run outside Roblox (it dies on task.defer)
// and its loader asserts on setfenv()/getfenv() identity, which a bytecode VM
// does not emulate (see README, "Known limits"). Still valuable as a build
// stress test — tests/run.js obfuscates it and re-parses the result.
const BUILD_ONLY = new Set(['protected-sample.luau']);
let files = fs.readdirSync(CORPUS).filter(f => f.endsWith('.luau')).sort();
const extra = [];
if (BIG) {
  for (const rel of ['../../site/assets/protected-sample.luau']) {
    const p = path.join(CORPUS, rel);
    if (fs.existsSync(p)) extra.push({ abs: p, name: path.basename(rel) });
  }
}

for (const entry of files.map(f => ({ abs: path.join(CORPUS, f), name: f })).concat(extra)) {
  const file = entry.name, src = fs.readFileSync(entry.abs, 'utf8');
  if (BUILD_ONLY.has(file)) {
    const built = DARK.obfuscate(src, { seed: 12345, junk: 2, nameStyle: 'confuse' });
    total++;
    if (!built.ok || !DARK.validate(built.output).ok) { failures++; console.log(`  FAIL ${file} build :: ${built.error && built.error.message}`); }
    else console.log(`  BUILD-ONLY ${file.padEnd(24)} ${built.output.length.toLocaleString()} chars, ${built.stats.protos} protos`);
    continue;
  }
  const dir = path.join(TMP, path.basename(file, '.luau'));
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'orig.luau'), src);
  fs.writeFileSync(path.join(dir, 'origstate.luau'), WRAP_HEAD + src + '\n' + WRAP_TAIL);
  const base = run(path.join(dir, 'orig.luau'));
  const baseState = run(path.join(dir, 'origstate.luau'));

  let bad = 0;
  for (let i = 0; i < ITER; i++) {
    total++;
    const seed = (i * 2654435761 + file.length * 97) % 0xFFFFFFFF;
    const opts = {
      nameStyle: pick(Math.random, ['short', 'random', 'confuse']),
      minify: Math.random() < 0.8,
      junk: Math.floor(Math.random() * 3),
      watermark: Math.random() < 0.5,
      seed
    };
    let res;
    try { res = DARK.obfuscate(src, opts); }
    catch (e) {
      console.log(`  THREW ${file} ${JSON.stringify(opts)} :: ${e.message}`);
      bad++; failures++;
      continue;
    }
    if (!res.ok) {
      console.log(`  REJECTED ${file} ${JSON.stringify(opts)} :: ${JSON.stringify(res.error)}`);
      bad++; failures++;
      continue;
    }
    const f = path.join(dir, 'obf' + i + '.luau');
    fs.writeFileSync(f, res.output);
    fs.writeFileSync(f.replace('.luau', 'state.luau'), WRAP_HEAD + res.output + '\n' + WRAP_TAIL);
    const a = run(f);
    const b = run(f.replace('.luau', 'state.luau'));
    const problems = [];
    if (a.code !== base.code) problems.push(`exit ${base.code} vs ${a.code}`);
    if (norm(a.out) !== norm(base.out)) problems.push('stdout differs');
    if (norm(b.out) !== norm(baseState.out)) problems.push('state differs');
    if (problems.length) {
      bad++; failures++;
      console.log(`  MISMATCH ${file} seed=${seed} ${JSON.stringify(opts)} :: ${problems.join(', ')}`);
      fs.writeFileSync(path.join(TMP, `fail-${file}-${i}.luau`), res.output);
      const la = norm(base.out).split('\n'), lb = norm(a.out).split('\n');
      for (let k = 0; k < Math.max(la.length, lb.length); k++) {
        if (la[k] !== lb[k]) { console.log(`    line ${k + 1}: ${JSON.stringify(la[k])} vs ${JSON.stringify(lb[k])}`); break; }
      }
    }
  }
  console.log(`${bad ? 'FAIL' : 'PASS'} ${file.padEnd(20)} ${ITER} configs`);
}

console.log(`\n${total - failures}/${total} configurations matched the original behaviour`);
if (failures) console.log('artifacts in ' + TMP);
process.exit(failures ? 1 : 0);
