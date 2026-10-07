'use strict';
/* util.js — http + crypto helpers shared by the platform server. */
const crypto = require('crypto');

const MAX_BODY_BYTES = 512 * 1024;

function sendJson(res, status, obj, extraHeaders) {
  const body = JSON.stringify(obj);
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
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

function parseJson(raw) {
  if (raw === null) return null;
  try { return JSON.parse(raw); } catch (e) { return undefined; }
}

function newId(prefix) {
  return (prefix ? prefix + '_' : '') + crypto.randomBytes(9).toString('hex');
}

function newToken(raw) {
  return crypto.randomBytes(24).toString('hex');
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function corsHeaders(keyAuthed) {
  // key-authed third-party callers keep open CORS; cookie-authed browser
  // routes never get ACAO, so cross-origin sites cannot ride a session
  if (keyAuthed) return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-API-Key, Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  return {};
}

// ---------------------------------------------------------------- rate limiting
const buckets = new Map(); // scope -> {min, day, minCount, dayCount}
function rateCheck(scope, perMinute, perDay) {
  const now = Date.now();
  const min = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  let b = buckets.get(scope);
  if (!b || b.min !== min || b.day !== day) {
    b = { min, minCount: 0, day: (b && b.day === day) ? b.day : day, dayCount: (b && b.day === day) ? b.dayCount : 0 };
    buckets.set(scope, b);
  }
  if (perMinute && b.minCount >= perMinute) {
    return { ok: false, retryAfter: 60 - Math.floor((now % 60000) / 1000), scope: 'minute' };
  }
  if (perDay && b.dayCount >= perDay) {
    return { ok: false, retryAfter: Math.ceil(((day + 1) * 86400000 - now) / 1000), scope: 'day' };
  }
  b.minCount++; b.dayCount++;
  return { ok: true };
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,24}$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,24}$/;

function validateEmail(email) {
  return EMAIL_RE.test(String(email || '')) && String(email).length <= 254;
}

function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'password must be at least 8 characters';
  if (p.length > 128) return 'password must be at most 128 characters';
  if (!/[A-Za-z]/.test(p)) return 'password must contain a letter';
  if (!/[0-9]/.test(p)) return 'password must contain a number';
  return null;
}

// ------------------------------------------------------------------- cookies
function setCookie(res, name, value, maxAgeSec, secure) {
  const parts = [name + '=' + value, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=' + maxAgeSec];
  if (secure) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  const arr = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
  arr.push(parts.join('; '));
  res.setHeader('Set-Cookie', arr);
}

function clearCookie(res, name, secure) {
  setCookie(res, name, '', 0, secure);
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const pair of raw.split(/; */)) {
    const i = pair.indexOf('=');
    if (i > 0 && pair.slice(0, i) === name) return decodeURIComponent(pair.slice(i + 1));
  }
  return null;
}

function clientIp(req) {
  const xf = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xf || req.socket.remoteAddress || 'unknown';
}

function clientUa(req) {
  return String(req.headers['user-agent'] || '').slice(0, 160);
}

module.exports = {
  sendJson, readBody, parseJson, newId, newToken, sha256, safeEqual,
  corsHeaders, rateCheck, EMAIL_RE, USERNAME_RE, validateEmail,
  passwordProblem, setCookie, clearCookie, getCookie, clientIp, clientUa,
  MAX_BODY_BYTES
};
