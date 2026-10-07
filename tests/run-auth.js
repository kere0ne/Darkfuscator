#!/usr/bin/env node
/* Accounts + saved keys against a live server instance. v7 contract:
 * auth under /api/v1/auth/*, cookie + df_sess_ bearer sessions, email
 * verification before login, dk_live_ keys saved to the account. */
'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 4579;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-auth-'));
let passed = 0, failed = 0;
// wait for the server banner, or fail loudly if the process dies / hangs
function waitBanner(child) {
  return new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error('server did not print its banner in 15s')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('Darkfuscator')) { clearTimeout(to); res(); } });
    child.stderr.on('data', (d) => process.stderr.write('[server] ' + String(d)));
    child.on('exit', (c) => rej(new Error('server exited early with code ' + c)));
  });
}

function test(name, fn) { return fn().then(() => { passed++; console.log('  ok  ' + name); }, (e) => { failed++; console.log('FAIL  ' + name + ' :: ' + e.message); }); }

function call(method, p, body, auth, cookieIn) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = 'Bearer ' + auth;
    if (cookieIn) headers['Cookie'] = cookieIn;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let j = {}; try { j = JSON.parse(raw); } catch (e) {}
        resolve({ status: res.statusCode, data: j, setCookie: res.headers['set-cookie'] ? res.headers['set-cookie'][0] : null, raw });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
function cookieOf(r) { return r.setCookie ? r.setCookie.split(';')[0] : null; }
function tokenFrom(devLink) {
  if (!devLink) throw new Error('no devLink in response (email dev mode off?)');
  const m = String(devLink).match(/token=([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('no token in devLink: ' + devLink);
  return m[1];
}

function startServer() {
  return spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.js'), String(PORT)], {
    // Development links are deliberately enabled only for this isolated test
    // server. Production still relies on the configured mail provider.
    env: Object.assign({}, process.env, {
      DK_DATA_DIR: DATA,
      EMAIL_DEV_MODE: 'true',
      BASE_URL: 'http://127.0.0.1:' + PORT
    }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
}
function stopServer(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) return resolve();
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} }, 2000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    try { child.kill(); } catch (e) { clearTimeout(timer); resolve(); }
  });
}

