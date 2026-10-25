---
issue: —
spec: SPEC-05 parte 1 (RF-05.1, RF-05.2 por tarefa, RF-05.3, RF-05.4, RF-05.5, RF-05.8); herdados do 00003 (H1–H4); CR-11/CR-12
branch: feat/00004-motor-minutos-calendarios
base: feat/00002-multiobra + merge de feat/00003-corpus-mspdi (616dad7)
faixa: 3 (T1, T2, T3, T4; T6 só renomeação)
ficha_ou_plano: .claude/ciclos/00004-motor-minutos-calendarios-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00004 — Motor em minutos, calendários, restrições, lag, progresso e divergências

## Resumo
- **O que é:** o motor do cronograma passa a trabalhar em minutos inteiros (ADR 00003). Ganha:
  - vários calendários por obra e calendário por tarefa;
  - as 8 restrições, sempre honradas, e prazo final;
  - lag em dias úteis, corridos e %, e duração corrida;
  - lógica retida × substituir progresso, mover o restante e restante exato;
  - MSPDI de ida e volta com calendários, `CalendarUID`, restrições, `Deadline`, todos os `LagFormat`, `Manual`/`Active` e Move*;
  - painel "Divergências com o MS Project" e edição de restrição, prazo e calendário na EAP.
- **Decidido:** o gate (P1 calendário da **sucessora**, conforme a Emenda 01 após a tarefa 0; P2 sempre honrar as restrições; P3 minuto inteiro) e a aceitação de que a edição de célula com 3.000 tarefas fica em ~850 ms, acima da meta de 500 ms (ver "Dívida aceita"). As duas decisões são do orquestrador, com a autorização do usuário, **sujeitas à revisão dele no PR**.
- **Números do Edifício Aurora:** entrega 2027-06-23, 16 d.u., SPI 0,8883, CPI 0,9349 — **iguais**. Mudanças de propósito na seção "Números que mudaram".
- **O que você precisa fazer:**
  - revisar no PR as decisões do gate e a mudança de suprimentos causada pelo restante exato;
  - levar à **Engenharia de planejamento** a conferência no MS Project real (M-5/M-6): lag entre calendários, `HonorConstraints`, folga de ALAP, `LinkLag` em % e início de tarefa corrida.
- **Estado:** aprovado pelos 4 validadores (rodada 02); rodada 03 fechou as ressalvas; auditoria independente abaixo.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-1 §3.4, ciclo 00004.

## Triagem
- **T1, T2:** `cpm.ts`, `calendarioTrabalho.ts`, `evm.ts`, `scenarios.ts`.
- **T3:** parser MSPDI.
- **T4:** esquema 2 → 3, com o `undo` de cada obra.
- **T6:** só a renomeação `durationDays` → `duracaoMin` em `fieldAi.ts`; o De-Para não muda.
- **T5:** endurecimentos contra arquivo externo, com teto, limites e avisos.
- **Faixa 3.** O `classificar-diff` confirma: T1–T4, T6; `especialista-obra` obrigatório.

## Tarefa 0
Feita pelo `especialista-obra`: `.claude/ciclos/00004-tarefa0-especialista.md`. Ela levou à Emenda 01:
- P1 passou a "calendário da sucessora";
- 11 correções nos casos e nas regras;
- H1–H4 herdados do 00003.

## Commits
| SHA | Conteúdo |
|---|---|
| d68a6f0 | Plano, parecer da tarefa 0 e ADR 00003 |
| 78d905e | E1: motor em minutos, calendários, calendário por tarefa, migração 2 → 3, CR-11, CR-12 (caracterização CR-1 verde antes e depois) |
| 2fd0195 | E2: restrições, prazo, lag corrido e %, opções de progresso, restante exato |
| 3ac4365 | E3: MSPDI de ida e volta (calendários, restrições, lag, `Manual`, Move*) |
| 68a9401 | E4: painel de divergências, edição na EAP, opções de cronograma, E2E |
| 875c518 | Rodada 02: teto de 50 anos sem derrubar a tela, P-1 a P-5, calendário inválido, manual, avisos de faixa, docs |
| 20e01fa | Rodada 03: data tardia do marco, prévias e ações com erro visível, `calcularObra` único, mensagem genérica de erro, datas do estado salvo validadas, hora do arquivo na tarefa manual |

