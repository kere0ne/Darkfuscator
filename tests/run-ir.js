#!/usr/bin/env node
/*
 * Source-level IR differential tests.
 *
 * The IR stage re-emits parsed Luau before the custom-bytecode compiler runs.
 * Exercise every supported IR intensity through a real generated VM and compare
 * its observable CLI result with the original source. This prevents a valid but
 * empty IR program from being mistaken for a successful build.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const DARK = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
const Parser = require(path.join(__dirname, '..', 'site', 'js', 'luau-parser.js'));

function findLuau() {
  if (process.env.LUAU_BIN) return process.env.LUAU_BIN;
  const candidates = [
    path.join(__dirname, '..', 'tools', 'luau'),
    path.join(__dirname, '..', '..', 'tools', 'luau'),
    'luau'
  ];
  for (const candidate of candidates) {
    if (candidate === 'luau' || fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

const LUAU = findLuau();
const CORPUS = path.join(__dirname, 'corpus');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'darkf-ir-'));
let passed = 0;
let failed = 0;
const failures = [];

function runLuau(file) {
  try {
    return {
      code: 0,
      out: execFileSync(LUAU, [file], { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }),
      err: ''
    };
  } catch (error) {
    if (error.status === undefined) throw error;
    return {
      code: error.status,
      out: error.stdout === undefined ? '' : String(error.stdout),
      err: error.stderr === undefined ? '' : String(error.stderr)
    };
  }
}

function normalize(text) {
  return String(text)
    .replace(/^.*\.(luau|lua):(\d+):/gm, 'FILE:$2:')
    .replace(/:\d+:/g, ':L:')
    .replace(/\r/g, '');
}

function log(ok, label, detail) {
  if (ok) {
    passed++;
    console.log('  \x1b[32mPASS\x1b[0m ' + label);
  } else {
    failed++;
    failures.push(label + (detail ? ' :: ' + detail : ''));
    console.log('  \x1b[31mFAIL\x1b[0m ' + label + (detail ? ' :: ' + detail : ''));
  }
}

try {
  if (!fs.existsSync(LUAU)) {
    console.log('SKIP: luau binary not found at ' + LUAU + ' (set LUAU_BIN)');
    process.exitCode = 0;
  } else {
    console.log('\n\x1b[1mSource-level IR differential tests (real Luau VM)\x1b[0m');
    const levels = ['fast', 'balanced', 'secure'];
    const seeds = [17, 991];
    const files = fs.readdirSync(CORPUS).filter((name) => name.endsWith('.luau')).sort();

    for (const name of files) {
      const source = fs.readFileSync(path.join(CORPUS, name), 'utf8');
      const originalFile = path.join(TMP, 'original-' + name);
      fs.writeFileSync(originalFile, source);
      const original = runLuau(originalFile);

      for (const ir of levels) {
        for (const seed of seeds) {
          const label = name + ' / ' + ir + ' / seed ' + seed;
          const result = DARK.obfuscate(source, {
            seed: seed,
            ir: ir,
            // Keep this suite focused on the source IR; the main differential
            // suite separately exercises integrity, junk, and stacked VMs.
            vmLayers: 1,
            junk: 0,
            guard: 0,
            antiTamper: 0,
            minify: true,
            watermark: false
          });
          if (!result.ok) {
            log(false, label, 'build failed: ' + JSON.stringify(result.error));
            continue;
          }
          try {
            Parser.parse(result.output);
          } catch (error) {
            log(false, label, 'generated output did not parse: ' + error.message);
            continue;
          }
          const protectedFile = path.join(TMP, name + '-' + ir + '-' + seed + '.luau');
          fs.writeFileSync(protectedFile, result.output);
          const protectedRun = runLuau(protectedFile);
          const equal = original.code === protectedRun.code &&
            normalize(original.out) === normalize(protectedRun.out);
          log(equal, label, equal ? '' : 'exit ' + original.code + ' vs ' + protectedRun.code);
        }
      }
    }
  }
} finally {
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) {
  console.log(failures.join('\n'));
  process.exitCode = 1;
}
