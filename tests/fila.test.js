/* Fila de envio do db.js (PLANO-LARAVEL.md, etapa 5): carrega de GET /api/dados e grava por POST /api/salvar.
   Rodar: node tests/fila.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

(async () => {
  let t = 1000;
  const toasts = [], reqs = [], timers = [], winEv = {}, docEv = {};
  let rede = true, renders = 0;
  const salvo = {}; // o que o "servidor" recebeu: coleção → id → item
  let respostaPost = null; // função (corpo) → status, para simular recusas
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/api-dados.json'), 'utf8'));
  let dadosResposta = () => Object.assign({ ate: '2026-11-14T13:00:00.000000Z' }, JSON.parse(JSON.stringify(fixture)));
  let me = { id: 2, username: 'estudante-teste', name: 'Estudante', role: 'estudante', must_change_password: false };

  const resposta = (status, corpo) => ({ ok: status >= 200 && status < 300, status, json: async () => corpo });
  const ctx = {
    console, JSON, Object, Array, Set, Promise, Math, Date, Error, encodeURIComponent, decodeURIComponent,
    localStorage: { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].fn = null; },
    addEventListener: (ev, fn) => { (winEv[ev] = winEv[ev] || []).push(fn); },
    document: { cookie: 'XSRF-TOKEN=abc%3D', addEventListener: (ev, fn) => { (docEv[ev] = docEv[ev] || []).push(fn); }, visibilityState: 'visible' },
    fetch: async (url, opts) => {
      opts = opts || {};
      reqs.push({ url, method: opts.method || 'GET', body: opts.body, headers: opts.headers || {}, keepalive: !!opts.keepalive });
      if (!rede) throw new TypeError('Failed to fetch');
      if (url === '/api/me') return resposta(200, me);
      if (url.startsWith('/api/dados')) return resposta(200, dadosResposta(url));
      if (url === '/sanctum/csrf-cookie') return resposta(204);
      if (url === '/api/salvar') {
        const corpo = JSON.parse(opts.body);
        const st = respostaPost ? respostaPost(corpo) : 200;
        if (st !== 200) return resposta(st, { message: 'recusado' });
        Object.keys(corpo).forEach(c => Object.assign(salvo[c] = salvo[c] || {}, corpo[c]));
        return resposta(200, { aceitos: {} });
      }
      throw new Error('rota inesperada ' + url);
    }
  };
  ctx.window = ctx;
  ctx.MQ = {
    uid: () => 'id' + (++t), now: () => ++t, esc: s => String(s),
    toast: (msg, kind, act) => toasts.push({ msg, kind, act }), route: () => ({ name: 'inicio' }), render: () => { renders++; }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../www/js/db.js'), 'utf8'), ctx);
  const MQ = ctx.MQ;
  const posts = () => reqs.filter(r => r.url === '/api/salvar');
  const evento = (lista, ev, e) => (lista[ev] || []).forEach(fn => fn(e || {}));
  const querSair = () => { let pediu = false; evento(winEv, 'beforeunload', { preventDefault: () => { pediu = true; } }); return pediu; };

  // 1. Ao abrir: /api/me e /api/dados entram em MQ.data; nada fica pendente; IndexedDB nunca é usado
  MQ.loadLocal();
  assert.ok(MQ.local.deviceId);
  assert.ok(JSON.parse(ctx.localStorage.getItem('pulse:local')).deviceId); // MQ.local vai para o localStorage
  await MQ.loadData();
  assert.strictEqual(MQ.me.role, 'estudante');
  assert.strictEqual(MQ.isAdmin(), false);
  assert.strictEqual(MQ.get('notes', 'q1').text, 'Lembrar: ação → reação');
  assert.strictEqual(MQ.get('questions', 'q2'), null);
  assert.strictEqual(MQ.data.ate, undefined);
  assert.strictEqual(MQ.pendingCount(), 0);
  assert.strictEqual(posts().length, 0);
  assert.ok(!/indexedDB/.test(fs.readFileSync(path.join(__dirname, '../www/js/db.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));

  // 2. Uma mudança fica pendente (fechar a aba pede confirmação) e vai num POST com CSRF; depois, Salvo
  MQ.put('notes', { id: 'n1', qid: 'n1', text: 'nova' });
  assert.strictEqual(MQ.pendingCount(), 1);
  assert.strictEqual(querSair(), true);
  assert.ok(timers.some(x => x.fn && x.ms === 250)); // debounce de 250 ms
  await MQ.saveNow();
  assert.strictEqual(posts().length, 1);
  assert.strictEqual(posts()[0].headers['X-XSRF-TOKEN'], 'abc=');
  assert.deepStrictEqual(Object.keys(JSON.parse(posts()[0].body)), ['notes']);
  assert.strictEqual(salvo.notes.n1.text, 'nova');
  assert.strictEqual(MQ.pendingCount(), 0);
  assert.strictEqual(querSair(), false);
  assert.strictEqual(MQ.syncStatus.msg, 'Salvo');

  // 3. Só as 9 coleções vão; estudante não manda questões; MQ.local não vai ao servidor
  MQ.put('questions', { id: 'qx', enunciado: 'de estudante' });
  MQ.data.futuro = { x: { id: 'x', updatedAt: 5 } };
  MQ.local.theme = 'dark'; MQ.saveLocal();
  assert.strictEqual(MQ.pendingCount(), 0);
  await MQ.saveNow();
  assert.strictEqual(posts().length, 1);
  assert.strictEqual(JSON.parse(ctx.localStorage.getItem('pulse:local')).theme, 'dark');

  // 4. Sem rede: "Não salvo", aviso com "Tentar de novo", nada some da tela, nova tentativa agendada (2 s, depois 4 s)
  rede = false;
  MQ.put('lists', { id: 'l9', name: 'Cardio', qids: ['q1'] });
  await MQ.saveNow();
  assert.strictEqual(MQ.syncStatus.state, 'err');
  assert.strictEqual(MQ.syncStatus.msg, 'Não salvo');
  assert.strictEqual(toasts[toasts.length - 1].act.label, 'Tentar de novo');
  assert.strictEqual(MQ.get('lists', 'l9').name, 'Cardio');
  assert.strictEqual(MQ.pendingCount(), 1);
  assert.strictEqual(timers[timers.length - 1].ms, 2000);
  await MQ.saveNow();
  assert.strictEqual(timers[timers.length - 1].ms, 4000);
  assert.strictEqual(toasts.filter(x => /Não foi possível salvar/.test(x.msg)).length, 1); // um aviso só, não a cada tentativa
  assert.strictEqual(querSair(), true);
  // a rede volta: tudo chega
  rede = true;
  evento(winEv, 'online');
  await MQ.saveNow();
  assert.strictEqual(salvo.lists.l9.name, 'Cardio');
  assert.strictEqual(MQ.syncStatus.msg, 'Salvo');
  assert.strictEqual(MQ.pendingCount(), 0);

  // 5. Lotes de até 500 itens
  const antes = posts().length;
  for (let i = 0; i < 1200; i++) MQ.put('attempts', { id: 'a' + i, qid: 'q1', choice: 'A', correct: true, ts: i });
  await MQ.saveNow();
  assert.deepStrictEqual(posts().slice(antes).map(r => Object.keys(JSON.parse(r.body).attempts).length), [500, 500, 200]);
  assert.strictEqual(Object.keys(salvo.attempts).length, 1200);

  // 6. Item recusado (422) num lote: os bons são salvos um a um, o ruim sai da fila com aviso
  respostaPost = corpo => (corpo.notes && corpo.notes.ruim ? 422 : 200);
  MQ.put('notes', { id: 'boa', text: 'ok' });
  MQ.put('notes', { id: 'ruim', text: 'x' });
  await MQ.saveNow();
  respostaPost = null;
  assert.strictEqual(salvo.notes.boa.text, 'ok');
  assert.strictEqual(salvo.notes.ruim, undefined);
  assert.ok(/não pôde ser salvo/.test(toasts[toasts.length - 1].msg));
  assert.strictEqual(MQ.pendingCount(), 0);

  // 6b. Sessão encerrada (401) ou senha provisória (403): nada sai da fila, aviso próprio; com a conta de volta, tudo chega
  respostaPost = () => 403;
  MQ.put('notes', { id: 'n403', text: 'espera' });
  await MQ.saveNow();
  assert.strictEqual(MQ.syncStatus.state, 'err');
  assert.ok(/senha provisória/.test(toasts[toasts.length - 1].msg));
  assert.strictEqual(toasts[toasts.length - 1].act.label, 'Trocar senha');
  assert.strictEqual(MQ.pendingCount(), 1);
  // com 401/403 repetir o envio não adianta: o botão abre a tela de entrada (auth.js) e ela é que reenvia
  let entrou = 0;
  MQ.auth = { resume: () => { entrou++; } };
  MQ.retryClick();
  assert.strictEqual(entrou, 1);
  delete MQ.auth;
  respostaPost = null;
  await MQ.saveRetry();
  assert.strictEqual(salvo.notes.n403.text, 'espera');

  // 7. Token CSRF vencido (419): pega outro e tenta de novo
  let vezes = 0;
  respostaPost = () => (++vezes === 1 ? 419 : 200);
  MQ.put('prefs', { id: 'meta', daily: 50 });
  await MQ.saveNow();
  respostaPost = null;
  assert.strictEqual(salvo.prefs.meta.daily, 50);
  assert.ok(reqs.some(r => r.url === '/sanctum/csrf-cookie'));

  // 8. Ao voltar à aba: ?desde= com o cursor; o que chegou de outro aparelho entra e não volta para a fila
  dadosResposta = url => {
    assert.strictEqual(url, '/api/dados?desde=' + encodeURIComponent('2026-11-14T13:00:00.000000Z'));
    return { ate: '2026-11-14T13:05:00.000000Z', notes: { n9: { id: 'n9', text: 'do celular', updatedAt: 99999999 } } };
  };
  await MQ.refreshData();
  assert.strictEqual(MQ.get('notes', 'n9').text, 'do celular');
  assert.strictEqual(MQ.pendingCount(), 0);
  assert.ok(renders > 0);

  // 9. Saindo da página com algo pendente: última tentativa com keepalive
  MQ.put('runs', { id: 'r9', listId: 'l9', answers: {}, status: 'andamento' });
  evento(winEv, 'pagehide');
  const ultimo = reqs[reqs.length - 1];
  assert.strictEqual(ultimo.keepalive, true);
  assert.ok(JSON.parse(ultimo.body).runs.r9);
  await MQ.saveNow();

  // 10. Admin grava questões
  me = Object.assign({}, me, { role: 'admin' });
  dadosResposta = () => Object.assign({ ate: '2026-11-14T13:10:00.000000Z' }, JSON.parse(JSON.stringify(fixture)));
  await MQ.loadData();
  assert.strictEqual(MQ.isAdmin(), true);
  MQ.put('questions', { id: 'nova', enunciado: 'do admin', alternativas: [] });
  await MQ.saveNow();
  assert.strictEqual(salvo.questions.nova.enunciado, 'do admin');

  console.log('fila: ok');
})().catch(e => { console.error(e); process.exit(1); });