## Rodadas
| Rodada | testes | arquiteto | especialista-obra | seguranca |
|---|---|---|---|---|
| 01 (68a9401) | APROVADO | REPROVADO: A1 teto derruba a tela; A2 calendário inválido salvo | REPROVADO: P-1 a P-4 (fórmulas) | REPROVADO: Alto (import deixa o app em branco) |
| 02 (875c518) | APROVADO | APROVADO (4 baixos) | APROVADO COM RESSALVAS (R-1 a R-3) | APROVADO (1 baixo) |
| 03 (20e01fa) | ressalvas da rodada 02 fechadas pelo dev; reavaliação pela auditoria | — | — | — |

### Matriz de verificação (HEAD 20e01fa)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| Lint / Tipos | eslint e vue-tsc | `npm run lint`, `npm run typecheck` | sim | PASS | limpos (dev, rodada 03; `testes`, rodada 02) |
| R-6 | Cobertura ≥ 80% nas 4 métricas | `npm run test:coverage` | sim | PASS | 442 testes, 8 pulados; `src/lib` 97,78% linhas e 91,53% ramos (rodada 03) |
| R-2 / P-5 | E2E: KPIs do Aurora, migração e troca de obra | `CI=1 npm run e2e` | sim | PASS | 17/17 (rodada 03; `testes` na rodada 02: `17 passed (1.7m)`) |
| AC-11 / M-4 | Corpus: 95/95 ida e volta, 83/104 e 100/104, avisos antes → depois | `CRONOAI_REF_DIR=… vitest run src/lib/msProjectXmlParser.corpus.test.ts` | sim | PASS | 419/419; inventário 134/95/39, 2.481 tarefas, 53 vínculos |
| AC-14 / R-5 | Motor: mediana < 500 ms com 3.000 folhas | `CRONOAI_PERF=1 vitest run src/lib/cpm.desempenho.test.ts` | sim | PASS | mediana 142 ms (`testes`, rodada 02), com restrições, lag corrido e % e tarefas iniciadas no gerador |
| D-ed | Edição de célula com 3.000 tarefas | mesmo arquivo, teste de `updateTask` | não | FAIL (aceito) | mediana ~850 ms (731 a 1.292); teto do teste 1.500 ms local e 5.000 ms no CI; dívida aceita pelo orquestrador |
| AC-1 / N-4 / CR-1 | Caracterização sem mudança no E1 | `cpm.caracterizacao.test.ts` + motor do base (cópia de 616dad7) | sim | PASS | 40/40 linhas iguais às do motor antigo (`testes`, rodada 01); arquivo sem alteração nas rodadas 02 e 03 |
| N-1..N-3, D-1..D-6 | KPIs e painel sem asserção alterada | diff dos testes | sim | PASS | `useProjectStore.test.ts`, `divergencias.test.ts` e E2E sem alteração nas rodadas 02 e 03 |
| CR-2..CR-12 | Casos do plano (com a Emenda 01) | `cpm.test.ts`, `calendarioTrabalho.test.ts`, `evm.test.ts`, parser | sim | PASS | conferidos célula a célula com o simulador independente do `especialista-obra` (rodadas 01 e 02) |
| P-1..P-4 (r01) | Fórmulas em caminhos não cobertos pelo plano | testes "C", "D", "E", "F" | sim | PASS | B 14/08 17:00; FF 19/08 17:00; FNLT −3 d; ALAP com sucessora Y 10–12/08 e Z 13–14/08 (`especialista-obra`, rodada 02) |
| J / R-1 | Data do marco (cedo, agendada e tardia) | testes "J" e rodada 03 | sim | PASS | SNET 12/08 → as 4 datas em 12/08, folga 0; SS+0 → 10/08 08:00 |
| M-1..M-3 / AC-10 | MSPDI ida e volta com `strictOrder`; export do seed só com o declarado | parser + diff do export normalizado | sim | PASS | export do seed igual ao da rodada 01 (`testes`, rodada 02: `diff` com 0 linhas); só horas e folgas exatas, 5 `Duration` de resumo e `SplitsInProgressTasks` |
| H | Tarefa manual: datas do arquivo (com hora) se não alterada | testes do parser | sim | PASS | 09:30–16:45 ida e volta; alterada exporta as calculadas com aviso |
| P-1..P-4 (migração) | 2 → 3 com `undo`; esquema 4 recusado; calendário inválido descartado; datas inválidas → ilegível | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim | PASS | N-4 conferido contra o JSON v1 (`duracaoMin`, lag e `baselineDuracaoMin` × 480) |
| A / S-2 | Teto de 50 anos sem derrubar a tela; import recusado antes de gravar | `useProjectStore.horizonte.test.ts` + sondas da `seguranca` | sim | PASS | sonda `StatusDate` 2070 + `PT24000H` recusada; obra salva quebrada abre com aviso, exporta e troca de obra (`seguranca`, rodada 02) |
| S-1, S-3, S-4 | Limites de entrada externa; avisos sem texto do arquivo; endurecimentos do 00003 | testes + sondas | sim | PASS | `Duration`/`MinutesPerDay` fora de faixa com aviso; calendário sem tempo útil rejeitado; DOCTYPE/ENTITY, 15 MiB, orçamento de dias e `Object.hasOwn` mantidos |
| S-5 | Sem dependência nova | `package.json` sem diff | sim | PASS | — |
| R-3 | Conversão de unidade num lugar só | `git grep 1440/480` | sim | PASS | só `calendarioTrabalho.ts` e o parser (constantes) |
| R04 | `as unknown as` justificado | `validar-regras` | sim | PASS | 1 alerta sem bloqueio em `migracaoEstado.ts:190`, fronteira de confiança comentada |
| V-1..V-4 | Validação visual | `npm run dev` | não | PASS (parcial) | orquestrador: EAP com colunas Restrição, Prazo final e Calendário; painel de divergências com estado vazio; console sem erros após recarregar (sobre 68a9401) |
| M-5 | `.xml` abre no MS Project real | manual | não | NOT_RUN | sem acesso |
| M-6 | Regras no MS Project real (P1, HonorConstraints, ALAP, LinkLag %, início de tarefa corrida) | manual | não | NOT_RUN | Engenharia de planejamento, antes do piloto |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | (pendente) | — |

