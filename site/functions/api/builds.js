import lib from './_lib.js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// POST /api/builds — register a build (dashboard publish). Admin only.
export async function onRequestPost({ request, env }) {
  if (!lib.authed(env, request)) return json({ error: 'not authorized' }, 401);
  const body = await lib.readJson(request);
  if (!body || typeof body.payload !== 'string' || !body.payload.trim()) {
    return json({ error: 'payload required' }, 400);
  }
  if (body.payload.length > lib.MAX_PAYLOAD) return json({ error: 'payload too large' }, 413);

  const now = Date.now();
  const id = lib.genId();
  const token = lib.genToken();
  const build = {
    id: id,
    token: token,
    payload: body.payload,
    created: now,
    expires: (typeof body.expires === 'number') ? body.expires : null,
    revoked: false,
    redirect: (typeof body.redirect === 'string' && body.redirect.length <= 500) ? body.redirect : '',
    responses: lib.sanitizeResponses(body.responses),
    total: 0,
    last: null
  };
  await env.DARKFUSCATOR_KV.put('build:' + id, JSON.stringify(build));

  const origin = new URL(request.url).origin;
  return json({ id, token, created: now, loader: lib.loaderCode(id, token, origin) }, 201);
}

// GET /api/builds — list all builds with activity summaries. Admin only.
export async function onRequestGet({ request, env }) {
  if (!lib.authed(env, request)) return json({ error: 'not authorized' }, 401);
  const list = await env.DARKFUSCATOR_KV.list({ prefix: 'build:' });
  const now = Date.now();
  const out = [];
  for (const k of list.keys) {
    const raw = await env.DARKFUSCATOR_KV.get(k.name);
    if (!raw) continue;
    let b;
    try { b = JSON.parse(raw); } catch (e) { continue; }
    const logs = JSON.parse((await env.DARKFUSCATOR_KV.get('logs:' + b.id)) || '[]');
    out.push({
      id: b.id,
      created: b.created || null,
      expires: b.expires || null,
      revoked: !!b.revoked,
      total: b.total || 0,
      last: b.last || null,
      last24: logs.filter(function (e) { return e.t >= now - 86400000; }).length,
      status: lib.assess(b, b.token, now)
    });
  }
  out.sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
  return json({ builds: out });
}
