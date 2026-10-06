/*
 * Darkfuscator — VM emitter.
 *
 * Turns the bytecode produced by vm-compile.js into a self-contained Luau
 * program shaped like a Luraph/Brander build:
 *
 *   -- This file is protected by Darkfuscator
 *   return ({["aB"]=(function(S,B)…end), … ["pAy"]="<encrypted blob>"}):entry(env)
 *
 * The program is serialised to bytes, encrypted with a per-build key stream and
 * packed six bits to the character. One table slot holds one opcode handler, so
 * there is no single interpreter function to read: control flow only exists in
 * the dispatch chain and inside the handlers.
 *
 * Every operation is carried out by a native Luau operator, so metamethods,
 * coercion, integer semantics, coroutines, pcall and error messages behave
 * exactly as they do in the original script.
 */
;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DarkfuscatorVMEmit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var OPS = ['LOADK', 'LOADNIL', 'LOADBOOL', 'MOVE', 'BOX',
    'NEWTABLE', 'GETTABLE', 'SETTABLE', 'SETLISTM',
    'GETUPVAL', 'SETUPVAL', 'GETGLOBAL', 'SETGLOBAL',
    'ADD', 'SUB', 'MUL', 'DIV', 'IDIV', 'MOD', 'POW',
    'UNM', 'NOT', 'LEN', 'CONCAT',
    'EQ', 'LT', 'LE', 'TEST', 'JMP',
    'FORPREP', 'FORLOOP', 'TFORCALL',
    'CALL', 'CALLM', 'RETURN', 'RETURNT', 'RETURNV',
    'CLOSURE', 'VARARG', 'VARARGN', 'SELF', 'RETURNM'];

  var KEYWORDS = ('and break continue do else elseif end false for function if in local nil not or ' +
    'repeat return then true until while type typeof export').split(' ');
  var KW = {};
  for (var ki = 0; ki < KEYWORDS.length; ki++) KW[KEYWORDS[ki]] = 1;

  // ------------------------------------------------------------------ helpers
  // 'short' keeps names to one or two characters, 'random' is the default mix,
  // 'confuse' draws from glyphs that are easy to mix up when reading the file
  // `first` never contains a digit: a generated name has to start with a letter
  var NAME_STYLES = {
    short:   { first: 'abcdefghijklmnopqrstuvwxyz', rest: 'abcdefghijklmnopqrstuvwxyz0123456789', max: 2 },
    random:  { first: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
               rest: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', max: 4 },
    confuse: { first: 'ilILoOuvVwWxXyY', rest: 'ilIL1oO0uvVwWxXyYsS5zZ2', max: 4 }
  };

  // Identifiers the emitter hard-codes inside the interpreter bodies (locals,
  // loop variables, handler parameters). A generated name that matched one of
  // these would be shadowed by that local — e.g. a program table called `I`
  // disappears behind `local I=code[F.ip]`, and every handler call turns into
  // "attempt to call a nil value". Reserve them, plus every one-letter name.
  var RESERVED = ('a b c d e f g h i j k l m n o p q r s t u v w x y z ' +
    'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ' +
    'acc args by ip it len li ms mt na nb nc nk np nr nu nv nx nz q res st tn va value vr ' +
    'OPC _ENV _G __iter').split(' ');

  function nameGen(rng, taken, style) {
    var used = Object.create(null);
    for (var r0 = 0; r0 < RESERVED.length; r0++) used[RESERVED[r0]] = 1;
    if (taken) for (var k0 in taken) used[k0] = 1;
    var st = NAME_STYLES[style] || NAME_STYLES.random;
    var first = st.first, rest = st.rest, max = st.max;
    var n = 0;
    return function () {
      for (var t = 0; t < 500; t++) {
        var len = 2 + Math.floor(rng() * Math.max(1, max - 1));
        if (max > 2 && rng() < 0.35) len = Math.min(max, len + 1);
        if (len < 2) len = 2;
        var s = first.charAt(Math.floor(rng() * first.length));
        for (var i = 1; i < len; i++) s += rest.charAt(Math.floor(rng() * rest.length));
        if (KW[s] || used[s]) continue;
        used[s] = 1;
        return s;
      }
      return 'x' + (++n);
    };
  }

  function utf8Bytes(s) {
    var out = [], i, c;
    for (i = 0; i < s.length; i++) {
      c = s.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
        var c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++;
          continue;
        }
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      } else out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return out;
  }

  function numText(v) {
    if (Object.is(v, -0)) return '-0';
    if (v === Infinity) return '1e999';
    if (v === -Infinity) return '-1e999';
    if (Number.isNaN(v)) return '0/0';
    if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
    return String(v.toPrecision(17));
  }

  // --------------------------------------------------------------- serialiser
  function serialize(root, rng) {
    var bytes = [];
    // zigzag varint: operands are signed (jump offsets are negative when the
    // target precedes the instruction, e.g. FORLOOP/loop-back JMP/TFORCALL)
    function vi(v) {
      v = v < 0 ? -2 * Math.ceil(v) - 1 : 2 * Math.floor(v);
      while (v >= 128) { bytes.push((v % 128) | 128); v = Math.floor(v / 128); }
      bytes.push(v);
    }
    function b(v) { bytes.push(v & 255); }
    function str(s) { var a = utf8Bytes(s); vi(a.length); for (var i = 0; i < a.length; i++) b(a[i]); }
    function proto(p) {
      vi(p.nparams); b(p.isvararg ? 1 : 0); vi(p.maxreg + 1); vi(p.ups.length);
      vi(p.k.length);
      for (var i = 0; i < p.k.length; i++) {
        var k = p.k[i];
        if (k.t === 'z') b(0);
        else if (k.t === 'b') { b(1); b(k.v ? 1 : 0); }
        else if (k.t === 'n') { b(2); str(numText(k.v)); }
        else if (k.b) { b(3); vi(k.b.length); for (var qb = 0; qb < k.b.length; qb++) b(k.b[qb]); }
        else { b(3); str(k.v); }
      }
      vi(p.code.length);
      for (var j = 0; j < p.code.length; j++) {
        var ins = p.code[j];
        vi(ins[0]); vi(ins[1]); vi(ins[2]); vi(ins[3]);
        if (ins.x && ins.x.length) { vi(ins.x.length); for (var q = 0; q < ins.x.length; q++) vi(ins.x[q]); }
        else vi(0);
      }
      vi(p.kids.length);
      for (var m = 0; m < p.kids.length; m++) proto(p.kids[m]);
    }
    proto(root);

    // build-time rolling checksums over the *decrypted* bytes; the generated
    // decoder recomputes both after decryption and refuses a tampered payload
    var c1 = 0, c2 = 0;
    for (var ci = 0; ci < bytes.length; ci++) {
      c1 = (c1 + bytes[ci] * (ci + 1)) % 65521;
      c2 = (c2 + (((bytes[ci] + ((ci + 1) * 17)) % 256) * (ci + 3))) % 65519;
    }

    var key = 1 + Math.floor(rng() * 254);
    // the audit seal: the decoder cannot unseal the payload without this
    // value, and it is handed over only by the passing environment audit, so
    // a build with the audit stripped out never decrypts (fail closed)
    var seal = 100 + Math.floor(rng() * 65000);
    for (var i = 0; i < bytes.length; i++) bytes[i] = (bytes[i] + key + (i + 1) * 13 + seal) % 256;

    // second layer: a per-build XOR stream, applied after the add-cipher
    // (the decoder un-XORs first, then un-adds)
    var xk = 1 + Math.floor(rng() * 254);
    for (i = 0; i < bytes.length; i++) bytes[i] = bytes[i] ^ ((xk + (i + 1) * 37 + seal) % 256);

    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');
    for (var s = alpha.length - 1; s > 0; s--) {           // per-build alphabet shuffle
      var r = Math.floor(rng() * (s + 1));
      var t = alpha[s]; alpha[s] = alpha[r]; alpha[r] = t;
    }
    var acc = 0, nb = 0, out = [];
    for (i = 0; i < bytes.length; i++) {
      acc += bytes[i] * Math.pow(2, nb);
      nb += 8;
      while (nb >= 6) {
        out.push(alpha[acc % 64]);
        acc = (acc - (acc % 64)) / 64;
        nb -= 6;
      }
    }
    if (nb > 0) out.push(alpha[acc % 64]);
    return { payload: out.join(''), alphabet: alpha.join(''), key: key, xk: xk, seal: seal, bytes: bytes.length, check1: c1, check2: c2 };
  }

  // ----------------------------------------------------------------- handlers
  // must match RKBASE in vm-compile.js
  var RKBASE = 100000;
  function rk(v, pos) {
    return 'local ' + v + '=I[' + pos + ']; if ' + v + '>=' + RKBASE + ' then ' + v + '=K[' + v + '-' + (RKBASE - 1) +
      '] else ' + v + '=R[' + v + '] end';
  }
  function arith(op) {
    return 'do ' + rk('b', 3) + ' ' + rk('c', 4) + ' R[I[2]]=b' + op + 'c end';
  }
  function cmp(op) {
    return 'do ' + rk('b', 3) + ' ' + rk('c', 4) + ' if (b' + op + 'c)==(I[2]==1) then return F.ip+2 end end';
  }
  function numerr(what, reg) {
    return 'if type(' + reg + ')~="number" then ' + reg + '=tonumber(' + reg + ') or ' +
      'error("invalid \'for\' ' + what + ' (number expected, got "..type(' + reg + ')..")") end';
  }

  var HANDLERS = {
    LOADK: 'R[I[2]]=K[I[3]+1]',
    LOADNIL: 'for i=I[2],I[3] do R[i]=nil end',
    LOADBOOL: 'R[I[2]]=I[3]==1',
    MOVE: 'R[I[2]]=R[I[3]]',
    // idempotent: `local f = function() ... end` inside a loop emits BOX on
    // every pass, but an already-boxed slot must not be boxed again
    BOX: 'do local v=R[I[2]]; if getmetatable(v)~=S.BOX then R[I[2]]=setmetatable({[1]=v},S.BOX) end end',
    NEWTABLE: 'R[I[2]]={}',
    GETTABLE: 'do ' + rk('b', 3) + ' ' + rk('c', 4) + ' R[I[2]]=b[c] end',
    SETTABLE: 'do ' + rk('b', 3) + ' ' + rk('c', 4) + ' R[I[2]][b]=c end',
    // table.move pre-sizes the array part, which matters when the list has
    // holes: `#{ ... }` has to agree with what Luau's own SETLIST produces
    SETLISTM: 'do ' + rk('c', 4) + ' local t=R[I[2]]; local n=I[3]; local cn=c.n or #c; ' +
      'if cn>0 then table.move(c, 1, cn, n, t) end end',
    GETUPVAL: 'R[I[2]]=U[I[3]+1][1]',
    SETUPVAL: 'U[I[3]+1][1]=R[I[2]]',
    GETGLOBAL: 'R[I[2]]=S.E[K[I[3]+1]]',
    SETGLOBAL: 'S.E[K[I[3]+1]]=R[I[2]]',
    ADD: arith('+'), SUB: arith('-'), MUL: arith('*'), DIV: arith('/'),
    IDIV: arith('//'), MOD: arith('%'), POW: arith('^'),
    UNM: 'do ' + rk('c', 3) + ' R[I[2]]=-c end',
    NOT: 'do ' + rk('c', 3) + ' R[I[2]]=not c end',
    LEN: 'do ' + rk('c', 3) + ' R[I[2]]=#c end',
    CONCAT: 'do local s=R[I[3]]; for i=I[3]+1,I[4] do s=s..R[i] end; R[I[2]]=s end',
    EQ: cmp('=='), LT: cmp('<'), LE: cmp('<='),
    TEST: 'if (R[I[2]] and true or false)==(I[3]==1) then return F.ip+2 end',
    JMP: 'return F.ip+I[2]',
    FORPREP: 'do local a=I[2]; local i,li,st=R[a],R[a+1],R[a+2]; ' +
      numerr('initial value', 'i') + ' ' + numerr('limit', 'li') + ' ' + numerr('step', 'st') +
      ' R[a],R[a+1],R[a+2],R[a+3]=i,li,st,i; ' +
      'if not ((st>=0) and (i<=li) or (st<0) and (i>=li)) then return F.ip+I[3] end end',
    FORLOOP: 'do local a=I[2]; local i=R[a+3]+R[a+2]; local li,st=R[a+1],R[a+2]; ' +
      'if (st>=0) and (i<=li) or (st<0) and (i>=li) then R[a+3]=i; return F.ip+I[3] end end',
    TFORCALL: 'do local a=I[2]; local nv=I[4]; local f,s,v=R[a],R[a+1],R[a+2]; ' +
      'if type(f)~="function" then local mt=getmetatable(f); local it=mt and mt.__iter; ' +
      'if it then f,s,v=it(f); R[a],R[a+1],R[a+2]=f,s,v end end; ' +
      'local t=table.pack(f(s,v)); if t[1]==nil then return F.ip+I[3] end; R[a+2]=t[1]; ' +
      'for i=1,nv do R[a+3+i-1]=t[i] end end',
    CALL: 'do local a,nr,nc=I[2],I[3],I[4]; local na=nr-1; local args={}; ' +
      'for i=1,na do args[i]=R[a+i] end; local res=table.pack(R[a](unpack(args,1,na))); ' +
      'if nc==0 then R[a]=setmetatable(res,S.MT) else for i=1,nc-1 do R[a+i-1]=res[i] end end end',
    CALLM: 'do local a,nr,nc=I[2],I[3],I[4]; local na=nr-2; local args={}; ' +
      'for i=1,na do args[i]=R[a+i] end; local t=R[a+nr-1]; local tn=t.n; ' +
      'for i=1,tn do args[na+i]=t[i] end; ' +
      'local res=table.pack(R[a](unpack(args,1,na+tn))); ' +
      'if nc==0 then R[a]=setmetatable(res,S.MT) else for i=1,nc-1 do R[a+i-1]=res[i] end end end',
    // RETURN A B: results are R[A] .. R[A+B-2] (B is nresults+1); F.o is the
    // index *before* the first result, which is what the loop's unpack uses
    RETURN: 'F.d=true;F.r=R;F.o=I[2]-1;F.n=I[3]-1',
    RETURNT: 'do local t=R[I[2]]; F.d=true; F.r=t; F.o=0; F.n=t.n end',
    // RETURN A B: R[A]..R[A+B-2] plus the multi-value tuple in R[A+B-1] —
    // `return x, ...` and `return x, f()` keep every result of the expansion
    RETURNM: 'do local a,b=I[2],I[3]; local t={}; local k=0; ' +
      'for i=0,b-2 do t[k+1]=R[a+i]; k=k+1 end; ' +
      'local last=R[a+b-1]; ' +
      'if getmetatable(last)==S.MT then for i=1,last.n do t[k+i]=last[i] end; k=k+last.n ' +
      'else t[k+1]=last; k=k+1 end; ' +
      't.n=k; F.d=true; F.r=t; F.o=0; F.n=k end',
    RETURNV: 'do local v=F.V; F.d=true; F.r=v; F.o=0; F.n=v.n end',
    CLOSURE: 'do local a=I[2]; local p=F.P[6][I[3]+1]; local x=I[5]; local u={}; ' +
      'if x then for i=1,#x,2 do if x[i]==1 then u[(i+1)/2]=R[x[i+1]] else u[(i+1)/2]=U[x[i+1]+1] end end end; ' +
      'R[a]=S.mk(S,p,u) end',
    VARARG: 'do local a,b=I[2],I[3]; local v=F.V; if b==0 then local t={}; ' +
      'for i=1,v.n do t[i]=v[i] end; t.n=v.n; R[a]=setmetatable(t,S.MT) ' +
      'else for i=1,b-1 do R[a+i-1]=v[i] end end end',
    VARARGN: 'R[I[2]]=F.V.n',
    SELF: 'do ' + rk('c', 4) + ' R[I[2]+1]=R[I[3]]; R[I[2]]=R[I[3]][c] end'
  };

  // -------------------------------------------------------------------- emit
  function emit(program, opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random;
    // 0 = off, 1 = standard sanity audit, 2 = strict (adds injector-toolkit
    // detection, an environment write-trap and runtime bytecode checksums)
    var glevel = opts.guard === 2 ? 2 : opts.guard === 0 ? 0 : 1;
    // anti-environment level: 0 = off, 1 = environment-derived seal,
    // 2 = full probe battery (identity contradictions + service signatures)
    var elevel = opts.envChecks === 0 ? 0 : opts.envChecks === 1 ? 1 : 2;
    if (opts.envLock && elevel < 2) elevel = 2;
    var ng = nameGen(rng, null, opts.nameStyle);
    var usedOps = Object.create(null);
    (function walk(p) {
      for (var i = 0; i < p.code.length; i++) usedOps[p.code[i][0]] = 1;
      for (var j = 0; j < p.kids.length; j++) walk(p.kids[j]);
    })(program);

    // decoy game logic: realistic Roblox strings are woven into an unreachable
    // part of the constant pool; real bytecode never references them, so with
    // the lazy-string layer they are never even decoded, but anyone lifting the
    // program sees genuine-looking game calls mixed into the real ones
    if (opts.junk >= 1) {
      var DECOY_POOL = [
        'leaderstats', 'RemoteEvent', 'FireServer', 'DataStoreService',
        'GetDataStore', 'SetAsync', 'TouchEnded', 'RunService',
        'Heartbeat', 'Humanoid', 'WalkSpeed', 'LoadCharacter',
        'ReplicatedStorage', 'Players', 'RequestLoadData', 'Value'
      ];
      var ndec = 6 + Math.floor(rng() * 5);
      var usedD = {};
      for (var di = 0; di < ndec; di++) {
        var dp;
        do { dp = DECOY_POOL[Math.floor(rng() * DECOY_POOL.length)]; } while (usedD[dp]);
        usedD[dp] = 1;
        program.k.push({ t: 's', v: dp });
      }
    }
    var blob = serialize(program, rng);
    // silent-failure scramble value: any detected tamper rewrites the seal
    // to this instead of raising a patchable, brandable error message
    var scrG = String((blob.seal + 91 + (blob.key % 89)) % 256);
    // per-build mask for the lazy string-constant layer
    var strMask = 1 + Math.floor(rng() * 254);
    var vtl = ng();

    // random 16-bit opcode ids, one per opcode, unique
    var ids = [], seen = Object.create(null), i;
    for (i = 0; i < OPS.length; i++) {
      var v;
      do { v = 1 + Math.floor(rng() * 0xFFFE); } while (seen[v]);
      seen[v] = 1;
      ids.push(v);
    }
    var deadIds = [];
    for (i = 0; i < (opts.junk === 2 ? 30 : opts.junk === 1 ? 12 : 0); i++) {
      var dv;
      do { dv = 1 + Math.floor(rng() * 0xFFFE); } while (seen[dv]);
      seen[dv] = 1;
      deadIds.push(dv);
    }

    var N = {
      blob: ng(), alpha: ng(), dec: ng(), mk: ng(), run: ng(), entry: ng(),
      env: ng(), mt: ng(), box: ng(),
      check1: ng(), check2: ng(), guard: ng(), seal: ng(), strmark: ng()
    };
    var H = {};
    for (i = 0; i < OPS.length; i++) H[OPS[i]] = ng();

    var P = { s: ng(), b: ng(), p: ng(), u: ng(), f: ng(), i: ng() };
    var L = { r: ng(), k: ng(), c: ng(), ip: ng(), i: ng(), t: ng(), n: ng(), a: ng(), o: ng(), m: ng(), e: ng(), g: ng() };

    var out = [];
    function line(s) { out.push(s); }

    // a comment must end with a newline even when the rest is minified
    if (opts.watermark !== false) out.push('-- This file is protected by Darkfuscator\n');
    // wrapReturn lets the caller append top-level statements (heavy junk)
    // after the build: `return` is only legal as the last statement of a
    // block, so the whole table-return is wrapped in a do-end
    line(opts.wrapReturn ? 'do return ({' : 'return ({');

    // ---------------------------------------------------------- payload slots
    line('["' + N.blob + '"]=' + JSON.stringify(blob.payload) + ',');
    line('["' + N.check1 + '"]=' + blob.check1 + ',');
    line('["' + N.check2 + '"]=' + blob.check2 + ',');
    line('["' + N.alpha + '"]="' + blob.alphabet + '",');

    // ---------------------------------------------------------------- decoder
    line('["' + N.dec + '"]=(function(' + P.s + ',' + P.b + ')');
    line('local ' + L.a + '=' + P.s + '["' + N.alpha + '"]');
    line('local ' + L.m + '={}');
    line('for ' + L.i + '=1,#' + L.a + ' do ' + L.m + '[' + L.a + ':sub(' + L.i + ',' + L.i + ')]=' + L.i + '-1 end');
    line('local ' + L.o + '={}');
    line('local ' + L.n + ',acc,nb=0,0,0');
    line('for ' + L.i + '=1,#' + P.b + ' do');
    line('acc=acc+' + L.m + '[' + P.b + ':sub(' + L.i + ',' + L.i + ')]*(2^nb)');
    line('nb=nb+6');
    line('while nb>=8 do ' + L.n + '=' + L.n + '+1; ' + L.o + '[' + L.n + ']=acc%256; acc=(acc-acc%256)/256; nb=nb-8 end');
    line('end');
        line('for ' + L.i + '=1,' + L.n + ' do ' + L.o + '[' + L.i + ']=math.floor(' + L.o + '[' + L.i + ']) end');
    line('for ' + L.i + '=1,' + L.n + ' do ' + L.o + '[' + L.i + ']=bit32.bxor(' + L.o + '[' + L.i + '],(' + blob.xk + '+(' + L.i + '*37)+' + (glevel >= 1 ? P.s + '["' + N.seal + '"]' : blob.seal) + ')%256) end');
    line('for ' + L.i + '=1,' + L.n + ' do ' + L.o + '[' + L.i + ']=(' + L.o + '[' + L.i + ']-' + blob.key + '-' + L.i + '*13-' + (glevel >= 1 ? P.s + '["' + N.seal + '"]' : blob.seal) + ')%256 end');
    line('local c1,c2=0,0');
    line('for ' + L.i + '=1,' + L.n + ' do c1=(c1+' + L.o + '[' + L.i + ']*' + L.i + ')%65521; c2=(c2+(((' + L.o + '[' + L.i + ']+(' + L.i + '*17))%256)*(' + L.i + '+2)))%65519 end');
    line('if c1~=' + P.s + '["' + N.check1 + '"] or c2~=' + P.s + '["' + N.check2 + '"] then for dp=1,' + L.n + ' do ' + L.o + '[dp]=(' + L.o + '[dp]+dp*17)%256 end end');

    line('local ' + L.c + '=' + L.o);
    line('local p=1');
    line('local function by() local v=' + L.c + '[p]; p=p+1; return v end');
    // reads are zigzag encoded (see `vi`) so that jump offsets can go backwards
    line('local function vr() local v,s=0,1 while true do local b=' + L.c + '[p]; p=p+1; v=v+(b%128)*s if b<128 then break end s=s*128 end if v%2==1 then v=-(v+1)/2 else v=v/2 end return v end');
    line('local function st() local n=vr(); if n==0 then return "" end; local t={}; local q=1; while q<=n do');
    line('local len=n-q+1; if len>2000 then len=2000 end; local u={}');
    line('for j=1,len do u[j]=' + L.c + '[p+j-1] end; p=p+len; t[#t+1]=string.char(unpack(u)); q=q+len end');
    line('return table.concat(t) end');
    line('local OPC={' + ids.join(',') + '}');
    // string constants are stored encoded inside the payload and are only
    // decoded through a metatable the first time a handler actually reads
    // them: a dump of the decoded program no longer reveals string literals
    line('local function sdec(e) local t={} for j=1,#e.b do t[j]=bit32.bxor(e.b[j],(' + strMask + '+j*29)%256) end return string.char(unpack(t)) end');
    line('local function proto()');
    line('local np=vr(); local va=by()==1; local ms=vr(); local nu=vr()');
    line('local nk=vr(); local k={}');
    line('for i=1,nk do local t=by()');
    line('if t==0 then k[i]=nil elseif t==1 then k[i]=by()==1 elseif t==2 then k[i]=tonumber(st()) else local sv=st(); local eb={} for j=1,#sv do eb[j]=bit32.bxor(sv:byte(j),(' + strMask + '+j*29)%256) end k[i]={["' + N.strmark + '"]=true,b=eb} end end');
    line('local nc=vr(); local c={}');
    line('for i=1,nc do local o=OPC[vr()+1]; local A=vr(); local B=vr(); local C=vr(); local nx=vr()');
    line('if nx>0 then local x={} for j=1,nx do x[j]=vr() end c[i]={o,A,B,C,x} else c[i]={o,A,B,C} end end');
    line('local nz=vr(); local z={}');
    line('for i=1,nz do z[i]=proto() end');
    line('local cs=0 for i=1,#c do cs=(cs+c[i][1]*(i+13))%65521 end');
    line('local kr=k; k={}; setmetatable(k,{__index=function(t,i) local v=rawget(t,i) if v~=nil then return v end local e=kr[i] if e==nil then return nil end if type(e)=="table" and e["' + N.strmark + '"] then v=sdec(e) else v=e end rawset(t,i,v) kr[i]=nil return v end}) return {np,va,nu,k,c,z,ms,cs} end');
    line('return proto()');
    line('end),');

    // --------------------------------------------------------------- handlers
    // each used opcode gets several *different* bodies (the same semantics,
    // wrapped in provably-dead opaque predicates) and dispatch picks one per
    // call, so a lifted interpreter can never be matched against one body
    var nVariants = opts.junk === 2 ? 4 : opts.junk === 1 ? 3 : 1;
    var JUNKS = [
      'if I[1]>65535 then return 0 end',
      'if F.ip<0 then F.d=true end',
      'if F.o<-1 then return 0 end',
      'if #I>6 then return 0 end',
      'do local jz=bit32.bxor(I[1],F.ip%64); if jz>131071 then return 0 end end',
      'do local jz=(I[2]*2654435761+F.ip)%4294967296; if jz>4294967295 then F.d=true end end',
      'if I[1]%2==2 then return 0 end',
      'if I[2]~=I[2] then return 0 end',
      'do local jz=I[2]*I[2]; if jz<0 then return 0 end end',
      'do local jz=F.ip*2; if jz<0 then return 0 end end'
    ];
    var VT = {};
    for (i = 0; i < OPS.length; i++) {
      var op = OPS[i];
      if (!usedOps[i]) continue;
      // the bodies are written against fixed local names; the parameters keep
      // their per-build random names and are aliased on entry
      var body = HANDLERS[op]
        .replace(/S\.mk/g, 'S["' + N.mk + '"]')
        .replace(/S\.E\b/g, 'S["' + N.env + '"]')
        .replace(/S\.MT\b/g, 'S["' + N.mt + '"]')
        .replace(/S\.BOX\b/g, 'S["' + N.box + '"]');
      var names = [];
      for (var vj = 0; vj < nVariants; vj++) {
        var nm = vj === 0 ? H[op] : ng();
        names.push(nm);
        line('["' + nm + '"]=(function(' + P.s + ',' + P.f + ',' + P.i + ')');
        line('local S,F,I=' + P.s + ',' + P.f + ',' + P.i);
        line('local R=F.R; local K=F.P[4]; local U=F.U');
        if (nVariants > 1) {
          // two opaque predicates, a different pair per variant: always false
          // by construction (opcode ids stay under 65535, ip under 1, F.o
          // never below -1, an instruction never has more than 5 fields)
          var nj = 2 + (Math.floor(rng() * 2));
          for (var jk = 0; jk < nj; jk++) {
            var pick = Math.floor(rng() * JUNKS.length);
            line(JUNKS[pick]);
          }
        }
        line(body);
        line('end),');
      }
      VT[i] = names;
    }

    var canary = '_dk' + Math.floor(rng() * 0xFFFFFFF).toString(36) + Math.floor(rng() * 0xFFFFFFF).toString(36);

    // ------------------------------------------------ environment-derived seal
    // At anti-env level >= 1 the unseal key is no longer a constant in the
    // file: the audit computes it from environment probes (genuine Luau
    // builtins, a persistent environment, a genuine DataModel, service
    // behaviour signatures only a live client reproduces). A static extractor
    // or a replay environment that fakes any probe derives the wrong key and
    // unseals the payload into garbage, with no signal about which probe
    // disagreed. Contradiction probes respond the same way: the seal is
    // quietly scrambled and decode produces junk, instead of a loud error a
    // cracker could patch out.
    function sealBinding(push, G, noGameStmt) {
      // Delta binding: the guard sets the seal to (encodeSeal - expected + sum)
      // % 256, where sum is rebuilt from the same probes the file just ran. A
      // clean environment reproduces expected exactly and decode succeeds; any
      // hooked or faked probe shifts the key and the payload unseals to junk.
      // expected mirrors the sum a clean target produces: structural bits only
      // (tostring identity 4, write persistence 2, getfenv identity 8, string
      // ops 16) when the build is not locked; when envLock is on the build is
      // only ever decoded in a genuine client, so the DataModel bit (1) and
      // the five service-signature weights are part of the expected sum too.
      var expected = opts.envLock ? 68 : 30;
      var scr = String((blob.seal + 91 + (blob.key % 89)) % 256);
      var b1 = ng(), b2 = ng(), b3 = ng(), b4 = ng(), b5 = ng();
      var okw = ng(), okc = ng();
      var n6 = ng(), n7 = ng(), n8 = ng(), n9 = ng(), n10 = ng();
      var hv = ng(), jn = ng(), spv = ng(), ptv = ng();
      var struct = b2 + '*2+' + b3 + '*4+' + b4 + '*8+' + b5 + '*16';
      push('local ' + b1 + ',' + b2 + ',' + b3 + ',' + b4 + ',' + b5 + '=0,0,0,0,0');
      push('pcall(function() if typeof(game)=="Instance" and game.ClassName=="DataModel" then ' + b1 + '=1 end end)');
      push('pcall(function() ' + G + '["' + N.env + '"]["' + canary + '"]=1187 if ' + G + '["' + N.env + '"]["' + canary + '"]==1187 then ' + b2 + '=1 end ' + G + '["' + N.env + '"]["' + canary + '"]=nil end)');
      push('if tostring({})~=tostring({}) then ' + b3 + '=1 end');
      push('local ' + b4 + '=1 if getfenv then pcall(function() if getfenv(0)~=getfenv(0) then ' + b4 + '=0 end end) end');
      push('local ' + b5 + '=1 pcall(function() if #tostring("ab")~=2 or ("abc"):sub(2,2)~="b" or table.concat({"a","b"})~="ab" then ' + b5 + '=0 end end)');
      push('if ' + b1 + '==1 then');
      push('local ' + okc + '=true');
      push('pcall(function() if game.Close~=game.Close then ' + okc + '=false end if typeof(game:GetService("Lighting"))~="Instance" then ' + okc + '=false end if game:GetService("Lighting").ClockTime~=game:GetService("Lighting").ClockTime then ' + okc + '=false end end)');
      push('if ' + okc + ' then');
      if (elevel >= 2) {
        push('local ' + n6 + ',' + n7 + ',' + n8 + ',' + n9 + ',' + n10 + '=0,0,0,0,0');
        push('pcall(function() local ' + hv + '=game:GetService("HapticService") if typeof(' + hv + ':IsVibrationSupported(Enum.UserInputType.Gamepad1))=="boolean" then ' + n6 + '=1 end end)');
        push('pcall(function() local ' + jn + '=game:GetService("HttpService") if typeof(' + jn + ':JSONEncode({}))=="string" then ' + n7 + '=1 end end)');
        push('pcall(function() local ' + spv + '=game:GetService("StarterPlayer") if ' + spv + ':FindFirstChild("StarterPlayerScripts") then ' + n8 + '=1 end end)');
        push('pcall(function() local ' + ptv + '=Instance.new("Part") if typeof(' + ptv + '.Position)=="Vector3" then ' + n9 + '=1 end end)');
        push('pcall(function() if settings~=nil and settings().Physics~=nil then ' + n10 + '=1 end end)');
      }
      if (opts.envLock) {
        push('if (' + n6 + '+' + n7 + '+' + n8 + '+' + n9 + '+' + n10 + ')<3 then ' + G + '["' + N.seal + '"]=' + scr + ' else ' + G + '["' + N.seal + '"]=(' + blob.seal + '-' + expected + '+' + b1 + '+' + struct + '+' + n6 + '*64+' + n7 + '*128+' + n8 + '*173+' + n9 + '*211+' + n10 + '*229)%256 end');
      } else {
        push(G + '["' + N.seal + '"]=(' + blob.seal + '-' + expected + '+' + struct + ')%256');
      }
      push('else');
      push(G + '["' + N.seal + '"]=' + scr);
      push('end');
      push('else');
      if (opts.envLock) push(noGameStmt);
      else push(G + '["' + N.seal + '"]=(' + blob.seal + '-' + expected + '+' + struct + ')%256');
      push('end');
    }

    // ----------------------------------------------------- anti-tamper loader
    // Wraps the finished build in a chunked loader: the source is split, each
    // chunk stored as a numeric byte table (encrypted with a per-chunk key at
    // full strength), and a wrapper verifies the client (instances, DataModel
    // properties, LocalPlayer, services, engine data types, environment
    // identity) before decrypting, loading and running it. RunService's
    // Heartbeat re-runs the battery every half second afterwards, so a hook
    // installed mid-run is caught too. Detection prints the notice; runtime
    // detection hangs the thread.
    function wrapAntiTamper(inner, rng) {
      var fast = opts.antiTamper === 1;
      var nchunks = fast ? 2 : 3 + Math.floor(rng() * 3);
      var chunkSize = Math.max(1, Math.ceil(inner.length / nchunks));
      var chunks = [], keys = [];
      for (var ci = 0; ci < inner.length; ci += chunkSize) {
        var part = inner.substr(ci, chunkSize);
        var key = fast ? 0 : 50 + Math.floor(rng() * 101);
        var enc = [];
        for (var bi = 1; bi <= part.length; bi++) {
          var v = (part.charCodeAt(bi - 1) + key + bi) % 256;
          v = v ^ ((key + bi) % 256);
          enc.push(v);
        }
        chunks.push('{' + enc.join(',') + '}');
        keys.push(String(key));
      }
      var banner = 'Protected using Darkfuscator | https://darkfuscator.pages.dev';
      var w = [];
      function wl(x) { w.push(x); }
      wl('do');
      wl('local t0=os.clock()');
      wl('local MSG=' + JSON.stringify(banner));
      wl('local detected=false');
      wl('local checks={}');
      wl('local function fail() print(MSG) while true do end end');
      wl('local function warnf(m) if warn~=nil then warn(m) else print(m) end end');
      wl('checks[1]={name="game_instance",run=function() if typeof(game)~="Instance" or typeof(workspace)~="Instance" then return false end return true end}');
      wl('checks[2]={name="script_valid",run=function() if typeof(script)~="Instance" or not script:IsA("LuaSourceContainer") then return false end return true end}');
      wl('checks[3]={name="game_props",run=function() if type(game.PlaceId)~="number" then return false end if type(game.JobId)~="string" or #game.JobId==0 then return false end return true end}');
      wl('checks[4]={name="local_player",run=function() local ok,ps=pcall(game.GetService,game,"Players") if not ok or typeof(ps)~="Instance" then return false end local lp=ps.LocalPlayer if not lp or not lp:IsA("Player") then return false end return true end}');
      wl('checks[5]={name="character",run=function() local lp=game:GetService("Players").LocalPlayer local char=lp.Character or lp.CharacterAdded:Wait(5) if not char then return false end local hrp=char:FindFirstChild("HumanoidRootPart") if not hrp or not hrp:IsA("BasePart") then return false end return true end}');
      wl('checks[6]={name="services",run=function() local needed={"RunService","ReplicatedStorage","UserInputService","TweenService"} for _,nm in ipairs(needed) do local ok,sv=pcall(game.GetService,game,nm) if not ok or typeof(sv)~="Instance" then return false end end return true end}');
      wl('checks[7]={name="data_types",run=function() if typeof(Vector3.new(0,0,0))~="Vector3" or typeof(CFrame.new())~="CFrame" or typeof(Color3.new())~="Color3" or typeof(UDim2.new())~="UDim2" or typeof(Vector2.new())~="Vector2" then return false end return true end}');
      wl('checks[8]={name="getfenv_check",run=function() local ok1,e1=pcall(getfenv,0) local ok2,e2=pcall(getfenv,1) if not ok1 or not ok2 or type(e1)~="table" or type(e2)~="table" then return false end if e1.game==nil and e2.game==nil then return false end if e1.workspace==nil and e2.workspace==nil then return false end return true end}');
      wl('checks[9]={name="getenv_check",run=function() local env=getfenv(0) if type(env)~="table" then return false end if type(env.print)~="function" or type(env.pcall)~="function" or type(env.typeof)~="function" or type(env.tick)~="function" then return false end return true end}');
      wl('checks[10]={name="runservice",run=function() local ok,rs=pcall(game.GetService,game,"RunService") if not ok or typeof(rs)~="Instance" then return false end local ok2=pcall(function() return rs:IsClient() end) local ok3=pcall(function() return rs:IsServer() end) if not ok2 and not ok3 then return false end return true end}');
      wl('checks[11]={name="env_write",run=function() local cv="_dkcv"..tostring(math.floor((os.clock()%1)*1000000)) local ok2=false pcall(function() getfenv(0)[cv]=1187 if getfenv(0)[cv]==1187 then ok2=true end getfenv(0)[cv]=nil end) if not ok2 then return false end return true end}');
      wl('checks[12]={name="string_integrity",run=function() if tostring("ab")~="ab" or string.rep("x",2)~="xx" or ("ab"):upper()~="AB" or #"ab"~=2 then return false end return true end}');
      wl('checks[13]={name="dump_tools",run=function() local dn=0 for _,df in ipairs({getgc,getloadedmodules,getsenv,(type(debug)=="table" and debug.getupvalue or nil)}) do if type(df)=="function" then dn=dn+1 end end local bad=false if game~=nil then pcall(function() if game.Close~=game.Close then bad=true end end) end local hooked=rawget(_G,"hookfunction") or rawget(_G,"newcclosure") if dn>0 then warnf("[DARK AntiTamper] dump tooling present ("..tostring(dn)..")") if bad then return false end end if (dn>0 or hooked) and bad then return false end return true end}');
      wl('checks[14]={name="identity_consistency",run=function() if game==nil or typeof(game)~="Instance" then return true end local ok,L=pcall(game.GetService,game,"Lighting") if ok and L.ClockTime~=L.ClockTime then return false end if workspace.CurrentCamera~=workspace.CurrentCamera then return false end local ok2,a=pcall(game.GetService,game,"Lighting") local ok3,b=pcall(game.GetService,game,"Lighting") if ok2~=ok3 then return false end return true end}');
      wl('checks[15]={name="json_determinism",run=function() if game==nil then return true end local ok,hs=pcall(game.GetService,game,"HttpService") if not ok or type(hs.JSONEncode)~="function" then return true end local ok2,e1=pcall(hs.JSONEncode,hs,{}) local ok3,e2=pcall(hs.JSONEncode,hs,{}) if not ok2 or not ok3 or e1~=e2 then return false end return true end}');
      wl('checks[16]={name="clone_locked",run=function() if game==nil then return true end local ok,cl=pcall(game.Clone,game) if ok and cl~=nil then return false end return true end}');
      wl('checks[17]={name="cframe_math",run=function() local ok,cf=pcall(CFrame.new,50,100,50) if not ok then return true end local ok2,r=pcall(function() return cf*CFrame.Angles(0,math.pi/2,0) end) if not ok2 then return false end if math.abs(r.RightVector.Z)<0.9 or math.abs(r.Position.X-50)>0.1 then return false end return true end}');
      wl('checks[18]={name="readonly_props",run=function() if game==nil then return true end local ok,err=pcall(function() game.PlaceId=0 end) if ok then return false end if type(err)~="string" or #err==0 then return false end return true end}');
      wl('checks[19]={name="settings_sane",run=function() local ok,s=pcall(function() return settings() end) if not ok or type(s)~="table" then return true end local ok2,pt=pcall(function() return s.Physics.ThrottleAdjustTime end) local ok3,il=pcall(function() return s.Network.IncomingReplicationLag end) if ok2 and type(pt)=="number" and pt>1 then return false end if ok3 and type(il)=="number" and il>1 then return false end return true end}');
      wl('checks[20]={name="debug_sane",run=function() if type(debug)~="table" or type(debug.getinfo)~="function" then return true end local ok,a=pcall(debug.getinfo,1,"l") local ok2,b=pcall(debug.getinfo,1,"l") if not ok or not ok2 or type(a)~="table" or type(b)~="table" or a.currentline~=b.currentline then return false end return true end}');
      wl('checks[21]={name="addr_determinism",run=function() local s1=tostring({}) local s2=tostring({}) if #s1>=15 and #s2>=15 and string.sub(s1,8,15)==string.sub(s2,8,15) then return false end local t1={} local d1=tostring(t1) local d2=tostring(t1) if d1~=d2 then return false end return true end}');
      wl('local function runChecks() for i=1,#checks do local ok,res=pcall(checks[i].run) if not ok or res==false then detected=true warnf("[DARK AntiTamper] check "..tostring(i).." ("..tostring(checks[i].name)..") failed") return false end end return true end');
      wl('runChecks()');
      wl('if detected then print(MSG) return end');
      wl('pcall(function() local nc=game:GetService("NetworkClient") if nc==nil or not nc:FindFirstChild("ClientReplicator") then warnf("[DARK AntiTamper] NetworkClient probe inconclusive") end end)');
      wl('pcall(function() local ch=game:GetService("Chat") if ch==nil or ch.Parent==nil or ch.Parent.Name~="Ugc" then warnf("[DARK AntiTamper] Chat probe inconclusive") end end)');
      wl('local RS=game:GetService("RunService") local last=(tick~=nil and tick() or os.clock())');
      wl('RS.Heartbeat:Connect(function() local now=(tick~=nil and tick() or os.clock()) if now-last>=0.5 then last=now runChecks() if detected then fail() end end end)');
      wl('do local lp=game:GetService("Players").LocalPlayer local psc=lp:FindFirstChild("PlayerScripts") if not psc or not psc:FindFirstChild("PlayerModule") or not psc:FindFirstChild("RbxCharacterSounds") then print(MSG) return end end');
      wl('local chunks={');
      for (var fi = 0; fi < chunks.length; fi++) wl(chunks[fi] + (fi < chunks.length - 1 ? ',' : ''));
      wl('}');
      wl('local keys={');
      wl(keys.join(',') + '}');
      wl('local function decrypt(data,key) local o={} for i=1,#data do local d=bit32.bxor(data[i],(key+i)%256) o[i]=(d-key-i)%256 end return o end');
      wl('local parts={} for i=1,#chunks do local b=decrypt(chunks[i],keys[i]) local cs={} for k=1,#b do cs[k]=string.char(b[k]) end parts[i]=table.concat(cs) end');
      wl('local original_source=table.concat(parts)');
      wl('chunks=nil keys=nil parts=nil');
      wl('local loadfunc=load or loadstring');
      wl('if not loadfunc then fail() end');
      wl('local chunk,err=loadfunc(original_source,"=AntiTamper")');
      wl('original_source=nil');
      wl('if not chunk then fail() end');
      wl('chunk()');
      wl('local lp=game:GetService("Players").LocalPlayer');
      wl('warnf("Authenticated in "..string.format("%.2f",os.clock()-t0).." seconds! Welcome, "..tostring(lp and lp.Name or "player"))');
      wl('end');
      return w.join('\n') + '\n';
    }

    // ----------------------------------------------------------------- guard
    // The audit runs before the payload is decoded: if the environment is
    // tampered with (stubbed builtins, a proxy environment that does not
    // persist writes, an injector toolkit over a fake DataModel), the program
    // refuses to run and nothing is ever decrypted.
    if (glevel >= 1) {
      var ga = ng(), gb = ng(), gc = ng(), gd = ng(), ge = ng();
      line('["' + N.guard + '"]=(function(G)');
      line('local ' + ga + ',live1={},{}; local ' + gb + ',live2={},{}');
      line('local ' + gc + ',tostr=' + ga + ',tostring');
      line('if tostr(live1)==tostr(live2) then return 1 end');
      line('if #tostring("ab")~=2 or string.rep("ab",3)~="ababab" or table.concat({"a","b"})~="ab" or ("abc"):sub(2,2)~="b" then return 2 end');
      line('local ' + gd + ',' + gc + '=pcall(error,"Dk")');
      line('if ' + gd + '~=false or ' + gc + '~="Dk" then return 3 end');
      line('if math.floor(1.5)~=1 or tonumber("10")~=10 or math.max(3,7)~=7 then return 4 end');
      line('if not pcall(function() return true end) then return 5 end');
      line('if getfenv then local ' + gd + '=getfenv(0); local ' + gc + '=getfenv(0); if ' + gd + '~=' + gc + ' then return 6 end end');
      // write-trap: a proxy environment that records but does not persist writes
      line('local ok=false');
      line('pcall(function() G["' + N.env + '"]["' + canary + '"]=1187; if G["' + N.env + '"]["' + canary + '"]~=1187 then ok=true end; G["' + N.env + '"]["' + canary + '"]=nil end)');
      line('if ok then return 7 end');
      line('local ' + ge + '=rawget(_G,"hookfunction") or rawget(_G,"newcclosure") or rawget(_G,"getgenv") or rawget(_G,"getrenv") or rawget(_G,"readfile") or rawget(_G,"writefile")');
      if (glevel === 2) {
        line('if ' + ge + ' then local g=game; if g==nil or typeof(g)~="Instance" or g.ClassName~="DataModel" then return 8 end; if game.Close~=game.Close then return 9 end end');
        line('if game ~= nil and typeof(game)=="Instance" and (typeof(workspace)~="Instance" or typeof(game.GetService)~="function") then return 10 end');
        line('do local okc,cf=pcall(function() return CFrame.new(50,100,50)*CFrame.Angles(0,math.pi/2,0) end); if okc and (math.abs(cf.RightVector.Z)<0.9 or math.abs(cf.Position.X-50)>0.1) then return 12 end end');
        line('if game ~= nil and typeof(game)=="Instance" then local okk,cl=pcall(function() return game.Clone(game) end); if okk and cl~=nil then return 13 end; local okj,e1=pcall(function() return game:GetService("HttpService"):JSONEncode({}) end); local okj2,e2=pcall(function() return game:GetService("HttpService"):JSONEncode({}) end); if okj and okj2 and e1~=e2 then return 14 end; local okp,pe=pcall(function() game.PlaceId=0 end); if okp then return 15 end end');
        line('if type(debug)=="table" and type(debug.getinfo)=="function" then local okd,a=pcall(function() return debug.getinfo(1,"l").currentline end); local okd2,b=pcall(function() return debug.getinfo(1,"l").currentline end); if okd and okd2 and a~=b then return 16 end end');
        // anti-debug timing: a step-debugger or a hook that throttles every
        // operation makes even a small loop take absurd wall time; the threshold
        // keeps ~100x headroom over a normal Luau VM so clean runs never trip it
        line('do local t0=os.clock() local s=0 for i=1,120000 do s=(s+i*7)%1000003 end if os.clock()-t0>0.4 then return 11 end end');
      }
      if (elevel >= 1) {
        sealBinding(line, 'G', 'return 17');
      } else {
        line('G["' + N.seal + '"]=' + blob.seal + ';');
      }
      line('return false');
      line('end),');
    }

    // ------------------------------------------------------------ interpreter
    line('["' + N.run + '"]=(function(' + P.s + ',' + P.p + ',' + P.u + ',...)');
    line('local ' + L.r + '={}');
    line('local np=' + P.p + '[1]');
    line('if np>0 or ' + P.p + '[2] then local a={...}');
    line('for i=1,np do ' + L.r + '[i-1]=a[i] end');
    line('if ' + P.p + '[2] then a.n=select("#",...); end end');
    line('local ' + L.u + '=' + P.u);
    line('local F={R=' + L.r + ',U=' + L.u + ',P=' + P.p + ',ip=1,d=false,r=nil,o=0,n=0}');
    // the vararg vector holds only the arguments *past* the declared params
    line('if ' + P.p + '[2] then local np=' + P.p + '[1]; local na=select("#",...); ' +
      'local v={select(np+1,...)} v.n=(na>np) and na-np or 0 F.V=v end');
    line('local ' + L.c + '=' + P.p + '[5]');
    if (glevel >= 2) line('do local cs=0; local cd=' + P.p + '[5]; for i=1,#cd do cs=(cs+cd[i][1]*(i+13))%65521 end; if cs~=' + P.p + '[8] then F.d=true;F.n=0;F.o=0 end end');
    var vtEntries = [];
    for (i = 0; i < OPS.length; i++) {
      if (usedOps[i]) vtEntries.push('[' + i + ']={'+ VT[i].map(function(n) { return P.s + '["' + n + '"]'; }).join(',') + '}');
    }
    line('local ' + vtl + '={' + vtEntries.join(',') + '}');
    line('while true do');
    line('local I=' + L.c + '[F.ip]');
    line('local o=I[1]');
    line('local nx');
    var branches = [];
    for (i = 0; i < OPS.length; i++) {
      if (usedOps[i]) branches.push({ id: ids[i], fn: H[OPS[i]], opidx: i });
    }
    for (i = 0; i < deadIds.length; i++) branches.push({ id: deadIds[i], fn: H[OPS[Math.floor(rng() * OPS.length)]], dead: true });
    // shuffled dispatch order
    for (i = branches.length - 1; i > 0; i--) {
      var j2 = Math.floor(rng() * (i + 1));
      var tmp = branches[i]; branches[i] = branches[j2]; branches[j2] = tmp;
    }
    var chain = '';
    for (i = 0; i < branches.length; i++) {
      var b2 = branches[i];
      if (b2.dead) {
        chain += (i === 0 ? 'if' : ' elseif') + ' o==' + hex(b2.id) + ' then nx=' + P.s + '["' + b2.fn + '"](' + P.s + ',F,I)';
      } else {
        chain += (i === 0 ? 'if' : ' elseif') + ' o==' + hex(b2.id) + ' then local vs=' + vtl + '[' + b2.opidx + ']; nx=vs[((F.ip+F.o)%#vs)+1](' + P.s + ',F,I)';
      }
    }
    line(chain + ' end');
    line('if F.d then return unpack(F.r,F.o+1,F.o+F.n) end');
    line('F.ip=nx or F.ip+1');
    line('end');
    line('end),');

    // ---------------------------------------------------------- closure maker
    line('["' + N.mk + '"]=(function(' + P.s + ',' + P.p + ',' + P.u + ')');
    line('return function(...) return ' + P.s + '["' + N.run + '"](' + P.s + ',' + P.p + ',' + P.u + ',...) end');
    line('end),');

    // ------------------------------------------------------------------ entry
    line('["' + N.entry + '"]=(function(' + P.s + ',' + L.e + ')');
    line(P.s + '["' + N.env + '"]=' + L.e + ' or _G');
    line(P.s + '["' + N.mt + '"]=setmetatable({},{})');
    line(P.s + '["' + N.box + '"]=setmetatable({},{})');
    // ------------------------------------------------------- execution locks
    // when a place and/or universe id is set, the payload only decodes inside
    // that Roblox experience: another game, an empty environment or a plain
    // luau CLI run refuses before a single byte is decrypted
    var lockP = String(opts.lockPlace == null ? '' : opts.lockPlace).trim();
    var lockU = String(opts.lockUniverse == null ? '' : opts.lockUniverse).trim();
    if (/^\d+$/.test(lockP) || /^\d+$/.test(lockU)) {
      var gl = ng();
      var lockConds = [];
      if (/^\d+$/.test(lockP)) lockConds.push(gl + '.PlaceId==' + lockP);
      if (/^\d+$/.test(lockU)) lockConds.push(gl + '.GameId==' + lockU);
      line('do local ' + gl + '=game');
      line('if ' + gl + '~=nil and (' + lockConds.join(' or ') + ') then else error("Darkfuscator protected program: execution locked",0) end');
      line('end');
    }
    if (glevel === 0) {
      if (elevel >= 1) {
        line('do');
        sealBinding(line, P.s, P.s + '["' + N.seal + '"]=' + scrG);
        line('end');
      } else {
        line(P.s + '["' + N.seal + '"]=' + blob.seal + ';');
      }
    }
    if (glevel >= 1) {
      line('local ' + ge + '=' + P.s + '["' + N.guard + '"](' + P.s + ')');
      line('if ' + ge + ' then ' + P.s + '["' + N.seal + '"]=' + scrG + ' end');
    }
    line('local P=' + P.s + '["' + N.dec + '"](' + P.s + ',' + P.s + '["' + N.blob + '"])');
    line(P.s + '["' + N.blob + '"]=nil; ' + P.s + '["' + N.alpha + '"]=nil; ' + P.s + '["' + N.check1 + '"]=nil; ' + P.s + '["' + N.check2 + '"]=nil; ' + P.s + '["' + N.dec + '"]=nil; ' + P.s + '["' + N.seal + '"]=nil; ' + P.s + '["' + N.guard + '"]=nil');

    line('local f=' + P.s + '["' + N.mk + '"](' + P.s + ',P,{})');
    // anti-dump re-audit: the battery runs again one scheduler step after the
    // payload starts; a hook installed mid-run (a dumper that grabs the
    // decoded program table) trips it and the interpreter material is
    // destroyed. Legit runs never touch the wipe branch.
    if (elevel >= 1) {
      line('if task~=nil and typeof(task)=="table" and task.defer~=nil then task.defer(function() local bad=false pcall(function() if game~=nil and typeof(game)=="Instance" and (game.Close~=game.Close or typeof(game:GetService("Lighting"))~="Instance") then bad=true end end) if bad then ' + P.s + '["' + N.run + '"]=nil ' + P.s + '["' + N.mk + '"]=nil end end) end');
    }
    line('return f()');
    line('end)');

    // decoy slots, as in the reference build
    var decoys = opts.junk === 2 ? 24 : opts.junk === 1 ? 8 : 0;
    for (i = 0; i < decoys; i++) {
      line(',["' + ng() + '"]=(function(' + ng() + ',' + ng() + ',' + ng() + ')end)');
    }

    var envExpr = opts.captureGlobals === false ? '_ENV or _G' : 'getfenv and getfenv() or _ENV or _G';
    line('}):' + N.entry + '(' + envExpr + ');' + (opts.wrapReturn ? ' end' : ''));

    // statements must stay separated even when minified — a space is enough
    var src = out.join(opts.minify === false ? '\n' : ' ');
    if (opts.antiTamper) src = wrapAntiTamper(src, rng);
    return {
      source: src,
      ids: ids,
      stats: { bytes: blob.bytes, payload: blob.payload.length, opcodes: Object.keys(usedOps).length }
    };
  }

  function hex(v) { return '0x' + v.toString(16).toUpperCase(); }

  return { emit: emit, OPS: OPS };
});
