---
name: Pulse
description: Banco de questões de residência médica com ferramentas de estudo à mão, em índigo profundo sobre papel claro, com ciano só para conquistas.
colors:
  accent: "#4338A8"
  accent-ink: "#FFFFFF"
  title: "#26236B"
  soft: "#E2E0F7"
  on-soft: "#26236B"
  sec: "#0C6A84"
  sec-soft: "#D5EEF4"
  paper: "#F4F4F9"
  surface: "#FFFFFF"
  rail: "#FFFFFF"
  sunk: "#E8E8F2"
  ink: "#1B1B2E"
  ink-2: "#3E3E57"
  ink-3: "#62627D"
  line: "#D5D5E3"
  line-2: "#BBBBD0"
  ok: "#1F7A4D"
  ok-soft: "#E1F3E8"
  err: "#B3261E"
  err-soft: "#FBE7E5"
  doubt: "#8A5A00"
  doubt-soft: "#FFF2D6"
  focus: "#B45309"
  heat-1: "#E2E0F7"
  heat-2: "#AAA5DB"
  heat-3: "#736AC0"
  heat-4: "#4338A8"
  dark-accent: "#A5A0F5"
  dark-accent-ink: "#15124A"
  dark-title: "#D4D2FA"
  dark-soft: "#27245A"
  dark-on-soft: "#DCDAFD"
  dark-sec: "#5CD0E4"
  dark-sec-soft: "#103540"
  dark-paper: "#0B0B12"
  dark-surface: "#15151F"
  dark-rail: "#0F0F18"
  dark-sunk: "#1D1D2A"
  dark-ink: "#ECECF5"
  dark-ink-2: "#ABABC2"
  dark-ink-3: "#8A8AA3"
  dark-line: "#2A2A3A"
  dark-line-2: "#3A3A4E"
  dark-ok: "#5CC28E"
  dark-ok-soft: "#173326"
  dark-err: "#F08A80"
  dark-err-soft: "#3B1C1A"
  dark-doubt: "#E6B450"
  dark-doubt-soft: "#3A2E12"
  dark-focus: "#FBBF24"
  dark-heat-1: "#27245A"
  dark-heat-2: "#534F90"
  dark-heat-3: "#7F7BC6"
  dark-heat-4: "#A5A0F5"
typography:
  display:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  eyebrow:
    fontFamily: "Manrope, Segoe UI, Roboto, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: "0.08em"
  question:
    fontFamily: "Literata, Sitka Text, Charter, Noto Serif, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
rounded:
  field: "6px"
  button: "8px"
  alternative: "10px"
  card: "12px"
  panel: "14px"
  pill: "999px"
spacing:
  xxs: "4px"
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    height: "40px (44px no toque)"
    padding: "0 16px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.button}"
    height: "40px (44px no toque)"
  button-action:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.pill}"
    height: "48px"
  filter-button:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.on-soft}"
    rounded: "{rounded.card}"
    height: "50px"
    padding: "0 14px"
  chip:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.on-soft}"
    rounded: "{rounded.pill}"
    height: "32px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "14px (16px no PC)"
  alternative:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.alternative}"
    padding: "10px 12px"
  input:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.field}"
    height: "40px (44px no toque)"
---

# Design System: Pulse

Fonte da verdade do visual do app, agora um **site responsivo** (computador, celular e tablet; instalável como PWA). Os apps Windows e Android são legado e usam o mesmo código. Os nomes internos continuam `caderno-r1` (pasta, `appId`, IndexedDB, arquivos do Drive); só o nome exibido mudou. Plano completo e mockups aprovados: https://claude.ai/artifact/5UEsWEqJe55ZWP6JTiBqVA

## Overview

**Norte criativo: "Caderno de quem treina todo dia."** O app é uma superfície de estudo longo que guarda a mão do estudante: marca-texto em cinco cores, alternativas riscadas com a tesoura, listas e simulados montados por ele. A interface fica quieta para que essas marcas sejam a cor mais expressiva da página. O índigo dá identidade e foco; o ciano aparece só quando o estudante conquista algo (meta batida, sequência, revisões em dia).

O enunciado é lido em serifa (Literata), como texto impresso; todo o resto (navegação, filtros, números) em sans (Manrope). Nada pisca nem decora; o movimento só confirma o que o estudante fez.

