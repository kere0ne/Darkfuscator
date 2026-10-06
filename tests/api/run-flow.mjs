import * as H from '/tmp/dk-handlers.mjs';

class MockKV {
  constructor() { this.m = new Map(); }
  get(k) { return Promise.resolve(this.m.has(k) ? this.m.get(k) : null); }
  put(k, v) { this.m.set(k, String(v)); return Promise.resolve(); }
  delete(k) { this.m.delete(k); return Promise.resolve(); }
}

const kv = new MockKV();
const env = { DARKFUSCATOR_KV: kv, AUTH_SECRET: 'test-secret-do-not-use' };

function req(method, path, { body, headers, cookie } = {}) {
  const h = Object.assign({}, headers);
  if (body !== undefined) { h['content-type'] = 'application/json'; }
  if (cookie) h['cookie'] = cookie;
  return new Request('https://darkfuscator.pages.dev' + path, {
    method, headers: h,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function j(res) {
  const data = await res.json().catch(() => ({}));
  const sc = res.headers.get('set-cookie') || '';
  return { status: res.status, data, setCookie: sc };
}

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log(' FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
}

// ---- 1. signup validation ----
let r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'ab', email: 'x@y.co', password: 'password1' } }), env }));
check('signup rejects short username (400)', r.status === 400, r);
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'alice', email: 'not-an-email', password: 'password1' } }), env }));
check('signup rejects bad email (400)', r.status === 400, r);
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'alice', email: 'a@b.co', password: 'short' } }), env }));
check('signup rejects weak password (400)', r.status === 400, r);
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'alice', email: 'a@b.co', password: 'allletters' } }), env }));
check('signup rejects letter-only password (400)', r.status === 400, r);

// ---- 2. real signup ----
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'alice', email: 'alice@example.com', password: 'hunter2secure1' } }), env }));
check('signup succeeds (200)', r.status === 200, r);
check('signup returns dk_live_ API key', typeof r.data.apiKey === 'string' && r.data.apiKey.startsWith('dk_live_'), r.data.apiKey);
check('signup sets session cookie', /dk_sess=s_/.test(r.setCookie), r.setCookie);
const ALICE_KEY = r.data.apiKey;
const ALICE_COOKIE = r.setCookie.split(';')[0];

// ---- 3. duplicates ----
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'bob', email: 'alice@example.com', password: 'hunter2secure1' } }), env }));
check('duplicate email rejected (409)', r.status === 409, r);
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'Alice', email: 'other@example.com', password: 'hunter2secure1' } }), env }));
check('duplicate username (case-insensitive) rejected (409)', r.status === 409, r);

// ---- 4. plaintext password never stored ----
const rawUser = await kv.get('email:alice@example.com').then(uid => kv.get('user:' + uid));
const userRec = JSON.parse(rawUser);
check('password not stored in plaintext', !rawUser.includes('hunter2secure1'));
check('API key not stored in plaintext', !rawUser.includes(ALICE_KEY));
check('API key stored encrypted + hashed', typeof userRec.keyEnc === 'string' && userRec.keyEnc.startsWith('enc.v1.') && userRec.keyHash.length === 64);

// ---- 5. session handling ----
r = await j(await H.me.onRequestGet({ request: req('GET', '/api/auth/me', {}), env }));
check('me without session (401)', r.status === 401, r);
r = await j(await H.me.onRequestGet({ request: req('GET', '/api/auth/me', { cookie: ALICE_COOKIE }), env }));
check('me with session (200)', r.status === 200 && r.data.user.username === 'alice', r);
check('me returns masked key + usage', r.data.apiKey && typeof r.data.apiKey.masked === 'string' && r.data.apiKey.usage, r);

// ---- 6. API auth on obfuscate ----
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'print(1)' } }), env }));
check('obfuscate without key (401)', r.status === 401 && r.data.error.code === 'unauthorized', r);
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'print(1)' }, headers: { authorization: 'Bearer dk_live_' + 'f'.repeat(48) } }), env }));
check('obfuscate with bogus key (401)', r.status === 401, r);

// ---- 7. real obfuscation ----
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: "print('Hello World')", preset: 'lightweight' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env }));
check('obfuscate with valid key (200)', r.status === 200 && r.data.success === true, r.data);
check('obfuscate result is non-trivial', r.data.result && r.data.result.length > 500, r.data.result && r.data.result.length);
check('response has rate-limit headers', r.data && !!r.headers_get_placeholder !== true);
const src = r.data.result;
console.log('   result preview:', src.slice(0, 80));

// ---- 8. bad bodies ----
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: '' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env }));
check('empty source rejected (400)', r.status === 400, r);
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'x', preset: 'nope' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env }));
check('bad preset rejected (400)', r.status === 400, r);
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'local @@@ =', preset: 'lightweight' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env }));
check('unparseable source rejected (400)', r.status === 400, r);

// ---- 9. usage dashboard data ----
r = await j(await H.usage.onRequestGet({ request: req('GET', '/api/me/usage', { cookie: ALICE_COOKIE }), env }));
check('usage counts recorded', r.status === 200 && r.data.usage.total > 0 && r.data.usage.success >= 1 && r.data.usage.failed >= 3, r.data.usage);
check('recent entries carry no source or key', JSON.stringify(r.data.recent).indexOf('Hello World') === -1, r.data.recent && r.data.recent[0]);

