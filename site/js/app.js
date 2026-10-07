/* app.js — Darkfuscator platform application: shell, router and views.
 * All builds go through the platform API. No fake data anywhere. */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const DFx = window.DF;
  const S = {
    user: null, stats: null, system: null, projects: [],
    builds: [], buildsTotal: 0, currentProject: null, view: 'dashboard'
  };

  // ---------------------------------------------------------------- api helper
  async function api(path, opts, opts2) {
    opts = opts || {};
    opts2 = opts2 || {};
    const res = await fetch(path, Object.assign({ credentials: 'same-origin' }, opts));
    if (res.status === 401 && !opts2.allow401) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.hash);
      throw new Error('not signed in');
    }
    let data = {};
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error(data.error || ('HTTP ' + res.status));
      err.status = res.status; err.data = data; err.retryAfter = data.retryAfter;
      throw err;
    }
    return data;
  }

  // ------------------------------------------------------------------- theme
  function applyTheme() {
    const s = (S.user && S.user.settings) || {};
    const a = s.appearance || {};
    const theme = localStorage.getItem('dk_theme') || a.theme || 'dark';
    const accent = a.accent || 'orange';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-accent', accent);
    const themeBtn = $('#theme-toggle');
    if (themeBtn) themeBtn.textContent = theme === 'dark' ? 'Light' : 'Dark';
  }

  // ------------------------------------------------------------------- router
  const VIEWS = {
    '/dashboard': 'Dashboard',
    '/obfuscate': 'Obfuscate',
    '/projects': 'Projects',
    '/projects/new': 'New Project',
    '/history': 'Build History',
    '/api-keys': 'API Keys',
    '/settings': 'Settings',
    '/account': 'Account'
  };

  function route(path) {
    path = path || location.pathname;
    let view = VIEWS[path] ? path : null;
    let m = path.match(/^\/projects\/([A-Za-z0-9_-]+)$/);
    if (m) view = '/projects/:id';
    if (!view) view = '/dashboard';
    S.view = view;
    document.querySelectorAll('#nav a[data-route]').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-route') === view ||
        (view === '/projects/:id' && a.getAttribute('data-route') === '/projects') ||
        (view === '/projects/new' && a.getAttribute('data-route') === '/projects'));
    });
    $('#view-title').textContent = VIEWS[path] ? VIEWS[path] : (m ? 'Project' : 'Dashboard');
    document.title = (VIEWS[path] || 'Project') + ' - Darkfuscator';
    const root = $('#view-root');
    root.innerHTML = '<div class="view-loading">Loading</div>';
    if (view === '/dashboard') renderDashboard(root);
    else if (view === '/obfuscate') renderObfuscate(root);
    else if (view === '/projects') renderProjects(root);
    else if (view === '/projects/new') renderProjectNew(root);
    else if (view === '/projects/:id') renderProjectDetail(root, m[1]);
    else if (view === '/history') renderHistory(root);
    else if (view === '/api-keys') renderApiKeys(root);
    else if (view === '/settings') renderSettings(root);
    else if (view === '/account') renderAccount(root);
  }

  function navigate(path) {
    if (location.pathname === path) { route(path); return; }
    history.pushState(null, '', path);
    route(path);
  }

  // ------------------------------------------------------------------ boot
  async function boot() {
    try {
      const me = await api('/api/v1/me');
      S.user = me.user || me;
    } catch (e) {
      if (e.message !== 'not signed in') {
        DFx.toast('Could not load your account', e.message, 'bad');
      }
      return;
    }
    const name = S.user.username || '';
    $('#nav-user').textContent = name;
    $('#acct-menu-name').textContent = name;
    $('#acct-menu-email').textContent = S.user.email || '';
    $('#acct-verified').hidden = !!S.user.verified;
    if (!S.user.verified) {
      $('#acct-verified').textContent = 'unverified';
      $('#acct-verified').className = 'badge warn';
    }
    $('#greet-line').textContent = 'Welcome back, ' + name;
    applyTheme();
    document.body.classList.remove('pre-boot');
    route();
    loadStats();
  }

  async function loadStats() {
    try {
      const d = await api('/api/v1/stats');
      S.stats = d.stats;
      const chips = $('#stat-quick');
      if (chips && S.view === '/dashboard') {} // rendered per view
      if (S.view === '/dashboard') route();
    } catch (e) {}
  }

  async function loadSystem() {
    try { const d = await api('/api/v1/system'); S.system = d.system; }
    catch (e) { S.system = { ok: false, note: e.message }; }
    const dot = $('#sys-dot');
    if (dot) {
      dot.className = 'sys-dot ' + (S.system && S.system.ok ? 'ok' : 'bad');
      dot.title = S.system && S.system.ok ? 'engine ' + (S.system.engine || S.system.version || '') : 'system check failed';
    }
  }

  // ================================================================ DASHBOARD
  async function renderDashboard(root) {
    const u = S.user;
    let stats = S.stats;
    if (!stats) { try { stats = (await api('/api/v1/stats')).stats; S.stats = stats; } catch (e) { stats = { totalBuilds: 0, successfulBuilds: 0, failedBuilds: 0, projects: 0, apiRequests: 0 }; } }
    let recent = [];
    try { const d = await api('/api/v1/builds?limit=5'); recent = d.items; S.buildsTotal = d.total; } catch (e) {}
    const sys = S.system;
    root.innerHTML =
      '<div class="stat-grid">' +
        statCard('Total builds', DFx.fmtNum(stats.totalBuilds), '/history', 'View history') +
        statCard('Successful', DFx.fmtNum(stats.successfulBuilds), '/history?status=success', 'View history') +
        statCard('Projects', DFx.fmtNum(stats.projects), '/projects', 'Manage projects') +
        statCard('API requests', DFx.fmtNum(stats.apiRequests), '/api-keys', 'View API keys') +
      '</div>' +
      '<div class="dash-cols">' +
        '<section class="card"><div class="card-head"><h2 class="card-title">Recent builds</h2>' +
          '<a class="link" href="/history">View all</a></div>' +
          '<div class="table-wrap"><table class="data-table"><thead><tr>' +
          '<th>File</th><th>Preset</th><th>Target</th><th>Status</th><th>When</th></tr></thead><tbody>' +
          (recent.length ? recent.map(buildRow).join('') :
            '<tr><td colspan="5" class="empty">No builds yet. Your first obfuscation shows up here.</td></tr>') +
          '</tbody></table></div></section>' +
        '<section class="card">' +
          '<div class="card-head"><h2 class="card-title">Quick actions</h2></div>' +
          '<div class="qa-grid">' +
            '<a class="qa" href="/obfuscate"><span class="qa-ico">01</span>Obfuscate a script</a>' +
            '<a class="qa" href="/projects/new"><span class="qa-ico">02</span>Create a project</a>' +
            '<a class="qa" href="/api-keys"><span class="qa-ico">03</span>Generate an API key</a>' +
            '<a class="qa" href="/docs"><span class="qa-ico">04</span>Read the API docs</a>' +
          '</div>' +
          '<div class="line"></div>' +
          '<div class="card-head"><h2 class="card-title">System status</h2></div>' +
          '<div id="sys-list"><div class="empty">Checking</div></div>' +
        '</section>' +
      '</div>';
    bindDataTableLinks(root);
    try {
      const d = await api('/api/v1/system');
      S.system = d.system;
      const list = $('#sys-list');
      if (list) {
        const sysd = S.system || {};
        list.innerHTML =
          sysItem('Obfuscation engine', sysd.engine !== false && sysd.ok !== false, (sysd.engineVersion || '') || (sysd.version || '')) +
          sysItem('Database', sysd.database !== false, sysd.databaseNote || '') +
          sysItem('Build API', sysd.api !== false, '') +
          sysItem('Authentication', sysd.auth !== false, '');
      }
    } catch (e) {
      const list = $('#sys-list');
      if (list) list.innerHTML = '<div class="empty">System check failed: ' + DFx.esc(e.message) + '</div>';
    }
  }
  function statCard(label, value, href, hint) {
    return '<a class="stat-card" href="' + href + '"><span class="stat-label">' + DFx.esc(label) + '</span>' +
      '<span class="stat-value">' + value + '</span><span class="stat-hint">' + DFx.esc(hint) + '</span></a>';
  }
  function sysItem(name, ok, note) {
    return '<div class="sys-item"><span class="sys-dot ' + (ok ? 'ok' : 'bad') + '"></span>' +
      '<span>' + DFx.esc(name) + (note ? ' <span class="dim">' + DFx.esc(note) + '</span>' : '') + '</span></div>';
  }
  function statusBadge(s) {
    const ok = s === 'success';
    return '<span class="badge ' + (ok ? 'ok' : 'bad') + '">' + DFx.esc(ok ? 'success' : (s || 'failed')) + '</span>';
  }
  function buildRow(b) {
    return '<tr><td class="mono">' + DFx.esc(b.filename || b.id) + '</td><td>' + DFx.esc(b.preset || '') +
      '</td><td>' + DFx.esc(b.target || '') + '</td><td>' + statusBadge(b.status) +
      '</td><td title="' + DFx.esc(b.createdAt || '') + '">' + DFx.fmtAgo(b.createdAt) + '</td></tr>';
  }
  function bindDataTableLinks(root) {
    root.querySelectorAll('a[data-route]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); navigate(a.getAttribute('href')); });
    });
  }

  // ================================================================ OBFUSCATE
  const OPT_DEFS = {
    vmLayers: { label: 'VM layers', type: 'select', options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], def: '10', hint: 'Stacked proprietary VMs, outer to inner.' },
    junk: { label: 'Junk level', type: 'select', options: ['0', '1', '2', '3', '4'], def: '3', hint: '3 wraps the build in about 900 KB of dead code; 4 goes to about 2 MB.' },
    guard: { label: 'Guard level', type: 'select', options: ['0', '1', '2'], def: '2', hint: 'Silent checksum and integrity guards.' },
    envChecks: { label: 'Anti-env probes', type: 'select', options: ['0', '1', '2'], def: '2', hint: 'Detects environment-logging tools and dumps.' },
    antiTamper: { label: 'Anti-tamper', type: 'select', options: [['0', 'Off'], ['1', 'Fast'], ['2', 'Full']], def: '2', hint: 'Full re-verifies bytecode with strong keys.' }
  };

  async function renderObfuscate(root, projectId) {
    const d = (S.user.settings || {}).obfuscationDefaults || {};
    const target = projectId ? '' : (d.target || 'roblox');
    const preset = projectId ? '' : (d.preset || 'maximum');
    let project = null;
    if (projectId) {
      try { project = (await api('/api/v1/projects/' + encodeURIComponent(projectId))).project; } catch (e) { DFx.toast('Project not found', e.message, 'bad'); navigate('/projects'); return; }
    }
    root.innerHTML =
      '<section class="card" id="obf-card">' +
        '<div class="card-head"><h2 class="card-title">' + (project ? 'Protect for ' + DFx.esc(project.name) : 'Protect a script') + '</h2>' +
        '<span class="dim" id="obf-target-info">' + (project ? '' : 'target ' + DFx.esc(target) + ' / preset ' + DFx.esc(preset)) + '</span></div>' +
        '<div class="obf-grid">' +
          '<section class="pane" id="pane-in">' +
            '<div class="pane-head"><span class="pane-title">Source</span><span class="meta" id="inmeta">0 chars</span></div>' +
            '<div id="in-editor"></div>' +
            '<div class="pane-foot">' +
              '<label class="file-btn">Load file<input type="file" id="file" accept=".lua,.luau,.txt"></label>' +
              '<button class="btn" id="paste">Paste</button>' +
              '<button class="btn" id="example">Load example</button>' +
              '<button class="btn" id="clear">Clear</button>' +
            '</div>' +
          '</section>' +
          '<section class="pane" id="pane-out">' +
            '<div class="pane-head"><span class="pane-title">Output</span><span class="meta" id="outmeta">0 chars</span></div>' +
            '<textarea id="output" spellcheck="false" readonly></textarea>' +
            '<div class="pane-foot">' +
              '<button class="btn" id="copy">Copy</button>' +
              '<button class="btn" id="download">Download</button>' +
              '<span class="verified" id="verified-badge" hidden>re-parsed as valid Luau</span>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '<div class="action-row">' +
          '<button class="btn primary" id="protect">Obfuscate</button>' +
          (project ? '<button class="btn" id="save-proj">Save options to project</button>' : '') +
          '<span class="status" id="status">Ready.</span>' +
        '</div>' +
        '<div class="error" id="error" hidden></div>' +
        '<div class="stats" id="stats" hidden>' +
          '<div class="stat"><span class="stat-k">Build ID</span><span class="stat-v mono" id="st-buildid">-</span></div>' +
          '<div class="stat"><span class="stat-k">Output size</span><span class="stat-v" id="st-outsize">-</span></div>' +
          '<div class="stat"><span class="stat-k">Processing time</span><span class="stat-v" id="st-time">-</span></div>' +
          '<div class="stat"><span class="stat-k">Payload chars</span><span class="stat-v" id="st-payload">-</span></div>' +
          '<div class="stat"><span class="stat-k">VMs</span><span class="stat-v" id="st-vms">-</span></div>' +
          '<div class="stat"><span class="stat-k">Seed</span><span class="stat-v" id="st-seed">-</span></div>' +
        '</div>' +
      '</section>' +
      '<section class="card" id="advanced">' +
        '<h2 class="card-title">Settings</h2>' +
        '<div class="settings-grid" id="settings-grid"></div>' +
        '<div class="line"></div>' +
        '<div class="settings-foot">' +
          '<button class="btn" id="save-defaults">Save as my defaults</button>' +
          '<span class="dim">Saved defaults apply to every new obfuscation.</span>' +
        '</div>' +
      '</section>';

    // ---- editor
    const ed = new DFEditor($('#in-editor'), { fontSize: 13, tabSize: 4, highlight: true, placeholder: 'Paste your Luau here, load a file, or drop one on this pane.' });
    const prefs = readEditorPrefs();
    ed.setWrap(prefs.wordWrap); ed.setFontSize(prefs.fontSize); ed.setTabSize(prefs.tabSize);
    ed.setHighlighting(prefs.highlighting !== false); ed.setLineNumbers(prefs.lineNumbers !== false);

    const opts = Object.assign({ preset, target, nameStyle: 'random', minify: true, watermark: true, captureGlobals: false, envLock: true, lockPlace: '', lockUniverse: '', seed: '' }, project ? project.options : {});
    // If loading a project, pull its target/preset into opts
    if (project) { opts.target = project.target; opts.preset = project.preset; }
    const lastBuild = { id: null };

    // ---- settings panel
    const grid = $('#settings-grid');
    function renderSettingsGrid() {
      let html = '<div class="field"><label for="opt-preset">Preset</label><select id="opt-preset">' +
        ['lightweight', 'balanced', 'maximum'].map(function (p) { return '<option value="' + p + '"' + (opts.preset === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') +
        '</select><div class="hint">Preset fills the levels below; change any of them afterwards.</div></div>';
      html += '<div class="field"><label for="opt-target">Target</label><select id="opt-target">' +
        '<option value="roblox"' + (opts.target === 'roblox' ? ' selected' : '') + '>Roblox</option>' +
        '<option value="luau"' + (opts.target === 'luau' ? ' selected' : '') + '>Luau</option></select></div>';
      for (const k of Object.keys(OPT_DEFS)) {
        const d2 = OPT_DEFS[k];
        html += '<div class="field"><label for="opt-' + k + '">' + d2.label + '</label><select id="opt-' + k + '">' +
          d2.options.map(function (o) {
            const val = Array.isArray(o) ? o[0] : o;
            const lbl = Array.isArray(o) ? o[1] : o;
            return '<option value="' + val + '"' + (String(opts[k]) === String(val) ? ' selected' : '') + '>' + lbl + '</option>';
          }).join('') +
          '</select><div class="hint">' + d2.hint + '</div></div>';
      }
      html += '<div class="field"><label for="opt-nameStyle">Name style</label><select id="opt-nameStyle">' +
        ['short', 'random', 'confuse'].map(function (v) { return '<option value="' + v + '"' + (opts.nameStyle === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') +
        '</select></div>';
      html += '<div class="field"><label for="opt-seed">Seed</label><input type="text" id="opt-seed" placeholder="random" value="' + DFx.esc(opts.seed || '') + '"><div class="hint">Fixed number reproduces the same build.</div></div>';
      html += '<div class="field"><label for="opt-lockPlace">Lock to place ID</label><input type="text" id="opt-lockPlace" placeholder="any place" value="' + DFx.esc(opts.lockPlace || '') + '"></div>';
      html += '<div class="field"><label for="opt-lockUniverse">Lock to universe ID</label><input type="text" id="opt-lockUniverse" placeholder="any universe" value="' + DFx.esc(opts.lockUniverse || '') + '"></div>';
      html += switchField('minify', 'Minify', 'Strip every unneeded byte.', opts.minify);
      html += switchField('watermark', 'Watermark', 'Darkfuscator brander in the header.', opts.watermark);
      html += switchField('captureGlobals', 'Capture globals', 'Register every global at load for tighter lookups.', opts.captureGlobals);
      html += switchField('envLock', 'Environment lock', 'Assume the environment never changes.', opts.envLock);
      grid.innerHTML = html;
      grid.querySelectorAll('[data-opt]').forEach(function (sw) {
        sw.addEventListener('click', function () {
          const k = sw.getAttribute('data-opt');
          opts[k] = !opts[k];
          sw.classList.toggle('on', opts[k]);
        });
      });
      const seedEl = $('#opt-seed');
      if (seedEl) seedEl.addEventListener('input', function () { opts.seed = seedEl.value; });
      const lp = $('#opt-lockPlace');
      if (lp) lp.addEventListener('input', function () { opts.lockPlace = lp.value; });
      const lu = $('#opt-lockUniverse');
      if (lu) lu.addEventListener('input', function () { opts.lockUniverse = lu.value; });
      $('#opt-preset').addEventListener('change', function () {
        opts.preset = this.value; applyPreset(opts.preset); renderSettingsGrid();
      });
      $('#opt-target').addEventListener('change', function () { opts.target = this.value; });
      for (const k of Object.keys(OPT_DEFS)) {
        $('#opt-' + k).addEventListener('change', function () { opts[k] = this.value; });
      }
      $('#opt-nameStyle').addEventListener('change', function () { opts.nameStyle = this.value; });
    }
    function switchField(k, label, sub, on) {
      return '<div class="field"><div class="switch-row"><div><div class="sw-label">' + label + '</div><div class="sw-sub">' + sub + '</div></div>' +
        '<button class="switch' + (on ? ' on' : '') + '" data-opt="' + k + '" aria-label="' + label + '"></button></div></div>';
    }
    function applyPreset(p) {
      const map = {
        lightweight: { vmLayers: '1', junk: '0', guard: '0', envChecks: '0', antiTamper: '0', minify: true, watermark: true, envLock: false },
        balanced: { vmLayers: '3', junk: '1', guard: '1', envChecks: '1', antiTamper: '1', minify: true, watermark: true, envLock: true },
        maximum: { vmLayers: '10', junk: '3', guard: '2', envChecks: '2', antiTamper: '2', minify: true, watermark: true, envLock: true }
      };
      Object.assign(opts, map[p] || {});
    }
    renderSettingsGrid();

    // ---- file load / paste / example / clear
    $('#file').addEventListener('change', function () {
      const f = this.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = function () { ed.setValue(String(r.result || '')); setStatus('Loaded ' + f.name); setInMeta(); };
      r.onerror = function () { setStatus('Could not read the file', 'err'); };
      r.readAsText(f);
    });
    $('#paste').addEventListener('click', async function () {
      try { ed.setValue(await navigator.clipboard.readText()); setInMeta(); setStatus('Pasted from clipboard'); }
      catch (e) { setStatus('Clipboard blocked by the browser, use Ctrl+V in the editor', 'warn'); }
    });
    $('#example').addEventListener('click', function () {
      try {
        const ex = window.DF_EXAMPLES && window.DF_EXAMPLES[0];
        if (ex && ex.code) { ed.setValue(ex.code); setInMeta(); setStatus('Loaded example: ' + ex.name); }
        else setStatus('No example available', 'warn');
      } catch (e) { setStatus('No example available', 'warn'); }
    });
    $('#clear').addEventListener('click', function () {
      ed.setValue(''); $('#output').value = ''; setInMeta(); setOutMeta(); setStatus('Cleared.');
      $('#stats').hidden = true; $('#verified-badge').hidden = true; lastBuild.id = null;
    });

    function setInMeta() { $('#inmeta').textContent = DFx.fmtNum(ed.getValue().length) + ' chars'; }
    function setOutMeta() { const v = $('#output').value; $('#outmeta').textContent = DFx.fmtNum(v.length) + ' chars'; }
    ed.el.querySelector('.editor-area').addEventListener('input', setInMeta);

    function setStatus(text, kind) {
      const st = $('#status');
      st.textContent = text;
      st.className = 'status' + (kind ? ' ' + kind : '');
    }
    function clearError() { const er = $('#error'); er.hidden = true; er.innerHTML = ''; }
    function showError(title, detail) {
      const er = $('#error');
      er.hidden = false;
      er.innerHTML = '<b>' + DFx.esc(title) + '</b>' + (detail ? '<div class="mono err-detail">' + DFx.esc(detail) + '</div>' : '');
    }

    // ---- protect (real platform build)
    async function protect() {
      clearError();
      const btn = $('#protect');
      const source = ed.getValue();
      if (!source.trim()) { setStatus('Paste some Luau, load an example, or upload a file first.', 'warn'); return; }
      if (source.length > 200000) { setStatus('Source too large: ' + DFx.fmtNum(source.length) + ' chars (max 200,000).', 'err'); return; }

      btn.disabled = true; btn.textContent = 'Validating';
      setStatus('Validating syntax locally');
      let localParse = null;
      try {
        localParse = window.LuauParser.parse(source);
      } catch (e) {
        btn.disabled = false; btn.textContent = 'Obfuscate';
        setStatus('Fix the syntax error, then try again.', 'err');
        showError('Syntax error before the build even started', e.message);
        return;
      }

      btn.textContent = 'Obfuscating';
      setStatus('Sending to the platform');
      const t0 = performance.now();
      try {
        const body = {
          source, filename: guessName(), projectId: (project && project.id) || null,
          preset: opts.preset, target: opts.target,
          options: {
            vmLayers: parseInt(opts.vmLayers, 10) || 10, junk: parseInt(opts.junk, 10) || 0,
            guard: parseInt(opts.guard, 10) || 0, envChecks: parseInt(opts.envChecks, 10) || 0,
            antiTamper: parseInt(opts.antiTamper, 10) || 0,
            nameStyle: opts.nameStyle, minify: !!opts.minify, watermark: !!opts.watermark,
            captureGlobals: !!opts.captureGlobals, envLock: !!opts.envLock,
            lockPlace: opts.lockPlace || '', lockUniverse: opts.lockUniverse || '', seed: opts.seed || ''
          }
        };
        if (!project && body.projectId === null) delete body.projectId;
        const d = await api('/api/v1/builds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const b = d.build;
        lastBuild.id = b.id;
        btn.textContent = 'Downloading output';
        const outRes = await fetch('/api/v1/builds/' + encodeURIComponent(b.id) + '/output', { credentials: 'same-origin' });
        const outText = outRes.ok ? await outRes.text() : '';
        $('#output').value = outText;
        setOutMeta();
        $('#stats').hidden = false;
        $('#st-buildid').textContent = b.id;
        $('#st-outsize').textContent = DFx.fmtBytes(outText.length || b.outSize || 0);
        $('#st-time').textContent = (b.durationMs || Math.round(performance.now() - t0)) + ' ms';
        $('#st-payload').textContent = DFx.fmtNum(b.payloadChars || outText.length);
        $('#st-vms').textContent = b.vmCount != null ? b.vmCount : '1';
        $('#st-seed').textContent = b.seed || 'random';
        $('#verified-badge').hidden = !b.reparsed;
        setStatus('Build ' + b.id + ' finished and saved to your history.');
        DFx.toast('Obfuscation complete', b.id, 'ok');
        if (window.DF_ON_BUILD) window.DF_ON_BUILD();
        loadStats();
      } catch (e) {
        setStatus('Build failed.', 'err');
        showError(e.message, e.data && e.data.detail);
        DFx.toast('Build failed', e.message, 'bad');
      } finally {
        btn.disabled = false; btn.textContent = 'Obfuscate';
      }
    }
    function guessName() {
      const v = ed.getValue();
      const m = v.match(/^--\s*filename:\s*(.+)$/m);
      return (m && m[1].trim()) || 'script.luau';
    }
    $('#protect').addEventListener('click', protect);
    $('#save-defaults').addEventListener('click', async function () {
      try {
        await api('/api/v1/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { obfuscationDefaults: { target: opts.target, preset: opts.preset } } }) });
        S.user.settings.obfuscationDefaults = { target: opts.target, preset: opts.preset };
        DFx.toast('Defaults saved', 'target ' + opts.target + ' / preset ' + opts.preset, 'ok');
      } catch (e) { DFx.toast('Could not save defaults', e.message, 'bad'); }
    });
    if (project) {
      $('#save-proj').addEventListener('click', async function () {
        try {
          await api('/api/v1/projects/' + encodeURIComponent(project.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ options: { vmLayers: parseInt(opts.vmLayers, 10) || 10, junk: parseInt(opts.junk, 10) || 0, guard: parseInt(opts.guard, 10) || 0, envChecks: parseInt(opts.envChecks, 10) || 0, antiTamper: parseInt(opts.antiTamper, 10) || 0, nameStyle: opts.nameStyle, minify: !!opts.minify, watermark: !!opts.watermark, captureGlobals: !!opts.captureGlobals, envLock: !!opts.envLock, lockPlace: opts.lockPlace || '', lockUniverse: opts.lockUniverse || '', seed: opts.seed || '' } }) });
          DFx.toast('Options saved to project', project.name, 'ok');
        } catch (e) { DFx.toast('Could not save options', e.message, 'bad'); }
      });
    }

    // drag and drop
    const pane = $('#pane-in');
    ['dragenter', 'dragover'].forEach(function (ev) { pane.addEventListener(ev, function (e) { e.preventDefault(); pane.classList.add('dragover'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { pane.addEventListener(ev, function (e) { e.preventDefault(); pane.classList.remove('dragover'); }); });
    pane.addEventListener('drop', function (e) {
      const f = e.dataTransfer.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = function () { ed.setValue(String(r.result || '')); setInMeta(); setStatus('Loaded ' + f.name); };
      r.readAsText(f);
    });

    // output actions
    $('#copy').addEventListener('click', async function () {
      const v = $('#output').value;
      if (!v) { DFx.toast('Nothing to copy', '', 'warn'); return; }
      try { await navigator.clipboard.writeText(v); DFx.toast('Output copied', DFx.fmtBytes(v.length), 'ok'); }
      catch (e) { $('#output').select(); document.execCommand('copy'); DFx.toast('Output copied', '', 'ok'); }
    });
    $('#download').addEventListener('click', function () {
      if (lastBuild.id) {
        const a = document.createElement('a');
        a.href = '/api/v1/builds/' + encodeURIComponent(lastBuild.id) + '/output';
        a.download = '';
        document.body.appendChild(a); a.click(); a.remove();
      } else {
        const v = $('#output').value;
        if (!v) { DFx.toast('Nothing to download', '', 'warn'); return; }
        const blob = new Blob([v], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = guessName().replace(/\.[^.]*$/, '') + '.protected.lua';
        document.body.appendChild(a); a.click(); a.remove();
      }
    });

    // keyboard
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); if (S.view === '/obfuscate') protect(); }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); ed.openSearch(); }
    });

    setInMeta(); setOutMeta();
    window.__ed = ed;
  }

  // ================================================================ PROJECTS
  async function renderProjects(root) {
    let projects = S.projects;
    if (!projects.length) {
      try { projects = (await api('/api/v1/projects')).projects; S.projects = projects; } catch (e) { projects = []; }
    }
    root.innerHTML =
      '<div class="card-head"><h2 class="card-title">Your projects</h2>' +
        '<a class="btn primary" href="/projects/new" data-route="/projects/new">New project</a></div>' +
      (projects.length ?
        '<div class="proj-grid">' + projects.map(function (p) {
          return '<a class="proj-card" href="/projects/' + DFx.esc(p.id) + '">' +
            '<div class="proj-name">' + DFx.esc(p.name) + '</div>' +
            '<div class="proj-desc">' + DFx.esc(p.description || 'No description') + '</div>' +
            '<div class="proj-meta">target ' + DFx.esc(p.target) + ' / preset ' + DFx.esc(p.preset) +
            ' / ' + (p.buildCount || 0) + ' builds' + (p.lastBuildAt ? ' / last ' + DFx.fmtAgo(p.lastBuildAt) : '') + '</div>' +
            '</a>';
        }).join('') + '</div>' :
        '<section class="card"><div class="empty">No projects yet. Create one to keep settings and builds together.</div></section>');
    bindDataTableLinks(root);
  }

  function renderProjectNew(root) {
    root.innerHTML =
      '<section class="card" style="max-width:620px">' +
        '<h2 class="card-title">New project</h2>' +
        '<div class="field"><label for="p-name">Name</label><input type="text" id="p-name" maxlength="80" placeholder="My loader"><div class="hint">Required, max 80 characters.</div></div>' +
        '<div class="field"><label for="p-desc">Description</label><input type="text" id="p-desc" maxlength="500" placeholder="What lives in this project (optional)"></div>' +
        '<div class="field"><label for="p-target">Default target</label><select id="p-target"><option value="roblox">Roblox</option><option value="luau">Luau</option></select></div>' +
        '<div class="field"><label for="p-preset">Default preset</label><select id="p-preset"><option value="lightweight">lightweight</option><option value="balanced">balanced</option><option value="maximum" selected>maximum</option></select></div>' +
        '<div class="settings-foot"><button class="btn primary" id="p-create">Create project</button>' +
        '<a class="link" href="/projects" data-route="/projects">Cancel</a></div>' +
      '</section>';
    bindDataTableLinks(root);
    $('#p-create').addEventListener('click', async function () {
      const name = $('#p-name').value.trim();
      if (!name) { DFx.toast('Name is required', '', 'warn'); return; }
      try {
        const d = await api('/api/v1/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description: $('#p-desc').value, target: $('#p-target').value, preset: $('#p-preset').value }) });
        S.projects = [];
        DFx.toast('Project created', d.project.name, 'ok');
        navigate('/projects/' + d.project.id);
      } catch (e) { DFx.toast('Could not create project', e.message, 'bad'); }
    });
  }

  async function renderProjectDetail(root, id) {
    let p;
    try { p = (await api('/api/v1/projects/' + encodeURIComponent(id))).project; } catch (e) {
      root.innerHTML = '<section class="card"><div class="empty">No such project.</div></section>';
      return;
    }
    S.currentProject = p;
    let builds = [];
    try { builds = (await api('/api/v1/builds?projectId=' + encodeURIComponent(p.id) + '&limit=20')).items; } catch (e) {}
    root.innerHTML =
      '<div class="card-head"><h2 class="card-title">' + DFx.esc(p.name) + '</h2>' +
        '<div><button class="btn" id="pd-edit">Edit</button><button class="btn danger" id="pd-delete">Delete</button></div></div>' +
      '<section class="card"><div class="proj-meta">target ' + DFx.esc(p.target) + ' / preset ' + DFx.esc(p.preset) +
        ' / created ' + DFx.fmtDate(p.createdAt) + (p.description ? '<div>' + DFx.esc(p.description) + '</div>' : '') + '</div>' +
        '<div class="line"></div>' +
        '<a class="btn primary" href="/obfuscate?project=' + DFx.esc(p.id) + '" data-route="/obfuscate">Obfuscate for this project</a>' +
      '</section>' +
      '<section class="card"><div class="card-head"><h2 class="card-title">Project builds</h2></div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>File</th><th>Status</th><th>Size</th><th>When</th><th>Actions</th></tr></thead><tbody>' +
        (builds.length ? builds.map(function (b) {
          return '<tr><td class="mono">' + DFx.esc(b.filename || b.id) + '</td><td>' + statusBadge(b.status) + '</td><td>' +
            DFx.fmtBytes(b.outSize || 0) + '</td><td>' + DFx.fmtAgo(b.createdAt) + '</td><td>' + buildActions(b) + '</td></tr>';
        }).join('') : '<tr><td colspan="5" class="empty">No builds in this project yet.</td></tr>') +
        '</tbody></table></div></section>' +
      '<div id="pd-edit-root"></div>';
    bindDataTableLinks(root);
    $('#pd-edit').addEventListener('click', function () { renderProjectEdit($('#pd-edit-root'), p); });
    $('#pd-delete').addEventListener('click', function () {
      DFx.confirmModal('Delete project', 'This removes the project. Its builds stay in history but lose the link.', 'Delete', true, async function () {
        try {
          await api('/api/v1/projects/' + encodeURIComponent(p.id), { method: 'DELETE' });
          S.projects = [];
          DFx.toast('Project deleted', p.name, 'ok');
          navigate('/projects');
        } catch (e) { DFx.toast('Delete failed', e.message, 'bad'); }
      });
    });
    root.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleBuildAction(btn.getAttribute('data-act'), btn.getAttribute('data-id')); });
    });
  }
  function renderProjectEdit(mount, p) {
    mount.innerHTML =
      '<section class="card"><h2 class="card-title">Edit project</h2>' +
        '<div class="field"><label for="ep-name">Name</label><input type="text" id="ep-name" maxlength="80" value="' + DFx.esc(p.name) + '"></div>' +
        '<div class="field"><label for="ep-desc">Description</label><input type="text" id="ep-desc" maxlength="500" value="' + DFx.esc(p.description || '') + '"></div>' +
        '<div class="field"><label for="ep-target">Target</label><select id="ep-target"><option value="roblox"' + (p.target === 'roblox' ? ' selected' : '') + '>Roblox</option><option value="luau"' + (p.target === 'luau' ? ' selected' : '') + '>Luau</option></select></div>' +
        '<div class="field"><label for="ep-preset">Preset</label><select id="ep-preset">' +
        ['lightweight', 'balanced', 'maximum'].map(function (x) { return '<option value="' + x + '"' + (p.preset === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="settings-foot"><button class="btn primary" id="ep-save">Save</button></div></section>';
    $('#ep-save').addEventListener('click', async function () {
      try {
        await api('/api/v1/projects/' + encodeURIComponent(p.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#ep-name').value.trim(), description: $('#ep-desc').value, target: $('#ep-target').value, preset: $('#ep-preset').value }) });
        S.projects = [];
        DFx.toast('Project saved', '', 'ok');
        navigate('/projects/' + p.id);
      } catch (e) { DFx.toast('Save failed', e.message, 'bad'); }
    });
  }

  function buildActions(b) {
    let html = '';
    if (b.status === 'success') {
      html += '<button class="btn sm" data-act="download" data-id="' + DFx.esc(b.id) + '">Download</button>' +
        '<button class="btn sm" data-act="rebuild" data-id="' + DFx.esc(b.id) + '">Rebuild</button>';
    }
    html += '<button class="btn sm danger" data-act="delete" data-id="' + DFx.esc(b.id) + '">Delete</button>';
    return '<div class="row-actions">' + html + '</div>';
  }
  async function handleBuildAction(act, id) {
    if (act === 'download') {
      const a = document.createElement('a');
      a.href = '/api/v1/builds/' + encodeURIComponent(id) + '/output';
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      return;
    }
    if (act === 'rebuild') {
      try {
        const d = await api('/api/v1/builds/' + encodeURIComponent(id) + '/rebuild', { method: 'POST' });
        DFx.toast('Rebuild complete', d.build.id, 'ok');
        loadStats();
        if (S.view === '/history') route();
      } catch (e) { DFx.toast('Rebuild failed', e.message, 'bad'); }
      return;
    }
    if (act === 'delete') {
      DFx.confirmModal('Delete build', 'The build and its stored output and source are removed permanently.', 'Delete', true, async function () {
        try {
          await api('/api/v1/builds/' + encodeURIComponent(id), { method: 'DELETE' });
          DFx.toast('Build deleted', id, 'ok');
          loadStats();
          if (S.view === '/history') route();
        } catch (e) { DFx.toast('Delete failed', e.message, 'bad'); }
      });
    }
  }

  // ================================================================ HISTORY
  async function renderHistory(root, filters) {
    filters = filters || {};
    let items = [], total = 0;
    const qs = new URLSearchParams();
    if (filters.status) qs.set('status', filters.status);
    if (filters.preset) qs.set('preset', filters.preset);
    if (filters.q) qs.set('q', filters.q);
    if (filters.from) qs.set('from', filters.from);
    if (filters.to) qs.set('to', filters.to);
    qs.set('limit', String(filters.limit || 50));
    qs.set('offset', String(filters.offset || 0));
    try { const d = await api('/api/v1/builds?' + qs.toString()); items = d.items; total = d.total; } catch (e) {}
    root.innerHTML =
      '<div class="card-head"><h2 class="card-title">Build history</h2><span class="dim">' + DFx.fmtNum(total) + ' builds</span></div>' +
      '<section class="card"><div class="filter-row">' +
        '<input type="text" id="h-q" placeholder="Search file or build ID" value="' + DFx.esc(filters.q || '') + '">' +
        '<select id="h-status"><option value="">Any status</option><option value="success"' + (filters.status === 'success' ? ' selected' : '') + '>success</option><option value="failed"' + (filters.status === 'failed' ? ' selected' : '') + '>failed</option></select>' +
        '<select id="h-preset"><option value="">Any preset</option>' + ['lightweight', 'balanced', 'maximum'].map(function (p) { return '<option value="' + p + '"' + (filters.preset === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
        '<button class="btn" id="h-apply">Apply</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>File</th><th>Preset</th><th>Target</th><th>Status</th><th>Size</th><th>When</th><th>Actions</th></tr></thead><tbody>' +
      (items.length ? items.map(function (b) {
        return '<tr><td class="mono">' + DFx.esc(b.filename || b.id) + '</td><td>' + DFx.esc(b.preset || '') + '</td><td>' + DFx.esc(b.target || '') + '</td>' +
          '<td>' + statusBadge(b.status) + '</td><td>' + DFx.fmtBytes(b.outSize || 0) + '</td><td title="' + DFx.esc(b.createdAt || '') + '">' + DFx.fmtAgo(b.createdAt) + '</td>' +
          '<td>' + buildActions(b) + '</td></tr>';
      }).join('') : '<tr><td colspan="7" class="empty">No builds match these filters.</td></tr>') +
      '</tbody></table></div>' +
      '<div class="pager-row">' +
        (filters.offset ? '<button class="btn" id="h-prev">Previous</button>' : '') +
        ((filters.offset + (filters.limit || 50)) < total ? '<button class="btn" id="h-next">Next</button>' : '') +
      '</div></section>';
    $('#h-apply').addEventListener('click', function () {
      renderHistory(root, {
        q: $('#h-q').value.trim() || undefined,
        status: $('#h-status').value || undefined,
        preset: $('#h-preset').value || undefined,
        limit: 50, offset: 0
      });
    });
    const prev = $('#h-prev'), next = $('#h-next');
    if (prev) prev.addEventListener('click', function () { renderHistory(root, Object.assign({}, filters, { offset: Math.max(0, filters.offset - 50) })); });
    if (next) next.addEventListener('click', function () { renderHistory(root, Object.assign({}, filters, { offset: filters.offset + 50 })); });
    root.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleBuildAction(btn.getAttribute('data-act'), btn.getAttribute('data-id')); });
    });
  }

  // ================================================================ API KEYS
  async function renderApiKeys(root) {
    let keys = [];
    try { keys = (await api('/api/v1/keys')).keys; } catch (e) {}
    root.innerHTML =
      '<div class="card-head"><h2 class="card-title">API keys</h2><button class="btn primary" id="new-key">Generate key</button></div>' +
      '<section class="card">' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Prefix</th><th>Requests</th><th>Last used</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
        (keys.length ? keys.map(function (k) {
          return '<tr><td>' + DFx.esc(k.name || 'unnamed') + '</td><td class="mono">' + DFx.esc(k.prefix) + '</td><td>' + DFx.fmtNum(k.total || 0) + '</td><td>' + (k.lastUsed ? DFx.fmtAgo(k.lastUsed) : 'never') + '</td>' +
            '<td>' + (k.revokedAt ? '<span class="badge bad">revoked</span>' : '<span class="badge ok">active</span>') + '</td>' +
            '<td><div class="row-actions">' +
            '<button class="btn sm" data-act="requests" data-id="' + DFx.esc(k.id) + '">Recent requests</button>' +
            (k.revokedAt ? '' : '<button class="btn sm" data-act="rename" data-id="' + DFx.esc(k.id) + '">Rename</button>' +
              '<button class="btn sm danger" data-act="revoke" data-id="' + DFx.esc(k.id) + '">Revoke</button>') +
            '</div></td></tr>';
        }).join('') : '<tr><td colspan="6" class="empty">No keys yet. Generate one to call the API from curl or your own code.</td></tr>') +
        '</tbody></table></div></section>' +
      '<section class="card"><h2 class="card-title">Use a key</h2>' +
        '<pre class="code-block">curl -X POST ' + location.origin + '/api/v1/obfuscate \\\n' +
        '  -H "Authorization: Bearer dk_live_YOURKEY" \\\n' +
        '  -H "Content-Type: application/json" \\\n' +
        '  -d \'{"source": "print(1)", "preset": "maximum", "target": "roblox"}\'</pre>' +
        '<a class="link" href="/docs" data-route="/docs">Full API documentation</a></section>';
    bindDataTableLinks(root);
    $('#new-key').addEventListener('click', function () { createKeyModal(root); });
    root.querySelectorAll('[data-act]').forEach(function (btn) {
      btn.addEventListener('click', function () { handleKeyAction(btn.getAttribute('data-act'), btn.getAttribute('data-id'), root); });
    });
  }
  function createKeyModal(root) {
    DFx.openModal({
      title: 'Generate API key',
      body: '<div class="field"><label for="mk-name">Key name</label><input type="text" id="mk-name" maxlength="80" placeholder="my cli tool"><div class="hint">Names are optional but make keys easier to tell apart.</div></div>',
      buttons: [
        { label: 'Cancel' },
        { label: 'Generate', style: 'primary', onClick: async function () {
          const name = $('#mk-name').value;
          try {
            const d = await api('/api/v1/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
            DFx.closeModal();
            DFx.openModal({
              title: 'Key created',
              body: '<p>' + DFx.esc(d.note || 'The full key shows once. Store it now.') + '</p>' +
                '<div class="key-reveal mono" id="key-reveal">' + DFx.esc(d.key) + '</div>' +
                '<div class="settings-foot"><button class="btn" id="copy-key">Copy</button></div>',
              buttons: [{ label: 'Done' }]
            });
            $('#copy-key').addEventListener('click', async function () {
              try { await navigator.clipboard.writeText(d.key); DFx.toast('Key copied', '', 'ok'); }
              catch (e) { DFx.toast('Copy blocked, select the key manually', '', 'warn'); }
            });
            renderApiKeys(root);
          } catch (e) { DFx.toast('Could not create key', e.message, 'bad'); }
        } }
      ]
    });
  }
  async function handleKeyAction(act, id, root) {
    if (act === 'revoke') {
      DFx.confirmModal('Revoke key', 'Anything using this key stops working immediately. This cannot be undone.', 'Revoke', true, async function () {
        try {
          await api('/api/v1/keys/' + encodeURIComponent(id), { method: 'DELETE' });
          DFx.toast('Key revoked', '', 'ok');
          renderApiKeys(root);
        } catch (e) { DFx.toast('Revoke failed', e.message, 'bad'); }
      });
    }
    if (act === 'rename') {
      DFx.openModal({
        title: 'Rename key',
        body: '<div class="field"><label for="rk-name">Key name</label><input type="text" id="rk-name" maxlength="80"></div>',
        buttons: [
          { label: 'Cancel' },
          { label: 'Save', style: 'primary', onClick: async function () {
            try {
              await api('/api/v1/keys/' + encodeURIComponent(id) + '/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#rk-name').value }) });
              DFx.toast('Key renamed', '', 'ok');
              renderApiKeys(root);
            } catch (e) { DFx.toast('Rename failed', e.message, 'bad'); }
          } }
        ]
      });
    }
    if (act === 'requests') {
      try {
        const d = await api('/api/v1/keys/' + encodeURIComponent(id) + '/requests');
        const rows = d.requests || [];
        DFx.openModal({
          title: 'Recent requests (last ' + rows.length + ')',
          body: rows.length ?
            '<div class="table-wrap"><table class="data-table"><thead><tr><th>When</th><th>Status</th><th>Size</th></tr></thead><tbody>' +
            rows.map(function (r) {
              return '<tr><td>' + DFx.fmtAgo(r.at) + '</td><td>' + statusBadge(r.status) + '</td><td>' + DFx.fmtBytes(r.outSize || 0) + '</td></tr>';
            }).join('') + '</tbody></table></div>' :
            '<div class="empty">No requests recorded for this key yet.</div>'
        });
      } catch (e) { DFx.toast('Could not load requests', e.message, 'bad'); }
    }
  }

  // ================================================================ SETTINGS
  async function renderSettings(root) {
    const s = (await api('/api/v1/me')).user.settings;
    const a = s.appearance || {}, e = s.editor || {}, o = s.obfuscationDefaults || {}, n = s.notifications || {};
    root.innerHTML =
      '<section class="card"><h2 class="card-title">Appearance</h2>' +
        '<div class="field"><label for="set-theme">Theme</label><select id="set-theme">' +
        '<option value="dark"' + (a.theme === 'dark' || !a.theme ? ' selected' : '') + '>Dark</option><option value="light"' + (a.theme === 'light' ? ' selected' : '') + '>Light</option></select></div>' +
        '<div class="field"><label for="set-accent">Accent</label><select id="set-accent">' +
        '<option value="orange"' + (a.accent === 'orange' || !a.accent ? ' selected' : '') + '>Orange</option><option value="purple"' + (a.accent === 'purple' ? ' selected' : '') + '>Purple</option></select></div>' +
        '<div class="switch-row"><div><div class="sw-label">Compact</div><div class="sw-sub">Tighter spacing everywhere.</div></div>' +
        '<button class="switch' + (a.compact ? ' on' : '') + '" id="set-compact" aria-label="Compact"></button></div>' +
      '</section>' +
      '<section class="card"><h2 class="card-title">Editor</h2><div class="settings-grid">' +
        '<div class="field"><label for="set-font">Font size</label><select id="set-font">' + [11, 12, 13, 14, 16, 18].map(function (v) { return '<option' + ((e.fontSize || 13) === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label for="set-tab">Tab size</label><select id="set-tab">' + [2, 4, 8].map(function (v) { return '<option' + ((e.tabSize || 4) === v ? ' selected' : '') + '>' + v + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><div class="switch-row"><div><div class="sw-label">Word wrap</div></div><button class="switch' + (e.wordWrap ? ' on' : '') + '" id="set-wrap" aria-label="Word wrap"></button></div></div>' +
        '<div class="field"><div class="switch-row"><div><div class="sw-label">Line numbers</div></div><button class="switch' + (e.lineNumbers !== false ? ' on' : '') + '" id="set-linenum" aria-label="Line numbers"></button></div></div>' +
        '<div class="field"><div class="switch-row"><div><div class="sw-label">Syntax highlighting</div></div><button class="switch' + (e.highlighting !== false ? ' on' : '') + '" id="set-hl" aria-label="Highlighting"></button></div></div>' +
      '</div></section>' +
      '<section class="card"><h2 class="card-title">Obfuscation defaults</h2><div class="settings-grid">' +
        '<div class="field"><label for="set-target">Default target</label><select id="set-target"><option value="roblox"' + (o.target === 'roblox' ? ' selected' : '') + '>Roblox</option><option value="luau"' + (o.target === 'luau' ? ' selected' : '') + '>Luau</option></select></div>' +
        '<div class="field"><label for="set-preset">Default preset</label><select id="set-preset">' + ['lightweight', 'balanced', 'maximum'].map(function (p) { return '<option value="' + p + '"' + (o.preset === p ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select></div>' +
      '</div></section>' +
      '<section class="card"><h2 class="card-title">Notifications</h2><div class="settings-grid">' +
        switchSet('buildCompletion', 'Build completion', 'Toast when a build finishes.', n.buildCompletion !== false) +
        switchSet('securityAlerts', 'Security alerts', 'Toast on new sign-ins.', n.securityAlerts !== false) +
        switchSet('emailNotifications', 'Email notifications', 'Email about builds and security.', !!n.emailNotifications) +
      '</div></section>' +
      '<div class="settings-foot"><button class="btn primary" id="set-save">Save settings</button></div>';
    function switchSet(id, label, sub, on) {
      return '<div class="field"><div class="switch-row"><div><div class="sw-label">' + label + '</div><div class="sw-sub">' + sub + '</div></div>' +
        '<button class="switch' + (on ? ' on' : '') + '" data-set="' + id + '" aria-label="' + label + '"></button></div></div>';
    }
    root.querySelectorAll('[data-set]').forEach(function (sw) {
      sw.addEventListener('click', function () { sw.classList.toggle('on'); });
    });
    $('#set-save').addEventListener('click', async function () {
      try {
        const next = {
          appearance: { theme: $('#set-theme').value, accent: $('#set-accent').value, compact: $('#set-compact').classList.contains('on') },
          editor: { fontSize: parseInt($('#set-font').value, 10) || 13, tabSize: parseInt($('#set-tab').value, 10) || 4, wordWrap: $('#set-wrap').classList.contains('on'), lineNumbers: $('#set-linenum').classList.contains('on'), highlighting: $('#set-hl').classList.contains('on') },
          obfuscationDefaults: { target: $('#set-target').value, preset: $('#set-preset').value },
          notifications: {
            buildCompletion: document.querySelector('[data-set="buildCompletion"]').classList.contains('on'),
            securityAlerts: document.querySelector('[data-set="securityAlerts"]').classList.contains('on'),
            emailNotifications: document.querySelector('[data-set="emailNotifications"]').classList.contains('on')
          }
        };
        await api('/api/v1/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: next }) });
        S.user.settings = next;
        localStorage.setItem('dk_theme', next.appearance.theme);
        localStorage.setItem('dk_editor', JSON.stringify({ fontSize: next.editor.fontSize, tabSize: next.editor.tabSize, wordWrap: next.editor.wordWrap, lineNumbers: next.editor.lineNumbers, highlighting: next.editor.highlighting }));
        applyTheme();
        DFx.toast('Settings saved', '', 'ok');
      } catch (e) { DFx.toast('Could not save settings', e.message, 'bad'); }
    });
  }
  function readEditorPrefs() {
    try { return JSON.parse(localStorage.getItem('dk_editor') || '{}'); } catch (e) { return {}; }
  }

  // ================================================================ ACCOUNT
  async function renderAccount(root) {
    const u = (await api('/api/v1/me')).user;
    root.innerHTML =
      '<section class="card"><h2 class="card-title">Profile</h2><div class="kv-grid">' +
        '<span class="dim">Username</span><span class="mono">' + DFx.esc(u.username) + '</span>' +
        '<span class="dim">Email</span><span class="mono">' + DFx.esc(u.email) + '</span>' +
        '<span class="dim">Verified</span><span>' + (u.verified ? 'yes' : '<span class="badge warn">unverified</span> <a class="link" href="/verify-email">Verify now</a>') + '</span>' +
        '<span class="dim">Created</span><span>' + DFx.fmtDate(u.createdAt) + '</span>' +
        '<span class="dim">Last sign-in</span><span>' + DFx.fmtAgo(u.lastSeen || u.lastLoginAt) + '</span>' +
      '</div></section>' +
      '<section class="card"><h2 class="card-title">Security</h2>' +
        '<div class="settings-foot"><a class="link" href="/settings">Edit settings, change password, manage sessions</a></div>' +
      '</section>' +
      '<section class="card"><h2 class="card-title">Danger zone</h2>' +
        '<div class="settings-foot"><button class="btn danger" id="acct-logout-all">Sign out everywhere</button></div>' +
      '</section>';
    $('#acct-logout-all').addEventListener('click', function () {
      DFx.confirmModal('Sign out everywhere', 'Every session ends, including this one.', 'Sign out', true, async function () {
        try { await api('/api/v1/auth/logout-all', { method: 'POST' }); } catch (e) {}
        location.href = '/login?logged=out';
      });
    });
  }

  // ------------------------------------------------------------------ wiring
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#nav a[data-route]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(a.getAttribute('data-route'));
      });
    });
    document.addEventListener('click', function (e) {
      const a = e.target.closest('a[data-route]');
      if (a) { e.preventDefault(); navigate(a.getAttribute('href')); }
    });
    window.addEventListener('popstate', function () { route(); });
    $('#palette-btn').addEventListener('click', function () {
      if (window.DF.PaletteSource) DF.paletteOpen([]);
    });
    $('#theme-toggle').addEventListener('click', function () {
      const cur = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      localStorage.setItem('dk_theme', cur);
      document.documentElement.setAttribute('data-theme', cur);
      this.textContent = cur === 'dark' ? 'Light' : 'Dark';
    });
    $('#acct-menu-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      $('#acct-menu').classList.toggle('open');
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#acct-menu')) $('#acct-menu').classList.remove('open');
    });
    boot();
    loadSystem();
  });

  // palette source: static pages + async project/build search
  window.PaletteSource = async function (q) {
    const items = [
      { label: 'Dashboard', href: '/dashboard', ico: '01' },
      { label: 'Obfuscate a script', href: '/obfuscate', ico: '02' },
      { label: 'Projects', href: '/projects', ico: '03' },
      { label: 'Build history', href: '/history', ico: '04' },
      { label: 'API keys', href: '/api-keys', ico: '05' },
      { label: 'Settings', href: '/settings', ico: '06' },
      { label: 'Account', href: '/account', ico: '07' },
      { label: 'API documentation', href: '/docs', ico: '08' }
    ];
    if (!q || q.length < 2) return items;
    try {
      const [b, p] = await Promise.all([
        api('/api/v1/builds?limit=5&q=' + encodeURIComponent(q)),
        api('/api/v1/projects')
      ]);
      const matched = (p.projects || []).filter(function (x) { return x.name.toLowerCase().includes(q.toLowerCase()); });
      return matched.map(function (x) { return { label: 'Project: ' + x.name, href: '/projects/' + x.id, ico: 'pr' }; })
        .concat((b.items || []).map(function (x) { return { label: 'Build: ' + (x.filename || x.id), href: '/history', ico: 'bl', hint: x.status }; }))
        .concat(items);
    } catch (e) { return items; }
  };
  window.DF_ON_BUILD = function () {
    if (S.view === '/dashboard') route();
  };
})();
