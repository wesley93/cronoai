---
issue: —
spec: SPEC-07 (parcial) — RF-07.1 (parcial, offline), RF-07.2, RF-07.3 (no front); SPEC-15 (Fase 1) — RF-15.1, RF-15.2, RF-15.5, RNF-15.1, RNF-15.3
branch: feat/00006-sinapi-layout-2025
base: feat/00005-premissas-calendarios (PR empilhado; HEAD dbaf67f). Com o 00005 na master, a base passa a ser a master
faixa: 3 (T2, T3, T4, T5)
ficha_ou_plano: .claude/ciclos/00006-sinapi-layout-2025-plano.md (emendas 01 e 02)
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00006 — Leitor offline do SINAPI (layout 2025), RUP por função, recorte por UF/regime/data-base na obra e tela "Integrações"

## Resumo
- **O que é:** cada obra passa a dimensionar duração, equipe e custo com a tabela SINAPI da UF, do regime e da data-base dela. Contém:
  - leitor offline da planilha nacional `SINAPI_Referencia_AAAA_MM.xlsx` (zip e xlsx próprios, sem dependência nova, com limites contra zip bomb e XML sem DTD) e o CLI `npm run sinapi:recorte`, com a saída fora do repositório;
  - recorte JSON versionado (esquema v1) por UF, regime e data-base, validado e reconstruído na importação;
  - RUP por função tirada do Analítico; função principal sem a supervisão; cada função vira recurso proporcional;
  - horas por dia = `minutosPorDia ÷ 60` e BAC da tarefa com centavos;
  - tela "Integrações": cartão SINAPI com importação e 5 cartões da Fase 2 só informativos, sem campos;
  - recorte compartilhado por chave no IndexedDB (estrutura 1 → 2), com vínculo explícito por obra;
  - migração do estado salvo do esquema 4 para o 5.
- **Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR:**
  - gate: Q1 = (b), cada função vira recurso proporcional; Q2 = (a), custo de mão de obra continua ilustrativo; Q3 = (a), outra obra só usa o recorte pelo botão "Usar nesta obra";
  - emenda 01: EO-1 a EO-4 aceitas; EO-5 (`mainTrade`) registrada como dívida; R-1 a R-9 aceitas (o R-1 dentro do Q2 = a); migração 4 → 5 neste ciclo (o 00007 passa a 5 → 6);
  - rodada 02: proporção entre funções arredondada a 2 casas antes do teto, no lugar da tolerância de 0,05 (emenda 02); chip "· alterado" na linha editada;
  - rodada 03: linha alterada — custo e RUP mantêm a equipe, profissional trocado cai em 0,5 servente por oficial; chip "· outro recorte" e recusa no lote; `custo_unitario` reconhecido no CSV;
  - rodada 04: modelo CSV com as colunas `rup` e `custo_unitario` vazias; teto de valores no CSV, na célula e na calculadora.
  - Todas: **decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR.**
- **Números do Edifício Aurora:** SPI 0,8883, CPI 0,9349, entrega 23/06/27 e cenários **iguais**. Exportação MSPDI do seed idêntica à da base (SHA `a401d3a8…e18e`, rodadas 01 e 02). As mudanças de propósito estão em "Números que mudaram".
- **O que você precisa fazer:**
  - revisar no PR as decisões acima, em especial a mudança no Inviolável 7 do `CLAUDE.md` (desvio 11);
  - rodar `npm run sinapi:recorte -- --ajuda` num Node 22 antes do merge;
  - levar a **Orçamento/Custos**, **Segurança da Informação** e **Contabilidade/Tributário + Jurídico** os itens da última seção.
- **Estado:** validadores aprovados na rodada 04 (5972cbb): `testes` (gates verdes; mutações M1, M2 e M3 derrubam um teste cada; reprovação só documental, fechada por este registro e pela emenda 02), `arquiteto`, `especialista-obra` e `seguranca` APROVADOS. Ajuste de concordância em a8c25dc. Auditoria independente: A PREENCHER.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-1 §3.6, ciclo 00006.

## Triagem
- **T1:** não. `cpm.ts` e `calendar.ts` não mudam; a fórmula de `durationFromTeam`/`scheduleDays` fica.
- **T2:** `sinapiRup.ts` (novo), `sinapi.ts` (horas por dia), `sinapiBudget.ts` (equipe por função), `calendarioTrabalho.ts` (`horasPorDia`), BAC em `buildSinapiTask`.
- **T3:** formato novo aceito pelo app: o JSON do recorte (6 MiB, esquema v1). O MSPDI não muda.
- **T4:** esquema 4 → 5 (`meta.recorteSinapi`, `budget[].equipe`/`fonte`, `ResumoObra.recorteSinapi`); IndexedDB estrutura 1 → 2 (store `recortesSinapi`).
- **T5:** o script lê um zip externo de 13,6 MB (120 MB descompactado); o app lê um arquivo do usuário. Dependência nova: nenhuma.
- **T6 a T8:** não.
- **Faixa 3.** O `classificar-diff` confirma T2, T3, T4 e T5 (o T5 vem de `CartaoSinapi.vue`; `scripts/` fica fora da heurística, por isso o T5 foi declarado). `seguranca` e `especialista-obra` obrigatórios.

## Commits
| SHA | Conteúdo |
|---|---|
| 67776af | Plano do leitor SINAPI 2025 e recorte por UF/regime, com o gate |
| 281a99a | Parecer da tarefa 0 do `especialista-obra` e emenda 01 do plano |
| f4b69c1 | E1: RUP por função do Analítico e esquema versionado do recorte |
| 444c2d9 | E2: leitor do layout 2025 e gerador do recorte por UF/regime/data-base |
| 481a100 | E3: tela de integrações da obra com cartões da Fase 2 sem campos |
| 011e278 | E4: recorte importado na obra e usado na calculadora e na planilha |
| 80efda4 | Rodada 02: fonte alterada, recorte da obra anterior, proporção da equipe e leitor linear |
| 39391f8 | Rodada 03: lote de outro recorte, equipe mantida e fila na troca de obra |
| 5972cbb | Rodada 04: testes de mutação do R-3, BAC do `custo_unitario`, modelo CSV com colunas vazias e teto de valores |
| a8c25dc | Concordância de "custo unitário inválido" (achado do `arquiteto` r04) |

