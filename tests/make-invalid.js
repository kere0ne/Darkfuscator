// Generates the "must be rejected" corpus. Kept as a script so the fixtures are
// reproducible and easy to extend.
'use strict';
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'invalid');
fs.mkdirSync(dir, { recursive: true });

const cases = {
  'bad01-assign-name.luau': 'local = 1\n',
  'bad02-unfinished-if.luau': 'if true then\n  print(1)\n',
  'bad03-unterminated-string.luau': 'print("unterminated\n',
  'bad04-eof.luau': 'local x =\n',
  'bad05-noname-function.luau': 'function () end\n',
  'bad06-double-eq.luau': 'x = = 1\n',
  'bad07-bad-local.luau': 'local 1 = 2\n',
  'bad08-extra-paren.luau': 'print(1))\n',
  'bad09-missing-do.luau': 'for i = 1, 10 print(i) end\n',
  'bad10-malformed-number.luau': 'local x = 0x1p4\n',
  'bad11-unfinished-table.luau': 't = {1,2,\n',
  'bad12-goto-label.luau': '::label::\n',
  'bad13-junk-expr.luau': 'local x = a b c\n',
  'bad14-double-return.luau': 'return 1\nreturn 2\n',
  'bad15-unfinished-call.luau': 'local function f() end\nf(1,2,\n',
  'bad16-unclosed-long.luau': 'print([==[unclosed]\n',
  'bad17-bad-assign.luau': 'local t = {}\nt.x..y = 1\n',
  'bad18-bad-interp.luau': 'local x = `unclosed {1`\n',
  'bad19-break-outside-loop.luau': 'do\n  break\nend\n',
  'bad20-typed-decl.luau': 'local x: = 1\n',
  'bad21-method-no-name.luau': 'local t = {}\nfunction t:() end\n',
  'bad22-continue-outside.luau': 'continue\n',
  'bad23-two-values.luau': 'print("a" 1)\n',
  'bad24-stray-end.luau': 'print(1)\nend\n',
  'bad25-generic-unclosed.luau': 'local function f<T(v) end\n'
};

for (const [name, src] of Object.entries(cases)) {
  fs.writeFileSync(path.join(dir, name), src);
}
console.log('wrote ' + Object.keys(cases).length + ' invalid fixtures to ' + dir);
