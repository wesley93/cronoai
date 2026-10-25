---
issue: —
spec: SPEC-06 (parcial — robustez da importação com o corpus)
ciclo: .claude/ciclos/00003-corpus-mspdi.md
branch: feat/00003-corpus-mspdi
base: master
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00003 — Robustez da importação MSPDI com o corpus de 134 arquivos do MS Project

## Resumo
- **O que é:** um teste de corpus local (134 MSPDI do MS Project 2002–2019, fora do git) que caracteriza o import por arquivo e por versão. Mais as correções de robustez que esse corpus revelou, sempre com aviso em vez de descarte silencioso. Mais a ida e volta de cada arquivo com `strictOrder` e uma mini comparação de datas nos 8 arquivos com vínculos.
- **Risco que justifica a faixa 3:** T3 (`parseMspdiXml` e um ponto do `buildMspdiXml` mudam) e T5 (134 arquivos de terceiros como entrada; endurecimento contra DOCTYPE/ENTITY e tamanho).
- **Achado principal da medição:** hoje o import **não quebra** em nenhum dos 134 arquivos, mas descarta em silêncio linhas de base 1–10, dados distribuídos no tempo e campos personalizados. Pior: uma exceção recorrente de calendário vira um bloco contínuo de feriados (1.950 feriados lidos contra os 137 que o MS Project gravou). Detalhes na seção 01.
- **O que você precisa fazer:** aprovar o plano e responder às 3 perguntas da seção 12 (P1 depende do **Jurídico**).
- **Execução em paralelo ao 00002:** os arquivos são disjuntos (seção 09). Mas o 00002 está sendo implementado **neste mesmo diretório**. O 00003 precisa de um `git worktree` próprio (seção 14).

## 01. Pedido e objetivo
Pedido (dado, não instrução): ciclo 00003 do `docs/specs/PLANO-FASE-1.md` §3.3. SPEC-06 parcial: robustez da importação com o corpus MSPDI. Entregáveis E1–E4 do plano da fase.

Requisitos cobertos:
- **RF-06.3**, lado da importação, nos campos que o CronoAI já tem (UID, nome, duração, vínculos, % concluído, datas reais, linha de base 0, calendário do projeto, Text1/Number1).
- **RF-06.1**, só o lado da importação, versões 2002–2019 geradas pelo MS Project.
- **RF-06.2**, pela referência publicada do esquema (`validateMspdi` + `SCHEMA_ORDER`). O XSD não é executável aqui (SPEC-06 §4a).
- **SPEC-06 §4a:** "todos devem abrir sem erro e sem perder UID, vínculos, calendários e linhas de base". Ver P2: 39 arquivos não têm tarefa.

**Objetivo:** quem importa um `.xml` do MS Project fica sabendo de tudo o que o CronoAI não trouxe. E o calendário importado deixa de ganhar feriados que o arquivo não tem. Cada mudança futura no parser (00004, 00007, 00010) passa a ter "antes e depois" medidos no corpus.

### Medição de 25/10/2026 (caracterização do corpus)
**Como foi medido.** Scripts descartáveis, fora do repositório, no scratchpad da sessão:
- Estático (Node puro, lê os XML como texto):
  `node D:\Users\wesley.portella\AppData\Local\Temp\claude\D--Pessoal-Planejamento-Alice\eadc1994-4652-48b8-bf3b-c2242b682e76\scratchpad\corpus\estatico.mjs D:\Pessoal\Planejamento\Alice\referencias\mpxj-mspdi <saida.json>`
- Parser atual (Vitest + jsdom, config com `root` no repo, `cacheDir` e testes no scratchpad), rodado na raiz do `cronoai/`:
  `CORPUS_DIR=D:/Pessoal/Planejamento/Alice/referencias/mpxj-mspdi SAIDA_JSON=<saida.json> npx vitest run --config D:\Users\wesley.portella\AppData\Local\Temp\claude\D--Pessoal-Planejamento-Alice\eadc1994-4652-48b8-bf3b-c2242b682e76\scratchpad\corpus\vitest.corpus.config.mjs`
  Arquivos de teste: `caracterizar.corpus.test.ts`, `detalhe.corpus.test.ts`, `duracao.corpus.test.ts`, `e4.corpus.test.ts` e `perf.corpus.test.ts`, na mesma pasta.
- Código medido: `src/lib/msProjectXmlParser.ts` da branch `feat/00001-e2e-cobertura`, idêntico ao da `master` (`git diff --stat master` não lista o arquivo).
- Nada foi gravado no repositório pelos scripts.

**Corpus.** MPXJ, commit `421a11b`, LGPL-2.1 (`referencias/README.md`). 134 arquivos, 16,7 MB no total. Maior arquivo: `mspditimephased.xml`, 744.560 bytes. Profundidade máxima: 8 níveis. **0/134 com `<!DOCTYPE>` ou `<!ENTITY>`.** 134/134 no namespace MSPDI. `MinutesPerDay`: 480 em 132 arquivos e 450 em 2.

| Versão | `SaveVersion` | Arquivos | Importados | Recusados ("Nenhuma tarefa") | Tarefas lidas | Vínculos lidos/no arquivo | % > 0 lido/arquivo | LB0 lida/arquivo | LB 1–10 ignoradas | `TimephasedData` ignorados | Ida e volta `strictOrder` sem erro |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 2002 | — | 9 | 3 | 6 | 88 | 0/0 | 2/2 | 1/1 | 50 | 458 | 3/3 |
| 2003 | — | 19 | 13 | 6 | 344 | 8/8 | 2/2 | 1/1 | 50 | 934 | 13/13 |
| 2007 | 12 | 20 | 13 | 7 | 344 | 8/8 | 2/2 | 1/1 | 50 | 934 | 13/13 |
| 2010 | 14 | 21 | 14 | 7 | 402 | 8/8 | 2/2 | 2/2 | 80 | 915 | 14/14 |
| 2013 | 14 | 17 | 14 | 3 | 402 | 8/8 | 2/2 | 2/2 | 80 | 940 | 14/14 |
| 2016 | 14 | 17 | 14 | 3 | 402 | 8/8 | 2/2 | 2/2 | 80 | 942 | 14/14 |
| 2019 | 14 | 19 | 14 | 5 | 402 | 8/8 | 2/2 | 2/2 | 80 | 940 | 14/14 |
| outros (`junit/data/*.xml`, `legacy/`) | —/14/12 | 12 | 10 | 2 | 97 | 5/5 | 24/24 | 0/0 | 0 | 4.159 | 10/10 |
| **Total** | | **134** | **95** | **39** | **2.481** | **53/53** | **38/38** | **11/11** | **470** | **10.222** | **95/95** |

Notas: "% > 0", "LB0" e datas reais contam só folhas. Datas reais lidas/arquivo: início 38/38 e término 11/11. LB0 conta tarefas com `<Baseline><Number>0</Number>` e `<Start>`.

