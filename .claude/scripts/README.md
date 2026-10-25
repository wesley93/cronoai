> Adaptado do SophIA (`.claude/scripts/`, PowerShell) para o CronoAI em 25/10/2026. `ado.ps1` e `lib/ado-config.ps1` foram descartados porque o repositório é GitHub (não há Azure DevOps).

# Scripts do processo (CronoAI)

Node.js 22+ em ESM (`.mjs`), **sem dependência npm nova**: só módulos `node:` e `git`/`npm`/`npx` via `child_process`. Rodam em Windows (Git Bash ou PowerShell) e Linux (CI), sempre a partir da raiz do repositório. Todos são só leitura (nenhum altera o git nem grava arquivo) e aceitam `--help`.

Quem chama cada script e em que etapa: `.claude/skills/desenvolver-recurso/etapas/regras-comuns.md › Checagens`.

| Script | Para quê | Parâmetros | Exit |
|---|---|---|---|
| `classificar-diff.mjs` | Triagem determinística T1–T8 por caminho (+ linhas novas para T5/T8), faixa exigida, `seguranca` e `especialista-obra` obrigatórios | `--base <ref>` (padrão `master`) · `--faixa N` · `--pendente` · `--commits` · `--json` | 0 ok · 1 faixa declarada < exigida · 2 erro |
| `validar-regras.mjs` | Regras do `CLAUDE.md` nas linhas **adicionadas** do diff (R01–R17: `v-html`, `any`, `@ts-ignore`, segredos, `VITE_*` com segredo, cálculo/MSPDI sem teste, workflows; **backend .NET em `server/src`**: R14 SQL bruto, R15 DDL fora de migração e DML de migração fora do helper, R16 `IgnoreQueryFilters`, R17 conexão crua; casos em `lib/regras-cronoai.test.mjs`) | `--base <ref>` · `--pendente` · `--commits` · `--json` | 0 sem bloqueio · 1 há "bloqueia" · 2 erro |
| `testar-afetado.mjs` | `npx vitest related --run` dos `.ts`/`.vue` alterados; opcionalmente lint e typecheck | `--base <ref>` · `--pendente` · `--commits` · `--lint` · `--typecheck` · `--listar` | 0 passou/nada a testar · código do passo que falhou · 2 erro |
| `auditar-dependencias.mjs` | `npm audit` separando produção × desenvolvimento; com `--base`, dependências novas/alteradas e licença de cada uma | `--base <ref>` · `--json` | 0 ok · 1 alta/crítica em produção · 2 audit não rodou |
| `gerar-changelog.mjs` | Rascunho de changelog dos commits `<base>..HEAD` (Conventional Commits), no formato do `TEMPLATE-CHANGELOG.md` | `--base <ref>` · `--versao X.Y.Z` | 0 ok · 2 erro |
| `hook-pos-edicao.mjs` | Hook `PostToolUse` do Claude Code: ESLint no `.ts`/`.vue` editado; problemas vão ao Claude pelo stderr | JSON no stdin | 0 limpo/erro interno · 2 problemas de lint |
| `lib/regras-cronoai.mjs` | Funções comuns: git, merge-base, diff, linhas novas, triagem, regras | — | — |

`--base` usa o **merge-base** entre a ref e `HEAD` (tenta `origin/<ref>` se a branch local não existir). Sem merge-base o script falha fechado (exit 2) em vez de devolver lista vazia. Com o working tree sujo, `classificar-diff`, `validar-regras` e `testar-afetado` incluem **automaticamente** staged, working tree e arquivos não rastreados, e avisam no stderr. O processo só commita no `/entregar`, então olhar só os commits daria verde falso.
`--pendente` força a inclusão; `--commits` considera só os commits da branch.

## Exemplos

```bash
# Rede determinística depois da implementação (etapa 5)
node .claude/scripts/classificar-diff.mjs --base master --faixa 2
node .claude/scripts/classificar-diff.mjs --base master --pendente --json

# Regras automáticas e testes do afetado (etapa 6)
node .claude/scripts/validar-regras.mjs --base master --pendente
node .claude/scripts/testar-afetado.mjs --base master --pendente --lint --typecheck

# Dependência nova
node .claude/scripts/auditar-dependencias.mjs --base master

# Teste da regra R08 (senha literal em string de conexão, JSON e atribuição)
node --test .claude/scripts/lib/regras-cronoai.test.mjs

# Entrega
node .claude/scripts/gerar-changelog.mjs --base master --versao 1.1.0 > /tmp/changelog.md
```

