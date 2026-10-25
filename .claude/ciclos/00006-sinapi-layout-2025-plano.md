---
issue: —
spec: SPEC-07 (parcial) — RF-07.1 (parcial, offline), RF-07.2, RF-07.3 (no front); SPEC-15 (Fase 1) — RF-15.1, RF-15.2, RF-15.5, RNF-15.1, RNF-15.3
ciclo: .claude/ciclos/00006-sinapi-layout-2025.md
branch: feat/00006-sinapi-layout-2025
base: master, depois do merge do 00005 (que vem depois do 00002, 00003 e 00004)
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00006 — Leitor offline do SINAPI (layout 2025), RUP por função, recorte por UF/regime/data-base importado na obra e tela "Integrações"

## Resumo
- **O que é:** um script Node, fora de `src/`, lê a planilha nacional `SINAPI_Referencia_AAAA_MM.xlsx` sem dependência nova e gera um **recorte JSON** de uma UF, um regime e uma data-base. A obra importa esse recorte pela nova tela **"Integrações"**. A calculadora e a planilha orçamentária passam a usar o custo publicado e a **RUP por função** tirada do Analítico. O catálogo ilustrativo continua como *fallback*, marcado. A mesma tela mostra os cartões da Fase 2 (WhatsApp, IA/transcrição, ERP, e-mail/Teams, login) **só como informação, sem nenhum campo**.
- **Risco que justifica a faixa 3:** T5 (o script abre um zip externo de 13,6 MB, 120 MB descompactado: risco de zip bomb e de XML malicioso) e T3 (o app passa a aceitar um formato de arquivo novo, o JSON do recorte). T2 (RUP → duração e equipe) e T4 (referência na obra, store nova no IndexedDB) também valem.
- **Números medidos em 25/10/2026** na planilha local de 09/2026 (seção 04): 10.599 composições, código de todas pela fórmula `HYPERLINK` da aba `CSD`, nenhuma divergência com o `Analítico`; o recorte SP/não desonerado sem filtro tem 8.443 composições e 3,4 milhões de caracteres; 20 composições amostradas com custo e RUP fixados.
- **Entregáveis (4):** E1 motor da RUP e esquema do recorte (`src/lib`); E2 leitor e gerador (`scripts/sinapi`); E3 tela "Integrações"; E4 recorte na obra, importação e uso na calculadora e na planilha.
- **O que você precisa fazer:** aprovar o plano e responder às **3 perguntas de gate** (seção 15). Antes do merge na `master`: **Orçamento/Custos** valida a regra da função principal e da equipe por função. A **Segurança da Informação** valida o leitor de arquivo externo, feito sem dependência nova.

## 00. Contexto para execução
As linhas abaixo são da branch `feat/00002-multiobra` (`103f319`). Os ciclos 00004 e 00005 mexem nesses arquivos: confirme as linhas na base real antes de cada tarefa.

| Arquivo | Por que ler |
|---|---|
| `src/lib/sinapi.ts:4-24` | `HOURS_PER_DAY`, `durationFromTeam`, `scheduleDays`: a duração continua vindo daqui. Não mude a fórmula. Depois da 00005, as horas por dia podem virar premissa da obra |
| `src/lib/sinapiBudget.ts:7-24`, `:42-45`, `:67-82`, `:136-186` | `BudgetLine`, `lineResources` (rótulo `'Servente'` fixo na `:44`), `lineFromCatalog`, `parseBudgetCsv(text, catalog)`. É aqui que entra a equipe por função |
| `src/data/sinapiCatalog.ts:1-37` | Catálogo ilustrativo (aviso nas `:1-3`), `unit` limitado a 5 valores (`:8`), `professional: ResourceKind` (`:13`). Fica como *fallback* |
| `src/modules/SinapiModule.vue:11-43`, `:64-81`, `:127-206` | Calculadora: seleção do catálogo, `laborCost` com `rateOf` ilustrativo (`:43`), recursos com `'Servente'` fixo (`:71-74`), selects de unidade (`:141`) e de profissional (`:153`), aviso ilustrativo (`:206`) |
| `src/modules/sinapi/BudgetSheet.vue:16`, `:35-47` | Padrão de importação de arquivo: limite antes de ler (`MAX_CSV_BYTES`), extensão, toast de erro. **Imite** no JSON do recorte |
| `src/stores/useProjectStore.ts:163-172`, `:241-282`, `:779-821`, `:880-886`, `:1038-1196` | `watch` profundo do estado (o recorte **não** pode ficar dentro dele), `salvarAgora`/`aplicarEstado`, `buildSinapiTask` (notas na `:817`), `importBudgetCsv`, troca/criação/duplicação/exclusão de obra e `atualizarDadosObra` (UF/regime/data-base nas `:1183-1190`) |
| `src/stores/armazenamentoObras.ts:7`, `:18-32`, `:49-91`, `:112-148`, `:198-208` | `VERSAO_ESTRUTURA = 1`, interface do adaptador, memória, `onupgradeneeded`, `transacao` com a lista fixa de stores (`:139`), queda para memória quando o banco não abre |
| `.claude/adrs/00002-armazenamento-local-fase-1.md` › Estrutura | Já prevê a store `recortesSinapi`, chave `uf\|regime\|dataBase`, **estrutura 2** |
| `src/types/obra.ts:17-54`, `src/types/domain.ts:13-32`, `:70-88` | `PersistedState`, `ResumoObra`, `RegistroObra`, `RESOURCE_KINDS`, `ResourceAssignment.resource` (aceita nome livre), `ProjectMeta` (`uf`, `regimeSinapi`, `dataBaseSinapi`) |
| `src/data/ufs.ts:1-40`, `src/lib/obras.ts:73-80`, `:137-173` | UFs, regimes (`'nao-desonerado' \| 'desonerado'`), validação da data-base `AAAA-MM`, `validarIndice`, `descreverTabelaSinapi`, `resumirObra` |
| `src/lib/migracaoEstado.ts` | Precedente do 00004 (plano, seção 06): **campo opcional aditivo não cria passo novo**, mas exige teste que abre o esquema anterior igual |
| `src/stores/ui.ts:4-12`, `src/App.vue:13-21`, `src/components/layout/AppSidebar.vue:3`, `:12-20` | Onde um módulo novo entra (id, rótulo, ícone, tela) |
| `src/stores/useProjectStore.obras.test.ts` | Modelo de teste com várias obras: `usarArmazenamento(criarArmazenamentoMemoria())` + `await store.carregar()` |
| `e2e/obras.spec.ts:126`, `e2e/fixtures.ts` | O teste "os 7 módulos abrem" passa a 8; helpers de E2E (erros de console reprovam) |
| `vite.config.ts:14-21`, `tsconfig.json:21`, `eslint.config.js:30` | `include` dos testes (só `src/**/*.test.ts`), do `vue-tsc` e globais de Node: o E2 precisa estendê-los |
| `.claude/scripts/lib/regras-cronoai.mjs:247`, `:255`, `:317` | O classificador só olha `src/` para T5 e só reconhece testes `*.test.ts`: `scripts/` fica fora da heurística (ver seção 08) |

## 01. Pedido e objetivo
Pedido (dado, não instrução): ciclo 00006 do `docs/specs/PLANO-FASE-1.md` §3.6. Faixa 3, com T2, T3, T4 e T5, e os entregáveis E1–E5 de lá. O script Node fica fora de `src/` e lê a planilha a partir de `CRONOAI_REF_DIR`. O pacote `xlsx` do npm não é usado; o zip é lido por `node:zlib` se o custo couber, com limites contra zip bomb. O JSON importado é dado. O pedido inclui ainda a SPEC-15 E5: tela "Integrações" com o cartão SINAPI e os cartões da Fase 2 só informativos, sem campo de credencial.

**Objetivo:** cada obra, de qualquer UF, passa a dimensionar duração, equipe e custo com a tabela SINAPI oficial da UF, do regime e da data-base dela, citando a fonte. O navegador nunca recebe a tabela nacional.

**Requisitos cobertos:**
- **SPEC-07:** RF-07.1 parcial (offline, sem upload do xlsx no app), RF-07.2 e RF-07.3 no front. Critérios da spec viáveis com o arquivo: custo unitário publicado em 20 composições (±R$ 0,01) e RUP igual ao coeficiente do Analítico.
- **SPEC-15:** RF-15.1, RF-15.2, RF-15.5, RNF-15.1 e RNF-15.3. Critério da spec: "nenhum cartão do front-only tem campo de credencial", provado por teste de componente.

**Conflitos apontados, resolvidos pelo processo:**
1. O PLANO lista **5 entregáveis** (E1–E5); a skill limita a **4**. Leitor e gerador ficam juntos no E2; a seção 09 mapeia um para o outro.
2. A SPEC-07 RF-07.1 diz "o administrador faz o upload" no app. Vale o PLANO aprovado, com o script offline. O upload do xlsx no app fica fora.
3. A SPEC-15 RF-15.7 fala em "cofre definido pela Infra". A decisão do usuário para a Fase 2 é outra: chaves no banco da aplicação, cifradas com ASP.NET Core Data Protection, chave fora do banco e nunca devolvidas ao front. **Nada disso entra no 00006.** Pendência registrada: atualizar a SPEC-15 ao planejar a Fase 2 e validar com Segurança e Infraestrutura onde fica o *key ring*.
4. O ADR 00002 estima ~250 caracteres por composição; a medição deu **403**. A tarefa 22 atualiza a linha do ADR com o número medido.

## 02. Triagem
- **T1 NÃO.** `cpm.ts` e `calendar.ts` não mudam. A duração continua saindo de `durationFromTeam` e `scheduleDays` (`sinapi.ts:10-24`), sem mudar a fórmula; o que muda é a RUP de entrada.
- **T2 SIM.**
  - `lineResources` (`sinapiBudget.ts:42-45`) passa a montar a equipe por função, e `parseBudgetCsv` (`:136`, `:160`, `:168`) completa a linha pelo recorte.
  - Há uma função nova de RUP por função em `src/lib/sinapiRup.ts`.
  - A calculadora (`SinapiModule.vue:36-43`, `:64-80`) usa custo e RUP do recorte.
  - Durações e BAC dos pacotes **gerados a partir de agora** mudam numa obra com recorte; obras sem recorte ficam iguais (CR-9).
