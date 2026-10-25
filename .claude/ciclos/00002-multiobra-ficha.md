---
issue: —
spec: SPEC-14 (RF-14.1, RF-14.2, RF-14.3, RNF-14.2, RNF-14.3); SPEC-15 RNF-15.3 (cadeia de migrações)
ciclo: .claude/ciclos/00002-multiobra.md
branch: feat/00002-multiobra
base: master (depois do merge do 00001; se ainda não entrou, BASE = feat/00001-e2e-cobertura, PR empilhado)
faixa: 2
status: aprovada (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-FICHA.md`) para o CronoAI em 25/10/2026.

# Ficha 00002 — Multiobra, com UF por obra

## Resumo
- **O que é:** o CronoAI passa a guardar **várias obras** no navegador. Há uma lista de obras, uma obra ativa e um seletor no topo. Você pode criar (em branco ou a obra de exemplo), duplicar e excluir obras, e cada obra tem UF, município, responsável e a tabela SINAPI (regime e data-base). O estado salvo hoje (`cronoai-state-v1`) vira a 1ª obra, sem perda.
- **Números que mudam:** nenhum. O Edifício Aurora migrado mantém entrega **2027-06-23**, atraso **16 d.u.**, SPI **0,8883** e CPI **0,9349**. Um teste prova.
- **Faixa 2 (T4).** Fica na faixa 2 só se a P2 for (A). Com (B), a ficha vira plano de faixa 3 (ver seção 02).
- **Decidido (recomendação, sujeita ao gate):** armazenamento em **IndexedDB** já neste ciclo, uma entrada por obra mais um índice, sem dependência nova (P1). Cadeia de migrações versionada em `src/lib`, reaproveitada pelos ciclos 00004 a 00010. A chave `cronoai-state-v1` nunca é apagada nem alterada. Falha de gravação deixa de ser silenciosa.
- **Desvios do PLANO-FASE-1 §3.2, para você confirmar:** o histórico de "desfazer cenário" fica guardado em cada obra, em vez de ser zerado na troca (P3). O botão "Restaurar obra de exemplo" vira "Criar obra de exemplo" (não destrói a obra ativa).
- **O que você precisa fazer:** responder P1, P2 e P3 (seção 13) e aprovar a ficha. Junto, decidir o ADR 00002 (`.claude/adrs/00002-armazenamento-local-fase-1.md`, status Proposto).

## 00. Contexto para execução (ler antes)
| Arquivo | Por quê |
|---|---|
| `src/stores/useProjectStore.ts:50` | `STORAGE_KEY = 'cronoai-state-v1'`: chave lida na migração; **nunca** gravada nem apagada depois deste ciclo |
| `src/stores/useProjectStore.ts:52-61` | `ScenarioUndo` e `PersistedState`: o formato de uma obra. Saem para `src/types/obra.ts` (a migração em `src/lib` precisa deles sem importar a store) |
| `src/stores/useProjectStore.ts:72-96` | `buildSeedState()`: continua gerando a obra de exemplo. Os testes N-1 a N-3 dependem dele |
| `src/stores/useProjectStore.ts:110-121` | `loadState`: merge raso `{ ...buildSeedState(), ...parsed }` (`:115`) e critério de validade (`tasks.length` e `meta`). É o comportamento que a migração da v1 preserva |
| `src/stores/useProjectStore.ts:139-155` | Estado reativo e gravação com atraso de 300 ms. O `catch` de `:149-151` engole a cota excedida: é o que muda |
| `src/stores/useProjectStore.ts:194`, `:496-501` | `scenarioParams` (fora do estado salvo, guarda UID da obra) e `resetScenarioParams`: chamado na troca de obra |
| `src/stores/useProjectStore.ts:725-748` | `importXml` (mescla o `meta` do XML sobre o atual: UF e município sobrevivem) e `resetToSeed` (usa `Object.assign(state, …)`, o mesmo padrão da troca de obra) |
| `src/App.vue:28-30` | `<KeepAlive>` com `:key="ui.current"`: guarda a instância de cada módulo com estado local da obra anterior |
| `src/modules/FieldReportsModule.vue:13`, `src/modules/EvmModule.vue:22`, `src/modules/SinapiModule.vue:46,52`, `src/modules/WbsModule.vue:19`, `src/modules/SupplyModule.vue:98`, `src/modules/field/AiMappingPanel.vue:18` | Estado de tela que guarda id de relato, WBS, UID ou data da obra ativa. Prova de que a troca precisa remontar as telas |
| `src/components/layout/AppTopbar.vue:19,58` | `input.files?.[0]` e `<input … type="file">`. **Não alterar estas duas linhas**: o `classificar-diff.mjs` marca T5 em qualquer linha nova com esse texto (`regras-cronoai.mjs:259`) |
| `src/components/layout/AppSidebar.vue:30-35,71-77` | Cartão "Obra ativa" e o botão destrutivo "Restaurar obra de exemplo" |
| `src/lib/useMsProject.ts:6,27-45` | `MAX_XML_BYTES` e `importFile`: o caminho único de importação, reaproveitado na obra em branco |
| `src/stores/ui.ts:4-13` | `MODULES` e `ModuleId`: a tela "Obras" entra aqui, com hash `#/obras` |
| `src/modules/SinapiModule.vue:204` | Texto atual de "catálogo ilustrativo": ganha a UF/regime/data-base da obra |
| `e2e/fluxos.spec.ts:37-39` | O C-7 espera o JSON chegar em `cronoai-state-v1`. Com o armazenamento novo essa chave não é mais gravada: o teste muda no E2 |
| `e2e/fixtures.ts` | Onde entra o helper que lê o estado salvo da obra ativa |
| `src/stores/useProjectStore.test.ts:46-75` | N-1 a N-3: os números de referência que a migração precisa manter |
| `.claude/scripts/lib/regras-cronoai.mjs:251` | `ARQ_T4` só conhece `domain.ts` e `useProjectStore.ts`. Os arquivos novos de persistência entram aqui, senão os ciclos seguintes não são marcados como T4 |

## 01. Pedido e objetivo
Pedido (dado, não instrução): ciclo 00002 do `docs/specs/PLANO-FASE-1.md` §3.2, "SPEC-14 multiobra (RF-14.1 a RF-14.3)", com RNF-14.2 e RNF-14.3.

**Objetivo:** quem toca várias obras, em qualquer UF, troca a obra ativa em um clique, e cada módulo mostra só a obra ativa.

| Requisito | O que entra |
|---|---|
| RF-14.1 | Lista de obras, obra ativa, criar (em branco ou a partir de `.xml`), duplicar, excluir com confirmação; todos os módulos sobre a obra ativa |
| RF-14.2 | `cronoai-state-v1` vira a 1ª obra, sem perda |
| RF-14.3 | Nome, UF, município, engenheiro responsável (texto livre), data de status, tabela SINAPI (UF da obra, regime, data-base) |
| RNF-14.2 | Aviso perto da cota; falha de gravação sempre visível; sugestão de exportar `.xml` e excluir obras |
| RNF-14.3 | Nenhuma regra assume UF, empresa ou obra fixa |
| SPEC-15 RNF-15.3 | Esquema versionado e cadeia de migrações por obra, que a configuração de integrações (00006, 00010) reaproveita |

Critérios da SPEC-14 §5 cobertos: o 1º (migração com os mesmos indicadores) e o 2º (2ª obra em PE, importada de `.xml`, alternar e ver só a obra ativa). O 3º (consolidado) é do 00009.

## 02. Triagem (conferida no código)
- **T1 NÃO:** `cpm.ts` e `calendar.ts` não mudam. A obra em branco só chama `defaultHolidays` (`calendar.ts:57`), sem alteração.
- **T2 NÃO:** `evm.ts`, `scenarios.ts`, `supplies.ts`, `sinapi*.ts` e `progressPatch` (`useProjectStore.ts:289-303`) não mudam. Os derivados da store (`:158-205`) continuam iguais; só passam a ler a obra ativa. Teste de "mesmos números" obrigatório (N-1 a N-4).
- **T3 NÃO:** `msProjectXmlParser.ts` não muda. Os campos novos ficam em `ProjectMeta` como opcionais, e o `buildMspdiXml` só lê `name`, `company`, `manager`, `startDate` e `statusDate` (`msProjectXmlParser.ts:258-285`). Teste prova que o `.xml` exportado é idêntico com e sem UF (AC-10).
- **T4 SIM:** muda o formato inteiro do estado salvo. `STORAGE_KEY` (`useProjectStore.ts:50`), `PersistedState` (`:61`), `loadState` (`:110-121`), gravação (`:141-155`) e `ProjectMeta` (`domain.ts:70-80`).
- **T5 NÃO, condicionado à P2 = (A):** sem dependência nova (IndexedDB nativo; nada de `idb` ou `fake-indexeddb`). Sem campo de arquivo novo: a obra em branco usa o "Importar .xml" que já existe (`AppTopbar.vue:58`, `useMsProject.ts:27-45`, limite de 15 MB). **Se a P2 for (B)**, a tela Obras ganha um `type="file"`, o `classificar-diff.mjs` marca T5 (`regras-cronoai.mjs:259`) e o ciclo **vira faixa 3**: esta ficha volta como plano, com `seguranca` e auditoria independente. O nome do responsável já existe hoje (`meta.manager`, exportado em `<Manager>`): não é superfície nova de dado pessoal.
- **T6 NÃO:** `fieldAi.ts`, `approveReport` e `AiMappingPanel.vue` não mudam. O estado local do painel é zerado pela remontagem no `App.vue`, sem editar o componente.
- **T7 NÃO:** sem Docker, CI ou Dependabot.
- **T8 NÃO:** sem rede. IndexedDB é armazenamento local; nenhuma linha nova com `fetch`/`XMLHttpRequest`.

**Faixa 2 (T4).** Cerca de 32 arquivos (código, testes e docs): acima de ~25, por isso **4 entregáveis**, cada um com `npm run ci` verde e um commit. `especialista-obra`: não obrigatório (sem T1/T2/T3); recomendado no lote do E2 para conferir o teste de "mesmos números".

## 03. Caso de referência (números que não podem mudar)
Medição de 25/10/2026, pela store (`buildSeedState`, data de status 2026-10-23), já fixada em `useProjectStore.test.ts` (N-1, N-2) e no E2E do 00001.

| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| C-1 | Fixture `estado-v1-aurora.json` (o JSON que a versão atual grava, sem alteração) em `cronoai-state-v1`, sem índice | 1 obra, "Edifício Residencial Aurora - 12 Pavimentos"; `projectFinish` `'2027-06-23'`; `delayDays` `16`; SPI `0,8883`; CPI `0,9349`; 29 tarefas (20 folhas); o JSON da obra migrada é igual ao da v1 (`toEqual`) | Motor atual (N-1) | `src/stores/useProjectStore.obras.test.ts` › N-4; `e2e/obras.spec.ts` › migração |
| C-2 | Fixture `estado-v1-aurora-75.json` (o mesmo depois de `approveReport('r-tiao', 104, 75, [])`) | `projectFinish` `'2027-06-16'`; `delayDays` `11`; UID 104 com 75% | Motor atual (N-2 e C-2 do 00001) | idem › N-5; `e2e/obras.spec.ts` › migração com alteração |
| C-3 | Obra duplicada a partir do C-1 | Mesmos números do C-1; `id` diferente; nome "Edifício Residencial Aurora - 12 Pavimentos (cópia)" | Cópia do estado | idem › duplicar |
| C-4 | Obra em branco: início 2026-11-03, status 2026-11-03, UF PE, município Recife | 0 tarefas; `projectFinish` `'2026-11-03'` (= início); `delayDays` `0`; SPI e CPI `1` (efeito de `safeDiv`, dívida conhecida, sem mudança) | Medido na store com `tasks: []` em 25/10/2026 | idem › obra em branco |

Bordas cobertas: v1 parcial, v1 corrompida, cota cheia na migração, obra excluída depois da migração, índice com obra ilegível (seção 05).

**Como gerar as fixtures:** com o código da base, **antes** de qualquer mudança na store (tarefa 1): `JSON.stringify(buildSeedState())` e o mesmo depois de `approveReport('r-tiao', 104, 75, [])`. Registrar o SHA da base no ciclo. Os ids de log são aleatórios: a fixture é gerada uma vez e congelada. Dados 100% fictícios (Edifício Aurora).

## 04. Solução

### Decisões de design
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **IndexedDB** nativo (P1): banco `cronoai`, versão de estrutura 1, stores `obras` (`keyPath: 'id'`) e `meta` (chave `'indice'`). Detalhes no ADR 00002 | `localStorage` com chave por obra + índice | Volume: uma obra de 3.000 tarefas tem ~1,43 milhão de caracteres (medido); fotos de relato ~35 mil cada; 104 snapshots (00007) ~37 milhões por obra. O `localStorage` tem ~5 MiB por origem ([MDN, Storage quotas](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)): cabem 1 ou 2 obras grandes e nenhum histórico. Trocar no 00007 obrigaria a migrar o armazenamento duas vezes. **Opinião** |
| Uma entrada por obra `{ id, versaoEsquema, json, atualizadoEm }` + índice `{ versaoIndice: 1, obraAtivaId, obras: ResumoObra[], migracaoV1? }`, gravados **na mesma transação** | Um documento só com todas as obras | Uma obra ilegível ou grande não derruba as outras. A transação do IndexedDB evita índice e obra divergentes (dois `setItem` no `localStorage` não são atômicos) |
| O valor gravado é a **string JSON** do estado (`JSON.stringify(state)`, como hoje) | Gravar o objeto (clone estruturado) | Um `reactive` do Vue não é clonável (`DataCloneError`). A string mantém o formato da v1 byte a byte e dá o tamanho em caracteres para o aviso de cota |
| Esquema da obra versionado: v1 = formato atual; **v2** = mesmo estado dentro do registro. `ESQUEMA_ATUAL = 2`, `MIGRACOES` = lista de passos `{ de, para, aplicar }` em `src/lib/migracaoEstado.ts`. Versão maior que a do app = obra ilegível (não grava por cima) | Migração ad hoc em cada ciclo | A 00004 (minutos), a 00005 (premissas), a 00006 (recorte), a 00008 e a 00010 (mapeamento, SPEC-15 RNF-15.3) acrescentam um passo cada. Nenhum dado de uma versão mais nova é sobrescrito por uma mais velha |
| Funções puras em `src/lib/migracaoEstado.ts` (`lerEstadoV1`, `migrarRegistro`) e `src/lib/obras.ts` (`validarDadosObra`, `estadoObraVazia`, `nomeDaCopia`, `avaliarCota`). Vizinho de referência: `src/lib/sinapiBudget.ts` (valida entrada e devolve erros em português) | Lógica dentro da store | `CLAUDE.md › Convenções`: cálculo e regra testável em `src/lib`. A store já tem 812 linhas |
| Acesso ao IndexedDB em `src/stores/armazenamentoObras.ts`: interface `ArmazenamentoObras` com dois adaptadores, IndexedDB (navegador) e memória (testes e falta de IndexedDB). `usarArmazenamento(adaptador)` para os testes | Adaptador em `src/lib`; pacote `fake-indexeddb` nos testes | `src/lib` não acessa armazenamento (`CLAUDE.md`, regra R07). O jsdom não tem IndexedDB e pacote novo é T5. O adaptador real é coberto pelo E2E no Chromium |
| `ScenarioUndo` e `PersistedState` saem de `useProjectStore.ts:52-61` para `src/types/obra.ts` (com `import type` de `BudgetLine` e `ScenarioResult`), junto com `ResumoObra`, `IndiceObras`, `RegistroObra` | Deixar na store | A migração em `src/lib` não pode importar a store (R07 acusa `useProjectStore` em `src/lib`) |
| Dados da obra como **campos opcionais em `ProjectMeta`**: `uf?: UF`, `municipio?: string`, `regimeSinapi?: RegimeSinapi`, `dataBaseSinapi?: string` (`AAAA-MM`). Nome = `meta.name`; responsável = `meta.manager`; data de status = `meta.statusDate` | Objeto `obra` separado do `meta`; campo "UF do SINAPI" separado | Opcional e ausente = "não informado": o JSON da obra de exemplo e o das obras migradas não muda. `importXml` já preserva o `meta` atual (`useProjectStore.ts:727-730`). A UF do SINAPI é a UF da obra: a 00006 recusa recorte de outra UF (PLANO §3.6, SPEC-15 RF-15.2) |
| `UFS` (27 siglas e nomes) em `src/data/ufs.ts`; `UF = (typeof UFS)[number]['sigla']`. `REGIMES_SINAPI = ['nao-desonerado', 'desonerado'] as const` | Incluir "sem encargos" (aba `CSE` do arquivo de 2025) | SPEC-03 RF-03.1 e SPEC-07 RF-07.1 citam só os dois. A 00006 pode acrescentar o 3º sem migração (união só cresce) |
| A obra migrada e a obra em branco ficam **sem UF** até você informar | Pôr uma UF fictícia no seed | RNF-14.3 e `CLAUDE.md › Visão geral`: nunca assumir um estado. A tela mostra "UF não informada" |
| Store única continua dona de tudo: `obras` (resumos), `obraAtivaId`, `estadoGravacao` (`'salvo' \| 'pendente' \| 'erro'` + mensagem), `alertaCota`, e as ações `carregar`, `trocarObra`, `criarObra`, `duplicarObra`, `excluirObra`, `atualizarDadosObra` | Nova store `useObrasStore` | `CLAUDE.md › Convenções`: estado de domínio só em `useProjectStore`. Os módulos continuam lendo `project.state.*` sem mudar: a troca faz `Object.assign(state, estadoDaObra)` (padrão de `resetToSeed`, `:746-748`) |
| Partida assíncrona: `main.ts` faz `useProjectStore(pinia).carregar().then(() => app.mount('#app'))`. Antes do `carregar`, o estado é a obra de exemplo e **a gravação fica desligada** | `await` no topo do `main.ts`; tela "Carregando…" | O alvo de build padrão do Vite não aceita `await` no topo. Sem montar antes de carregar, não há piscar da obra de exemplo. Os testes atuais (`useProjectStore()` sem `carregar`) continuam passando |
| Troca de obra: (1) grava agora a obra atual (cancela o atraso de 300 ms); se falhar, **cancela a troca** e avisa; (2) lê e migra a obra nova; se ilegível, fica na atual e marca a outra como "ilegível"; (3) `Object.assign`, `resetScenarioParams()`, índice com a nova `obraAtivaId` | Trocar sem gravar antes | Trocar com gravação falhando apagaria da memória as alterações não salvas |
| Desfazer cenário (`undo`) **continua dentro de cada obra** (P3) | Zerar o `undo` na troca (PLANO §3.2) | O `undo` já faz parte do estado salvo da obra e só guarda UIDs dela. Zerar deixaria `appliedScenarios` e `recoveryCosts` sem como desfazer. Só o `scenarioParams` (em memória, `:194`) guarda UID de outra obra e é zerado |
| Remontar as telas na troca: `:key="project.obraAtivaId"` no `div` que envolve o `<KeepAlive>` (`App.vue:27`) | Zerar o estado local em cada módulo | Uma linha cobre os 7 módulos e os subcomponentes, sem editar `FieldReportsModule`, `AiMappingPanel` (T6) e os demais |
| Tela **"Obras"** = módulo novo em `MODULES` (`id: 'obras'`, hash `#/obras`): `src/modules/ObrasModule.vue` (tabela com nome, UF, município, responsável, atualizado em, ações) e `src/modules/obras/ObraDadosForm.vue` (criar e editar). Vizinhos: `SupplyModule.vue` (formulário com `reactive`) e `ModuleHeader.vue` | Modal no topo | Lista, criação e edição de dados precisam de espaço; o 00009 (portfólio) parte desta tela |
| Seletor da obra ativa no topo: `src/components/layout/ObraSelector.vue`, `<select>` nativo com rótulo "Obra ativa", no lugar do nome em `AppTopbar.vue:30` | Lista customizada | `select` nativo já é acessível por teclado e leitor de tela |
| Aviso de armazenamento: `src/components/layout/AvisoArmazenamento.vue`, faixa abaixo do topo, com texto e ícone (não só cor), `role="alert"` no erro | Só toast | Toast some em 5–8 s (`ui.ts:65`); "não está salvando" precisa ficar visível até resolver |
| "Restaurar obra de exemplo" (`AppSidebar.vue:30-35,77`) vira "Criar obra de exemplo" na tela Obras; o cartão "Obra ativa" da barra lateral ganha o link "Trocar obra" | Manter o reset destrutivo | Com várias obras, restaurar a obra ativa apagaria uma obra real |
| Obra em branco: `meta.dailyIndirectCost` = `SEED_META.dailyIndirectCost` (9.850), passado pela store | 0 | É o valor que uma obra importada de `.xml` já herda hoje (`importXml` mescla sobre o `meta` atual). Continua premissa ilustrativa até a 00005 (Inviolável 7) |
| Excluir a **única** obra é bloqueado (botão desabilitado com explicação). Excluir a ativa ativa a 1ª restante | Permitir lista vazia | Todos os módulos supõem uma obra ativa |
| A v1 vazia é tratada como hoje: sem chave → obra de exemplo, como no 1º acesso atual | — | Mantém C-1 a C-7 do 00001 sem mudança |

ADR: **sim**, rascunhado em `.claude/adrs/00002-armazenamento-local-fase-1.md` (decisão estrutural para a Fase 1 toda).

## 05. Compatibilidade com o estado salvo (T4)
**Regra geral:** a chave `cronoai-state-v1` é só lida, nunca gravada nem apagada. Com o índice presente, ela é ignorada. Sem índice, a carga tenta migrar de novo.

| Caso | Entrada | Comportamento | Item |
|---|---|---|---|
| M-1 v1 completa | JSON válido gravado pela versão atual | Vira a 1ª obra e a ativa. O estado da obra é igual ao da v1 (`toEqual`). Índice com `migracaoV1: { em, resultado: 'migrado' }`. Tela Obras mostra "Migrada da versão anterior em dd/mm/aaaa" | P-1 |
| M-2 v1 parcial | `tasks` não vazio e `meta` objeto, mas sem `budget`, `undo`, `restrictions`, `recoveryCosts`, `appliedScenarios` ou `log`, ou com um deles de tipo errado | Migra. Cada chave ausente ou inválida vira o valor vazio (`[]`). Um aviso lista as chaves preenchidas. `meta` e `tasks` passam como estão (igual ao merge raso de hoje). **Diferença consciente:** hoje o merge injetaria dados do Aurora (orçamento, relatos) numa obra que não é o Aurora; a migração usa vazio | P-2 |
| M-3 v1 corrompida | JSON inválido, `tasks` vazio ou ausente, `meta` ausente (o critério atual de `:115`) | Abre a obra de exemplo como 1ª obra. A v1 fica intacta, byte a byte. Aviso **uma vez**: "O estado salvo da versão anterior não pôde ser lido. Ele foi mantido no navegador sem alteração e a obra de exemplo foi aberta." Índice com `resultado: 'ilegivel'` (não tenta de novo) | P-3 |
| M-4 cota cheia na migração | Gravação da 1ª obra falha (`QuotaExceededError` ou outro erro) | A obra migrada fica em memória; `estadoGravacao = 'erro'`; aviso persistente. O índice **não** é gravado e a v1 fica intacta: a próxima carga tenta de novo | P-4 |
| M-5 obra excluída | Depois da migração, excluir o Aurora migrado (com outra obra criada) e recarregar | O Aurora **não volta**: o índice existe, a v1 é ignorada | P-5 |
| M-6 obra ilegível no índice | Registro ausente, JSON inválido ou `versaoEsquema` maior que `ESQUEMA_ATUAL` | A obra aparece como "ilegível" na lista, com a opção excluir. As demais abrem. Se for a ativa, abre a 1ª legível. Nada é gravado por cima | P-6 |
| M-7 IndexedDB indisponível | `indexedDB.open` falha (navegador restrito, modo privado antigo) | Adaptador de memória; aviso persistente "Armazenamento local indisponível: as alterações desta sessão não serão salvas" | P-7 |

**Gravação:** depois de cada gravação bem-sucedida, no máximo uma vez por minuto, `navigator.storage.estimate()`. `avaliarCota(uso, cota)`: `'alerta'` com uso ≥ 80% da cota, `'ok'` abaixo, `'indisponivel'` sem a API ou com cota 0. No alerta: "Armazenamento local em {n}%. Exporte para MS Project (.xml) as obras que não usa e exclua-as." Falha de gravação: aviso persistente + toast de erro, nova tentativa na próxima alteração. O `catch` vazio de `useProjectStore.ts:149-151` some.

**Rollback:** reverter os commits faz a versão antiga ler a v1, que continua lá: você vê o estado de antes da migração. O que foi criado depois fica no IndexedDB e reaparece ao reaplicar a versão nova. Registrar no PR.

## 06. Arquivo de exemplo (T3)
Não se aplica: o parser não muda e não há formato novo de arquivo. A obra em branco recebe `.xml` pelo caminho atual (`useMsProject.importFile`), com o arquivo gerado pelo próprio app no E2E (C-4 do 00001). As fixtures JSON das seções 03 e 05 são do estado salvo, não de importação.

## 07. Tarefas e entregáveis
| # | Entregável | Fronteira | Critérios | Commit (Conventional Commits) |
|---|---|---|---|---|
| E1 | Modelo da obra e migração pura | `src/types`, `src/data`, `src/lib` + testes; nenhuma tela | AC-1 a AC-4 (no nível de função), AC-10 (validação), AC-12 | `feat(obras): modelo da obra com UF e cadeia de migrações do estado salvo` |
| E2 | Armazenamento e store multiobra | `src/stores`, `src/main.ts`, C-7 do E2E | AC-1 a AC-9, AC-11 (lógica) | `feat(obras): várias obras no IndexedDB com obra ativa e migração da v1` |
| E3 | Telas | `src/modules`, `src/components`, `src/App.vue`, `ui.ts` | AC-10, AC-11 (aviso), AC-12, AC-13 | `feat(obras): tela Obras, seletor da obra ativa e dados da obra` |
| E4 | E2E e documentação | `e2e/`, docs, `.claude/` | AC-14 a AC-16 | `test(e2e): migração e troca de obra; docs do armazenamento local` |

| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | E1 | Gerar as 2 fixtures com o código da base (seção 03) e registrar o SHA | dev-frontend | `src/lib/__fixtures__/estado-v1-aurora.json`, `src/lib/__fixtures__/estado-v1-aurora-75.json` | — |
| 2 | E1 | Tipos: `src/types/obra.ts` (`PersistedState`, `ScenarioUndo` movidos; `ResumoObra`, `IndiceObras`, `RegistroObra`); `ProjectMeta` com os 4 opcionais; `src/data/ufs.ts` (27) e `REGIMES_SINAPI`. A store só troca o import | dev-frontend | `src/types/obra.ts`, `src/types/domain.ts`, `src/data/ufs.ts`, `src/stores/useProjectStore.ts` (só imports) | — |
| 3 | E1 | `migracaoEstado.ts`: `lerEstadoV1(raw)` → `ausente \| corrompido \| ok + avisos`; `migrarRegistro(reg)` com `ESQUEMA_ATUAL = 2` e `MIGRACOES`; testes M-1 a M-3 e M-6 | dev-frontend | `src/lib/migracaoEstado.ts`, `src/lib/migracaoEstado.test.ts` | 1, 2 |
| 4 | E1 | `obras.ts`: `validarDadosObra`, `estadoObraVazia`, `nomeDaCopia`, `avaliarCota`; testes | dev-frontend | `src/lib/obras.ts`, `src/lib/obras.test.ts` | 2 |
| 5 | E1 | `ARQ_T4` passa a incluir `src/types/obra.ts`, `src/lib/migracaoEstado.ts`, `src/lib/obras.ts`, `src/stores/armazenamentoObras.ts` | dev-frontend | `.claude/scripts/lib/regras-cronoai.mjs` | — |
| 6 | E2 | `armazenamentoObras.ts`: interface, adaptador IndexedDB (abrir, ler índice, ler obra, gravar obra + índice na mesma transação, excluir obra + índice, `estimate`) e adaptador de memória (com falha simulável); `usarArmazenamento` | dev-frontend | `src/stores/armazenamentoObras.ts` | 3 |
| 7 | E2 | Store: `carregar()` (índice → obra ativa; sem índice → v1 → migração; M-1 a M-7), gravação por obra com atraso de 300 ms e `estadoGravacao`, `alertaCota`, guarda "sem gravar antes de carregar" | dev-frontend | `src/stores/useProjectStore.ts` | 6 |
| 8 | E2 | Store: `trocarObra`, `criarObra` (em branco ou exemplo), `duplicarObra`, `excluirObra`, `atualizarDadosObra` (data de status pelo `setStatusDate`, com log); `resetToSeed` sai | dev-frontend | `src/stores/useProjectStore.ts` | 7 |
| 9 | E2 | Partida assíncrona no `main.ts` | dev-frontend | `src/main.ts` | 7 |
| 10 | E2 | Testes da store multiobra (seção 08), com o adaptador de memória | dev-frontend | `src/stores/useProjectStore.obras.test.ts` | 8 |
| 11 | E2 | C-7: helper `obraAtivaSalvaContem(page, trecho)` lendo o IndexedDB, no lugar da leitura de `cronoai-state-v1` | dev-frontend | `e2e/fixtures.ts`, `e2e/fluxos.spec.ts` | 7 |
| 12 | E3 | `MODULES` com `obras`; `views` no `App.vue`; ícone na barra lateral; `:key="project.obraAtivaId"` no `div` do `KeepAlive` | dev-frontend | `src/stores/ui.ts`, `src/App.vue`, `src/components/layout/AppSidebar.vue` | 8 |
| 13 | E3 | Tela Obras + formulário (criar em branco ou exemplo, editar dados, duplicar, excluir com `window.confirm`, "Migrada em…", "ilegível"); dica na obra em branco: "Para trazer o cronograma do MS Project, use **Importar .xml** no topo" | dev-frontend | `src/modules/ObrasModule.vue`, `src/modules/obras/ObraDadosForm.vue` | 12 |
| 14 | E3 | `ObraSelector` no topo (sem tocar `AppTopbar.vue:19` e `:58`); `AvisoArmazenamento`; cartão da barra lateral sem o reset | dev-frontend | `src/components/layout/ObraSelector.vue`, `src/components/layout/AvisoArmazenamento.vue`, `src/components/layout/AppTopbar.vue`, `src/components/layout/AppSidebar.vue` | 8 |
| 15 | E3 | Aviso SINAPI com a obra: "Catálogo SINAPI ilustrativo: não corresponde a {UF} · {data-base} · {regime}" ou "UF da obra não informada: o catálogo é ilustrativo" | dev-frontend | `src/modules/SinapiModule.vue` | 8 |
| 16 | E4 | E2E `e2e/obras.spec.ts` (seção 08) | dev-frontend | `e2e/obras.spec.ts`, `e2e/fixtures.ts` | 13, 14 |
| 17 | E4 | Docs: `CLAUDE.md` (Visão geral "Estado", Mapa do código, Convenções/Testes do adaptador de memória), `README.md`, `.claude/rules/frontend-geral.md` (linha do `localStorage`), `.claude/agents/arquiteto.md` (bullet "Estado persistido (T4)"), `.claude/rules/divida-conhecida.md` (persistência local até a SPEC-01) | dev-frontend | 5 arquivos | 16 |

**Checkpoint** depois da tarefa 7: rodar N-1 a N-5 e o E2E C-7 antes de seguir para as telas.

### Grafo
`1 ‖ 2 ‖ 5` → `3 ‖ 4` → **E1 commit** → `6 → 7 → {8, 9, 11}` → `10` → **E2 commit** → `{12 → 13, 14, 15}` → **E3 commit** → `16 → 17` → **E4 commit**. Dentro de cada entregável, `src/lib` e testes vêm antes da store; a store antes das telas.

## 08. Testes previstos
| Critério | Teste (`it`, em português) | Arquivo | Valor esperado |
|---|---|---|---|
| AC-1 / N-4 | migra o Aurora salvo na v1 sem mudar nenhum número | `src/stores/useProjectStore.obras.test.ts` | 1 obra; `projectFinish` `'2027-06-23'`; `delay.delayDays` `16`; `evm.spi` `toBeCloseTo(0.8883, 4)`; `evm.cpi` `toBeCloseTo(0.9349, 4)`; estado `toEqual` ao da fixture |
| AC-2 / N-5 | migra a v1 com apontamento aprovado | idem | `'2027-06-16'`; `delayDays` `11`; UID 104 `percentComplete` `75` |
| AC-1 | `lerEstadoV1` com a fixture devolve `ok` sem avisos | `src/lib/migracaoEstado.test.ts` | `tipo` `'ok'`; `avisos` `[]` |
| AC-3 | v1 parcial ganha listas vazias e aviso | idem + store | sem `budget`/`undo`/`log`: `[]` nos três; 1 aviso citando as 3 chaves; números do N-4 iguais |
| AC-4 | v1 corrompida abre a obra de exemplo e não toca a v1 | idem + store | `'{'`, `'{"tasks":[]}'`, `'{"tasks":[{}]}'` (sem `meta`) → `corrompido`; v1 igual byte a byte depois da carga; aviso só na 1ª carga |
| AC-4 | versão mais nova é recusada | `migracaoEstado.test.ts` | `versaoEsquema: 99` → erro "Obra salva por uma versão mais nova do CronoAI (esquema 99)." |
| AC-5 | cota cheia na migração não perde a v1 | store | adaptador falhando: `estadoGravacao` `'erro'`, índice ausente, v1 intacta; nova carga com adaptador bom → 1 obra, N-4 |
| AC-6 | obra excluída não volta | store | migra, cria B, exclui o Aurora, nova pinia com o mesmo adaptador e a v1 → `obras.length` `1`, só B |
| AC-7 | cada módulo vê só a obra ativa | store | aprova r-tiao em A; troca para B (C-4): 0 tarefas, `'2026-11-03'`; volta para A: `'2027-06-16'`; B sem mudança |
| AC-7 | troca zera o simulador e preserva o desfazer | store | `scenarioParams.crashing.targetUid` `undefined` depois da troca; crashing aplicado em A, troca e volta, `undoScenario('crashing')` → `'2027-06-23'` |
| AC-7 | troca cancelada se a gravação falha | store | adaptador falhando na gravação: `trocarObra(B)` mantém A ativa e devolve o erro |
| AC-8 | duplicar copia sem ligar as obras | store | C-3; alterar a cópia não muda a original (`'2027-06-23'` na original) |
| AC-9 | excluir a ativa e a única | store | excluir a ativa ativa a 1ª restante; excluir a única devolve erro "A obra não pode ser excluída: é a única." |
| AC-10 | dados da obra validados | `src/lib/obras.test.ts` | nome `''` e 121 caracteres → erro; UF `'XX'` → erro; `dataBaseSinapi` `'2026-13'` → erro, `'2026-09'` ok; município 81 caracteres → erro |
| AC-10 | XML exportado não muda com os dados da obra | store | `exportXml().xml` do Aurora com UF PE, município, regime e data-base é igual (string) ao sem eles |
| AC-11 | limiar de cota | `obras.test.ts` | `avaliarCota(80, 100)` `'alerta'`; `avaliarCota(79.9, 100)` `'ok'`; `avaliarCota(10, 0)` `'indisponivel'`; `avaliarCota(undefined, undefined)` `'indisponivel'` |
| AC-12 | 27 UFs, sem repetição | `obras.test.ts` | `UFS.length` `27`; siglas únicas |
| AC-14 | E2E C-1 a C-7 e navegação continuam verdes | `e2e/fluxos.spec.ts`, `e2e/navegacao.spec.ts` | como no 00001; C-7 lendo o IndexedDB |
| AC-15 | migração no navegador real | `e2e/obras.spec.ts` | `addInitScript` grava a fixture C-1: topo `23/06/27`, `+16 d.u.`, SPI `0,89`, CPI `0,93`; Obras com 1 obra e "Migrada da versão anterior"; recarregar mantém; fixture C-2: `16/06/27`, `+11 d.u.` |
| AC-15 | criar em PE, alternar e ver só a obra ativa | `e2e/obras.spec.ts` | obra "Residencial Recife (exemplo fictício)", PE, Recife: topo "no prazo", EAP sem linhas, Apontamento sem relatos; volta ao Aurora: `23/06/27`; recarregar mantém a obra ativa |
| AC-15 | obra em branco recebe `.xml` pelo topo | `e2e/obras.spec.ts` | exporta do Aurora, troca para a obra em branco, importa: toast "29 tarefas carregadas"; Obras mostra PE e Recife na obra |
| AC-15 | excluir com confirmação; o Aurora migrado não volta | `e2e/obras.spec.ts` | `dialog` aceito; recarregar com a v1 ainda gravada → só a obra restante |
| AC-15 | 7 módulos na obra em branco sem erro | `e2e/obras.spec.ts` | 7 `h1`; 0 `console.error`/`pageerror` (fixture automática do 00001) |
| AC-16 | falha de gravação aparece | `e2e/obras.spec.ts` | `addInitScript` faz `IDBObjectStore.prototype.put` lançar `QuotaExceededError`; alterar um percentual → aviso com `role="alert"` "As alterações desta obra não estão sendo salvas" |

Testes antigos: `src/stores/useProjectStore.test.ts` continua sem mudança (seed antes do `carregar`). Se precisar mudar, o antes e depois vão no ciclo.

## 09. Critérios de aceite
- **AC-1 (RF-14.2):** a v1 completa vira a 1ª obra, com o estado igual ao salvo e entrega 2027-06-23, atraso 16 d.u., SPI 0,8883, CPI 0,9349.
- **AC-2:** a v1 com o apontamento aprovado migra com 2027-06-16 e 11 d.u.
- **AC-3:** v1 parcial migra com listas vazias e aviso, sem injetar dados do Aurora.
- **AC-4:** v1 corrompida abre a obra de exemplo, com aviso uma vez; a chave `cronoai-state-v1` fica intacta. Obra de esquema mais novo nunca é sobrescrita.
- **AC-5:** cota cheia na migração mantém a obra em memória, avisa e tenta de novo na próxima carga; a v1 fica intacta.
- **AC-6:** obra excluída depois da migração não volta.
- **AC-7 (RF-14.1):** trocar a obra muda todos os módulos para a obra ativa; o simulador é zerado; o desfazer de cada obra fica com ela; a troca é cancelada se a obra atual não puder ser salva.
- **AC-8:** duplicar gera obra independente, com os mesmos números.
- **AC-9:** excluir pede confirmação; a única obra não é excluída.
- **AC-10 (RF-14.3):** dados da obra (nome, UF entre as 27, município, responsável, data de início, data de status, regime, data-base) editáveis e validados em português; o `.xml` exportado não muda.
- **AC-11 (RNF-14.2):** falha de gravação sempre visível e persistente; alerta com uso ≥ 80% da cota; o `catch` vazio sai.
- **AC-12 (RNF-14.3):** nenhuma sigla de UF no código fora de `src/data/ufs.ts` e dos testes; obra migrada e em branco sem UF; aviso do catálogo SINAPI mostra a UF/regime/data-base da obra ou "UF não informada".
- **AC-13:** tela Obras em `#/obras`, seletor "Obra ativa" no topo, telas remontadas na troca; "Criar obra de exemplo" no lugar do reset.
- **AC-14:** E2E do 00001 verdes (C-7 lendo o armazenamento novo).
- **AC-15:** E2E de migração, troca, obra em branco com `.xml`, exclusão e navegação na obra em branco verdes no Chromium.
- **AC-16:** E2E da falha de gravação verde.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1…AC-16 | Seção 09 | Testes da seção 08 | sim |
| N-1…N-3 | Números do seed sem mudança | `npx vitest run src/stores/useProjectStore.test.ts` | sim |
| N-4, N-5 | Números da obra migrada | `useProjectStore.obras.test.ts` | sim |
| P-1…P-7 | Casos M-1 a M-7 da seção 05 | Testes de `migracaoEstado` e da store; E2E | sim |
| R-1 | `src/lib` puro | `node .claude/scripts/validar-regras.mjs --base {BASE}` sem R07 | sim |
| R-2 | Sem UF fixa (RNF-14.3) | `grep -rnE "'(AC\|AL\|AP\|AM\|BA\|CE\|DF\|ES\|GO\|MA\|MT\|MS\|MG\|PA\|PB\|PR\|PE\|PI\|RJ\|RN\|RS\|RO\|RR\|SC\|SP\|SE\|TO)'" src --include=*.ts --include=*.vue` só em `src/data/ufs.ts` e `*.test.ts` | sim |
| R-3 | Faixa 2 confirmada | `node .claude/scripts/classificar-diff.mjs --base {BASE} --faixa 2` sai com 0 (sem T3/T5/T8) | sim |
| R-4 | Parser intocado | `git diff --stat {BASE} -- src/lib/msProjectXmlParser.ts` vazio | sim |
| R-5 | Sem dependência nova | `git diff {BASE} -- package.json` sem `dependencies`/`devDependencies` novas | sim |
| R-6 | Cobertura de `src/lib` ≥ 80% nas 4 métricas | `npm run test:coverage` | sim |
| S-1 | Nada de `v-html`; nome, município e responsável exibidos como texto | `validar-regras.mjs` + revisão | sim |
| S-2 | Nenhum segredo ou dado pessoal real em fixture | revisão das fixtures (Aurora fictício) | sim |
| V-1 | Tela Obras, seletor e aviso nos temas claro e escuro | captura no PR | não |
| V-2 | Teclado: seletor e ações da tela Obras acessíveis | conferência manual | não |
| D-1 | Troca de obra com 3.000 tarefas sintéticas | medição registrada no ciclo (referência < 1 s) | não |

### Validadores obrigatórios
`revisor` (escopo ADERENTE) e `testes` (matriz acima), em paralelo, depois das checagens (`lint`, `typecheck`, `testar-afetado.mjs`) e do `classificar-diff.mjs --faixa 2`. `especialista-obra` recomendado no lote do E2 (N-4/N-5). Com P2 = (B): mais `seguranca` e auditoria independente (faixa 3).

## 10. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Uso por várias empresas no mesmo navegador (termos de uso, LGPD controlador × operador) | Jurídico | Abrir para clientes (não bloqueia o merge; pendência do PLANO §3.2) |
| Nome do responsável guardado no navegador | Jurídico | Já existe hoje (`meta.manager`); registrar junto da pendência acima, sem campo novo de dado pessoal |
| Hospedagem, banco e persistência definitiva | Infraestrutura | SPEC-01; nada muda neste ciclo |

## 11. Riscos
| Risco | Mitigação |
|---|---|
| Partida assíncrona grava a obra de exemplo por cima da salva | Gravação desligada até o fim de `carregar()`; teste dedicado |
| `DataCloneError` ao gravar `reactive` | Grava a string JSON |
| Duas abas na mesma obra: a última gravação vence | Igual a hoje; fora do escopo; registrar no ciclo |
| Navegador limpa dados "best-effort" sob falta de disco ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)) | Aviso de cota e exportar `.xml`. `navigator.storage.persist()` fica para o 00007, quando o histórico encarece a perda |
| Adaptador IndexedDB sem teste unitário (o jsdom não tem IndexedDB) | E2E no Chromium cobre carga, gravação, exclusão, migração e falha |
| `classificar-diff` marcar T5 por mexer nas linhas de arquivo do topo | `AppTopbar.vue:19` e `:58` não mudam (seção 00) |
| Store cresce além das 812 linhas | Regras em `src/lib/obras.ts` e `migracaoEstado.ts`; acesso ao IndexedDB em `armazenamentoObras.ts` |
| Fechar a aba dentro dos 300 ms perde a última alteração | Igual a hoje; o aviso "pendente" fica visível no topo |
| Rollback esconde obras criadas depois da migração | A v1 continua lá; reaplicar a versão nova mostra tudo; documentado no PR |

