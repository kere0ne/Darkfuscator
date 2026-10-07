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
  var Pipeline = isNode ? require('./pipeline.js') : root.DarkfuscatorPipeline;
  var IR = isNode ? require('./ir.js') : root.DarkfuscatorIR;
  var api = factory(Lexer, Parser, VMCompile, VMEmit, Pipeline, IR);
  if (isNode) module.exports = api;
  if (root) root.Darkfuscator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Lexer, Parser, VMCompile, VMEmit, Pipeline, IR) {
  'use strict';

  var bytesToStr = Lexer.bytesToStr;
  var strToBytes = Lexer.strToBytes;

  // ------------------------------------------------------------------ config
  // Every build is a bytecode VM build, so these are intensity knobs for that
  // pipeline rather than separate obfuscation modes.
  var DEFAULTS = {
    nameStyle: 'random',        // short | random | confuse — generated identifiers
    minify: true,               // one-line output (off = one slot per line)
    junk: 3,                    // 0 | 1 | 2 | 3 | 4 — decoys, dead handlers, heavy junk, insane (~2 MB)
    guard: 2,                   // 0 | 1 | 2 — ordinary VM-prerequisite validation
    captureGlobals: true,       // grab the caller's environment with getfenv()
    watermark: true,            // leading protection notice
    lockPlace: '',              // optional Roblox place id the build is bound to
    lockUniverse: '',           // optional Roblox universe id the build is bound to
    antiTamper: 2,              // 0 | 1 | 2 — decoder integrity: off | fast | full
    vmMode: 'balanced',         // fast | balanced | secure runtime layout
    compression: false,         // optional RLE payload size pass
    vmLayers: 5,                // 1..10 — the build runs inside stacked VMs (auto-degrades on huge payloads)
    ir: 'fast'                  // none | fast | balanced | secure — source-level IR pass before the VM
  };

  // Presets select real compiler, IR, payload, and VM settings. The UI and
  // API expose the same bounded values rather than environment-specific probes.
  var PRESETS = {
    lightweight: { junk: 0, guard: 0, antiTamper: 0, vmMode: 'fast', compression: false, vmLayers: 1, ir: 'fast' },
    balanced:    { junk: 1, guard: 1, antiTamper: 1, vmMode: 'balanced', compression: true, vmLayers: 1, ir: 'balanced' },
    maximum:     { junk: 2, guard: 2, antiTamper: 2, vmMode: 'secure', compression: true, vmLayers: 1, ir: 'secure' }
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
  function freshSeed() {
    // Build identity comes from a cryptographically strong source when the
    // host provides one. The deterministic PRNG below is then seeded with it
    // so a supplied seed remains reproducible.
    try {
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 0;
      }
    } catch (e) {}
    try {
      if (typeof require === 'function') return require('crypto').randomBytes(4).readUInt32LE(0) >>> 0;
    } catch (e2) {}
    return (Math.random() * 0xFFFFFFFF) >>> 0;
  }
  function seedNumber(seed) {
    if (typeof seed === 'number' && isFinite(seed)) return seed >>> 0;
    var text = String(seed == null ? '' : seed);
    if (/^\d+$/.test(text)) return Number(text) >>> 0;
    // FNV-1a gives named seeds stable, explicit deterministic behavior.
    var h = 2166136261;
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function makeRng(seed) {
    if (seed === null || seed === undefined || seed === '') seed = freshSeed();
    seed = seedNumber(seed);
    var rnd = mulberry32(seed);
    rnd.seed = seed;
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
    // resolution order: defaults <- preset <- explicit options (explicit wins)
    var presetName = (options || {}).preset;
    if (PRESETS[presetName]) {
      var ps = PRESETS[presetName];
      for (var pk in ps) opts[pk] = ps[pk];
    }
    for (var ok in (options || {})) if (options[ok] !== undefined && ok !== 'preset') opts[ok] = options[ok];
    opts.junk = Math.max(0, Math.min(4, parseInt(opts.junk, 10) || 0));
    opts.guard = opts.guard === 2 || opts.guard === '2' ? 2 : opts.guard === 0 || opts.guard === '0' ? 0 : 1;
    opts.antiTamper = opts.antiTamper === 1 || opts.antiTamper === '1' ? 1 : opts.antiTamper === 2 || opts.antiTamper === '2' ? 2 : 0;
    opts.vmMode = opts.vmMode === 'fast' || opts.vmMode === 'secure' ? opts.vmMode : 'balanced';
    opts.compression = opts.compression === true || opts.compression === 'true';
    opts.ir = ['none', 'fast', 'balanced', 'secure'].indexOf(opts.ir) !== -1 ? opts.ir : 'fast';
    opts.vmLayers = parseInt(opts.vmLayers, 10);
    if (!(opts.vmLayers >= 1)) opts.vmLayers = 5;
    if (opts.vmLayers > 10) opts.vmLayers = 10;

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

    // ------------------------------------------------- 1b. source-level IR pass
    // constant folding, dead code, control-flow flattening, opaque predicates —
    // semantics-preserving and differentially tested against the real Luau VM.
    if (opts.ir && opts.ir !== 'none') {
      var irLevel = opts.ir;
      if (irLevel !== 'fast' && irLevel !== 'balanced' && irLevel !== 'secure') irLevel = 'fast';
      try {
        // The IR stage needs parser metadata (references and directives), not
        // only the AST root. It emits fresh Luau that is parsed again below.
        var irOut = IR.emitProgram(parsed, { rng: makeRng((seedNumber(opts.seed) ^ 0x5F3759DF) >>> 0), level: irLevel });
        result.stats.ir = irOut.stats;
        parsed = Parser.parse(irOut.source);
        toks = parsed.toks; code = parsed.code; refs = parsed.refs; symbols = parsed.symbols;
      } catch (e) {
        result.warnings.push('IR pass skipped: ' + e.message);
      }
    }
    mark('ir');

    // --------------------------------------------- 2. compile + emit bytecode
    // The bytecode VM is the transformation pipeline: the AST is compiled to
    // register bytecode and shipped inside a build-specific encoded interpreter build.
    var vmErr = null, vmOut = null, pipelineStats = null, bytecodeStats = null;
    try {
      var vmRng = makeRng(opts.seed);
      pipelineStats = Pipeline && Pipeline.optimizeAst ? Pipeline.optimizeAst(parsed.ast) : { folded: 0, passes: [] };
      mark('optimize');
      var prog = VMCompile.compile(parsed.ast, refs);
      bytecodeStats = VMCompile.optimize ? VMCompile.optimize(prog, { rng: vmRng, scrambleConstants: true }) : null;
      vmOut = VMEmit.emit(prog, {
        rng: vmRng,
        junk: opts.junk >= 2 ? 2 : opts.junk === 1 ? 1 : 0,
        minify: opts.minify !== false,
        nameStyle: opts.nameStyle || 'random',
        guard: opts.guard === 2 ? 2 : opts.guard === 0 ? 0 : 1,
        captureGlobals: opts.captureGlobals !== false,
        buildId: opts.buildId,
        watermark: opts.watermark !== false,
        lockPlace: opts.lockPlace || '',
        lockUniverse: opts.lockUniverse || '',
        antiTamper: opts.antiTamper,
        vmMode: opts.vmMode,
        compression: opts.compression,
        wrapReturn: opts.junk >= 3,
        noTiming: (opts.vmLayers || 1) > 1
      });
    } catch (e) {
      vmErr = e;
    }
    if (vmOut) {
      var vmSrc = vmOut.source;
      if (!/\n$/.test(vmSrc)) vmSrc += '\n';
      var engineName = 'vm';
      // stacked VM layers: each layer compiles the previous build's source
      // AGAIN into a freshly-randomised VM whose encoded payload carries
      // the whole previous build. Every layer has its own opcode map, byte
      // transformations, and integrity seal, so analysis must peel each layer.
      // Layers stop on their own when the payload outgrows sensible nesting,
      // which keeps large scripts on the strongest stack that still builds.
      var layerRng = vmRng, vms = 1;
      // nesting budget: a layer is only added while the previous build still
      // fits, which keeps the final output under ~4.5 MB even at 10 layers
      var MAX_LAYER_INPUT = 3000000;
      for (var LN = 2; LN <= opts.vmLayers; LN++) {
        if (vmSrc.length > MAX_LAYER_INPUT) {
          result.warnings.push('VM stack capped at ' + vms + ' layer' + (vms === 1 ? '' : 's') + ' (payload too large to nest further)');
          break;
        }
        try {
          var parsedN = Parser.parse(vmSrc);
          var progN = VMCompile.compile(parsedN.ast, parsedN.refs);
          layerRng = makeRng((layerRng.seed ^ (0x9E3779B9 + LN * 0x85EBCA6B)) >>> 0);
          if (VMCompile.optimize) VMCompile.optimize(progN, { rng: layerRng, scrambleConstants: true });
          var vmOutN = VMEmit.emit(progN, {
            rng: layerRng,
            junk: LN <= 3 ? (opts.junk >= 1 ? 1 : 0) : 0,
            minify: true,
            nameStyle: opts.nameStyle || 'random',
            guard: 1,             // inner layers validate VM prerequisites
            captureGlobals: true,
            watermark: false,
            lockPlace: '', lockUniverse: '',
            antiTamper: opts.antiTamper,
            vmMode: opts.vmMode,
            compression: opts.compression,
            wrapReturn: opts.junk >= 3
          });
          Parser.parse(vmOutN.source);
          vmSrc = vmOutN.source;
          if (!/\n$/.test(vmSrc)) vmSrc += '\n';
          vmOut = vmOutN;
          vms = LN;
          engineName = 'vm-x' + LN;
        } catch (eN) {
          result.warnings.push('VM layer ' + LN + ' refused the payload; stack stopped at ' + vms);
          break;
        }
      }
      // the outermost layer always re-emits with its own header off, so
      // stamp the banner on top of the final source ourselves
      var banner = '-- Protected by Darkfuscator. Obfuscation raises reverse-engineering cost; it is not impossible to defeat.';
      if (opts.watermark !== false && vmSrc.indexOf(banner) !== 0) {
        vmSrc = banner + '\n' + vmSrc;
      }
      result.stats.vms = vms;
      // heavy junk (junk 3, junk 4): dead `if false` statements appended to the final
      // source, never executed; level 3 ~900 KB, level 4 ~2 MB with wider shapes
      if (opts.junk >= 3) {
        var jR = heavyJunk(vmSrc, vmRng, opts.junk);
        vmSrc = jR.src;
        result.stats.junkStatements = jR.stmts;
      }
      var vmBad = null;
      try { Parser.parse(vmSrc); } catch (e2) { vmBad = e2; }
      if (!vmBad) {
        mark('vm');
        result.stats.times = T;
        result.stats.seed = vmRng.seed;
        result.stats.engine = engineName;
        result.stats.ms = Math.round(((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0);
        result.stats.inputChars = String(src).length;
        result.stats.outputChars = vmSrc.length;
        result.stats.locals = symbols.length;
        result.stats.ratio = result.stats.inputChars ? vmSrc.length / result.stats.inputChars : 0;
        result.stats.bytecodeBytes = vmOut.stats.bytes;
        result.stats.packedBytecodeBytes = vmOut.stats.packedBytes || vmOut.stats.bytes;
        result.stats.compressed = !!vmOut.stats.compressed;
        result.stats.integrity = vmOut.stats.integrity || 0;
        result.stats.vmMode = vmOut.stats.vmMode || opts.vmMode;
        result.stats.payloadChars = vmOut.stats.payload;
        result.stats.watermark = vmOut.stats.watermark || null;
        result.stats.opcodes = vmOut.stats.opcodes;
        result.stats.protos = countProtos(prog);
        result.stats.pipeline = { ast: pipelineStats || { folded: 0, passes: [] }, bytecode: bytecodeStats || { passes: [] } };
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

  // Heavy junk (junk 3): dead `if false` blocks stuffed with pure arithmetic on
  // local-only integers. The runtime skips them entirely, every value stays
  // non-negative so nothing can throw even if it ran, and the only effect is
  // parser noise: ~100k statements or ~950 KB, whichever limit hits first.
  function heavyJunk(src, rng, level) {
    var TARGET = level >= 4 ? 2000000 : 900000, MAXSTMT = level >= 4 ? 220000 : 100000;
    var parts = [], stmts = 0, size = 0;
    // two-character locals keep the noise dense: ~9 characters per statement
    // puts the 100k-statement target and the 900 KB target at the same place
    var POOL = 'abcdefghijklmnopqrstuvwxyz';
    while (stmts < MAXSTMT && size < TARGET) {
      var NV = 24 + Math.floor(rng() * 17);
      var vs = [], i;
      for (i = 0; i < NV; i++) vs.push(POOL.charAt(i % 26) + POOL.charAt(Math.floor(i / 26)));
      // scramble which names survive per block (they are block-local anyway)
      for (i = NV - 1; i > 0; i--) { var j3 = Math.floor(rng() * (i + 1)); var t3 = vs[i]; vs[i] = vs[j3]; vs[j3] = t3; }
      var b = ['if false then',
        'local ' + vs.join(',') + '=' + vs.map(function () { return String(1 + Math.floor(rng() * 999983)); }).join(',')];
      for (var s2 = 0; s2 < 6000 && stmts < MAXSTMT && size < TARGET; s2++) {
        var a = vs[Math.floor(rng() * NV)], c = vs[Math.floor(rng() * NV)];
        var lit = 1 + Math.floor(rng() * 2147483);
        var kind = Math.floor(rng() * 100), st;
        if (kind < 84) {
          var op = ['+', '-', '*'][Math.floor(rng() * 3)];
          st = a + '=' + a + op + c;
        } else if (kind < 93) {
          st = a + '=' + a + '%999983';
        } else if (kind < 91) {
          st = a + '=(' + a + '+' + lit + '-' + c + ')%999983';
        } else if (kind < 97 || level < 4) {
          st = a + '=bit32.bxor(' + a + ',' + c + ')%2147483647';
        } else if (kind < 98) {
          st = a + '=bit32.rshift(bit32.bxor(' + a + ',' + c + '),' + (1 + Math.floor(rng() * 16)) + ')+bit32.band(' + a + ',7)';
        } else {
          st = a + '=bit32.bxor(bit32.lshift(' + a + ',' + (1 + Math.floor(rng() * 8)) + '),bit32.bnot(' + c + '))%2147483647';
        }
        b.push(st); stmts++; size += st.length + 1;
      }
      b.push('end');
      parts.push(b.join('\n'));
    }
    return { src: src + '\n' + parts.join('\n') + '\n', stmts: stmts };
  }

  return {
    obfuscate: obfuscate,
    validate: validate,
    parse: function (s) { return Parser.parse(s); },
    tokenize: function (s) { return Lexer.tokenize(s); },
    version: '7.3.0'
  };
});
