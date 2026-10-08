'use strict';
/* handlers.js — every platform route: auth, sessions, projects, builds,
 * API keys, stats, system. All state lives in tools/lib/db.js. Auth is
 * username + password only (no email auth); the obfuscation engine is real.
 */
const crypto = require('crypto');
const db = require('./db');
const util = require('./util');
const sendJson = util.sendJson;

const path_ = require('path');
const engine = require(path_.join(__dirname, '..', '..', 'site', 'js', 'obfuscate.js'));

const ENGINE_VERSION = engine.version || '7.0.0';
const COOKIE_NAME = 'df_session';
// Secure cookies are mandatory in production. Local development stays usable
// over http unless COOKIE_SECURE=true is explicitly set.
const SESSION_COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' ||
  (process.env.COOKIE_SECURE !== 'false' && process.env.NODE_ENV === 'production');
const REMEMBER_DAYS = 30;
const SHORT_DAYS = 1;
// A verification/reset link is only returned for an explicitly enabled local
// development flow; production never leaks one in an API response.
const DEV_MODE = process.env.EMAIL_DEV_MODE === 'true';
const LIMITS = { perMinute: 30, perDay: 1000 };

const MAX_USER_PROJECTS = 50;
const MAX_USER_BUILDS = 300;
const MAX_USER_KEYS = 25;
const MAX_KEY_REQUESTS = 100;
const MAX_SOURCE_CHARS = 200000;

const hashPassword = (password, salt) => crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
const verifyPassword = (user, password) => {
  const check = hashPassword(password, user.salt);
  return util.safeEqual(check, user.hash);
};

// ------------------------------------------------------------------ sessions
function sessionFromReq(req) {
  let raw = util.getCookie(req, COOKIE_NAME);
  const h = String(req.headers['authorization'] || '');
  const m = h.match(/^Bearer\s+(df_sess_[0-9a-f]+)$/i);
  if (m) raw = m[1];
  if (!raw) return null;
  const tokenHash = util.sha256(raw);
  const sess = db.find('sessions', (s) => s.tokenHash === tokenHash && !s.revokedAt);
  if (!sess) return null;
  if (Date.parse(sess.expiresAt) <= Date.now()) {
    db.update('sessions', (s) => s.id === sess.id, { revokedAt: new Date().toISOString() });
    return null;
  }
  const user = db.find('users', (u) => u.id === sess.userId && !u.disabled);
  if (!user) return null;
  const now = Date.now();
  if (!sess.lastSeen || now - Date.parse(sess.lastSeen) > 60000) {
    db.update('sessions', (s) => s.id === sess.id, { lastSeen: new Date(now).toISOString() });
  }
  return { session: sess, user: user };
}

function createSession(res, user, remember, req) {
  const raw = 'df_sess_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const days = remember ? REMEMBER_DAYS : SHORT_DAYS;
  db.insert('sessions', {
    id: util.newId('ses'),
    userId: user.id,
    tokenHash: util.sha256(raw),
    remember: !!remember,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + days * 86400000).toISOString(),
    lastSeen: new Date(now).toISOString(),
    ip: util.clientIp(req),
    ua: util.clientUa(req),
    revokedAt: null
  });
  util.setCookie(res, COOKIE_NAME, raw, days * 86400000, SESSION_COOKIE_SECURE);
  return raw;
}

function revokeSession(sessionId) {
  return db.update('sessions', (s) => s.id === sessionId, { revokedAt: new Date().toISOString() });
}

function audit(userId, kind, detail, req) {
  db.insert('securityEvents', {
    id: util.newId('evt'),
    userId: userId || null,
    kind: kind,
    detail: String(detail || '').slice(0, 300),
    ip: req ? util.clientIp(req) : '',
    ua: req ? util.clientUa(req) : '',
    createdAt: new Date().toISOString()
  });
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, createdAt: u.createdAt, disabled: !!u.disabled,
    email: u.email || null, owner: !!u.owner, discordId: u.discordId || null
  };
}

function publicBuild(b) {
  if (!b) return null;
  return {
    id: b.id, projectId: b.projectId || null, projectName: b.projectName || null,
    filename: b.filename, preset: b.preset, target: b.target, status: b.status,
    error: b.error || null, warnings: b.warnings || [], seed: b.seed == null ? null : b.seed,
    inputChars: Number(b.inputChars) || 0, outputChars: Number(b.outputChars) || 0,
    inputSize: Number(b.inputChars) || 0, outputSize: Number(b.outputChars) || 0,
    processingMs: b.ms == null ? null : Number(b.ms), ms: b.ms == null ? null : Number(b.ms),
    vmCount: b.vms == null ? null : Number(b.vms), vms: b.vms == null ? null : Number(b.vms),
    junkStatements: Number(b.junkStatements) || 0, hasSource: !!b.hasSource,
    hasOutput: !!b.hasOutput, createdAt: b.createdAt,
    reparsed: b.status === 'success'
  };
}