**Características:**
- Índigo (`#4338A8`) é a cor de ação; ciano (`#0C6A84`) só marca conquistas, nunca vira botão.
- Enunciado, alternativas e comentário em serifa; interface em sans.
- Escuro quase preto com leve tom índigo; o índigo claro (`#A5A0F5`) vira a cor de ação.
- Verde e vermelho só para acerto e erro, sempre acompanhados de ✓ e ✗.
- Alvos de toque de 44 px no celular e tablet; uso com uma mão.

## Brand

- **Nome:** Pulse.
- **Logo:** "pulso que vira check": linha de monitor com um pico que termina em check. Grade de 64, quadrado de cantos 15, traço único de 5 com pontas e junções arredondadas: `M12 34h8l4-8 5 14 22-22`.
- **Ícone do app** (site, Android e Windows): no site, `www/img/icon.png` (512) e `icon-192.png` no manifesto (`manifest.webmanifest`, fundo `#F4F4F9`, tema `#4338A8`).
- **Ícone nos apps nativos:** fundo `#4338A8`, traço `#FFFFFF`, o mesmo nos dois temas. Conteúdo dentro da zona segura do ícone adaptativo (66% central). Windows: `.ico` com 16, 24, 32, 48 e 256 px. Android: foreground + background + monocromático (ícone temático do Android 13+).
- **Glifo** (sem fundo, dentro do app): o mesmo traço em `currentColor`.
- **Assinatura:** ícone + "Pulse" em Manrope 800, letter-spacing −0,02em.

## Colors

### Tokens

A tabela usa os nomes das variáveis CSS de `www/css/app.css`; entre parênteses, o nome do token no cabeçalho deste arquivo quando é diferente.

| Token | Claro | Escuro | Uso |
| --- | --- | --- | --- |
| `--paper` | `#F4F4F9` | `#0B0B12` | Fundo da página |
| `--surface` | `#FFFFFF` | `#15151F` | Cartões, painéis, modais, campos |
| `--rail-bg` | `#FFFFFF` | `#0F0F18` | Barra lateral, rail e barra inferior |
| `--sunk` | `#E8E8F2` | `#1D1D2A` | Trilho de barras, campos aninhados, controle segmentado |
| `--line` | `#D5D5E3` | `#2A2A3A` | Bordas fracas e divisórias |
| `--line-2` | `#BBBBD0` | `#3A3A4E` | Bordas fortes (botões, alternativas) |
| `--ink` | `#1B1B2E` | `#ECECF5` | Texto principal |
| `--ink-2` | `#3E3E57` | `#ABABC2` | Texto secundário |
| `--ink-3` | `#62627D` | `#8A8AA3` | Texto terciário, rótulos |
| `--navy` (token `title`) | `#26236B` | `#D4D2FA` | Títulos e números de destaque |
| `--accent` | `#4338A8` | `#A5A0F5` | Botão principal, link, item ativo, progresso |
| `--accent-ink` | `#FFFFFF` | `#15124A` | Texto sobre a cor de ação |
| `--accent-soft` (token `soft`) | `#E2E0F7` | `#27245A` | Chips, botões de filtro, item ativo, alternativa selecionada |
| `--on-soft` | `#26236B` | `#DCDAFD` | Texto sobre `--soft` |
| `--sec` | `#0C6A84` | `#5CD0E4` | Conquistas: meta batida, sequência, revisões em dia |
| `--sec-soft` | `#D5EEF4` | `#103540` | Fundo das conquistas |
| `--ok` / `--ok-soft` | `#1F7A4D` / `#E1F3E8` | `#5CC28E` / `#173326` | Certa |
| `--err` / `--err-soft` | `#B3261E` / `#FBE7E5` | `#F08A80` / `#3B1C1A` | Errada |
| `--warn` / `--warn-soft` (tokens `doubt`) | `#8A5A00` / `#FFF2D6` | `#E6B450` / `#3A2E12` | Questão marcada no simulado, anotações |
| `--focus` | `#B45309` | `#FBBF24` | Anel de foco de 2 px |
| `--heat-1…4` | `#E2E0F7` `#AAA5DB` `#736AC0` `#4338A8` | `#27245A` `#534F90` `#7F7BC6` `#A5A0F5` | Heatmap de dias estudados (nível 0 = `--sunk`) |

