---
issue: —
spec: SPEC-03 (RF-03.1, RF-03.2, RF-03.3, RF-03.4, RF-03.6; RF-03.5 só o modelo e a entrada manual; RNF-03.1; RNF-03.2 pelo gate P2)
branch: feat/00005-premissas-calendarios
base: feat/00004-motor-minutos-calendarios (PR empilhado enquanto o 00004 não entrar na master)
faixa: 3 (T1, T2, T3, T4)
ficha_ou_plano: .claude/ciclos/00005-premissas-calendarios-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00005 — Premissas por obra versionadas, calendários alternativos, feriados da obra e hora extra por frente

## Resumo
- **O que é:** as premissas viram dado da obra, com versão e origem. Contém:
  - premissas versionadas (indireto diário ou mensal, taxas por função com encargos, congestionamento, mobilização, adicional de HE, contingência, margem da DLP), com o selo "ilustrativa" nos padrões;
  - tela "Premissas da obra" e o rótulo da versão nos cenários e no EVM;
  - calendários alternativos com jornada por dia, exceções por data e sábado de 4 h, atribuídos uma a uma ou em lote;
  - feriados da obra: nacionais calculados (20/11 só desde 2024), Carnaval e Corpus Christi como opção, estaduais e municipais manuais com fonte;
  - import do MS Project **sem feriados injetados**, com "Aplicar feriados da obra" e prévia;
  - hora extra com meio período e frentes escolhidas, por calendário derivado;
  - migração do estado salvo do esquema 3 para o 4.
- **Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR:**
  - gate: P1 = (a), indireto diário, com o mensal convertido por mensal × 12 ÷ dias úteis do ano; P2 = (a), arredondamento bancário só na exibição; P3 = (a), o achado dos feriados entra neste ciclo (faixa 3);
  - emenda 01 do plano: regra P1 do 00004 (lag no calendário da sucessora), "todas as frentes" no calendário padrão, derivado só para frentes ativas, PR-15 e CS-5;
  - rodada 02: regra E-3 por ponto fixo; exportação recusada acima de 10.000 exceções; teto de 500 versões de premissas;
  - rodada 03: E-12, manter a cobrança pelo expediente inteiro, com alerta na memória; E-13, frentes avaliadas na hipótese máxima;
  - rodada 04: limite de 30 frentes escolhidas.
  - Todas: **decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR.**
- **Números do Edifício Aurora:** entrega 2027-06-23, 16 d.u., SPI 0,8883, CPI 0,9349 — **iguais**. PR-1 igual (crashing R$ 12.616,80; fast tracking R$ 25.350,00; HE R$ 22.315,20, 2 d.u., 2027-06-21). Exportação do seed idêntica à da base. As mudanças de propósito estão em "Números que mudaram".
- **O que você precisa fazer:**
  - revisar no PR as decisões acima e o desvio de desempenho do modo "frentes escolhidas" (R-21);
  - levar a **RH + Jurídico**, **Jurídico**, **Orçamento/Custos** e **Engenharia de planejamento** os itens da última seção.
- **Estado:** validadores aprovados na rodada 04 (4223154): `testes` APROVADO (609 testes; AC-6 891/643/641 ms), `arquiteto` APROVADO, `especialista-obra` e `seguranca` APROVADOS (confirmação curta da r04). Auditoria independente: A PREENCHER.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-1 §3.5, ciclo 00005.

## Triagem
- **T1:** `calendar.ts`, `feriadosObra.ts`, `calendarioTrabalho.ts` (gancho de feriados), calendários por tarefa e HE.
- **T2:** `premissas.ts`, `scenarios.ts`, `supplies.ts`, `format.ts`.
- **T3:** `parseMspdiXml` deixa de injetar feriados; avisos novos.
- **T4:** esquema 3 → 4 (`premissas`, `feriados`; `meta` sem `dailyIndirectCost`/`safetyMarginDays`).
- **T5 a T8:** não.
- **Faixa 3.** O `classificar-diff` confirma T1–T4; `especialista-obra` obrigatório. O `seguranca` validou por ser faixa 3.

## Commits
| SHA | Conteúdo |
|---|---|
| 8d49c5f | Plano, gate e emenda 01 (regra P1) |
| af4e8f0 | E1: premissas por obra versionadas nos cenários e na DLP; migração 3 → 4 |
| ded4aca | E2: tela de premissas com origem e versões |
| 892cab3 | E3: calendários alternativos, feriados da obra e import sem feriados injetados |
| a9b42b4 | E4: hora extra com meio período e frentes escolhidas; documentação |
| 833cb5f | Rodada 02: HE órfã, horas do sábado, limites, testes de migração e mais 16 itens |
| 2c3e8a3 | Rodada 03: frentes avaliadas com o sábado no calendário, ponto fixo até estabilizar, desfazer validado |
| 4223154 | Rodada 04: opções fora das premissas, limite de 30 frentes, desfazer e documentação |

