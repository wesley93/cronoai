# Plano da Fase 1 — Números confiáveis, multiobra e Brasil todo

| Campo | Valor |
|---|---|
| Status | **Rascunho, aguardando sua aprovação** (há 2 decisões na seção 7) |
| Data | 2026-10-25 |
| Autor | agente `arquiteto` (processo em [.claude/skills/desenvolver-recurso](../../.claude/skills/desenvolver-recurso/SKILL.md)) |
| Base | `master` |
| Origem | Pedido "Pode rodar todas specs", com a triagem do orquestrador; requisito do usuário de obras em **qualquer UF**, para **gestores, construtoras e engenheiros com várias frentes** (SPEC-14); insumos locais fora do git em `D:\Pessoal\Planejamento\Alice\referencias\` (SINAPI 09/2026 nacional e 134 MSPDI do MPXJ) |

## Resumo
- **O que é:** a ordem e o recorte para executar no protótipo (front-only) tudo o que está liberado: SPEC-00 incremento 0.2, SPEC-14 parte front, SPEC-06 parcial (robustez da importação com o corpus), SPEC-05 parte 1, SPEC-03, SPEC-07 parcial (leitor do layout 2025), SPEC-04 e SPEC-10 parte 1.
- **Ordem recomendada (9 ciclos):**

| Ciclo | Conteúdo |
|---|---|
| `00001` | E2E e cobertura |
| `00002` | Multiobra, com UF por obra |
| `00003` | Corpus MSPDI |
| `00004` | Motor em minutos |
| `00005` | Premissas e calendários |
| `00006` | SINAPI 2025 |
| `00007` | Snapshots |
| `00008` | Medição de EVM |
| `00009` | Portfólio |

- **Por quê:** todas passam pela store única (`useProjectStore.ts`, 812 linhas) e por `src/types/domain.ts`, e quatro delas pelo `msProjectXmlParser.ts`. O multiobra muda o formato de todo o estado salvo e vem antes do que é gravado por obra. O corpus MSPDI vem antes de qualquer mudança no parser, para servir de comparação "antes e depois" em arquivos reais do MS Project.
- **Faixas previstas:** 3, 2, 3, 3, 2, 3, 3, 2, 2.
- **Estimativa relativa (opinião):** P, M, M, G, M, M, M/G, M, M.
- **O que você precisa fazer:** aprovar a ordem, responder às perguntas da seção 7 e, em cada ciclo, aprovar o plano ou a ficha antes da implementação.

## 1. Escopo da Fase 1

| Spec | Recorte | Requisitos |
|---|---|---|
| SPEC-00 (0.2) | E2E com Playwright e cobertura mínima de 80% em `src/lib` | §9 item 2; critério "Incremento 0.2" |
| SPEC-14 (Fase 1) | Multiobra (lista, obra ativa, criar/duplicar/excluir, migração), dados da obra (UF, município, responsável, SINAPI UF/regime/data-base) e painel de portfólio das obras locais | RF-14.1 a RF-14.6; RNF-14.1 a RNF-14.3 |
| SPEC-06 (parcial) | Robustez da importação com o corpus de 134 MSPDI (MS Project 2002–2019); ida e volta desses arquivos | RF-06.3 (lado da importação); RF-06.1 (só o lado da importação, versões 2002–2019); RF-06.2 pela referência publicada do esquema (o XSD só vem no instalador do Project SDK, que não é executado) |
| SPEC-05 (parte 1) | Minutos úteis com calendários; restrições e prazo final; lag em dias úteis, corridos e %; opções de progresso; painel de divergências | RF-05.1, RF-05.3, RF-05.4, RF-05.5, RF-05.8 |
| SPEC-03 | Premissas por obra, versionadas; calendários alternativos e meio período; modelo de feriados por UF/município | RF-03.1 a RF-03.4, RF-03.6; RF-03.5 só o modelo e a entrada manual |
| SPEC-07 (parcial) | Leitor do layout oficial 2025 (offline), RUP por função a partir do Analítico e recorte por UF/regime/data-base levado à obra | RF-07.1 (parcial, offline), RF-07.2, RF-07.3 (no front) |
| SPEC-04 | Snapshots imutáveis, retificação, Curva S de snapshots, LB0–LB10 no MSPDI, diff | RF-04.1 a RF-04.6 |
| SPEC-10 (parte 1) | Métodos de EV, critérios de medição, PV por pacote, limiares; AC marcado como estimativa | RF-10.1, RF-10.2, RF-10.3 (marcação), RF-10.4, RF-10.6 |

**Brasil todo na Fase 1:** cada obra tem UF (seletor das 27), município (texto livre; código IBGE reservado para a Fase 2), regime de encargos e data-base do SINAPI. O navegador **nunca** recebe a tabela nacional: com a 00006, a obra recebe só o recorte da UF/regime/data-base dela (coerente com a SPEC-07 RF-07.1a). Feriados estaduais e municipais entram como exceções manuais por obra, com origem, até a ingestão oficial na Fase 2 (SPEC-03 RF-03.5).

**Insumos locais (fora do git):** os testes que usam `referencias/` leem o caminho por `CRONOAI_REF_DIR` e são **pulados** sem ela. No CI eles não rodam: a evidência é a execução local, registrada na matriz do ciclo. Versionar uma amostra do corpus (LGPL-2.1) para o CI depende do **Jurídico**.

## 2. Ordem recomendada e por quê

| # | Ciclo | Spec | Depende de | Motivo técnico, com evidência no código |
|---|---|---|---|---|
| 1 | 00001 | SPEC-00 (0.2) | — | Rede de proteção antes de mexer na store e no motor. Hoje não há E2E e a cobertura de `src/lib` não é medida: ramos em **77,76%**, linhas em **89,98%** (medição de 25/10/2026, sem `download.ts`/`useMsProject.ts`). |
| 2 | 00002 | SPEC-14 (RF-14.1–14.3) | 00001 | O estado é de **uma** obra (`STORAGE_KEY = 'cronoai-state-v1'`, `useProjectStore.ts:50`; `loadState`, `:110-121`). Premissas, recortes SINAPI, snapshots e métodos de EV são **por obra**: criá-los antes obrigaria a migrar cada um de novo. Não existe migração; o `loadState` faz merge raso (`:115`). O 00002 cria a versão do esquema e a cadeia de migrações que os ciclos seguintes reaproveitam, e a UF/regime da obra que a 00005 e a 00006 consomem. |
| 3 | 00003 | SPEC-06 (parcial: corpus) | 00001 | A 00004 (calendários, restrições, lag), a 00007 (LB0–10) e o 00002 ("criar obra a partir de `.xml`") mexem na importação. Com o corpus de 134 arquivos reais do MS Project caracterizado **antes** (tarefas, vínculos, calendários, linhas de base e avisos por arquivo), cada mudança no parser passa a ter "antes e depois" medidos. Hoje o import aproxima lag em dias corridos por 5/7, zera lag em % (`lagToWorkingDays`, `msProjectXmlParser.ts:119`), lê só a linha de base 0 (`:560`) e não expande exceções recorrentes (`:529`). **Pode correr em paralelo ao 00002:** arquivos disjuntos (parser e testes × store, tipos e telas). |
| 4 | 00004 | SPEC-05 (parte 1) | 00002, 00003 | O motor arredonda para dias inteiros (`cpm.ts:113`), o calendário é fixo de segunda a sexta (`calendar.ts:91-96`), a única restrição é o SNET (`cpm.ts:106`) e o lag só existe em dias úteis (`domain.ts:5-10`; `LagFormat` 7 em `msProjectXmlParser.ts:216`). O meio período da SPEC-03 não cabe no índice inteiro de dia útil (`calendar.ts:67`). |
| 5 | 00005 | SPEC-03 | 00004 | As premissas saem das constantes (`scenarios.ts:8-11`; `HOURLY_RATES` em `seed.ts:6`; `dailyIndirectCost` em `seed.ts:25`; `SAFETY_MARGIN_DAYS` em `supplies.ts:6`) e passam a valer por obra. Os calendários alternativos usam o motor em minutos. O regime de encargos da obra é entrada do SINAPI (SPEC-07 depende da SPEC-03). |
| 6 | 00006 | SPEC-07 (parcial) | 00002, 00005 | Cumpre a dependência declarada (UF, regime e data-base nas premissas). Toca `sinapi.ts`, `sinapiBudget.ts`, `sinapiCatalog.ts` e o módulo SINAPI, longe de `evm.ts`. Vem antes dos snapshots porque o recorte por obra entra na mesma decisão de armazenamento local. |
| 7 | 00007 | SPEC-04 | 00005 | **O snapshot é imutável:** gravá-lo antes da migração de unidade (00004) ou do multiobra (00002) obrigaria a migrar um histórico que não se edita. Reescreve `computeSCurve` (`evm.ts:123-168`) e substitui a linha de base única (`useProjectStore.ts:700-706`; export só `<Number>0` em `msProjectXmlParser.ts:223-231`). |
| 8 | 00008 | SPEC-10 (parte 1) | 00007 | Dependência declarada na SPEC-10; mexe em `computeEvm`/`plannedFraction` (`evm.ts:48-51`, `83-93`), que a 00007 acabou de alterar. |
| 9 | 00009 | SPEC-14 (RF-14.4–14.6) | 00002, 00008 | Consolida números que as 00004 a 00008 mudam. Por último, os testes dele não precisam ser refixados a cada ciclo. Os alertas do portfólio (RF-14.6) usam a configuração de limiar da SPEC-10 (RF-10.6), e o RNF-14.1 depende do motor final. **Alternativa:** antecipá-lo para logo depois do 00002, se você quiser mostrar o portfólio cedo, sabendo que os números dele mudarão. |

**Grafo:** `00001 → {00002 ‖ 00003} → 00004 → 00005 → 00006 → 00007 → 00008 → 00009`. O único paralelismo recomendado é 00002 com 00003. Os demais ciclos são sequenciais, com merge na `master` antes do seguinte (branch aberta com `git switch master && git pull --ff-only && git switch -c …`). Com issues no GitHub, o número do ciclo passa a ser o da issue.

## 3. Por ciclo

### 3.1 Ciclo 00001 — SPEC-00 incremento 0.2 (E2E + cobertura)

| Item | Valor |
|---|---|
| Branch | `feat/00001-e2e-cobertura` |
| Faixa | **3**: T5 (dependências novas `@playwright/test` e `@vitest/coverage-v8`; navegador baixado no CI) e T7 (`ci.yml`, `.dockerignore`). T1–T4, T6 e T8: NÃO, nenhum arquivo de produção em `src/` muda |
| Plano | [.claude/ciclos/00001-e2e-cobertura-plano.md](../../.claude/ciclos/00001-e2e-cobertura-plano.md) |
| Entregáveis | Um só (cerca de 13 arquivos) |
| Requisitos cobertos | §9 item 2; critério "Incremento 0.2"; RNF-00.1, 00.2, 00.3 |
| Fica para depois | 0.3 (ambientes e deploy, com a **Infraestrutura**); Firefox/WebKit; E2E contra o Nginx. O E2E de troca de obra entra no 00002 |
| Risco de números | Nenhum cálculo muda. O E2E fixa os números atuais do seed (entrega 23/06/27, +16 d.u.) e **eles mudam de propósito** a partir da 00004, com antes e depois no PR |
| Estado salvo (T4) | Não se aplica. O E2E "recarregar mantém o estado" fixa o que a migração do 00002 precisa preservar |
| Validação obrigatória | `testes`, `arquiteto`, `seguranca` (T5), auditoria independente |
| Outras áreas | **Jurídico** (licenças Apache-2.0/MIT e as transitivas) e **Segurança** (dependência e navegador no CI), antes do uso em produção |
| Estimativa (opinião) | **P** |

### 3.2 Ciclo 00002 — SPEC-14 multiobra (RF-14.1 a RF-14.3)

| Item | Valor |
|---|---|
| Branch | `feat/00002-multiobra` |
| Faixa | **2**. T4 SIM (o formato inteiro do estado salvo: `STORAGE_KEY`, `PersistedState` em `useProjectStore.ts:61`). T1/T2 NÃO (os números de cada obra não mudam; um teste prova). T3 NÃO: "criar obra a partir de `.xml`" reaproveita `parseMspdiXml` e o fluxo de `useMsProject.ts` (limite `MAX_XML_BYTES`). Se surgir um campo de arquivo novo, o `classificar-diff.mjs` marca T5 e o ciclo **escala para faixa 3** |
| Entregáveis | **E1:** modelo `Obra` (UF, município, responsável, regime, data-base do SINAPI, data de status) e migração pura (`src/lib`) do `cronoai-state-v1` para a 1ª obra. **E2:** store com obra ativa (trocar, criar em branco ou de `.xml`, duplicar, excluir com confirmação); `undo` e parâmetros do simulador zerados na troca (guardam UIDs da obra anterior: `useProjectStore.ts:52-61`, `194`). **E3:** tela "Obras", seletor da obra ativa no topo e seletor de UF (27); aviso "catálogo SINAPI ilustrativo, não corresponde a {UF}". **E4:** E2E de migração (estado v1 abre como 1ª obra com os mesmos indicadores) e de troca de obra; aviso de cota (RNF-14.2) |
| Requisitos cobertos | RF-14.1, RF-14.2, RF-14.3, RNF-14.2, RNF-14.3 |
| Fica para depois | Portfólio (00009); empresa, carteiras e permissões (RF-14.7/14.8, SPEC-01/02, backend .NET 10, ADR 00001); exportar/importar obra em JSON |
| Risco de números | Baixo, com prova obrigatória: o Edifício Aurora migrado tem o mesmo cronograma e EVM (entrega 2027-06-23, SPI 0,888…; critério da SPEC-14) |
| Estado salvo (T4) | **ADR do armazenamento local para a fase toda**, com o volume estimado de várias obras, recortes SINAPI (00006) e 104 snapshots (00007). Opinião: uma chave por obra mais um índice (uma obra corrompida ou acima da cota não derruba as outras), a chave v1 mantida até a gravação nova dar certo e aviso de cota (hoje o erro é engolido em `useProjectStore.ts:147-151`). Se a estimativa não couber, IndexedDB já aqui, para não migrar o armazenamento duas vezes; a persistência definitiva é a SPEC-01. Telas em `KeepAlive` guardam estado local da obra anterior (ex.: `FieldReportsModule.vue:13`): remontar ou zerar na troca |
| Validação obrigatória | `revisor`, `testes` (`especialista-obra` recomendado para o teste de "mesmos números") |
| Outras áreas | **Jurídico:** uso por várias empresas (termos, LGPD controlador × operador), antes de abrir para clientes |
| Estimativa (opinião) | **M** |

### 3.3 Ciclo 00003 — SPEC-06 parcial: robustez da importação com o corpus MSPDI

| Item | Valor |
|---|---|
| Branch | `feat/00003-corpus-mspdi` |
| Faixa | **3**. T3 SIM (correções em `parseMspdiXml`; ida e volta). T5 SIM (tratamento de arquivo externo: 134 arquivos de terceiros como entrada). T1/T2 NÃO (as datas calculadas não mudam; a mini comparação de datas é só medição). T4 NÃO (o formato do estado não muda; avisos novos não persistem) |
| Entregáveis | **E1:** teste de corpus (`src/lib/*.test.ts`, pulado sem `CRONOAI_REF_DIR`) que, por arquivo, faz o parse sem exceção e confere UIDs únicos, vínculos lidos × presentes, calendários e linhas de base. Gera um relatório de caracterização (tabela por versão 2002–2019) gravado no ciclo. **E2:** correções de robustez que o corpus revelar, sempre com **aviso em vez de descarte silencioso** (Inviolável 2), ex.: linhas de base ≠ 0 e `TimephasedData` ignorados com aviso, exceções recorrentes. As melhorias de **semântica** (lag exato, restrições, calendários com intervalos) ficam para a 00004, que reaproveita este teste. **E3:** ida e volta de cada arquivo (`parse` → `buildMspdiXml` → `validateMspdi(…, { strictOrder: true })` → `parse`) sem perder UID, nome, vínculo (tipo), % concluído e datas reais. **E4:** mini comparação de datas nos 8 arquivos com vínculos (datas do arquivo × calculadas), registrada como medição; ela alimenta o painel de divergências da 00004, não a paridade |
| Requisitos cobertos | RF-06.3 (lado da importação, nos campos de hoje); RF-06.1 (só o lado da importação, versões 2002–2019 geradas); RF-06.2 pela referência publicada do esquema (`validateMspdi`/`SCHEMA_ORDER`), já que o XSD não é executável aqui |
| Fica para depois | Abrir o `.xml` exportado no MS Project real e reimportar (RF-06.1, lado da exportação: precisa do seu MS Project; `NOT_RUN` até lá); RF-06.4 (mapeamento configurável); RF-06.5 (importação incremental com diff, que pode entrar após o 00002, quando houver "importar sobre a obra"); `.mpp` (backend); a paridade da SPEC-05 (exige cronogramas reais de obra anonimizados) |
| Risco de números | Nenhum: só medição. Uma correção que mude o que o import entrega (ex.: lag antes zerado) só entra com teste e aviso, com antes e depois no PR |
| Estado salvo (T4) | Não se aplica |
| Validação obrigatória | `testes`, `arquiteto`, `especialista-obra` (T3: conversões e comportamento do MS Project), `seguranca` (T3/T5), auditoria independente |
| Outras áreas | **Jurídico:** versionar uma amostra do corpus LGPL-2.1 em `tests/fixtures/` para o CI rodar (hoje só local) |
| Estimativa (opinião) | **M** |

### 3.4 Ciclo 00004 — SPEC-05 parte 1 (motor em minutos, calendários, restrições, lag, progresso, divergências)

| Item | Valor |
|---|---|
| Branch | `feat/00004-motor-minutos-calendarios` |
| Faixa | **3**. T1 SIM (`cpm.ts`, `calendar.ts`). T2 SIM (`elapsedFraction` em dias úteis, `evm.ts:39-46`; sábados inteiros em `scenarios.ts:340-348`). T3 SIM (`ConstraintType` só 0/4 em `msProjectXmlParser.ts:207`; `LagFormat` 7 em `:216`; `lagToWorkingDays` em `:119`; um calendário em `:290-301`). T4 SIM (`Task.snet`, `PredecessorLink.lagDays`, `WorkCalendarConfig` em `domain.ts:63-68`) |
| Entregáveis | **E1:** calendário em minutos e `computeSchedule` interno em minutos, **sem mudar nenhuma data do seed** (teste de caracterização das 20 folhas antes de mexer). **E2:** restrições completas e prazo final; lag em `edays` e %; lógica retida / substituir progresso / mover o restante. **E3:** MSPDI de ida e volta para calendários (e `CalendarUID` da tarefa, se a P2 for aprovada), restrições, `Deadline` e lag em todos os formatos, com `strictOrder` **e o teste de corpus da 00003 sem regressão**. **E4:** painel "Divergências com o MS Project" |
| Requisitos cobertos | RF-05.1, RF-05.3, RF-05.4, RF-05.5, RF-05.8; RF-05.2 só por tarefa, se a P2 for aprovada |
| Fica para depois | RF-05.2 por recurso e RF-05.7 (Fase 3); RF-05.6; critério de paridade (cronogramas reais de obra = insumo ainda pendente); Web Worker (a performance é medida com 3.000 tarefas sintéticas) |
| Risco de números | **Alto.** O E1 é refatoração sem mudança de número. Mudança de semântica só no E2, com antes e depois no PR. **Brasil todo:** horário de trabalho em hora local da obra (relógio de parede), sem conversão de fuso; o Brasil tem 4 fusos e o MSPDI grava data/hora sem fuso |
| Estado salvo (T4) | ADR: opinião por minutos inteiros persistidos (100 min = 0,2083… dia acumula erro), com migração pela cadeia do 00002 aplicada a cada obra e ao `undo` |
| Validação obrigatória | `testes`, `arquiteto`, `especialista-obra`, `seguranca` (T3), auditoria independente |
| Outras áreas | Engenharia de planejamento, antes do piloto. MS Project real: `NOT_RUN` até haver acesso |
| Atualiza o `CLAUDE.md` | Convenção de dias úteis inteiros e dívida "CPM em dias inteiros"; `.claude/rules/calculo-precisao.md` e `msproject-mspdi.md` |
| Estimativa (opinião) | **G** |

### 3.5 Ciclo 00005 — SPEC-03 (premissas por obra e calendários)

| Item | Valor |
|---|---|
| Branch | `feat/00005-premissas-calendarios` |
| Faixa | **2** (T1, T2, T4). Condição: a 00004 já precisa ler e gravar calendários múltiplos e o `CalendarUID` no MSPDI. Se não fizer, vira faixa 3 (T3) |
| Entregáveis | **E1:** premissas como dado da obra, versionado; cenários e DLP recebem as premissas por parâmetro, com números idênticos no padrão. **E2:** tela "Premissas da obra" (RF-03.1/03.2) e a versão exibida nos cenários e no EVM. **E3:** calendários alternativos, exceções, jornada por dia em horas, sábado de 4 h = 0,5 dia. Feriados por obra: os nacionais calculados e os estaduais/municipais manuais com origem. Trocar a UF/município mostra uma prévia do impacto. **E4:** hora extra com meio período e frentes escolhidas (RF-03.6) |
| Requisitos cobertos | RF-03.1 a RF-03.4, RF-03.6; RF-03.5 (modelo e entrada manual); RNF-03.1 |
| Fica para depois | Listas oficiais de feriados das 27 UFs e dos municípios (RF-03.5): Fase 2/backend, com fonte oficial a definir |
| Risco de números | Médio. Com as premissas padrão, os cenários dão **exatamente** os números de hoje. Caso fixado: indireto de R$ 12.000. **Brasil todo:** `brazilianHolidays` trata Carnaval e Corpus Christi como não úteis no país inteiro (`calendar.ts:42-55`), mas são pontos facultativos que variam por UF e município. Viram premissa da obra, com o padrão atual mantido. O RNF-03.2 (arredondamento bancário) precisa de decisão com **Orçamento/Custos** |
| Estado salvo (T4) | Premissas por obra, com padrão igual às constantes; `meta.dailyIndirectCost` e `meta.safetyMarginDays` viram a v1, pela cadeia de migrações |
| Validação obrigatória | `revisor`, `testes`, `especialista-obra` |
| Outras áreas | **RH + Jurídico** (jornada, hora extra e adicional, que variam por convenção coletiva e região) e **Orçamento/Custos** |
| Estimativa (opinião) | **M** |

### 3.6 Ciclo 00006 — SPEC-07 parcial: leitor do layout 2025 e recorte por UF/regime

| Item | Valor |
|---|---|
| Branch | `feat/00006-sinapi-layout-2025` |
| Faixa | **3**. T5 SIM (o script lê um arquivo externo de 13,6 MB; possível dependência nova para ler `.xlsx`). T3 SIM (formato novo aceito pelo app: o JSON do recorte, com limite de tamanho e validação de esquema). T2 SIM (RUP derivada do Analítico → duração em `sinapi.ts`). T4 SIM (o recorte associado à obra) |
| Proposta para o protótipo | **Script offline em Node**, fora de `src/` (ex.: `scripts/sinapi/`), rodado por quem administra: lê `SINAPI_Referencia_AAAA_MM.xlsx` a partir de `CRONOAI_REF_DIR` e gera um **recorte em JSON** por UF + regime + data-base, filtrável por códigos ou grupos, com metadados (fonte, mês de referência, UF, regime, encargos da UF, hash do arquivo de origem). O app importa esse JSON para a obra, só se UF/regime/data-base baterem com os da obra (senão, avisa). O xlsx nacional nunca vai ao navegador. Recorte compartilhado entre obras da mesma UF/regime/data-base (uma chave só), por causa da cota |
| Entregáveis | **E1:** leitor do layout 2025 (abas `CSD`/`CCD`/`CSE` e `Analítico`; código da composição pelo `Analítico`, porque na `CSD` ele vem como fórmula/hiperlink; colunas localizadas pelo cabeçalho, porque o layout muda entre publicações; encargos por UF do cabeçalho), com testes pulados sem `CRONOAI_REF_DIR`. **E2:** função pura em `src/lib` que deriva a RUP por função a partir dos coeficientes (RF-07.2), com teste fixando valores do arquivo de 09/2026 (fonte citada). **E3:** gerador do recorte JSON e o esquema versionado dele. **E4:** importação do recorte na obra (limite de tamanho, validação de esquema, erro em português); calculadora e planilha usam o recorte; o catálogo ilustrativo fica como *fallback* marcado |
| Requisitos cobertos | RF-07.1 (parcial: offline, sem upload do xlsx no app), RF-07.2, RF-07.3 (no front). Critérios da spec viáveis com o arquivo: custo unitário publicado em 20 composições amostradas (±R$ 0,01) e RUP igual ao coeficiente da analítica |
| Fica para depois | Ingestão mensal das 27 UFs e entrega por obra (RF-07.1/07.1a): **backend .NET 10**, Fase 2, com aval de Segurança/Infra; RF-07.4 (composições próprias), RF-07.5, RF-07.6 (orçamento em `.xlsx`), RF-07.7 (orçamento ↔ EAP, que muda o BAC e o EVM) |
| Risco de números | Médio. Durações geradas pelo SINAPI mudam quando sai o catálogo ilustrativo; obras sem recorte ficam iguais. Cada número vindo da tabela cita "SINAPI {UF} {mês/ano} {regime}" (Inviolável 7 continua para o *fallback*) |
| Estado salvo (T4) | Referência do recorte na obra (UF/regime/data-base + hash); recorte numa chave própria, dentro da decisão de armazenamento do 00002 |
| Segurança | Leitura de `.xlsx` (zip): limite de tamanho e de entradas descompactadas (zip bomb). **Não usar o pacote `xlsx` do npm**: a versão publicada no npm está parada e tem vulnerabilidades conhecidas; a mantida é distribuída fora do npm (verificar na revisão). Opinião: leitor sem dependência nova (zip por `node:zlib`) se o custo couber; senão, uma biblioteca escolhida com a **Segurança**. O JSON importado no app é dado, nunca `v-html` |
| Validação obrigatória | `testes`, `arquiteto`, `especialista-obra` (T2/T3: RUP e custo × publicação da Caixa), `seguranca` (T3/T5), auditoria independente |
| Outras áreas | **Orçamento/Custos** (SINAPI × composições próprias, regime); **Segurança** (dependência e arquivo externo) |
| Estimativa (opinião) | **M** |

### 3.7 Ciclo 00007 — SPEC-04 (snapshots e linhas de base)

| Item | Valor |
|---|---|
| Branch | `feat/00007-snapshots-linhas-base` |
| Faixa | **3**. T2 (Curva S de snapshots; PV contra a LB escolhida), T3 (`<Baseline><Number>0..10</Number>` na ida e na volta; o corpus da 00003 tem arquivos `task-baselines` para conferir), T4 (snapshots e LBs por obra). T1 e T5 NÃO |
| Entregáveis | **E1:** fechar data de status, imutabilidade e retificação com motivo. **E2:** Curva S de snapshots (interpolação tracejada; o linear só como *fallback* com aviso) e tendência de SPI/CPI e da data de entrega. **E3:** LB0–LB10 com MSPDI de ida e volta, `strictOrder` e corpus sem regressão. **E4:** diff entre snapshots e exportação de JSON |
| Requisitos cobertos | RF-04.1 a RF-04.6; RNF-04.2 |
| Fica para depois | RF-04.7 (o front-only não roda com o navegador fechado); RF-04.8 (`TimephasedData`); RF-14.9 (histórico do portfólio, Fase 2) |
| Risco de números | Médio. Sem snapshots, Curva S e PV ficam iguais. Critério: depois de 3 fechamentos, a Curva S mostra exatamente o EV/AC gravado |
| Estado salvo (T4) | 104 snapshots × 3.000 tarefas não cabem nos ~5 MB do `localStorage`: aplicar a decisão do 00002 e avisar sempre que a gravação falhar (um snapshot não pode sumir) |
| Validação obrigatória | `testes`, `arquiteto`, `especialista-obra`, `seguranca` (T3), auditoria independente |
| Outras áreas | Planejamento/Controle (rotina de fechamento) |
| Estimativa (opinião) | **M/G** |

### 3.8 Ciclo 00008 — SPEC-10 parte 1 (métodos de EV, PV por pacote, alertas)

| Item | Valor |
|---|---|
| Branch | `feat/00008-evm-medicao` |
| Faixa | **2** (T2, T4). **Vira 3** se o método de EV for ao MSPDI: o MS Project só conhece `EarnedValueMethod` (% concluído × % físico) e `PhysicalPercentComplete` (`SCHEMA_ORDER`, `msProjectXmlParser.ts:43`); 0/100, 50/50 e marcos ponderados não têm campo nativo |
| Entregáveis | **E1:** métodos de EV no motor. **E2:** critérios de medição por tipo de serviço e tela. **E3:** curva de PV por pacote. **E4:** limiares de SPI/CPI por pacote no diagnóstico (a mesma configuração que o 00009 usa por obra); AC marcado como **estimativa** |
| Requisitos cobertos | RF-10.1, RF-10.2, RF-10.3 (marcação), RF-10.4, RF-10.6 |
| Fica para depois | RF-10.3 com ERP (SPEC-09); RF-10.5 e RF-10.7 (não liberados); ±0,5% contra a planilha da obra (piloto) |
| Risco de números | Médio. Duas dívidas exigem decisão explícita, com antes e depois: `safeDiv` devolve 1 (`evm.ts:36`), o que esconderia alerta sem PV/AC; `progressPatch` arredonda o AC e usa 1,03 (`useProjectStore.ts:289-303`) |
| Estado salvo (T4) | Campos opcionais com padrão "% físico" e "estimativa"; snapshots antigos como "estimativa" |
| Validação obrigatória | `revisor`, `testes`, `especialista-obra`; mais `seguranca` e auditoria se virar faixa 3 |
| Outras áreas | **Controladoria/Custos** e **Planejamento** |
| Estimativa (opinião) | **M** |

### 3.9 Ciclo 00009 — SPEC-14 painel de portfólio (RF-14.4 a RF-14.6)

| Item | Valor |
|---|---|
| Branch | `feat/00009-portfolio` |
| Faixa | **2** (T2: consolidação nova em `src/lib`). T4 só se o cache por obra for persistido (padrão: não) |
| Entregáveis | **E1:** consolidação pura (ΣPV/ΣEV/ΣAC; SPI do portfólio = ΣEV ÷ ΣPV, **nunca média de índices**), ranking e alertas, com teste de 2 obras fixando os números. **E2:** painel por obra, com filtros por UF, responsável e situação, e mapa/tabela por UF (com a tabela alternativa ao gráfico exigida no `CLAUDE.md`). **E3:** cache das obras não ativas e medição com 50 obras sintéticas (RNF-14.1) |
| Requisitos cobertos | RF-14.4, RF-14.5, RF-14.6, RNF-14.1 |
| Fica para depois | RF-14.7 a RF-14.10 (Fase 2) |
| Risco de números | Médio: índices por soma; obra sem PV/AC usa a decisão de `safeDiv` da 00008 |
| Validação obrigatória | `revisor`, `testes`, `especialista-obra` |
| Outras áreas | Nenhuma no protótipo local |
| Estimativa (opinião) | **M** |

## 4. Riscos transversais

| Risco | Onde | Mitigação |
|---|---|---|
| Merge raso do estado salvo | `useProjectStore.ts:115` | Versão do esquema e cadeia de migrações a partir do 00002; teste com estado antigo em todo ciclo T4 |
| `undo` persistido com o formato antigo | `useProjectStore.ts:52-61` | Migrar ou descartar com registro (00002, 00004, 00005) |
| Cota do `localStorage` (várias obras, recortes, snapshots) | Erro engolido em `useProjectStore.ts:147-151` | Decisão de armazenamento única no 00002; aviso de falha; persistência real na SPEC-01 |
| Testes com insumo local não rodam no CI | 00003, 00006 | Pulados sem `CRONOAI_REF_DIR`; execução local como evidência na matriz; amostra versionada só com aval do Jurídico |
| Local fixo no código | Carnaval/Corpus Christi nacionais (`calendar.ts:42-55`); catálogo SINAPI único | Premissa por obra (00005); recorte por UF/regime (00006); RNF-14.3 |
| Fuso horário | Minutos úteis (00004) | Hora local da obra, sem conversão de fuso |
| Testes antigos que só verificam a direção | `core.test.ts` | Asserção exata quando o número for tocado |
| Números do E2E mudam de propósito | E2E do 00001 | Antes e depois no PR a partir da 00004 |
| MS Project real indisponível | Ciclos T3 | `M-N` como `NOT_RUN`; a paridade exige cronogramas reais |

## 5. O que ainda depende de algo para andar

| Spec | Situação | O que precisa |
|---|---|---|
| SPEC-05 (paridade) | Depende de insumo | **Usuário:** 5 cronogramas reais de obra anonimizados (≥ 300 tarefas), com as datas do MS Project como gabarito. O corpus do MPXJ tem só 8 arquivos com vínculos e não substitui esse insumo |
| SPEC-06 (restante) | Parcial | **Usuário:** abrir no MS Project da empresa o `.xml` exportado (matriz de versões em uso). **Jurídico:** amostra do corpus no repositório. XSD: só existe no instalador do SDK, que não será executado; segue a referência publicada. `.mpp`: backend (SPEC-01) e **Jurídico** (MPXJ LGPL) |
| SPEC-07 (restante) | Parcial | Ingestão mensal das 27 UFs no **backend .NET 10** (Fase 2), com aval de **Segurança/Infra**; **Orçamento/Custos** (composições próprias) |
| SPEC-03 RF-03.5 (listas oficiais) | Insumo + backend | Fonte oficial dos feriados estaduais e municipais e um administrador que a mantenha |
| SPEC-14 (Fase 2) | Bloqueada | SPEC-01/02. **Jurídico:** termos e LGPD; **Segurança:** isolamento entre empresas |
| SPEC-01 | Bloqueada | D1 decidida (.NET 10 + PostgreSQL, ADR 00001, ainda não commitado nesta branch). **Infraestrutura:** hospedagem, banco, backup e ambientes; D2 e D3 com Infra/Segurança |
| SPEC-02 | Bloqueada | SPEC-01; **Segurança** (identidade, MFA); **Jurídico/RH** (dados de trabalhadores) |
| SPEC-08 | Bloqueada | SPEC-01, 02 e 12; **Segurança + Jurídico/RH** (provedores de IA/transcrição/WhatsApp, LGPD) |
| SPEC-09 | Bloqueada | SPEC-01/02; **Suprimentos e TI dona do ERP** |
| SPEC-11 | Bloqueada | SPEC-01, 02 e 04; **Segurança** (envio de dados da obra) |
| SPEC-12 (parte 2) | Bloqueada | SPEC-01; **Segurança, Jurídico, Infraestrutura** |
| SPEC-13 | Bloqueada | SPECs 01–07, 10 e 14; **Diretoria de engenharia**, Planejamento, Segurança/Jurídico |

## 6. Estimativa relativa (opinião, não compromisso)

| Ciclo | Spec | Tamanho | Motivo |
|---|---|---|---|
| 00001 | SPEC-00 (0.2) | P | Ferramenta e configuração |
| 00002 | SPEC-14 (multiobra) | M | Reestrutura a store e o estado salvo, sem mudar números |
| 00003 | SPEC-06 (corpus) | M | Teste de corpus, caracterização e correções de robustez |
| 00004 | SPEC-05 (parte 1) | G | Troca a unidade de tempo do motor, com MSPDI e migração |
| 00005 | SPEC-03 | M | Dado versionado por obra e telas |
| 00006 | SPEC-07 (layout 2025) | M | Leitor offline, RUP, recorte e importação |
| 00007 | SPEC-04 | M/G | Snapshots e LB0–10 no MSPDI |
| 00008 | SPEC-10 (parte 1) | M | Variações de EV/PV e alertas |
| 00009 | SPEC-14 (portfólio) | M | Consolidação e painel |

## 7. Decisões que você precisa tomar

- **P1 (bloqueia só o 00001): qual métrica entra no limiar de 80% de cobertura de `src/lib`?** Hoje (sem `download.ts`/`useMsProject.ts`): linhas e instruções 89,98%, funções 87,40%, **ramos 77,76%**.
  - **(A)** 80% global em linhas, instruções e funções; ramos sem bloquear. Passa sem teste novo.
  - **(B)** 80% global nas 4 métricas. Cerca de 22 ramos a mais com testes de borda, sem mudar número. Continua P. Recomendação (opinião).
  - **(C)** 80% por arquivo nas 4 métricas. Vira M (`diagnosis.ts` e `textDiff.ts` em 0%).
- **P2 (afeta as 00004 e 00005): o calendário por tarefa (RF-05.2, parte "tarefa") entra na Fase 1?** Sem ele, os calendários alternativos (RF-03.4) e as "frentes escolhidas" da hora extra (RF-03.6) não têm a quem ser atribuídos.
  - **(a)** Entra na 00004, só por tarefa. Recomendação (opinião).
  - **(b)** Fica fora: calendários alternativos só como cadastro, e o RF-03.6 "frentes escolhidas" sai da fase.

## 8. Como cada ciclo roda

Em cada ciclo, o orquestrador segue a skill `desenvolver-recurso`: triagem confirmada no código, ficha (faixa 2) ou plano (faixa 3) em `.claude/ciclos/{NNNNN}-{slug}-{ficha|plano}.md`, **sua aprovação**, implementação por entregável (um commit cada, com sua aprovação), validação com evidência e `/entregar`. Faixas e entregáveis acima são previsões: a triagem de cada ciclo pode mudá-los e, se mudar, isso é anunciado antes de seguir.