**O que já funciona (não muda):**
- Nenhuma exceção não tratada nos 134 arquivos.
- Nenhum UID perdido nem duplicado (2.481/2.481).
- Nenhum vínculo perdido (53/53).
- Nenhum erro de validação bloqueante e nenhum aviso "Ignorado:".
- Vínculos: tipos FS 32, FF 7, SF 7, SS 7. `LagFormat` 7 (41) e 9, semanas úteis (12). `lagToWorkingDays` trata os dois certo. Nenhum lag em dias corridos, em % ou negativo no corpus.
- Restrições: só `ConstraintType` 0 (2.447) e 4 (171). Nenhum `Deadline`, `CrossProject` ou `WorkWeek`.

**Avisos emitidos hoje (95 importados):** data de status ausente 95; calendário sem feriados (aplica os nacionais) 95; arquivo sem custos 85; `MinutesPerDay` ≠ 480 em 2. **Nenhum** aviso sobre o que se perde.

**Descarte silencioso ou dado errado (o que o E2 corrige):**

| # | Achado | Onde no código | Corpus |
|---|---|---|---|
| A1 | **Exceção recorrente vira bloco contínuo.** `collect` expande `FromDate..ToDate` inteiro (`:520-526`). Nos arquivos 2007+, o MS Project já grava cada ocorrência nos `WeekDay DayType=0` legados. O aviso de `:529` diz "sem expandir as repetições", mas o código marca o intervalo inteiro. O limite de 400 dias de `expandRange` (`:471-479`) também corta em silêncio | `msProjectXmlParser.ts:513-529`, `:471-479` | 4 arquivos (`calendar-recurring-exceptions` 2007–2016), 27 exceções recorrentes cada. Com uma tarefa fictícia injetada só em memória: **1.950 feriados lidos contra 137** datas gravadas pelo MS Project (+1.813). **65 dias úteis extras contra 3** |
| A2 | Linhas de base 1–10 ignoradas sem aviso | `:560` (só `Number` 0) | 470 elementos em 47 tarefas, 7 arquivos (`task-baselines`) |
| A3 | **LB0 incompleta perde o início na volta.** O import lê só o início; o export só grava `<Baseline>` com início **e** término | import `:595-597`; export `:221-230` | Tarefas 34 e 78 (2010–2019) e 34 (2002–2007): 7 arquivos |
| A4 | `TimephasedData` ignorados sem aviso | não lido | 10.222 elementos em 95 arquivos; 348 em tarefas, 11 arquivos |
| A5 | Duração em tempo corrido convertida como horas úteis: 1 dia corrido = `PT24H` vira 3 dias úteis; 1 mês corrido = `PT720H` vira 90 | `:585` (`fromDuration` sem olhar `DurationFormat`) | 5 tarefas, `mspdiduration.xml` (UIDs 6–10) |
| A6 | Duração menor que meio dia vira marco (0 dia) | `:585` (`Math.round`) | 4 tarefas, `mspdiduration.xml` (UIDs 1, 2, 6 e 7: 1 min e 1 h) |
| A7 | Duração fracionária arredondada sem aviso | `:585` | cerca de 20 tarefas em 4 arquivos (número exato fixado no E1) |
| A8 | Text1/Number1 lidos como SINAPI/lead time mesmo sem apelido "SINAPI"/"lead" no arquivo | `:503-511`, `:593-594` | 6 tarefas em 6 arquivos (Text1); 6 em 6 (Number1) |
| A9 | Campos personalizados (exceto Text1/Number1) ignorados sem aviso | `:561` | 1.310 valores, 121 `FieldID` distintos, 48 arquivos |
| A10 | Tarefa com calendário próprio importada no calendário do projeto sem aviso | não lido (`CalendarUID` da tarefa) | 1 tarefa, `mspditimephasedsegments.xml`. 60 arquivos têm mais de 1 calendário |
| A11 | Tarefa nula (`IsNull`=1, linha em branco) descartada sem aviso; ela tem UID | `:553` | 3 tarefas, `mspdinulltasks.xml` |

**Recusados (39):** todos com a mensagem em português "Nenhuma tarefa encontrada no XML." (`:609`). São arquivos só de calendário ou de recursos: `calendar-calendars` 7, `calendar-recurring-exceptions` 4, `resource-*` 26, `mspdiavailability.xml` e `mspdicostratetable.xml`. Ver P2.

**Ida e volta, medida com o caminho da store** (preenche a LB0 que falta e reprograma):
- 95/95 passam em `validateMspdi(…, { strictOrder: true })` com `errors` vazio.
- 87/95 voltam idênticos em UID, nome, vínculo (UID e tipo), lag, % concluído, datas reais, duração e LB0.
- Os 8 restantes diferem só na LB0. Em 7 é o A3. No `mspdinulltasks.xml`, as tarefas-resumo 1 e 6 **ganham** LB0 pelo *rollup* das filhas: é dado derivado, não perda.

**Mini comparação de datas (E4)**, 8 arquivos com vínculos, 104 folhas com datas no arquivo, `computeSchedule` no modo `baseline` com o calendário importado:
- **83/104** iguais ao arquivo.
- Sem os feriados nacionais que o import aplica quando o arquivo não traz nenhum: **100/104**.
- Diferenças:
  - 16 no `task-links-project2016` (Carnaval 08–09/02/2016);
  - 1 no `task-links-project2019` (Finados 02/11/2018);
  - 1 no `mspdirelations.xml` (UID 5: tarefa de 1 dia que cruza o fim de semana, efeito de hora);
  - 3 no `mspdiresource.xml` (UIDs 2–4, durações guiadas por recurso, ex.: `PT57H8M24S`).
- Observação para a 00004: no modo `forecast` com a data de status igual ao início, todas as tarefas dos `task-links` saem 1 dia depois (0/16).

**Desempenho (jsdom no Node 26, só para dimensionar o teste):**
- 572 KB / 110 tarefas: o parse leva 1,9 s. O `DOMParser` leva 0,6 s, e o `parseMspdiXml` analisa o XML duas vezes, porque chama `validateMspdi` (`:486`).
- Parse dos 95 importados: 44,8 s no total.
- MSPDI sintético de 3.000 tarefas (3,9 MB, fictício): parse em 13,7 s.
- O RNF-06.2 (3.000 tarefas em menos de 3 s) **não** foi medido no navegador e fica fora deste ciclo (seção 14).

### Contexto para execução (ler antes)
| Arquivo | Por quê |
|---|---|
| `src/lib/msProjectXmlParser.ts:341-458` | `parseXml` (`:365-369`) e `validateMspdi`: S-1 e S-2 entram aqui; não mudar as regras de validação existentes |
| `src/lib/msProjectXmlParser.ts:460-629` | `parseMspdiXml`: calendário (`:513-529`), tarefas (`:547-607`) e avisos (`:609-616`). Imitar o padrão dos avisos que já existem (contador + uma frase no fim) |
| `src/lib/msProjectXmlParser.ts:155-232` | `taskNode`: único ponto do export que muda (A3, `:221-230`) |
| `src/lib/msProjectXmlParser.test.ts:81-125` | XML fictício montado no teste; imitar para os casos novos |
| `src/lib/core.test.ts:100-127` | Ida e volta do seed: **não pode mudar** |
| `src/lib/useMsProject.ts:6, 27-44` | `MAX_XML_BYTES` e um toast por aviso. **Não editar** (o 00002 usa este arquivo) |
| `src/stores/useProjectStore.ts:67-70, 725-744` (na `master`) | `baselineFor(…, onlyMissing)` e `importXml`: devolvem `result.warnings` sem persistir. **Não editar** |
| `src/lib/evm.ts:49` | `plannedFraction` devolve 0 sem início **ou** término da LB: é o efeito do A3 que o aviso descreve |
| `vite.config.ts` (bloco `test`) | `include: ['src/**/*.test.ts']` e cobertura de `src/lib/**/*.ts` sem `*.test.ts`: o teste de corpus precisa morar num `*.test.ts`, com os auxiliares dentro dele |
| `.claude/rules/msproject-mspdi.md`, `.claude/rules/testes.md` | Regras que este ciclo atualiza |
| `D:\Pessoal\Planejamento\Alice\referencias\README.md` | Origem, commit e licença do corpus |

