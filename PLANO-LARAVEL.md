# Plano: Pulse em Laravel + PostgreSQL no Render

Branch `migracao-laravel`. Marque `[x]` ao concluir cada item. Visual continua o do `DESIGN.md`; regras de produto do `PRODUCT.md` (atualizado na etapa 10).

**Decisões já tomadas (não reabrir):** login próprio só com usuário e senha; sai o login com Google e a sincronização pelo Drive. Só o admin cria contas e redefine senhas; sem cadastro público e sem recuperação por e-mail. Só online: dados no servidor, sem modo offline e sem service worker de dados. O front `www/` (JS puro, `MQ`) continua; o Laravel é a API e serve o site. IndexedDB sai. O Pulse passa a ser só site (sem .exe e sem .apk). Decisões D1–D10 na seção 8.

**Ponto de partida (14/11/2026):** não existem dados no Pulse atual (nem do admin), então **não há migração de dados**. O banco nasce vazio e as questões entram pelo painel de administrador (importar `.json` ou CSV, ou cadastrar uma a uma).

**Regra de publicação (mantida):** por padrão só provas oficiais são publicadas; questões de curso (Estratégia e outros) ficam visíveis só para o admin.

**Toda etapa só termina quando:**
- os testes do servidor (`php artisan test`) e os do front (`node tests/*.test.js`) passam;
- o site foi testado no celular (390×844), tablet (960×640) e PC, claro e escuro, sem erro no console (depois da etapa 5, com login);
- passou por `revisor-codigo` e `testador-navegador` antes do commit, e cada etapa tem o próprio commit.

---

## Arquitetura em uma página

**A ideia central: o front quase não muda.** Hoje todas as telas leem e gravam `MQ.data` (objeto em memória) por `MQ.get`, `MQ.alive`, `MQ.put` e `MQ.remove`, e só o `db.js` fala com o IndexedDB. Na migração, só a camada de baixo troca:

```
Antes:  telas → MQ.put / MQ.remove → MQ.data → IndexedDB (+ sync.js → Google Drive)
Depois: telas → MQ.put / MQ.remove → MQ.data → fila de envio → POST /api/salvar → PostgreSQL
        ao entrar: GET /api/dados → MQ.data (mesmo formato de hoje)
```

- **Mesma regra de conflito de hoje:** em cada item vence o `updatedAt` mais recente (a regra do `mergeData`, já testada em `tests/mesclagem.test.js`). O servidor aplica a mesma regra no `INSERT … ON CONFLICT DO UPDATE … WHERE excluded.updated_at > tabela.updated_at`. Reenviar o mesmo item não muda nada, então importar o mesmo backup duas vezes não duplica.
- **Restaurar backup e deduplicar continuam no front** (`MQ.backupRestore` → `MQ.mergeDeduped` → `MQ.mergeData`), que já resolvem repetidas, remapeiam respostas, listas, simulados, anotações e revisões. O `mergeData` passa a pôr na fila de envio cada item que mudou. Nenhuma regra de mesclagem é reescrita em PHP.
- **Estrutura de pastas:** Laravel na raiz do repositório, com a pasta pública apontada para `www/` (`$app->usePublicPath(base_path('www'))` em `bootstrap/app.php`; `www/index.php` do Laravel ao lado do `index.html`). O nginx serve os arquivos estáticos de `www/` direto e manda `/api/*`, `/login`, `/logout` e `/sanctum/*` ao PHP. Nada de mover `www/` nem reescrever caminhos do front.
- **Docker:** imagem `serversideup/php:8.4-fpm-nginx` (nginx + php-fpm prontos para produção, usuário sem root, porta 8080). Alternativa equivalente: FrankenPHP; fico com nginx + php-fpm porque não traz o estado persistente do Octane.
- **Laravel 13 (ou a estável do momento) + PHP 8.4 + PostgreSQL 17.** Sanctum no modo SPA (cookie de sessão, mesmo domínio). Sem Fortify, Breeze ou Jetstream: o login é um controlador pequeno com `Auth::attempt` e `RateLimiter`.
- **Sessões, cache e limite de tentativas no banco** (`SESSION_DRIVER=database`, `CACHE_STORE=database`). Sem fila (`QUEUE_CONNECTION=sync`), sem worker, sem Redis.
- **Região:** o Render não tem São Paulo. Usar **Virginia (us-east)**, a mais próxima do Brasil (~120–150 ms por requisição). Web e banco na mesma região, pela URL interna.

---

## 1. Tabelas do PostgreSQL