## Rodadas
| Rodada | testes | arquiteto | especialista-obra | seguranca | auditoria |
|---|---|---|---|---|---|
| 01 (011e278) | REPROVADO: CR-13 e CR-14 sem o antes no teste (B3); N-8 sem o registro do ciclo | REPROVADO: R-1 (recorte de outra obra na calculadora); R-2 (linha editada com a fonte SINAPI); R-3 a R-11 não bloqueiam | REPROVADO: item 1 (linha editada com o selo oficial); itens 2 a 8 | APROVADO: 2 Baixos, 3 Info | — |
| 02 (80efda4) | REPROVADO só por documentação: N-8 e a emenda da EO-2 | REPROVADO: R-1b (lote gera tarefa de outro recorte); imprecisões 1 e 2; resíduo do R-3 | REPROVADO: V-1 (custo alterado troca a equipe); V-3; ponto 7 (`custo_unitario`) | APROVADO: 1 Baixo (atributos quadráticos), 1 Info (guarda da obra) | — |
| 03 (39391f8) | REPROVADO: mutação do R-3 sobrevivente (M1 e M3); BAC do `custo_unitario` não afirmado; N-8; emenda 02 | APROVADO: sem pendência de código; registros antes da entrega | APROVADO: recomendação R3-1 (modelo CSV); R3-2 e R3-3 | APROVADO: 3 Info | — |
| 04 (5972cbb) | APROVADO no código: 925 testes; M1, M2 e M3 mortas; reprovação só documental | APROVADO: 2 baixos (concordância, corrigida em a8c25dc; registro dos tetos e do modelo) | APROVADO: tetos com folga; T-1 (verba > R$ 10 mi) registrado | APROVADO: sem Infinity/NaN; linhas `#` sem injeção | A PREENCHER |

### Testes, antes → depois
| Ponto | Vitest | E2E | Fonte |
|---|---|---|---|
| Base (281a99a, código final do 00005) | 614 passaram, 12 pulados (626); 30 arquivos (1 pulado) | 28 | `dev-frontend` (relatório final) |
| E4 (011e278) | 846 passaram, 54 pulados (900); 43 arquivos (2 pulados) | 33 | `dev-frontend`; `testes` r01 |
| Rodada 02 (80efda4) | 895 (+49), 54 pulados (949); 44 arquivos | 33 | `dev-frontend`; `testes` r02 |
| Rodada 03 (39391f8) | 912 (+17), 54 pulados (966); 44 arquivos | 33 | `dev-frontend`; `testes` r03 |
| Rodada 04 (5972cbb) | 925 passaram, 54 pulados (979) | 33 | `dev-frontend`; `testes` r04 |

- Os 54 pulados: 12 do corpus e 42 da referência SINAPI. Os dois só rodam com `CRONOAI_REF_DIR`.
- Referência SINAPI 09/2026: 42/42 em E4, r02 e r03. Corpus MSPDI: 419/419 em todas as rodadas.
- Cobertura de `src/lib` (stmts / branch / funcs / lines): E4 98,16 / 92,95 / 99,27 / 98,16; r02 98,17 / 93 / 99,28 / 98,17; r03 98,17 / 93,03 / 99,28 / 98,17. `sinapiRup.ts` e `recorteSinapi.ts` com 100% de linhas.

### Desempenho
| Medida | E4 (011e278) | Rodada 02 (80efda4) | Rodada 03 (39391f8) | Fonte |
|---|---|---|---|---|
| Abrir obra com recorte sintético de 4,27 milhões de caracteres (ler, validar 8.443 composições, indexar) | ~272 ms (dev); 347 ms (`testes`) | dentro do `test:coverage` verde | idem | dev E4; `testes` r01 |
| Busca no recorte | 2,5 a 11 ms (dev); 2,8 ms (`testes`) | idem | idem | idem |
| Salvar a obra (recorte nunca regravado) | 2 a 4 ms; 0 regravações | idem | idem | idem |
| Leitura do xlsx real no teste de referência (CSD + CCD + Analítico) | 9.209 ms (dev); 6.632 ms (`testes`) | 11.146 ms (dev); 8.081 ms (`testes`) | 8.473 ms (dev) | relatórios |
| Leitor de xlsx, `smoke.mjs` | ~4,9 s | ~3,0 s (varredura linear) | — | dev r02 |
| Tag sem fechamento (ReDoS) | `<si>` × 313 KB: 22 s | 400 mil repetições: até 71 ms, recusado | — | `seguranca` r01, r02 |
| Abertura de tag com atributos longos | — | `<row aaaa…>` de 80 KB: 17,1 s | 0 ms, recusada; pior caso dentro do limite linear (~2,3 µs/byte; 16 MB em 36 s) | `seguranca` r02, r03 |
| Rodada 04 | — | — | leitura da planilha real 8,5–12,3 s com a máquina carregada (teto do teste de referência: 120 s) | — |

