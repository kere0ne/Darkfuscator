/* editor.js — the Darkfuscator source editor: line-number gutter, Luau syntax
 * highlighting (the engine's own tokenizer), search and replace, word wrap
 * and font-size controls, drag-and-drop and line/char counts. */
(function (root) {
  'use strict';

  function Editor(mount, opts) {
    opts = opts || {};
    const shell = document.createElement('div');
    shell.className = 'editor-shell';
    shell.innerHTML =
      '<div class="search-row" hidden>' +
        '<input class="s-find" type="text" placeholder="Find" aria-label="Find">' +
        '<input class="s-repl" type="text" placeholder="Replace with" aria-label="Replace with">' +
        '<button class="btn sm s-apply" type="button">Replace</button>' +
        '<button class="btn sm s-all" type="button">Replace all</button>' +
        '<span class="match-count"></span>' +
        '<button class="btn sm ghost s-close" type="button" aria-label="Close search">&times;</button>' +
      '</div>' +
      '<div class="editor-body">' +
        '<div class="editor-gutter" aria-hidden="true">1</div>' +
        '<textarea class="editor-area" spellcheck="false" aria-label="Luau source editor"></textarea>' +
        '<div class="editor-hl-layer" aria-hidden="true"></div>' +
      '</div>' +
      '<div class="editor-meta">' +
        '<span class="em-counts">0 lines &middot; 0 characters</span>' +
        '<span class="em-note"></span>' +
      '</div>';

    // The editor owns the contents of its mount point.  Keeping the mount step
    // here (rather than in every caller) ensures a newly-created workspace is
    // immediately usable instead of leaving an empty source-editor container.
    if (!mount || typeof mount.appendChild !== 'function') throw new Error('editor mount is unavailable');
    mount.innerHTML = '';
    mount.appendChild(shell);

    const area = shell.querySelector('.editor-area');
    const gutter = shell.querySelector('.editor-gutter');
    const hl = shell.querySelector('.editor-hl-layer');
    const counts = shell.querySelector('.em-counts');
    const note = shell.querySelector('.em-note');
    const searchRow = shell.querySelector('.search-row');
    const findInput = shell.querySelector('.s-find');
    const replInput = shell.querySelector('.s-repl');
    const matchCount = shell.querySelector('.s-close') ? shell.querySelector('.match-count') : null;
    const matchCountEl = shell.querySelector('.match-count');

    const self = this;
    let useHighlight = opts.highlighting !== false;
    let wrap = !!opts.wordWrap;

    function countMatches(needle) {
      if (!needle) return 0;
      let n = 0, i = 0;
      const hay = area.value;
      while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
      return n;
    }
    function updateCounts() {
      const v = area.value;
      const lines = v ? v.split('\n').length : 1;
      counts.innerHTML = (root.DF ? DF.fmtNum(lines) : lines) + ' lines &middot; ' + (root.DF ? DF.fmtNum(v.length) : v.length) + ' characters';
    }
    function refreshHl() {
      if (!useHighlight || vTooBig()) {
        hl.innerHTML = '';
        hl.style.display = 'none';
        if (vTooBig()) note.textContent = 'syntax highlighting paused for very large files';
        return;
      }
      hl.style.display = '';
      note.textContent = '';
      try {
        const toks = root.LuauLexer.tokenize(area.value);
        let out = '';
        for (const t of toks) {
          if (t.k === 'ws') { out += DF.esc(t.raw); continue; }
          const cls = t.k === 'keyword' ? 'tok-kw' : t.k === 'string' ? 'tok-str' : t.k === 'number' ? 'tok-num' : t.k === 'comment' ? 'tok-com' : t.k === 'op' ? 'tok-op' : 'tok-id';
          out += '<span class="' + cls + '">' + DF.esc(t.raw == null ? t.v : t.raw) + '</span>';
        }
        hl.innerHTML = out || '';
      } catch (e) { hl.innerHTML = ''; }
    }
    function vTooBig() { return area.value.length > 100000; }
    function refreshGutter() {
      const v = area.value;
      const lines = v ? v.split('\n').length : 1;
      let out = '';
      for (let i = 1; i <= lines; i++) out += i + '\n';
      gutter.textContent = out;
    }
    function syncScroll() {
      gutter.scrollTop = area.scrollTop;
      hl.scrollTop = area.scrollTop;
      hl.scrollLeft = area.scrollLeft;
    }
    function refreshAll() {
      refreshGutter(); refreshHl(); updateCounts();
    }

    area.addEventListener('input', refreshAll);
    area.addEventListener('scroll', syncScroll);
    area.addEventListener('keydown', function (e) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = area.selectionStart, epos = area.selectionEnd;
        const v = area.value;
        if (s !== epos && v.slice(s, epos).indexOf('\n') !== -1) {
          const start = v.lastIndexOf('\n', s - 1) + 1;
          const block = v.slice(start, epos).split('\n');
          const indent = ' '.repeat(self.tabSize || 4);
          const shifted = block.map(function (l) { return indent + l; }).join('\n');
          area.value = v.slice(0, start) + shifted + v.slice(epos);
          area.selectionStart = start; area.selectionEnd = start + shifted.length;
        } else {
          const indent = ' '.repeat(self.tabSize || 4);
          area.value = v.slice(0, s) + indent + v.slice(epos);
          area.selectionStart = area.selectionEnd = s + indent.length;
        }
        refreshAll();
      }
    });

    // search / replace
    self.openSearch = function () {
      searchRow.hidden = false;
      findInput.focus();
    };
    findInput.addEventListener('input', function () {
      const n = countMatches(findInput.value);
      matchCountEl.textContent = findInput.value ? n + ' match' + (n === 1 ? '' : 'es') : '';
    });
    function findNext() {
      const needle = findInput.value;
      if (!needle) return;
      const v = area.value;
      let idx = v.indexOf(needle, area.selectionEnd);
      if (idx === -1) idx = v.indexOf(needle);
      if (idx === -1) return;
      area.focus();
      area.setSelectionRange(idx, idx + needle.length);
      const line = v.slice(0, idx).split('\n').length;
      area.scrollTop = Math.max(0, (line - 5) * 18);
      syncScroll();
    }
    findInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); findNext(); }
      if (e.key === 'Escape') { searchRow.hidden = true; area.focus(); }
    });
    shell.querySelector('.s-apply').addEventListener('click', function () {
      const needle = findInput.value;
      if (!needle || area.selectionEnd === area.selectionStart) return;
      const s = area.selectionStart;
      if (area.value.slice(s, area.selectionEnd) === needle) {
        area.value = area.value.slice(0, s) + replInput.value + area.value.slice(area.selectionEnd);
        area.selectionStart = area.selectionEnd = s + replInput.value.length;
        refreshAll(); findNext();
      } else findNext();
    });
    shell.querySelector('.s-all').addEventListener('click', function () {
      const needle = findInput.value;
      if (!needle) return;
      const n = countMatches(needle);
      area.value = area.value.split(needle).join(replInput.value);
      refreshAll();
      matchCountEl.textContent = n ? 'replaced ' + n : 'no matches';
    });
    shell.querySelector('.s-close').addEventListener('click', function () {
      searchRow.hidden = true;
      area.focus();
    });

    // controls
    self.setWrap = function (on) {
      wrap = !!on;
      shell.classList.toggle('editor-nowrap', !wrap);
      area.wrap = wrap ? 'soft' : 'off';
      hl.style.whiteSpace = wrap ? 'pre-wrap' : 'pre';
      refreshAll();
    };
    self.setFontSize = function (px) {
      area.style.fontSize = px + 'px';
      hl.style.fontSize = px + 'px';
      gutter.style.fontSize = Math.max(9, px - 1) + 'px';
    };
    self.setTabSize = function (n) {
      self.tabSize = n;
      area.style.tabSize = n;
    };
    self.setHighlighting = function (on) {
      useHighlight = !!on;
      refreshHl();
    };
    self.setLineNumbers = function (on) {
      gutter.style.display = on ? '' : 'none';
    };
    self.getValue = function () { return area.value; };
    self.setValue = function (v) {
      area.value = String(v == null ? '' : v);
      refreshAll();
    };
    self.focus = function () { area.focus(); };
    self.el = shell;
    self.mark = function (kind) {
      const g = shell.querySelector('.editor-gutter');
      g.classList.toggle('hl', kind === true);
    };

    self.setWrap(opts.wordWrap !== false ? opts.wordWrap : false);
    self.setFontSize(opts.fontSize || 12);
    self.setTabSize(opts.tabSize || 4);
    if (opts.placeholder) area.placeholder = opts.placeholder;

    refreshAll();
    return self;
  }

  root.DFEditor = Editor;
})(typeof window !== 'undefined' ? window : this);
