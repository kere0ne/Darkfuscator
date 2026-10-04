#!/usr/bin/env node
/*
 * Developer helper: compile one file with the VM backend, run both the original
 * and the obfuscated build through the real Luau VM and diff the output.
 *
 *   node tools/vm-try.js tests/corpus/01-basic.luau [--keep] [--junk=1] [--seed=1]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const LUAU = process.env.LUAU_BIN || path.join(__dirname, '..', '..', 'tools', 'luau');
const Parser = require(path.join(__dirname, '..', 'site', 'js', 'luau-parser.js'));
const Compile = require(path.join(__dirname, '..', 'site', 'js', 'vm-compile.js'));
const Emit = require(path.join(__dirname, '..', 'site', 'js', 'vm-emit.js'));

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const opt = name => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.split('=')[1] : null;
};
const seed = Number(opt('seed') || 1);
const junk = Number(opt('junk') === null ? 1 : opt('junk'));

function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const src = fs.readFileSync(file, 'utf8');
const t0 = Date.now();
let parsed;
try { parsed = Parser.parse(src); } catch (e) { console.log('parse error: ' + e.message); process.exit(1); }
const program = Compile.compile(parsed.ast, parsed.refs);
const built = Emit.emit(program, { rng: rng(seed), junk: junk, minify: true });
const ms = Date.now() - t0;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmtry-'));
const obf = path.join(dir, 'obf.luau');
const orig = path.join(dir, 'orig.luau');
fs.writeFileSync(obf, built.source);
fs.writeFileSync(orig, src);

// the emitted program must be syntactically valid
let syntaxOk = true, syntaxErr = '';
try { Parser.parse(built.source); } catch (e) { syntaxOk = false; syntaxErr = e.message + ' @' + e.line; }

function run(f) {
  try { return { code: 0, out: execFileSync(LUAU, [f], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) {
    const err = String(e.stderr || '').split('\n')[0];
    return { code: e.status, out: String(e.stdout || '') + '\nERR ' + err };
  }
}
const norm = s => String(s).replace(/^.*\.(luau|lua):(\d+):/gm, 'FILE:$2:').replace(/:\d+:/g, ':L:').replace(/line \d+/g, 'line L');

if (args.includes('--trace')) {
  const OPS = Emit.OPS;
  const names = {};
  built.ids.forEach((id, i) => { names[id] = OPS[i]; });
  const tr = obf.replace('.trace.luau', '') + '.trace.luau';
  // buffered trace: the whole log is flushed by the error handler, so nothing
  // is lost when stdout is still sitting in a buffer at crash time
  let trsrc = built.source.replace(/local I=(\w+)\[F\.ip\]/,
    'local I=$1[F.ip] do local TR=_DFTR TR[#TR+1]=tostring(F.ip).."\\t"..tostring(I[1]).."\\t"..tostring(I[2]).."\\t"..tostring(I[3]).."\\t"..tostring(I[4]) end');
  trsrc = trsrc.replace(']=setmetatable({},{})', ']=setmetatable({},{}) _DFTR={}');
  trsrc = trsrc.replace('return f()',
    'local res=table.pack(pcall(f)) if not res[1] then print(table.concat(_DFTR or {}, "\\n")) error(res[2],0) end return unpack(res,2,res.n)');
  fs.writeFileSync(tr, trsrc);
  let out = '';
  try { out = execFileSync(LUAU, [tr], { encoding: 'utf8', timeout: 10, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { out = String(e.stdout || '') + '\nERR ' + String(e.stderr || '').split('\n')[0]; }
  const limit = Number(opt('steps') || 60);
  let n = 0;
  for (const line of out.split('\n')) {
    const m = /^(\d+)\t(\d+)\t(-?\d+)\t(-?\d+)\t(-?\d+)$/.exec(line);
    if (m) {
      if (n++ >= limit) { console.log('  ... (trace limit)'); break; }
      console.log('  ' + m[1].padStart(4) + ' ' + (names[m[2]] || ('?' + m[2])).padEnd(9) +
        ' ' + (m[3] + ' ' + m[4] + ' ' + m[5]).padEnd(24));
    } else if (line.startsWith('ERR') || line.includes(': ')) console.log('  ' + line.slice(0, 140));
  }
  process.exit(0);
}

const a = run(orig), b = run(obf);
console.log(`file        ${file}`);
console.log(`compile     ${ms}ms  bytecode ${(built.stats.bytes / 1024).toFixed(1)} KB -> payload ${(built.stats.payload / 1024).toFixed(1)} KB, ${built.stats.opcodes} opcodes`);
console.log(`output      ${built.source.length} chars (source ${src.length})`);
console.log(`syntax      ${syntaxOk ? 'valid' : 'INVALID: ' + syntaxErr}`);
console.log(`exit        orig=${a.code} obf=${b.code}`);
if (norm(a.out) === norm(b.out)) console.log('behaviour   IDENTICAL');
else {
  console.log('behaviour   DIFFERS');
  const la = norm(a.out).split('\n'), lb = norm(b.out).split('\n');
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      console.log(`  line ${i + 1}\n    orig: ${JSON.stringify(la[i])}\n    obf : ${JSON.stringify(lb[i])}`);
      break;
    }
  }
  console.log('--- orig ---\n' + a.out.slice(0, 600));
  console.log('--- obf ---\n' + b.out.slice(0, 600));
}
if (args.includes('--keep')) {
  console.log('kept: ' + obf);
} else if (!args.includes('--keep')) {
  console.log('obf: ' + obf + ' (use --keep)');
}
process.exit(norm(a.out) === norm(b.out) && a.code === b.code && syntaxOk ? 0 : 1);
