---
paths:
  - "Dockerfile"
  - "docker/**"
  - "docker-compose.yml"
  - ".dockerignore"
  - ".github/**"
---

> Criado para o CronoAI em 25/10/2026, no formato do processo SophIA.

# Docker, Nginx e GitHub Actions

Fonte da verdade: `CLAUDE.md` › **Git, PR e CI** e › **Invioláveis** (item 8), e `docs/devops.md`. Mexer aqui é **T7** (faixa 2); se mexer em CSP/headers, permissões do Actions ou segredos, também é **T5** (faixa 3).

**Publicação, ambientes, domínio, certificados e registro de imagens são com a equipe de Infraestrutura.** Não proponha provedor nem fluxo de deploy por conta própria.

## Imagem e container

- Build multi-stage: `node:22.x-alpine` compila; `nginxinc/nginx-unprivileged` na linha **stable** do Nginx serve só o `dist/`. Sem código-fonte nem `node_modules` na imagem final. O `.dockerignore` exclui `.env*` e `.claude` — mantenha (e `VITE_*` nunca leva segredo).
- **Não root** (usuário 101, porta 8080). Healthcheck em `/healthz`.
- Compose: `read_only: true`, `tmpfs: /tmp`, `cap_drop: [ALL]`, `no-new-privileges:true`, portas só em `127.0.0.1`. Não afrouxe. O smoke test do CI usa as mesmas opções.
- Imagens base fixadas por **versão + digest**; nunca linha mainline (número ímpar) do Nginx, que congela quando sai a stable seguinte. Atualização vem pelo Dependabot.

## Nginx (`docker/nginx.conf`)

- Headers de segurança em todas as respostas **e** repetidos no bloco do `index.html` (o `add_header` de um `location` substitui os do `server`): CSP, `nosniff`, `X-Frame-Options DENY`, `Referrer-Policy`, `Permissions-Policy`.
- CSP: `script-src 'self'` sem `unsafe-inline`/`unsafe-eval`; `connect-src` só amplia com motivo (ex.: backend da SPEC-01) e com a Segurança da Informação.
- `index.html` com `no-cache`; `/assets/` com cache longo imutável; fallback da SPA para `index.html`.
- `server_tokens off`.

## GitHub Actions (`.github/workflows/`)

- `permissions` mínimas no topo (`contents: read`), elevadas só no job que precisa (`security-events: write` no CodeQL, `contents: write` só no job `publish` do Release, que não roda `npm`).
- `actions/checkout` com `persist-credentials: false`; workflow de publicação sem cache de dependências.
- Workflow cujo job é check obrigatório **não** usa filtro `paths` (o check pulado fica pendente e trava o merge).
- **Só actions oficiais** (`actions/*`, `docker/*`, `github/*`). Action de terceiro nova exige **Segurança da Informação**. Fixar por SHA é a próxima etapa recomendada, após revisão da Segurança.
- **Sem push de imagem nem deploy** (`push: false` no build). Publicar é com a Infraestrutura.
- Nada de `pull_request_target` com checkout do PR; nada de `${{ github.event.* }}` interpolado direto em `run:` (passe por `env:`).
- `concurrency` cancela execuções antigas; nenhum segredo é necessário hoje — segredo novo passa por Infraestrutura/Segurança.
- Nome dos jobs "Lint, tipos, testes e build" e "Build e smoke test da imagem" é usado na proteção da `master`: renomear quebra a proteção — avise o usuário.
- Dependabot (`.github/dependabot.yml`) e templates (`pull_request_template.md`, `ISSUE_TEMPLATE/`) seguem o mesmo rigor de revisão.

## Verificação (T7)

```bash
docker build -t cronoai:local .
docker compose up --build app        # smoke test: /healthz, /, fallback da SPA e headers (docs/devops.md)
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" -w /repo rhysd/actionlint:1.7.7   # Git Bash; em worktree/pasta não compartilhada, copie .github com docker cp
```

Docker indisponível na máquina: `NOT_RUN` na matriz, com o motivo — o workflow Docker do PR vira a evidência e precisa ficar verde antes do merge.
