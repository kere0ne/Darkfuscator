#!/usr/bin/env node
/*
 * Darkfuscator CLI.
 *
 *   luau-obfuscator <input.luau> [output.luau] [--preset lightweight|balanced|maximum]
 *                  [--config <file>] [--seed <n>] [--stdout] [--json] [--quiet]
 *
 * Option precedence (last wins): engine defaults < preset < config file < flags.
 * Without --config, ./darkfuscator.config.json is used when it exists.
 * Without an output path, the build lands next to the input as <input>.protected.luau.
 * On failure: message (with line/col for syntax errors) on stderr, exit code 1.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DK = require(path.join(ROOT, 'site', 'js', 'obfuscate.js'));
const Presets = require(path.join(ROOT, 'site', 'js', 'presets.js'));

const VERSION = require(path.join(ROOT, 'package.json')).version;

const HELP = [
  'Darkfuscator ' + VERSION + ' — Luau obfuscator with a custom bytecode VM',
  '',
  'Usage:',
  '  luau-obfuscator <input.luau> [output.luau] [options]',
  '  (use "-" as input to read stdin, --stdout to write the build to stdout)',
  '',
  'Presets:',
  '  lightweight   small and fast: minimal junk, fast anti-tamper',
  '  balanced      default: full VM pipeline, balanced protection',
  '  maximum       everything on: ~100k junk statements, strong audits, full anti-tamper',
  '',
  'Options:',
  '  --preset <name>        lightweight | balanced | maximum (default: balanced)',
  '  --config <file>        JSON config file (default: ./darkfuscator.config.json)',
  '  --seed <n>             fixed build seed (reproducible builds)',
  '  --junk <0|1|2|3>       decoy dispatch branches / monstrous junk profile',
  '  --guard <0|1|2>        anti-environment audit strength',
  '  --env-checks <0|1|2>   anti-env probes + environment-derived seal',
  '  --anti-tamper <0|1|2>  chunked loader wrapper: off | fast | full',
  '  --name-style <s>       short | random | confuse',
  '  --lock-place <id>      bind the build to a Roblox place id',
  '  --lock-universe <id>   bind the build to a Roblox universe id',
  '  --env-lock             refuse to run outside a genuine Roblox client',
  '  --no-minify            one slot per line output',
  '  --no-watermark         drop the leading protection comment',
  '  --no-compress          skip the LZSS payload compression pass',
  '  --no-capture-globals   do not grab the caller environment with getfenv()',
  '  --stdout               write the build to stdout (stats go to stderr)',
  '  --json                 stats as JSON on stderr',
  '  --quiet                no stats output',
  '  -h, --help             this help',
  '  -v, --version          version'
].join('\n');

function fail(msg) {
  process.stderr.write('luau-obfuscator: ' + msg + '\n');
  process.exit(1);
}

function toCamel(k) {
  return String(k).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
}

// CLI flag -> engine option, with value parsing
const FLAG_OPTS = {
  'junk': Number, 'guard': Number, 'envChecks': Number, 'antiTamper': Number,
  'nameStyle': String, 'lockPlace': String, 'lockUniverse': String
};
const BOOL_OFF = { 'no-minify': 'minify', 'no-watermark': 'watermark', 'no-compress': 'compress', 'no-capture-globals': 'captureGlobals' };

function parseArgs(argv) {
  var out = { flags: {}, positional: [] };
  for (var i = 0; i < argv.length; i++) {
    var a = argv[i];
    if (a === '--help' || a === '-h') { process.stdout.write(HELP + '\n'); process.exit(0); }
    if (a === '--version' || a === '-v') { process.stdout.write(VERSION + '\n'); process.exit(0); }
    if (a === '--stdout') { out.flags.stdout = true; continue; }
    if (a === '--json') { out.flags.json = true; continue; }
    if (a === '--quiet') { out.flags.quiet = true; continue; }
    if (a === '--env-lock') { out.flags.envLock = true; continue; }
    if (BOOL_OFF[a]) { out.flags[BOOL_OFF[a]] = false; continue; }
    if (a === '--preset') { out.flags.preset = argv[++i]; continue; }
    if (a === '--config') { out.flags.config = argv[++i]; continue; }
    if (a === '--seed') { out.flags.seed = Number(argv[++i]); continue; }
    if (a.slice(0, 2) === '--') {
      var name = toCamel(a.slice(2));
      if (FLAG_OPTS[name]) { out.flags[name] = FLAG_OPTS[name](argv[++i]); continue; }
      fail('unknown option ' + a + ' (see --help)');
    }
    out.positional.push(a);
  }
  return out;
}

function loadConfig(file) {
  var raw;
  try { raw = fs.readFileSync(file, 'utf8'); }
  catch (e) { fail('cannot read config file ' + file); }
  var cfg;
  try { cfg = JSON.parse(raw); }
  catch (e) { fail('config file ' + file + ' is not valid JSON: ' + e.message); }
  var clean = {}, KEY_RE = /^(junk|guard|envChecks|antiTamper|nameStyle|minify|compress|watermark|captureGlobals|envLock|lockPlace|lockUniverse|seed)$/;
  for (var k in cfg) {
    var ck = toCamel(k);
    if (!KEY_RE.test(ck)) { process.stderr.write('luau-obfuscator: ignoring unknown config key "' + k + '"\n'); continue; }
    clean[ck] = cfg[k];
  }
  return clean;
}

function main() {
  var parsed = parseArgs(process.argv.slice(2));
  var flags = parsed.flags;
  var input = parsed.positional[0];
  var output = parsed.positional[1];
  if (!input) { process.stdout.write(HELP + '\n'); process.exit(input === undefined ? 1 : 0); }

  // 1. preset
  var presetName = flags.preset || 'balanced';
  if (presetName === 'light') presetName = 'lightweight';
  if (presetName === 'max') presetName = 'maximum';
  var preset = Presets.PRESETS[presetName];
  if (!preset) fail('unknown preset "' + flags.preset + '" (lightweight | balanced | maximum)');

  // 2. config file
  var cfgFile = flags.config || (fs.existsSync('darkfuscator.config.json') ? 'darkfuscator.config.json' : null);
  var cfg = cfgFile ? loadConfig(cfgFile) : {};

  // 3. flags (strip non-engine keys)
  var optKeys = ['junk', 'guard', 'envChecks', 'antiTamper', 'nameStyle', 'minify', 'compress',
    'watermark', 'captureGlobals', 'envLock', 'lockPlace', 'lockUniverse', 'seed'];
  var flagOpts = {};
  for (var i = 0; i < optKeys.length; i++) if (flags[optKeys[i]] !== undefined) flagOpts[optKeys[i]] = flags[optKeys[i]];

  var opts = {};
  var k;
  for (k in preset) opts[k] = preset[k];
  for (k in cfg) opts[k] = cfg[k];
  for (k in flagOpts) opts[k] = flagOpts[k];

  // read source
  var src;
  if (input === '-') src = fs.readFileSync(0, 'utf8');
  else src = fs.readFileSync(input, 'utf8');

  var t0 = Date.now();
  var res = DK.obfuscate(src, opts);
  if (!res.ok) {
    var e = res.error;
    var where = (e && e.line) ? ' (line ' + e.line + ', col ' + e.col + ')' : '';
    fail((e && e.name ? e.name : 'Error') + where + ': ' + (e && e.message));
  }

  var outBytes = Buffer.byteLength(res.output, 'utf8');
  var inBytes = Buffer.byteLength(src, 'utf8');

  if (flags.stdout) {
    process.stdout.write(res.output);
  } else {
    var outPath = output || (input.replace(/\.luau$/, '') + '.protected.luau');
    fs.writeFileSync(outPath, res.output);
    if (!flags.quiet) {
      var line = 'protected ' + input + ' -> ' + outPath +
        ' (' + (inBytes / 1024).toFixed(1) + ' KB -> ' + (outBytes / 1024).toFixed(1) + ' KB' +
        (res.stats.lz ? ', LZSS ' + (100 * res.stats.bytecodeBytes / res.stats.bytecodeOrigBytes).toFixed(0) + '%' : '') +
        ', ' + (Date.now() - t0) + ' ms, seed ' + res.stats.seed + ')';
      if (flags.json) {
        process.stderr.write(JSON.stringify({
          input: input, output: flags.stdout ? '-' : outPath,
          inputBytes: inBytes, outputBytes: outBytes,
          bytecodeBytes: res.stats.bytecodeBytes,
          bytecodeOrigBytes: res.stats.bytecodeOrigBytes,
          lz: !!res.stats.lz, seed: res.stats.seed, ms: Date.now() - t0,
          options: res.options, warnings: res.warnings
        }) + '\n');
      } else {
        process.stderr.write(line + '\n');
      }
    }
  }
}

main();
