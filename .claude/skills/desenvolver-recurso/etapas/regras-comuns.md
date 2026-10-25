> Adaptado de Sophia.Escolar.Hibrido / SophIA (`etapas/regras-comuns.md`) para o CronoAI em 25/10/2026.

# Regras comuns a todas as faixas

## Arquivo do ciclo (evidência)

Um arquivo por ciclo: `.claude/ciclos/{NNNNN}-{slug}.md`, no formato de `.claude/templates/TEMPLATE-CICLO.md`.

- `{NNNNN}` = número da issue do GitHub com 5 dígitos quando houver (ex.: `00012`). Sem issue, o próximo número livre de 5 dígitos em `.claude/ciclos/` (confira com `ls .claude/ciclos/` — não presuma).
- Ficha (faixa 2) e plano (faixa 3) ficam ao lado: `.claude/ciclos/{NNNNN}-{slug}-ficha.md` e `-plano.md`.
- Primeira seção sempre `## Resumo` (até ~8 linhas, linguagem simples: o que é, o que foi decidido, o que o leitor precisa fazer, estado).
- Cada rodada de validação acrescenta `## Rodada {RR}` ao fim — nunca edite a anterior. A rodada traz: data, branch, SHA (`git rev-parse --short HEAD`), tabela de vereditos e a **matriz de verificação inteira**.
- Relatórios dos agentes entram **resumidos** no ciclo (só o bloco estruturado); não ganham arquivo próprio.
- Ciclos são versionados (vão no PR): sem dados pessoais nem dados reais de obra não anonimizados.

### Matriz de verificação

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|

- **Item:** `AC-N` (critério de aceite; faixa 1: `AC-1` = o pedido literal), `R-N` (regra), `N-N` (número/cálculo fixado), `M-N` (MS Project/arquivos), `P-N` (persistência/estado salvo), `S-N` (segurança), `V-N` (visual).
- **Obrig.:** `sim` para critérios de aceite e invioláveis tocados; `não` para verificações complementares. `APROVADO` exige toda linha `sim` em `PASS` ou `NA`.
- **Estado:** só `PASS | FAIL | INCONCLUSIVE | NOT_RUN | NA`. `NA` exige justificativa na Evidência.
- **Evidência:** comando + trecho literal da saída, ou caminho com linha. "Passou" não é evidência.
- `NOT_RUN` e `INCONCLUSIVE` **nunca viram aprovação**. Se o usuário decidir entregar assim, registre `Decisão do usuário: {motivo}` no ciclo e na descrição do PR.

## Checagens — o orquestrador roda uma vez antes do lote de validação

```bash
npm run lint
npm run typecheck
node .claude/scripts/testar-afetado.mjs --base {BASE}   # vitest dos arquivos relacionados ao diff
```

Guarde as saídas: elas vão nos campos `LINT:`, `TYPECHECK:` e `TESTES-AFETADOS:` dos validadores, que não as reexecutam. Vermelho aqui volta ao dev sem acionar validador.

- **Trabalho ainda não commitado:** `classificar-diff.mjs`, `validar-regras.mjs` e `testar-afetado.mjs` incluem automaticamente as alterações pendentes (staged, working tree e arquivos novos) quando o working tree está sujo, e avisam no stderr. `--pendente` força a inclusão; `--commits` considera só os commits.
- `gerar-changelog.mjs` lê só commits (`{BASE}..HEAD`): rode depois do commit, para conferir o changelog rascunhado a partir do ciclo.
- `auditar-dependencias.mjs --base {BASE}` também lista as dependências novas e as licenças delas.

