/* auth-spa.js — Darkfuscator auth pages: login, register, verify-email,
 * forgot-password, reset-password. Honest email handling throughout. */
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
    else if (path === '/verify-email') renderVerify();
    else if (path === '/forgot-password') renderForgot();
    else if (path === '/reset-password') renderReset();
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
    shell('Sign in', 'Use your username or email.', [
      '<div class="field"><label for="a-id">Username or email</label><input type="text" id="a-id" autocomplete="username"></div>',
      '<div class="field"><label for="a-pw">Password</label><input type="password" id="a-pw" autocomplete="current-password"></div>',
      '<div class="field check"><input type="checkbox" id="a-remember"><label for="a-remember">Remember this device for 30 days</label></div>',
      '<button class="btn primary wide" id="a-go">Sign in</button>',
      '<div class="auth-alt"><a class="link" href="/forgot-password">Forgot password</a></div>'
    ].join(''),
      '<a class="link" href="/register">Create an account</a><span class="dim"> / </span><a class="link" href="/">Back to the landing page</a>');
    const go = async function () {
      const btn = $('#a-go');
      btn.disabled = true; btn.textContent = 'Signing in';
      try {
        const d = await api('/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: $('#a-id').value.trim(), password: $('#a-pw').value, remember: $('#a-remember').checked }) });
        if (d.needsVerification) {
          DFx.toast('Email not verified', 'Check your inbox for the verification link', 'warn');
          location.href = '/verify-email';
          return;
        }
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
    shell('Create account', 'A valid email is required. Verification unlocks sign in.', [
      '<div class="field"><label for="r-user">Username</label><input type="text" id="r-user" autocomplete="username"><div class="hint">3-24 characters: letters, numbers, underscore.</div></div>',
      '<div class="field"><label for="r-email">Email</label><input type="email" id="r-email" autocomplete="email"></div>',
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
        const d = await api('/api/v1/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#r-user').value.trim(), email: $('#r-email').value.trim(), password: pw }) });
        showVerifyState(d);
      } catch (e) {
        DFx.toast('Could not create account', e.message, 'bad');
        btn.disabled = false; btn.textContent = 'Create account';
      }
    };
    $('#r-go').addEventListener('click', go);
    $('#auth-form').addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
  }

  function showVerifyState(d) {
    const devLink = d.devLink || '';
    shell('Check your email', 'One step left before you can sign in.', [
      '<div class="verify-box">' +
        '<p>A verification link goes to <span class="mono">' + DFx.esc(d.email || '') + '</span>. The link is valid for 24 hours.</p>' +
        '<p class="dim">Nothing arrived? Check spam, or use resend below.</p>' +
        (devLink ? '<div class="warn-box">Email sending is not configured on this deployment, so here is the verification link instead:<div class="mono"><a class="link" href="' + DFx.esc(devLink) + '">' + DFx.esc(devLink) + '</a></div></div>' : '') +
        '<div class="settings-foot"><button class="btn" id="v-resend">Resend email</button><span class="dim" id="v-cooldown"></span></div>' +
        '<div class="line"></div>' +
        '<div class="field"><label for="v-token">Paste verification code instead</label><input type="text" id="v-token" placeholder="df_verify_..."><button class="btn" id="v-verify-code">Verify</button></div>' +
        '<a class="link" href="/login">Go to sign in</a>' +
      '</div>'
    ].join(''), '');
    $('#v-verify-code').addEventListener('click', async function () {
      const t = $('#v-token').value.trim();
      if (!t) { DFx.toast('Paste the code from the email first', '', 'warn'); return; }
      try {
        await api('/api/v1/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) });
        DFx.toast('Email verified', 'You can sign in now', 'ok');
        setTimeout(function () { location.href = '/login'; }, 600);
      } catch (e) { DFx.toast('Verification failed', e.message, 'bad'); }
    });
    let cooling = false;
    $('#v-resend').addEventListener('click', async function () {
      if (cooling) return;
      try {
        await api('/api/v1/auth/resend-verification', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: d.email || $('#r-email').value.trim() }) });
        DFx.toast('Verification email sent', '', 'ok');
      } catch (e) {
        DFx.toast('Resend failed', e.message, 'bad');
        if (e.retryAfter) cooling = true;
      }
    });
  }

  function renderVerify() {
    const token = qparam('token');
    shell('Verify email', token ? 'Hold on while the link is checked.' : 'Paste the link or code from your email.', token ?
      '<div class="empty" id="ve-state">Verifying</div>' :
      '<div class="field"><label for="ve-token">Verification code</label><input type="text" id="ve-token" placeholder="df_verify_..."><button class="btn primary" id="ve-go">Verify</button></div><a class="link" href="/login">Back to sign in</a>');
    if (token) {
      api('/api/v1/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        .then(function () {
          $('#ve-state').textContent = 'Verified. You can sign in now.';
          DFx.toast('Email verified', '', 'ok');
          setTimeout(function () { location.href = '/login'; }, 900);
        })
        .catch(function (e) {
          $('#ve-state').textContent = 'Verification failed: ' + e.message;
          $('#ve-state').innerHTML += '<div><a class="link" href="/verify-email">Try pasting the code instead</a></div>';
        });
    } else {
      $('#ve-go').addEventListener('click', async function () {
        const t = $('#ve-token').value.trim();
        if (!t) return;
        try {
          await api('/api/v1/auth/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }) });
          DFx.toast('Email verified', 'You can sign in now', 'ok');
          setTimeout(function () { location.href = '/login'; }, 600);
        } catch (e) { DFx.toast('Verification failed', e.message, 'bad'); }
      });
    }
  }

  function renderForgot() {
    shell('Forgot password', 'A reset link goes to the address you enter.', [
      '<div class="field"><label for="f-email">Email</label><input type="email" id="f-email"></div>',
      '<button class="btn primary wide" id="f-go">Send reset link</button>',
      '<a class="link" href="/login">Back to sign in</a>'
    ].join(''));
    $('#f-go').addEventListener('click', async function () {
      const btn = $('#f-go');
      const email = $('#f-email').value.trim();
      btn.disabled = true; btn.textContent = 'Sending';
      try {
        const d = await api('/api/v1/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        if (d.devLink) {
          shell('Reset link', 'Email sending is not configured here, so use this link directly.', [
            '<div class="warn-box"><div class="mono"><a class="link" href="' + DFx.esc(d.devLink) + '">' + DFx.esc(d.devLink) + '</a></div></div>'
          ].join(''));
        } else {
          shell('Check your email', 'If that address is registered, a reset link is on its way. It is valid for 1 hour.', [
            '<a class="link" href="/login">Back to sign in</a>'
          ].join(''));
        }
      } catch (e) {
        DFx.toast('Could not send', e.message, 'bad');
        btn.disabled = false; btn.textContent = 'Send reset link';
      }
    });
  }

  function renderReset() {
    const token = qparam('token');
    shell('Set a new password', token ? 'Enter a new password for your account.' : 'This page needs a reset link.', token ?
      [
        '<div class="field"><label for="rs-pw">New password</label><input type="password" id="rs-pw" autocomplete="new-password"><div class="hint">At least 8 characters with a letter and a number.</div></div>',
        '<div class="field"><label for="rs-pw2">Confirm password</label><input type="password" id="rs-pw2" autocomplete="new-password"></div>',
        '<button class="btn primary wide" id="rs-go">Set password</button>'
      ].join('') :
      '<a class="link" href="/forgot-password">Request a reset link</a>');
    if (token) {
      $('#rs-go').addEventListener('click', async function () {
        const pw = $('#rs-pw').value;
        if (pw !== $('#rs-pw2').value) { DFx.toast('Check the form', 'passwords do not match', 'warn'); return; }
        try {
          await api('/api/v1/auth/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: pw }) });
          DFx.toast('Password set', 'Sign in with the new password', 'ok');
          setTimeout(function () { location.href = '/login'; }, 700);
        } catch (e) { DFx.toast('Reset failed', e.message, 'bad'); }
      });
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
