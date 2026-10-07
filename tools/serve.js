#!/usr/bin/env node
/*
 * serve.js — Darkfuscator site + REST API in one zero-dependency server.
 *
 *   node tools/serve.js [port]        (PORT env wins; default 3000)
 *
 * Static: serves site/ (index.html, obfuscate.html, api-docs.html).
 * API v1 (all JSON, CORS open so other sites can call it):
 *
 *   GET  /api/v1/health              -> {ok, name, version}
 *   POST /api/v1/keys                -> {ok, key, limits}   self-serve key generation
 *   POST /api/v1/obfuscate           -> {ok, output, stats, warnings, version}
 *                                       auth: Authorization: Bearer dk_live_... (or X-API-Key)
 *                                       body: {source, preset?, options?, filename?}
 *
 * Keys are persisted to data/keys.json (best-effort; the in-memory table always
 * works even if the disk is read-only). Rate limits per key: 30/min, 1000/day.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', 'site');
const DATA_DIR = path.join(__dirname, '..', 'data');
const KEYS_FILE = path.join(DATA_DIR, 'keys.json');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;

const MAX_BODY_BYTES = 512 * 1024;        // json body cap
const MAX_SOURCE_CHARS = 200000;          // matches the published limit
const LIMITS = { perMinute: 30, perDay: 1000 };
const MAX_KEYS = 500;

const engine = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
const ENGINE_VERSION = engine.version || '6.0.0';

// ------------------------------------------------------------------ key store
let keys = new Map(); // key -> {key, name, createdAt, lastUsed, total}
function loadKeys() {
  try {
    const raw = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
    if (raw && typeof raw === 'object') {
      for (const rec of (Array.isArray(raw) ? raw : raw.keys || [])) {
        if (rec && typeof rec.key === 'string' && rec.key.startsWith('dk_live_')) {
          keys.set(rec.key, {
            key: rec.key,
            name: String(rec.name || '').slice(0, 80),
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

function newKey(name) {
  const key = 'dk_live_' + crypto.randomBytes(16).toString('hex');
  const rec = {
    key: key,
    name: String(name || '').slice(0, 80),
    createdAt: new Date().toISOString(),
    lastUsed: null,
    total: 0
  };
  keys.set(key, rec);
  saveKeys();
  return rec;
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

// ------------------------------------------------------------------- helpers
function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
  if (!candidate) return null;
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

// ------------------------------------------------------------------- routing
function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') { res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
    'Access-Control-Max-Age': '86400'
  }); return res.end(); }

  if (req.method === 'GET' && pathname === '/api/v1/health') {
    return sendJson(res, 200, { ok: true, name: 'Darkfuscator API', version: ENGINE_VERSION, time: new Date().toISOString() });
  }

  if (req.method === 'POST' && pathname === '/api/v1/keys') {
    if (keys.size >= MAX_KEYS) {
      return sendJson(res, 503, { ok: false, error: 'key quota reached, contact the administrator' });
    }
    return readBody(req, (raw) => {
      let body = {};
      if (raw) { try { body = JSON.parse(raw) || {}; } catch (e) { body = {}; } }
      const rec = newKey(body.name);
      sendJson(res, 201, {
        ok: true,
        key: rec.key,
        name: rec.name,
        createdAt: rec.createdAt,
        limits: LIMITS,
        note: 'Store this key now. It is shown once; keep it server-side, never in client code.'
      });
    });
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

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0].split('#')[0];
  if (pathname === '/api/v1/health' || pathname === '/api/v1/keys' || pathname === '/api/v1/obfuscate') {
    return handleApi(req, res, pathname);
  }
  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname); // 404 json with CORS for unknown api paths
  }
  return serveStatic(req, res);
});

loadKeys();
server.listen(PORT, '0.0.0.0', () => {
  console.log('Darkfuscator site + API on http://0.0.0.0:' + PORT + ' (engine ' + ENGINE_VERSION + ', ' + keys.size + ' keys loaded)');
});
