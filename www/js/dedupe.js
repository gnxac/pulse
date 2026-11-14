/* Caderno R1 — questões repetidas: detecção, importação sem duplicar e limpeza do que já existe */
(function (MQ) {
  'use strict';

  /* Chave: primeiros 400 caracteres do enunciado + TODAS as alternativas + gabarito, sem acento/pontuação/espaço/"(cid:N)".
     Alternativas e gabarito inteiros evitam fundir casos clínicos longos que só diferem no fim. Imagens não entram. */
  const clean = s => MQ.norm(String(s || '').replace(/\(cid:\d+\)/gi, '')).replace(/[^a-z0-9]/g, '');
  /* Alternativas em ordem alfabética (pega a mesma questão embaralhada); o gabarito entra pelo TEXTO da alternativa certa, não pela letra. */
  MQ.dupKey = function (q) {
    const e = clean(q.enunciado);
    const alts = q.alternativas || [];
    const g = alts.find(a => a.l === q.gabarito);
    const ts = alts.map(a => clean(a.t));
    if (ts.some(t => !t) || new Set(ts).size < ts.length) return ''; // alternativa vazia (só imagem) ou repetida: letra ambígua, não deduplica
    return e ? e.slice(0, 400) + '|' + ts.slice().sort().join('|') + '|' + (g ? clean(g.t) : q.gabarito || '') : '';
  };
  /* Troca de letras para as respostas da cópia valerem na existente: { letraNaCopia: letraNaExistente } ou null se igual */
  function permOf(copy, keep) {
    const m = {};
    let diff = false;
    (copy.alternativas || []).forEach(a => {
      const b = (keep.alternativas || []).find(x => clean(x.t) === clean(a.t));
      if (b) { m[a.l] = b.l; if (b.l !== a.l) diff = true; }
    });
    return diff ? m : null;
  }
  const fixChoice = (c, perm) => (perm && perm[c]) || c;
  const oldest = (x, y) => (x.createdAt || 0) - (y.createdAt || 0) || (x.id < y.id ? -1 : 1);

  /* Índice chave → id da mais antiga; refeito sob demanda depois de qualquer mudança (touch/mergeData) */
  let idx = null;
  MQ.dupIndex = function () {
    if (!idx) {
      idx = new Map();
      MQ.alive('questions').sort(oldest).forEach(q => { const k = MQ.dupKey(q); if (k && !idx.has(k)) idx.set(k, q.id); });
    }
    return idx;
  };
  /* Questão já existente igual a q (de outro id), ou null */
  MQ.dupFind = function (q) {
    const id = MQ.dupIndex().get(MQ.dupKey(q));
    return id && id !== q.id ? MQ.get('questions', id) : null;
  };
  ['touch', 'mergeData'].forEach(fn => { const orig = MQ[fn]; MQ[fn] = function () { idx = null; return orig.apply(this, arguments); }; });

  /* Preenche o que falta na existente; se a origem (instituição + ano) for diferente, acrescenta a da cópia
     ("ENAMED 2026 · Revalida 2026/2"). O ID da existente não muda. */
  const FILL = ['comentario', 'area', 'especialidade', 'tema', 'subtema', 'instituicao', 'uf', 'ano', 'finalidade', 'banca', 'professor'];
  const label = q => [q.instituicao, q.ano].filter(x => x !== '' && x != null).join(' ');
  MQ.dupMerge = function (keep, q) {
    let ch = false;
    FILL.forEach(k => { if ((keep[k] === '' || keep[k] == null) && q[k] !== '' && q[k] != null) { keep[k] = q[k]; ch = true; } });
    const origs = keep.origens || (label(keep) ? [label(keep)] : []);
    const nl = label(q);
    if (nl && !origs.some(o => clean(o) === clean(nl)) && !clean(keep.instituicao).includes(clean(nl))) {
      keep.origens = origs.concat(nl);
      keep.instituicao = keep.origens.join(' · ');
      ch = true;
    }
    if (ch && MQ.data.questions[keep.id] === keep) keep.updatedAt = MQ.now(); // quem chama dá o touch() no fim do lote
    return ch;
  };

  const uniq = a => Array.from(new Set(a));

  /* Mescla pacote/backup/banco publicado sem criar repetidas: a repetida some e listas/respostas/simulados apontam para a existente.
     dry=true só conta. Devolve { changed, added, dup }. */
  MQ.mergeDeduped = function (remote, dry) {
    const map = {}, perms = {}, keeps = {}, seen = new Map();
    let added = 0, dup = 0, same = 0; // same: já existe com o mesmo ID (reimportação)
    const r = Object.assign({}, remote, { questions: {} });
    Object.keys(remote.questions || {}).forEach(id => {
      const q = remote.questions[id];
      if (q && !q.deleted && MQ.get('questions', id)) same++;
      if (!q || q.deleted || MQ.data.questions[id]) { r.questions[id] = q; return; }
      const k = MQ.dupKey(q);
      const keep = (k && MQ.dupFind(q)) || (k && seen.has(k) && r.questions[seen.get(k)]) || null;
      if (keep) { map[id] = keep.id; perms[id] = permOf(q, keep); keeps[id] = keep; dup++; if (!dry) MQ.dupMerge(keep, q); return; }
      r.questions[id] = q; added++;
      if (k) seen.set(k, id);
    });
    if (dry) return { changed: 0, added, dup: dup + same };
    const m = a => uniq((a || []).map(x => map[x] || x));
    if (dup) {
      const mapColl = (coll, fn) => { if (!remote[coll]) return; r[coll] = {}; Object.keys(remote[coll]).forEach(i => { const o = remote[coll][i]; r[coll][i] = o && !o.deleted ? fn(Object.assign({}, o)) : o; }); };
      mapColl('lists', l => { l.qids = m(l.qids); return l; });
      mapColl('attempts', a => {
        const k = keeps[a.qid];
        if (k) { a.choice = fixChoice(a.choice, perms[a.qid]); a.correct = a.choice === k.gabarito; a.qid = k.id; }
        return a;
      });
      mapColl('runs', x => {
        x.qids = m(x.qids); x.flags = m(x.flags);
        if (x.cut) { const cut = {}; Object.keys(x.cut).forEach(q => { const to = map[q] || q; cut[to] = cut[to] || x.cut[q].map(c => fixChoice(c, perms[q])); }); x.cut = cut; }
        if (x.answers) { const ans = {}; Object.keys(x.answers).forEach(q => { const to = map[q] || q; ans[to] = ans[to] || fixChoice(x.answers[q], perms[q]); }); x.answers = ans; }
        if (x.times) { const t = {}; Object.keys(x.times).forEach(q => { const to = map[q] || q; t[to] = (t[to] || 0) + x.times[q]; }); x.times = t; }
        return x;
      });
    }
    const changed = MQ.mergeData(r);
    if (dup) MQ.touch();
    return { changed, added, dup: dup + same };
  };

  /* ---------- Limpar o que já existe ---------- */
  MQ.dedupeScan = function () {
    const g = new Map();
    MQ.alive('questions').forEach(q => { const k = MQ.dupKey(q); if (k) { if (!g.has(k)) g.set(k, []); g.get(k).push(q); } });
    return Array.from(g.values()).filter(a => a.length > 1)
      .map(a => a.sort(oldest));
  };

  /* Passa respostas, listas, simulados e marcações da repetida para a que fica; depois a repetida vira deleted:true */
  function remap(from, to, perm) {
    const toQ = MQ.get('questions', to);
    const swap = a => uniq((a || []).map(x => x === from ? to : x));
    MQ.alive('attempts').filter(a => a.qid === from).forEach(a => {
      a.qid = to;
      if (perm) { a.choice = fixChoice(a.choice, perm); a.correct = !!toQ && a.choice === toQ.gabarito; }
      MQ.put('attempts', a);
    });
    MQ.alive('lists').filter(l => (l.qids || []).includes(from)).forEach(l => { l.qids = swap(l.qids); MQ.put('lists', l); });
    MQ.alive('runs').forEach(r => {
      let ch = false;
      if ((r.qids || []).includes(from)) { r.qids = swap(r.qids); ch = true; }
      if ((r.flags || []).includes(from)) { r.flags = swap(r.flags); ch = true; }
      if (r.cut && r.cut[from]) { if (!r.cut[to]) r.cut[to] = r.cut[from].map(c => fixChoice(c, perm)); delete r.cut[from]; ch = true; } // tesoura (alternativas descartadas)
      if (r.answers && from in r.answers) { if (!r.answers[to]) r.answers[to] = fixChoice(r.answers[from], perm); delete r.answers[from]; ch = true; }
      if (r.times && from in r.times) { r.times[to] = (r.times[to] || 0) + r.times[from]; delete r.times[from]; ch = true; }
      if (ch) MQ.put('runs', r);
    });
    const rf = MQ.get('reviews', from);
    if (rf) {
      const rt = MQ.get('reviews', to);
      if (!rt || rf.due < rt.due) MQ.put('reviews', { id: to, qid: to, box: rf.box, due: rf.due, lastAt: rf.lastAt });
      MQ.remove('reviews', from);
    }
    const nf = MQ.get('notes', from);
    if (nf) {
      const nt = MQ.get('notes', to);
      MQ.put('notes', { id: to, qid: to, text: nt && nt.text && nt.text !== nf.text ? nt.text + '\n\n' + nf.text : nf.text });
      MQ.remove('notes', from);
    }
    const mf = MQ.get('marks', from);
    if (mf) {
      const mt = MQ.get('marks', to);
      MQ.put('marks', { id: to, qid: to, m: Object.assign({}, mf.m, mt && mt.m), createdAt: mt && mt.createdAt });
      MQ.remove('marks', from);
    }
  }
  function absorb(keep, d) {
    MQ.dupMerge(keep, d);
    const perm = permOf(d, keep);
    remap(d.id, keep.id, perm);
    MQ.remove('questions', d.id);
    MQ.data.questions[d.id].dupOf = keep.id;
    if (perm) MQ.data.questions[d.id].dupMap = perm; // lápide lembra quem ficou (dupOf) e as letras (dupMap): outros aparelhos remapeiam o que apontar para a removida
  }

  /* Depois de qualquer mesclagem: lápides com dupOf vencem a cópia viva (mesmo que mais nova) e o que apontar para elas vai para a que ficou */
  const origMerge = MQ.mergeData;
  MQ.mergeData = function (remote) {
    Object.keys((remote && remote.questions) || {}).forEach(id => {
      const t = remote.questions[id], lo = MQ.data.questions[id];
      if (t && t.deleted && t.dupOf && lo && !lo.deleted) lo.updatedAt = 0;
    });
    const n = origMerge.apply(this, arguments);
    Object.values(MQ.data.questions).forEach(t => {
      if (t && t.deleted && t.dupOf && MQ.get('questions', t.dupOf)) remap(t.id, t.dupOf, t.dupMap);
    });
    return n;
  };

  MQ.dedupeDialog = async function () {
    const groups = MQ.dedupeScan();
    if (!groups.length) { MQ.toast('Nenhuma questão repetida.'); return; }
    const n = groups.reduce((s, g) => s + g.length - 1, 0);
    const ok = await MQ.confirm('Remover questões repetidas', groups.length + (groups.length === 1 ? ' grupo' : ' grupos') + ', ' + n + (n === 1 ? ' questão será removida' : ' questões serão removidas') +
      '. Fica a mais antiga de cada grupo; as respostas, listas, simulados e marcações das outras passam para ela.', 'Remover ' + n, true);
    if (!ok) return;
    groups.forEach(g => g.slice(1).forEach(d => absorb(g[0], d)));
    MQ.toast(n + (n === 1 ? ' questão repetida removida.' : ' questões repetidas removidas.'));
    MQ.render();
  };
})(window.MQ);