### Matriz de verificação (gates reexecutados pelo `testes` em 5972cbb; a8c25dc só muda o texto de uma mensagem e o teste que a afirma, conferidos pelo orquestrador: `sinapiBudget.test.ts` 26/26, eslint e vue-tsc limpos)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-LINT / G-TIPOS | eslint e vue-tsc (com `scripts/**/*.ts`) | `npm run lint`, `npm run typecheck` | sim | PASS | EXIT 0 em r01, r02 e r03 (`testes`); r04 (5972cbb): EXIT 0 nos dois |
| G-COV | Suíte completa e cobertura ≥ 80% | `npm run test:coverage` | sim | PASS | r03: 912 passaram, 54 pulados; 98,17 / 93,03 / 99,28 / 98,17. O S-1 do parser falhou 2 de 4 vezes em r01 e r02 (ver Pendências); r04 (5972cbb): 925 passaram, 54 pulados (979); 98,18 / 93,11 / 99,28 / 98,18 |
| G-E2E | E2E | `CI=1 npm run e2e`, porta 4173 livre | sim | PASS | `33 passed (1.7m)` (`testes` r03); r04 (5972cbb): `33 passed (1.9m)` |
| G-BUILD | Build de produção | `npm run build` | sim | PASS | EXIT 0 (`testes` r03); r04 (5972cbb): EXIT 0 |
| G-REF / AC-6 / N-1 / N-2 | Planilha 09/2026: CP-1 a CP-8, tabela 4.2, CR-11 | `CRONOAI_REF_DIR=… vitest run scripts/sinapi/referencia-2026-09.test.ts` | sim | PASS | `42 passed (42)` em r01, r02 e r03; custo ± 0,005; 104094 com custo 0 em AP, GO, MG e SC. Nenhum conteúdo da planilha no repositório além das 3 composições da fixture; r04 (5972cbb): `42 passed (42)`; nenhum valor esperado mudou (só o timeout de 120 s) |
| G-CORPUS / M-3 corpus | Corpus MSPDI (Inviolável 2) | `…msProjectXmlParser.corpus.test.ts` | sim | PASS | `419 passed (419)`; r04 (5972cbb): `419 passed (419)` |
| G-REGRAS / S-4 | `validar-regras`; sem `v-html` | `validar-regras.mjs --base feat/00005-premissas-calendarios --commits` | sim | PASS | 73 arquivos, 0 bloqueia, 0 alerta; r04 (5972cbb): 74 arquivos, 0 bloqueia, 0 alerta |
| G-CLASSIF | Faixa | `classificar-diff.mjs` | sim | PASS | Faixa 3 (T2, T3, T4, T5); `seguranca` e `especialista-obra` obrigatórios |
| S-5 | 0 dependências novas | `auditar-dependencias.mjs` | sim | PASS | "nenhuma mudança no package.json" (só o script `sinapi:recorte`) |
| AC-1 | RUP = coeficiente publicado | `sinapiRup.test.ts` | sim | PASS | 1,279 / 0,639; 1,8305384 / 1,7058427 / 4,7714472 (`testes` r01) |
| AC-2 | Principal, empate, só apoio, supervisão fora | `sinapiRup.test.ts`, referência | sim | PASS | 103669 → PEDREIRO; 93358 → SERVENTE; 107113 → SERVENTE; 101183 → PEDREIRO. O antes da EO-1 entrou no teste na r02 (B3) |
| AC-3 / N-3 | CR-1 a CR-7, regra da equipe, CR-9 | `sinapiRup.test.ts` (`it.each`), `sinapiBudget.test.ts` | sim | PASS | 33 / 4 / 15 / 6 / 9 / 37 / 65 d.u.; recursos e BAC exatos. Regra com a proporção a 2 casas desde a r02 (emenda 02); CR-1 a CR-8 iguais. CR-2 = 4 serventes |
| AC-4 / S-3 | Esquema v1, recusas, `__proto__`, conferência com a obra | `recorteSinapi.test.ts` | sim | PASS | Uma recusa por regra da §05; `Object.prototype` intacto; BA × SP recusado. `totais.composicoes` conferido na importação desde a r02 |
| AC-5 | Leitor por cabeçalho e fórmula | `layout2025.test.ts` | sim | PASS | Coluna inserida, coluna ausente, código pela fórmula, divergência com o Analítico, mês divergente, CCD "SEM DESONERAÇÃO" |
| AC-7 / S-7 / R-1 | CLI; saída fora do repositório; `sinapiRup.ts` sem import de runtime | `gerar-recorte.test.ts` | sim | PASS | Recusa `src/`, `public/` e a raiz; não sobrescreve sem `--sobrescrever`; teste como processo Node com type stripping (Node 26.12.1) |
| AC-8 / S-6 | Integrações sem campos | `IntegracoesModule.test.ts`, E2E | sim | PASS | 6 cartões; 0 campos nos da Fase 2; 0 `input[type=password]`; nenhum link externo; 9 módulos abrem |
| AC-9 | Importação atômica; recusas sem gravar | `useProjectStore.recorte.test.ts` | sim | PASS | "falha de gravação reverte…", "recusas sem gravar nada…" (`testes` r01) |
| AC-10 | Compartilhar, limpar órfão, desvincular | idem | sim | PASS | 1 → 1 → 0; troca de UF desvincula com log; órfão de formato mais novo nunca apagado desde a r02 |
| AC-11 | Calculadora, fonte, notas, custo por função | store, `SinapiModule.test.ts`, E2E | sim | PASS | R$ 123,96; 33 d.u.; Pedreiro 4 + Servente 2; BAC 79.334,40; mão de obra R$ 45.015,68 com o método na tela (r02); notas com só o campo mudado como informado (r03) |
| AC-12 | CSV completa pelo recorte | `sinapiBudget.test.ts` | sim | PASS | 103332 → RUP 1,6225376, R$ 123,96, Pedreiro, equipe [Servente 0,5], 33 d |
| AC-13 | Horas por dia da obra | `sinapi.test.ts`, `sinapiBudget.test.ts`, store, `SinapiModule.test.ts` | sim | PASS | 450 min → 35 d (15.750 min); 480 → 33; calendário de 44 h com 480 → 33; cartão "35 d.u. (de 7,5 h)" |
| AC-14 | BAC com centavos | store, E2E | sim | PASS | 79.334,40 (antes 79.334) na tarefa e no EVM |
| AC-15 / P-1 / P-4 | Esquema 4 → 5 com o registro real; esquema 6 recusado | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts`, E2E | sim | PASS | Cadeia `[[1,2],[2,3],[3,4],[4,5]]`; resto `toEqual`; `undo` e N-1 iguais. Fixture conferida na base c05 (`testes` r01): entrega 2027-06-16, SPI 0,8882735819816097, CPI 0,9349417854398353 |
| N-4 | Linhas antigas inalteradas (CR-9) | `sinapiBudget.test.ts`, store | sim | PASS | 17 d.u.; Pedreiro 4 + Servente 2; BAC 63.040; ceil −1e-9 do `helperRatio` mantido |
| N-5 | Encargos (CR-10) | `recorteSinapi.test.ts` | não | PASS | 115,01% / 71,18% e 99,09% / 58,51% |
| N-6 | E2E existente sem número mudado | `npm run e2e` | sim | PASS | 33 passed |
| N-7 | CR-12 a CR-15 com o antes → depois | `sinapi.test.ts`, `sinapiRup.test.ts` | sim | PASS | Na r01: FAIL só no antes de CR-13/CR-14. Corrigido em 80efda4: 764 serventes; HH 17,55 e 2 d |
| N-8 | Antes → depois no ciclo e no PR | testes + este registro | sim | PASS | Testes com o antes → depois desde a r02; este registro (seção "Números que mudaram"); a descrição do PR repete a tabela |
| LINHA-ALT | Linha editada: "· alterado"; custo e RUP mantêm a equipe; profissional trocado cai em 0,5 | `sinapiBudget.test.ts`, store, `SinapiModule.test.ts` | sim | PASS | CR-1 com RUP 0,9: 18 d.u.; CR-2: Pedreiro 2 + Servente 4; CR-3: + Carpinteiro 1; CR-3 com Armador: Armador 4 + Servente 2 (`testes` r03) |
| OUTRO-REC | Fonte de outro recorte recusada na calculadora e no lote | store, `SinapiModule.test.ts` | sim | PASS | Calculadora: r02. Lote: r03, mensagem exata, nada gerado; chip "· outro recorte" (`chip-critical`) |
| CSV-CUSTO | `custo_unitario` reconhecido: BAC 79.334,40 → 63.040,00 | `sinapiBudget.test.ts`; `useProjectStore.recorte.test.ts` ("BAC do lote a partir do CSV do modelo") | sim | PASS | `bac` `toBeCloseTo(63040, 2)` com os valores antigos do modelo (linha "· alterado", nota do custo informado); antes (coluna ignorada) 79.334,40 no nome e no comentário (`testes` r04) |
| MODELO-CSV | Modelo com `rup` e `custo_unitario` vazios | `sinapiBudget.test.ts` ("modelo baixável…") | sim | PASS | Com recorte: 103332 vale o publicado, BAC `toBeCloseTo(79334.4, 2)`, sem "alterado"; 87529 e 87263 dão "Linha 5/6" (linha do arquivo). Sem recorte: iguais ao modelo antigo. Aviso `#` com "VAZIOS" e "substitui o publicado" (`testes` r04) |
| TETO | Quantidade, custo e RUP finitos e com teto; sem BAC infinito | `sinapiBudget.test.ts`, `useProjectStore.recorte.test.ts`, `SinapiModule.test.ts` | sim | PASS | `LIMITES_LINHA` = quantidade 1e9, custo 1e7, RUP 1e4, equipe 1.000 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR). "1e308" e "1e999" recusados no CSV, na célula, na calculadora, na inclusão e no lote; no teto o BAC é 1e16 (`toBe`); estado adulterado recusado. Célula: quantidade 1e8 → 1e9, RUP 50 → 10.000, equipe 60 → 1.000 |
| MUT-R3 | Guardas do R-3 protegidas por teste (mutação) | controle negativo do `testes` em cópia no scratchpad | sim | PASS | r04: M1 (última conferência), M2 (`desfazer` sem guarda) e M3 (índice fora da fila) derrubam 1 teste cada (`1 failed | 66 passed`); base da cópia 67/67. Na r03, M1 e M3 sobreviviam |
| FILA | Sem deadlock e sem perda de gravação | revisão do `arquiteto` e da `seguranca` | sim | PASS | `arquiteto` r02 e r03; `seguranca` r03. Resíduo em `criarObra`/`duplicarObra`/`excluirObra` (ver Pendências) |
| M-1 / M-2 | JSON > 6 MiB recusado antes de ler; malformado, desconhecido, versão 2 | E2E, `recorteSinapi.test.ts` | sim | PASS | Toast "Arquivo grande demais"; 3 mensagens |
| M-3 | Exportação do seed igual à da base | script em `scratchpad\m3` (c05 dbaf67f × c06) | sim | PASS | SHA `a401d3a80ff304e097d8f7e1bc44312464c1055f91d95f45b0100c342c09e18e` nos dois (r01 e r02); NOT_RUN na r03 (parser intocado) |
| P-2 / P-3 | Estrutura 1 → 2; recorte mais novo não sobrescrito | E2E, store | sim | PASS | `{ versao: 2, recortes: 0, obras: 1 }`; importação recusada |
| P-5 | Rollback: app do 00005 recusa o esquema 5 e cai na memória sem gravar | argumento (`armazenamentoObras.ts`, `migracaoEstado.ts`) | não | NOT_RUN | Argumento do dev e do `arquiteto` r01; sem conferência manual |
| S-1 | Limites de zip bomb | `zip.test.ts` | sim | PASS | 20 testes: declarado, razão > 200, `maxOutputLength`, CRC, soma, criptografia, método 12, ZIP64, multivolume, nome repetido |
| S-2 | `DOCTYPE`/`ENTITY`; tags sem fechamento; atributos longos | `planilha.test.ts` | sim | PASS | Recusa de DTD (r01); varredura linear (r02); `MAX_ABERTURA = 1000` (r03) |
| R-2 | Catálogo ilustrativo continua marcado (Inviolável 7) | revisão + V-2 | sim | PASS | Aviso ilustrativo na calculadora sem recorte; chip cinza "ilustrativo" na planilha |
| R-3 | Recorte fora do estado reativo profundo | revisão + teste `isProxy` | não | PASS | `shallowRef` + `markRaw` (`arquiteto` r01) |
| R-4 | `mainTrade` intocado e dívida registrada | `git diff` em `scenarios.ts`; `divida-conhecida.md:28` | sim | PASS | `scenarios.ts` sem diff |
| V-1 | Integrações | `npm run dev` (:5183), texto da página | não | PASS no conteúdo | Orquestrador, 011e278, por texto: cartão SINAPI "Não configurada", 5 cartões da Fase 2 sem campo; console sem erros. Temas, 1440 px e celular não conferidos (captura preta) |
| V-2 | Calculadora sem recorte | idem | não | PASS no conteúdo | Fórmula "(1.850 m² × 0,82) / (6 × 8 h) = 31,6 → 32 dias úteis (de 8 h)", término pelo CPM e aviso ilustrativo. Mão de obra em R$ inteiro → corrigida em 80efda4. Com recorte: não conferida na tela (E2E cobre) |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | A PREENCHER | A PREENCHER |

