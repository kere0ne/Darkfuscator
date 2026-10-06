import DARK from '../../../site/js/obfuscate.js';
import PRESETS_MOD from '../../../site/js/presets.js';
import AUTH from '../_auth.js';

var PRESETS = PRESETS_MOD.PRESETS || PRESETS_MOD;
var MAX_SOURCE = 200000;

// POST /api/v1/protect — authenticated alias of /api/v1/obfuscate (kept for
// early integrators). Same Bearer API-key auth, rate limits and usage logs.
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.apiError('server_config', 'Server storage is not configured.', 500, AUTH.CORS);

  var h = request.headers.get('authorization') || '';
  var m = /^Bearer\s+(.+)$/i.exec(h);
  if (!m) return AUTH.apiError('unauthorized', 'Missing API key. Send "Authorization: Bearer YOUR_API_KEY".', 401, AUTH.CORS);
  var found = await AUTH.keyResolve(kv, m[1].trim());
  if (!found) return AUTH.apiError('unauthorized', 'Invalid or revoked API key.', 401, AUTH.CORS);

  var rl = await AUTH.apiRateLimit(kv, found.keyHash, Date.now());
  if (rl.limited) {
    await AUTH.usageBump(kv, found.user, 'limited');
    return AUTH.apiError('rate_limited', 'Rate limit exceeded. Retry later.', 429, Object.assign({ 'retry-after': String(rl.retryAfter) }, rl.headers));
  }

  var body;
  try { body = await request.json(); } catch (e) { return AUTH.apiError('bad_request', 'invalid JSON body', 400, rl.headers); }
  if (!body || typeof body.source !== 'string' || !body.source.trim()) {
    await AUTH.usageBump(kv, found.user, 'failed', { t: new Date().toISOString(), s: 400, d: 0 });
    return AUTH.apiError('bad_request', 'string field "source" required', 400, rl.headers);
  }
  if (body.source.length > MAX_SOURCE) {
    await AUTH.usageBump(kv, found.user, 'failed', { t: new Date().toISOString(), s: 413, d: 0 });
    return AUTH.apiError('payload_too_large', 'source too large: ' + MAX_SOURCE + ' byte max on /v1/protect', 413, rl.headers);
  }
  var preset = body.preset || 'balanced';
  if (!PRESETS[preset]) {
    await AUTH.usageBump(kv, found.user, 'failed', { t: new Date().toISOString(), s: 400, d: 0 });
    return AUTH.apiError('bad_request', 'unknown preset "' + preset + '" (lightweight | balanced | maximum)', 400, rl.headers);
  }
  var opts = Object.assign({ seed: body.seed }, PRESETS[preset], body.options || {});
  var started = Date.now();
  var res;
  try { res = DARK.obfuscate(body.source, opts); }
  catch (e) {
    await AUTH.usageBump(kv, found.user, 'failed', { t: new Date().toISOString(), s: 500, d: Date.now() - started });
    return AUTH.apiError('engine_error', 'obfuscation failed', 500, rl.headers);
  }
  if (!res || !res.ok) {
    await AUTH.usageBump(kv, found.user, 'failed', { t: new Date().toISOString(), s: 400, d: Date.now() - started });
    return AUTH.apiError('invalid_source', (res && res.error && res.error.message) || 'obfuscation failed', 400, rl.headers);
  }
  await AUTH.usageBump(kv, found.user, 'success', {
    t: new Date().toISOString(), s: 200, b: res.output.length, d: Date.now() - started, p: preset
  });
  return AUTH.json({ ok: true, preset: preset, output: res.output, bytes: res.output.length }, 200, rl.headers);
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: AUTH.CORS });
}

// GET /v1/protect — self-describing usage document.
export async function onRequestGet() {
  return AUTH.json({
    name: 'Darkfuscator /v1',
    version: '5.1.0',
    docs: '/docs',
    endpoints: {
      'POST /v1/protect': {
        auth: 'Authorization: Bearer YOUR_API_KEY (alias of POST /api/v1/obfuscate)',
        body: {
          source: 'string, Luau source (required)',
          preset: 'lightweight | balanced | maximum',
          seed: 'number, optional; deterministic builds',
          options: 'object, optional engine option overrides'
        },
        returns: '{ ok, preset, output, bytes }',
        errors: '401 missing/invalid key, 400 bad source/preset, 413 too large, 429 rate limited, 500 engine error'
      },
      'GET /v1/health': 'liveness + version'
    }
  }, 200, AUTH.CORS);
}
