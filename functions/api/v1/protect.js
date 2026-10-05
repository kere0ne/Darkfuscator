import DARK from '../../../js/obfuscate.js';
import PRESETS_MOD from '../../../js/presets.js';
var PRESETS = PRESETS_MOD.PRESETS || PRESETS_MOD;

// CPU-safety cap for the serverless build: protect requests larger than this
// are refused (the web UI and CLI have no such limit).
var MAX_SOURCE = 200000;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// POST /v1/protect — obfuscate a Luau source string, return the VM build.
export async function onRequestPost({ request }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'invalid JSON body' }, 400); }
  if (!body || typeof body.source !== 'string' || !body.source.trim()) {
    return json({ error: 'string field "source" required' }, 400);
  }
  if (body.source.length > MAX_SOURCE) {
    return json({ error: 'source too large: ' + MAX_SOURCE + ' byte max on /v1/protect' }, 413);
  }
  if (body.preset && !PRESETS[body.preset]) {
    return json({ error: 'unknown preset "' + body.preset + '" (lightweight | balanced | maximum)' }, 400);
  }
  var preset = body.preset || 'balanced';
  var opts = Object.assign({ seed: body.seed }, PRESETS[preset], body.options || {});
  var res;
  try { res = DARK.obfuscate(body.source, opts); }
  catch (e) { return json({ error: 'engine error: ' + ((e && e.message) || 'unknown') }, 500); }
  if (!res.ok) {
    return json({ error: (res.error && res.error.message) || 'obfuscation failed', detail: res.error }, 400);
  }
  return json({ ok: true, preset: preset, output: res.output, bytes: res.output.length });
}

// GET /v1/protect — self-describing usage document.
export async function onRequestGet() {
  return json({
    name: 'Darkfuscator /v1',
    version: '4.8.0',
    endpoints: {
      'POST /v1/protect': {
        body: {
          source: 'string, Luau source (required)',
          preset: 'lightweight | balanced | maximum (default balanced)',
          seed: 'number, optional; deterministic builds',
          options: 'object, optional engine option overrides'
        },
        returns: '{ ok, preset, output, bytes }',
        errors: '400 bad source/preset, 413 too large, 500 engine error'
      },
      'GET /v1/health': 'liveness + version'
    }
  });
}
