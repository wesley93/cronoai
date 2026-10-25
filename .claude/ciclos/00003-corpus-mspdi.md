---
issue: —
spec: SPEC-06 (parcial: robustez da importação; RF-06.3 lado da importação, RF-06.1 importação 2002–2019, RF-06.2 pela referência publicada)
branch: feat/00003-corpus-mspdi
base: master (bdcfe88, com o 00001)
faixa: 3 (T3, T5)
ficha_ou_plano: .claude/ciclos/00003-corpus-mspdi-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00003 — Robustez da importação MSPDI com o corpus

## Resumo
- **O que é:** o importador de `.xml` do MS Project foi medido contra 134 arquivos reais (MS Project 2002–2019, dados de teste do MPXJ, LGPL-2.1, só locais). Com isso:
  - os feriados recorrentes passam a ser lidos certo: 137 por arquivo, eram 1.950;
  - tudo o que o import não preserva vira aviso (Inviolável 2);
  - o parser resiste a arquivo de terceiros: DOCTYPE/ENTITY recusados, limite de 15 MiB, orçamento de CPU no calendário, chaves do protótipo e datas inválidas tratadas.
- **Decidido:** o gate (P1 corpus só local, P2 recusa mantida dos 39 arquivos sem tarefa, P3 avisos agrupados) foi decidido pelo orquestrador, com a autorização do usuário para seguir sem parar, **sujeito à revisão dele no PR**. Também por decisão do orquestrador: o ID do MS Project não ganha aviso, porque é só posição de exibição, renumerada pela WBS, e o UID é preservado.
- **O que você precisa fazer:**
  - quem importou um `.xml` com feriado recorrente antes desta versão precisa reimportar;
  - levar à **Segurança da Informação** o endurecimento do parser;
  - levar ao **Jurídico** a decisão sobre versionar uma amostra do corpus LGPL;
  - abrir o `.xml` exportado no MS Project real (M-1).
- **Estado:** aprovado. Validadores na rodada 02; auditoria independente APROVADA na rodada 04 (b3d7769), com 28 de 28 evidências conferidas; E2E 6/6 no SHA final.

## Pedido
"Pode rodar todas specs", Plano da Fase 1, ciclo 00003 (PLANO-FASE-1 §3.3): robustez da importação com o corpus MSPDI.

## Triagem
- **T3 SIM:** `parseMspdiXml` e um ponto do export (`taskNode`, LB0 parcial).
- **T5 SIM:** 134 arquivos de terceiros como entrada, e o endurecimento contra DOCTYPE, tamanho e CPU.
- **T1, T2, T4, T6, T7, T8 NÃO.** Nenhum cálculo do motor muda; os números do import mudam só em A1 (calendário) e A3 (LB0 parcial no export).
- **Faixa 3.** O `classificar-diff.mjs` confirma: "Faixa exigida (mínima): 3 — T3"; `especialista-obra` OBRIGATÓRIO.

## Checkpoints e divergências do plano
- **LB 1–10:** o plano dizia "470 elementos em 47 tarefas"; o corpus tem 470 tarefas em 7 arquivos (uma LB 1–10 por tarefa). O teste fixa 470.
- **LB0 incompleta:** o plano contava só "só início" em 7 arquivos. São 11 tarefas só com início (7 arquivos) e 12 só com término (8 arquivos), com avisos separados e verdadeiros no caminho `importXml`.
- **Linha nula:** contada antes do filtro de nível, porque o MS Project grava `OutlineLevel` 0.
- **Recorrente:** o `FromDate` da regra só é ocorrência em 13 das 27 recorrentes do corpus 2016. O critério passou a ser: há datas legadas do mesmo tipo no período, em número ≥ `Occurrences`.
- **Avisos novos da rodada 03, que o plano §05 dava como "avisados" sem aviso no código:** semana diferente de seg–sex (0 casos no corpus) e lag em formato diferente de dias úteis (12 vínculos `LagFormat` 9, em 6 arquivos).