### Regras que valem para todas
- **IDs vêm do front e nunca mudam** (`MQ.uid()`, texto curto; `id` das anotações, revisões e marcações = id da questão). Coluna `id text`, nunca `serial`.
- **Nada é apagado de verdade.** Remover = `deleted = true` (lápide), como hoje. Não existe rota que faça `DELETE`. Nas tabelas `questions` e `attempts`, um gatilho `BEFORE DELETE … RAISE EXCEPTION` impede apagar até por engano no console.
- **O objeto do front volta idêntico.** Cada linha guarda o objeto inteiro em `data jsonb` (inclusive campos que esta versão não conhece, como `conf`/`why` de respostas antigas). Colunas próprias só onde ajudam consulta, permissão ou integridade.
- **Duas datas:** `updated_at_ms bigint` (o `updatedAt` do front, decide o conflito) e `recebido_em timestamptz default now()` (relógio do servidor; serve para buscar "o que mudou desde" sem depender do relógio do aparelho).
- **Sem chave estrangeira das coleções para `questions`:** respostas antigas podem apontar para questões que não existem neste servidor (exemplos apagados, questões que não vieram). Com FK, a importação falharia e o histórico se perderia. Índice simples em `question_id`.
- Chave estrangeira só para `users` (`ON DELETE RESTRICT`; contas são desativadas, nunca apagadas).

### Tabelas

| Tabela | Chave | Colunas próprias (além de `data jsonb`, `deleted`, `created_at_ms`, `updated_at_ms`, `recebido_em`) | Origem hoje |
|---|---|---|---|
| `users` | `id bigserial` | `username` (único, sem diferenciar maiúsculas; só `a-z`, `0-9`, `.` e `-`, D6), `name`, `email` (opcional, único), `password` (hash), `role` (`admin` ou `estudante`, com `CHECK`), `active` bool, `must_change_password` bool, `last_login_at`, `timestamps` | `adminEmails` em `config.js` |
| `questions` | `id text` | `owner_id` → users (sempre um admin, D3), `codigo`, `publicada` bool, `publicada_em`, `dup_of`, `instituicao`, `ano`, `area`. Índices: `(publicada) WHERE NOT deleted`, `(owner_id)`, `(dup_of)` | `MQ.data.questions` + banco publicado no Drive |
| `attempts` | `(user_id, id)` | `question_id`, `correct`, `ts bigint`, `ctx`, `run_id`. Índices `(user_id, question_id)`, `(user_id, ts)` | `attempts` |
| `folders` | `(user_id, id)` | — | `folders` |
| `lists` | `(user_id, id)` | — (`qids`, filtro das inteligentes etc. no `data`) | `lists` |
| `runs` | `(user_id, id)` | `status` | `runs` (simulados) |
| `notes` | `(user_id, id)` | — (`id` = id da questão) | `notes` |
| `reviews` | `(user_id, id)` | `due bigint` | `reviews` (revisão espaçada) |
| `prefs` | `(user_id, id)` | — | `prefs` (meta diária) |
| `marks` | `(user_id, id)` | — (`id` = id da questão; marca-texto) | **hoje só no aparelho** (`MQ.local.marks`); passa a sincronizar |
| `media` | `id text` | `owner_id`, `question_id` (decide quem pode ver, etapa 7), `mime`, `bytes bytea`, `size int`, `created_at` | `MQ.media` (data URLs no IndexedDB) |
| `sessions`, `cache`, `cache_locks` | padrão do Laravel | — | — |

**Questões são do servidor, não de cada pessoa.** Hoje cada aparelho tem uma cópia do banco; agora existe uma tabela só, e só o admin grava nela (D3).
- O estudante recebe em `GET /api/dados`: questões `publicada = true` e não removidas, + as lápides com `dup_of` (o front precisa delas para remapear respostas de uma repetida para a que ficou, como já faz no `dedupe.js`).
- Questão despublicada simplesmente some para o estudante. Para o front isso é igual à lápide de hoje (`MQ.get` devolve `null` nos dois casos), e as respostas dele continuam guardadas.
- O admin recebe todas, inclusive as privadas (cursos) e as lápides.
- Editar questão sobrescreve, como hoje. Histórico de edições de questão **não** entra (o PITR de 3 dias e o dump diário cobrem um erro de edição); se fizer falta depois, é um gatilho que copia a linha antiga para `questions_versions`.

**Ficam só no navegador (`localStorage`, conveniência por aparelho; perder não faz mal):** `theme`, `fontScale`, `listTab`, `listSort`, `filtroPadrao`, `progress` (ponto de "continuar" das listas), `last` (continuar de onde parei), `deviceId`. **Saem:** `sync`, `bank`, `mediaDirty`, `lastSync`, `seeded`, `reminder`.

---

## 2. Autenticação e segurança