## 02. Triagem
- **T1 NÃO:** `cpm.ts` e `calendar.ts` não mudam. **Atenção:** a correção A1 muda o **calendário entregue pelo import** em arquivos com exceção recorrente. As datas calculadas depois do import mudam nesses arquivos. Isso é tratado como caso de referência (seção 04), com o antes e o depois no PR (PLANO-FASE-1 §3.3, "Risco de números").
- **T2 NÃO:** `evm.ts` não muda. A3 mantém o comportamento de hoje (PV 0 na tarefa com LB0 incompleta, `evm.ts:49`) e passa a avisar.
- **T3 SIM:** `parseMspdiXml` (A1–A11) e `taskNode` (A3, `:221-230`).
- **T4 NÃO:** o formato do estado não muda. Os avisos não são persistidos: `importXml` só os devolve (`useProjectStore.ts:743`), e o log grava a contagem de tarefas (`:742`).
- **T5 SIM:** 134 arquivos de terceiros como entrada do teste. Recusa de DOCTYPE/ENTITY e limite de tamanho dentro do parser (S-1, S-2). Limite de dias expandidos no calendário (S-3).
- **T6 NÃO:** `fieldAi.ts` e `approveReport` intocados.
- **T7 NÃO:** sem mudança em CI, Docker ou `vite.config.ts`. O teste de corpus é pulado no CI pela ausência de `CRONOAI_REF_DIR`.
- **T8 NÃO:** sem backend.

**Faixa 3 confirmada (T3, T5).** Validação: `testes`, `arquiteto` (revisão), `especialista-obra`, `seguranca` e auditoria independente.

## 03. Decisões de design
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Teste de corpus em `src/lib/msProjectXmlParser.corpus.test.ts` (novo), com `describe.skipIf(!process.env.CRONOAI_REF_DIR)`. Corpus em `${CRONOAI_REF_DIR}/mpxj-mspdi/` | Pasta `tests/`; script Node à parte | `vite.config.ts` só inclui `src/**/*.test.ts`. A variável aponta para `referencias/`, como prevê o PLANO-FASE-1 §1 (a 00006 usa a mesma, com `sinapi/`). O pulo é condicional e tem motivo (`testes.md`: "skip só com o motivo"), não é `it.skip` |
| Auxiliares do teste de corpus (varredura, contagens, relatório) **dentro** do `*.corpus.test.ts` | Arquivo auxiliar `src/lib/mspdiCorpus.ts` | Um `.ts` auxiliar em `src/lib` entra na cobertura e fica sem execução no CI: derruba o limiar de 80% |
| Um `describe` por arquivo (`describe.each`), `timeout` de 30 s por teste | Um único `it` para os 134 | A medição levou 102 s num `it` só e estourou o RPC do Vitest. Por arquivo, a falha aponta o arquivo |
| Varredura só de `*.xml` sob `mpxj-mspdi/`, pulando `.git`. Arquivo acima de `MAX_MSPDI_CHARS` reprova o teste | Ler qualquer arquivo | Entrada de terceiros: o teste só lê dados, nunca executa nada deles |
| **Inventário fixo** do corpus (134 arquivos; 95/39; 2.481 tarefas; 53 vínculos; 38/38; 11/11; 470; 10.222…) afirmado com `toBe`, com comentário citando o commit `421a11b` do MPXJ | Só "não lança" | Asserção de direção não prova nada (`testes.md`). O inventário é a régua de "antes e depois" da 00004, 00007 e 00010. Corpus diferente faz o teste falhar de propósito |
| Relatório de caracterização em `test-results/corpus-mspdi/relatorio.md` e `relatorio.json`, gravado no `afterAll`. O orquestrador copia a tabela por versão para o ciclo `00003-corpus-mspdi.md` | Gravar direto em `.claude/ciclos/`; `console.log` | Teste não escreve em arquivo versionado. `test-results/` já está no `.gitignore` e no `.dockerignore` (00001). O `validar-regras.mjs` acusa `console.log`. O relatório só tem nomes de arquivo e contagens, nada do conteúdo |
| **A1 — exceções recorrentes:** `<Exception>` com `Occurrences` > 1 **não** expande `FromDate..ToDate`. As datas vêm dos `WeekDay DayType=0` legados, que o MS Project 2007+ grava já expandidos. Sem lista legada no calendário, a recorrente não é aplicada e gera aviso. Não recorrente continua como hoje | Implementar a expansão pela regra (`Type`, `Period`, `DaysOfWeek`, `MonthItem`…); manter o comportamento de hoje só trocando o texto do aviso | A lista legada é a expansão do próprio MS Project: nos 4 arquivos, ela bate com a soma das ocorrências (137 datas não úteis e 3 úteis). A expansão pela regra é semântica de calendário: vai para a 00004 (E3, calendários) ou a 00005. Manter o bloco contínuo deixa o dado errado |
| **A3 — LB0 incompleta:** o import mantém o que existe (sem inventar término) e avisa. O export grava `<Baseline>` com `Number` e a(s) data(s) presentes. `Duration` só quando há as duas datas, como hoje | Descartar a LB0 incompleta e deixar a store calcular | Descartar troca dado do arquivo por dado calculado. A ordem `Number, Start, Finish, Duration…` continua a de `SCHEMA_ORDER.Baseline`; todos os filhos são opcionais no esquema. O seed não muda (toda tarefa tem as duas datas) |
| A5–A7 — durações: **só aviso**, sem mudar o valor importado. Detecção pelos minutos brutos da `Duration` e pelo `DurationFormat` (4/6/8/10/12 e estimados 36/38/40/42/44 = corrido) | Converter certo agora | Converter dia corrido e fração de dia é semântica da SPEC-05 (00004: minutos e `edays`). Mudar o valor aqui mudaria números (T1) |
| A8 — aviso quando Text1/Number1 são lidos pelo `FieldID` padrão sem apelido correspondente. Leitura inalterada | Deixar de ler Text1 sem apelido | Mudaria o que o import entrega para quem já usa Text1 = SINAPI sem apelido. O mapeamento configurável é o RF-06.4 (00010) |
| A9 e A4 viram **um único aviso informativo** (depende da P3) | Um aviso por categoria | Cada aviso vira um toast (`useMsProject.ts:37`). Com A1–A11 separados, um arquivo comum mostraria 6 ou mais toasts. Agrupar no parser não toca a tela (o 00002 está nela) |
| Avisos novos só com números, UIDs e nomes de elemento MSPDI. Nunca com texto vindo do arquivo | Citar o nome da exceção ou da tarefa | Texto do XML é dado (Inviolável 4). Evita levar conteúdo externo para o toast |
| Contrato preservado: `parseMspdiXml(xmlText): MspdiImportResult`, com `warnings: string[]`. Erros são `Error` com mensagem em português | Tipo de aviso estruturado (`{ codigo, n }`) | O 00002 ("criar obra a partir de `.xml`") consome este contrato agora. Aviso estruturado pode vir com o painel de divergências da 00004 |
| **S-1:** `parseXml` recusa texto com `<!DOCTYPE` ou `<!ENTITY` **antes** do `DOMParser`, com erro em português. Vale para `validateMspdi` e `parseMspdiXml` | Confiar no `DOMParser` | O comportamento com entidade interna varia entre motores (Chromium/libxml2 × jsdom/saxes). O MS Project não gera DOCTYPE (0/134), então não há falso positivo. Fecha XXE e "billion laughs" |
| **S-2:** `MAX_MSPDI_CHARS = 15 * 1024 * 1024` exportado do parser. `parseMspdiXml` recusa texto maior antes do parse | Mover `MAX_XML_BYTES` de `useMsProject.ts` para o parser | Defesa em profundidade: o 00002 abre outro caminho de entrada. Unificar as duas constantes exige editar `useMsProject.ts`, que o 00002 usa: fica para depois do merge dos dois (seção 14). Um arquivo que passa no limite de bytes passa no de caracteres (caracteres ≤ bytes em UTF-8) |
| **S-3:** limite de 400 dias por exceção mantido (`expandRange`), agora com aviso. Limite novo `MAX_CALENDAR_DAYS = 10_000` no total de feriados mais dias úteis extras, com aviso | Sem limite total | Um arquivo de 15 MB com milhares de exceções de 400 dias trava a aba. O maior calendário legado do corpus tem 558 entradas. 10.000 dias são cerca de 27 anos de dias corridos |
| Profundidade: **sem** limite novo. Teste com aninhamento de 2.000 níveis prova que o parse termina com erro em português | Limitar a profundidade | O import é iterativo (`kids`), sem recursão. A recursão só existe no export (`render`), sobre dado próprio. O corpus chega a 8 níveis |
| Arquivos sem tarefa (39): recusa mantida, com a mesma mensagem (depende da P2) | Aceitar projeto vazio | Na store, um projeto vazio apagaria a EAP da obra (`importXml` troca `state.tasks`) |
| E3 com o resultado do parse **sem** o preenchimento de LB0 da store: parse → `computeSchedule` (`forecast`) → `buildMspdiXml` → `validateMspdi(strictOrder)` → parse | Reproduzir o `baselineFor` da store | O E3 testa o parser. O `baselineFor` é privado da store, e a LB0 derivada da tarefa-resumo é dado calculado, não do arquivo |

