/* Caderno R1 — utilidades compartilhadas */
window.MQ = window.MQ || {};

(function (MQ) {
  'use strict';

  MQ.uid = function () {
    const r = Math.random().toString(36).slice(2, 8);
    return Date.now().toString(36) + r;
  };

  MQ.now = function () { return Date.now(); };

  MQ.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* Texto com quebras de linha preservadas, já escapado */
  MQ.para = function (s) {
    return MQ.esc(s).split(/\n{2,}/).map(p => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
  };

  MQ.$ = (sel, root) => (root || document).querySelector(sel);
  MQ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  MQ.fmtDate = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR');
  };
  MQ.fmtDateTime = function (ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };
  MQ.pct = function (a, b) { return b ? Math.round((a / b) * 100) : 0; };
  MQ.fmtDuration = function (sec) {
    sec = Math.max(0, Math.round(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const pad = n => String(n).padStart(2, '0');
    return (h ? h + ':' + pad(m) : m) + ':' + pad(s);
  };

  /* Texto puro de um trecho com HTML (para busca e prévias) */
  const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  MQ.plain = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_, n) => ENT[n]).replace(/\s+/g, ' ').trim();

  MQ.norm = function (s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  };

  MQ.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  /* ---------- Toast ---------- */
  let toastTimer = null;
  MQ.toast = function (msg, kind, act) { // act: { label, fn } mostra um botão (ex.: Desfazer)
    let el = MQ.$('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.className = 'toast show ' + (kind || '');
    el.textContent = msg;
    if (act) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-act'; b.textContent = act.label;
      b.onclick = () => { el.className = 'toast'; act.fn(); };
      el.appendChild(b);
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'toast'; }, act ? 8000 : kind === 'err' ? 7000 : 3200); // erro com ação leva mais tempo para ler
  };

  /* ---------- Modal ---------- */
  MQ.modal = function (opts) {
    // opts: { title, body (html), actions: [{label, kind, onClick(close, root) -> false keeps open}], wide, onOpen(root) }
    const back = document.createElement('div');
    back.className = 'modal-back';
    const box = document.createElement('div');
    box.className = 'modal' + (opts.wide ? ' wide' : '');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', opts.title || 'Janela');
    box.innerHTML =
      '<header class="modal-head"><h2>' + MQ.esc(opts.title || '') + '</h2>' +
      '<button class="icon-btn modal-x" aria-label="Fechar">' + MQ.icon('x') + '</button></header>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.actions && opts.actions.length ? '<footer class="modal-foot"></footer>' : '');
    back.appendChild(box);
    document.body.appendChild(back);
    const prevFocus = document.activeElement;
    const shell = document.querySelector('.shell');
    MQ._modals = (MQ._modals || 0) + 1;
    if (shell) shell.inert = true; // o fundo não recebe foco nem leitor de tela enquanto a janela está aberta
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      back.remove();
      document.removeEventListener('keydown', onKey, true);
      if (--MQ._modals <= 0 && shell) shell.inert = false;
      // a tela pode ter sido redesenhada: se o elemento antigo sumiu, o foco volta para a tela
      const back2 = prevFocus && prevFocus.isConnected ? prevFocus : MQ.$('#view');
      if (back2 && back2.focus) back2.focus({ preventScroll: true });
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (document.body.classList.contains('logged-out')) return; // tela de entrada por cima: o teclado é dela
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const f = MQ.$$('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])', box).filter(x => x.offsetParent !== null);
      if (!f.length) { e.preventDefault(); return; }
      const a = document.activeElement;
      if (!box.contains(a)) { e.preventDefault(); f[0].focus(); }
      else if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    MQ.$('.modal-x', box).addEventListener('click', close);
    const foot = MQ.$('.modal-foot', box);
    (opts.actions || []).forEach(a => {
      const b = document.createElement('button');
      b.className = 'btn ' + (a.kind || '');
      b.textContent = a.label;
      b.addEventListener('click', () => {
        const r = a.onClick ? a.onClick(close, box) : undefined;
        if (r !== false) close();
      });
      foot.appendChild(b);
    });
    if (opts.onOpen) opts.onOpen(box, close);
    const first = MQ.$('input, select, textarea, button:not(.modal-x)', box);
    if (first) setTimeout(() => first.focus(), 30);
    return { close, root: box };
  };

  MQ.confirm = function (title, text, okLabel, danger) {
    return new Promise(resolve => {
      let done = false;
      MQ.modal({
        title,
        body: '<p>' + MQ.esc(text) + '</p>',
        onClose: () => { if (!done) resolve(false); },
        actions: [
          { label: 'Cancelar', kind: 'ghost', onClick: () => { done = true; resolve(false); } },
          { label: okLabel || 'Confirmar', kind: danger ? 'danger' : 'primary', onClick: () => { done = true; resolve(true); } }
        ]
      });
    });
  };

  MQ.prompt = function (title, label, value, okLabel) {
    return new Promise(resolve => {
      let done = false;
      MQ.modal({
        title,
        body: '<label class="field"><span>' + MQ.esc(label) + '</span><input type="text" id="mq-prompt" maxlength="100" value="' + MQ.esc(value || '') + '"></label>',
        onOpen: (root, close) => {
          MQ.$('#mq-prompt', root).addEventListener('keydown', e => {
            if (e.key === 'Enter') { const v = e.target.value.trim(); if (v) { done = true; resolve(v); close(); } }
          });
        },
        onClose: () => { if (!done) resolve(null); },
        actions: [
          { label: 'Cancelar', kind: 'ghost' },
          { label: okLabel || 'Salvar', kind: 'primary', onClick: (close, root) => {
            const v = MQ.$('#mq-prompt', root).value.trim();
            if (!v) { MQ.toast('Digite um nome.'); return false; }
            done = true; resolve(v);
          } }
        ]
      });
    });
  };

  /* ---------- Menu suspenso simples ---------- */
  MQ.menu = function (anchor, items) {
    MQ.$$('.popmenu').forEach(m => m.remove());
    const m = document.createElement('div');
    m.className = 'popmenu';
    m.setAttribute('role', 'menu');
    items.forEach(it => {
      if (it === '-') { const hr = document.createElement('div'); hr.className = 'sep'; m.appendChild(hr); return; }
      const b = document.createElement('button');
      b.setAttribute('role', 'menuitem');
      b.className = it.danger ? 'danger' : '';
      b.textContent = it.label;
      if (it.disabled) b.disabled = true;
      b.addEventListener('click', () => { m.remove(); it.onClick(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = anchor.getBoundingClientRect();
    const mw = m.offsetWidth, mh = m.offsetHeight;
    let left = Math.min(r.right - mw, window.innerWidth - mw - 8);
    left = Math.max(8, left);
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    m.style.left = left + 'px';
    m.style.top = top + 'px';
    const first = m.querySelector('button:not([disabled])');
    if (first) first.focus();
    setTimeout(() => {
      function off(e) {
        if (!m.contains(e.target)) { m.remove(); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); }
      }
      function esc(e) { if (e.key === 'Escape') { m.remove(); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); anchor.focus(); } }
      document.addEventListener('mousedown', off);
      document.addEventListener('keydown', esc);
    }, 0);
  };

  /* ---------- Ícones: Lucide (ISC), traço de 2 px, 24px ---------- */
  const ICONS = {
    flame: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0a5 5 0 0 1 1-3a1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    play: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
    bolt: '<path d="M15.914 4a1.5 1.5 0 0 0-2.474-1.561l-9 9A1.5 1.5 0 0 0 5.5 14h4.002a.5.5 0 0 1 .471.666L8.086 20a1.5 1.5 0 0 0 2.475 1.56l9-9A1.5 1.5 0 0 0 18.5 10h-3.997a.5.5 0 0 1-.472-.667z"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/>',
    layers: '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    notes: '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4M2 6h4m-4 4h4m-4 4h4m-4 4h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/>',
    sort: '<path d="m21 16l-4 4l-4-4m4 4V4M3 8l4-4l4 4M7 4v16"/>',
    home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    search: '<path d="m21 21l-4.34-4.34"/><circle cx="11" cy="11" r="8"/>',
    book: '<path d="M12 5v16m8.001-2A2 2 0 0 0 22 17V5a2 2 0 0 0-1.999-2L16 3.002A5 5 0 0 0 12 5a5 5 0 0 0-4-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 1.999 2H8a5 5 0 0 1 4 2a5 5 0 0 1 4-2z"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    list: '<path d="M3 5h.01M3 12h.01M3 19h.01M8 5h13M8 12h13M8 19h13"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chart: '<path d="M3 3v16a2 2 0 0 0 2 2h16m-3-4V9m-5 8V5M8 17v-3"/>',
    plus: '<path d="M5 12h14m-7-7v14"/>',
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497zM15 5l4 4"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9"/>',
    sync: '<path d="M3 12a9 9 0 0 1 9-9a9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5m5 4a9 9 0 0 1-9 9a9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    left: '<path d="m15 18l-6-6l6-6"/>',
    right: '<path d="m9 18l6-6l-6-6"/>',
    down: '<path d="m6 9l6 6l6-6"/>',
    up: '<path d="m6 15l6-6l6 6"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    flag: '<path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    scissors: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12L12 12m8-8L8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8L20 20"/>',
    upload: '<path d="M12 3v12m5-7l-5-5l-5 5m14 7v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
    download: '<path d="M12 15V3m9 12v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10l5 5l5-5"/>',
    textup: '<path d="m14 11l4-4l4 4m-4 5V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392"/>',
    textdown: '<path d="m14 12l4 4l4-4m-4 4V7M2 16l4.039-9.69a.5.5 0 0 1 .923 0L11 16m-7.696-3h6.392"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5m4-1v5l4 2"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5"/>',
    trash: '<path d="M10 11v6m4-6v6m5-11v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    settings: '<path d="M10 5H3m9 14H3M14 3v4m2 10v4m5-9h-9m9 7h-5m5-14h-7m-6 5v4m0-2H3"/>',
    bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5c1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5c.7.7 1.3 1.5 1.5 2.5m0 4h6m-5 4h4"/>',
    timer: '<path d="M10 2h4m-2 12l3-3"/><circle cx="12" cy="14" r="8"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2m4 7h4m-4 5h4m-8-5h.01M8 16h.01"/>',
    arrowleft: '<path d="m12 19l-7-7l7-7m7 7H5"/>',
    alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/>',
    eraser: '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21m-7.752-9.91l8.828 8.828"/>'
  };
  MQ.icon = function (name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || '') + '</svg>';
  };

  /* ---------- CSV ---------- */
  MQ.parseCSV = function (text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const semi = (firstLine.match(/;/g) || []).length;
    const comma = (firstLine.match(/,/g) || []).length;
    const tab = (firstLine.match(/\t/g) || []).length;
    const d = tab > semi && tab > comma ? '\t' : (semi >= comma ? ';' : ',');
    const rows = [];
    let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
        } else cell += c;
      } else if (c === '"') q = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(r => r.some(c => c.trim() !== ''));
  };

  MQ.toCSV = function (rows) {
    return rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c);
      return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(';')).join('\r\n');
  };

  /* ---------- Salvar arquivo (Windows / Android / navegador) ---------- */
  MQ.saveFile = async function (filename, content, mime) {
    const cap = window.Capacitor;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.Plugins && cap.Plugins.Filesystem) {
      try {
        const { Filesystem, Share } = cap.Plugins;
        const res = await Filesystem.writeFile({ path: filename, data: content, directory: 'CACHE', encoding: 'utf8' });
        if (Share) await Share.share({ title: filename, url: res.uri });
        else MQ.toast('Arquivo salvo em ' + res.uri);
        return;
      } catch (e) {
        MQ.toast('Não foi possível salvar o arquivo: ' + (e.message || e), 'err');
        return;
      }
    }
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  MQ.pickFile = function (accept) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept || '';
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        if (f.size > 100e6) { MQ.toast('O arquivo tem mais de 100 MB. Escolha um arquivo menor.', 'err'); return resolve(null); }
        const rd = new FileReader();
        rd.onload = () => resolve({ name: f.name, text: rd.result });
        rd.onerror = () => { MQ.toast('Não foi possível ler o arquivo. Escolha-o de novo.', 'err'); resolve(null); };
        rd.readAsText(f, 'utf-8');
      });
      inp.click();
    });
  };

  MQ.openExternal = function (url) {
    if (window.mqNative && window.mqNative.openExternal) return window.mqNative.openExternal(url);
    const cap = window.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.Browser) return cap.Plugins.Browser.open({ url });
    window.open(url, '_blank', 'noopener');
  };
})(window.MQ);