- **Senhas:** `Hash::make` (bcrypt padrão do Laravel; argon2id se a imagem tiver suporte, sem diferença prática). Mínimo de 10 caracteres. Sem consulta a serviços externos de senha vazada (mandaria dados para fora).
- **Login:** `POST /login` com `username` e `password`. Conta com `active = false` não entra (mesma mensagem genérica de senha errada, para não revelar quem existe).
- **Limite de tentativas:** 5 erradas por usuário + IP por minuto e 30 por IP por hora (`RateLimiter`, guardado no cache do banco). Resposta 429 com "Muitas tentativas. Tente de novo em N segundos."
- **Sessão (Sanctum SPA):** cookie `HttpOnly`, `Secure`, `SameSite=Lax`, `session()->regenerate()` no login, `invalidate()` + novo token CSRF no logout. Duração: 30 dias, renovando a cada uso (D5; `SESSION_LIFETIME=43200`).
- **CSRF:** o front chama `GET /sanctum/csrf-cookie` uma vez ao abrir e o `fetch` manda `X-XSRF-TOKEN` lido do cookie `XSRF-TOKEN`. Toda rota que grava exige o token.
- **HTTPS:** o Render emite e renova o certificado e redireciona HTTP → HTTPS. No Laravel: `trustProxies(at: '*')` (o Render fica na frente), `URL::forceScheme('https')` em produção e cabeçalho HSTS no nginx.
- **Papéis:** `role` = `admin` ou `estudante`. Middleware `admin` nas rotas `/api/admin/*`. Quem grava questões e imagens: só admin (D3). O front lê o papel em `GET /api/me`; `MQ.isAdmin()` passa a ser `MQ.me.role === 'admin'` (hoje compara o e-mail com `adminEmails`). O front esconder botões é só conforto: **toda permissão é checada no servidor.**
- **Escopo por usuário:** toda consulta de coleção filtra `user_id = auth()->id()`; o `user_id` nunca vem do corpo da requisição. Teste automático: usuário A não lê nem grava nada de B.
- **Tamanho do corpo:** `/api/salvar` aceita até 5 MB e `/api/midia` até 5 MB por imagem (nginx `client_max_body_size` + `post_max_size` do PHP + validação no Laravel). Passou disso → 413 com mensagem clara ("Envio grande demais: máximo de 5 MB").
- **Troca de senha pelo próprio usuário:** `POST /api/senha` com senha atual + nova. Ao trocar, as outras sessões dele são encerradas (com sessões no banco: `DELETE FROM sessions WHERE user_id = ? AND id <> sessão atual`).
- **Senha provisória:** conta criada ou senha redefinida pelo admin fica com `must_change_password = true`; o front abre a troca de senha antes de qualquer tela.
- **Primeiro admin:** comando `php artisan pulse:criar-admin` (pergunta usuário e senha no terminal; nada de senha no repositório nem em variável de ambiente). Cria `guilhermeacnx@gmail.com` como `email` do primeiro usuário, `role = admin`.

### Rotas

| Rota | Quem | O que faz |
|---|---|---|
| `GET /sanctum/csrf-cookie` | todos | cookie CSRF |
| `POST /login`, `POST /logout` | todos / logado | entrar, sair |
| `GET /api/me` | logado | `{ id, username, name, role, must_change_password }`; 401 se não logado |
| `POST /api/senha` | logado | trocar a própria senha |
| `GET /api/dados?desde=` | logado | todas as coleções no formato de `MQ.data`; com `desde`, só o que chegou depois (para atualizar ao voltar à aba) |
| `POST /api/salvar` | logado | `{ coleção: { id: objeto } }`, até 500 itens e 5 MB por chamada; aplica "o mais novo vence"; devolve o que foi aceito. `questions` ou `media` vindos de estudante → 403 |
| `GET /api/midia/{id}` | logado, se pode ver a questão da imagem | imagem, com `Cache-Control: private, max-age=31536000, immutable` (id nunca muda); senão 404 |
| `POST /api/midia` | admin | grava uma imagem (com `question_id`), até 5 MB |
| `GET/POST/PATCH /api/admin/usuarios` | admin | listar, criar, redefinir senha, desativar/reativar |
| `GET /api/admin/usuarios/{id}/contagem` | admin | quantos itens a pessoa tem em cada coleção (conferência pelo admin) |
| `POST /api/admin/publicar` | admin | `{ publicar: [ids], despublicar: [ids] }` |

---

## 3. Painel do administrador

Fica em Configurações › Administrador (onde já estão Cadastrar e Publicar) mais uma tela nova `#/admin/usuarios` (`www/js/admin.js`), no visual do `DESIGN.md`.

