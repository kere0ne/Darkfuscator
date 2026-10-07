/* Local-engine UI smoke test. It loads the public offline page, wires the real
 * parser/compiler/VM scripts, then drives browser controls as a user would. */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (error) {
  console.log('Skipped: this test needs jsdom — npm install');
  process.exit(0);
}

const SITE = path.join(__dirname, '..', 'site');
const html = fs.readFileSync(path.join(SITE, 'offline.html'), 'utf8');
const virtualConsole = new VirtualConsole();
const logs = [];
virtualConsole.on('jsdomError', (error) => logs.push('jsdomError: ' + error.message));
virtualConsole.on('error', (...args) => logs.push('console.error: ' + args.join(' ')));

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/offline',
  runScripts: 'dangerously',
  resources: undefined,
  virtualConsole,
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;
for (const file of [
  'js/luau-lexer.js', 'js/luau-parser.js', 'js/ir.js', 'js/pipeline.js', 'js/vm-compile.js',
  'js/vm-emit.js', 'js/obfuscate.js', 'js/offline.js', 'js/editor.js'
]) {
  const script = document.createElement('script');
  script.textContent = fs.readFileSync(path.join(SITE, file), 'utf8');
  document.head.appendChild(script);
}

const $ = (selector) => document.querySelector(selector);
let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}

check('engine loaded on window', !!window.Darkfuscator);
check('no script errors', logs.length === 0, logs.join(' | '));
check('local-only notice is visible', /does not create an account/i.test(document.body.textContent));

// The signed-in workspace creates this editor dynamically. Verify that its
// constructor attaches the shell to the caller's mount instead of leaving a
// non-interactive empty container.
const editorMount = document.createElement('div');
document.body.appendChild(editorMount);
const mountedEditor = new window.DFEditor(editorMount, { highlighting: true, fontSize: 13, tabSize: 4 });
check('workspace editor mounts its editable textarea', !!editorMount.querySelector('.editor-area'));
mountedEditor.setValue('local mounted = 42');
check('workspace editor accepts source after mounting', mountedEditor.getValue() === 'local mounted = 42');
editorMount.remove();

const sample = [
  'local function fib(n)',
  '  if n < 2 then return n end',
  '  return fib(n - 1) + fib(n - 2)',
  'end',
  'local t = { name = "dark", ok = true }',
  'for i = 0, 10 do t[i] = fib(i) end',
  'print(t.name, t.ok, t[10])',
  'local co = coroutine.wrap(function() coroutine.yield("from coroutine") end)',
  'print(co())',
  ''
].join('\n');

$('#input').value = sample;
$('#input').dispatchEvent(new window.Event('input'));
check('input metadata updates', /chars ·/.test($('#inmeta').textContent), $('#inmeta').textContent);

$('#protect').dispatchEvent(new window.Event('click'));
const output = $('#output').value;
check('output produced', output.length > 100, 'length=' + output.length);
check('status reports verified completion', /ok/.test($('#status').className), $('#status').textContent);
check('statistics are visible', !$('#stats').hidden);
check('verified badge is shown', !$('#verified-badge').hidden);
check('output is valid Luau', window.Darkfuscator.validate(output).ok);
check('at least one VM layer reported', Number($('#st-vms').textContent) > 0, $('#st-vms').textContent);
check('bytecode size reported', /\d/.test($('#st-bytes').textContent), $('#st-bytes').textContent);
check('balanced preset starts selected', $('#opt-preset').value === 'balanced');
check('real setting controls are present', $('#opt-ir') && $('#opt-junk') && $('#opt-vm-mode') && $('#opt-integrity') && $('#local-settings-title'));
check('checkbox controls are present', $('#opt-compression').type === 'checkbox' && $('#opt-minify').type === 'checkbox');

$('#opt-preset').value = 'maximum';
$('#opt-preset').dispatchEvent(new window.Event('change'));
check('preset applies actual engine options', $('#opt-ir').value === 'secure' && $('#opt-vm-layers').value === '4' && $('#opt-junk').value === '2' && $('#opt-integrity').value === '2');

$('#input').value = 'local x = = 1\n';
$('#protect').dispatchEvent(new window.Event('click'));
check('syntax-error panel is visible', !$('#error').hidden);
check('syntax error names line and column', /line \d+, column \d+/.test($('#error').textContent), $('#error').textContent.slice(0, 120));
check('syntax error sets an error status', /err/.test($('#status').className), $('#status').textContent);

$('#input').value = 'print("hi")\n';
$('#validate').dispatchEvent(new window.Event('click'));
check('validate reports valid input', /Valid Luau/.test($('#status').textContent), $('#status').textContent);

$('#clear').dispatchEvent(new window.Event('click'));
check('clear empties input', $('#input').value === '');
check('clear empties output', $('#output').value === '');

$('#opt-preset').value = 'lightweight';
$('#opt-preset').dispatchEvent(new window.Event('change'));
$('#input').value = 'local a = 1\nprint(a)\n';
$('#protect').dispatchEvent(new window.Event('click'));
const first = $('#output').value;
$('#protect').dispatchEvent(new window.Event('click'));
check('fresh runs receive different build layouts', first !== $('#output').value);

$('#output').value = '';
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
check('Ctrl+Enter protects source', $('#output').value.length > 0);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