## Números que mudaram de propósito (antes → depois)
Todos fixados em teste, com o antes no próprio teste (Inviolável 1). Só valem para obra com recorte, salvo o BAC com centavos e as horas por dia, que valem também para o catálogo.

**E1 a E4 (base → 011e278)**
| O quê | Antes | Depois |
|---|---|---|
| BAC da tarefa gerada (D-19, EO-4) | `Math.round`: CR-1 79.334; CR-3 289.430; CR-4 9.990; CR-5 4.680 | 79.334,40; 289.430,40; 9.989,60; 4.679,50. Produto inteiro do catálogo igual (CR-9 63.040) |
| Horas por dia com 450 min/dia (D-18, EO-3), CR-1 | 8 h fixas: 33 d = 14.850 min, 726,36 min a menos que os 15.576,36 necessários | 7,5 h: 35 d = 15.750 min. Com 480: 33 d (igual). Calendário de 44 h com 480: 33 d |
| CR-2 (104658, 2 pedreiros) (EO-2) | 5 serventes (⌈4,0031 − 1e-9⌉) | 4 serventes |
| CR-13 (107113, 100 m, equipe 2) (EO-1) | engenheiro principal: HH 0,4143, 1 d, **764** serventes (⌈2 × 1,5815891 ÷ 0,004143⌉ = ⌈763,4994⌉). O plano dizia 772 com os coeficientes arredondados (1,5816 e 0,0041) | Servente principal: HH 158,15891, 10 d, Servente 2; engenheiro nas notas (0,41 h, não alocado) |
| CR-14 (101183, q 50, equipe 2) (EO-1) | encarregado principal: HH 17,55, 2 d | Pedreiro principal: HH 13,8, 1 d; Pedreiro 2 + Servente 9 com os coeficientes reais. Fora de todo recorte (`SEM CUSTO`) |
| Custo de mão de obra da calculadora, CR-1 (D-21, R-1) | por horas alocadas: R$ 45.225,72 | por função: R$ 45.015,68 (ilustrativo) |
| Recurso de apoio | "Auxiliar de encanador" virava "Servente" (`helperRatio`) | CR-6: "Auxiliar de encanador ou bombeiro hidráulico" 6 |
| Esquema do estado / estrutura do IndexedDB | 4 / 1 | 5 / 2 |
| Módulos | 8 | 9 (Integrações) |

