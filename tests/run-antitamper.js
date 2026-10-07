#!/usr/bin/env node
/* Integrity verification, heavy variation, and stacked-VM regression checks. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const D = require('../site/js/obfuscate.js');
const LUAU = path.join(__dirname, '..', 'tools', 'luau');

function runLuau(source) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darkfuscator-regression-'));
  const file = path.join(dir, 'program.luau');
  try {
    fs.writeFileSync(file, source);
    return execFileSync(LUAU, [file], { encoding: 'utf8' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (error) { failed++; console.log('FAIL  ' + name + ' :: ' + error.message); }
}

const source = 'local x = 1\nprint("hello " .. x)\n';
const fullIntegrity = { antiTamper: 2, junk: 0, guard: 0, vmLayers: 1, seed: 99 };

test('full integrity build re-parses', function () {
  const result = D.obfuscate(source, fullIntegrity);
  assert.ok(result.ok, 'build failed: ' + (result.error && result.error.message));
  assert.ok(result.output.split('\n')[0].startsWith('-- Protected by Darkfuscator'), 'banner missing');
  assert.ok(D.validate(result.output).ok, 'output does not re-parse');
  assert.strictEqual(result.stats.integrity, 2, 'full integrity was not emitted');
});

test('serialized output does not retain ordinary source text', function () {
  const result = D.obfuscate(source, fullIntegrity);
  assert.ok(result.ok);
  assert.ok(!result.output.includes('hello '), 'input string is visible in protected output');
  assert.ok(!result.output.includes('local x = 1'), 'input source remains visible in protected output');
});

test('a supplied seed produces a repeatable build structure', function () {
  const first = D.obfuscate(source, fullIntegrity);
  const second = D.obfuscate(source, fullIntegrity);
  assert.ok(first.ok && second.ok);
  assert.strictEqual(first.output, second.output, 'equal seed/options produced different output');
  assert.strictEqual(first.stats.seed, 99);
});

test('strict runtime guard works when payload integrity is disabled', function () {
  const source = fs.readFileSync(path.join(__dirname, 'corpus', '07-numbers.luau'), 'utf8');
  const result = D.obfuscate(source, {
    nameStyle: 'short', minify: true, junk: 0, watermark: true,
    seed: 1401182602, guard: 2, antiTamper: 0, vmLayers: 1
  });
  assert.ok(result.ok);
  assert.strictEqual(runLuau(result.output), runLuau(source));
});

test('generated helper names do not shadow VM runtime parameters', function () {
  const source = fs.readFileSync(path.join(__dirname, 'corpus', '10-callstyles.luau'), 'utf8');
  const result = D.obfuscate(source, {
    nameStyle: 'short', minify: false, junk: 0, watermark: false,
    seed: 3668341734, guard: 2, antiTamper: 0, vmLayers: 1
  });
  assert.ok(result.ok);
  assert.strictEqual(runLuau(result.output), runLuau(source));
});

test('junk level 4 generates heavy dead code and parses', function () {
  const result = D.obfuscate(source, { junk: 4, guard: 0, antiTamper: 0, vmLayers: 1, seed: 7 });
  assert.ok(result.ok, 'junk 4 build failed');
  assert.ok(result.stats.junkStatements > 100000, 'junk 4 too light: ' + result.stats.junkStatements);
  assert.ok(result.output.length > 1500000, 'junk 4 output too small: ' + result.output.length);
  assert.ok(D.validate(result.output).ok, 'junk 4 output does not re-parse');
});

test('ten VM layers are accepted and stack as far as the payload allows', function () {
  const result = D.obfuscate('print("vm10")', { junk: 0, guard: 0, antiTamper: 0, vmLayers: 10, seed: 3 });
  assert.ok(result.ok, 'VM stack build failed: ' + (result.error && result.error.message));
  assert.ok(result.stats.vms >= 5, 'expected a deep stack, got ' + result.stats.vms);
  assert.ok(result.stats.vms <= 10, 'stack exceeded the cap');
  assert.ok(D.validate(result.output).ok, 'stacked output does not re-parse');
});

test('an excessive VM layer request clamps to ten', function () {
  const result = D.obfuscate('print("clamp")', { junk: 0, guard: 0, antiTamper: 0, vmLayers: 11, seed: 3 });
  assert.ok(result.ok);
  assert.ok(result.stats.vms <= 10);
});

test('maximum preset uses a real, bounded VM stack', function () {
  const result = D.obfuscate('print("preset")', { preset: 'maximum', junk: 0, guard: 0, antiTamper: 0, seed: 5 });
  assert.ok(result.ok);
  assert.ok(result.stats.vms >= 1 && result.stats.vms <= 4, 'unexpected stack depth ' + result.stats.vms);
});

test('a lean build can reach all ten VM layers', function () {
  const result = D.obfuscate('print("ten")', { junk: 0, guard: 0, antiTamper: 0, vmLayers: 10, seed: 3 });
  assert.ok(result.ok);
  assert.strictEqual(result.stats.vms, 10, 'lean stack reached ' + result.stats.vms);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
