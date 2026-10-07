/*!
 * ir.js — the Darkfuscator IR stage.
 *
 * Sits between the parser and the bytecode backend:
 *
 *   AST  ->  structured IR (regions, items)
 *        ->  optimization passes (constant folding, constant/copy propagation,
 *            dead-code elimination, dead-branch splicing)
 *        ->  Luau emission (structured, or a randomized dispatch state machine
 *            with block splitting and opaque predicates at the secure level)
 *        ->  fresh Luau source, re-parsed by the caller and compiled into the
 *            encrypted VM build as before.
 *
 * Everything here is semantics-preserving. Regions never flatten loops or
 * closures (they stay real Luau constructs with their own nested regions), so
 * per-iteration closure capture, repeat-until scoping and break/continue all
 * keep their exact stock behaviour. Values propagate only for function-local,
 * uncaptured variables and only within straight-line runs between branches.
 *
 * Browser: window.DarkfuscatorIR   Node: require('./ir.js')
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Lexer = isNode ? require('./luau-lexer.js') : root.LuauLexer;
  var Parser = isNode ? require('./luau-parser.js') : root.LuauParser;
  var api = factory(Lexer, Parser);
  if (isNode) module.exports = api;
  if (root) root.DarkfuscatorIR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lexer, Parser) {
  'use strict';

  var strToBytes = Lexer.strToBytes;
  var bytesToStr = Lexer.bytesToStr;

  // --------------------------------------------------------- value emission

  function numText(v) {
    if (Object.is(v, -0)) return '-0';
    if (v === Infinity) return '1e999';
    if (v === -Infinity) return '-1e999';
    if (Number.isNaN(v)) return '0/0';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    var s = String(parseFloat(v.toPrecision(17)));
    if (/^[-0-9.eE+]+$/.test(s)) return s;
    return String(v);
  }

  function quoteLua(s) {
    var out = '"', i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c === 34) out += '\\"';
      else if (c === 92) out += '\\\\';
      else if (c === 10) out += '\\n';
      else if (c === 13) out += '\\r';
      else if (c === 9) out += '\\t';
      else if (c === 7) out += '\\a';
      else if (c === 8) out += '\\b';
      else if (c === 12) out += '\\f';
      else if (c === 11) out += '\\v';
      else if (c < 32 || c === 127) out += '\\' + c;
      else out += s.charAt(i);
    }
    return out + '"';
  }

  /** byte length of a JS string's UTF-8 form (#-of-string semantics) */
  function byteLen(s) { return strToBytes(s).length; }

  /** true when every char is ASCII (byte-wise == UTF-16-wise comparisons) */
  function isAscii(s) {
    for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) return false;
    return true;
  }

  // ------------------------------------------------------------- build state

  function Ctx(opts) {
    this.refs = opts.refs;
    this.tags = opts.tags || null;
    this.defaultLevel = opts.level || 'balanced';
    this.splitProb = opts.splitProb !== undefined ? opts.splitProb : 0.5;
    this.opaqueProb = opts.opaqueProb !== undefined ? opts.opaqueProb : 0.35;
    this.symNames = new Map();      // sym object -> emitted identifier
    this.symFn = new Map();         // sym object -> declaring FnIR
    this.fnOf = new Map();          // funcbody node -> FnIR
    this.nextSym = 0;
    this.globals = new Set();       // free identifiers that must never collide
    this.usedNames = new Set();
    this.stats = { folded: 0, propagated: 0, copies: 0, dropped: 0, spliced: 0, states: 0, regions: 0, opaque: 0, skipped: 0 };
    this.prefix = null;
  }

  Ctx.prototype.lname = function (sym) {
    var n = this.symNames.get(sym);
    if (n) return n;
    if (!this.prefix) this.prefix = this.pickPrefix();
    n = this.prefix + (this.nextSym++);
    this.usedNames.add(n);
    this.symNames.set(sym, n);
    return n;
  };

  Ctx.prototype.pickPrefix = function () {
    var cands = ['L', 'V', 'W', 'Kv', 'Zl', 'Qv'];
    for (var i = 0; i < cands.length; i++) {
      var p = cands[i], used = false;
      this.globals.forEach(function (g) { if (g.indexOf(p) === 0 && /^[0-9]+$/.test(g.slice(p.length))) used = true; });
      if (!used) return p;
    }
    return 'Xk';
  };

  Ctx.prototype.freshName = function (hint) {
    var base = hint || 'D', i = 0, n;
    do { n = base + '_' + (this.nextSym++); } while (this.usedNames.has(n) || this.globals.has(n));
    this.usedNames.add(n);
    return n;
  };

  // ------------------------------------------------------------------- build

  function FnIR(parent) {
    this.parent = parent || null;
    this.params = [];         // sym objects (may include synthetic self)
    this.isvararg = false;
    this.items = [];
    this.closures = [];       // nested FnIRs
    this.level = 'balanced';
    this.hasInterp = false;   // subtree contains expression interpolations
    this.captured = new Set(); // syms captured by nested closures
    this.reads = new Map();   // sym -> read count
    this.declSyms = new Set();
  }

  function collectGlobals(node, ctx) {
    // free identifiers that keep their source names in the emitted source
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) collectGlobals(node[i], ctx); return; }
    if (node.kind === 'name' && !node.sym) { ctx.globals.add(node.token.raw); return; }
    if (node.kind === 'funcstat' && node.parts.length === 1 && !node.isMethod) {
      // `function g()` with no local binding: prefix stays a global read
      if (!ctx.refs[node.parts[0].i]) ctx.globals.add(node.parts[0].raw);
    }
    if (node.kind === 'funcbody') {
      for (var p = 0; p < node.params.length; p++) if (node.params[p].name) ctx.globals.add(node.params[p].name.raw);
      // parameters are locals, not globals; adding their names above only
      // guards name-picking from reusing them (harmless conservatism)
    }
    for (var k in node) {
      if (k === 'sym' || k === 'token' || k === 'scope') continue;
      var v = node[k];
      if (v && typeof v === 'object') collectGlobals(v, ctx);
    }
  }

  function findInterp(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) if (findInterp(node[i])) return true; return false; }
    if (node.kind === 'const' && node.token && node.token.k === 'string' && node.token.parts) {
      for (var i = 0; i < node.token.parts.length; i++) if (node.token.parts[i].kind === 'expr') return true;
    }
    for (var k in node) {
      if (k === 'sym' || k === 'scope') continue;
      var v = node[k];
      if (v && typeof v === 'object' && findInterp(v)) return true;
    }
    return false;
  }

  /** Lower one statement AST into zero or one IR items. */
  Ctx.prototype.lowerStmt = function (s, fn) {
    switch (s.kind) {
      case 'local': {
        var syms = [];
        for (var i = 0; i < s.names.length; i++) {
          var sym = this.refs[s.names[i].i];
          if (sym) { syms.push(sym); this.symFn.set(sym, fn); fn.declSyms.add(sym); }
        }
        return { t: 'local', syms: syms, exps: s.values || null };
      }
      case 'assign':
        return { t: 'assign', targets: s.targets, values: s.values, op: s.op || '=' };
      case 'call': case 'methodcall':
        // statement calls arrive wrapped as {kind:'call', expr: <expnode>}
        return { t: 'expstat', e: s.expr ? s.expr : s };
      case 'localfunc':
        if (s.sym) { this.symFn.set(s.sym, fn); fn.declSyms.add(s.sym); }
        return { t: 'localfunc', sym: s.sym, body: s.body, assignOnly: false };
      case 'funcstat': {
        if (s.parts.length === 1 && !s.isMethod && this.refs[s.parts[0].i]) {
          var fsym = this.refs[s.parts[0].i];
          var fresh = !this.symFn.has(fsym);
          if (fresh) { this.symFn.set(fsym, fn); fn.declSyms.add(fsym); }
          return { t: 'localfunc', sym: fsym, body: s.body, assignOnly: !fresh };
        }
        return { t: 'funcstat', parts: s.parts, isMethod: s.isMethod, body: s.body };
      }
      case 'if': {
        var clauses = [];
        for (var c = 0; c < s.clauses.length; c++)
          clauses.push({ cond: s.clauses[c].cond, items: this.lowerBlock(s.clauses[c].block, fn) });
        return { t: 'if', clauses: clauses, elseItems: s.elseBlock ? this.lowerBlock(s.elseBlock, fn) : [] };
      }
      case 'while':
        return { t: 'while', cond: s.cond, items: this.lowerBlock(s.block, fn) };
      case 'do':
        return { t: 'do', items: this.lowerBlock(s.block, fn) };
      case 'numfor': {
        var fsym = s.sym || this.refs[s.names ? s.names[0].i : -1];
        if (fsym) { this.symFn.set(fsym, fn); fn.declSyms.add(fsym); }
        return { t: 'numfor', sym: fsym, start: s.start, limit: s.limit, step: s.step || null, items: this.lowerBlock(s.block, fn) };
      }
      case 'genfor': {
        var gs = [];
        for (var g = 0; g < s.names.length; g++) {
          var gsym = this.refs[s.names[g].i];
          if (gsym) { gs.push(gsym); this.symFn.set(gsym, fn); fn.declSyms.add(gsym); }
        }
        return { t: 'genfor', syms: gs, exps: s.exps, items: this.lowerBlock(s.block, fn) };
      }
      case 'repeat':
        return { t: 'repeat', items: this.lowerBlock(s.block, fn), cond: s.cond };
      case 'return':
        return { t: 'return', values: s.values || null };
      case 'break':
        return { t: 'break' };
      case 'continue':
        return { t: 'continue' };
      case 'typealias':
        return null;
      case 'block':
        return { t: 'do', items: this.lowerBlock(s, fn) };
      default:
        throw new Error('IR: unsupported statement kind ' + s.kind);
    }
  };

  Ctx.prototype.lowerBlock = function (block, fn) {
    var items = [];
    if (!block || !block.stats) return items;
    for (var i = 0; i < block.stats.length; i++) {
      var it = this.lowerStmt(block.stats[i], fn);
      if (!it) continue;
      if (it.t === 'do') {                    // transparent scope: splice in
        for (var d = 0; d < it.items.length; d++) items.push(it.items[d]);
      } else items.push(it);
    }
    return items;
  };

  function buildFn(body, parent, ctx, level) {
    var fn = new FnIR(parent);
    fn.level = level;
    if (!ctx.fnOf) ctx.fnOf = new Map();
    ctx.fnOf.set(body, fn);
    for (var p = 0; p < body.params.length; p++) {
      var pp = body.params[p];
      if (pp.sym) { fn.params.push(pp.sym); this2set(ctx, fn, pp.sym); }
      else if (pp.vararg) fn.isvararg = true;
    }
    if (body.isvararg) fn.isvararg = true;
    fn.items = ctx.lowerBlock(body.block, fn);
    ctx.stats.regions++;
    return fn;
  }
  function this2set(ctx, fn, sym) { ctx.symFn.set(sym, fn); fn.declSyms.add(sym); }

  /** Whole-program build. tags: Map(funcbody node -> level string). */
  function build(ast, ctx) {
    var root = new FnIR(null);
    root.isvararg = true;
    root.level = ctx.defaultLevel;
    root.items = ctx.lowerBlock(ast, root);
    ctx.stats.regions++;
    // walk for closures, interp strings, captures, reads
    linkClosures(root, ctx);
    return root;
  }

  function linkClosures(fn, ctx) {
    var vis = {
      funcbody: function (fb) {
        var lvl = (ctx.tags && ctx.tags.get(fb)) || fn.level;
        var kid = buildFn(fb, fn, ctx, lvl);
        fn.closures.push(kid);
        linkClosures(kid, ctx);
      },
      const: function (tok) {
        if (tok.k === 'string' && tok.parts) {
          for (var i = 0; i < tok.parts.length; i++) {
            if (tok.parts[i].kind === 'expr') {
              fn.hasInterp = true;
              walkExpr(tok.parts[i].ast, vis, ctx, 0);   // reads + captures inside interpolations
            }
          }
        }
      },
      name: function (sym) {
        if (!sym) return;
        fn.reads.set(sym, (fn.reads.get(sym) || 0) + 1);
        var owner = ctx.symFn.get(sym);
        if (owner && owner !== fn) owner.captured.add(sym);
      }
    };
    walkItems(fn.items, vis, ctx, 0);
    // nested closures keep their own counts; outer reads recorded above only
    // for syms the outer region itself references
  }

  // ------------------------------------------------------------- item walking

  /**
   * Depth-first walk of an item tree. Visitors:
   *   funcbody(fb)   - nested function bodies (closures)
   *   const(tok)     - const tokens (literals)
   *   name(sym|null) - variable reads AND bare-name assignment targets
   *   assign(sym)    - syms written by assignment/compound/loop machinery
   */
  function walkItems(items, v, ctx, depth) {
    if (depth > 200) return;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      switch (it.t) {
        case 'local':
          if (it.exps) for (var e = 0; e < it.exps.length; e++) walkExpr(it.exps[e], v, ctx, depth);
          break;
        case 'assign':
          for (var tg = 0; tg < it.targets.length; tg++) walkTarget(it.targets[tg], v, ctx, depth);
          for (var v2 = 0; v2 < it.values.length; v2++) walkExpr(it.values[v2], v, ctx, depth);
          break;
        case 'expstat': walkExpr(it.e, v, ctx, depth); break;
        case 'localfunc':
          if (v.name) v.name(it.sym);
          walkFnBody(it.body, v, ctx, depth);
          break;
        case 'funcstat':
          walkTarget({ kind: 'name', token: it.parts[0], sym: ctx.refs ? ctx.refs[it.parts[0].i] : null }, v, ctx, depth);
          for (var p = 1; p < it.parts.length; p++) { /* field keys need no resolution */ }
          walkFnBody(it.body, v, ctx, depth);
          break;
        case 'if':
          for (var c = 0; c < it.clauses.length; c++) {
            walkExpr(it.clauses[c].cond, v, ctx, depth);
            walkItems(it.clauses[c].items, v, ctx, depth + 1);
          }
          walkItems(it.elseItems, v, ctx, depth + 1);
          break;
        case 'while':
          walkExpr(it.cond, v, ctx, depth);
          walkItems(it.items, v, ctx, depth + 1);
          break;
        case 'do': walkItems(it.items, v, ctx, depth + 1); break;
        case 'numfor':
          walkExpr(it.start, v, ctx, depth);
          walkExpr(it.limit, v, ctx, depth);
          if (it.step) walkExpr(it.step, v, ctx, depth);
          if (v.assign && it.sym) v.assign(it.sym);
          walkItems(it.items, v, ctx, depth + 1);
          break;
        case 'genfor':
          for (var x = 0; x < it.exps.length; x++) walkExpr(it.exps[x], v, ctx, depth);
          if (v.assign) for (var s = 0; s < it.syms.length; s++) v.assign(it.syms[s]);
          walkItems(it.items, v, ctx, depth + 1);
          break;
        case 'repeat':
          walkItems(it.items, v, ctx, depth + 1);
          walkExpr(it.cond, v, ctx, depth);
          break;
        case 'return':
          if (it.values) for (var r = 0; r < it.values.length; r++) walkExpr(it.values[r], v, ctx, depth);
          break;
        // break/continue: nothing
      }
    }
  }

  function walkTarget(t, v, ctx, depth) {
    if (!t) return;
    if (t.kind === 'name') {
      if (v.name) v.name(t.sym || null);
      // bare-name target is a WRITE, not a read; visitors that count reads
      // get told via v.target so they can skip it
    } else if (t.kind === 'index') {
      walkExpr(t.obj, v, ctx, depth); // field key is a token
    } else if (t.kind === 'indexb') {
      walkExpr(t.obj, v, ctx, depth);
      walkExpr(t.key, v, ctx, depth);
    }
  }

  function walkFnBody(fb, v, ctx, depth) {
    // nested closure body: notify builders, then walk the AST block so outer
    // syms referenced inside count as reads/captures for the enclosing function
    if (v.funcbody) v.funcbody(fb);
    walkBlockAst(fb.block, v, ctx, depth);
  }

  function walkBlockAst(block, v, ctx, depth) {
    if (!block || !block.stats) return;
    for (var i = 0; i < block.stats.length; i++) walkAstStmt(block.stats[i], v, ctx, depth);
  }

  function walkAstStmt(s, v, ctx, depth) {
    if (!s) return;
    switch (s.kind) {
      case 'local':
        if (s.values) for (var i = 0; i < s.values.length; i++) walkExpr(s.values[i], v, ctx, depth);
        break;
      case 'assign':
        for (var t = 0; t < s.targets.length; t++) walkTarget(s.targets[t], v, ctx, depth);
        for (var v2 = 0; v2 < s.values.length; v2++) walkExpr(s.values[v2], v, ctx, depth);
        break;
      case 'call': case 'methodcall': walkExpr(s.expr ? s.expr : s, v, ctx, depth); break;
      case 'localfunc':
        walkFnBody(s.body, v, ctx, depth);
        break;
      case 'funcstat': walkFnBody(s.body, v, ctx, depth); break;
      case 'if':
        for (var c = 0; c < s.clauses.length; c++) { walkExpr(s.clauses[c].cond, v, ctx, depth); walkBlockAst(s.clauses[c].block, v, ctx, depth + 1); }
        if (s.elseBlock) walkBlockAst(s.elseBlock, v, ctx, depth + 1);
        break;
      case 'while': walkExpr(s.cond, v, ctx, depth); walkBlockAst(s.block, v, ctx, depth + 1); break;
      case 'do': walkBlockAst(s.block, v, ctx, depth + 1); break;
      case 'numfor':
        walkExpr(s.start, v, ctx, depth); walkExpr(s.limit, v, ctx, depth);
        if (s.step) walkExpr(s.step, v, ctx, depth);
        walkBlockAst(s.block, v, ctx, depth + 1);
        break;
      case 'genfor':
        for (var e = 0; e < s.exps.length; e++) walkExpr(s.exps[e], v, ctx, depth);
        walkBlockAst(s.block, v, ctx, depth + 1);
        break;
      case 'repeat': walkBlockAst(s.block, v, ctx, depth + 1); walkExpr(s.cond, v, ctx, depth); break;
      case 'return': if (s.values) for (var r = 0; r < s.values.length; r++) walkExpr(s.values[r], v, ctx, depth); break;
      case 'typealias': case 'break': case 'continue': case 'block': break;
    }
  }

  function walkExpr(e, v, ctx, depth) {
    if (!e || typeof e !== 'object' || depth > 200) return;
    if (!e.kind) return;   // raw token (e.g. call-sugar string args)
    switch (e.kind) {
      case 'const': if (v.const) v.const(e.token); break;
      case 'name': if (v.name) v.name(e.sym || null); break;
      case 'vararg': case 'cast': break;
      case 'paren': walkExpr(e.e, v, ctx, depth + 1); break;
      case 'bin': walkExpr(e.l, v, ctx, depth + 1); walkExpr(e.r, v, ctx, depth + 1); break;
      case 'un': walkExpr(e.e, v, ctx, depth + 1); break;
      case 'index': walkExpr(e.obj, v, ctx, depth + 1); break;
      case 'indexb': walkExpr(e.obj, v, ctx, depth + 1); walkExpr(e.key, v, ctx, depth + 1); break;
      case 'call': walkExpr(e.fn, v, ctx, depth + 1); for (var a = 0; a < e.args.length; a++) walkExpr(e.args[a], v, ctx, depth + 1); break;
      case 'methodcall': walkExpr(e.obj, v, ctx, depth + 1); for (var b = 0; b < e.args.length; b++) walkExpr(e.args[b], v, ctx, depth + 1); break;
      case 'table':
        for (var f = 0; f < e.fields.length; f++) {
          var fd = e.fields[f];
          if (fd.kind === 'kv') walkExpr(fd.key, v, ctx, depth + 1);
          walkExpr(fd.value, v, ctx, depth + 1);
        }
        break;
      case 'funcexpr': walkFnBody(e.body, v, ctx, depth + 1); break;
      case 'ifexpr':
        for (var c2 = 0; c2 < e.clauses.length; c2++) { walkExpr(e.clauses[c2].cond, v, ctx, depth + 1); walkExpr(e.clauses[c2].exp, v, ctx, depth + 1); }
        walkExpr(e.elseExp, v, ctx, depth + 1);
        break;
    }
  }

  // -------------------------------------------------------------- folding

  function constNum(e) {
    if (!e || e.kind !== 'const' || e.token.k !== 'number') return undefined;
    var v = e.token.v;
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^[-+]?[0-9.eE]+$/.test(v)) { var n = Number(v); return Number.isNaN(n) ? undefined : n; }
    return undefined;
  }
  function constStr(e) {
    if (!e || e.kind !== 'const' || e.token.k !== 'string' || e.token.parts) return undefined;
    return typeof e.token.v === 'string' ? e.token.v : undefined;
  }
  function constKw(e) { // 'nil' | 'true' | 'false' | undefined
    if (!e || e.kind !== 'const' || e.token.k !== 'keyword') return undefined;
    return e.token.v;
  }
  function truthyOf(e) { // JS true/false/undefined (unknown)
    var kw = constKw(e);
    if (kw === 'nil' || kw === 'false') return false;
    if (kw === 'true') return true;
    if (constNum(e) !== undefined) return true;
    if (constStr(e) !== undefined) return true;
    return undefined;
  }
  function mkNum(n) { return { kind: 'const', token: { k: 'number', v: n, raw: numText(n), i: -1, ln: 0, col: 0, e: -1 } }; }
  function mkStr(s) { return { kind: 'const', token: { k: 'string', v: s, raw: quoteLua(s), i: -1, ln: 0, col: 0, e: -1 } }; }
  function mkBool(b) { return { kind: 'const', token: { k: 'keyword', v: b ? 'true' : 'false', raw: b ? 'true' : 'false', i: -1, ln: 0, col: 0, e: -1 } }; }

  function foldExpr(e, ctx) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return e;
    if (!e.kind) return e;   // raw token arg: leave verbatim
    switch (e.kind) {
      case 'const': return e;
      case 'paren': {
        var ie = foldExpr(e.e, ctx);
        if (ie !== e.e) return { kind: 'paren', e: ie };
        return e;
      }
      case 'cast': {
        var ce = foldExpr(e.e, ctx);
        return ce !== e.e ? { kind: 'cast', e: ce } : e;
      }
      case 'un': {
        var x = foldExpr(e.e, ctx);
        if (x !== e.e) e = { kind: 'un', op: e.op, e: x };
        var nx = constNum(x), sx = constStr(x);
        if (e.op === '-' && nx !== undefined) { ctx.stats.folded++; return mkNum(-nx); }
        if (e.op === '#' && sx !== undefined && isAscii(sx)) { ctx.stats.folded++; return mkNum(byteLen(sx)); }
        if (e.op === 'not') {
          var tv = truthyOf(x);
          if (tv !== undefined) { ctx.stats.folded++; return mkBool(!tv); }
        }
        return e;
      }
      case 'bin': {
        var l = foldExpr(e.l, ctx), r = foldExpr(e.r, ctx);
        if (l !== e.l || r !== e.r) e = { kind: 'bin', op: e.op, l: l, r: r };
        if (e.op === 'and' || e.op === 'or') {
          var lt = truthyOf(e.l);
          if (lt !== undefined) {
            ctx.stats.folded++;
            return (lo0(e.op, lt)) ? e.l : e.r;
          }
          return e;
        }
        var a = constNum(e.l), b2 = constNum(e.r);
        if (a !== undefined && b2 !== undefined) {
          var v3;
          switch (e.op) {
            case '+': v3 = a + b2; break;
            case '-': v3 = a - b2; break;
            case '*': v3 = a * b2; break;
            case '/': if (b2 === 0) return e; v3 = a / b2; break;
            case '//': if (b2 === 0) return e; v3 = Math.floor(a / b2); break;
            case '%': if (b2 === 0) return e; v3 = a - Math.floor(a / b2) * b2; break;
            case '^': if ((a < 0 && !Number.isInteger(b2)) || a === 0 && b2 < 0) return e; v3 = Math.pow(a, b2); break;
            case '==': ctx.stats.folded++; return mkBool(a === b2);
            case '~=': ctx.stats.folded++; return mkBool(a !== b2);
            case '<': ctx.stats.folded++; return mkBool(a < b2);
            case '<=': ctx.stats.folded++; return mkBool(a <= b2);
            case '>': ctx.stats.folded++; return mkBool(a > b2);
            case '>=': ctx.stats.folded++; return mkBool(a >= b2);
            case '..': if (Number.isInteger(a) && Math.abs(a) < 1e15) { ctx.stats.folded++; return mkStr(numText(a) + numText(b2)); } return e;
            default: return e;
          }
          if (Number.isNaN(v3) || isFinite(v3)) { ctx.stats.folded++; return mkNum(v3); }
          return e;
        }
        var as2 = constStr(e.l), bs2 = constStr(e.r);
        if (as2 !== undefined && bs2 !== undefined) {
          if (e.op === '..') { ctx.stats.folded++; return mkStr(as2 + bs2); }
          if (isAscii(as2) && isAscii(bs2)) {
            switch (e.op) {
              case '==': ctx.stats.folded++; return mkBool(as2 === bs2);
              case '~=': ctx.stats.folded++; return mkBool(as2 !== bs2);
              case '<': ctx.stats.folded++; return mkBool(as2 < bs2);
              case '<=': ctx.stats.folded++; return mkBool(as2 <= bs2);
              case '>': ctx.stats.folded++; return mkBool(as2 > bs2);
              case '>=': ctx.stats.folded++; return mkBool(as2 >= bs2);
            }
          }
          return e;
        }
        // mixed number/string comparisons are type mismatches, never equal
        if ((e.op === '==' || e.op === '~=') &&
            ((a !== undefined && bs2 !== undefined) || (as2 !== undefined && b2 !== undefined))) {
          ctx.stats.folded++; return mkBool(e.op === '~='); 
        }
        return e;
      }
      case 'table': {
        var flds = [], ch = false;
        for (var f = 0; f < e.fields.length; f++) {
          var fd = e.fields[f];
          var nk = fd.kind === 'kv' ? foldExpr(fd.key, ctx) : fd.key;
          var nv = foldExpr(fd.value, ctx);
          if (nk !== fd.key || nv !== fd.value) ch = true;
          flds.push({ kind: fd.kind, key: nk, value: nv });
        }
        return ch ? { kind: 'table', fields: flds } : e;
      }
      case 'index': {
        var o2 = foldExpr(e.obj, ctx);
        return o2 !== e.obj ? { kind: 'index', obj: o2, key: e.key } : e;
      }
      case 'indexb': {
        var o3 = foldExpr(e.obj, ctx), k3 = foldExpr(e.key, ctx);
        if (o3 !== e.obj || k3 !== e.key) return { kind: 'indexb', obj: o3, key: k3 };
        return e;
      }
      case 'call': {
        var fn2 = foldExpr(e.fn, ctx), args2 = [], ch2 = false;
        for (var a2 = 0; a2 < e.args.length; a2++) { var na = foldExpr(e.args[a2], ctx); if (na !== e.args[a2]) ch2 = true; args2.push(na); }
        if (fn2 !== e.fn || ch2) return { kind: 'call', fn: fn2, args: args2 };
        return e;
      }
      case 'methodcall': {
        var mo = foldExpr(e.obj, ctx), margs = [], ch3 = false;
        for (var a3 = 0; a3 < e.args.length; a3++) { var na2 = foldExpr(e.args[a3], ctx); if (na2 !== e.args[a3]) ch3 = true; margs.push(na2); }
        if (mo !== e.obj || ch3) return { kind: 'methodcall', obj: mo, name: e.name, args: margs };
        return e;
      }
      case 'ifexpr': {
        for (var i2 = 0; i2 < e.clauses.length; i2++) {
          var c3 = foldExpr(e.clauses[i2].cond, ctx), x3 = foldExpr(e.clauses[i2].exp, ctx);
          var tv3 = truthyOf(c3);
          if (tv3 !== undefined) { ctx.stats.folded++; return tv3 ? x3 : foldExpr(e.elseExp, ctx); }
        }
        var ee2 = foldExpr(e.elseExp, ctx);
        if (ee2 !== e.elseExp) return { kind: 'ifexpr', clauses: e.clauses, elseExp: ee2 };
        return e;
      }
      // funcexpr: its own pass handles closure bodies; keep node as-is
      default: return e;
    }
  }
  function lo0(op, lt) { return op === 'and' ? !lt : lt; }

  function foldItemExprs(items, ctx) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      switch (it.t) {
        case 'local': if (it.exps) for (var e = 0; e < it.exps.length; e++) it.exps[e] = foldExpr(it.exps[e], ctx); break;
        case 'assign':
          for (var tg = 0; tg < it.targets.length; tg++) {
            var t = it.targets[tg];
            if (t.kind === 'indexb') { t.obj = foldExpr(t.obj, ctx); t.key = foldExpr(t.key, ctx); }
            else if (t.kind === 'index') t.obj = foldExpr(t.obj, ctx);
          }
          for (var v2 = 0; v2 < it.values.length; v2++) it.values[v2] = foldExpr(it.values[v2], ctx);
          break;
        case 'expstat': it.e = foldExpr(it.e, ctx); break;
        case 'if':
          for (var c = 0; c < it.clauses.length; c++) {
            it.clauses[c].cond = foldExpr(it.clauses[c].cond, ctx);
            foldItemExprs(it.clauses[c].items, ctx);
          }
          foldItemExprs(it.elseItems, ctx);
          break;
        case 'while': it.cond = foldExpr(it.cond, ctx); foldItemExprs(it.items, ctx); break;
        case 'do': foldItemExprs(it.items, ctx); break;
        case 'numfor':
          it.start = foldExpr(it.start, ctx); it.limit = foldExpr(it.limit, ctx);
          if (it.step) it.step = foldExpr(it.step, ctx);
          foldItemExprs(it.items, ctx); break;
        case 'genfor':
          for (var x = 0; x < it.exps.length; x++) it.exps[x] = foldExpr(it.exps[x], ctx);
          foldItemExprs(it.items, ctx); break;
        case 'repeat': foldItemExprs(it.items, ctx); it.cond = foldExpr(it.cond, ctx); break;
        case 'return': if (it.values) for (var r = 0; r < it.values.length; r++) it.values[r] = foldExpr(it.values[r], ctx); break;
      }
    }
  }

  // ------------------------------------------- propagation + copy propagation

  function isMultiVal(e) { return e.kind === 'call' || e.kind === 'methodcall' || e.kind === 'vararg'; }

  function isLiteralNode(e) {
    if (!e || e.kind !== 'const') return false;
    return e.token.k === 'number' || e.token.k === 'string' || e.token.k === 'keyword';
  }

  function cloneNode(n) { return JSON.parse(JSON.stringify(n)); }

  /** Replace name reads in an expression tree with propagated literals/copies. */
  function substExpr(e, prop, ctx, allowClosure) {
    if (!e || typeof e !== 'object' || !e.kind) return;
    switch (e.kind) {
      case 'name':
        if (e.sym && prop.has(e.sym)) {
          ctx.stats.propagated++;
          return prop.get(e.sym); // caller replaces
        }
        return null;
      case 'paren': { var r = substExpr(e.e, prop, ctx); if (r) e.e = r; return null; }
      case 'cast': { var r2 = substExpr(e.e, prop, ctx); if (r2) e.e = r2; return null; }
      case 'un': { var r3 = substExpr(e.e, prop, ctx); if (r3) e.e = r3; return null; }
      case 'bin': {
        var rl = substExpr(e.l, prop, ctx); if (rl) e.l = rl;
        var rr = substExpr(e.r, prop, ctx); if (rr) e.r = rr;
        return null;
      }
      case 'index': { var ro = substExpr(e.obj, prop, ctx); if (ro) e.obj = ro; return null; }
      case 'indexb': {
        var ro2 = substExpr(e.obj, prop, ctx); if (ro2) e.obj = ro2;
        var rk2 = substExpr(e.key, prop, ctx); if (rk2) e.key = rk2;
        return null;
      }
      case 'call': {
        var rf = substExpr(e.fn, prop, ctx); if (rf) e.fn = rf;
        for (var a = 0; a < e.args.length; a++) { var ra = substExpr(e.args[a], prop, ctx); if (ra) e.args[a] = ra; }
        return null;
      }
      case 'methodcall': {
        var rm = substExpr(e.obj, prop, ctx); if (rm) e.obj = rm;
        for (var b = 0; b < e.args.length; b++) { var rb = substExpr(e.args[b], prop, ctx); if (rb) e.args[b] = rb; }
        return null;
      }
      case 'table':
        for (var f = 0; f < e.fields.length; f++) {
          var fd = e.fields[f];
          if (fd.kind === 'kv') { var rk3 = substExpr(fd.key, prop, ctx); if (rk3) fd.key = rk3; }
          var rv = substExpr(fd.value, prop, ctx); if (rv) fd.value = rv;
        }
        return null;
      case 'ifexpr':
        for (var c = 0; c < e.clauses.length; c++) {
          var rc = substExpr(e.clauses[c].cond, prop, ctx); if (rc) e.clauses[c].cond = rc;
          var re2 = substExpr(e.clauses[c].exp, prop, ctx); if (re2) e.clauses[c].exp = re2;
        }
        var re3 = substExpr(e.elseExp, prop, ctx); if (re3) e.elseExp = re3;
        return null;
      // funcexpr: closure bodies keep their own scope; never substitute there
      default: return null;
    }
  }

  function substItem(it, prop, ctx) {
    switch (it.t) {
      case 'local':
        if (it.exps) for (var e = 0; e < it.exps.length; e++) { var r = substExpr(it.exps[e], prop, ctx); if (r) it.exps[e] = r; }
        break;
      case 'assign':
        for (var tg = 0; tg < it.targets.length; tg++) {
          var t = it.targets[tg];
          if (t.kind === 'name') continue;              // write site, keep
          if (t.kind === 'index') { var ro = substExpr(t.obj, prop, ctx); if (ro) t.obj = ro; }
          else if (t.kind === 'indexb') {
            var ro2 = substExpr(t.obj, prop, ctx); if (ro2) t.obj = ro2;
            var rk = substExpr(t.key, prop, ctx); if (rk) t.key = rk;
          }
        }
        for (var v = 0; v < it.values.length; v++) { var rv = substExpr(it.values[v], prop, ctx); if (rv) it.values[v] = rv; }
        break;
      case 'expstat': { var re = substExpr(it.e, prop, ctx); if (re) it.e = re; break; }
      case 'if':
        for (var c = 0; c < it.clauses.length; c++) {
          var rc2 = substExpr(it.clauses[c].cond, prop, ctx); if (rc2) it.clauses[c].cond = rc2;
          substSlice(it.clauses[c].items, new Map(prop), ctx);
        }
        substSlice(it.elseItems, new Map(prop), ctx);
        break;
      case 'while': {
        // the condition re-runs after every body pass: only syms the body
        // never writes may be substituted into it
        var wrote3 = collectWrites(it.items, new Set());
        var prop3 = new Map(prop);
        wrote3.forEach(function (s5) { prop3.delete(s5); });
        var rw = substExpr(it.cond, prop3, ctx); if (rw) it.cond = rw;
        break;
      }
      case 'do': break;
      case 'numfor':
        // loop init/limit/step run once at this exact point: propagate into them
        var rs = substExpr(it.start, prop, ctx); if (rs) it.start = rs;
        var rl = substExpr(it.limit, prop, ctx); if (rl) it.limit = rl;
        if (it.step) { var rp = substExpr(it.step, prop, ctx); if (rp) it.step = rp; }
        break;
      case 'genfor':
        for (var x = 0; x < it.exps.length; x++) { var rx = substExpr(it.exps[x], prop, ctx); if (rx) it.exps[x] = rx; }
        break;
      case 'repeat':
        // until re-runs after every body pass: same invariant rule as while;
        // the body itself runs before it, so it must NOT see the outer map
        var wrote4 = collectWrites(it.items, new Set());
        var prop4 = new Map(prop);
        wrote4.forEach(function (s6) { prop4.delete(s6); });
        var rc3 = substExpr(it.cond, prop4, ctx); if (rc3) it.cond = rc3;
        break;
      case 'return':
        if (it.values) for (var r2 = 0; r2 < it.values.length; r2++) { var rv2 = substExpr(it.values[r2], prop, ctx); if (rv2) it.values[r2] = rv2; }
        break;
    }
  }
  function substSlice(items, prop, ctx) {
    // nested constructs inside a slice get substitution too, with the same
    // map (entries were validated for this flow position)
    for (var i = 0; i < items.length; i++) substItem(items[i], prop, ctx);
  }

  /** syms written anywhere inside an item list (including nested constructs) */
  function collectWrites(items, set, ctx) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      switch (it.t) {
        case 'local': for (var n = 0; n < it.syms.length; n++) set.add(it.syms[n]); break;
        case 'assign':
          for (var tg = 0; tg < it.targets.length; tg++) {
            var t = it.targets[tg];
            if (t.kind === 'name' && t.sym) set.add(t.sym);
          }
          break;
        case 'localfunc': if (it.sym) set.add(it.sym); break;
        case 'numfor':
          if (it.sym) set.add(it.sym);
          collectWrites(it.items, set, ctx);
          break;
        case 'genfor':
          for (var s = 0; s < it.syms.length; s++) set.add(it.syms[s]);
          collectWrites(it.items, set, ctx);
          break;
        case 'if':
          for (var c = 0; c < it.clauses.length; c++) collectWrites(it.clauses[c].items, set, ctx);
          collectWrites(it.elseItems, set, ctx);
          break;
        case 'while': case 'do': collectWrites(it.items, set, ctx); break;
        case 'repeat': collectWrites(it.items, set, ctx); break;
      }
    }
    return set;
  }

  function propagateSlice(items, ctx) {
    var prop = new Map();
    var fn = arguments[2] || null;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      substItem(it, prop, ctx);
      // update the map from this item's writes
      switch (it.t) {
        case 'local': {
          var ok = true;
          if (it.exps && it.exps.length) {
            for (var e = 0; e < it.exps.length; e++) {
              if (!isLiteralNode(it.exps[e]) && (e < it.exps.length - 1 || it.exps.length === it.syms.length)) { if (!isLiteralNode(it.exps[e])) ok = false; }
            }
            // simple rule: every name must have a literal initializer, padded
            // or not, and none of the values may be multi-value
            if (ok) {
              for (var n2 = 0; n2 < it.syms.length; n2++) {
                var val = n2 < it.exps.length ? it.exps[n2] : null;
                if (val && isMultiVal(val)) { ok = false; break; }
                if (val && !isLiteralNode(val)) { ok = false; break; }
              }
            }
          } else if (it.exps === null) {
            for (var n3 = 0; n3 < it.syms.length; n3++) prop.set(it.syms[n3], { kind: 'const', token: { k: 'keyword', v: 'nil', raw: 'nil', i: -1, ln: 0, col: 0, e: -1 } });
            ok = false; // already set
          } else ok = false;
          if (ok && it.exps) {
            for (var n4 = 0; n4 < it.syms.length; n4++) {
              var sym4 = it.syms[n4], val4 = n4 < it.exps.length ? it.exps[n4] : mkNilNode();
              if (val4 && isLiteralNode(val4) && !fn.captured.has(sym4)) prop.set(sym4, val4);
              else prop.delete(sym4);
            }
          } else if (it.exps) {
            for (var n5 = 0; n5 < it.syms.length; n5++) prop.delete(it.syms[n5]);
          }
          break;
        }
        case 'assign': {
          // pairwise target/value; only bare-name targets of literal values
          // are tracked, and only when no value in the list is multi-value
          // (a trailing call fans out across the remaining targets)
          var multi = false;
          for (var v3 = 0; v3 < it.values.length; v3++) if (isMultiVal(it.values[v3])) multi = true;
          for (var t2 = 0; t2 < it.targets.length; t2++) {
            var tg2 = it.targets[t2];
            if (tg2.kind !== 'name' || !tg2.sym) continue;
            var sym5 = tg2.sym;
            if (it.op !== '=') { prop.delete(sym5); continue; }
            var val5 = t2 < it.values.length ? it.values[t2] : null;
            if (val5 && isLiteralNode(val5) && !multi && !fn.captured.has(sym5)) prop.set(sym5, val5);
            else prop.delete(sym5);
          }
          break;
        }
        case 'expstat': case 'return': break;
        case 'localfunc': if (it.sym) prop.delete(it.sym); break;
        case 'funcstat': break;
        case 'if': {
          var wrote = new Set();
          for (var c2 = 0; c2 < it.clauses.length; c2++) collectWrites(it.clauses[c2].items, wrote, ctx);
          collectWrites(it.elseItems, wrote, ctx);
          wrote.forEach(function (s2) { prop.delete(s2); });
          break;
        }
        case 'while': case 'numfor': case 'genfor': case 'repeat': case 'do': {
          var wrote2 = new Set();
          collectWrites(it.t === 'do' ? it.items : (it.items || []), wrote2, ctx);
          if (it.t === 'numfor' && it.sym) wrote2.add(it.sym);
          if (it.t === 'genfor') for (var s3 = 0; s3 < it.syms.length; s3++) wrote2.add(it.syms[s3]);
          wrote2.forEach(function (s4) { prop.delete(s4); });
          break;
        }
      }
    }
  }

  function mkNilNode() { return { kind: 'const', token: { k: 'keyword', v: 'nil', raw: 'nil', i: -1, ln: 0, col: 0, e: -1 } }; }

  /** run propagation over a whole item tree, slice by slice */
  function propagateTree(items, ctx, fn) {
    propagateSlice(items, ctx, fn);
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'if') {
        for (var c = 0; c < it.clauses.length; c++) propagateTree(it.clauses[c].items, ctx, fn);
        propagateTree(it.elseItems, ctx, fn);
      } else if (it.t === 'while' || it.t === 'do' || it.t === 'numfor' || it.t === 'genfor' || it.t === 'repeat') {
        propagateTree(it.items, ctx, fn);
      }
    }
  }

  // ----------------------------------------------------------------- splicing

  /** splice literal-condition if-items and drop dead code after returns */
  function spliceItems(items, ctx) {
    var out = [], i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.t === 'if') {
        var cls = it.clauses, cut = 0, taken2 = null;
        // walk leading clauses; only literal conditions may decide, and an
        // unknown cond anywhere before a literal one blocks the splice
        while (cut < cls.length) {
          var tv2 = truthyOf(cls[cut].cond);
          if (tv2 === false) { cut++; continue; }
          if (tv2 === true) {
            ctx.stats.spliced++;
            taken2 = spliceItems(cls[cut].items, ctx);
          }
          break;
        }
        if (taken2) {
          for (var k3 = 0; k3 < taken2.length; k3++) out.push(taken2[k3]);
          continue;
        }
        if (cut > 0) {
          // leading literal-false clauses dropped; keep the remainder
          ctx.stats.spliced++;
          var rest2 = cls.slice(cut);
          if (!rest2.length) {
            var sp2 = spliceItems(it.elseItems, ctx);
            for (var k4 = 0; k4 < sp2.length; k4++) out.push(sp2[k4]);
            continue;
          }
          out.push({ t: 'if', clauses: rest2, elseItems: it.elseItems });
          continue;
        }
        out.push(it);
        continue;
      }
      if (it.t === 'return' || it.t === 'break') {
        out.push(it);
        // everything after return/break in the same run is unreachable
        for (var d = i + 1; d < items.length; d++) ctx.stats.dropped++;
        break;
      }
      out.push(it);
    }
    return out;
  }

  // ---------------------------------------------------------------------- DCE

  function isPureExpr(e) {
    if (!e) return true;
    switch (e.kind) {
      case 'const': case 'name': return true;
      case 'paren': case 'cast': return isPureExpr(e.e);
      case 'bin': return isPureExpr(e.l) && isPureExpr(e.r);
      case 'un': return isPureExpr(e.e);
      default: return false;   // calls, indexing, tables, closures: conservative
    }
  }

  function recountFn(fn, ctx) {
    fn.reads = new Map();
    var vis = {
      name: function (sym) {
        if (sym) fn.reads.set(sym, (fn.reads.get(sym) || 0) + 1);
        var owner = sym ? ctx.symFn.get(sym) : null;
        if (owner && owner !== fn) owner.captured.add(sym);
      },
      const: function (tok) {
        if (tok && tok.k === 'string' && tok.parts) {
          for (var i = 0; i < tok.parts.length; i++) if (tok.parts[i].kind === 'expr') walkExpr(tok.parts[i].ast, vis, ctx, 0);
        }
      },
      funcbody: function () {}   // nested closure bodies recount themselves
    };
    walkItems(fn.items, vis, ctx, 0);
  }

  function itemOwnReads(it, set) {
    // reads of syms in `set` that happen inside this one item's expressions
    var found = new Map();
    var bump = function (sym) { if (sym && set.has(sym)) found.set(sym, (found.get(sym) || 0) + 1); };
    var vv = {
      name: bump,
      const: function (tok) {
        if (tok && tok.k === 'string' && tok.parts) {
          for (var ip = 0; ip < tok.parts.length; ip++) if (tok.parts[ip].kind === 'expr') walkExpr(tok.parts[ip].ast, vv, null, 0);
        }
      },
      funcbody: function () {}
    };
    switch (it.t) {
      case 'local': if (it.exps) for (var e = 0; e < it.exps.length; e++) walkExpr(it.exps[e], vv, null, 0); break;
      case 'assign':
        for (var tg = 0; tg < it.targets.length; tg++) {
          var t = it.targets[tg];
          if (t.kind === 'name') { if (it.op !== '=') bump(t.sym); continue; }  // compound reads
          walkTarget(t, vv, null, 0);
        }
        for (var v2 = 0; v2 < it.values.length; v2++) walkExpr(it.values[v2], vv, null, 0);
        break;
      case 'expstat': walkExpr(it.e, vv, null, 0); break;
    }
    return found;
  }

  function dceTree(items, fn, ctx) {
    var out = [], i, it;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      // recurse into nested constructs first
      if (it.t === 'if') {
        for (var c = 0; c < it.clauses.length; c++) it.clauses[c].items = dceTree(it.clauses[c].items, fn, ctx);
        it.elseItems = dceTree(it.elseItems, fn, ctx);
      } else if (it.t === 'while' || it.t === 'do' || it.t === 'numfor' || it.t === 'genfor' || it.t === 'repeat') {
        it.items = dceTree(it.items, fn, ctx);
      }
      var drop = false;
      if (it.t === 'local' || it.t === 'assign') {
        var syms = it.t === 'local' ? it.syms : bareTargets(it);
        if (syms.length) {
          var allDead = true, anyCaptured = false, j, s2;
          for (j = 0; j < syms.length; j++) {
            s2 = syms[j];
            if (!s2) { allDead = false; break; }
            if (fn.captured.has(s2)) { anyCaptured = true; break; }
            var total = fn.reads.get(s2) || 0;
            var own = itemOwnReads(it, new Set([s2])).get(s2) || 0;
            if (total - own > 0) { allDead = false; break; }
          }
          if (allDead && !anyCaptured) {
            if (it.t === 'local') {
              if (!it.exps || !it.exps.length) drop = true;                    // bare decl
              else {
                var pure = true;
                for (var e2 = 0; e2 < it.exps.length; e2++) if (!isPureExpr(it.exps[e2])) { pure = false; break; }
                if (pure) drop = true;
                else if (it.exps.length === 1 && (it.exps[0].kind === 'call' || it.exps[0].kind === 'methodcall')) {
                  // keep the side effect, drop the dead bindings
                  out.push({ t: 'expstat', e: it.exps[0] });
                  drop = true;
                }
              }
            } else {
              // bare-name assignment to a never-read, uncaptured local
              var pure2 = true;
              for (var v3 = 0; v3 < it.values.length; v3++) if (!isPureExpr(it.values[v3])) { pure2 = false; break; }
              if (pure2 && it.op === '=') drop = true;
            }
          }
        }
      }
      if (drop) ctx.stats.dropped++;
      else out.push(it);
    }
    return out;
  }

  function bareTargets(it) {
    var r = [];
    for (var i = 0; i < it.targets.length; i++)
      if (it.targets[i].kind === 'name' && it.op === '=') r.push(it.targets[i].sym || null);
      else if (it.targets[i].kind === 'name') r.push(null); // compound: never dropped
    return r;
  }

  // ---------------------------------------------------------------- emission

  function atomicExpr(e) {
    return e.kind === 'name' || e.kind === 'index' || e.kind === 'indexb' ||
      e.kind === 'call' || e.kind === 'methodcall' || e.kind === 'vararg';
  }

  function objToLua(e, ctx) {
    var s = exprToLua(e, ctx);
    if (atomicExpr(e)) {
      if (e.kind === 'const' && e.token.k !== 'string') return '(' + s + ')';  // 1.x would lex wrong
      return s;
    }
    return '(' + s + ')';
  }

  function fnToLua(e, ctx) {
    if (e.kind === 'name' || e.kind === 'index' || e.kind === 'indexb' ||
        e.kind === 'call' || e.kind === 'methodcall') return exprToLua(e, ctx);
    return '(' + exprToLua(e, ctx) + ')';
  }

  function argList(args, ctx) {
    var out = [];
    for (var i = 0; i < args.length; i++) out.push(exprToLua(args[i], ctx));
    return '(' + out.join(',') + ')';
  }

  function valsToLua(vals, ctx) {
    var out = [];
    for (var i = 0; i < vals.length; i++) out.push(exprToLua(vals[i], ctx));
    return out.join(',');
  }

  function escapeInterpLit(s) {
    var out = '', i, ch, c;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i); c = s.charCodeAt(i);
      if (ch === '\\') out += '\\\\';
      else if (ch === '{') out += '\\{';
      else if (ch === '}') out += '\\}';
      else if (ch === '`') out += '\\`';
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (ch === '"') out += '\\"';
      else if (ch === "'") out += "\\'";
      else if (c === 7) out += '\\a';
      else if (c === 8) out += '\\b';
      else if (c === 12) out += '\\f';
      else if (c === 11) out += '\\v';
      else if (c < 32 || c === 127) out += '\\' + c;
      else out += ch;
    }
    return out;
  }

  function interpToLua(tk, ctx) {
    var out = '`', i, p;
    for (i = 0; i < tk.parts.length; i++) {
      p = tk.parts[i];
      if (p.kind === 'lit') {
        var s = p.bytes ? bytesToStr(p.bytes) : (p.text !== undefined ? p.text : (p.v === undefined ? '' : String(p.v)));
        out += escapeInterpLit(s);
      } else {
        out += '{' + exprToLua(p.ast, ctx) + '}';
      }
    }
    return out + '`';
  }

  function exprToLua(e, ctx) {
    if (!e.kind && e.k) return e.raw;   // raw token (call-sugar string arg)
    switch (e.kind) {
      case 'const': {
        var tk = e.token;
        if (tk.k === 'string' && tk.parts) return interpToLua(tk, ctx);
        return tk.raw !== undefined && tk.raw !== null ? tk.raw : String(tk.v);
      }
      case 'name': return e.sym ? ctx.lname(e.sym) : (e.token.raw || e.token.v);
      case 'vararg': return '...';
      case 'paren': return '(' + exprToLua(e.e, ctx) + ')';
      case 'cast': return exprToLua(e.e, ctx);
      case 'un': {
        var inner = exprToLua(e.e, ctx);
        if (e.op === 'not') return atomicExpr(e.e) ? 'not ' + inner : 'not (' + inner + ')';
        if (atomicExpr(e.e)) {
          if (e.e.kind === 'const' && e.e.token.k === 'number' && inner.charAt(0) === '-') return e.op + '(' + inner + ')';
          return e.op + inner;
        }
        return e.op + '(' + inner + ')';
      }
      case 'bin': return '(' + exprToLua(e.l, ctx) + ' ' + e.op + ' ' + exprToLua(e.r, ctx) + ')';
      case 'index': return objToLua(e.obj, ctx) + '.' + e.key.raw;
      case 'indexb': return objToLua(e.obj, ctx) + '[' + exprToLua(e.key, ctx) + ']';
      case 'methodcall': return objToLua(e.obj, ctx) + ':' + e.name.raw + argList(e.args, ctx);
      case 'call': return fnToLua(e.fn, ctx) + argList(e.args, ctx);
      case 'table': {
        var parts = [];
        for (var f = 0; f < e.fields.length; f++) {
          var fd = e.fields[f];
          if (fd.kind === 'kv') parts.push('[' + exprToLua(fd.key, ctx) + ']=' + exprToLua(fd.value, ctx));
          else if (fd.kind === 'name') parts.push(fd.key.raw + '=' + exprToLua(fd.value, ctx));
          else parts.push(exprToLua(fd.value, ctx));
        }
        return '{' + parts.join(',') + '}';
      }
      case 'funcexpr': {
        var kid = ctx.fnOf.get(e.body);
        if (!kid) throw new Error('IR: closure not lowered');
        return 'function(' + paramsToLua(e.body, ctx) + ')' + '\n' + emitRegionStr(kid.items, kid.level, ctx, rngOf(ctx), '\t', false) + '\nend';
      }
      case 'ifexpr': {
        var out2 = 'if ';
        for (var c = 0; c < e.clauses.length; c++) {
          if (c > 0) out2 += ' elseif ';
          out2 += exprToLua(e.clauses[c].cond, ctx) + ' then ' + exprToLua(e.clauses[c].exp, ctx);
        }
        return '(' + out2 + ' else ' + exprToLua(e.elseExp, ctx) + ')';
      }
      default: throw new Error('IR: unsupported expression kind ' + e.kind);
    }
  }

  function targetToLua(t, ctx) {
    if (t.kind === 'name') return t.sym ? ctx.lname(t.sym) : (t.token.raw || t.token.v);
    if (t.kind === 'index') return objToLua(t.obj, ctx) + '.' + t.key.raw;
    if (t.kind === 'indexb') return objToLua(t.obj, ctx) + '[' + exprToLua(t.key, ctx) + ']';
    throw new Error('IR: unsupported assignment target ' + t.kind);
  }

  function paramsToLua(fb, ctx) {
    var ns = [];
    for (var p = 0; p < fb.params.length; p++) {
      var pp = fb.params[p];
      if (pp.vararg) ns.push('...');
      else if (pp.sym) ns.push(ctx.lname(pp.sym));
      else if (pp.name) ns.push(pp.name.raw);
    }
    return ns.join(',');
  }

  // --------------------------------------------------- structured statement emit

  function emitOne(it, ctx, out, pad, rng, level, inState) {
    switch (it.t) {
      case 'local': {
        var ns = [];
        for (var n = 0; n < it.syms.length; n++) ns.push(ctx.lname(it.syms[n]));
        if (inState) {
          // the declaration is hoisted to the region top; this is the assignment
          if (it.exps && it.exps.length) out.push(pad + ns.join(',') + '=' + valsToLua(it.exps, ctx));
          // decl-only: nothing (hoisted local already starts nil)
        } else if (it.exps && it.exps.length) {
          var vs = [];
          for (var e = 0; e < it.exps.length; e++) vs.push(exprToLua(it.exps[e], ctx));
          out.push(pad + 'local ' + ns.join(',') + '=' + vs.join(','));
        } else out.push(pad + 'local ' + ns.join(','));
        break;
      }
      case 'assign': {
        var ts = [];
        for (var t = 0; t < it.targets.length; t++) ts.push(targetToLua(it.targets[t], ctx));
        out.push(pad + ts.join(',') + it.op + valsToLua(it.values, ctx));
        break;
      }
      case 'expstat': out.push(pad + exprToLua(it.e, ctx)); break;
      case 'localfunc': {
        var nm = ctx.lname(it.sym);
        if (!inState && !it.assignOnly) out.push(pad + 'local ' + nm);
        out.push(pad + nm + '=function(' + paramsToLua(it.body, ctx) + ')');
        var kid = ctx.fnOf.get(it.body);
        emitRegion(kid.items, kid.level, ctx, out, pad + '\t', rng, false);
        out.push(pad + 'end');
        break;
      }
      case 'funcstat': {
        var tgt = ctx.refs[it.parts[0].i] ? ctx.lname(ctx.refs[it.parts[0].i]) : (it.parts[0].raw || it.parts[0].v);
        for (var p = 1; p < it.parts.length; p++) tgt += '.' + it.parts[p].raw;
        out.push(pad + tgt + '=function(' + paramsToLua(it.body, ctx) + ')');
        var kid2 = ctx.fnOf.get(it.body);
        emitRegion(kid2.items, kid2.level, ctx, out, pad + '\t', rng, false);
        out.push(pad + 'end');
        break;
      }
      case 'if': {
        for (var c = 0; c < it.clauses.length; c++) {
          out.push(pad + (c === 0 ? 'if ' : 'elseif ') + exprToLua(it.clauses[c].cond, ctx) + ' then');
          emitRegion(it.clauses[c].items, level, ctx, out, pad + '\t', rng, false);
        }
        if (it.elseItems && it.elseItems.length) {
          out.push(pad + 'else');
          emitRegion(it.elseItems, level, ctx, out, pad + '\t', rng, false);
        }
        out.push(pad + 'end');
        break;
      }
      case 'while': {
        out.push(pad + 'while ' + exprToLua(it.cond, ctx) + ' do');
        emitRegion(it.items, level, ctx, out, pad + '\t', rng, true);
        out.push(pad + 'end');
        break;
      }
      case 'numfor': {
        var head = 'for ' + ctx.lname(it.sym) + '=' + exprToLua(it.start, ctx) + ',' + exprToLua(it.limit, ctx);
        if (it.step) head += ',' + exprToLua(it.step, ctx);
        out.push(pad + head + ' do');
        emitRegion(it.items, level, ctx, out, pad + '\t', rng, true);
        out.push(pad + 'end');
        break;
      }
      case 'genfor': {
        var fN = ctx.freshName('Dk'), sN = ctx.freshName('Dk'), cN = ctx.freshName('Dk');
        var evs = [];
        for (var x = 0; x < it.exps.length; x++) evs.push(exprToLua(it.exps[x], ctx));
        var us = [];
        for (var s2 = 0; s2 < it.syms.length; s2++) us.push(ctx.lname(it.syms[s2]));
        out.push(pad + 'do');
        out.push(pad + '\tlocal ' + fN + ',' + sN + ',' + cN + '=' + evs.join(','));
        out.push(pad + '\twhile true do');
        out.push(pad + '\t\tlocal ' + us.join(',') + '=' + fN + '(' + sN + ',' + cN + ')');
        out.push(pad + '\t\t' + cN + '=' + us[0]);
        out.push(pad + '\t\tif ' + us[0] + '==nil then break end');
        emitRegion(it.items, level, ctx, out, pad + '\t\t', rng, true);
        out.push(pad + '\tend');
        out.push(pad + 'end');
        break;
      }
      case 'repeat': {
        var bodySyms = collectRegionSyms(it.items);
        var condSyms = new Set();
        walkExpr(it.cond, { name: function (s) { if (s) condSyms.add(s); } }, ctx, 0);
        var overlap = false;
        bodySyms.forEach(function (s3) { if (condSyms.has(s3)) overlap = true; });
        out.push(pad + 'repeat');
        if (overlap) emitItemsStructured(it.items, ctx, out, pad + '\t', rng);
        else emitRegion(it.items, level, ctx, out, pad + '\t', rng, true);
        out.push(pad + 'until ' + exprToLua(it.cond, ctx));
        break;
      }
      case 'do': {
        out.push(pad + 'do');
        emitItemsStructured(it.items, ctx, out, pad + '\t', rng);
        out.push(pad + 'end');
        break;
      }
      default:
        throw new Error('IR: cannot emit item ' + it.t);
    }
  }

  function emitItemsStructured(items, ctx, out, pad, rng) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'return') {
        out.push(pad + (it.values && it.values.length ? 'return ' + valsToLua(it.values, ctx) : 'return'));
      } else if (it.t === 'break') out.push(pad + 'break');
      else if (it.t === 'continue') out.push(pad + 'continue');
      else emitOne(it, ctx, out, pad, rng, 'structured');
    }
  }

  /** syms declared directly in this region (branches included, loops excluded) */
  function collectRegionSyms(items, set) {
    set = set || new Set();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.t === 'local') for (var n = 0; n < it.syms.length; n++) if (it.syms[n]) set.add(it.syms[n]);
      else if (it.t === 'localfunc') { if (it.sym) set.add(it.sym); }
      else if (it.t === 'if') {
        for (var c = 0; c < it.clauses.length; c++) collectRegionSyms(it.clauses[c].items, set);
        collectRegionSyms(it.elseItems, set);
      }
    }
    return set;
  }

  // ------------------------------------------------- state machine flattening

  function newStateObj() { return { lines: [], next: null, branch: null, terminal: null, id: null }; }

  /**
   * Turn an item list into dispatch states. `term` is where the run falls
   * through ('exit' or a state object). Returns the entry state.
   */
  function linearize(items, states, term, startWith, ctx, rng, splitProb) {
    var cur = startWith || newStateObj();
    var entry = startWith || null;
    function pushSt(st) { if (!entry) entry = st; states.push(st); }
    var i, it, d;
    for (i = 0; i < items.length; i++) {
      it = items[i];
      if (it.t === 'return' || it.t === 'break' || it.t === 'continue') {
        cur.lines.push(it);
        cur.terminal = it.t;
        pushSt(cur);
        for (d = i + 1; d < items.length; d++) ctx.stats.dropped++;
        return { entry: entry };
      }
      if (it.t === 'if') {
        var br = newStateObj();
        br.branch = it;
        if (cur.lines.length) { cur.next = br; pushSt(cur); cur = newStateObj(); }
        pushSt(br);
        var after = newStateObj();
        for (var c = 0; c < it.clauses.length; c++) {
          if (it.clauses[c].items.length) {
            var res = linearize(it.clauses[c].items, states, after, null, ctx, rng, splitProb);
            it.clauses[c].target = res.entry || after;
          } else it.clauses[c].target = after;
        }
        it.elseTarget = it.elseItems.length
          ? linearize(it.elseItems, states, after, null, ctx, rng, splitProb).entry || after
          : after;
        cur = after;
        continue;
      }
      cur.lines.push(it);
    }
    // close the trailing state; block-split long runs on the way out
    cur.next = term;
    if (cur.lines.length >= 4 && splitProb > 0 && rng() < splitProb) {
      var k = 1 + Math.floor(rng() * (cur.lines.length - 1));
      var rest = newStateObj();
      rest.lines = cur.lines.slice(k);
      rest.next = cur.next;
      cur.lines = cur.lines.slice(0, k);
      cur.next = rest;
      pushSt(cur);
      pushSt(rest);
    } else {
      pushSt(cur);
    }
    return { entry: entry };
  }

  function emitRegionStr(items, level, ctx, rng, pad, needsBreakCheck) {
    var out = [];
    emitRegion(items, level, ctx, out, pad, rng, needsBreakCheck);
    return out.join('\n');
  }

  function rngOf(ctx) { return ctx.rng; }

  function emitRegion(items, level, ctx, out, pad, rng, needsBreakCheck) {
    if ((level === 'secure' || level === 'balanced') && items.length) {
      emitStateRegion(items, level, ctx, out, pad, rng, needsBreakCheck);
    } else {
      emitItemsStructured(items, ctx, out, pad, rng);
    }
  }

  function emitStateRegion(items, level, ctx, out, pad, rng, needsBreakCheck) {
    var states = [];
    var res = linearize(items, states, 'exit', null, ctx, rng, level === 'secure' ? ctx.splitProb : ctx.splitProb);
    if (states.length > 320) {           // huge region: dispatch chain would be quadratic
      emitItemsStructured(items, ctx, out, pad, rng);
      return;
    }
    var used = new Set();
    function newId() { var n2; do { n2 = 10000 + Math.floor(rng() * 899999); } while (used.has(n2)); used.add(n2); return n2; }
    var i;
    for (i = 0; i < states.length; i++) states[i].id = newId();
    var EXIT = newId(), BRK = newId();
    var decoys = [];
    if (level === 'secure') {
      var nd = 2 + Math.floor(rng() * 3);
      for (i = 0; i < nd; i++) decoys.push(newId());
    }
    ctx.stats.states += states.length;
    // hoist the region's own locals so every state shares one scope
    var hs = collectRegionSyms(items);
    if (hs.size) {
      var hns = [];
      hs.forEach(function (s) { hns.push(ctx.lname(s)); });
      out.push(pad + 'local ' + hns.join(','));
    }
    var S = ctx.freshName('D');
    out.push(pad + 'local ' + S + '=' + res.entry.id);
    out.push(pad + 'while true do');
    var p2 = pad + '\t', p3 = p2 + '\t', p4 = p3 + '\t';
    for (i = 0; i < states.length; i++) {
      var st = states[i];
      out.push(p2 + (i === 0 ? 'if ' : 'elseif ') + S + '==' + st.id + ' then');
      if (st.branch) {
        emitBranchChain(st.branch, S, ctx, out, p3, p4, rng, level === 'secure', decoys, EXIT);
      } else {
        for (var li = 0; li < st.lines.length; li++) {
          var ln = st.lines[li];
          if (ln.t === 'return') {
            out.push(p3 + (ln.values && ln.values.length ? 'return ' + valsToLua(ln.values, ctx) : 'return'));
          } else if (ln.t === 'break') out.push(p3 + S + '=' + BRK);
          else if (ln.t === 'continue') out.push(p3 + S + '=' + EXIT);
          else emitOne(ln, ctx, out, p3, rng, level, true);
        }
        if (!st.terminal && st.next !== null) {
          emitTransition(st.next === 'exit' ? EXIT : st.next.id, S, ctx, out, p3, rng, level === 'secure', decoys);
        }
      }
    }
    out.push(p2 + 'else break end');
    out.push(pad + 'end');
    if (needsBreakCheck) out.push(pad + 'if ' + S + '==' + BRK + ' then break end');
  }

  function emitTransition(tid, S, ctx, out, pad, rng, secure, decoys) {
    if (secure && decoys.length && rng() < ctx.opaqueProb) {
      var a = 2 + Math.floor(rng() * 1000000), m = 2 + Math.floor(rng() * 1000);
      var dv = decoys[Math.floor(rng() * decoys.length)];
      out.push(pad + 'if (' + a + '%' + m + ')<' + m + ' then ' + S + '=' + tid + ' else ' + S + '=' + dv + ' end');
      ctx.stats.opaque++;
    } else {
      out.push(pad + S + '=' + tid);
    }
  }

  function emitBranchChain(brItem, S, ctx, out, p3, p4, rng, secure, decoys, EXIT) {
    for (var c = 0; c < brItem.clauses.length; c++) {
      out.push(p3 + (c === 0 ? 'if ' : 'elseif ') + exprToLua(brItem.clauses[c].cond, ctx) + ' then');
      emitTarget(brItem.clauses[c].target, S, ctx, out, p4, rng, secure, decoys);
    }
    out.push(p3 + 'else');
    emitTarget(brItem.elseTarget, S, ctx, out, p4, rng, secure, decoys);
    out.push(p3 + 'end');
  }

  function emitTarget(t, S, ctx, out, p4, rng, secure, decoys) {
    emitTransition(t ? t.id : 0, S, ctx, out, p4, rng, secure, decoys);
  }

  // ------------------------------------------------------------------ passes

  function itemCount(items) {
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      n++;
      if (it.t === 'if') {
        for (var c = 0; c < it.clauses.length; c++) n += itemCount(it.clauses[c].items);
        n += itemCount(it.elseItems);
      } else if (it.t === 'while' || it.t === 'numfor' || it.t === 'genfor' || it.t === 'repeat') {
        n += itemCount(it.items);
      }
    }
    return n;
  }

  function applyPasses(fn, ctx, rng) {
    if (fn.level !== 'none' && itemCount(fn.items) <= 30000) {
      var guard = 0, last = -1;
      while (guard++ < 4) {
        var before = ctx.stats.folded + ctx.stats.spliced + ctx.stats.dropped;
        foldItemExprs(fn.items, ctx);
        fn.items = spliceItems(fn.items, ctx);
        propagateTree(fn.items, ctx, fn);
        recountFn(fn, ctx);
        fn.items = dceTree(fn.items, fn, ctx);
        var now = ctx.stats.folded + ctx.stats.spliced + ctx.stats.dropped;
        if (now === last || now === before) break;
        last = now;
      }
    }
    for (var i = 0; i < fn.closures.length; i++) applyPasses(fn.closures[i], ctx, rng);
  }

  // ----------------------------------------------------------------- program

  /**
   * Whole-program IR stage.
   * parsed: result of Parser.parse(src)
   * opts: { rng, level, tags, splitProb, opaqueProb }
   * Returns { source, stats } where source is fresh Luau for the caller to
   * re-parse and feed to the bytecode backend.
   */
  function emitProgram(parsed, opts) {
    opts = opts || {};
    var ctx = new Ctx({
      refs: parsed.refs,
      tags: opts.tags || null,
      level: opts.level || 'balanced',
      splitProb: opts.splitProb !== undefined ? opts.splitProb : 0.5,
      opaqueProb: opts.opaqueProb !== undefined ? opts.opaqueProb : 0.35
    });
    ctx.rng = opts.rng;
    var root = build(parsed.ast, ctx);
    applyPasses(root, ctx, opts.rng);
    var out = [];
    emitRegion(root.items, root.level, ctx, out, '', opts.rng, false);
    var src = out.join('\n');
    if (parsed.hasStrictDirective) src = parsed.src.match(/^--[^\n]*/) ? src : src;
    return { source: src + '\n', stats: ctx.stats, root: root };
  }

  return {
    emitProgram: emitProgram,
    build: build,
    version: '1.0.0'
  };
});
