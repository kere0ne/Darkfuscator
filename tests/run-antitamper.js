#!/usr/bin/env node
/* Battery self-obfuscation + junk 4 + VM stack of 10. */
'use strict';
const assert = require('assert');
const D = require('../site/js/obfuscate.js');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { failed++; console.log('FAIL  ' + name + ' :: ' + e.message); }
}

const src = 'local x = 1\nprint("hello " .. x)\n';

test('anti-tamper 2 builds and re-parses', function () {
  const r = D.obfuscate(src, { antiTamper: 2, junk: 0, guard: 0, envChecks: 0, vmLayers: 1, seed: 99 });
  assert.ok(r.ok, 'build failed: ' + (r.error && r.error.message));
  assert.ok(r.output.split('\n')[0].startsWith('-- This file is protected by Darkfuscator'), 'banner missing');
  const v = D.validate(r.output);
  assert.ok(v.ok, 'output does not re-parse: ' + v.message);
});

test('battery ships with no readable check code', function () {
  const r = D.obfuscate(src, { antiTamper: 2, junk: 0, guard: 0, envChecks: 0, vmLayers: 1, seed: 99 });
  const leaks = ['dump_tools', 'DARK AntiTamper', 'executor_globals', 'globals_fingerprint',
    'hookmetamethod', 'PlayerModule', 'game_instance', 'identity_consistency', 'readonly_props']
    .filter((s) => r.output.includes(s));
  assert.strictEqual(leaks.length, 0, 'readable strings in output: ' + leaks.join(', '));
  assert.ok(r.output.includes('bchunks'), 'battery payload not embedded');
});

test('battery is a real Darkfuscator build (renamed + encrypted)', function () {
  const r = D.obfuscate(src, { antiTamper: 2, junk: 0, guard: 0, envChecks: 0, vmLayers: 1, seed: 99 });
  // the battery source, once encrypted into the byte table, must not contain
  // any run of readable Lua text longer than a few chars
  const stripped = r.output.split('\n').filter((l) => !l.startsWith('-- This file is protected')).join('\n');
  const m = stripped.match(/[A-Za-z_][A-Za-z0-9_ ]{20,}/g) || [];
  const suspicious = m.filter((s) => /check|tamper|detector|player|service/i.test(s));
  assert.strictEqual(suspicious.length, 0, 'readable battery text: ' + suspicious.slice(0, 3).join(' | '));
});

test('junk 4 generates heavy junk and parses', function () {
  const r = D.obfuscate(src, { junk: 4, guard: 0, envChecks: 0, antiTamper: 0, vmLayers: 1, seed: 7 });
  assert.ok(r.ok, 'junk 4 build failed');
  assert.ok(r.stats.junkStatements > 100000, 'junk 4 too light: ' + r.stats.junkStatements);
  assert.ok(r.output.length > 1500000, 'junk 4 output too small: ' + r.output.length);
  const v = D.validate(r.output);
  assert.ok(v.ok, 'junk 4 output does not re-parse');
});

test('vmLayers 10 accepted and stacks as high as the payload allows', function () {
  const r = D.obfuscate('print("vm10")', { junk: 0, guard: 0, envChecks: 0, antiTamper: 0, vmLayers: 10, seed: 3 });
  assert.ok(r.ok, 'vm 10 build failed: ' + (r.error && r.error.message));
  assert.ok(r.stats.vms >= 5, 'expected a deep stack, got ' + r.stats.vms);
  assert.ok(r.stats.vms <= 10, 'vms over the cap');
  const v = D.validate(r.output);
  assert.ok(v.ok, 'vm10 output does not re-parse');
});

test('vmLayers 11 clamps to 10', function () {
  const r = D.obfuscate('print("clamp")', { junk: 0, guard: 0, envChecks: 0, antiTamper: 0, vmLayers: 11, seed: 3 });
  assert.ok(r.ok);
  assert.ok(r.stats.vms <= 10);
});

test('preset maximum targets 10 VMs and degrades honestly', function () {
  const r = D.obfuscate('print("preset")', { preset: 'maximum', junk: 0, guard: 0, envChecks: 0, antiTamper: 0, seed: 5 });
  assert.ok(r.ok);
  assert.ok(r.stats.vms >= 3 && r.stats.vms <= 10, 'unexpected stack depth ' + r.stats.vms);
  // a capped stack says so in its warnings
  if (r.stats.vms < 10) {
    assert.ok(r.warnings.some((w) => w.includes('capped')), 'cap warning missing');
  }
});

test('lean build reaches the full 10-VM stack', function () {
  const r = D.obfuscate('print("ten")', { junk: 0, guard: 0, envChecks: 0, antiTamper: 0, vmLayers: 10, seed: 3 });
  assert.ok(r.ok);
  assert.strictEqual(r.stats.vms, 10, 'lean stack reached ' + r.stats.vms);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