**Rodada 02 (011e278 → 80efda4)**
| Caso | Antes | Depois |
|---|---|---|
| CR-2 com 32 pedreiros (regra da equipe; emenda 02) | 65 serventes (tolerância 0,05: ⌈64,0501 − 0,05⌉ = 65; teto exato também 65) | 64 (32 × 2,00) |
| CR-1 a CR-8 com a regra nova | — | inalterados (CR-3: 0,80 → 4 e 0,25 → 1; CR-7: 0,18 → 2; CR-4: mínimo 1) |
| Linha da planilha com RUP editada (CR-1, RUP 0,9) | chip "SINAPI SP 09/2026"; 18 d.u.; notas com a RUP publicada (que daria 33) | chip "· alterado"; 18 d.u.; notas com a RUP 0,9 como informada |
| Linha com custo alterado, CR-2 / CR-3 | 011e278: equipe mantida e fonte SINAPI | Pedreiro 2 + Servente 1 / Pedreiro 4 + Servente 2 (helperRatio 0,5; corrigido na r03) |
| Mão de obra estimada na tela | "R$ 45.016" (com recorte); "R$ 65.989" (sem recorte), sem método | "R$ 45.015,68 (ilustrativa, por coeficiente da composição)"; "R$ 65.989,00 (ilustrativa, por horas alocadas)" |
| Cartão "Duração" | "33 d.u." | "33 d.u. (de 8 h)"; com 450 min, "35 d.u. (de 7,5 h)" |
| Composição na calculadora depois de trocar de obra ou de recorte | ficava com o custo da obra anterior | limpa; store recusa a fonte de outro recorte |
| CSV com composição do recorte sem mão de obra | "RUP ausente e código X fora do catálogo" | "composição sem mão de obra no recorte (código X): informe a RUP na planilha." |
| Chip "ilustrativo" | âmbar | cinza |

**Rodada 03 (80efda4 → 39391f8)**
| Caso | Antes | Depois |
|---|---|---|
| CR-2 (104658, 100 m², equipe 2), custo ou RUP alterados | Pedreiro 2 + Servente 1 (o servente precisaria de 16 d numa tarefa de 4 d) | Pedreiro 2 + Servente 4, 4 d (128 h para 127,9 HH) |
| CR-3 (103681, 320 m³, equipe 4), custo ou RUP alterados | Pedreiro 4 + Servente 2 (o carpinteiro sumia) | Pedreiro 4 + Servente 4 + Carpinteiro 1, 15 d |
| CR-3 com profissional trocado (Armador) | igual | Armador 4 + Servente 2 (padrão 0,5) |
| CSV do modelo com recorte (103332: RUP 0,82, custo 98,50, 640 m², equipe 4) | `custo_unitario` ignorado: custo 123,96, BAC R$ 79.334,40; linha alterada só pela RUP | custo 98,50 vale: BAC **R$ 63.040,00**; linha "· alterado" (RUP e custo); 17 d.u. |
| Mesma linha sem recorte | 98,50 | 98,50 (igual) |
| Notas da linha alterada | citavam RUP, custo e função efetivos como informados | só o campo mudado, com o publicado ao lado |
| Lote com linhas de outro recorte | gerava tarefas com o custo antigo | recusa, sem criar tarefa |