function userStats(userId) {
  const builds = db.where('builds', (b) => b.userId === userId);
  let apiRequests = 0;
  for (const k of db.where('apiKeys', (k) => k.userId === userId)) apiRequests += k.total || 0;
  return {
    totalBuilds: builds.length,
    successfulBuilds: builds.filter((b) => b.status === 'success').length,
    failedBuilds: builds.filter((b) => b.status === 'failed').length,
    projects: db.where('projects', (p) => p.userId === userId).length,
    apiRequests: apiRequests
  };
}

// ================================================================ auth routes
async function handleAuth(req, res, sub) {
  if (req.method === 'POST' && sub === '/register') {
    const ip = util.clientIp(req);
    const rl = util.rateCheck('register:' + ip, 5, 20);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'too many registration attempts, try again later', retryAfter: rl.retryAfter });
    const body = util.parseJson(await readBodyP(req)) || {};
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    const confirm = String(body.confirmPassword !== undefined ? body.confirmPassword : password);
    if (!util.USERNAME_RE.test(username)) return sendJson(res, 400, { ok: false, error: 'username must be 3-24 characters: letters, numbers, underscore' });
    const pw = util.passwordProblem(password);
    if (pw) return sendJson(res, 400, { ok: false, error: pw });
    if (confirm !== password) return sendJson(res, 400, { ok: false, error: 'passwords do not match' });
    const lk = username.toLowerCase();
    if (db.find('users', (u) => u.usernameLower === lk)) return sendJson(res, 409, { ok: false, error: 'that username is taken' });
    if (db.users().length >= 50000) return sendJson(res, 503, { ok: false, error: 'signup quota reached' });
    const salt = crypto.randomBytes(16).toString('hex');
    const user = db.insert('users', {
      id: util.newId('usr'), username, usernameLower: lk,
      salt, hash: hashPassword(password, salt),
      disabled: false, createdAt: new Date().toISOString(), settings: db.defaultSettings()
    });
    audit(user.id, 'register', 'account created', req);
    return sendJson(res, 201, { ok: true, username });
  }

  if (req.method === 'POST' && sub === '/login') {
    const ip = util.clientIp(req);
    const rl = util.rateCheck('login:' + ip, 10, 100);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'too many attempts, slow down', retryAfter: rl.retryAfter });
    const body = util.parseJson(await readBodyP(req)) || {};
    const identifier = String(body.username || body.identifier || '').trim().toLowerCase();
    const password = String(body.password || '');
    const remember = !!body.remember;
    const u = db.find('users', (x) => x.usernameLower === identifier);
    if (!u || !verifyPassword(u, password)) {
      if (u) audit(u.id, 'login_failed', 'wrong credentials', req);
      return sendJson(res, 401, { ok: false, error: 'invalid username or password' });
    }
    if (u.disabled) return sendJson(res, 403, { ok: false, error: 'this account is disabled' });
    createSession(res, u, remember, req);
    audit(u.id, 'login', 'signed in', req);
    return sendJson(res, 200, { ok: true, user: publicUser(u) });
  }

  if (req.method === 'POST' && sub === '/key-login') {
    const ip = util.clientIp(req);
    const rl = util.rateCheck('keylogin:' + ip, 10, 50);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'too many attempts, slow down', retryAfter: rl.retryAfter });
    const body = util.parseJson(await readBodyP(req)) || {};
    const raw = String(body.key || '').trim();
    if (!raw) return sendJson(res, 400, { ok: false, error: 'enter your key' });
    const k = db.find('apiKeys', (x) => x.hash === util.sha256(raw) && !x.revokedAt);
    if (!k) { audit(null, 'key_login_failed', raw.slice(0, 13), req); return sendJson(res, 401, { ok: false, error: 'key not recognized' }); }
    const user = db.find('users', (u) => u.id === k.userId && !u.disabled);
    if (!user) return sendJson(res, 401, { ok: false, error: 'key not recognized' });
    createSession(res, user, body.remember !== false, req);
    audit(user.id, 'key_login', k.prefix, req);
    return sendJson(res, 200, { ok: true, user: publicUser(user) });
  }
  if (req.method === 'POST' && sub === '/logout') {
    const sess = sessionFromReq(req);
    if (sess) { revokeSession(sess.session.id); audit(sess.user.id, 'logout', 'signed out', req); }
    util.clearCookie(res, COOKIE_NAME, SESSION_COOKIE_SECURE);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === 'POST' && sub === '/logout-all') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' });
    let n = 0;
    for (const s of db.where('sessions', (s) => s.userId === sess.user.id && !s.revokedAt)) { revokeSession(s.id); n++; }
    util.clearCookie(res, COOKIE_NAME, SESSION_COOKIE_SECURE);
    audit(sess.user.id, 'logout_all', n + ' sessions signed out', req);
    return sendJson(res, 200, { ok: true, revoked: n });
  }

  return null; // not an auth route
}

function readBodyP(req) {
  return new Promise((resolve) => util.readBody(req, resolve));
}

