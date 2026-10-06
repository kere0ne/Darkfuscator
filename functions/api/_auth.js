'use strict';

// Darkfuscator account, session and API-key library.
// Storage: KV binding DARKFUSCATOR_KV. Passwords are PBKDF2-SHA-256 hashed and
// never stored in plaintext. API keys (dk_live_...) are stored two ways: a
// SHA-256 hash for lookup and an AES-GCM encrypted copy so the owner can reveal
// their own key from the dashboard. Nothing here is exposed to the frontend.

var CRYPTO = globalThis.crypto;
if (!CRYPTO) {
  try { CRYPTO = require('crypto').webcrypto; } catch (e) { /* harness supplies its own */ }
}

var HEX = '0123456789abcdef';
var KEY_PREFIX = 'dk_live_';
var PBKDF2_ITER = 120000;
var SESSION_COOKIE = 'dk_sess';
var SESSION_TTL = 604800;            // 7 days, both cookie and KV
var RL_PER_MINUTE = 30;              // per API key
var RL_PER_DAY = 1000;               // per API key
var AUTH_RL_PER_MINUTE = 20;         // per IP on auth endpoints
var MAX_BODY = 10000;                // auth request bodies
var MAX_SOURCE = 200000;             // obfuscation source cap (matches /v1/protect)
var MAX_OPTIONS = 2000;              // options JSON serialized cap
var RECENT_CAP = 20;

function randHex(nBytes) {
  var b = new Uint8Array(nBytes);
  CRYPTO.getRandomValues(b);
  var s = '', i;
  for (i = 0; i < b.length; i++) { s += HEX[b[i] >> 4]; s += HEX[b[i] & 15]; }
  return s;
}

function bufToHex(buf) {
  var b = new Uint8Array(buf), s = '', i;
  for (i = 0; i < b.length; i++) { s += HEX[b[i] >> 4]; s += HEX[b[i] & 15]; }
  return s;
}

function b64(buf) {
  var b = new Uint8Array(buf), s = '', i;
  for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

function unb64(s) {
  var raw = atob(s), b = new Uint8Array(raw.length), i;
  for (i = 0; i < raw.length; i++) b[i] = raw.charCodeAt(i);
  return b;
}

function sha256Hex(str) {
  var data = new TextEncoder().encode(str);
  return CRYPTO.subtle.digest('SHA-256', data).then(bufToHex);
}

// ---- secret for key encryption -------------------------------------------
function authSecret(env) {
  return (env && (env.AUTH_SECRET || env.ADMIN_TOKEN)) || 'darkfuscator-local-dev-secret';
}

var _gcmKeyCache = {};
function gcmKey(env) {
  var s = authSecret(env);
  if (_gcmKeyCache[s]) return Promise.resolve(_gcmKeyCache[s]);
  return CRYPTO.subtle.digest('SHA-256', new TextEncoder().encode('dk-aes:' + s)).then(function (k) {
    return CRYPTO.subtle.importKey('raw', k, 'AES-GCM', false, ['encrypt', 'decrypt']).then(function (key) {
      _gcmKeyCache[s] = key;
      return key;
    });
  });
}

function encryptString(env, str) {
  return gcmKey(env).then(function (key) {
    var iv = CRYPTO.getRandomValues(new Uint8Array(12));
    return CRYPTO.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(str)).then(function (ct) {
      return 'enc.v1.' + b64(iv) + '.' + b64(ct);
    });
  });
}

function decryptString(env, packed) {
  if (typeof packed !== 'string' || packed.indexOf('enc.v1.') !== 0) return Promise.resolve(null);
  var parts = packed.split('.');
  if (parts.length !== 4) return Promise.resolve(null);
  return gcmKey(env).then(function (key) {
    return CRYPTO.subtle.decrypt({ name: 'AES-GCM', iv: unb64(parts[2]) }, key, unb64(parts[3]))
      .then(function (pt) { return new TextDecoder().decode(pt); })
      .catch(function () { return null; });
  });
}

