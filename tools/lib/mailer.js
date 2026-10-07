'use strict';
/* mailer.js — email via the configured provider (Resend API), with honest
 * behavior when no provider is set: nothing is sent and nothing pretends to
 * send. Credentials come from the server environment only.
 *
 *   RESEND_API_KEY    api key from resend.com
 *   MAIL_FROM         e.g. "Darkfuscator <noreply@darkfuscator.duckdns.org>"
 *   BASE_URL          public base used in email links
 *   EMAIL_DEV_MODE    when 'false', dev links never appear in API responses
 */
const BASE_URL = (process.env.BASE_URL || 'https://darkfuscator.onrender.com').replace(/\/+$/, '');
const MAIL_FROM = process.env.MAIL_FROM || 'Darkfuscator <onboarding@resend.dev>';

function providerConfigured() {
  return !!process.env.RESEND_API_KEY;
}

async function deliver(to, subject, html) {
  if (!providerConfigured()) {
    return { sent: false, reason: 'no email provider configured on this host' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, html })
    });
    if (r.ok) return { sent: true };
    let detail = '';
    try { detail = (await r.json()).message || ''; } catch (e) {}
    return { sent: false, reason: 'email provider rejected the send (' + r.status + (detail ? ': ' + detail : '') + ')' };
  } catch (e) {
    return { sent: false, reason: 'email provider unreachable: ' + e.message };
  }
}

// ------------------------------------------------------------------ templates
const BRAND = {
  wrap: (title, bodyHtml) => '<!doctype html><html><body style="margin:0;background:#0c0c11;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#f4f4f8">' +
    '<div style="max-width:560px;margin:0 auto;padding:32px 20px">' +
    '<div style="font-size:12px;letter-spacing:2px;color:#ff7918;margin-bottom:6px">DARKFUSCATOR</div>' +
    '<h2 style="margin:0 0 18px;font-size:20px">' + title + '</h2>' + bodyHtml +
    '<p style="margin-top:28px;font-size:11px;color:#9090a3;line-height:1.6">You are receiving this because of activity on your Darkfuscator account. Obfuscation makes scripts hard to reverse; it is not a security boundary.</p>' +
    '</div></body></html>',
  button: (href, label) => '<a href="' + href + '" style="display:inline-block;background:#ff7918;color:#141414;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px">' + label + '</a>' +
    '<p style="font-size:11.5px;color:#9090a3;margin-top:14px">Or paste this link in your browser:<br><a style="color:#c4b5fd;word-break:break-all" href="' + href + '">' + href + '</a></p>'
};

const templates = {
  verifyEmail: (link) => ({
    subject: 'Verify your email — Darkfuscator',
    html: BRAND.wrap('Verify your email',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Welcome to Darkfuscator. Confirm this address to activate your account and start protecting Luau scripts.</p>' +
      BRAND.button(link, 'Verify email'))
  }),
  verifyEmailChange: (link) => ({
    subject: 'Confirm your new email — Darkfuscator',
    html: BRAND.wrap('Confirm your new email',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Click below to move your Darkfuscator account to this address. The request expires in 24 hours.</p>' +
      BRAND.button(link, 'Confirm email'))
  }),
  resetPassword: (link) => ({
    subject: 'Reset your password — Darkfuscator',
    html: BRAND.wrap('Reset your password',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Someone (hopefully you) asked to reset the password for this account. The link works once and expires in 1 hour. If this was not you, ignore this email and nothing changes.</p>' +
      BRAND.button(link, 'Reset password'))
  }),
  welcome: () => ({
    subject: 'Welcome to Darkfuscator',
    html: BRAND.wrap('Your account is live',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Email verified. Your account is active: open the dashboard, paste a script, and press Protect.</p>' +
      BRAND.button(BASE_URL + '/dashboard', 'Open dashboard'))
  }),
  passwordChanged: () => ({
    subject: 'Your password was changed — Darkfuscator',
    html: BRAND.wrap('Password changed',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Your Darkfuscator password was just changed and all other sessions were signed out. If this was not you, reset your password immediately.</p>' +
      BRAND.button(BASE_URL + '/forgot-password', 'Reset password'))
  }),
  emailChanged: (oldEmail) => ({
    subject: 'Your email was changed — Darkfuscator',
    html: BRAND.wrap('Email changed',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">Your Darkfuscator account email moved from ' + (oldEmail || 'the previous address') + '. If this was not you, reset your password immediately.</p>' +
      BRAND.button(BASE_URL + '/forgot-password', 'Reset password'))
  }),
  securityAlert: (detail) => ({
    subject: 'Security alert — Darkfuscator',
    html: BRAND.wrap('Security alert',
      '<p style="font-size:13.5px;line-height:1.6;color:#d4d4e0">' + detail + '</p>' +
      BRAND.button(BASE_URL + '/settings', 'Review account'))
  })
};

module.exports = { deliver, providerConfigured, templates, BASE_URL, MAIL_FROM };
