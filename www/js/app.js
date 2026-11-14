/* Pulse — rotas e inicialização */
(function (MQ) {
  'use strict';
  const { $$, icon } = MQ;

  MQ.route = function () {
    const h = (location.hash || '#/inicio').replace(/^#\/?/, '');
    const [name, arg] = h.split('/');
    return { name: name || 'inicio', arg: arg ? decodeURIComponent(arg) : null };
  };

  const NAV_FOR = { anotacoes: 'anotacoes', inicio: 'inicio', questoes: 'questoes', resolver: 'questoes', listas: 'listas', simulado: 'listas', resultado: 'listas', desempenho: 'desempenho', configuracoes: 'configuracoes', cadastrar: 'configuracoes', sincronizar: 'configuracoes' };

  function focusKey(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const d = Object.keys(el.dataset || {})[0];
    return d ? el.tagName.toLowerCase() + '[data-' + d.replace(/[A-Z]/g, m => '-' + m.toLowerCase()) + '="' + CSS.escape(el.dataset[d]) + '"]' : null;
  }

  MQ.render = function () {
    clearInterval(MQ.tick);
    if (MQ.stopSearch) { MQ.stopSearch(); MQ.stopSearch = null; }
    MQ.hideMarkBar && MQ.hideMarkBar();
    MQ.keyHandler = null;
    MQ.hideTip && MQ.hideTip();
    $$('.popmenu').forEach(m => m.remove());
    if (document.body.classList.contains('logged-out')) return; // tela de entrada aberta: o app por trás não desenha nada
    const r = MQ.route();
    if (r.name === 'sincronizar') { location.replace('#/configuracoes'); return; } // rota antiga: agora fica em Configurações
    document.body.classList.toggle('in-solve', r.name === 'resolver');
    document.body.classList.toggle('in-sim', r.name === 'simulado');
    document.body.classList.toggle('in-res', r.name === 'resultado');
    if (r.name !== 'resolver') document.body.classList.remove('in-focus');
    const view = MQ.views[r.name] || MQ.views.questoes;
    const root = document.getElementById('view');
    root.onclick = null; // cada tela define o seu; senão o da tela anterior continua ouvindo
    const navKey = NAV_FOR[r.name] || 'questoes';
    $$('#nav a').forEach(a => { if (a.dataset.route === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    /* O render troca o DOM inteiro: guarda o foco (por id ou data-*) e devolve no elemento novo equivalente */
    const fa = document.activeElement, keep = fa && root.contains(fa) && fa !== root ? focusKey(fa) : null;
    const caret = keep && fa.selectionStart != null ? [fa.selectionStart, fa.selectionEnd] : null;
    try {
      view(root, r.arg);
      if (keep && document.activeElement === document.body) {
        const el = keep && root.querySelector(keep);
        if (!el || el.disabled) root.focus({ preventScroll: true }); // o elemento sumiu: o foco fica na tela, não no body
        else { el.focus({ preventScroll: true }); if (caret && el.setSelectionRange) try { el.setSelectionRange(caret[0], caret[1]); } catch (_) {} }
      }
    } catch (e) {
      console.error(e);
      root.innerHTML = '<div class="empty"><h2>Algo deu errado nesta tela</h2><p>' + MQ.esc(e.message || String(e)) + '</p><a class="btn" href="#/questoes">Voltar ao banco</a></div>';
    }
  };

  MQ.applyTheme = function () {
    const t = MQ.local.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };

  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    document.querySelectorAll('.fpage, .sheet-back').forEach(m => { if (m._close) m._close(); else m.remove(); }); // página de filtro/menu não sobrevive à troca de tela
    const r = MQ.route();
    MQ.render();
    const key = r.name + '/' + (r.arg || '');
    if (key !== lastRoute) { lastRoute = key; document.getElementById('view').focus({ preventScroll: true }); window.scrollTo(0, 0); }
  });
  document.addEventListener('keydown', e => { if (MQ.keyHandler) MQ.keyHandler(e); });

  /* Toque/clique numa imagem abre ampliada */
  document.addEventListener('click', e => {
    const img = e.target.closest && e.target.closest('img[data-zoom]');
    if (!img || img.closest('.modal')) return;
    e.preventDefault(); e.stopPropagation();
    MQ.modal({ title: 'Imagem', wide: true, body: '<img class="zoom-img" src="' + img.getAttribute('src') + '" alt="' + MQ.esc(img.alt) + '">' });
  }, true);

  /* Botão "voltar" do Android: fecha janelas antes de sair */
  document.addEventListener('DOMContentLoaded', () => {
    const cap = window.Capacitor;
    if (cap && cap.Plugins && cap.Plugins.App) {
      cap.Plugins.App.addListener('backButton', () => {
        const m = document.querySelector('.modal-back, .popmenu, .fpage, .sheet-back');
        if (m) { if (m._close) m._close(); else m.remove(); return; }
        if (location.hash && location.hash !== '#/inicio') history.back();
        else cap.Plugins.App.exitApp();
      });
    }
  });

  async function init() {
    $$('[data-icon]').forEach(s => { s.outerHTML = icon(s.dataset.icon); });
    MQ.loadLocal();
    MQ.applyTheme();
    dropOldCaches();
    await MQ.auth.gate(); // sem sessão: tela de login; com senha provisória: troca obrigatória antes de qualquer tela
    await MQ.loadData(); // GET /api/me e /api/dados
    if (MQ.reminderApply) MQ.reminderApply(); // reagenda o lembrete com a meta atual
    MQ.bankFilter = MQ.newFilter(); // depois de carregar os dados: o filtro padrão vem de MQ.local.filtroPadrao
    MQ.applyTheme();
    document.documentElement.style.setProperty('--font-scale', Math.max(MQ.MIN_FONT_SCALE, MQ.local.fontScale || 1));
    document.body.classList.remove('logged-out'); // o index.html começa escondido; só aparece com a conta e os dados carregados
    if (!location.hash) location.hash = '#/inicio';
    MQ.render();
    document.getElementById('view').focus({ preventScroll: true });
  }

  /* O site antigo registrava um service worker (modo offline). Agora é só online: cancela os registros e apaga os caches antigos. */
  function dropOldCaches() {
    if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister())).catch(e => console.error(e));
    if (window.caches) caches.keys().then(ks => ks.forEach(k => caches.delete(k))).catch(e => console.error(e));
  }
  init().catch(e => {
    console.error(e);
    // a entrada (login e senha provisória) já passou; aqui sobra falha de rede ou do servidor
    const msg = e.status === 401 || e.status === 403 ? ['Sua sessão terminou', 'Recarregue a página para entrar de novo.']
      : ['Não foi possível abrir seus dados', 'Verifique a conexão com a internet e tente de novo.'];
    document.body.classList.remove('logged-out');
    document.getElementById('view').innerHTML = '<div class="empty"><h2>' + msg[0] + '</h2><p>' + msg[1] + '</p><button class="btn primary" id="app-reload">Recarregar</button></div>';
    document.getElementById('app-reload').onclick = () => location.reload();
  });
})(window.MQ);
