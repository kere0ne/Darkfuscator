import lib from './_lib.js';

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

// GET /api/builds/:id — full build detail + recent request log. Admin only.
export async function onRequestGet({ request, env, params }) {
  if (!lib.authed(env, request)) return json({ error: 'not authorized' }, 401);
  const raw = await env.DARKFUSCATOR_KV.get('build:' + params.id);
  if (!raw) return json({ error: 'not found' }, 404);
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json({ error: 'corrupt build' }, 500); }
  const logs = JSON.parse((await env.DARKFUSCATOR_KV.get('logs:' + params.id)) || '[]');
  const origin = new URL(request.url).origin;
  const detail = {
    id: b.id,
    created: b.created || null,
    expires: b.expires || null,
    revoked: !!b.revoked,
    redirect: b.redirect || '',
    responses: lib.sanitizeResponses(b.responses),
    total: b.total || 0,
    last: b.last || null,
    status: lib.assess(b, b.token, Date.now()),
    hasPayload: !!b.payload
  };
  return json({ build: detail, token: b.token, loader: lib.loaderCode(b.id, b.token, origin), logs: logs.slice(-100).reverse() });
}

// PUT /api/builds/:id — update responses, expiry, revocation, redirect. Admin only.
export async function onRequestPut({ request, env, params }) {
  if (!lib.authed(env, request)) return json({ error: 'not authorized' }, 401);
  const raw = await env.DARKFUSCATOR_KV.get('build:' + params.id);
  if (!raw) return json({ error: 'not found' }, 404);
  let b;
  try { b = JSON.parse(raw); } catch (e) { return json({ error: 'corrupt build' }, 500); }
  const body = await lib.readJson(request);
  if (!body) return json({ error: 'bad body' }, 400);
  if ('expires' in body) b.expires = (typeof body.expires === 'number') ? body.expires : null;
  if ('revoked' in body) b.revoked = !!body.revoked;
  if ('redirect' in body) b.redirect = (typeof body.redirect === 'string' && body.redirect.length <= 500) ? body.redirect : '';
  if ('responses' in body) b.responses = lib.sanitizeResponses(body.responses);
  await env.DARKFUSCATOR_KV.put('build:' + params.id, JSON.stringify(b));
  return json({ ok: true });
}

// DELETE /api/builds/:id — remove the build and its log. Admin only.
export async function onRequestDelete({ request, env, params }) {
  if (!lib.authed(env, request)) return json({ error: 'not authorized' }, 401);
  await env.DARKFUSCATOR_KV.delete('build:' + params.id);
  await env.DARKFUSCATOR_KV.delete('logs:' + params.id);
  return json({ ok: true });
}
