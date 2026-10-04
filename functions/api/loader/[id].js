import lib from './_lib.js';

// The runtime endpoint loaders call. NOT admin-authenticated: the loader
// authenticates with its per-build token (x-dark-token header or ?t=).
async function handle({ request, env, params }) {
  const id = params.id;
  const url = new URL(request.url);
  const token = request.headers.get('x-dark-token') || url.searchParams.get('t') || '';
  const ua = request.headers.get('user-agent') || '';
  const cc = request.headers.get('cf-ipcountry') || '';
  const now = Date.now();

  let build = null;
  const raw = await env.DARKFUSCATOR_KV.get('build:' + id);
  if (raw) {
    try { build = JSON.parse(raw); } catch (e) { build = null; }
  }

  const state = lib.assess(build, token, now);

  if (build) {
    build.total = (build.total || 0) + 1;
    build.last = now;
    await env.DARKFUSCATOR_KV.put('build:' + id, JSON.stringify(build));
  }
  await lib.logRequest(env.DARKFUSCATOR_KV, id, {
    t: now, s: state, ua: String(ua).slice(0, 120), cc: cc || ''
  });

  if (state === 'valid') {
    return new Response(build.payload, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
    });
  }
  const r = lib.resolveResponse(build, state);
  return new Response(r.body, {
    status: r.status,
    headers: Object.assign(
      { 'content-type': r.contentType, 'cache-control': 'no-store' },
      r.headers || {}
    )
  });
}

export async function onRequestPost(ctx) { return handle(ctx); }
export async function onRequestGet(ctx) { return handle(ctx); }