## 12. Escopo fechado
**Dentro:**
- Modelo da obra (campos opcionais em `ProjectMeta`), UFs e regimes, tipos de persistência em `src/types/obra.ts`.
- Migração pura da v1 e cadeia de migrações versionada (esquema 2), com os casos M-1 a M-7.
- Armazenamento IndexedDB (ou o da P1) com adaptador de memória; aviso de cota e de falha de gravação.
- Store com obra ativa: carregar, trocar, criar (em branco ou exemplo), duplicar, excluir, editar dados.
- Tela Obras, seletor no topo, aviso de armazenamento, remontagem das telas, aviso SINAPI com a UF/regime/data-base.
- "Criar obra de exemplo" no lugar de "Restaurar obra de exemplo".
- E2E novos e o ajuste do C-7; regex `ARQ_T4`; docs da tarefa 17.

**Fora (o `revisor` reprova):**
- Qualquer mudança em `src/lib/msProjectXmlParser.ts`, `cpm.ts`, `calendar.ts`, `evm.ts`, `scenarios.ts`, `supplies.ts`, `sinapi*.ts`, `fieldAi.ts`, `diagnosis.ts` e em `progressPatch`/`approveReport`.
- Seletor de arquivo novo ou mudança em `AppTopbar.vue:19`/`:58`, `WbsModule.vue:55,73` (só com P2 = B, em plano de faixa 3).
- Painel de portfólio, consolidado, alertas e cache de indicadores (RF-14.4 a RF-14.6, 00009).
- Empresa, carteiras, permissões, backend (RF-14.7 a RF-14.10; SPEC-01/02; ADR 00001).
- Exportar/importar obra em JSON e "arquivar" obra.
- Feriados por UF/município e premissas por obra (00005); recorte SINAPI e regime "sem encargos" (00006); snapshots (00007); mapeamento de campos (00010).
- `navigator.storage.persist()`, sincronização entre abas, apagar a chave `cronoai-state-v1`.
- Dependência nova (inclusive `idb` e `fake-indexeddb`).
- Mudar número de cálculo ou asserção existente para acomodar a migração.