ADR: não se aplica (robustez do parser, sem decisão estrutural).

## 04. Caso de referência (T1/T2)
T1/T2 = NÃO: o motor não muda. Mas o import entrega dados diferentes em A1 e A3. Os casos abaixo fixam esses dados com XML **fictício montado no teste**. Os números do corpus da seção 01 entram como inventário no teste de corpus.

| Caso | Entrada (XML fictício) | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| C-1 (A1) | Calendário com `<Exception>` "Natal" anual (`Type` 2, `Month` 12, `MonthDay` 25, `Occurrences` 3, 2026-12-25 a 2028-12-25) e as 3 datas também nos `WeekDay DayType=0` legados. Uma tarefa | `calendar.holidays` = `['2026-12-25','2027-12-25','2028-12-25']`. **Hoje:** 400 datas seguidas, de 2026-12-25 a 2028-01-28 | Expansão gravada pelo próprio MS Project (lista legada). Corpus: 137 datas legadas × 1.950 lidas hoje | `msProjectXmlParser.test.ts` › exceções recorrentes |
| C-2 (A1) | Igual ao C-1, **sem** a lista legada, mais uma exceção simples em 2026-11-20 | `holidays` = `['2026-11-20']`. Aviso `"1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras."` | Sem a expansão do MS Project, não inventar datas | idem |
| C-3 (A1) | Exceção recorrente **útil** (1º sábado do mês, `Type` 5, `Occurrences` 3, 2027-01-02 a 2027-03-06) e as 3 datas nos legados com `DayWorking` 1 | `extraWorkingDays` = `['2027-01-02','2027-02-06','2027-03-06']`. **Hoje:** 64 dias | idem C-1. Corpus: 3 × 65 | idem |
| C-4 (A3) | Tarefa com `<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start></Baseline>`, sem término | Import: `baselineStart` `'2026-03-02'`, `baselineFinish` `undefined`. Aviso `"1 tarefa(s) com linha de base 0 incompleta (sem início ou sem término): o valor planejado (PV) delas fica zero."`. Export da tarefa: `<Baseline>` com `<Number>0</Number>` e `<Start>2026-03-02T08:00:00</Start>`, sem `<Finish>`. `validateMspdi(…, { strictOrder: true }).errors` = `[]`. Reimport: `baselineStart` `'2026-03-02'` | `evm.ts:49`. Corpus: UIDs 34/78 dos `task-baselines` | `msProjectXmlParser.test.ts` › LB0 incompleta (ida e volta) |
| C-5 (A2) | Tarefa com `Baseline` `Number` 0, 1 e 2 | LB0 lida como hoje. Aviso `"Linhas de base 1 a 10 não importadas em 1 tarefa(s): o CronoAI usa só a linha de base 0."` | Corpus: 47 tarefas, 7 arquivos | idem › linhas de base |
| C-6 (A5–A7) | Tarefas: `PT24H0M0S` com `DurationFormat` 8; `PT1H0M0S` com 5; `PT12H0M0S` com 7 (`MinutesPerDay` 480) | `durationDays` 3, 0 e 2 (**iguais a hoje**). Avisos `"1 tarefa(s) com duração em tempo corrido convertida como horas úteis: revise as durações."`, `"1 tarefa(s) com menos de meio dia de duração importada(s) como marco (0 dia)."` e `"1 duração(ões) fracionária(s) arredondada(s) para dias úteis inteiros."` | MSPDI: `DurationFormat` 8 = dias corridos. Corpus: `mspdiduration.xml` | idem › durações |
| C-7 (A8) | Tarefa com `ExtendedAttribute` `FieldID` 188743731 = `'X-1'` e sem apelido no projeto | `sinapi` `'X-1'` (igual a hoje). Aviso `"Text1 lido como código SINAPI em 1 tarefa(s) sem apelido 'SINAPI' no arquivo: confira."`. Com apelido "Código SINAPI": sem aviso | Corpus: 6 arquivos | idem › campos personalizados |
| C-8 (A10, A11) | Tarefa com `CalendarUID` 2; tarefa com `IsNull` 1 | Avisos `"1 tarefa(s) com calendário próprio importada(s) no calendário do projeto."` e `"1 linha(s) em branco (tarefa nula) ignorada(s)."` | Corpus: `mspditimephasedsegments.xml`, `mspdinulltasks.xml` | idem |
| C-9 (A4, A9, P3 = recomendação) | 1 `TimephasedData` em atribuição e 2 `ExtendedAttribute` com `FieldID` 188743734 | Um aviso: `"Não importado do MS Project: 1 registro(s) distribuído(s) no tempo (TimephasedData); 2 valor(es) de 1 campo(s) personalizado(s)."` | Corpus: 95 e 48 arquivos | idem |
| C-10 (seed) | `buildMspdiXml` da obra de exemplo | Exportação **idêntica** à de hoje, salvo `CreationDate`/`LastSaved`. `core.test.ts:105-127` sem mudança | Regra de não regressão | `core.test.ts` (inalterado) + R-2 |