## Rodadas
| Rodada | testes | arquiteto | especialista-obra | seguranca | auditoria |
|---|---|---|---|---|---|
| 01 (a9b42b4) | REPROVADO: P-2 FAIL, P-1 INCONCLUSIVE, M-3 NOT_RUN | REPROVADO: R-1 (calendário de HE órfão); R-2 a R-10 não bloqueiam | REPROVADO: E-1 (horas do sábado); E-2 a E-10 | APROVADO: 3 Baixos, 2 Info | — |
| 02 (833cb5f) | APROVADO: 589 testes; M-3 idêntico | APROVADO: R-11 a R-15 | REPROVADO: E-13 (primeiro sábado); E-12, E-14, E-15 | APROVADO: 1 Info (resíduo do `undo`) | — |
| 03 (2c3e8a3) | APROVADO: 603 testes; ressalva de desempenho | REPROVADO: R-16 (desempenho do `scenarioOptions`); R-17 a R-20 | APROVADO: admite o próprio erro de conta (R$ 1.040,40 contra R$ 2.080,80); O-1, O-2 | APROVADO: Info A, Info B | — |
| 04 (4223154) | APROVADO: 609 testes; AC-6 nas 3 execuções; defeito: asserção vazia do "não estabilizou" (corrigida no registro) | APROVADO: R-21, R-22 | APROVADO (confirmação): nenhum número mudou; ressalva de redação "8 h" (corrigida no registro); tarefa 0 não houve (desvio) | APROVADO (confirmação): Info A e Info B fechados | A PREENCHER |

### Testes, antes → depois
| Ponto | Vitest | E2E | Fonte |
|---|---|---|---|
| Base (branch do 00004) | 444 passaram, 8 pulados (registro do 00004, 255dca3) | 17 | registro do 00004; `dev-frontend` |
| E4 (a9b42b4) | 567 passaram, 9 pulados; 29 arquivos (1 pulado) | 26 | `dev-frontend`; `testes` r01 |
| Rodada 02 (833cb5f) | 589 (+22), 9 pulados | 28 | `dev-frontend`; `testes` r02 |
| Rodada 03 (2c3e8a3) | 603 (+14), 10 pulados (+1 teste local de desempenho) | 28 | `dev-frontend`; `testes` r03 |
| Rodada 04 (4223154) | 609 (+6), 12 pulados (+2 testes locais do pacote de 30 frentes) | 28 | `dev-frontend`; `testes` r04 (609 passaram, 12 pulados) |

Corpus local: 419/419 em todas as rodadas.

### Desempenho da mudança de premissa (3.000 tarefas, mediana local, `CRONOAI_PERF=1`)
| Ponto | Modo "todas" | Frentes escolhidas | Fonte |
|---|---|---|---|
| E4 (a9b42b4) | 854 ms (dev); 856 ms (`testes`) | não medido | r01 |
| Rodada 02 (833cb5f) | 664 ms (dev); 723 ms (`testes`) | não medido | r02 |
| Rodada 03 (2c3e8a3) | 697 ms (dev); 518 ms (`testes`), sem ler `scenarioOptions` | 3 frentes: 1.024 a 1.180 ms (dev); 1.041 ms (`testes`) | r03 |
| Antes do R-16 (2c3e8a3, lendo `scenarioOptions`) | 1.241 ms | 3 frentes: 1.069 ms; 30 frentes: 1.391 ms (4 sáb.), 1.667 ms (8 sáb.) | dev r04 |
| Rodada 04 (4223154) | 610 ms com a máquina livre; 902 a 1.017 ms com a CPU entre 80 e 100% | 3 frentes: 1.049 a 1.231 ms; 30 frentes: 995 a 1.320 ms (4 sáb.), 1.030 a 1.423 ms (8 sáb.); 2 voltas | dev r04 |

