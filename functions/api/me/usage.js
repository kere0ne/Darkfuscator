import AUTH from '../_auth.js';

// GET /api/me/usage — detailed usage for the signed-in user.
export async function onRequestGet({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var s = await AUTH.sessionUser(kv, env, request);
  if (!s) return AUTH.json({ error: 'Not signed in.' }, 401);
  var u = s.user;
  return AUTH.json({
    ok: true,
    usage: u.usage || { total: 0, success: 0, failed: 0, limited: 0 },
    limits: { perMinute: AUTH.RL_PER_MINUTE, perDay: AUTH.RL_PER_DAY },
    recent: u.recent || [],
    lastUsed: u.keyLastUsed || null
  });
}