- **Usuários:** tabela com nome, usuário, papel, situação (ativa/desativada), último acesso. Ações: **Criar conta** (nome, usuário, papel; o servidor gera uma senha provisória legível, mostrada uma vez para o admin copiar e entregar), **Redefinir senha** (nova senha provisória, encerra as sessões da pessoa), **Desativar/Reativar** (desativar encerra as sessões; os dados ficam). Sem "excluir conta".
- **Cadastrar, editar, importar (JSON e CSV), gerenciar e remover repetidas:** as telas do `editor.js` continuam iguais, só para o admin; gravam pela mesma fila (`/api/salvar`) e o servidor confere que é admin. **É por aqui que todas as questões entram no Pulse:** o admin importa os pacotes `.json` ou a planilha CSV (a repetidas são detectadas como hoje, e importar o mesmo arquivo de novo não duplica), confere em Gerenciar e só então publica.
- **Publicar:** o diálogo atual (`MQ.publishDialog`) continua, com a mesma regra: **instituições oficiais (INEP, Ebserh, ENARE, ENAMED, Revalida) vêm marcadas por padrão; o resto, inclusive cursos como o Estratégia, vem desmarcado** e fica privado do admin. Muda só o fim: em vez de gerar manifesto e arquivo no Drive, chama `POST /api/admin/publicar`, que liga ou desliga `publicada`. Sem versão de banco, sem download: o estudante vê a mudança no próximo carregamento.
- Proteção extra contra publicar curso por engano: ao confirmar, se houver instituição não oficial marcada, o diálogo lista quais são e pede confirmação.
- **Imagens das questões:** tabela `media` no PostgreSQL (`bytea`), cada imagem com a `question_id` a que pertence. O `MQ.imgHtml` passa a usar `src="/api/midia/{id}"` em vez da data URL. Resolve o pendente "imagens não são publicadas com o banco": a imagem é servida a quem vê a questão, e só a quem vê. Nunca no disco do servidor.
  - Por que no PostgreSQL e não no S3: um serviço a menos, entra no PITR e no dump diário, e imagens de questão são pequenas. Se `media` passar de ~2 GB, mover para Cloudflare R2 (compatível com S3) é trocar o `Storage` do Laravel; a rota `/api/midia/{id}` não muda.

---

## 4. Entrada dos dados (sem migração)

Não há dados para migrar: o admin não tem dados no Pulse atual e ninguém mais usou o site, o .exe ou o .apk. Todo mundo, o admin inclusive, começa com conta nova e vazia.

- **Questões:** entram pelo painel de administrador (seção 3): importar `.json` ou CSV, ou cadastrar. Chegam como `owner_id` = admin e `publicada = false`; o admin confere e publica (oficiais marcadas por padrão).
- **Dados pessoais** (`attempts`, `lists` etc.) nascem com o uso. O backup de Configurações › Dados e backup continua existindo para exportar e restaurar, com a regra D3: estudante restaura só dados pessoais.
- **Sem etapa de conferência de contagens** e sem ensaio de migração.

---

## 5. O que sai do projeto e o que muda nos documentos

### Sai
- `electron/`, `electron-builder.admin.json`, `capacitor.config.json`, `android-debug.keystore`, `assets/` (fontes de ícone e splash do Android; os ícones do site ficam em `www/img/`), `icon-1024.png` se não for mais usado, `dist/`, `dist-admin/`.
- `.github/workflows/gerar-instaladores.yml` e `.github/workflows/publicar-site.yml` (este só sai na etapa 13; até lá mantém o site antigo no ar).
- `package.json`: `electron`, `electron-builder`, `@capacitor/*`, scripts `start`, `dist:*`, `android:*`. Fica só o que os testes do front usam.
- `www/js/sync.js` (Drive, banco publicado, pílula de sincronização); `MQ.publishDialog` vai para `editor.js`.
- `www/js/auth.js` reescrito: sai o Google Identity Services e o fluxo de código no google.com/device; entra a tela de usuário e senha.
- `www/js/config.js` (credenciais do Google, `bankManifestId`, `adminEmails`).
- `www/js/seed.js` e as questões de exemplo (`exemplo-01`…), D4.
- `www/js/extras.js` (lembrete por notificação do Android).
- `www/sw.js` e o registro em `app.js`. Para quem já tem o service worker instalado: o `app.js` novo chama `navigator.serviceWorker.getRegistrations()` e cancela os registros. `manifest.webmanifest` fica (o site continua instalável, só não funciona offline).
- Ramos nativos em `util.js`, `app.js`, `settings.js` (`window.Capacitor`, `window.mqNative`); `MQ.saveFile` fica só com o download do navegador.
- `LEIA-ME.md`: o passo a passo do Google Cloud sai; entra como rodar local e publicar no Render.

