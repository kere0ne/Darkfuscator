#!/usr/bin/env node
/*
 * serve.js — Darkfuscator site + REST API in one zero-dependency server.
 *
 *   node tools/serve.js [port]        (PORT env wins; default 3000)
 *   DK_DATA_DIR=/some/dir             (override data dir; default ../data)
 *
 * Static: serves site/ (index.html, obfuscate.html, api-docs.html, account.html).
 * API v1 (all JSON, CORS open so other sites can call it):
 *
 *   GET  /api/v1/health              -> {ok, name, version}
 *   POST /api/v1/signup              -> {ok, token, username}   create account
 *   POST /api/v1/login               -> {ok, token, username}   sign in
 *   POST /api/v1/logout              -> {ok}                    invalidate session
 *   GET  /api/v1/me                  -> {ok, username, createdAt, keys, totalUses}
 *                                       auth: Authorization: Bearer df_sess_...
 *   GET  /api/v1/keys                -> {ok, keys: [...]}       your saved keys
 *   POST /api/v1/keys                -> {ok, key, limits}       new key (saved to the
 *                                       account when signed in, otherwise one-off)
 *   DELETE /api/v1/keys/<key>        -> {ok}                    revoke one of your keys
 *   POST /api/v1/obfuscate           -> {ok, output, stats, warnings, version}
 *                                       auth: Authorization: Bearer dk_live_... (or X-API-Key)
 *                                       body: {source, preset?, options?, filename?}
 *
 * Users, sessions and keys are persisted to data/users.json and data/keys.json
 * (best-effort; the in-memory tables always work even if the disk is read-only).
 * Passwords are salted PBKDF2-SHA256, never stored in the clear. Rate limits
 * per key: 30/min, 1000/day.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'site');
const DATA_DIR = process.env.DK_DATA_DIR || path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;

const MAX_BODY_BYTES = 512 * 1024;        // json body cap
const MAX_SOURCE_CHARS = 200000;          // matches the published limit
const LIMITS = { perMinute: 30, perDay: 1000 };
const MAX_KEYS = 500;                     // global anonymous+owned cap
const MAX_USER_KEYS = 25;
const SESSION_DAYS = 30;
const LOGIN_LIMIT_PER_MIN = 20;

const engine = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
const ENGINE_VERSION = engine.version || '6.1.0';

// ------------------------------------------------------------------ key store
let keys = new Map(); // key -> {key, name, owner, createdAt, lastUsed, total}
function loadKeys() {
  try {
    const raw = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const rec of (Array.isArray(raw) ? raw : raw.keys || [])) {
        if (rec && typeof rec.key === 'string' && rec.key.startsWith('dk_live_')) {
          keys.set(rec.key, {
            key: rec.key,
            name: String(rec.name || '').slice(0, 80),
            owner: typeof rec.owner === 'string' ? rec.owner : null,
            createdAt: rec.createdAt || new Date().toISOString(),
            lastUsed: rec.lastUsed || null,
            total: Number(rec.total) || 0
          });
        }
      }
    }
  } catch (e) { /* first boot or unreadable file: start empty */ }
}
let saveTimer = null;
function saveKeys() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: Array.from(keys.values()) }, null, 2));
    } catch (e) { /* read-only disk: memory only */ }
  }, 250);
  if (saveTimer.unref) saveTimer.unref();
}

function newKey(name, owner) {
  const key = 'dk_live_' + crypto.randomBytes(16).toString('hex');
  const rec = {
    key: key,
    name: String(name || '').slice(0, 80),
    owner: owner || null,
    createdAt: new Date().toISOString(),
    lastUsed: null,
    total: 0
  };
  keys.set(key, rec);
  saveKeys();
  return rec;
}

// ---------------------------------------------------------------- user store
let users = new Map();   // username(lowercase) -> {username, salt, hash, createdAt}
let sessions = new Map(); // token -> {user, createdAt, expiresAt}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
}

