/*!
 * obfuscate.js — the Darkfuscator transformation engine.
 *
 * Everything here is semantics-preserving: the tool parses the source, resolves
 * scopes, then rewrites tokens. After generating output it re-parses the result
 * with the real Luau parser and refuses to return anything that is not valid,
 * runnable Luau.
 *
 * Browser: window.Darkfuscator   Node: require('./obfuscate.js')
 */
(function (root, factory) {
  var isNode = typeof module === 'object' && module.exports;
  var Lexer = isNode ? require('./luau-lexer.js') : root.LuauLexer;
  var Parser = isNode ? require('./luau-parser.js') : root.LuauParser;
  var VMCompile = isNode ? require('./vm-compile.js') : root.DarkfuscatorVMCompile;
  var VMEmit = isNode ? require('./vm-emit.js') : root.DarkfuscatorVMEmit;
  var api = factory(Lexer, Parser, VMCompile, VMEmit);
  if (isNode) module.exports = api;
  if (root) root.Darkfuscator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lexer, Parser, VMCompile, VMEmit) {
  'use strict';

  var bytesToStr = Lexer.bytesToStr;
  var strToBytes = Lexer.strToBytes;

  // ------------------------------------------------------------------ config
  // Every build is a bytecode VM build, so these are intensity knobs for that
  // pipeline rather than separate obfuscation modes.
  var DEFAULTS = {
    nameStyle: 'random',        // short | random | confuse — generated identifiers
    minify: true,               // one-line output (off = one slot per line)
    junk: 1,                    // 0 | 1 | 2 — decoy dispatch branches and slots
    guard: 1,                   // 0 | 1 | 2 — anti-environment audit strength
    captureGlobals: true,       // grab the caller's environment with getfenv()
    watermark: true,            // leading "protected by" comment
    lockPlace: '',              // optional Roblox place id the build is bound to
    lockUniverse: '',           // optional Roblox universe id the build is bound to
    envChecks: 2,               // 0 | 1 | 2 — anti-env probes + environment-derived seal
    envLock: false,             // refuse to decode outside a genuine Roblox client
    antiTamper: 0               // 0 | 1 | 2 — chunked loader wrapper: off | fast | full
  };


  // Globals that must never be hoisted into locals (environment / late binding).

  var LUA_KEYWORDS = Lexer.KEYWORDS;

  // --------------------------------------------------------------------- rng
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    if (seed === null || seed === undefined || seed === '') seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    var rnd = mulberry32(seed >>> 0);
    rnd.seed = seed >>> 0;
    return rnd;
  }

  /** Syntax check only — used by the UI "Validate" button. */
  function validate(src) {
    try {
      Parser.parse(src);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message, line: e.line, col: e.col };
    }
  }

  function obfuscate(src, options) {
    var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    var T = {}, _last = t0;
    function mark(name) {
      var now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      T[name] = Math.round(now - _last); _last = now;
    }
    var opts = {};
    for (var k in DEFAULTS) opts[k] = DEFAULTS[k];
    for (var ok in (options || {})) if (options[ok] !== undefined) opts[ok] = options[ok];

    var result = {
      ok: false, output: '', error: null, stats: {}, warnings: [], options: opts
    };

    // ---------------------------------------------------------- 1. parse
    var parsed;
    try {
      parsed = Parser.parse(src);
    } catch (e) {
      result.error = {
        message: e.message, line: e.line, col: e.col, name: e.name || 'LuauSyntaxError'
      };
      return result;
    }
    mark('parse');
    var toks = parsed.toks, code = parsed.code, refs = parsed.refs, symbols = parsed.symbols;
    result.warnings = parsed.warnings.slice();

    // --------------------------------------------- 2. compile + emit bytecode
    // The bytecode VM is the transformation pipeline: the AST is compiled to
    // register bytecode and shipped inside an encrypted interpreter build.
    var vmErr = null, vmOut = null;
    try {
      var prog = VMCompile.compile(parsed.ast, refs);
      var vmRng = makeRng(opts.seed);
      vmOut = VMEmit.emit(prog, {
        rng: vmRng,
        junk: opts.junk === 2 ? 2 : opts.junk === 1 ? 1 : 0,
        minify: opts.minify !== false,
        nameStyle: opts.nameStyle || 'random',
        guard: opts.guard === 2 ? 2 : opts.guard === 0 ? 0 : 1,
        captureGlobals: opts.captureGlobals !== false,
        watermark: opts.watermark !== false,
        lockPlace: opts.lockPlace || '',
        lockUniverse: opts.lockUniverse || '',
        envChecks: opts.envChecks === 0 ? 0 : opts.envChecks === 1 ? 1 : 2,
        envLock: opts.envLock === true,
        antiTamper: opts.antiTamper === 1 ? 1 : opts.antiTamper === 2 ? 2 : 0
      });
    } catch (e) {
      vmErr = e;
    }
    if (vmOut) {
      var vmSrc = vmOut.source;
      if (!/\n$/.test(vmSrc)) vmSrc += '\n';
      var vmBad = null;
      try { Parser.parse(vmSrc); } catch (e2) { vmBad = e2; }
      if (!vmBad) {
        mark('vm');
        result.stats.times = T;
        result.stats.seed = vmRng.seed;
        result.stats.engine = 'vm';
        result.stats.ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        result.stats.inputChars = String(src).length;
        result.stats.outputChars = vmSrc.length;
        result.stats.locals = symbols.length;
        result.stats.ratio = result.stats.inputChars ? vmSrc.length / result.stats.inputChars : 0;
        result.stats.bytecodeBytes = vmOut.stats.bytes;
        result.stats.payloadChars = vmOut.stats.payload;
        result.stats.opcodes = vmOut.stats.opcodes;
        result.stats.protos = countProtos(prog);
        result.ok = true;
        result.output = vmSrc;
        result.raw = vmSrc;
        return result;
      }
      vmErr = vmBad;
    }
    // Nothing else can produce output for this input: report it rather than
    // silently shipping something that was never verified.
    result.error = {
      message: 'Bytecode compiler could not handle this script: ' + (vmErr && vmErr.message ? vmErr.message : 'unknown error'),
      line: vmErr && vmErr.line, col: vmErr && vmErr.col, name: 'VMCompileError'
    };
    return result;
  }

  function countProtos(p) {
    var n = 1;
    for (var i = 0; i < p.kids.length; i++) n += countProtos(p.kids[i]);
    return n;
  }

  return {
    obfuscate: obfuscate,
    validate: validate,
    parse: function (s) { return Parser.parse(s); },
    tokenize: function (s) { return Lexer.tokenize(s); },
    version: '4.3.0'
  };
});