## Commits
| SHA | Conteúdo |
|---|---|
| 5b59302 | Plano e gate |
| cd33dc1 | E1: teste de corpus local (pulado sem `CRONOAI_REF_DIR`) e relatório de caracterização |
| f446002 | E2: avisos A1–A11, recorrentes pela lista legada, S-1 a S-3 |
| 64da064 | E3: ida e volta com `strictOrder` nos 95 importáveis |
| 5738f6a | E4: comparação de datas nos 8 arquivos com vínculos; docs |
| 6f7f965 | Rodada 02: aviso de LB0 separado, orçamento global de dias percorridos (DoS), contagens únicas, tipo de vínculo sem texto do arquivo, `lstatSync` |
| b3d7769 | Rodada 04: aviso de data inválida deduplicado (legado + `<Exceptions>`); comentário e `msproject-mspdi.md` alinhados ao código (≥ `Occurrences`, avisos novos, LB0 só folhas, ID renumerado, formato do lag) |
| b7d54cb | Rodada 03: `Object.hasOwn` no tipo de vínculo, datas inválidas puladas com aviso, recorrente ≥ `Occurrences`, LB0 parcial só em folhas, calendário conferido por arquivo e na ida e volta, avisos de semana e de formato de lag |

## Rodada 01
Data: 2026-10-25  ·  SHA: 5738f6a

| Agente | Veredito | Pendências |
|---|---|---|
| testes | APROVADO | 0 bloqueantes. R-2 conferida: o export do seed tem 79.655 caracteres nos dois parsers e diff vazio após normalizar `CreationDate`/`LastSaved` |
| arquiteto | REPROVADO | aviso A3 falso para LB0 só com término |
| especialista-obra | APROVADO COM RESSALVAS | P-1 a P-5 |
| seguranca | REPROVADO | DoS de CPU no calendário (Médio) |

## Rodada 02
Data: 2026-10-25  ·  SHA: 6f7f965

| Agente | Veredito | Pendências |
|---|---|---|
| arquiteto | APROVADO | borda da recorrente com sobreposição (Baixo) |
| especialista-obra | APROVADO COM RESSALVAS | R-A, R-B, R-C |
| seguranca | APROVADO | data inválida → "Invalid time value" (Baixo, já existia) |
| auditoria | REPROVADO | sem matriz formal; tipo de vínculo `constructor`/`toString` perdido em silêncio (Médio, já existia); ressalvas sem destino; aprovação do `testes` desatualizada |

## Rodada 03
Data: 2026-10-25  ·  Branch: feat/00003-corpus-mspdi  ·  SHA: b7d54cb

Checagens:
- **LINT:** ok.
- **TYPECHECK:** ok.
- **Testes:** `test:coverage` com 96 testes e 6 pulados (o corpus); cobertura 93,43 / 85,61 / 92,08 / 93,43.
- **Corpus:** 419 testes ok (~65 s).
- **Regras:** `classificar-diff` faixa 3 (T3); `validar-regras` com 0 bloqueios.
- **E2E:** `6 passed (21.0s)`, rodado pelo orquestrador no checkout principal com `git switch --detach b7d54cb`.

Na worktree do scratchpad, o C-4/C-5 falha com "A requested file or directory could not be found": o caminho do `.xml` baixado tem 277 caracteres, acima do limite de 260 do Windows. É limitação do ambiente, não do código.