// ============================================================ session routes
async function handlePlatform(req, res, pathname) {
  const auth = requireOrigin(req, res);
  if (auth === false) return true;

  if (pathname === '/api/v1/me' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const settings = sess.user.settings || db.defaultSettings();
    const user = publicUser(sess.user);
    user.settings = settings;
    return sendJson(res, 200, {
      ok: true, user, settings, stats: userStats(sess.user.id)
    }), true;
  }

  if (pathname === '/api/v1/me/profile' && req.method === 'PATCH') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const body = util.parseJson(await readBodyP(req)) || {};
    const username = String(body.username || '').trim();
    if (!util.USERNAME_RE.test(username)) return sendJson(res, 400, { ok: false, error: 'username must be 3-24 characters: letters, numbers, underscore' }), true;
    const lower = username.toLowerCase();
    if (db.find('users', (u) => u.usernameLower === lower && u.id !== sess.user.id)) {
      return sendJson(res, 409, { ok: false, error: 'that username is taken' }), true;
    }
    db.update('users', (u) => u.id === sess.user.id, { username, usernameLower: lower });
    audit(sess.user.id, 'profile_changed', 'username updated', req);
    const updated = db.find('users', (u) => u.id === sess.user.id);
    return sendJson(res, 200, { ok: true, user: publicUser(updated) }), true;
  }

  if (pathname === '/api/v1/me' && req.method === 'PATCH') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const body = util.parseJson(await readBodyP(req)) || {};
    const cur = sess.user.settings || db.defaultSettings();
    const next = sanitizeSettings(body.settings, cur);
    db.update('users', (u) => u.id === sess.user.id, { settings: next });
    return sendJson(res, 200, { ok: true, settings: next }), true;
  }

  if (pathname === '/api/v1/me/password' && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const body = util.parseJson(await readBodyP(req)) || {};
    if (!verifyPassword(sess.user, String(body.current || ''))) return sendJson(res, 401, { ok: false, error: 'current password is wrong' }), true;
    const pw = util.passwordProblem(body.next);
    if (pw) return sendJson(res, 400, { ok: false, error: pw }), true;
    const salt = crypto.randomBytes(16).toString('hex');
    db.update('users', (u) => u.id === sess.user.id, { salt, hash: hashPassword(body.next, salt) });
    let n = 0;
    for (const s of db.where('sessions', (s) => s.userId === sess.user.id && !s.revokedAt && s.id !== sess.session.id)) { revokeSession(s.id); n++; }
    audit(sess.user.id, 'password_changed', 'password changed, other sessions signed out', req);
    return sendJson(res, 200, { ok: true, otherSessionsRevoked: n }), true;
  }

  if (pathname === '/api/v1/me/sessions' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const list = db.where('sessions', (s) => s.userId === sess.user.id && !s.revokedAt && Date.parse(s.expiresAt) > Date.now())
      .map((s) => ({ id: s.id, createdAt: s.createdAt, lastSeen: s.lastSeen, expiresAt: s.expiresAt, ip: s.ip, ua: s.ua, current: s.id === sess.session.id }))
      .sort((a, b) => a.lastSeen < b.lastSeen ? 1 : -1);
    return sendJson(res, 200, { ok: true, sessions: list }), true;
  }

  let m = pathname.match(/^\/api\/v1\/me\/sessions\/([A-Za-z0-9_-]+)$/);
  if (m && req.method === 'DELETE') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const target = db.find('sessions', (s) => s.id === m[1] && s.userId === sess.user.id && !s.revokedAt);
    if (!target) return sendJson(res, 404, { ok: false, error: 'no such session' }), true;
    revokeSession(m[1]);
    audit(sess.user.id, 'session_revoked', 'session ' + m[1], req);
    return sendJson(res, 200, { ok: true }), true;
  }

  if (pathname === '/api/v1/me/security-events' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const events = db.where('securityEvents', (e) => e.userId === sess.user.id)
      .sort((a, b) => a.createdAt < b.createdAt ? 1 : -1).slice(0, 50);
    return sendJson(res, 200, { ok: true, events }), true;
  }

  if (pathname === '/api/v1/me' && req.method === 'DELETE') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const body = util.parseJson(await readBodyP(req)) || {};
    if (!verifyPassword(sess.user, String(body.password || ''))) return sendJson(res, 401, { ok: false, error: 'current password is wrong' }), true;
    const uid = sess.user.id;
    for (const b of db.where('builds', (b) => b.userId === uid)) {
      db.deleteBlob(b.id + '.out'); db.deleteBlob(b.id + '.src');
    }
    db.remove('builds', (b) => b.userId === uid);
    db.remove('projects', (p) => p.userId === uid);
    db.remove('apiKeys', (k) => k.userId === uid);
    db.remove('sessions', (s) => s.userId === uid);
    db.remove('tokens', (t) => t.userId === uid);
    db.remove('securityEvents', (e) => e.userId === uid);
    db.remove('users', (u) => u.id === uid);
    util.clearCookie(res, COOKIE_NAME, SESSION_COOKIE_SECURE);
    return sendJson(res, 200, { ok: true, deleted: true }), true;
  }

  // ------------------------------------------------------------- stats/system
  if (pathname === '/api/v1/stats' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    return sendJson(res, 200, { ok: true, stats: userStats(sess.user.id), version: ENGINE_VERSION }), true;
  }

  if (pathname === '/api/v1/system' && req.method === 'GET') {
    return sendJson(res, 200, { ok: true, system: selfCheck() }), true;
  }

  // ----------------------------------------------------------------- projects
  if (pathname === '/api/v1/projects' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const items = db.where('projects', (p) => p.userId === sess.user.id)
      .sort((a, b) => ((b.lastBuildAt || b.updatedAt) < (a.lastBuildAt || a.updatedAt) ? -1 : 1));
    return sendJson(res, 200, { ok: true, projects: items }), true;
  }
  if (pathname === '/api/v1/projects' && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    if (db.where('projects', (p) => p.userId === sess.user.id).length >= MAX_USER_PROJECTS) {
      return sendJson(res, 503, { ok: false, error: 'project limit reached (' + MAX_USER_PROJECTS + ')' });
    }
    const body = util.parseJson(await readBodyP(req)) || {};
    const optionIssue = validateBuildOptions(body.options);
    if (optionIssue) return sendJson(res, 400, { ok: false, error: optionIssue });
    const name = String(body.name || '').trim();
    if (!name || name.length > 80) return sendJson(res, 400, { ok: false, error: 'project name is required (max 80 chars)' });
    const target = validTarget(body.target) ? body.target : 'roblox';
    const preset = ['lightweight', 'balanced', 'maximum'].indexOf(body.preset) !== -1 ? body.preset : 'maximum';
    const project = db.insert('projects', {
      id: util.newId('prj'), userId: sess.user.id, name, description: String(body.description || '').slice(0, 500),
      target, preset, options: sanitizeOptions(body.options),
      buildCount: 0, lastBuildAt: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    audit(sess.user.id, 'project_created', name, req);
    return sendJson(res, 201, { ok: true, project }), true;
  }
  m = pathname.match(/^\/api\/v1\/projects\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const p = db.find('projects', (x) => x.id === m[1]);
    if (!p || p.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such project' }), true;
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, project: p }), true;
    if (req.method === 'PATCH') {
      const body = util.parseJson(await readBodyP(req)) || {};
      const patch = { updatedAt: new Date().toISOString() };
      if (body.name !== undefined) { const nm = String(body.name).trim(); if (!nm || nm.length > 80) return sendJson(res, 400, { ok: false, error: 'project name is required (max 80 chars)' }); patch.name = nm; }
      if (body.description !== undefined) patch.description = String(body.description).slice(0, 500);
      if (body.target !== undefined && validTarget(body.target)) patch.target = body.target;
      if (body.preset !== undefined && ['lightweight', 'balanced', 'maximum'].indexOf(body.preset) !== -1) patch.preset = body.preset;
      if (body.options !== undefined) {
        const optionIssue = validateBuildOptions(body.options);
        if (optionIssue) return sendJson(res, 400, { ok: false, error: optionIssue }), true;
        patch.options = sanitizeOptions(body.options);
      }
      db.update('projects', (x) => x.id === p.id, patch);
      return sendJson(res, 200, { ok: true, project: db.find('projects', (x) => x.id === p.id) }), true;
    }
    if (req.method === 'DELETE') {
      db.remove('projects', (x) => x.id === p.id);
      db.update('builds', (b) => b.projectId === p.id, { projectId: null });
      audit(sess.user.id, 'project_deleted', p.name, req);
      return sendJson(res, 200, { ok: true }), true;
    }
    return sendJson(res, 405, { ok: false, error: 'method not allowed' }), true;
  }

  // ------------------------------------------------------------------- builds
  if (pathname === '/api/v1/builds' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const q = getQuery(req);
    let items = db.where('builds', (b) => b.userId === sess.user.id);
    if (q.status && ['success', 'failed'].indexOf(q.status) !== -1) items = items.filter((b) => b.status === q.status);
    if (q.preset && ['lightweight', 'balanced', 'maximum'].indexOf(q.preset) !== -1) items = items.filter((b) => b.preset === q.preset);
    if (q.projectId) items = items.filter((b) => b.projectId === q.projectId);
    if (q.from) items = items.filter((b) => Date.parse(b.createdAt) >= Date.parse(q.from));
    if (q.to) items = items.filter((b) => Date.parse(b.createdAt) <= Date.parse(q.to));
    if (q.q) {
      const needle = String(q.q).toLowerCase();
      items = items.filter((b) => (b.filename || '').toLowerCase().includes(needle) || b.id.includes(needle) ||
        (b.projectName || '').toLowerCase().includes(needle));
    }
    items.sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    const total = items.length;
    const limit = Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50));
    const offset = Math.max(0, parseInt(q.offset, 10) || 0);
    return sendJson(res, 200, { ok: true, items: items.slice(offset, offset + limit).map(publicBuild), total }), true;
  }
  if (pathname === '/api/v1/builds' && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const rl = util.rateCheck('build:' + sess.user.id, 10, 300);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'build rate limit exceeded, slow down', retryAfter: rl.retryAfter });
    const body = util.parseJson(await readBodyP(req)) || {};
    return runBuild(req, res, sess, body, null), true;
  }
  m = pathname.match(/^\/api\/v1\/builds\/([A-Za-z0-9_-]+)$/);
  if (m) {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const b = db.find('builds', (x) => x.id === m[1]);
    if (!b || b.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such build' }), true;
    if (req.method === 'GET') return sendJson(res, 200, { ok: true, build: publicBuild(b) }), true;
    if (req.method === 'DELETE') {
      db.deleteBlob(b.id + '.out'); db.deleteBlob(b.id + '.src');
      db.remove('builds', (x) => x.id === b.id);
      return sendJson(res, 200, { ok: true }), true;
    }
    return sendJson(res, 405, { ok: false, error: 'method not allowed' }), true;
  }
  m = pathname.match(/^\/api\/v1\/builds\/([A-Za-z0-9_-]+)\/output$/);
  if (m && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const b = db.find('builds', (x) => x.id === m[1]);
    if (!b || b.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such build' }), true;
    const blob = db.readBlob(b.id + '.out');
    if (!blob) return sendJson(res, 410, { ok: false, error: 'output is no longer stored for this build' });
    const fname = (b.filename || 'build').replace(/[^A-Za-z0-9._-]/g, '_');
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': 'attachment; filename="' + fname.replace(/\.lua|\.luau|\.txt/g, '') + '.protected.lua"',
      'Cache-Control': 'no-store'
    });
    res.end(blob);
    return true;
  }
  m = pathname.match(/^\/api\/v1\/builds\/([A-Za-z0-9_-]+)\/rebuild$/);
  if (m && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const rl = util.rateCheck('build:' + sess.user.id, 10, 300);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'build rate limit exceeded', retryAfter: rl.retryAfter });
    const b = db.find('builds', (x) => x.id === m[1]);
    if (!b || b.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such build' }), true;
    const src = db.readBlob(b.id + '.src');
    if (!src) return sendJson(res, 409, { ok: false, error: 'source was not stored for this build, open the file and build again' });
    return runBuild(req, res, sess, {
      source: src.toString('utf8'), filename: b.filename, projectId: b.projectId || null,
      preset: b.preset, target: b.target, options: sanitizeOptions(b.options), rebuildOf: b.id
    }, b), true;
  }

  // ---------------------------------------------------------------- API keys
  if (pathname === '/api/v1/keys' && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const items = db.where('apiKeys', (k) => k.userId === sess.user.id)
      .map(publicKey).sort((a, b) => a.createdAt < b.createdAt ? 1 : -1);
    return sendJson(res, 200, { ok: true, keys: items }), true;
  }
  if (pathname === '/api/v1/keys' && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'sign in before creating an API key' }), true;
    const rl = util.rateCheck('newkey:' + sess.user.id, 10, 50);
    if (!rl.ok) return sendJson(res, 429, { ok: false, error: 'too many key requests', retryAfter: rl.retryAfter });
    const body = util.parseJson(await readBodyP(req)) || {};
    if (sess) {
      if (db.where('apiKeys', (k) => k.userId === sess.user.id && !k.revokedAt).length >= MAX_USER_KEYS) {
        return sendJson(res, 503, { ok: false, error: 'you already hold ' + MAX_USER_KEYS + ' keys, revoke one first' });
      }
    }
    const raw = 'dk_live_' + crypto.randomBytes(16).toString('hex');
    const rec = db.insert('apiKeys', {
      id: util.newId('key'), userId: sess.user.id, username: sess.user.username,
      prefix: raw.slice(0, 13), name: String(body.name || '').slice(0, 80), hash: util.sha256(raw),
      createdAt: new Date().toISOString(), lastUsed: null, total: 0, revokedAt: null, requests: []
    });
    return sendJson(res, 201, {
      ok: true, id: rec.id, key: raw, name: rec.name, createdAt: rec.createdAt,
      saved: true, limits: LIMITS,
      note: 'Key created and saved to your account. The full key shows once below.'
    }), true;
  }
  m = pathname.match(/^\/api\/v1\/keys\/([A-Za-z0-9_-]+)\/rename$/);
  if (m && req.method === 'POST') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const k = db.find('apiKeys', (x) => x.id === m[1]);
    if (!k || k.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such key' }), true;
    const body = util.parseJson(await readBodyP(req)) || {};
    db.update('apiKeys', (x) => x.id === k.id, { name: String(body.name || '').slice(0, 80) });
    return sendJson(res, 200, { ok: true, key: publicKey(db.find('apiKeys', (x) => x.id === k.id)) }), true;
  }
  m = pathname.match(/^\/api\/v1\/keys\/([A-Za-z0-9_-]+)\/requests$/);
  if (m && req.method === 'GET') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const k = db.find('apiKeys', (x) => x.id === m[1]);
    if (!k || k.userId !== sess.user.id) return sendJson(res, 404, { ok: false, error: 'no such key' }), true;
    return sendJson(res, 200, { ok: true, requests: (k.requests || []).slice(-100).reverse() }), true;
  }
  m = pathname.match(/^\/api\/v1\/keys\/([A-Za-z0-9_-]+)$/);
  if (m && req.method === 'DELETE') {
    const sess = sessionFromReq(req);
    if (!sess) return sendJson(res, 401, { ok: false, error: 'not signed in' }), true;
    const k = db.find('apiKeys', (x) => x.id === m[1]);
    if (!k) return sendJson(res, 404, { ok: false, error: 'no such key' }), true;
    if (k.userId !== sess.user.id) return sendJson(res, 403, { ok: false, error: 'that key belongs to another account' }), true;
    db.update('apiKeys', (x) => x.id === k.id, { revokedAt: new Date().toISOString() });
    audit(sess.user.id, 'key_revoked', k.prefix, req);
    return sendJson(res, 200, { ok: true, revoked: k.id }), true;
  }

  return null; // not handled here
}