## 13. Perguntas do gate
**P1 — Armazenamento local da Fase 1.** Volume estimado no ADR 00002: uma obra de 3.000 tarefas ~1,43 milhão de caracteres (medido); com relatos, fotos e o motor em minutos, 2 a 4 milhões; 104 snapshots ~37 milhões por obra; recorte SINAPI de uma UF inteira ~2,7 milhões.
- **(A)** IndexedDB já neste ciclo, uma entrada por obra + índice na mesma transação, sem dependência nova. Partida assíncrona feita uma vez. **Recomendação (opinião).**
- **(B)** `localStorage` com chave por obra + índice. Mais simples e síncrono, mas cabe 1 ou 2 obras grandes e nenhum histórico: o 00007 teria de migrar tudo para o IndexedDB. Com (B), a v1 seria apagada depois de gravar e conferir a obra nova (ela ocupa a mesma cota).
- **(C)** `localStorage` agora, atrás da mesma interface assíncrona; IndexedDB no 00007. Código assíncrono uma vez, dados migrados duas vezes.

**P2 — "Criar obra a partir de .xml".**
- **(A)** Dois passos: "Nova obra" em branco e, nela, o "Importar .xml" que já existe (mesmo seletor, parser e limite de 15 MB). Cumpre o critério da SPEC-14 e mantém a **faixa 2**. Um botão de um passo pode entrar num ciclo de faixa 3 que já tenha `seguranca` (ex.: 00003 ou 00010). **Recomendação (opinião).**
- **(B)** Botão próprio na tela Obras, com seletor de arquivo novo. O `classificar-diff` marca T5: a ficha vira **plano de faixa 3**, com `seguranca` e auditoria independente (mais ~1 tarefa e um lote de validação).
- **(C)** Só "em branco" e "exemplo" neste ciclo; `.xml` fica para depois (o RF-14.1 fica parcial).