### Matriz de verificação

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| AC-1 | Corpus pulado sem `CRONOAI_REF_DIR`, sem falha | `npm run test:coverage` sem a variável | sim | PASS | `10 passed \| 1 skipped`, `96 passed \| 6 skipped` (rodada 03, dev); `describe.skipIf(!REF_DIR)` |
| AC-2 | Inventário e integridade por arquivo | corpus com a variável | sim | PASS | 419 testes ok; 134 arquivos, 95 importados, 39 recusados ("Nenhuma tarefa encontrada no XML."), 2.481 tarefas, 53/53 vínculos, % 38/38, início real 38/38, término real 11/11, LB0 11/11, UIDs únicos 95/95 |
| AC-3 | Relatório e tabela por versão no ciclo | `test-results/corpus-mspdi/relatorio.md` | sim | PASS | tabela por versão abaixo (colunas principais); o relatório completo, com SaveVersion e as colunas de progresso, é gerado a cada execução local |
| AC-4 | Sem descarte silencioso nas categorias A1–A11 | corpus | sim | PASS | tabela de avisos abaixo (470/7, 11/7, 12/8, 5/1, 4/1, 20/4, 6/6, 6/6, 1/1, 3/1; informativo em 95) |
| AC-5 | Recorrentes pela lista legada | `msProjectXmlParser.test.ts` C-1 a C-3 + corpus | sim | PASS | C-1 3 datas, C-2 `['2026-11-20']` + aviso, C-3 3 datas; corpus 137 feriados e 3 dias úteis extras nos 4 arquivos (eram 1.950 e 65) |
| AC-6 | Endurecimento | `msProjectXmlParser.test.ts` S-1 a S-3, 2.000 níveis | sim | PASS | DOCTYPE externo e interno recusados nos dois pontos; `MAX_MSPDI_CHARS + 1` recusado; 400 dias + aviso; 10.000 + aviso; 3.000 exceções com orçamento esgotado; 2.000 níveis → erro em português |
| AC-7 | Ida e volta 95/95 com `strictOrder` | corpus E3 | sim | PASS | 95/95 sem erros de validação; campos da seção 05 e calendário (feriados e dias extras) iguais antes e depois |
| AC-8 | Datas × arquivo registradas | corpus E4 | sim | PASS | 104 folhas; 83 iguais com o calendário importado; 100 sem os feriados nacionais |
| AC-9 | C-4 a C-9 fixados | `msProjectXmlParser.test.ts` | sim | PASS | C-4/C-4b (LB0 parcial), C-5 a C-9 com valores e textos exatos |
| AC-10 | Não regressão; cobertura ≥ 80% sem o corpus | `core.test.ts`; `test:coverage`; R-2 | sim | PASS | `core.test.ts` sem diff e verde; cobertura 93,43 / 85,61 / 92,08 / 93,43 |
| AC-11 | Docs atualizados | diff | sim | PASS | `msproject-mspdi.md` (avisos, limites, dívidas, duração do corpus "~1 a 4 min"), `testes.md` (corpus e exceção do `setTimeout(0)`), SPEC-06 §4a (nota P2 = A) |
| M-1 | `.xml` exportado abre no MS Project real | manual | não | NOT_RUN | sem MS Project disponível |
| M-2 | Ida e volta do seed (Inviolável 2) | `core.test.ts` + C-4 (`strictOrder`) | sim | PASS | verdes |
| R-1 | Store, tipos, telas e `useMsProject.ts` intocados | `git diff --stat origin/master...HEAD -- src/stores src/types src/modules src/components src/lib/useMsProject.ts` | sim | PASS | vazio |
| R-2 | Export do seed idêntico | parser da `origin/master` × HEAD, mesmo seed, normalizando os carimbos | sim | PASS | reexecutado pela auditoria sobre **b7d54cb**: 79.619 = 79.619 caracteres, `toBe` passou (antes: `testes` na rodada 01, 79.655 = 79.655) |
| R-3 | `CLAUDE.md` e `divida-conhecida.md` intocados | `git diff --stat` | sim | PASS | vazio |
| R-4 | Evidência local do corpus | `CRONOAI_REF_DIR='D:\Pessoal\Planejamento\Alice\referencias' npx vitest run src/lib/msProjectXmlParser.corpus.test.ts` | sim | PASS | `Tests 419 passed (419)`; números do relatório reproduzidos nas tabelas deste registro |
| N-1 | Nenhum número do motor muda | `useProjectStore.test.ts`; E2E no SHA final | sim | PASS | `cpm.ts`, `calendar.ts`, `evm.ts` e a store sem diff; E2E `6 passed (22.6s)` sobre **b3d7769**, no checkout principal (`git switch --detach b3d7769`): C-1 23/06/27 +16 d.u., C-3 crashing, C-4/C-5 75% e 16/06/27 |
| N-2 | Nenhum valor importado muda além de A1/A3 | parser antigo × novo em 134 + 11 arquivos | sim | PASS | reexecutado pela auditoria sobre **b7d54cb**: só os 4 `calendar-recurring-exceptions` mudam (1.950/65 → 137/3) |
| S-1 | DOCTYPE/ENTITY | AC-6 + sondas da `seguranca` | sim | PASS | maiúsculas, BOM, comentário, PI e UTF-16 recusados ou "inválido" |
| S-2 | Limite de tamanho no parser | AC-6 | sim | PASS | 15 MiB antes do parse |
| S-3 | Limite de expansão do calendário | AC-6 + sondas `scratchpad\seg00003\probe5.cjs` (DOM mínimo, 126.841 exceções, ~15 MB) | sim | PASS | requisito provado pelos testes unitários no b7d54cb (3.000 exceções, orçamento esgotado); medição de CPU da `seguranca` sobre 6f7f965 (o b7d54cb não muda o orçamento): repetidas ~190 ms (antes 173 s), intervalos distintos ~670 ms |
| S-4 | Avisos sem texto do arquivo | revisão (`seguranca`, auditoria) | sim | PASS | só contadores e nomes fixos; tipo de vínculo não numérico vira "(não numérico)" |
| S-5 | Corpus só lê `.xml` e só grava em `test-results/` | revisão | sim | PASS | `lstatSync`, links pulados, `.gitignore` |
| S-6 | Sem dependência nova | `auditar-dependencias.mjs --base origin/master` | sim | PASS | "nenhuma mudança no package.json" |
| S-7 | Chave do protótipo no tipo de vínculo | teste `constructor`/`toString` | sim | PASS | `validateMspdi` inválido; import com aviso "Ignorado:" e tipo FS (rodada 03) |
| S-8 | Data inválida no calendário | teste com texto livre e 2026-02-30 | sim | PASS | exceção pulada com aviso numérico, sem exceção não tratada (rodada 03) |
| P-1 | Estado salvo | — | não | NA | T4 = NÃO |
| V-1 | Avisos como toast ao importar no `npm run dev` | manual | não | NOT_RUN | não executado |
| AC-11 (r04) | Docs coerentes com o código da rodada 03/04 | leitura de `msproject-mspdi.md` e do comentário | sim | PASS | b3d7769: "ao menos `Occurrences` datas"; 3 avisos novos na lista; LB0 parcial só folhas; ID e formato do lag documentados |
| S-9 | Data inválida avisada uma vez | teste 2026-02-30 no legado e em `<Exceptions>` | sim | PASS | "1 exceção(ões) do calendário com data inválida ignorada(s)." (b3d7769) |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | PASS | **APROVADO** na reauditoria da rodada 04 (b3d7769): EVIDENCIAS-CONFERIDAS 28 de 28, nenhum achado; reexecutou AC-1, AC-2, AC-4, AC-5, AC-7, AC-8, AC-10, R-2, R-4, N-2, S-7 e S-9 |