## Números que mudaram de propósito (antes → depois)
| Caso | Antes | Depois |
|---|---|---|
| CR-9: restante exato no Aurora | 12 inícios da cadeia crítica um dia depois | 12 inícios recuam 1 dia; entrega 2027-06-23 09:36 (mesmo dia) |
| Suprimentos (efeito do CR-9) | concreto ok, DLP 31/10; bloco +25; porcelanato +24; aço DLP 19/10 | concreto **atenção** ("Emitir pedido em 7 dias"), DLP 30/10; bloco +24; porcelanato +21; aço DLP 18/10 |
| Export do seed | — | horas e folgas exatas, 5 `Duration` de resumo, `SplitsInProgressTasks`=1 |
| CR-11b: início depois da data de status | 2027-06-22 / 15 d.u. (erro do `indexOnOrBefore`) | 2027-06-23 / 16 d.u. |
| CR-12: LB0 só com término | sobrescrita pelo CPM | término do arquivo mantido |
| Corpus: avisos de duração, calendário próprio, lag ≠ dias úteis, "N h/dia" | 5, 4, 20, 1, 12, 2 | 0 (agora preservados); novos: 1.136 tarefas manuais em 38 arquivos, 3 durações com segundos |
| moverRestante=false com vínculo; FF/SF em iniciada; FNLT/MFO em iniciada; ALAP com sucessora; data do marco | ver P-1 a P-4 e J na matriz | conferidos pelo `especialista-obra` |

## Dívida aceita
- **Edição de célula com 3.000 tarefas:** ~850 ms. Cada edição faz três cálculos: previsão e linha de base na verificação, mais a previsão da tela. Ficar abaixo de 500 ms exige reaproveitar a verificação na tela ou cálculo incremental. Decisão: aceitar no protótipo; o cálculo vai para o servidor nos ciclos 00016/00017 (Fase 2).
- **Pendente no MS Project real (M-5/M-6):** P1 (regra da sucessora, fonte de terceiros), `HonorConstraints` = 0, folga de ALAP, `LinkLag` em % e início da tarefa corrida no próximo momento útil.
- **Herdado pelo 00005:** `feriadosNacionaisAplicados` e os feriados injetados no import; o gerador `feriadosPorAno`; o `undo` da hora extra com exceções.

## Validação de outras áreas
- **Engenharia de planejamento:** M-5 e M-6 antes do piloto.
- **Orçamento/Custos e Suprimentos:** a mudança de status do concreto (ok → atenção) pelo restante exato.