**P3 — Desfazer cenário na troca de obra (desvio do PLANO §3.2).**
- **(a)** O desfazer fica guardado em cada obra; só os parâmetros do simulador são zerados. **Recomendação (opinião):** o desfazer já é dado da obra e só tem UIDs dela.
- **(b)** Zerar o desfazer na troca, como diz o PLANO. Cenários aplicados antes da troca deixam de poder ser desfeitos, mas o custo e o cenário continuam marcados.

CONHECIMENTO NOVO:
- O `classificar-diff.mjs` marca T5 em qualquer linha **nova** com `type="file"` ou `.files?.[0]` (`regras-cronoai.mjs:259`), inclusive ao mover ou reescrever o seletor existente do topo. Recurso que precise de seletor de arquivo novo é faixa 3 por construção — aplica-se a qualquer ciclo com importação.
- Fotos de relato ficam no estado da obra como data URL JPEG de 360 px (`ReportComposer.vue:31-42`): cerca de 35 mil caracteres cada (estimativa). Pesam mais que centenas de tarefas no armazenamento local — aplica-se ao 00007 e à SPEC-08.
- O merge raso do `loadState` (`useProjectStore.ts:115`) injeta orçamento e relatos do Aurora em qualquer estado salvo sem essas chaves — aplica-se a toda migração de estado.
- O `ARQ_T4` do classificador só conhece `domain.ts` e `useProjectStore.ts`: arquivo novo de persistência precisa entrar na regex para os ciclos seguintes serem marcados T4.