function loadUsers() {
  try {
    const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const now = Date.now();
    for (const u of (raw && Array.isArray(raw.users) ? raw.users : [])) {
      if (u && typeof u.username === 'string' && typeof u.salt === 'string' && typeof u.hash === 'string') {
        users.set(u.username.toLowerCase(), {
          username: u.username,
          salt: u.salt,
          hash: u.hash,
          createdAt: u.createdAt || new Date().toISOString()
        });
      }
    }
    for (const s of (raw && Array.isArray(raw.sessions) ? raw.sessions : [])) {
      if (s && typeof s.token === 'string' && typeof s.user === 'string') {
        const exp = Date.parse(s.expiresAt || '');
        if (isFinite(exp) && exp > now) {
          sessions.set(s.token, { user: s.user, createdAt: s.createdAt || new Date().toISOString(), expiresAt: new Date(exp).toISOString() });
        }
      }
    }
  } catch (e) { /* first boot: start empty */ }
}
let saveUsersTimer = null;
function saveUsers() {
  if (saveUsersTimer) return;
  saveUsersTimer = setTimeout(() => {
    saveUsersTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(USERS_FILE, JSON.stringify({
        users: Array.from(users.values()),
        sessions: Array.from(sessions.entries()).map(([token, s]) => ({ token: token, user: s.user, createdAt: s.createdAt, expiresAt: s.expiresAt }))
      }, null, 2));
    } catch (e) { /* read-only disk: memory only */ }
  }, 250);
  if (saveUsersTimer.unref) saveUsersTimer.unref();
}

function newSession(username) {
  const token = 'df_sess_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  sessions.set(token, {
    user: username.toLowerCase(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString()
  });
  saveUsers();
  return token;
}

function authSession(req) {
  const h = String(req.headers['authorization'] || '');
  const m = h.match(/^Bearer\s+(\S+)$/i);
  const token = (m && m[1]) || '';
  if (!token.startsWith('df_sess_')) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.parse(s.expiresAt) <= Date.now()) { sessions.delete(token); saveUsers(); return null; }
  return { token: token, user: s.user };
}

function userKeys(username) {
  const out = [];
  for (const rec of keys.values()) if (rec.owner === username) out.push(rec);
  out.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
  return out;
}

function publicUser(username) {
  const u = users.get(username);
  const ks = userKeys(username);
  let totalUses = 0;
  for (const k of ks) totalUses += k.total;
  return {
    username: u ? u.username : username,
    createdAt: u ? u.createdAt : null,
    keys: ks,
    keyCount: ks.length,
    totalUses: totalUses
  };
}

// ---------------------------------------------------------------- rate limits
const usage = new Map(); // key -> {min, minCount, day, dayCount}
function rateCheck(key) {
  const now = Date.now();
  const min = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  let u = usage.get(key);
  if (!u || u.min !== min || u.day !== day) {
    u = { min: min, minCount: 0, day: (u && u.day === day) ? u.day : day, dayCount: (u && u.day === day) ? u.dayCount : 0 };
    usage.set(key, u);
  }
  if (u.minCount >= LIMITS.perMinute) {
    return { ok: false, retryAfter: 60 - Math.floor((now % 60000) / 1000), scope: 'minute' };
  }
  if (u.dayCount >= LIMITS.perDay) {
    const nextDay = (day + 1) * 86400000;
    return { ok: false, retryAfter: Math.ceil((nextDay - now) / 1000), scope: 'day' };
  }
  u.minCount++; u.dayCount++;
  return { ok: true };
}

// simple per-IP limiter for signup/login so nobody can brute-force accounts
const ipHits = new Map(); // ip -> {min, count}
function loginRateCheck(ip) {
  const min = Math.floor(Date.now() / 60000);
  let h = ipHits.get(ip);
  if (!h || h.min !== min) { h = { min: min, count: 0 }; ipHits.set(ip, h); }
  h.count++;
  return h.count <= LOGIN_LIMIT_PER_MIN;
}

// ------------------------------------------------------------------- helpers
function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
    'Access-Control-Max-Age': '86400'
  }, extraHeaders || {});
  res.writeHead(status, headers);
  res.end(body);
}

function readBody(req, cb) {
  const chunks = [];
  let size = 0, overflow = false;
  req.on('data', (c) => {
    size += c.length;
    if (size > MAX_BODY_BYTES) { overflow = true; req.destroy(); return; }
    chunks.push(c);
  });
  req.on('end', () => cb(overflow ? null : Buffer.concat(chunks).toString('utf8')));
  req.on('error', () => cb(null));
}

function authKey(req) {
  const h = String(req.headers['authorization'] || '');
  const m = h.match(/^Bearer\s+(\S+)$/i);
  const candidate = (m && m[1]) || String(req.headers['x-api-key'] || '').trim();
  if (!candidate || !candidate.startsWith('dk_live_')) return null;
  return keys.get(candidate) || null;
}

// --------------------------------------------------------- static file logic
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.zip': 'application/zip'
};

function resolveFile(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); }
  catch (e) { return null; }
  if (p.endsWith('/')) p += 'index.html';
  const full = path.normalize(path.join(ROOT, p));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function serveStatic(req, res) {
  const requested = resolveFile(req.url || '/');
  if (!requested) { res.writeHead(400); res.end('Bad request'); return; }
  let file = null;
  for (const c of [requested, requested + '.html']) {
    try { if (fs.statSync(c).isFile()) { file = c; break; } } catch (e) { /* next */ }
  }
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found'); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': (ext === '.css' || ext === '.js') ? 'public, max-age=3600' : 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  });
  fs.createReadStream(file).pipe(res);
}