**Rodada 04 (39391f8 → 5972cbb):** modelo CSV com colunas vazias: com recorte, o 103332 do modelo passa de 17 d.u. e R$ 63.040,00 (valores de exemplo, marcado "alterado") para o publicado, 33 d.u. e R$ 79.334,40; sem recorte, nada muda (o catálogo coincide com o modelo antigo). "Linha N" nas mensagens passa a contar a linha do arquivo (com comentários e linhas em branco); sem essas linhas, os números são os de antes. Tetos: valores acima de quantidade 1e9, custo R$ 10.000.000, RUP 10.000 ou equipe 1.000 passam a ser recusados (antes, "1e308" virava BAC infinito); na célula, os tetos locais passam de 1e8/50/1e7/60 para 1e9/10.000/1e7/1.000.

## Desvios do plano
Avaliação do `arquiteto` r01 para os desvios 1 a 13; os demais vêm das rodadas 02 a 04.

| # | Desvio | Avaliação |
|---|---|---|
| 1 | Recorte com ~410 caracteres por composição (3.459.176 em SP), não 403 (3.399.801): o formato final tem `percentualAS`. Maior custo de 228.977,20 é da aba toda (MT); em SP, 127.039,32 | Aceitável com registro; ADR 00002 atualizado; comentário corrigido na r02 |
| 2 | 107113 real: Servente 1,5815891 e engenheiro 0,004143 (o plano usou 1,5816 e 0,0041). Dias iguais; custo SP R$ 97,45/m | Aceitável com registro; o antes da EO-1 passa de 772 para 764 |
| 3 | CR-12: 726,36 min, não 727 | Aceitável com registro (o plano arredondou para cima) |
| 4 | CR-14 (101183) é `SEM CUSTO` e não entra em recorte; conferida no Analítico (Servente 9 com equipe 2) | Aceitável com registro; mostrado ao `especialista-obra` |
| 5 | Saneamento do esquema 5 em todo registro, inclusive esquema 4 adulterado | Aceitável: mais seguro; idempotente |
| 6 | `--codigos` e `--grupos` juntos valem como união | Aceitável com registro (README e `USO`) |
| 7 | `salvarAgora({ gravarRecorte, mutar })` | Aceitável com registro; ressalvas do R-3, corrigidas na r02 e na r03 |
| 8 | Chave inválida no índice invalida o índice | Aceitável: segue `validarIndice` |
| 9 | Equipe do recorte mantida no CSV com RUP digitada | Aceitável para a equipe; a fonte exigiu correção (R-2). A regra final é a da emenda 02 |
| 10 | `lerRegistroDeRecorte` mais estrito (SHA e contagem) | Aceitável |
| 11 | `MAX_RECORTE_BYTES` no Inviolável 4; Inviolável 7 e linha do `armazenamentoObras` do `CLAUDE.md` alterados | Aceitável com registro. **Mudança num inviolável: destacar no PR para o usuário aprovar** |
| 12 | Helpers de teste (`scripts/sinapi/__testes__`, `e2e/fixtures.ts`, `sinapiSintetico.ts`) | Aceitável com registro |
| 13 | `data-testid` novos no E2E | Aceitável |
| R-5 | Arquivos fora das listas: `CartaoFase2.vue`, `CartaoSinapi.test.ts`, `useProjectStore.sinapi.caracterizacao.test.ts`; depois `SinapiModule.test.ts` | Aceitável com registro: coesos |
| EO-2 | Tolerância de 0,05 substituída pela proporção arredondada a 2 casas (`CASAS_PROPORCAO_EQUIPE = 2`) na r02, sem emenda na hora | Emenda 02. Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Linha alterada | Regra da linha editada (fonte "· alterado"; custo e RUP mantêm a equipe; profissional trocado cai em 0,5) não estava no plano | Emenda 02. Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Outro recorte | Recusa de fonte de outro recorte na calculadora e no lote não estava no plano | Emenda 02. Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| CSV | `custo_unitario` reconhecido (r03); modelo com colunas vazias e teto de valores (r04) | Emenda 02. Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR |
| Checkpoint tarefa 5 | Type stripping verificado só no Node 26.12.1; o Node 22 do `.nvmrc` não está instalado | Pendência (ver abaixo) |
| N-8 | Registro do ciclo escrito depois da rodada 03 | Desvio de processo registrado |
| V-1 / V-2 | Feitas pelo orquestrador pelo texto da página, não por imagem | Pendência (ver abaixo) |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| testes r01 (B3, bloqueante) | CR-13 e CR-14 sem o antes no teste (772; HH 17,55 e 2 d) | corrigido (80efda4): antes com os coeficientes publicados (764) no unitário e na referência |
| testes r01 N-8 | Registro do ciclo ausente | registrado neste arquivo e na descrição do PR |
| testes r01 | S-1 do parser instável (2.915 ms × teto de 2.000) | pendência registrada (pré-existente, parser intocado) |
| testes r01 | Tautologia `toBeGreaterThanOrEqual(0)` em `useProjectStore.recorte.test.ts:300` | corrigido (80efda4); confirmado pelo dev na r03 |
| testes r01 | Caracterização com aritmética no próprio teste | corrigido (80efda4): chama `custoMaoDeObraPorHorasAlocadas` |
| testes r01 | Nome "6 módulos" em `navegacao.spec.ts` | corrigido (80efda4) |
| testes r01 | V-1 e V-2 NOT_RUN | feitas pelo orquestrador por texto; pendência de imagem |
| testes r02 | N-8 | registrado neste arquivo |
| testes r02 | EO-2 revisada sem emenda | emenda 02 (rascunho) |
| testes r02 | Tetos de tempo novos em `planilha.test.ts` e no desempenho do recorte | registrado: mesma fragilidade do S-1 |
| testes r02 | Reprovação dos testes de tag sem fechamento com o código antigo não confirmada | registrado |
| testes r03 (bloqueante) | Mutações M1 (última conferência antes de gravar) e M3 (guarda do `desfazer`) sobrevivem | corrigido (5972cbb): testes (a) e (b) por portão; o `testes` r04 confirmou por mutação |
| testes r03 (bloqueante) | BAC 79.334,40 → 63.040,00 do `custo_unitario` só em comentário | corrigido (5972cbb): `toBeCloseTo(63040, 2)` e `toBeCloseTo(79334.4, 2)` |
| testes r03 | N-8 e emenda 02 | este registro e a emenda 02 |
| testes r03 | Teste "índice da troca gravado depois de uma gravação em andamento" não discriminante | corrigido (5972cbb): removido, com comentário; quem discrimina é o primeiro teste do bloco (M3) |
| testes r03 | Teste da troca de obra com desfecho permissivo | registrado (M2 o reprova) |
| testes r03 | No-op `ALTERADA.replace('SINAPI SP', 'SINAPI SP')` | corrigido (5972cbb) |
| testes r03 | M-3 não repetido | registrado: parser intocado; SHA idêntico em r01 e r02 |
| arquiteto r01 R-1 (bloqueante) | Composição do recorte de outra obra vai para a obra ativa (`KeepAlive`) | corrigido (80efda4): `watch` da identidade, `erroDeFonte`, testes com SP × BA |
| arquiteto r01 R-2 (bloqueante) | Linha com RUP ou custo digitado continua com a fonte SINAPI | corrigido (80efda4): "· alterado"; regra da equipe refeita em 39391f8 |
| arquiteto r01 R-3 | `saveTimer`, `garantirObraAtualSalva` sem a `fila`, `await` antes de vincular | corrigido (80efda4); resíduos em 39391f8 |
| arquiteto r01 R-4 | Órfão de formato mais novo apagado | corrigido (80efda4): `orfaosApagaveis` |
| arquiteto r01 R-5 | Arquivos fora do escopo | registrado em "Desvios" |
| arquiteto r01 R-6 | "403 caracteres"; "Node 22 LTS" impreciso | corrigido (80efda4): 410; Node 22.6 |
| arquiteto r01 R-7 | Cast, `toLocaleString`, data em UTC no `CartaoSinapi` | corrigido (80efda4): `lerChaveRecorte`, `fmtNum`, `dataLocalISO` |
| arquiteto r01 R-8 | Cálculos no componente | corrigido (80efda4): `taxaCadastrada`, `horasDeSupervisao` |
| arquiteto r01 R-9 | Regex preguiçosa quadrática | corrigido (80efda4): varredura linear |
| arquiteto r01 R-10 | `ResultadoRecorte` duplicado | corrigido (80efda4): `ResultadoAcaoRecorte` |
| arquiteto r01 R-11 | Registro do ciclo | este arquivo |
| arquiteto r02 R-1b (bloqueante) | Lote gera tarefa de outro recorte | corrigido (39391f8): `erroDeFontesDoLote`, chip "· outro recorte" |
| arquiteto r02 imprecisão 1 | "Informados pelo usuário" também para o publicado | corrigido (39391f8) |
| arquiteto r02 imprecisão 2 | Só o custo mudado troca a equipe | corrigido (39391f8) |
| arquiteto r02 resíduo R-3 | Índice da `trocarObra` montado antes da gravação do recorte | corrigido (39391f8): índice sob a fila |
| arquiteto r02 | EO-2 mudou sem emenda; arredondamento pode subdimensionar até 0,005 × equipe | emenda 02; pendência de área (Orçamento/Custos) |
| arquiteto r03 | `criarObra`, `duplicarObra`, `excluirObra` gravam o índice fora da fila | dívida registrada neste ciclo e em `divida-conhecida.md` (efeitos recuperáveis, sem perda de dado; corrigir passando toda gravação de índice pela fila) |
| arquiteto r03 | `custo_unitario` muda número | registrado em "Números que mudaram" |
| arquiteto r03 | Emenda 02 e registro do ciclo | rascunhos |
| arquiteto r03 | `MAX_ABERTURA` = 1.000 | pendência de área (Segurança da Informação) |
| especialista r01 item 1 (bloqueante) | Linha editada com o selo oficial e notas com a RUP publicada | corrigido (80efda4); regra final em 39391f8 |
| especialista r01 item 2 | Mão de obra em R$ inteiro ao lado do BAC com centavos | corrigido (80efda4): `fmtBRLCents` e o método |
| especialista r01 item 3 | Tolerância absoluta falha com equipe grande (32 → 65) | corrigido (80efda4): proporção a 2 casas; pendência de área (Orçamento/Custos) |
| especialista r01 item 4 | Mínimo de 1 por função infla o histograma | registrado; pendência de área (Orçamento/Custos) |
| especialista r01 item 5 | Tolerância pode subalocar | registrado (consequência aceita) |
| especialista r01 item 6 | Cartão "Duração" sem "(de N h)"; sem teste de 7,5 h | corrigido (80efda4) |
| especialista r01 item 7 | 772 → 764 | corrigido (80efda4) |
| especialista r01 item 8 | Mensagem de CSV para composição sem mão de obra | corrigido (80efda4) |
| especialista r02 V-1 (bloqueante) | Custo alterado troca a equipe | corrigido (39391f8) |
| especialista r02 V-3 | "Informados" para o publicado | corrigido (39391f8) |
| especialista r02 ponto 7 | `custo_unitario` do modelo ignorado | corrigido (39391f8); BAC no teste na rodada 04 |
| especialista r02 | Duração pela maior HH entre funções (sugestão para depois) | pendência de área (Orçamento/Custos) |
| especialista r03 R3-1 | Modelo CSV com valores ilustrativos substitui o publicado | corrigido (5972cbb): colunas vazias e aviso |
| especialista r03 R3-2 | CSV aceita custo 0 (pré-existente) | registrado |
| especialista r03 R3-3 | Linha editada de volta continua "· alterado" | registrado (conservador) |
| seguranca r01 #1 (Baixo) | Regex quadrática no `planilha.ts` | corrigido (80efda4) |
| seguranca r01 #2 (Baixo) | Nome do `.rels` com ESC na mensagem | corrigido (80efda4) |
| seguranca r01 #3 (Info) | `totais.composicoes` não conferido na importação | corrigido (80efda4) |
| seguranca r01 #4 (Info) | `realpathSync` não expande nomes 8.3 no Windows | registrado (não corrigido; proteção contra engano do administrador) |
| seguranca r01 #5 (Info) | Aval da Segurança da Informação | pendência de área |
| seguranca r02 #1 (Baixo) | Atributos quadráticos | corrigido (39391f8): `MAX_ABERTURA = 1000` |
| seguranca r02 #2 (Info) | Guarda da obra antes do `gravarObra` | corrigido (39391f8); teste de mutação na rodada 04 |
| seguranca r03 Info 1 | `MAX_ABERTURA` menor (200) | registrado (opcional) |
| seguranca r03 Info 2 | Corridas de `criarObra` e `excluirObraInterno` | dívida registrada (ver Pendências) |
| seguranca r03 Info 3 | `parseNumberBR` aceita "1e308"; BAC `Infinity` | corrigido (5972cbb): `LIMITES_LINHA` em todos os caminhos |
| verificação visual (011e278) | Mão de obra em R$ inteiro × BAC com centavos | corrigido (80efda4) |
| arquiteto r04 | "custo unitário inválida" (concordância) | corrigido (a8c25dc) |
| arquiteto r04 | Registrar a mudança dos tetos da célula e do modelo CSV | registrado neste arquivo e no PR |
| especialista r04 T-1 | Verba global acima de R$ 10 milhões (elevadores, subestação) é recusada pelo teto de custo | dívida registrada em `divida-conhecida.md`; contorno: lançar a verba em reais (quantidade = valor, custo R$ 1,00); Orçamento valida subir o teto para 1e9 |
| seguranca r04 (Info) | Linha de dados cuja 1ª célula começa com `#` é descartada sem aviso | registrado (o código SINAPI só tem dígitos) |
| testes r04 | S-1 do parser instável (teto de 2 s); testes com teto de tempo em `planilha.test.ts` | pendência registrada (pré-existente) |
| Auditoria | Achados | A PREENCHER |