function requireOrigin(req, res) {
  // cookie-authed mutations: reject cross-site browsers before any session check
  if (['POST', 'PATCH', 'DELETE'].indexOf(req.method) !== -1) {
    const origin = String(req.headers['origin'] || '');
    if (origin) {
      try {
        const oh = new URL(origin).host;
        const hh = String(req.headers['host'] || '');
        if (oh !== hh) { sendJson(res, 403, { ok: false, error: 'cross-site request blocked' }); return false; }
      } catch (e) { /* malformed origin: ignore, SameSite cookie still guards */ }
    }
  }
  return true;
}

function publicKey(k) {
  return { id: k.id, prefix: k.prefix, name: k.name, createdAt: k.createdAt, lastUsed: k.lastUsed, total: k.total, revokedAt: k.revokedAt };
}

function getQuery(req) {
  const out = {};
  try {
    const qs = (req.url.split('?')[1] || '');
    for (const pair of qs.split('&')) {
      if (!pair) continue;
      const i = pair.indexOf('=');
      out[decodeURIComponent(pair.slice(0, i))] = decodeURIComponent((pair.slice(i + 1) || '').replace(/\+/g, ' '));
    }
  } catch (e) {}
  return out;
}

function validTarget(t) { return t === 'luau' || t === 'roblox'; }