Os textos exatos dos avisos podem ser ajustados na implementação. O dev registra o texto final no checkpoint, e cada teste afirma o texto com o número.

## 05. MS Project e arquivos (T3)
- **Arquivo de exemplo:** XML fictício montado nos testes (C-1 a C-9) e a obra de exemplo (C-10). O corpus do MPXJ é referência local, fora do git (P1).
- **Preservado na ida e volta (E3, por arquivo do corpus):** UID, nome, vínculos (UID da predecessora e tipo), lag em dias, % concluído, início e término reais, duração em dias e LB0 das folhas. Depois do A3, a LB0 incompleta também.
- **Não preservado, conhecido e avisado:** LB 1–10 (00007), `TimephasedData`, campos personalizados além de Text1/Number1 (00010), calendário por tarefa e semana do calendário (00004), formato original do lag (export grava `LagFormat` 7), ID (renumerado pela EAP).
- **Elementos novos no `SCHEMA_ORDER`:** nenhum. A3 usa `Baseline` › `Number`, `Start`, `Finish`, que já existem.
- **Comportamento esperado no MS Project:** sem mudança para o seed. A tarefa com LB0 incompleta abre com "Início da linha de base" preenchido e "Término da linha de base" vazio (NA). Abrir no MS Project real: **`M-1` `NOT_RUN`** (sem acesso). O RF-06.1, lado do export, continua pendente.
- **Avisos ao usuário no import:** seção 04, C-2 e C-4 a C-9, e S-3. Todos entram em `warnings`, que o `useMsProject.ts` já mostra como toast.

## 06. Estado salvo (T4)
Não se aplica. O formato não muda, e os avisos não são persistidos.

## 07. Dados (T8 com banco)
Não se aplica: sem backend.

## 08. Segurança
| Superfície | Ameaça | Mitigação | Teste |
|---|---|---|---|
| `parseXml` (import e validação) | XXE (entidade externa), "billion laughs" (expansão de entidade interna) | S-1: recusa `<!DOCTYPE`/`<!ENTITY` antes do `DOMParser`. Mensagem: `"Arquivo XML com declaração DOCTYPE/ENTITY não é aceito (o MS Project não gera esse conteúdo)."` | DOCTYPE com `<!ENTITY x SYSTEM "file:///c:/windows/win.ini">` e com entidade interna aninhada: `parseMspdiXml` lança a mensagem; `validateMspdi` devolve `valid` false com ela. Corpus: 0/134 recusados por isso |
| Tamanho | Travar a aba com texto gigante | S-2: `MAX_MSPDI_CHARS` (15 MiB) no `parseMspdiXml`, antes do parse. O limite de bytes de `useMsProject.ts` continua como primeira barreira | Texto com `MAX_MSPDI_CHARS + 1` caracteres lança `"Arquivo muito grande: o limite para importação é de 15 MB."` |
| Calendário | Expansão de datas sem fim (CPU e memória) | S-3: 400 dias por exceção (já existe) e `MAX_CALENDAR_DAYS` = 10.000 no total, os dois com aviso | Exceção de 2026-01-01 a 2028-12-31 = 400 dias + aviso. 30 exceções de 400 dias = 10.000 dias + aviso |
| Profundidade | Estouro de pilha | Import iterativo, sem limite novo | 2.000 níveis dentro de `<Project>`, sem `<Tasks>`: lança `"Elemento <Tasks> ausente."` (bloqueante de `:487`), sem erro não tratado |
| Texto do arquivo nos avisos | Conteúdo externo levado à tela | Avisos só com números, UIDs e nomes de elemento | Revisão (S-4) |
| Teste de corpus | Ler ou executar algo de terceiros | Só `*.xml` sob `mpxj-mspdi/`, `.git` pulado, limite de tamanho, só `DOMParser`. Grava só em `test-results/` | Revisão (S-5) |
| Dependências | Pacote novo | Nenhum | `auditar-dependencias.mjs --base {BASE}` sem pacote novo (S-6) |

Validação com a **Segurança da Informação**: não exigida pelo ciclo, sem superfície nova em produção. O `seguranca` confere S-1 a S-6 no diff.

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| E1 | Teste de corpus e caracterização "antes" | Só teste novo; nenhum código de produção | AC-1, AC-2, AC-3 | `test(mspdi): teste de corpus local com os 134 MSPDI do MPXJ (ciclo 00003)` |
| E2 | Robustez do import com aviso + endurecimento | `msProjectXmlParser.ts` + testes unitários + inventário do corpus atualizado (antes → depois) | AC-4, AC-5, AC-6, AC-9, AC-10 | `fix(mspdi): avisa o que o import não preserva e corrige exceções recorrentes (ciclo 00003)` |
| E3 | Ida e volta de cada arquivo do corpus | Só teste | AC-7 | `test(mspdi): ida e volta com strictOrder nos arquivos do corpus (ciclo 00003)` |
| E4 | Mini comparação de datas + documentação | Teste + `.claude/rules/msproject-mspdi.md`, `.claude/rules/testes.md` (+ SPEC-06 §4a se P2 = A) | AC-8, AC-11 | `test(mspdi): comparação de datas nos arquivos com vínculos e docs (ciclo 00003)` |

São cerca de 13 tarefas e 6 arquivos, abaixo do limite de quebra. Os 4 entregáveis seguem o PLANO-FASE-1 §3.3, que você aprovou. Cada um passa no `npm run ci` sozinho, porque no CI o corpus é pulado.

**Arquivos deste ciclo:** `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts`, `src/lib/msProjectXmlParser.corpus.test.ts` (novo), `.claude/rules/msproject-mspdi.md`, `.claude/rules/testes.md` e, com P2 = A, `docs/specs/SPEC-06-integracao-ms-project.md` (§4a).

**Arquivos em comum com o 00002: nenhum.** A ficha do 00002 (`.claude/ciclos/00002-multiobra-ficha.md`, tarefa 17) edita `CLAUDE.md`, `README.md`, `frontend-geral.md`, `arquiteto.md` e `divida-conhecida.md`. Por isso **este ciclo não edita** `CLAUDE.md` nem `divida-conhecida.md`: a dívida nova fica registrada em `msproject-mspdi.md`. O 00002 também não toca o parser (R-4 da ficha dele).

**Pontos de contato sem conflito de arquivo:**
- `useMsProject.ts` e `useProjectStore.ts`: o 00002 mexe neles e o 00003 não. O contrato `parseMspdiXml` → `warnings: string[]` + `Error` não muda.
- Depois dos dois merges: unificar `MAX_XML_BYTES` (`useMsProject.ts:6`) com `MAX_MSPDI_CHARS` (seção 14).

