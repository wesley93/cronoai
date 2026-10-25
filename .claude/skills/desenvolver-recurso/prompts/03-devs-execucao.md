> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/skills/desenvolver-recurso/prompts/03-devs-execucao.md`) para o CronoAI em 25/10/2026.

# Prompt — Devs, execução

`subagent_type`: `dev-frontend` (hoje, todo o código); `dev-backend` a partir da SPEC-01.

```
FAIXA: {2 | 3}
TRIAGEM: {sinais T com SIM}
{FICHA | PLANO}: .claude/ciclos/{NNNNN}-{slug}-{ficha|plano}.md — suas tarefas: {n} a {m}
{Faixa 3 — ENTREGÁVEL {k} de {N} ("{nome}"): só as tarefas dele.}
BASE: {master | outra}
BRANCH: {branch}

TAREFA:
{recorte exato, tarefa por tarefa}

{Com T1/T2 — CASO DE REFERÊNCIA (o teste fixa exatamente estes números):
- {entrada} → {número esperado} — fonte: {MS Project | PMBOK | SINAPI | planilha}}
{Com T3 — ARQUIVO DE EXEMPLO: {caminho}; o que precisa sobreviver à ida e volta: {campos}}
{Com T4 — ESTADO SALVO: {padrão compatível ou migração previstos na ficha/plano}}

ESCOPO FECHADO — você NÃO toca:
- {arquivo/área 1}
- {arquivo/área 2}
- Nada de refatoração, renomeação em massa ou "melhoria" de código vizinho
- Nenhuma dependência nova (npm) sem que a ficha/plano preveja
- Nenhum teste existente alterado sem justificar no relatório (antes → depois e por quê)

LEMBRETES DO CLAUDE.md: src/lib puro (sem store, DOM ou localStorage; exceções
download.ts e useMsProject.ts); datas ISO yyyy-mm-dd UTC; durações e lags em dias
úteis inteiros; dinheiro em number, arredondado só na exibição (src/lib/format.ts);
sem any, @ts-ignore, as unknown as, nem enum TS (as const + typeof); fórmula citada
no comentário, em português; <script setup lang="ts">; estado de domínio só na store;
textos de interface em português com fmtBRL/fmtDate/fmtIndex; classes do style.css;
nada de v-html com texto do usuário, do XML ou de IA; MSPDI na ordem do esquema
(SCHEMA_ORDER). Regras por área em .claude/rules/ (calculo-precisao.md,
msproject-mspdi.md, frontend-geral.md, testes.md, docker-ci.md).

VALIDAÇÃO QUE VOCÊ RODA (etapas/regras-comuns.md › O que o dev roda):
`npx vitest run {arquivos de teste relacionados}` a cada lote de edições;
`npm run typecheck` e `npm run lint` uma vez ao fim. Não rode testar-afetado, a
suíte completa nem npm run ci. 3 falhas seguidas pelo mesmo erro: pare e devolva.

No relatório, além do bloco DOD da sua definição, inclua:
TESTES-DEV:
SHA: {git rev-parse HEAD}
RESULTADO: {comando e resumo de cada execução, OK/FALHOU}
NÃO CONCLUÍDO: {o que ficou de fora e por quê | nada}

Se precisar sair do escopo, PARE e devolva com a justificativa.
```
