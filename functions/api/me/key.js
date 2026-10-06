import AUTH from '../_auth.js';

// GET /api/me/key — the signed-in user's own key: masked by default, plus
// created/last-used, usage counters and current rate-limit window state.
export async function onRequestGet({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var s = await AUTH.sessionUser(kv, env, request);
  if (!s) return AUTH.json({ error: 'Not signed in.' }, 401);
  var u = s.user;
  var plain = await AUTH.decryptString(env, u.keyEnc);
  return AUTH.json({
    ok: true,
    key: plain ? AUTH.maskKey(plain) : null,
    full: plain || null,          // only ever returned to the key's own owner
    createdAt: u.keyCreatedAt || null,
    lastUsed: u.keyLastUsed || null,
    usage: u.usage || { total: 0, success: 0, failed: 0, limited: 0 },
    limits: { perMinute: AUTH.RL_PER_MINUTE, perDay: AUTH.RL_PER_DAY }
  });
}
