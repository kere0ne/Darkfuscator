import AUTH from '../_auth.js';

// POST /api/auth/logout — destroys the current session.
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (kv) await AUTH.sessionDestroy(kv, request);
  return AUTH.json({ ok: true }, 200, { 'set-cookie': AUTH.sessionCookie('', true) });
}