Os temas seguem o padrão: tokens claros em `:root`, escuros em `@media (prefers-color-scheme: dark)` com `:root:not([data-theme="light"])` e de novo em `:root[data-theme="dark"]`, para a escolha manual valer nos dois sentidos.

### Regras
- **Índigo é ação.** Botão principal, link, item ativo, barra de progresso. Fundos grandes nunca são índigo.
- **Ciano é conquista.** Só meta batida, sequência e revisões em dia; nunca botão nem link.
- **Semânticas com ícone.** Certa leva ✓ e errada leva ✗; a cor nunca é o único sinal.
- **A tinta do usuário.** As 5 cores do marca-texto (vermelho, amarelo, azul, verde, rosa, todas claras) e a tesoura são do estudante: nunca viram cor de marca nem de estado. O texto marcado fica com tinta escura fixa (`#1B1B2E`) para manter o contraste nos dois temas.
- Contraste mínimo de 4,5:1 para texto nos dois temas.

## Typography

- **Interface:** Manrope (SIL OFL 1.1), pesos 400–800.
- **Leitura:** Literata (SIL OFL 1.1), 400, 600 e itálico 400, com tamanho óptico.
- Ambas embutidas como `.woff2` em `www/fonts/`, só o subconjunto latino (~250 KB), sem Google Fonts em tempo de execução.

| Papel | Fonte | Tamanho | Peso | Linha |
| --- | --- | --- | --- | --- |
| Display (título de página, número grande) | Manrope | 28 px | 800 | 1,2 |
| Headline (título de seção, `h2`) | Manrope | 18 px | 700 | 1,2 |
| Número de destaque (`.num`, valores grandes) | Manrope | 22 px | 800 | — |
| Title (título de cartão) | Manrope | 16 px | 700 | 1,3 |
| Body | Manrope | 14 px | 400 | 1,5 |
| Label (botão, chip, navegação) | Manrope | 13 px | 600 | — |
| Eyebrow (rótulo de cartão, maiúsculas) | Manrope | 11 px | 700, +0,08em | — |
| Enunciado | Literata | 17 px × escala do usuário | 400 | 1,62 |
| Alternativas e comentário | Literata | 16 px × escala do usuário | 400 | 1,5–1,6 |

Escala: 12 · 13 · 14 · 16 · 18 · 22 · 28. **Regra da questão impressa:** o que se lê para responder é serifa; toda a interface ao redor é sans. A linha do enunciado vai até ~68 caracteres.

## Iconography

- **Conjunto único: Lucide** (licença ISC). Nenhuma outra biblioteca no app.
- **Traço de 2 px em todo o app**, pontas e junções arredondadas (os rótulos ao lado são seminegrito).
- Tamanhos: 20 px na navegação e nos botões, 16 px dentro de chips e botões pequenos, 18 px nas ações da questão.
- Embutidos como SVG local no mapa `ICONS` de `www/js/util.js` (função `MQ.icon(nome)`), em `currentColor`. Estados (hover, ativo, desabilitado) mudam só cor e opacidade do mesmo SVG; o item ativo da navegação ganha a pílula de fundo `--soft`.
- Busca e download com a skill `better-icons` (`better-icons get lucide:<nome>`); o CLI pinta `circle`/`rect` por dentro, então remover o `fill="currentColor"` desses elementos ao importar.

| Uso | Ícone Lucide |
| --- | --- |
| Início · Questões · Listas · Desempenho · Configurações | `house` · `search` · `folder` · `chart-column` · `sliders-horizontal` |
| Resolver · Cronômetro · Descartar · Marca-texto · Anotação | `play` · `timer` · `scissors` · `highlighter` · `notebook-pen` |
| Sequência · Ponto fraco · Certa · Errada · Novo | `flame` · `target` · `check` · `x` · `plus` |
| Filtro · Abrir · Voltar · Mais · Lista inteligente | `funnel` · `chevron-right` · `chevron-left` · `ellipsis` · `zap` |
| Modo foco · Marcar · Ordenar · Backup | `maximize` · `flag` · `arrow-up-down` · `download` |
| Lembrete · Atalhos · Sincronizado · Sincronizar · Excluir | `bell` · `keyboard` · `cloud-check` · `refresh-cw` · `trash-2` |
| Tema · Simulado · Adicionar à lista · Editar · Pulso | `sun-moon` · `list-checks` · `list-plus` · `pencil` · `heart-pulse` |

