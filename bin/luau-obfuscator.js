#!/usr/bin/env node
/*
 * luau-obfuscator — Darkfuscator CLI.
 *
 *   luau-obfuscator input.luau output.luau --preset maximum
 *
 * The CLI invokes the same parser → custom-bytecode compiler → VM emitter used
 * by the service. It never falls back to renaming or copying source.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const DARK = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));

const VERSION = '7.0.0';
const PRESETS = new Set(['lightweight', 'balanced', 'maximum']);
const OPTION_KEYS = new Set([
  'preset', 'seed', 'junk', 'guard', 'antiTamper', 'vmLayers', 'vmMode',
  'nameStyle', 'minify', 'watermark', 'captureGlobals', 'compression',
  'lockPlace', 'lockUniverse'
]);

function usage() {
  console.log('Darkfuscator ' + VERSION + ' — Luau protection with a custom bytecode VM');
  console.log('');
  console.log('Usage:');
  console.log('  luau-obfuscator input.luau [output.luau] --preset maximum');
  console.log('');
  console.log('Presets: lightweight | balanced | maximum (default maximum)');
  console.log('Flags:');
  console.log('  --seed <value>         deterministic build seed (text or number)');
  console.log('  --junk <0-4>           control-flow variation; 3/4 substantially increase output size');
  console.log('  --guard <0-2>          VM prerequisite guard: off | standard | strict');
  console.log('  --integrity <0-2>      payload verification: off | fast | full');
  console.log('  --vm-layers <1-10>     independently randomized stacked VMs');
  console.log('  --vm-mode <mode>       fast | balanced | secure');
  console.log('  --name-style <style>   short | random | confuse');
  console.log('  --compression           use the optional payload size pass');
  console.log('  --no-compression        disable the optional payload size pass');
  console.log('  --no-minify             keep generated slots on separate lines');
  console.log('  --no-watermark          omit the protection notice');
  console.log('  --no-capture-globals    use _ENV or _G rather than getfenv when available');
  console.log('  --lock-place <id>       bind a Roblox build to a numeric place ID');
  console.log('  --lock-universe <id>    bind a Roblox build to a numeric universe ID');
  console.log('  --config <file>         JSON file containing supported engine options');
  console.log('  --quiet                 do not print generated Luau to stdout');
  console.log('');
  console.log('Protection raises reverse-engineering cost; test output in the target Luau runtime.');
}

function fail(message) {
  console.error('error: ' + message);
  process.exit(1);
}
function needValue(args, index, flag) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) fail(flag + ' requires a value');
  return value;
}
function integer(value, label, min, max) {
  if (!/^-?\d+$/.test(String(value))) fail(label + ' must be an integer');
  const parsed = Number(value);
  if (parsed < min || parsed > max) fail(label + ' must be from ' + min + ' to ' + max);
  return parsed;
}
function boolean(value, label) {
  if (typeof value !== 'boolean') fail(label + ' must be true or false');
  return value;
}
function numericId(value, label) {
  if (value === '' || !/^\d+$/.test(String(value))) fail(label + ' must be a numeric Roblox ID');
  return String(value);
}

function parseArgs(args) {
  const positional = [];
  const explicit = {};
  let configPath = '';
  let quiet = false;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (token === '--help' || token === '-h') { usage(); process.exit(0); }
    if (!token.startsWith('--')) { positional.push(token); continue; }
    if (token === '--quiet') { quiet = true; continue; }
    if (token === '--no-minify') { explicit.minify = false; continue; }
    if (token === '--no-watermark') { explicit.watermark = false; continue; }
    if (token === '--no-capture-globals') { explicit.captureGlobals = false; continue; }
    if (token === '--compression') { explicit.compression = true; continue; }
    if (token === '--no-compression') { explicit.compression = false; continue; }
    const value = needValue(args, i, token);
    i++;
    if (token === '--config') { configPath = value; continue; }
    if (token === '--preset') { explicit.preset = value; continue; }
    if (token === '--seed') { explicit.seed = value; continue; }
    if (token === '--junk') { explicit.junk = integer(value, '--junk', 0, 4); continue; }
    if (token === '--guard') { explicit.guard = integer(value, '--guard', 0, 2); continue; }
    if (token === '--integrity') { explicit.antiTamper = integer(value, '--integrity', 0, 2); continue; }
    if (token === '--vm-layers') { explicit.vmLayers = integer(value, '--vm-layers', 1, 10); continue; }
    if (token === '--vm-mode') { explicit.vmMode = value; continue; }
    if (token === '--name-style') { explicit.nameStyle = value; continue; }
    if (token === '--lock-place') { explicit.lockPlace = numericId(value, '--lock-place'); continue; }
    if (token === '--lock-universe') { explicit.lockUniverse = numericId(value, '--lock-universe'); continue; }
    fail('unknown flag ' + token + '; use --help for supported flags');
  }
  return { positional, explicit, configPath, quiet };
}

function validateOptions(input) {
  const options = {};
  for (const key of Object.keys(input)) {
    if (!OPTION_KEYS.has(key)) fail('unsupported config option: ' + key);
    options[key] = input[key];
  }
  options.preset = options.preset || 'maximum';
  if (!PRESETS.has(options.preset)) fail('preset must be lightweight, balanced, or maximum');
  if (options.junk !== undefined) options.junk = integer(options.junk, 'junk', 0, 4);
  if (options.guard !== undefined) options.guard = integer(options.guard, 'guard', 0, 2);
  if (options.antiTamper !== undefined) options.antiTamper = integer(options.antiTamper, 'antiTamper', 0, 2);
  if (options.vmLayers !== undefined) options.vmLayers = integer(options.vmLayers, 'vmLayers', 1, 10);
  if (options.vmMode !== undefined && !['fast', 'balanced', 'secure'].includes(options.vmMode)) {
    fail('vmMode must be fast, balanced, or secure');
  }
  if (options.nameStyle !== undefined && !['short', 'random', 'confuse'].includes(options.nameStyle)) {
    fail('nameStyle must be short, random, or confuse');
  }
  for (const key of ['minify', 'watermark', 'captureGlobals', 'compression']) {
    if (options[key] !== undefined) options[key] = boolean(options[key], key);
  }
  for (const key of ['lockPlace', 'lockUniverse']) {
    if (options[key] !== undefined && options[key] !== '') options[key] = numericId(options[key], key);
  }
  return options;
}

const parsed = parseArgs(process.argv.slice(2));
if (parsed.positional.length < 1 || parsed.positional.length > 2) {
  usage();
  process.exit(1);
}
const input = parsed.positional[0];
const output = parsed.positional[1] || input.replace(/\.(lua|luau|txt)$/i, '') + '.protected.luau';

let config = {};
if (parsed.configPath) {
  try {
    config = JSON.parse(fs.readFileSync(parsed.configPath, 'utf8'));
  } catch (error) {
    fail('could not read valid JSON config ' + parsed.configPath + ': ' + error.message);
  }
  if (!config || Array.isArray(config) || typeof config !== 'object') fail('config must be a JSON object');
}
const options = validateOptions(Object.assign({ preset: 'maximum' }, config, parsed.explicit));

let source;
try { source = fs.readFileSync(input, 'utf8'); }
catch (error) { fail('cannot read ' + input + ': ' + error.message); }

const result = DARK.obfuscate(source, options);
if (!result.ok) {
  const error = result.error || {};
  fail('build failed: ' + (error.message || 'unknown error') +
    (error.line ? ' (line ' + error.line + ', column ' + error.col + ')' : ''));
}
fs.writeFileSync(output, result.output);
const stats = result.stats;
console.error('protected ' + input + ' -> ' + output +
  ' (' + (stats.inputChars / 1024).toFixed(1) + ' KB -> ' + (stats.outputChars / 1024).toFixed(1) + ' KB, ' +
  stats.ms + ' ms, ' + stats.engine + ', seed ' + stats.seed + ')');
if (result.warnings && result.warnings.length) console.error('warning: ' + result.warnings.join(' '));
if (!parsed.quiet && stats.outputChars < 400000) console.log(result.output);
