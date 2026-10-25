# DevOps — execução local, Docker e GitHub Actions

> Publicar a aplicação em servidor (ambientes, domínio, certificados, banco, registro de imagens) **não** está coberto aqui: procure a **equipe de Infraestrutura** antes de seguir. Este guia cobre execução local e a verificação automática no GitHub.

## 1. Rodar localmente

| Forma | Comando | Endereço |
|---|---|---|
| Node (desenvolvimento) | `npm ci` e depois `npm run dev` | http://localhost:5180 |
| Docker — produção (Nginx) | `docker compose up --build app` | http://localhost:8080 |
| Docker — desenvolvimento (recarga automática) | `docker compose --profile dev up dev` | http://localhost:5180 |

- **Porta ocupada?** Use a variável `CRONOAI_PORT`:
  - bash/Git Bash: `CRONOAI_PORT=8088 docker compose up --build app`
  - PowerShell: `$env:CRONOAI_PORT=8088; docker compose up --build app`
  - ou um arquivo `.env` ao lado do `docker-compose.yml` com `CRONOAI_PORT=8088` (não versionar).
- As portas são publicadas só em `127.0.0.1`: outras máquinas da rede não acessam o container nem o servidor de desenvolvimento.
- **Validação completa antes do PR:** `npm run ci` (lint, tipos, testes com cobertura mínima de 80% em `src/lib` e build).
- **E2E (Playwright, Chromium):** `npm run e2e:instalar` (uma vez; baixa o navegador) e `npm run e2e` (gera o build, sobe o preview na porta 4173 e roda os fluxos de `e2e/`). Relatório: `npx playwright show-report`. Cobertura: `npm run test:coverage` (HTML em `coverage/index.html`).
- **Node exigido:** 22 LTS ou superior (`.nvmrc`).