### Muda
- **`CLAUDE.md` e `AGENTS.md`** (os dois, que hoje divergem): descrição (Laravel + PostgreSQL no Render, só online, só site, login por usuário e senha); estrutura (`app/`, `routes/`, `database/migrations/`, `www/` como pasta pública, `Dockerfile`, `render.yaml`); "Testar" com `docker compose up -d` e `php artisan test`; regras (admin por `role`, não por e-mail; só admin grava questões e imagens; nada de `DELETE`; toda consulta filtra por `user_id`; publicação = `publicada`, oficiais por padrão); "Pendente" limpo (sai Drive, `bankManifestId`, escopo `drive.file`, imagens não publicadas, versão Windows Admin); subagentes sem `especialista-instaladores`.
- **`PRODUCT.md`:** Positioning (sai "sem servidor nem senha própria" e "sincronizam pelo Google Drive"; entra "conta criada pelo administrador, dados no servidor do Pulse, exportáveis a qualquer momento"); Users (recebem uma conta, não o app; não importam questões); Operating Context (site no Render, sem PWA offline, sem Electron/Android); Capabilities (sai IndexedDB, "sincronização compatível", "sem servidor"; ficam IDs estáveis, lápides, publicação curada, deduplicação); Principles ("offline primeiro" → "dados do usuário, exportáveis"); Scope (sai o lembrete do Android e o status de sincronização; entra "salvo/salvando/erro"); a estatística coletiva por questão passa a ser possível, mas continua fora.
- **`DESIGN.md`:** tela de login (usuário e senha, sem botão do Google, sem "continuar sem conta", com o aviso curto de privacidade); pílula de sincronização vira indicador de salvamento (Salvo, Salvando…, Não salvo · Tentar de novo); Configurações › "Conta e sincronização" vira "Conta" (usuário, trocar senha, sair) e o painel de status perde versão do banco e "Sincronizar agora"; nova tela Usuários do admin; nomes internos (`caderno-r1`, IndexedDB, Drive) saem do texto.
- **`PLANO.md`:** itens que dependiam do Drive, do Android ou do .apk (passo 0, 10 e 11) marcados como "cancelado pela migração para Laravel".
- **Subagentes (`.claude/agents/`, `.codex/agents/`, `.github/agents/` onde existirem):**
  - `testador-navegador`: sobe `docker compose up -d` em vez do `python -m http.server`; abre `http://localhost:8000`; entra com os usuários de teste criados pelo seeder (`estudante-teste`, `admin-teste`); o teste de admin passa a ser "entrar como admin-teste", não `MQ.local.sync.email`; checa que nada grava em IndexedDB e que um dado gravado num contexto aparece em outro contexto após recarregar.
  - `especialista-instaladores`: apagado. No lugar, `especialista-deploy` (Dockerfile, `render.yaml`, variáveis do Render, migrações, backup externo).
  - `revisor-codigo`: acrescentar à lista de checagem: toda consulta filtra por `user_id`; rota nova tem teste de permissão; nenhuma migração apaga dados ou colunas com dados; nenhum `DELETE`; nada de segredo no repositório.
  - `git-publicador`: lembrar que push na `main` publica no Render (deploy automático).

---

## 6. Ambiente local (Windows) e deploy no Render

### Local, com Docker (recomendado: a mesma imagem da produção)
1. Instalar Docker Desktop (com WSL 2). Você abre o Docker Desktop; os comandos rodam em segundo plano, sem janela nova.
2. `docker-compose.yml` na raiz com dois serviços: `app` (o mesmo `Dockerfile`, porta 8000 → 8080, `www/` e o código montados como volume para editar sem rebuild) e `db` (`postgres:17`, volume nomeado, porta 5432).
3. `.env` local copiado de `.env.example` (nunca commitado): `DB_HOST=db`, `SESSION_DRIVER=database`, `CACHE_STORE=database`, `SESSION_SECURE_COOKIE=false` só local.
4. `docker compose up -d` → `docker compose exec app php artisan migrate --seed` (o seeder local cria `admin-teste` e `estudante-teste`, só em `APP_ENV=local`) → abrir `http://localhost:8000`.
5. Testes: `docker compose exec app php artisan test` (banco `pulse_test` separado no mesmo Postgres) e `node tests/*.test.js` para as regras do front.
6. CI: um workflow novo `testes.yml` roda `php artisan test` com um Postgres de serviço e os testes do front em cada push e pull request.

Alternativa sem Docker: PHP 8.4 + Composer + PostgreSQL 17 instalados no Windows (ou Laravel Herd). Funciona, mas o ambiente fica diferente do Render; só se o Docker der problema no seu PC.

### Arquivos de deploy
- `Dockerfile` (multi-stage): estágio 1 `composer install --no-dev --optimize-autoloader`; estágio 2 `serversideup/php:8.4-fpm-nginx`, copia o código, `www/` como raiz pública, extensões `pdo_pgsql`. Na partida do contêiner: `php artisan config:cache route:cache` (precisa das variáveis de ambiente, por isso não roda no build).
- `render.yaml` (Blueprint): serviço web Docker, `preDeployCommand: php artisan migrate --force` (roda antes de trocar a versão; se a migração falhar, a versão antiga continua no ar), `healthCheckPath: /up`, `autoDeploy` da `main`; o banco Render Postgres; o cron de backup (etapa 12).
- `.dockerignore`: `node_modules`, `tests`, `.git`, `.env`, `graphify-out`, `docs`.

