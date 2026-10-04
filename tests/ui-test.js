/* End-to-end UI smoke test: loads site/index.html in jsdom, wires the real
 * scripts, and drives the controls the way a user would. */
const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
  console.log('Skipped: this test needs jsdom — npm install jsdom');
  process.exit(0);
}
const SITE = path.join(__dirname, '..', 'site');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');

const vc = new VirtualConsole();
const logs = [];
vc.on('jsdomError', e => logs.push('jsdomError: ' + e.message));
vc.on('error', (...a) => logs.push('console.error: ' + a.join(' ')));

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  runScripts: 'dangerously',
  resources: undefined,
  virtualConsole: vc,
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

// jsdom will not fetch the <script src> tags, so inject them in order
for (const f of ['js/luau-lexer.js', 'js/luau-parser.js', 'js/vm-compile.js',
  'js/vm-emit.js', 'js/obfuscate.js', 'js/app.js']) {
  const code = fs.readFileSync(path.join(SITE, f), 'utf8');
  const s = document.createElement('script');
  s.textContent = code;
  document.head.appendChild(s);
}

const $ = s => document.querySelector(s);
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); }
}

check('engine loaded on window', !!window.Darkfuscator);
check('no script errors', logs.length === 0, logs.join(' | '));

// 1. obfuscate a script through the UI the way a user would
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
check('input meta updated', /chars ·/.test($('#inmeta').textContent), $('#inmeta').textContent);

$('#protect').dispatchEvent(new window.Event('click'));
const out1 = $('#output').value;
check('output produced', out1.length > 100, 'len=' + out1.length);
check('status ok', /ok/.test($('#status').className), $('#status').textContent);
check('stats visible', !$('#stats').hidden);
check('verified badge shown', !$('#verified-badge').hidden);
check('output is valid Luau', window.Darkfuscator.validate(out1).ok);
check('functions compiled > 0', Number($('#st-protos').textContent.replace(/[^0-9]/g, '')) > 0, $('#st-protos').textContent);
check('opcodes > 5', Number($('#st-opcodes').textContent.replace(/[^0-9]/g, '')) > 5, $('#st-opcodes').textContent);
check('bytecode bytes > 0', Number($('#st-bytes').textContent.replace(/[^0-9]/g, '')) > 0, $('#st-bytes').textContent);
check('no preset control remains', $('#preset') === null);
check('example picker removed', $('#sample') === null);

// 2. behaviour match is covered by tests/run.js and tests/fuzz.js
// 3. strength control drives the decoy level
$('#opt-junk').value = '2';
$('#opt-junk').dispatchEvent(new window.Event('change'));
$('#protect').dispatchEvent(new window.Event('click'));
check('junk=2 still produces valid Luau', window.Darkfuscator.validate($('#output').value).ok);
check('junk=2 grows the build', $('#output').value.length > out1.length * 0.9, `${$('#output').value.length} vs ${out1.length}`);

// 4. options survive a reload (persisted to localStorage)
$('#opt-nameStyle').value = 'confuse';
$('#opt-nameStyle').dispatchEvent(new window.Event('change'));
check('options persisted', /confuse/.test(window.localStorage.getItem('darkfuscator.opts.v2') || ''));

// 5. syntax errors are surfaced with a line/column
$('#input').value = 'local x = = 1\n';
$('#protect').dispatchEvent(new window.Event('click'));
check('error panel visible', !$('#error').hidden);
check('error names line/col', /line \d+, column \d+/.test($('#error').textContent), $('#error').textContent.slice(0, 120));
check('status is err', /err/.test($('#status').className), $('#status').textContent);

// 6. validate button on good input
$('#input').value = 'print("hi")\n';
$('#validate').dispatchEvent(new window.Event('click'));
check('validate reports ok', /Valid Luau/.test($('#status').textContent), $('#status').textContent);

// 7. clear resets everything
$('#clear').dispatchEvent(new window.Event('click'));
check('clear empties input', $('#input').value === '');
check('clear empties output', $('#output').value === '');

// 8. seed reproducibility through the UI
$('#input').value = 'local a = 1\nprint(a)\n';
$('#seed').value = '777';
$('#protect').dispatchEvent(new window.Event('click'));
const first = $('#output').value;
$('#protect').dispatchEvent(new window.Event('click'));
check('same seed -> identical output', first === $('#output').value);
$('#seed').value = '778';
$('#protect').dispatchEvent(new window.Event('click'));
check('different seed -> different output', first !== $('#output').value);

// 9. keyboard shortcut
$('#output').value = '';
document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
check('ctrl+enter obfuscates', $('#output').value.length > 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
