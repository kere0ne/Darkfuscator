/* ui.js — shared platform components: fetch wrapper, toasts, modals,
 * command palette, formatting. Plain JS, no dependencies. */
(function (root) {
  'use strict';

  // ----------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }
  function fmtNum(n) { return (Number(n) || 0).toLocaleString('en-US'); }
  function fmtDate(s) {
    try { return new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
    catch (e) { return String(s || ''); }
  }
  function fmtAgo(s) {
    if (!s) return 'never';
    const d = Date.parse(s); if (!isFinite(d)) return 'never';
    const m = Math.floor((Date.now() - d) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.floor(h / 24) + 'd ago';
  }

  // ------------------------------------------------------------------ toasts
  const ICONS = { ok: '', bad: '', warn: '', info: '' };
  function toast(title, body, kind) {
    kind = kind || 'info';
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
    t.innerHTML = '<span class="t-ico" aria-hidden="true"></span>' +
      '<div class="t-txt"><div class="t-title">' + esc(title) + '</div>' +
      (body ? '<div class="t-body">' + esc(body) + '</div>' : '') + '</div>' +
      '<button class="t-x" aria-label="Dismiss">&times;</button>';
    t.querySelector('.t-x').addEventListener('click', function () { dismiss(); });
    stack.appendChild(t);
    let done = false;
    function dismiss() {
      if (done) return; done = true;
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 160);
    }
    const life = kind === 'bad' ? 6000 : 3600;
    setTimeout(dismiss, life);
    return dismiss;
  }

  // ------------------------------------------------------------------ modals
  const modalRoot = document.createElement('div');
  modalRoot.className = 'modal-root';
  modalRoot.setAttribute('role', 'dialog');
  modalRoot.setAttribute('aria-modal', 'true');
  modalRoot.innerHTML = '<div class="modal-backdrop"></div>' +
    '<div class="modal"><div class="modal-head"><span class="m-title"></span>' +
    '<button class="modal-x" aria-label="Close">&times;</button></div>' +
    '<div class="modal-body"></div><div class="modal-foot"></div></div>';
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.body.contains(modalRoot)) document.body.appendChild(modalRoot);
  });
  if (document.body) document.body.appendChild(modalRoot);

  let escHandler = null;

  function openModal(opts) {
    const title = modalRoot.querySelector('.m-title');
    const body = modalRoot.querySelector('.modal-body');
    const foot = modalRoot.querySelector('.modal-foot');
    title.textContent = opts.title || '';
    body.innerHTML = opts.body || '';
    foot.innerHTML = '';
    (opts.buttons || [{ label: 'Close' }]).forEach(function (b) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.style || '');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        const keep = b.onClick && b.onClick() === false;
        if (!keep) closeModal();
      });
      foot.appendChild(btn);
    });
    modalRoot.classList.add('open');
    escHandler = function (e) { if (e.key === 'Escape') closeModal(); };
    document.addEventListener('keydown', escHandler);
    const first = modalRoot.querySelector('.modal-foot .btn');
    if (first) first.focus();
  }
  function closeModal() {
    modalRoot.classList.remove('open');
    if (escHandler) { document.removeEventListener('keydown', escHandler); escHandler = null; }
  }
  modalRoot.querySelector('.modal-x').addEventListener('click', closeModal);
  modalRoot.querySelector('.modal-backdrop').addEventListener('click', closeModal);

  function confirmModal(title, body, confirmLabel, danger, onConfirm) {
    openModal({
      title: title,
      body: '<p>' + esc(body) + '</p>',
      buttons: [
        { label: 'Cancel' },
        { label: confirmLabel || 'Confirm', style: danger ? 'danger' : 'primary', onClick: onConfirm }
      ]
    });
  }

  // --------------------------------------------------------- command palette
  const palette = document.createElement('div');
  palette.className = 'palette-root';
  palette.innerHTML = '<div class="modal-backdrop"></div>' +
    '<div class="palette" role="dialog" aria-label="Search"><input type="text" placeholder="Search pages, projects, builds, docs...">' +
    '<div class="palette-list" role="listbox"></div>' +
    '<div class="palette-hint"><span class="kbd">Ctrl</span> + <span class="kbd">K</span> search &middot; <span class="kbd">Esc</span> close</div></div>';
  if (document.body) document.body.appendChild(palette);

  let paletteItems = [];
  let paletteSel = 0;
  let paletteSource = null; // async item provider

  function paletteOpen(items) {
    palette.classList.add('open');
    const input = palette.querySelector('input');
    input.value = '';
    paletteItems = items || [];
    paletteSel = 0;
    paletteRender('');
    input.focus();
  }
  function paletteClose() { palette.classList.remove('open'); }
  function paletteRender(q) {
    const list = palette.querySelector('.palette-list');
    const needle = String(q || '').toLowerCase();
    const items = paletteItems.filter(function (it) {
      return !needle || it.label.toLowerCase().includes(needle) || (it.hint || '').toLowerCase().includes(needle);
    }).slice(0, 12);
    paletteItems = items;
    paletteSel = Math.min(paletteSel, Math.max(0, items.length - 1));
    list.innerHTML = items.length
      ? items.map(function (it, i) {
          return '<a class="palette-item' + (i === paletteSel ? ' sel' : '') + '" href="' + esc(it.href || '#') + '" data-i="' + i + '">' +
            '<span class="pi-ico">' + esc(it.ico || '') + '</span><span>' + esc(it.label) +
            (it.hint ? ' <span class="dim">&middot; ' + esc(it.hint) + '</span>' : '') + '</span></a>';
        }).join('')
      : '<div class="empty">Nothing matches.</div>';
  }

  palette.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal-backdrop')) paletteClose();
    const item = e.target.closest('.palette-item');
    if (item) { paletteClose(); }
  });
  palette.querySelector('input').addEventListener('input', function () {
    if (paletteSource) {
      const self = this;
      paletteSource(self.value).then(function (items) { paletteItems = items; paletteSel = 0; paletteRender(self.value); });
    } else paletteRender(this.value);
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (palette.classList.contains('open')) paletteClose();
      else if (root.PaletteSource) paletteOpen([]), (paletteSource = root.PaletteSource);
      return;
    }
    if (palette.classList.contains('open')) {
      if (e.key === 'Escape') { paletteClose(); e.preventDefault(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); paletteSel = Math.min(paletteItems.length - 1, paletteSel + 1); paletteRender(palette.querySelector('input').value); }
      if (e.key === 'ArrowUp') { e.preventDefault(); paletteSel = Math.max(0, paletteSel - 1); paletteRender(palette.querySelector('input').value); }
    }
  });
  palette.querySelector('.palette-list').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const item = paletteItems[paletteSel];
      if (item) { paletteClose(); if (item.onClick) item.onClick(); else location.href = item.href; }
    }
  });

  // ------------------------------------------------------------------ export
  root.DF = {
    esc, fmtBytes, fmtNum, fmtDate, fmtAgo,
    toast, openModal, closeModal, confirmModal,
    paletteOpen, paletteClose, paletteRender
  };
})(typeof window !== 'undefined' ? window : this);