## Triagem (`classificar-diff.mjs`)

| Sinal | Caminhos / conteúdo |
|---|---|
| T1 | `src/lib/cpm.ts`, `src/lib/calendar.ts` |
| T2 | `src/lib/{evm,scenarios,supplies,sinapi,sinapiBudget,diagnosis}.ts`. A store gera "revisar manualmente T2/T4" (progressPatch) |
| T3 | `src/lib/msProjectXmlParser*.ts`, `src/lib/sinapiBudget.ts` (CSV) |
| T4 | `src/types/domain.ts`, `src/stores/useProjectStore.ts` (`src/data/seed.ts` → revisar manualmente) |
| T5 | `docker/nginx.conf`; workflow cuja linha nova toca `permissions:`/`*: write`/`secrets.`/`GITHUB_TOKEN`/`github.token`/`pull_request_target`/`workflow_run` ou usa action fora de `actions/`, `github/`, `docker/`; dependência **nova** no `package.json` (versão alterada → revisar), linha nova com `FileReader`/`DOMParser`/`type="file"`/`readAs*` em `src/` |
| T6 | `src/lib/fieldAi.ts`, `AiMappingPanel.vue` |
| T7 | `Dockerfile`, `.dockerignore`, `docker/**`, `docker-compose*.yml`, `.github/**`, `.nvmrc` |
| T8 | `api/`, `backend/`, `server/`, linha nova com `fetch(`/`WebSocket`/`XMLHttpRequest`/`sendBeacon`/`EventSource` em `src/` |

Faixa 3 se T3, T5 ou T8. Faixa 2 se T1, T2, T4, T6, T7 ou mais de 3 arquivos de código (testes, `docs/`, `.claude/` e `*.md` não contam). Nos demais casos, faixa 1. `seguranca` é obrigatório com T5/T8 e `especialista-obra` com T1/T2/T3.

## Ativar o hook

O Claude Code só executa o hook se ele estiver em `.claude/settings.json` (revise antes de ativar):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/scripts/hook-pos-edicao.mjs\"", "timeout": 30 }]
      }
    ]
  }
}
```

Contrato seguido: [documentação oficial de hooks](https://docs.anthropic.com/en/docs/claude-code/hooks). No `PostToolUse`, exit 2 mostra o stderr ao Claude, depois que a edição já aconteceu. O hook usa o ESLint local (`node_modules/eslint/bin/eslint.js`, com `npx --no-install eslint` como alternativa) e um timeout de 20 s. Leva de 5 a 10 s por edição no Windows. Qualquer erro interno termina em exit 0 silencioso.

Teste manual. No PowerShell use aspas simples em volta do JSON. No Git Bash, as aspas do `echo {...}` somem, e o hook tolera isso:

```bash
echo '{"tool_input":{"file_path":"src/lib/cpm.ts"}}' | node .claude/scripts/hook-pos-edicao.mjs
```

## Diferenças em relação ao original (SophIA)

- `ado.ps1` e `lib/ado-config.ps1` foram descartados: o repositório é GitHub e as issues são abertas pelo navegador (não há `gh` CLI).
- `testar-afetado` não mapeia projetos .NET: usa o grafo de imports do Vitest (`vitest related`). Saiu também a checagem de lock de DLL na porta 5199.
- O hook deixou de devolver lembretes (`additionalContext`, exit 0) e passou a rodar o ESLint, devolvendo exit 2 quando há problema.
- Mudou a faixa declarada abaixo da exigida: agora sai com exit 1 (no original era 3).
- A política do `auditar-dependencias` segue o CI (`npm audit --omit=dev --audit-level=high`): só alta/crítica em **produção** bloqueia. As de desenvolvimento são informativas (ver `CLAUDE.md › Dívida conhecida`, `vitest` 3).
- Licença fora de MIT/ISC/BSD/0BSD/Apache-2.0 é só sinalizada. A decisão é do **Jurídico**, e pacote novo exige revisão de segurança e de licenciamento antes de produção.