- **T3 SIM.** Formato de arquivo novo aceito pelo app: o JSON do recorte, com limite de tamanho, validação de esquema e versão. O MSPDI **não muda**: `Text1` continua com o código SINAPI e os nomes de recurso continuam texto escapado (`msProjectXmlParser.ts:245`, `:314`).
- **T4 SIM.**
  - Campos opcionais novos: `ProjectMeta.recorteSinapi` (`domain.ts:70-88`), `BudgetLine.equipe`/`fonte` (`sinapiBudget.ts:7-24`, persistidos em `PersistedState.budget`, `obra.ts:17`) e `ResumoObra.recorteSinapi` (`obra.ts:20-30`).
  - A estrutura do IndexedDB sobe de 1 para 2, com a store nova `recortesSinapi` (`armazenamentoObras.ts:7`, `:125-129`).
- **T5 SIM.** O script lê arquivo externo: zip de 30 entradas, 120.247.758 bytes descompactados, XML. O app lê um arquivo do usuário (`type="file"` + `file.text()`, que o classificador marca). Dependência nova: **nenhuma**, por decisão (D-1).
- **T6 NÃO.** Não toca `fieldAi.ts` nem `approveReport`.
- **T7 NÃO.** Sem Docker, compose, Nginx ou CI. `vite.config.ts`, `tsconfig.json`, `eslint.config.js` e `package.json` (só `scripts`) não são T7 (`regras-cronoai.mjs:253`). O `Dockerfile` roda `npm run build` (`vue-tsc`), que passa a checar os tipos de `scripts/**/*.ts`.
- **T8 NÃO.** Nenhum backend, endpoint, banco de servidor ou chamada de rede. Os cartões da Fase 2 são texto estático, sem `fetch` e sem campos.

**Faixa 3.** Base `master` depois do 00005, branch `feat/00006-sinapi-layout-2025`. Validação: `testes`, `arquiteto`, `especialista-obra` (T2/T3), `seguranca` (T3/T5) e auditoria independente.