## 14. Decisões do gate (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar até o fim das fases ("não pare de trabalhar até finalizar todas as specs"; "Pode fazer todas as fases"). Por isso o gate foi decidido pelas recomendações desta ficha, **sujeito à revisão do usuário no PR**:
- **P1 → (A)** IndexedDB já neste ciclo; ADR 00002 aceito nessas condições.
- **P2 → (A)** criar obra em dois passos (em branco + "Importar .xml" existente); a ficha fica na faixa 2.
- **P3 → (a)** cada obra guarda o próprio desfazer; só os parâmetros do simulador são zerados na troca.

## 15. Emenda 01 (25/10/2026) — obra sem cronograma ou sem orçamento
Origem: validação do `especialista-obra` (P-2). O ciclo tornou alcançável, ao abrir o app, uma obra sem tarefas, com SPI/CPI = 1,00 em verde pelo `safeDiv` e diagnóstico "sob controle". Isso contraria a regra da dívida do `safeDiv` ("não mostre como desempenho real"). Decisão do orquestrador (autorização do usuário para seguir sem parar), **sujeita à revisão do usuário no PR**:
- **Escopo ampliado:** entram `src/lib/diagnosis.ts` (+ teste), `src/modules/EvmModule.vue` e as linhas de indicadores do `AppTopbar.vue` (nunca as linhas 19 e 58). Triagem passa a **T2 SIM** só na apresentação; `especialista-obra` passa a obrigatório.
- **Regra:** dois estados distintos.
  - **Sem cronograma** (0 tarefas): o topo mostra "—" e "sem cronograma", e o diagnóstico não fala de desempenho.
  - **Sem orçamento** (BAC = 0, mas com tarefas; ex.: `.xml` sem custos): somem só SPI, CPI e os textos de custo/valor. O diagnóstico de **prazo** pelo CPM (caminho crítico, atraso em d.u., restrições, suprimentos e plano de recuperação) continua.
- **C-4 e AC-15 emendados:** a obra em branco mostra "sem cronograma" e "—" no lugar de "no prazo" e 1,00. Os números do motor não mudam: SPI = CPI = 1 continuam fixados na store.
