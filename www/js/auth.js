/* Pulse — entrar com usuário e senha (conta criada pelo administrador), troca da senha provisória e sair.
   O servidor guarda a sessão em cookie (Laravel Sanctum); aqui só há as telas e as chamadas (PLANO-LARAVEL.md, etapa 6). */
(function (MQ) {
  'use strict';
  const { esc } = MQ;
  const A = MQ.auth = {};

  A.PRIVACY = 'O Pulse guarda no servidor a sua conta, as respostas, listas, simulados, anotações, revisões, marcações e a meta diária. Neste aparelho ficam só as preferências (tema, tamanho do texto, filtros) e o ponto onde você parou. Você pode exportar tudo em Configurações › Dados e backup.';
  const FORMATO = /^[a-z0-9.-]+$/;
  const SEM_REDE = 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  const MARK = '<svg width="44" height="44" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="#4338A8"/><path d="M12 34h8l4-8 5 14 22-22" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  A.isAdmin = me => !!me && me.role === 'admin';
  A.roleLabel = me => (A.isAdmin(me) ? 'Administrador' : 'Estudante');

  /* Quem está logado; null se não houver sessão. Qualquer outra resposta é erro de verdade. */
  async function fetchMe() {
    const res = await MQ.api('GET', '/api/me');
    if (res.status === 401) return null;
    if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { status: res.status });
    return res.json();
  }
  async function jsonOf(res) { try { return await res.json(); } catch (e) { return {}; } }
  const wait = res => {
    const n = parseInt(res.headers.get('Retry-After'), 10);
    return n > 0 ? n : 60;
  };

  /* Outra pessoa neste navegador: o "continuar de onde parei" e o progresso das listas não valem para ela */
  A.adopt = function (me) {
    if (MQ.local.owner != null && MQ.local.owner !== me.id) ['last', 'progress', 'lastBackup'].forEach(k => { delete MQ.local[k]; });
    MQ.local.owner = me.id;
    MQ.saveLocal();
  };

  /* ---------- Estrutura comum das telas de entrada ---------- */
  function screen(cardHtml) {
    document.body.classList.add('logged-out');
    const toast = document.getElementById('toast'); // o aviso "Entrar" já cumpriu o papel e cobriria o formulário
    if (toast) toast.className = 'toast';
    const el = document.createElement('main');
    el.id = 'login';
    el.innerHTML =
      '<section class="lg-brand" aria-hidden="true"><div class="lg-mark">' + MARK + '<b>Pulse</b></div>' +
      '<h2>Questões de residência no seu ritmo</h2>' +
      '<ul><li>Provas oficiais, filtros por assunto, banca e ano</li><li>Revisão espaçada dos seus erros e caderno de erros</li><li>Simulados cronometrados e desempenho por tema</li><li>Funciona no computador, no tablet e no celular</li></ul></section>' +
      '<section class="lg-card"><div class="lg-mark sm">' + MARK + '<b>Pulse</b></div>' + cardHtml + '</section>';
    document.body.appendChild(el);
    return el;
  }
  function leave(el) {
    el.remove(); // quem abriu a tela devolve o app (init ou resume): entre duas telas seguidas o app não pisca
  }
  /* Botão "Voltar ao app" das telas abertas com o app aberto: não prende quem esqueceu a senha com alterações não salvas */
  const backBtn = '<button type="button" class="btn ghost" id="lg-back">Voltar ao app</button>';
  function bindBack(el, resolve) { const b = el.querySelector('#lg-back'); if (b) b.onclick = () => { leave(el); resolve(null); }; }
  const showOn = (el, msg) => { el.textContent = msg; el.hidden = !msg; if (msg) el.scrollIntoView({ block: 'nearest' }); };
  /* Foco no primeiro campo só com mouse e teclado; no toque o teclado cobriria a tela */
  const focusFirst = (el, sel, force) => { if (force || matchMedia('(pointer: fine)').matches) setTimeout(() => { const f = el.querySelector(sel); if (f) f.focus(); }, 30); };

  const showToggle = '<label class="lg-show"><input type="checkbox" data-show> Mostrar senha</label>';
  function bindShow(root) {
    const t = root.querySelector('[data-show]');
    if (t) t.onchange = () => root.querySelectorAll('input[data-pw]').forEach(i => { i.type = t.checked ? 'text' : 'password'; });
  }

  /* Botão de enviar ocupado ou esperando o tempo do bloqueio */
  const off = btn => btn.getAttribute('aria-disabled') === 'true';
  function busy(btn, on, label) {
    if (on) { btn.setAttribute('aria-disabled', 'true'); btn.setAttribute('aria-busy', 'true'); } else { btn.removeAttribute('aria-disabled'); btn.removeAttribute('aria-busy'); }
    btn.textContent = label;
  }
  /* Bloqueio por tentativas: o aviso fixo fica no alerta; a contagem aparece no botão (sem repetir o alerta a cada segundo) */
  function countdown(btn, errEl, seconds, label) {
    showOn(errEl, 'Muitas tentativas. Tente de novo em ' + seconds + ' segundos.');
    return new Promise(resolve => {
      let n = seconds;
      const tick = () => {
        if (n <= 0) { showOn(errEl, ''); busy(btn, false, label); return resolve(); }
        btn.setAttribute('aria-disabled', 'true'); btn.removeAttribute('aria-busy'); btn.textContent = 'Aguarde ' + n + ' s'; n--;
        setTimeout(tick, 1000);
      };
      tick();
    });
  }

  /* ---------- Entrar ---------- */
  function screenLogin(opt) {
    opt = opt || {};
    return new Promise(resolve => {
      const el = screen(
        '<h1>Entrar</h1><p class="lg-sub">' + (opt.notice ? esc(opt.notice) : 'Use o usuário e a senha que o administrador criou para você.') + '</p>' +
        '<form class="lg-form" id="lg-form" novalidate>' +
        '<label class="field"><span>Usuário</span><input type="text" id="lg-user" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" maxlength="40" required></label>' +
        '<label class="field"><span>Senha</span><input type="password" id="lg-pass" name="password" autocomplete="current-password" data-pw maxlength="200" required></label>' + showToggle +
        '<p class="lg-err" id="lg-err" role="alert" hidden></p>' +
        '<button type="submit" class="btn primary big" id="lg-go">Entrar</button></form>' + (opt.canCancel ? backBtn : '') +
        '<p class="lg-fine">Esqueceu a senha? Peça ao administrador para criar uma nova.</p>' +
        '<p class="lg-fine lg-privacy"><b>Seus dados.</b> ' + esc(A.PRIVACY) + '</p>');
      const form = el.querySelector('#lg-form'), err = el.querySelector('#lg-err'), go = el.querySelector('#lg-go');
      bindShow(el); bindBack(el, resolve);
      form.onsubmit = async e => {
        e.preventDefault();
        if (off(go)) return;
        const username = el.querySelector('#lg-user').value.trim().toLowerCase(), password = el.querySelector('#lg-pass').value;
        showOn(err, '');
        if (!username || !password) { showOn(err, 'Digite o usuário e a senha.'); return; }
        if (!FORMATO.test(username)) { showOn(err, 'O usuário só tem letras minúsculas, números, ponto e hífen.'); return; }
        busy(go, true, 'Entrando…');
        try {
          const res = await MQ.api('POST', '/login', JSON.stringify({ username, password }));
          if (res.ok) { const me = await jsonOf(res); if (me.id) { leave(el); return resolve(me); } }
          if (res.status === 429) { await countdown(go, err, wait(res), 'Entrar'); return; }
          const j = res.ok ? {} : await jsonOf(res);
          // Mesma mensagem para senha errada, usuário que não existe e conta desativada (não revela quem tem conta)
          showOn(err, res.ok ? 'O servidor respondeu algo inesperado. Tente de novo em instantes.' : res.status === 422 ? ((j.errors && j.errors.username && j.errors.username[0]) || 'Usuário ou senha incorretos.') : 'O servidor não conseguiu entrar agora. Tente de novo em instantes.');
        } catch (x) {
          console.error(x);
          showOn(err, SEM_REDE);
        }
        busy(go, false, 'Entrar');
        el.querySelector('#lg-pass').select();
      };
      focusFirst(el, '#lg-user', opt.canCancel);
    });
  }

  /* ---------- Trocar a senha (obrigatória com senha provisória; opcional em Conta) ---------- */
  function pwFields(forced) {
    return '<label class="field"><span>' + (forced ? 'Senha provisória (a que você recebeu)' : 'Senha atual') + '</span><input type="password" id="pw-cur" autocomplete="current-password" data-pw maxlength="200" required></label>' +
      '<label class="field"><span>Senha nova</span><input type="password" id="pw-new" autocomplete="new-password" data-pw maxlength="200" aria-describedby="pw-hint" required><small id="pw-hint">De 10 a 72 caracteres, diferente da atual.</small></label>' +
      '<label class="field"><span>Repita a senha nova</span><input type="password" id="pw-new2" autocomplete="new-password" data-pw maxlength="200" required></label>' + showToggle +
      '<p class="lg-err" id="pw-err" role="alert" hidden></p>';
  }
  /* Valida, envia e devolve true se trocou. Mostra o erro no próprio formulário. */
  async function sendPassword(root, errEl, btn, label) {
    const cur = root.querySelector('#pw-cur').value, nova = root.querySelector('#pw-new').value, rep = root.querySelector('#pw-new2').value;
    showOn(errEl, '');
    const bytes = new TextEncoder().encode(nova).length;
    const bad = !cur ? 'Digite a senha atual.'
      : nova.length < 10 ? 'A senha nova precisa ter pelo menos 10 caracteres.'
        : bytes > 72 ? 'A senha pode ter no máximo 72 bytes (letras com acento e símbolos contam como 2 a 4).'
          : nova === cur ? 'A senha nova precisa ser diferente da atual.'
            : nova !== rep ? 'As duas senhas novas não são iguais.' : '';
    if (bad) { showOn(errEl, bad); return false; }
    busy(btn, true, 'Salvando…');
    try {
      const res = await MQ.api('POST', '/api/senha', JSON.stringify({ current_password: cur, password: nova }));
      if (res.ok) return true;
      if (res.status === 429) { await countdown(btn, errEl, wait(res), label); return false; }
      const j = await jsonOf(res), er = j.errors || {};
      showOn(errEl, res.status === 401 ? 'Sua sessão terminou. Recarregue a página e entre de novo.'
        : er.current_password ? 'A senha atual está incorreta.'
          : er.password ? (/72 bytes/.test(er.password[0]) ? er.password[0] : 'A senha nova não foi aceita. Use de 10 a 72 caracteres, diferente da atual.')
            : 'Não foi possível trocar a senha agora. Tente de novo em instantes.');
    } catch (x) {
      console.error(x);
      showOn(errEl, SEM_REDE);
    }
    busy(btn, false, label);
    return false;
  }

  /* Tela cheia, antes de qualquer outra: só sai trocando a senha (ou saindo da conta) */
  function screenChange(opt) {
    opt = opt || {};
    return new Promise(resolve => {
      const el = screen(
        '<h1>Crie a sua senha</h1><p class="lg-sub">A senha que você recebeu é provisória. Escolha uma senha só sua para continuar.</p>' +
        '<form class="lg-form" id="pw-form" novalidate>' + pwFields(true) + '<button type="submit" class="btn primary big" id="pw-go">Salvar senha e entrar</button></form>' +
        (opt.canCancel ? backBtn : '<button type="button" class="btn ghost" id="pw-out">Sair</button>') +
        '<p class="lg-fine lg-privacy"><b>Seus dados.</b> ' + esc(A.PRIVACY) + '</p>');
      bindShow(el); bindBack(el, resolve);
      el.querySelector('#pw-form').onsubmit = async e => {
        e.preventDefault();
        if (off(el.querySelector('#pw-go'))) return;
        if (await sendPassword(el, el.querySelector('#pw-err'), el.querySelector('#pw-go'), 'Salvar senha e entrar')) { leave(el); resolve(true); }
      };
      const out = el.querySelector('#pw-out');
      if (out) out.onclick = () => A.leaveServer().then(() => location.reload()).catch(() => showOn(el.querySelector('#pw-err'), SEM_REDE));
      focusFirst(el, '#pw-cur', opt.canCancel);
    });
  }

  /* Em Configurações › Conta: janela para trocar a senha */
  A.changePassword = function () {
    MQ.modal({
      title: 'Trocar senha',
      body: '<form class="lg-form" id="pw-form" novalidate>' + pwFields(false) + '<button type="submit" hidden></button></form>',
      onOpen: (root, close) => {
        bindShow(root);
        const go = root.querySelector('.modal-foot .primary');
        root.querySelector('#pw-form').onsubmit = async e => {
          e.preventDefault();
          if (off(go)) return;
          if (await sendPassword(root, root.querySelector('#pw-err'), go, 'Trocar senha')) { close(); MQ.toast('Senha trocada. Os outros aparelhos precisam entrar de novo.'); }
        };
      },
      actions: [
        { label: 'Cancelar', kind: 'ghost' },
        { label: 'Trocar senha', kind: 'primary', onClick: (close, root) => { root.querySelector('#pw-form').requestSubmit(); return false; } }
      ]
    });
  };

  /* ---------- Sair ---------- */
  /* Encerra a sessão no servidor e esquece os dados em memória. Lança erro se não conseguiu falar com o servidor. */
  A.leaveServer = async function () {
    const res = await MQ.api('POST', '/logout');
    if (!res.ok && res.status !== 401) throw new Error('HTTP ' + res.status); // 401: a sessão já tinha acabado
    await MQ.resetData();
  };
  A.signOut = async function () {
    if (MQ.pendingCount()) await MQ.saveNow(); // tenta enviar o que falta antes de sair
    const left = MQ.pendingCount();
    const ok = await MQ.confirm('Sair da conta',
      left ? (left === 1 ? '1 alteração ainda não foi salva e será perdida se você sair. Cancele para tentar de novo, ou exporte um backup em Configurações › Dados e backup.'
        : left + ' alterações ainda não foram salvas e serão perdidas se você sair. Cancele para tentar de novo, ou exporte um backup em Configurações › Dados e backup.')
        : 'Você vai precisar entrar de novo neste aparelho. Seus dados continuam guardados na sua conta.',
      left ? 'Sair mesmo assim' : 'Sair', !!left);
    if (!ok) return;
    try { await A.leaveServer(); } catch (e) { console.error(e); MQ.toast('Não foi possível sair agora. Confira a conexão e tente de novo.', 'err'); return; }
    history.replaceState(null, '', '#/inicio'); // sem hashchange: não redesenha uma tela vazia antes de recarregar
    location.reload();
  };

  /* ---------- Entradas usadas pelo app ---------- */
  /* Antes de carregar os dados: garante sessão e senha definitiva. Resolve com quem entrou. */
  A.gate = async function () {
    let me = await fetchMe();
    if (!me) me = await screenLogin();
    if (me.must_change_password) await screenChange();
    A.adopt(me);
    return me;
  };
  /* Com o app aberto: a sessão terminou (401) ou a senha ainda é provisória (403). Entra de novo e manda o que ficou na fila. */
  let resuming = null;
  A.resume = function () {
    resuming = resuming || (async () => {
      try {
        const keep = { canCancel: true };
        let me = await fetchMe();
        // Entrou outra pessoa: a fila é da anterior e não pode ir para a conta nova. Encerra essa sessão e pede a conta certa.
        while (!me || (MQ.me && me.id !== MQ.me.id)) {
          if (me) { await MQ.api('POST', '/logout'); keep.notice = 'Essa conta é outra. Entre com a conta ' + MQ.me.username + ' para salvar suas alterações.'; }
          me = await screenLogin(keep);
          if (!me) return; // voltou ao app sem entrar
        }
        if (me.must_change_password && !(await screenChange(keep))) return;
        MQ.me = Object.assign(MQ.me || {}, me, { must_change_password: false });
        await MQ.saveRetry();
      } catch (e) { console.error(e); MQ.toast(SEM_REDE, 'err'); } finally {
        resuming = null;
        document.body.classList.remove('logged-out');
        document.getElementById('view').focus({ preventScroll: true });
      }
    })();
    return resuming;
  };
})(window.MQ);