## Layout

O formato é decidido pela largura da janela, não pelo aparelho: uma janela de navegador estreita usa o layout de tablet; tablet com teclado ganha os atalhos.

| Formato | Largura | Navegação | Colunas |
| --- | --- | --- | --- |
| Celular | < 600 px | Barra inferior com 5 itens (ícone + rótulo, item ativo em pílula). Some em Resolver e Simulado, que viram tela cheia com barra própria. | 1 coluna; ação principal fixa acima da barra, ao alcance do polegar. Lateral de 14–16 px e área segura (`safe-area-inset`). |
| Tablet | 600–1199 px | Rail de 76 px (ícone + rótulo curto), sincronização no pé. | 2 colunas a partir de 840 px (lista \| detalhe, questão \| painel); abaixo disso, 1 coluna larga. Respiro de 20 px. |
| Computador | ≥ 1200 px | Barra lateral de 220 px com logo, itens com atalho, meta do dia e sincronização no pé. Recolhe para rail sozinha em Resolver; some no Simulado em modo prova. | 3 colunas: lista ou mapa \| conteúdo \| painel. Respiro de 26 px. |

Rótulo da barra inferior para Configurações: **Ajustes** ("Configurações" não cabe em 72 px). No rail, Desempenho vira **Desemp.** Em tablet largo e PC, nome inteiro.

### Regra do espaço vazio
Em telas largas, cada coluna que sobra recebe um painel útil para a tarefa da tela (resumo do filtro, detalhe da lista, painel da questão, status da sincronização). Os painéis são os mesmos blocos do celular, reposicionados; nada existe só para preencher. Espaço livre fica só onde ajuda:
- **Linha do enunciado** limitada a ~68 caracteres: linha longa cansa em enunciados grandes.
- **Modo foco:** só enunciado e alternativas, centralizados, sem painéis.
- **Simulado em modo prova:** sem estatísticas nem navegação, para imitar a prova.

### Atalhos de teclado
Atalhos de letra só valem fora de campos de texto.

| Onde | Tecla | Ação |
| --- | --- | --- |
| Global | `Ctrl K` | Buscar questão por texto ou código R1-… |
| Global | `Ctrl 1–6` | Início, Questões, Listas, Anotações, Desempenho, Configurações |
| Global | `?` / `Esc` | Mostrar atalhos / fechar menu, sair do foco |
| Resolver | `A–E` / `Shift A–E` | Escolher / descartar alternativa |
| Resolver | `Enter` · `←` `→` | Confirmar ou próxima · anterior / próxima |
| Resolver | `H` · `N` · `L` · `F` | Marca-texto na cor atual · anotação · adicionar à lista · modo foco |
| Simulado | `M` · `C` · `Ctrl Enter` | Marcar para revisar · cartão-resposta · entregar (com confirmação) |

## Navigation & Tabs

Seis abas: **Início, Questões, Listas, Anotações, Desempenho, Configurações.** Início é a tela de abertura. Na barra inferior do celular os rótulos curtos são **Desemp.** e **Ajustes**.

### Entrar (tela de login do site)
- Aparece antes do app, enquanto não houver sessão. Campos **Usuário** e **Senha** (com "Mostrar senha"), um botão primário **Entrar** (pílula de 48 px) e, abaixo, "Esqueceu a senha? Peça ao administrador para criar uma nova." e o aviso curto **"Seus dados."** (o que o Pulse guarda no servidor e que dá para exportar em Configurações › Dados e backup). Sem Google, sem cadastro e sem "continuar sem conta".
- Erros em caixa `--err-soft` com `role="alert"`: senha errada, usuário inexistente e conta desativada têm **a mesma mensagem** ("Usuário ou senha incorretos."). Depois de 5 erros, "Muitas tentativas. Tente de novo em N segundos." e o botão vira "Aguarde N s" até liberar.
- **Senha provisória:** depois de entrar com ela, a tela **Crie a sua senha** (senha provisória, senha nova, repetir) vem antes de qualquer tela do app, também ao recarregar; só sai trocando a senha ou clicando em Sair.
- **Celular e tablet** (≤ 860 px): só o cartão, com logo, "Entrar", o formulário e o aviso. **PC** (> 860 px): painel de marca à esquerda (`--accent` de fundo, a única superfície grande em índigo do app) e o cartão à direita.
- Foco inicial no campo Usuário só com mouse e teclado; no toque, nenhum campo é focado (o teclado cobriria a tela).
- Com o app aberto, se a sessão acabar, o aviso "Sua sessão terminou" traz o botão **Entrar**, que abre esta mesma tela por cima; o que estava na fila de envio é salvo ao entrar.

