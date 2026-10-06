import AUTH from '../_auth.js';

// POST /api/auth/signup { username, email, password }
// Creates the account, generates its API key, and returns a session cookie.
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var ip = AUTH.clientIp(request);
  var limited = await AUTH.authRateLimit(kv, ip, Date.now());
  if (limited) return AUTH.json({ error: 'Too many requests. Try again in a minute.' }, 429);

  var r = await AUTH.readBody(request);
  if (r.error) return AUTH.json({ error: r.error }, 400);
  var b = r.body || {};
  if (!AUTH.validUsername(b.username)) return AUTH.json({ error: 'Username must be 3-20 characters (letters, numbers, underscore).' }, 400);
  if (!AUTH.validEmail(b.email)) return AUTH.json({ error: 'Enter a valid email address.' }, 400);
  var pw = AUTH.passwordProblem(b.password);
  if (pw) return AUTH.json({ error: pw }, 400);

  var created = await AUTH.createUser(kv, b.username, b.email, b.password, env);
  if (created.error) return AUTH.json({ error: created.error }, 409);

  var token = await AUTH.sessionCreate(kv, created.user.id);
  return AUTH.json({
    ok: true,
    user: { username: created.user.username, email: created.user.email },
    apiKey: created.apiKey,
    note: 'Your API key is also available any time from the dashboard.'
  }, 200, { 'set-cookie': AUTH.sessionCookie(token) });
}
