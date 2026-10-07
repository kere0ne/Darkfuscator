/* docs.js — API documentation site: sidebar + content. */
(function () {
  'use strict';
  const DFx = window.DF;
  const CONTENT = {
    'getting-started': {
      title: 'Getting started',
      body: [
        '<p>Darkfuscator protects Luau scripts with a proprietary bytecode VM, layered encryption, heavy junk, silent integrity guards and environment probes.</p>',
        '<p>Two ways to use it:</p>',
        '<ul><li><b>Platform</b> (this site): sign in, build in the browser, keep projects and build history, manage API keys.</li>',
        '<li><b>API</b>: call <span class="mono">POST /api/v1/obfuscate</span> from curl or your own code with a <span class="mono">dk_live_</span> key.</li></ul>',
        '<p>Sign in on <a class="link" href="/register">/register</a>, then open <a class="link" href="/obfuscate">/obfuscate</a> and build your first protected script.</p>'
      ].join('')
    },
    'api': {
      title: 'REST API',
      body: [
        '<p>Base URL on this deployment: <span class="mono">' + location.origin + '</span></p>',
        '<p>Every request body and response is JSON. Builds and history use a session cookie or a Bearer API key; the health endpoint needs nothing.</p>',
        '<h3>POST /api/v1/obfuscate</h3>',
        '<p>The main build endpoint. Key auth only.</p>',
        '<pre class="code-block">curl -X POST ' + location.origin + '/api/v1/obfuscate \\\n' +
        '  -H "Authorization: Bearer dk_live_YOURKEY" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        '  -d \'{"source": "print(1)", "preset": "maximum", "target": "roblox"}\'</pre>',
        '<h3>POST /api/v1/builds</h3>',
        '<p>Session (cookie) auth: same build engine, plus the build is stored in your history.</p>',
        '<h3>Request fields</h3>',
        '<ul>' +
        '<li><span class="mono">source</span> (required): the Luau source, max 200,000 characters.</li>',
        '<li><span class="mono">filename</span>: label shown in history.</li>',
        '<li><span class="mono">preset</span>: <span class="mono">lightweight</span>, <span class="mono">balanced</span> or <span class="mono">maximum</span>.</li>',
        '<li><span class="mono">target</span>: <span class="mono">roblox</span> or <span class="mono">luau</span>.</li>',
        '<li><span class="mono">options</span>: <span class="mono">vmLayers</span> (1-10), <span class="mono">junk</span> (0-4), <span class="mono">guard</span> (0-2), <span class="mono">envChecks</span> (0-2), <span class="mono">antiTamper</span> (0-2), <span class="mono">nameStyle</span> (short/random/confuse), <span class="mono">minify</span>, <span class="mono">watermark</span>, <span class="mono">captureGlobals</span>, <span class="mono">envLock</span>, <span class="mono">lockPlace</span>, <span class="mono">lockUniverse</span>, <span class="mono">seed</span>.</li></ul>',
        '<h3>Response</h3>',
        '<pre class="code-block">{\n' +
        '  "ok": true,\n' +
        '  "build": {\n' +
        '    "id": "dfb_...", "filename": "script.luau", "status": "success",\n' +
        '    "preset": "maximum", "target": "roblox",\n' +
        '    "outSize": 358178, "durationMs": 18568, "payloadChars": 312000,\n' +
        '    "vmCount": 10, "seed": "12345", "reparsed": true\n' +
        '  }\n' +
        '}</pre>',
        '<p>The protected output itself comes from <span class="mono">GET /api/v1/builds/:id/output</span> (session) or is embedded in the obfuscate response for key callers.</p>'
      ].join('')
    },
    'api/authentication': {
      title: 'Authentication',
      body: [
        '<p>Two kinds of routes:</p>',
        '<ul><li><b>Cookie routes</b> (sign in, builds, keys, settings): the browser session is an <span class="mono">HttpOnly</span> cookie. CORS is deliberately open only to this origin for these.</li>',
        '<li><b>Key routes</b> (obfuscate): send <span class="mono">Authorization: Bearer dk_live_...</span>. CORS is open so third-party apps can call it.</li></ul>',
        '<p>Generate keys on <a class="link" href="/api-keys">/api-keys</a> or <span class="mono">POST /api/v1/keys</span>. The full key shows once; store it safely. Keys are stored hashed, so they cannot be recovered later.</p>',
        '<p>Limits: 25 keys per account. Key requests show up per key under recent requests.</p>'
      ].join('')
    },
    'errors': {
      title: 'Errors and status codes',
      body: [
        '<table class="data-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>' +
        '<tr><td>400</td><td>Bad request: invalid syntax, missing source, bad token or password</td></tr>' +
        '<tr><td>401</td><td>Not signed in, or missing/invalid API key</td></tr>' +
        '<tr><td>403</td><td>Cross-site request blocked, or email not verified (account_not_verified)</td></tr>' +
        '<tr><td>404</td><td>No such build, project or key</td></tr>' +
        '<tr><td>409</td><td>Username/email taken, or source was not stored for rebuild</td></tr>' +
        '<tr><td>410</td><td>Output no longer stored for that build</td></tr>' +
        '<tr><td>429</td><td>Rate limit hit, response includes retryAfter seconds</td></tr>' +
        '<tr><td>500</td><td>Engine or server crashed, error message included</td></tr>' +
        '<tr><td>503</td><td>Limits reached (keys, projects, builds, signup quota)</td></tr>' +
        '</tbody></table>'
      ].join('')
    },
    'rate-limits': {
      title: 'Rate limits',
      body: [
        '<ul>' +
        '<li>Builds: 10 per minute, 300 per day per account</li>',
        '<li>Login: 10 per minute per IP</li>',
        '<li>Register: 5 per minute, 20 per day per IP</li>',
        '<li>Key creation: 10 per minute</li>',
        '<li>Source size: 200,000 characters; request body 512 KB</li>' +
        '</ul>'
      ].join('')
    },
    'compatibility': {
      title: 'Compatibility',
      body: [
        '<p>Targets:</p>',
        '<ul><li><span class="mono">roblox</span>: Roblox Luau runtime. Default; anti-tamper defaults to Full.</li>',
        '<li><span class="mono">luau</span>: plain Luau (standalone interpreters, other Luau hosts).</li></ul>',
        '<p>The engine re-parses every build byte-for-byte before handing it back, so a successful build is a parse-verified build. A build that cannot re-parse is reported failed with the real error, never silently shipped.</p>',
        '<p>Settings note: full preset with 10 VM layers and heavy junk produces multi-MB outputs and takes seconds to minutes in the browser; lean builds (VM 5, junk 2) are much faster.</p>'
      ].join('')
    },
    'security': {
      title: 'Security notes',
      body: [
        '<ul>' +
        '<li>Passwords: PBKDF2-SHA256 with a per-user salt.</li>',
        '<li>Sessions: HttpOnly, SameSite cookie. Remember device: 30 days, otherwise 1 day.</li>',
        '<li>API keys: stored as SHA-256 hashes, shown once at creation.</li>',
        '<li>Email verification required before first sign in.</li>',
        '<li>Cross-site browser mutations are blocked by origin checks.</li>',
        '<li>The anti-tamper battery ships self-obfuscated through Darkfuscator itself.</li>' +
        '</ul>',
        '<p class="dim">Obfuscation makes scripts hard to read and change. It is not a security boundary against a determined runtime attacker; nothing leaving the runtime should be trusted blindly.</p>'
      ].join('')
    }
  };

  const SIDEBAR = ['getting-started', 'api', 'api/authentication', 'errors', 'rate-limits', 'compatibility', 'security'];
  function route() {
    const path = location.pathname.replace(/^\/docs\/?/, '');
    const key = CONTENT[path] ? path : 'getting-started';
    $('#docs-content').innerHTML = '<h1>' + CONTENT[key].title + '</h1>' + CONTENT[key].body;
    document.title = CONTENT[key].title + ' - Darkfuscator API docs';
    document.querySelectorAll('#docs-nav a[data-doc]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-doc') === key);
    });
    window.DF_NAV(key);
  }
  document.addEventListener('DOMContentLoaded', function () {
    const nav = $('#docs-nav');
    if (nav) {
      nav.innerHTML = SIDEBAR.map(function (k) {
        return '<a data-doc="' + k + '" href="/docs/' + k + '">' + CONTENT[k].title + '</a>';
      }).join('');
      nav.addEventListener('click', function (e) {
        const a = e.target.closest('a[data-doc]');
        if (!a) return;
        e.preventDefault();
        history.pushState(null, '', a.getAttribute('href'));
        route();
      });
    }
    window.addEventListener('popstate', route);
    route();
    document.querySelectorAll('.copyable pre').forEach(function (pre) {
      const btn = document.createElement('button');
      btn.className = 'btn sm';
      btn.textContent = 'Copy';
      pre.parentElement.appendChild(btn);
      btn.addEventListener('click', async function () {
        try { await navigator.clipboard.writeText(pre.textContent); DFx.toast('Copied', '', 'ok'); }
        catch (e) { DFx.toast('Copy blocked by the browser', '', 'warn'); }
      });
    });
  });
})();