// ---- passwords -------------------------------------------------------------
function hashPassword(password, saltHex) {
  var salt = saltHex ? hexToBuf(saltHex) : CRYPTO.getRandomValues(new Uint8Array(16));
  return CRYPTO.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
    .then(function (key) {
      return CRYPTO.subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITER, hash: 'SHA-256' }, key, 256);
    })
    .then(function (bits) {
      return { salt: bufToHex(salt), hash: bufToHex(bits), iterations: PBKDF2_ITER };
    });
}

function hexToBuf(hex) {
  var b = new Uint8Array(hex.length / 2), i;
  for (i = 0; i < b.length; i++) b[i] = parseInt(hex.substr(i * 2, 2), 16);
  return b;
}

// constant-time-ish comparison of two equal-length hex strings
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  var diff = 0, i;
  for (i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function verifyPassword(password, saltHex, hashHex) {
  return hashPassword(password, saltHex).then(function (r) { return safeEqual(r.hash, hashHex); });
}

// ---- validation ------------------------------------------------------------
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && EMAIL_RE.test(email);
}
function validUsername(u) {
  return typeof u === 'string' && USERNAME_RE.test(u);
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password must be 200 characters or fewer.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain at least one letter and one number.';
  return null;
}

// ---- users -----------------------------------------------------------------
function genUserId() { return 'u_' + randHex(8); }

function apiKeyGenerate() {
  return KEY_PREFIX + randHex(24); // dk_live_ + 48 hex chars, 192 bits of entropy
}

function maskKey(key) {
  if (typeof key !== 'string' || key.length < 20) return 'dk_live_....';
  return key.slice(0, 12) + '\u2022'.repeat(12) + key.slice(-4);
}

function userLoad(kv, uid) {
  return kv.get('user:' + uid).then(function (raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  });
}

function userSave(kv, user) {
  return kv.put('user:' + user.id, JSON.stringify(user));
}

function createUser(kv, username, email, password, env) {
  var eEmail = email.trim().toLowerCase();
  var eUser = username.trim();
  var unameLower = eUser.toLowerCase();
  return Promise.all([
    kv.get('email:' + eEmail),
    kv.get('uname:' + unameLower)
  ]).then(function (found) {
    if (found[0]) return { error: 'An account with this email already exists.' };
    if (found[1]) return { error: 'This username is already taken.' };
    var uid = genUserId();
    var apiKey = apiKeyGenerate();
    return Promise.all([
      hashPassword(password),
      sha256Hex(apiKey),
      encryptString(env, apiKey)
    ]).then(function (r) {
      var user = {
        id: uid,
        username: eUser,
        usernameLower: unameLower,
        email: eEmail,
        passSalt: r[0].salt,
        passHash: r[0].hash,
        passIter: r[0].iterations,
        createdAt: new Date().toISOString(),
        keyHash: r[1],
        keyEnc: r[2],
        keyCreatedAt: new Date().toISOString(),
        keyLastUsed: null,
        usage: { total: 0, success: 0, failed: 0, limited: 0 },
        recent: []
      };
      return Promise.all([
        kv.put('user:' + uid, JSON.stringify(user)),
        kv.put('email:' + eEmail, uid),
        kv.put('uname:' + unameLower, uid),
        kv.put('apikey:' + r[1], JSON.stringify({ uid: uid, createdAt: user.keyCreatedAt }))
      ]).then(function () { return { user: user, apiKey: apiKey }; });
    });
  });
}

// lookup by email or username (case-insensitive)
function findUser(kv, identifier) {
  var id = String(identifier || '').trim();
  if (!id) return Promise.resolve(null);
  var low = id.toLowerCase();
  return kv.get('email:' + low).then(function (uid) {
    if (uid) return userLoad(kv, uid);
    return kv.get('uname:' + low).then(function (uid2) {
      if (uid2) return userLoad(kv, uid2);
      return null;
    });
  });
}