### Matriz de verificação (HEAD 4223154; linhas com a rodada da evidência)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-LINT / G-TIPOS | eslint e vue-tsc | `npm run lint`, `npm run typecheck` | sim | PASS | limpos (dev, 4223154); `testes` r03 (2c3e8a3): exit 0 |
| G-COV / R-4 | Suíte completa e cobertura ≥ 80% | `npm run test:coverage` | sim | PASS | dev, 4223154: 609 passaram, 12 pulados; 97,92 / 92,37 / 98,88 / 97,92. `testes` r03: 603 passaram, 10 pulados; 97,92 / 92,26 / 98,88 / 97,92 |
| G-E2E / R-5 / P-7 | E2E e KPIs do Aurora | `CI=1 npm run e2e` | sim | PASS | dev, 4223154: 28 passaram. `testes` r03: `28 passed (1.5m)`, porta 4173 livre |
| G-BUILD | Build de produção | `npm run build` | sim | PASS | dev, 4223154; `testes` r03: exit 0 |
| G-REGRAS / R-2 | `validar-regras`; `src/lib` puro | `validar-regras --commits` + revisão | sim | PASS | 66 arquivos, 0 bloqueia, 0 alerta (dev 4223154; `testes` r03). `arquiteto` r01–r04: `src/lib` sem store, DOM ou `localStorage` |
| R04-T | Matriz do `testes` sobre a rodada 04 | `testes` sobre 4223154 | sim | PASS | lint, tipos, `test:coverage` (609 passaram, 12 pulados; 97,92/92,37/98,88/97,92), `CI=1 npm run e2e` (28 passed), build, corpus 419/419, `classificar-diff` e `validar-regras` (66 arquivos, 0 bloqueia); R-16 por identidade, limite de 30 frentes, undo com `result` nulo, título e nota no E2E; nenhum teste antigo com número trocado |
| AC-1 / N-1 a N-4 | PR-1 e Aurora sem mudar número | `scenarios.caracterizacao.test.ts`, `useProjectStore.test.ts` | sim | PASS | 12.616,80; 29.550; 2027-06-18; 25.350; 128.050; 22.315,20; 64; +2.615,20; DLP 2026-10-30; PV 7.259.250; SPI 0,8883; CPI 0,9349; 2027-06-23 (`testes` r01–r03). "Verde antes de mexer" não verificável (ver Pendências) |
| AC-2 / PR-2 | Indireto R$ 12.000 | `scenarios.test.ts`, `useProjectStore.test.ts` | sim | PASS | 36.000; 156.000; 24.000; saldo −1.684,80; risco Médio → Baixo (`testes` r01) |
| AC-3 / PR-3, PR-5, PR-6 | Indireto mensal, taxa sem encargos, função não cadastrada | `premissas.test.ts`, `scenarios.test.ts` | sim | PASS | 249 d.u. → 12.000; 252 → 11.857,142857 (exibido R$ 11.857,14); 31,40 → 12.616,80; 30 e 35 (`testes` r01; `especialista-obra` r01) |
| AC-4 / PR-4 | Versões e rótulo | `premissas.test.ts`, `useProjectStore.test.ts`, E2E | sim | PASS | "Premissas v3 — vigência 01/11/2026"; v4 retroativa recusada com a mensagem literal (`testes` r01) |
| AC-5 / P-1 | Esquema 3 real → 4, desfazer até o PR-1 | `migracaoEstado.test.ts:391`, `useProjectStore.obras.test.ts:159` | sim | PASS | registro real com 52 exceções, sem a marca, 3 cenários aplicados; entrega 2027-06-02; desfeitos → ['2027-06-23', 16], SPI 0,8883, CPI 0,9349 (`testes` r02). Na r01: INCONCLUSIVE |
| AC-5 / P-2 | Indireto 11.000, margem 7, DLP igual | `useProjectStore.obras.test.ts:189` | sim | PASS | ['2026-11-03', '2026-10-24', 'atencao'], igual a `analyzeSupplies(…, 7)` (`testes` r02). Na r01: FAIL |
| AC-5 / P-3 a P-6 | Cadeia v1 → 4; esquema 5 recusado; esquema 4 sem premissas; HE do 00004 desfeita | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim | PASS | P-4: "Obra salva por uma versão mais nova do CronoAI (esquema 5)."; P-6: 2027-06-21 → 2027-06-23 (`testes` r01, r02) |
| AC-6 | Mudança de premissa < 1 s, modo padrão "todas" (RNF-03.1) | `premissas.desempenho.test.ts` lendo `scenarios`, `supplies` e `scenarioOptions`, 3 execuções | sim | PASS | `testes` r04, 4223154: medianas 891, 643 e 641 ms (séries `793, 883, 891, 896, 974`; `593, 605, 643, 661, 674`; `527, 607, 641, 652, 657`), com 3 processos `dotnet.exe` ativos; CPM de referência 202–219 ms. O dev mediu 610 ms livre e 902–1.017 ms com a CPU entre 80 e 100% (2 de 5 acima de 1 s) |
| AC-6-F | Mudança de premissa < 1 s, modo "frentes escolhidas" | mesmo arquivo, testes locais de 3 e 30 frentes | não | INCONCLUSIVE (desvio registrado) | `testes` r04: 3 frentes 735/938/817 ms; 30 frentes com 4 sábados 834/877/980 ms; com 8 sábados 800/729/837 ms (todas abaixo de 1 s, margem pequena). Dev r04, sob carga: 1.049 a 1.423 ms. Desvio do plano e dívida R-21 no `CLAUDE.md` e em `divida-conhecida.md`, para o usuário decidir no PR |
| R-16 | Mudar premissa não recalcula `scenarioOptions` | `premissas.desempenho.test.ts:108` | sim | PASS | identidade do objeto: premissa → mesmo `scenarioOptions`, `scenarios` novo; agenda → `scenarioOptions` novo (dev r04; `arquiteto` r04) |
| AC-7 / R-3 | Tela, selo "ilustrativa", margem da DLP só leitura | E2E `premissas.spec.ts`, `premissas.test.ts`, V-1 | sim | PASS | E2E verde; memória "Ilustrativas, sem validação: …" (`testes` r01) |
| AC-8 / CF-1 a CF-6 | Feriados da obra | `calendar.test.ts`, `feriadosObra.test.ts`, `useProjectStore.test.ts` | sim | PASS | CF-1: ['2027-06-23', 16], 52 exceções 2026–2029. CF-2: 2027-06-21, 14 (701 em 2027-03-12 → 2027-03-10, D5). CF-3: 2027-06-22, 15. CF-4: 2027-06-18, 13. CF-5: 2023-11-24. CF-6: 2026-08-24 / 2026-08-21 (`testes` r01, r02) |
| AC-9 / CS-1 a CS-5 | Calendários e sábado de 4 h | `calendarioTrabalho.test.ts`, `useProjectStore.test.ts` | sim | PASS | 2026-08-17 17:00; 2026-08-18 12:00; 2026-08-07 11:00; lote [2,2,2]; 1.440 e 120 min; 6 intervalos recusados (`testes` r01) |
| AC-10 / CF-7 | Import sem feriados e aplicar com prévia | `divergencias.test.ts`, `useProjectStore.test.ts`, parser, E2E `calendarios.spec.ts` | sim | PASS | sem injeção: D-4 −5, D-6 −5, D-5 +1; depois de aplicar: D-2 +1, D-3 +1, D-4 −4, D-5 +1, D-6 −4 (`testes` r01) |
| AC-11 / CF-8 | Troca de UF | `previaImpacto.test.ts`, `useProjectStore.test.ts` | sim | PASS | 2026-07-13 → 2026-07-10; "manter" não muda (`testes` r01) |
| AC-12 / PR-7 a PR-15 | HE com meio período e frentes | `scenarios.test.ts`, `cpm.test.ts` | sim | PASS | PR-7 2 d.u., 22.315,20; PR-8 4.161,60, 2027-06-21; PR-9 18.153,60, 0 d.u.; PR-10 11.157,60, 1 d.u.; PR-11 2.080,80; PR-12 e PR-14 mensagens literais; PR-15 26/10 08:00, 26/10 13:00, 27/10 08:00 (`testes` r01; `especialista-obra` r03: inalterados) |
| AC-13 / PR-13 | Desfazer a HE por frente | `useProjectStore.test.ts`, E2E | sim | PASS | uid 2 removido; 2027-06-21 → 2027-06-23; `recoveryCosts` [] (`testes` r01) |
| AC-14 | Docs | revisão | sim | PASS | `CLAUDE.md`, `calculo-precisao.md` (Calendário, Cenários com a hipótese máxima), `divida-conhecida.md`, `msproject-mspdi.md` (avisos novos) (`arquiteto` r02–r04). Linhas de dívida do R-21: rascunho, sem commit |
| B2 | Custo da HE com as horas do sábado agendado | `scenarios.test.ts:196` e o seguinte | sim | PASS | mpd 450 → 22.315,20 (antes 20.920,50); 9 h → 28.615,95, 73 profissionais-dia (`testes` r02; `especialista-obra` r02) |
| E-13 | Frentes na hipótese máxima | `scenarios.test.ts` (describe E-13) | sim | PASS | [104], 1 sábado: 2.080,80, 1 d.u., 6; [302]: 9.076,80, 0 d.u.; `overtimeTargets(ctx, 1)` = [104, 302] (`testes` r03; `especialista-obra` r03) |
| E-14 | Ponto fixo até estabilizar | `scenarios.test.ts` (cadeia de 3 frentes) | sim | PASS | 3 voltas; só a T4 convocada; 376,80 (`testes` r03; conta à mão do `especialista-obra` r03) |
| E-12 | Memória com minutos e alerta de convocação | teste B2 de 9 h | sim | PASS | 3 linhas literais e o alerta de RH uma vez (`testes` r03) |
| R-18 | Limite de 30 frentes | `scenarios.test.ts:498`, `premissas.desempenho.test.ts:195` | sim | PASS | 30 aceito, 31 recusado, repetidas contam uma vez; pacote de 30 com 2 voltas (dev r04; `arquiteto` r04) |
| UNDO | Desfazer com registro adulterado recusa sem alterar nada | `useProjectStore.test.ts` (`it.each`) | sim | PASS | 7 casos na r03 (`testes` r03); caso `result` nulo na r04 (dev; `arquiteto` r04) |
| N-8 | Itens "a confirmar" conferidos pelo `especialista-obra` | revisão r01 | sim | PASS | 20/11, Sexta-feira Santa, Carnaval e Corpus (E-7); divisor do indireto (E-6); arredondamento (E-8); PR conferidos à mão. Sem parecer separado da tarefa 0 (ver Desvios) |
| M-1 | Ida e volta do seed com `strictOrder` | `core.test.ts` | sim | PASS | verde na suíte (`testes` r01) |
| M-2 | Ida e volta com calendário alternativo, feriado manual e derivado | `msProjectXmlParser.test.ts:961-1020` | sim | PASS | `errors` = []; `CalendarUID` [2,3,undefined]; datas iguais na reimportação (`testes` r01) |
| M-3 | Exportação do seed idêntica à da base | `exportXml()` em c04 (f252517) e c05; `cmp` com `CreationDate`/`LastSaved` normalizados | sim | PASS | 79.706 bytes, 30 tarefas, 24 vínculos, `IDENTICOS` em 833cb5f (`testes` r02) e 2c3e8a3 (`testes` r03). Na r01: NOT_RUN |
| M-4 / AC-10 | Corpus local | `CRONOAI_REF_DIR=… vitest run msProjectXmlParser.corpus.test.ts` | sim | PASS | 419/419; 95/95 ida e volta; 100/104 datas iguais (antes 83/104) (`testes` r01–r03) |
| M-5 | `.xml` abre no MS Project real | manual | não | NOT_RUN | sem acesso |
| R-1 | Sem premissa fixa em `scenarios.ts`/`supplies.ts` | `git grep -nE "1\.05\|1200\|0\.5\|0\.04\|\?\? 30"` | sim | PASS | `rc=1` (`testes` r01) |
| S-1 a S-5 | Textos, limites, parser, números, dependências | testes + revisão | sim | PASS | `seguranca` r01–r03 APROVADO; parser só perdeu a injeção e trocou avisos; sem `v-html`; sem dependência nova |
| V-1 | Tela de premissas | `npm run dev` (:5182) | não | PASS | orquestrador, a9b42b4: abas, selo "Premissas v1 — vigência 04/05/2026" e "Ilustrativa"; console sem erros. Coluna "Origem" cortada a 800 px → corrigida em 833cb5f |
| V-2 | Rótulo da versão nos cenários | `npm run dev` | não | PASS | orquestrador, a9b42b4: rótulo em cada cartão e no texto do indireto |
| V-3 | Editor de calendários e feriados | `npm run dev` | não | PASS | orquestrador, a9b42b4: jornada, cópia, "Aplica os feriados da obra", cadastro manual com fonte |
| V-4 | HE com frentes e meio período | `npm run dev` | não | PASS | orquestrador, a9b42b4: PR-1 na tela; meio período {104}: −1 d.u., R$ 2.081, 22/06/27. "Risco Baixo" sem frente → "Risco —" em 833cb5f |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | A PREENCHER | A PREENCHER |

