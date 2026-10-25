# DevOps — execução local, Docker e GitHub Actions

> Publicar a aplicação em servidor (ambientes, domínio, certificados, banco, registro de imagens) **não** está coberto aqui: procure a **equipe de Infraestrutura** antes de seguir. Este guia cobre execução local e a verificação automática no GitHub.

## 1. Rodar localmente

| Forma | Comando | Endereço |
|---|---|---|
| Node (desenvolvimento) | `npm ci` e depois `npm run dev` | http://localhost:5180 |
| Docker — produção (Nginx) | `docker compose up --build app` | http://localhost:8080 |
| Docker — desenvolvimento (recarga automática) | `docker compose --profile dev up dev` | http://localhost:5180 |

- Porta ocupada? Defina `CRONOAI_PORT` (ex.: `CRONOAI_PORT=8088 docker compose up --build app`).
- Validação completa antes do PR: `npm run ci` (lint, tipos, testes e build).
- Node exigido: 22 LTS ou superior (`.nvmrc`).

### Imagem Docker
- Build multi-stage: `node:22-alpine` compila e `nginxinc/nginx-unprivileged:1.27-alpine` serve só o `dist/`.
- Roda como usuário 101 (não root), com sistema de arquivos somente leitura no compose e `no-new-privileges`.
- Nginx ([docker/nginx.conf](../docker/nginx.conf)):
  - headers de segurança (CSP, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`);
  - cache longo em `/assets` e `no-cache` no `index.html`;
  - `/healthz` para o healthcheck.

## 2. Workflows do GitHub Actions

| Workflow | Quando roda | O que faz | Bloqueia merge? |
|---|---|---|---|
| [CI](../.github/workflows/ci.yml) | Todo PR, push na `master`, manual | `npm ci` → lint → type-check → testes → build → `npm audit` (produção, alta/crítica) → artefato `dist` | Sim |
| CI › auditoria dev | Junto do CI | Relatório do `npm audit` de todas as dependências no resumo da execução | Não (informativo) |
| [Docker](../.github/workflows/docker.yml) | PR que muda build/código, push na `master`, manual | Build da imagem (sem push), checa usuário não root, sobe container somente leitura e testa `/healthz`, `/`, fallback da SPA e headers | Sim |
| [CodeQL](../.github/workflows/codeql.yml) | PR, push na `master`, segundas 06:23 UTC | Análise estática de segurança (`security-extended`) | Recomendado |
| [Release](../.github/workflows/release.yml) | Tag `vX.Y.Z` | Confere que a tag bate com o `package.json`, roda o CI completo e cria o GitHub Release com `cronoai-vX.Y.Z-dist.zip` | — |
| [Dependabot](../.github/dependabot.yml) | Segundas | PRs de atualização de npm, Actions e imagens Docker (minor/patch agrupados) | — |

Princípios adotados:
- `permissions` mínimas (`contents: read`), elevadas só no job que precisa (`security-events: write` no CodeQL, `contents: write` no Release).
- Apenas actions oficiais (`actions/*`, `docker/*`, `github/*`). Fixar por SHA de commit é a próxima etapa recomendada, após revisão da Segurança.
- `concurrency` cancela execuções antigas da mesma branch.
- Nenhum segredo é necessário hoje. Variáveis `VITE_*` acabam no bundle (são públicas): nunca coloque chaves nelas.

> **CodeQL em repositório privado** exige GitHub Code Security (Advanced Security) habilitado na organização/conta. Sem isso, o upload dos resultados falha. Nesse caso, desative o workflow ou peça a habilitação à Infra/Segurança.

## 3. Configuração no GitHub (manual, uma vez)

Em **Settings › Branches › Add branch ruleset** (ou *branch protection rule*) para `master`:
1. Exigir pull request antes do merge, com **1 aprovação**.
2. Exigir os status checks **"Lint, tipos, testes e build"** e **"Build e smoke test da imagem"** (aparecem depois da 1ª execução).
3. Exigir branch atualizada antes do merge.
4. Bloquear *force push* e exclusão da branch.

Em **Settings › Code security**: ativar Dependabot alerts, Dependabot security updates, Secret scanning e Push protection (se disponível no plano).

Em **Settings › Actions › General**: "Allow GitHub Actions and reusable workflows" restrito a actions do GitHub e de criadores verificados; *Workflow permissions* = **Read repository contents** (padrão).

> Antes disso, confirme com Infraestrutura/Segurança se este código pode ficar no GitHub e se o repositório deve ser **privado**. Os guias internos da Sophia citam o Azure DevOps como padrão.

## 4. Fluxo de trabalho

1. Crie a branch a partir da `master`: `feat/…`, `fix/…`, `docs/…`, `chore/…`.
2. Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/) (`feat(evm): …`, `fix(cpm): …`).
3. Abra o PR (o template pede testes e o impacto nos números); o CI e o Docker precisam ficar verdes.
4. Faça merge com *squash* após a aprovação.

## 5. Como lançar uma versão

1. Atualize a versão: `npm version minor` (ou `patch`/`major`). Isso altera o `package.json` e cria a tag `vX.Y.Z` localmente.
2. Envie a branch e a tag: `git push --follow-tags`.
3. O workflow **Release** valida e publica o zip do `dist/` em *Releases*.

Versões seguem o [SemVer](https://semver.org/lang/pt-BR/): `minor` para funcionalidade e `patch` para correção.

## 6. Pendências conhecidas

- `vitest` 3 tem vulnerabilidades (dependência de desenvolvimento, não vai para o bundle). A correção exige o `vitest` 5 (versão principal nova) e fica para um PR próprio, provavelmente aberto pelo Dependabot.
- Testes E2E (Playwright) e cobertura mínima: SPEC-00, incremento 0.2.
- Deploy em ambientes: definir com a Infraestrutura (SPEC-00, incremento 0.3).
