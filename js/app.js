/*!
 * app.js — Darkfuscator UI wiring.
 * Depends on: luau-lexer.js, luau-parser.js, obfuscate.js (window.Darkfuscator)
 */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  if (!window.Darkfuscator) {
    var st = document.getElementById('status');
    if (st) { st.className = 'status err'; st.textContent = 'Engine failed to load — check that js/*.js files are present.'; }
    return;
  }

  var DK = window.Darkfuscator;
  var el = {
    input: $('#input'), output: $('#output'),
    inmeta: $('#inmeta'), outmeta: $('#outmeta'),
    status: $('#status'), error: $('#error'), stats: $('#stats'),
    seed: $('#seed'),
    file: $('#file'),
    protect: $('#protect'), validate: $('#validate'), clear: $('#clear'),
    copy: $('#copy'), download: $('#download'),
    paneIn: $('#pane-in'), paneOut: $('#pane-out'), verified: $('#verified-badge'),
    advanced: $('#advanced')
  };

  // only the knobs the bytecode pipeline actually uses
  var OPTION_CONTROLS = {
    nameStyle: '#opt-nameStyle', minify: '#opt-minify', junk: '#opt-junk',
    guard: '#opt-guard', watermark: '#opt-watermark',
    lockPlace: '#opt-lockPlace', lockUniverse: '#opt-lockUniverse',
    envChecks: '#opt-envChecks', envLock: '#opt-envLock', antiTamper: '#opt-antiTamper'
  };
  var STORE_KEY = 'darkfuscator.opts.v2';

  // ------------------------------------------------------------------ utils
  function fmt(n) { return Number(n).toLocaleString(); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function countLines(s) { return s ? s.split('\n').length : 0; }

  function setStatus(text, kind) {
    el.status.textContent = text;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function clearError() { el.error.hidden = true; el.error.innerHTML = ''; }

  function showError(title, detail) {
    el.error.hidden = false;
    el.error.innerHTML = '';
    var h = document.createElement('h4');
    h.textContent = title;
    el.error.appendChild(h);
    if (detail) {
      var pre = document.createElement('pre');
      pre.textContent = detail;
      el.error.appendChild(pre);
    }
  }

  /** Render a parse error with the offending source line and a caret. */
  function showSyntaxError(e, src) {
    var lines = String(src).split('\n');
    var line = e.line || 1, col = e.col || 1;
    var text = lines[line - 1] !== undefined ? lines[line - 1] : '';
    var frame = '';
    if (text !== '') {
      var caret = '';
      for (var i = 1; i < col; i++) caret += (text.charAt(i - 1) === '\t' ? '\t' : ' ');
      frame = text + '\n' + caret + '^';
    }
    showError('Luau syntax error — line ' + line + ', column ' + col, frame + '\n' + e.message);
    setStatus('Fix the syntax error above, then try again.', 'err');
  }

  // ---------------------------------------------------------------- options
  function readOptions() {
    var o = {};
    for (var key in OPTION_CONTROLS) {
      var node = $(OPTION_CONTROLS[key]);
      if (!node) continue;
      o[key] = node.type === 'checkbox' ? node.checked : node.value;
    }
    o.junk = parseInt(o.junk, 10) || 0;
    o.guard = parseInt(o.guard, 10);
    if (o.guard !== 0 && o.guard !== 2) o.guard = 1;
    var seed = el.seed.value.trim();
    o.seed = seed === '' ? null : (isNaN(Number(seed)) ? seed : Number(seed));
    return o;
  }

  function writeOptions(o) {
    for (var key in OPTION_CONTROLS) {
      if (o[key] === undefined) continue;
      var node = $(OPTION_CONTROLS[key]);
      if (!node) continue;
      if (node.type === 'checkbox') node.checked = !!o[key];
      else node.value = String(o[key]);
    }
  }

  function saveOptions() {
    try {
      var o = readOptions();
      delete o.seed;
      localStorage.setItem(STORE_KEY, JSON.stringify(o));
    } catch (e) { /* private mode — ignore */ }
  }

  function loadOptions() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var o = JSON.parse(raw);
      writeOptions(o);
    } catch (e) { /* ignore */ }
  }

  // ----------------------------------------------------------------- counts
  function updateMeta() {
    el.inmeta.textContent = fmt(el.input.value.length) + ' chars · ' + fmt(countLines(el.input.value)) + ' lines';
    el.outmeta.textContent = fmt(el.output.value.length) + ' chars · ' + fmt(countLines(el.output.value)) + ' lines';
  }

  function updateStats(res) {
    if (!res || !res.stats) { el.stats.hidden = true; return; }
    var s = res.stats;
    el.stats.hidden = false;
    $('#st-protos').textContent = fmt(s.protos || 0);
    $('#st-opcodes').textContent = fmt(s.opcodes || 0);
    $('#st-bytes').textContent = fmt(s.bytecodeBytes || 0);
    $('#st-payload').textContent = fmt(s.payloadChars || 0);
    $('#st-size').textContent = fmt(s.inputChars) + ' \u2192 ' + fmt(s.outputChars) +
      ' (' + (s.ratio < 1 ? '' : '+') + Math.round((s.ratio - 1) * 100) + '%)';
    $('#st-time').textContent = fmt(s.ms || 0);
    $('#st-seed').textContent = s.seed !== undefined ? s.seed : '\u2014';
  }

  // ------------------------------------------------------------- obfuscate
  var lastFilename = 'protected.luau';

  function runObfuscate() {
    var src = el.input.value;
    if (!src.trim()) {
      setStatus('Paste some Luau, load an example, or upload a file first.', 'warn');
      el.input.focus();
      return;
    }
    clearError();
    el.verified.hidden = true;
    setStatus('Obfuscating…');

    var opts = readOptions();
    var res;
    try {
      res = DK.obfuscate(src, opts);
    } catch (e) {
      showError('The obfuscator hit an internal error', (e && e.message) || String(e));
      setStatus('Nothing was produced.', 'err');
      return;
    }

    if (!res.ok) {
      if (res.error && res.error.name === 'LuauSyntaxError') showSyntaxError(res.error, src);
      else showError('Could not obfuscate this input', (res.error && res.error.message) || 'Unknown error');
      el.stats.hidden = true;
      return;
    }

    el.output.value = res.output;
    updateMeta();
    updateStats(res);
    el.verified.hidden = false;

    if (window.DKUI && DKUI.toast) { DKUI.toast('Build finished'); } if (false) {
      DKUI.recordBuild({
        filename: lastFilename || 'protected.luau',
        date: new Date().toISOString(),
        seed: res.stats ? res.stats.seed : null,
        size: res.output.length,
        output: res.output.length < 1800000 ? res.output : null
      });
    }

    if (res.warnings && res.warnings.length) {
      setStatus('Done — ' + res.warnings.join(' '), 'warn');
    } else {
      setStatus('Done. Output re-parsed as valid Luau (' + fmt(res.output.length) + ' chars).', 'ok');
    }
  }

  function runValidate() {
    var src = el.input.value;
    if (!src.trim()) { setStatus('Nothing to validate yet.', 'warn'); return; }
    var v = DK.validate(src);
    if (v.ok) setStatus('Valid Luau — no syntax errors found.', 'ok');
    else showSyntaxError(v, src);
  }

  // ------------------------------------------------------------ clipboard io
  function copyOutput() {
    if (!el.output.value) { setStatus('Nothing to copy yet.', 'warn'); return; }
    var text = el.output.value;
    var done = function () { setStatus('Output copied to clipboard.', 'ok'); };
    var fallback = function () {
      try {
        el.output.select();
        var ok = document.execCommand('copy');
        window.getSelection().removeAllRanges();
        ok ? done() : setStatus('Copy failed — select the output and copy manually.', 'warn');
      } catch (e) {
        setStatus('Copy failed — select the output and copy manually.', 'warn');
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function downloadOutput() {
    if (!el.output.value) { setStatus('Nothing to download yet.', 'warn'); return; }
    var blob = new Blob([el.output.value], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = lastFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('Downloaded ' + lastFilename + '.', 'ok');
  }

  // -------------------------------------------------------------- file input
  function loadFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      el.input.value = String(reader.result || '');
      lastFilename = file.name.replace(/\.(lua|luau|txt)$/i, '') + '.protected.luau';
      el.output.value = '';
      updateMeta();
      clearError();
      setStatus('Loaded ' + file.name + ' (' + fmt(el.input.value.length) + ' chars).', 'ok');
    };
    reader.onerror = function () { setStatus('Could not read that file.', 'err'); };
    reader.readAsText(file);
  }

  // ------------------------------------------------------------------ events
  el.input.addEventListener('input', updateMeta);
  el.output.addEventListener('input', updateMeta);
  Object.keys(OPTION_CONTROLS).forEach(function (key) {
    var node = $(OPTION_CONTROLS[key]);
    if (!node) return;
    node.addEventListener('change', saveOptions);
  });
  el.seed.addEventListener('change', saveOptions);

  el.protect.addEventListener('click', runObfuscate);
  el.validate.addEventListener('click', runValidate);
  el.copy.addEventListener('click', copyOutput);
  el.download.addEventListener('click', downloadOutput);

  el.clear.addEventListener('click', function () {
    el.input.value = ''; el.output.value = ''; el.file.value = '';
    el.verified.hidden = true;
    el.stats.hidden = true;
    clearError();
    updateMeta();
    setStatus('Cleared.');
  });

  el.file.addEventListener('change', function (e) {
    loadFile(e.target.files && e.target.files[0]);
  });

  // drag & drop anywhere on the card
  ['dragenter', 'dragover'].forEach(function (evt) {
    el.paneIn.addEventListener(evt, function (e) {
      e.preventDefault();
      el.paneIn.classList.add('dragover');
    });
  });
  ['dragleave', 'drop'].forEach(function (evt) {
    el.paneIn.addEventListener(evt, function (e) {
      e.preventDefault();
      el.paneIn.classList.remove('dragover');
    });
  });
  el.paneIn.addEventListener('drop', function (e) {
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length) loadFile(dt.files[0]);
  });
  // also accept drops on the output pane and the whole document
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    var dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length && /\.(lua|luau|txt)$/i.test(dt.files[0].name)) loadFile(dt.files[0]);
  });

  // Ctrl/Cmd + Enter obfuscates
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runObfuscate();
    }
  });

  // ------------------------------------------------------------------- init
  loadOptions();
  if (!el.input.value) updateMeta();
  setStatus('Ready. Nothing leaves your browser.');
})();