- **Backend (T8, `server/`):** `dotnet build server/CronoAI.slnx -c Release` (avisos são erros), `cd server && dotnet test --solution CronoAI.slnx` (inclui integração; exige Docker; só funciona de dentro de `server/`), `dotnet format server/CronoAI.slnx --verify-no-changes` e `dotnet list server/CronoAI.slnx package --vulnerable --include-transitive`. `testar-afetado.mjs` e `auditar-dependencias.mjs` ainda só tratam npm.
- **Antes do PR:** `npm run ci` (lint + tipos + testes completos + build), igual ao GitHub Actions.
- **T7 (Docker/CI):** `docker build -t cronoai:local .` e o smoke test de `docs/devops.md` (healthz, `/`, headers). Workflows novos/alterados: `actionlint` (container `rhysd/actionlint`).
- **T3 (MSPDI):** teste de ida e volta e `validateMspdi(xml, { strictOrder: true })` sem erros fazem parte da checagem.
- **Rede determinística** depois da implementação e antes dos validadores: `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa {N}`. Se o diff exigir faixa maior, escale. Se acusar segurança, some o `seguranca` ao lote. Não discuta com o script; se ele errou, registre no ciclo e avise o usuário.
- **Regras automáticas:** `node .claude/scripts/validar-regras.mjs --base {BASE}` (invioláveis verificáveis por texto: `v-html`, `any`, segredos, `console.log`, cálculo sem teste).
- **Dependência nova (npm):** `node .claude/scripts/auditar-dependencias.mjs`. Vulnerabilidade alta/crítica vai ao prompt do `revisor`/`seguranca`. Lembre o usuário que pacote novo exige revisão de segurança e de licença antes de produção.

## Como delegar

`subagent_type` = `arquiteto`, `dev-frontend`, `dev-backend`, `dba`, `especialista-obra`, `testes`, `revisor` ou `seguranca`. Os agentes **não veem a conversa**: todo prompt leva faixa, caminho da ficha/plano, `BASE:` e branch, recorte exato, escopo fechado e, em retorno, as pendências na íntegra. Os modelos estão em `prompts/` (um por etapa); `prompts/00-regras-comuns.md` vale para todos.

Validadores do mesmo lote vão **na mesma mensagem** (paralelo) e nenhum recebe a saída do outro.

## O que o dev roda

- `npx vitest run {arquivos de teste relacionados}` a cada lote de edições; `npm run typecheck` e `npm run lint` uma vez ao fim do lote.
- Não roda a suíte completa nem o `npm run ci` (são do `testes`/CI). Três falhas seguidas pelo mesmo erro: para e devolve.
- Edita por Edit/Write, nunca por `sed -i`/`cat >>`.

## Regras de retorno

- Consolide as pendências de **todos** os validadores do lote numa lista só e devolva numa passagem (`prompts/09-retorno.md`).
- Retome o **mesmo** agente com `SendMessage`; agente novo só quando ele entendeu outra coisa.
- **Máximo de 3 retornos por etapa.** No terceiro, pare e leve o impasse ao usuário com as opções.
- Depois de correção, o `testes` roda de novo sempre (o código mudou); na faixa 3, a auditoria roda em modo delta.
- Mudança de escopo descoberta no meio: volte à ficha/plano e reaprove.

## Comando longo

Comando que pode passar de 10 min roda com `run_in_background` e log em arquivo dentro do scratchpad; a espera é pela notificação de término, nunca por laço de `sleep`. O trecho relevante do log vai para a Evidência.

## Matriz de autonomia

| Ação | Faixa 1 | Faixa 2 | Faixa 3 |
|---|---|---|---|
| Criar arquivo novo | Autônomo | Autônomo | Se previsto no plano; fora dele, confirmar |
| Excluir arquivo | Confirmar | Confirmar | Escalar ao usuário |
| Motor de cálculo (`cpm`, `evm`, `scenarios`, `supplies`, `sinapi*`) | Bloquear (é faixa 2) | Com teste fixando números | Com teste fixando números |
| `msProjectXmlParser.ts` | Bloquear (é faixa 3) | Bloquear (é faixa 3) | Previsto no plano |
| `.github/workflows/`, `Dockerfile`, `docker/`, compose | Bloquear (é faixa 2) | Confirmar | Escalar |
| `.env`, segredos | Nunca grava, nunca lê para repetir | idem | idem |
| Commit | Com aprovação | Com aprovação | Com aprovação |
| Push, PR | Usuário (ou sessão autorizada por ele) | idem | idem |
| Merge na `master` | Usuário | Usuário | Usuário |

Hospedagem ou infraestrutura nova (servidor, provedor, domínio, registro de imagens, deploy): não proponha por conta própria; oriente o usuário a falar com a equipe de **Infraestrutura**.

## O que o orquestrador não faz

- Não implementa código de produção nas faixas 2 e 3.
- Não decide mudança de escopo — é do usuário.
- Não envia dado de obra ou de trabalhador para serviço externo não aprovado.
- Não publica imagem, não faz deploy e não altera configurações do repositório no GitHub (proteção de branch, segredos).
- Não encerra o ciclo fora do `/entregar`.