## 10. Tarefas
| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | E1 | Esqueleto do teste de corpus: `describe.skipIf`, varredura de `${CRONOAI_REF_DIR}/mpxj-mspdi` (só `.xml`, sem `.git`, limite de tamanho), `describe.each` por arquivo, `timeout` de 30 s, `afterAll` que grava `test-results/corpus-mspdi/relatorio.{md,json}` (por versão e por arquivo: versão, `SaveVersion`, KB, tarefas, vínculos, LB0, LB 1–10, `TimephasedData`, resultado, avisos, ms). Conferir `npm run typecheck` e `npm run lint` com `node:fs`/`process` (se faltar tipo: `/// <reference types="node" />` no arquivo) | dev-frontend | `src/lib/msProjectXmlParser.corpus.test.ts` | — |
| 2 | E1 | Por arquivo: parse sem exceção não tratada; recusa só com a mensagem `:609` (P2); UIDs únicos; tarefas, vínculos (UID e tipo), % > 0, datas reais e LB0 lidos = presentes. Inventário total com `toBe` (seção 01). Rodar e registrar no checkpoint a tabela "antes" e os números que divergirem da medição (com o motivo) | dev-frontend | idem | 1 |
| 3 | E2 | S-1 (DOCTYPE/ENTITY em `parseXml`) e S-2 (`MAX_MSPDI_CHARS`), com testes | dev-frontend | `msProjectXmlParser.ts`, `msProjectXmlParser.test.ts` | 2 |
| 4 | E2 | A1 (recorrentes pela lista legada; aviso sem lista; texto de `:529` substituído) e S-3 (aviso nos 400 dias; `MAX_CALENDAR_DAYS`), com C-1, C-2, C-3 e os testes de S-3 | dev-frontend | idem | 3 |
| 5 | E2 | A2 e A3 (import com aviso; `taskNode` grava a LB0 parcial), com C-4 e C-5, incluindo `strictOrder` | dev-frontend | idem | 3 |
| 6 | E2 | A5, A6 e A7 (avisos de duração pelos minutos brutos e pelo `DurationFormat`, sem mudar o valor), com C-6 | dev-frontend | idem | 3 |
| 7 | E2 | A8, A10 e A11, com C-7 e C-8 | dev-frontend | idem | 3 |
| 8 | E2 | A4 + A9 conforme a P3, com C-9 | dev-frontend | idem | 3 |
| 9 | E2 | Teste de corpus: "sem descarte silencioso" por arquivo (categoria presente ⇒ aviso com o número do arquivo). Calendários dos 11 arquivos de calendário com uma tarefa fictícia injetada **só em memória** (P2 = A): nos 4 recorrentes, `holidays` = lista legada (137) e `extraWorkingDays` = 3. Inventário atualizado com o antes → depois no checkpoint | dev-frontend | `msProjectXmlParser.corpus.test.ts` | 4–8 |
| 10 | E3 | Ida e volta por arquivo importável (seção 03, última linha): `strictOrder` com `errors` `[]` e campos da seção 05 idênticos nas folhas. Esperado: 95/95 | dev-frontend | idem | 9 |
| 11 | E4 | Nos 8 arquivos com vínculos: `computeSchedule` modo `baseline` com o calendário importado e sem os feriados nacionais, contra `Start`/`Finish` das folhas. Afirmar 83/104 e 100/104 como caracterização (mudam de propósito na 00004/00005); diferenças por UID no relatório | dev-frontend | idem | 2 |
| 12 | E4 | Docs: `msproject-mspdi.md` (avisos novos, recusa de DOCTYPE, `MAX_MSPDI_CHARS`, `MAX_CALENDAR_DAYS`, recorrentes pela lista legada como dívida até a SPEC-05, como rodar o corpus); `testes.md` (teste de corpus, `CRONOAI_REF_DIR`, relatório em `test-results/`); SPEC-06 §4a se P2 = A | dev-frontend | 2–3 arquivos de docs | 10, 11 |
| 13 | E2 | Evidência R-2: export do seed antes e depois, normalizando `CreationDate`/`LastSaved`, diff vazio (script descartável fora do repo; saída no ciclo) | orquestrador | — | 5 |

Checkpoint depois da tarefa 2: arquivos, tabela "antes" e decisão sobre divergências da medição. Conferir contra este plano antes do E2.

### Grafo
`1 → 2 → 3 → {4, 5, 6, 7, 8} → 9 → 10 → 12` · `2 → 11 → 12` · `5 → 13`.
- As tarefas 4–8 tocam o mesmo arquivo: um dev só, em sequência, com testes entre elas.
- A 11 (E4) pode vir logo depois do E1. O commit E4 sai depois do E3, para seguir a ordem dos entregáveis.

### Como rodar
- **Unitários (CI e local):** `npx vitest run src/lib/msProjectXmlParser.test.ts src/lib/core.test.ts`.
- **Corpus (só local)**, ~2–3 min no jsdom:
  - Git Bash: `CRONOAI_REF_DIR=/d/Pessoal/Planejamento/Alice/referencias npx vitest run src/lib/msProjectXmlParser.corpus.test.ts`
  - PowerShell: `$env:CRONOAI_REF_DIR='D:\Pessoal\Planejamento\Alice\referencias'; npx vitest run src/lib/msProjectXmlParser.corpus.test.ts`
  - Relatório: `test-results/corpus-mspdi/relatorio.md`.
- **CI:** sem a variável, o arquivo aparece como *skipped*. O limiar de cobertura (80% nas 4 métricas) tem de passar **só com os unitários**.

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|
| AC-1 | corpus pulado sem `CRONOAI_REF_DIR` | `msProjectXmlParser.corpus.test.ts` | `npm test` sem a variável: suíte *skipped*, 0 falhas |
| AC-2 | inventário e integridade por arquivo | idem | 134 arquivos; 95 importados; 39 recusados com `"Nenhuma tarefa encontrada no XML."`; 2.481 tarefas; 53/53 vínculos; % 38/38; início real 38/38; término real 11/11; LB0 11/11; UIDs únicos em 95/95 |
| AC-3 | relatório | idem | `test-results/corpus-mspdi/relatorio.md` com a tabela por versão (2002…2019 + outros) e uma linha por arquivo |
| AC-4 | sem descarte silencioso no corpus | idem | Cada arquivo com a categoria tem o aviso com o número do arquivo. Totais: LB 1–10 em 7 arquivos (47 tarefas); LB0 incompleta em 7; `TimephasedData` em 95; tempo corrido 5 e marco 4 (`mspdiduration.xml`); Text1 sem apelido em 6; calendário próprio em 1; nula 3 |
| AC-5 | exceções recorrentes | `msProjectXmlParser.test.ts` (C-1 a C-3) + corpus (tarefa 9) | C-1: 3 datas exatas; C-2: `['2026-11-20']` + aviso; C-3: 3 datas. Corpus: 137 feriados e 3 dias úteis extras nos 4 arquivos (hoje: 1.950 e 65) |
| AC-6 | endurecimento | `msProjectXmlParser.test.ts` | Seção 08: DOCTYPE externo e interno recusados nos dois pontos; `MAX_MSPDI_CHARS + 1` recusado; 400 dias + aviso; 10.000 dias + aviso; 2.000 níveis → erro em português |
| AC-7 | ida e volta do corpus | `msProjectXmlParser.corpus.test.ts` | 95/95 com `validateMspdi(…, { strictOrder: true }).errors` `[]`; campos da seção 05 idênticos nas folhas em 95/95 |
| AC-8 | datas × arquivo | idem | 104 folhas; 83 iguais (calendário importado); 100 iguais (sem feriados nacionais); diferenças por UID no relatório |
| AC-9 | casos C-4 a C-9 | `msProjectXmlParser.test.ts` | Valores e textos da seção 04 |
| AC-10 | não regressão | `core.test.ts`, `msProjectXmlParser.test.ts` existentes | Inalterados e verdes; R-2 com diff vazio |