## Pendências registradas
- **Node 22 não verificado.** Só há o Node 26.12.1. O type stripping exige o 22.6 ou mais novo (com `--experimental-strip-types`). Rodar `npm run sinapi:recorte -- --ajuda` num Node 22 antes do merge.
- **Índice fora da fila (dívida).** `criarObra`, `duplicarObra` e `excluirObra` gravam o índice fora da `fila`. Uma importação ou edição nesses milissegundos pode tirar do índice a obra nova ou a chave do recorte, ou pôr de volta a obra excluída. Tudo se recupera sem perda de dado. Correção indicada: toda gravação de índice pela fila, como na `trocarObra`.
- **S-1 instável.** `msProjectXmlParser.test.ts:798` (teto de 2.000 ms) falhou 2 de 4 vezes no `test:coverage` completo (r01 e r02). Pré-existente; parser intocado.
- **`mainTrade` (EO-5, D-20).** O crashing escolhe a maior quantidade sem `'Servente'`: em 94 composições comprime o ajudante (ex.: 107585). Dívida em `divida-conhecida.md:28`; `scenarios.ts` intocado.
- **HH das subcomposições.** Não entra na duração (ex.: 87630, operador de betoneira 0,218 h/m² contra 0,245 do pedreiro). Dívida em `divida-conhecida.md:29`.
- **V-1 e V-2 visuais.** Feitas pelo orquestrador pelo texto da página, não por imagem (captura preta). Temas claro e escuro, 1440 px, celular e a calculadora com recorte não conferidos na tela.
- **P-5 (rollback):** só por argumento.
- **`realpathSync` e nomes 8.3** (`seguranca` r01 #4): registrado.
- **Rodada 04 e auditoria:** A PREENCHER.
- **Antes do PR:** PR empilhado em `feat/00005-premissas-calendarios` se o 00005 não tiver entrado na `master`. Recomendar exportar o `.xml` das obras antes de atualizar (o app do 00005 recusa o esquema 5).

## Validação de outras áreas (não substitui o parecer delas)
- **Orçamento/Custos** (antes do merge na `master`):
  - função principal sem a supervisão; supervisão só nas notas, como administração local (EO-1);
  - proporção entre funções arredondada a 2 casas antes do teto, no lugar da tolerância de 0,05 (emenda 02): difere do teto exato em 4 a 6% dos pares, nunca em mais de 1 profissional;
  - mínimo de 1 por função;
  - linha alterada: custo e RUP mantêm a equipe; profissional trocado cai em 0,5 servente por oficial (padrão ilustrativo);
  - `custo_unitario` digitado passa a valer, marcado "· alterado"; modelo CSV com colunas vazias;
  - BAC com centavos (EO-4);
  - D-21 (custo de mão de obra por coeficiente com recorte; por horas alocadas sem recorte), D-22 (taxa não cadastrada de R$ 30/h, maior que a do servente), D-23 (HH de subcomposições fora), D-24 (significado do `%AS`);
  - exclusões de custo 0, inclusive a 104094 (custo 0 em AP, GO, MG e SC no CSD), e as `SEM CUSTO` com mão de obra.
- **Segurança da Informação** (antes do merge):
  - o leitor próprio de zip e xlsx, sem dependência (D-1);
  - os limites da §08, a varredura linear e o `MAX_ABERTURA` de 1.000 caracteres;
  - o teto de valores do CSV (rodada 04).
  - Referências (prática documentada): [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [OWASP XXE Prevention](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html), [OWASP Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html), [Node.js zlib](https://nodejs.org/api/zlib.html).
- **Contabilidade/Tributário, Orçamento/Custos e Jurídico** (antes do uso em proposta):
  - regime da empresa (desonerado × não desonerado) e a transição da desoneração da folha ([Lei 14.973/2024](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14973.htm), segundo o parecer da tarefa 0; a confirmar como a Caixa a reflete no `CCD`).
- **Segurança da Informação, Infraestrutura e Jurídico** (fora deste ciclo): onde fica o *key ring* do Data Protection na Fase 2; WhatsApp por Baileys na Fase 3.
