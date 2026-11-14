/* Caderno R1 — cadastrar, importar e gerenciar questões */
(function (MQ) {
  'use strict';
  const { esc, $, $$, icon } = MQ;

  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  const FINALIDADES = ['Residência (Acesso Direto)', 'R+ Clínica Médica', 'R+ Cirurgia', 'R+ Ginecologia e Obstetrícia', 'R+ Pediatria', 'Revalida', 'ENAMED', 'Título de Especialista', 'Concurso para médicos'];
  const CSV_COLS = ['enunciado', 'A', 'B', 'C', 'D', 'E', 'gabarito', 'comentario', 'area', 'especialidade', 'tema', 'subtema', 'instituicao', 'uf', 'ano', 'finalidade', 'banca', 'professor', 'tipo', 'anulada', 'desatualizada'];

  let tab = 'nova';
  let keepTaxonomy = null;

  function distinct(field) {
    const s = new Set();
    MQ.alive('questions').forEach(q => { const v = (q[field] || '').toString().trim(); if (v) s.add(v); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }
  function datalist(id, values) {
    return '<datalist id="' + id + '">' + values.map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>';
  }

  MQ.views.cadastrar = function (root, qid) {
    if (!MQ.isAdmin()) {
      root.innerHTML = '<div class="empty"><h2>Área restrita</h2><p>Cadastrar, editar e importar questões fica disponível só para a conta do administrador. Entre com ela em Configurações para liberar.</p><a class="btn" href="#/questoes">Voltar ao banco</a></div>';
      return;
    }
    if (qid) tab = 'nova';
    const tabs = [['nova', qid ? 'Editar questão' : 'Nova questão'], ['importar', 'Importar e exportar'], ['gerenciar', 'Gerenciar questões']];
    root.innerHTML = '<div class="page-head"><div><h1>Cadastrar questões</h1><p>Monte seu banco: digite, importe uma planilha ou restaure um backup.</p></div></div>' +
      '<div class="tabs-lite" role="tablist">' + tabs.map(([k, l]) => '<button class="btn' + (tab === k ? ' primary' : '') + '" role="tab" aria-selected="' + (tab === k) + '" data-etab="' + k + '">' + l + '</button>').join('') + '</div><div id="e-body"></div>';
    $$('[data-etab]', root).forEach(b => b.onclick = () => { tab = b.dataset.etab; if (qid && tab === 'nova') { location.hash = '#/cadastrar'; return; } MQ.render(); });
    const body = $('#e-body', root);
    if (tab === 'nova') formView(body, qid);
    else if (tab === 'importar') importView(body);
    else manageView(body);
  };

  function formView(body, qid) {
    const editing = qid ? MQ.get('questions', qid) : null;
    if (qid && !editing) { body.innerHTML = '<p class="muted">Questão não encontrada.</p>'; return; }
    const base = editing || Object.assign({ tipo: 'multipla', alternativas: 'ABCDE'.split('').map(l => ({ l, t: '' })), gabarito: '' }, keepTaxonomy || {});
    const q = JSON.parse(JSON.stringify(base));
    if (q.tipo === 'certoerrado') q.alternativas = [{ l: 'C', t: 'Certo' }, { l: 'E', t: 'Errado' }];

    body.innerHTML = '<form class="form-card" id="qform" novalidate>' +
      '<div class="row"><label class="field"><span>Tipo</span><select id="q-tipo"><option value="multipla"' + (q.tipo !== 'certoerrado' ? ' selected' : '') + '>Múltipla escolha</option><option value="certoerrado"' + (q.tipo === 'certoerrado' ? ' selected' : '') + '>Certo ou errado</option></select></label>' +
      (editing ? '<label class="field"><span>Código</span><input type="text" value="' + esc(editing.codigo) + '" disabled></label>' : '') + '</div>' +
      '<label class="field"><span>Enunciado</span><textarea id="q-enun" rows="6" placeholder="Caso clínico e pergunta. Deixe uma linha em branco entre parágrafos.">' + esc(q.enunciado || '') + '</textarea></label>' +
      '<div class="field"><span>Alternativas <small>— clique na letra para marcar o gabarito</small></span><div id="q-alts"></div>' +
      (q.tipo !== 'certoerrado' ? '<div class="toolbar"><button type="button" class="btn sm" id="q-add-alt">' + icon('plus') + ' Alternativa</button></div>' : '') + '</div>' +
      '<label class="field"><span>Comentário (aparece depois de responder)</span><textarea id="q-com" rows="4">' + esc(q.comentario || '') + '</textarea></label>' +
      '<h3 class="small" style="margin:18px 0 8px">Assunto</h3><div class="row">' +
      '<label class="field"><span>Grande área</span><input type="text" id="q-area" list="dl-area" value="' + esc(q.area || '') + '"></label>' +
      '<label class="field"><span>Especialidade</span><input type="text" id="q-esp" list="dl-esp" value="' + esc(q.especialidade || '') + '"></label>' +
      '<label class="field"><span>Tema</span><input type="text" id="q-tema" list="dl-tema" value="' + esc(q.tema || '') + '"></label>' +
      '<label class="field"><span>Subtema</span><input type="text" id="q-sub" list="dl-sub" value="' + esc(q.subtema || '') + '"></label></div>' +
      '<h3 class="small" style="margin:8px 0 8px">Origem</h3><div class="row">' +
      '<label class="field"><span>Instituição</span><input type="text" id="q-inst" list="dl-inst" value="' + esc(q.instituicao || '') + '"></label>' +
      '<label class="field"><span>UF</span><select id="q-uf"><option value="">—</option>' + UFS.map(u => '<option' + (q.uf === u ? ' selected' : '') + '>' + u + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Ano</span><input type="number" id="q-ano" min="1990" max="2100" value="' + esc(q.ano || '') + '"></label>' +
      '<label class="field"><span>Finalidade</span><input type="text" id="q-fin" list="dl-fin" value="' + esc(q.finalidade || '') + '"></label>' +
      '<label class="field"><span>Banca</span><input type="text" id="q-banca" list="dl-banca" value="' + esc(q.banca || '') + '"></label>' +
      '<label class="field"><span>Professor (comentário)</span><input type="text" id="q-prof" list="dl-prof" value="' + esc(q.professor || '') + '"></label></div>' +
      '<label class="check"><input type="checkbox" id="q-anul"' + (q.anulada ? ' checked' : '') + '><span>Questão anulada</span></label>' +
      '<label class="check"><input type="checkbox" id="q-desat"' + (q.desatualizada ? ' checked' : '') + '><span>Questão desatualizada</span></label>' +
      '<div class="toolbar" style="justify-content:flex-end;margin-top:16px">' +
      (editing ? '<button type="button" class="btn danger" id="q-del">Excluir questão</button><span style="flex:1"></span><button type="button" class="btn ghost" id="q-cancel">Cancelar</button><button type="submit" class="btn primary">Salvar alterações</button>'
        : '<button type="button" class="btn" id="q-save-new">Salvar e cadastrar outra</button><button type="submit" class="btn primary">Salvar questão</button>') +
      '</div></form>' +
      datalist('dl-area', Array.from(new Set(MQ.AREAS.concat(distinct('area'))))) + datalist('dl-esp', distinct('especialidade')) + datalist('dl-tema', distinct('tema')) + datalist('dl-sub', distinct('subtema')) +
      datalist('dl-inst', distinct('instituicao')) + datalist('dl-fin', Array.from(new Set(FINALIDADES.concat(distinct('finalidade'))))) + datalist('dl-banca', distinct('banca')) + datalist('dl-prof', distinct('professor'));

    const altsBox = $('#q-alts', body);
    function drawAlts() {
      altsBox.innerHTML = q.alternativas.map((a, i) =>
        '<div class="alt-edit"><button type="button" class="letter' + (q.gabarito === a.l ? ' on' : '') + '" data-gab="' + a.l + '" aria-pressed="' + (q.gabarito === a.l) + '" aria-label="Marcar ' + a.l + ' como gabarito">' + a.l + '</button>' +
        (q.tipo === 'certoerrado' ? '<input type="text" value="' + esc(a.t) + '" disabled>' : '<textarea rows="1" data-alt-i="' + i + '" aria-label="Texto da alternativa ' + a.l + '">' + esc(a.t) + '</textarea>') +
        (q.tipo !== 'certoerrado' && q.alternativas.length > 2 ? '<button type="button" class="icon-btn" data-rm="' + i + '" aria-label="Remover alternativa ' + a.l + '">' + icon('trash') + '</button>' : '<span></span>') + '</div>').join('');
      $$('[data-gab]', altsBox).forEach(b => b.onclick = () => { q.gabarito = b.dataset.gab; drawAlts(); });
      $$('[data-alt-i]', altsBox).forEach(t => t.oninput = () => { q.alternativas[+t.dataset.altI].t = t.value; });
      $$('[data-rm]', altsBox).forEach(b => b.onclick = () => {
        const i = +b.dataset.rm;
        const removed = q.alternativas.splice(i, 1)[0];
        const letters = 'ABCDEFGH';
        const oldGab = q.gabarito;
        q.alternativas.forEach((a, k) => { if (oldGab === a.l) q.gabarito = letters[k]; a.l = letters[k]; });
        if (oldGab === removed.l) q.gabarito = '';
        drawAlts();
      });
    }
    drawAlts();
    const addAlt = $('#q-add-alt', body);
    if (addAlt) addAlt.onclick = () => {
      if (q.alternativas.length >= 5) { MQ.toast('O máximo são 5 alternativas (A–E).'); return; }
      q.alternativas.push({ l: 'ABCDE'[q.alternativas.length], t: '' }); drawAlts();
    };
    $('#q-tipo', body).onchange = e => {
      q.tipo = e.target.value;
      q.alternativas = q.tipo === 'certoerrado' ? [{ l: 'C', t: 'Certo' }, { l: 'E', t: 'Errado' }] : 'ABCDE'.split('').map(l => ({ l, t: '' }));
      q.gabarito = '';
      keepTaxonomy = Object.assign({}, keepTaxonomy, { tipo: q.tipo });
      formView(body, qid);
    };

    function collect() {
      const v = id => $(id, body).value.trim();
      const out = Object.assign(editing ? JSON.parse(JSON.stringify(editing)) : { id: MQ.uid() }, {
        tipo: q.tipo, enunciado: $('#q-enun', body).value.trim(),
        alternativas: q.alternativas.map(a => ({ l: a.l, t: (a.t || '').trim() })), gabarito: q.gabarito,
        comentario: $('#q-com', body).value.trim(), area: v('#q-area'), especialidade: v('#q-esp'), tema: v('#q-tema'), subtema: v('#q-sub'),
        instituicao: v('#q-inst'), uf: v('#q-uf'), ano: v('#q-ano') ? parseInt(v('#q-ano'), 10) : '', finalidade: v('#q-fin'), banca: v('#q-banca'), professor: v('#q-prof'),
        anulada: $('#q-anul', body).checked, desatualizada: $('#q-desat', body).checked
      });
      if (!out.enunciado) return [null, 'Escreva o enunciado.'];
      if (out.alternativas.some(a => !a.t)) return [null, 'Preencha todas as alternativas ou remova as vazias.'];
      if (!out.gabarito) return [null, 'Marque o gabarito clicando na letra da alternativa correta.'];
      if (!out.area) return [null, 'Informe pelo menos a grande área.'];
      if (!out.codigo) out.codigo = MQ.nextCode();
      return [out, null];
    }
    function save(again) {
      const [out, err] = collect();
      if (err) { MQ.toast(err, 'err'); return; }
      delete out.exemplo;
      const dup = editing && MQ.dupKey(editing) === MQ.dupKey(out) ? null : MQ.dupFind(out); // ao editar, só bloqueia se a edição criou a repetição
      if (dup) {
        MQ.confirm('Questão repetida', 'Esta questão já existe no banco (código ' + dup.codigo + '). A cópia não foi salva.', 'Abrir a existente').then(go => { if (go) location.hash = '#/cadastrar/' + dup.id; });
        return;
      }
      MQ.put('questions', out);
      MQ.toast(editing ? 'Alterações salvas.' : 'Questão ' + out.codigo + ' salva.');
      if (editing) { history.back(); return; }
      keepTaxonomy = { tipo: out.tipo, area: out.area, especialidade: out.especialidade, tema: out.tema, subtema: out.subtema, instituicao: out.instituicao, uf: out.uf, ano: out.ano, finalidade: out.finalidade, banca: out.banca, professor: out.professor };
      if (again) { formView(body, null); window.scrollTo(0, 0); $('#q-enun', body).focus(); }
      else { keepTaxonomy = null; formView(body, null); }
    }
    $('#qform', body).onsubmit = e => { e.preventDefault(); save(false); };
    if ($('#q-save-new', body)) $('#q-save-new', body).onclick = () => save(true);
    if ($('#q-cancel', body)) $('#q-cancel', body).onclick = () => history.back();
    if ($('#q-del', body)) $('#q-del', body).onclick = async () => {
      const ok = await MQ.confirm('Excluir questão', 'A questão ' + editing.codigo + ' será excluída do banco e das listas. Suas respostas antigas deixam de contar no desempenho.', 'Excluir', true);
      if (!ok) return;
      MQ.remove('questions', editing.id);
      MQ.toast('Questão excluída.');
      history.back();
    };
  }

  const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const andList = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0] || '');
  /* Envia já, sem esperar os 250 ms. Se a rede falhar, tudo fica na fila e o indicador mostra "Não salvo". */
  async function commit() {
    await MQ.saveNow();
    return true;
  }
  const downloadTemplate = () => {
    const rows = [CSV_COLS, ['Mulher de 30 anos com... Qual a conduta?', 'Alternativa A', 'Alternativa B', 'Alternativa C', 'Alternativa D', 'Alternativa E', 'B', 'Comentário explicando o gabarito', 'Clínica Médica', 'Cardiologia', 'Arritmias', 'Fibrilação Atrial', 'Hospital X', 'SP', '2025', 'Residência (Acesso Direto)', 'Banca Y', '', 'multipla', 'nao', 'nao']];
    MQ.saveFile('modelo-questoes.csv', '﻿' + MQ.toCSV(rows), 'text/csv;charset=utf-8');
  };

  /* ---------- Importar / exportar ---------- */
  function importView(body) {
    body.innerHTML =
      '<div class="form-card" style="margin-bottom:16px"><h2>Importar planilha (CSV)</h2>' +
      '<p class="muted">Uma questão por linha. Colunas aceitas: ' + CSV_COLS.map(c => '<code>' + c + '</code>').join(', ') + '. Só <code>enunciado</code>, as alternativas, <code>gabarito</code> e <code>area</code> são obrigatórios. Separador ponto e vírgula ou vírgula. No Excel, salve como "CSV UTF-8".</p>' +
      '<div class="toolbar"><button class="btn" id="i-tpl">' + icon('download') + ' Baixar modelo</button><button class="btn primary" id="i-csv">' + icon('upload') + ' Importar CSV</button></div></div>' +
      '<div class="form-card" style="margin-bottom:16px"><h2>Pacote de questões ou backup (.json)</h2>' +
      '<p class="muted">Use para importar um pacote pronto (por exemplo, uma lista convertida de PDF) ou restaurar um backup. Tudo é mesclado com o que já existe: nada é apagado e questões repetidas não se duplicam.</p>' +
      '<div class="toolbar"><button class="btn primary" id="i-rest">' + icon('upload') + ' Importar pacote ou backup</button><button class="btn" id="i-bkp">' + icon('download') + ' Exportar backup</button><button class="btn" id="i-qcsv">' + icon('download') + ' Exportar questões em CSV</button></div></div>';

    $('#i-tpl', body).onclick = downloadTemplate;
    $('#i-csv', body).onclick = async () => {
      const f = await MQ.pickFile('.csv,.txt,text/csv');
      if (!f) return;
      const rows = MQ.parseCSV(f.text);
      if (rows.length < 2) { MQ.toast('O arquivo não tem linhas de questões. Baixe o modelo, preencha e escolha o arquivo de novo.', 'err'); return; }
      const head = rows[0].map(h => MQ.norm(h).replace(/[^a-z]/g, ''));
      const col = name => head.indexOf(MQ.norm(name).replace(/[^a-z]/g, ''));
      const need = ['enunciado', 'A', 'B', 'gabarito', 'area'];
      const missing = need.filter(n => col(n) < 0);
      if (missing.length) { MQ.toast('Faltam colunas: ' + missing.join(', ') + '. Baixe o modelo para conferir os nomes.', 'err'); return; }
      const ok = [], bad = [];
      rows.slice(1).forEach((r, i) => {
        const g = n => { const k = col(n); return k >= 0 ? (r[k] || '').trim() : ''; };
        const tipo = MQ.norm(g('tipo')).startsWith('cert') ? 'certoerrado' : 'multipla';
        let alts;
        if (tipo === 'certoerrado') alts = [{ l: 'C', t: 'Certo' }, { l: 'E', t: 'Errado' }];
        else alts = 'ABCDE'.split('').map(l => ({ l, t: g(l) })).filter(a => a.t);
        let gab = g('gabarito').toUpperCase().slice(0, 1);
        if (tipo === 'certoerrado') gab = /^C/i.test(g('gabarito')) ? 'C' : 'E';
        const yes = v => /^(s|sim|1|true|x|y)/i.test(v);
        const q = {
          id: MQ.uid(), tipo, enunciado: g('enunciado'), alternativas: alts, gabarito: gab, comentario: g('comentario'),
          area: g('area'), especialidade: g('especialidade'), tema: g('tema'), subtema: g('subtema'), instituicao: g('instituicao'),
          uf: g('uf').toUpperCase(), ano: parseInt(g('ano'), 10) || '', finalidade: g('finalidade'), banca: g('banca'), professor: g('professor'),
          anulada: yes(g('anulada')), desatualizada: yes(g('desatualizada'))
        };
        const why = !q.enunciado ? 'sem enunciado' : alts.length < 2 ? 'menos de 2 alternativas' : !alts.some(a => a.l === gab) ? 'o gabarito não bate com as alternativas' : !q.area ? 'sem área' : '';
        if (why) bad.push([i + 2, why]); else ok.push(q);
      });
      const sample = bad.slice(0, 5).map(b => 'linha ' + b[0] + ' (' + b[1] + ')').join('; ') + (bad.length > 5 ? '…' : '');
      if (!ok.length) { // nenhuma linha serve: diz por quê e oferece o modelo
        if (await MQ.confirm('Nenhuma questão para importar', 'Nenhuma linha está completa: ' + sample + '. Confira as colunas com o modelo.', 'Baixar modelo')) downloadTemplate();
        return;
      }
      const yes = await MQ.confirm('Importar questões', pl(ok.length, 'questão pronta', 'questões prontas') + ' para importar' + (bad.length ? '. ' + pl(bad.length, 'linha será ignorada', 'linhas serão ignoradas') + ': ' + sample : '.') +
        (f.text.includes('�') ? ' Atenção: há caracteres quebrados. O arquivo pode não estar em UTF-8; no Excel, salve como "CSV UTF-8".' : ''), 'Importar ' + ok.length);
      if (!yes) return;
      let added = 0, dups = 0;
      ok.forEach(q => {
        const ex = MQ.dupFind(q);
        if (ex) { dups++; MQ.dupMerge(ex, q); return; }
        q.codigo = MQ.nextCode(); q.createdAt = MQ.now(); MQ.data.questions[q.id] = Object.assign(q, { updatedAt: MQ.now() });
        MQ.dupIndex().set(MQ.dupKey(q), q.id); added++;
      });
      if (!await commit()) return;
      MQ.toast(pl(added, 'questão importada', 'questões importadas') + ', ' + pl(dups, 'repetida ignorada', 'repetidas ignoradas') + '.');
    };
    $('#i-bkp', body).onclick = MQ.backupExport;
    $('#i-rest', body).onclick = MQ.backupRestore;
    $('#i-qcsv', body).onclick = () => {
      const rows = [CSV_COLS].concat(MQ.alive('questions').map(q => {
        const alt = l => ((q.alternativas || []).find(a => a.l === l) || {}).t || '';
        return [q.enunciado, alt('A'), alt('B'), alt('C'), alt('D'), alt('E'), q.gabarito, q.comentario, q.area, q.especialidade, q.tema, q.subtema, q.instituicao, q.uf, q.ano, q.finalidade, q.banca, q.professor, q.tipo, q.anulada ? 'sim' : 'nao', q.desatualizada ? 'sim' : 'nao'];
      }));
      MQ.saveFile('caderno-r1-questoes.csv', '﻿' + MQ.toCSV(rows), 'text/csv;charset=utf-8');
    };
  }

  /* Backup completo e restauração (também em Configurações): restaurar mescla com os dados atuais, nunca apaga */
  MQ.backupExport = () => MQ.saveFile('pulse-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(Object.assign({}, MQ.data, { media: MQ.media })), 'application/json');
  const ROT = { attempts: ['resposta', 'respostas'], notes: ['anotação', 'anotações'], lists: ['lista', 'listas'], folders: ['pasta', 'pastas'], runs: ['simulado', 'simulados'], reviews: ['revisão', 'revisões'] };
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const okQuestion = q => isObj(q) && (q.deleted || (typeof q.id === 'string' && typeof q.enunciado === 'string' && q.enunciado.trim() && Array.isArray(q.alternativas) && q.alternativas.length >= 2));
  /* O que o arquivo muda aqui, contado como a mesclagem decide (item novo ou edição mais recente): add por coleção e gone = itens que o arquivo remove */
  function preview(d) {
    const add = {}; let gone = 0;
    ['questions', 'marks'].concat(Object.keys(ROT)).forEach(c => {
      if (!isObj(d[c])) return;
      Object.keys(d[c]).forEach(id => {
        const ro = d[c][id], lo = MQ.data[c][id];
        if (!isObj(ro) || (lo && (ro.updatedAt || 0) <= (lo.updatedAt || 0))) return;
        if (ro.deleted) { if (lo && !lo.deleted) gone++; } else if (c !== 'questions') add[c] = (add[c] || 0) + 1;
      });
    });
    return { add, gone };
  }
  MQ.backupRestore = async () => {
    const f = await MQ.pickFile('.json,application/json');
    if (!f) return;
    let d;
    try { d = JSON.parse(f.text); } catch (e) { d = null; }
    if (!isObj(d) || !isObj(d.questions)) {
      MQ.toast(/\.csv$/i.test(f.name) ? 'Este é um arquivo CSV. Use "Importar CSV" para planilhas.' : 'Não foi possível ler este arquivo como backup ou pacote do Pulse. Escolha um arquivo pulse-backup-….json.', 'err');
      return;
    }
    // D3: só o admin grava questões e imagens; do backup de um estudante entram só os dados pessoais
    const admin = MQ.isAdmin(), questions = {}, media = {}; let bad = 0;
    if (admin) {
      Object.keys(d.questions).forEach(id => { if (okQuestion(d.questions[id])) questions[id] = d.questions[id]; else bad++; });
      if (bad && !Object.keys(questions).length) { MQ.toast('Nenhuma questão válida neste arquivo (faltam enunciado ou alternativas). Confira se é um backup ou pacote do Pulse.', 'err'); return; }
      // só imagens de verdade: o valor vai direto para o src da tag img
      Object.keys(isObj(d.media) ? d.media : {}).forEach(id => { if (typeof d.media[id] === 'string' && /^data:image\//.test(d.media[id])) media[id] = d.media[id]; });
    }
    const skipped = !admin && Object.keys(d.questions).length;
    d = Object.assign({}, d, { questions, media: undefined, marks: MQ.cleanMarks(d.marks) });
    const pre = MQ.mergeDeduped(d, true), p = preview(d);
    const nimg = Object.keys(media).filter(id => !MQ.media[id]).length, nmk = p.add.marks || 0;
    const parts = [];
    if (pre.added) parts.push(pl(pre.added, 'questão nova', 'questões novas'));
    Object.keys(ROT).forEach(c => { if (p.add[c]) parts.push(pl(p.add[c], ROT[c][0], ROT[c][1])); });
    if (nimg) parts.push(pl(nimg, 'imagem', 'imagens'));
    if (nmk) parts.push(pl(nmk, 'questão com marca-texto', 'questões com marca-texto'));
    if (!parts.length && !p.gone) { MQ.toast('Este arquivo não traz nada novo: tudo o que ele tem já está na sua conta.'); return; }
    const kind = d.formato === 'caderno-r1-pacote' ? 'pacote' : 'backup';
    const ok = await MQ.confirm(kind === 'pacote' ? 'Importar pacote' : 'Restaurar backup',
      (d.nome ? d.nome + ': ' : '') + (parts.length ? 'Vai entrar ' + andList(parts) + '.' : 'Nada novo para adicionar.') + (pre.dup ? ' Questões que já existem aqui não se duplicam.' : '') +
      (bad ? ' ' + pl(bad, 'questão incompleta será ignorada', 'questões incompletas serão ignoradas') + '.' : '') +
      (p.gone ? ' Atenção: ' + pl(p.gone, 'item que o arquivo marca como removido sai', 'itens que o arquivo marca como removidos saem') + ' daqui, porque a remoção é mais recente que a sua última edição.' : '') +
      (skipped ? ' As questões do arquivo ficam de fora: só o administrador cadastra questões.' : '') +
      ' O resto do que você tem fica como está.', kind === 'pacote' ? 'Importar' : 'Restaurar');
    if (!ok) return;
    try { MQ.mergeDeduped(d); MQ.mergeMedia(media); } catch (e) { console.error(e); MQ.toast('A importação parou por um erro. Tente o mesmo arquivo de novo: o que já entrou não se duplica.', 'err'); return; }
    if (!await commit()) return;
    MQ.toast((kind === 'pacote' ? 'Importado: ' : 'Restaurado: ') + andList(parts) + (p.gone ? '; ' + pl(p.gone, 'item removido', 'itens removidos') : '') + '.');
    MQ.render(); // os contadores da tela refletem o que entrou
  };

  /* ---------- Gerenciar ---------- */
  let mq = '';
  function manageView(body) {
    const all = MQ.sortQuestions(MQ.alive('questions'));
    const examples = all.filter(q => q.exemplo).length;
    body.innerHTML = '<div class="form-card"><div class="toolbar" style="margin-bottom:10px"><div class="pane-search" style="flex:1;min-width:220px;margin:0">' + icon('search') + '<input type="search" id="m-q" placeholder="Buscar por texto, código ou assunto" value="' + esc(mq) + '"></div>' +
      (examples ? '<button class="btn danger sm" id="m-ex">Apagar ' + examples + ' questões de exemplo</button>' : '') + '</div><div id="m-list"></div></div>';
    function draw() {
      const t = MQ.norm(mq);
      const qs = all.filter(q => !t || MQ.norm([q.codigo, q.enunciado, MQ.qPath(q).join(' '), q.instituicao].join(' ')).includes(t));
      $('#m-list', body).innerHTML = '<p class="muted small">' + qs.length + ' questões</p>' + qs.slice(0, 200).map(q =>
        '<div class="mgmt-q"><div><div class="t">' + esc(q.enunciado) + '</div><div class="m">' + esc(q.codigo) + ' · ' + esc(MQ.qPath(q).join(' › ')) + (q.exemplo ? ' · exemplo' : '') + '</div></div>' +
        '<div class="toolbar"><a class="btn sm" href="#/cadastrar/' + q.id + '">Editar</a></div></div>').join('') +
        (qs.length > 200 ? '<p class="muted small">Mostrando 200. Refine a busca para ver as outras.</p>' : '');
    }
    draw();
    let tm;
    $('#m-q', body).oninput = e => { clearTimeout(tm); tm = setTimeout(() => { mq = e.target.value; draw(); }, 200); };
    if ($('#m-ex', body)) $('#m-ex', body).onclick = async () => {
      const ok = await MQ.confirm('Apagar exemplos', 'As ' + examples + ' questões de exemplo que vieram com o app serão excluídas.', 'Apagar exemplos', true);
      if (!ok) return;
      all.filter(q => q.exemplo).forEach(q => MQ.remove('questions', q.id));
      MQ.toast('Questões de exemplo apagadas.'); MQ.render();
    };
  }
})(window.MQ);