## 12. Critérios de aceite e escopo fechado
- **AC-1:** o teste de corpus é pulado sem `CRONOAI_REF_DIR`, local e no CI, sem falha.
- **AC-2:** com a variável, roda nos 134 arquivos e afirma o inventário e a integridade por arquivo (seção 11).
- **AC-3:** grava o relatório em `test-results/corpus-mspdi/`. A tabela por versão vai para o ciclo `00003-corpus-mspdi.md`.
- **AC-4:** nenhum descarte silencioso nas categorias A1–A11: cada uma gera aviso com o número.
- **AC-5:** exceção recorrente usa as datas que o MS Project gravou. Sem elas, não é aplicada e gera aviso.
- **AC-6:** DOCTYPE/ENTITY e texto acima de 15 MiB são recusados antes do parse, com erro em português. O calendário tem limite total com aviso.
- **AC-7:** ida e volta 95/95 com `strictOrder` e os campos preservados.
- **AC-8:** comparação de datas registrada (83/104 e 100/104), sem afirmar paridade.
- **AC-9:** C-4 a C-9 fixados.
- **AC-10:** seed e testes existentes inalterados; `npm run ci` verde, com cobertura ≥ 80% nas 4 métricas sem o corpus.
- **AC-11:** `msproject-mspdi.md` e `testes.md` atualizados (+ SPEC-06 §4a se P2 = A).

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 … AC-11 | Seção 12 | Testes da seção 11; `npm run ci` | sim |
| M-1 | `.xml` exportado de um arquivo do corpus abre no MS Project real | Conferência manual | não (`NOT_RUN` esperado; RF-06.1 export pendente) |
| M-2 | Ida e volta do seed (Inviolável 2) | `core.test.ts` + `msProjectXmlParser.test.ts` (`strictOrder`) | sim |
| R-1 | Store, tipos, telas e `useMsProject.ts` intocados | `git diff --stat {BASE} -- src/stores src/types src/modules src/components src/lib/useMsProject.ts` vazio | sim |
| R-2 | Export do seed idêntico | Tarefa 13 (diff vazio, salvo os carimbos de data) | sim |
| R-3 | `CLAUDE.md` e `divida-conhecida.md` intocados (sem conflito com o 00002) | `git diff --stat {BASE} -- CLAUDE.md .claude/rules/divida-conhecida.md` vazio | sim |
| R-4 | Evidência local do corpus | Saída do `npx vitest run src/lib/msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` + relatório anexado ao ciclo | sim |
| N-1 | Nenhum número do motor muda | `useProjectStore.test.ts` (N-1 a N-3 do 00001) e E2E inalterados | sim |
| S-1 | DOCTYPE/ENTITY | AC-6 | sim |
| S-2 | Limite de tamanho no parser | AC-6 | sim |
| S-3 | Limite de expansão do calendário | AC-6 | sim |
| S-4 | Avisos sem texto do arquivo | Revisão do diff (`seguranca`) | sim |
| S-5 | Teste de corpus só lê `.xml` e só grava em `test-results/` | Revisão do diff | sim |
| S-6 | Sem dependência nova | `node .claude/scripts/auditar-dependencias.mjs --base {BASE}` | sim |
| P-1 | Estado salvo | `NA` (T4 = NÃO) | não |
| V-1 | Avisos novos como toast ao importar um XML fictício (`npm run dev`) | Conferência manual | não |

**Validadores obrigatórios:** `testes`, `arquiteto` (revisão), `especialista-obra` (A1: lista legada × regra de recorrência; A5–A7: `DurationFormat` e conversão; A3: LB0 parcial no MS Project), `seguranca` (S-1 a S-6) e **auditoria independente** (`revisor` em `MODO: AUDITAR`).

### Perguntas do gate
**P1 — Amostra do corpus no repositório (Jurídico).** Versionar parte do corpus (LGPL-2.1) para o teste rodar no CI?
- **(A)** Não versionar agora. Teste só local; a evidência é a execução local na matriz (R-4). Os casos C-1 a C-9, fictícios, rodam no CI. **Recomendação (opinião).**
- **(B)** Versionar uma amostra mínima em `tests/fixtures/mspdi-mpxj/`, com `LICENSE` LGPL-2.1 e aviso de origem, **só depois do aval do Jurídico**. Sugestão de amostra (8 arquivos, ~1,5 MB): `task-links` 2003 e 2019, `task-baselines` 2019, `calendar-recurring-exceptions` 2016, `mspdiduration`, `mspdinulltasks`, `mspditimephasedsegments`, `task-text` 2019. Entraria num commit próprio, sem mudar este plano.
- **(C)** Gerar no repositório arquivos fictícios que imitam as estruturas do corpus. Não depende do Jurídico, mas não prova compatibilidade com arquivos reais do MS Project.
- *Por que importa:* sem amostra, uma regressão no import só aparece quando alguém roda o corpus localmente.

**P2 — Arquivos sem tarefa (39 de 134).** A SPEC-06 §4a diz que "todos devem abrir sem erro". Hoje esses 39 são recusados com "Nenhuma tarefa encontrada no XML.".
- **(A)** Manter a recusa (não apagar a EAP da obra) e tratar "abrir sem erro" como "sem exceção não tratada e com mensagem clara". O teste confere o calendário desses 11 arquivos injetando uma tarefa fictícia só em memória. A SPEC-06 §4a ganha essa nota. **Recomendação (opinião).**
- **(B)** O parser aceita projeto sem tarefa (só calendário/recursos) e a store decide. Exige mudar `useProjectStore.ts`/`useMsProject.ts`, que o 00002 está mudando: conflito, e fica fora do paralelismo.
- **(C)** Manter a recusa sem conferir o calendário desses arquivos. A correção A1 fica provada só pelos casos fictícios.
- *Por que importa:* define o que o AC-2 aceita como "abrir", e se a A1 é provada em arquivo real do MS Project.

**P3 — Quantidade de avisos no import.** Cada aviso vira um toast. Com as correções, um arquivo comum do MS Project mostraria de 4 a 7 toasts (hoje mostra 2 ou 3).
- **(a)** Um aviso por categoria.
- **(b)** Avisos que afetam dado (A1, A2, A3, A5–A8, A10, A11) separados, e o que é só informativo (A4 `TimephasedData`, A9 campos personalizados) num aviso único. Sem tocar a tela. **Recomendação (opinião).**
- **(c)** Como (b), e ainda agrupar todos os avisos num só toast com lista. Toca `useMsProject.ts` (00002): fica para depois do merge dos dois.
- *Por que importa:* ruído demais faz o engenheiro ignorar o aviso que importa (Inviolável 2).

