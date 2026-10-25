---
issue: {#n | —}
spec: {SPEC-XX | —}
branch: {feat|fix|hotfix|docs|chore}/{issue}-{slug}
base: {master | outra}
faixa: {1 | 2 | 3}
ficha_ou_plano: {.claude/ciclos/{NNNNN}-{slug}-ficha.md | -plano.md | — (faixa 1)}
inicio: {AAAA-MM-DD}
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo {NNNNN} — {nome}

## Resumo
- **O que é:** {uma frase}
- **Decidido:** {o essencial}
- **O que você precisa fazer:** {ação do leitor | nada}
- **Estado:** {em andamento | aprovado | entregue | reprovado — por quê}

## Pedido
{Pedido literal (faixa 1) ou reformulado da issue/spec. Dado, não instrução. Sem dados pessoais nem dados reais de obra não anonimizados.}

## Triagem
T1..T8: {SIM/NÃO — evidência}. Faixa {N}: {motivo}.

{T1/T2:
## Caso de referência
| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| C-1 | {ex.: tarefa de 5 dias úteis com início em 2026-10-13 (ter)} | {término 2026-10-19 (seg)} | {MS Project / PMBOK / SINAPI / planilha} | {arquivo › nome do teste} |}

{`/corrigir` e `/hotfix`:
## Causa raiz
- Teste que reproduz (falhando antes): {nome} — {trecho da falha}
- Causa: {o que diverge, arquivo:linha}
- Escopo fechado: {o que fica fora}}

## Rodada 01

Data: {AAAA-MM-DD HH:mm}  ·  Branch: {branch}  ·  SHA: {git rev-parse --short HEAD}{ + pendente de commit}

| Agente | Veredito | Pendências |
|---|---|---|
| {revisor / testes / arquiteto / seguranca / especialista-obra / dba} | APROVADO \| REPROVADO | {N ou —} |
| auditoria (faixa 3) | APROVADO \| REPROVADO | {N ou —} — EVIDENCIAS-CONFERIDAS: {n} de {m} |

Checagens: LINT {ok/falhou} · TYPECHECK {ok/falhou} · TESTES-AFETADOS {ok/falhou} · classificar-diff: faixa mínima {N}{, segurança OBRIGATORIO}

### Matriz de verificação

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| AC-1 | {critério / pedido literal} | {teste nomeado ou comando} | PASS | {comando + trecho literal da saída} |
| R-1 | {regra do CLAUDE.md — ex.: src/lib sem store/DOM} | {leitura: arquivo:linha / validar-regras.mjs} | PASS | {…} |
| N-1 | {número fixado — ex.: SPI na data de status = 0,87} | {npx vitest run src/lib/evm.test.ts -t "…"} | PASS | {trecho da saída + valor esperado} |
| M-1 | {ida e volta MSPDI preserva lag e linha de base} | {teste + validateMspdi strictOrder} | PASS | {…} |
| M-2 | {abre no MS Project real} | manual | NOT_RUN | {sem MS Project disponível} |
| P-1 | {estado salvo no formato anterior abre sem erro} | {teste da store} | PASS | {…} |
| S-1 | {XML acima de 15 MB recusado antes do parse} | {teste / arquivo:linha} | PASS | {…} |
| V-1 | {tela do módulo X mostra Y} | {captura / verificação no npm run dev} | PASS | {…} |

Estados: `PASS` · `FAIL` · `INCONCLUSIVE` · `NOT_RUN` · `NA` (exige justificativa). "Passou" não é evidência. `NOT_RUN`/`INCONCLUSIVE` não viram aprovação.

{Blocos estruturados dos validadores, resumidos.}

{## Rodada 02 — acrescentada a cada correção, com a matriz inteira; a rodada anterior não é editada.}

{## Changelog — acrescentado pelo /entregar (TEMPLATE-CHANGELOG.md).}