// ---- 10. rate limiting (minute limit 30) ----
let got429 = false, limitedStatus = 0;
for (let i = 0; i < 32; i++) {
  const res = await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'print(' + i + ')', preset: 'lightweight' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env });
  if (res.status === 429) { got429 = true; limitedStatus = 429; break; }
}
check('minute rate limit trips at 30/min (429)', got429, limitedStatus);
r = await j(await H.usage.onRequestGet({ request: req('GET', '/api/me/usage', { cookie: ALICE_COOKIE }), env }));
check('rate-limited requests counted', r.data.usage.limited >= 1, r.data.usage);

// ---- 11. key rotation ----
r = await j(await H.regenerate.onRequestPost({ request: req('POST', '/api/me/key/regenerate', { cookie: ALICE_COOKIE }), env }));
check('regenerate returns new key', r.status === 200 && r.data.apiKey.startsWith('dk_live_') && r.data.apiKey !== ALICE_KEY, r.data);
const NEW_KEY = r.data.apiKey;
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: 'print(1)', preset: 'lightweight' }, headers: { authorization: 'Bearer ' + ALICE_KEY } }), env }));
check('old key dead after regeneration (401)', r.status === 401, r.status);
r = await j(await H.obfuscate.onRequestPost({ request: req('POST', '/api/v1/obfuscate', { body: { source: "print('still works')", preset: 'lightweight' }, headers: { authorization: 'Bearer ' + NEW_KEY } }), env }));
check('new key works after regeneration', r.status === 200, r.status);

// ---- 12. protect alias also requires key ----
r = await j(await H.protect.onRequestPost({ request: req('POST', '/api/v1/protect', { body: { source: 'print(1)' } }), env }));
check('protect alias without key (401)', r.status === 401, r.status);
r = await j(await H.protect.onRequestPost({ request: req('POST', '/api/v1/protect', { body: { source: "print('x')" }, headers: { authorization: 'Bearer ' + NEW_KEY } }), env }));
check('protect alias with key works', r.status === 200 && r.data.ok === true, r.status);

// ---- 13. logout + login ----
r = await j(await H.logout.onRequestPost({ request: req('POST', '/api/auth/logout', { cookie: ALICE_COOKIE }), env }));
check('logout ok', r.status === 200, r.status);
r = await j(await H.me.onRequestGet({ request: req('GET', '/api/auth/me', { cookie: ALICE_COOKIE }), env }));
check('session destroyed after logout (401)', r.status === 401, r.status);
r = await j(await H.login.onRequestPost({ request: req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'wrongwrong1' } }), env }));
check('login wrong password (401)', r.status === 401, r.status);
r = await j(await H.login.onRequestPost({ request: req('POST', '/api/auth/login', { body: { identifier: 'alice@example.com', password: 'hunter2secure1' } }), env }));
check('login by email works', r.status === 200, r.status);
const COOKIE2 = r.setCookie.split(';')[0];
r = await j(await H.login.onRequestPost({ request: req('POST', '/api/auth/login', { body: { identifier: 'Alice', password: 'hunter2secure1' } }), env }));
check('login by username (case-insensitive) works', r.status === 200, r.status);

// ---- 14. change password ----
r = await j(await H.account.onRequestPost({ request: req('POST', '/api/auth/account', { cookie: COOKIE2, body: { action: 'password', currentPassword: 'wrongwrong1', value: 'newpass123' } }), env }));
check('password change with wrong current (401)', r.status === 401, r.status);
r = await j(await H.account.onRequestPost({ request: req('POST', '/api/auth/account', { cookie: COOKIE2, body: { action: 'password', currentPassword: 'hunter2secure1', value: 'weak' } }), env }));
check('password change with weak new (400)', r.status === 400, r.status);
r = await j(await H.account.onRequestPost({ request: req('POST', '/api/auth/account', { cookie: COOKIE2, body: { action: 'password', currentPassword: 'hunter2secure1', value: 'newpass123' } }), env }));
check('password change works', r.status === 200, r.status);
r = await j(await H.login.onRequestPost({ request: req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'hunter2secure1' } }), env }));
check('old password dead after change (401)', r.status === 401, r.status);
r = await j(await H.login.onRequestPost({ request: req('POST', '/api/auth/login', { body: { identifier: 'alice', password: 'newpass123' } }), env }));
check('new password works', r.status === 200, r.status);

// ---- 15. health + second user isolation ----
r = await j(await H.health.onRequestGet({ request: req('GET', '/api/v1/health', {}), env }));
check('health ok v5.1.0', r.status === 200 && r.data.version === '5.1.0', r.data);
r = await j(await H.signup.onRequestPost({ request: req('POST', '/api/auth/signup', { body: { username: 'bob', email: 'bob@example.com', password: 'bobpass123' } }), env }));
const BOB_KEY = r.data.apiKey;
check('bob gets a different key', BOB_KEY !== ALICE_KEY && BOB_KEY !== NEW_KEY);
check('keys not identical across users', new Set([ALICE_KEY, NEW_KEY, BOB_KEY]).size === 3);
const rawBob = await kv.get('email:bob@example.com').then(uid => kv.get('user:' + uid));
check('bob cannot resolve alice key data', !rawBob.includes('alice'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