### Passos no Render
1. Workspace Hobby (D1): US$ 0 + uso; PITR de 3 dias, compensado pelo dump diário externo.
2. New → Blueprint → apontar para o repositório e a `main` (depois do merge da `migracao-laravel`). Região Virginia para tudo.
3. Variáveis de ambiente do serviço web:
   - `APP_KEY` (gerar no PC com `php artisan key:generate --show`; guardar no gerenciador de senhas), `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://<serviço>.onrender.com`
   - `DB_CONNECTION=pgsql`, `DB_URL` = Internal Database URL do Render (no `render.yaml`: `fromDatabase`)
   - `SESSION_DRIVER=database`, `SESSION_LIFETIME=43200` (30 dias, D5), `SESSION_SECURE_COOKIE=true`, `SESSION_DOMAIN=<serviço>.onrender.com`, `SANCTUM_STATEFUL_DOMAINS=<serviço>.onrender.com`
   - `CACHE_STORE=database`, `QUEUE_CONNECTION=sync`, `LOG_CHANNEL=stderr`, `LOG_LEVEL=warning`
   - Cron de backup (D7): `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
4. Primeiro deploy → Shell do serviço → `php artisan pulse:criar-admin`.
5. Endereço: começar em `<serviço>.onrender.com`, que já tem HTTPS (D2). Domínio próprio depois: Settings → Custom Domains → `CNAME` para `<serviço>.onrender.com` → trocar `APP_URL`, `SESSION_DOMAIN` e `SANCTUM_STATEFUL_DOMAINS`.
6. Conferir: `https://<serviço>.onrender.com/up` responde 200; login funciona; `http://` redireciona para `https://`; cabeçalho HSTS presente; cookie de sessão com `Secure` e `HttpOnly`.

---

## 7. Ordem de implementação

### 0. Preparação no app atual (na `main`, antes da virada)
- [x] Backup completo passa a incluir o marca-texto como coleção `marks` (`{ id: qid, qid, m: {...}, updatedAt }`), no formato que `mergeData` já aceita
- [x] Restaurar um backup com `marks` no app atual devolve o marca-texto (`MQ.marksFromBackup`, só trechos válidos; a marcação local da questão fica)
- **Pronto quando:** um backup exportado tem `marks` com as marcações de 2 questões, e `node tests/mesclagem.test.js` passa.

### 1. Esqueleto do Laravel, Docker e CI
- [x] Laravel 13 na raiz, pasta pública = `www/`, `www/index.php`, rota `/up`
- [x] `Dockerfile` (estágios `dev` e `prod`), `docker-compose.yml`, `.dockerignore`, `.env.example`
- [x] Workflow `testes.yml` (PHP + front)
- **Pronto quando:** `docker compose up -d` serve o app atual (ainda com IndexedDB) em `localhost:8000`, `/up` responde 200, `php artisan test` passa e o CI fica verde.
- **Verificado em 14/11/2026:** `docker compose up -d` serve o app em `localhost:8000` (site idêntico ao anterior nos 3 formatos, claro e escuro, sem erro de console); `/up` = 200; `php artisan test` = 4 testes passando, em Postgres `pulse_test`; `node tests/*.test.js` passam; a imagem `prod` sobe sozinha (`config:cache` e `route:cache` na partida, sem PHPUnit, `/.env` bloqueado). **CI verde:** o `testes.yml` rodou no GitHub no commit `277a838` (PHP + front) e passou.

### 2. Tabelas
- [ ] Migrações de `users`, `questions`, `attempts`, `folders`, `lists`, `runs`, `notes`, `reviews`, `prefs`, `marks`, `media`, `sessions`, `cache`
- [ ] Gatilhos que impedem `DELETE` em `questions` e `attempts`
- **Pronto quando:** `migrate:fresh` e `migrate:rollback` rodam sem erro; teste confirma que `DELETE` em `questions` falha.

### 3. Login e sessão
- [ ] `POST /login`, `POST /logout`, `GET /api/me`, `POST /api/senha`; Sanctum SPA; middleware `admin`
- [ ] Limite de tentativas; conta desativada não entra; `must_change_password`; sessão de 30 dias renovada a cada uso (D5)
- [ ] Nome de usuário validado: minúsculas, números, ponto e hífen (D6)
- [ ] `php artisan pulse:criar-admin` e seeder local de usuários de teste
- **Pronto quando:** testes cobrem: senha certa entra; errada não; a 6ª tentativa em 1 minuto recebe 429; desativada não entra; trocar senha encerra as outras sessões; rota de admin devolve 403 ao estudante; sem token CSRF a gravação devolve 419; nome de usuário com maiúscula ou espaço é recusado.

### 4. API de dados
- [ ] `GET /api/dados` (com `?desde=`), `POST /api/salvar` com "o mais novo vence" e escopo por usuário
- [ ] `/api/salvar` recusa `questions` e `media` vindos de estudante com 403 (D3)
- [ ] Limite de tamanho do corpo em `/api/salvar` e `/api/midia` (5 MB): passou → 413 com mensagem clara
- **Pronto quando:** testes cobrem: A não lê nem grava dados de B; item mais velho não sobrescreve o mais novo; reenviar o mesmo lote não muda nada; estudante que manda `questions` ou `media` recebe 403 e nada é gravado; corpo acima do limite recebe 413 com a mensagem; lápide continua lápide; estudante não recebe questão não publicada; `GET /api/dados` devolve o formato de `MQ.data` e o `tests/mesclagem.test.js` aceita a saída.

