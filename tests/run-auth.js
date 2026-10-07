#!/usr/bin/env node
/* Accounts + saved keys against a live server instance. */
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
function test(name, fn) { return fn().then(() => { passed++; console.log('  ok  ' + name); }, (e) => { failed++; console.log('FAIL  ' + name + ' :: ' + e.message); }); }

function call(method, p, body, auth) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (auth) headers['Authorization'] = 'Bearer ' + auth;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => { let j = {}; try { j = JSON.parse(raw); } catch (e) {} resolve({ status: res.statusCode, data: j }); });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.js'), String(PORT)], {
    env: Object.assign({}, process.env, { DK_DATA_DIR: DATA }), stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((res) => child.stdout.on('data', res));
  await new Promise((r) => setTimeout(r, 300));

  try {
    await test('health', async () => {
      const r = await call('GET', '/api/v1/health');
      assert.strictEqual(r.status, 200); assert.ok(r.data.ok);
    });

    await test('signup + session', async () => {
      const r = await call('POST', '/api/v1/signup', { username: 'spooky_dev', password: 'pumpkin42' });
      assert.strictEqual(r.status, 201); assert.ok(r.data.token.startsWith('df_sess_'));
      const me = await call('GET', '/api/v1/me', null, r.data.token);
      assert.strictEqual(me.status, 200); assert.strictEqual(me.data.username, 'spooky_dev');
      assert.strictEqual(me.data.keyCount, 0);
    });

    await test('bad signup rejected', async () => {
      const r = await call('POST', '/api/v1/signup', { username: 'x', password: 'pumpkin42' });
      assert.strictEqual(r.status, 400);
      const dup = await call('POST', '/api/v1/signup', { username: 'SPOOKY_DEV', password: 'pumpkin42' });
      assert.strictEqual(dup.status, 409, 'case-insensitive duplicate not caught');
      const short = await call('POST', '/api/v1/signup', { username: 'otheruser', password: '12345' });
      assert.strictEqual(short.status, 400);
    });

    await test('login + wrong password', async () => {
      const bad = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'wrong!' });
      assert.strictEqual(bad.status, 401);
      const ok = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      assert.strictEqual(ok.status, 200); assert.ok(ok.data.token.startsWith('df_sess_'));
    });

    let key1 = '';
    await test('signed-in key is saved to the account', async () => {
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      const r = await call('POST', '/api/v1/keys', { name: 'my-bot' }, login.data.token);
      assert.strictEqual(r.status, 201); assert.strictEqual(r.data.saved, true); assert.strictEqual(r.data.owner, 'spooky_dev');
      key1 = r.data.key;
      const me = await call('GET', '/api/v1/me', null, login.data.token);
      assert.strictEqual(me.data.keyCount, 1);
      assert.strictEqual(me.data.keys[0].key, key1);
      assert.strictEqual(me.data.keys[0].name, 'my-bot');
    });

    await test('key list endpoint shows the same keys', async () => {
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      const r = await call('GET', '/api/v1/keys', null, login.data.token);
      assert.strictEqual(r.status, 200);
      assert.ok(r.data.keys.some((k) => k.key === key1));
    });

    await test('signed-in key obfuscates and usage counts', async () => {
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      const r = await call('POST', '/api/v1/obfuscate', { source: 'print("hi")', preset: 'maximum' }, key1);
      assert.strictEqual(r.status, 200, JSON.stringify(r.data).slice(0, 200));
      assert.ok(r.data.output.startsWith('-- This file is protected by Darkfuscator'));
      const me = await call('GET', '/api/v1/me', null, login.data.token);
      assert.strictEqual(me.data.totalUses, 1);
      assert.strictEqual(me.data.keys[0].total, 1);
    });

    await test('anonymous key is not saved', async () => {
      const r = await call('POST', '/api/v1/keys', {});
      assert.strictEqual(r.status, 201); assert.strictEqual(r.data.saved, false);
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      const me = await call('GET', '/api/v1/me', null, login.data.token);
      assert.ok(!me.data.keys.some((k) => k.key === r.data.key));
    });

    await test('revoke: only the owner, only their key', async () => {
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      const noauth = await call('DELETE', '/api/v1/keys/' + key1);
      assert.strictEqual(noauth.status, 401);
      const other = await call('POST', '/api/v1/signup', { username: 'second_dev', password: 'ghoul666x' });
      const foreign = await call('DELETE', '/api/v1/keys/' + key1, null, other.data.token);
      assert.strictEqual(foreign.status, 403);
      const ok = await call('DELETE', '/api/v1/keys/' + key1, null, login.data.token);
      assert.strictEqual(ok.status, 200);
      const gone = await call('POST', '/api/v1/obfuscate', { source: 'print("x")' }, key1);
      assert.strictEqual(gone.status, 401);
    });

    await test('logout invalidates the session', async () => {
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      await call('POST', '/api/v1/logout', null, login.data.token);
      const me = await call('GET', '/api/v1/me', null, login.data.token);
      assert.strictEqual(me.status, 401);
    });

    await test('accounts and keys survive a restart', async () => {
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      const child2 = spawn(process.execPath, [path.join(__dirname, '..', 'tools', 'serve.js'), String(PORT)], {
        env: Object.assign({}, process.env, { DK_DATA_DIR: DATA }), stdio: ['ignore', 'pipe', 'pipe']
      });
      await new Promise((res) => child2.stdout.on('data', res));
      await new Promise((r) => setTimeout(r, 300));
      const login = await call('POST', '/api/v1/login', { username: 'spooky_dev', password: 'pumpkin42' });
      assert.strictEqual(login.status, 200, 'account lost on restart');
      const me = await call('GET', '/api/v1/me', null, login.data.token);
      assert.strictEqual(me.status, 200);
      child2.kill();
    });
  } finally {
    try { child.kill(); } catch (e) {}
    fs.rmSync(DATA, { recursive: true, force: true });
  }

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