## 03. Decisões de design
| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-1 | **Leitor de xlsx sem dependência nova:** zip pelo diretório central com `node:zlib` (`inflateRawSync` com `maxOutputLength`, `crc32`) e um *tokenizer* mínimo do subconjunto SpreadsheetML que a planilha usa. Medição: só `<c r s t><v>`, `t="s"` ou numérico, `<f>` só na coluna B das abas de custo, *shared strings* simples (17.022 `<si>`, sem rich text), sem `DOCTYPE` | Pacote `xlsx`/SheetJS do npm (versão publicada parada, com vulnerabilidades conhecidas segundo o próprio projeto; **confirmar na revisão da Segurança**); `exceljs`/`fflate` | Exigência do PLANO. O subconjunto é pequeno e medido. Sem dependência, a revisão de licença e de cadeia de suprimentos não entra. Se o custo estourar (o dev para na tarefa 7), a escolha de biblioteca volta à **Segurança** antes de seguir |
| D-2 | **Script em TypeScript**, executado pelo *type stripping* do Node (`node --experimental-strip-types`; nativo no Node 22.18+ e 23.6+, [docs](https://nodejs.org/api/typescript.html)). `tsconfig` passa a incluir `scripts/**/*.ts` com `allowImportingTsExtensions` (exige `noEmit`, que já existe). Testes `scripts/**/*.test.ts` no Vitest | `.mjs` puro | Tipos estritos no código que lê entrada externa. O classificador e o `testar-afetado` só reconhecem `*.test.ts`. O script importa `src/lib/sinapiRup.ts` (fonte única da regra de mão de obra). **Checkpoint na tarefa 5:** se o Node 22 LTS do `.nvmrc` não rodar o script, volte para `.mjs` com a regra duplicada num único módulo e teste de equivalência |
| D-3 | **Código da composição pelo 2º argumento do `HYPERLINK`** da coluna B das abas `CSD`/`CCD` (`=HYPERLINK("#"&CELL(...MATCH(104658,Analítico!$B:$B,0)...),104658)`), por regex âncorada ao fim; a fórmula **nunca é avaliada**. Conferido com o `Analítico`: código existe, mesma descrição e unidade | Casar pela descrição | Há descrições iguais com unidades diferentes (ex.: "RAMPA DE ACESSIBILIDADE…" em UN e em M2, linhas 12–13 da `CSD`). Medição: 10.599 de 10.599 com fórmula; 0 divergências. Divergência = erro com a contagem, não recorte parcial |
| D-4 | **Colunas e UFs pelo cabeçalho**, não por posição. Abas pelo nome em `workbook.xml` (normalizado sem acento: `CSD`, `CCD`, `Analitico`). Cabeçalho = linha com "Código da Composição" nas 30 primeiras. UFs = siglas da linha acima das colunas "Custo (R$)". Encargos = linhas "Horista"/"Mensalista". Mês = "Mês de Referência" | Posições fixas (E=AC, G=AL…) | O SPEC-07 §5 avisa que o layout muda entre publicações. Coluna ausente = erro nomeando a coluna ("layout mudou") |
| D-5 | **Mão de obra = item do Analítico com tipo `COMPOSICAO`, unidade `H` e descrição terminada em "COM ENCARGOS COMPLEMENTARES"**. Função = descrição sem o sufixo. RUP da função = coeficiente publicado, sem arredondar. Só o 1º nível da composição (sem explodir subcomposições) | Explodir as subcomposições (ex.: a argamassa dentro do chapisco) para somar o HH indireto | É o critério da SPEC-07: "RUP igual ao coeficiente da analítica". Medição: 16.561 itens, 61 funções, nenhuma repetida na mesma composição. A explosão fica fora (seção 12) |
| D-6 | **Função principal:** maior coeficiente entre as funções que **não** começam por `SERVENTE`, `AUXILIAR ` ou `AJUDANTE `; empate → a primeira na ordem do Analítico; sem oficial → a maior de apoio. **Equipe (recomendação da Q1):** cada outra função vira recurso com `⌈equipe × cᶠ ÷ cᵖ − 1e-9⌉`; duração pela principal | Só principal + "Servente" com `helperRatio` (como hoje) | Medição: 7.092 composições com 1 oficial, 546 com 2 ou mais (149 empates com custo), 957 só com apoio, 2.004 sem mão de obra direta. Com o modelo de hoje, "Auxiliar de encanador" vira "Servente" (`sinapiBudget.ts:44`) e o carpinteiro da concretagem some. **Gate Q1** |
| D-7 | **Recorte:** composições `COM CUSTO` com custo > 0 na UF. Ficam fora as 2.155 `SEM CUSTO` (custo 0 em todas as UFs) e as com custo 0 na UF (SP: 1, a 104088). Filtros opcionais por códigos e grupos. A contagem dos excluídos vai em `totais` | Incluir tudo e avisar | Custo 0 viraria BAC 0 sem aviso. Composição sem mão de obra direta (1.602 com custo) entra com `maoDeObra: []`: tem custo, mas pede a RUP à mão (regra de hoje, `sinapiBudget.ts:168-169`) |
| D-8 | **Escopo do leitor:** só `CSD` (não desonerado), `CCD` (desonerado) e `Analítico`. Regime da obra → aba: `nao-desonerado` → `CSD`, `desonerado` → `CCD`, conferido pelo título ("SEM/COM DESONERAÇÃO") | Ler também `CSE`, insumos (`ISD`/`ICD`/`ISE`) e o zip nacional externo | O regime "sem encargos" não existe na obra (`ufs.ts:33-34`). O zip externo tem nomes em CP850 com a *flag* UTF-8 ligada (medido): o administrador extrai uma vez por mês, e o script acha o xlsx pelo nome normalizado ou por `--arquivo` |
| D-9 | **Limites do leitor** (tabela na seção 08), todos conferidos **antes** de descompactar, mais `maxOutputLength` = tamanho declarado + 1 e CRC. Só descompacta as entradas usadas (`workbook.xml`, `workbook.xml.rels`, `sharedStrings.xml`, abas de `CSD`/`CCD`/`Analítico`) | Descompactar tudo | Os `_rels` das abas de custo têm razão 59,7 e não são necessários |
| D-10 | **Esquema do recorte versionado** (`formato: "cronoai-recorte-sinapi"`, `versao: 1`) em `src/types/sinapi.ts`. A validação pura em `src/lib/recorteSinapi.ts` **reconstrói** o objeto só com campos conhecidos | Aceitar o JSON como veio | Evita poluição de protótipo e lixo no estado. Versão mais nova é recusada com mensagem. O mesmo validador roda na importação, na leitura do IndexedDB e no teste do gerador |
| D-11 | **Armazenamento:** store `recortesSinapi` (keyPath `chave` = `UF\|regime\|AAAA-MM`), estrutura 2, registro `{ chave, versaoFormato, json, sha256Origem, importadoEm, composicoes }`. A obra guarda só a referência `meta.recorteSinapi = { chave, sha256Origem, importadoEm }`; o índice guarda `ResumoObra.recorteSinapi = chave` | Recorte dentro do estado da obra | O ADR 00002 decide "uma chave por UF/regime/data-base, compartilhada", por causa da cota (3,4 MB por UF inteira). O índice permite apagar o recorte órfão na mesma transação, sem ler todas as obras |
| D-12 | **Vínculo explícito (recomendação da Q3):** outra obra com a mesma chave vê "Usar nesta obra" sem reimportar. Nada muda sozinho numa obra que não pediu | Vínculo automático por chave | Importar numa obra não pode mudar os números das próximas tarefas de outra sem ação dela. **Gate Q3** |
| D-13 | **Recorte em memória fora do estado reativo:** `shallowRef` + `markRaw`, carregado ao abrir a obra e fora de `PersistedState` | Recorte dentro de `state` | O `watch` profundo (`useProjectStore.ts:163-172`) percorreria cerca de 8 mil objetos a cada alteração e regravaria 3,4 MB a cada 300 ms |
| D-14 | **Sem passo novo na cadeia de esquema:** campos opcionais e aditivos, ausentes = sem recorte e linha à moda antiga (precedente do 00004, seção 06). Um teste abre o esquema da base sem eles e confere números iguais | Passo identidade N → N+1 | Já há proteção contra app antigo: com a estrutura 2, ele recebe `VersionError` ao abrir o banco e cai na memória com aviso (`armazenamentoObras.ts:198-206`), sem sobrescrever nada |
| D-15 | **Teste de componente sem `@vue/test-utils`:** `createApp(Componente).use(createPinia()).mount(div)` no jsdom (o Vitest já compila SFC pelo plugin do Vue) | `@vue/test-utils` (dependência nova, T5) | Sem dependência nova. O teste só consulta o DOM |
| D-16 | **Rótulo do recurso:** tabela pura `rotuloFuncao` mapeia a função SINAPI para o `ResourceKind` quando existe equivalente (PEDREIRO → Pedreiro, SERVENTE → Servente, CARPINTEIRO DE FORMAS → Carpinteiro, ARMADOR, ELETRICISTA, ENCANADOR OU BOMBEIRO HIDRÁULICO → Encanador, GESSEIRO, AZULEJISTA OU LADRILHEIRO → Azulejista, PINTOR, OPERADOR DE MÁQUINAS E EQUIPAMENTOS → Operador de equipamento). As demais funções ficam com a 1ª letra maiúscula ("Auxiliar de encanador ou bombeiro hidráulico") | Criar 61 `ResourceKind` | `ResourceAssignment.resource` já aceita nome livre (`domain.ts:29`). A taxa horária continua ilustrativa (`rateOf`, padrão 30). O `especialista-obra` confere a tabela |
| D-17 | **Saída do script fora do repositório:** padrão `$CRONOAI_REF_DIR/recortes/`. Saída dentro da raiz do repositório é recusada, inclusive `src/` e `public/`, que vão no bundle. Arquivo existente só com `--sobrescrever` | Gravar em `public/` | A tabela nacional nunca vai ao navegador nem ao git. A fixture curada do E2E é feita à mão (tarefa 21) |

Decisão estrutural nova: nenhuma, porque o ADR 00002 já prevê a store. Atualizar a estimativa do ADR com a medição (tarefa 22) é suficiente; `/adr` não é necessário.

## 04. Caso de referência (T1/T2)
**Fonte de todos os números:** SINAPI, Caixa, `SINAPI_Referencia_2026_09.xlsx`, mês de referência 09/2026, emissão 09/10/2026, SHA-256 `9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2`, 13.631.798 bytes, em `referencias/sinapi/2026-09/xlsx/`. Abas `CSD`, `CCD` e `Analítico`. **Medição de 25/10/2026** com `openpyxl` 3.1.5 em `read_only` (`python -I`, scripts descartáveis no scratchpad, só leitura). As descrições abaixo estão resumidas; os testes comparam código, unidade, custo e coeficientes.

### 4.1 Caracterização da planilha (CP)
| Caso | Medido | Teste que fixa |
|---|---|---|
| CP-1 | Zip do xlsx: 30 entradas; maior entrada 23.174.487 bytes (`sheet7.xml`, `CCD`); total descompactado 120.247.758; maior razão 59,7 (`_rels` das abas de custo); abas de custo ~8,1; `sharedStrings` 11,2 | `referencia-2026-09.test.ts` › "estrutura do zip" |
| CP-2 | Abas: Menu, Busca, ISD, ICD, ISE, CSD, CCD, CSE, Analítico, Analítico com Custo. `CSD`/`CCD`: cabeçalho na linha 10 (Grupo, Código da Composição, Descrição, Unidade, depois "Custo (R$)" e "%AS" por UF), siglas das 27 UFs na linha 9, "Horista" na linha 6 e "Mensalista" na linha 7. `Analítico`: cabeçalho na linha 10 (Grupo, Código da Composição, Tipo Item, Código do Item, Descrição, Unidade, Coeficiente, Situação), com a linha da composição de "Tipo Item" vazio seguida dos itens | `referencia-2026-09.test.ts` › "cabeçalhos" |
| CP-3 | 10.599 composições nas 3 abas de custo; 10.599 com fórmula `HYPERLINK` (0 sem); 10.599 no Analítico; 0 códigos só de um lado; 0 descrições ou unidades divergentes | idem › "código pela fórmula" |
| CP-4 | Situação: 8.444 `COM CUSTO` e 2.155 `SEM CUSTO`. As `SEM CUSTO` têm custo 0 em todas as UFs e regimes. Itens: 34.583 `COMPOSICAO` e 21.985 `INSUMO`. Códigos de 4 a 6 dígitos | idem |
| CP-5 | Mão de obra (D-5): 16.561 itens; 61 funções; 8.595 composições com mão de obra direta (1 função: 1.484; 2: 6.553; 3: 379; até 7). Funções por composição: máximo 7. Maior coeficiente de mão de obra: 345,33 | idem › "mão de obra" |
| CP-6 | Encargos (fração): SP `CSD` horista 1,1501 e mensalista 0,7118; SP `CCD` 0,9909 e 0,5851; BA `CSD` 1,1773 e 0,7285; AM `CSD` 1,1416 e 0,708; RS `CCD` 0,9612 e 0,5667 | idem › "encargos por UF" |
| CP-7 | Recorte sem filtro (D-7): SP `CSD` **8.443** composições (6.842 com mão de obra; excluída por custo 0: 104088); SP `CCD` 8.443; AM `CSD` 8.444; ES `CSD` 8.442 (95137 e 104088). Grupo "Alvenaria de Vedação": 28 | idem › "recorte SP" |
| CP-8 | Tamanho do recorte SP `CSD` sem filtro (compacto, formato da seção 05): **3.399.801 caracteres**, 3.458.475 bytes UTF-8, 403 caracteres por composição; indentado: 4.772.431 bytes. Descrição mais longa: 364; função mais longa: 53; grupo mais longo: 91; unidade mais longa: 5 (ex.: `M2XKM`); maior custo: R$ 228.977,20 | idem › "tamanho" (≤ 6 MiB) |

### 4.2 Vinte composições amostradas (custo publicado ± R$ 0,01 e RUP = coeficiente)
Coeficientes em H/unidade, na ordem do Analítico. "Principal" segue a regra D-6.

| # | Código | Un | UF | `CSD` R$ | `CCD` R$ | Mão de obra (coeficiente) | Principal (RUP) |
|---|---|---|---|---|---|---|---|
| 1 | 104658 piso podotátil de concreto | M2 | SP | 208,85 | 205,36 | SERVENTE 1,279; PEDREIRO 0,639 | PEDREIRO 0,639 |
| 2 | 103332 alvenaria de vedação, bloco 9x14x19 | M2 | SP | 123,96 | 119,05 | SERVENTE 0,8112688; PEDREIRO 1,6225376 | PEDREIRO 1,6225376 |
| 3 | 87879 chapisco interno, colher | M2 | BA | 6,14 | 5,93 | SERVENTE 0,0255; PEDREIRO 0,0681 | PEDREIRO 0,0681 |
| 4 | 87529 massa única 1:2:8, interna | M2 | MG | 43,76 | 42,27 | SERVENTE 0,2362; PEDREIRO 0,4724 | PEDREIRO 0,4724 |
| 5 | 87414 gesso desempenado em teto | M2 | RJ | 32,01 | 31,02 | SERVENTE 0,11529; GESSEIRO 0,36407 | GESSEIRO 0,36407 |
| 6 | 87630 contrapiso 1:4, betoneira | M2 | PR | 50,01 | 48,77 | SERVENTE 0,123; PEDREIRO 0,245 | PEDREIRO 0,245 |
| 7 | 87263 porcelanato 60x60 em piso | M2 | RS | 120,60 | 119,41 | SERVENTE 0,1674; AZULEJISTA OU LADRILHEIRO 0,5203 | AZULEJISTA 0,5203 |
| 8 | 88489 látex acrílica premium, 2 demãos | M2 | PE | 14,18 | 13,82 | SERVENTE 0,0544; PINTOR 0,1631 | PINTOR 0,1631 |
| 9 | 92413 fôrma de pilares, montagem e desmontagem | M2 | GO | 118,57 | 114,02 | CARPINTEIRO DE FORMAS 2,052; AJUDANTE DE CARPINTEIRO 0,376 | CARPINTEIRO DE FORMAS 2,052 |
| 10 | 98557 emulsão asfáltica, 2 demãos | M2 | CE | 44,88 | 44,00 | IMPERMEABILIZADOR 0,4299; AJUDANTE ESPECIALIZADO 0,0969 | IMPERMEABILIZADOR 0,4299 |
| 11 | 89357 tubo PVC soldável 32 mm, ramal | M | AM | 40,38 | 38,84 | ENCANADOR OU BOMBEIRO HIDRÁULICO 0,488576; AUXILIAR DE ENCANADOR OU BOMBEIRO HIDRÁULICO 0,488576 | ENCANADOR 0,488576 |
| 12 | 92762 armação de pilar ou viga CA-50 | KG | DF | 10,93 | 10,84 | ARMADOR 0,0392; AJUDANTE DE ARMADOR 0,0064 | ARMADOR 0,0392 |
| 13 | 103681 concretagem de vigas e lajes fck 25, grua | M3 | SC | 904,47 | 897,96 | SERVENTE 1,145; PEDREIRO 1,428; CARPINTEIRO DE FORMAS 0,357 | PEDREIRO 1,428 |
| 14 | 104219 emboço/massa única industrializada, projetada | M2 | PA | 97,44 | 95,66 | SERVENTE 0,547; PEDREIRO 0,547 | PEDREIRO 0,547 |
| 15 | 91833 eletroduto flexível corrugado DN 20 | M | MT | 20,11 | 19,42 | ELETRICISTA 0,08; AUXILIAR DE ELETRICISTA 0,08 | ELETRICISTA 0,08 |
| 16 | 88789 pastilha de porcelana em fachada | M2 | ES | 396,92 | 393,54 | SERVENTE 0,691; AZULEJISTA OU LADRILHEIRO 1,382 | AZULEJISTA 1,382 |
| 17 | 92270 fabricação de fôrma de vigas, madeira serrada | M2 | TO | 191,85 | 189,85 | CARPINTEIRO DE FORMAS 0,792; AJUDANTE DE CARPINTEIRO 0,179 | CARPINTEIRO DE FORMAS 0,792 |
| 18 | 94201 telha cerâmica capa-canal | M2 | MS | 69,53 | 68,56 | TELHADISTA 0,1682705; SERVENTE 0,5295536 | TELHADISTA 0,1682705 |
| 19 | 93358 escavação manual de vala | M3 | PI | 93,59 | 88,84 | SERVENTE 3,9557667 | SERVENTE 3,9557667 (sem oficial) |
| 20 | 100700 porta de madeira compensada 120x210, 2 folhas | UN | RN | 998,96 | 986,78 | SERVENTE 1,8305384; PEDREIRO 1,7058427; CARPINTEIRO DE ESQUADRIAS 4,7714472 | CARPINTEIRO DE ESQUADRIAS 4,7714472 |
| 21 (empate) | 103669 concretagem de pilares fck 25, baldes | M3 | SP | 1.050,19 | 1.027,49 | SERVENTE 7,377; PEDREIRO 2,459; CARPINTEIRO DE FORMAS 2,459 | PEDREIRO 2,459 (1º no empate) |

Teste que fixa: `scripts/sinapi/referencia-2026-09.test.ts` › "20 composições" (pulado sem `CRONOAI_REF_DIR`, evidência local na matriz). Os coeficientes das linhas 1, 2, 11, 13, 19, 20 e 21 entram também como literais em `src/lib/sinapiRup.test.ts`, com a fonte no comentário, e rodam no CI.

### 4.3 Duração, equipe e BAC (CR), com a regra D-6 (Q1 = b) e 8 h/dia
Fórmula (inalterada, `sinapi.ts:10-24`): `HH = q × RUPᵖ`; `dias = max(1, ⌈HH ÷ (equipe × 8) − 1e-9⌉)`; outras funções `⌈equipe × cᶠ ÷ cᵖ − 1e-9⌉`; `BAC = q × custo`.

| Caso | Entrada | Esperado | Teste que fixa |
|---|---|---|---|
| CR-1 | 103332, SP `CSD`, 640 m², equipe 4 | HH 1.038,424064; 32,450752 → **33 d.u.**; Pedreiro 4 + Servente 2; **BAC R$ 79.334,40**. Antes (catálogo ilustrativo, RUP 0,82, R$ 98,50): 17 d.u. e R$ 63.040,00 | `sinapiRup.test.ts`, `sinapiBudget.test.ts` |
| CR-2 | 104658, SP `CSD`, 100 m², equipe 2 | HH 63,9; 3,99375 → **4 d.u.**; Pedreiro 2 + **Servente 5** (proporção 2,0015649…; ⌈4,0031⌉ = 5); BAC R$ 20.885,00 | idem |
| CR-3 | 103681, SC `CSD`, 320 m³, equipe 4 | HH 456,96; 14,28 → **15 d.u.**; Pedreiro 4 + Servente 4 (⌈3,2073⌉) + Carpinteiro 1 (4 × 0,25 = 1,0 → 1); BAC R$ 289.430,40 | idem |
| CR-4 | 100700, RN `CSD`, 10 un, equipe 1 | HH 47,714472; 5,964309 → **6 d.u.**; Carpinteiro de esquadrias 1 + Servente 1 + Pedreiro 1; BAC R$ 9.989,60 | idem |
| CR-5 | 93358, PI `CSD`, 50 m³, equipe 3 | HH 197,788335; 8,241180625 → **9 d.u.**; só Servente 3; BAC R$ 4.679,50 | idem |
| CR-6 | 89357, AM `CCD`, 3.600 m, equipe 6 | HH 1.758,8736; 36,6432 → **37 d.u.**; Encanador 6 + **"Auxiliar de encanador ou bombeiro hidráulico" 6** (não "Servente"); BAC R$ 139.824,00 | idem |
| CR-7 | 92413, GO `CSD`, 1.500 m², equipe 6 | HH 3.078; 64,125 → **65 d.u.**; Carpinteiro 6 + Ajudante de carpinteiro 2 (⌈1,0994⌉); BAC R$ 177.855,00 | idem |
| CR-8 | 103669 (empate) | principal PEDREIRO 2,459; proporções: Servente 3,0 e Carpinteiro de formas 1,0 | `sinapiRup.test.ts` |
| CR-9 | Linha sem `equipe` (catálogo, `seedBudget` b-1: 103332 ilustrativo, 640, equipe 4, `helperRatio` 0,5) | **Igual a hoje:** 17 d.u.; Pedreiro 4 + Servente 2 | `sinapiBudget.test.ts` › "caracterização" |
| CR-10 | Encargos SP `CSD` / `CCD` | exibidos 115,01% / 71,18% e 99,09% / 58,51% (`fmtPct`) | `recorteSinapi.test.ts` |
| CR-11 | Recorte SP `CSD` 09/2026 sem filtro | 8.443 composições; `totais.excluidasSemCusto` 2.155; `excluidasCustoZeroNaUf` 1 | `referencia-2026-09.test.ts` |

HH: `toBeCloseTo(valor, 9)`. Dias, unidades e BAC: `toBe` (BAC conferido como em JS: `640 * 123.96 === 79334.4`).

**Efeito em quem consome:** só os pacotes **novos** de uma obra com recorte (calculadora e lote da planilha). EAP existente, CPM, EVM, Curva S, cenários e suprimentos não mudam. O BAC do pacote gerado entra no EVM como hoje. O custo de mão de obra estimado da calculadora continua ilustrativo, se a Q2 = a.

## 05. MS Project e arquivos (T3)
- **MSPDI:** não muda. `Text1` continua com o código SINAPI e `Number1` com o lead time. Nomes de recurso novos ("Encanador ou bombeiro hidráulico") são texto escapado, já suportado. Teste de ida e volta existente sem alteração (M-3).
- **Arquivo novo (JSON do recorte), esquema v1** (`src/types/sinapi.ts`):

```json
{
  "formato": "cronoai-recorte-sinapi",
  "versao": 1,
  "uf": "SP",
  "regime": "nao-desonerado",
  "dataBase": "2026-09",
  "fonte": {
    "publicacao": "SINAPI — Caixa — Relatórios mensais (formato a partir de 2025)",
    "arquivo": "SINAPI_Referencia_2026_09.xlsx",
    "sha256": "9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2",
    "bytes": 13631798,
    "dataEmissao": "2026-10-09",
    "abaCustos": "CSD",
    "layout": "2025"
  },
  "encargos": { "horista": 1.1501, "mensalista": 0.7118 },
  "filtro": { "codigos": [], "grupos": [] },
  "totais": { "composicoes": 8443, "excluidasSemCusto": 2155, "excluidasCustoZeroNaUf": 1 },
  "geradoEm": "2026-10-25T12:00:00.000Z",
  "composicoes": [
    {
      "codigo": "103332",
      "descricao": "ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X14X19 CM ...",
      "unidade": "M2",
      "grupo": "Alvenaria de Vedação",
      "custoUnitario": 123.96,
      "maoDeObra": [
        { "codigo": "88316", "funcao": "SERVENTE", "coeficiente": 0.8112688 },
        { "codigo": "88309", "funcao": "PEDREIRO", "coeficiente": 1.6225376 }
      ]
    }
  ]
}
```

- **Regras de validação** (`validarRecorteSinapi`, puro; limites com folga sobre a medição):

| Campo | Regra |
|---|---|
| `formato` | igual a `"cronoai-recorte-sinapi"`; senão "Este arquivo não é um recorte SINAPI do CronoAI." |
| `versao` | inteiro 1; maior → "Recorte gerado por uma versão mais nova do CronoAI (formato N)." |
| `uf` / `regime` / `dataBase` | ∈ `UFS`; ∈ `REGIMES_SINAPI`; `^\d{4}-(0[1-9]\|1[0-2])$` |
| `fonte.sha256` | `^[0-9a-f]{64}$`; `arquivo` ≤ 120 caracteres; `dataEmissao` ISO; `abaCustos` ∈ {`CSD`, `CCD`} e coerente com o regime |
| `encargos` | números finitos em (0, 3] |
| `composicoes` | 1 a **12.000** (medido: 8.444) |
| `codigo` | `^\d{1,7}$`, único no recorte |
| `descricao` | 1 a **400** caracteres (medido: 364), sem caracteres de controle |
| `unidade` | `^[A-Z0-9]{1,8}$` (medido: 18 unidades, até 5 caracteres) |
| `grupo` | ≤ **160** (medido: 91) |
| `custoUnitario` | finito, > 0 e ≤ 10.000.000 (medido: 228.977,20) |
| `maoDeObra` | 0 a **16** itens (medido: 7); `codigo` `^\d{1,7}$`; `funcao` 1 a 80 (medido: 53); `coeficiente` finito, > 0 e ≤ 10.000 (medido: 345,33) |
| chaves desconhecidas | ignoradas e **não copiadas** (objeto reconstruído) |

- **Arquivo de exemplo:** `e2e/arquivos/recorte-sinapi-sp-2026-09-amostra.json`, montado à mão com as composições 103332, 104658 e 103681. Para o SP `CSD`, o custo e a mão de obra da 103681 são lidos da planilha na tarefa 21 (a tabela 4.2 traz o custo de SC). É dado público da Caixa, com a fonte no próprio arquivo. A suíte de unidade usa recortes montados no teste.
- **Limite e tamanho:** `MAX_RECORTE_BYTES = 6 MiB` (6.291.456), conferido por `file.size` **antes** de ler. O recorte SP sem filtro tem 3,46 MB compacto e 4,77 MB indentado. Extensão `.json`.
- **Comportamento com arquivo inválido:** toast de erro em português, sem detalhe técnico; nada é gravado. Até 3 mensagens de erro de esquema são mostradas, como na planilha (`BudgetSheet.vue:46`).
- **Conferência com a obra:** obra sem UF, regime ou data-base → "Informe UF, regime e data-base do SINAPI em Obras › Dados da obra antes de importar." Chave diferente → "O recorte é de BA · 09/2026 · desonerado; esta obra é SP · 09/2026 · não desonerado. Nada foi importado."

## 06. Estado salvo (T4)
- **Campos opcionais novos (D-14, sem passo na cadeia):**
  - `ProjectMeta.recorteSinapi?: { chave: string; sha256Origem: string; importadoEm: string }`;
  - `BudgetLine.equipe?: { recurso: string; proporcao: number }[]` e `BudgetLine.fonte?: string` (ex.: `"SINAPI SP 09/2026 não desonerado"`);
  - `ResumoObra.recorteSinapi?: string` (a chave).
  - Ausente = sem recorte, e a linha usa `helperRatio` como hoje.
- **Padrão:** `buildSeedState()` e `estadoObraVazia()` não ganham o campo. O Aurora não tem UF e continua com o catálogo ilustrativo.
- **IndexedDB:** `VERSAO_ESTRUTURA` sobe de 1 para 2. O `onupgradeneeded` cria `recortesSinapi` se faltar e **não toca** `obras` nem `meta`. `transacao` passa a abrir as 3 stores.
- **Gravação atômica:** importar grava, na mesma transação, o registro do recorte, a obra com a referência e o índice. Desvincular, trocar a chave em "Dados da obra" ou excluir a obra apaga o recorte que ficou órfão na mesma transação. Órfão = chave que estava no índice antes e não está em nenhuma linha depois, calculado pela função pura `recortesOrfaos`. Obra ilegível no índice mantém a chave dela, e o recorte não é apagado.
- **Leitura:** o recorte lido do IndexedDB passa de novo por `validarRecorteSinapi`. Registro com `versaoFormato` maior que 1 → tratado como ausente, com aviso, e **nunca sobrescrito**: a importação daquela chave é recusada. Recorte ilegível → a obra abre com o catálogo ilustrativo e um aviso no cartão.
- **Mudança de UF, regime ou data-base em "Dados da obra"** (`atualizarDadosObra`, `useProjectStore.ts:1166-1196`) → desvincula, com registro no log da obra ("Recorte SINAPI desvinculado: UF/regime/data-base mudaram").
- **Duplicar** copia a referência (mesma chave, recorte compartilhado). **Substituir** um recorte usado por outras obras pede confirmação. As obras com o `sha256Origem` antigo mostram "recorte substituído em {data}".
- **Testes:**
  - registro do esquema da base (o `ESQUEMA_ATUAL` depois da 00005) sem os campos novos abre com os mesmos números;
  - obra com referência faz a ida e volta;
  - linha antiga sem `equipe` gera os mesmos recursos (CR-9);
  - E2E: obra salva antes da estrutura 2 abre igual depois da atualização.
- **Rollback:** reverter os commits. O app antigo pede a estrutura 1, recebe `VersionError`, cai na memória com o aviso "Armazenamento local indisponível" e **não grava nada**. As obras ficam intactas, mas inacessíveis até reaplicar a versão nova. No PR, recomendar exportar o `.xml` das obras importantes antes de atualizar (mesmo aviso do 00004).

## 07. Dados (T8 com banco)
Não se aplica: sem backend.

## 08. Segurança
**Superfícies novas:** (1) o script lê um xlsx (zip + XML) de origem externa; (2) o app lê um JSON escolhido pelo usuário e o grava no IndexedDB; (3) a tela "Integrações" com os cartões da Fase 2.

**Limites do leitor (D-9), todos com teste:**

| Limite | Valor | Medido em 09/2026 |
|---|---|---|
| Tamanho do xlsx | ≤ 64 MiB | 13.631.798 bytes |
| Entradas no zip | ≤ 200 | 30 |
| Tamanho declarado de uma entrada lida | ≤ 64 MiB | 23.174.487 |
| Soma descompactada das entradas lidas | ≤ 256 MiB | ~72 MB (`CSD` + `CCD` + `Analítico` + `sharedStrings`) |
| Razão de compressão de uma entrada lida | ≤ 200 | 11,2 (59,7 numa entrada **não** lida) |
| Saída do inflate | `maxOutputLength` = declarado + 1; tamanho real ≠ declarado → erro; CRC-32 (`zlib.crc32`) ≠ → erro | — |
| Recusas | criptografia (bit 0), método ≠ 0/8, ZIP64 (`0xFFFFFFFF`), multivolume, nome repetido, offsets fora do arquivo, diretório central truncado | — |
| XML | `<!DOCTYPE` ou `<!ENTITY` em qualquer parte → erro (XXE e *billion laughs*); só as 5 entidades predefinidas e referências numéricas | 0 `DOCTYPE` |
| Linhas e células | ≤ 200.000 linhas por aba e ≤ 200 colunas | 67.177 linhas e 58 colunas |
| Texto de célula | caracteres de controle removidos e `trim`; cortes da seção 05 aplicados na saída | — |
| Saída | ≤ 6 MiB (acima disso, erro sugerindo filtro); recusa caminho dentro do repositório (D-17) | 3,46 MB |

Referências (prática documentada): [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) (limites, zip bomb), [OWASP XXE Prevention](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html), [Node.js zlib — `maxOutputLength` e `crc32`](https://nodejs.org/api/zlib.html), [PKWARE APPNOTE (formato zip)](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).

**App:**
- tamanho conferido antes da leitura;
- `JSON.parse` em `try`;
- validação que reconstrói o objeto: `__proto__`, `constructor` e chaves extras não passam ([OWASP Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html));
- texto do recorte só por interpolação `{{ }}`, **nunca `v-html`**;
- nenhum `fetch`; a CSP do Nginx não muda;
- recorte só no IndexedDB do navegador (dado público, sem dado pessoal).

**Cartões da Fase 2 (RF-15.5, RNF-15.1):**
- só texto e ícone: nenhum `input`, `textarea`, `select`, `button` ou `contenteditable`;
- nenhuma variável `VITE_*`, nenhum link para provedor;
- texto fixo: "Requer servidor (Fase 2)", a spec e a área que aprova, e "Na Fase 2, a credencial é cadastrada só no servidor e nunca volta para a tela."
- A decisão do usuário (chaves cifradas no banco com Data Protection; WhatsApp por Baileys num sidecar Node na Fase 3) **não aparece na tela nem entra no código**. Baileys é um cliente não oficial do WhatsApp Web. Antes da Fase 3, o uso precisa do aval da **Segurança da Informação** e do **Jurídico** (CLAUDE.md › Validações com outras áreas).

**Rede determinística:**
- `classificar-diff.mjs` não marca T5 em `scripts/` (só olha `src/`, `regras-cronoai.mjs:317`): **declarar T5 no ciclo** e somar o `seguranca` ao lote de qualquer forma;
- `validar-regras.mjs` (v-html, `any`, segredos, `console.log`);
- `auditar-dependencias.mjs` deve listar **0 dependências novas**.

**Exige a Segurança da Informação:** o leitor sem dependência (D-1) e os limites acima, antes do merge; qualquer biblioteca, se a tarefa 7 mostrar que o leitor próprio não cabe.

## 09. Entregáveis
| # | Entregável | Fronteira | PLANO §3.6 | Critérios | Commit |
|---|---|---|---|---|---|
| 1 | Motor da RUP e esquema do recorte | `src/lib` + `src/types` + testes | E2 + esquema da E3 | AC-1 a AC-4 | `feat(sinapi): RUP por função do Analítico e esquema versionado do recorte` |
| 2 | Leitor offline e gerador do recorte | `scripts/sinapi` + configuração de teste e tipos | E1 + gerador da E3 | AC-5 a AC-7 | `feat(sinapi): leitor do layout 2025 e gerador do recorte por UF/regime/data-base` |
| 3 | Tela "Integrações" | módulo, cartões, navegação, teste de componente | E5 (sem a importação) | AC-8 | `feat(integracoes): tela de integrações da obra com cartões da Fase 2 sem campos` |
| 4 | Recorte na obra | armazenamento, store, cartão SINAPI com importação, calculadora e planilha | E4 + RF-15.2 | AC-9 a AC-12 | `feat(sinapi): recorte importado na obra e usado na calculadora e na planilha` |

Cada entregável passa no `npm run ci` sozinho.

## 10. Tarefas
| # | E | Tarefa (critério de pronto) | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | E1 | Tipos do recorte v1, `FuncaoMaoDeObra`, `RefRecorteObra` e `ItemCatalogoSinapi` (unidade `string`, profissional `string`); compila | dev-frontend | `src/types/sinapi.ts` | — |
| 2 | E1 | `sinapiRup.ts` **sem nenhum import de runtime** (só `import type`): `ehItemMaoDeObra`, `nomeDaFuncao`, `rupPorFuncao` (ordem preservada, soma por código se repetir), `ehFuncaoDeApoio`, `funcaoPrincipal` (D-6), `equipeDaComposicao`, `recursosDaEquipe`, `rotuloFuncao` (D-16). Testes CR-1 a CR-8 verdes | dev-frontend | `src/lib/sinapiRup.ts`, `src/lib/sinapiRup.test.ts` | 1 |
| 3 | E1 | `recorteSinapi.ts`: limites (seção 05), `chaveRecorte`, `validarRecorteSinapi`, `conferirRecorteComObra`, `descreverFonte`, `indexarRecorte`/`buscarComposicoes` (até 50, sem acento), `linhaDoRecorte`, `itemCatalogoDoRecorte`, `unidadeParaExibicao` (M2 → m², M3 → m³, KG → kg, M → m, UN → un; o resto como publicado). Matriz de recusas verde | dev-frontend | `src/lib/recorteSinapi.ts`, `src/lib/recorteSinapi.test.ts` | 1, 2 |
| 4 | E1 | `sinapiBudget.ts`: `BudgetLine.equipe?`/`fonte?`; `lineResources` usa `recursosDaEquipe` quando há `equipe`; `parseBudgetCsv(text, catalogo: ItemCatalogoSinapi[])`, aceitando o catálogo atual. Caracterização CR-9 e CSV com recorte verdes | dev-frontend | `src/lib/sinapiBudget.ts`, `src/lib/sinapiBudget.test.ts` | 2, 3 |
| 5 | E2 | Configuração: `tsconfig` (`scripts/**/*.ts`, `allowImportingTsExtensions`), `vite.config` (`include` + `scripts/**/*.test.ts`; *coverage* inalterado), ESLint (globais de Node em `scripts/**`), `package.json` (`"sinapi:recorte": "node --experimental-strip-types scripts/sinapi/gerar-recorte.ts"`). **Checkpoint:** um módulo que importa `../../src/lib/sinapiRup.ts` roda no Node 22 LTS e no 26; senão, D-2 alternativa | dev-frontend | `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `package.json` | 2 |
| 6 | E2 | `zip.ts`: diretório central, limites, inflate com `maxOutputLength`, CRC, recusas. Helper de teste que monta zips sintéticos (`deflateRawSync`) | dev-frontend | `scripts/sinapi/zip.ts`, `scripts/sinapi/zip.test.ts`, `scripts/sinapi/__testes__/zipSintetico.ts` | 5 |
| 7 | E2 | `planilha.ts`: `workbook.xml` + rels (nome da aba → arquivo), `sharedStrings`, iterador de linhas (valor, fórmula, coluna pela referência `A1`), recusa de `DOCTYPE`/`ENTITY`, limites de linhas e colunas. **Parar e devolver** se o subconjunto real exigir mais do que o medido (D-1) | dev-frontend | `scripts/sinapi/planilha.ts`, `scripts/sinapi/planilha.test.ts`, `scripts/sinapi/__testes__/xlsxSintetico.ts` | 6 |
| 8 | E2 | `layout2025.ts`: abas por nome normalizado, cabeçalho por texto (D-4), UFs, encargos, mês de referência (coerente entre as abas e com o nome do arquivo), regime pelo título, código pela fórmula (D-3) e conferência com o Analítico, mão de obra por `ehItemMaoDeObra`. Coluna ausente, mês divergente, regime trocado e código divergente dão erro nomeado | dev-frontend | `scripts/sinapi/layout2025.ts`, `scripts/sinapi/layout2025.test.ts` | 2, 7 |
| 9 | E2 | `recorte.ts`: `montarRecorte` (UF, regime, filtros, exclusões D-7, `totais`, SHA-256 por `node:crypto`, `geradoEm` injetável). A saída passa em `validarRecorteSinapi` | dev-frontend | `scripts/sinapi/recorte.ts`, `scripts/sinapi/recorte.test.ts` | 3, 8 |
| 10 | E2 | CLI `gerar-recorte.ts` (`parseArgs`: `--uf`, `--regime`, `--data-base` ou `--arquivo`, `--codigos`, `--grupos`, `--saida`, `--sobrescrever`). Localiza `SINAPI_Refer*ncia_AAAA_MM.xlsx` em `$CRONOAI_REF_DIR/sinapi/AAAA-MM/xlsx/` pelo nome normalizado; recusa saída no repositório (D-17); mensagens em português, sem pilha. README de uso para o administrador | dev-frontend | `scripts/sinapi/gerar-recorte.ts`, `scripts/sinapi/gerar-recorte.test.ts`, `scripts/sinapi/README.md` | 9 |
| 11 | E2 | Teste de referência, pulado sem `CRONOAI_REF_DIR`: CP-1 a CP-8, tabela 4.2, CR-11. Registrar o tempo de execução na evidência | dev-frontend | `scripts/sinapi/referencia-2026-09.test.ts` | 9 |
| 12 | E3 | Dados estáticos dos cartões da Fase 2 (WhatsApp → SPEC-08, Segurança + Jurídico; IA/transcrição → SPEC-08, Segurança + Jurídico; ERP → SPEC-09/SPEC-10, TI dona do ERP + Segurança; e-mail/Teams → SPEC-11, Segurança; login corporativo → SPEC-02, Segurança + Infraestrutura) e `EstadoIntegracao` (`configurada`, `nao-configurada`, `requer-servidor`, `aguardando-aprovacao`) com rótulo e ícone; `estadoCartaoSinapi` puro, com teste | dev-frontend | `src/data/integracoes.ts`, `src/lib/integracoes.ts`, `src/lib/integracoes.test.ts` | — |
| 13 | E3 | Tela e cartões: `IntegracoesModule.vue`, `CartaoIntegracao.vue` (`<article>`, título, estado com texto e ícone), `CartaoSinapi.vue` só leitura (UF, regime e data-base da obra, "Não configurada", atalho para Obras); módulo `integracoes` em `MODULES`, ícone no menu, tela no `App.vue` | dev-frontend | `src/modules/IntegracoesModule.vue`, `src/modules/integracoes/CartaoIntegracao.vue`, `src/modules/integracoes/CartaoSinapi.vue`, `src/stores/ui.ts`, `src/components/layout/AppSidebar.vue`, `src/App.vue` | 12 |
| 14 | E3 | Teste de componente (D-15) e E2E: 8 módulos abrem; `#/integracoes` mostra 6 cartões; nenhum campo nos cartões da Fase 2 | dev-frontend | `src/modules/integracoes/IntegracoesModule.test.ts`, `e2e/obras.spec.ts`, `e2e/navegacao.spec.ts` | 13 |
| 15 | E4 | Armazenamento: estrutura 2, `STORE_RECORTES`, `RegistroRecorte`, `lerRecorte`, `existeRecorte`, `gravarObra(registro, indice, extras?)` com `gravarRecorte`/`excluirRecortes`, `excluirObra(…, excluirRecortes?)`; adaptador de memória igual | dev-frontend | `src/stores/armazenamentoObras.ts`, `src/types/obra.ts` | 3 |
| 16 | E4 | `ProjectMeta.recorteSinapi`; `resumirObra` com a chave; `recortesOrfaos`; teste do esquema anterior (P-1) | dev-frontend | `src/types/domain.ts`, `src/lib/obras.ts`, `src/lib/obras.test.ts`, `src/lib/migracaoEstado.test.ts` | 15 |
| 17 | E4 | Store: `recorteSinapi` (`shallowRef` + `markRaw`), carga ao abrir, trocar, criar, duplicar e excluir obra; `importarRecorteSinapi(texto)`, `usarRecorteDisponivel()`, `removerRecorteSinapi()`; desvínculo em `atualizarDadosObra`; órfãos na gravação; log; falha de gravação reverte a referência e avisa | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.recorte.test.ts` | 16 |
| 18 | E4 | `CartaoSinapi` completo: importar (`.json`, tamanho antes de ler), substituir (confirmação se compartilhado), remover desta obra, "Usar nesta obra"; metadados (fonte, arquivo, SHA-256 abreviado com o valor inteiro no `title`, data da importação, composições, encargos) | dev-frontend | `src/modules/integracoes/CartaoSinapi.vue` | 17 |
| 19 | E4 | Calculadora: `BuscaComposicao.vue` (código ou texto, até 50 resultados), preenchimento pelo recorte, unidade e função só leitura quando vêm dele, equipe por função na prévia e na inserção, "Fonte: SINAPI SP 09/2026 não desonerado"; sem recorte, catálogo e aviso de hoje (`:206`). Planilha: chip de fonte por linha ("SINAPI SP 09/2026" ou "ilustrativo") | dev-frontend | `src/modules/SinapiModule.vue`, `src/modules/sinapi/BuscaComposicao.vue`, `src/modules/sinapi/BudgetSheet.vue` | 17 |
| 20 | E4 | Store: `importBudgetCsv` usa o catálogo do recorte quando há vínculo; `buildSinapiTask` cita a fonte nas notas ("Gerado pelo CronoAI a partir do SINAPI 103332 (SP 09/2026 não desonerado): …"). Teste | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.recorte.test.ts` | 17 |
| 21 | E4 | E2E: obra SP / não desonerado / 2026-09 importa a fixture; cartão "Configurada"; calculadora encontra 103332 com R$ 123,96 e 33 d.u. (640 m², 4); 2ª obra com a mesma chave usa sem reimportar; recusa de UF diferente; arquivo acima de 6 MiB recusado; recarregar mantém tudo | dev-frontend | `e2e/integracoes.spec.ts`, `e2e/arquivos/recorte-sinapi-sp-2026-09-amostra.json` | 18, 19, 20 |
| 22 | E4 | Documentação: linha "Recorte SINAPI" do ADR 00002 com a medição (403 caracteres por composição; 3,4 milhões na UF inteira); `CLAUDE.md` › Mapa do código (`scripts/sinapi`, `sinapiRup.ts`, `recorteSinapi.ts`, módulo Integrações) e lista de limites (`MAX_RECORTE_BYTES`) | dev-frontend | `.claude/adrs/00002-armazenamento-local-fase-1.md`, `CLAUDE.md` | 21 |

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor esperado |
|---|---|---|---|
| AC-1 | "funções da 104658 e da 100700 vêm do Analítico com o coeficiente publicado" | `src/lib/sinapiRup.test.ts` | SERVENTE 1,279 e PEDREIRO 0,639; 3 funções da 100700 na ordem |
| AC-1 | "item de insumo, unidade ≠ H ou sem o sufixo não é mão de obra" | idem | `false` para INSUMO "SEGURO - HORISTA…", COMPOSICAO H "CAMINHÃO TOCO…" |
| AC-2 | "principal: maior oficial; empate pelo 1º; só apoio" | idem | 103669 → PEDREIRO; 93358 → SERVENTE |
| AC-3 | "duração, equipe e BAC CR-1 a CR-7" | `sinapiRup.test.ts`, `sinapiBudget.test.ts` | tabela 4.3 (33, 4, 15, 6, 9, 37 e 65 d.u.; recursos e BAC exatos) |
| AC-3 | "linha antiga sem equipe = hoje (CR-9)" | `sinapiBudget.test.ts` | 17 d.u.; Pedreiro 4 + Servente 2 |
| AC-4 | "recorte válido passa; matriz de recusas" | `src/lib/recorteSinapi.test.ts` | uma recusa por linha da tabela da seção 05, com a mensagem em português |
| AC-4 | "`__proto__` e chaves extras não aparecem no objeto validado" | idem | `Object.prototype` intacto; `Object.keys` só com os campos do esquema |
| AC-4 | "conferência com a obra" | idem | obra sem data-base → recusa; BA × SP → recusa citando as duas chaves |
| AC-5 | "layout com coluna extra inserida ainda é lido"; "coluna ausente → erro nomeado"; "código pela fórmula; divergência com o Analítico → erro" | `scripts/sinapi/layout2025.test.ts` | xlsx sintético com 3 composições reais (literais da tabela 4.2) |
| AC-5 | "mês divergente entre abas ou com o nome → erro"; "aba CCD com título SEM DESONERAÇÃO → erro" | idem | erro |
| AC-6 | "planilha 09/2026: CP-1 a CP-8, 20 composições, CR-11" | `scripts/sinapi/referencia-2026-09.test.ts` (local) | tabelas 4.1 e 4.2; `custoUnitario` com diferença ≤ 0,005 |
| AC-7 | "CLI gera recorte válido; recusa saída em `src/` e no repositório; não sobrescreve sem a opção" | `scripts/sinapi/gerar-recorte.test.ts` | arquivo válido; 3 recusas |
| AC-8 | "tela Integrações: 6 cartões; cada estado com texto e `svg`; cartões da Fase 2 sem `input`, `textarea`, `select`, `button` ou `[contenteditable]`; nenhum `input[type=password]`; o único `input` é `type=file` com `accept` de JSON; nenhum rótulo, `placeholder` ou `name` com token/senha/chave/segredo" | `src/modules/integracoes/IntegracoesModule.test.ts` | 0 campos |
| AC-8 | "os 8 módulos abrem sem erro de console" | `e2e/obras.spec.ts` | 8 |
| AC-9 | "importar grava recorte, referência e índice numa transação; falha de gravação reverte" | `src/stores/useProjectStore.recorte.test.ts` | memória com 1 recorte; com `falhar.gravar`, nada gravado e a referência ausente |
| AC-10 | "2ª obra usa sem reimportar; remover de uma mantém para a outra; remover da última apaga; excluir obra idem; trocar UF desvincula com log" | idem | contagem de registros: 1 → 1 → 0 |
| AC-11 | "tarefa gerada cita a fonte nas notas"; E2E da calculadora | `useProjectStore.recorte.test.ts`, `e2e/integracoes.spec.ts` | notas com "(SP 09/2026 não desonerado)"; R$ 123,96; 33 d.u. |
| AC-12 | "CSV com código do recorte completa RUP, custo, função e equipe" | `sinapiBudget.test.ts` | 103332 → RUP 1,6225376, R$ 123,96, Pedreiro, equipe [Servente 0,5] |
| M-1 | "arquivo acima de 6 MiB recusado sem ler" | `e2e/integracoes.spec.ts` | toast de erro; IndexedDB sem recorte |
| M-2 | "JSON malformado, formato desconhecido, versão 2" | `recorteSinapi.test.ts` | 3 mensagens |
| M-3 | ida e volta MSPDI com `strictOrder` | `src/lib/msProjectXmlParser.test.ts` (sem alteração) | verde |
| P-1 | "registro do esquema da base sem os campos novos abre igual" | `migracaoEstado.test.ts` / `useProjectStore.obras.test.ts` | mesmas datas, BAC e recursos |
| P-2 | "obra salva na estrutura 1 abre na 2" | `e2e/integracoes.spec.ts` | obra intacta, store criada |
| P-3 | "recorte de formato mais novo não é sobrescrito" | `useProjectStore.recorte.test.ts` | importação recusada; registro igual |
| S-1 | zip bomb: declarado > limite; real > declarado; razão > 200; > 200 entradas; CRC errado; criptografado; método 12; ZIP64; xlsx > 64 MiB; lixo/truncado | `scripts/sinapi/zip.test.ts` | erro específico em cada caso, sem descompactar além do limite |
| S-2 | `DOCTYPE`/`ENTITY` no `sharedStrings` e na aba | `scripts/sinapi/planilha.test.ts` | erro |
| S-3 | ver AC-4 (`__proto__`) | `recorteSinapi.test.ts` | — |

## 12. Critérios de aceite e escopo fechado
- **AC-1:** a RUP de cada função é o coeficiente publicado do item de mão de obra (D-5), sem arredondar.
- **AC-2:** a função principal segue D-6, inclusive empate e composição só com apoio.
- **AC-3:** duração, equipe e BAC dos casos CR-1 a CR-7 dão os números da seção 4.3; linhas sem `equipe` dão os números de hoje (CR-9). *(Conforme a resposta da Q1.)*
- **AC-4:** o esquema v1 aceita o recorte válido e recusa cada violação da seção 05 com mensagem em português; o objeto validado só tem campos do esquema.
- **AC-5:** o leitor localiza abas, colunas, UFs, encargos e mês pelo texto; o código vem da fórmula e é conferido com o Analítico; mudança de layout gera erro nomeado, nunca recorte parcial.
- **AC-6:** com a planilha de 09/2026, os números das tabelas 4.1 e 4.2 são reproduzidos (custo ± R$ 0,01; RUP igual ao coeficiente). Execução local registrada na matriz; o CI pula.
- **AC-7:** o CLI gera um recorte que passa em `validarRecorteSinapi`, fora do repositório, sem sobrescrever sem a opção.
- **AC-8:** a tela "Integrações" da obra ativa mostra o cartão SINAPI e 5 cartões da Fase 2 com estado em texto e ícone, a spec e a área que aprova, sem nenhum campo de credencial (teste de componente).
- **AC-9:** importar aceita `.json` ≤ 6 MiB, valida, confere com a obra, grava recorte, referência e índice numa transação e registra no log; recusas sem gravar nada.
- **AC-10:** o recorte é compartilhado por chave (um registro), com vínculo explícito por obra, limpeza do órfão e desvínculo ao mudar UF, regime ou data-base.
- **AC-11:** a calculadora busca no recorte, preenche custo, RUP, função e equipe e mostra a fonte; sem recorte, o catálogo ilustrativo continua com o aviso; a tarefa gerada cita a fonte.
- **AC-12:** a planilha CSV completa as linhas pelo recorte quando o código existe; o resto segue a regra de hoje.

Itens previstos na matriz: AC-1 a AC-12, N-1 a N-6, M-1 a M-3, P-1 a P-4, S-1 a S-7, R-1 a R-3, V-1 e V-2 (seção 13).

**Dentro do escopo:** as 22 tarefas da seção 10, e só os arquivos listados nelas.

**Fora do escopo:**
- Upload do xlsx no app; leitura do zip nacional externo; abas de insumos (`ISD`/`ICD`/`ISE`), `CSE` e "Analítico com Custo"; os outros 3 xlsx do pacote (Manutenções, famílias e coeficientes, mão de obra).
- Regime "sem encargos" na obra (o comentário de `ufs.ts:33` fica como está).
- Explosão de subcomposições (HH indireto); `%AS` (significado a confirmar com Orçamento/Custos).
- Custo de mão de obra pela tabela, se a Q2 = a: `HOURLY_RATES`/`rateOf` e as premissas da 00005 continuam ilustrativos e marcados.
- RF-07.4 (composições próprias), RF-07.5 (fator por frente), RF-07.6 (orçamento `.xlsx`), RF-07.7 (orçamento ↔ EAP) e o critério "trocar a data-base recalcula o BAC".
- Alterar tarefas já geradas ou o BAC existente.
- `msProjectXmlParser.ts`; cartão e mapeamento do MS Project (ciclo 00010).
- Qualquer conector, campo, chamada de rede, backend, Data Protection, Baileys ou ingestão mensal das 27 UFs (Fase 2/3).
- `navigator.storage.persist()` (00007).
- Dependência npm nova.
- CPM, calendário, EVM, cenários e suprimentos.
- `seedBudget` e catálogo ilustrativo (só passam a *fallback*).
- Limiar de cobertura e Docker/CI.

## 13. Matriz de verificação (prevista)
| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| AC-1 | RUP = coeficiente publicado | `sinapiRup.test.ts` | sim | NOT_RUN | — |
| AC-2 | Principal e empate | `sinapiRup.test.ts` | sim | NOT_RUN | — |
| AC-3 | CR-1 a CR-7 e CR-9 | `sinapiRup.test.ts`, `sinapiBudget.test.ts` | sim | NOT_RUN | — |
| AC-4 | Esquema v1 e recusas | `recorteSinapi.test.ts` | sim | NOT_RUN | — |
| AC-5 | Leitor por cabeçalho e fórmula | `layout2025.test.ts` | sim | NOT_RUN | — |
| AC-6 | Planilha 09/2026 (tabelas 4.1 e 4.2) | `referencia-2026-09.test.ts` com `CRONOAI_REF_DIR` (local) | sim | NOT_RUN | saída local literal |
| AC-7 | CLI | `gerar-recorte.test.ts` | sim | NOT_RUN | — |
| AC-8 | Integrações sem campos | `IntegracoesModule.test.ts`, E2E | sim | NOT_RUN | — |
| AC-9 | Importação atômica | `useProjectStore.recorte.test.ts` | sim | NOT_RUN | — |
| AC-10 | Compartilhamento e limpeza | idem | sim | NOT_RUN | — |
| AC-11 | Calculadora e fonte | store + E2E | sim | NOT_RUN | — |
| AC-12 | Planilha CSV | `sinapiBudget.test.ts` | sim | NOT_RUN | — |
| N-1 | 20 custos ± R$ 0,01 (SPEC-07 §4) | `referencia-2026-09.test.ts` | sim | NOT_RUN | — |
| N-2 | RUP = coeficiente (SPEC-07 §4) | idem + `sinapiRup.test.ts` | sim | NOT_RUN | — |
| N-3 | Durações, equipes e BAC CR-1 a CR-7 | `sinapiRup.test.ts` | sim | NOT_RUN | — |
| N-4 | Linhas antigas inalteradas (CR-9) | `sinapiBudget.test.ts` | sim | NOT_RUN | — |
| N-5 | Encargos (CR-10) | `recorteSinapi.test.ts` | não | NOT_RUN | — |
| N-6 | Números do E2E existente inalterados | `npm run e2e` | sim | NOT_RUN | — |
| M-1 | JSON > 6 MiB recusado antes da leitura | E2E | sim | NOT_RUN | — |
| M-2 | JSON malformado, desconhecido ou mais novo | `recorteSinapi.test.ts` | sim | NOT_RUN | — |
| M-3 | MSPDI inalterado (ida e volta, `strictOrder`) | `msProjectXmlParser.test.ts` | sim | NOT_RUN | — |
| P-1 | Esquema da base sem campos novos abre igual | `migracaoEstado.test.ts` | sim | NOT_RUN | — |
| P-2 | Estrutura 1 → 2 sem tocar as obras | E2E | sim | NOT_RUN | — |
| P-3 | Recorte mais novo não sobrescrito | store test | sim | NOT_RUN | — |
| P-4 | Rollback: app antigo cai na memória sem gravar | argumento (`armazenamentoObras.ts:198-206`); conferência manual opcional | não | NOT_RUN | — |
| S-1 | Limites de zip bomb | `zip.test.ts` | sim | NOT_RUN | — |
| S-2 | `DOCTYPE`/`ENTITY` recusados | `planilha.test.ts` | sim | NOT_RUN | — |
| S-3 | Sem poluição de protótipo | `recorteSinapi.test.ts` | sim | NOT_RUN | — |
| S-4 | Sem `v-html`; regras automáticas | `validar-regras.mjs --base master` | sim | NOT_RUN | — |
| S-5 | 0 dependências novas | `auditar-dependencias.mjs --base master` | sim | NOT_RUN | — |
| S-6 | Sem credencial, `VITE_*` ou `fetch` nos cartões | teste de componente + `classificar-diff` sem T8 | sim | NOT_RUN | — |
| S-7 | Saída do script fora do repositório e do bundle | `gerar-recorte.test.ts` | sim | NOT_RUN | — |
| R-1 | `sinapiRup.ts` sem import de runtime | lint + o script o importa no Node | sim | NOT_RUN | — |
| R-2 | Catálogo ilustrativo continua marcado (Inviolável 7) | revisão + V-2 | sim | NOT_RUN | — |
| R-3 | Recorte fora do estado reativo profundo (D-13) | revisão do `arquiteto` | não | NOT_RUN | — |
| V-1 | Integrações nos temas claro e escuro, 1440 px e celular | `npm run dev`, captura | não | NOT_RUN | — |
| V-2 | Calculadora com e sem recorte (fonte × aviso ilustrativo) | `npm run dev`, captura | não | NOT_RUN | — |

## 14. Validadores e outras áreas
**Validadores (em paralelo, na mesma mensagem, por entregável ou no lote final):**
- `testes`: executa a suíte, inclusive a de referência com `CRONOAI_REF_DIR`, e fecha a matriz.
- `arquiteto` (revisão): aderência ao plano, camadas (`src/lib` puro, recorte fora do `state`), escopo fechado, D-14.
- `especialista-obra`: D-5, D-6, D-16 e a tabela 4.3 contra a publicação da Caixa; dias úteis × corridos.
- `seguranca`: seção 08, D-1, D-17 e os cartões da Fase 2.
- **Auditoria independente:** `revisor` em `MODO: AUDITAR`, com o pedido, o diff, a matriz e a evidência bruta.

| Tema | Área | Antes de quê |
|---|---|---|
| Regra da função principal e equipe proporcional (D-6), mapeamento de funções (D-16), exclusão de custo 0 (D-7), significado do `%AS` | **Orçamento/Custos** | merge na `master` |
| Leitor de arquivo externo sem dependência (D-1) e limites; biblioteca, se for preciso | **Segurança da Informação** | merge na `master` |
| Fase 2: onde fica o *key ring* do Data Protection; WhatsApp por Baileys (cliente não oficial) | **Segurança da Informação**, **Infraestrutura**, **Jurídico** | planejamento da Fase 2/3 (fora deste ciclo) |
| Fixture com 3 composições públicas da Caixa | Nenhuma obrigatória (opinião: dado público); Jurídico só se a política interna exigir | — |

## 15. Perguntas de gate (até 3)
- **Q1. Como a calculadora e a planilha usam as várias funções de uma composição?** *Muda o número de recursos e o rótulo, não a duração.*
  - **(a)** Como hoje: só a função principal dimensiona; apoio vira "Servente" com `helperRatio` = Σ apoio ÷ principal; oficiais a mais são ignorados, com aviso. No CR-6, 6 encanadores + 6 "Servente"; no CR-3, o carpinteiro some.
  - **(b) Recomendação (opinião):** cada função vira recurso, com `⌈equipe × cᶠ ÷ cᵖ⌉`; duração pela principal; `BudgetLine.equipe` opcional e linhas antigas iguais. Fiel ao Analítico (6,4% das composições com 2 ou mais oficiais), com custo pequeno: 1 campo opcional e 1 função pura.
  - **(c)** Duração pela função de maior HH (gargalo), com a equipe informada para ela. Muda o significado do campo "equipe" na tela.
- **Q2. O custo de mão de obra estimado da calculadora (`SinapiModule.vue:43`) passa a usar a tabela?** *Muda um número exibido.*
  - **(a) Recomendação (opinião):** não neste ciclo. Continua com `rateOf`/premissas da 00005, marcado como ilustrativo. Evita sobrepor a 00005 (taxas por obra) e mantém o tamanho M.
  - **(b)** Sim: custo horário das composições "X COM ENCARGOS COMPLEMENTARES" da UF (ex.: 88309, Pedreiro). O gerador passa a incluir essas composições mesmo com filtro, e a mão de obra estimada muda nas obras com recorte (+3 tarefas e validação com Orçamento/Custos).
- **Q3. Um recorte importado numa obra vale automaticamente para outra obra com a mesma UF, regime e data-base?** *Muda os números das próximas tarefas de outra obra.*
  - **(a) Recomendação (opinião):** não. A outra obra vê "Usar nesta obra" e decide; o registro continua único (cota).
  - **(b)** Sim: o vínculo é a chave. Mais simples, mas importar numa obra muda a calculadora da outra sem ação dela.

## 16. Riscos e pós-entrega
| Risco | Mitigação |
|---|---|
| A Caixa muda o layout (colunas, nomes de aba, fórmula do código) | D-3/D-4: localização por texto e erro nomeado; teste com coluna inserida; teste de referência por mês (`referencia-AAAA-MM.test.ts`) a cada publicação nova |
| *Type stripping* indisponível no Node 22 do `.nvmrc` | Checkpoint na tarefa 5; alternativa `.mjs` (D-2) |
| Leitor próprio maior que o previsto | Parar na tarefa 7 e levar à Segurança a escolha de biblioteca (D-1) |
| Conflito com 00004/00005 em `SinapiModule.vue`, `BudgetSheet.vue`, `useProjectStore.ts` (dias → minutos, horas por dia como premissa) | Base depois do 00005; linhas reconfirmadas; CR com 8 h, ajustados se a 00005 tornar a jornada configurável (padrão continua 8 h) |
| `ceil` com proporção não exata acrescenta um ajudante (CR-2: 5 serventes para 2 pedreiros) | Fixado em teste; o `especialista-obra` e Orçamento/Custos confirmam |
| Cota do navegador (~3,4 MB por UF inteira) | Recorte compartilhado; limpeza do órfão; filtros por grupo e código no script; aviso de cota existente |
| Desempenho ao abrir obra (`JSON.parse` de 3,4 MB e índice de busca) | `shallowRef` + `markRaw`; índice normalizado montado uma vez por recorte |
| Testes de referência fora do CI | Execução local obrigatória com a saída literal na matriz (AC-6, N-1) |
| Rollback | Seção 06: o app antigo cai na memória sem gravar; recomendar exportar o `.xml` antes de atualizar |

**Pós-entrega:** a cada nova publicação mensal, o administrador roda `npm run sinapi:recorte` e as obras importam o recorte novo. A ingestão automática e a entrega por obra ficam no backend (Fase 2), com Segurança e Infraestrutura. Nenhuma publicação nem hospedagem neste ciclo.

## Grafo de tarefas
```
E1: 1 → 2 → 3 → 4
E2: (2) → 5 → 6 → 7 → 8 → 9 (← 3) → 10 → 11
E3: 12 → 13 → 14              (independente do E1/E2: pode correr em paralelo ao E1)
E4: (3, 13) → 15 → 16 → 17 → {18 ‖ 19 ‖ 20} → 21 → 22
```
Ordem dos commits: E1 → E2 → E3 → E4, ou E1 → E3 → E2 → E4. O E4 exige E1 e E3 no tronco.

CONHECIMENTO NOVO:
- Na aba `CSD`/`CCD`/`CSE` do layout 2025, o código da composição só existe como 2º argumento de `=HYPERLINK("#"&CELL("address",OFFSET(Analítico!$B$1,MATCH(<código>,Analítico!$B:$B,0)-1,3)),<código>)`; o valor em cache é 0. Casar pela descrição erra, porque há descrições iguais com unidades diferentes — leitor SINAPI.
- No zip nacional da Caixa (`SINAPI-2026-09-formato-xlsx.zip`), os nomes vêm em CP850 com a *flag* UTF-8 (bit 11) ligada: decodificar como UTF-8 gera "Refer�ncia" — leitor SINAPI / instrução ao administrador.
- No Analítico, a linha da composição tem "Tipo Item" vazio. A mão de obra aparece como `COMPOSICAO` com unidade `H` e o sufixo "COM ENCARGOS COMPLEMENTARES" (61 funções em 09/2026). Os itens `INSUMO` em H são encargos complementares (seguro, EPI, alimentação), não função — RUP por função.
- Composições `SEM CUSTO` têm custo 0 em todas as UFs; algumas `COM CUSTO` também têm custo 0 em parte das UFs (104088 em 21 UFs) — recorte e BAC.
- As proporções entre coeficientes do Analítico raramente são exatas (104658: 1,279 ÷ 0,639 = 2,0016): o `ceil` da equipe acrescenta um ajudante — dimensionamento de equipe.
- Códigos do catálogo ilustrativo existem na tabela real com outro serviço (103332 real = bloco 9x14x19, não 14x19x29), e 92873 e 92778 não existem em 09/2026 — reforça o Inviolável 7.
- O xlsx de 13,6 MB descompacta em 120 MB; os `_rels` das abas de custo (hiperlinks para os cadernos técnicos) têm razão 59,7. Limites de zip bomb precisam valer por entrada lida, não pelo arquivo — leitores de zip.
- O recorte mede 403 caracteres por composição, não os ~250 do ADR 00002 — estimativa de cota.

## Decisões do gate (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar até o fim das fases. O gate foi decidido pelas recomendações, **sujeito à revisão do usuário no PR**:
- **Q1 → (b)** cada função da composição vira um recurso proporcional; a duração continua pela função principal.
- **Q2 → (a)** o custo de mão de obra estimado da calculadora continua ilustrativo neste ciclo.
- **Q3 → (a)** outra obra com a mesma UF/regime/data-base usa o recorte só pelo botão "Usar nesta obra", nunca de forma automática.
