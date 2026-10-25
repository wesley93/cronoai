# SPEC-00 — Fundação de engenharia: Git, CI/CD, Docker e qualidade

| Campo | Valor |
|---|---|
| Status | Em andamento (Docker, CI, lint e templates entregues neste ciclo) |
| Fase | 0 |
| Prioridade | Alta |
| Esforço | P (pequeno) |
| Depende de | — |
| Validar com | Infraestrutura (uso do GitHub, registro de imagens, ambientes), Segurança (Actions de terceiros) |

## 1. Problema
O projeto estava sem lint, sem integração contínua e sem forma padronizada de execução. Qualquer pessoa precisava instalar a versão certa do Node para rodar, e nada barrava uma alteração que quebrasse testes ou o build.

## 2. Objetivo
Toda alteração passa por verificação automática (lint, tipos, testes, build, imagem Docker, análise de segurança) antes de entrar na branch principal. Qualquer pessoa sobe a aplicação com um único comando.

## 3. Escopo
**Inclui:** Dockerfile multi-stage, `docker-compose.yml` (perfis `app` e `dev`), Nginx com headers de segurança, ESLint, workflows do GitHub Actions (CI, Docker, CodeQL, release), Dependabot, templates de PR e issue, guia [docs/devops.md](../devops.md).
**Não inclui:** publicação em servidor, domínio e certificados (é escopo da **Infraestrutura**), testes E2E (incremento 0.2).

## 4. Requisitos funcionais
- **RF-00.1** `docker compose up app` sobe a aplicação de produção (Nginx sem root) em `http://localhost:8080`, com `/healthz`.
- **RF-00.2** `docker compose --profile dev up dev` sobe o Vite com recarga automática, montando `src/`.
- **RF-00.3** Workflow **CI** em todo PR e push na branch principal: `npm ci` → `lint` → `typecheck` → `test` → `build`, publicando `dist/` como artefato.
- **RF-00.4** Workflow **Docker**: build da imagem, smoke test (sobe o container e consulta `/healthz` e `/`), sem publicar em registro.
- **RF-00.5** Workflow **CodeQL** (JavaScript/TypeScript) em PR, na branch principal e semanalmente.
- **RF-00.6** Workflow **Release** em tag `v*.*.*`: valida, gera `cronoai-<versão>-dist.zip` e cria o GitHub Release.
- **RF-00.7** Dependabot semanal para npm, GitHub Actions e imagens Docker, com agrupamento de atualizações menores.

## 5. Requisitos não funcionais
- **RNF-00.1** Actions fixadas por versão principal (`@v4`); **(recomendação)** fixar por SHA de commit depois da aprovação da Segurança.
- **RNF-00.2** `permissions:` mínimas por workflow (`contents: read` por padrão).
- **RNF-00.3** CI completo em menos de 5 minutos.
- **RNF-00.4** Imagem final sem Node, sem código-fonte e sem `node_modules`; usuário não root.
- **RNF-00.5** Node 22 LTS no CI e no Docker (`.nvmrc`).

## 6. Fluxo de branches (recomendação)
- `master` protegida: PR obrigatório, CI verde e 1 revisão (configurado em *Settings › Branches* no GitHub; ver [devops.md](../devops.md)).
- Branches `feat/…`, `fix/…`, `docs/…`; commits no padrão [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/).
- Versões no padrão [SemVer](https://semver.org/lang/pt-BR/): `v1.1.0` para funcionalidade e `v1.0.1` para correção.

## 7. Critérios de aceite
- [x] `docker compose up app` responde 200 em `/` e em `/healthz`.
- [x] CI, Docker e CodeQL descritos em `.github/workflows/` com `permissions` mínimas.
- [ ] PR de teste no GitHub com todos os checks verdes (depende do push).
- [ ] Proteção da `master` ativada.
- [ ] Incremento 0.2: Playwright E2E cobrindo o fluxo "aprovar apontamento → exportar XML" e "aplicar cenário".

## 8. Riscos
| Risco | Mitigação |
|---|---|
| Código interno num repositório público | Confirmar com Infra/Segurança; manter **privado** |
| Action de terceiro comprometida | Só actions oficiais (`actions/*`, `docker/*`, `github/*`); revisar antes de adicionar outras |
| Imagem publicada sem aval | Workflows não publicam imagem; publicação depende da Infra |

## 9. Plano de entrega
1. **0.1 (este ciclo):** Docker, ESLint, CI, Docker CI, CodeQL, Release, Dependabot, templates.
2. **0.2:** Playwright E2E, cobertura de testes (`@vitest/coverage-v8`) com mínimo de 80% em `src/lib`.
3. **0.3:** ambientes (homologação/produção) e deploy, definidos **com a Infraestrutura**.
