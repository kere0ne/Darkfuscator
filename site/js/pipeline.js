/*
 * pipeline.js — small, deliberately conservative AST optimization pass for
 * Darkfuscator's compiler pipeline.
 *
 * This module is not a text-rewriter. It works on parser AST nodes before they
 * become Darkfuscator register bytecode, and only folds operations whose
 * operands are literal primitives. That keeps the pass semantics-preserving:
 * it never evaluates a global, invokes a metamethod, or removes a side effect.
 */
;(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DarkfuscatorPipeline = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function tokenFor(value) {
    if (value === null) return { k: 'keyword', v: 'nil', raw: 'nil' };
    if (value === true || value === false) return { k: 'keyword', v: value ? 'true' : 'false', raw: String(value) };
    if (typeof value === 'number') return { k: 'number', v: value, raw: numberText(value) };
    return { k: 'string', v: String(value), raw: JSON.stringify(String(value)) };
  }

  function numberText(n) {
    if (Object.is(n, -0)) return '-0';
    if (n === Infinity) return '1e999';
    if (n === -Infinity) return '-1e999';
    if (Number.isNaN(n)) return '0/0';
    return String(n);
  }

  function literalValue(node) {
    if (!node || node.kind !== 'const' || !node.token) return null;
    var t = node.token;
    if (t.k === 'number') return { ok: true, value: t.v, type: 'number' };
    if (t.k === 'string' && !t.parts) return { ok: true, value: t.v, type: 'string' };
    if (t.v === 'nil') return { ok: true, value: null, type: 'nil' };
    if (t.v === 'true') return { ok: true, value: true, type: 'boolean' };
    if (t.v === 'false') return { ok: true, value: false, type: 'boolean' };
    return null;
  }

  function literal(value) { return { kind: 'const', token: tokenFor(value) }; }
  function truthy(v) { return v !== null && v !== false; }
  function ascii(s) { return /^[\x00-\x7F]*$/.test(s); }

  /**
   * Fold literal-only expressions. `state.folded` is exposed in build metadata
   * so the caller can report which real compiler pass ran.
   */
  function foldExpression(node, state) {
    if (!node || typeof node !== 'object') return node;

    switch (node.kind) {
      case 'paren':
      case 'cast':
        node.e = foldExpression(node.e, state);
        return node;
      case 'un': {
        node.e = foldExpression(node.e, state);
        var uv = literalValue(node.e);
        if (!uv) return node;
        if (node.op === 'not') { state.folded++; return literal(!truthy(uv.value)); }
        if (node.op === '-' && uv.type === 'number' && isFinite(uv.value)) { state.folded++; return literal(-uv.value); }
        // Luau's string length is byte length, not JavaScript UTF-16 length.
        if (node.op === '#' && uv.type === 'string' && ascii(uv.value)) { state.folded++; return literal(uv.value.length); }
        return node;
      }
      case 'bin': {
        node.l = foldExpression(node.l, state);
        node.r = foldExpression(node.r, state);
        var a = literalValue(node.l), b = literalValue(node.r);

        // Lua's short-circuit values are themselves; literal left operands
        // make this conversion safe and preserve the right expression intact.
        if (node.op === 'and' && a) { state.folded++; return truthy(a.value) ? node.r : node.l; }
        if (node.op === 'or' && a) { state.folded++; return truthy(a.value) ? node.l : node.r; }
        if (!a || !b) return node;

        if (a.type === 'number' && b.type === 'number' && isFinite(a.value) && isFinite(b.value)) {
          var n;
          if (node.op === '+') n = a.value + b.value;
          else if (node.op === '-') n = a.value - b.value;
          else if (node.op === '*') n = a.value * b.value;
          else if (node.op === '/' && b.value !== 0) n = a.value / b.value;
          else if (node.op === '//' && b.value !== 0) n = Math.floor(a.value / b.value);
          else if (node.op === '%' && b.value !== 0) n = a.value - Math.floor(a.value / b.value) * b.value;
          else if (node.op === '^') n = Math.pow(a.value, b.value);
          if (n !== undefined && isFinite(n)) { state.folded++; return literal(n); }
        }
        if (node.op === '..' && (a.type === 'string' || a.type === 'number') && (b.type === 'string' || b.type === 'number')) {
          state.folded++; return literal(String(a.value) + String(b.value));
        }
        if (node.op === '==' || node.op === '~=') {
          var eq = a.type === b.type && a.value === b.value;
          state.folded++; return literal(node.op === '==' ? eq : !eq);
        }
        if ((node.op === '<' || node.op === '<=' || node.op === '>' || node.op === '>=') && a.type === b.type && (a.type === 'number' || a.type === 'string')) {
          var cmp = node.op === '<' ? a.value < b.value : node.op === '<=' ? a.value <= b.value : node.op === '>' ? a.value > b.value : a.value >= b.value;
          state.folded++; return literal(cmp);
        }
        return node;
      }
      case 'index':
        node.obj = foldExpression(node.obj, state); return node;
      case 'indexb':
        node.obj = foldExpression(node.obj, state); node.key = foldExpression(node.key, state); return node;
      case 'call':
        node.fn = foldExpression(node.fn, state);
        node.args = (node.args || []).map(function (x) { return foldExpression(x, state); });
        return node;
      case 'methodcall':
        node.obj = foldExpression(node.obj, state);
        node.args = (node.args || []).map(function (x) { return foldExpression(x, state); });
        return node;
      case 'table':
        (node.fields || []).forEach(function (field) {
          if (field.key) field.key = foldExpression(field.key, state);
          if (field.value) field.value = foldExpression(field.value, state);
        });
        return node;
      case 'ifexpr':
        node.clauses = (node.clauses || []).map(function (clause) {
          clause.cond = foldExpression(clause.cond, state);
          clause.exp = foldExpression(clause.exp, state);
          return clause;
        });
        node.elseExp = foldExpression(node.elseExp, state);
        for (var i = 0; i < node.clauses.length; i++) {
          var cv = literalValue(node.clauses[i].cond);
          if (!cv) break;
          if (truthy(cv.value)) { state.folded++; return node.clauses[i].exp; }
        }
        return node;
      case 'funcexpr':
        foldBody(node.body, state); return node;
      default:
        return node;
    }
  }

  function foldBlock(block, state) {
    if (!block || !block.stats) return;
    block.stats.forEach(function (statement) { foldStatement(statement, state); });
  }

  function foldBody(body, state) {
    if (body && body.block) foldBlock(body.block, state);
  }

  function foldStatement(s, state) {
    if (!s || typeof s !== 'object') return;
    switch (s.kind) {
      case 'local':
        if (s.values) s.values = s.values.map(function (e) { return foldExpression(e, state); });
        break;
      case 'localfunc':
        foldBody(s.body, state); break;
      case 'funcstat':
        foldBody(s.body, state); break;
      case 'assign':
        s.targets = (s.targets || []).map(function (e) { return foldExpression(e, state); });
        s.values = (s.values || []).map(function (e) { return foldExpression(e, state); });
        break;
      case 'call':
        s.expr = foldExpression(s.expr, state); break;
      case 'if':
        (s.clauses || []).forEach(function (c) { c.cond = foldExpression(c.cond, state); foldBlock(c.block, state); });
        foldBlock(s.elseBlock, state); break;
      case 'while':
        s.cond = foldExpression(s.cond, state); foldBlock(s.block, state); break;
      case 'repeat':
        foldBlock(s.block, state); s.cond = foldExpression(s.cond, state); break;
      case 'numfor':
        s.start = foldExpression(s.start, state); s.limit = foldExpression(s.limit, state);
        if (s.step) s.step = foldExpression(s.step, state);
        foldBlock(s.block, state); break;
      case 'genfor':
        s.exps = (s.exps || []).map(function (e) { return foldExpression(e, state); }); foldBlock(s.block, state); break;
      case 'return':
        if (s.values) s.values = s.values.map(function (e) { return foldExpression(e, state); });
        break;
      case 'block':
        foldBlock(s.block, state); break;
    }
  }

  function optimizeAst(ast) {
    var state = { folded: 0, passes: ['literal-constant-folding', 'local-bytecode-allocation'] };
    foldBlock(ast, state);
    return state;
  }

  return { optimizeAst: optimizeAst };
});
