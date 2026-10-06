import AUTH from '../_auth.js';

// POST /api/auth/account — account settings actions, all require the current password.
// { action: 'password' | 'email' | 'username', currentPassword, value }
export async function onRequestPost({ request, env }) {
  var kv = env.DARKFUSCATOR_KV;
  if (!kv) return AUTH.json({ error: 'Server storage is not configured.' }, 500);
  var s = await AUTH.sessionUser(kv, env, request);
  if (!s) return AUTH.json({ error: 'Not signed in.' }, 401);
  var ip = AUTH.clientIp(request);
  var limited = await AUTH.authRateLimit(kv, ip, Date.now());
  if (limited) return AUTH.json({ error: 'Too many requests. Try again in a minute.' }, 429);

  var r = await AUTH.readBody(request);
  if (r.error) return AUTH.json({ error: r.error }, 400);
  var b = r.body || {};
  var u = s.user;
  var ok = await AUTH.verifyPassword(String(b.currentPassword || ''), u.passSalt, u.passHash);
  if (!ok) return AUTH.json({ error: 'Current password is incorrect.' }, 401);

  var action = b.action;
  if (action === 'password') {
    var pw = AUTH.passwordProblem(b.value);
    if (pw) return AUTH.json({ error: pw }, 400);
    var h = await AUTH.hashPassword(b.value);
    u.passSalt = h.salt; u.passHash = h.hash; u.passIter = h.iterations;
    await AUTH.userSave(kv, u);
    return AUTH.json({ ok: true, message: 'Password updated.' });
  }
  if (action === 'email') {
    if (!AUTH.validEmail(b.value)) return AUTH.json({ error: 'Enter a valid email address.' }, 400);
    var e = b.value.trim().toLowerCase();
    if (e === u.email) return AUTH.json({ ok: true, message: 'That is already your email.' });
    var existing = await kv.get('email:' + e);
    if (existing) return AUTH.json({ error: 'An account with this email already exists.' }, 409);
    await Promise.all([kv.put('email:' + e, u.id), kv.delete('email:' + u.email)]);
    u.email = e;
    await AUTH.userSave(kv, u);
    return AUTH.json({ ok: true, message: 'Email updated.' });
  }
  if (action === 'username') {
    if (!AUTH.validUsername(b.value)) return AUTH.json({ error: 'Username must be 3-20 characters (letters, numbers, underscore).' }, 400);
    var nu = b.value.trim();
    if (nu.toLowerCase() === u.usernameLower) return AUTH.json({ ok: true, message: 'That is already your username.' });
    var existingU = await kv.get('uname:' + nu.toLowerCase());
    if (existingU) return AUTH.json({ error: 'This username is already taken.' }, 409);
    await Promise.all([kv.put('uname:' + nu.toLowerCase(), u.id), kv.delete('uname:' + u.usernameLower)]);
    u.username = nu; u.usernameLower = nu.toLowerCase();
    await AUTH.userSave(kv, u);
    return AUTH.json({ ok: true, message: 'Username updated.' });
  }
  return AUTH.json({ error: 'Unknown action. Use password, email or username.' }, 400);
}