**Fora do escopo:**
- **Semântica para a 00004 (SPEC-05):**
  - lag em dias corridos exato (hoje 5/7) e em %;
  - formato original do lag na volta;
  - conversão exata de duração em tempo corrido e de fração de dia (minutos);
  - calendário com intervalos (`WorkingTimes`), semana diferente de seg–sex, vários calendários, calendário por tarefa, `WorkWeeks`;
  - expansão de recorrência pela regra quando não há lista legada;
  - restrições além de SNET e `Deadline`;
  - a observação do E4 sobre data de status no modo `forecast`.
- **Para a 00005 (SPEC-03):** aplicar os feriados nacionais quando o arquivo não traz feriados. Explica 17 das 21 diferenças do E4 e passa a depender da UF/município da obra.
- **Para a 00007 (SPEC-04):** importar as LB 1–10 (aqui só o aviso).
- **Para a 00010 (SPEC-15/RF-06.4):** mapeamento de campos personalizados (aqui só os avisos A8/A9).
- RF-06.5 (importação incremental), `.mpp` (backend + Jurídico), XSD no CI (RF-06.2 com o XSD), abrir no MS Project real (M-1).
- RNF-06.2 (3.000 tarefas em menos de 3 s): medir no navegador e otimizar (inclusive evitar o parse duplo de `:486`) em ciclo próprio.
- **Achados sem evidência no corpus**, registrados para ciclo próprio (`/corrigir`):
  - vínculo para tarefa inativa continua na lista de predecessoras e bloqueia o export;
  - `ActualStart` com % = 0 descartado (`:588`);
  - erros de validação além dos 5 primeiros somem dos avisos (`:489`).
- Qualquer mudança em `useProjectStore.ts`, `src/types/`, telas, `useMsProject.ts`, `CLAUDE.md`, `divida-conhecida.md`, `vite.config.ts`, CI e Docker.
- Mudar qualquer valor importado além de A1 (calendário) e A3 (LB0 parcial no export). Duração, lag, Text1/Number1 e custos continuam como hoje, só com aviso.
- Versionar arquivos do corpus (P1).

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Versionar amostra do corpus MPXJ (LGPL-2.1) no repositório (P1 = B) | Jurídico | Commit da amostra (não bloqueia este ciclo com P1 = A) |
| Matriz de versões do MS Project em uso e abertura do `.xml` exportado (RF-06.1, M-1) | Planejamento (usuário) | Critério de aceite da SPEC-06; não bloqueia o merge |
| Upload de arquivos (SPEC-06, "Validar com Segurança") | Segurança da Informação | Uso em produção; registrar no PR que S-1/S-2 endurecem o parser no navegador |

## 14. Riscos e pós-entrega
- **Mesmo diretório que o 00002.** Durante esta medição, o diretório `cronoai/` passou para a branch `feat/00002-multiobra`, com arquivos do 00002 ainda não commitados (`src/types/domain.ts`, `src/data/ufs.ts`, `src/lib/__fixtures__/`). Para correr em paralelo, o 00003 roda num **`git worktree` próprio**, com `npm ci` dentro dele. Exemplo, a partir da `master` atualizada: `git worktree add ../cronoai-00003 -b feat/00003-corpus-mspdi master`. Sem worktree, os ciclos ficam sequenciais. Este plano foi gravado como arquivo não rastreado nesse diretório. **Cuidado:** um `git add -A` do 00002 o levaria para a branch errada.
- **Base:** `master` com o 00001 já mergeado (o 00003 depende dele: cobertura e `test-results/` no `.gitignore`). Se o 00001 ainda não estiver na `master`, empilhar sobre `feat/00001-e2e-cobertura`, com `BASE` igual a essa branch.
- **Rollback:** reverter os commits. O estado salvo não muda. Arquivos já importados não são reprocessados: quem importou um arquivo com exceção recorrente antes da correção precisa **reimportar** para corrigir o calendário (avisar no PR).
- **Números mudam de propósito** só em projetos importados com exceção recorrente (A1). O PR traz o antes e o depois (C-1 a C-3 e os 4 arquivos do corpus). Seed, E2E e N-1 a N-3 do 00001 não mudam.
- **Lista legada ausente em arquivos de outras ferramentas** (Project Online, exportadores de terceiros): a recorrente deixa de ser aplicada, com aviso (C-2). É melhor que hoje (bloco contínuo errado). A expansão pela regra fica para a 00004/00005.
- **Ruído de avisos:** mitigado pela P3. O agrupamento na tela fica para depois do 00002.
- **Tempo do teste de corpus:** ~2–3 min no jsdom, só local. Se passar de 5 min, primeiro checar o parse duplo (fora do escopo, registrar). Nunca cortar arquivos do inventário sem decisão.
- **Inventário fixo e corpus mutável:** atualizar o corpus (outro commit do MPXJ) faz o teste falhar de propósito. Novo inventário só com o antes e o depois registrados.
- **Depois dos merges do 00002 e do 00003:** unificar `MAX_XML_BYTES` (`useMsProject.ts:6`) e `MAX_MSPDI_CHARS` numa constante só, num ajuste de faixa 1.

CONHECIMENTO NOVO:
- MS Project 2007–2016 grava cada exceção de calendário em dois lugares: `<Exceptions>` (com a regra de recorrência: `Type`, `Occurrences`, `Period`…) e os `WeekDay DayType=0` legados, já expandidos ocorrência por ocorrência. Expandir o `FromDate..ToDate` de uma `<Exception>` recorrente marca o intervalo inteiro; as datas certas estão na lista legada — `parseMspdiXml`, calendário.
- `<Baseline>` de tarefa pode vir só com `<Start>` (sem `<Finish>`/`<Duration>`), e o MS Project grava assim — import/export de linha de base.
- `Duration` no MSPDI é sempre em horas de relógio: 1 dia corrido (`DurationFormat` 8) = `PT24H`, 1 mês corrido (12) = `PT720H`. Dividir pelo `MinutesPerDay` sem olhar o `DurationFormat` triplica a duração — conversão de duração (SPEC-05).
- 39 dos 134 MSPDI do MPXJ não têm tarefa (só calendário/recursos); qualquer "todos abrem" sobre esse corpus precisa tratar projeto sem tarefa — teste de corpus.
- Arquivo do MS Project sem feriados + feriados nacionais aplicados pelo import desloca datas (Carnaval 2016, Finados 2018 no corpus) — comparação de datas e feriados por UF (00005).

## 15. Decisões do gate (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar até o fim das fases. O gate foi decidido pelas recomendações deste plano, **sujeito à revisão do usuário no PR**:
- **P1 → (A)** teste de corpus só local (`CRONOAI_REF_DIR`), com casos fictícios no CI; versionar amostra fica para depois do aval do Jurídico.
- **P2 → (A)** manter a recusa dos 39 arquivos sem tarefa e conferir o calendário deles injetando uma tarefa fictícia só em memória (no teste).
- **P3 → (b)** avisos que afetam dado separados; informativos agrupados num aviso único, sem tocar a tela.

Execução: worktree própria (`feat/00003-corpus-mspdi`, a partir de `origin/master` com o 00001), em paralelo ao 00002.
