/*!
 * app.js — Darkfuscator UI wiring (workspace edition).
 * Two pages: dashboard (index.html) and obfuscator (obfuscate.html).
 * Settings are user-tunable; preset fills the levels, explicit values win.
 * Everything runs client-side; nothing leaves the browser.
 */
(function () {
  'use strict';

  var isNode = (typeof module !== 'undefined') && module.exports;
  if (isNode) {
    if (typeof global !== 'undefined' && global.window) return;
  }
  if (typeof document === 'undefined') return;

  var $ = function (sel) { return document.querySelector(sel); };

  // element contract (ids the engine + tests rely on)
  var el = {
    status: $('#status'),
    error: $('#error'),
    input: $('#input'),
    output: $('#output'),
    inmeta: $('#inmeta'),
    outmeta: $('#outmeta'),
    paneIn: $('#pane-in'),
    paneOut: $('#pane-out'),
    file: $('#file'),
    protect: $('#protect'),
    validate: $('#validate'),
    clear: $('#clear'),
    copy: $('#copy'),
    download: $('#download'),
    stats: $('#stats'),
    stProtos: $('#st-protos'),
    stOpcodes: $('#st-opcodes'),
    stBytes: $('#st-bytes'),
    stPayload: $('#st-payload'),
    stSize: $('#st-size'),
    stTime: $('#st-time'),
    stJunk: $('#st-junk'),
    stSeed: $('#st-seed'),
    verifiedBadge: $('#verified-badge')
  };

  // ---------------------------------------------------------------- settings
  var presetSel = $('#opt-preset');
  var levelSels = {
    junk: $('#opt-junk'),
    guard: $('#opt-guard'),
    envChecks: $('#opt-envChecks'),
    antiTamper: $('#opt-antiTamper'),
    vmLayers: $('#opt-vmLayers')
  };
  var nameStyleSel = $('#opt-nameStyle');
  var seedEl = $('#opt-seed');
  var lockPlaceEl = $('#opt-lockPlace');
  var lockUniverseEl = $('#opt-lockUniverse');
  var switches = {
    minify: $('#opt-minify'),
    watermark: $('#opt-watermark'),
    captureGlobals: $('#opt-captureGlobals'),
    envLock: $('#opt-envLock')
  };

  var PRESETS = {
    lightweight: { junk: 1, guard: 1, envChecks: 1, antiTamper: 0, vmLayers: 1 },
    balanced: { junk: 2, guard: 2, envChecks: 2, antiTamper: 1, vmLayers: 2 },
    maximum: { junk: 3, guard: 2, envChecks: 2, antiTamper: 2, vmLayers: 5 }
  };

  function applyPreset(name) {
    var p = PRESETS[name];
    if (!p) return;
    for (var k in p) {
      if (levelSels[k]) levelSels[k].value = String(p[k]);
    }
  }

  function intVal(sel, fallback) {
    var v = parseInt(sel && sel.value, 10);
    return isFinite(v) ? v : fallback;
  }

  function collectOptions() {
    var o = {
      preset: presetSel ? presetSel.value : 'maximum',
      junk: intVal(levelSels.junk, 3),
      guard: intVal(levelSels.guard, 2),
      envChecks: intVal(levelSels.envChecks, 2),
      antiTamper: intVal(levelSels.antiTamper, 2),
      vmLayers: Math.min(5, Math.max(1, intVal(levelSels.vmLayers, 5))),
      nameStyle: nameStyleSel ? nameStyleSel.value : 'random',
      minify: !switches.minify || switches.minify.classList.contains('on'),
      watermark: !switches.watermark || switches.watermark.classList.contains('on'),
      captureGlobals: !switches.captureGlobals || switches.captureGlobals.classList.contains('on'),
      envLock: !!(switches.envLock && switches.envLock.classList.contains('on'))
    };
    var seedTxt = seedEl ? String(seedEl.value || '').trim() : '';
    if (seedTxt !== '' && isFinite(+seedTxt)) o.seed = +seedTxt;
    var lp = lockPlaceEl ? String(lockPlaceEl.value || '').trim() : '';
    var lu = lockUniverseEl ? String(lockUniverseEl.value || '').trim() : '';
    if (lp) o.lockPlace = lp;
    if (lu) o.lockUniverse = lu;
    return o;
  }

  if (presetSel) presetSel.addEventListener('change', function () { applyPreset(presetSel.value); });
  for (var k in switches) {
    if (switches[k]) switches[k].addEventListener('click', function () { this.classList.toggle('on'); });
  }

  // ------------------------------------------------------------------ helpers
  function setStatus(text, kind) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function clearError() { if (el.error) { el.error.hidden = true; el.error.innerHTML = ''; } }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function showError(title, detail) {
    if (!el.error) return;
    el.error.hidden = false;
    el.error.innerHTML = '<h4>' + escapeHtml(title) + '</h4><pre>' + escapeHtml(detail || '') + '</pre>';
  }

  function showSyntaxError(e, src) {
    var lines = String(src).split('\n');
    var line = (e && e.line) || 1, col = (e && e.col) || 1;
    var text = lines[line - 1] !== undefined ? lines[line - 1] : '';
    var frame = '';
    if (text !== '') {
      var caret = '';
      for (var i = 1; i < col; i++) caret += (text.charAt(i - 1) === '\t' ? '\t' : ' ');
      frame = text + '\n' + caret + '^';
    }
    showError('Luau syntax error — line ' + line + ', column ' + col, frame + '\n' + (e && e.message || ''));
    setStatus('Fix the syntax error above, then try again.', 'err');
  }

  function fmt(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  function updateMeta() {
    if (!el.input || !el.inmeta) return;
    var t = el.input.value || '';
    var lines = t === '' ? 0 : t.split('\n').length;
    el.inmeta.textContent = t.length + ' chars · ' + lines + ' lines';
  }

  // ------------------------------------------------------------------- engine
  function runValidate() {
    if (!window.Darkfuscator) { setStatus('Engine failed to load.', 'err'); return; }
    var src = el.input.value || '';
    if (!src.trim()) { setStatus('Paste some Luau first, or load a file.', 'warn'); return; }
    var v = window.Darkfuscator.validate(src);
    if (v.ok) setStatus('Valid Luau — no syntax errors found.', 'ok');
    else { clearError(); showSyntaxError(v, src); }
  }

    function runObfuscate() {
    clearError();
    if (el.verifiedBadge) el.verifiedBadge.hidden = true;
    if (!window.Darkfuscator) {
      el.status.className = 'status err';
      el.status.textContent = 'Engine failed to load — check that js/*.js files are present.';
      return;
    }
    var src = el.input.value || '';
    if (!src.trim()) { setStatus('Paste some Luau, load an example, or upload a file first.', 'warn'); return; }

    setStatus('Obfuscating…');
    var res, opts = collectOptions();
    try {
      res = window.Darkfuscator.obfuscate(src, opts);
    } catch (e) {
      setStatus('Nothing was produced.', 'err');
      showError('The obfuscator hit an internal error', (e && e.message) || String(e));
      return;
    }

    if (!res || !res.ok) {
      var err = res && res.error;
      if (err && err.name === 'LuauSyntaxError') showSyntaxError(err, src);
      else {
        setStatus('Nothing was produced.', 'err');
        showError('Could not obfuscate this input', (err && err.message) || 'Unknown error');
      }
      if (el.stats) el.stats.hidden = true;
      return;
    }

    el.output.value = res.output;
    updateStats(res);

    if (res.warnings && res.warnings.length) {
      setStatus('Done — ' + res.warnings.join(' '), 'warn');
    } else {
      setStatus('Done. Output re-parsed as valid Luau (' + fmt(res.output.length) + ' chars).', 'ok');
    }
    if (el.verifiedBadge) el.verifiedBadge.hidden = false;
  }

  function updateStats(res) {
    if (!res || !res.stats) { if (el.stats) el.stats.hidden = true; return; }
    var s = res.stats;
    if (el.stProtos) el.stProtos.textContent = s.protos || 0;
    if (el.stOpcodes) el.stOpcodes.textContent = s.opcodes || 0;
    if (el.stBytes) el.stBytes.textContent = s.bytecodeBytes || 0;
    if (el.stPayload) el.stPayload.textContent = s.payloadChars || 0;
    if (el.stSize) el.stSize.textContent = fmt(s.inputChars) + ' → ' + fmt(s.outputChars);
    if (el.stTime) el.stTime.textContent = fmt(s.ms || 0);
    if (el.stJunk) el.stJunk.textContent = s.junkStatements || 0;
    if (el.stSeed) el.stSeed.textContent = s.seed !== undefined ? s.seed : '—';
    if (el.outmeta) el.outmeta.textContent = fmt((el.output.value || '').length) + ' chars · ' + ((el.output.value || '').split('\n').length) + ' lines';
    if (el.stats) el.stats.hidden = false;
  }

  // ------------------------------------------------------------------ events
  if (el.input) {
    el.input.addEventListener('input', updateMeta);
    el.input.addEventListener('dragover', function (e) { e.preventDefault(); el.paneIn.classList.add('dragover'); });
    el.input.addEventListener('dragleave', function () { el.paneIn.classList.remove('dragover'); });
    el.input.addEventListener('drop', function (e) {
      e.preventDefault();
      el.paneIn.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
    });
  }

  function loadFile(f) {
    if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      el.input.value = String(r.result || '');
      updateMeta();
      setStatus('Loaded ' + f.name + '. Ready to obfuscate.', 'ok');
    };
    r.onerror = function () { setStatus('Could not read that file.', 'err'); };
    r.readAsText(f);
  }
  if (el.file) el.file.addEventListener('change', function () { loadFile(this.files[0]); });

  if (el.protect) el.protect.addEventListener('click', runObfuscate);
  if (el.validate) el.validate.addEventListener('click', runValidate);
  if (el.clear) el.clear.addEventListener('click', function () {
    el.input.value = '';
    el.output.value = '';
    el.inmeta.textContent = '0 chars · 0 lines';
    el.outmeta.textContent = '0 chars · 0 lines';
    if (el.stats) el.stats.hidden = true;
    clearError();
    if (el.verifiedBadge) el.verifiedBadge.hidden = true;
    setStatus('Cleared. Nothing leaves your browser.');
  });

  if (el.copy) el.copy.addEventListener('click', function () {
    var t = el.output.value || '';
    if (!t) { setStatus('Nothing to copy yet.', 'warn'); return; }
    var done = function () { setStatus('Copied to clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(done, function () { fallbackCopy(t, done); });
    } else fallbackCopy(t, done);
  });
  function fallbackCopy(text, done) {
    el.output.removeAttribute('readonly');
    el.output.select();
    try { document.execCommand('copy'); done(); } catch (e) { setStatus('Copy failed — select the output manually.', 'err'); }
    el.output.setAttribute('readonly', 'readonly');
    if (window.getSelection) window.getSelection().removeAllRanges();
  }

  if (el.download) el.download.addEventListener('click', function () {
    var t = el.output.value || '';
    if (!t) { setStatus('Nothing to download yet.', 'warn'); return; }
    var blob = new Blob([t], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'darkfuscator-output.luau';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus('Downloaded darkfuscator-output.luau.', 'ok');
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      runObfuscate();
    }
  });

  // ------------------------------------------------------------------- init
  updateMeta();
  if (presetSel) applyPreset(presetSel.value);
  setStatus('Ready. Nothing leaves your browser.');
})();