## Números que mudaram de propósito (antes → depois)
Todos fixados em teste, com o antes → depois no próprio teste (Inviolável 1). Tabelas dos relatórios do `dev-frontend`.

**E1 a E4 (base → a9b42b4)**
| O quê | Antes | Depois |
|---|---|---|
| Corpus: datas das folhas iguais ao arquivo (8 arquivos com vínculos) | 83 de 104 (feriados nacionais injetados) | 100 de 104 (calendário do arquivo como está) |
| Corpus: `task-links-project2016` / `project2019` | 0 de 16 / 15 de 16 | 16 de 16 / 16 de 16 |
| Corpus: aviso "aplicados os feriados nacionais brasileiros" / aviso novo "não traz feriados" | 95 arquivos / 0 | 0 / 95 arquivos |
| Import sem feriados: D-2 e D-3 do painel | +1 d.u. cada | iguais ao arquivo (saem do painel) |
| Import sem feriados: D-4 e D-6 | −4 d.u. | −5 d.u. |
| D-5 (T1 com 6 d) | termina 08/09 | termina 07/09 (+1 d.u. igual) |
| Painel depois de importar | lista [2, 3, 4, 5] | [4, 5]; depois de "Aplicar feriados da obra", volta a [2, 3, 4, 5] com a causa "Feriados da obra aplicados ao calendário importado." |
| Calendário do projeto ausente ou rejeitado no import | seg–sex com 5 anos de feriados nacionais | seg–sex sem feriados, com aviso |
| `brazilianHolidays(2023)` / `feriadosNacionais(< 2024)` | 13 datas, com 20/11 | 12 datas (20/11 só desde 2024; nada muda de 2026 em diante) |
| CF-5: tarefa de 5 d desde 20/11/2023 | termina 2023-11-27 | 2023-11-24 |
| `estadoObraVazia`: calendário | exceções fixas de 4 anos | `aplicaFeriadosObra: true`, feriados gerados por ano (também depois de 2029) |
| `meta.dailyIndirectCost` / `safetyMarginDays` | no `meta` | em `premissas[0]` |
| Esquema do estado | 3 | 4 |
| Cenários com as premissas padrão | números da base | idênticos (PR-1) |