// ---- sessions --------------------------------------------------------------
function sessionCreate(kv, uid) {
  var token = 's_' + randHex(32);
  return kv.put('sess:' + token, JSON.stringify({ uid: uid, createdAt: new Date().toISOString() }), { expirationTtl: SESSION_TTL })
    .then(function () { return token; });
}

function sessionCookie(token, clear) {
  if (clear) return SESSION_COOKIE + '=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  return SESSION_COOKIE + '=' + token + '; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=' + SESSION_TTL;
}

function parseCookies(request) {
  var raw = request.headers.get('cookie') || '';
  var out = {}, parts = raw.split(';'), i, kv2;
  for (i = 0; i < parts.length; i++) {
    kv2 = parts[i].split('=');
    if (kv2.length >= 2) out[kv2[0].trim()] = kv2.slice(1).join('=').trim();
  }
  return out;
}

function sessionUser(kv, env, request) {
  var token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return Promise.resolve(null);
  return kv.get('sess:' + token).then(function (raw) {
    if (!raw) return null;
    var sess;
    try { sess = JSON.parse(raw); } catch (e) { return null; }
    if (!sess || !sess.uid) return null;
    return userLoad(kv, sess.uid).then(function (user) {
      if (!user) return null;
      return { user: user, token: token };
    });
  });
}

function sessionDestroy(kv, request) {
  var token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return Promise.resolve();
  return kv.delete('sess:' + token);
}

// ---- API keys --------------------------------------------------------------
// Returns {user, keyHash} for a valid plaintext key, else null.
function keyResolve(kv, plaintext) {
  if (typeof plaintext !== 'string' || plaintext.indexOf(KEY_PREFIX) !== 0 || plaintext.length < 40) return Promise.resolve(null);
  return sha256Hex(plaintext).then(function (h) {
    return kv.get('apikey:' + h).then(function (raw) {
      if (!raw) return null;
      var rec;
      try { rec = JSON.parse(raw); } catch (e) { return null; }
      if (!rec || !rec.uid) return null;
      return userLoad(kv, rec.uid).then(function (user) {
        if (!user || user.keyHash !== h) return null; // revoked by regeneration
        return { user: user, keyHash: h };
      });
    });
  });
}

// New key replaces the old one; the previous hash entry is deleted so the old
// key stops working immediately.
function keyRotate(kv, env, user) {
  var apiKey = apiKeyGenerate();
  return sha256Hex(apiKey).then(function (h) {
    return encryptString(env, apiKey).then(function (enc) {
      var ops = [kv.put('apikey:' + h, JSON.stringify({ uid: user.id, createdAt: new Date().toISOString() }))];
      if (user.keyHash) ops.push(kv.delete('apikey:' + user.keyHash));
      return Promise.all(ops).then(function () {
        user.keyHash = h;
        user.keyEnc = enc;
        user.keyCreatedAt = new Date().toISOString();
        user.keyLastUsed = null;
        return userSave(kv, user).then(function () { return apiKey; });
      });
    });
  });
}

// ---- rate limiting (KV counters) --------------------------------------------
function minuteBucket(now) {
  var d = new Date(now);
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + pad(d.getUTCHours()) + pad(d.getUTCMinutes());
}
function dayBucket(now) {
  var d = new Date(now);
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}
function pad(n) { return n < 10 ? '0' + n : '' + n; }

function bumpCounter(kv, key, ttl) {
  return kv.get(key).then(function (raw) {
    var n = parseInt(raw || '0', 10) || 0;
    var next = n + 1;
    return kv.put(key, String(next), { expirationTtl: ttl }).then(function () { return next; });
  });
}

