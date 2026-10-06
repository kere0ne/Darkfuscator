import AUTH from '../_auth.js';

// GET /api/auth/me — session check + account + API key summary for the dashboard.
export async function onRequestGet({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var s = await AUTH.sessionUser(kv, env, request);
  if (!s) return AUTH.json({ error: 'Not signed in.' }, 401);
  var u = s.user;
  var keyInfo = await keySummary(env, kv, u);
  return AUTH.json({
    ok: true,
    user: { username: u.username, email: u.email, createdAt: u.createdAt },
    apiKey: keyInfo
  });
}

export async function keySummary(env, kv, u) {
  var plain = await AUTH.decryptString(env, u.keyEnc);
  var rlNow = Date.now();
  return {
    masked: plain ? AUTH.maskKey(plain) : null,
    createdAt: u.keyCreatedAt || null,
    lastUsed: u.keyLastUsed || null,
    usage: u.usage || { total: 0, success: 0, failed: 0, limited: 0 },
    limits: { perMinute: AUTH.RL_PER_MINUTE, perDay: AUTH.RL_PER_DAY }
  };
}