**Rodada 02 (a9b42b4 → 833cb5f)**
| Caso | Antes | Depois |
|---|---|---|
| B2: HE, sábado inteiro, `minutosPorDia` 450 e sábado agendado de 8 h | R$ 20.920,50 (929,80 × 7,5 h × 1,5 × 2); resumo "7,5 h" | R$ 22.315,20; resumo "8 h" |
| B2: calendário seg–qui de 9 h, sexta de 4 h | custo com 8 h: R$ 25.436,40 | 9 h: R$ 28.615,95; 73 profissionais-dia; resumo "9 h" |
| Memória do modo "todas" com tarefa de calendário próprio | frase genérica | lista as ativas deixadas de fora, com ● nas críticas; `daysRecovered` 0, entrega 2027-06-23, R$ 18.153,60 fixados |
| Aviso de calendário rejeitado no import | "…as tarefas usam o calendário do projeto." | "…as tarefas deles passam ao calendário padrão da obra." |
| Aviso de calendário do projeto ausente ou rejeitado | "O calendário do arquivo não traz feriados…" | "O calendário do projeto não veio no arquivo (ou foi rejeitado): o CronoAI usou seg–sex 08:00–12:00 e 13:00–17:00 sem feriados, como o Standard do MS Project. Confira as datas." |
| Título do aviso de exportação recusada | "XML não exportado: falhou na validação MSPDI" | "XML não exportado" (cobre também o excesso de exceções) |

**Rodada 03 (833cb5f → 2c3e8a3), status sex 23/10, Aurora**
| Caso | Antes | Depois |
|---|---|---|
| `{ saturdays: 1, frentes: [104] }` | não aplicável | aplicável, 1 d.u., R$ 2.080,80, 6 profissionais-dia |
| `{ saturdays: 1, frentes: [302] }` | não aplicável | aplicável, 0 d.u., R$ 9.076,80 |
| `overtimeTargets(ctx, 1)` | [] | [104, 302] |
| Frente que só trabalha de seg a sex na semana seguinte | não oferecida | oferecida; 1 d.u.; R$ 376,80 (ver divergência abaixo) |
| Aviso de calendários acima do limite no import | "…usam o calendário do projeto" | "…as tarefas deles passam ao calendário padrão da obra." |
| `ScenarioResult.horaExtra` no modo "todas" | sem `voltas` | `voltas: 0` |

**Rodada 04:** nenhum número de cálculo mudou. Entrou a recusa acima de 30 frentes ("Escolha no máximo 30 frentes para a hora extra.").

## Desvios do plano

- **Tarefa 0 do `especialista-obra` não feita antes da implementação** (o plano manda gate → tarefa 0 → tarefa 1). Os quatro itens da seção 10 (status legal dos feriados, regras de HE, números, arredondamento) foram cobertos na revisão r01 dele, depois da implementação; os achados viraram correções nas rodadas 02 a 04, sem número perdido. Registrado como desvio de processo.
Avaliação do `arquiteto` r01 para D1 a D13; os demais vêm das rodadas 02 a 04.

