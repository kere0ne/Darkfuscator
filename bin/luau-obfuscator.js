#!/usr/bin/env node
/*
 * luau-obfuscator — Darkfuscator CLI.
 *
 *   luau-obfuscator input.luau output.luau --preset maximum
 *
 * Presets:
 *   lightweight  quick pass: decoys + renaming, no wrapper
 *   balanced     full battery, fast chunked loader, single VM
 *   maximum      everything on: heavy junk (~900 KB), full wrapper,
 *                nested second VM when the payload is small enough
 *
 * Options can also come from a JSON config file (--config cfg.json, keys are
 * the engine option names: junk, guard, envChecks, antiTamper, vmLayers,
 * nameStyle, minify, watermark, lockPlace, lockUniverse, envLock, seed).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const DARK = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));

const VERSION = '6.0.0';

function usage() {
  console.log('Darkfuscator ' + VERSION + ' — Luau obfuscator with a custom bytecode VM');
  console.log('');
  console.log('Usage:');
  console.log('  luau-obfuscator input.luau output.luau --preset maximum');
  console.log('');
  console.log('Presets: lightweight | balanced | maximum (default maximum)');
  console.log('Flags:');
  console.log('  --seed <n>            deterministic build seed');
  console.log('  --junk <0|1|2|3>      3 = heavy junk (~100k statements, ~900 KB cap)');
  console.log('  --guard <0|1|2>       anti-environment audit strength');
  console.log('  --env-checks <0|1|2>  anti-env probes + environment-derived seal');
  console.log('  --anti-tamper <0|1|2> chunked encrypted loader: off | fast | full');
  console.log('  --vm-layers <1-10>    stacked VMs (the stack auto-caps on huge payloads)');
  console.log('  --name-style <s>      short | random | confuse');
  console.log('  --no-minify           keep one slot per line');
  console.log('  --no-watermark        drop the leading comment');
  console.log('  --lock-place <id>     decode only inside this Roblox place');
  console.log('  --lock-universe <id>  decode only inside this Roblox universe');
  console.log('  --env-lock            refuse to decode outside a genuine client');
  console.log('  --config <file>       JSON config file with engine options');
  console.log('  --quiet               stats only');
  console.log('');
  console.log('Anything written to stdout is Luau source; --help prints this text.');
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) { usage(); process.exit(0); }

const pos = args.filter(a => !a.startsWith('--'));
const flag = name => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : undefined; };
const has = name => args.includes('--' + name);

if (pos.length < 1) { usage(); process.exit(1); }
const input = pos[0];
const output = pos[1] || input.replace(/\.(lua|luau|txt)$/i, '') + '.protected.luau';

const opts = { preset: has('preset') ? flag('preset') : 'maximum' };
for (const k of ['seed', 'junk', 'guard', 'envChecks', 'antiTamper', 'vmLayers']) {
  const v = flag(k.toLowerCase().replace('envChecks', 'env-checks').replace('antiTamper', 'anti-tamper').replace('vmLayers', 'vm-layers'));
  if (v !== undefined) opts[k] = k === 'seed' ? Number(v) : parseInt(v, 10);
}
for (const k of ['nameStyle', 'lockPlace', 'lockUniverse']) {
  const map = { nameStyle: 'name-style', lockPlace: 'lock-place', lockUniverse: 'lock-universe' };
  const v = flag(map[k]);
  if (v !== undefined) opts[k] = v;
}
if (has('no-minify')) opts.minify = false;
if (has('no-watermark')) opts.watermark = false;
if (has('env-lock')) opts.envLock = true;
const cfgPath = flag('config');
if (cfgPath) {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  for (const k in cfg) if (k !== 'preset') opts[k] = cfg[k];
  if (cfg.preset) opts.preset = cfg.preset;
}

let src;
try { src = fs.readFileSync(input, 'utf8'); }
catch (e) { console.error('cannot read ' + input); process.exit(1); }

const res = DARK.obfuscate(src, opts);
if (!res.ok) {
  console.error('FAILED: ' + (res.error && res.error.message || 'unknown error') +
    (res.error && res.error.line ? ' (line ' + res.error.line + ', col ' + res.error.col + ')' : ''));
  process.exit(1);
}
fs.writeFileSync(output, res.output);
const s = res.stats;
console.error('protected ' + input + ' -> ' + output +
  ' (' + (s.inputChars / 1024).toFixed(1) + ' KB -> ' + (s.outputChars / 1024).toFixed(1) + ' KB, ' +
  s.ms + ' ms, engine ' + s.engine + (s.junkStatements ? ', junk statements ' + s.junkStatements : '') + ', seed ' + s.seed + ')');
if (!has('quiet') && s.outputChars < 400000) console.log(res.output);
