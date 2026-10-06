/*!
 * auth.js — Darkfuscator account client. Talks to /api/auth/* and /api/me/*.
 * Sessions are httpOnly cookies set by the server; nothing sensitive lives here.
 */
(function () {
  'use strict';

  function api(path, opts) {
    opts = opts || {};
    var init = {
      method: opts.method || 'GET',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin'
    };
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
    return fetch(path, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        return { status: res.status, ok: res.ok, data: data };
      });
    }).catch(function () {
      return { status: 0, ok: false, data: { error: 'Network error. Check your connection.' } };
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
    return Promise.resolve();
  }

  function flash(el, msg, kind) {
    if (!el) return;
    el.textContent = msg;
    el.className = 'form-note ' + (kind === 'error' ? 'form-error' : 'form-ok');
    el.hidden = false;
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.hidden = true; }, 6000);
  }

  // ---- auth page (login.html) ----------------------------------------------
  function initAuthPage() {
    var tabs = document.querySelectorAll('.auth-tab');
    var forms = { login: document.getElementById('form-login'), signup: document.getElementById('form-signup') };
    if (!forms.login) return;

    // Already signed in? Straight to the dashboard.
    api('/api/auth/me').then(function (r) {
      if (r.ok) location.replace('dashboard.html');
    });

    var current = 'login';
    function show(which) {
      current = which;
      forms.login.hidden = which !== 'login';
      forms.signup.hidden = which !== 'signup';
      var i;
      for (i = 0; i < tabs.length; i++) {
        tabs[i].classList.toggle('on', tabs[i].getAttribute('data-tab') === which);
      }
      hideErrors();
    }
    function hideErrors() {
      flash(document.getElementById('err-login'), '', 'ok');
      document.getElementById('err-login').hidden = true;
      flash(document.getElementById('err-signup'), '', 'ok');
      document.getElementById('err-signup').hidden = true;
    }
    var i;
    for (i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function (e) {
        show(e.currentTarget.getAttribute('data-tab'));
      });
    }
    if (location.hash === '#signup') show('signup');

    forms.login.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = forms.login.querySelector('button[type=submit]');
      btn.disabled = true;
      api('/api/auth/login', {
        method: 'POST',
        body: {
          identifier: document.getElementById('li-identifier').value.trim(),
          password: document.getElementById('li-password').value
        }
      }).then(function (r) {
        btn.disabled = false;
        if (r.ok) { location.href = 'dashboard.html'; return; }
        flash(document.getElementById('err-login'), r.data.error || 'Sign in failed.', 'error');
      });
    });

    forms.signup.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = forms.signup.querySelector('button[type=submit]');
      btn.disabled = true;
      api('/api/auth/signup', {
        method: 'POST',
        body: {
          username: document.getElementById('su-username').value.trim(),
          email: document.getElementById('su-email').value.trim(),
          password: document.getElementById('su-password').value
        }
      }).then(function (r) {
        btn.disabled = false;
        if (r.ok) { location.href = 'dashboard.html'; return; }
        flash(document.getElementById('err-signup'), r.data.error || 'Sign up failed.', 'error');
      });
    });
  }

  // ---- dashboard account + API section ---------------------------------------
  function initDashboardAccount() {
    var panel = document.getElementById('user-panel');
    if (!panel) return;

    api('/api/auth/me').then(function (r) {
      var signin = document.getElementById('signin-prompt');
      if (!r.ok) {
        if (signin) signin.hidden = false;
        panel.hidden = true;
        return;
      }
      if (signin) signin.hidden = true;
      panel.hidden = false;
      var u = r.data.user || {};
      var who = document.getElementById('acc-who');
      if (who) who.textContent = u.username;
      var mail = document.getElementById('acc-email');
      if (mail) mail.textContent = u.email;
      var since = document.getElementById('acc-since');
      if (since) since.textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '';
      loadKey();
      loadUsage();
    });

    loadUsage();
  }

  function loadKey() {
    api('/api/me/key').then(function (r) {
      if (!r.ok) return;
      var k = r.data;
      var masked = document.getElementById('key-masked');
      var full = document.getElementById('key-full');
      if (masked) masked.textContent = k.key || '';
      if (full) {
        full.textContent = k.full || '';
        full.dataset.plain = k.full || '';
      }
      var created = document.getElementById('key-created');
      if (created) created.textContent = k.createdAt ? new Date(k.createdAt).toLocaleString() : '';
      var used = document.getElementById('key-used');
      if (used) used.textContent = k.lastUsed ? new Date(k.lastUsed).toLocaleString() : 'never';
      var lim = k.limits || { perMinute: 30, perDay: 1000 };
      var lm = document.getElementById('rl-minute');
      if (lm) lm.textContent = lim.perMinute + ' / minute';
      var ld = document.getElementById('rl-day');
      if (ld) ld.textContent = lim.perDay + ' / day';
    });
  }

  function loadUsage() {
    api('/api/me/usage').then(function (r) {
      if (!r.ok) return;
      var u = r.data.usage || {};
      var set = function (id, v) { var el = document.getElementById(id); if (el) el.textContent = String(v == null ? 0 : v); };
      set('u-total', u.total); set('u-ok', u.success); set('u-fail', u.failed); set('u-limited', u.limited);
      var list = document.getElementById('u-recent');
      if (list) {
        var rows = (r.data.recent || []).slice(0, 8);
        if (!rows.length) {
          list.innerHTML = '<p class="muted" style="font-size:.85rem">No API requests yet. Grab your key and follow the docs.</p>';
        } else {
          var html = '<table class="dk-table"><thead><tr><th>Time</th><th>Status</th><th>Preset</th><th>Bytes out</th><th>Duration</th></tr></thead><tbody>';
          var i, e;
          for (i = 0; i < rows.length; i++) {
            e = rows[i];
            html += '<tr><td>' + esc(new Date(e.t).toLocaleTimeString()) + '</td><td>' +
              esc(e.s) + '</td><td>' + esc(e.p || '') + '</td><td>' + esc(e.b == null ? '' : e.b) + '</td><td>' +
              esc(e.d == null ? '' : e.d + ' ms') + '</td></tr>';
          }
          list.innerHTML = html + '</tbody></table>';
        }
      }
    });
  }

  function wireDashboardControls() {
    var btnReveal = document.getElementById('btn-key-reveal');
    var btnCopy = document.getElementById('btn-key-copy');
    var btnRegen = document.getElementById('btn-key-regen');
    var btnOut = document.getElementById('btn-logout');
    var btnPw = document.getElementById('btn-chpass');
    var masked = document.getElementById('key-masked');
    var full = document.getElementById('key-full');
    var note = document.getElementById('key-note');
    var confirm = document.getElementById('regen-confirm');
    var confirmYes = document.getElementById('regen-yes');
    var confirmNo = document.getElementById('regen-no');

    if (btnReveal) btnReveal.addEventListener('click', function () {
      var showing = !full.hidden;
      full.hidden = showing;
      masked.hidden = !showing;
      btnReveal.textContent = showing ? 'Reveal' : 'Hide';
    });
    if (btnCopy) btnCopy.addEventListener('click', function () {
      var plain = (full && !full.hidden && full.dataset.plain) ? full.dataset.plain : '';
      if (!plain) {
        api('/api/me/key').then(function (r) {
          if (r.ok && r.data.full) copyText(r.data.full).then(function () { flash(note, 'Copied to clipboard.', 'ok'); });
        });
        return;
      }
      copyText(plain).then(function () { flash(note, 'Copied to clipboard.', 'ok'); });
    });
    if (btnRegen) btnRegen.addEventListener('click', function () {
      confirm.hidden = !confirm.hidden;
    });
    if (confirmYes) confirmYes.addEventListener('click', function () {
      confirm.hidden = true;
      btnRegen.disabled = true;
      api('/api/me/key/regenerate', { method: 'POST' }).then(function (r) {
        btnRegen.disabled = false;
        if (!r.ok) { flash(note, r.data.error || 'Could not regenerate.', 'error'); return; }
        masked.hidden = true;
        full.hidden = false;
        full.textContent = r.data.apiKey;
        full.dataset.plain = r.data.apiKey;
        btnReveal.textContent = 'Hide';
        flash(note, r.data.note || 'New key active. The old key is now invalid.', 'ok');
        loadKey();
        loadUsage();
      });
    });
    if (confirmNo) confirmNo.addEventListener('click', function () { confirm.hidden = true; });
    if (btnOut) btnOut.addEventListener('click', function () {
      api('/api/auth/logout', { method: 'POST' }).then(function () { location.href = 'index.html'; });
    });
    if (btnPw) btnPw.addEventListener('click', function () {
      var cur = document.getElementById('pw-current').value;
      var next = document.getElementById('pw-new').value;
      var pnote = document.getElementById('pw-note');
      if (!cur || !next) { flash(pnote, 'Fill in both fields.', 'error'); return; }
      btnPw.disabled = true;
      api('/api/auth/account', { method: 'POST', body: { action: 'password', currentPassword: cur, value: next } }).then(function (r) {
        btnPw.disabled = false;
        if (r.ok) {
          document.getElementById('pw-current').value = '';
          document.getElementById('pw-new').value = '';
          flash(pnote, r.data.message || 'Password updated.', 'ok');
        } else {
          flash(pnote, r.data.error || 'Could not update password.', 'error');
        }
      });
    });
  }

  function boot() {
    initAuthPage();
    initDashboardAccount();
    wireDashboardControls();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.DarkAuth = { api: api, esc: esc, copyText: copyText, flash: flash };
})();
