/*
 * Local-only workspace wiring.
 * This page intentionally has no network calls: it invokes the loaded
 * Darkfuscator engine and reports only output that the engine parse-verifies.
 */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  function $(id) { return document.getElementById(id); }
  var el = {
    status: $('status'), error: $('error'), input: $('input'), output: $('output'),
    inmeta: $('inmeta'), outmeta: $('outmeta'), paneIn: $('pane-in'),
    file: $('file'), protect: $('protect'), validate: $('validate'), clear: $('clear'),
    copy: $('copy'), download: $('download'), stats: $('stats'), verified: $('verified-badge'),
    vms: $('st-vms'), bytes: $('st-bytes'), payload: $('st-payload'), size: $('st-size'),
    time: $('st-time'), seed: $('st-seed')
  };

  var controls = {
    preset: $('opt-preset'), vmMode: $('opt-vm-mode'), vmLayers: $('opt-vm-layers'),
    junk: $('opt-junk'), guard: $('opt-guard'), antiTamper: $('opt-integrity'),
    nameStyle: $('opt-name-style'), seed: $('opt-seed'), lockPlace: $('opt-lock-place'),
    lockUniverse: $('opt-lock-universe'), compression: $('opt-compression'),
    minify: $('opt-minify'), watermark: $('opt-watermark'), captureGlobals: $('opt-capture-globals')
  };

  var PRESETS = {
    lightweight: { vmMode: 'fast', vmLayers: '1', junk: '0', guard: '0', antiTamper: '0', compression: false },
    balanced: { vmMode: 'balanced', vmLayers: '2', junk: '1', guard: '1', antiTamper: '1', compression: true },
    maximum: { vmMode: 'secure', vmLayers: '4', junk: '2', guard: '2', antiTamper: '2', compression: true }
  };

  function setStatus(text, kind) {
    if (!el.status) return;
    el.status.textContent = text;
    el.status.className = 'status' + (kind ? ' ' + kind : '');
  }
  function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clearError() {
    if (!el.error) return;
    el.error.hidden = true;
    el.error.innerHTML = '';
  }
  function showError(title, detail) {
    if (!el.error) return;
    el.error.hidden = false;
    el.error.innerHTML = '<h4>' + escapeHtml(title) + '</h4><pre>' + escapeHtml(detail || '') + '</pre>';
  }
  function formatSize(value) {
    var n = Number(value) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / (1024 * 1024)).toFixed(2) + ' MB';
  }
  function updateInputMeta() {
    if (!el.input || !el.inmeta) return;
    var source = el.input.value || '';
    el.inmeta.textContent = source.length + ' chars · ' + (source ? source.split('\n').length : 0) + ' lines';
  }
  function syntaxDetail(err, source) {
    var line = Number(err && err.line) || 1;
    var column = Number(err && err.col) || 1;
    var text = String(source || '').split('\n')[line - 1] || '';
    return 'line ' + line + ', column ' + column + '\n' + text + '\n' + new Array(Math.max(1, column)).join(' ') + '^\n' + ((err && err.message) || 'Syntax error');
  }

  function readOptions() {
    var seed = controls.seed ? controls.seed.value.trim() : '';
    var opts = {
      preset: controls.preset ? controls.preset.value : 'balanced',
      vmMode: controls.vmMode ? controls.vmMode.value : 'balanced',
      vmLayers: Math.max(1, Math.min(10, parseInt(controls.vmLayers && controls.vmLayers.value, 10) || 2)),
      junk: Math.max(0, Math.min(4, parseInt(controls.junk && controls.junk.value, 10) || 0)),
      guard: Math.max(0, Math.min(2, parseInt(controls.guard && controls.guard.value, 10) || 0)),
      antiTamper: Math.max(0, Math.min(2, parseInt(controls.antiTamper && controls.antiTamper.value, 10) || 0)),
      nameStyle: controls.nameStyle ? controls.nameStyle.value : 'random',
      compression: !!(controls.compression && controls.compression.checked),
      minify: !!(controls.minify && controls.minify.checked),
      watermark: !!(controls.watermark && controls.watermark.checked),
      captureGlobals: !!(controls.captureGlobals && controls.captureGlobals.checked),
      lockPlace: controls.lockPlace ? controls.lockPlace.value.trim() : '',
      lockUniverse: controls.lockUniverse ? controls.lockUniverse.value.trim() : ''
    };
    if (seed) opts.seed = seed;
    return opts;
  }
  function applyPreset() {
    var preset = PRESETS[controls.preset && controls.preset.value];
    if (!preset) return;
    Object.keys(preset).forEach(function (key) {
      if (!controls[key]) return;
      if (controls[key].type === 'checkbox') controls[key].checked = preset[key];
      else controls[key].value = String(preset[key]);
    });
  }

  function validate() {
    clearError();
    var source = el.input ? el.input.value : '';
    if (!source.trim()) { setStatus('Paste Luau source or load a file first.', 'warn'); return; }
    if (!window.Darkfuscator || typeof window.Darkfuscator.validate !== 'function') {
      setStatus('The local engine did not load.', 'err');
      return;
    }
    var result = window.Darkfuscator.validate(source);
    if (result.ok) setStatus('Valid Luau — no parser errors found.', 'ok');
    else {
      showError('Luau syntax error', syntaxDetail(result, source));
      setStatus('Fix the syntax error and try again.', 'err');
    }
  }

  function updateStats(stats) {
    if (!stats) { if (el.stats) el.stats.hidden = true; return; }
    if (el.vms) el.vms.textContent = String(stats.vms || 0);
    if (el.bytes) el.bytes.textContent = formatSize(stats.bytecodeBytes);
    if (el.payload) el.payload.textContent = formatSize(stats.payloadChars);
    if (el.size) el.size.textContent = formatSize(stats.inputChars) + ' → ' + formatSize(stats.outputChars);
    if (el.time) el.time.textContent = (Number(stats.ms) || 0) + ' ms';
    if (el.seed) el.seed.textContent = stats.seed === undefined ? '—' : String(stats.seed);
    if (el.outmeta && el.output) {
      var output = el.output.value || '';
      el.outmeta.textContent = output.length + ' chars · ' + (output ? output.split('\n').length : 0) + ' lines';
    }
    if (el.stats) el.stats.hidden = false;
  }

  function protect() {
    clearError();
    if (el.verified) el.verified.hidden = true;
    var source = el.input ? el.input.value : '';
    if (!source.trim()) { setStatus('Paste Luau source or load a file first.', 'warn'); return; }
    if (!window.Darkfuscator || typeof window.Darkfuscator.obfuscate !== 'function') {
      setStatus('The local engine did not load.', 'err');
      return;
    }
    setStatus('Protecting locally…');
    var result;
    try {
      result = window.Darkfuscator.obfuscate(source, readOptions());
    } catch (error) {
      showError('The local engine stopped before producing output', error && error.message ? error.message : String(error));
      setStatus('Nothing was produced.', 'err');
      return;
    }
    if (!result || !result.ok) {
      var failure = result && result.error;
      if (failure && failure.name === 'LuauSyntaxError') showError('Luau syntax error', syntaxDetail(failure, source));
      else showError('Could not protect this source', (failure && failure.message) || 'The engine returned no verified output.');
      updateStats(null);
      setStatus('Nothing was produced.', 'err');
      return;
    }
    el.output.value = result.output;
    updateStats(result.stats);
    if (el.verified) el.verified.hidden = false;
    if (result.warnings && result.warnings.length) setStatus('Protected with warnings: ' + result.warnings.join(' '), 'warn');
    else setStatus('Done. Output was re-parsed as valid Luau.', 'ok');
  }

  function loadFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      if (el.input) el.input.value = String(reader.result || '');
      updateInputMeta();
      setStatus('Loaded ' + file.name + '. Ready to protect locally.', 'ok');
    };
    reader.onerror = function () { setStatus('Could not read that file.', 'err'); };
    reader.readAsText(file);
  }
  function fallbackCopy(text) {
    if (!el.output) return false;
    el.output.removeAttribute('readonly');
    el.output.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (ignore) {}
    el.output.setAttribute('readonly', 'readonly');
    if (window.getSelection) window.getSelection().removeAllRanges();
    return copied;
  }

  if (controls.preset) controls.preset.addEventListener('change', applyPreset);
  if (el.input) {
    el.input.addEventListener('input', updateInputMeta);
    el.input.addEventListener('dragover', function (event) { event.preventDefault(); if (el.paneIn) el.paneIn.classList.add('dragover'); });
    el.input.addEventListener('dragleave', function () { if (el.paneIn) el.paneIn.classList.remove('dragover'); });
    el.input.addEventListener('drop', function (event) {
      event.preventDefault();
      if (el.paneIn) el.paneIn.classList.remove('dragover');
      loadFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]);
    });
  }
  if (el.file) el.file.addEventListener('change', function () { loadFile(this.files && this.files[0]); });
  if (el.validate) el.validate.addEventListener('click', validate);
  if (el.protect) el.protect.addEventListener('click', protect);
  if (el.clear) el.clear.addEventListener('click', function () {
    if (el.input) el.input.value = '';
    if (el.output) el.output.value = '';
    updateInputMeta();
    if (el.outmeta) el.outmeta.textContent = 'No build yet';
    if (el.stats) el.stats.hidden = true;
    if (el.verified) el.verified.hidden = true;
    clearError();
    setStatus('Cleared. The local page does not retain a build history.');
  });
  if (el.copy) el.copy.addEventListener('click', function () {
    var output = el.output ? el.output.value : '';
    if (!output) { setStatus('Nothing to copy yet.', 'warn'); return; }
    var done = function () { setStatus('Copied protected output to the clipboard.', 'ok'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(output).then(done, function () {
      if (fallbackCopy(output)) done(); else setStatus('Copy failed — select the output manually.', 'err');
    });
    else if (fallbackCopy(output)) done();
    else setStatus('Copy failed — select the output manually.', 'err');
  });
  if (el.download) el.download.addEventListener('click', function () {
    var output = el.output ? el.output.value : '';
    if (!output) { setStatus('Nothing to download yet.', 'warn'); return; }
    var blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'darkfuscator-output.luau';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
    setStatus('Downloaded darkfuscator-output.luau.', 'ok');
  });
  document.addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); protect(); }
  });

  updateInputMeta();
})();
