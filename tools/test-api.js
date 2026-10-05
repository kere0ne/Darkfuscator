'use strict';
// Tests for the connected-loader API library (pure logic + mock KV).

const lib = require('../functions/api/_lib.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL:', name); }
}

function mockKV() {
  const m = new Map();
  return {
    async get(k) { return m.has(k) ? m.get(k) : null; },
    async put(k, v) { m.set(k, String(v)); },
    async delete(k) { m.delete(k); },
    async list(o) {
      const keys = [...m.keys()].filter((k) => k.startsWith(o.prefix)).map((name) => ({ name }));
      return { keys };
    }
  };
}

const NOW = 1728000000000;

// ids + tokens
const id = lib.genId();
ok('id format', /^DK-[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(id) && [...id.slice(3).replace(/-/g, '')].every((c) => lib.ALPHABET.includes(c)));
const tok = lib.genToken();
ok('token is 40 hex', /^[0-9a-f]{40}$/.test(tok));

// assess
ok('null build is invalid', lib.assess(null, tok, NOW) === 'invalid');
ok('revoked wins', lib.assess({ token: tok, revoked: true }, tok, NOW) === 'revoked');
ok('expired beats token', lib.assess({ token: tok, expires: NOW - 1 }, tok, NOW) === 'expired');
ok('wrong token', lib.assess({ token: 'nope' }, tok, NOW) === 'unauthorized');
ok('valid', lib.assess({ token: tok }, tok, NOW) === 'valid');
ok('no expiry never expires', lib.assess({ token: tok, expires: null }, tok, NOW) === 'valid');
ok('expiry boundary', lib.assess({ token: tok, expires: NOW }, tok, NOW) === 'valid');

// responses
const r = lib.resolveResponse({ responses: lib.sanitizeResponses({}) }, 'invalid');
ok('invalid default 404', r.status === 404);
const r2 = lib.resolveResponse({
  responses: lib.sanitizeResponses({ revoked: { status: 418, body: '<h1>Fuck off</h1>' } })
}, 'revoked');
ok('custom body + status', r2.status === 418 && r2.body.includes('Fuck off'));
const r3 = lib.resolveResponse({ redirect: 'https://example.com/bye' }, 'unauthorized');
ok('redirect for unauthorized', r3.status === 302 && r3.headers.location === 'https://example.com/bye');
const r4 = lib.resolveResponse({}, 'expired');
ok('expired default 410', r4.status === 410);

// sanitize guards
const s = lib.sanitizeResponses({ invalid: { status: 99999, body: '' }, bogus: { status: 1 } });
ok('sanitize clamps status', s.invalid.status === lib.DEFAULT_RESPONSES.invalid.status);
ok('sanitize only known states', !('bogus' in s) && Object.keys(s).length === 4);

// log capping + shape
const kv = mockKV();
(async () => {
  for (let i = 0; i < lib.LOG_CAP + 5; i++) {
    await lib.logRequest(kv, id, { t: NOW + i, s: 'valid', ua: 'u' + i, cc: 'US' });
  }
  const logs = JSON.parse(await kv.get('logs:' + id));
  ok('log capped', logs.length === lib.LOG_CAP && logs[logs.length - 1].ua === 'u' + (lib.LOG_CAP + 4));

  // loader code
  const code = lib.loaderCode(id, tok, 'https://darkfuscator.pages.dev/');
  ok('loader has endpoint', code.includes('/api/loader/' + id));
  ok('loader has token halves', code.includes(tok.slice(0, 20)) && code.includes(tok.slice(20)));
  ok('loader posts with header', code.includes('x-dark-token'));
  ok('loader runs payload', code.includes('loadstring'));

  // page escapes
  const pg = lib.page('<x>&"', '<script>', 'hello');
  ok('page escapes', pg.includes('&lt;script&gt;') && !pg.includes('<script>'));

  // readJson + authed with a Request-like
  const reqLike = { headers: { get: () => 'secret' }, json: async () => ({ a: 1 }) };
  ok('authed matches', lib.authed({ ADMIN_TOKEN: 'secret' }, reqLike) === true);
  ok('authed rejects', lib.authed({ ADMIN_TOKEN: 'other' }, reqLike) === false);
  ok('authed false without env', lib.authed({}, reqLike) === false);
  const body = await lib.readJson({ json: async () => { throw new Error('x'); } });
  ok('readJson null on bad json', body === null);

  console.log(passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
