/* Darkfuscator platform application.
 *
 * The UI deliberately talks only to the platform API. It never manufactures a
 * build result, system status, project, or API key in the browser.
 */
(function () {
  'use strict';

  const $ = (q, root) => (root || document).querySelector(q);
  const $$ = (q, root) => Array.from((root || document).querySelectorAll(q));
  const DFx = window.DF;
  const enc = encodeURIComponent;
  const state = {
    user: null,
    system: null,
    currentPath: '',
    renderId: 0,
    activeWorkspace: null,
    projects: null,
    sidebarOpen: false
  };

  const PAGE = {
    '/dashboard': { title: 'Dashboard', kicker: 'WORKSPACE', description: 'Build activity, projects, and live platform health.' },
    '/obfuscate': { title: 'Obfuscate', kicker: 'PROTECTION WORKSPACE', description: 'Protect Luau and Roblox Luau source with Darkfuscator’s custom VM pipeline.' },
    '/projects': { title: 'Projects', kicker: 'PROJECTS', description: 'Keep protection defaults and build history organized by project.' },
    '/projects/new': { title: 'New project', kicker: 'PROJECTS', description: 'Create a project without uploading or storing a source file.' },
    '/history': { title: 'Build History', kicker: 'BUILD HISTORY', description: 'Inspect, download, rebuild, or remove your own stored builds.' },
    '/api': { title: 'API', kicker: 'DEVELOPER API', description: 'Create scoped-to-your-account API keys and monitor real requests.' },
    '/settings': { title: 'Settings', kicker: 'ACCOUNT SETTINGS', description: 'Manage your profile, security, editor preferences, and build defaults.' },
    '/account': { title: 'Account', kicker: 'ACCOUNT', description: 'Review your identity, verification state, and security controls.' }
  };

  function esc(v) { return DFx.esc(v); }
  function bool(v) { return v === true || v === 'true'; }
  function settings() {
    if (!state.user) return {};
    return state.user.settings || {};
  }
  function defaults() {
    return settings().obfuscationDefaults || { target: 'roblox', preset: 'balanced', ir: 'balanced', vmMode: 'balanced', compression: true };
  }
  function editorPrefs() {
    const fallback = { fontSize: 13, tabSize: 4, wordWrap: false, lineNumbers: true, highlighting: true };
    return Object.assign(fallback, settings().editor || {});
  }
  function notify(kind, title, text) { DFx.toast(title, text || '', kind || 'info'); }
  // Shared controls are rendered on multiple routes. Keep these helpers at
  // module scope rather than inside the workspace renderer.
  function setToggle(el, on) {
    if (!el) return;
    el.setAttribute('aria-checked', on ? 'true' : 'false');
    el.classList.toggle('on', !!on);
  }
  function readToggle(selector) {
    const el = typeof selector === 'string' ? $(selector) : selector;
    return !!el && el.getAttribute('aria-checked') === 'true';
  }

  async function api(path, options, allow401) {
    const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, options || {}));
    let data = {};
    try { data = await res.json(); } catch (e) { /* non-json endpoint */ }
    if (!res.ok) {
      const error = new Error(data.error || ('Request failed (' + res.status + ')'));
      error.status = res.status;
      error.data = data;
      error.retryAfter = data.retryAfter;
      if (res.status === 401 && !allow401) {
        location.href = '/login?next=' + enc(location.pathname + location.search);
      }
      throw error;
    }
    return data;
  }

  async function getText(path) {
    const res = await fetch(path, { credentials: 'same-origin' });
    const text = await res.text();
    if (!res.ok) {
      let message = text || ('Request failed (' + res.status + ')');
      try { message = JSON.parse(text).error || message; } catch (e) {}
      const error = new Error(message);
      error.status = res.status;
      throw error;
    }
    return text;
  }

  function formatTarget(target) { return target === 'roblox' ? 'Roblox Luau' : 'Luau'; }
  function formatPreset(preset) { return String(preset || '').replace(/^./, (c) => c.toUpperCase()); }
  function statusChip(status) {
    const good = status === 'success' || status === 'active' || status === 'operational';
    const label = status === 'success' ? 'Success' : status === 'failed' ? 'Failed' : status;
    return '<span class="status-chip ' + (good ? 'good' : status === 'failed' ? 'bad' : 'neutral') + '">' + esc(label) + '</span>';
  }
  function renderFailure(root, title, error, retry) {
    root.innerHTML = '<section class="empty-state error-state"><h2>' + esc(title) + '</h2><p>' + esc(error && error.message || 'Something went wrong.') + '</p>' +
      '<button class="btn primary" id="retry-view" type="button">Retry</button></section>';
    const button = $('#retry-view', root);
    if (button) button.addEventListener('click', retry || (() => route()));
  }
  function empty(label, actionHref, actionLabel) {
    return '<div class="empty-state"><p>' + esc(label) + '</p>' + (actionHref ? '<a class="btn primary" href="' + actionHref + '" data-route="' + actionHref + '">' + esc(actionLabel || 'Continue') + '</a>' : '') + '</div>';
  }

  // ---------------------------------------------------------------- shell
  function initials(name) { return (String(name || 'D').trim().slice(0, 2) || 'D').toUpperCase(); }
  function applyAppearance() {
    const appearance = settings().appearance || {};
    const theme = localStorage.getItem('dk_theme') || appearance.theme || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', appearance.accent || 'orange');
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-accent', appearance.accent || 'orange');
    document.body.dataset.compact = appearance.compact ? '1' : '0';
  }
  function populateShell() {
    const u = state.user;
    const initial = initials(u.username);
    $('#side-account-name').textContent = u.username;
    $('#top-account-name').textContent = u.username;
    $('#side-avatar').textContent = initial;
    $('#top-avatar').textContent = initial;
    $('#menu-username').textContent = u.username;
    $('#menu-email').textContent = u.email;
    const verified = $('#menu-verified');
    verified.textContent = u.verified ? 'Verified' : 'Unverified';
    verified.classList.toggle('unverified', !u.verified);
    applyAppearance();
    const collapsed = localStorage.getItem('dk_sidebar_collapsed') === '1';
    $('#platform-shell').classList.toggle('sidebar-collapsed', collapsed);
  }
  function setSystem(system) {
    state.system = system;
    const ok = !!(system && system.ok);
    const dot = $('#side-status-dot');
    dot.className = 'status-dot ' + (ok ? 'ok' : 'bad');
    $('#side-status-label').textContent = ok ? 'All systems operational' : 'System check needs attention';
  }
  async function loadSystem() {
    try { setSystem((await api('/api/v1/system', null, true)).system); }
    catch (e) { setSystem({ ok: false }); }
  }
  function closeMobileNav() {
    state.sidebarOpen = false;
    $('#platform-sidebar').classList.remove('mobile-open');
    $('#nav-scrim').hidden = true;
  }
  function toggleMobileNav() {
    state.sidebarOpen = !state.sidebarOpen;
    $('#platform-sidebar').classList.toggle('mobile-open', state.sidebarOpen);
    $('#nav-scrim').hidden = !state.sidebarOpen;
  }

  // -------------------------------------------------------------- navigation
  function routeFor(path) {
    // Exact known routes take precedence so /projects/new never becomes a
    // project detail page with an id of "new".
    if (PAGE[path]) return path;
    if (/^\/projects\/[A-Za-z0-9_-]+$/.test(path)) return '/projects/:id';
    if (path === '/api-keys') return '/api';
    return '/dashboard';
  }
  function setHeading(view, path) {
    const meta = PAGE[view] || (view === '/projects/:id' ? { title: 'Project', kicker: 'PROJECTS', description: 'Project defaults and its protected build history.' } : PAGE['/dashboard']);
    $('#view-title').textContent = meta.title;
    $('#page-kicker').textContent = meta.kicker;
    $('#view-description').textContent = meta.description;
    document.title = meta.title + ' — Darkfuscator';
    $$('.platform-nav [data-route], .mobile-bottom-nav [data-route]').forEach((a) => {
      const r = a.getAttribute('data-route');
      a.classList.toggle('active', r === view || (view === '/projects/:id' && r === '/projects'));
    });
  }
  function navigate(path) {
    if (path === '/api-keys') path = '/api';
    if (location.pathname + location.search === path) return route();
    history.pushState(null, '', path);
    route();
  }
  function bindRoutes(root) {
    (root || document).querySelectorAll('a[data-route]').forEach((a) => {
      if (a.dataset.bound) return;
      a.dataset.bound = '1';
      a.addEventListener('click', (event) => {
        const href = a.getAttribute('href');
        if (!href || href.startsWith('http')) return;
        event.preventDefault();
        closeMobileNav();
        navigate(href);
      });
    });
  }
  async function route() {
    const path = location.pathname === '/api-keys' ? '/api' : location.pathname;
    if (location.pathname === '/api-keys') history.replaceState(null, '', '/api');
    const view = routeFor(path);
    state.currentPath = view;
    state.activeWorkspace = null;
    closeMobileNav();
    setHeading(view, path);
    const root = $('#view-root');
    const renderId = ++state.renderId;
    root.innerHTML = '<div class="view-loading">Loading…</div>';
    try {
      if (view === '/dashboard') await renderDashboard(root, renderId);
      else if (view === '/obfuscate') await renderObfuscate(root, renderId, new URLSearchParams(location.search).get('project'));
      else if (view === '/projects') await renderProjects(root, renderId);
      else if (view === '/projects/new') renderProjectNew(root, renderId);
      else if (view === '/projects/:id') await renderProjectDetail(root, renderId, path.split('/').pop());
      else if (view === '/history') await renderHistory(root, renderId);
      else if (view === '/api') await renderApi(root, renderId);
      else if (view === '/settings') await renderSettings(root, renderId);
      else if (view === '/account') await renderAccount(root, renderId);
      bindRoutes(root);
    } catch (error) {
      if (renderId === state.renderId) renderFailure(root, 'Could not load this page', error, () => route());
    }
  }
  function isCurrent(id) { return id === state.renderId; }

  // -------------------------------------------------------------- dashboard
  async function renderDashboard(root, id) {
    const [statsR, buildsR, projectsR, systemR] = await Promise.all([
      api('/api/v1/stats'), api('/api/v1/builds?limit=6'), api('/api/v1/projects'), api('/api/v1/system')
    ]);
    if (!isCurrent(id)) return;
    const stats = statsR.stats;
    const builds = buildsR.items || [];
    const projects = projectsR.projects || [];
    setSystem(systemR.system);
    root.innerHTML =
      '<section class="welcome-panel"><div><p class="page-kicker">WELCOME BACK</p><h2>Welcome back, ' + esc(state.user.username) + '</h2><p>Pick up where you left off or start a new protected build.</p></div><div class="welcome-actions"><a class="btn primary" href="/obfuscate" data-route="/obfuscate">New obfuscation</a><a class="btn" href="/projects/new" data-route="/projects/new">New project</a></div></section>' +
      '<section class="metric-grid">' +
        metric('Total Builds', DFx.fmtNum(stats.totalBuilds), 'All recorded builds', '/history') +
        metric('Successful Builds', DFx.fmtNum(stats.successfulBuilds), 'Completed by the engine', '/history?status=success') +
        metric('Projects', DFx.fmtNum(stats.projects), 'Protection profiles', '/projects') +
        metric('API Requests', DFx.fmtNum(stats.apiRequests), 'Across active and revoked keys', '/api') +
      '</section>' +
      '<section class="content-grid two-one"><article class="panel"><div class="panel-head"><div><h2>Recent builds</h2><p>Your latest real platform builds.</p></div><a class="text-link" href="/history" data-route="/history">View history</a></div>' +
      buildTable(builds, false) + '</article>' +
      '<aside class="stacked-panels"><article class="panel"><div class="panel-head"><div><h2>Quick actions</h2><p>Common workspace actions.</p></div></div><div class="quick-actions">' +
      '<a href="/obfuscate" data-route="/obfuscate"><span>⌘</span>Protect a script</a><a href="/projects/new" data-route="/projects/new"><span>＋</span>Create a project</a><a href="/api" data-route="/api"><span>{ }</span>Manage API</a><a href="/docs"><span>?</span>Read documentation</a></div></article>' +
      '<article class="panel"><div class="panel-head"><div><h2>System status</h2><p>Live backend checks, not a static badge.</p></div></div><div class="health-list">' +
      healthItem('Obfuscation engine', systemR.system.engine) + healthItem('API', systemR.system.api) + healthItem('Authentication', systemR.system.authentication) + healthItem('Database', systemR.system.database) +
      '</div></article></aside></section>';
    state.projects = projects;
  }
  function metric(label, value, sub, href) {
    return '<a class="metric-card" href="' + href + '" data-route="' + href + '"><span>' + esc(label) + '</span><strong>' + value + '</strong><small>' + esc(sub) + ' →</small></a>';
  }
  function healthItem(label, item) {
    const ok = !!(item && item.ok);
    return '<div class="health-item"><span class="status-dot ' + (ok ? 'ok' : 'bad') + '"></span><span>' + esc(label) + '</span><strong>' + (ok ? 'Operational' : 'Attention') + '</strong></div>';
  }
  function buildTable(items, actions) {
    if (!items.length) return empty('No builds yet. The first successful engine build will appear here.', '/obfuscate', 'Protect a script');
    return '<div class="data-scroll"><table class="platform-table"><thead><tr><th>File</th><th>Preset</th><th>Target</th><th>Status</th><th>Build ID</th><th>Created</th>' + (actions ? '<th></th>' : '') + '</tr></thead><tbody>' +
      items.map((b) => '<tr><td data-label="File" class="file-cell">' + esc(b.filename || 'script.luau') + '</td><td data-label="Preset">' + esc(formatPreset(b.preset)) + '</td><td data-label="Target">' + esc(formatTarget(b.target)) + '</td><td data-label="Status">' + statusChip(b.status) + '</td><td data-label="Build ID" class="mono">' + esc(b.id) + '</td><td data-label="Created" title="' + esc(b.createdAt) + '">' + esc(DFx.fmtAgo(b.createdAt)) + '</td>' + (actions ? '<td>' + buildActionButtons(b) + '</td>' : '') + '</tr>').join('') +
      '</tbody></table></div>';
  }

  // -------------------------------------------------------- obfuscation view
  const IR_MODES = [
    ['none', 'None — compile parsed source directly'],
    ['fast', 'Fast — conservative source-level lowering'],
    ['balanced', 'Balanced — additional bounded control-flow variation'],
    ['secure', 'Secure — strongest supported source-level variation']
  ];
  const PROTECTION_MODES = [
    ['fast', 'Fast — minimal runtime overhead'],
    ['balanced', 'Balanced — remapped registers and shuffled dispatch'],
    ['secure', 'Secure — stronger VM layout variation']
  ];
  function selectOptions(options, selected) {
    return options.map((entry) => {
      const value = Array.isArray(entry) ? entry[0] : entry;
      const label = Array.isArray(entry) ? entry[1] : entry;
      return '<option value="' + esc(value) + '"' + (String(value) === String(selected) ? ' selected' : '') + '>' + esc(label) + '</option>';
    }).join('');
  }
  function settingRow(id, label, description, control, extra) {
    return '<div class="setting-row"><div><label for="' + esc(id) + '">' + esc(label) + (extra ? '<span class="info-tip" title="' + esc(extra) + '">i</span>' : '') + '</label><p>' + esc(description) + '</p></div><div class="setting-control">' + control + '</div></div>';
  }
  async function renderObfuscate(root, id, projectId) {
    let project = null;
    if (projectId) project = (await api('/api/v1/projects/' + enc(projectId))).project;
    if (!isCurrent(id)) return;
    const d = defaults();
    const projectOptions = project && project.options || {};
    const opts = Object.assign({
      target: project ? project.target : (d.target || 'roblox'),
      preset: project ? project.preset : (d.preset || 'balanced'),
      ir: projectOptions.ir || d.ir || 'balanced',
      vmMode: projectOptions.vmMode || d.vmMode || 'balanced',
      compression: projectOptions.compression !== undefined ? !!projectOptions.compression : d.compression !== false,
      vmLayers: projectOptions.vmLayers || '', junk: projectOptions.junk || '', guard: projectOptions.guard || '',
      antiTamper: projectOptions.antiTamper === undefined ? '' : projectOptions.antiTamper,
      minify: projectOptions.minify !== false, captureGlobals: !!projectOptions.captureGlobals,
      lockPlace: projectOptions.lockPlace || '', lockUniverse: projectOptions.lockUniverse || '',
      seed: projectOptions.seed || '', storeSource: true
    }, projectOptions);
    let filename = 'script.luau';
    let lastBuild = null;

    root.innerHTML =
      (project ? '<section class="context-banner"><span>Project build</span><strong>' + esc(project.name) + '</strong><a class="text-link" href="/projects/' + esc(project.id) + '" data-route="/projects/' + esc(project.id) + '">Project settings</a></section>' : '') +
      '<section class="workspace-layout"><article class="workspace-panel source-panel" id="source-pane"><div class="workspace-head"><div><span class="panel-eyebrow">SOURCE</span><h2>Lua / Luau source</h2></div><span class="editor-summary" id="source-summary">0 lines · 0 characters</span></div><div class="editor-actionbar"><label class="btn sm file-input">Upload<input type="file" id="source-file" accept=".lua,.luau,.txt"></label><button class="btn sm" id="open-source" type="button">Open</button><button class="btn sm" id="paste-source" type="button">Paste</button><button class="btn sm" id="search-source" type="button">Search</button><button class="btn sm ghost" id="clear-source" type="button">Clear</button><button class="btn sm ghost" id="wrap-source" type="button">Wrap</button><label class="font-size-label">Size <select id="source-font" aria-label="Editor font size"><option>11</option><option>12</option><option selected>13</option><option>14</option><option>16</option></select></label></div><div id="source-editor"></div><p class="drop-note">Drop a .lua, .luau, or .txt file anywhere in this panel.</p></article>' +
      '<article class="workspace-panel output-panel"><div class="workspace-head"><div><span class="panel-eyebrow">PROTECTED OUTPUT</span><h2>VM loader</h2></div><span class="editor-summary" id="output-summary">No build yet</span></div><div class="editor-actionbar"><button class="btn sm" id="copy-output" type="button">Copy</button><button class="btn sm" id="download-output" type="button">Download</button><button class="btn sm" id="expand-output" type="button">Expand</button><button class="btn sm ghost" id="clear-output" type="button">Clear</button></div><textarea id="output-editor" class="output-editor" readonly spellcheck="false" aria-label="Protected output"></textarea><div class="output-meta" id="output-meta"><span>Output is returned only by a successful backend build.</span></div></article></section>' +
      '<section class="build-bar"><div><strong id="build-status-title">Ready to protect</strong><p id="build-status">Source is compiled by the authenticated platform backend.</p></div><div class="build-bar-actions"><span class="build-spinner" id="build-spinner" hidden aria-label="Building"></span><button class="btn primary large" id="protect-button" type="button">Protect script <kbd>⌘ Enter</kbd></button></div></section>' +
      '<section class="build-result" id="build-result" hidden></section>' +
      '<section class="settings-panel"><div class="panel-head"><div><h2>Protection settings</h2><p>Every control below is passed to the backend engine; unsupported target/runtime combinations are not shown.</p></div></div>' +
      '<div class="settings-columns"><div><h3>General</h3>' +
        settingRow('opt-target', 'Target', 'Implemented and tested targets only.', '<select id="opt-target"><option value="luau">Luau</option><option value="roblox">Roblox Luau</option></select>') +
        settingRow('opt-preset', 'Preset', 'Presets select real compiler, source IR, and VM settings. Fine-tuning below overrides the preset.', '<select id="opt-preset">' + selectOptions(['lightweight', 'balanced', 'maximum'], opts.preset) + '</select>') +
        settingRow('opt-ir', 'Source IR', 'A bounded semantics-preserving lowering pass before custom-bytecode compilation. None skips this optional stage.', '<select id="opt-ir">' + selectOptions(IR_MODES, opts.ir) + '</select>') +
        settingRow('opt-vm-mode', 'VM mode', 'Fast avoids register indirection; secure increases runtime layout variation.', '<select id="opt-vm-mode">' + selectOptions(PROTECTION_MODES, opts.vmMode) + '</select>') +
        '<div class="fixed-capability"><strong>Custom bytecode & VM</strong><p>Always enabled. Darkfuscator does not return renamed source as “protected output.”</p><span>Included</span></div>' +
        '<div class="fixed-capability"><strong>Constant & string protection</strong><p>Constants are reorganized, encoded, and decoded lazily by the VM when needed.</p><span>Included</span></div>' +
      '</div><div><h3>Protection</h3>' +
        settingRow('opt-integrity', 'Integrity verification', 'Fast checks a payload hash; full also validates independent bytecode checksums and fails safely.', '<select id="opt-integrity"><option value="0">Off</option><option value="1">Fast</option><option value="2">Full</option></select>') +
        settingRow('opt-junk', 'Control-flow variation', 'Adds handler variants and opaque unreachable paths inside the generated VM; it does not add destructive loops.', '<select id="opt-junk"><option value="">Preset default</option><option value="0">Minimal</option><option value="1">Balanced</option><option value="2">Strong</option></select>') +
        settingRow('opt-guard', 'Runtime integrity guard', 'Checks runtime primitives used by the VM before protected data is decoded.', '<select id="opt-guard"><option value="">Preset default</option><option value="0">Off</option><option value="1">Standard</option><option value="2">Strict</option></select>') +
        settingRow('opt-compression', 'Compress payload', 'Optional RLE size pass after bytecode protection. Compression is for size, not a security claim.', '<button type="button" class="toggle-control" id="opt-compression" aria-checked="false"><span></span></button>') +
        settingRow('opt-minify', 'Strip metadata / minify', 'Keeps only the generated runtime representation and removes formatting that is unnecessary for execution.', '<button type="button" class="toggle-control" id="opt-minify" aria-checked="false"><span></span></button>') +
      '</div><div><h3>Advanced</h3>' +
        settingRow('opt-deterministic', 'Deterministic build', 'Use a seed for reproducible structure. Leave it off for a new cryptographically seeded build.', '<button type="button" class="toggle-control" id="opt-deterministic" aria-checked="false"><span></span></button>') +
        settingRow('opt-seed', 'Build seed', 'A numeric or text seed is converted to a stable build identity.', '<input id="opt-seed" type="text" placeholder="Random per build">') +
        settingRow('opt-store-source', 'Store source for rebuild', 'When enabled, the backend retains the input solely to support the Rebuild action. Turn it off to keep output/history only.', '<button type="button" class="toggle-control" id="opt-store-source" aria-checked="true"><span></span></button>') +
        '<div class="advanced-locks" id="roblox-locks"><div class="field"><label for="opt-place">Roblox place ID <span class="info-tip" title="Optional execution binding for a specific Roblox place.">i</span></label><input id="opt-place" type="text" inputmode="numeric" placeholder="Any place"></div><div class="field"><label for="opt-universe">Roblox universe ID <span class="info-tip" title="Optional execution binding for a specific Roblox universe.">i</span></label><input id="opt-universe" type="text" inputmode="numeric" placeholder="Any universe"></div></div>' +
      '</div></div><div class="settings-footer"><button class="btn" id="save-defaults" type="button">Save as my defaults</button>' + (project ? '<button class="btn" id="save-project-options" type="button">Save to project</button>' : '') + '<span id="settings-note">Defaults are saved server-side to your account.</span></div></section>';

    const editorSettings = editorPrefs();
    const editor = new window.DFEditor($('#source-editor'), Object.assign({}, editorSettings, { placeholder: '-- Paste your Luau source here' }));
    const area = $('.editor-area', editor.el);
    $('#source-font').value = String(editorSettings.fontSize || 13);
    let wrapped = !!editorSettings.wordWrap;

    function setOptionsInView() {
      $('#opt-target').value = opts.target;
      $('#opt-preset').value = opts.preset;
      $('#opt-ir').value = opts.ir;
      $('#opt-vm-mode').value = opts.vmMode;
      $('#opt-integrity').value = opts.antiTamper === '' ? '' : String(opts.antiTamper);
      $('#opt-junk').value = opts.junk === '' ? '' : String(opts.junk);
      $('#opt-guard').value = opts.guard === '' ? '' : String(opts.guard);
      $('#opt-seed').value = opts.seed || '';
      $('#opt-place').value = opts.lockPlace || '';
      $('#opt-universe').value = opts.lockUniverse || '';
      setToggle($('#opt-compression'), !!opts.compression);
      setToggle($('#opt-minify'), opts.minify !== false);
      setToggle($('#opt-deterministic'), !!opts.seed);
      setToggle($('#opt-store-source'), opts.storeSource !== false);
      $('#roblox-locks').hidden = opts.target !== 'roblox';
    }
    function setToggle(el, on) { el.setAttribute('aria-checked', on ? 'true' : 'false'); el.classList.toggle('on', !!on); }
    function readToggle(sel) { return $(sel).getAttribute('aria-checked') === 'true'; }
    function updateSummary() {
      const text = editor.getValue();
      const lines = text ? text.split('\n').length : 0;
      $('#source-summary').textContent = DFx.fmtNum(lines) + ' lines · ' + DFx.fmtNum(text.length) + ' characters';
    }
    function setBuildState(title, note, busy) {
      $('#build-status-title').textContent = title;
      $('#build-status').textContent = note;
      $('#build-spinner').hidden = !busy;
      $('#protect-button').disabled = !!busy;
    }
    function outputSummary(text) {
      $('#output-summary').textContent = text ? DFx.fmtBytes(text.length) + ' · ' + DFx.fmtNum(text.split('\n').length) + ' lines' : 'No build yet';
    }
    function optionsBody() {
      const out = {
        ir: opts.ir,
        vmMode: opts.vmMode,
        compression: !!opts.compression,
        minify: opts.minify !== false,
        lockPlace: opts.lockPlace || '',
        lockUniverse: opts.lockUniverse || ''
      };
      ['antiTamper', 'junk', 'guard'].forEach((key) => {
        if (opts[key] !== '' && opts[key] !== undefined && opts[key] !== null) out[key] = Number(opts[key]);
      });
      if (opts.seed) out.seed = opts.seed;
      return out;
    }
    function showResult(build, stats, warnings) {
      const result = $('#build-result');
      result.hidden = false;
      result.innerHTML = '<div class="result-heading"><span class="status-dot ok"></span><div><strong>Protection complete</strong><p>The backend returned a real VM build and stored the selected history metadata.</p></div></div><div class="result-grid">' +
        resultMetric('Build ID', build.id) + resultMetric('Input', DFx.fmtBytes(build.inputSize)) + resultMetric('Output', DFx.fmtBytes(build.outputSize)) + resultMetric('Processing', (build.processingMs == null ? stats.ms : build.processingMs) + ' ms') + resultMetric('Preset', formatPreset(build.preset)) + resultMetric('Target', formatTarget(build.target)) + resultMetric('VM layers', String(build.vmCount == null ? (stats.vms || 1) : build.vmCount)) + resultMetric('Seed', String(build.seed == null ? 'random' : build.seed)) +
        '</div>' + (warnings && warnings.length ? '<div class="result-warnings">' + warnings.map(esc).join('<br>') + '</div>' : '');
    }
    function resultMetric(k, v) { return '<div><span>' + esc(k) + '</span><strong class="mono">' + esc(v) + '</strong></div>'; }

    setOptionsInView();
    updateSummary();
    area.addEventListener('input', updateSummary);
    $('#source-font').addEventListener('change', function () { editor.setFontSize(Number(this.value)); });
    $('#wrap-source').addEventListener('click', function () { wrapped = !wrapped; editor.setWrap(wrapped); this.classList.toggle('active', wrapped); });
    $('#search-source').addEventListener('click', () => editor.openSearch());
    $('#open-source').addEventListener('click', () => $('#source-file').click());
    $('#source-file').addEventListener('change', () => loadFile($('#source-file').files[0]));
    $('#paste-source').addEventListener('click', async () => {
      try { editor.setValue(await navigator.clipboard.readText()); updateSummary(); notify('ok', 'Pasted source', 'Clipboard contents were placed in the editor.'); }
      catch (e) { notify('warn', 'Clipboard unavailable', 'Use your browser’s paste shortcut in the editor instead.'); }
    });
    $('#clear-source').addEventListener('click', () => { editor.setValue(''); filename = 'script.luau'; updateSummary(); setBuildState('Ready to protect', 'Source was cleared.', false); });
    $('#clear-output').addEventListener('click', () => { $('#output-editor').value = ''; outputSummary(''); $('#output-meta').innerHTML = '<span>Output cleared locally. Stored builds remain in history.</span>'; lastBuild = null; $('#build-result').hidden = true; });
    $('#copy-output').addEventListener('click', () => copyText($('#output-editor').value, 'Protected output copied'));
    $('#download-output').addEventListener('click', () => downloadBuild(lastBuild, $('#output-editor').value, filename));
    $('#expand-output').addEventListener('click', () => showOutputModal($('#output-editor').value, lastBuild && lastBuild.id));
    ['dragenter', 'dragover'].forEach((ev) => $('#source-pane').addEventListener(ev, (event) => { event.preventDefault(); $('#source-pane').classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((ev) => $('#source-pane').addEventListener(ev, (event) => { event.preventDefault(); $('#source-pane').classList.remove('dragging'); }));
    $('#source-pane').addEventListener('drop', (event) => loadFile(event.dataTransfer.files && event.dataTransfer.files[0]));

    function loadFile(file) {
      if (!file) return;
      if (!/\.(lua|luau|txt)$/i.test(file.name)) { notify('warn', 'Unsupported file', 'Choose a .lua, .luau, or .txt file.'); return; }
      const reader = new FileReader();
      reader.onload = () => { editor.setValue(String(reader.result || '')); filename = file.name; updateSummary(); setBuildState('Source loaded', file.name + ' is ready for backend validation.', false); };
      reader.onerror = () => notify('bad', 'Could not read file', 'The selected file could not be opened by the browser.');
      reader.readAsText(file);
    }

    $('#opt-target').addEventListener('change', function () { opts.target = this.value; $('#roblox-locks').hidden = opts.target !== 'roblox'; });
    $('#opt-preset').addEventListener('change', function () {
      opts.preset = this.value;
      const maps = { lightweight: { ir: 'fast', vmMode: 'fast', compression: false, antiTamper: 0, junk: 0, guard: 0 }, balanced: { ir: 'balanced', vmMode: 'balanced', compression: true, antiTamper: 1, junk: 1, guard: 1 }, maximum: { ir: 'secure', vmMode: 'secure', compression: true, antiTamper: 2, junk: 2, guard: 2 } };
      Object.assign(opts, maps[opts.preset]); setOptionsInView();
    });
    $('#opt-ir').addEventListener('change', function () { opts.ir = this.value; });
    $('#opt-vm-mode').addEventListener('change', function () { opts.vmMode = this.value; });
    $('#opt-integrity').addEventListener('change', function () { opts.antiTamper = this.value === '' ? '' : Number(this.value); });
    $('#opt-junk').addEventListener('change', function () { opts.junk = this.value === '' ? '' : Number(this.value); });
    $('#opt-guard').addEventListener('change', function () { opts.guard = this.value === '' ? '' : Number(this.value); });
    $('#opt-seed').addEventListener('input', function () { opts.seed = this.value.trim(); setToggle($('#opt-deterministic'), !!opts.seed); });
    $('#opt-place').addEventListener('input', function () { opts.lockPlace = this.value.trim(); });
    $('#opt-universe').addEventListener('input', function () { opts.lockUniverse = this.value.trim(); });
    [['#opt-compression', 'compression'], ['#opt-minify', 'minify'], ['#opt-store-source', 'storeSource']].forEach(([sel, key]) => $(sel).addEventListener('click', () => { opts[key] = !readToggle(sel); setToggle($(sel), opts[key]); }));
    $('#opt-deterministic').addEventListener('click', () => { if (readToggle('#opt-deterministic')) { opts.seed = ''; $('#opt-seed').value = ''; } else { opts.seed = String(Date.now()); $('#opt-seed').value = opts.seed; } setToggle($('#opt-deterministic'), !!opts.seed); });

    async function protect() {
      const source = editor.getValue();
      if (!source.trim()) { setBuildState('Source required', 'Paste, upload, or open a Lua/Luau source file first.', false); return; }
      if (source.length > 200000) { setBuildState('Source too large', 'The API limit is 200,000 characters.', false); return; }
      try {
        window.LuauParser.parse(source);
      } catch (error) {
        setBuildState('Syntax needs attention', error.message + (error.line ? ' (line ' + error.line + ')' : ''), false);
        notify('bad', 'Local syntax validation failed', error.message);
        return;
      }
      setBuildState('Building with Darkfuscator', 'The source is being processed by the real backend engine. This may take longer for secure multi-VM builds.', true);
      const started = performance.now();
      try {
        const response = await api('/api/v1/builds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source, filename, projectId: project && project.id || undefined, preset: opts.preset, target: opts.target, options: optionsBody(), storeSource: opts.storeSource !== false }) });
        const output = response.output || await getText('/api/v1/builds/' + enc(response.build.id) + '/output');
        lastBuild = response.build;
        $('#output-editor').value = output;
        outputSummary(output);
        $('#output-meta').innerHTML = '<span class="mono">' + esc(response.build.id) + '</span><span>' + esc(DFx.fmtBytes(output.length)) + '</span><span>' + esc((response.build.processingMs || Math.round(performance.now() - started)) + ' ms') + '</span><span>' + esc(formatPreset(response.build.preset)) + ' · ' + esc(formatTarget(response.build.target)) + '</span>';
        showResult(response.build, response.stats || {}, response.warnings || []);
        setBuildState('Protection complete', 'Build ' + response.build.id + ' is available in your history.', false);
        if ((settings().notifications || {}).buildCompletion !== false) notify('ok', 'Protection complete', response.build.id);
      } catch (error) {
        setBuildState('Build failed', error.message, false);
        notify('bad', 'Build failed', error.message);
      }
    }
    $('#protect-button').addEventListener('click', protect);
    $('#save-defaults').addEventListener('click', async () => {
      try {
        const next = { obfuscationDefaults: { target: opts.target, preset: opts.preset, ir: opts.ir, vmMode: opts.vmMode, compression: !!opts.compression } };
        await saveSettings(next);
        notify('ok', 'Build defaults saved', formatTarget(opts.target) + ' · ' + formatPreset(opts.preset));
      } catch (error) { notify('bad', 'Could not save defaults', error.message); }
    });
    if (project) $('#save-project-options').addEventListener('click', async () => {
      try {
        await api('/api/v1/projects/' + enc(project.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: opts.target, preset: opts.preset, options: optionsBody() }) });
        notify('ok', 'Project protection settings saved', project.name);
      } catch (error) { notify('bad', 'Could not save project settings', error.message); }
    });
    state.activeWorkspace = { protect, copy: () => copyText($('#output-editor').value, 'Protected output copied'), download: () => downloadBuild(lastBuild, $('#output-editor').value, filename), editor };
  }

  // --------------------------------------------------------------- projects
  async function renderProjects(root, id) {
    const projects = (await api('/api/v1/projects')).projects || [];
    if (!isCurrent(id)) return;
    state.projects = projects;
    root.innerHTML = '<section class="section-head"><div><h2>Your projects</h2><p>Projects store defaults and metadata. Source is only stored when you opt in per build.</p></div><a class="btn primary" href="/projects/new" data-route="/projects/new">New project</a></section>' +
      (projects.length ? '<section class="project-grid">' + projects.map(projectCard).join('') + '</section>' : empty('No projects yet. Create one to organize future builds.', '/projects/new', 'Create project'));
    root.querySelectorAll('[data-project-delete]').forEach((button) => button.addEventListener('click', () => deleteProject(button.dataset.projectDelete, button.dataset.projectName)));
  }
  function projectCard(p) {
    return '<article class="project-card"><div class="project-card-top"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.description || 'No description') + '</p></div><span class="project-target">' + esc(formatTarget(p.target)) + '</span></div><div class="project-card-meta"><span>' + esc(formatPreset(p.preset)) + '</span><span>' + DFx.fmtNum(p.buildCount || 0) + ' builds</span><span>' + (p.lastBuildAt ? 'Last build ' + esc(DFx.fmtAgo(p.lastBuildAt)) : 'No builds yet') + '</span></div><div class="project-card-actions"><a class="btn sm" href="/projects/' + esc(p.id) + '" data-route="/projects/' + esc(p.id) + '">Open</a><a class="btn sm primary" href="/obfuscate?project=' + enc(p.id) + '" data-route="/obfuscate?project=' + enc(p.id) + '">Build</a><a class="btn sm" href="/projects/' + esc(p.id) + '" data-route="/projects/' + esc(p.id) + '">Settings</a><button class="btn sm danger" data-project-delete="' + esc(p.id) + '" data-project-name="' + esc(p.name) + '">Delete</button></div></article>';
  }
  function renderProjectNew(root) {
    root.innerHTML = '<section class="form-panel narrow"><div class="panel-head"><div><h2>Create project</h2><p>A project stores names, target, and protection defaults—not source unless you later opt in on a build.</p></div></div><div class="field"><label for="new-project-name">Name</label><input id="new-project-name" maxlength="80" placeholder="Example: Main game scripts"></div><div class="field"><label for="new-project-description">Description</label><textarea id="new-project-description" maxlength="500" placeholder="Optional project description"></textarea></div><div class="field-grid"><div class="field"><label for="new-project-target">Target</label><select id="new-project-target"><option value="roblox">Roblox Luau</option><option value="luau">Luau</option></select></div><div class="field"><label for="new-project-preset">Default preset</label><select id="new-project-preset"><option value="lightweight">Lightweight</option><option value="balanced" selected>Balanced</option><option value="maximum">Maximum</option></select></div></div><div class="form-actions"><button class="btn primary" id="create-project" type="button">Create project</button><a class="btn ghost" href="/projects" data-route="/projects">Cancel</a></div></section>';
    $('#create-project').addEventListener('click', async () => {
      const name = $('#new-project-name').value.trim();
      if (!name) { notify('warn', 'Project name required', 'Give the project a recognizable name.'); return; }
      try {
        const r = await api('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('#new-project-description').value.trim(), target: $('#new-project-target').value, preset: $('#new-project-preset').value }) });
        state.projects = null;
        notify('ok', 'Project created', r.project.name);
        navigate('/projects/' + r.project.id);
      } catch (error) { notify('bad', 'Could not create project', error.message); }
    });
  }
  async function renderProjectDetail(root, id, projectId) {
    const [projectR, buildsR] = await Promise.all([api('/api/v1/projects/' + enc(projectId)), api('/api/v1/builds?projectId=' + enc(projectId) + '&limit=25')]);
    if (!isCurrent(id)) return;
    const p = projectR.project;
    const builds = buildsR.items || [];
    root.innerHTML = '<section class="section-head"><div><p class="page-kicker">PROJECT</p><h2>' + esc(p.name) + '</h2><p>' + esc(p.description || 'No description') + '</p></div><div class="section-actions"><a class="btn primary" href="/obfuscate?project=' + enc(p.id) + '" data-route="/obfuscate?project=' + enc(p.id) + '">Build project</a><button class="btn danger" id="delete-project" type="button">Delete</button></div></section>' +
      '<section class="content-grid two-one"><article class="panel"><div class="panel-head"><div><h2>Project builds</h2><p>' + DFx.fmtNum(builds.length) + ' recent entries.</p></div></div>' + buildTable(builds, true) + '</article><aside class="panel"><div class="panel-head"><div><h2>Project settings</h2><p>Changes apply to future project builds.</p></div></div><div class="field"><label for="project-name">Name</label><input id="project-name" maxlength="80" value="' + esc(p.name) + '"></div><div class="field"><label for="project-description">Description</label><textarea id="project-description" maxlength="500">' + esc(p.description || '') + '</textarea></div><div class="field"><label for="project-target">Target</label><select id="project-target"><option value="roblox"' + (p.target === 'roblox' ? ' selected' : '') + '>Roblox Luau</option><option value="luau"' + (p.target === 'luau' ? ' selected' : '') + '>Luau</option></select></div><div class="field"><label for="project-preset">Preset</label><select id="project-preset">' + selectOptions(['lightweight', 'balanced', 'maximum'], p.preset) + '</select></div><button class="btn" id="save-project" type="button">Save settings</button></aside></section>';
    bindBuildActions(root, () => renderProjectDetail(root, id, projectId));
    $('#save-project').addEventListener('click', async () => {
      try {
        await api('/api/v1/projects/' + enc(p.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#project-name').value.trim(), description: $('#project-description').value, target: $('#project-target').value, preset: $('#project-preset').value }) });
        state.projects = null; notify('ok', 'Project settings saved', p.name); route();
      } catch (error) { notify('bad', 'Could not save project', error.message); }
    });
    $('#delete-project').addEventListener('click', () => deleteProject(p.id, p.name));
  }
  function deleteProject(id, name) {
    DFx.confirmModal('Delete project', 'Delete “' + name + '”? Builds remain in history but are no longer linked to this project.', 'Delete project', true, async () => {
      try { await api('/api/v1/projects/' + enc(id), { method: 'DELETE' }); state.projects = null; notify('ok', 'Project deleted', name); navigate('/projects'); }
      catch (error) { notify('bad', 'Could not delete project', error.message); }
    });
  }

  // --------------------------------------------------------------- history
  async function renderHistory(root, id) {
    const existing = new URLSearchParams(location.search);
    const filters = { q: existing.get('q') || '', status: existing.get('status') || '', preset: existing.get('preset') || '', from: existing.get('from') || '', to: existing.get('to') || '', offset: Number(existing.get('offset') || 0) };
    const query = new URLSearchParams();
    ['q', 'status', 'preset', 'from', 'to'].forEach((k) => { if (filters[k]) query.set(k, filters[k]); });
    query.set('limit', '50'); query.set('offset', String(filters.offset));
    const response = await api('/api/v1/builds?' + query.toString());
    if (!isCurrent(id)) return;
    root.innerHTML = '<section class="section-head"><div><h2>Build history</h2><p>' + DFx.fmtNum(response.total) + ' builds stored for your account.</p></div></section><section class="panel"><div class="filter-grid"><input id="history-q" type="search" placeholder="Search filename, build ID, or project" value="' + esc(filters.q) + '"><select id="history-status"><option value="">All statuses</option><option value="success"' + (filters.status === 'success' ? ' selected' : '') + '>Success</option><option value="failed"' + (filters.status === 'failed' ? ' selected' : '') + '>Failed</option></select><select id="history-preset"><option value="">All presets</option>' + selectOptions(['lightweight', 'balanced', 'maximum'], filters.preset) + '</select><label>From<input id="history-from" type="date" value="' + esc(filters.from) + '"></label><label>To<input id="history-to" type="date" value="' + esc(filters.to) + '"></label><button class="btn" id="apply-history" type="button">Apply filters</button></div>' + buildTable(response.items || [], true) + '<div class="pagination">' + (filters.offset > 0 ? '<button class="btn sm" id="previous-history" type="button">Previous</button>' : '') + (filters.offset + 50 < response.total ? '<button class="btn sm" id="next-history" type="button">Next</button>' : '') + '</div></section>';
    bindBuildActions(root, () => route());
    $('#apply-history').addEventListener('click', () => {
      const next = new URLSearchParams();
      const q = $('#history-q').value.trim(), status = $('#history-status').value, preset = $('#history-preset').value, from = $('#history-from').value, to = $('#history-to').value;
      if (q) next.set('q', q); if (status) next.set('status', status); if (preset) next.set('preset', preset); if (from) next.set('from', from); if (to) next.set('to', to);
      navigate('/history' + (next.toString() ? '?' + next.toString() : ''));
    });
    const prev = $('#previous-history'), next = $('#next-history');
    if (prev) prev.addEventListener('click', () => { existing.set('offset', String(Math.max(0, filters.offset - 50))); navigate('/history?' + existing.toString()); });
    if (next) next.addEventListener('click', () => { existing.set('offset', String(filters.offset + 50)); navigate('/history?' + existing.toString()); });
  }
  function buildActionButtons(b) {
    return '<div class="row-buttons"><button class="btn sm" data-build-action="view" data-build-id="' + esc(b.id) + '">View</button>' + (b.hasOutput ? '<button class="btn sm" data-build-action="download" data-build-id="' + esc(b.id) + '">Download</button>' : '') + (b.hasSource ? '<button class="btn sm" data-build-action="rebuild" data-build-id="' + esc(b.id) + '">Rebuild</button>' : '') + '<button class="btn sm danger" data-build-action="delete" data-build-id="' + esc(b.id) + '">Delete</button></div>';
  }
  function bindBuildActions(root, refresh) {
    root.querySelectorAll('[data-build-action]').forEach((button) => button.addEventListener('click', async () => {
      const action = button.dataset.buildAction, buildId = button.dataset.buildId;
      if (action === 'view') { try { showOutputModal(await getText('/api/v1/builds/' + enc(buildId) + '/output'), buildId); } catch (error) { notify('bad', 'Could not load output', error.message); } }
      if (action === 'download') downloadBuild({ id: buildId }, '', 'script.luau');
      if (action === 'rebuild') {
        button.disabled = true;
        try { const r = await api('/api/v1/builds/' + enc(buildId) + '/rebuild', { method: 'POST' }); notify('ok', 'Rebuild complete', r.build.id); refresh(); }
        catch (error) { notify('bad', 'Rebuild failed', error.message); button.disabled = false; }
      }
      if (action === 'delete') DFx.confirmModal('Delete build', 'Delete this stored output and any source retained for rebuild? This cannot be undone.', 'Delete build', true, async () => {
        try { await api('/api/v1/builds/' + enc(buildId), { method: 'DELETE' }); notify('ok', 'Build deleted', buildId); refresh(); }
        catch (error) { notify('bad', 'Could not delete build', error.message); }
      });
    }));
  }

  // -------------------------------------------------------------------- API
  async function renderApi(root, id) {
    const [keysR, statsR] = await Promise.all([api('/api/v1/keys'), api('/api/v1/stats')]);
    if (!isCurrent(id)) return;
    const keys = keysR.keys || [];
    const example = `curl -X POST ${location.origin}/api/v1/obfuscate \
  -H "Authorization: Bearer dk_live_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"print(1)","preset":"balanced","target":"luau"}'`;
    root.innerHTML = '<section class="section-head"><div><h2>API dashboard</h2><p>API keys are hashed server-side and their complete secrets are shown once only.</p></div><button class="btn primary" id="create-api-key" type="button">Create key</button></section><section class="metric-grid compact"><div class="metric-card static"><span>Active keys</span><strong>' + DFx.fmtNum(keys.filter((k) => !k.revokedAt).length) + '</strong><small>Keys currently accepted by the API</small></div><div class="metric-card static"><span>Requests</span><strong>' + DFx.fmtNum(statsR.stats.apiRequests) + '</strong><small>Lifetime request count</small></div><a class="metric-card" href="/docs/api/protect"><span>Documentation</span><strong>API</strong><small>Authentication and endpoint reference →</small></a></section><section class="panel"><div class="panel-head"><div><h2>Keys</h2><p>Use a named key in an Authorization Bearer header.</p></div></div>' +
      (keys.length ? '<div class="data-scroll"><table class="platform-table"><thead><tr><th>Name</th><th>Prefix</th><th>Requests</th><th>Last used</th><th>Created</th><th>Status</th><th></th></tr></thead><tbody>' + keys.map((k) => '<tr><td data-label="Name">' + esc(k.name || 'Unnamed key') + '</td><td data-label="Prefix" class="mono">' + esc(k.prefix) + '…</td><td data-label="Requests">' + DFx.fmtNum(k.total || 0) + '</td><td data-label="Last used">' + esc(k.lastUsed ? DFx.fmtAgo(k.lastUsed) : 'Never') + '</td><td data-label="Created">' + esc(DFx.fmtDate(k.createdAt)) + '</td><td data-label="Status">' + statusChip(k.revokedAt ? 'revoked' : 'active') + '</td><td><div class="row-buttons"><button class="btn sm" data-key-action="requests" data-key-id="' + esc(k.id) + '">Requests</button>' + (!k.revokedAt ? '<button class="btn sm" data-key-action="rename" data-key-id="' + esc(k.id) + '">Rename</button><button class="btn sm danger" data-key-action="revoke" data-key-id="' + esc(k.id) + '">Revoke</button>' : '') + '</div></td></tr>').join('') + '</tbody></table></div>' : empty('No API keys yet. Create one to call the protected build API.', null, null)) + '</section><section class="panel api-example"><div class="panel-head"><div><h2>Protect endpoint</h2><p>Only the API key holder can submit requests as that key.</p></div><a class="text-link" href="/docs/api/protect">Full API docs</a></div><pre><code>' + esc(example) + '</code></pre><button class="btn sm copy-code" type="button">Copy example</button></section>';
    $('#create-api-key').addEventListener('click', () => createKeyDialog(root));
    $('.copy-code', root).addEventListener('click', () => copyText($('.api-example code', root).textContent, 'API example copied'));
    root.querySelectorAll('[data-key-action]').forEach((button) => button.addEventListener('click', () => keyAction(button.dataset.keyAction, button.dataset.keyId, root)));
  }
  function createKeyDialog(root) {
    DFx.openModal({ title: 'Create API key', body: '<div class="field"><label for="api-key-name">Key name</label><input id="api-key-name" maxlength="80" placeholder="CI build pipeline"><p class="hint">The full key is shown once. Store it before closing the next dialog.</p></div>', buttons: [{ label: 'Cancel' }, { label: 'Create key', style: 'primary', onClick: () => { createKey(root); return false; } }] });
  }
  async function createKey(root) {
    try {
      const response = await api('/api/v1/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#api-key-name').value.trim() }) });
      DFx.closeModal();
      DFx.openModal({ title: 'Store this API key now', body: '<p>This is the only time the complete secret is displayed.</p><div class="key-reveal mono" id="new-api-key">' + esc(response.key) + '</div><button class="btn" id="copy-new-api-key" type="button">Copy key</button>', buttons: [{ label: 'I stored it', style: 'primary' }] });
      $('#copy-new-api-key').addEventListener('click', () => copyText(response.key, 'API key copied'));
      renderApi(root, state.renderId);
    } catch (error) { notify('bad', 'Could not create key', error.message); }
  }
  async function keyAction(action, id, root) {
    if (action === 'revoke') {
      DFx.confirmModal('Revoke API key', 'Requests using this key will stop immediately. Revocation cannot be undone.', 'Revoke key', true, async () => {
        try { await api('/api/v1/keys/' + enc(id), { method: 'DELETE' }); notify('ok', 'API key revoked'); renderApi(root, state.renderId); }
        catch (error) { notify('bad', 'Could not revoke key', error.message); }
      }); return;
    }
    if (action === 'rename') {
      DFx.openModal({ title: 'Rename API key', body: '<div class="field"><label for="rename-key">Name</label><input id="rename-key" maxlength="80"></div>', buttons: [{ label: 'Cancel' }, { label: 'Save', style: 'primary', onClick: () => { renameKey(id, root); return false; } }] }); return;
    }
    if (action === 'requests') {
      try {
        const response = await api('/api/v1/keys/' + enc(id) + '/requests');
        const rows = response.requests || [];
        DFx.openModal({ title: 'Recent key requests', body: rows.length ? '<div class="data-scroll"><table class="platform-table"><thead><tr><th>When</th><th>Endpoint</th><th>Status</th><th>Time</th></tr></thead><tbody>' + rows.map((r) => '<tr><td>' + esc(DFx.fmtDate(r.ts)) + '</td><td class="mono">' + esc(r.path) + '</td><td>' + statusChip(String(r.status) === '200' ? 'success' : 'failed') + '</td><td>' + esc((r.ms || 0) + ' ms') + '</td></tr>').join('') + '</tbody></table></div>' : '<p>No requests are recorded for this key yet.</p>' });
      } catch (error) { notify('bad', 'Could not load requests', error.message); }
    }
  }
  async function renameKey(id, root) { try { await api('/api/v1/keys/' + enc(id) + '/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#rename-key').value.trim() }) }); DFx.closeModal(); notify('ok', 'API key renamed'); renderApi(root, state.renderId); } catch (error) { notify('bad', 'Could not rename key', error.message); } }

  // --------------------------------------------------------------- settings
  async function renderSettings(root, id) {
    const me = await api('/api/v1/me');
    const sessionsR = await api('/api/v1/me/sessions');
    if (!isCurrent(id)) return;
    state.user = me.user;
    const u = state.user, s = settings(), a = s.appearance || {}, ed = editorPrefs(), ob = defaults(), notices = s.notifications || {};
    root.innerHTML = '<section class="settings-section"><div class="section-head"><div><h2>Profile</h2><p>Changes are validated and authorized on the server.</p></div></div><div class="panel"><div class="field-grid"><div class="field"><label for="set-username">Username</label><input id="set-username" maxlength="24" value="' + esc(u.username) + '"></div><div class="field"><label>Email</label><div class="readonly-value">' + esc(u.email) + '</div></div></div><div class="form-actions"><button class="btn" id="save-profile" type="button">Save username</button><button class="btn" id="change-email" type="button">Change email</button></div></div></section>' +
      '<section class="settings-section"><div class="section-head"><div><h2>Security</h2><p>Review access and take action on every session.</p></div></div><div class="content-grid two-one"><article class="panel"><div class="panel-head"><div><h3>Active sessions</h3><p>Sessions expire automatically. You can revoke any device.</p></div><button class="btn sm danger" id="logout-all" type="button">Logout all</button></div>' + sessionList(sessionsR.sessions || []) + '</article><aside class="panel"><h3>Password</h3><p class="muted">Changing your password signs out other active sessions.</p><button class="btn" id="change-password" type="button">Change password</button><div class="line"></div><h3>Security events</h3><button class="text-link button-link" id="show-events" type="button">View recent activity</button></aside></div></section>' +
      '<section class="settings-section"><div class="section-head"><div><h2>Appearance</h2><p>Preferences are saved to your account and applied immediately.</p></div></div><div class="panel settings-inline-grid"><div class="field"><label for="set-theme">Theme</label><select id="set-theme"><option value="dark"' + (a.theme !== 'light' ? ' selected' : '') + '>Dark</option><option value="light"' + (a.theme === 'light' ? ' selected' : '') + '>Light</option></select></div><div class="field"><label for="set-accent">Accent</label><select id="set-accent"><option value="orange"' + (a.accent !== 'purple' ? ' selected' : '') + '>Orange</option><option value="purple"' + (a.accent === 'purple' ? ' selected' : '') + '>Purple</option></select></div><div class="toggle-setting"><span><strong>Compact mode</strong><small>Tighter spacing in the app shell.</small></span><button class="toggle-control" id="set-compact" type="button"><span></span></button></div></div></section>' +
      '<section class="settings-section"><div class="section-head"><div><h2>Editor</h2><p>These settings control the source editor used by the workspace.</p></div></div><div class="panel settings-inline-grid"><div class="field"><label for="set-font-size">Font size</label><select id="set-font-size">' + selectOptions([11, 12, 13, 14, 16, 18], ed.fontSize) + '</select></div><div class="field"><label for="set-tab-size">Tab size</label><select id="set-tab-size">' + selectOptions([2, 4, 8], ed.tabSize) + '</select></div>' + toggleSetting('set-wrap', 'Word wrap', 'Wrap long editor lines.', !!ed.wordWrap) + toggleSetting('set-line-numbers', 'Line numbers', 'Show a line-number gutter.', ed.lineNumbers !== false) + toggleSetting('set-highlighting', 'Syntax highlighting', 'Highlight supported Luau syntax.', ed.highlighting !== false) + '</div></section>' +
      '<section class="settings-section"><div class="section-head"><div><h2>Obfuscation defaults</h2><p>Applied to a new workspace unless a project overrides them.</p></div></div><div class="panel settings-inline-grid"><div class="field"><label for="set-default-target">Target</label><select id="set-default-target"><option value="roblox"' + (ob.target === 'roblox' ? ' selected' : '') + '>Roblox Luau</option><option value="luau"' + (ob.target === 'luau' ? ' selected' : '') + '>Luau</option></select></div><div class="field"><label for="set-default-preset">Preset</label><select id="set-default-preset">' + selectOptions(['lightweight', 'balanced', 'maximum'], ob.preset) + '</select></div><div class="field"><label for="set-default-ir">Source IR</label><select id="set-default-ir">' + selectOptions(IR_MODES, ob.ir || 'balanced') + '</select></div><div class="field"><label for="set-default-mode">VM mode</label><select id="set-default-mode">' + selectOptions(PROTECTION_MODES, ob.vmMode || 'balanced') + '</select></div>' + toggleSetting('set-default-compression', 'Compress payload', 'Run the optional output size pass.', ob.compression !== false) + '</div></section>' +
      '<section class="settings-section"><div class="section-head"><div><h2>Notifications</h2><p>Only notifications implemented by this platform are shown.</p></div></div><div class="panel">' + toggleSetting('set-build-notification', 'Build completion toast', 'Show a browser toast after this tab receives a completed build.', notices.buildCompletion !== false) + '</div></section>' +
      '<section class="danger-panel"><div><h2>Danger zone</h2><p>Deleting your account revokes sessions and API keys and removes stored projects, builds, sources, and output blobs.</p></div><button class="btn danger" id="delete-account" type="button">Delete account</button></section><div class="form-actions sticky-save"><button class="btn primary" id="save-settings" type="button">Save settings</button></div>';
    setToggle($('#set-compact'), !!a.compact); setToggle($('#set-wrap'), !!ed.wordWrap); setToggle($('#set-line-numbers'), ed.lineNumbers !== false); setToggle($('#set-highlighting'), ed.highlighting !== false); setToggle($('#set-default-compression'), ob.compression !== false); setToggle($('#set-build-notification'), notices.buildCompletion !== false);
    ['#set-compact', '#set-wrap', '#set-line-numbers', '#set-highlighting', '#set-default-compression', '#set-build-notification'].forEach((selector) => $(selector).addEventListener('click', () => setToggle($(selector), !readToggle(selector))));
    $('#save-profile').addEventListener('click', async () => { try { const r = await api('/api/v1/me/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#set-username').value.trim() }) }); state.user = Object.assign(state.user, r.user); populateShell(); notify('ok', 'Username updated'); } catch (error) { notify('bad', 'Could not update username', error.message); } });
    $('#change-email').addEventListener('click', showEmailDialog);
    $('#change-password').addEventListener('click', showPasswordDialog);
    $('#logout-all').addEventListener('click', () => DFx.confirmModal('Logout every session', 'This device is included. You will be sent to sign in.', 'Logout all', true, async () => { try { await api('/api/v1/auth/logout-all', { method: 'POST' }); location.href = '/login?logged=out'; } catch (error) { notify('bad', 'Could not log out', error.message); } }));
    root.querySelectorAll('[data-session-revoke]').forEach((button) => button.addEventListener('click', async () => { try { await api('/api/v1/me/sessions/' + enc(button.dataset.sessionRevoke), { method: 'DELETE' }); notify('ok', 'Session revoked'); route(); } catch (error) { notify('bad', 'Could not revoke session', error.message); } }));
    $('#show-events').addEventListener('click', showSecurityEvents);
    $('#delete-account').addEventListener('click', showDeleteAccountDialog);
    $('#save-settings').addEventListener('click', async () => {
      try {
        const next = { appearance: { theme: $('#set-theme').value, accent: $('#set-accent').value, compact: readToggle('#set-compact') }, editor: { fontSize: Number($('#set-font-size').value), tabSize: Number($('#set-tab-size').value), wordWrap: readToggle('#set-wrap'), lineNumbers: readToggle('#set-line-numbers'), highlighting: readToggle('#set-highlighting') }, obfuscationDefaults: { target: $('#set-default-target').value, preset: $('#set-default-preset').value, ir: $('#set-default-ir').value, vmMode: $('#set-default-mode').value, compression: readToggle('#set-default-compression') }, notifications: { buildCompletion: readToggle('#set-build-notification') } };
        await saveSettings(next); applyAppearance(); notify('ok', 'Settings saved');
      } catch (error) { notify('bad', 'Could not save settings', error.message); }
    });
  }
  function sessionList(sessions) {
    if (!sessions.length) return '<p class="muted">No active sessions found.</p>';
    return '<div class="session-list">' + sessions.map((s) => '<div class="session-row"><div><strong>' + (s.current ? 'Current session' : 'Active session') + '</strong><span>' + esc(s.ip || 'Unknown IP') + ' · ' + esc(DFx.fmtAgo(s.lastSeen)) + '</span><small>' + esc(s.ua || '') + '</small></div>' + (s.current ? '<span class="status-chip good">Current</span>' : '<button class="btn sm danger" data-session-revoke="' + esc(s.id) + '">Revoke</button>') + '</div>').join('') + '</div>';
  }
  function toggleSetting(id, title, desc, on) { return '<div class="toggle-setting"><span><strong>' + esc(title) + '</strong><small>' + esc(desc) + '</small></span><button class="toggle-control' + (on ? ' on' : '') + '" id="' + esc(id) + '" type="button" aria-checked="' + (on ? 'true' : 'false') + '"><span></span></button></div>'; }
  async function saveSettings(next) { const response = await api('/api/v1/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: next }) }); state.user.settings = response.settings; }
  function showEmailDialog() { DFx.openModal({ title: 'Change email', body: '<p>Your new email must be verified before it replaces the current one.</p><div class="field"><label for="new-email">New email</label><input id="new-email" type="email" autocomplete="email"></div><div class="field"><label for="email-password">Current password</label><input id="email-password" type="password" autocomplete="current-password"></div>', buttons: [{ label: 'Cancel' }, { label: 'Send verification', style: 'primary', onClick: () => { changeEmail(); return false; } }] }); }
  async function changeEmail() { try { const r = await api('/api/v1/me/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newEmail: $('#new-email').value.trim(), password: $('#email-password').value }) }); DFx.closeModal(); notify(r.emailSent === false ? 'warn' : 'ok', r.emailSent === false ? 'Email delivery unavailable' : 'Verification sent', r.emailSent === false ? (r.emailNote || 'The server did not claim to send an email.') : 'Confirm the new address to finish the change.'); } catch (error) { notify('bad', 'Could not change email', error.message); } }
  function showPasswordDialog() { DFx.openModal({ title: 'Change password', body: '<div class="field"><label for="current-password">Current password</label><input id="current-password" type="password" autocomplete="current-password"></div><div class="field"><label for="next-password">New password</label><input id="next-password" type="password" autocomplete="new-password"><p class="hint">At least 8 characters including a letter and a number.</p></div>', buttons: [{ label: 'Cancel' }, { label: 'Change password', style: 'primary', onClick: () => { changePassword(); return false; } }] }); }
  async function changePassword() { try { await api('/api/v1/me/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ current: $('#current-password').value, next: $('#next-password').value }) }); DFx.closeModal(); notify('ok', 'Password changed', 'Other active sessions were revoked.'); } catch (error) { notify('bad', 'Could not change password', error.message); } }
  async function showSecurityEvents() { try { const r = await api('/api/v1/me/security-events'); DFx.openModal({ title: 'Recent security activity', body: r.events.length ? '<div class="security-events">' + r.events.map((event) => '<div><strong>' + esc(event.kind.replace(/_/g, ' ')) + '</strong><span>' + esc(event.detail) + '</span><small>' + esc(DFx.fmtDate(event.createdAt)) + ' · ' + esc(event.ip || '') + '</small></div>').join('') + '</div>' : '<p>No security events recorded.</p>' }); } catch (error) { notify('bad', 'Could not load activity', error.message); } }
  function showDeleteAccountDialog() { DFx.openModal({ title: 'Delete account permanently', body: '<p>This cannot be undone. Enter your current password to delete the account and all stored platform data.</p><div class="field"><label for="delete-password">Current password</label><input id="delete-password" type="password" autocomplete="current-password"></div>', buttons: [{ label: 'Cancel' }, { label: 'Delete account', style: 'danger', onClick: () => { deleteAccount(); return false; } }] }); }
  async function deleteAccount() { try { await api('/api/v1/me', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#delete-password').value }) }); location.href = '/?account=deleted'; } catch (error) { notify('bad', 'Could not delete account', error.message); } }

  // ---------------------------------------------------------------- account
  async function renderAccount(root, id) {
    const [me, sessions] = await Promise.all([api('/api/v1/me'), api('/api/v1/me/sessions')]);
    if (!isCurrent(id)) return;
    state.user = me.user;
    const u = state.user;
    root.innerHTML = '<section class="account-overview"><div class="account-big-avatar">' + esc(initials(u.username)) + '</div><div><p class="page-kicker">DARKFUSCATOR ACCOUNT</p><h2>' + esc(u.username) + '</h2><p class="mono">' + esc(u.email) + '</p><span class="status-chip ' + (u.verified ? 'good' : 'neutral') + '">' + (u.verified ? 'Email verified' : 'Email verification pending') + '</span></div><div class="account-overview-actions"><a class="btn" href="/settings" data-route="/settings">Manage settings</a><a class="btn primary" href="/obfuscate" data-route="/obfuscate">Protect a script</a></div></section><section class="content-grid two-one"><article class="panel"><div class="panel-head"><div><h2>Account details</h2><p>Identity and access information from the backend.</p></div></div><dl class="details-list"><div><dt>Username</dt><dd>' + esc(u.username) + '</dd></div><div><dt>Email</dt><dd>' + esc(u.email) + '</dd></div><div><dt>Verification</dt><dd>' + (u.verified ? 'Verified' : '<a class="text-link" href="/verify-email">Verify email</a>') + '</dd></div><div><dt>Created</dt><dd>' + esc(DFx.fmtDate(u.createdAt)) + '</dd></div></dl></article><aside class="panel"><div class="panel-head"><div><h2>Sessions</h2><p>' + DFx.fmtNum(sessions.sessions.length) + ' active session' + (sessions.sessions.length === 1 ? '' : 's') + '.</p></div></div><a class="btn" href="/settings" data-route="/settings">Review security</a></aside></section><section class="danger-panel"><div><h2>Account controls</h2><p>Change your email or password, end sessions, and delete your account from settings.</p></div><a class="btn danger" href="/settings" data-route="/settings">Open security settings</a></section>';
  }

  // ----------------------------------------------------------- shared actions
  async function copyText(text, success) {
    if (!text) { notify('warn', 'Nothing to copy', 'Create or view a build first.'); return; }
    try { await navigator.clipboard.writeText(text); notify('ok', success || 'Copied'); }
    catch (error) { notify('warn', 'Clipboard blocked', 'Select the text and copy it manually.'); }
  }
  function downloadBuild(build, fallback, filename) {
    if (build && build.id && build.hasOutput !== false) {
      const a = document.createElement('a'); a.href = '/api/v1/builds/' + enc(build.id) + '/output'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); return;
    }
    if (!fallback) { notify('warn', 'Nothing to download', 'Create or view a build first.'); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([fallback], { type: 'text/plain' })); a.download = String(filename || 'script.luau').replace(/\.[^.]+$/, '') + '.protected.luau'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function showOutputModal(text, buildId) {
    if (!text) { notify('warn', 'No output available'); return; }
    DFx.openModal({ title: buildId ? 'Build ' + buildId : 'Protected output', body: '<textarea class="modal-output mono" readonly spellcheck="false">' + esc(text) + '</textarea><div class="form-actions"><button class="btn" id="modal-copy-output" type="button">Copy output</button></div>', buttons: [{ label: 'Close' }] });
    $('#modal-copy-output').addEventListener('click', () => copyText(text, 'Protected output copied'));
  }

  // --------------------------------------------------------------- keyboard
  function installEvents() {
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('#account-trigger');
      if (trigger) {
        event.stopPropagation();
        const menu = $('#account-popover'); const nowHidden = !menu.hidden;
        menu.hidden = nowHidden; trigger.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
      } else if (!event.target.closest('#account-popover')) { $('#account-popover').hidden = true; $('#account-trigger').setAttribute('aria-expanded', 'false'); }
    });
    $('#side-collapse').addEventListener('click', () => { const on = !$('#platform-shell').classList.contains('sidebar-collapsed'); $('#platform-shell').classList.toggle('sidebar-collapsed', on); localStorage.setItem('dk_sidebar_collapsed', on ? '1' : '0'); });
    $('#mobile-menu').addEventListener('click', toggleMobileNav);
    $('#nav-scrim').addEventListener('click', closeMobileNav);
    $('#theme-toggle').addEventListener('click', () => { const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; localStorage.setItem('dk_theme', next); document.documentElement.setAttribute('data-theme', next); document.body.setAttribute('data-theme', next); });
    window.addEventListener('popstate', route);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { closeMobileNav(); $('#account-popover').hidden = true; }
      const workspace = state.activeWorkspace;
      if (!workspace) return;
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); workspace.protect(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); workspace.download(); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'c') { event.preventDefault(); workspace.copy(); }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') { event.preventDefault(); workspace.editor.openSearch(); }
    });
    $('#palette-btn').addEventListener('click', () => DFx.paletteOpen([], window.PaletteSource));
    bindRoutes(document);
  }
  window.PaletteSource = async function (query) {
    const fixed = [
      { label: 'Dashboard', hint: 'Overview', href: '/dashboard', ico: '▦' },
      { label: 'Obfuscate', hint: 'Protect source', href: '/obfuscate', ico: '⌘' },
      { label: 'Projects', hint: 'Protection profiles', href: '/projects', ico: '◇' },
      { label: 'Build History', hint: 'Stored builds', href: '/history', ico: '◷' },
      { label: 'API', hint: 'Keys and usage', href: '/api', ico: '{}' },
      { label: 'Documentation', hint: 'Guides and API reference', href: '/docs', ico: '?' },
      { label: 'Settings', hint: 'Account preferences', href: '/settings', ico: '⚙' },
      { label: 'Account', hint: 'Profile and security', href: '/account', ico: '◉' }
    ];
    if (!query || query.length < 2) return fixed;
    try {
      const [projects, builds] = await Promise.all([api('/api/v1/projects'), api('/api/v1/builds?limit=6&q=' + enc(query))]);
      const p = (projects.projects || []).filter((x) => x.name.toLowerCase().includes(query.toLowerCase())).map((x) => ({ label: 'Project: ' + x.name, hint: formatTarget(x.target), href: '/projects/' + x.id, ico: '◇' }));
      const b = (builds.items || []).map((x) => ({ label: 'Build: ' + (x.filename || x.id), hint: x.id, href: '/history?q=' + enc(x.id), ico: '◷' }));
      return p.concat(b, fixed);
    } catch (error) { return fixed; }
  };

  async function boot() {
    try {
      const me = await api('/api/v1/me', null, true);
      if (!me || !me.ok) { location.href = '/login?next=' + enc(location.pathname + location.search); return; }
      state.user = me.user;
      if (!state.user.settings) state.user.settings = me.settings || {};
      populateShell();
      document.body.classList.remove('pre-boot');
      installEvents();
      loadSystem();
      route();
    } catch (error) {
      location.href = '/login?next=' + enc(location.pathname + location.search);
    }
  }
  document.addEventListener('DOMContentLoaded', boot);
})();