// ------------------------------------------------------------- account logic
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function handleSignup(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!loginRateCheck(ip)) return sendJson(res, 429, { ok: false, error: 'too many attempts, slow down' });
  return readBody(req, (raw) => {
    if (raw === null) return sendJson(res, 413, { ok: false, error: 'body too large' });
    let body = {};
    try { body = JSON.parse(raw) || {}; } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!USERNAME_RE.test(username)) {
      return sendJson(res, 400, { ok: false, error: 'username must be 3-24 characters: letters, numbers, underscore' });
    }
    if (password.length < 6) {
      return sendJson(res, 400, { ok: false, error: 'password must be at least 6 characters' });
    }
    const lk = username.toLowerCase();
    if (users.has(lk)) return sendJson(res, 409, { ok: false, error: 'that username is taken' });
    if (users.size >= 5000) return sendJson(res, 503, { ok: false, error: 'signup quota reached, contact the administrator' });
    const salt = crypto.randomBytes(16).toString('hex');
    users.set(lk, { username: username, salt: salt, hash: hashPassword(password, salt), createdAt: new Date().toISOString() });
    const token = newSession(lk);
    saveUsers();
    return sendJson(res, 201, { ok: true, token: token, username: username, note: 'Account created. Your session lasts 30 days; the site stores it in this browser.' });
  });
}

function handleLogin(req, res) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (!loginRateCheck(ip)) return sendJson(res, 429, { ok: false, error: 'too many attempts, slow down' });
  return readBody(req, (raw) => {
    if (raw === null) return sendJson(res, 413, { ok: false, error: 'body too large' });
    let body = {};
    try { body = JSON.parse(raw) || {}; } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const u = users.get(username);
    if (!u) return sendJson(res, 401, { ok: false, error: 'wrong username or password' });
    const check = hashPassword(password, u.salt);
    const ok = check.length === u.hash.length &&
      crypto.timingSafeEqual(Buffer.from(check), Buffer.from(u.hash));
    if (!ok) return sendJson(res, 401, { ok: false, error: 'wrong username or password' });
    const token = newSession(username);
    return sendJson(res, 200, { ok: true, token: token, username: u.username });
  });
}

