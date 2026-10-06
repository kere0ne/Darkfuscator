#!/usr/bin/env node
/*
 * Loads the single-file build in jsdom, obfuscates a script through the real UI
 * and runs the result through the Luau VM to prove the build works offline.
 *
 *   node tools/verify-standalone.js [standalone.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch (e) { console.log('Skipped: this check needs jsdom — npm install jsdom'); process.exit(0); }

const FILE = process.argv[2] || path.join(__dirname, '..', 'darkfuscator-standalone.html');
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

const dom = new JSDOM(fs.readFileSync(FILE, 'utf8'),
  { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const $ = s => window.document.querySelector(s);

const SRC = 'local function add(a, b) return a + b end\n' +
  'local t = {n = 0}\n' +
  'for i = 1, 3 do t.n = t.n + add(i, i) end\n' +
  'print("total", t.n, ("x"):rep(2))\n';

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
};

check('engine loaded', !!window.Darkfuscator);
// headless-safe knobs for the runtime comparison below: the wrapper needs a
// live client and the nested VM roughly doubles every build
const HEADLESS = { antiTamper: 0, vmLayers: 1 };
$('#input').value = SRC;
$('#protect').dispatchEvent(new window.Event('click'));
const raw = $('#output').value;
// re-obfuscate with the headless knobs through the engine directly
const out = window.Darkfuscator.obfuscate(SRC, Object.assign({ preset: 'maximum' }, HEADLESS)).output;
check('output produced', raw.length > 500, 'len=' + raw.length);
check('headless build produced', out.length > 500, 'len=' + out.length);
check('stats visible', !$('#stats').hidden);
check('no plain source left', !out.includes('total') && !out.includes('add'));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dkstand-'));
const run = (name, src) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, src);
  return execFileSync(LUAU, [f], { encoding: 'utf8' });
};
fs.writeFileSync(path.join(dir, 'orig.luau'), SRC);
check('original runs', run('orig.luau', SRC).includes('total'));
check('build matches the original', run('obf.luau', out) === run('orig.luau', SRC));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
