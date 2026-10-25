---
issue: —
spec: SPEC-14 (RF-14.1–14.3, RNF-14.2, RNF-14.3); SPEC-15 RNF-15.3
branch: feat/00002-multiobra
base: master (o 00001 já está na master; a branch foi aberta sobre 2c729f6, o commit do 00001)
faixa: 2 (T4; T2 na apresentação pela Emenda 01)
ficha_ou_plano: .claude/ciclos/00002-multiobra-ficha.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00002 — Multiobra, com UF por obra

## Resumo
- **O que é:** várias obras no navegador (IndexedDB), uma obra ativa com seletor no topo e a tela "Obras" para criar, duplicar, excluir e editar UF, município, responsável e tabela SINAPI. O estado salvo da v1 (`cronoai-state-v1`) vira a 1ª obra, sem perda, e nunca é apagado.
- **Decidido:** o gate (P1 IndexedDB, P2 criar em dois passos, P3 desfazer por obra) e a Emenda 01 (obra sem cronograma × sem orçamento) foram decididos pelo orquestrador. O usuário autorizou seguir sem parar; as decisões ficam **sujeitas à revisão dele no PR**.
- **Números:** o Edifício Aurora migrado mantém entrega 2027-06-23, 16 d.u., SPI 0,8883 e CPI 0,9349. Com o apontamento aprovado, mantém 2027-06-16 e 11 d.u.
- **O que você precisa fazer:** revisar no PR as decisões do gate e da emenda. Levar ao **Jurídico** a questão de vários clientes no mesmo navegador (LGPD); a persistência definitiva é a SPEC-01, com a **Infraestrutura**.
- **Estado:** aprovado — testes (rodada 01), revisor (rodada 03) e especialista-obra (rodada 04, 106 testes reexecutados; diagnóstico das obras normais idêntico ao da base).

## Commits
| SHA | Conteúdo |
|---|---|
| 1e4a88a | Ficha, ADR 00002 e gate. As fixtures v1 foram geradas sobre esta base (tarefa 1) |
| ab47710 | E1: modelo da obra e cadeia de migrações (`ESQUEMA_ATUAL = 2`) |
| 03c721a | E2: IndexedDB, store multiobra e migração da v1 |
| 0848d4b | E3: tela Obras, seletor da obra ativa e dados da obra |
| 0fabf1e | E4: E2E de migração e troca; docs. Contém a correção do `DataCloneError` (proxy reativo no IndexedDB): os commits E2 e E3 ficam quebrados no navegador real, o que atrapalha *bisect* |
| 5796afb | Rodada 02: índice validado, gravação bloqueada sem leitura segura, data de início no log |
| 16105c4 | Emenda 01 da ficha |
| 103f319 | Rodada 03: sem cronograma × sem orçamento, validação da data de início |
| 08e40b3 | Rodada 04: diagnóstico sem custo quando BAC 0; datas livres em obra sem avanço; data de status validada |

## Rodadas
| Rodada | testes | revisor | especialista-obra |
|---|---|---|---|
| 01 | APROVADO COM RESSALVAS | REPROVADO: índice sem validação; falha de leitura sobrescrevia o índice | APROVADO COM RESSALVAS: P-1 data de início sem log/teste; P-2 obra em branco "no prazo" em verde |
| 02 | — | REPROVADO: escopo (`diagnosis.ts` fora da ficha) e o BAC 0 escondia o prazo | REPROVADO: teste fixava 2027-06-22/15, efeito do erro em `calendar.ts:119` |
| 03 | — | **APROVADO** (4 ressalvas baixas) | REPROVADO: textos de custo com BAC 0 e AC > 0 |
| 04 | — | — | **APROVADO** |

Checagens finais do dev (rodada 04): lint ok; typecheck ok; `test:coverage` com 167 testes e cobertura 96,06 / 85,11 / 94,44 / 96,06; E2E 13/13; `validar-regras` com 0 bloqueios; `classificar-diff` faixa 2 (T2, T4). Conferência visual do orquestrador no `npm run dev`: a tela `#/obras` carregou com a v1 migrada como 1ª obra, as 27 UFs e os dois regimes.

## Números que mudaram de propósito (antes → depois)
| Caso | Antes | Depois | Teste |
|---|---|---|---|
| Obra não iniciada (Aurora a 0%), início adiado de 2026-05-04 para 2026-06-01, mantendo a data de status | (não editável pela tela) | entrega 2027-06-02 / 1 d.u. → 2027-06-29 / 20 d.u. | `useProjectStore.obras.test.ts` |
| Obra em branco | topo "no prazo", SPI/CPI 1,00 em verde, "Obra sob controle" | "—", "sem cronograma", sem diagnóstico de desempenho. O motor continua com SPI = CPI = 1 (`safeDiv`) | `diagnosis.test.ts`, E2E `obras.spec.ts` |
| Obra com tarefas e BAC 0 | diagnóstico "sob controle" pelo `safeDiv` | só o diagnóstico de prazo pelo CPM (+N d.u., caminho crítico, recuperação); sem SPI/CPI/EAC/margem | `diagnosis.test.ts` |

## Rollback
Reverter os commits faz a versão antiga ler a v1, que nunca foi alterada. As obras criadas depois ficam no IndexedDB e reaparecem ao reaplicar o ciclo.

## Riscos aceitos (ver `divida-conhecida.md`)
- **Duas abas na mesma obra:** a última gravação vence. Sem `navigator.storage.persist()`.
- **`indexOnOrBefore`** (`calendar.ts:119`): erra 1 dia antes da data-base. O formulário bloqueia os casos novos, mas ainda é alcançável pela data de status da EAP. A correção está no ciclo 00004.
- **`safeDiv`:** com BAC > 0 e PV = 0, o topo ainda mostra 1,00 (dívida antiga).

## Validação de outras áreas
- **Jurídico:** vários clientes no mesmo navegador (LGPD, controlador × operador).
- **Infraestrutura:** persistência definitiva (SPEC-01).