// ------------------------------------------------------------------- routing
function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
    'Access-Control-Max-Age': '86400'
  }); return res.end(); }

  if (req.method === 'GET' && pathname === '/api/v1/health') {
    return sendJson(res, 200, { ok: true, name: 'Darkfuscator API', version: ENGINE_VERSION, time: new Date().toISOString() });
  }

  if (req.method === 'POST' && pathname === '/api/v1/signup') return handleSignup(req, res);
  if (req.method === 'POST' && pathname === '/api/v1/login') return handleLogin(req, res);

  if (req.method === 'POST' && pathname === '/api/v1/logout') {
    const sess = authSession(req);
    if (sess) { sessions.delete(sess.token); saveUsers(); }
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'GET' && pathname === '/api/v1/me') {
    const sess = authSession(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in (Authorization: Bearer df_sess_...)' });
    return sendJson(res, 200, Object.assign({ ok: true }, publicUser(sess.user)));
  }

  if (req.method === 'GET' && pathname === '/api/v1/keys') {
    const sess = authSession(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'sign in to list your saved keys' });
    return sendJson(res, 200, { ok: true, keys: userKeys(sess.user) });
  }

  if (req.method === 'POST' && pathname === '/api/v1/keys') {
    const sess = authSession(req); // optional: signed-in keys are saved to the account
    if (sess) {
      const owned = userKeys(sess.user);
      if (owned.length >= MAX_USER_KEYS) {
        return sendJson(res, 503, { ok: false, error: 'you already hold ' + MAX_USER_KEYS + ' keys, revoke one first' });
      }
    } else if (keys.size >= MAX_KEYS) {
      return sendJson(res, 503, { ok: false, error: 'key quota reached, contact the administrator' });
    }
    return readBody(req, (raw) => {
      if (raw === null) return sendJson(res, 413, { ok: false, error: 'body too large (max 512 KB)' });
      let body = {};
      if (raw) { try { body = JSON.parse(raw) || {}; } catch (e) { body = {}; } }
      const rec = newKey(body.name, sess ? sess.user : null);
      sendJson(res, 201, {
        ok: true,
        key: rec.key,
        name: rec.name,
        owner: rec.owner,
        createdAt: rec.createdAt,
        limits: LIMITS,
        saved: !!sess,
        note: sess
          ? 'Key created and saved to your account. It shows on your Account page.'
          : 'Store this key now. It is shown once; sign in first if you want keys saved to an account.'
      });
    });
  }

  const revokeMatch = pathname.match(/^\/api\/v1\/keys\/(dk_live_[0-9a-f]{32})$/);
  if (req.method === 'DELETE' && revokeMatch) {
    const sess = authSession(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'sign in to revoke keys' });
    const target = keys.get(revokeMatch[1]);
    if (!target) return sendJson(res, 404, { ok: false, error: 'no such key' });
    if (target.owner !== sess.user) return sendJson(res, 403, { ok: false, error: 'that key belongs to another account' });
    keys.delete(revokeMatch[1]);
    saveKeys();
    return sendJson(res, 200, { ok: true, revoked: revokeMatch[1] });
  }

  if (req.method === 'POST' && pathname === '/api/v1/obfuscate') {
    const rec = authKey(req);
    if (!rec) {
      return sendJson(res, 401, { ok: false, error: 'missing or invalid api key. Generate one: POST /api/v1/keys' });
    }
    const rl = rateCheck(rec.key);
    if (!rl.ok) {
      return sendJson(res, 429, { ok: false, error: 'rate limit exceeded (' + rl.scope + ')', retryAfter: rl.retryAfter },
        { 'Retry-After': String(rl.retryAfter), 'X-RateLimit-Limit': String(rl.scope === 'minute' ? LIMITS.perMinute : LIMITS.perDay) });
    }
    rec.lastUsed = new Date().toISOString();
    rec.total++;
    saveKeys();

    return readBody(req, (raw) => {
      if (raw === null) return sendJson(res, 413, { ok: false, error: 'body too large (max 512 KB)' });
      let body;
      try { body = JSON.parse(raw); } catch (e) { return sendJson(res, 400, { ok: false, error: 'invalid JSON body' }); }
      const source = body && typeof body.source === 'string' ? body.source : '';
      if (!source.trim()) return sendJson(res, 400, { ok: false, error: 'missing "source" (a string of Luau code)' });
      if (source.length > MAX_SOURCE_CHARS) {
        return sendJson(res, 400, { ok: false, error: 'source too large: ' + source.length + ' chars (max ' + MAX_SOURCE_CHARS + ')' });
      }
      const options = {};
      const preset = body && typeof body.preset === 'string' ? body.preset : '';
      const userOpts = body && body.options && typeof body.options === 'object' ? body.options : {};
      if (preset) options.preset = preset;
      for (const allowed of ['vmLayers', 'junk', 'guard', 'envChecks', 'antiTamper', 'nameStyle',
        'seed', 'minify', 'watermark', 'captureGlobals', 'envLock', 'lockPlace', 'lockUniverse']) {
        if (userOpts[allowed] !== undefined) options[allowed] = userOpts[allowed];
      }
      let result;
      try { result = engine.obfuscate(source, options); }
      catch (e) { return sendJson(res, 500, { ok: false, error: 'engine crashed: ' + e.message }); }
      if (!result || !result.ok) {
        return sendJson(res, 400, {
          ok: false,
          error: (result && result.error) ? result.error : 'obfuscation failed',
          warnings: (result && result.warnings) || []
        });
      }
      return sendJson(res, 200, {
        ok: true,
        output: result.output,
        stats: result.stats || {},
        warnings: result.warnings || [],
        version: ENGINE_VERSION
      });
    });
  }

  if (pathname === '/api/v1/keys' || pathname === '/api/v1/obfuscate') {
    return sendJson(res, 405, { ok: false, error: req.method + ' not allowed here' });
  }
  return sendJson(res, 404, { ok: false, error: 'unknown endpoint. See /api-docs.html' });
}

const API_PATHS = [
  '/api/v1/health', '/api/v1/signup', '/api/v1/login', '/api/v1/logout',
  '/api/v1/me', '/api/v1/keys', '/api/v1/obfuscate'
];

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0].split('#')[0];
  if (API_PATHS.indexOf(pathname) !== -1 || /^\/api\/v1\/keys\//.test(pathname) || pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname);
  }
  return serveStatic(req, res);
});

loadKeys();
loadUsers();
server.listen(PORT, '0.0.0.0', () => {
  console.log('Darkfuscator site + API on http://0.0.0.0:' + PORT + ' (engine ' + ENGINE_VERSION + ', ' + keys.size + ' keys, ' + users.size + ' accounts loaded)');
});