function apiRateLimit(kv, keyHash, now) {
  return Promise.all([
    bumpCounter(kv, 'rlm:' + keyHash + ':' + minuteBucket(now), 120),
    bumpCounter(kv, 'rld:' + keyHash + ':' + dayBucket(now), 90000)
  ]).then(function (c) {
    var perMin = c[0], perDay = c[1];
    var limited = perMin > RL_PER_MINUTE || perDay > RL_PER_DAY;
    return {
      limited: limited,
      headers: {
        'x-ratelimit-limit-minute': String(RL_PER_MINUTE),
        'x-ratelimit-remaining-minute': String(Math.max(0, RL_PER_MINUTE - perMin)),
        'x-ratelimit-limit-day': String(RL_PER_DAY),
        'x-ratelimit-remaining-day': String(Math.max(0, RL_PER_DAY - perDay))
      },
      retryAfter: limited ? (perMin > RL_PER_MINUTE ? 60 - (new Date(now).getUTCSeconds()) : 86400) : 0
    };
  });
}

function authRateLimit(kv, ip, now) {
  return bumpCounter(kv, 'rla:' + ip + ':' + minuteBucket(now), 120).then(function (n) {
    return n > AUTH_RL_PER_MINUTE;
  });
}

function clientIp(request) {
  return (request.headers.get('cf-connecting-ip') ||
          request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

// ---- usage ------------------------------------------------------------------
function usageBump(kv, user, kind, extra) {
  user.usage.total++;
  if (kind === 'success') user.usage.success++;
  else if (kind === 'failed') user.usage.failed++;
  else if (kind === 'limited') user.usage.limited++;
  user.keyLastUsed = new Date().toISOString();
  if (extra) {
    user.recent.unshift(extra);
    if (user.recent.length > RECENT_CAP) user.recent.length = RECENT_CAP;
  }
  return userSave(kv, user);
}

// ---- http helpers ------------------------------------------------------------
function json(data, status, headers) {
  var h = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  var k;
  if (headers) for (k in headers) h[k] = headers[k];
  return new Response(JSON.stringify(data), { status: status || 200, headers: h });
}

var CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-max-age': '86400'
};

function readBody(request) {
  return request.text().then(function (t) {
    if (t.length > MAX_BODY) return { error: 'Request body too large.' };
    try { return { body: JSON.parse(t) }; } catch (e) { return { error: 'Invalid JSON body.' }; }
  }).catch(function () { return { error: 'Could not read request body.' }; });
}

function apiError(code, message, status, headers) {
  var h = {};
  var k;
  if (headers) for (k in headers) h[k] = headers[k];
  return json({ success: false, error: { code: code, message: message } }, status, h);
}

module.exports = {
  KEY_PREFIX: KEY_PREFIX, PBKDF2_ITER: PBKDF2_ITER, SESSION_COOKIE: SESSION_COOKIE,
  SESSION_TTL: SESSION_TTL, RL_PER_MINUTE: RL_PER_MINUTE, RL_PER_DAY: RL_PER_DAY,
  MAX_BODY: MAX_BODY, MAX_SOURCE: MAX_SOURCE, MAX_OPTIONS: MAX_OPTIONS,
  randHex: randHex, sha256Hex: sha256Hex,
  encryptString: encryptString, decryptString: decryptString,
  hashPassword: hashPassword, verifyPassword: verifyPassword, safeEqual: safeEqual,
  validEmail: validEmail, validUsername: validUsername, passwordProblem: passwordProblem,
  genUserId: genUserId, apiKeyGenerate: apiKeyGenerate, maskKey: maskKey,
  userLoad: userLoad, userSave: userSave, createUser: createUser, findUser: findUser,
  sessionCreate: sessionCreate, sessionCookie: sessionCookie, sessionUser: sessionUser,
  sessionDestroy: sessionDestroy, parseCookies: parseCookies,
  keyResolve: keyResolve, keyRotate: keyRotate,
  apiRateLimit: apiRateLimit, authRateLimit: authRateLimit, clientIp: clientIp,
  usageBump: usageBump, json: json, apiError: apiError, readBody: readBody,
  CORS: CORS
};