### 5. Front lendo e gravando na API
- [ ] `db.js`: carregar de `/api/dados`; `MQ.put`/`MQ.remove`/`mergeData` alimentam uma fila em memória; envio com debounce de 250 ms em lotes de até 500; nova tentativa com espera crescente; `fetch(..., { keepalive: true })` no `pagehide`
- [ ] Indicador Salvo / Salvando… / Não salvo · Tentar de novo (no lugar da pílula de sincronização) e aviso ao fechar a aba com itens pendentes (`beforeunload`)
- [ ] Ao voltar à aba depois de 5 min, `GET /api/dados?desde=` traz o que outro aparelho gravou
- [ ] `MQ.local` só no `localStorage`; marca-texto em `MQ.data.marks`; IndexedDB não é mais aberto
- [ ] Restaurar backup como estudante ignora `questions` e `media` do arquivo (D3); importar JSON/CSV de questões só aparece para o admin
- **Pronto quando:** responder no PC e recarregar no celular (dois contextos do navegador, mesmo usuário) mostra a resposta; com a rede cortada, aparece "Não salvo", nada some da tela e tudo chega ao religar; nenhum acesso a IndexedDB no console; estudante restaura um backup com questões e só os dados pessoais entram.

### 6. Tela de login e Conta
- [ ] `auth.js` novo: usuário e senha, erros claros, aviso de muitas tentativas, troca obrigatória de senha provisória
- [ ] Aviso curto de privacidade na tela de login e em Configurações › Conta: o que fica guardado no servidor (conta, respostas, listas, simulados, anotações, revisões, marcações e preferências) e que dá para exportar tudo em Configurações › Dados e backup
- [ ] Configurações › Conta: usuário, trocar senha, sair
- [ ] Remover `sync.js`, `config.js` e o registro do service worker; cancelar registros antigos
- **Pronto quando:** login, logout e troca de senha funcionam nos 3 formatos, claro e escuro; o aviso de privacidade aparece; sem logar, só a tela de login aparece e `/api/dados` devolve 401.

### 7. Imagens
- [ ] Tabela `media` com `question_id`; `POST /api/midia` só para admin; `GET /api/midia/{id}` só entrega se o usuário pode ver a questão da imagem (admin: todas; estudante: publicada e não removida), senão 404
- [ ] `MQ.imgHtml` com URL; editor envia imagem nova com a questão; a importação do admin (e a restauração de um backup do admin) envia as imagens, cada uma com a questão que a usa
- **Pronto quando:** questão com imagem cadastrada pelo admin aparece para o estudante em outro contexto depois de publicada; teste: estudante não baixa imagem de questão não publicada nem envia imagem (403); imagem não fica em disco no contêiner.

### 8. Painel do administrador
- [ ] Tela Usuários: criar, redefinir senha, desativar/reativar
- [ ] Publicar via `POST /api/admin/publicar`, mantendo oficiais marcadas por padrão e a confirmação extra para instituição não oficial
- [ ] Contagem por coleção de cada usuário
- [ ] Importar questões pelo painel (JSON e CSV) gravando no servidor, só para admin; repetidas detectadas; importar o mesmo arquivo duas vezes não duplica
- **Pronto quando:** testes de permissão das rotas de admin passam; o admin importa um `.json` e um CSV de questões e elas aparecem em Gerenciar (privadas), e importar de novo não duplica; questão de curso não publicada não aparece para o estudante; questão despublicada some para o estudante e as respostas dele continuam no banco.

### 9. ~~Migração dos dados~~ — não necessária: sem dados para migrar
- [x] Não necessária: sem dados para migrar (nem do admin). As questões entram pelo painel de administrador na etapa 8.

