/* docs.js — Darkfuscator product and API documentation. */
(function () {
  'use strict';
  const DFx = window.DF;
  const apiBase = () => location.origin;
  const CONTENT = {
    'getting-started': {
      title: 'Getting started',
      body: [
        '<p>Darkfuscator is a Luau obfuscation platform. A successful build is produced by the real compiler pipeline: lexer and parser, semantic analysis, a configurable source-level IR pass, AST and bytecode optimization, protected serialization, and a generated custom VM loader.</p>',
        '<p>Start by creating an account and opening the <a class="link" href="/obfuscate">protection workspace</a>. The workspace validates source before it calls the authenticated backend; build output and history are returned by that backend, not manufactured in the browser.</p>',
        '<h2>Choose a preset</h2>',
        '<ul><li><b>Lightweight</b> uses FAST source IR and VM layouts and keeps runtime overhead lower.</li><li><b>Balanced</b> selects BALANCED source IR, adds payload compression when it reduces size, register remapping, dispatch variation, and standard integrity verification.</li><li><b>Maximum</b> selects SECURE source IR and VM layouts, stronger standard variation, and full integrity verification.</li></ul>',
        '<p>Use a deterministic seed only when you need reproducible build structure. Otherwise each build receives a fresh build-specific seed.</p>'
      ].join('')
    },
    pipeline: {
      title: 'Protection pipeline',
      body: [
        '<p>Darkfuscator does not turn source into renamed source and call that protection. The supported pipeline is:</p>',
        '<ol><li><b>Lex and parse</b> Luau into syntax, reference, and scope information.</li><li><b>Lower through a source-level IR</b> with bounded, semantics-preserving optimization and control-flow transforms. FAST, BALANCED, and SECURE select progressively more variation; <span class="mono">none</span> opts out.</li><li><b>Optimize conservatively</b> with AST literal folding and bytecode optimizations.</li><li><b>Compile</b> supported source to custom register bytecode.</li><li><b>Serialize</b> bytecode with per-build layout, opcode, string, and payload variation.</li><li><b>Verify and decode</b> in a generated custom VM loader.</li></ol>',
        '<h2>Payload protection</h2>',
        '<p>Each emitted payload receives a randomized alphabet, keyed byte transformations, encoded string constants, shuffled opcode identifiers, and generated handler layout. Optional RLE compression is only retained when it makes the serialized payload smaller.</p>',
        '<h2>Integrity verification</h2>',
        '<p>The <span class="mono">antiTamper</span> compatibility option represents integrity verification: level 0 is off, level 1 validates the decoded payload with FNV, and level 2 adds independent bytecode checksums, and also ships per-proto chunk checksums that the interpreter re-verifies as execution crosses chunk boundaries, so a patched instruction fails closed mid-run rather than only at decode time. Every build also carries a hidden per-build watermark identifier (reported as <span class="mono">watermark</span> in build stats) that traces a leaked script back to the build that produced it. A failed verification returns before reconstructed bytecode runs; it does not intentionally hang or damage the runtime.</p>'
      ].join('')
    },
    workspace: {
      title: 'Workspace and history',
      body: [
        '<p>The authenticated workspace exposes only controls that are sent to the backend engine. It supports file input, local syntax validation, copy/download actions, deterministic seeds, project defaults, and opt-in source retention for rebuilds.</p>',
        '<h2>Projects</h2>',
        '<p>Projects store a name, target, preset, and optional engine defaults. They do not retain source by themselves. On each build, choose whether source should be retained to allow the server-side Rebuild action later.</p>',
        '<h2>History</h2>',
        '<p>History lists real stored build metadata. You can filter entries, download output, rebuild only when source was retained, or delete a build. Deleting an output removes its stored data rather than presenting a fake success state.</p>',
        '<h2>Account safety</h2>',
        '<p>Sessions, password changes, API key creation/revocation, profile changes, and security events are server-backed. There is no email auth anywhere in the platform; accounts are username and password, and the key page at /start accepts any saved key.</p>'
      ].join('')
    },
    'api/protect': {
      title: 'Protect API',
      body: [
        '<p>Use a key created in the authenticated API dashboard. Send it in an Authorization Bearer header. The complete key is shown once when it is created and is stored server-side as a hash.</p>',
        '<h2>POST /api/v1/obfuscate</h2>',
        '<pre class="code-block">curl -X POST ' + apiBase() + '/api/v1/obfuscate \\\n  -H "Authorization: Bearer dk_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{"source":"print(1)","preset":"balanced","target":"luau"}\'</pre>',
        '<h2>Request body</h2>',
        '<ul><li><span class="mono">source</span> is required Luau source (up to 200,000 characters).</li><li><span class="mono">preset</span> is <span class="mono">lightweight</span>, <span class="mono">balanced</span>, or <span class="mono">maximum</span>.</li><li><span class="mono">target</span> is <span class="mono">luau</span> or <span class="mono">roblox</span>.</li><li><span class="mono">options</span> may include <span class="mono">ir</span> (<span class="mono">none</span>, <span class="mono">fast</span>, <span class="mono">balanced</span>, or <span class="mono">secure</span>), <span class="mono">vmLayers</span> (1–10), <span class="mono">junk</span> (0–4), <span class="mono">guard</span> (0–2), <span class="mono">antiTamper</span> / integrity verification (0–2), <span class="mono">vmMode</span>, <span class="mono">compression</span>, <span class="mono">seed</span>, and documented loader options.</li></ul>',
        '<h2>Response</h2>',
        '<pre class="code-block">{\n  "ok": true,\n  "output": "-- Protected by Darkfuscator...",\n  "stats": { "vms": 2, "seed": 12345, "vmMode": "balanced" },\n  "warnings": [],\n  "target": "luau"\n}</pre>',
        '<p>The API returns actual engine output directly. It does not create a build-history entry; use the cookie-authenticated workspace build endpoint when you need stored history.</p>'
      ].join('')
    },
    'api/authentication': {
      title: 'API authentication',
      body: [
        '<p>The public protection endpoint accepts a Bearer API key. Account, history, project, and key-management routes use an HttpOnly browser session cookie instead.</p>',
        '<ul><li>Create and revoke keys from the authenticated <a class="link" href="/api">API dashboard</a>.</li><li>Use a descriptive key name for each integration.</li><li>Store the full secret outside source control. It cannot be recovered after its one-time display.</li><li>Revoked keys are rejected immediately; request usage and last-used data are recorded on the server.</li></ul>',
        '<p>The health endpoint, <span class="mono">GET /api/v1/health</span>, does not require a session or API key.</p>'
      ].join('')
    },
    compatibility: {
      title: 'Compatibility and limits',
      body: [
        '<h2>Implemented targets</h2>',
        '<ul><li><span class="mono">luau</span>: Luau environments with the ordinary primitives used by the generated VM, including <span class="mono">bit32</span>.</li><li><span class="mono">roblox</span>: Roblox Luau. Optional place and universe ID bindings are emitted only when explicitly configured.</li></ul>',
        '<p>Darkfuscator does not claim generic Lua, executor-specific environments, or unknown runtimes as supported targets. Test protected builds in the same environment where you intend to run them.</p>',
        '<h2>Runtime trade-offs</h2>',
        '<p>VM execution and stronger layout variation increase output size and runtime overhead. Use FAST or LIGHTWEIGHT for more overhead-sensitive code, and measure realistic workloads before choosing a profile for production.</p>',
        '<h2>Source support</h2>',
        '<p>The engine accepts the Luau syntax covered by its parser and compiler. It re-parses emitted output before returning it, but parse validity is not a substitute for application-level testing of every script and target environment.</p>'
      ].join('')
    },
    security: {
      title: 'Security model',
      body: [
        '<p>Obfuscation is a cost-increase measure, not a trust boundary. Anyone controlling a client runtime can observe or alter client-side behavior. Keep secrets, authoritative decisions, and irreversible business logic on trusted server-side systems.</p>',
        '<ul><li>Passwords are derived server-side with PBKDF2-SHA256 and a per-user salt.</li><li>Browser sessions use HttpOnly cookies with production-aware Secure settings and SameSite protection.</li><li>API key secrets are hashed server-side and only displayed once at creation.</li><li>Verification and reset tokens are one-time, time-limited server records.</li><li>Integrity verification in protected output safely returns before bytecode execution when a verification check fails.</li></ul>',
        '<p>Darkfuscator deliberately does not generate destructive failure loops, executor-specific bypasses, debug/timing probes, or game-client probe batteries.</p>'
      ].join('')
    },
    errors: {
      title: 'Errors and status codes',
      body: [
        '<table class="platform-table"><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody>',
        '<tr><td>400</td><td>Invalid request, unsupported target/preset, invalid source, or engine-reported build failure.</td></tr>',
        '<tr><td>401</td><td>Missing or invalid session/API key.</td></tr>',
        '<tr><td>403</td><td>Account status, session state, or origin policy prevents the request.</td></tr>',
        '<tr><td>404</td><td>The requested build, project, or API key does not exist for the account.</td></tr>',
        '<tr><td>409</td><td>A conflicting value exists, or a rebuild was requested without retained source.</td></tr>',
        '<tr><td>429</td><td>A route rate limit was reached. The response may include a retry interval.</td></tr>',
        '<tr><td>500</td><td>An unexpected server/engine error occurred.</td></tr>',
        '</tbody></table>'
      ].join('')
    }
  };

  const SIDEBAR = ['getting-started', 'pipeline', 'workspace', 'api/protect', 'api/authentication', 'compatibility', 'security', 'errors'];
  const $ = (selector) => document.querySelector(selector);
  function route() {
    const path = location.pathname.replace(/^\/docs\/?/, '').replace(/\/$/, '');
    const key = CONTENT[path] ? path : 'getting-started';
    $('#docs-content').innerHTML = '<h1>' + CONTENT[key].title + '</h1>' + CONTENT[key].body;
    document.title = CONTENT[key].title + ' — Darkfuscator docs';
    document.querySelectorAll('#docs-nav a[data-doc]').forEach((a) => a.classList.toggle('active', a.getAttribute('data-doc') === key));
    if (window.DF_NAV) window.DF_NAV(key);
  }
  document.addEventListener('DOMContentLoaded', function () {
    const nav = $('#docs-nav');
    nav.innerHTML = SIDEBAR.map((key) => '<a data-doc="' + key + '" href="/docs/' + key + '">' + CONTENT[key].title + '</a>').join('');
    nav.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-doc]');
      if (!link) return;
      event.preventDefault();
      history.pushState(null, '', link.getAttribute('href'));
      route();
    });
    window.addEventListener('popstate', route);
    route();
  });
})();