### Início
Cada cartão responde "o que faço agora?" e tem uma ação só. Ordem: **Continuar de onde parei** (único cartão de destaque) → **Meta de hoje** (anel 28/40) → **Revisões de hoje** (revisão espaçada; atrasadas à parte) → **Ponto mais fraco** (pior tema em 30 dias, mínimo de 15 respostas, "Treinar 20 questões") → **Sequência** (dias seguidos e a semana em bolinhas, em ciano) → **Dias estudados** (heatmap de 17 semanas). Tablet e PC acrescentam **Acerto por grande área** e **Simulados recentes**. Primeiro uso: cartão "Comece por aqui" no lugar dos números vazios. Sem lista em andamento nem revisões, o destaque vira "Sessão rápida: 10 questões". Sincronização numa pílula pequena, não em cartão.

### Questões
- Topo: busca (`Ctrl K`) e chips rápidos: **Que não resolvi** (ligado por padrão), Errei, Caderno de erros (última resposta errada), Revisão de hoje.
- Filtros na ordem de uso: Grande área → Especialidade → Tema e subtema, Instituição, Ano, UF, Tipo de prova. **Sem filtro de Professor.** "Filtros avançados" (botão cheio): anuladas, desatualizadas, com imagem, com comentário.
- Resultado (cartão de destaque): contagem, filtros aplicados e **Resolver**; abaixo, Criar lista, Lista inteligente, Simulado.
- Menu ⋯: ordem (aleatória, ano, recentes), limpar filtros, salvar como padrão; para o administrador, Cadastrar questão.
- PC e tablet: filtros (em 2 colunas no PC) \| resultado + resumo do filtro; sem prévia das questões. Celular: Resolver fixo acima da barra.

### Resolver (dentro de Questões e Listas)
- Topo: contexto, "18 de 40", cronômetro e barra de progresso.
- Centro: código e classificação, enunciado, alternativas com tesoura, Confirmar.
- Depois de confirmar: gabarito, comentário, aviso de quando a questão volta na revisão e Próxima. **Não existe ver gabarito sem responder.**
- Mapa (à esquerda, PC): grade de questões e, abaixo dela, o cartão **Resultado** (acertos e erros em blocos grandes com ✓ e ✗, barra e % de acerto). Histórico de respostas só no painel; abaixo de 860 px o botão no cartão da questão.
- Painel (PC e tablet): tempo, histórico nesta questão, anotação, ações (adicionar à lista), marca-texto. No celular, as ferramentas ficam numa linha única de ícones de 44 px acima do enunciado (Lista, Assunto, letra menor e maior, Anotação, Solução; "Limpar marcas" só aparece quando há marcas), e o marca-texto usa a pílula flutuante.
- PC: mapa da lista \| questão \| painel.

### Listas
- Controle segmentado **Listas | Simulados** no topo.
- Fixos no topo: **Caderno de erros** (automático) e listas em andamento. "Inteligentes" é uma pasta virtual.
- Pastas: coluna à esquerda no PC, chips roláveis no celular.
- Cartão de lista: nome, nº de questões, progresso, acerto; ação principal Continuar. Menu ⋯: renomear, duplicar, mover para pasta, criar simulado, refazer erradas, excluir. Ordenar no cabeçalho.
- PC: pastas \| cartões \| detalhe da lista com acerto por tema.

### Simulados (segmento de Listas)
- Primeiro o simulado em andamento, com tempo restante; depois Novo simulado (personalizado ou **modo prova** por instituição) e os concluídos com nota, data e tempo, que abrem a revisão pós-prova.
- Durante a prova: sem navegação do app, sem gabarito, sem estatísticas. Só questão, cartão-resposta e relógio. PC e tablet: questão \| cartão-resposta; celular: cartão-resposta abre por baixo.