const BUILD_OPTION_RANGES = { vmLayers: [1, 10], junk: [0, 4], guard: [0, 2], antiTamper: [0, 2] };
const BUILD_OPTION_NAMES = new Set(['vmLayers', 'junk', 'guard', 'antiTamper', 'minify', 'watermark', 'captureGlobals', 'compression', 'vmMode', 'ir', 'nameStyle', 'lockPlace', 'lockUniverse', 'seed']);

function validateBuildOptions(o) {
  if (o === undefined || o === null) return null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) return 'options must be a JSON object';
  for (const key of Object.keys(o)) if (!BUILD_OPTION_NAMES.has(key)) return 'unsupported option: ' + key;
  for (const key of Object.keys(BUILD_OPTION_RANGES)) {
    if (o[key] === undefined) continue;
    const n = Number(o[key]); const range = BUILD_OPTION_RANGES[key];
    if (!Number.isInteger(n) || n < range[0] || n > range[1]) return key + ' must be an integer from ' + range[0] + ' to ' + range[1];
  }
  for (const key of ['minify', 'watermark', 'captureGlobals', 'compression']) {
    if (o[key] !== undefined && typeof o[key] !== 'boolean') return key + ' must be true or false';
  }
  if (o.vmMode !== undefined && ['fast', 'balanced', 'secure'].indexOf(o.vmMode) === -1) return 'vmMode must be fast, balanced, or secure';
  if (o.ir !== undefined && ['none', 'fast', 'balanced', 'secure'].indexOf(o.ir) === -1) return 'ir must be none, fast, balanced, or secure';
  if (o.nameStyle !== undefined && ['short', 'random', 'confuse'].indexOf(o.nameStyle) === -1) return 'nameStyle must be short, random, or confuse';
  for (const key of ['lockPlace', 'lockUniverse']) {
    if (o[key] !== undefined && o[key] !== '' && !/^\d+$/.test(String(o[key]))) return key + ' must be a numeric Roblox ID';
  }
  if (o.seed !== undefined && String(o.seed).length > 40) return 'seed is limited to 40 characters';
  return null;
}

