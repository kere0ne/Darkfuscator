import DARK from '../../../site/js/obfuscate.js';
import PRESETS_MOD from '../../../site/js/presets.js';
import AUTH from '../_auth.js';

var PRESETS = PRESETS_MOD.PRESETS || PRESETS_MOD;

// POST /api/v1/obfuscate — the public API. Bearer API-key auth, per-key rate
// limits, per-user usage accounting. No cookies, no admin tokens, no trust in
// anything the client claims about itself.
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.apiError('server_config', 'Server storage is not configured.', 500);

  var auth = await requireApiKey(kv, request);
  if (!auth.ok) return auth.response;

  var rl = await AUTH.apiRateLimit(kv, auth.keyHash, Date.now());
  if (rl.limited) {
    await AUTH.usageBump(kv, auth.user, 'limited');
    return AUTH.apiError('rate_limited', 'Rate limit exceeded. Retry later.', 429,
      Object.assign({ 'retry-after': String(rl.retryAfter) }, rl.headers));
  }

  var body = await parseBody(request);
  if (body.error) {
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
    return AUTH.apiError(body.code || 'bad_request', body.error, 400, rl.headers);
  }
  var b = body.body || {};
  if (typeof b.source !== 'string' || !b.source.trim()) {
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
    return AUTH.apiError('bad_request', 'Field "source" (non-empty string) is required.', 400, rl.headers);
  }
  if (b.source.length > AUTH.MAX_SOURCE) {
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(413, 0));
    return AUTH.apiError('payload_too_large', 'Source exceeds the ' + AUTH.MAX_SOURCE + ' character limit on this endpoint.', 413, rl.headers);
  }
  var preset = 'maximum';
  if (b.preset !== undefined && b.preset !== null) {
    if (typeof b.preset !== 'string' || !PRESETS[b.preset]) {
      await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
      return AUTH.apiError('bad_request', 'Unknown preset. Valid presets: lightweight, balanced, maximum.', 400, rl.headers);
    }
    preset = b.preset;
  }
  if (b.options !== undefined && b.options !== null) {
    if (typeof b.options !== 'object' || Array.isArray(b.options)) {
      await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
      return AUTH.apiError('bad_request', '"options" must be an object.', 400, rl.headers);
    }
    if (JSON.stringify(b.options).length > AUTH.MAX_OPTIONS) {
      await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
      return AUTH.apiError('bad_request', '"options" object too large.', 400, rl.headers);
    }
  }
  if (b.seed !== undefined && b.seed !== null && (typeof b.seed !== 'number' || b.seed < 0 || b.seed > 4294967295)) {
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, 0));
    return AUTH.apiError('bad_request', '"seed" must be a number between 0 and 4294967295.', 400, rl.headers);
  }

  var opts = Object.assign({ seed: b.seed }, PRESETS[preset], b.options || {});
  var started = Date.now();
  var res;
  try { res = DARK.obfuscate(b.source, opts); }
  catch (e) {
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(500, Date.now() - started));
    return AUTH.apiError('engine_error', 'Obfuscation failed.', 500, rl.headers);
  }
  if (!res || !res.ok) {
    var msg = (res && res.error && res.error.message) || 'Could not parse the submitted source.';
    await AUTH.usageBump(kv, auth.user, 'failed', failEntry(400, Date.now() - started));
    return AUTH.apiError('invalid_source', msg, 400, rl.headers);
  }

  var took = Date.now() - started;
  await AUTH.usageBump(kv, auth.user, 'success', {
    t: new Date().toISOString(), s: 200, b: res.output.length, d: took, p: preset
  });
  return AUTH.json({
    success: true,
    requestId: 'req_' + AUTH.randHex(8),
    preset: preset,
    bytes: res.output.length,
    durationMs: took,
    result: res.output
  }, 200, rl.headers);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: AUTH.CORS });
}

export async function onRequestGet() {
  return AUTH.json({
    name: 'Darkfuscator API v1',
    docs: '/docs',
    endpoints: {
      'POST /api/v1/obfuscate': {
        auth: 'Authorization: Bearer YOUR_API_KEY',
        body: { source: 'string (required)', preset: 'lightweight | balanced | maximum (default maximum)', seed: 'number, optional', options: 'object, optional' },
        returns: '{ success, requestId, preset, bytes, durationMs, result }'
      },
      'GET /api/v1/health': 'liveness + version, no auth'
    },
    errors: '400 bad request, 401 missing/invalid key, 413 source too large, 429 rate limited, 500 engine error'
  });
}

// ---- shared bits ------------------------------------------------------------
async function requireApiKey(kv, request) {
  var h = request.headers.get('authorization') || '';
  var m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) {
    return { ok: false, response: AUTH.apiError('unauthorized', 'Missing API key. Send "Authorization: Bearer YOUR_API_KEY".', 401, AUTH.CORS) };
  }
  var found = await AUTH.keyResolve(kv, m[1].trim());
  if (!found) {
    return { ok: false, response: AUTH.apiError('unauthorized', 'Invalid or revoked API key.', 401, AUTH.CORS) };
  }
  return { ok: true, user: found.user, keyHash: found.keyHash };
}

async function parseBody(request) {
  var len = parseInt(request.headers.get('content-length') || '0', 10);
  if (len > 1200000) return { error: 'Request body too large.', code: 'payload_too_large' };
  try {
    var t = await request.text();
    if (t.length > 1200000) return { error: 'Request body too large.', code: 'payload_too_large' };
    return { body: JSON.parse(t) };
  } catch (e) { return { error: 'Invalid JSON body.' }; }
}

function failEntry(status, ms) {
  return { t: new Date().toISOString(), s: status, d: ms || 0 };
}