### 10. Limpeza do legado e documentos
- [ ] Apagar Electron, Capacitor, `gerar-instaladores.yml`, `extras.js`, `seed.js` e as questões de exemplo (D4), ramos nativos, dependências do `package.json`
- [ ] Atualizar `CLAUDE.md`, `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `PLANO.md`, `LEIA-ME.md` e os subagentes (seção 5)
- **Pronto quando:** `grep -riE "capacitor|electron|mqNative|googleapis|drive|bankManifest|indexedDB|exemplo-"` em `www/` não acha nada; o app funciona igual nos 3 formatos.

### 11. Deploy no Render
- [ ] `render.yaml` com web Docker, Postgres e `preDeployCommand`, workspace Hobby (D1)
- [ ] Variáveis de ambiente, admin criado pelo Shell, endereço `.onrender.com` com HTTPS (D2; domínio próprio fica para depois)
- **Pronto quando:** checagens do passo 6 de "Passos no Render" passam no endereço público; um deploy com migração nova aplica sozinho.

### 12. Backup externo diário
- [ ] Cron job no Render (diário, 03:00 de Brasília = 06:00 UTC): `pg_dump --format=custom` → envia para um bucket do Cloudflare R2 (D7) com retenção de 30 dias (regra de ciclo de vida do bucket)
- [ ] Ensaio de restauração: baixar o último dump e restaurar no Postgres local
- **Pronto quando:** existem dumps de 2 dias seguidos no bucket e um deles foi restaurado no PC com as contagens iguais às do servidor.

### 13. Virada
- [ ] Com o site novo no ar e o admin conseguindo entrar: o GitHub Pages vira só um redirecionamento para o endereço novo + um `sw.js` que se cancela; apagar `publicar-site.yml`
- **Pronto quando:** o endereço antigo redireciona para o novo. Não há conferência de dados: o site antigo pode sair do ar assim que o novo estiver no ar.

---

## 8. Riscos, custos e decisões

### Riscos
- **Só online:** sem internet o app não abre e respostas não salvam. A fila em memória segura uma queda curta com a aba aberta; fechar a aba sem rede perde o que não foi enviado (o aviso de `beforeunload` tenta impedir).
- **Latência:** servidor nos EUA; cada carregamento leva ~0,3–1 s a mais que hoje. Gravações vão em lote e não travam a tela.
- **Tamanho do `GET /api/dados`:** devolve tudo de uma vez, como o IndexedDB fazia. Com dezenas de milhares de respostas, chega a alguns MB (gzip reduz bem). Se ficar lento, paginar `attempts`; não antes.
- **Relógio do aparelho:** "o mais novo vence" usa o relógio de quem editou, como hoje. Um aparelho com a hora muito errada pode perder ou ganhar uma disputa. Já é assim; só muda se virar problema.
- **Duas abas abertas:** cada aba tem a sua cópia em memória; a atualização ao voltar à aba reduz, não elimina.
- **Postgres com 256 MB de RAM** pode ficar lento com mais usuários. Subir o plano no Render é só trocar o tipo, sem migrar dados.
- **Banda incluída:** Hobby tem 5 GB/mês, depois US$ 0,15/GB. Com poucos usuários sobra; imagens têm cache longo no navegador.
- **Retenção do Render:** PITR de 3 dias no Hobby; exportações manuais ficam só 7 dias. Por isso o dump diário externo com 30 dias.
- **Laravel no Windows/Docker:** volumes montados do Windows deixam o PHP lento. Se incomodar, guardar o projeto dentro do WSL.

### Custos mensais estimados (Render, preços em USD de novembro de 2026)

| Item | Mínimo | Confortável |
|---|---|---|
| Workspace | Hobby US$ 0 (PITR 3 dias) | Pro US$ 25 (PITR 7 dias) |
| Serviço web | US$ 7 (0,5 CPU, 512 MB) | US$ 25 (1 CPU, 2 GB) |
| PostgreSQL | US$ 6 (256 MB) | US$ 19 (1 GB) |
| Armazenamento do banco (5 GB × US$ 0,30) | US$ 1,50 | US$ 1,50 |
| Cron de backup (~2 min/dia × US$ 0,00016/min) | < US$ 1 | < US$ 1 |
| Bucket externo (R2: 10 GB grátis) | US$ 0 | US$ 0 |
| **Total** | **~US$ 15** | **~US$ 71** |

Começa no mínimo (D1); subir web e banco quando o uso pedir. Domínio próprio é à parte (`.com.br` custa cerca de R$ 40 por ano no Registro.br).

### Decisões tomadas (13/11/2026)
- **D1. Workspace:** Hobby.
- **D2. Endereço:** começar no `<serviço>.onrender.com`; domínio próprio depois.
- **D3. Questões próprias do estudante:** não (b). Só o admin cria e importa questões e imagens. Ao restaurar o backup de um estudante, entram só os dados pessoais (`attempts`, `folders`, `lists`, `runs`, `notes`, `reviews`, `prefs`, `marks`); questões e imagens do arquivo são ignoradas.
- **D4. Questões de exemplo:** saem (a).
- **D5. Sessão:** 30 dias, renovando a cada uso.
- **D6. Nome de usuário:** livre, só minúsculas, números, ponto e hífen.
- **D7. Backup externo:** Cloudflare R2.
- **D8 e D9. Quem migra:** ninguém. Não há dados no Pulse atual (nem do admin; ninguém usou site, .exe ou .apk). O Pulse passa a ser só site, sem estudantes para migrar e sem aviso de 30 dias. Na etapa 13, o site antigo sai do ar (redirecionamento + `sw.js` que se cancela) assim que o novo estiver no ar.
- **D10. Ensaio de migração:** cancelado (14/11/2026), pois não há dados para migrar. As questões entram pelo painel de administrador (importar `.json`/CSV).

Fontes de preço e backup: https://render.com/pricing e https://render.com/docs/postgresql-backups (consultadas em 13/11/2026).
