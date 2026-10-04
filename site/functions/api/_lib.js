'use strict';

// Darkfuscator connected-loader library. Shared by the Pages Functions and
// the Node test harness. Storage: KV binding DARKFUSCATOR_KV.
// Auth: env.ADMIN_TOKEN compared against the x-admin-token request header.

var CRYPTO = globalThis.crypto;
if (!CRYPTO) {
  try { CRYPTO = require('crypto').webcrypto; } catch (e) { /* test harness supplies its own */ }
}

var ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var HEX = '0123456789abcdef';
var LOG_CAP = 200;
var MAX_PAYLOAD = 2500000;

function rand(n) {
  var b = new Uint8Array(n);
  CRYPTO.getRandomValues(b);
  return b;
}

function genId() {
  var b = rand(10), s = '', i;
  for (i = 0; i < b.length; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return 'DK-' + s.slice(0, 5) + '-' + s.slice(5);
}

function genToken() {
  var b = rand(20), s = '', i;
  for (i = 0; i < b.length; i++) { s += HEX[b[i] >> 4]; s += HEX[b[i] & 15]; }
  return s;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function page(title, heading, body, accent) {
  accent = accent || '#ff7a1a';
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<meta name="robots" content="noindex">\n'
    + '<title>' + esc(title) + '</title>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">\n'
    + '<style>'
    + 'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0b0608;color:#f5eee8;font-family:"DM Sans",sans-serif}'
    + '.p{max-width:520px;text-align:center;padding:48px 32px;border:1px solid #2a1a12;border-radius:16px;background:#140b10}'
    + '.code{font-size:56px;font-weight:700;color:' + accent + ';margin-bottom:8px}'
    + '.h{font-size:20px;font-weight:700;margin-bottom:10px}'
    + '.b{font-size:14px;line-height:1.6;color:#b9a99e}'
    + '.f{margin-top:22px;font-size:11px;color:#6b5a52}'
    + '</style>\n</head>\n<body>\n<div class="p">\n'
    + '<div class="code">' + esc(heading) + '</div>\n'
    + '<div class="b">' + body + '</div>\n'
    + '<div class="f">Darkfuscator</div>\n</div>\n</body>\n</html>';
}

var DEFAULT_RESPONSES = {
  invalid:      { status: 404, body: page('404 · Darkfuscator', '404', 'This loader does not exist.<br>If you believe this is a mistake, contact the script owner.') },
  expired:      { status: 410, body: page('410 · Loader expired', '410', 'This loader has expired.<br>Contact the script owner for an updated version.', '#ffb347') },
  revoked:      { status: 403, body: page('403 · Loader revoked', '403', 'This loader has been revoked by its owner.', '#ff5a5a') },
  unauthorized: { status: 403, body: page('403 · Unauthorized', '403', 'This request is not authorized to use this loader.', '#ff5a5a') }
};

var STATES = ['invalid', 'expired', 'revoked', 'unauthorized'];

function sanitizeResponses(input) {
  var out = {}, i, st, src;
  for (i = 0; i < STATES.length; i++) {
    st = STATES[i];
    src = input && input[st];
    out[st] = {
      status: (src && typeof src.status === 'number' && src.status >= 100 && src.status <= 599)
        ? Math.floor(src.status) : DEFAULT_RESPONSES[st].status,
      body: (src && typeof src.body === 'string' && src.body.length <= 200000 && src.body.trim() !== '')
        ? src.body : DEFAULT_RESPONSES[st].body
    };
  }
  return out;
}

// The one place loader state is decided. Returns a state name.
function assess(build, token, now) {
  if (!build) return 'invalid';
  if (build.revoked) return 'revoked';
  if (build.expires && now > build.expires) return 'expired';
  if (build.token !== token) return 'unauthorized';
  return 'valid';
}

function resolveResponse(build, state) {
  if (state === 'unauthorized' && build && build.redirect) {
    return { status: 302, contentType: 'text/html; charset=utf-8', body: '', headers: { location: build.redirect } };
  }
  var cfg = (build && build.responses && build.responses[state]) || DEFAULT_RESPONSES[state];
  return { status: cfg.status, contentType: 'text/html; charset=utf-8', body: cfg.body };
}

function logRequest(kv, id, entry) {
  return kv.get('logs:' + id).then(function (raw) {
    var logs = [];
    try { logs = JSON.parse(raw || '[]') || []; } catch (e) { logs = []; }
    logs.push(entry);
    if (logs.length > LOG_CAP) logs = logs.slice(-LOG_CAP);
    return kv.put('logs:' + id, JSON.stringify(logs));
  });
}

function authed(env, request) {
  var t = env && env.ADMIN_TOKEN;
  if (!t) return false;
  return (request.headers.get('x-admin-token') || '') === t;
}

function readJson(request) {
  return request.json().catch(function () { return null; });
}

function loaderCode(id, token, base) {
  base = String(base || 'https://darkfuscator.pages.dev').replace(/\/+$/, '');
  var url = base + '/api/loader/' + id;
  var h = Math.floor(url.length / 2);
  var t = Math.floor(token.length / 2);
  return [
    '-- Darkfuscator connected loader ' + id,
    'local _u = { "' + url.slice(0, h) + '", "' + url.slice(h) + '" }',
    'local _k = { "' + token.slice(0, t) + '", "' + token.slice(t) + '" }',
    'local _r = http_request or request or (syn and syn.request) or (http and http.request)',
    'local _h = game and game.GetService and game:GetService("HttpService")',
    'if not _r and not _h then return end',
    'local _ok, _res',
    'if _r then',
    '  _ok, _res = pcall(_r, { Url = _u[1] .. _u[2], Method = "POST", Headers = { ["x-dark-token"] = _k[1] .. _k[2] }, Body = "" })',
    'else',
    '  _ok, _res = pcall(function() return _h:RequestAsync({ Url = _u[1] .. _u[2], Method = "POST", Headers = { ["x-dark-token"] = _k[1] .. _k[2] }, Body = "" }) end)',
    'end',
    'if not _ok or not _res or (_res.StatusCode or _res.code or 0) ~= 200 then return end',
    'local _src = _res.Body or _res.body',
    'local _f = (loadstring or load)(_src)',
    'if type(_f) == "function" then _f() end'
  ].join('\n');
}

module.exports = {
  ALPHABET: ALPHABET, LOG_CAP: LOG_CAP, MAX_PAYLOAD: MAX_PAYLOAD,
  genId: genId, genToken: genToken, esc: esc, page: page,
  DEFAULT_RESPONSES: DEFAULT_RESPONSES, STATES: STATES,
  sanitizeResponses: sanitizeResponses, assess: assess,
  resolveResponse: resolveResponse, logRequest: logRequest,
  authed: authed, readJson: readJson, loaderCode: loaderCode
};
