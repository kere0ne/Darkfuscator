#!/usr/bin/env node
// Debug helper: node tests/debug-one.js <corpus-file> <preset> [seed]
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const DARK = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
const LUAU = process.env.LUAU_BIN || path.join(__dirname, '..', '..', 'tools', 'luau');

const file = process.argv[2];
const preset = process.argv[3] || 'light';
const seed = Number(process.argv[4] || 1);
const src = fs.readFileSync(path.join(__dirname, 'corpus', file.endsWith('.luau') ? file : file + '.luau'), 'utf8');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbg-'));
fs.writeFileSync(path.join(tmp, 'orig.luau'), src);
const res = DARK.obfuscate(src, { preset, seed });
if (!res.ok) { console.log('OBFUSCATE FAILED:', JSON.stringify(res.error)); process.exit(1); }
fs.writeFileSync(path.join(tmp, 'obf.luau'), res.output);

function run(f) {
  try { return { code: 0, out: execFileSync(LUAU, [f], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || ''), err: String(e.stderr || '') }; }
}
const a = run(path.join(tmp, 'orig.luau'));
const b = run(path.join(tmp, 'obf.luau'));
console.log(`orig exit=${a.code}  obf exit=${b.code}`);
const la = a.out.split('\n'), lb = b.out.split('\n');
let shown = 0;
for (let i = 0; i < Math.max(la.length, lb.length); i++) {
  if (la[i] !== lb[i]) {
    console.log(`line ${i + 1}:\n  orig: ${JSON.stringify(la[i])}\n  obf : ${JSON.stringify(lb[i])}`);
    if (++shown > 4) break;
  }
}
if (!shown) console.log('stdout identical');
if (b.err) console.log('obf stderr:', b.err.split('\n').slice(0, 3).join('\n'));
console.log('\n--- obfuscated source (' + res.output.length + ' chars) ---');
console.log(res.output);
if (process.env.OPEN) console.log('files:', tmp);
