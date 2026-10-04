/*!
 * luau-parser.js — recursive-descent Luau parser + scope resolver.
 *
 * It validates real Luau syntax (including types, generics, interpolation,
 * if-expressions and compound assignment) and resolves every identifier to
 * either a local symbol or a global. Output is the information the obfuscator
 * needs: symbol table, references, safe statement-insertion points, global
 * reads/assignments and warnings.
 *
 * Browser: window.LuauParser   Node: require('./luau-parser.js')
 */
(function (root, factory) {
  var Lexer = (typeof module === 'object' && module.exports) ? require('./luau-lexer.js') : root.LuauLexer;
  var api = factory(Lexer);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LuauParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lexer) {
  'use strict';

  var TRIVIA = { ws: 1, comment: 1 };
  var BLOCK_END = { end: 1, else: 1, elseif: 1, until: 1 };
  var UNARY_OPS = { '-': 1, not: 1, '#': 1 };
  var COMPOUND_OPS = { '+=': 1, '-=': 1, '*=': 1, '/=': 1, '%=': 1, '^=': 1, '..=': 1 };

  function err(msg, tok) {
    var e = new Error(msg);
    e.name = 'LuauSyntaxError';
    if (tok) { e.line = tok.ln; e.col = tok.col; e.index = tok.s; }
    return e;
  }

  // ---------------------------------------------------------------- scopes
  function Scope(parent, kind) {
    this.parent = parent;
    this.kind = kind; // 'chunk' | 'block' | 'function' | 'loop'
    this.names = Object.create(null);
    this.children = [];
    if (parent) parent.children.push(this);
  }
  Scope.prototype.lookup = function (name) {
    var s = this;
    while (s) { if (s.names[name]) return s.names[name]; s = s.parent; }
    return null;
  };

  function Symbol(name, token, kind, scope) {
    this.name = name;
    this.token = token;      // declaration token
    this.kind = kind;        // 'local' | 'param' | 'for' | 'funcname' | 'self'
    this.scope = scope;
    this.refs = [];          // token indices
    this.newName = null;
  }

  // ---------------------------------------------------------------- parser
  function Parser(src, toks) {
    this.src = src;
    this.toks = toks;                       // all tokens (incl. whitespace/comments)
    this.code = [];                         // significant tokens only
    for (var i = 0; i < toks.length; i++) if (!TRIVIA[toks[i].k]) this.code.push(toks[i]);
    this.p = 0;
    this.symbols = [];
    this.refs = Object.create(null);        // token index -> symbol
    this.globals = Object.create(null);     // name -> {reads:[tok], writes:[tok]}
    this.junkPoints = [];                   // {at: codeIndex, kind:'stmt'|'end'}
    this.loopDepth = 0;
    this.callEnds = Object.create(null); // last token index of call statements
    this.warnings = [];
    this.usesEnv = false;
    this.usesVararg = false;
    this.hasStrictDirective = false;
    this.chunkScope = new Scope(null, 'chunk');
    this.scope = this.chunkScope;
  }

  Parser.prototype.cur = function () {
    var t = this.code[this.p];
    if (t) return t;
    // sub-token lists (string interpolations) have no real <eof> token
    if (!this._eofTok) {
      this._eofTok = { k: 'eof', v: '<eof>', s: this.src.length, e: this.src.length, ln: 0, col: 0, i: -9999, raw: '<eof>' };
    }
    return this._eofTok;
  };
  Parser.prototype.next = function (o) { return this.code[this.p + (o || 0)] || null; };
  Parser.prototype.advance = function () {
    var t = this.code[this.p];
    if (t && t.k !== 'eof') this.p++;
    return t;
  };
  Parser.prototype.isKw = function (kw, o) {
    var t = this.code[this.p + (o || 0)];
    return !!t && t.k === 'keyword' && t.v === kw;
  };
  Parser.prototype.isOp = function (op, o) {
    var t = this.code[this.p + (o || 0)];
    return !!t && t.k === 'op' && t.v === op;
  };
  Parser.prototype.expectKw = function (kw) {
    if (!this.isKw(kw)) throw err("Expected '" + kw + "'" + this.got(), this.cur());
    return this.advance();
  };
  Parser.prototype.expectOp = function (op) {
    if (!this.isOp(op)) throw err("Expected '" + op + "'" + this.got(), this.cur());
    return this.advance();
  };
  Parser.prototype.got = function () {
    var t = this.cur();
    if (!t) return '';
    return t.k === 'eof' ? ', got <eof>' : ", got '" + (t.raw !== undefined ? t.raw : t.v) + "'";
  };

  // ---- scope helpers
  Parser.prototype.pushScope = function (kind) { this.scope = new Scope(this.scope, kind); return this.scope; };
  Parser.prototype.popScope = function () { this.scope = this.scope.parent; };
  Parser.prototype.declare = function (tok, kind) {
    var sym = new Symbol(tok.v, tok, kind, this.scope);
    this.scope.names[tok.v] = sym;
    this.symbols.push(sym);
    return sym;
  };
  Parser.prototype.resolve = function (tok) {
    var sym = this.scope.lookup(tok.v);
    if (sym) {
      sym.refs.push(tok.i);
      this.refs[tok.i] = sym;
    } else {
      var g = this.globals[tok.v] || (this.globals[tok.v] = { reads: [], writes: [] });
      g.reads.push(tok);
      if (tok.v === 'getfenv' || tok.v === 'setfenv' || tok.v === 'loadstring' || tok.v === '_G' || tok.v === '_ENV') {
        this.usesEnv = true;
      }
    }
    return sym;
  };
  Parser.prototype.markGlobalWrite = function (tok) {
    var g = this.globals[tok.v] || (this.globals[tok.v] = { reads: [], writes: [] });
    g.writes.push(tok);
    if (tok.v === '_G' || tok.v === '_ENV') this.usesEnv = true;
  };

  // ------------------------------------------------------------ entry point
  Parser.prototype.parseChunk = function () {
    var block = this.parseBlock(true);
    this.expectEof();
    return block;
  };
  Parser.prototype.expectEof = function () {
    if (this.cur().k !== 'eof') throw err("Expected <eof>" + this.got(), this.cur());
  };

  Parser.prototype.atBlockEnd = function (topLevel) {
    var t = this.cur();
    if (t.k === 'eof') return true;
    if (t.k === 'keyword' && BLOCK_END[t.v]) return true;
    return false;
  };

  Parser.prototype.parseBlock = function (topLevel) {
    var stats = [];
    var lastJump = false;
    var fnScope = null;
    while (!this.atBlockEnd(topLevel)) {
      var t = this.cur();
      // Luau has no empty statement: `;` may only terminate a statement
      if (t.k === 'op' && t.v === ';') throw err('Expected statement' + this.got(), t);
      if (fnScope === null) fnScope = this.scope;
      if (!this.noJunk) this.junkPoints.push({ at: this.p, kind: 'stmt' });
      var st = this.parseStatement();
      stats.push(st);
      // `f()` followed by `(g)()` is ambiguous without a separator
      if (st.kind === 'call' || st.kind === 'methodcall') this.callEnds[this.code[this.p - 1].i] = 1;
      lastJump = (st.kind === 'return' || st.kind === 'break' || st.kind === 'continue');
      if (this.cur().k === 'op' && this.cur().v === ';') this.advance();
      if (lastJump) break; // Luau requires return/break/continue to be last
    }
    if (!lastJump && !this.noJunk) this.junkPoints.push({ at: this.p, kind: 'end' });
    return { kind: 'block', stats: stats };
  };

  Parser.prototype.parseStatement = function () {
    var t = this.cur();

    if (t.k === 'keyword') {
      // `type X = ...` declares an alias, but `type(x)` is an ordinary call —
      // `type` is contextual, so fall through to the expression statement below.
      if (t.v === 'type' && this.next(1) && this.next(1).k === 'name' && !this.isOp('(', 1)) {
        return this.parseTypeAlias(false);
      }
      if (t.v === 'export' && this.isKw('type', 1)) return this.parseTypeAlias(true);
      switch (t.v) {
        case 'local': return this.parseLocal();
        case 'function': return this.parseFunctionStat();
        case 'if': return this.parseIf();
        case 'while': return this.parseWhile();
        case 'do': return this.parseDo();
        case 'for': return this.parseFor();
        case 'repeat': return this.parseRepeat();
        case 'return': return this.parseReturn();
        case 'break':
          if (!this.loopDepth) throw err("'break' statement must be inside a loop", t);
          this.advance();
          return { kind: 'break' };
        case 'continue':
          if (!this.loopDepth) throw err("'continue' statement must be inside a loop", t);
          this.advance();
          return { kind: 'continue' };
        case 'end': case 'else': case 'elseif': case 'until':
          throw err("Unexpected '" + t.v + "' when parsing statement", t);
      }
      // `type(x)`, `typeof(x)` and friends: parse as an expression statement
      if (t.v !== 'type' && t.v !== 'typeof') {
        throw err("Unexpected '" + t.v + "' when parsing statement", t);
      }
    }

    // expression statement: either an assignment or a function/method call
    var first = this.parseSuffixed();
    var targets = [first];
    while (this.isOp(',')) {           // a, b = b, a
      this.advance();
      targets.push(this.parseSuffixed());
    }
    var op = this.cur();
    if (op.k === 'op' && (op.v === '=' || COMPOUND_OPS[op.v])) {
      this.advance();
      var values = this.parseExpList();
      for (var i = 0; i < targets.length; i++) {
        var tg = targets[i];
        if (tg.kind === 'name') {
          if (tg.sym) tg.sym.refs.push(tg.token.i);
          else this.markGlobalWrite(tg.token);
        } else if (op.v !== '=') {
          // t.x += 1 desugars to a read + write of t.x — global capture must be careful
        }
      }
      return { kind: 'assign', op: op.v, targets: targets, values: values };
    }
    if (first.kind === 'call' || first.kind === 'methodcall') {
      return { kind: 'call', expr: first };
    }
    throw err('Incomplete statement: expected assignment or a function call', this.cur());
  };

  // ------------------------------------------------------------- statements
  Parser.prototype.parseLocal = function () {
    var kw = this.expectKw('local');
    if (this.isKw('function')) {
      this.advance();
      var nameTok = this.cur();
      if (nameTok.k !== 'name') throw err('Expected identifier when parsing local function name' + this.got(), nameTok);
      this.advance();
      this.skipGenerics();
      var sym = this.declare(nameTok, 'local');
      sym.refs.push(nameTok.i);
      this.refs[nameTok.i] = sym;
      var body = this.parseFunctionBody('method' === 'no' ? false : false);
      return { kind: 'localfunc', sym: sym, body: body };
    }
    var names = [];
    while (true) {
      var t = this.cur();
      if (t.k !== 'name') throw err('Expected identifier when parsing local variable name' + this.got(), t);
      names.push(t);
      this.advance();
      if (this.isOp(':')) { // type annotation
        this.advance();
        this.parseType();
      }
      if (!this.isOp(',')) break;
      this.advance();
    }
    var values = null;
    if (this.isOp('=')) { this.advance(); values = this.parseExpList(); }
    // declared only after the initializer expression is parsed (local x = x)
    for (var i = 0; i < names.length; i++) {
      var s = this.declare(names[i], 'local');
      s.refs.push(names[i].i);
      this.refs[names[i].i] = s;
    }
    return { kind: 'local', names: names, values: values };
  };

  Parser.prototype.parseFunctionStat = function () {
    this.expectKw('function');
    var parts = [];
    var t = this.cur();
    if (t.k !== 'name') throw err('Expected identifier when parsing function name' + this.got(), t);
    parts.push(t);
    this.advance();
    var isMethod = false;
    while (this.isOp('.') || this.isOp(':')) {
      isMethod = this.isOp(':');
      this.advance();
      var nt = this.cur();
      if (nt.k !== 'name') throw err('Expected identifier when parsing function name' + this.got(), nt);
      parts.push(nt);
      this.advance();
    }
    this.skipGenerics();
    // `function a.b.c()` — only `a` is an expression; the rest are field keys.
    // `function a:b()`  — same, `b` is a method key.
    var fsym = this.resolve(parts[0]);
    if (!fsym && parts.length === 1 && !isMethod) this.markGlobalWrite(parts[0]);
    var body = this.parseFunctionBody(isMethod);
    return { kind: 'funcstat', parts: parts, isMethod: isMethod, body: body };
  };

  Parser.prototype.parseFunctionBody = function (isMethod) {
    var savedLoop = this.loopDepth;
    this.loopDepth = 0;
    this.callEnds = Object.create(null); // last token index of call statements
    var sc = this.pushScope('function');
    this.expectOp('(');
    var params = this.parseParams();
    this.expectOp(')');
    if (isMethod) {
      // `function a:b()` has an implicit `self` first parameter: expose it in
      // `params` so the bytecode compiler reserves a register for it
      var selfTok = { k: 'name', v: 'self', s: -1, e: -1, ln: 0, col: 0, i: -1, raw: 'self', synthetic: true };
      var selfSym = this.declare(selfTok, 'self');
      params.unshift({ v: 'self', i: -1, sym: selfSym, vararg: false });
    }
    if (this.isOp(':')) { this.advance(); this.parseReturnType(); }
    var block = this.parseBlock(false);
    this.expectKw('end');
    this.popScope();
    this.loopDepth = savedLoop;
    return { kind: 'funcbody', scope: sc, params: params, block: block };
  };

  Parser.prototype.parseParams = function () {
    var params = [];
    if (this.isOp(')')) return params;
    while (true) {
      if (this.isOp('...')) {
        this.advance();
        this.usesVararg = true;
        if (this.isOp(':')) { this.advance(); this.parseType(); }
        params.push({ vararg: true });
        break;
      }
      var t = this.cur();
      if (t.k !== 'name') throw err('Expected identifier when parsing function parameter' + this.got(), t);
      this.advance();
      if (this.isOp(':')) { this.advance(); this.parseType(); }
      var psym = this.declare(t, 'param');
      psym.refs.push(t.i);
      this.refs[t.i] = psym;
      params.push({ name: t, sym: psym });
      if (this.isOp(',')) { this.advance(); continue; }
      break;
    }
    return params;
  };

  Parser.prototype.parseTypeAlias = function (exported) {
    if (exported) this.expectKw('export');
    this.expectKw('type');
    var t = this.cur();
    if (t.k !== 'name') throw err('Expected identifier when parsing type alias' + this.got(), t);
    this.advance();
    this.skipGenerics();
    this.expectOp('=');
    this.parseType();
    return { kind: 'typealias', name: t, exported: exported };
  };

  Parser.prototype.parseIf = function () {
    this.expectKw('if');
    var clauses = [];
    var cond = this.parseExp();
    this.expectKw('then');
    // every branch is its own scope: `if x then local y = 1 end print(y)` must
    // print nil, so the branch block cannot declare into the enclosing scope
    this.pushScope('block');
    clauses.push({ cond: cond, block: this.parseBlock(false) });
    this.popScope();
    while (this.isKw('elseif')) {
      this.advance();
      var c = this.parseExp();
      this.expectKw('then');
      this.pushScope('block');
      clauses.push({ cond: c, block: this.parseBlock(false) });
      this.popScope();
    }
    var elseBlock = null;
    if (this.isKw('else')) {
      this.advance();
      this.pushScope('block');
      elseBlock = this.parseBlock(false);
      this.popScope();
    }
    this.expectKw('end');
    return { kind: 'if', clauses: clauses, elseBlock: elseBlock };
  };

  Parser.prototype.parseWhile = function () {
    this.expectKw('while');
    var cond = this.parseExp();
    this.expectKw('do');
    this.pushScope('loop');
    this.loopDepth++;
    var block = this.parseBlock(false);
    this.loopDepth--;
    this.popScope();
    this.expectKw('end');
    return { kind: 'while', cond: cond, block: block };
  };

  Parser.prototype.parseDo = function () {
    this.expectKw('do');
    this.pushScope('block');
    var block = this.parseBlock(false);
    this.popScope();
    this.expectKw('end');
    return { kind: 'do', block: block };
  };

  Parser.prototype.parseFor = function () {
    this.expectKw('for');
    var names = [];
    var t = this.cur();
    if (t.k !== 'name') throw err('Expected identifier when parsing for-loop variable' + this.got(), t);
    names.push(t);
    this.advance();
    var sc = this.pushScope('loop');
    if (this.isOp(':')) { this.advance(); this.parseType(); } // `for i: number = 1, 10`
    if (this.isOp('=')) { // numeric for
      this.advance();
      var start = this.parseExp();
      this.expectOp(',');
      var limit = this.parseExp();
      var step = null;
      if (this.isOp(',')) { this.advance(); step = this.parseExp(); }
      this.expectKw('do');
      var sym = this.declare(names[0], 'for');
      sym.refs.push(names[0].i);
      this.refs[names[0].i] = sym;
      this.loopDepth++;
      var block = this.parseBlock(false);
      this.loopDepth--;
      this.popScope();
      this.expectKw('end');
      return { kind: 'numfor', sym: sym, start: start, limit: limit, step: step, block: block };
    }
    // generic for
    while (this.isOp(',')) {
      this.advance();
      var nt = this.cur();
      if (nt.k !== 'name') throw err('Expected identifier when parsing for-loop variable' + this.got(), nt);
      names.push(nt);
      this.advance();
      if (this.isOp(':')) { this.advance(); this.parseType(); }
    }
    this.expectKw('in');
    var exps = this.parseExpList();
    this.expectKw('do');
    for (var i = 0; i < names.length; i++) {
      var s = this.declare(names[i], 'for');
      s.refs.push(names[i].i);
      this.refs[names[i].i] = s;
    }
    this.loopDepth++;
    var blk = this.parseBlock(false);
    this.loopDepth--;
    this.popScope();
    this.expectKw('end');
    return { kind: 'genfor', names: names, exps: exps, block: blk };
  };

  Parser.prototype.parseRepeat = function () {
    this.expectKw('repeat');
    this.pushScope('loop');
    this.loopDepth++;
    var block = this.parseBlock(false);
    this.expectKw('until');
    var cond = this.parseExp(); // evaluated inside the loop scope
    this.loopDepth--;
    this.popScope();
    return { kind: 'repeat', block: block, cond: cond };
  };

  Parser.prototype.parseReturn = function () {
    this.expectKw('return');
    var values = null;
    var t = this.cur();
    var endsBlock = this.isOp(';') || this.isKw('end') || this.isKw('else') || this.isKw('elseif') ||
      this.isKw('until') || t.k === 'eof';
    if (!endsBlock) values = this.parseExpList();
    return { kind: 'return', values: values };
  };

  // ------------------------------------------------------------ expressions
  Parser.prototype.parseExpList = function () {
    var exps = [];
    do { exps.push(this.parseExp()); } while (this.isOp(',') && (this.advance(), true));
    return exps;
  };

  Parser.prototype.parseExp = function () { return this.parseOr(); };

  Parser.prototype.parseOr = function () {
    var l = this.parseAnd();
    while (this.isKw('or')) { this.advance(); l = { kind: 'bin', op: 'or', l: l, r: this.parseAnd() }; }
    return l;
  };
  Parser.prototype.parseAnd = function () {
    var l = this.parseCompare();
    while (this.isKw('and')) { this.advance(); l = { kind: 'bin', op: 'and', l: l, r: this.parseCompare() }; }
    return l;
  };
  Parser.prototype.parseCompare = function () {
    var l = this.parseConcat();
    while (true) {
      var t = this.cur();
      if (t.k === 'op' && (t.v === '<' || t.v === '>' || t.v === '<=' || t.v === '>=' || t.v === '~=' || t.v === '==')) {
        this.advance();
        l = { kind: 'bin', op: t.v, l: l, r: this.parseConcat() };
        continue;
      }
      return l;
    }
  };
  Parser.prototype.parseConcat = function () {
    var parts = [this.parseAdd()];
    while (this.isOp('..')) { this.advance(); parts.push(this.parseAdd()); }
    if (parts.length === 1) return parts[0];
    // right associative
    var node = parts[parts.length - 1];
    for (var i = parts.length - 2; i >= 0; i--) node = { kind: 'bin', op: '..', l: parts[i], r: node };
    return node;
  };
  Parser.prototype.parseAdd = function () {
    var l = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      var op = this.advance().v;
      l = { kind: 'bin', op: op, l: l, r: this.parseMul() };
    }
    return l;
  };
  Parser.prototype.parseMul = function () {
    var l = this.parseUnary();
    while (this.isOp('*') || this.isOp('/') || this.isOp('//') || this.isOp('%')) {
      var op = this.advance().v;
      l = { kind: 'bin', op: op, l: l, r: this.parseUnary() };
    }
    return l;
  };
  Parser.prototype.parseUnary = function () {
    var t = this.cur();
    if (t.k === 'op' && (t.v === '-' || t.v === '#')) {
      this.advance();
      return { kind: 'un', op: t.v, e: this.parseUnary() };
    }
    if (t.k === 'keyword' && t.v === 'not') {
      this.advance();
      return { kind: 'un', op: 'not', e: this.parseUnary() };
    }
    return this.parsePow();
  };
  Parser.prototype.parsePow = function () {
    var base = this.parseSuffixed();
    if (this.isOp('^')) { this.advance(); return { kind: 'bin', op: '^', l: base, r: this.parseUnary() }; }
    return base;
  };

  Parser.prototype.parseSuffixed = function () {
    var e = this.parsePrimary();
    while (true) {
      var t = this.cur();
      if (t.k === 'op' && t.v === '.') {
        this.advance();
        var n = this.cur();
        if (n.k !== 'name' && n.k !== 'keyword') throw err('Expected identifier when parsing field name' + this.got(), n);
        this.advance();
        e = { kind: 'index', obj: e, key: n };
        continue;
      }
      if (t.k === 'op' && t.v === '[') {
        this.advance();
        var k = this.parseExp();
        this.expectOp(']');
        e = { kind: 'indexb', obj: e, key: k };
        continue;
      }
      if (t.k === 'op' && t.v === ':') {
        this.advance();
        var m = this.cur();
        if (m.k !== 'name' && m.k !== 'keyword') throw err('Expected identifier when parsing method name' + this.got(), m);
        this.advance();
        e = { kind: 'methodcall', obj: e, name: m, args: this.parseArgs() };
        continue;
      }
      if (t.k === 'op' && t.v === '(') { e = { kind: 'call', fn: e, args: this.parseArgs() }; continue; }
      if (t.k === 'string') { var s = this.advance(); e = { kind: 'call', fn: e, args: [s] }; continue; }
      if (t.k === 'op' && t.v === '{') { e = { kind: 'call', fn: e, args: [this.parseTable()] }; continue; }
      if (t.k === 'op' && t.v === '::') { this.advance(); this.parseType(); e = { kind: 'cast', e: e }; continue; }
      return e;
    }
  };

  Parser.prototype.parseArgs = function () {
    var t = this.cur();
    if (t.k === 'string') { var s2 = this.advance(); if (s2.parts) this.parseInterpParts(s2); return [s2]; }
    if (t.k === 'op' && t.v === '{') return [this.parseTable()];
    this.expectOp('(');
    var args = [];
    if (!this.isOp(')')) {
      do { args.push(this.parseExp()); } while (this.isOp(',') && (this.advance(), true));
    }
    this.expectOp(')');
    return args;
  };

  Parser.prototype.parsePrimary = function () {
    var t = this.cur();

    if (t.k === 'op' && t.v === '(') {
      this.advance();
      var e = this.parseExp();
      this.expectOp(')');
      return { kind: 'paren', e: e };
    }
    if (t.k === 'name') {
      this.advance();
      var sym = this.resolve(t);
      return { kind: 'name', token: t, sym: sym };
    }
    if (t.k === 'keyword') {
      if (t.v === 'function') { return this.parseFunctionExpr(); }
      if (t.v === 'nil' || t.v === 'true' || t.v === 'false') { this.advance(); return { kind: 'const', token: t }; }
      if (t.v === 'if') return this.parseIfExpr();
      // contextual keywords that are ordinary globals in expression position
      if (t.v === 'type' || t.v === 'typeof') {
        this.advance();
        var csym = this.resolve(t);
        return { kind: 'name', token: t, sym: csym };
      }
      if (t.v === 'export') throw err("Unexpected '" + t.v + "' in expression", t);
      throw err("Unexpected '" + t.v + "' when parsing expression", t);
    }
    if (t.k === 'number') { this.advance(); return { kind: 'const', token: t }; }
    if (t.k === 'string') {
      this.advance();
      if (t.parts) this.parseInterpParts(t);
      return { kind: 'const', token: t };
    }
    if (t.k === 'op' && t.v === '{') return this.parseTable();
    if (t.k === 'op' && t.v === '...') {
      this.advance();
      this.usesVararg = true;
      return { kind: 'vararg', token: t };
    }
    if (t.k === 'op' && t.v === '=>') throw err('Unexpected \'=>\': arrow functions are not supported by stock Luau', t);
    throw err('Expected identifier when parsing expression' + this.got(), t);
  };

  /**
   * Resolve identifiers inside `hi {name}` interpolations against the scope the
   * interpolated string actually appears in, so renaming stays correct.
   */
  Parser.prototype.parseInterpParts = function (tok) {
    for (var i = 0; i < tok.parts.length; i++) {
      var part = tok.parts[i];
      if (part.kind !== 'expr') continue;
      if (!part.toks || !part.toks.length) {
        throw err('Empty expression inside string interpolation', tok);
      }
      var sub = new Parser(this.src, part.toks);
      sub.p = 0;
      sub.noJunk = true;
      sub.scope = this.scope;
      sub.refs = this.refs;
      sub.globals = this.globals;
      sub.symbols = this.symbols;
      sub.warnings = this.warnings;
      part.ast = sub.parseExp(); // kept so the VM backend can compile the interpolation
      if (sub.cur().k !== 'eof') throw err('Unexpected token in string interpolation', sub.cur());
      this.usesEnv = this.usesEnv || sub.usesEnv;
      this.usesVararg = this.usesVararg || sub.usesVararg;
    }
  };

  Parser.prototype.parseFunctionExpr = function () {
    this.expectKw('function');
    this.skipGenerics();   // `function<T>(v: T): T … end` is legal Luau
    var body = this.parseFunctionBody(false);
    return { kind: 'funcexpr', body: body };
  };

  Parser.prototype.parseIfExpr = function () {
    this.expectKw('if');
    var cond = this.parseExp();
    this.expectKw('then');
    var thenExp = this.parseExp();
    var clauses = [{ cond: cond, exp: thenExp }];
    while (this.isKw('elseif')) {
      this.advance();
      var c = this.parseExp();
      this.expectKw('then');
      clauses.push({ cond: c, exp: this.parseExp() });
    }
    this.expectKw('else');
    var elseExp = this.parseExp();
    return { kind: 'ifexpr', clauses: clauses, elseExp: elseExp };
  };

  Parser.prototype.parseTable = function () {
    this.expectOp('{');
    var fields = [];
    while (!this.isOp('}')) {
      if (this.isOp('[')) {
        this.advance();
        var k = this.parseExp();
        this.expectOp(']');
        this.expectOp('=');
        fields.push({ kind: 'kv', key: k, value: this.parseExp() });
      } else {
        var t = this.cur();
        if (t.k === 'name' && this.isOp('=', 1)) {
          this.advance();
          this.advance();
          fields.push({ kind: 'name', key: t, value: this.parseExp() });
        } else {
          fields.push({ kind: 'item', value: this.parseExp() });
        }
      }
      if (this.isOp(',') || this.isOp(';')) { this.advance(); continue; }
      break;
    }
    this.expectOp('}');
    return { kind: 'table', fields: fields };
  };

  // ------------------------------------------------------------------ types
  // Types are parsed for validation only; identifiers inside are never renamed.
  Parser.prototype.skipGenerics = function () {
    if (!this.isOp('<')) return;
    this.advance();
    var depth = 1;
    while (depth > 0) {
      var t = this.cur();
      if (t.k === 'eof') throw err('Unfinished generic parameter list', t);
      if (t.k === 'op') {
        if (t.v === '<') depth++;
        else if (t.v === '>') { depth--; this.advance(); continue; }
        else if (t.v === '(' || t.v === '{' || t.v === '[') {
          this.skipBalanced(t.v);
          continue;
        }
      }
      this.advance();
    }
  };

  Parser.prototype.skipBalanced = function (open) {
    var close = { '(': ')', '{': '}', '[': ']' }[open];
    this.advance();
    var depth = 1;
    while (depth > 0) {
      var t = this.cur();
      if (t.k === 'eof') throw err('Unfinished type', t);
      if (t.k === 'op') {
        if (t.v === open) depth++;
        else if (t.v === close) { depth--; if (!depth) { this.advance(); return; } }
        else if (t.v === '(' || t.v === '{' || t.v === '[') { this.skipBalanced(t.v); continue; }
      }
      this.advance();
    }
  };

  Parser.prototype.parseType = function () {
    this.parseUnionType();
  };
  Parser.prototype.parseUnionType = function () {
    this.parseIntersectionType();
    while (true) {
      var t = this.cur();
      if (t.k === 'op' && (t.v === '|' || t.v === '&')) { this.advance(); this.parseIntersectionType(); continue; }
      return;
    }
  };
  Parser.prototype.parseIntersectionType = function () {
    this.parseSimpleType();
  };
  Parser.prototype.parseSimpleType = function () {
    var t = this.cur();
    if (t.k === 'op' && t.v === '...') { this.advance(); this.parseSimpleType(); return; }
    if (t.k === 'op' && t.v === '(') { this.parseFunctionType(); return; }
    if (t.k === 'op' && t.v === '{') { this.parseTableType(); return; }
    if (t.k === 'op' && t.v === '<') {
      this.skipGenerics();
      if (this.isOp('(')) { this.parseFunctionType(); return; }  // <A>(A) -> A
      while (this.isOp('?')) this.advance();
      return;
    }
    if (t.k === 'string') { this.advance(); return; }
    if (t.k === 'number') { this.advance(); return; }
    if (t.k === 'keyword' && (t.v === 'nil' || t.v === 'true' || t.v === 'false')) { this.advance(); return; }
    if (t.k === 'name' || (t.k === 'keyword' && t.v === 'typeof')) {
      this.advance();
      if (t.k === 'keyword' && t.v === 'typeof' && this.isOp('(')) this.skipBalanced('(');
      else if (this.isOp('<')) this.parseGenericArgs();
      // optional marker
      while (this.isOp('?')) { this.advance(); }
      return;
    }
    throw err('Expected type' + this.got(), t);
  };
  Parser.prototype.parseGenericArgs = function () {
    this.expectOp('<');
    var depth = 1;
    while (depth > 0) {
      var t = this.cur();
      if (t.k === 'eof') throw err('Unfinished generic type arguments', t);
      if (t.k === 'op') {
        if (t.v === '<') depth++;
        else if (t.v === '>') { depth--; if (!depth) { this.advance(); return; } }
        else if (t.v === '(' || t.v === '{' || t.v === '[') { this.skipBalanced(t.v); continue; }
        else if (t.v === ',' && depth === 1) { this.advance(); continue; }
      }
      if (t.k === 'name' || (t.k === 'keyword' && t.v === 'typeof')) { this.parseSimpleType(); continue; }
      if (t.k === 'op' && t.v === '...') { this.advance(); continue; }
      this.advance();
    }
  };
  Parser.prototype.parseTableType = function () {
    this.expectOp('{');
    while (!this.isOp('}')) {
      var t = this.cur();
      if (t.k === 'op' && t.v === '[') { this.advance(); this.parseType(); this.expectOp(']'); this.expectOp(':'); this.parseType(); }
      else if (t.k === 'name' && this.isOp(':', 1)) { this.advance(); this.advance(); this.parseType(); }
      else if (t.k === 'op' && t.v === '...') { this.advance(); this.parseType(); }
      else this.parseType();
      if (this.isOp(',') || this.isOp(';')) { this.advance(); continue; }
      break;
    }
    this.expectOp('}');
    while (this.isOp('?')) this.advance();
  };
  Parser.prototype.parseFunctionType = function () {
    this.expectOp('(');
    if (!this.isOp(')')) {
      do {
        if (this.isOp('...')) { this.advance(); if (this.isOp(':')) { this.advance(); this.parseType(); } }
        else if (this.cur().k === 'name' && this.isOp(':', 1)) { this.advance(); this.advance(); this.parseType(); }
        else this.parseType();
        while (this.isOp('?')) this.advance();
      } while (this.isOp(',') && (this.advance(), true));
    }
    this.expectOp(')');
    this.expectOp('->');
    this.parseReturnType();
  };
  Parser.prototype.parseReturnType = function () {
    if (this.isOp('(')) {
      this.advance();
      if (!this.isOp(')')) {
        do {
          if (this.isOp('...')) { this.advance(); this.parseType(); } else this.parseType();
        } while (this.isOp(',') && (this.advance(), true));
      }
      this.expectOp(')');
      // `() -> number` is a function return type, not an empty tuple
      if (this.isOp('->')) { this.advance(); this.parseReturnType(); }
      return;
    }
    this.parseType();
    while (this.isOp('?')) this.advance();
  };

  // ------------------------------------------------------------------ public
  function parse(src, opts) {
    var toks = Lexer.tokenize(src);
    var pr = new Parser(String(src), toks);
    // preserve `--!strict` style directives: they must stay at the top of the file
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.k === 'ws') { if (/\n/.test(t.v)) break; continue; }
      if (t.k === 'comment' && /^--!/.test(t.raw)) pr.hasStrictDirective = true;
      break;
    }
    var rootBlock = pr.parseChunk();
    if (pr.usesEnv) pr.warnings.push('Script touches _G/_ENV/getfenv/setfenv/loadstring — global capture skipped for safety.');
    return {
      ok: true,
      src: String(src),
      toks: toks,
      code: pr.code,
      symbols: pr.symbols,
      refs: pr.refs,
      globals: pr.globals,
      junkPoints: pr.junkPoints,
      warnings: pr.warnings,
      callEnds: pr.callEnds,
      usesEnv: pr.usesEnv,
      hasStrictDirective: pr.hasStrictDirective,
      ast: rootBlock
    };
  }

  return { parse: parse, Scope: Scope, Symbol: Symbol };
});