### Caracterização do corpus (medição de 25/10/2026)
| Versão | Arquivos | Importados | Recusados | Tarefas | Vínculos | LB 1–10 | TimephasedData |
|---|---|---|---|---|---|---|---|
| 2002 | 9 | 3 | 6 | 88 | 0/0 | 50 | 458 |
| 2003 | 19 | 13 | 6 | 344 | 8/8 | 50 | 934 |
| 2007 | 20 | 13 | 7 | 344 | 8/8 | 50 | 934 |
| 2010 | 21 | 14 | 7 | 402 | 8/8 | 80 | 915 |
| 2013 | 17 | 14 | 3 | 402 | 8/8 | 80 | 940 |
| 2016 | 17 | 14 | 3 | 402 | 8/8 | 80 | 942 |
| 2019 | 19 | 14 | 5 | 402 | 8/8 | 80 | 940 |
| outros | 12 | 10 | 2 | 97 | 5/5 | 0 | 4.159 |
| **Total** | **134** | **95** | **39** | **2.481** | **53/53** | **470** | **10.222** |

| Aviso (soma nos 95 importados) | Total | Arquivos |
|---|---|---|
| LB 1–10 não importadas | 470 | 7 |
| LB0 sem término | 11 | 7 |
| LB0 sem início | 12 | 8 |
| Tempo corrido | 5 | 1 |
| Menos de meio dia | 4 | 1 |
| Fracionária | 20 | 4 |
| Text1 sem apelido | 6 | 6 |
| Number1 sem apelido | 6 | 6 |
| Calendário próprio | 1 | 1 |
| Linha nula | 3 | 1 |
| Recorrente não aplicada | 0 | 0 |
| Exceção com data inválida | 0 | 0 |
| Semana diferente de seg–sex | 0 | 0 |
| Lag em formato diferente de dias úteis | 12 vínculos | 6 |

