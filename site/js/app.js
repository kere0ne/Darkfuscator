/*!
 * app.js — Darkfuscator UI wiring.
 * Depends on: luau-lexer.js, luau-parser.js, lz.js, vm-compile.js, vm-emit.js,
 *             obfuscate.js (window.Darkfuscator)
 *
 * The engine's own defaults ARE the protection profile (maximum: strict
 * anti-environment audit, full anti-tamper loader, monstrous junk, confuse
 * naming, compression). The UI exposes no settings: every build ships the
 * strongest profile. A hidden localStorage key ("darkfuscator.overrides")
 * exists for automated testing only.
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
    file: $('#file'), browse: $('#browse'),
    protect: $('#protect'), validate: $('#validate'), clear: $('#clear'),
    copy: $('#copy'), download: $('#download'), publish: $('#btn-publish'),
    paneIn: $('#pane-in'), verified: $('#verified-badge')
  };

  var API_BASE = 'https://darkfuscator.pages.dev';
  var lastPayload = null;

  // ------------------------------------------------------------------ utils
  function fmt(n) { return Number(n).toLocaleString(); }
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
  // Maximum profile comes from the engine itself. The hidden overrides key is
  // for automated tests, not a settings surface.
  function readOptions() {
    var o = {};
    try {
      var raw = localStorage.getItem('darkfuscator.overrides');
      if (raw) {
        var ov = JSON.parse(raw);
        for (var k in ov) o[k] = ov[k];
      }
    } catch (e) { /* ignore */ }
    return o;
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

  // --------------------------------------------------------------- obfuscate
  var lastFilename = 'protected.luau';

  function runObfuscate() {
    var src = el.input.value;
    if (!src.trim()) {
      setStatus('Paste some Luau, or drop a file first.', 'warn');
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

    lastPayload = res.output;
    el.output.value = res.output;
    updateMeta();
    updateStats(res);
    el.verified.hidden = false;

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

  el.protect.addEventListener('click', runObfuscate);
  el.validate.addEventListener('click', runValidate);
  el.copy.addEventListener('click', copyOutput);
  el.download.addEventListener('click', downloadOutput);
  el.browse.addEventListener('click', function () { el.file.click(); });

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

  // drag & drop anywhere
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

  // ------------------------------------------------- connected loader publish
  function publishConnected(payload) {
    var tok = localStorage.getItem('dk_admin_token') || '';
    var attempt = function (t) {
      return fetch(API_BASE + '/api/builds', {
        method: 'POST',
        headers: { 'x-admin-token': t, 'content-type': 'application/json' },
        body: JSON.stringify({ payload: payload })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var err = new Error((d && d.error) || ('HTTP ' + r.status)); err.status = r.status; throw err; }
          return d;
        });
      });
    };
    var run = function (t) {
      setStatus('Publishing to dashboard…');
      attempt(t).then(function (d) {
        el.output.value = d.loader;
        updateMeta();
        localStorage.setItem('dk_admin_token', t);
        setStatus('Published as ' + d.id + '. The output is now the connected loader — share that, not the build.', 'ok');
      }).catch(function (e) {
        if (e.status === 401) {
          var asked = window.prompt('Darkfuscator admin token (ADMIN_TOKEN):', '');
          if (asked && asked.trim()) { run(asked.trim()); return; }
        }
        setStatus('Publish failed: ' + e.message + '. The self-contained build is still in the output.', 'warn');
      });
    };
    run(tok);
  }

  el.publish.onclick = function () {
    if (lastPayload) { publishConnected(lastPayload); }
    else { setStatus('Obfuscate something first, then publish.', 'warn'); }
  };

  // ------------------------------------------------------------------- init
  if (!el.input.value) updateMeta();
  setStatus('Ready. Maximum protection, automatically.');
})();
