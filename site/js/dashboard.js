(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var API_BASE = localStorage.getItem('dk_api_base') || 'https://darkfuscator.pages.dev';
  var STATES = [
    { key: 'invalid', name: 'Invalid loader (ID not found)' },
    { key: 'expired', name: 'Expired loader' },
    { key: 'revoked', name: 'Revoked loader' },
    { key: 'unauthorized', name: 'Unauthorized (wrong token)' }
  ];
  var STATUS_CODES = [200, 400, 401, 403, 404, 410, 418, 500];

  var token = localStorage.getItem('dk_admin_token') || '';
  var builds = [];
  var current = null;

  // ------------------------------------------------------------------ utils

  function toast(msg, error) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.className = 'toast'; }, 3600);
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-admin-token': token }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') {
      opts.headers['content-type'] = 'application/json';
      opts.body = JSON.stringify(opts.body);
    }
    return fetch(API_BASE + path, opts).then(function (r) {
      return r.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!r.ok) {
          var err = new Error((data && data.error) || ('HTTP ' + r.status));
          err.status = r.status;
          throw err;
        }
        return data;
      });
    });
  }

  function fmtTime(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function statusChip(state) {
    var map = {
      valid: ['active', '#39d98a'],
      expired: ['expired', '#ffb347'],
      revoked: ['revoked', '#ff5a5a'],
      invalid: ['—', '#8b7d74']
    };
    var m = map[state] || map.invalid;
    return '<span class="chip-status" style="color:' + m[1] + ';border-color:' + m[1] + '">' + m[0] + '</span>';
  }

  // ------------------------------------------------------------------ builds list

  function loadBuilds() {
    return api('/api/builds').then(function (data) {
      builds = (data && data.builds) || [];
      renderBuilds();
    }).catch(function (e) {
      if (e.status === 401) { showGate('That token was rejected. Check ADMIN_TOKEN on the Pages project.'); }
      else { toast('Could not load builds: ' + e.message, true); }
    });
  }

  function renderBuilds() {
    var body = $('builds-body');
    if (!builds.length) {
      body.innerHTML = '<tr><td colspan="8" class="muted">No builds yet. Obfuscate something on the Obfuscate page with Connected loader on, then Publish.</td></tr>';
      return;
    }
    var rows = builds.map(function (b) {
      return '<tr>'
        + '<td><b>' + b.id + '</b></td>'
        + '<td>' + statusChip(b.status) + '</td>'
        + '<td>' + fmtTime(b.created) + '</td>'
        + '<td>' + (b.expires ? fmtTime(b.expires) : 'never') + '</td>'
        + '<td>' + b.last24 + '</td>'
        + '<td>' + b.total + '</td>'
        + '<td>' + fmtTime(b.last) + '</td>'
        + '<td class="row-actions">'
        + '<button class="btn btn-sm" data-act="edit" data-id="' + b.id + '">Edit</button> '
        + '<button class="btn btn-sm" data-act="logs" data-id="' + b.id + '">Logs</button>'
        + '</td></tr>';
    });
    body.innerHTML = rows.join('');
  }

  $('builds-body').addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    if (btn.getAttribute('data-act') === 'edit') openEditor(btn.getAttribute('data-id'));
    if (btn.getAttribute('data-act') === 'logs') openLogs(btn.getAttribute('data-id'));
  });

  // ------------------------------------------------------------------ editor

  function buildStateGrid() {
    var html = STATES.map(function (s) {
      var opts = STATUS_CODES.map(function (c) {
        return '<option value="' + c + '">' + c + '</option>';
      }).join('');
      return '<div class="state-card">'
        + '<div class="state-head"><b>' + s.name + '</b>'
        + '<div><label style="font-size:.7rem" class="muted">status</label> '
        + '<select id="ed-' + s.key + '-status">' + opts + '</select>'
        + ' <button class="btn btn-sm" data-preview="' + s.key + '">Preview</button></div></div>'
        + '<textarea id="ed-' + s.key + '-body" rows="7" spellcheck="false"></textarea>'
        + '</div>';
    }).join('');
    $('state-grid').innerHTML = html;
    $('state-grid').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-preview]');
      if (!btn) return;
      var key = btn.getAttribute('data-preview');
      $('preview-title').textContent = 'Preview · ' + key;
      $('preview-frame').srcdoc = $('ed-' + key + '-body').value;
      $('preview-modal').classList.add('open');
    });
  }

  function openEditor(id) {
    api('/api/builds/' + id).then(function (data) {
      current = data;
      $('editor').hidden = false;
      $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('editor-title').textContent = data.build.id;
      $('ed-redirect').value = data.build.redirect || '';
      var exp = data.build.expires;
      $('ed-expires').value = exp
        ? new Date(exp - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)
        : '';
      $('ed-toggle-revoke').textContent = data.build.revoked ? 'Un-revoke' : 'Revoke';
      $('ed-toggle-revoke').setAttribute('data-revoked', data.build.revoked ? '1' : '0');
      STATES.forEach(function (s) {
        var cfg = (data.build.responses && data.build.responses[s.key]) || {};
        var sel = $('ed-' + s.key + '-status');
        var code = String(cfg.status || 403);
        if (STATUS_CODES.indexOf(Number(code)) === -1) { sel.innerHTML += '<option value="' + code + '">' + code + '</option>'; }
        sel.value = code;
        $('ed-' + s.key + '-body').value = cfg.body || '';
      });
    }).catch(function (e) { toast('Could not load build: ' + e.message, true); });
  }

  function saveEditor() {
    if (!current) return;
    var expRaw = $('ed-expires').value;
    var expires = expRaw ? new Date(expRaw).getTime() : null;
    var responses = {};
    STATES.forEach(function (s) {
      responses[s.key] = {
        status: Number($('ed-' + s.key + '-status').value) || 403,
        body: $('ed-' + s.key + '-body').value
      };
    });
    api('/api/builds/' + current.build.id, {
      method: 'PUT',
      body: {
        expires: expires,
        revoked: $('ed-toggle-revoke').getAttribute('data-revoked') === '1',
        redirect: $('ed-redirect').value,
        responses: responses
      }
    }).then(function () {
      toast('Saved ' + current.build.id);
      loadBuilds();
    }).catch(function (e) { toast('Save failed: ' + e.message, true); });
  }

  $('ed-save').onclick = saveEditor;
  $('ed-close').onclick = function () { $('editor').hidden = true; current = null; };

  $('ed-toggle-revoke').onclick = function () {
    var b = $('ed-toggle-revoke');
    var now = b.getAttribute('data-revoked') === '1' ? '0' : '1';
    b.setAttribute('data-revoked', now);
    b.textContent = now === '1' ? 'Un-revoke' : 'Revoke';
  };

  $('ed-copy-loader').onclick = function () {
    if (!current || !current.loader) return;
    navigator.clipboard.writeText(current.loader).then(function () {
      toast('Loader code copied');
    }, function () { toast('Copy failed', true); });
  };

  $('ed-delete').onclick = function () {
    if (!current) return;
    if (!window.confirm('Delete ' + current.build.id + ' and its request log?')) return;
    api('/api/builds/' + current.build.id, { method: 'DELETE' }).then(function () {
      toast('Deleted ' + current.build.id);
      $('editor').hidden = true;
      $('logs-card').hidden = true;
      current = null;
      loadBuilds();
    }).catch(function (e) { toast('Delete failed: ' + e.message, true); });
  };

  // ------------------------------------------------------------------ logs

  function openLogs(id) {
    api('/api/builds/' + id).then(function (data) {
      $('logs-card').hidden = false;
      $('logs-title').textContent = 'Requests · ' + id;
      var rows = (data.logs || []).map(function (l) {
        var meta = [l.ua || '', l.cc || ''].filter(Boolean).join(' · ');
        return '<tr><td>' + fmtTime(l.t) + '</td><td>' + statusChip(l.s) + '</td><td class="muted">' +
          String(meta).replace(/</g, '&lt;') + '</td></tr>';
      });
      $('logs-body').innerHTML = rows.length
        ? rows.join('')
        : '<tr><td colspan="3" class="muted">No requests recorded yet.</td></tr>';
      $('logs-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }).catch(function (e) { toast('Could not load logs: ' + e.message, true); });
  }

  // ------------------------------------------------------------------ gate / boot

  function showGate(msg) {
    $('main').hidden = true;
    $('gate').hidden = false;
    if (msg) {
      $('gate-error').hidden = false;
      $('gate-error').textContent = msg;
    }
  }

  function unlock() {
    var v = $('gate-token').value.trim();
    if (!v) return;
    token = v;
    localStorage.setItem('dk_admin_token', v);
    $('gate-error').hidden = true;
    api('/api/builds').then(function () {
      $('gate').hidden = true;
      $('main').hidden = false;
      loadBuilds();
    }).catch(function (e) {
      showGate('That token was rejected (' + e.message + ').');
    });
  }

  $('gate-go').onclick = unlock;
  $('gate-token').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') unlock();
  });

  $('btn-refresh').onclick = function () { loadBuilds().then(function () { toast('Refreshed'); }); };

  $('preview-close').onclick = $('preview-backdrop').onclick = function () {
    $('preview-modal').classList.remove('open');
  };

  $('btn-menu').onclick = function () {
    var shell = document.querySelector('.shell');
    if (window.matchMedia('(max-width: 860px)').matches) shell.classList.toggle('sidebar-open');
    else shell.classList.toggle('sidebar-hidden');
  };

  buildStateGrid();

  if (token) {
    api('/api/builds').then(function () {
      $('gate').hidden = true;
      $('main').hidden = false;
      loadBuilds();
    }).catch(function () { showGate(); });
  } else {
    showGate();
  }
})();
