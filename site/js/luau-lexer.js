/*!
 * luau-lexer.js — a real Luau lexer (not a regex hack).
 *
 * Handles the full Luau token set: short/long strings, interpolated strings
 * (`hi {name}`), long comments, `--!strict` directives, hex/binary/decimal
 * numbers with digit separators, and every Luau operator.
 *
 * Load with a plain <script> tag (exposes window.LuauLexer) or require() it in Node.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LuauLexer = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var KEYWORDS = new Set([
    'and', 'break', 'continue', 'do', 'else', 'elseif', 'end', 'false', 'for',
    'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return',
    'then', 'true', 'type', 'until', 'while'
  ]);

  // Contextual keywords: only special in specific grammar positions.
  var CONTEXTUAL = new Set(['export', 'typeof']);

  // Longest first — this order matters.
  var OPERATORS = [
    '...', '..=', '..', '==', '~=', '<=', '>=', '::', '->', '=>',
    '+=', '-=', '*=', '/=', '%=', '^=', '//',
    '#', '+', '-', '*', '/', '%', '^', '<', '>', '=', '(', ')', '{', '}',
    '[', ']', ';', ':', ',', '.', '|', '&', '?', '~'
  ];

  var SIMPLE_ESCAPES = {
    a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, '\\': 92, '"': 34, "'": 39, '\n': 10
  };

  function isDigit(c) { return c >= 48 && c <= 57; }
  function isHex(c) {
    return (c >= 48 && c <= 57) || (c >= 97 && c <= 102) || (c >= 65 && c <= 70);
  }
  function isAlpha(c) {
    return (c >= 97 && c <= 122) || (c >= 65 && c <= 90) || c === 95;
  }
  function isAlnum(c) { return isAlpha(c) || isDigit(c); }
  function isSpace(c) { return c === 32 || c === 9 || c === 13 || c === 10 || c === 11 || c === 12; }

  function SyntaxError_(msg, line, col, index) {
    var e = new Error(msg);
    e.name = 'LuauSyntaxError';
    e.line = line; e.col = col; e.index = index;
    return e;
  }

  function Lexer(src) {
    this.src = src;
    this.i = 0;
    this.line = 1;
    this.col = 1;
    this.toks = [];
  }

  Lexer.prototype.peek = function (o) { return this.src.charCodeAt(this.i + (o || 0)); };
  Lexer.prototype.peekStr = function (o) { return this.src.substr(this.i + (o || 0), o === undefined ? 1 : 1); };
  Lexer.prototype.at = function (s) { return this.src.startsWith(s, this.i); };

  Lexer.prototype.advance = function (n) {
    for (var k = 0; k < (n || 1); k++) {
      var c = this.src.charAt(this.i);
      if (c === '\n') { this.line++; this.col = 1; }
      else if (c === '\r') { this.col = 1; }
      else { this.col++; }
      this.i++;
    }
  };

  Lexer.prototype.push = function (k, v, start, line, col, extra) {
    var t = { k: k, v: v, s: start, e: this.i, ln: line, col: col, i: this.toks.length };
    if (extra) for (var key in extra) if (extra[key] !== undefined) t[key] = extra[key];
    this.toks.push(t);
    return t;
  };

  /** Read a long bracket `[==[ ... ]==]`. Returns the raw opening string or null. */
  Lexer.prototype.longBracketOpen = function () {
    if (this.peek() !== 91 /* [ */) return null;
    var j = this.i + 1, eq = 0;
    while (this.src.charCodeAt(j) === 61 /* = */) { eq++; j++; }
    if (this.src.charCodeAt(j) !== 91 /* [ */) return null;
    return { level: eq, len: eq + 2, close: ']' + new Array(eq + 1).join('=') + ']' };
  };

  Lexer.prototype.skipLongBracket = function (open) {
    this.advance(open.len);
    // Luau/Lua skip a newline immediately following the opening bracket.
    if (this.peek() === 10) this.advance(1);
    else if (this.peek() === 13 && this.peek(1) === 10) this.advance(2);
    var closeIdx = this.src.indexOf(open.close, this.i);
    if (closeIdx < 0) throw SyntaxError_('Unfinished long string/comment', this.line, this.col, this.i);
    var raw = this.src.slice(this.i, closeIdx);
    this.i = closeIdx;
    this.advance(open.close.length);
    return raw;
  };

  /** Append the UTF-8 bytes for the character at the cursor and advance past it. */
  Lexer.prototype.consumeChar = function (bytes) {
    var cu = this.peek();
    if (cu >= 0xD800 && cu <= 0xDBFF) {
      var lo = this.peek(1);
      if (lo >= 0xDC00 && lo <= 0xDFFF) {
        pushUtf8(bytes, 0x10000 + ((cu - 0xD800) << 10) + (lo - 0xDC00));
        this.advance(2);
        return;
      }
    }
    if (cu !== cu) { this.advance(1); return; } // NaN => EOF
    pushUtf8(bytes, cu);
    this.advance(1);
  };

  /** Decode a Lua escape sequence into `bytes` (linear, no concat churn). */
  Lexer.prototype.readEscapeInto = function (bytes, interp) {
    // this.i points at the backslash
    var startLine = this.line, startCol = this.col;
    this.advance(1);
    var c = this.src.charAt(this.i);
    if (c === '') throw SyntaxError_('Unfinished string escape', startLine, startCol, this.i);

    if (SIMPLE_ESCAPES[c] !== undefined) { this.advance(1); bytes.push(SIMPLE_ESCAPES[c]); return; }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && this.src.charAt(this.i + 1) === '\n') this.advance(2); else this.advance(1);
      bytes.push(10);
      return;
    }
    if (c === 'z') { // skip following whitespace
      this.advance(1);
      while (isSpace(this.peek())) this.advance(1);
      return;
    }
    if (c === 'x') {
      this.advance(1);
      var h = this.src.substr(this.i, 2);
      if (h.length < 2 || !isHex(this.peek()) || !isHex(this.peek(1))) {
        throw SyntaxError_("Hexadecimal digit expected in '\\x' escape", startLine, startCol, this.i);
      }
      this.advance(2);
      bytes.push(parseInt(h, 16));
      return;
    }
    if (c === 'u' && this.src.charAt(this.i + 1) === '{') {
      this.advance(2);
      var digits = '';
      while (isHex(this.peek())) { digits += this.src.charAt(this.i); this.advance(1); }
      if (this.peek() !== 125 /* } */ || digits === '') {
        throw SyntaxError_("Malformed '\\u{...}' escape", startLine, startCol, this.i);
      }
      this.advance(1);
      var cp = parseInt(digits, 16);
      pushUtf8(bytes, cp > 0x10FFFF ? 0xFFFD : cp);
      return;
    }
    if (isDigit(this.peek())) {
      var d = '';
      for (var n = 0; n < 3 && isDigit(this.peek()); n++) { d += this.src.charAt(this.i); this.advance(1); }
      bytes.push(parseInt(d, 10) & 0xFF);
      return;
    }
    if (interp && (c === '{' || c === '}')) { this.advance(1); bytes.push(c.charCodeAt(0)); return; }
    // Stock Luau tolerates unknown escapes by keeping the character itself.
    bytes.push(c.charCodeAt(0) & 0xFF);
    this.advance(1);
    return;
  };

  function pushUtf8(arr, cp) {
    if (cp < 0x80) { arr.push(cp); return; }
    if (cp < 0x800) { arr.push(0xC0 | (cp >> 6), 0x80 | (cp & 0x3F)); return; }
    if (cp < 0x10000) { arr.push(0xE0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F)); return; }
    arr.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
  }
  function utf8(cp) { var a = []; pushUtf8(a, cp); return a; }

  /** Lex a short string ('...' or "...") into bytes. */
  Lexer.prototype.lexShortString = function (type, line, col) {
    var start = this.i;
    var quote = this.peek();
    this.advance(1);
    var bytes = [];
    while (true) {
      var c = this.peek();
      if (c !== c) throw SyntaxError_('Unfinished string', line, col, start); // NaN => EOF
      if (c === 10 || c === 13) throw SyntaxError_('Unfinished string', line, col, start);
      if (c === 92 /* \ */) { this.readEscapeInto(bytes, false); continue; }
      if (c === quote) { this.advance(1); break; }
      this.consumeChar(bytes);
    }
    return this.push('string', bytesToStr(bytes), start, line, col, { sub: type, bytes: bytes });
  };

  Lexer.prototype.lexLongString = function (open, line, col) {
    var start = this.i;
    var raw = this.skipLongBracket(open);
    return this.push('string', raw, start, line, col, { sub: 'long', bytes: strToBytes(raw) });
  };

  /** Clone a token (interpolation parts own their own copies). */
  function cloneTok(t) {
    var c = {};
    for (var k in t) c[k] = t[k];
    return c;
  }

  // Tokens inside interpolations live outside the main token array, so they get
  // their own (negative, collision-free) indices. The obfuscator keys every
  // rewrite off `tok.i`, which is what makes renaming work inside `{}`.
  var interpSeq = 0;
  var interpGroupSeq = 0;
  function renumber(list) {
    var base = ++interpSeq;
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (t._ri) continue;
      t._ri = 1;
      t.i = -(base * 1000003 + i);
      if (t.parts) {
        for (var p = 0; p < t.parts.length; p++) {
          if (t.parts[p].kind === 'expr') renumber(t.parts[p].toks);
        }
      }
    }
  }

  /**
   * Tokens pushed while any interpolation frame is open belong to the innermost
   * enclosing `{ ... }` group — otherwise nested interpolated strings would leak
   * into the top-level token stream.
   */
  Lexer.prototype.currentGroup = function (stack) {
    for (var i = stack.length - 1; i >= 0; i--) {
      if (stack[i].mode === 'expr') return stack[i].groupId;
    }
    return 0;
  };

  /** Literal-mode scan: consume text until `{` or the closing backtick. */
  Lexer.prototype.lexInterpLiteral = function (frame) {
    while (true) {
      var c = this.peek();
      if (c !== c) throw SyntaxError_('Unfinished interpolated string', frame.line, frame.col, frame.start);
      if (c === 10 || c === 13) {
        throw SyntaxError_('Malformed string: interpolated strings cannot span lines', frame.line, frame.col, frame.start);
      }
      if (c === 96 /* ` */) { // closing backtick
        this.advance(1);
        frame.pendingClose = true;
        return;
      }
      if (c === 92 /* \ */) { this.readEscapeInto(frame.bytes, true); continue; }
      if (c === 123 /* { */) { frame.mode = 'expr'; return; }
      this.consumeChar(frame.bytes);
    }
  };

  Lexer.prototype.lexComment = function (line, col, start) {
    start = start === undefined ? this.i : start;
    line = line === undefined ? this.line : line;
    col = col === undefined ? this.col : col;
    this.advance(2); // --
    var open = this.longBracketOpen();
    var text;
    if (open) {
      text = this.skipLongBracket(open);
    } else {
      var end = this.src.indexOf('\n', this.i);
      text = end < 0 ? this.src.slice(this.i) : this.src.slice(this.i, end);
      this.i = end < 0 ? this.src.length : end;
    }
    return this.push('comment', text, start, line, col, { raw: this.src.slice(start, this.i) });
  };

  Lexer.prototype.lexNumber = function (line, col) {
    var start = this.i;
    var c0 = this.src.charAt(this.i), c1 = this.src.charAt(this.i + 1);
    var hexMode = false;
    if (c0 === '0' && (c1 === 'x' || c1 === 'X')) {
      hexMode = true;
      this.advance(2);
      if (!isHex(this.peek())) throw SyntaxError_('Malformed number', line, col, start);
      while (isHex(this.peek()) || this.peek() === 95) this.advance(1);
    } else if (c0 === '0' && (c1 === 'b' || c1 === 'B')) {
      this.advance(2);
      var any = false;
      while (this.peek() === 48 || this.peek() === 49 || this.peek() === 95) { any = true; this.advance(1); }
      if (!any) throw SyntaxError_('Malformed number', line, col, start);
    } else {
      while (isDigit(this.peek()) || this.peek() === 95) this.advance(1);
      if (this.peek() === 46) { // .
        this.advance(1);
        while (isDigit(this.peek()) || this.peek() === 95) this.advance(1);
      }
      var ec = this.peek();
      if (ec === 101 || ec === 69) { // e/E
        this.advance(1);
        if (this.peek() === 43 || this.peek() === 45) this.advance(1);
        if (!isDigit(this.peek())) throw SyntaxError_('Malformed number', line, col, start);
        while (isDigit(this.peek()) || this.peek() === 95) this.advance(1);
      }
    }
    var raw = this.src.slice(start, this.i);
    // Trailing alpha (e.g. `1abc`) is a malformed number, like real Luau.
    if (isAlnum(this.peek())) throw SyntaxError_('Malformed number', line, col, start);
    var value = hexMode ? parseInt(raw.replace(/_/g, '').slice(2), 16) : (raw.startsWith('0b') || raw.startsWith('0B')
      ? parseInt(raw.replace(/_/g, '').slice(2), 2)
      : parseFloat(raw.replace(/_/g, '')));
    return this.push('number', value, start, line, col, { raw: raw, isInt: Number.isInteger(value) });
  };

  Lexer.prototype.run = function () {
    var src = this.src;
    var stack = []; // interpolation frames

    while (this.i < src.length) {
      var frame = stack.length ? stack[stack.length - 1] : null;

      // ---- inside `...` literal text
      if (frame && frame.mode === 'lit') {
        this.lexInterpLiteral(frame);
        if (frame.pendingClose) { this.closeInterp(stack); continue; }
        if (frame.mode === 'expr') {
          if (frame.bytes.length) { frame.parts.push({ kind: 'lit', bytes: frame.bytes }); frame.bytes = []; }
          frame.depth = 1;
          frame.startIdx = this.toks.length;
          frame.groupId = ++interpGroupSeq;
          this.advance(1); // consume '{'
        }
        continue;
      }

      var line = this.line, col = this.col, start = this.i;
      var c = this.peek();

      // ---- inside `{ ... }` of an interpolation
      var group = this.currentGroup(stack);
      if (frame && frame.mode === 'expr') {
        if (c === 125 /* } */) {
          frame.depth--;
          if (frame.depth === 0) {
            var sub = [];
            for (var q = frame.startIdx; q < this.toks.length; q++) {
              // skip tokens that belong to a nested interpolation expression
              if (this.toks[q]._interp !== frame.groupId) continue;
              var cl = cloneTok(this.toks[q]);
              if (cl.raw === undefined) cl.raw = src.slice(cl.s, cl.e);
              sub.push(cl);
            }
            renumber(sub);
            if (!sub.length) throw SyntaxError_("Malformed interpolated string, expected expression inside '{}'", line, col, start);
            frame.parts.push({ kind: 'expr', toks: sub });
            frame.mode = 'lit';
            this.advance(1);
            continue;
          }
          this.advance(1);
          this.push('op', '}', start, line, col, { _interp: group });
          continue;
        }
        if (c === 123 /* { */) { frame.depth++; this.advance(1); this.push('op', '{', start, line, col, { _interp: group }); continue; }
      }

      // whitespace
      if (isSpace(c)) {
        while (isSpace(this.peek())) this.advance(1);
        this.push('ws', src.slice(start, this.i), start, line, col, group ? { _interp: group } : null);
        continue;
      }
      // comment
      if (c === 45 && this.peek(1) === 45) {
        var ct = this.lexComment(line, col, start);
        if (group) ct._interp = group;
        continue;
      }
      // long string
      if (c === 91) {
        var open = this.longBracketOpen();
        if (open) { var lt = this.lexLongString(open, line, col); if (group) lt._interp = group; continue; }
      }
      // interpolated string (possibly nested)
      if (c === 96) {
        this.advance(1);
        var it = this.push('string', '', start, line, col, group ? { sub: 'interp', parts: [], _interp: group } : { sub: 'interp', parts: [] });
        stack.push({ token: it, parts: it.parts, bytes: [], mode: 'lit', depth: 0, startIdx: 0, line: line, col: col, start: start });
        continue;
      }
      // short string
      if (c === 34 || c === 39) { var st = this.lexShortString(c === 34 ? 'dquote' : 'squote', line, col); if (group) st._interp = group; continue; }
      // number
      if (isDigit(c) || (c === 46 && isDigit(this.peek(1)))) { var nt = this.lexNumber(line, col); if (group) nt._interp = group; continue; }
      // identifier / keyword
      if (isAlpha(c)) {
        while (isAlnum(this.peek())) this.advance(1);
        var word = src.slice(start, this.i);
        var wt = this.push(KEYWORDS.has(word) ? 'keyword' : 'name', word, start, line, col,
          { contextual: CONTEXTUAL.has(word) });
        if (group) wt._interp = group;
        continue;
      }
      // operator
      var matched = null;
      for (var k = 0; k < OPERATORS.length; k++) {
        if (this.at(OPERATORS[k])) { matched = OPERATORS[k]; break; }
      }
      if (matched) {
        this.advance(matched.length);
        var ot = this.push('op', matched, start, line, col);
        if (group) ot._interp = group;
        continue;
      }

      throw SyntaxError_("Unexpected character '" + src.charAt(this.i) + "'", line, col, start);
    }

    if (stack.length) {
      var f0 = stack[0];
      throw SyntaxError_('Unfinished interpolated string', f0.line, f0.col, f0.start);
    }

    this.push('eof', '<eof>', this.i, this.line, this.col);
    var all = this.toks;
    var out = [];
    for (var z = 0; z < all.length; z++) if (!all[z]._interp) out.push(all[z]);
    return out;
  };

  Lexer.prototype.closeInterp = function (stack) {
    var frame = stack.pop();
    if (frame.bytes.length) { frame.parts.push({ kind: 'lit', bytes: frame.bytes }); frame.bytes = []; }
    if (frame.mode === 'expr') {
      throw SyntaxError_("Malformed interpolated string; did you forget to add a '}'?", frame.line, frame.col, frame.start);
    }
    frame.token.e = this.i;
    frame.token.raw = this.src.slice(frame.token.s, this.i);
    var self = this;
    var preview = frame.parts.map(function (p) {
      return p.kind === 'lit'
        ? bytesToStr(p.bytes)
        : '{' + p.toks.map(function (t) { return self.src.slice(t.s, t.e); }).join('') + '}';
    }).join('');
    frame.token.v = preview;
  };

  function bytesToStr(bytes) {
    var out = [], i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      if (b < 0x80) { out.push(b); i += 1; continue; }
      var extra = b >= 0xF0 ? 3 : b >= 0xE0 ? 2 : b >= 0xC0 ? 1 : 0;
      if (extra === 0 || i + extra >= bytes.length) { out.push(b); i += 1; continue; }
      var cp = (b & (extra === 3 ? 0x07 : extra === 2 ? 0x0F : 0x1F));
      for (var k = 1; k <= extra; k++) cp = (cp << 6) | (bytes[i + k] & 0x3F);
      // encode back to UTF-16 (surrogate pair when needed)
      if (cp > 0xFFFF) {
        cp -= 0x10000;
        out.push(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
      } else {
        out.push(cp);
      }
      i += extra + 1;
    }
    var s = '';
    for (var j = 0; j < out.length; j += 4096) s += String.fromCharCode.apply(null, out.slice(j, j + 4096));
    return s;
  }
  function strToBytes(str) {
    var b = [];
    for (var i = 0; i < str.length; i++) {
      var cu = str.charCodeAt(i);
      if (cu >= 0xD800 && cu <= 0xDBFF && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) {
          pushUtf8(b, 0x10000 + ((cu - 0xD800) << 10) + (lo - 0xDC00));
          i++;
          continue;
        }
      }
      pushUtf8(b, cu);
    }
    return b;
  }

  /** Public: tokenize(source) -> token[] (throws LuauSyntaxError) */
  function tokenize(src) {
    src = String(src);
    var lx = new Lexer(src);
    var toks = lx.run();
    // attach raw text to every token (including interpolation bodies) so the
    // printer can reproduce input verbatim
    var all = lx.toks;
    for (var i = 0; i < all.length; i++) {
      if (all[i].raw === undefined) all[i].raw = src.slice(all[i].s, all[i].e);
    }
    toks.src = src;
    return toks;
  }

  return {
    tokenize: tokenize,
    KEYWORDS: KEYWORDS,
    OPERATORS: OPERATORS,
    bytesToStr: bytesToStr,
    strToBytes: strToBytes,
    utf8: utf8,
    SyntaxError: SyntaxError_
  };
});
