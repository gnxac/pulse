/* Pulse — tela Configurações: conta e salvamento, aparência, estudo, backup, atalhos, administrador e sobre */
(function (MQ) {
  'use strict';
  const { $, $$, esc, icon } = MQ;
  MQ.VERSION = '1.6.0'; // tests/versao.test.js confere com o package.json

  const SECTIONS = [['conta', 'Conta'], ['aparencia', 'Aparência'], ['estudo', 'Estudo'], ['dados', 'Dados e backup'], ['atalhos', 'Atalhos'], ['admin', 'Administrador'], ['sobre', 'Sobre']];
  const KEYS = [
    ['Em qualquer tela', [['Ctrl K', 'Buscar questão por texto ou código'], ['Ctrl 1–6', 'Início, Questões, Listas, Anotações, Desempenho, Configurações'], ['?', 'Mostrar os atalhos'], ['Esc', 'Fechar janela ou menu']]],
    ['Ao resolver', [['A–E', 'Escolher alternativa'], ['Shift A–E', 'Descartar alternativa'], ['Enter', 'Confirmar, depois próxima'], ['← →', 'Questão anterior ou próxima'], ['N', 'Anotação'], ['L', 'Adicionar à lista'], ['F', 'Modo foco (Esc sai)']]],
    ['No simulado', [['A–E', 'Marcar alternativa'], ['M', 'Marcar para revisar'], ['Shift C', 'Abrir o cartão-resposta'], ['Ctrl Enter', 'Finalizar (pede confirmação)']]]
  ];

  /* Respostas em CSV: uma linha por resposta, com o assunto e o tempo */
  function answersCSV() {
    const rows = [['Data', 'Código', 'Instituição', 'Ano', 'Assunto', 'Marcou', 'Gabarito', 'Resultado', 'Tempo (s)', 'Origem']];
    MQ.alive('attempts').sort((a, b) => a.ts - b.ts).forEach(a => {
      const q = MQ.get('questions', a.qid);
      rows.push([new Date(a.ts).toLocaleString('pt-BR'), q ? q.codigo : '', q ? q.instituicao : '', q ? q.ano : '', q ? MQ.qPath(q).join(' > ') : '', a.choice, q ? q.gabarito : '', a.correct ? 'certa' : 'errada', a.timeSec ? Math.round(a.timeSec) : '', MQ.ctxLabel ? MQ.ctxLabel(a.ctx) : a.ctx]);
    });
    return rows;
  }

  const phone = matchMedia('(max-width: 860px)');
  let phoneWatch = false;

  MQ.views.configuracoes = function (root, arg) {
    if (!phoneWatch) { phoneWatch = true; phone.addEventListener('change', () => { if (MQ.route().name === 'configuracoes') MQ.render(); }); }
    const theme = MQ.local.theme || 'auto';
    const scale = Math.round(Math.max(MQ.MIN_FONT_SCALE, MQ.local.fontScale || 1) * 100);
    const st = MQ.syncStatus;
    const secs = SECTIONS.filter(([k]) => k !== 'admin' || MQ.isAdmin());
    const nq = MQ.alive('questions').length, na = MQ.alive('attempts').length, nn = MQ.alive('notes').length;

    /* Celular: lista com o valor atual à direita; cada item abre a própria subtela (#/configuracoes/<seção>) */
    const ph = phone.matches, one = ph && secs.some(([k]) => k === arg) ? arg : null;
    const VALUES = { conta: st.msg, aparencia: { auto: 'Automático', light: 'Claro', dark: 'Escuro' }[theme] + ' · ' + scale + '%', estudo: MQ.dailyGoal() + '/dia', dados: na + ' respostas', atalhos: '', admin: '', sobre: 'v' + MQ.VERSION };
    const menu = '<nav class="set-menu" aria-label="Seções">' + secs.filter(([k]) => k !== 'atalhos' || matchMedia('(pointer: fine)').matches).map(([k, l]) => '<a class="set-link" href="#/configuracoes/' + k + '"><span>' + l + '</span><span class="set-val">' + esc(VALUES[k]) + '</span>' + icon('right') + '</a>').join('') + '</nav>';
    const bk = MQ.local.lastBackup, pend = MQ.pendingCount();
    const status = '<aside class="set-status" aria-label="Status do salvamento e do backup"><h2>Status</h2><dl class="kv">' +
      '<dt>Salvamento</dt><dd>' + esc(st.msg) + '</dd>' +
      '<dt>Alterações pendentes</dt><dd>' + (pend ? pend + ' por enviar' : 'nenhuma') + '</dd>' +
      '<dt>Último backup</dt><dd>' + (bk ? MQ.fmtDateTime(bk) : 'nunca exportado') + '</dd></dl></aside>';

    root.innerHTML = (one
      ? '<div class="page-head"><div><a class="btn sm" href="#/configuracoes">' + icon('left') + ' Configurações</a><h1>' + esc(secs.find(([k]) => k === one)[1]) + '</h1></div></div>'
      : '<div class="page-head"><div><h1>Configurações</h1></div></div>') +
      '<div class="set-wrap">' +
      (ph ? (one ? '' : menu) :'<nav class="set-index" aria-label="Seções">' + secs.map(([k, l]) => '<a href="#/configuracoes/' + k + '" data-go="' + k + '">' + l + '</a>').join('') + '</nav>') +
      '<div class="settings">' +
      '<section class="set-sec" id="s-conta"><h2>Conta</h2>' +
      '<div class="set-row"><div class="sync-pill set-pill" role="status" title="' + esc(st.msg) + '" aria-label="Salvamento: ' + esc(st.msg) + '"><span class="sync-dot ' + MQ.syncDot(st.state) + '"></span><span class="sync-label">' + esc(st.msg) + '</span></div>' + MQ.retryHtml() + '</div>' +
      '<p class="muted small">Suas respostas, listas, simulados, anotações, revisões, marcações e a meta diária ficam salvos na sua conta, no servidor do Pulse.</p></section>' +

      '<section class="set-sec" id="s-aparencia"><h2>Aparência</h2>' +
      '<div class="set-row"><span>Tema</span><div class="seg" role="group" aria-label="Tema">' +
      [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => '<button data-theme-set="' + v + '" aria-pressed="' + (theme === v) + '">' + l + '</button>').join('') + '</div></div>' +
      '<div class="set-row"><label for="fs-range">Tamanho do enunciado</label><output id="fs-val" aria-live="polite">' + scale + '%</output></div>' +
      '<input type="range" id="fs-range" min="88" max="160" step="4" value="' + scale + '" aria-label="Tamanho do enunciado">' +
      '<div class="set-preview stem" id="fs-prev">Homem de 64 anos com insuficiência cardíaca de fração de ejeção reduzida chega ao pronto-socorro com dispneia. Qual conduta reduz a mortalidade nesse cenário?</div>' +
      '<p class="muted small">Vale só neste aparelho. O tamanho nunca fica abaixo de 88%.</p></section>' +

      '<section class="set-sec" id="s-estudo"><h2>Estudo</h2>' +
      '<div class="set-row"><label for="g-n">Meta diária (questões por dia)</label><input type="number" id="g-n" min="1" max="500" value="' + MQ.dailyGoal() + '" inputmode="numeric" class="num-sm"></div>' +
      '<p class="muted small" style="margin-top:-4px">A meta vale em todos os seus aparelhos e aparece no Início.</p>' +
      (MQ.reminderAvailable() ? '<div class="set-row"><label for="rm-on">Lembrete diário</label><span class="set-inline"><input type="time" id="rm-t" value="' + ((MQ.local.reminder || {}).time || '20:00') + '" aria-label="Horário do lembrete"><input type="checkbox" class="sw" id="rm-on"' + ((MQ.local.reminder || {}).on ? ' checked' : '') + '></span></div>' : '<p class="muted small">O lembrete diário por notificação está disponível no app para Android.</p>') +
      '<div class="set-row"><span>Filtro padrão em Questões</span><div class="seg" role="group" aria-label="Filtro padrão">' +
      [['nao', 'Que não resolvi'], ['todas', 'Todas']].map(([v, l]) => '<button data-fp="' + v + '" aria-pressed="' + ((MQ.local.filtroPadrao || 'nao') === v) + '">' + l + '</button>').join('') + '</div></div></section>' +

      '<section class="set-sec" id="s-dados"><h2>Dados e backup</h2>' +
      '<p class="muted small">' + nq + ' questões · ' + na + ' respostas · ' + nn + ' anotações na sua conta.</p>' +
      '<div class="set-actions"><button class="btn" id="d-export">' + icon('download') + ' Exportar backup completo</button><button class="btn" id="d-restore">' + icon('upload') + ' Restaurar de um arquivo</button><button class="btn" id="d-csv">' + icon('download') + ' Exportar respostas (CSV)</button></div>' +
      '<p class="muted small">Restaurar junta o arquivo com o que você já tem e não apaga o que é mais novo que o arquivo. O backup inclui questões, listas, respostas, anotações, revisões e imagens.</p></section>' +

      '<section class="set-sec" id="s-atalhos"><details' + (matchMedia('(pointer: fine)').matches ? ' open' : '') + '><summary><h2>Atalhos de teclado</h2></summary>' + KEYS.map(([t, rows]) => '<h3 class="set-sub">' + t + '</h3><dl class="kbd-list">' + rows.map(r => '<dt><kbd>' + esc(r[0]) + '</kbd></dt><dd>' + esc(r[1]) + '</dd>').join('') + '</dl>').join('') +
      '<p class="muted small">Atalhos de letra não funcionam enquanto você digita num campo.</p></details></section>' +

      (MQ.isAdmin() ? '<section class="set-sec" id="s-admin"><h2>Administrador</h2><a class="set-link" href="#/cadastrar"><span>Cadastrar questões</span>' + icon('right') + '</a><button class="btn" id="bank-dedupe" style="margin-top:10px">Remover questões repetidas</button></section>' : '') +

      '<section class="set-sec" id="s-sobre"><h2>Sobre</h2><p><b>Pulse</b> · versão ' + MQ.VERSION + '</p><p class="muted small">Banco de questões para residência médica. Seus dados ficam na sua conta, no servidor do Pulse, e podem ser exportados em Dados e backup.</p></section>' +
      '</div>' + (ph ? '' : status) + '</div>';
    if (ph) { if (one) $$('.set-sec', root).forEach(s => { if (s.id !== 's-' + one) s.remove(); }); else $('.settings', root).remove(); }
    const sub = $('.set-sec h2', root); if (ph && one && sub) sub.hidden = true; // o título já está no cabeçalho

    if ($('#bank-dedupe', root)) $('#bank-dedupe', root).onclick = MQ.dedupeDialog;

    $$('[data-go]', root).forEach(a => a.onclick = e => { e.preventDefault(); const t = $('#s-' + a.dataset.go, root); if (t) { t.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); t.tabIndex = -1; t.focus({ preventScroll: true }); } });
    $$('[data-theme-set]', root).forEach(b => b.onclick = () => {
      MQ.local.theme = b.dataset.themeSet; MQ.saveLocal(); MQ.applyTheme();
      $$('[data-theme-set]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
    if ($('#fs-range', root)) $('#fs-range', root).oninput = e => { MQ.setFontScale(+e.target.value / 100); $('#fs-val', root).textContent = e.target.value + '%'; };
    if ($('#g-n', root)) $('#g-n', root).onchange = e => {
      const n = Math.round(Number(e.target.value));
      if (!(n >= 1 && n <= 500)) { MQ.toast('Use um número entre 1 e 500.'); e.target.value = MQ.dailyGoal(); return; }
      e.target.value = n;
      MQ.put('prefs', Object.assign(MQ.get('prefs', 'meta') || { id: 'meta' }, { daily: n }));
      MQ.toast('Meta diária: ' + n + ' questões.');
      if (MQ.reminderApply) MQ.reminderApply(); // o texto do lembrete usa a meta
    };
    if ($('#rm-on', root)) {
      const apply = async () => { const ok = await MQ.reminderSet($('#rm-on', root).checked, $('#rm-t', root).value || '20:00'); if (!ok) $('#rm-on', root).checked = !!(MQ.local.reminder || {}).on; else MQ.toast($('#rm-on', root).checked ? 'Lembrete diário ligado.' : 'Lembrete diário desligado.'); };
      $('#rm-on', root).onchange = apply;
      $('#rm-t', root).onchange = () => { if ($('#rm-on', root).checked) apply(); };
    }
    $$('[data-fp]', root).forEach(b => b.onclick = () => {
      const wasDefault = JSON.stringify(MQ.bankFilter) === JSON.stringify(MQ.newFilter()); // não descarta um filtro que você está montando
      MQ.local.filtroPadrao = b.dataset.fp; MQ.saveLocal(); if (wasDefault) MQ.bankFilter = MQ.newFilter();
      $$('[data-fp]', root).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    });
    if ($('#d-export', root)) $('#d-export', root).onclick = () => { MQ.backupExport(); MQ.local.lastBackup = Date.now(); MQ.saveLocal(); if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) MQ.toast('Backup exportado.'); };
    if ($('#d-restore', root)) $('#d-restore', root).onclick = MQ.backupRestore;
    if ($('#d-csv', root)) $('#d-csv', root).onclick = () => MQ.saveFile('pulse-respostas-' + new Date().toISOString().slice(0, 10) + '.csv', '﻿' + MQ.toCSV(answersCSV()), 'text/csv;charset=utf-8');
  };
})(window.MQ);
