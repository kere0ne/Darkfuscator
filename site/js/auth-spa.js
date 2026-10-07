/* auth-spa.js — Darkfuscator auth pages: login and register.
 * Username + password auth; no email anywhere. */
(function () {
  'use strict';
  const DFx = window.DF;
  const $ = (sel) => document.querySelector(sel);
  const path = location.pathname;

  async function api(path2, opts) {
    const res = await fetch(path2, Object.assign({ credentials: 'same-origin' }, opts));
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status; err.data = data;
      throw err;
    }
    return data;
  }
  function qparam(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  // already signed in? land on the app
  async function boot() {
    try {
      await api('/api/v1/me');
      location.href = '/dashboard';
      return;
    } catch (e) {}
    try { await api('/api/v1/health'); setApiOk(); } catch (e) {}
    if (path === '/login') renderLogin();
    else if (path === '/register') renderRegister();
    else location.href = '/login';
  }

  function setApiOk() {
    const el = $('#api-ok');
    if (el) el.hidden = false;
  }

  function shell(title, sub, inner, extra) {
    $('#auth-title').textContent = title;
    $('#auth-sub').textContent = sub || '';
    $('#auth-form').innerHTML = inner;
    if (extra) $('#auth-links').innerHTML = extra;
  }

  function renderLogin() {
    shell('Sign in', 'Use your username.', [
      '<div class="field"><label for="a-id">Username</label><input type="text" id="a-id" autocomplete="username"></div>',
      '<div class="field"><label for="a-pw">Password</label><input type="password" id="a-pw" autocomplete="current-password"></div>',
      '<div class="field check"><input type="checkbox" id="a-remember"><label for="a-remember">Remember this device for 30 days</label></div>',
      '<button class="btn primary wide" id="a-go">Sign in</button>'
    ].join(''),
      '<a class="link" href="/register">Create an account</a><span class="dim"> / </span><a class="link" href="/start">Enter a key</a><span class="dim"> / </span><a class="link" href="/">Back to the landing page</a>');
    const go = async function () {
      const btn = $('#a-go');
      btn.disabled = true; btn.textContent = 'Signing in';
      try {
        await api('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#a-id').value.trim(), password: $('#a-pw').value, remember: $('#a-remember').checked }) });
        location.href = qparam('next') || '/dashboard';
      } catch (e) {
        DFx.toast('Sign in failed', e.message, 'bad');
        btn.disabled = false; btn.textContent = 'Sign in';
      }
    };
    $('#a-go').addEventListener('click', go);
    $('#auth-form').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function renderRegister() {
    shell('Create account', 'Username and password only. No email required.', [
      '<div class="field"><label for="r-user">Username</label><input type="text" id="r-user" autocomplete="username"><div class="hint">3-24 characters: letters, numbers, underscore.</div></div>',
      '<div class="field"><label for="r-pw">Password</label><input type="password" id="r-pw" autocomplete="new-password"><div class="hint">At least 8 characters with a letter and a number.</div></div>',
      '<div class="field"><label for="r-pw2">Confirm password</label><input type="password" id="r-pw2" autocomplete="new-password"></div>',
      '<button class="btn primary wide" id="r-go">Create account</button>'
    ].join(''),
      '<a class="link" href="/login">Sign in instead</a>');
    const go = async function () {
      const btn = $('#r-go');
      const pw = $('#r-pw').value;
      if (pw !== $('#r-pw2').value) { DFx.toast('Check the form', 'passwords do not match', 'warn'); return; }
      btn.disabled = true; btn.textContent = 'Creating';
      try {
        await api('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#r-user').value.trim(), password: pw }) });
        DFx.toast('Account created', 'Sign in with your username', 'ok');
        setTimeout(function () { location.href = '/login'; }, 600);
      } catch (e) {
        DFx.toast('Could not create account', e.message, 'bad');
        btn.disabled = false; btn.textContent = 'Create account';
      }
    };
    $('#r-go').addEventListener('click', go);
    $('#auth-form').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
