import AUTH from '../_auth.js';

// POST /api/auth/login { identifier, password }  (identifier = username or email)
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var ip = AUTH.clientIp(request);
  var limited = await AUTH.authRateLimit(kv, ip, Date.now());
  if (limited) return AUTH.json({ error: 'Too many requests. Try again in a minute.' }, 429);

  var r = await AUTH.readBody(request);
  if (r.error) return AUTH.json({ error: r.error }, 400);
  var b = r.body || {};
  if (typeof b.identifier !== 'string' || !b.identifier.trim() || typeof b.password !== 'string') {
    return AUTH.json({ error: 'Enter your username/email and password.' }, 400);
  }

  var user = await AUTH.findUser(kv, b.identifier);
  var ok = false;
  if (user) ok = await AUTH.verifyPassword(b.password, user.passSalt, user.passHash);
  if (!user || !ok) {
    return AUTH.json({ error: 'Invalid username or password.' }, 401);
  }

  var token = await AUTH.sessionCreate(kv, user.id);
  return AUTH.json({ ok: true, user: { username: user.username, email: user.email } }, 200, { 'set-cookie': AUTH.sessionCookie(token) });
}
