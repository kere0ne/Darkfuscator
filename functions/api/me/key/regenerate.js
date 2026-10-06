import AUTH from '../../_auth.js';

// POST /api/me/key/regenerate — rotates the signed-in user's API key.
// The old key is deleted from the lookup table immediately, so it stops
// working at once. The new plaintext key is returned once, in this response.
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var s = await AUTH.sessionUser(kv, env, request);
  if (!s) return AUTH.json({ error: 'Not signed in.' }, 401);
  var ip = AUTH.clientIp(request);
  var limited = await AUTH.authRateLimit(kv, ip, Date.now());
  if (limited) return AUTH.json({ error: 'Too many requests. Try again in a minute.' }, 429);

  var newKey = await AUTH.keyRotate(kv, env, s.user);
  return AUTH.json({
    ok: true,
    apiKey: newKey,
    note: 'Store this key now. The previous key was invalidated and is no longer usable.'
  });
}