### Anotações
- Todas as anotações feitas nas questões (tecla `N` no Resolver), da mais recente para a mais antiga, em cartões: código, instituição e ano, caminho do assunto, trecho do enunciado e o texto da anotação em caixa âmbar.
- **Filtro por assunto** em chips que descem pela hierarquia (grande área › especialidade › tema › subtema), com a quantidade de anotações em cada um; a trilha escolhida fica acima e cada passo pode ser desfeito. Busca por texto da anotação, da questão ou código R1-….
- Em cada cartão: **Abrir questão** (abre o resolver com as questões do filtro), **Editar** (janela) e excluir (com confirmação). Cartões em 1, 2 ou 3 colunas conforme a largura.
- Sem anotações: estado vazio explica como criar uma.

### Desempenho
- Fixos no topo: período (7, 30, 90 dias, tudo) e origem (banco, listas, simulados).
- 4 números: questões, acerto, tempo médio, dias estudados.
- Corpo, do mais acionável ao mais histórico: evolução semanal, pontos fracos com Treinar, acerto por grande área com drill até subtema, por instituição, heatmap, simulados.
- Menu ⋯: exportar CSV, zerar histórico (confirmação digitada).

### Configurações
- Ordem: **Conta** (usuário, nome, tipo de conta, indicador de salvamento, **Trocar senha** em janela, **Sair** com confirmação e o aviso "Seus dados.") → Aparência (tema claro/escuro/automático, tamanho do enunciado com prévia) → Estudo (meta diária, lembrete, filtros padrão) → Dados e backup → Atalhos → Administrador (só para o admin) → Sobre.
- Celular: lista com o valor atual à direita, cada item abre a subtela. PC: índice \| conteúdo em rolagem \| status da sincronização e do backup.

## Elevation & Shapes

- **Cantos:** 6 campos · 8 botões · 10 alternativas · 12 cartões · 14 painéis que contêm botões · pílula só para ação principal grande, chips, selos, controle segmentado e item ativo da navegação.
- **Cantos concêntricos:** canto de fora = canto de dentro + espaçamento (cartão de 14 px com botão de 8 px a 6 px da borda). Nunca o mesmo raio em pai e filho aninhados.
- **Borda para estrutura** (divisórias, selecionado, foco, cartões no escuro); **sombra em camadas transparentes para elevação**.
- Sombras: elevada (controle segmentado ativo, barra fixa, pílula de ferramentas) `0 1px 2px rgba(20,18,60,.06), 0 4px 14px rgba(20,18,60,.06)`; menu `0 10px 30px rgba(0,0,0,.18)`; modal `0 18px 50px rgba(0,0,0,.25)`. No escuro, sombras viram borda `--line-2`.
- Espaçamento em múltiplos de 4: 4 · 8 · 12 · 16 · 24 · 32 · 48. Gap de grade 12 (celular) e 14–16 (tablet e PC).

## Components

- **Botões:** cantos de 8 px, 40 px de altura (44 px no toque), rótulo em Manrope 600. Padrão: superfície, borda `--line-2`, texto `--ink`. Primário: `--accent` com `--accent-ink`. Fantasma: sem borda, texto `--accent`. Perigo: texto e borda `--err`. **Um único botão primário por área.**
- **Ação grande:** pílula de 48 px, largura total no celular, só para a ação que encerra a tela (Confirmar, Resolver, Entregar).
- **Chips:** pílula de 32 px, `--soft` com `--on-soft`. Chip rápido liga e desliga com ✓; desligado tem fundo de superfície e borda. Chip de filtro aplicado tem dois alvos: o texto abre o filtro e o × remove só ele (44 px no toque).
- **Botões de filtro:** 50 px, cantos de 12 px, `--soft`, círculo com + à esquerda e selo "+N" em `--accent` à direita. "Filtros avançados" cheio em `--accent`.
- **Controle segmentado:** trilho `--sunk` em pílula; opção ativa em superfície com sombra elevada.
- **Cartões:** superfície, cantos de 12 px, padding 14 px (16 no PC), rótulo eyebrow em `--ink-3`. **Cartão de destaque** (`--soft`, sem borda): no máximo um por tela (Continuar no Início, Resultado em Questões).
- **Barras de progresso:** trilho `--sunk` de 6–8 px em pílula; progresso em `--accent`; resultado com `--ok` + `--err` empilhados. Meta do dia em anel (`conic-gradient`). Sequência em ciano.
- **Alternativas:** cantos de 10 px, borda `--line-2`, letra em círculo de 26–30 px, texto em Literata. Selecionada: `--soft` com borda `--accent` e letra cheia. Descartada: texto riscado em `--ink-3` e tesoura em `--err`.
- **Mapa da lista / cartão-resposta:** quadrados de 30 px (cantos 7) ou círculos; certa `--ok-soft`, errada `--err-soft`, atual `--accent`, marcada com contorno `--doubt`.
- **Anotação:** caixa `--doubt-soft` com texto em Literata.
- **Campos:** 40 px (44 no toque), cantos de 6 px, borda `--line-2`; foco troca a borda pelo anel `--focus`. Busca em pílula com dica `Ctrl K`.
- **Marca-texto e tesoura (assinatura):** pílula flutuante com as 5 cores, borracha, tesoura e anotação; cor atual com anel `--accent`.

