#!/usr/bin/env node
/*
 * serve.js — Darkfuscator platform: static frontend + full REST API in one
 * zero-dependency Node service.
 *
 *   node tools/serve.js [port]      (PORT env wins; default 3000)
 *   DK_DATA_DIR=/some/dir           override data dir
 *
 * Frontend routes (SPA shells served by this server, so every route works on
 * refresh; Cloudflare Pages gets the same map in site/_redirects):
 *   /                       landing
 *   /login /register   auth (username + password; no email auth)
 *   /logout                 invalidates the session, redirects to /login
 *   /dashboard /obfuscate /projects /projects/new /projects/:id /history /api /settings /account
 *   /docs and /docs/*       documentation
 * API v1: see tools/lib/handlers.js (auth, me, projects, builds, keys)
 * and /api/v1/obfuscate (API-key auth, open CORS for third-party callers).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const util = require('./lib/util');
const handlers = require('./lib/handlers');
const db = require('./lib/db');

const ROOT = path.join(__dirname, '..', 'site');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 3000;

const ENGINE_VERSION = handlers.ENGINE_VERSION;
const PLATFORM_VERSION = '7.3.0';
const LIMITS = handlers.LIMITS;

// ------------------------------------------------------------------- routing
const AUTH_ROUTES = ['login', 'register'];
const APP_ROUTES = ['dashboard', 'obfuscate', 'projects', 'history', 'api', 'api-keys', 'settings', 'account'];

function htmlFile(name) { return path.join(ROOT, name + '.html'); }

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.zip': 'application/zip', '.map': 'application/json'
};

function serveStaticFile(file, status, extra) {
  const ext = path.extname(file).toLowerCase();
  return (req, res) => {
    try {
      if (!fs.statSync(file).isFile()) return serve404(req, res);
    } catch (e) { return serve404(req, res); }
    res.writeHead(status || 200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': (ext === '.css' || ext === '.js') ? 'public, max-age=3600' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    }, extra || {}));
    fs.createReadStream(file).pipe(res);
  };
}

function serve404(req, res) {
  if (res.headersSent) { try { res.end(); } catch (e) {} return; }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

function redirect(res, location, status) {
  res.writeHead(status || 301, { Location: location, 'Content-Type': 'text/plain' });
  res.end('Redirecting to ' + location);
}

// page routes: every app/auth/docs route serves its shell, so SPA routes work
// on refresh; unknown non-api paths fall back to 404
function pageRoutes(req, res, pathname) {
  const parts = pathname.split('/').filter(Boolean);

  if (pathname === '/') { serveStaticFile(htmlFile('index'))(req, res); return true; }
  if (pathname === '/start') { serveStaticFile(htmlFile('start'))(req, res); return true; }
  if (pathname === '/logout') {
    // GET logout: invalidate the cookie session and land on the login page
    const sess = handlers.sessionFromReq(req);
    if (sess) { handlers.revokeSession(sess.session.id); }
    util.clearCookie(res, handlers.COOKIE_NAME, handlers.SESSION_COOKIE_SECURE);
    redirect(res, '/login?logged=out', 302);
    return true;
  }
  if (pathname === '/index.html') { redirect(res, '/', 301); return true; }
  if (pathname === '/obfuscate.html') { redirect(res, '/obfuscate', 301); return true; }
  if (pathname === '/account.html') { redirect(res, '/account', 301); return true; }
  if (pathname === '/api-docs.html') { redirect(res, '/docs/api/protect', 301); return true; }
  if (pathname === '/dashboard.html') { redirect(res, '/dashboard', 301); return true; }
  if (pathname === '/offline' || pathname === '/offline.html') { serveStaticFile(htmlFile('offline'))(req, res); return true; }

  if (parts[0] === 'docs') { serveStaticFile(htmlFile('docs'))(req, res); return true; }

  if (parts.length === 1 && AUTH_ROUTES.indexOf(parts[0]) !== -1) {
    serveStaticFile(htmlFile('auth'))(req, res); return true;
  }
  if (parts.length === 1 && APP_ROUTES.indexOf(parts[0]) !== -1) {
    serveStaticFile(htmlFile('app'))(req, res); return true;
  }
  if (parts[0] === 'projects' && (parts.length === 2 || (parts.length === 3 && parts[1] === 'new'))) {
    // /projects, /projects/new, /projects/:id
    serveStaticFile(htmlFile('app'))(req, res); return true;
  }
  return null; // fall through to static
}

// legacy static fallback (css/js/assets referenced by the shells)
function staticRoutes(req, res, pathname) {
  const full = path.normalize(path.join(ROOT, decodeURIComponent(pathname.split('?')[0])));
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return serve404(req, res);
  return serveStaticFile(full)(req, res);
}

// ================================================================= routing
function handleApi(req, res, pathname) {
  if (req.method === 'OPTIONS') {
    const keyAuthed = pathname === '/api/v1/obfuscate' || pathname === '/api/v1/health';
    res.writeHead(204, util.corsHeaders(keyAuthed));
    return res.end();
  }

  if (pathname === '/api/v1/health' && req.method === 'GET') {
    const sys = handlers.selfCheck();
    return util.sendJson(res, 200, {
      ok: !!sys.ok, name: 'Darkfuscator', version: PLATFORM_VERSION, engineVersion: ENGINE_VERSION,
      time: new Date().toISOString(), engine: sys.engine, api: sys.api,
      authentication: sys.authentication, database: sys.database
    }, util.corsHeaders(true));
  }

  // legacy key-authed obfuscate endpoint, open CORS for third-party callers
  if (pathname === '/api/v1/obfuscate' && req.method === 'POST') {
    const k = handlers.keyFromReq(req);
    if (!k) {
      return util.sendJson(res, 401, {
        ok: false, error: 'missing or invalid api key. Generate one: POST /api/v1/keys'
      }, util.corsHeaders(true));
    }
    const rl = k.owner ? { ok: true } : util.rateCheck('apik:' + k.id, LIMITS.perMinute, LIMITS.perDay);
    if (!rl.ok) {
      return util.sendJson(res, 429, {
        ok: false, error: 'rate limit exceeded (' + rl.scope + ')', retryAfter: rl.retryAfter
      }, Object.assign({
        'Retry-After': String(rl.retryAfter),
        'X-RateLimit-Limit': String(rl.scope === 'minute' ? LIMITS.perMinute : LIMITS.perDay)
      }, util.corsHeaders(true)));
    }
    const t0 = Date.now();
    return util.readBody(req, (raw) => {
      const finish = (status, obj) => {
        handlers.logKeyRequest(k, pathname, status, Date.now() - t0);
        k.lastUsed = new Date().toISOString();
        k.total = (k.total || 0) + 1;
        flushSoon();
        util.sendJson(res, status, obj, util.corsHeaders(true));
      };
      if (raw === null) return finish(413, { ok: false, error: 'body too large (max 512 KB)' });
      let body;
      try { body = JSON.parse(raw); } catch (e) { return finish(400, { ok: false, error: 'invalid JSON body' }); }
      const source = body && typeof body.source === 'string' ? body.source : '';
      if (!source.trim()) return finish(400, { ok: false, error: 'missing "source" (a string of Luau code)' });
      if (source.length > 200000) return finish(400, { ok: false, error: 'source too large: ' + source.length + ' chars (max 200000)' });
      const options = {};
      const preset = body && typeof body.preset === 'string' ? body.preset : '';
      const userOpts = body && body.options && typeof body.options === 'object' ? body.options : {};
      if (preset && ['lightweight', 'balanced', 'maximum'].indexOf(preset) === -1) {
        return finish(400, { ok: false, error: 'unsupported preset' });
      }
      options.preset = preset || 'maximum';
      const target = body && typeof body.target === 'string' ? body.target : 'luau';
      if (target !== 'luau' && target !== 'roblox') {
        return finish(400, { ok: false, error: 'unsupported target; supported targets are Luau and Roblox Luau' });
      }
      const optionIssue = handlers.validateBuildOptions(userOpts);
      if (optionIssue) return finish(400, { ok: false, error: optionIssue });
      if (target === 'roblox' && userOpts.antiTamper === undefined) options.antiTamper = 2;
      const engine = require(path.join(__dirname, '..', 'site', 'js', 'obfuscate.js'));
      const allowed = ['vmLayers', 'junk', 'guard', 'antiTamper', 'vmMode', 'ir', 'compression', 'nameStyle',
        'seed', 'minify', 'watermark', 'captureGlobals', 'lockPlace', 'lockUniverse'];
      for (const a of allowed) if (userOpts[a] !== undefined) options[a] = userOpts[a];
      let result;
      try { result = engine.obfuscate(source, options); }
      catch (e) { return finish(500, { ok: false, error: 'engine crashed: ' + e.message }); }
      if (!result || !result.ok) {
        return finish(400, { ok: false, error: (result && result.error) ? result.error : 'obfuscation failed', warnings: (result && result.warnings) || [] });
      }
      return finish(200, { ok: true, output: result.output, stats: result.stats || {}, warnings: result.warnings || [], target, version: ENGINE_VERSION });
    });
  }

  // session/auth + platform routes
  (async () => {
    try {
      if (pathname.startsWith('/api/v1/auth/')) {
        const handled = await handlers.handleAuth(req, res, pathname.slice('/api/v1/auth'.length));
        if (handled) return;
        return util.sendJson(res, 404, { ok: false, error: 'unknown auth endpoint' });
      }
      const handled = await handlers.handlePlatform(req, res, pathname);
      if (handled) return;
      if (pathname.startsWith('/api/')) {
        return util.sendJson(res, 404, { ok: false, error: 'unknown endpoint' });
      }
    } catch (e) {
      try { util.sendJson(res, 500, { ok: false, error: 'server error: ' + e.message }); } catch (e2) {}
    }
  })();
}

process.on('uncaughtException', (err) => {
  console.error('[uncaught]', err && err.message);
  // a bind failure is fatal for a server: fail loudly so host logs show it
  if (err && (err.code === 'EADDRINUSE' || err.code === 'EACCES')) process.exit(1);
});
process.on('unhandledRejection', (err) => { console.error('[unhandledRejection]', err && (err.message || err)); });

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent((req.url || '/').split('?')[0].split('#')[0]); }
  catch (e) { return serve404(req, res); }

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);

  const page = pageRoutes(req, res, pathname);
  if (page === true) return;
  if (pathname === '/robots.txt' || pathname === '/_headers' || pathname === '/_redirects') {
    return staticRoutes(req, res, pathname);
  }
  if (pathname.startsWith('/js/') || pathname.startsWith('/assets/') || /\.(css|js|png|svg|ico|map|txt|webmanifest)$/.test(pathname)) {
    return staticRoutes(req, res, pathname);
  }
  return serve404(req, res);
});

function flushSoon() {
  const t = setTimeout(() => db.flush(), 250);
  if (t.unref) t.unref();
}

const imported = db.importLegacy();
db.flush();
db.boot().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Darkfuscator platform on http://0.0.0.0:' + PORT + ' (platform ' + PLATFORM_VERSION + ', engine ' + ENGINE_VERSION + ', ' + imported + ' legacy records imported)');
  });
});