## Rodada 04
Data: 2026-10-25  ·  SHA: b3d7769

Os achados da reauditoria sobre b7d54cb foram corrigidos: doc desatualizada, data inválida contada em dobro e evidências com SHA antigo. Linhas novas na matriz acima: AC-11 (r04) e S-9.

Checagens do dev: lint e typecheck ok; `test:coverage` com 97 testes e 6 pulados, cobertura 93,43 / 85,61 / 92,08 / 93,43; corpus 419 ok (~66 s). As contagens de avisos do corpus não mudaram.

## Ressalvas e destino
| Ressalva | Origem | Destino |
|---|---|---|
| R-A: critério da recorrente fraco com sobreposição | especialista-obra | **corrigido** na rodada 03 (≥ `Occurrences`); a expansão completa pela regra fica para o ciclo 00004 (já anotado no plano dele) |
| R-B: `withBaseline(onlyMissing)` só olha `baselineStart` | especialista-obra / arquiteto | ciclo **00004** (CR-12): troca a condição, o texto do aviso "sem início", o C-4b e a asserção 12/8 no mesmo diff |
| R-C: resumo com LB0 parcial na contagem | especialista-obra | **corrigido** na rodada 03 (só folhas) |
| Data inválida → "Invalid time value" | seguranca | **corrigido** na rodada 03 |
| Tipo de vínculo `constructor`/`toString` | auditoria | **corrigido** na rodada 03 (`Object.hasOwn`) |
| P-1 a P-5 do especialista (rodada 01) | especialista-obra | P-1 e P-2: avisos de LB0 separados e C-4b (rodada 02). P-3: "2007–2016; 2019 a confirmar". P-4: formatos percentuais fora de tempo corrido. P-5: = R-A |
| Borda: feriado legado avulso no período de recorrente sem lista própria | arquiteto | ciclo **00004** (expansão pela regra) |
| Formato do lag reescrito como 7 no export | rodada 03 | ciclo **00004** (E3 preserva o formato original; o aviso some) |
| Vínculo para tarefa inativa bloqueia o export; `ActualStart` com % = 0 descartado; erros além dos 5 primeiros somem dos avisos | plano §12 (sem evidência no corpus) | ciclo próprio de `/corrigir`, a abrir depois da Fase 1 |
| Unificar `MAX_XML_BYTES` e `MAX_MSPDI_CHARS`; parse duplo | arquiteto / seguranca | ciclo **00004** ou ajuste de faixa 1 após o merge com o 00002 |

## Validação de outras áreas
- **Segurança da Informação:** endurecimento do parser (S-1 a S-3, S-7, S-8), com as medições acima.
- **Jurídico:** amostra do corpus LGPL-2.1 no repositório (hoje só local); MPXJ no backend (RF-06.6).