## Acabamento

Princípios da skill `make-interfaces-feel-better`, aplicados em cada tela; revisão completa dela em todas as telas no fim da implementação.

- **Estados em tudo que é clicável:** hover, foco (anel visível para teclado), pressionado (`scale(0.96)`, nunca menos que 0,95), desabilitado, **carregando** (esqueleto no lugar do conteúdo, nunca tela em branco) e **vazio** (diz o que vai aparecer ali e qual o próximo passo).
- **Transições:** ≤ 150 ms em cor e opacidade, `ease-out`, sempre com as propriedades nomeadas (nunca `transition: all`). CSS transitions para estados interativos, para poderem ser interrompidas.
- **Entradas:** cascata de ~100 ms só no primeiro carregamento do Início; nada anima ao trocar de questão nem em interações frequentes. Sem animação de entrada no carregamento normal das telas.
- **Saídas:** sobem 4–8 px e somem, sem encolher a altura.
- **Troca de ícone** (ex.: sincronizar → sincronizado): os dois no DOM, cross-fade com escala 0,25→1, opacidade 0→1 e desfoque 4px→0, `cubic-bezier(0.2, 0, 0, 1)`.
- **`will-change`** só em `transform`/`opacity`/`filter` e só se houver engasgo no primeiro quadro.
- **Movimento nunca é o único sinal:** toda mudança animada tem também cor, ícone ou texto. Tudo respeita `prefers-reduced-motion`.
- **Números tabulares** (`tabular-nums`) no Desempenho, contadores, metas, cronômetros e cartão-resposta.
- **Texto:** títulos com `text-wrap: balance`; enunciado e textos longos com `text-wrap: pretty`; `-webkit-font-smoothing: antialiased` na raiz.
- **Imagens das questões:** contorno de 1 px a 10% (`oklch(0 0 0 / .1)` no claro, `oklch(1 0 0 / .1)` no escuro).
- **Área de toque:** mínimo de 44×44 px no celular e tablet, 40×40 px no PC; estender com pseudo-elemento quando o visual for menor; áreas de dois controles nunca se sobrepõem.
- **Alinhamento óptico** em botões com ícone e no triângulo de "play".

## Do's and Don'ts

### Do
- Usar índigo só em ação e estado ativo, e ciano só em conquistas.
- Compor enunciado, alternativas e comentário em Literata; o resto em Manrope.
- Usar só ícones Lucide, traço de 2 px, em `currentColor`.
- Acompanhar certa e errada de ✓ e ✗.
- Garantir 44 px de alvo no toque e contraste ≥ 4,5:1 em claro e escuro.
- Manter a área segura no topo e na base do celular.

### Don't
- Pintar fundos grandes de índigo ou ciano (a única exceção é o painel de marca da tela de login no PC).
- Usar ciano em botão ou link, ou as cores do marca-texto como cor de interface.
- Misturar bibliotecas de ícones ou pesos de traço.
- Usar pílula em botões comuns.
- Adicionar gradientes decorativos ou animações que não sinalizem estado.
- Reduzir o enunciado abaixo da escala escolhida pelo usuário.
- Mostrar o gabarito antes da resposta.
