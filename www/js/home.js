/* Pulse — tela Início: continuar, meta do dia, revisões, ponto fraco, sequência e dias estudados */
(function (MQ) {
  'use strict';
  const { esc, $, $$, icon } = MQ;
  const DAY = MQ.DAY, MIN_WEAK = 15, DEFAULT_GOAL = 20;
  const weeksShown = () => (window.innerWidth >= 1200 ? 33 : window.innerWidth >= 760 ? 18 : 20); // o mapa preenche o cartão em cada formato

  /* ---------- Datas (dias locais; somar dias com setDate para não errar no horário de verão) ---------- */
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); };
  const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
  const mondayOf = ts => addDays(startOfDay(ts), -((new Date(ts).getDay() + 6) % 7));
  function ago(ts) {
    const m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'agora mesmo';
    if (m < 60) return 'há ' + m + ' min';
    const h = Math.round(m / 60);
    if (h < 24) return 'há ' + h + (h === 1 ? ' hora' : ' horas');
    const d = Math.round(h / 24);
    if (d === 1) return 'ontem';
    return 'há ' + d + (d === 1 ? ' dia' : ' dias');
  }
  const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

  /* ---------- Dados ---------- */
  MQ.dailyGoal = () => ((MQ.get('prefs', 'meta') || {}).daily) || DEFAULT_GOAL;

  function gather() {
    const rows = [], byDay = new Map();
    MQ.alive('attempts').forEach(a => {
      if (!a.ts) return;
      const k = dayKey(a.ts); // o dia estudado conta mesmo que a questão tenha sido removida depois
      byDay.set(k, (byDay.get(k) || 0) + 1);
      const q = MQ.get('questions', a.qid);
      if (q) rows.push({ a, q }); // áreas e ponto fraco só usam questões que ainda existem
    });
    return { rows, byDay };
  }

  function streakOf(byDay) {
    let d = startOfDay(Date.now());
    if (!byDay.has(dayKey(d))) d = addDays(d, -1); // hoje ainda não acabou: a sequência só quebra se ontem ficou vazio
    let n = 0;
    while (byDay.has(dayKey(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  /* Tema com pior acerto nos últimos 30 dias (mínimo de 15 respostas); tenta área › especialidade › tema, depois níveis acima */
  function weakTopic(rows) {
    const from = Date.now() - 30 * DAY;
    const recent = rows.filter(r => r.a.ts >= from);
    for (const depth of [3, 2, 1]) {
      const g = new Map();
      recent.forEach(r => {
        const p = MQ.qPath(r.q);
        if (p.length < depth) return;
        const path = p.slice(0, depth), k = path.join('>');
        const o = g.get(k) || { path, n: 0, ok: 0 };
        o.n++; if (r.a.correct) o.ok++;
        g.set(k, o);
      });
      const c = Array.from(g.values()).filter(o => o.n >= MIN_WEAK).sort((a, b) => a.ok / a.n - b.ok / b.n || b.n - a.n)[0];
      if (c) return c;
    }
    return null;
  }

  /* Questões de um tema: primeiro as que você errou, depois as não resolvidas, depois as já acertadas */
  function trainIds(path, n, latest) {
    const groups = [[], [], []];
    MQ.alive('questions').forEach(q => {
      const p = MQ.qPath(q);
      if (!path.every((x, i) => p[i] === x)) return;
      const a = latest[q.id];
      groups[a ? (a.correct ? 2 : 0) : 1].push(q.id);
    });
    return [].concat(...groups.map(g => MQ.shuffle(g))).slice(0, n);
  }

  /* Sessão rápida: revisões vencidas, depois o ponto fraco, depois não resolvidas, depois o que sobrar */
  function quickIds(n, weak, latest) {
    const out = new Set();
    const fill = ids => ids.forEach(id => { if (out.size < n) out.add(id); });
    fill(MQ.shuffle(MQ.reviewsDue().map(r => r.qid)));
    if (weak) fill(trainIds(weak.path, n, latest));
    fill(MQ.shuffle(MQ.alive('questions').filter(q => !latest[q.id]).map(q => q.id)));
    fill(MQ.shuffle(MQ.alive('questions').map(q => q.id)));
    return Array.from(out);
  }

  /* ---------- Cartões ---------- */
  function contCard(latest) {
    const run = MQ.alive('runs').filter(r => r.status === 'andamento' && r.startedAt + r.durationMin * 60000 > Date.now()).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (run) {
      const l = MQ.get('lists', run.listId) || {};
      const left = (run.startedAt + run.durationMin * 60000 - Date.now()) / 1000;
      const done = Object.keys(run.answers).filter(k => run.answers[k]).length;
      return '<div class="mk">Simulado em andamento</div><div class="tt">' + esc(l.name || 'Simulado') + '</div>' +
        '<div class="st">' + done + ' de ' + run.qids.length + ' respondidas · restam ' + MQ.fmtDuration(left) + '</div>' +
        '<div class="bar"><i style="width:' + MQ.pct(done, run.qids.length) + '%"></i></div>' +
        '<div class="row sb"><span class="st">iniciado ' + ago(run.startedAt) + '</span><button class="btn primary act-fixed" data-act="run" data-id="' + esc(run.id) + '">' + icon('play') + 'Continuar</button></div>';
    }
    const last = MQ.local.last;
    const l = last && last.listId && MQ.get('lists', last.listId);
    const lastIds = last && !last.listId && last.qids ? last.qids.filter(id => MQ.get('questions', id)) : [];
    const total = l ? l.qids.filter(id => MQ.get('questions', id)).length : lastIds.length;
    const idx = Math.min(last && last.idx || 0, Math.max(total - 1, 0));
    if (last && total && idx < total - 1) { // sessão que já chegou à última questão não é oferecida de novo
      let st = 'Questão ' + (idx + 1) + ' de ' + total;
      if (l) { const s = MQ.listStats(l); if (s.ok + s.err) st += ' · ' + plural(s.ok, 'acerto', 'acertos') + ', ' + plural(s.err, 'erro', 'erros'); }
      return '<div class="mk">Continuar de onde parei</div><div class="tt">' + esc(last.title || 'Questões') + '</div>' +
        '<div class="st">' + (l ? 'Lista' : 'Banco de questões') + ' · ' + st + '</div><div class="bar"><i style="width:' + MQ.pct(idx, total) + '%"></i></div>' +
        '<div class="row sb"><span class="st">' + ago(last.at) + '</span><button class="btn primary act-fixed" data-act="last">' + icon('play') + 'Continuar</button></div>';
    }
    return '<div class="mk">Sessão rápida</div><div class="tt">10 questões para agora</div><div class="st">Mistura suas revisões, seu ponto mais fraco e questões que você ainda não resolveu.</div>' +
      '<div class="row"><button class="btn primary act-fixed" data-act="quick"' + (MQ.alive('questions').length ? '' : ' disabled') + '>' + icon('bolt') + 'Começar</button></div>';
  }

  function goalCard(todayN, goal) {
    const p = Math.min(100, Math.round(todayN / goal * 100));
    const hit = todayN >= goal;
    const avg = MQ.avgTime();
    const left = goal - todayN;
    return '<div class="mk">Meta de hoje</div><div class="row hm-goal"><div class="ring' + (hit ? ' done' : '') + '" style="--p:' + p + '"><b>' + todayN + '/' + goal + '</b></div>' +
      '<div><div class="tt">' + (hit ? 'Meta batida!' : 'Faltam ' + left) + '</div><div class="st">' + (hit ? 'Você resolveu ' + plural(todayN, 'questão', 'questões') + ' hoje.' : (avg ? 'cerca de ' + Math.max(1, Math.round(left * avg / 60)) + ' min no seu ritmo' : 'responda para ver seu ritmo')) + '</div></div></div>' +
      '<div class="row"><button class="btn sm" data-act="goal">Mudar meta</button></div>';
  }

  function revCard() {
    const due = MQ.reviewsDue(), t0 = startOfDay(Date.now());
    const late = due.filter(r => r.due < t0).length;
    const total = MQ.alive('reviews').length;
    return '<div class="mk">Revisões de hoje</div>' +
      '<div class="row sb"><div class="num">' + due.length + ' <small>' + (due.length === 1 ? 'questão' : 'questões') + '</small></div>' +
      (late ? '<span class="badge err">' + late + (late === 1 ? ' atrasada' : ' atrasadas') + '</span>' : (!due.length && total ? '<span class="badge ok">' + icon('check') + 'Em dia</span>' : '')) + '</div>' +
      '<div class="st">' + (due.length ? 'Erradas que voltam hoje pela revisão espaçada.' : total ? 'Nada vence hoje. As próximas aparecem aqui.' : 'Quando você errar uma questão, ela volta aqui em 1, 3, 7, 15 e 30 dias.') + '</div>' +
      '<div class="row"><button class="btn" data-act="rev"' + (due.length ? '' : ' disabled') + '>Revisar agora</button></div>';
  }

  function weakCard(weak) {
    if (!weak) return '<div class="mk">' + icon('target') + 'Ponto mais fraco · 30 dias</div><div class="st">Resolva pelo menos ' + MIN_WEAK + ' questões de um mesmo tema nos últimos 30 dias para ver onde você mais erra.</div>';
    const p = MQ.pct(weak.ok, weak.n);
    return '<div class="mk">' + icon('target') + 'Ponto mais fraco · 30 dias</div><div class="tt">' + esc(weak.path.join(' › ')) + '</div>' +
      '<div class="st">' + p + '% de acerto em ' + plural(weak.n, 'resposta', 'respostas') + '</div><div class="bar"><i class="' + (p < 55 ? 'err' : '') + '" style="width:' + p + '%"></i></div>' +
      '<div class="row"><button class="btn" data-act="train">' + icon('bolt') + 'Treinar 20 questões</button></div>';
  }

  function streakCard(byDay) {
    const n = streakOf(byDay);
    const today = startOfDay(Date.now()), mon = mondayOf(today);
    const dots = [0, 1, 2, 3, 4, 5, 6];
    const letters = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
    return '<div class="mk">' + icon('flame') + 'Sequência</div><div class="num' + (n ? ' win' : '') + '">' + n + ' <small>' + (n === 1 ? 'dia' : 'dias') + '</small></div>' +
      '<div class="week" role="img" aria-label="Dias estudados nesta semana">' + dots.map(i => {
        const d = addDays(mon, i);
        return '<span class="' + (byDay.has(dayKey(d)) ? 'd' : '') + (d === today ? ' t' : '') + '">' + letters[i] + '</span>';
      }).join('') + '</div>' +
      (n ? '' : '<div class="st">Responda uma questão hoje para começar sua sequência.</div>');
  }

  /* Mapa de dias estudados (semanas em colunas, segunda a domingo): devolve o HTML e quantos dias têm resposta */
  MQ.studyHeat = function (byDay, WEEKS) {
    const today = startOfDay(Date.now());
    const start = addDays(mondayOf(today), -(WEEKS - 1) * 7);
    let cells = '', studied = 0;
    for (let w = 0; w < WEEKS; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const d = addDays(start, w * 7 + dow);
        if (d > today) { cells += '<i class="f"></i>'; continue; }
        const n = byDay.get(dayKey(d)) || 0;
        if (n) studied++;
        const lv = !n ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4;
        cells += '<i class="l' + lv + '" title="' + new Date(d).toLocaleDateString('pt-BR') + ': ' + plural(n, 'questão', 'questões') + '"></i>';
      }
    }
    return { studied, html: '<div class="heat" role="img" aria-label="' + studied + ' dias estudados nas últimas ' + WEEKS + ' semanas">' + cells + '</div>' +
      '<div class="row sb"><span class="st">' + plural(studied, 'dia estudado', 'dias estudados') + '</span><span class="heat-legend"><span>menos</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>mais</span></span></div>' };
  };
  MQ.attemptDays = () => gather().byDay;
  MQ.trainIds = trainIds;

  function heatCard(byDay) {
    const WEEKS = weeksShown();
    return '<div class="mk">Dias estudados · ' + WEEKS + ' semanas</div>' + MQ.studyHeat(byDay, WEEKS).html;
  }

  function areasCard(rows) {
    const from = Date.now() - 30 * DAY, g = new Map();
    rows.filter(r => r.a.ts >= from).forEach(r => {
      const k = r.q.area || 'Sem área';
      const o = g.get(k) || { n: 0, ok: 0 };
      o.n++; if (r.a.correct) o.ok++;
      g.set(k, o);
    });
    const list = Array.from(g).sort((a, b) => { const ia = MQ.AREAS.indexOf(a[0]), ib = MQ.AREAS.indexOf(b[0]); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return '<div class="mk">Acerto por grande área · 30 dias</div>' + (list.length ? '<div class="hbars">' + list.map(([k, o]) => {
      const p = MQ.pct(o.ok, o.n);
      return '<div class="hbar"><span>' + esc(k) + ' <span class="muted">· ' + o.n + '</span></span><b>' + p + '%</b><div class="bar"><i class="' + (p < 55 ? 'err' : '') + '" style="width:' + p + '%"></i></div></div>';
    }).join('') + '</div>' : '<div class="st">Ainda não há respostas nos últimos 30 dias.</div>');
  }

  function simsCard() {
    const runs = MQ.alive('runs').filter(r => r.status === 'concluido').sort((a, b) => b.finishedAt - a.finishedAt).slice(0, 3);
    return '<div class="mk">Simulados recentes</div>' + (runs.length ? runs.map(r => {
      const s = MQ.runScore(r), l = MQ.get('lists', r.listId) || {};
      return '<button class="hm-run" data-act="result" data-id="' + esc(r.id) + '"><span class="hm-rt"><span class="tt">' + esc(l.name || 'Simulado') + '</span><span class="st">' + MQ.fmtDate(r.finishedAt) + ' · ' + s.ok + '/' + s.total + '</span></span><b class="pct">' + MQ.pct(s.ok, s.total) + '%</b></button>';
    }).join('') : '<div class="st">Seus simulados concluídos aparecem aqui.</div>');
  }

  /* ---------- Tela ---------- */
  MQ.views.inicio = function (root) {
    MQ.alive('runs').filter(r => r.status === 'andamento' && r.startedAt + r.durationMin * 60000 <= Date.now()).forEach(r => MQ.finishRun(r)); // tempo esgotado: grava as respostas
    const { rows, byDay } = gather();
    const latest = MQ.latestByQ();
    const goal = MQ.dailyGoal(), todayN = byDay.get(dayKey(Date.now())) || 0;
    const weak = weakTopic(rows);
    const first = !rows.length && !MQ.alive('lists').length;
    const hour = new Date().getHours();
    const greet = hour >= 18 ? 'Boa noite' : hour < 5 ? 'Boa madrugada' : hour < 12 ? 'Bom dia' : 'Boa tarde';
    const date = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const st = MQ.syncStatus;
    const hello = '<div class="hm hm-hello"><div><div class="st">' + esc(date.charAt(0).toUpperCase() + date.slice(1)) + '</div><h1>' + greet + '</h1></div>' +
      '<span class="home-save"><span class="home-sync" role="status" aria-label="Salvamento: ' + esc(st.msg) + '" title="' + esc(st.msg) + '"><span class="sync-dot ' + MQ.syncDot(st.state) + '"></span><span class="sync-label">' + esc(st.msg) + '</span></span>' + MQ.retryHtml() + '</span></div>';
    const card = (cls, html) => '<section class="hm-card ' + cls + '">' + html + '</section>';
    const nQ = MQ.alive('questions').length;

    if (first) {
      root.innerHTML = '<div class="hm-grid first">' + hello +
        card('hm-cont hi', '<div class="mk">Comece por aqui</div><div class="tt">Sua primeira sessão</div><div class="st">Sugerimos uma meta de ' + DEFAULT_GOAL + ' questões por dia. Comece com uma sessão rápida de 10 ou escolha seus próprios filtros.</div>' +
          '<div class="row"><button class="btn primary act-fixed" data-act="quick"' + (nQ ? '' : ' disabled') + '>' + icon('bolt') + 'Sessão rápida: 10 questões</button><a class="btn" href="#/questoes">' + icon('search') + 'Escolher filtros</a></div>' +
          (nQ ? '' : '<div class="st">Ainda não há questões no banco. Elas aparecem aqui quando forem adicionadas.</div>')) +
        card('hm-meta', goalCard(0, goal)) + '</div>';
    } else {
      root.innerHTML = '<div class="hm-grid">' + hello +
        card('hm-cont hi', contCard(latest)) + card('hm-meta', goalCard(todayN, goal)) + card('hm-rev', revCard()) + card('hm-fraco', weakCard(weak)) +
        card('hm-streak', streakCard(byDay)) + card('hm-heat', heatCard(byDay)) + card('hm-areas', areasCard(rows)) + card('hm-sims', simsCard()) + '</div>';
    }

    root.onclick = e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'run') location.hash = '#/simulado/' + b.dataset.id;
      else if (act === 'result') location.hash = '#/resultado/' + b.dataset.id;
      else if (act === 'last') {
        const last = MQ.local.last;
        if (last.listId) MQ.openList(last.listId);
        else {
          const ids = (last.qids || []).filter(id => MQ.get('questions', id));
          if (!ids.length) { MQ.local.last = null; MQ.saveLocal(); MQ.toast('Essas questões não existem mais.'); MQ.render(); return; }
          MQ.openSolve({ title: last.title, qids: ids, ctx: last.ctx || 'banco', startIndex: Math.min(last.idx || 0, ids.length - 1) });
        }
      } else if (act === 'rev') {
        const ids = MQ.reviewsDue().sort((a, c) => a.due - c.due).map(r => r.qid); // as mais atrasadas primeiro
        MQ.openSolve({ title: 'Revisão de hoje', qids: ids, ctx: 'banco' });
      } else if (act === 'train') MQ.openSolve({ title: 'Treino: ' + weak.path[weak.path.length - 1], qids: trainIds(weak.path, 20, latest), ctx: 'banco' });
      else if (act === 'quick') MQ.openSolve({ title: 'Sessão rápida', qids: quickIds(10, weak, latest), ctx: 'banco' });
      else if (act === 'goal') goalDialog();
    };
  };

  function goalDialog() {
    MQ.modal({
      title: 'Meta diária',
      body: '<label class="field"><span>Questões por dia</span><input type="number" id="g-n" min="1" max="500" value="' + MQ.dailyGoal() + '" inputmode="numeric"></label><p class="muted small">A meta vale em todos os seus aparelhos.</p>',
      actions: [{ label: 'Cancelar', kind: 'ghost' }, { label: 'Salvar', kind: 'primary', onClick(close, box) {
        const n = Math.round(Number($('#g-n', box).value));
        if (!(n >= 1 && n <= 500)) { MQ.toast('Use um número entre 1 e 500.'); return false; }
        MQ.put('prefs', Object.assign(MQ.get('prefs', 'meta') || { id: 'meta' }, { daily: n }));
        if (MQ.reminderApply) MQ.reminderApply();
        MQ.render();
      } }]
    });
  }
})(window.MQ);