(async () => {
  let child = startServer();
  await waitBanner(child);
  await new Promise((r) => setTimeout(r, 300));

  try {
    await test('health reports platform 7 + engine', async () => {
      const r = await call('GET', '/api/v1/health');
      assert.strictEqual(r.status, 200); assert.ok(r.data.ok);
      assert.strictEqual(r.data.version, '7.0.0');
      assert.strictEqual(r.data.engineVersion, '7.0.0');
      assert.strictEqual(r.data.engine.version, '7.0.0');
    });

    let savedToken = '';
    await test('register + verify email', async () => {
      const r = await call('POST', '/api/v1/auth/register', { username: 'spooky_dev', email: 'spooky@dev.test', password: 'pumpkin42', confirmPassword: 'pumpkin42' });
      assert.strictEqual(r.status, 201, r.raw.slice(0, 200));
      assert.ok(r.data.needsVerification);
      const t = tokenFrom(r.data.devLink);
      const v = await call('POST', '/api/v1/auth/verify-email', { token: t });
      assert.strictEqual(v.status, 200, v.raw.slice(0, 200));
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      assert.strictEqual(login.status, 200, login.raw.slice(0, 200));
      savedToken = cookieOf(login);
      assert.ok(savedToken && savedToken.startsWith('df_session='), 'no session cookie on login');
    });

    await test('me shows the user', async () => {
      const me = await call('GET', '/api/v1/me', null, null, savedToken);
      assert.strictEqual(me.status, 200);
      assert.strictEqual((me.data.user || me.data).username, 'spooky_dev');
      assert.ok((me.data.user || me.data).verified);
    });

    await test('bad signup and unverified login are rejected', async () => {
      const r = await call('POST', '/api/v1/auth/register', { username: 'x', email: 'x@dev.test', password: 'pumpkin42' });
      assert.strictEqual(r.status, 400);
      const dup = await call('POST', '/api/v1/auth/register', { username: 'SPOOKY_DEV', email: 'dup@dev.test', password: 'pumpkin42' });
      assert.strictEqual(dup.status, 409, 'case-insensitive duplicate not caught');
      const pending = await call('POST', '/api/v1/auth/register', { username: 'waiting_dev', email: 'waiting@dev.test', password: 'waiting42', confirmPassword: 'waiting42' });
      assert.strictEqual(pending.status, 201);
      const unverified = await call('POST', '/api/v1/auth/login', { identifier: 'waiting_dev', password: 'waiting42' });
      assert.strictEqual(unverified.status, 403);
      assert.strictEqual(unverified.data.code, 'account_not_verified');
    });

    await test('login + wrong password', async () => {
      const bad = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'wrong!' });
      assert.strictEqual(bad.status, 401);
      const ok = await call('POST', '/api/v1/auth/login', { identifier: 'spooky@dev.test', password: 'pumpkin42' });
      assert.strictEqual(ok.status, 200);
      assert.ok(cookieOf(ok) || ok.data.user, 'login response carried no session');
    });

    let key1 = '';
    await test('signed-in key is saved to the account', async () => {
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      const ck = cookieOf(login);
      const r = await call('POST', '/api/v1/keys', { name: 'my-bot' }, null, ck);
      assert.strictEqual(r.status, 201, r.raw.slice(0, 200));
      assert.strictEqual(r.data.saved, true);
      assert.ok(r.data.key.startsWith('dk_live_'));
      key1 = r.data.key;
      const list = await call('GET', '/api/v1/keys', null, null, ck);
      assert.strictEqual(list.status, 200);
      assert.ok(list.data.keys.some((k) => k.prefix === key1.slice(0, 13)), 'saved key not in list');
    });

    await test('key obfuscates and usage counts', async () => {
      const r = await call('POST', '/api/v1/obfuscate', { source: 'print("hi")', preset: 'maximum' }, key1);
      assert.strictEqual(r.status, 200, r.raw.slice(0, 200));
      assert.ok(String(r.data.output).startsWith('-- Protected by Darkfuscator'));
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      const ck = cookieOf(login);
      const list = await call('GET', '/api/v1/keys', null, null, ck);
      const mine = list.data.keys.find((k) => k.prefix === key1.slice(0, 13));
      assert.strictEqual(mine.total, 1, 'usage not counted');
    });

    await test('anonymous key creation is rejected', async () => {
      const r = await call('POST', '/api/v1/keys', {});
      assert.strictEqual(r.status, 401);
      assert.match(r.data.error || '', /sign in/i);
    });

    await test('revoke: only the owner, only their key', async () => {
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      const ck = cookieOf(login);
      const noauth = await call('DELETE', '/api/v1/keys/' + key1.slice(0, 13));
      assert.ok(noauth.status === 401 || noauth.status === 404, 'unauthenticated revoke not blocked, got ' + noauth.status);
      const r2 = await call('POST', '/api/v1/auth/register', { username: 'second_dev', email: 'second@dev.test', password: 'ghoul666x', confirmPassword: 'ghoul666x' });
      const t2 = tokenFrom(r2.data.devLink);
      await call('POST', '/api/v1/auth/verify-email', { token: t2 });
      const login2 = await call('POST', '/api/v1/auth/login', { identifier: 'second_dev', password: 'ghoul666x' });
      // foreign revoke by key id: second_dev must not revoke spooky's key
      const list = await call('GET', '/api/v1/keys', null, null, ck);
      const mine = list.data.keys.find((k) => k.prefix === key1.slice(0, 13));
      const foreign = await call('DELETE', '/api/v1/keys/' + mine.id, null, null, cookieOf(login2));
      assert.strictEqual(foreign.status, 403, 'foreign revoke not blocked, got ' + foreign.status);
      const ok = await call('DELETE', '/api/v1/keys/' + mine.id, null, null, ck);
      assert.strictEqual(ok.status, 200);
      const gone = await call('POST', '/api/v1/obfuscate', { source: 'print("x")' }, key1);
      assert.strictEqual(gone.status, 401, 'revoked key still obfuscates');
    });

    await test('logout invalidates the session', async () => {
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      const ck = cookieOf(login);
      await call('POST', '/api/v1/auth/logout', null, null, ck);
      const me = await call('GET', '/api/v1/me', null, null, ck);
      assert.strictEqual(me.status, 401);
    });

    await test('accounts and keys survive a restart', async () => {
      await stopServer(child);
      child = startServer();
      await waitBanner(child);
      await new Promise((r) => setTimeout(r, 300));
      const login = await call('POST', '/api/v1/auth/login', { identifier: 'spooky_dev', password: 'pumpkin42' });
      assert.strictEqual(login.status, 200, 'account lost on restart');
    });
  } finally {
    await stopServer(child);
    fs.rmSync(DATA, { recursive: true, force: true });
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