function sanitizeOptions(o) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k of Object.keys(BUILD_OPTION_RANGES)) {
    if (o[k] !== undefined) out[k] = Number(o[k]);
  }
  for (const k of ['minify', 'watermark', 'captureGlobals', 'compression']) {
    if (o[k] !== undefined) out[k] = !!o[k];
  }
  if (['fast', 'balanced', 'secure'].indexOf(o.vmMode) !== -1) out.vmMode = o.vmMode;
  if (['none', 'fast', 'balanced', 'secure'].indexOf(o.ir) !== -1) out.ir = o.ir;
  if (['short', 'random', 'confuse'].indexOf(o.nameStyle) !== -1) out.nameStyle = o.nameStyle;
  for (const k of ['lockPlace', 'lockUniverse', 'seed']) {
    if (o[k] !== undefined && o[k] !== '') out[k] = String(o[k]).slice(0, 40);
  }
  return out;
}

function sanitizeSettings(next, cur) {
  const out = cur || db.defaultSettings();
  if (!next || typeof next !== 'object') return out;
  const num = (v, lo, hi, d) => { const n = parseInt(v, 10); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  if (next.appearance) {
    out.appearance = Object.assign({}, out.appearance);
    if (['dark', 'light'].indexOf(next.appearance.theme) !== -1) out.appearance.theme = next.appearance.theme;
    if (['white', 'orange', 'purple', 'green', 'red'].indexOf(next.appearance.accent) !== -1) out.appearance.accent = next.appearance.accent;
    if (next.appearance.compact !== undefined) out.appearance.compact = !!next.appearance.compact;
  }
  if (next.editor) {
    out.editor = Object.assign({}, out.editor);
    if (next.editor.fontSize !== undefined) out.editor.fontSize = num(next.editor.fontSize, 10, 20, 13);
    if (next.editor.tabSize !== undefined) out.editor.tabSize = num(next.editor.tabSize, 2, 8, 4);
    for (const k of ['wordWrap', 'lineNumbers', 'highlighting']) {
      if (next.editor[k] !== undefined) out.editor[k] = !!next.editor[k];
    }
  }
  if (next.obfuscationDefaults) {
    out.obfuscationDefaults = Object.assign({}, out.obfuscationDefaults);
    if (validTarget(next.obfuscationDefaults.target)) out.obfuscationDefaults.target = next.obfuscationDefaults.target;
    if (['lightweight', 'balanced', 'maximum'].indexOf(next.obfuscationDefaults.preset) !== -1) out.obfuscationDefaults.preset = next.obfuscationDefaults.preset;
    if (['none', 'fast', 'balanced', 'secure'].indexOf(next.obfuscationDefaults.ir) !== -1) out.obfuscationDefaults.ir = next.obfuscationDefaults.ir;
    if (['fast', 'balanced', 'secure'].indexOf(next.obfuscationDefaults.vmMode) !== -1) out.obfuscationDefaults.vmMode = next.obfuscationDefaults.vmMode;
    if (next.obfuscationDefaults.compression !== undefined) out.obfuscationDefaults.compression = !!next.obfuscationDefaults.compression;
  }
  if (next.notifications) {
    out.notifications = Object.assign({}, out.notifications);
    for (const k of ['buildCompletion', 'securityAlerts']) {
      if (next.notifications[k] !== undefined) out.notifications[k] = !!next.notifications[k];
    }
  }
  return out;
}

// ============================================================= build runner
function runBuild(req, res, sess, body, rebuildOf) {
  const source = typeof body.source === 'string' ? body.source : '';
  if (!source.trim()) return sendJson(res, 400, { ok: false, error: 'missing "source": paste or load some Luau first' });
  if (source.length > MAX_SOURCE_CHARS) return sendJson(res, 400, { ok: false, error: 'source too large: ' + source.length + ' chars (max ' + MAX_SOURCE_CHARS + ')' });

  const d = sess.user.settings && sess.user.settings.obfuscationDefaults || db.defaultSettings().obfuscationDefaults;
  const optionIssue = validateBuildOptions(body.options);
  if (optionIssue) return sendJson(res, 400, { ok: false, error: optionIssue });
  let project = null;
  if (body.projectId) {
    project = db.find('projects', (p) => p.id === body.projectId && p.userId === sess.user.id);
    if (!project) return sendJson(res, 404, { ok: false, error: 'no such project' });
  }
  if (body.preset !== undefined && ['lightweight', 'balanced', 'maximum'].indexOf(body.preset) === -1) {
    return sendJson(res, 400, { ok: false, error: 'unsupported preset' });
  }
  if (body.target !== undefined && !validTarget(body.target)) {
    return sendJson(res, 400, { ok: false, error: 'unsupported target; supported targets are Luau and Roblox Luau' });
  }
  const projectOptions = project ? sanitizeOptions(project.options) : {};
  const requestOptions = sanitizeOptions(body.options);
  const preset = ['lightweight', 'balanced', 'maximum'].indexOf(body.preset) !== -1 ? body.preset
    : (project && ['lightweight', 'balanced', 'maximum'].indexOf(project.preset) !== -1 ? project.preset
      : (['lightweight', 'balanced', 'maximum'].indexOf(d.preset) !== -1 ? d.preset : 'maximum'));
  const target = validTarget(body.target) ? body.target
    : (project && validTarget(project.target) ? project.target : (validTarget(d.target) ? d.target : 'roblox'));
  const options = Object.assign({}, projectOptions, requestOptions);
  // Roblox Luau defaults to full decoder integrity, not a destructive loader.
  if (target === 'roblox' && options.antiTamper === undefined) options.antiTamper = 2;
  const storeSource = body.storeSource !== false;

  const buildId = util.newId('dfb');
  let result;
  try { result = engine.obfuscate(source, Object.assign({ preset: preset, buildId: buildId }, options)); }
  catch (e) { return sendJson(res, 500, { ok: false, error: 'engine crashed: ' + e.message }); }

  const now = new Date().toISOString();
  // Blob writes are attempted before metadata is made visible. The recorded
  // flags describe what is actually retrievable, never what we hoped to save.
  const sourceStored = storeSource ? db.writeBlob(buildId + '.src', source) : false;
  const outputStored = result.ok ? db.writeBlob(buildId + '.out', result.output) : false;
  const base = {
    id: buildId, userId: sess.user.id, projectId: project ? project.id : null,
    projectName: project ? project.name : null, filename: String(body.filename || 'script.lua').replace(/[^\w .-]/g, '').slice(0, 80) || 'script.lua',
    preset, target, options, status: result.ok ? 'success' : 'failed',
    error: result.ok ? null : result.error, warnings: result.ok ? (result.warnings || []) : [],
    seed: result.ok ? result.stats.seed : null,
    watermark: result.ok ? (result.stats.watermark || null) : null,
    inputChars: source.length, outputChars: result.ok ? result.output.length : 0,
    ms: result.ok ? result.stats.ms : null, vms: result.ok ? result.stats.vms : null,
    junkStatements: result.ok ? (result.stats.junkStatements || 0) : 0,
    hasSource: sourceStored, hasOutput: outputStored,
    createdAt: now
  };
  db.insert('builds', base);
  trimBuilds(sess.user.id);
  if (project) {
    db.update('projects', (x) => x.id === project.id, { buildCount: (project.buildCount || 0) + 1, lastBuildAt: now, updatedAt: now });
  }
  if (base.status === 'failed') {
    const err = base.error || {};
    return sendJson(res, 400, {
      ok: false, buildId: buildId, status: 'failed',
      error: { name: err.name || 'LuauSyntaxError', message: err.message || 'the build failed', line: err.line, col: err.col }
    });
  }
  const saved = db.find('builds', (b) => b.id === buildId) || base;
  return sendJson(res, 200, {
    ok: true, build: publicBuild(saved), buildId: buildId, output: result.output,
    stats: result.stats || {}, warnings: result.warnings || [],
    preset, target, filename: base.filename, version: ENGINE_VERSION
  });
}

function trimBuilds(userId) {
  const items = db.where('builds', (b) => b.userId === userId).sort((a, b) => a.createdAt < b.createdAt ? -1 : 1);
  let over = items.length - MAX_USER_BUILDS;
  for (let i = 0; i < items.length && (over > 0 || items.length - i > MAX_USER_BUILDS); i++) { /* noop guard */ }
  while (items.length > MAX_USER_BUILDS) {
    const oldest = items.shift();
    db.deleteBlob(oldest.id + '.out'); db.deleteBlob(oldest.id + '.src');
    db.remove('builds', (b) => b.id === oldest.id);
  }
}

// ---------------------------------------------------------------- self checks
let selfCheckCache = null;
function selfCheck() {
  if (selfCheckCache) return selfCheckCache;
  let engineOk = false, selfTestMs = 0;
  try {
    const t0 = Date.now();
    const r = engine.obfuscate('print("sys")', { junk: 0, guard: 0, antiTamper: 1, vmMode: 'fast', vmLayers: 1, seed: 1 });
    engineOk = !!(r && r.ok); selfTestMs = Date.now() - t0;
  } catch (e) { engineOk = false; }
  const databaseOk = db.writable();
  selfCheckCache = {
    ok: engineOk && databaseOk,
    engine: { ok: engineOk, version: ENGINE_VERSION, selfTestMs },
    api: { ok: true },
    authentication: { ok: true },
    database: { ok: databaseOk, kind: 'file-store' },
    checkedAt: new Date().toISOString()
  };
  const t = setTimeout(() => { selfCheckCache = null; }, 60000);
  if (t.unref) t.unref();
  return selfCheckCache;
}

// ---------------------------------------------------------------- key helpers
function keyFromReq(req) {
  let candidate = '';
  const h = String(req.headers['authorization'] || '');
  const m = h.match(/^Bearer\s+(\S+)$/i);
  candidate = (m && m[1]) || String(req.headers['x-api-key'] || '').trim();
  if (!candidate || candidate.startsWith('df_sess_')) return null;
  const hash = util.sha256(candidate);
  const k = db.find('apiKeys', (x) => x.hash === hash);
  return k && !k.revokedAt ? k : null;
}

function logKeyRequest(k, pathname, status, ms) {
  k.requests = k.requests || [];
  k.requests.push({ ts: new Date().toISOString(), path: pathname, status, ms });
  if (k.requests.length > MAX_KEY_REQUESTS) k.requests = k.requests.slice(-MAX_KEY_REQUESTS);
}

module.exports = {
  handleAuth, handlePlatform, sessionFromReq, createSession, revokeSession,
  keyFromReq, logKeyRequest, selfCheck, validateBuildOptions, ENGINE_VERSION, LIMITS,
  COOKIE_NAME, SESSION_COOKIE_SECURE
};
