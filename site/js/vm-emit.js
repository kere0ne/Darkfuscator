/*
 * Darkfuscator — VM emitter.
 *
 * Turns the bytecode produced by vm-compile.js into a self-contained Luau
 * program with a build-specific serialized payload and custom interpreter:
 *
 *   return ({["aB"]=(function(S,B) ... end), ... ["pAy"]="<encoded payload>"}):entry(env)
 *
 * The program is serialized to bytes, encoded with per-build variation, and
 * packed six bits to a character. One table slot holds one opcode handler, so
 * the interpreter layout and dispatch structure vary across builds.
 *
 * Every operation is carried out by native Luau operators, preserving the
 * language semantics implemented by the compiler and VM.
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
  //
  // This list also reserves globals called directly by emitted code. Generated
  // parameters are lexical locals, so a name such as `math` or `bit32` would
  // otherwise hide the standard library it needs. Keep this list exhaustive
  // whenever a literal identifier is added to an emitted Lua fragment.
  var RESERVED = ('a b c d e f g h i j k l m n o p q r s t u v w x y z ' +
    'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z ' +
    'acc args by ip it len li ms mt na nb nc nk np nr nu nv nx nz q res st tn va value vr ' +
    // Fixed helper locals used by decoder, verifier, handlers, and the run loop.
    // Generated table/parameter names must not shadow any of these at runtime.
    'rr rs undefined vs cs cd c1 c2 fnv pidx ps osalt sdec ps2 q2 kr sv eb rt rn ri jz ' +
    'zn cnt val cn last proto vrm ok ' +
    // Global bindings that emitted decoder, VM, and handler fragments invoke.
    'math bit32 string table type tonumber unpack setmetatable getmetatable rawget rawset pcall select getfenv game ' +
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
  function serialize(root, rng, compression, vmMode) {
    var bytes = [];
    // build keys are drawn up front: the instruction stream is masked with a
    // salt derived from them, so the decoder can rebuild the salt from the
    // values it already receives instead of a new embedded constant
    var key = 1 + Math.floor(rng() * 254);
    var seal = 100 + Math.floor(rng() * 65000);
    var xk = 1 + Math.floor(rng() * 254);
    var osalt = (key * 733 + xk * 911 + (seal % 256)) % 65536;
    var pidx = 0;
    // zigzag varint: operands are signed (jump offsets are negative when the
    // target precedes the instruction, e.g. FORLOOP/loop-back JMP/TFORCALL)
    function vi(v) {
      v = v < 0 ? -2 * Math.ceil(v) - 1 : 2 * Math.floor(v);
      while (v >= 128) { bytes.push((v % 128) | 128); v = Math.floor(v / 128); }
      bytes.push(v);
    }
    // masked-operand varint: the caller zigzags the value, XORs it with the
    // per-proto positional mask and hands over the non-negative result
    function vx(e) {
      while (e >= 128) { bytes.push((e % 128) | 128); e = Math.floor(e / 128); }
      bytes.push(e);
    }
    function zz(v) { return v < 0 ? -2 * Math.ceil(v) - 1 : 2 * Math.floor(v); }
    function b(v) { bytes.push(v & 255); }
    function str(s) { var a = utf8Bytes(s); vi(a.length); for (var i = 0; i < a.length; i++) b(a[i]); }
    function proto(p) {
      pidx = pidx + 1;
      var ps = (osalt + pidx * 40503) % 65536;
      // A per-proto register shift is applied by the runtime register view.
      // It preserves contiguous ranges used by loops while changing the
      // backing layout for every non-fast build.
      var registerShift = vmMode === 'secure' ? 8 + Math.floor(rng() * 40) :
        vmMode === 'balanced' ? 1 + Math.floor(rng() * 8) : 0;
      vi(p.nparams); b(p.isvararg ? 1 : 0); vi(p.maxreg + 1); vi(registerShift); vi(p.ups.length);
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
      // register encoding: every operand is zigzagged, then XORed with a
      // per-proto positional mask. The emitted decoder rebuilds the same
      // masks, so a byte-level dump shows register indices and jump targets
      // as noise rather than direct operands.
      for (var j = 0; j < p.code.length; j++) {
        var ins = p.code[j];
        vi(ins[0]);
        vx(zz(ins[1]) ^ ((ps + (j + 1) * 7919 + 104729) % 65536));
        vx(zz(ins[2]) ^ ((ps + (j + 1) * 7919 + 209458) % 65536));
        vx(zz(ins[3]) ^ ((ps + (j + 1) * 7919 + 314187) % 65536));
        if (ins.x && ins.x.length) { vi(ins.x.length); for (var q = 0; q < ins.x.length; q++) vx(zz(ins.x[q]) ^ ((ps + (j + 1) * 7919 + (4 + q) * 104729) % 65536)); }
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
    // FNV-1a over the plaintext stream: the decoder recomputes this after
    // decryption, so a modified payload never even decodes to usable bytecode
    var fnv = 2166136261;
    for (ci = 0; ci < bytes.length; ci++) {
      fnv = (fnv ^ bytes[ci]) >>> 0;
      fnv = ((fnv % 65536) * 16777619 + ((Math.floor(fnv / 65536) * 16777619) % 65536) * 65536) % 4294967296;
    }

    // Optional RLE compression is a size pass, not an integrity mechanism.
    // 255 is an escape marker: [255,0,255] encodes a literal 255 and
    // [255,count,value] encodes a run. We only retain it when it wins.
    function rle(input) {
      var packed = [], i2 = 0;
      while (i2 < input.length) {
        var value = input[i2], run = 1;
        while (i2 + run < input.length && input[i2 + run] === value && run < 255) run++;
        if (run >= 4) { packed.push(255, run, value); i2 += run; continue; }
        for (var rr = 0; rr < run; rr++) {
          if (value === 255) packed.push(255, 0, 255); else packed.push(value);
        }
        i2 += run;
      }
      return packed;
    }
    var plainBytes = bytes.slice();
    var packedBytes = compression ? rle(plainBytes) : plainBytes.slice();
    var compressed = !!(compression && packedBytes.length < plainBytes.length);
    if (!compressed) packedBytes = plainBytes.slice();

    for (var i = 0; i < packedBytes.length; i++) packedBytes[i] = (packedBytes[i] + key + (i + 1) * 13 + seal) % 256;

    // Second layer: a per-build XOR transformation, applied after byte shifting.
    for (i = 0; i < packedBytes.length; i++) packedBytes[i] = packedBytes[i] ^ ((xk + (i + 1) * 37 + seal) % 256);

    var alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('');
    for (var s = alpha.length - 1; s > 0; s--) {
      var r = Math.floor(rng() * (s + 1));
      var t = alpha[s]; alpha[s] = alpha[r]; alpha[r] = t;
    }
    var acc = 0, nb = 0, out = [];
    for (i = 0; i < packedBytes.length; i++) {
      acc += packedBytes[i] * Math.pow(2, nb);
      nb += 8;
      while (nb >= 6) {
        out.push(alpha[acc % 64]);
        acc = (acc - (acc % 64)) / 64;
        nb -= 6;
      }
    }
    if (nb > 0) out.push(alpha[acc % 64]);
    return { payload: out.join(''), alphabet: alpha.join(''), key: key, xk: xk, seal: seal,
      bytes: plainBytes.length, packedBytes: packedBytes.length, compressed: compressed,
      check1: c1, check2: c2, fnv: fnv };
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
    // RETURN materializes a compact result vector. A protected VM can use a
    // register proxy for per-proto remapping, while unpack deliberately works
    // on a plain array at the call boundary.
    RETURN: 'do local rt={}; local rn=I[3]-1; for ri=1,rn do rt[ri]=R[I[2]+ri-1] end F.d=true;F.r=rt;F.o=0;F.n=rn end',
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
    // Runtime validation only checks ordinary primitives required by the VM.
    // It has no executor, debugger, or game-client detection behavior.
    var glevel = opts.guard === 2 ? 2 : opts.guard === 0 ? 0 : 1;
    // `antiTamper` is an integrity level. Decoder failures safely return before
    // reconstructing or running the protected program.
    var integrityLevel = opts.antiTamper === 2 ? 2 : opts.antiTamper === 1 ? 1 : 0;
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
    var vmMode = opts.vmMode === 'secure' ? 'secure' : opts.vmMode === 'fast' ? 'fast' : 'balanced';
    var blob = serialize(program, rng, opts.compression === true, vmMode);
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
    if (opts.watermark !== false) out.push('-- Protected by Darkfuscator. Obfuscation raises reverse-engineering cost; it is not impossible to defeat.\n');
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
    // third layer came off first: position-keyed byte rotation
    line('for ' + L.i + '=1,' + L.n + ' do ' + L.o + '[' + L.i + ']=bit32.bxor(' + L.o + '[' + L.i + '],(' + blob.xk + '+(' + L.i + '*37)+' + (glevel >= 1 ? P.s + '["' + N.seal + '"]' : blob.seal) + ')%256) end');
    line('for ' + L.i + '=1,' + L.n + ' do ' + L.o + '[' + L.i + ']=(' + L.o + '[' + L.i + ']-' + blob.key + '-' + L.i + '*13-' + (glevel >= 1 ? P.s + '["' + N.seal + '"]' : blob.seal) + ')%256 end');
    if (blob.compressed) {
      line('do local z,zn,q={},0,1 while q<=' + L.n + ' do local v=' + L.o + '[q] if v==255 then local cnt=' + L.o + '[q+1] local val=' + L.o + '[q+2] if cnt==0 then zn=zn+1 z[zn]=val else for ri=1,cnt do zn=zn+1 z[zn]=val end end q=q+3 else zn=zn+1 z[zn]=v q=q+1 end end ' + L.o + '=z ' + L.n + '=zn end');
    }
    if (integrityLevel >= 1) {
      line('local fnv=2166136261');
      line('for ' + L.i + '=1,' + L.n + ' do fnv=bit32.bxor(fnv,' + L.o + '[' + L.i + ']); fnv=((fnv%65536)*16777619+((math.floor(fnv/65536)*16777619)%65536)*65536)%4294967296 end');
      line('if fnv~=' + blob.fnv + ' then return nil end');
    }
    if (integrityLevel >= 2) {
      line('local c1,c2=0,0');
      line('for ' + L.i + '=1,' + L.n + ' do c1=(c1+' + L.o + '[' + L.i + ']*' + L.i + ')%65521; c2=(c2+(((' + L.o + '[' + L.i + ']+(' + L.i + '*17))%256)*(' + L.i + '+2)))%65519 end');
      line('if c1~=' + P.s + '["' + N.check1 + '"] or c2~=' + P.s + '["' + N.check2 + '"] then return nil end');
    }

    line('local ' + L.c + '=' + L.o);
    var PS = ng();
    line('local ' + PS + '={p=1}');
    line('local function by() local v=' + L.c + '[' + PS + '.p]; ' + PS + '.p=' + PS + '.p+1; return v end');
    // reads are zigzag encoded (see `vi`) so that jump offsets can go backwards
    line('local function vr() local v,s=0,1 while true do local b=' + L.c + '[' + PS + '.p]; ' + PS + '.p=' + PS + '.p+1; v=v+(b%128)*s if b<128 then break end s=s*128 end if v%2==1 then v=-(v+1)/2 else v=v/2 end return v end');
    // masked-operand read: unmask with the per-proto positional mask, then unzigzag
    line('local function vrm(m) local v,s=0,1 while true do local b=' + L.c + '[' + PS + '.p]; ' + PS + '.p=' + PS + '.p+1; v=v+(b%128)*s if b<128 then break end s=s*128 end v=bit32.bxor(v,m) if v%2==1 then v=-(v+1)/2 else v=v/2 end return v end');
    line('local function st() local n=vr(); if n==0 then return "" end; local t={}; local q=1; while q<=n do');
    line('local len=n-q+1; if len>2000 then len=2000 end; local u={}');
    line('for j=1,len do u[j]=' + L.c + '[' + PS + '.p+j-1] end; ' + PS + '.p=' + PS + '.p+len; t[#t+1]=string.char(unpack(u)); q=q+len end');
    line('return table.concat(t) end');
    line('local pidx=0');
    line('local osalt=(' + blob.key + '*733+' + blob.xk + '*911+' + (glevel >= 1 ? P.s + '["' + N.seal + '"]' : (blob.seal % 256)) + ')%65536');
    line('local OPC={' + ids.join(',') + '}');
    // string constants are stored encoded inside the payload and are only
    // decoded through a metatable the first time a handler actually reads
    // them: a dump of the decoded program no longer reveals string literals
    line('local function sdec(e) local t={} for j=1,#e.b do t[j]=bit32.bxor(e.b[j],(' + strMask + '+j*29)%256) end local ps2={} for q2=1,#t,200 do ps2[#ps2+1]=string.char(unpack(t,q2,math.min(q2+199,#t))) end return table.concat(ps2) end');
    line('local function proto()');
    line('pidx=pidx+1; local ps=(osalt+pidx*40503)%65536');
    line('local np=vr(); local va=by()==1; local ms=vr(); local rs=vr(); local nu=vr()');
    line('local nk=vr(); local k={}');
    line('for i=1,nk do local t=by()');
    line('if t==0 then k[i]=nil elseif t==1 then k[i]=by()==1 elseif t==2 then k[i]=tonumber(st()) else local sv=st(); local eb={} for j=1,#sv do eb[j]=bit32.bxor(sv:byte(j),(' + strMask + '+j*29)%256) end k[i]={["' + N.strmark + '"]=true,b=eb} end end');
    line('local nc=vr(); local c={}');
    line('for i=1,nc do local o=OPC[vr()+1]; local A=vrm((ps+i*7919+104729)%65536); local B=vrm((ps+i*7919+209458)%65536); local C=vrm((ps+i*7919+314187)%65536); local nx=vr()');
    line('if nx>0 then local x={} for j=1,nx do x[j]=vrm((ps+i*7919+(3+j)*104729)%65536) end c[i]={o,A,B,C,x} else c[i]={o,A,B,C} end end');
    line('local nz=vr(); local z={}');
    line('for i=1,nz do z[i]=proto() end');
    line('local cs=0 for i=1,#c do cs=(cs+c[i][1]*(i+13))%65521 end');
    line('local kr=k; k={}; setmetatable(k,{__index=function(t,i) local v=rawget(t,i) if v~=nil then return v end local e=kr[i] if e==nil then return nil end if type(e)=="table" and e["' + N.strmark + '"] then v=sdec(e) else v=e end rawset(t,i,v) kr[i]=nil return v end}) return {np,va,nu,k,c,z,ms,cs,rs} end');
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

    // ------------------------------------------------------- integrity policy
    // The encoded payload is validated in the decoder. Failed validation or
    // a missing VM prerequisite returns safely; the emitter never generates a
    // source loader, a destructive loop, or target/executor probes.

    // ----------------------------------------------------------------- guard
    // Guard levels validate only ordinary Luau primitives used by the VM. A
    // mismatch changes the decoder seal and causes a safe early return.
    if (glevel >= 1) {
      var ge = ng();
      line('["' + N.guard + '"]=(function(G)');
      line('if type(G)~="table" or type(bit32)~="table" or type(bit32.bxor)~="function" then return true end');
      line('if type(string)~="table" or type(string.char)~="function" or type(string.sub)~="function" then return true end');
      line('if type(table)~="table" or type(table.concat)~="function" or type(setmetatable)~="function" then return true end');
      if (glevel === 2) {
        line('if #string.rep("ab",3)~=6 or table.concat({"a","b"})~="ab" or math.floor(1.5)~=1 then return true end');
        line('local ok,v=pcall(function() return (17*19)%23 end); if not ok or v~=1 then return true end');
      }
      line('G["' + N.seal + '"]=' + (blob.seal % 256) + '; return false');
      line('end),');
    }

    // ------------------------------------------------------------ interpreter
    line('["' + N.run + '"]=(function(' + P.s + ',' + P.p + ',' + P.u + ',...)');
    line('local rr={} local rs=' + P.p + '[9] or 0 local ' + L.r + '=rs>0 and setmetatable({},{__index=function(_,i) return rr[i+rs] end,__newindex=function(_,i,v) rr[i+rs]=v end}) or rr');
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
    if (glevel >= 2) {
      // Keep both verification locals distinct from generated parameters and
      // from each other. Reusing a name here can shadow the prototype or turn
      // the numeric accumulator into the code table.
      var verifySum = ng();
      var verifyCode = ng();
      line('do local ' + verifySum + '=0; local ' + verifyCode + '=' + P.p + '[5]; for i=1,#' + verifyCode + ' do ' + verifySum + '=(' + verifySum + '+' + verifyCode + '[i][1]*(i+13))%65521 end; if ' + verifySum + '~=' + P.p + '[8] then F.d=true;F.n=0;F.o=0 end end');
    }
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
    // opcode polymorphism: each real opcode is also reachable through extra
    // alias ids that trigger the identical handler, so the same operation
    // arrives under several numeric values and a pattern-matching
    // deobfuscator cannot pin an opcode by its id alone
    var nAlias = opts.junk >= 2 ? 3 : opts.junk === 1 ? 2 : 1;
    for (i = 0; i < OPS.length; i++) {
      if (!usedOps[i]) continue;
      for (var ai = 0; ai < nAlias; ai++) {
        var av;
        do { av = 1 + Math.floor(rng() * 0xFFFE); } while (seen[av]);
        seen[av] = 1;
        branches.push({ id: av, fn: H[OPS[i]], opidx: i });
      }
    }
    for (i = 0; i < deadIds.length; i++) branches.push({ id: deadIds[i], fn: H[OPS[Math.floor(rng() * OPS.length)]], dead: true });
    // shuffled dispatch order
    for (i = branches.length - 1; i > 0; i--) {
      var j2 = Math.floor(rng() * (i + 1));
      var tmp = branches[i]; branches[i] = branches[j2]; branches[j2] = tmp;
    }
    // This is generated rather than named `vs`: a literal local could shadow
    // the generated program-table parameter inside a dispatch branch.
    var variantList = ng();
    var chain = '';
    for (i = 0; i < branches.length; i++) {
      var b2 = branches[i];
      if (b2.dead) {
        chain += (i === 0 ? 'if' : ' elseif') + ' o==' + hex(b2.id) + ' then nx=' + P.s + '["' + b2.fn + '"](' + P.s + ',F,I)';
      } else {
        chain += (i === 0 ? 'if' : ' elseif') + ' o==' + hex(b2.id) + ' then local ' + variantList + '=' + vtl + '[' + b2.opidx + ']; nx=' + variantList + '[((F.ip+F.o)%#' + variantList + ')+1](' + P.s + ',F,I)';
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
      line('if ' + gl + '==nil or not (' + lockConds.join(' or ') + ') then return nil end');
      line('end');
    }
    if (glevel === 0) {
      line(P.s + '["' + N.seal + '"]=' + (blob.seal % 256) + ';');
    }
    if (glevel >= 1) {
      line('local ' + ge + '=' + P.s + '["' + N.guard + '"](' + P.s + ')');
      line('if ' + ge + ' then ' + P.s + '["' + N.seal + '"]=' + scrG + ' end');
    }
    line('local P=' + P.s + '["' + N.dec + '"](' + P.s + ',' + P.s + '["' + N.blob + '"])');
    line(P.s + '["' + N.blob + '"]=nil; ' + P.s + '["' + N.alpha + '"]=nil; ' + P.s + '["' + N.check1 + '"]=nil; ' + P.s + '["' + N.check2 + '"]=nil; ' + P.s + '["' + N.dec + '"]=nil; ' + P.s + '["' + N.seal + '"]=nil; ' + P.s + '["' + N.guard + '"]=nil');
    line('if not P then return nil end');

    line('local f=' + P.s + '["' + N.mk + '"](' + P.s + ',P,{})');
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
    return {
      source: src,
      ids: ids,
      stats: { bytes: blob.bytes, packedBytes: blob.packedBytes, compressed: blob.compressed,
        integrity: integrityLevel, vmMode: vmMode, payload: blob.payload.length, opcodes: Object.keys(usedOps).length }
    };
  }

  function hex(v) { return '0x' + v.toString(16).toUpperCase(); }

  return { emit: emit, OPS: OPS };
});
