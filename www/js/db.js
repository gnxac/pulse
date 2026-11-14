/* Pulse — dados do usuário. Ao abrir: GET /api/dados → MQ.data. Cada mudança entra numa fila em memória e vai
   em lotes para POST /api/salvar (PLANO-LARAVEL.md, etapas 4 e 5). Nada fica no IndexedDB; MQ.local (preferências
   deste aparelho) fica no localStorage. */
(function (MQ) {
  'use strict';

  /* As 9 coleções que o servidor guarda; só elas vão para a fila. questions só o admin grava (D3). */
  const COLLECTIONS = ['questions', 'attempts', 'folders', 'lists', 'runs', 'notes', 'reviews', 'prefs', 'marks'];
  /* Coleção = objeto de itens por id; "version" e "counter" são números e ficam de fora */
  const isColl = v => !!v && typeof v === 'object' && !Array.isArray(v);
  /* Chaves que, vindas de um JSON, alterariam o protótipo dos objetos */
  const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);
  const LOCAL_KEY = 'pulse:local';
  const MAX_ITENS = 500, MAX_BYTES = 4.5 * 1024 * 1024; // o servidor aceita 500 itens e 5 MB por chamada
  const REFRESH_MS = 5 * 60000; // ao voltar à aba depois disso, busca o que outro aparelho gravou

  function emptyData() {
    const d = { version: 1, counter: 0 };
    COLLECTIONS.forEach(c => { d[c] = {}; });
    return d;
  }

  MQ.data = emptyData();
  /* Só deste aparelho (localStorage): tema, fonte, abas, filtro padrão, progresso das listas, "continuar". */
  MQ.local = { fontScale: 1, theme: 'auto', deviceId: null };
  MQ.me = null; // { id, username, name, role, must_change_password } de GET /api/me
  MQ.isAdmin = () => !!(MQ.me && MQ.me.role === 'admin');

  MQ.loadLocal = function () {
    try { Object.assign(MQ.local, JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null')); } catch (e) { /* sem localStorage: fica o padrão */ }
    if (!MQ.local.deviceId) { MQ.local.deviceId = MQ.uid(); MQ.saveLocal(); }
  };
  MQ.saveLocal = function () {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(MQ.local)); } catch (e) { console.error(e); } // perder preferência não faz mal
    return Promise.resolve();
  };

  /* ---------- Servidor ---------- */
  function cookie(name) {
    const m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : '';
  }
  const csrf = () => fetch('/sanctum/csrf-cookie', { credentials: 'same-origin' });
  /* fetch com sessão e CSRF (Sanctum). 419 = token vencido: pega outro e tenta uma vez. */
  MQ.api = async function (method, path, body, extra) {
    const go = () => fetch(path, Object.assign({
      method, body, credentials: 'same-origin',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-XSRF-TOKEN': cookie('XSRF-TOKEN') }
    }, extra));
    if (method !== 'GET' && !cookie('XSRF-TOKEN')) await csrf();
    let res = await go();
    if (res.status === 419) { await csrf(); res = await go(); }
    return res;
  };
  function httpError(res) { const e = new Error('HTTP ' + res.status); e.status = res.status; return e; }

  /* known[coleção][id] = updatedAt que o servidor já tem. Item com updatedAt diferente está pendente.
     Comparar com o que está em memória pega toda mudança (MQ.put, MQ.remove, mergeData, restaurar backup). */
  let known = {}, cursor = null, lastFetch = 0;
  function remember(d) {
    COLLECTIONS.forEach(c => {
      const k = known[c] || (known[c] = Object.create(null));
      Object.keys(isColl(d[c]) ? d[c] : {}).forEach(id => { const o = d[c][id]; if (isColl(o)) k[id] = o.updatedAt || 0; });
    });
  }
  /* Dados do servidor: entram pela mesma regra do mergeData (vence o mais novo; o dedupe.js remapeia repetidas). */
  function applyServer(d) {
    cursor = d.ate || cursor;
    delete d.ate;
    const n = MQ.mergeData(d);
    remember(d);
    lastFetch = Date.now();
    return n;
  }

  MQ.loadData = async function () {
    const [me, dados] = await Promise.all([MQ.api('GET', '/api/me'), MQ.api('GET', '/api/dados')]);
    if (!me.ok) throw httpError(me);
    if (!dados.ok) throw httpError(dados);
    MQ.me = await me.json();
    MQ.data = emptyData(); known = {};
    applyServer(await dados.json());
    send(); // o que o remapeamento de repetidas mudou
  };

  /* Ao voltar à aba: só o que chegou ao servidor depois do último carregamento */
  async function refresh() {
    if (!MQ.me || !cursor) return;
    lastFetch = Date.now();
    try {
      const res = await MQ.api('GET', '/api/dados?desde=' + encodeURIComponent(cursor));
      if (!res.ok) throw httpError(res);
      // não redesenha a prova nem a questão aberta (perderia a alternativa marcada e a seleção)
      if (applyServer(await res.json()) && !['simulado', 'resolver'].includes(MQ.route().name)) MQ.render();
    } catch (e) { console.error(e); }
    send();
  }
  MQ.refreshData = refresh;

  /* ---------- Fila de envio ---------- */
  function pending() {
    const out = [];
    COLLECTIONS.forEach(c => {
      if (c === 'questions' && !MQ.isAdmin()) return; // estudante não grava questões
      const k = known[c] || (known[c] = Object.create(null)), all = MQ.data[c] || {};
      Object.keys(all).forEach(id => {
        const o = all[id];
        // o servidor recusaria o lote inteiro: id diferente da chave ou updatedAt que não é número
        if (UNSAFE.has(id) || !isColl(o) || o.id !== id || (o.updatedAt != null && typeof o.updatedAt !== 'number')) return;
        if (k[id] !== (o.updatedAt || 0)) out.push([c, id, o]);
      });
    });
    return out;
  }
  MQ.pendingCount = () => (MQ.me ? pending().length : 0);

  /* Monta lotes de até 500 itens e ~4,5 MB (texto em UTF-8 conta até 3 bytes por caractere) */
  function batches(list) {
    const out = [];
    let cur = null;
    list.forEach(([c, id, o]) => {
      const json = JSON.stringify(o), size = json.length * 3 + id.length + 8;
      if (!cur || cur.items.length >= MAX_ITENS || (cur.items.length && cur.bytes + size > MAX_BYTES)) out.push(cur = { items: [], bytes: 2 });
      cur.items.push({ c, id, json, u: o.updatedAt || 0 });
      cur.bytes += size;
    });
    return out;
  }
  const body = items => {
    const by = {};
    items.forEach(i => { (by[i.c] = by[i.c] || []).push(JSON.stringify(i.id) + ':' + i.json); });
    return '{' + Object.keys(by).map(c => JSON.stringify(c) + ':{' + by[c].join(',') + '}').join(',') + '}';
  };
  const ack = items => items.forEach(i => { (known[i.c] || (known[i.c] = Object.create(null)))[i.id] = i.u; });

  /* Envia um lote. Recusa definitiva (413, 422) num lote de vários: manda um a um para salvar os bons;
     o item recusado sozinho sai da fila com aviso (continua na tela até recarregar). 401 e 403 (sessão encerrada,
     senha provisória) não descartam nada: o lote fica na fila até a conta voltar. */
  async function post(items) {
    const res = await MQ.api('POST', '/api/salvar', body(items));
    if (res.ok) return ack(items);
    if (![413, 422].includes(res.status)) throw httpError(res);
    if (items.length > 1) { for (const i of items) await post([i]); return; }
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch (e) { /* sem corpo */ }
    console.error('Item recusado pelo servidor', items[0].c, items[0].id, res.status, msg);
    MQ.toast('Um item não pôde ser salvo e foi deixado de lado' + (msg ? ': ' + msg : '.'), 'err');
    ack(items);
  }

  let sending = null, timer = null, retryMs = 0, state = 'ok';
  /* Manda tudo o que está pendente, lote a lote, até a fila esvaziar (o que mudar no meio vai na volta seguinte).
     Quem chama durante um envio recebe a mesma promessa, que só termina com a fila vazia ou com erro. */
  function send() {
    clearTimeout(timer); timer = null;
    if (!MQ.me) return Promise.resolve();
    if (sending) return sending;
    sending = (async () => {
      await null; // sem isto, com a fila vazia o finally rodaria antes de "sending" receber a promessa e a travaria
      try {
        for (let n = 0; n < 1000; n++) {
          const list = pending();
          if (!list.length) break;
          setState('busy');
          for (const b of batches(list)) await post(b.items);
        }
        if (pending().length) throw new Error('fila não esvaziou');
        retryMs = 0;
        setState('ok');
      } catch (e) {
        console.error(e);
        setState('err', e.status);
        retryMs = Math.min(60000, retryMs ? retryMs * 2 : 2000); // 2 s, 4 s, 8 s… até 1 min
        timer = setTimeout(send, retryMs);
      } finally {
        sending = null;
      }
    })();
    return sending;
  }
  MQ.saveRetry = () => { retryMs = 0; return send(); };

  /* ---------- Indicador: Salvo / Salvando… / Não salvo · Tentar de novo ---------- */
  const STATES = { ok: ['on', 'Salvo', 'Salvo'], busy: ['busy', 'Salvando…', 'Salvando'], err: ['err', 'Não salvo', 'Não salvo'] };
  MQ.syncDot = s => (STATES[s] || STATES.ok)[0];
  MQ.syncStatus = { state: 'ok', msg: 'Salvo' };
  MQ.retryHtml = () => '<button type="button" class="btn sm save-retry" data-save-retry' + (state === 'err' ? '' : ' hidden') + '>Tentar de novo</button>';
  let avisado = false;
  function setState(s, status) {
    state = s;
    const [dot, msg, short] = STATES[s];
    MQ.syncStatus = { state: s, msg };
    // no celular o indicador só aparece no Início: o aviso vai também por toast, com o botão
    if (s === 'ok') avisado = false;
    if (s === 'err' && !avisado) {
      avisado = true; // um aviso por falha, não um a cada nova tentativa
      MQ.toast(status === 401 ? 'Sua sessão terminou. Entre de novo para salvar; suas alterações continuam aqui.'
        : status === 403 ? 'Troque a senha provisória para salvar; suas alterações continuam aqui.'
          : 'Não foi possível salvar. Suas alterações continuam aqui e serão enviadas quando a conexão voltar.', 'err', { label: 'Tentar de novo', fn: MQ.saveRetry });
    }
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('.sync-dot').forEach(d => { d.className = 'sync-dot ' + dot; });
    document.querySelectorAll('.sync-label').forEach(l => { l.textContent = msg; });
    document.querySelectorAll('.sync-short').forEach(l => { l.textContent = short; });
    document.querySelectorAll('.sync-pill, .home-sync').forEach(p => { p.title = msg; p.setAttribute('aria-label', 'Salvamento: ' + msg); });
    document.querySelectorAll('[data-save-retry]').forEach(b => { b.hidden = s !== 'err'; });
  }

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-save-retry]')) MQ.saveRetry(); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') send();
      else if (lastFetch && Date.now() - lastFetch >= REFRESH_MS) refresh();
    });
  }
  window.addEventListener('online', () => MQ.saveRetry());
  /* Fechar a aba com algo por enviar: o navegador pergunta antes de sair */
  window.addEventListener('beforeunload', e => { if (MQ.pendingCount()) { e.preventDefault(); e.returnValue = ''; } });
  /* Saindo de fato: última tentativa com keepalive (o navegador limita o corpo a 64 KB) */
  window.addEventListener('pagehide', () => {
    if (!MQ.me) return;
    const items = [];
    let bytes = 2;
    for (const [c, id, o] of pending()) {
      const json = JSON.stringify(o), size = json.length * 3 + id.length + 8;
      if (bytes + size > 60000) break;
      items.push({ c, id, json, u: o.updatedAt || 0 }); bytes += size;
    }
    if (items.length) MQ.api('POST', '/api/salvar', body(items), { keepalive: true }).catch(() => {});
  });

  /* Marca alteração: envia em 250 ms (junta várias mudanças seguidas num lote só) */
  MQ.touch = function () {
    clearTimeout(timer);
    timer = setTimeout(send, 250);
  };
  /* Envia já (resposta, simulado, importação). Falha não lança: o item fica na fila e o indicador mostra. */
  MQ.saveNow = () => send();

  /* ---------- Imagens (etapa 7: passam a vir do servidor) ---------- */
  MQ.media = {};
  MQ.saveMedia = () => Promise.resolve();
  /* Junta imagens recebidas; devolve quantas eram novas */
  MQ.mergeMedia = function (incoming) {
    let n = 0;
    Object.keys(incoming || {}).forEach(id => { if (!MQ.media[id]) { MQ.media[id] = incoming[id]; n++; } });
    return n;
  };
  MQ.imgHtml = function (id, alt) {
    const src = MQ.media[id];
    if (!src) return '<div class="qimg missing">Imagem ainda não disponível.</div>';
    return '<figure class="qimg"><img src="' + src + '" alt="' + MQ.esc(alt || 'Imagem da questão') + '" loading="lazy" data-zoom="' + MQ.esc(id) + '"></figure>';
  };

  /* Marca-texto de um backup: só trechos [início, fim, cor] válidos em alvos conhecidos, para um arquivo
     malformado não quebrar o marker.js nem pôr classe CSS solta. Devolve a coleção limpa para o mergeData. */
  MQ.cleanMarks = function (marks) {
    const out = {};
    if (!isColl(marks)) return out;
    const seg = g => Array.isArray(g) && g.length === 3 && Number.isInteger(g[0]) && Number.isInteger(g[1]) && g[0] >= 0 && g[1] > g[0] && /^[a-z]{1,12}$/.test(g[2]);
    const num = v => (typeof v === 'number' && isFinite(v) ? v : undefined);
    Object.keys(marks).forEach(id => {
      const o = marks[id];
      if (UNSAFE.has(id) || !isColl(o)) return;
      const base = { id, qid: id, updatedAt: num(o.updatedAt) || MQ.now(), createdAt: num(o.createdAt) }; // sem hora: vale como edição de agora
      if (o.deleted) { out[id] = { id, deleted: true, updatedAt: base.updatedAt, createdAt: base.createdAt }; return; }
      if (!isColl(o.m)) return;
      const m = {};
      Object.keys(o.m).forEach(k => {
        if (!/^(stem|[A-Z])$/.test(k) || !Array.isArray(o.m[k])) return;
        const s = o.m[k].filter(seg).map(g => g.slice()).sort((x, y) => x[0] - y[0]).filter((g, i, a) => !i || g[0] >= a[i - 1][1]);
        if (s.length) m[k] = s;
      });
      if (Object.keys(m).length) out[id] = Object.assign(base, { m });
    });
    return out;
  };

  /* Sai da conta neste navegador: esquece os dados em memória (o servidor continua com tudo) */
  MQ.resetData = async function () {
    clearTimeout(timer);
    MQ.data = emptyData(); MQ.media = {}; MQ.me = null; known = {}; cursor = null;
  };

  /* Registra/atualiza um item numa coleção */
  MQ.put = function (coll, obj) {
    obj.updatedAt = MQ.now();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    MQ.data[coll][obj.id] = obj;
    MQ.touch();
    return obj;
  };
  /* Exclusão vira "lápide" para que a remoção chegue ao servidor e aos outros aparelhos */
  MQ.remove = function (coll, id) {
    const o = MQ.data[coll][id];
    if (!o) return;
    MQ.data[coll][id] = { id, deleted: true, updatedAt: MQ.now(), createdAt: o.createdAt };
    MQ.touch();
  };
  MQ.alive = function (coll) {
    return Object.values(MQ.data[coll]).filter(o => o && !o.deleted);
  };
  MQ.get = function (coll, id) {
    const o = MQ.data[coll][id];
    return o && !o.deleted ? o : null;
  };

  MQ.nextCode = function () {
    let max = MQ.data.counter || 0;
    Object.values(MQ.data.questions).forEach(q => {
      const m = q && q.codigo && /^R1-(\d+)$/.exec(q.codigo);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    MQ.data.counter = max + 1;
    return 'R1-' + String(max + 1).padStart(5, '0');
  };

  /* Mescla dados (do servidor ou de um backup) nos que estão em memória: em cada item vence a edição mais recente.
     Aceita qualquer coleção que vier; só as 9 conhecidas vão para o servidor. O que mudou entra na fila. */
  MQ.mergeData = function (remote) {
    let changed = 0;
    if (!remote) return 0;
    Object.keys(remote).forEach(c => {
      const r = remote[c];
      if (UNSAFE.has(c) || !isColl(r)) return;
      const has = Object.prototype.hasOwnProperty.call(MQ.data, c);
      if (has && !isColl(MQ.data[c])) return;
      const l = has ? MQ.data[c] : (MQ.data[c] = {});
      Object.keys(r).forEach(id => {
        const ro = r[id];
        if (UNSAFE.has(id) || !ro || typeof ro !== 'object') return;
        const lo = Object.prototype.hasOwnProperty.call(l, id) ? l[id] : null;
        if (!lo || (ro.updatedAt || 0) > (lo.updatedAt || 0)) { l[id] = ro; changed++; }
      });
    });
    MQ.data.counter = Math.max(MQ.data.counter || 0, remote.counter || 0);
    if (changed) MQ.touch();
    return changed;
  };

  /* ---------- Consultas sobre respostas ---------- */
  MQ.attemptsByQ = function (filterFn) {
    const map = {};
    MQ.alive('attempts').forEach(a => {
      if (filterFn && !filterFn(a)) return;
      (map[a.qid] = map[a.qid] || []).push(a);
    });
    Object.values(map).forEach(arr => arr.sort((x, y) => x.ts - y.ts));
    return map;
  };

  /* Última resposta de cada questão (opcionalmente só num contexto, ex.: 'lista:ID') */
  MQ.latestByQ = function (ctx) {
    const map = {};
    MQ.alive('attempts').forEach(a => {
      if (ctx && a.ctx !== ctx) return;
      const cur = map[a.qid];
      if (!cur || a.ts > cur.ts) map[a.qid] = a;
    });
    return map;
  };

  /* ---------- Revisão espaçada (caixas de Leitner) ----------
     Coleção "reviews", um item por questão (id = id da questão): { box, due, lastAt }.
     Errou: volta para a caixa 0 e reaparece em 1 dia. Acertou uma questão em revisão que já venceu: sobe uma caixa
     (1, 3, 7, 15, 30 dias) e, depois da última, sai da revisão. */
  const DAY = 86400000, REV_DAYS = [1, 3, 7, 15, 30];
  MQ.DAY = DAY;
  MQ.endOfDay = function (ts) { const d = new Date(ts); d.setHours(23, 59, 59, 999); return d.getTime(); };
  MQ.endOfToday = function () { return MQ.endOfDay(Date.now()); };
  MQ.reviewUpdate = function (a) {
    if (!a || !MQ.get('questions', a.qid)) return;
    const cur = MQ.get('reviews', a.qid);
    const at = a.ts || MQ.now();
    const set = (box, days) => MQ.put('reviews', Object.assign(cur || { id: a.qid, qid: a.qid }, { box, due: at + days * DAY, lastAt: at }));
    if (!a.correct) set(0, REV_DAYS[0]);
    else if (cur && cur.due > MQ.endOfDay(at)) return; // ainda não venceu: acertar de novo antes da hora não sobe a caixa
    else if (cur) {
      const box = cur.box + 1;
      if (box >= REV_DAYS.length) MQ.remove('reviews', a.qid); else set(box, REV_DAYS[box]);
    }
  };
  /* Revisões que vencem até o fim de hoje (inclui as atrasadas) */
  MQ.reviewsDue = function () {
    const lim = MQ.endOfToday();
    return MQ.alive('reviews').filter(r => r.due <= lim && MQ.get('questions', r.qid));
  };

  MQ.recordAttempt = function (qid, choice, ctx, timeSec) {
    const q = MQ.get('questions', qid);
    if (!q) return null;
    const a = {
      id: MQ.uid(), qid, choice, correct: choice === q.gabarito,
      ctx: ctx || 'banco', ts: MQ.now(), timeSec: timeSec || null,
      device: MQ.local.deviceId
    };
    MQ.put('attempts', a);
    MQ.reviewUpdate(a);
    MQ.saveNow(); // a resposta vai ao servidor na hora, sem esperar os 250 ms
    return a;
  };

  /* Caminho de assunto da questão: [área, especialidade, tema, subtema] sem vazios */
  MQ.qPath = function (q) {
    return [q.area, q.especialidade, q.tema, q.subtema].map(s => (s || '').trim()).filter(Boolean);
  };

  MQ.views = MQ.views || {};

  MQ.AREAS = ['Clínica Médica', 'Cirurgia', 'Pediatria', 'Ginecologia', 'Obstetrícia', 'Medicina Preventiva', 'Outros'];
})(window.MQ);
