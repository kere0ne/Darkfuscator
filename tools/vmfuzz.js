#!/usr/bin/env node
/**
 * Differential fuzzer for the bytecode VM.
 *
 * Generates random (deterministic) Luau programs from a grammar, runs each one
 * under the real Luau CLI and again after a VM build, and reports the first
 * program whose observable behaviour differs.
 *
 *   node tools/vmfuzz.js [iterations] [--seed=N] [--keep]
 */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
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
const Parser = require(path.join(ROOT, 'site', 'js', 'luau-parser.js'));
const Compile = require(path.join(ROOT, 'site', 'js', 'vm-compile.js'));
const Emit = require(path.join(ROOT, 'site', 'js', 'vm-emit.js'));

function rngOf(seed) {
  let x = (seed >>> 0) || 1;
  return function () {
    x = (x + 0x6D2B79F5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** the set of variables visible at a point in the generated program */
function Scope(vars) { this.vars = (vars || []).slice(); }
Scope.prototype.add = function (n) { this.vars.push(n); };
Scope.prototype.push = function () {
  const child = new Scope(this.vars);
  for (let i = 0; i < arguments.length; i++) child.vars.push(arguments[i]);
  return child;
};
Scope.prototype.var = function () {
  if (!this.vars.length) return 'nil';
  return this.vars[Math.floor(rngOf(this.vars.length * 31 + 7)() * this.vars.length) % this.vars.length];
};

// -------------------------------------------------------------- the generator
function Gen(seed) {
  const r = rngOf(seed);
  const self = this;
  this.r = r;
  this.n = 0;
  const pick = (a) => a[Math.floor(r() * a.length) % a.length];
  const pickN = (a, n) => { const o = []; for (let i = 0; i < n; i++) o.push(pick(a)); return o; };
  const uid = (p) => p + (++self.n);
  const chance = (p) => r() < p;

  const NAMES = ['a', 'b', 'c', 'd', 'n', 'm', 'v', 'w', 'x', 'y', 'z', 'q', 't', 'u', 'k', 's'];
  const STRINGS = ['"foo"', '"bar"', '"a,b,c"', '""', '"x1"', '"Zz"', '"10"', '"  pad  "', '"a\\0b"', '"%d-%s"'];

  this.num = () => pick(['0', '1', '2', '3', '5', '7', '10', '42', '100', '-3', '0.5', '2.25', '1e3']);
  this.str = () => pick(STRINGS);
  this.bool = () => pick(['true', 'false']);

  // --- expressions ---------------------------------------------------------
  this.expr = function (d, scope) {
    const k = Math.floor(r() * 18);
    if (d <= 0 || k < 4) return pick([self.num(), self.str(), self.bool(), 'nil', scope.var()]);
    switch (k % 18) {
      case 4: return `${self.expr(d - 1, scope)} ${pick(['+', '-', '*', '/', '%', '//', '^', '..'])} ${self.expr(d - 1, scope)}`;
      case 5: return `-(${self.expr(d - 1, scope)})`;
      case 6: return `not (${self.expr(d - 1, scope)})`;
      case 7: return `#${self.str()}`;
      case 8: return `(${self.expr(d - 1, scope)} == ${self.expr(d - 1, scope)})`;
      case 9: return `(${self.expr(d - 1, scope)} ${pick(['<', '<=', '>', '>='])} ${self.num()})`;
      case 10: return `(${self.expr(d - 1, scope)} and ${self.expr(d - 1, scope)})`;
      case 11: return `(${self.expr(d - 1, scope)} or ${self.expr(d - 1, scope)})`;
      case 12: return self.table(d - 1, scope);
      case 13: return `${scope.var()}[${pick(['1', '2', '"k"', '"n"', self.expr(d - 1, scope)])}]`;
      case 14: return self.call(d - 1, scope);
      case 15: return `tostring(${self.expr(d - 1, scope)})`;
      case 16: return `type(${self.expr(d - 1, scope)})`;
      default: return `(if ${self.expr(d - 1, scope)} then ${self.expr(d - 1, scope)} else ${self.expr(d - 1, scope)})`;
    }
  };
  this.table = function (d, scope) {
    const parts = [];
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) parts.push(self.expr(d - 1, scope));
    for (let i = 0; i < 2; i++) {
      if (chance(0.4)) parts.push(`${pick(['k', 'n', 'x', 'name'])} = ${self.expr(d - 1, scope)}`);
    }
    return `{ ${parts.join(', ')} }`;
  };
  this.call = function (d, scope) {
    const f = pick([
      'math.floor', 'math.abs', 'math.max', 'math.min', 'math.sqrt', 'tostring', 'tonumber',
      'string.upper', 'string.lower', 'string.len', 'string.rep', 'string.format', 'table.concat',
      'select', 'type', 'rawget', 'rawlen', 'unpack', 'print', 'pairs', 'ipairs',
    ]);
    const n = Math.floor(r() * 3);
    const args = [];
    for (let i = 0; i < n; i++) args.push(self.expr(d - 1, scope));
    if (f === 'string.format') return `string.format("%d-%s", ${self.num()}, ${self.str()})`;
    if (f === 'string.rep') return `string.rep(${self.str()}, ${pick(['0', '1', '2', '3'])})`;
    if (f === 'table.concat') return `table.concat({ ${pick(['1', '"a"', '2'])} , ${pick(['2', '"b"'])} }, ",")`;
    if (f === 'select') return `select(${pick(['1', '2', '"#"'])}, ${self.str()}, ${self.str()}, ${self.str()})`;
    if (f === 'unpack') return `unpack({ 1, 2, 3 })`;
    if (f === 'print') return `(function() return ${self.expr(d - 1, scope)} end)()`;
    if (f === 'pairs' || f === 'ipairs') return `select(1, ${f}({ 1, 2 }))`;
    return `${f}(${args.join(', ')})`;
  };

  // --- statements ----------------------------------------------------------
  this.stmt = function (d, scope, out, ind) {
    const pad = '  '.repeat(ind);
    const k = Math.floor(r() * 27);
    if (d <= 0) { out.push(pad + `print(${self.expr(1, scope)})`); return; }
    switch (k) {
      case 0: case 1: {
        const names = chance(0.3) ? [uid('l')] : [uid('l'), uid('l')];
        const vals = names.map(() => self.expr(2, scope));
        out.push(pad + `local ${names.join(', ')} = ${vals.join(', ')}`);
        names.forEach((n) => scope.add(n));
        break;
      }
      case 2: {
        out.push(pad + `print(${Array.from({ length: 1 + Math.floor(r() * 3) }, () => self.expr(2, scope)).join(', ')})`);
        break;
      }
      case 3: { // numeric for (always bounded)
        const v = uid('i');
        const step = pick(['1', '2', '-1']);
        out.push(pad + `for ${v} = ${pick(['1', '0', '-2'])}, ${pick(['3', '5', '1'])}, ${step} do`);
        const inner = scope.push(v);
        self.block(d - 1, inner, out, ind + 1);
        out.push(pad + 'end');
        break;
      }
      case 4: { // generic for
        const k2 = uid('k'), v2 = uid('v');
        const src = pick(['{ 1, 2, 3 }', '{ a = 1, b = 2 }', '{ "x", "y" }']);
        out.push(pad + `for ${k2}, ${v2} in ${chance(0.5) ? 'pairs' : 'ipairs'}(${src}) do`);
        const inner = scope.push(k2, v2);
        out.push('  '.repeat(ind + 1) + `print(${k2}, ${v2})`);
        self.block(d - 1, inner, out, ind + 1);
        out.push(pad + 'end');
        break;
      }
      case 5: { // while with a guard counter
        const g = uid('g');
        out.push(pad + `local ${g} = 0`);
        scope.add(g);
        out.push(pad + `while ${g} < ${pick(['2', '3'])} do`);
        out.push('  '.repeat(ind + 1) + `${g} += 1`);
        self.block(d - 1, scope, out, ind + 1);
        out.push(pad + 'end');
        break;
      }
      case 6: { // repeat
        const g = uid('g');
        out.push(pad + `local ${g} = 0`);
        scope.add(g);
        out.push(pad + 'repeat');
        out.push('  '.repeat(ind + 1) + `${g} += 1`);
        self.block(d - 1, scope, out, ind + 1);
        out.push(pad + `until ${g} >= ${pick(['1', '2', '3'])}`);
        break;
      }
      case 7: { // if / elseif / else
        out.push(pad + `if ${self.expr(2, scope)} then`);
        self.block(d - 1, scope, out, ind + 1);
        if (chance(0.5)) {
          out.push(pad + `elseif ${self.expr(2, scope)} then`);
          self.block(d - 1, scope, out, ind + 1);
        }
        if (chance(0.4)) {
          out.push(pad + 'else');
          self.block(d - 1, scope, out, ind + 1);
        }
        out.push(pad + 'end');
        break;
      }
      case 8: { // plain closure
        const fn = uid('f'), p1 = uid('p'), p2 = uid('p');
        out.push(pad + `local function ${fn}(${p1}, ${p2})`);
        const inner = scope.push(p1, p2);
        self.block(d - 1, inner, out, ind + 1);
        out.push('  '.repeat(ind + 1) + `return ${p1}, ${p2}`);
        out.push(pad + 'end');
        scope.add(fn);
        out.push(pad + `print(${fn}(${self.expr(1, scope)}, ${self.expr(1, scope)}))`);
        break;
      }
      case 9: { // closure capturing an enclosing local (upvalue box)
        const cap = uid('c'), fn = uid('f');
        out.push(pad + `local ${cap} = ${self.expr(1, scope)}`);
        scope.add(cap);
        out.push(pad + `local function ${fn}()`);
        out.push('  '.repeat(ind + 1) + `${cap} = (${cap} or 0) + 1`);
        out.push('  '.repeat(ind + 1) + `return ${cap}`);
        out.push(pad + 'end');
        scope.add(fn);
        out.push(pad + `print(${fn}(), ${fn}(), ${cap})`);
        break;
      }
      case 10: { // method call on a table with a metatable
        const t = uid('t');
        out.push(pad + `local ${t} = setmetatable({ n = ${self.num()} }, {`);
        out.push(pad + '  __index = { get = function(self) return self.n end },');
        out.push(pad + '  __tostring = function(self) return "T" .. tostring(self.n) end,');
        out.push(pad + `  __add = function(a, b) return setmetatable({ n = a.n + (type(b) == "table" and b.n or b) }, getmetatable(a)) end,`);
        out.push(pad + '})');
        scope.add(t);
        out.push(pad + `print(${t}:get(), tostring(${t}), tostring(${t} + 5))`);
        break;
      }
      case 11: { // varargs + select
        const fn = uid('f');
        out.push(pad + `local function ${fn}(...)`);
        out.push('  '.repeat(ind + 1) + 'local n = select("#", ...)');
        out.push('  '.repeat(ind + 1) + 'local sum = 0');
        out.push('  '.repeat(ind + 1) + 'for i = 1, n do sum += (select(i, ...) or 0) end');
        out.push('  '.repeat(ind + 1) + 'return n, sum');
        out.push(pad + 'end');
        scope.add(fn);
        out.push(pad + `print(${fn}(${pickN(['1', '2', '3', '"a"'], 1 + Math.floor(r() * 3)).join(', ')}))`);
        break;
      }
      case 12: { // pcall / error
        out.push(pad + 'print(pcall(function()');
        out.push('  '.repeat(ind + 1) + (chance(0.5) ? 'error("boom")' : `return ${self.expr(1, scope)}`));
        out.push(pad + 'end))');
        break;
      }
      case 13: { // string library + concat
        out.push(pad + `print((${self.str()}):upper() .. (#${self.str()}) .. string.rep("ab", ${pick(['1', '2'])}))`);
        break;
      }
      case 14: { // table built from a call, multi-returns
        const fn = uid('f');
        out.push(pad + `local function ${fn}() return 1, 2, 3 end`);
        scope.add(fn);
        out.push(pad + `local ${uid('r')} = { ${fn}() }`);
        out.push(pad + `print(#{ ${fn}() }, select(2, ${fn}()), (${fn}()))`);
        break;
      }
      case 16: { // coroutines
        const co = uid('co'), w = uid('w');
        out.push(pad + `local ${co} = coroutine.create(function(x)`);
        out.push(pad + '  local y = coroutine.yield(x + 1)');
        out.push(pad + '  return y * 2');
        out.push(pad + 'end)');
        out.push(pad + `print(coroutine.resume(${co}, ${self.num()}))`);
        out.push(pad + `print(coroutine.resume(${co}, 5))`);
        out.push(pad + `print(coroutine.status(${co}))`);
        out.push(pad + `local ${w} = coroutine.wrap(function(a) local b = coroutine.yield(a + 1) return b end)`);
        out.push(pad + `print(${w}(1), ${w}(3))`);
        break;
      }
      case 17: { // closures nested two levels deep
        const ov = uid('ov'), mid = uid('mid'), f1 = uid('f'), f2 = uid('f');
        out.push(pad + `local ${ov} = ${self.num()}`);
        scope.add(ov);
        out.push(pad + `local function ${mid}()`);
        out.push(pad + `  local mv = ${self.num()}`);
        out.push(pad + '  local function inner()');
        out.push(pad + `    ${ov} = ${ov} + 1`);
        out.push(pad + '    mv = mv + 10');
        out.push(pad + '    return ' + ov + ', mv');
        out.push(pad + '  end');
        out.push(pad + '  return inner');
        out.push(pad + 'end');
        out.push(pad + `local ${f1}, ${f2} = ${mid}(), ${mid}()`);
        out.push(pad + `print(${f1}(), ${f2}(), ${f1}(), ${ov})`);
        break;
      }
      case 18: { // method definitions and self
        const o = uid('o');
        out.push(pad + `local ${o} = { v = ${self.num()} }`);
        out.push(pad + `function ${o}:get() return self.v end`);
        out.push(pad + `function ${o}:set(x) self.v = x return self end`);
        out.push(pad + `function ${o}:sum() local s = 0 for i = 1, 3 do s = s + i end return s + self.v end`);
        out.push(pad + `${o}:set(${self.num()})`);
        out.push(pad + `print(${o}:get(), ${o}:sum(), ${o}.v)`);
        scope.add(o);
        break;
      }
      case 19: { // break / continue
        const acc = uid('s');
        out.push(pad + `local ${acc} = 0`);
        out.push(pad + 'for i = 1, 6 do');
        out.push(pad + '  if i % 2 == 0 then continue end');
        out.push(pad + '  if i > 4 then break end');
        out.push(pad + `  ${acc} = ${acc} + i`);
        out.push(pad + 'end');
        out.push(pad + `print(${acc})`);
        break;
      }
      case 20: { // multiple assignment, computed keys, nesting
        const p = uid('p'), q = uid('q'), t = uid('t');
        out.push(pad + `local ${p}, ${q} = ${self.num()}, ${self.str()}`);
        out.push(pad + `${p}, ${q} = ${q}, ${p}`);
        out.push(pad + `local ${t} = { [${q}] = ${p}, ["k" .. ${p}] = 1, nested = { deep = { deeper = ${p} } } }`);
        out.push(pad + `print(${p}, ${q}, ${t}[${q}], ${t}.nested.deep.deeper)`);
        scope.add(t);
        break;
      }
      case 21: { // interpolation, long strings, string.format
        const nm = uid('nm'), v = uid('v');
        out.push(pad + `local ${nm} = ${self.str()}`);
        out.push(pad + `local ${v} = ${pick(['1', '2', '7', '42'])}`);
        out.push(pad + `print(\`x{${nm}}y{${v}}\`)`);
        out.push(pad + 'print([[raw');
        out.push(pad + 'string]])');
        out.push(pad + `print(string.format("%d/%s", ${v}, ${nm}))`);
        break;
      }
      case 22: { // error objects, xpcall handlers, pcall with arguments
        out.push(pad + 'print(xpcall(function()');
        out.push(pad + '  error("inner")');
        out.push(pad + 'end, function(e) return "H:" .. tostring(e) end))');
        out.push(pad + 'print(pcall(error, "direct"))');
        out.push(pad + 'print(select(2, pcall(function() error({ code = 1 }) end)))');
        break;
      }
      case 23: { // the rest of the metamethods
        const a = uid('o'), b = uid('o');
        out.push(pad + 'local mt = {');
        out.push(pad + '  __call = function(self, x) return x * 2 end,');
        out.push(pad + '  __len = function(self) return #self.items end,');
        out.push(pad + '  __concat = function(l, r) return tostring(#l) .. tostring(r) end,');
        out.push(pad + '  __eq = function(l, r) return #l.items == #r.items end,');
        out.push(pad + '  __lt = function(l, r) return #l.items < #r.items end,');
        out.push(pad + '  __unm = function(self) return -#self.items end,');
        out.push(pad + '}');
        out.push(pad + `local ${a} = setmetatable({ items = { 1, 2, 3 } }, mt)`);
        out.push(pad + `local ${b} = setmetatable({ items = { 4 } }, mt)`);
        out.push(pad + `print(${a}(21), #${a}, ${a} .. "-x", ${a} == ${b}, ${a} < ${b}, -${a})`);
        break;
      }
      case 24: { // tail calls and multi-return tail calls
        const rec = uid('rec');
        out.push(pad + `local function ${rec}(n, acc)`);
        out.push(pad + '  if n <= 0 then return acc end');
        out.push(pad + `  return ${rec}(n - 1, acc + n)`);
        out.push(pad + 'end');
        out.push(pad + `print(${rec}(5, 0))`);
        out.push(pad + `local function trio() return 1, 2, 3 end`);
        out.push(pad + 'print((function() return trio() end)())');
        break;
      }
      case 25: { // return with a trailing vararg / call expansion
        const f = uid('f');
        out.push(pad + `local function ${f}(...)`);
        out.push(pad + '  return select("#", ...), ...');
        out.push(pad + 'end');
        out.push(pad + `print(${f}())`);
        out.push(pad + `print(${f}(1, 2, 3))`);
        out.push(pad + `print(#{ ${f}(1, 2) })`);
        out.push(pad + `local p, q, s2 = ${f}(7, 8)`);
        out.push(pad + 'print(p, q, s2)');
        out.push(pad + 'local function g() return "z", (function() return 1, 2, 3 end)() end');
        out.push(pad + 'print(g())');
        break;
      }
      case 26: { // multi-values in every other position
        const f = uid('f'), t = uid('t');
        out.push(pad + 'local function ' + f + '() return 1, 2, 3 end');
        out.push(pad + `local ${t} = { ${f}() }`);
        out.push(pad + `print(#${t}, ${t}[3])`);
        out.push(pad + `local a1, b1 = ${f}()`);
        out.push(pad + 'print(a1, b1)');
        out.push(pad + `print(select("#", ${f}()), select(3, ${f}()))`);
        out.push(pad + `print(table.pack(${f}()).n)`);
        break;
      }
      default: { // assignment / compound assignment to a table field
        const t = uid('t');
        out.push(pad + `local ${t} = { x = ${self.num()}, y = ${self.num()} }`);
        scope.add(t);
        out.push(pad + `${t}.x ${pick(['=', '+=', '-=', '*='])} ${self.expr(1, scope)}`);
        out.push(pad + `${t}["y"] = ${self.expr(1, scope)}`);
        out.push(pad + `print(${t}.x, ${t}.y, ${t}.z)`);
        break;
      }
    }
  };
  this.block = function (d, scope, out, ind) {
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) self.stmt(d, scope, out, ind);
  };
  this.program = function () {
    const out = [];
    const scope = new Scope(['a', 'b']);
    out.push('local a, b = 1, 2');
    self.block(DEEP ? 5 : 3, scope, out, 0);
    out.push('print("done", a, b)');
    return out.join('\n') + '\n';
  };
}

// ------------------------------------------------------------------ the driver
function runScript(file, timeout) {
  try {
    const out = execFileSync(LUAU, [file], {
      encoding: 'utf8', timeout: timeout, maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out: String(out) };
  } catch (e) {
    if (e.signal === 'SIGTERM' || e.killed) return { code: 'timeout', out: String(e.stdout || '') };
    const code = (e.status === undefined || e.status === null) ? 'error' : e.status;
    return { code: code, out: String(e.stdout || ''), err: String(e.stderr || '').split('\n')[0] };
  }
}
/**
 * Compared text hides the things that legitimately differ between two files:
 *   · script path + line number in messages (both from stderr and from prints)
 *   · tostring() of tables, functions, threads and userdata (heap addresses)
 */
function clean(s) {
  return String(s)
    .replace(/[^\s"'()]*\.(?:luau|lua):\d+:/g, 'FILE:L:')
    .replace(/\b(table|function|thread|userdata): 0x[0-9a-fA-F]+/g, '$1: 0xADDR')
    .replace(/:\d+: /g, ':L: ');
}
function norm(res) {
  return res.code + '\n' + clean(res.out) + '\n' + clean(res.err);
}

const DEEP = process.argv.indexOf('--deep') >= 0;

function main() {
  const iters = Number(process.argv[2] || 60);
  const keep = process.argv.indexOf('--keep') >= 0;
  const seedArg = (process.argv.find((a) => a.startsWith('--seed=')) || '').split('=')[1];
  const base = Number(seedArg || (Date.now() % 100000));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vmfuzz-'));
  let fails = 0, skipped = 0, checked = 0;
  for (let i = 0; i < iters; i++) {
    const seed = base + i * 7919;
    const src = new Gen(seed).program();
    const origFile = path.join(dir, 'orig.luau');
    fs.writeFileSync(origFile, src);
    const a = runScript(origFile, 10000);
    if (a.code === 'timeout') { skipped++; continue; }
    let built;
    try {
      const parsed = Parser.parse(src);
      const prog = Compile.compile(parsed.ast, parsed.refs);
      built = Emit.emit(prog, { rng: rngOf(seed), junk: i % 3, minify: true });
    } catch (e) {
      console.log(`seed ${seed}: COMPILE ERROR ${e.message}`);
      fails++;
      fs.writeFileSync(path.join(dir, `fail-${seed}.luau`), src);
      continue;
    }
    const obfFile = path.join(dir, 'obf.luau');
    fs.writeFileSync(obfFile, built.source);
    const b = runScript(obfFile, 30000);
    checked++;
    if (norm(a) !== norm(b)) {
      fails++;
      console.log(`--- seed ${seed} MISMATCH (orig exit ${a.code}, obf exit ${b.code})`);
      fs.writeFileSync(path.join(dir, `fail-${seed}.luau`), src);
      fs.writeFileSync(path.join(dir, `fail-${seed}.obf.luau`), built.source);
      const al = norm(a).split('\n'), bl = norm(b).split('\n');
      for (let q = 0; q < Math.max(al.length, bl.length); q++) {
        if (al[q] !== bl[q]) { console.log(`  line ${q}\n    orig: ${JSON.stringify(al[q])}\n    obf : ${JSON.stringify(bl[q])}`); break; }
      }
    } else if (keep) {
      console.log(`seed ${seed}: ok`);
    }
  }
  console.log(`\nchecked ${checked}, mismatches ${fails}, skipped(timeout) ${skipped}  [dir ${dir}]`);
  return fails;
}
if (require.main === module) process.exit(main() ? 1 : 0);
module.exports = { Gen: Gen, rngOf: rngOf };