### Imagem Docker
- Build multi-stage: `node:22-alpine` (linha LTS do `.nvmrc`) compila e `nginxinc/nginx-unprivileged:stable-alpine` (linha **stable** do Nginx, nunca a *mainline* de número ímpar) serve só o `dist/`.
- Ambas fixadas por **digest**: o Dependabot atualiza o digest dentro da mesma linha. Troca de major do Node fica de fora e é PR manual, junto com `.nvmrc` e CI.
- No npm, o Dependabot também ignora versões principais (Tailwind 4, TypeScript 7, Vitest 5…): elas exigem migração e entram por PR planejado.
- Roda como usuário 101 (não root), sem capabilities (`cap_drop: ALL`), com sistema de arquivos somente leitura e `no-new-privileges`.
- Nginx ([docker/nginx.conf](../docker/nginx.conf)):
  - headers de segurança: CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`;
  - cache longo em `/assets` e `no-cache` no `index.html`;
  - `/healthz` para o healthcheck.
- **CSP com `style-src 'unsafe-inline'`:** escolha consciente. O Vue e o Chart.js aplicam estilos inline, não há `v-html`/`eval` no código e o risco fica limitado a injeção de CSS. `script-src` continua só `'self'`.

### Smoke test local (o mesmo do workflow Docker)

```bash
docker build -t cronoai:local .
docker run -d --name cronoai-smoke -p 127.0.0.1:8099:8080 --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges:true cronoai:local
curl -fsS http://localhost:8099/healthz
curl -fsSI http://localhost:8099/
docker rm -f cronoai-smoke
```

No Git Bash, prefixe o `docker run` com `MSYS_NO_PATHCONV=1` para o `/tmp` não virar um caminho do Windows.

## 2. Workflows do GitHub Actions

| Workflow | Quando roda | O que faz | Bloqueia merge? |
|---|---|---|---|
| [CI](../.github/workflows/ci.yml) | Todo PR, push na `master`, manual | `npm ci` → lint → type-check → testes com cobertura (limiar de 80% em `src/lib`) → build → `npm audit` (produção, alta/crítica) → artefato `dist` | Sim |
| CI › Testes E2E (Playwright) | Junto do CI, em paralelo | `npm ci` → Chromium (cache opcional) → `npm run e2e`; na falha publica `playwright-report` e `test-results` (7 dias) | Não (incluir na proteção da `master` depois da 1ª execução verde) |
| CI › auditoria dev | Junto do CI | Relatório do `npm audit` de todas as dependências no resumo da execução | Não (informativo) |
| [Docker](../.github/workflows/docker.yml) | **Todo** PR, push na `master`, manual | Build da imagem (sem push), checa usuário não root, sobe container somente leitura e sem capabilities, testa `/healthz`, `/`, fallback da SPA e headers | Sim |
| [CodeQL](../.github/workflows/codeql.yml) | PR, push na `master`, segundas 06:23 UTC | Análise estática de segurança (`security-extended`) | Recomendado |
| [Release](../.github/workflows/release.yml) | Tag `vX.Y.Z` | Job `build` (token só leitura): confere a tag × `package.json`, roda o CI completo e empacota o `dist/`. Job `publish` (escrita, sem `npm`): cria o GitHub Release com `cronoai-vX.Y.Z-dist.zip` | — |
| [Dependabot](../.github/dependabot.yml) | Segundas | PRs de atualização de npm, Actions e imagens Docker (minor/patch agrupados) | — |

Princípios adotados:
- `permissions` mínimas (`contents: read`), elevadas só no job que precisa (`security-events: write` no CodeQL, `contents: write` só no `publish` do Release).
- `actions/checkout` com `persist-credentials: false`: o token não fica gravado no `.git/config` enquanto o `npm` executa código de terceiros.
- O workflow Docker roda em todo PR, sem filtro de caminhos. Um check obrigatório pulado por filtro fica pendente e trava o merge ([documentação](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/troubleshooting-required-status-checks#handling-skipped-but-required-checks)).
- Workflow de publicação sem cache de dependências.
- Apenas actions oficiais (`actions/*`, `docker/*`, `github/*`), fixadas por versão principal. **Pendente com a Segurança da Informação:** fixar por SHA de commit (o Dependabot mantém os SHAs) e decidir sobre um scanner de imagem (ex.: Trivy) no workflow Docker.
- `concurrency` cancela execuções antigas da mesma branch.
- Nenhum segredo é necessário. Variáveis `VITE_*` acabam no bundle (são públicas): nunca coloque chaves nelas.

> **CodeQL em repositório privado** exige o GitHub Code Security (Advanced Security) habilitado. Sem ele, o upload dos resultados falha. Nesse caso, desative o workflow ou peça a habilitação à Infra/Segurança.

## 3. Configuração no GitHub (manual, uma vez)

> **Antes de tudo:** confirme com Infraestrutura/Segurança se este código pode ficar no GitHub (`github.com/wesley93/cronoai`), se o repositório deve ser **privado** e se o GitHub Releases pode distribuir o `dist/`. Os guias internos da Sophia citam o Azure DevOps como padrão. As opções abaixo dependem dessa decisão e do plano da conta.

Em **Settings › Rules › Rulesets** (ou *Branches › branch protection rule*) para `master`:
1. Exigir pull request antes do merge.
2. Exigir os status checks **"Lint, tipos, testes e build"** e **"Build e smoke test da imagem"** (aparecem depois da 1ª execução).
3. Exigir branch atualizada antes do merge.
4. Bloquear *force push* e exclusão da branch.
5. **Aprovações:** o GitHub não deixa o autor aprovar o próprio PR. Com um único mantenedor, use **0 aprovações** e mantenha os checks obrigatórios; exija 1 aprovação quando houver um segundo revisor.

Em conta pessoal no plano Free, regras de proteção só valem em repositório **público**. Repositório privado com proteção exige plano pago ou organização: decisão da Infraestrutura.

Ruleset de **tags** `v*`: restringir quem cria tags de versão, porque a tag dispara o Release.

Em **Settings › Code security**: ativar Dependabot alerts, Dependabot security updates, Secret scanning e Push protection (se disponíveis no plano).

Em **Settings › Actions › General**: permitir só actions do GitHub e de criadores verificados; *Workflow permissions* = **Read repository contents** (padrão).

## 4. Fluxo de trabalho

1. Crie a branch a partir da `master`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/) (`feat(evm): …`, `fix(cpm): …`).
3. Abra o PR (o template pede testes e o impacto nos números); o CI e o Docker precisam ficar verdes.
4. Faça merge com *squash*.

## 5. Como lançar uma versão (compatível com a `master` protegida e o squash)

1. Numa branch `chore/release-vX.Y.Z`: `npm version minor --no-git-tag-version` (ou `patch`/`major`). Isso altera só o `package.json` e o lock.
2. Abra o PR, aguarde o CI e faça o merge.
3. Atualize a `master` local e crie a tag **no commit de merge**:
   ```bash
   git switch master
   git pull --ff-only
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```
4. O workflow **Release** valida e publica o zip do `dist/` em *Releases*.

Versões seguem o [SemVer](https://semver.org/lang/pt-BR/): `minor` para funcionalidade e `patch` para correção.

## 6. Pendências conhecidas

- **Dependências de desenvolvimento com aviso** (não vão para o bundle; o audit de produção está zerado):
  - `vitest` 3 / `tinypool` / `@vitest/mocker`: críticas; a correção exige o `vitest` 5 (versão principal nova). Fica para um PR próprio, provavelmente aberto pelo Dependabot.
  - `tailwindcss` 3 → `postcss-nested` / `postcss-selector-parser`: moderadas; a correção exige o Tailwind 4 (migração de configuração).
  - `eslint-plugin-vue` foi atualizado para a 10, o que elimina o aviso que ele trazia.
- Cache do navegador do Playwright no job `e2e`: a [documentação oficial não recomenda](https://playwright.dev/docs/ci#caching-browsers); medir no 1º PR (com e sem cache) e remover se não houver ganho.
- `@playwright/test` e `@vitest/coverage-v8` (só dev) e o download do Chromium/pacotes de sistema no CI: revisão de licença (Jurídico) e de segurança (Segurança da Informação) antes de produção. `@vitest/coverage-v8` precisa subir junto com o `vitest` (mesma versão).
- Deploy em ambientes: definir com a Infraestrutura (SPEC-00, incremento 0.3).
- Bibliotecas novas de lint (`eslint`, `@eslint/js`, `eslint-plugin-vue`, `vue-eslint-parser`, `typescript-eslint`, `globals`): revisão de segurança e de licença antes de produção (todas MIT; só dev).
