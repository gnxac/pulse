/* Caderno R1 — marca-texto no enunciado e nas alternativas (5 cores claras).
   As marcações vão para o servidor na coleção marks, uma por questão: { id: qid, qid, m: { alvo: [[início, fim, cor], ...] } }
   onde alvo é "stem" (enunciado) ou a letra da alternativa, e início/fim contam caracteres do texto. */
(function (MQ) {
  'use strict';

  MQ.MARK_COLORS = [
    ['red', 'Vermelho'], ['yellow', 'Amarelo'], ['blue', 'Azul'], ['green', 'Verde'], ['pink', 'Rosa']
  ];

  MQ.marksFor = function (qid) { const o = MQ.get('marks', qid); return (o && o.m) || {}; };
  MQ.hasMarks = function (qid) {
    const m = MQ.marksFor(qid);
    return Object.keys(m).some(k => m[k] && m[k].length);
  };
  MQ.clearMarks = function (qid) { MQ.remove('marks', qid); };

  /* Pinta [s,e) com a cor (ou apaga, se cor = null) sobre segmentos que não se sobrepõem. */
  function paint(segs, s, e, color) {
    const out = [];
    (segs || []).forEach(([a, b, c]) => {
      if (b <= s || a >= e) { out.push([a, b, c]); return; }
      if (a < s) out.push([a, s, c]);
      if (b > e) out.push([e, b, c]);
    });
    if (color) out.push([s, e, color]);
    out.sort((x, y) => x[0] - y[0]);
    const merged = [];
    out.forEach(g => {
      const last = merged[merged.length - 1];
      if (last && last[2] === g[2] && last[1] >= g[0]) last[1] = Math.max(last[1], g[1]);
      else merged.push(g.slice());
    });
    return merged;
  }

  /* Envolve os trechos marcados em <mark>, percorrendo os nós de texto do contêiner. */
  function applyTo(el, segs) {
    if (!segs || !segs.length) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let pos = 0;
    nodes.forEach(node => {
      const len = node.nodeValue.length;
      const start = pos, end = pos + len;
      pos = end;
      const hits = segs.filter(([a, b]) => a < end && b > start);
      if (!hits.length) return;
      const frag = document.createDocumentFragment();
      let cur = start;
      const text = node.nodeValue;
      hits.forEach(([a, b, c]) => {
        const s = Math.max(a, start), e = Math.min(b, end);
        if (s > cur) frag.appendChild(document.createTextNode(text.slice(cur - start, s - start)));
        const mk = document.createElement('mark');
        mk.className = 'hl hl-' + c;
        mk.textContent = text.slice(s - start, e - start);
        frag.appendChild(mk);
        cur = e;
      });
      if (cur < end) frag.appendChild(document.createTextNode(text.slice(cur - start)));
      node.parentNode.replaceChild(frag, node);
    });
  }

  function offsetIn(el, node, off) {
    const r = document.createRange();
    r.setStart(el, 0);
    try { r.setEnd(node, off); } catch (e) { return 0; }
    return r.toString().length;
  }

  /* Alvos (contêiner + trecho) cobertos pela seleção atual dentro de root. */
  function targetsOf(root, qid) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const out = [];
    root.querySelectorAll('[data-mk]').forEach(el => {
      if (!range.intersectsNode(el)) return;
      const len = el.textContent.length;
      const s = el.contains(range.startContainer) ? offsetIn(el, range.startContainer, range.startOffset) : 0;
      const e = el.contains(range.endContainer) ? offsetIn(el, range.endContainer, range.endOffset) : len;
      if (e > s) out.push({ key: el.dataset.mk, s, e });
    });
    return out.length ? { qid, list: out, rect: range.getBoundingClientRect() } : null;
  }

  let bar = null, pending = null, watcher = null, touching = false;

  function hideBar() { if (bar) { bar.remove(); bar = null; } pending = null; }
  MQ.hideMarkBar = hideBar;

  function showBar(p) {
    hideBar();
    pending = p;
    bar = document.createElement('div');
    bar.className = 'mk-bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Marca-texto');
    bar.innerHTML = MQ.MARK_COLORS.map(([c, n]) =>
      '<button class="mk-sw hl-' + c + '" data-color="' + c + '" title="' + n + '" aria-label="Marcar em ' + n.toLowerCase() + '"></button>').join('') +
      '<button class="mk-erase" data-color="" title="Apagar marcação" aria-label="Apagar marcação">' + MQ.icon('eraser') + '</button>';
    document.body.appendChild(bar);
    // Aplica no pointerdown, com a seleção já guardada em "pending". No Android, preventDefault em
    // touchstart cancela o click e o toque recolhe a seleção, por isso nada aqui depende de click.
    bar.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-color]');
      e.preventDefault();
      if (!b || !pending) return;
      touching = true;
      apply(pending, b.dataset.color || null);
    });
    bar.addEventListener('mousedown', e => e.preventDefault());
    bar.addEventListener('click', e => e.preventDefault());
    const r = p.rect, bw = bar.offsetWidth, bh = bar.offsetHeight;
    const touch = matchMedia('(pointer: coarse)').matches;
    // no celular fica abaixo da seleção, longe do menu nativo de copiar/colar
    let top = touch ? r.bottom + 34 : r.top - bh - 10; // 34px: abaixo das alças de seleção do Android
    if (top < 8) top = r.bottom + (touch ? 34 : 12);
    if (top + bh > window.innerHeight - 8) top = Math.max(8, r.top - bh - (touch ? 64 : 10)); // acima, fora do menu nativo
    let left = r.left + r.width / 2 - bw / 2;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    bar.style.top = (top + window.scrollY) + 'px';
    bar.style.left = (left + window.scrollX) + 'px';
  }

  function apply(p, color) {
    const cur = MQ.get('marks', p.qid);
    const m = Object.assign({}, cur && cur.m);
    p.list.forEach(t => { m[t.key] = paint(m[t.key], t.s, t.e, color); if (!m[t.key].length) delete m[t.key]; });
    if (Object.keys(m).length) MQ.put('marks', { id: p.qid, qid: p.qid, m, createdAt: cur && cur.createdAt });
    else MQ.remove('marks', p.qid);
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideBar();
    MQ.render();
    setTimeout(() => { touching = false; }, 400);
  }

  /* Liga o marca-texto numa tela de questão já desenhada. */
  MQ.enableMarker = function (root, qid) {
    const marks = MQ.marksFor(qid);
    root.querySelectorAll('[data-mk]').forEach(el => applyTo(el, marks[el.dataset.mk]));
    if (watcher) document.removeEventListener('selectionchange', watcher);
    let tm;
    watcher = function () {
      clearTimeout(tm);
      tm = setTimeout(() => {
        if (!root.isConnected) { document.removeEventListener('selectionchange', watcher); hideBar(); return; }
        if (touching) return; // toque em andamento na própria barra: não esconder
        const p = targetsOf(root, qid);
        if (p) showBar(p); else hideBar();
      }, 220);
    };
    document.addEventListener('selectionchange', watcher);
  };

  /* Um clique que terminou uma seleção de texto não deve marcar a alternativa. */
  let hadSel = false;
  document.addEventListener('pointerdown', () => {
    const sel = window.getSelection();
    hadSel = !!(sel && !sel.isCollapsed);
  }, true);
  MQ.selectingIn = function (el) {
    if (hadSel) { hadSel = false; return true; } // o toque só desfez uma seleção
    const sel = window.getSelection();
    return !!(sel && !sel.isCollapsed && sel.rangeCount && el.contains(sel.getRangeAt(0).commonAncestorContainer));
  };

  window.addEventListener('hashchange', hideBar);
  window.addEventListener('resize', hideBar);
})(window.MQ);