| # | Desvio | Avaliação |
|---|---|---|
| D1 | Edições mínimas de `SupplyModule.vue`, `SinapiModule.vue` e `CriticalPathModule.vue` no E1, e não no E2, para o E1 compilar | Aceitável: é o mínimo depois de remover `setSafetyMargin`, `dailyIndirectCost` e `rateOf(recurso)` |
| D2 | Motivo da v1 migrada: "Premissas salvas antes do versionamento (migradas)", e não "anteriores ao ciclo 00005" | Aceitável: só texto, sem jargão de processo na tela |
| D3 | `compilarCalendarios` sem gerador aplica a configuração padrão de feriados ao calendário com `aplicaFeriadosObra` | Aceitável com registro. Exigiu o R-2: comentários, regra em `calculo-precisao.md` e teste (833cb5f) |
| D4 | Calendário do projeto ausente ou rejeitado também fica sem feriados | Aceitável com registro. O `especialista-obra` confirma para o ausente (Standard do MS Project); a mensagem do rejeitado foi corrigida no E-4 (833cb5f) |
| D5 | CF-2: o 701 começa em 2027-03-12 09:36 → 2027-03-10 09:36, e não 2027-03-15 → 2027-03-11 (o plano mediu antes do restante exato do 00004) | Aceitável com registro. Mesmo delta de 2 d.u.; entrega 2027-06-21 e atraso 14 iguais ao plano. O plano não foi emendado |
| D6 | `estadoObraVazia(d)` sem o parâmetro de indireto | Aceitável: o 9.850 vem de `premissasPadrao()` |
| D7 | `jornada` e `frentes` opcionais em `ScenarioParams.overtime` | Aceitável com registro: ausente = `'integral'`/`'todas'`; o tipo não é persistido |
| D8 | Regras de cobrança da HE (só o calendário padrão no modo "todas"; custo só com minuto útil cruzado) | Aceitável com registro. Depende de RH/Jurídico. As horas foram corrigidas no B2 e o critério de "ativa" mudou no E-3 e no E-13 |
| D9 | Linha "Economia de indireto" na memória do fast tracking | Aceitável com registro: só memória |
| D10 | `toRaw` no `scenarioCtx` (3,9 s → 0,77 a 0,85 s) | Aceitável com registro mais o teste-guarda do R-3 (833cb5f). Na rodada 04, `scenarioAgenda` separou as opções das premissas |
| D11 | Testes antigos atualizados com antes → depois | Aceitável: divergências, E2E de cronograma e migração explicados em comentário |
| D12 | API da store (`removerExcecao`, `editarCalendario`, `PreviaTrocaLocal`, opção em `atualizarDadosObra`) | Aceitável com registro; ver R-1 sobre o calendário de HE |
| D13 | `Math.round` de `applyScenario` mantido (R$ 4.161,60 → R$ 4.162) | Aceitável: é o gate P2 = (a) e o fora do escopo; dívida registrada |
| R-21 | Desempenho do modo "frentes escolhidas" acima de 1 s. A tarefa 8 e a seção 14 mandavam separar agenda de custo antes de aceitar | Feito só em parte (R-16: opções sem premissas). O ponto fixo e a reprogramação de `simulateOvertime` continuam junto do custo. Registrado como dívida no `CLAUDE.md` e em `divida-conhecida.md`; o usuário decide no PR |
| R-17 | E-13 muda a regra do plano: a entrada das frentes passa a ser a hipótese máxima (todos os sábados candidatos no calendário), e não "ativas no cronograma atual (antes da HE)" | Aceito pelo `arquiteto` r04. PR-7 a PR-15 inalterados. O `especialista-obra` reconfirmou na r03. `calculo-precisao.md › Cenários` atualizado (4223154). Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Derivado | "Um derivado por base e conjunto de sábados", em vez de "um por calendário base" (efeito do E-3) | Aceitável com registro (`arquiteto` r02). O sábado feriado no calendário da frente também deixou de ser convocado (E-9). Números PR-8 a PR-15 inalterados |
| Tarefa 0 | Não localizei parecer separado da tarefa 0 do `especialista-obra` para este ciclo. Os itens (i) a (iv) aparecem na revisão r01 dele (E-6, E-7, E-8 e PR conferidos à mão) | A confirmar pelo orquestrador |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| arquiteto r01 R-1 (bloqueante) | Calendário de HE atribuído à mão fica órfão depois do desfazer; MSPDI com `CalendarUID` solto | corrigido (833cb5f): recusa em `atribuirCalendario` e `definirCalendarioTarefa`, fora das listas da EAP; desfazer devolve órfãs ao padrão com log; testes |
| arquiteto r01 R-2 / especialista r01 E-5 | Comentários contradizem o D3; `sabadosConvocados` sem feriados | corrigido (833cb5f): comentários, `feriadosEfetivos`, regra em `calculo-precisao.md`, teste |
| arquiteto r01 R-3 | `toRaw` depende do clone do `calculo` | corrigido (833cb5f): teste-guarda que edita recursos e BAC |
| arquiteto r01 R-4 | `CalendariosEditor.vue` com 4 responsabilidades | corrigido (833cb5f): `JornadaSemana.vue`, `ExcecoesCalendario.vue`, `horasDoDiaTexto` |
| arquiteto r01 R-5 | Margem da DLP sem link para as premissas | corrigido (833cb5f): "Alterar nas premissas" |
| arquiteto r01 R-6 | Data montada à mão em `ObrasModule.vue` | corrigido (833cb5f): `fmtDate` |
| arquiteto r01 R-7 | Nome do derivado não é checado | corrigido (833cb5f): sufixo "(2)" até 60 caracteres; nome completo no teste (2c3e8a3) |
| arquiteto r01 R-8 | Desfazer sobrescreve atribuição posterior sem avisar | corrigido (833cb5f): aviso no log |
| arquiteto r01 R-9 | Calendários compilados várias vezes por simulação | registrado (info); o desempenho seguiu no R-12, R-16 e R-21 |
| arquiteto r01 R-10 | P-1 com estado sintético | corrigido (833cb5f): registro real do esquema 3 |
| arquiteto r02 R-11 / especialista r02 E-14 | Teto de 4 voltas sem verificação final | corrigido (2c3e8a3): repete até estabilizar, teto = pares + 1, teste com 3 voltas |
| arquiteto r02 R-12 | RNF-03.1 não medido com frentes escolhidas | medido (2c3e8a3 e 4223154); parte resolvida pelo R-16; restante registrado (R-21) |
| arquiteto r02 R-13 | `msproject-mspdi.md` e aviso de limite desatualizados | corrigido (2c3e8a3) |
| arquiteto r02 R-14 | Mudança de número do B2 fora do ciclo | registrado neste registro ("Números que mudaram") |
| arquiteto r02 R-15 / especialista r02 E-15 | Asserção circular; teste fraco de versões; rascunho de exceção não limpo | corrigido (2c3e8a3) |
| arquiteto r03 R-16 (bloqueante) | `scenarioOptions` recalculado a cada mudança de premissa; AC-6 sem ler a tela | corrigido (4223154): `scenarioAgenda` sem premissas, teste por identidade, medição com `scenarioOptions` |
| arquiteto r03 R-17 | E-13 muda a regra do plano | registrado em "Desvios"; `calculo-precisao.md` (4223154); reconfirmado pelo `especialista-obra` r03 |
| arquiteto r03 R-18 / seguranca r03 Info B | Ponto fixo sem teto prático com pacote inteiro | corrigido (4223154): limite de 30 frentes na lib e na tela (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); medição com 30 frentes |
| arquiteto r03 R-19 | Mensagem "não estabilizou" inalcançável e imprecisa | corrigido (4223154) |
| arquiteto r03 R-20 | Memória do E-12 coerente com o plano | registrado (info) |
| arquiteto r04 R-21 | Desempenho do modo "frentes escolhidas" acima do RNF-03.1 | registrado: desvio neste registro e linhas de dívida no `CLAUDE.md` e em `divida-conhecida.md` (rascunho, sem commit); decisão do usuário no PR |
| arquiteto r04 R-22 | Obra sintética do AC-6 perto do horizonte de 50 anos | pendência registrada |
| especialista r01 E-1 (bloqueante) | Sábado do cronograma e sábado cobrado com horas diferentes | corrigido (833cb5f, B2): minutos úteis do sábado ÷ 60; antes → depois acima |
| especialista r01 E-2 | "Todas" pode custar sem ganhar sem o usuário perceber | corrigido (833cb5f): rótulo, memória com as frentes de fora, `daysRecovered` fixado |
| especialista r01 E-3 | Filtro de "ativa" por tarefa e não por dia | corrigido (833cb5f) por ponto fixo (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| especialista r01 E-4 | Aviso falso com calendário rejeitado | corrigido (833cb5f) |
| especialista r01 E-6 | Divisor do indireto: ano da vigência e divisor congelado; sábado de 4 h como dia inteiro | pendência de área (Orçamento/Custos) |
| especialista r01 E-7 | Sexta-feira Santa municipal pela Lei 9.093/1995 | pendência de área (Jurídico) |
| especialista r01 E-8 | Cartões em R$ inteiro; `Math.round` em `applyScenario` | registrado (D13) e pendência de área (Orçamento/Custos) |
| especialista r01 E-9 | Sábado feriado no calendário da frente vira HE a 50% | corrigido (833cb5f): fora do derivado e não cobrado, com aviso; pendência de área (RH + Jurídico) |
| especialista r01 E-10 | CLT, convenção coletiva, DSR, convocação | pendência de área (RH + Jurídico; Orçamento/Custos para os encargos) |
| especialista r02 E-13 (bloqueante) | Filtro de entrada nunca vê o primeiro sábado com status na sexta | corrigido (2c3e8a3): hipótese máxima (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| especialista r02 E-12 | Equipe inteira cobrada por 9 h para 24 min de trabalho | corrigido em parte (2c3e8a3): minutos na memória e alerta; regra do expediente inteiro mantida (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); pendência de área (RH; Engenharia de planejamento) |
| especialista r03 | R$ 1.040,40 indicado na r02 estava errado (é a conta de 4 h); o certo é R$ 2.080,80 | registrado; o teste fixa 2.080,80 |
| especialista r03 O-1 | Ponto fixo coerente, mas conservador | registrado em `calculo-precisao.md` (4223154); pendência de área (Engenharia de planejamento) |
| especialista r03 O-2 | Lista de frentes da tela é limite superior | corrigido (4223154): título "Frentes que podem trabalhar nos sábados" e nota, no E2E |
| testes r01 P-2 | Teste "DLP igual" ausente | corrigido (833cb5f, B3) |
| testes r01 P-1 | Sem cenários aplicados nem PR-1 | corrigido (833cb5f, B4) |
| testes r01 M-3 | Exportação do seed sem diff | executado no `testes` r02 e r03: `IDENTICOS` |
| testes r01 | Lista D1 a D13 não recebida | registrado neste registro |
| testes r01 / r02 | Caracterização "verde antes de mexer" não verificável | pendência registrada |
| testes r01 | Comentário confuso em `previaImpacto.test.ts` (CF-8) | pendência registrada (asserções exatas) |
| testes r01 | PR-13 afirma `recoveryCosts` [4162] | registrado (D13) |
| testes r01 | "7 → 8 módulos" sem comentário | corrigido (833cb5f) |
| testes r02 | Regex `SEM_FERIADOS` do corpus aceita duas mensagens | registrado: a contagem 100/104 continua afirmada |
| testes r02 | Nome do derivado não fixado inteiro | corrigido (2c3e8a3) |
| testes r02 | D1, D3, D4, D7, D8, D9, D10, D12 sem conferência teste a teste | registrado |
| testes r03 | Modo "frentes escolhidas" com mediana 1.041 ms; teto de 5.000 ms | relatório imprime "ACIMA/dentro" (4223154); teto informativo mantido; desempenho registrado (R-21) |
| testes r03 | Asserção do 25.436,40 removida sem antes → depois | registrado: era conta derivada do próprio resultado; 28.615,95 e '73' seguem afirmados |
| seguranca r01 #1 (Baixo) | Feriados manuais do estado salvo sem validação | corrigido (833cb5f): `sanearConfigFeriados` |
| seguranca r01 #2 (Baixo) | HE fura o limite de 100 calendários | corrigido (833cb5f) |
| seguranca r01 #3 (Baixo) | Exportação sem teto de exceções | corrigido (833cb5f): recusa acima de 10.000 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| seguranca r01 #4 (Info) | Versões sem teto; motivo sem limite na leitura | corrigido (833cb5f): teto de 500 versões (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR); motivo ≤ 200 na leitura |
| seguranca r01 #5 (Info) | `undo` salvo sem validação | corrigido (833cb5f); resíduo na r02 |
| seguranca r02 (Info) | `undo` sem validação de forma (desfazer pela metade) | corrigido (2c3e8a3): `erroDoRegistroDeDesfazer`, 7 casos |
| seguranca r03 Info A | `result: null` passa na validação | corrigido (4223154) |
| verificação visual r01 | Coluna "Origem" cortada a 800 px; "Risco Baixo" sem frente | corrigido (833cb5f); conferido pelo orquestrador na r02 |
| testes r04 | Asserção `includes('não estabilizou')` ficou vazia depois da troca do texto do aviso (r04) | corrigido no commit do registro: procura "sem estabilizar" (`scenarios.test.ts:494`, 42/42 verdes) |
| especialista-obra r04 | Redação "8 h no dia inteiro do calendário" na regra e no comentário de `simulateOvertime`: vale o expediente do dia útil do calendário da frente | corrigido no commit do registro (`calculo-precisao.md:54`, `scenarios.ts:592`) |
| especialista-obra r04 | Não houve tarefa 0 separada; a r01 cobre os 4 itens a posteriori | desvio de processo registrado (ver "Desvios do plano") |
| auditoria | A PREENCHER | A PREENCHER |

## Pendências registradas
- **Rodada 04:** `especialista-obra` e `seguranca` confirmaram depois (APROVADO); nenhum número de cálculo mudou.
- **AC-6 no modo "todas":** repetir em máquina livre (2 de 5 execuções passaram de 1.000 ms com a CPU entre 80 e 100%).
- **R-21:** modo "frentes escolhidas" acima de 1 s; decisão do usuário no PR.
- **R-22:** encurtar a obra sintética do AC-6 para ficar folgada no horizonte.
- **Caracterização (PR-1):** "verde antes de mexer" não verificável; o arquivo nasceu no ciclo.
- **Comentário do CF-8** em `previaImpacto.test.ts`: texto confuso, asserções exatas.
- **D13 / E-8:** `Math.round` em `applyScenario` e cartões em R$ inteiro.
- **E-6:** divisor do indireto usa o ano da vigência (2027 tem 251 d.u.: R$ 11.904,38/dia) e fica congelado na versão.
- **O-1:** resultado do ponto fixo pode ser conservador.
- **M-5:** `NOT_RUN`.
- **Antes do PR:** commitar este registro e as duas linhas de dívida. PR empilhado em `feat/00004-motor-minutos-calendarios` se o 00004 não tiver entrado na `master`.

## Validação de outras áreas (não substitui o parecer delas)
- **RH + Jurídico:**
  - adicional de HE de 50% (padrão ilustrativo); sábado dentro das 44 h; limite de 2 h extras por dia; DSR;
  - convocação da equipe inteira pelo expediente inteiro (E-12), inclusive o limiar "menos da metade" da memória, que é heurística;
  - trabalho em feriado (E-9), com regra própria.
  - Fontes: [CF, art. 7º, XIII e XVI](https://www.planalto.gov.br/ccivil_03/constituicao/constituicao.htm); [CLT, arts. 58 e 59](https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm); [Lei 605/1949](https://www.planalto.gov.br/ccivil_03/leis/l0605.htm), art. 9º; Súmulas 146 e 172 do TST.
- **Jurídico:**
  - Sexta-feira Santa: a [Lei 9.093/1995](https://www.planalto.gov.br/ccivil_03/leis/l9093.htm), art. 2º, a põe entre os feriados religiosos municipais; o CronoAI a trata como nacional;
  - 20/11 nacional desde a [Lei 14.759/2023](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14759.htm);
  - Carnaval e Corpus Christi como ponto facultativo, ligados por padrão.
- **Orçamento/Custos:**
  - indireto mensal → diário (P1 = a: mensal × 12 ÷ dias úteis do ano da vigência; E-6);
  - encargos: taxa com ou sem encargos, encargos sobre a HE;
  - arredondamento: bancário só na exibição (P2 = a; ABNT NBR 5891 a confirmar), `Math.round` de `applyScenario` (D13/E-8);
  - mobilização, contingência e perda por congestionamento (padrões ilustrativos).
- **Engenharia de planejamento:**
  - lag contado no calendário da sucessora (P1 do 00004), base do PR-15 e do ponto fixo;
  - regra conservadora do ponto fixo (O-1) e "todas as frentes" no calendário padrão.
- **Planejamento (usuário):** M-5, abrir no MS Project real o `.xml` com os calendários do 00005: `NOT_RUN`.
