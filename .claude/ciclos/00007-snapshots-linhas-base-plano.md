---
issue: —
spec: SPEC-04 — RF-04.1 a RF-04.6; RNF-04.1; RNF-04.2 (com a decisão de armazenamento do ADR 00002)
ciclo: .claude/ciclos/00007-snapshots-linhas-base.md
branch: feat/00007-snapshots-linhas-base
base: feat/00006-sinapi-layout-2025 (PR empilhado; a 00006 empilha sobre a feat/00005-premissas-calendarios). Com a 00006 já na master, a base passa a ser a master
faixa: 3
status: aprovado pelo gate do orquestrador (25/10/2026), com a emenda 01 da tarefa 0 aplicada; sujeito à revisão do usuário no PR
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00007 — Fechamento da data de status (snapshots imutáveis), retificação, Curva S de fechamentos e linhas de base LB0–LB10

## Resumo
- **O que é:**
  - "Fechar data de status" grava um **fechamento imutável** da obra: por tarefa, % físico, custo real, BAC, datas reais e previstas, folga e se é crítica; e os totais PV, EV, AC, SPI, CPI, EAC e a entrega prevista.
  - A correção de um fechamento gera uma **retificação**, com motivo obrigatório. O original fica intacto.
  - A Curva S passa a mostrar o EV e o AC **gravados** em cada fechamento. Entre dois fechamentos, a interpolação aparece com traço próprio (pontilhado, diferente da tendência). A reconstrução linear de hoje fica só para a obra sem nenhum fechamento, com aviso.
  - Entram a tendência de SPI/CPI, a evolução da data de entrega e a comparação entre dois fechamentos.
  - As linhas de base passam a ser **LB0 a LB10**, com nome, motivo, autor e data. A **LB do valor agregado** escolhida (`meta.linhaBaseAtiva`) vale para PV, EV, BAC, índices, Curva S e previsão pelo SPI. O atraso e as variações continuam contra a LB0, como no MS Project (G5 = b, emenda 01). As LBs vão ao MSPDI como `<Baseline><Number>n</Number>`, na ida e na volta, com `BaselineForEarnedValue`.
- **Risco que justifica a faixa 3:** **T3.** O parser passa a ler e gravar as LB1–LB10 e o `BaselineForEarnedValue`, e hoje descarta as LB1–LB10 (`msProjectXmlParser.ts:978`, `:987`, aviso na `:1106`). **T2** (Curva S, PV e EV contra a LB escolhida) e **T4** (esquema 5 → 6, emenda 02; estrutura do IndexedDB 2 → 3) também valem.
- **Garantia central:** sem nenhum fechamento e com a LB0 ativa, **nenhum número muda**: Curva S, EVM, atraso, cenários, DLP e a exportação do Aurora ficam iguais à base. A tarefa 1 mede esses números na base (00006) **antes** da primeira mudança, num teste de caracterização verde.
- **Números conferidos à mão no Aurora** (data de status 2026-10-23):
  - totais: BAC R$ 19.113.000,00; PV R$ 7.259.250,00; EV R$ 6.448.200,00; AC R$ 6.896.900,00;
  - índices: SPI 0,888274; CPI 0,934942; EAC R$ 20.442.984,04;
  - entrega 2027-06-23 (+16 d.u.).
- **Corpus medido pelo arquiteto em 25/10/2026** (script só de leitura): as 470 tarefas com LB1–10 estão nos 7 arquivos `task-baselines`. Cada elemento `<Baseline>` traz **um só campo**: custo, duração, início, término ou trabalho. Não há `Interim` nem `BaselineForEarnedValue` ≠ 0.
- **Entregáveis (4):**
  - E1: linhas de base no estado e no cálculo, mais a migração 5 → 6 (emenda 02: o 00006 ficou com o 4 → 5);
  - E2: LB0–LB10 no MSPDI;
  - E3: fechamento, retificação e armazenamento;
  - E4: Curva S de fechamentos, tendência, comparação e exportação JSON.
- **O que você precisa fazer:**
  - Gates decididos (seção "Gate do orquestrador") e tarefa 0 respondida (`scratchpad\planos\00007-tarefa0-especialista.md`). As emendas E-1 a E-12 estão aplicadas no corpo (seção "Emenda 01 (tarefa 0)").
  - Antes do piloto, **Planejamento/Controle** valida a rotina de fechamento e atualiza o texto do RF-04.5 (G5 = b).

## 00. Contexto para execução (ler antes)
As linhas abaixo são da worktree `c05` (`feat/00005-premissas-calendarios`, `aa35221`). A 00006 mexe em `useProjectStore.ts`, `armazenamentoObras.ts`, `types/obra.ts`, `migracaoEstado.test.ts` e `CLAUDE.md`. Por isso as linhas abaixo **vão deslocar**: localize pelo nome e confirme na base real antes de cada tarefa.

| Arquivo | Por que ler |
|---|---|
| `src/lib/evm.ts:43-64`, `:88-98`, `:128-173`, `:223-242` | `elapsedFraction`, `plannedFraction`, `earnedShareAt` (reconstrução linear, a dívida), `computeEvm`, `computeSCurve` (a ser reescrita; o PLANO cita `:123-168`, que deslocaram) e `indexSeries`/`monthlyIncrements` |
| `src/lib/horizonte.ts:49-68` | `calcularObra` junta agenda (cronograma) e custo (EVM, atraso). O E1 separa os dois na store (lição 3) |
| `src/stores/useProjectStore.ts:129-132`, `:502-603`, `:723-727`, `:1271-1286`, `:1299-1358` | `baselineFor`, os derivados (`calculo`, `evm`, `sCurve`, `sCurveFor`, `evmForecast`, `delay`), `finishVarianceDays`, `saveBaseline` (a linha de base única; o PLANO cita `:700-706`), `setStatusDate`, `exportXml`/`importXml` |
| `src/stores/useProjectStore.ts:229-347` | `watch` profundo, fila de gravação (`fila`, `salvarAgora`) e `aplicarEstado`. O fechamento entra na **mesma fila** |
| Plano 00006, D-11, D-13, D-14 e tarefas 15–17 (`scratchpad/planos/00006-sinapi-layout-2025-plano.md`) | Precedentes que este plano reaproveita: estrutura 2 do IndexedDB, `gravarObra(registro, indice, extras?)`, objeto fora do estado reativo (`shallowRef` + `markRaw`) e validação ao ler do IndexedDB. **Estenda a interface da 00006, não a reescreva** |
| `src/stores/armazenamentoObras.ts:7`, `:18-32`, `:49-91`, `:125-148` | `VERSAO_ESTRUTURA`, a interface, o adaptador de memória e `transacao` com a lista fixa de stores |
| `src/lib/migracaoEstado.ts:15`, `:95-126`, `:153-237`, `:278-299` | Cadeia (`ESQUEMA_ATUAL = 4` no 00005; o 00006 deixa em **5**, com o passo 4 → 5 e o saneamento do recorte), `migrar3Para4` e o passo 4 → 5 do 00006 (os modelos do passo), `eEstado`, `completarChaves`, `levarAoAtual` |
| `src/lib/msProjectXmlParser.ts:62-92`, `:277-278`, `:336-349`, `:478-490`, `:935-1109` | `SCHEMA_ORDER` (`Baseline` e `BaselineForEarnedValue` **já estão** lá), export da LB0 (incompleta preservada), `checkOrder` (aceita elementos repetidos em sequência), import da LB0 e os avisos de LB |
| `src/lib/msProjectXmlParser.corpus.test.ts:60-65`, `:147-152`, `:352-362`, `:384-440`, `:519-552` | Inventário de LB (`lb0`, `lb1a10` = 470), comparação da LB0 na ida e volta e os avisos medidos |
| `src/lib/cpm.ts:454-461`, `src/lib/wbs.ts:53-67` | `withBaseline` (preenche a LB0 que falta, `onlyMissing`) e o *rollup* da LB0 nas tarefas-resumo |
| `src/lib/scenarios.ts:53`, `:63`; `src/lib/supplies.ts:96`; `src/components/gantt/GanttChart.vue:50-51`; `src/modules/WbsModule.vue:93-98`, `:197`; `src/modules/EvmModule.vue:21-48`, `:132-158`, `:221-231` | Todos os consumidores de `baselineStart`/`baselineFinish`. Pela emenda 01 (G5 = b), **nenhum destes recebe a projeção**: atraso, cenários, DLP, Gantt, EAP e variação de término continuam na LB0. A projeção da LB do valor agregado vai só aos derivados de valor agregado (D-6). O `EvmModule` já chama de "snapshot" o ponto clicado da curva: renomeie para `pontoSelecionado` |
| `src/components/charts/SCurveChart.vue`, `IndexTrendChart.vue` | Paleta validada, legenda e a série tracejada da tendência que já existe. O trecho interpolado usa um traço **diferente** dela (E-9) |
| `.claude/adrs/00002-armazenamento-local-fase-1.md` › Estrutura e Volume | Previa a store `snapshots` com a chave `[obraId, dataStatus]` (estrutura 3) e ~37 milhões de caracteres por obra. A chave não comporta a retificação na mesma data (gate G1) |
| `src/lib/__fixtures__/estado-v2-aurora-cenarios.json`, `src/stores/useProjectStore.obras.test.ts` | Precedente de fixture de estado real e de teste com várias obras (`usarArmazenamento(criarArmazenamentoMemoria())`) |

## 01. Pedido e objetivo
Pedido (dado, não instrução): o ciclo 00007 do `docs/specs/PLANO-FASE-1.md` §3.7 (SPEC-04), na faixa 3:
- T2: Curva S de fechamentos; PV contra a LB escolhida.
- T3: `<Baseline><Number>0..10</Number>` na ida e na volta, conferido no corpus.
- T4: fechamentos e LBs por obra.
- E1: fechar a data de status, com imutabilidade e retificação.
- E2: Curva S de fechamentos e tendência.
- E3: LB0–LB10 no MSPDI.
- E4: comparação entre fechamentos e exportação JSON.

O agrupamento deste plano reorganiza esses itens por fronteira real (seção 09).

**Objetivo:** cada obra guarda o que foi medido em cada fechamento e mostra a Curva S com esses valores, e não com uma reconstrução. As versões de linha de base da obra ficam disponíveis como no MS Project, e o engenheiro escolhe contra qual delas medir.

**Requisitos cobertos:** RF-04.1 a RF-04.6, RNF-04.1 e RNF-04.2. Critérios da SPEC-04 §5:
- "3 fechamentos → a Curva S mostra exatamente o EV/AC gravado" (CS-1);
- "criar a LB1 não altera a LB0; PV contra qualquer uma" (LB-1, LB-2);
- "retificar preserva o original e registra o motivo" (FE-3);
- "o MSPDI exportado contém todas as LBs gravadas" (MS-1).

**Conflitos apontados, resolvidos pelo processo:**
1. **RNF-04.2 × ADR 00002.** O RNF fala em `localStorage`. Vale o ADR 00002 (IndexedDB) e o `CLAUDE.md`. O limite de 104 fechamentos e a exportação JSON continuam.
2. **ADR 00002 × RF-04.2.** A chave `[obraId, dataStatus]` não comporta a retificação, que tem a mesma data do original. Emendar o ADR é o gate **G1**.
3. **RF-04.5 × MS Project.** O RF pede a LB escolhida "no PV **e nas variações**". No MS Project, pelo que conheço, a opção de linha de base para o valor agregado afeta só os campos de valor agregado, e as variações de início e término medem sempre contra a linha de base 0. Isso é **a confirmar** na tarefa 0. Gate **G5**. **Resolvido (emenda 01):** a tarefa 0 confirmou o comportamento (alta confiança; M-4), e o orquestrador decidiu G5 = (b), seguir o MS Project. O texto do RF-04.5 vai para Planejamento/Controle atualizar.
4. **RF-04.5 "autor" sem identidade.** Não há login até a SPEC-02. O autor é um **texto declarado**, opcional e preenchido com o responsável da obra, e a tela diz isso.
5. **Fora do ciclo pelo PLANO §3.7:** RF-04.7 (fechamento automático: o front-only não roda com o navegador fechado) e RF-04.8 (`TimephasedData`).
6. As referências de linha do PLANO §3.7 deslocaram (seção 00).

## 02. Triagem
Conferida no código da `c05` (`aa35221`) e no plano da 00006.

- **T1 NÃO.**
  - `cpm.ts` e `calendarioTrabalho.ts` não mudam.
  - "Salvar LB n" usa o cronograma previsto que já existe, como o `saveBaseline` faz hoje (`useProjectStore.ts:1271-1277`).
  - A regra nova da data de status (não voltar antes do último fechamento) não muda nenhuma data calculada.
- **T2 SIM.**
  - `computeSCurve` (`evm.ts:128-173`) passa a usar os fechamentos; `earnedShareAt` (`:59-64`) fica só para a reconstrução.
  - PV, EV, BAC, SPI, CPI, EAC, Curva S, EVM por pacote e previsão por SPI passam a usar a **LB do valor agregado**: `plannedFraction` (`evm.ts:53-56`), `computeEvm`, `computePackageEvm`, `computeSCurve` e `evmForecast` (`useProjectStore.ts:590-603`). `analyzeDelay` (`scenarios.ts:53`, `:63`), `finishVarianceDays` (`useProjectStore.ts:723-727`) e `supplies.ts:96` continuam na LB0 (emenda 01).
  - Totais do fechamento e da retificação; tendência; comparação.
- **T3 SIM.**
  - O import lê as LB1–10 (hoje só a 0: `:978`; aviso na `:1106`), além de `Interim` e de `Number` fora da faixa.
  - O export grava `<Baseline>` de 0 a 10 (hoje só `<Number>0`: `:341-349`) e `BaselineForEarnedValue` (já no `SCHEMA_ORDER.Project`, `:71`, hoje não gravado).
  - O JSON exportado do histórico é um formato novo de **saída**. Não há importação de JSON neste ciclo.
- **T4 SIM.**
  - Esquema 5 → 6 (emenda 02): `ProjectState.linhasBase`, `Task.linhasBase?` e `meta.linhaBaseAtiva?`.
  - Estrutura do IndexedDB 2 → 3: stores de fechamento (`armazenamentoObras.ts:7`, `:125-129`, `:139`; a 00006 deixa em 2).
- **T5 NÃO.**
  - Não entra arquivo externo novo: o JSON é só exportado.
  - Os textos novos (nome e motivo da LB, autor, observação, motivo da retificação) são digitados pelo usuário e aparecem só por interpolação.
  - A leitura do IndexedDB ganha validação de forma e limites (lição 6). Nenhuma dependência nova.
  - O `seguranca` valida por ser faixa 3.
- **T6 NÃO.** `fieldAi.ts` e `approveReport` não mudam.
- **T7 NÃO.** Sem CI, Docker ou dependências.
- **T8 NÃO.** Sem backend. Trilha de auditoria com identidade: SPEC-02, Fase 2.

**Faixa 3 (T3).** Base: `feat/00006-sinapi-layout-2025` (PR empilhado) ou a `master` depois do merge da 00006. Branch: `feat/00007-snapshots-linhas-base`. Validação:
- `especialista-obra` (tarefa 0 e T2/T3);
- `testes`;
- `arquiteto` (revisão);
- `seguranca` (T3);
- auditoria independente.

## 03. Decisões de design

### Busca de equivalentes (feita)
- **Fechamento:** não há nada no código. O log (`DecisionLogEntry`) só tem texto. O "snapshot" do `EvmModule.vue:30-43` é só o ponto clicado da curva.
- **Linhas de base:** só os três campos da LB0 em `Task` (`domain.ts:138-140`). O *rollup* da LB0 está em `wbs.ts:53-67`. Não existem metadados de LB.
- **Armazenamento fora do estado reativo:** o recorte SINAPI da 00006 (D-11, D-13). É o padrão imitado aqui.
- **Validação de dado lido do armazenamento:** `validarIndice` (`obras.ts`), `erroDoRegistroDeDesfazer` e `validarRecorteSinapi` (00006, D-10, que reconstrói o objeto). Imitar.

### Linhas de base (E1, E2)
```ts
// src/types/domain.ts
interface DadosLinhaBase { inicio?: string; termino?: string; duracaoMin?: number; custo?: number }   // campos presentes; LB incompleta é preservada
interface LinhaBaseInfo { numero: number /* 0..10 */; nome: string; motivo: string; autor?: string; salvaEm?: string /* ISO data-hora */; dataStatus?: string; origem: 'cronoai' | 'arquivo' | 'migrada' }
// Task ganha: linhasBase?: Partial<Record<'1'|'2'|…|'10', DadosLinhaBase>>   (a LB0 continua em baselineStart/baselineFinish/baselineDuracaoMin e o custo dela é o bac)
// ProjectState ganha: linhasBase: LinhaBaseInfo[]
// ProjectMeta ganha: linhaBaseAtiva?: number   (ausente = 0)
```

| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-1 | **LB0 continua nos campos atuais** (`baselineStart`, `baselineFinish`, `baselineDuracaoMin`, com o custo = `bac`). As LB1–10 ficam num mapa esparso por tarefa. Os metadados de todas ficam em `state.linhasBase` (gate **G2**) | Mover tudo para `linhasBase[0..10]` | Há 14 consumidores da LB0 (seção 00), e a mudança exigiria refixar números sem ganho. Com a LB0 intacta, a garantia "sem fechamento e com LB0 nada muda" sai de graça |
| D-2 | **Salvar LB n** (`salvarLinhaBase({ numero, nome, motivo, autor, confirmarSobrescrita })`) copia, para cada tarefa do cronograma previsto, início, término e duração (`schedule.byUid`), e o custo = `bac` do momento. Com `numero = 0`, faz exatamente o que o `saveBaseline` faz hoje, mais os metadados. Sobrescrever uma LB existente exige confirmação e motivo e registra no log o nome e a data da anterior (gate G2). A duração gravada é `s.duracaoMin`, o **vão** em minutos úteis entre o início e o término (`cpm.ts:434`): numa tarefa interrompida pela data de status, ele é maior que a duração da tarefa (302: ~36,9 d em vez de 36 d). Só afeta a `Duration` exportada da LB n, não o PV. Fica registrado como dívida (tarefa 0, pergunta 1) | LB imutável depois de salva | São só 11 posições. O MS Project permite sobrescrever e avisa (tarefa 0, pergunta 1). Os fechamentos guardam os próprios totais, então sobrescrever uma LB não altera o histórico |
| D-3 | Excluir uma LB fica **fora** | "Limpar linha de base" do MS Project | Não é pedido pela SPEC-04 e criaria o caso "LB ativa apagada" |
| D-4 | Nome com 1 a 60 caracteres, motivo com 1 a 500, autor com 0 a 120. Datas da LB só como data (`yyyy-mm-dd`), como a LB0 hoje | Guardar a hora da LB | Mesma convenção da LB0 (`calculo-precisao.md`). A hora do arquivo (ex.: 09:00 no corpus) não volta, como já acontece na LB0. Fica registrada como limitação, e a tarefa 0 (pergunta 10) diz se é aceitável |
| D-5 | Funções puras em `src/lib/linhasBase.ts` (novo): `dadosDaLinhaBase(t, n)`, `projetarLinhaBase(tasks, n)`, `linhaBaseDoCronograma(tasks, schedule, n)`, `rollupLinhaBase(tasks, n, calendarioPadrao, minutosPorDia)` (resumo: menor início, maior término, soma do custo, como `wbs.ts:53-67`, e **duração** = d.u. do calendário padrão entre o menor início e o maior término × `minutosPorDia`, como a `Duration` do resumo, `msProjectXmlParser.ts:267-268`; E-6), `sanearLinhasBase(tasks)`, `validarDadosLinhaBaseInfo` e `rotuloLinhaBase(info)` ("LB1 — Replanejamento após chuvas (25/10/2026)") | Espalhar na store | Camada `src/lib` (`CLAUDE.md`) |
| D-6 | **Projeção da LB do valor agregado** (gate **G5 = b**, emenda 01). "LB ativa" neste plano = **LB do valor agregado** (`meta.linhaBaseAtiva`; tela: "LB do valor agregado: LBn"). `projetarLinhaBase(tasks, n)` devolve tarefas em que `baselineStart`/`baselineFinish`/`baselineDuracaoMin` são os da LB n e `bac` = custo da LB n (gate **G6 = a**; sem custo na LB n, `bac` = 0, D-8). Com `n = 0`, devolve **o mesmo array** (`toBe`), e nenhum número muda. A store expõe `tarefasDoValorAgregado` e passa essa projeção **só** a `computeEvm`, `computePackageEvm`, `computeSCurve` (PV), `evmForecast` (IEAC(t) = duração planejada ÷ SPI), tendência e às frases de valor agregado do diagnóstico. **Continuam com `state.tasks` (LB0):** `analyzeDelay` (atraso e meta de recuperação dos cenários), `finishVarianceDays`, `supplies.ts:96` (deslocamento da frente na DLP), barra de LB do Gantt e coluna de LB da EAP. Ações, exportação e gravação usam sempre `state.tasks` | (a) LB ativa também nas variações (texto do RF-04.5); um parâmetro "número da LB" em cada função | MS Project: `BaselineForEarnedValue` afeta só os campos de valor agregado, e as variações comparam sempre com a LB0 (tarefa 0, pergunta 2; M-4). Seguir o MS Project evita que CronoAI e MS Project mostrem atrasos diferentes para o mesmo `.xml`. Um único ponto de troca; ações nunca recebem a projeção (R-3); variações nunca recebem a projeção (R-6) |
| D-7 | **Derivados de agenda e de valor agregado separados** (lição 3). `calculo` (cronograma, calendários, `WorkCalendar` e o **atraso** contra a LB0) não depende da LB do valor agregado. `calculoValorAgregado` (EVM, Curva S, pacotes, tendência, previsão por SPI) depende da projeção. `calcularObra`/`verificarCalculo` (`horizonte.ts`) ficam como estão para a verificação do horizonte | Projeção dentro de `calcularObra` | Trocar a LB do valor agregado não refaz o CPM (~0,8 a 1,5 s com 3.000 tarefas, dívida da RNF-05.1) nem o atraso: só os derivados de valor agregado (P-11) |
| D-8 | **Tarefa sem a LB n** (E-2): sem custo na LB n, **BAC, PV e EV = 0** e o **AC continua contando** (o CPI cai). Com custo e sem uma das datas: PV = 0 e EV = % × custo da LB n (regra da LB0 incompleta de hoje, `evm.ts:54`; o BCWP do MS Project nesse caso fica para o M-4). Aviso na tela: "N tarefa(s) sem a linha de base n: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando." | Cair na LB0 | MS Project: sem custo na LB do valor agregado, BCWS, BCWP e BAC zeram e o ACWP conta (tarefa 0, pergunta 3; M-4). Misturar LBs falsearia o PV. A projeção reproduz isso de forma explícita e testada (LB-4) |
| D-9 | **Duplicar obra** copia as LBs (estão no estado) e **não** copia os fechamentos. O log da cópia registra "histórico de fechamentos não copiado" | Copiar os fechamentos | Opinião: a cópia é um estudo ou uma obra nova. O histórico medido pertence à obra original, e copiá-lo dobraria o volume (~37 milhões de caracteres) |
| D-35 | **Inclusão de escopo com a LB do valor agregado ≠ 0** (E-7): `addSinapiTask` e `generateFromBudget` (`useProjectStore.ts:1049`, `:1240`), que hoje gravam só a LB0 da tarefa nova, gravam também a LB n ativa com as mesmas datas, duração e custo = `bac`, com entrada no log ("Tarefa nova incluída também na LB n") | Deixar sem a LB n (cai no aviso da D-8) | Sem isso, a tarefa nova fica sem PV, EV e BAC na LB do valor agregado. Decisão a validar com Planejamento/Controle (tarefa 0, E-7) |
| D-36 | **PV linear: regra do CronoAI** (E-4). O PV de uma LB é distribuído linearmente em minutos úteis entre o início e o término da LB (`elapsedFraction`). Numa LB salva no meio da obra, o vão da tarefa em andamento inclui a interrupção na data de status, e a LB já nasce com SPI < 1 (Aurora: 0,992606). Pela distribuição no tempo, o MS Project daria SPI ≈ 1,00 (tarefa 0, ressalva da C-2; M-4). Rotulado como "regra do CronoAI" no teste (LB-2), na `calculo-precisao.md` e na nota da tela "o PV é distribuído linearmente entre o início e o término da linha de base" | Distribuição no tempo da LB (`TimephasedData`) | Exige o RF-04.8, fora do escopo. Não muda código |

### Fechamento e retificação (E3)
```ts
// src/types/fechamento.ts (novo)
interface TotaisFechamento { bac: number; pv: number; ev: number; ac: number; spi: number | null; cpi: number | null; eac: number | null; entregaPrevista: string; atrasoDiasUteis: number }
interface PacoteFechamento { wbs: string; nome: string; bac: number; pv: number; ev: number; ac: number }
interface CabecalhoFechamento {
  versaoFormato: 1; id: string; obraId: string; sequencia: number          // sequência por obra (1, 2, 3…), independente do relógio
  tipo: 'fechamento' | 'retificacao'; retificaId?: string                   // a retificação aponta para o fechamento original (raiz)
  dataStatus: string; fechadoEm: string                                     // data-hora ISO do navegador
  autor?: string; observacao?: string; motivo?: string                      // motivo: obrigatório na retificação
  linhaBase: number; linhaBaseSalvaEm?: string                            // E-3: o `salvaEm` da LB usada (a LB pode ser sobrescrita depois)
  versaoPremissas: number; esquemaObra: number
  totais: TotaisFechamento; porPacote: PacoteFechamento[]; quantidadeTarefas: number
}
// Detalhe (só folhas), em tuplas para caber no volume do ADR:
// [uid, wbs, pct, custoReal, bac, pv, inicioReal|null, terminoReal|null, inicioPrevisto, terminoPrevisto, folgaTotalMin, critica(0|1)]   (12 posições, E-3)
interface DetalheFechamento { versaoFormato: 1; id: string; tarefas: TarefaFechamento[] }
```

| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-10 | **Conteúdo do fechamento.** Vai o que o RF-04.1 pede, mais o BAC, o **PV** (R$), as datas reais e o WBS por tarefa, os totais por pacote de 1º nível, a LB usada **com a data em que ela foi salva** (`linhaBaseSalvaEm`) e a versão das premissas. Só folhas (E-3) | Só o RF-04.1 | O BAC, o PV e o WBS permitem a comparação (RF-04.6) com SV por tarefa mesmo depois que a LB muda, e a curva por pacote. A data da LB permite dizer "fechado contra a LB1 de 25/10/2026; a LB1 atual é de 30/11/2026". As datas reais permitem a reconstrução antes do 1º fechamento (D-28). Resumos são derivados |
| D-11 | **SPI, CPI e EAC gravados sem o *fallback*.** `spi = pv > 0 ? ev/pv : null`; `cpi = ac > 0 ? ev/ac : null`; `eac = ev > 0 && ac > 0 ? bac × ac ÷ ev : null` | Gravar o `computeEvm` como está | `safeDiv` devolve 1 sem divisor (`evm.ts:37`, dívida da 00008). Congelar um "1,00" falso num registro imutável impediria a 00008 de corrigi-lo. Os números com divisor são idênticos aos do `computeEvm` (FE-1) |
| D-12 | **Regras do fechamento:** a data de status precisa ser **posterior** à do último fechamento efetivo; o cálculo não pode ter erro de horizonte; a obra precisa de ao menos 1 folha; e todos os cabeçalhos de fechamento da obra precisam estar legíveis. Fechar duas vezes a mesma data é recusado: "Já existe fechamento em 23/10/2026: use 'Retificar'." | Aceitar qualquer data | É a imutabilidade em ordem. Com um cabeçalho ilegível, a sequência e o limite não podem ser garantidos (D-24). **Avisos sem bloquear (E-8):** relatos de campo pendentes de aprovação ("Há 4 relato(s) de campo pendente(s) de aprovação: o fechamento não inclui essas medições.") e data de status posterior a hoje ("A data de status (dd/mm/aaaa) é posterior a hoje."). O diálogo traz também "Registro gerencial; não substitui a medição contratual." (Jurídico, tarefa 0) |
| D-13 | **A data de status não volta antes do último fechamento.** Vale em `setStatusDate` e `atualizarDadosObra`: "A data de status não pode ser anterior ao último fechamento (23/10/2026). Para corrigir um fechamento, use 'Retificar'." A data de início não passa da data do 1º fechamento. **Importar `.xml`** com a data de status anterior ao último fechamento mantém a data de status do CronoAI, com aviso, como já acontece quando o arquivo não traz data (`msProjectXmlParser.ts:1129`) | Permitir e filtrar | Opinião: a curva e a tendência ficariam com fechamentos "no futuro". A tarefa 0 (pergunta 9) confirma a rotina |
| D-14 | **Obra alterada depois de fechada, na mesma data de status:** a curva mostra o fechamento (imutável). Os KPIs mostram o estado vivo, com a faixa "A obra mudou depois do fechamento de 23/10/2026: avance a data de status ou retifique o fechamento." | Bloquear a edição depois de fechar | Opinião: bloquear a EAP é invasivo. A faixa deixa a divergência visível |
| D-15 | **Retificação.** Copia o original, com mudanças só em **% físico e custo real** das tarefas escolhidas. EV, AC, SPI, CPI, EAC e `porPacote` (EV/AC) são recalculados por função pura. PV, entrega, datas previstas, folgas e LB **ficam as do original**, com a nota "previsão do fechamento original". Motivo de 1 a 500 caracteres. Sempre aponta para a raiz. O **efetivo** de uma data é a retificação de maior `sequencia`. **Avisos sem bloquear (E-5):** EV retificado acima do EV do fechamento seguinte, e % de uma tarefa acima do % dela no fechamento seguinte (FE-9). O diálogo diz "A retificação não altera a obra atual: corrija também a EAP, se o erro continuar nela." | Recapturar o estado atual | Depois de avançar a data de status, o estado atual já tem o avanço seguinte. Recalcular a previsão de uma data passada exigiria o estado inteiro daquela data. A tarefa 0 (pergunta 8) confirma o que se corrige na prática |
| D-16 | **Atomicidade (lição 6).** A ação monta o cabeçalho, o detalhe e o novo registro da obra (com a entrada no log) a partir de uma cópia simples (`toRaw` + clone). Grava os quatro (cabeçalho, detalhe, obra e índice) **numa transação**, dentro da mesma `fila` de gravação. Só depois do sucesso aplica a entrada de log e o cabeçalho na memória. Falha = nada gravado, estado igual, toast | Gravar o snapshot e depois a obra | O IndexedDB garante o "tudo ou nada" na transação (ADR 00002). Ação pela metade deixaria log sem fechamento ou fechamento sem log |
| D-17 | Imutabilidade no armazenamento: `IDBObjectStore.add` (falha com `ConstraintError` se a chave existe), **nunca `put`**, nos fechamentos. O adaptador de memória imita o comportamento. Nenhuma ação altera ou apaga um fechamento, salvo `excluirObra` (todos de uma vez, na mesma transação) | `put` com cuidado no código | Boa prática ([MDN — IDBObjectStore.add](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/add)): a sobrescrita vira erro do próprio banco |
| D-18 | **Limites** (gate **G4**): 104 fechamentos por obra (RNF-04.2: 2 anos semanais) e 52 retificações. Ao atingir: recusa, com a mensagem "Limite de 104 fechamentos desta obra atingido. Exporte o histórico (JSON) e registre a pendência com a equipe responsável pelo servidor (SPEC-01)." Sem exclusão e sem rotação | Rotação automática (apaga o mais antigo) | Rotação destrói histórico imutável. A persistência sem limite é a do backend (SPEC-01) |
| D-19 | **Armazenamento persistente:** no 1º fechamento bem-sucedido, a store chama `navigator.storage.persist()` uma vez. O resultado ("concedido" ou "negado pelo navegador") aparece na faixa de armazenamento e no log. Não bloqueia nada | Pedir ao abrir o app | Boa prática ([MDN — StorageManager.persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)). O ADR 00002 adiou o pedido para este ciclo. É no 1º fechamento que perder dado passa a custar histórico |

### Armazenamento (E3) — gate G1
| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-20 | **Estrutura 3 do IndexedDB** com **duas stores**: `fechamentos` (cabeçalhos, `keyPath: 'id'`, índice `obraId`) e `fechamentoTarefas` (detalhe, `keyPath: 'id'`). O `onupgradeneeded` cria só o que falta e não toca `obras`, `meta` nem `recortesSinapi` (00006). `transacao` abre as 5 stores | Uma store com chave `[obraId, dataStatus]` (ADR) | A retificação tem a mesma data do original. Abrir a obra lê só os cabeçalhos (até 156 de ~2 KB), e não 37 milhões de caracteres. **Emendar a tabela "Estrutura" do ADR 00002** (tarefa 28) |
| D-21 | Interface nova, estendendo a da 00006: `lerCabecalhosFechamento(obraId)`, `lerDetalheFechamento(id)`, `gravarFechamento(cabecalho, detalhe, registroObra, indice)`, `persistir()`. `excluirObra` passa também a apagar os fechamentos da obra pelo índice | Métodos genéricos | A memória e o IndexedDB implementam o mesmo contrato, como na 00006 |
| D-22 | **Cabeçalhos em memória fora do estado reativo:** `shallowRef` + `markRaw`, carregados ao abrir, trocar, criar, duplicar e excluir obra, como o recorte (00006, D-13). O detalhe é lido sob demanda (comparação, retificação, exportação), e o do **1º fechamento efetivo** é lido ao abrir a obra (D-24) | Cabeçalhos dentro de `state` | O `watch` profundo regravaria o histórico a cada 300 ms, e o histórico não pode ser editado pelo estado |
| D-23 | **Detalhe em tuplas** com a ordem fixada por `versaoFormato: 1` | Objetos com chaves | Estimativa (com o PV da E-3): ~95 caracteres por tarefa × 3.000 = ~285 mil por fechamento; 156 fechamentos = ~44 milhões, perto da estimativa do ADR (37 milhões). Com chaves nomeadas, ~200 caracteres por tarefa e ~94 milhões. O tamanho real é medido (P-12) |
| D-24 | **Leitura validada (lição 6):** `validarCabecalhoFechamento` e `validarDetalheFechamento` (puras, em `fechamentos.ts`) **reconstroem** o objeto só com os campos conhecidos (`__proto__` e chaves extras não passam). Limites na seção 08. Registro inválido ou de formato mais novo: ignorado na curva, aviso "N fechamento(s) ilegível(is) ignorado(s); os registros ficam intactos", nunca regravado, e novo fechamento bloqueado (D-12). O detalhe confere com o cabeçalho: mesmo `id`, `quantidadeTarefas` igual, EV e AC somados a até R$ 0,01 dos totais (senão, o detalhe é tratado como ilegível) | Confiar no que foi gravado | Estado adulterado não pode quebrar a tela nem deixar uma ação pela metade (lição 6) |

### Curva S, tendência e comparação (E4) — gate G3
| # | Decisão | Alternativa descartada | Motivo |
|---|---|---|---|
| D-25 | `computeSCurve(tasks, cals, statusDate, forecast, monthLabel, historico?)`. `historico = { fechamentos: CabecalhoFechamento[] (efetivos, legíveis, com data ≤ statusDate), ancora?: DetalheFechamento (1º efetivo) }`. Os pontos são os fins de mês, como hoje (`tipo: 'mes'`, e no mês da data de status o corte é a própria data, `● `), **mais** um ponto por fechamento (`tipo: 'fechamento'`, rótulo "23/10 ◆"). Quando o fechamento cai na data de status ou num fim de mês, ele vira esse ponto. Cada ponto ganha `origem` (`'fechamento' \| 'interpolado' \| 'reconstruido' \| 'atual' \| null`), `fechamentoId?` e `linhaBaseFechamento?` | Pontos só mensais | Critério da SPEC-04 §5: a curva mostra **exatamente** o EV/AC gravado, e isso exige o ponto na data do fechamento. `monthlyIncrements` passa a operar só sobre os pontos `tipo: 'mes'` (helper `pontosMensais`) |
| D-26 | **PV sempre da LB do valor agregado** em todos os pontos, inclusive os de fechamento (o PV gravado fica no cabeçalho e na tabela). EV e AC: no ponto de fechamento, **os gravados** (`toBe`); entre dois fechamentos, interpolação; depois do último fechamento até a data de status, interpolação até o ponto `'atual'` (estado vivo). Quando o último fechamento é na data de status, vale D-14 | PV do fechamento | O PV é o plano: trocar a LB ativa redesenha o PV de toda a curva. EV e AC passados são fatos gravados, e a nota "fechado contra a LB0 de dd/mm/aaaa" (com a `linhaBaseSalvaEm`) aparece quando a LB do fechamento difere da LB do valor agregado ou foi sobrescrita depois. A tendência mostra os índices **gravados**, com a nota "índices dos fechamentos calculados contra a linha de base vigente em cada fechamento" (E-9) |
| D-27 | **Interpolação em minutos úteis do calendário padrão** (sem as exceções úteis, como o PV, CR-2d), do fim do dia do fechamento anterior ao fim do dia do corte (gate G3) | Dias corridos | Recomendação: obra não avança no fim de semana, e é a mesma régua do PV (`elapsedFraction`). No CS-2, dias úteis dão R$ 65.000,00 / R$ 69.000,00; dias corridos dariam R$ 67.142,86 / R$ 71.428,57 |
| D-28 | **Antes do 1º fechamento:** a reconstrução de hoje (`earnedShareAt`), **ancorada no 1º fechamento**: % físico, custo, BAC e datas reais de cada tarefa do detalhe dele, e a data de status = a do fechamento. Calendário: o atual da tarefa (`calendarioUid`); tarefa que não existe mais usa o padrão. Ponto com `origem: 'reconstruido'` e aviso "antes do 1º fechamento (23/10/2026): reconstruído linearmente" (gate G3) | Linha reta nos totais desde o 1º início real; ou sem valores | **Continuidade:** fechar o 1º fechamento no Aurora não muda nenhum valor da curva (CS-3). Os meses passados **param de mudar** quando o avanço muda depois (CS-3b), que é o problema da SPEC-04 §1. Custa ler um registro ao abrir a obra |
| D-29 | **Sem nenhum fechamento:** o comportamento de hoje, número por número (CS-4 = C-1), com `origem: 'reconstruido'` e o aviso fixo "Histórico reconstruído linearmente: esta obra ainda não tem fechamentos." | — | SPEC-04 §6: o *fallback* tem aviso visível |
| D-30 | **Curva por pacote** (`sCurveFor(wbs)`): EV/AC dos fechamentos pelo `porPacote` (pelo WBS do pacote). Um fechamento sem o pacote fica fora da curva do pacote. A reconstrução filtra o detalhe-âncora pelo prefixo do WBS | Só a obra inteira | A tela já tem o filtro por pacote (`EvmModule.vue:24-25`) |
| D-31 | **Gráfico:** o trecho interpolado de EV/AC fica com um traço **pontilhado curto, diferente do tracejado da tendência** que já existe (E-9) (`segment.borderDash` do Chart.js, sem dependência nova; [Chart.js — Line Segment Styling](https://www.chartjs.org/docs/latest/samples/line/segments.html), a conferir na versão instalada). O ponto de fechamento usa marcador próprio. A legenda e a tabela alternativa ganham a coluna "Origem" | Série separada para o interpolado | `CLAUDE.md`: legenda e tabela sempre. A cor nunca é a única pista (tracejado + texto) |
| D-32 | **Tendência (RF-04.4):** `serieDosFechamentos(efetivos)` devolve, por fechamento, SPI, CPI (nulos ficam de fora do gráfico), entrega prevista e atraso em d.u. Na tela: `IndexTrendChart` com os pontos dos fechamentos, mais um gráfico novo de entrega (eixo de datas por número de dia, com formatação `fmtDate`) e a tabela. Sem fechamentos, `indexSeries` de hoje, com o aviso de reconstruído | Reaproveitar só o `indexSeries` | O RF-04.4 pede os índices **dos fechamentos**. O gráfico de entrega não existe |
| D-33 | **Comparação (RF-04.6):** `compararFechamentos(a, b, calendarioPadrao)` lista as tarefas que **avançaram** (Δ% > 0, com ΔEV), **atrasaram** ou **adiantaram** (Δ do término previsto em d.u.), **mudaram de custo** (\|ΔAC\| ≥ R$ 0,005 ou ΔBAC), as **novas** (só em b), as **removidas** (só em a) e as inalteradas, mais Δ dos totais. As categorias podem se sobrepor | Diferença de texto | O RF-04.6 pede as três categorias. A tolerância de meio centavo evita o ruído de ponto flutuante |
| D-34 | **Exportação JSON (RNF-04.2):** `{ formato: 'cronoai-historico', versao: 1, exportadoEm, obra: { nome, uf?, municipio? }, linhasBase: LinhaBaseInfo[], fechamentos: [{ cabecalho, tarefas }] }`, por `download.ts`, com o nome `{obra}_historico_{dataStatus}.json`. Sem importação | Importar também | A importação seria entrada externa nova (T5) e não é pedida. Os metadados das LBs entram porque o MSPDI não tem nome nem motivo de LB |

### ADR
Emenda ao ADR 00002 (tarefa 28): estrutura 3 com as duas stores, a chave `id` com índice `obraId` (D-20) e o volume medido (P-12). Não é decisão nova de armazenamento, porque o IndexedDB continua. Se o gate G1 escolher outra opção, a emenda muda junto.

## 04. Casos de referência (T1/T2)
**Base:** Aurora (`buildSeedState()`), início 2026-05-04, data de status 2026-10-23, calendário padrão seg–sex 08:00–12:00 e 13:00–17:00 com os feriados da obra. Contas feitas à mão a partir de `src/data/seed.ts`, conferidas com `node -e` (só aritmética).
- 20 folhas e BAC R$ 19.113.000,00.
- EV = 180.000 + 1.150.000 + 820.000 + 2.350.000 + 0,78 × 2.200.000 + 165.000 + 0,40 × 168.000 = **R$ 6.448.200,00**.
- AC = 186.400 + 1.212.000 + 841.500 + 2.538.000 + 1.871.000 + 176.000 + 72.000 = **R$ 6.896.900,00**.
- PV **R$ 7.259.250,00**: medição do N-1 da 00005.

O que depende do motor (datas previstas, folgas, curva mensal) é **medido na tarefa 1, na base, antes de mexer** (lição 2). Onde o plano traz estimativa, vale a medição, registrada no ciclo.

### 4.1 Caracterização na base (tarefa 1, verde antes da 1ª mudança)
| Caso | Medição | Teste que fixa |
|---|---|---|
| C-1 | Curva S do Aurora, ponto a ponto (mai/26 a jun/27): data, rótulo, PV, EV, AC e tendência. Já conhecido: o ponto "out/26 ●" tem PV 7.259.250,00, EV 6.448.200,00 e AC 6.896.900,00 | `src/lib/evm.caracterizacao.test.ts` › "Curva S do Aurora na base" (`toBe` em data e rótulo; `toBeCloseTo(…, 2)` em R$) |
| C-2 | Na base, `saveBaseline()` seguido de `evm.pv`. É o que a LB1 vai gravar. Estimativa à mão: 4.665.000 + 2.200.000 × 29/37 + 168.000 × 14/22 = **R$ 6.496.233,42**, com SPI 0,992606. Supõe que o previsto do 302 e do 104 começa no início real e termina em 2026-11-05 | `evm.caracterizacao.test.ts` › "PV depois de salvar a linha de base pelo cronograma previsto" |
| C-3 | Atraso depois de `saveBaseline()`: **0 d.u.** (término previsto = término da LB) | idem |
| C-4 | Exportação MSPDI do seed: SHA-256 e comprimento do XML com `CreationDate`/`LastSaved` normalizados | `msProjectXmlParser.test.ts` › "exportação do seed igual à da base 00006" |
| C-5 | Registro **real** do esquema 5 (lição 4; o esquema da base 00006, emenda 02), gerado na base pela store: Aurora com premissas v2, calendário alternativo atribuído, feriado manual, crashing e hora extra "frentes escolhidas" aplicados (pilha `undo` com `addedDays`, `calendariosCriados`, `calendariosAntes`), recorte SINAPI vinculado (00006) e log. Gravado por `criarRegistro` | `src/lib/__fixtures__/registro-esquema5-aurora-cenarios.json` (com o commit da base anotado no ciclo e no teste; a fixture do esquema 4 é do 00006 e continua) |
| C-6 | Corpus na base: inventário e avisos de LB (470 tarefas em 7 arquivos; `lb0Lida` 11; sem término 11 e sem início 12) | execução local registrada (M-6, "antes") |
| C-7 | Previstos por tarefa do Aurora para o fechamento: início e término previstos, folga, crítica e **PV por tarefa na LB0** (E-3). Estimativa: 302 e 104 terminam em **2026-11-05** (com `moverRestante` = true, o padrão) | `evm.caracterizacao.test.ts` › "previsão por tarefa na data de status" |
| C-8 | Tempo na base, com 3.000 tarefas, de `sCurve` + `evm` + `delay` lidos juntos (régua da P-10) | `fechamentos.desempenho.test.ts` (local) |

### 4.2 Linhas de base
| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| LB-1 | Aurora; `salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Teste' })` na data de status | Todas as folhas com `linhasBase['1']` = início, término e duração do previsto, e custo = bac. LB0 **intacta** (`baselineStart/Finish/DuracaoMin` com `toEqual` ao de antes). `state.linhasBase` com LB0 e LB1 | SPEC-04 §5 | `useProjectStore.linhasBase.test.ts` |
| LB-2 | LB-1, depois LB do valor agregado = 1, depois volta à 0 | LB1: PV = **C-2** (estimativa R$ 6.496.233,42), EV 6.448.200,00, SPI = C-2 (~0,992606). LB0: PV **7.259.250,00**, SPI **0,888274**. Nome do teste com "regra do CronoAI": PV linear entre o início e o término da LB (D-36); o MS Project daria SPI ≈ 1,00 (M-4) | SPEC-04 §5 ("PV contra qualquer uma") | idem |
| LB-3 | LB do valor agregado = 1 | Atraso **+16 d.u.** (continua contra a LB0); entrega 2027-06-23; `finishVarianceDays` igual ao da LB0 em todas as folhas; crashing 3 d.u. e R$ 12.616,80; DLP do `m-concreto` igual; Gantt e EAP mostram a LB0 | Emenda 01 (G5 = b); MS Project: variações contra a LB0 (tarefa 0, pergunta 2) | idem (teste 64) |
| LB-4 | Tarefa 801 sem `linhasBase['3']`; LB3 do valor agregado, com as demais folhas com LB3 = LB0 (copiada no teste, custo = bac) | BAC **18.993.000,00** (19.113.000 − 120.000 do 801); PV **7.259.250,00** (o 801 tem a LB0 em 2027: contribuição 0); EV **6.448.200,00** (o 801 está em 0%); AC **6.896.900,00**; CPI **0,934942** (igual); EAC = 18.993.000 × 6.896.900 ÷ 6.448.200 = **20.314.633,80**. Aviso "1 tarefa(s) sem a linha de base 3: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando." **Variante com o 104 sem LB3:** BAC **18.945.000,00**; EV = 6.448.200 − 0,40 × 168.000 = **6.381.000,00**; AC **6.896.900,00** (inalterado); CPI **0,925198**; EAC **20.476.691,82**; PV = 7.259.250 − contribuição do 104 na LB0 (medida na tarefa 1, C-7) | D-8 (E-2); MS Project (tarefa 0, pergunta 3) | idem + `linhasBase.test.ts` |
| LB-5 | Salvar a LB2; depois `bac` do 104: 168.000 → 180.000 | LB0 ativa: EV **R$ 6.453.000,00** (+0,40 × 12.000). LB2 ativa: EV **R$ 6.448.200,00** (custo congelado em 168.000) (G6 = a, confirmado) | MS Project: BCWP pelo custo da LB do valor agregado (tarefa 0, pergunta 3; M-4). A LB0 acompanha o `bac` vivo: dívida registrada (E-2) | idem |
| LB-6 | Salvar a LB1 de novo sem `confirmarSobrescrita` | Recusa: "A linha de base 1 já existe (Replanejamento, 25/10/2026). Confirme para substituí-la." Com a confirmação: substitui, e o log registra o nome e a data da anterior | D-2 | idem |
| LB-7 | `projetarLinhaBase(tasks, 0)` | **O mesmo array** (`toBe`) | D-6 | `linhasBase.test.ts` |

### 4.3 Fechamento, retificação e limites
| Caso | Entrada | Esperado | Teste que fixa |
|---|---|---|---|
| FE-1 | Aurora, LB0, fechar em 2026-10-23 | Totais: BAC **19.113.000,00**; PV **7.259.250,00**; EV **6.448.200,00**; AC **6.896.900,00**; SPI **0,888274** e CPI **0,934942** (`toBeCloseTo(…, 6)`); EAC **20.442.984,04**; entrega **2027-06-23**; atraso **16**; `linhaBase` 0; 20 tarefas; `sequencia` 1. Pacote 01: BAC, PV e EV 2.150.000,00 e AC 2.239.900,00. `linhaBaseSalvaEm` = o `salvaEm` da LB0 do seed. Tupla do 302: pct 78, custo 1.871.000, BAC 2.200.000, **PV = C-7**, início real 2026-09-14, término previsto = C-7 (estimativa 2026-11-05); tupla do 104 com o PV da C-7. Soma dos PVs das tuplas = 7.259.250,00 (`toBeCloseTo(…, 2)`). Aviso da E-8: "Há 4 relato(s) de campo pendente(s) de aprovação…" | `fechamentos.test.ts` (função) e `useProjectStore.fechamentos.test.ts` (ação) |
| FE-2 | FE-1 com `falhar.gravar = true` no adaptador de memória | `{ ok: false }`; 0 cabeçalhos e 0 detalhes; log e estado iguais (`toEqual` com a cópia anterior); toast de erro | idem |
| FE-3 | Retificar o FE-1: 104 de 40% para 45% e custo de 72.000 para 75.000; motivo "Medição revisada em campo" | Retificação: EV **6.456.600,00**; AC **6.899.900,00**; SPI **0,889431**; CPI **0,935753**; EAC **20.425.268,52**; PV 7.259.250,00 e entrega 2027-06-23 do original; `retificaId` = FE-1; `sequencia` 2. Original igual byte a byte. Efetivo de 23/10 = retificação. Motivo vazio: recusa "Informe o motivo da retificação." | idem |
| FE-4 | `gravarFechamento` com um `id` que já existe | `ConstraintError` (memória e IndexedDB); nada muda | `useProjectStore.fechamentos.test.ts`, E2E |
| FE-5 | Depois do FE-1: (a) fechar de novo em 23/10; (b) `setStatusDate('2026-10-16')`; (c) `setStatusDate('2026-10-30')` e fechar | (a) recusa "Já existe fechamento em 23/10/2026: use 'Retificar'."; (b) recusa com a mensagem da D-13; (c) aceito, `sequencia` 2 | idem |
| FE-6 | Obra com 104 fechamentos (sintéticos, só cabeçalhos válidos) | O 105º é recusado com a mensagem da D-18. A 53ª retificação também | `fechamentos.test.ts` |
| FE-7 | Fechamento com PV = 0 e AC = 0 (obra que não começou) | `spi`, `cpi` e `eac` = **null**; a curva e a tendência ignoram os nulos | `fechamentos.test.ts` |
| FE-8 | 1º fechamento bem-sucedido | `persistir()` chamado 1 vez; o resultado vai ao log; o 2º fechamento não chama de novo | `useProjectStore.fechamentos.test.ts` |
| FE-9 (E-5) | FE-1 e um F2 sintético em 2026-10-30 (EV 6.500.000,00; 104 em 60%); retificar o FE-1 com o 104 de 40% para 75% | EV retificado = 6.448.200 + 0,35 × 168.000 = **6.507.000,00**. Avisos: "O EV retificado (R$ 6.507.000,00) fica acima do EV do fechamento de 30/10/2026 (R$ 6.500.000,00): confira os fechamentos seguintes." e "1 tarefa(s) com % acima do fechamento seguinte." A retificação é gravada (não bloqueia) | `fechamentos.test.ts` |

### 4.4 Curva S (pura, calendário seg–sex 08–12 e 13–17 **sem feriados**, montado no teste)
| Caso | Entrada | Esperado | Teste que fixa |
|---|---|---|---|
| CS-1 (SPEC §5) | Tarefa A: BAC 100.000; LB0 2026-01-05 → 2026-01-30 (20 d.u.); início real 2026-01-05; status 2026-01-23 (pct 60, custo 66.000). Fechamentos F1 2026-01-09 (EV 20.000 / AC 22.000), F2 2026-01-16 (45.000 / 47.000), F3 2026-01-23 (60.000 / 66.000) | 4 pontos, na ordem: "09/01 ◆" PV **25.000** / EV **20.000** / AC **22.000**; "16/01 ◆" **50.000** / **45.000** / **47.000**; "jan/26 ●" (= F3) **75.000** / **60.000** / **66.000**, todos com `origem: 'fechamento'` e EV/AC com `toBe`; "fev/26" PV **100.000**, EV e AC `null` | `evm.test.ts` › "Curva S de fechamentos" |
| CS-2 (interpolação) | Tarefa A: BAC 200.000; LB0 2026-01-05 → 2026-02-27 (40 d.u.); F1 2026-01-23 (EV 50.000 / AC 52.000); F2 = status 2026-02-06 (80.000 / 86.000) | "23/01 ◆" PV **75.000** / **50.000** / **52.000**. "jan/26" (fim de mês entre F1 e F2, 5 de 10 d.u.): PV **100.000**, EV **65.000,00** e AC **69.000,00**, com `origem: 'interpolado'`. "fev/26 ●" PV **125.000** / **80.000** / **86.000**. Com o gate G3 em dias corridos (8/14), EV 67.142,857143 e AC 71.428,571429. **Exatamente 3 pontos** (E-11): a curva termina em "fev/26 ●" e não mostra os 200.000 da LB, que termina em 27/02, porque no mês da data de status não há ponto de fim de mês. É comportamento da base (C-1): não corrigir de passagem | `evm.test.ts` › "interpolação entre fechamentos" |
| CS-3 (continuidade) | Aurora: fechar em 2026-10-23 | Todos os pontos mensais com PV/EV/AC **iguais à C-1**; mai–set com `origem: 'reconstruido'`, "out/26 ●" com `origem: 'fechamento'` | `useProjectStore.fechamentos.test.ts` |
| CS-3b (passado parado) | CS-3, depois status 2026-10-30, 104 → 60% e fechar | Mai–set **continuam iguais à C-1** (âncora no 1º fechamento). Na base, sem fechamentos, esses meses mudariam com o novo avanço (registrar o antes e o depois) | idem |
| CS-4 (*fallback*) | Aurora sem fechamentos | Igual à C-1, ponto a ponto, com `origem: 'reconstruido'` e o aviso | `evm.caracterizacao.test.ts` (inalterado) + `evm.test.ts` |
| CS-5 | FE-3 aplicado; mais um cabeçalho adulterado (`totais.ev = "x"`) | "out/26 ●" com EV **6.456.600,00** e AC **6.899.900,00** (retificação efetiva). Adulterado fora da curva, com aviso | `useProjectStore.fechamentos.test.ts` |
| CS-6 | LB1 do valor agregado e FE-1 fechado com a LB0 | PV dos pontos pela LB1; o ponto "out/26 ●" com `linhaBaseFechamento: 0` e a nota "fechado contra a LB0 de dd/mm/aaaa" | idem |

### 4.5 Tendência, comparação e exportação
| Caso | Entrada | Esperado | Teste que fixa |
|---|---|---|---|
| TE-1 | FE-1 e mais um fechamento sintético F2 (2026-10-30: PV 7.600.000, EV 6.800.000, AC 7.250.000, entrega 2027-06-25, atraso 18) e F0 com PV 0 | Série: [23/10: SPI 0,888274, CPI 0,934942, 2027-06-23, 16]; [30/10: SPI **0,894737**, CPI **0,937931**, 2027-06-25, 18]. O F0 entra na entrega e fica fora de SPI/CPI | `fechamentos.test.ts` › "série dos fechamentos" |
| DF-1 | Fa 2026-10-23: A (uid 1; 20%; custo 10.000; BAC 50.000; término 2026-11-05), B (uid 2; 0%; BAC 80.000; término 2026-11-05), C (uid 3; 100%; 30.000; BAC 30.000), E (uid 5; 0%; BAC 10.000). Fb 2026-10-30: A 50% e custo 25.000; B término 2026-11-10; C igual; D (uid 4; **0%; custo 0; BAC 20.000**; término 2026-11-20) nova; E ausente | Avançaram: A (+30 p.p.; ΔEV **+15.000**). Atrasaram: B (**+3 d.u.**: 06, 09 e 10/11/2026; mesma regra do `workingVariance`). Custo: A (ΔAC **+15.000**). Novas: D. Removidas: E. Inalteradas: C. Totais: EV 40.000 → **55.000**, AC 40.000 → **55.000** e BAC 170.000 → **180.000** (E-10) | `comparacaoFechamentos.test.ts` |
| EX-1 | Aurora com FE-1 e FE-3 | JSON com `formato` e `versao`, 2 fechamentos (cabeçalho e 20 tarefas cada) e as LBs. `JSON.parse` do arquivo devolve exatamente os registros gravados. Nome `Edificio_Residencial_Aurora_12_Pavimentos_historico_2026-10-23.json` | `exportacaoHistorico.test.ts` |

**Bordas cobertas:** marco (duração 0, BAC 0); tarefa concluída e iniciada; fechamento num fim de mês; fechamento na data de status; data de status posterior ao último fechamento; obra sem tarefas (fechar recusado); PV zero (FE-7); LB incompleta (LB-4); retificação de retificação (aponta para a raiz; efetivo = maior `sequencia`); tarefa removida depois do fechamento (reconstrução no calendário padrão); importar `.xml` numa obra com fechamentos.

**Efeito em quem consome os números:**
- Com LB0 e sem fechamentos: nada.
- Com fechamentos: a Curva S, o detalhe do mês e a tendência no EVM.
- Com outra LB do valor agregado: KPIs do EVM (PV, EV, BAC, SV, CV, SPI, CPI, EAC, VAC, TCPI), Curva S, EVM por pacote, tendência, previsão por SPI e as frases de valor agregado do diagnóstico, rotulados "LB do valor agregado: LBn". **Não mudam** (emenda 01, G5 = b): atraso no Caminho Crítico, cenários (meta de recuperação), DLP (deslocamento da frente), barra de LB do Gantt, coluna de LB da EAP e variação de término, que continuam contra a LB0.

## 05. MS Project e arquivos (T3)
- **Arquivos de exemplo:**
  - o seed (Aurora), com LB1 e LB3 salvas no teste;
  - um XML fictício montado no teste (`mspdi-linhas-base.xml`, novo fixture) com LB0 completa, LB1 só com custo, LB2 só com duração, LB3 só com início, `Interim` 1 na LB4, `Number` 11, `Number` 2 repetido e `Work` na LB5;
  - o corpus local (`CRONOAI_REF_DIR`, fora do git), com os 7 arquivos `task-baselines`.
- **Import:**
  - Para cada `<Baseline>` da tarefa: `Number` ausente vale 0 (regra de hoje). De 1 a 10, grava em `linhasBase[n]` os campos **presentes**: `Start`/`Finish` (só a data, pelo `dataSegura`), `Duration` (pelo `minutosDe`, só se o elemento existir) e `Cost`.
  - Ignorados, com aviso: `Number` fora de 0–10 ou repetido na tarefa (vale o primeiro); `Interim` = 1 (não é LB, pergunta 4 da tarefa 0).
  - `Work` (de 0 a 10) e `EstimatedDuration` não têm onde morar. `Work` entra no aviso único "Não importado do MS Project: …", com a contagem. `EstimatedDuration` fica como hoje na LB0, sem aviso.
  - LB0: **sem mudança**.
  - `state.linhasBase` ganha `{ numero, nome: 'Linha de base N (importada do MS Project)', motivo: 'Importada do arquivo', origem: 'arquivo' }` para cada número com algum dado.
  - `BaselineForEarnedValue` de 1 a 10 vira `meta.linhaBaseAtiva` se a LB existir. Senão, vale 0, com o aviso "O arquivo indica a linha de base N para o valor agregado, mas ela não veio no arquivo: o CronoAI usa a linha de base 0."
- **Aviso removido:** "Linhas de base 1 a 10 não importadas em N tarefa(s)…" (`:1106`).
- **Aviso novo (Inviolável 2, achado do arquiteto):** hoje, a LB0 do arquivo **sem nenhuma data** (só custo, duração ou trabalho) é trocada pela LB0 calculada pelo `baselineFor(…, onlyMissing)` (`cpm.ts:458`), sem aviso. O comportamento fica, e entra o aviso "N tarefa(s) com linha de base 0 sem datas no arquivo (só custo, duração ou trabalho): o CronoAI calculou as datas da linha de base 0 delas." Corpus: 25 tarefas em 7 arquivos (medição do arquiteto; confirmar na tarefa 12).
- **Export:**
  - Para cada tarefa, `<Baseline>` em ordem crescente de `Number`: a 0 exatamente como hoje (`:341-349`, intocada); de 1 a 10, só as existentes, com `Number`, `Start` (08:00, ou 17:00 no marco, como a LB0), `Finish` (17:00), `Duration` + `DurationFormat` 7 **se `duracaoMin` existir** e `Cost` se existir, na ordem do `SCHEMA_ORDER.Baseline` (`:91`).
  - Resumo: *rollup* das LBn das folhas (`rollupLinhaBase`), como a LB0 (`:277-278`), **com a duração** do resumo (E-6). A LB0 do resumo continua saindo com `Duration` 0 (`:345`), para não quebrar a C-4: dívida registrada.
  - Avisos da exportação (E-12, pergunta 10), quando a obra tem LB vinda do arquivo: "As datas das linhas de base vão com o horário padrão (08:00 e 17:00)." e "O trabalho (Work) das linhas de base não volta ao .xml." Preservar o `Work` como valor opaco (LB0–10) fica para o ciclo 00010.
  - `BaselineForEarnedValue` só quando `meta.linhaBaseAtiva` ≥ 1. Por isso o seed (só a LB0, sem LB ativa) exporta **igual à base** (C-4, M-3).
- **Elementos novos no `SCHEMA_ORDER`:** nenhum (`Baseline` repetido e `BaselineForEarnedValue` já constam).
- **Não volta do MSPDI:** nome, motivo, autor e data de gravação das LBs (o esquema não tem esses campos; a tarefa 0 confirmou: o corpus só tem `LastSaved`, a data do arquivo), a hora das datas da LB (D-4) e o trabalho. Reimportar o próprio `.xml` traz as LBs com o nome "(importada do MS Project)". Os metadados viajam no JSON do histórico (D-34).
- **Planos provisórios** (Início1–10/Término1–10) chegam por `ExtendedAttribute`, e não por `<Baseline>` (tarefa 0, pergunta 4): ficam no aviso de campos personalizados (00010).
- **Comportamento esperado no MS Project:** "Linha de base 1…10" preenchidas nas colunas Início/Término/Duração/Custo da LB n; "Calcular o valor agregado usando a linha de base n" quando houver LB ativa. **`M-4` `NOT_RUN`**: sem acesso ao MS Project real.

## 06. Estado salvo (T4) — esquema 5 → 6 e estrutura 2 → 3
- **Passo `{ de: 5, para: 6 }`** em `src/lib/migracaoEstado.ts`, com `ESQUEMA_ATUAL = 6` (emenda 02: o 00006 ficou com o 4 → 5). Puro e determinístico:
  - `linhasBase`: se alguma folha tem `baselineStart` ou `baselineFinish`, vira `[{ numero: 0, nome: 'Linha de base 0', motivo: 'Linha de base salva antes do ciclo 00007 (migrada)', origem: 'migrada' }]`; senão, `[]`;
  - tarefas, `meta`, `undo`, calendários, premissas, feriados e recorte da 00006: **sem nenhuma mudança** (`toEqual`). Nenhum número muda.
- **`completarChaves` (esquema ≥ 6):**
  - `linhasBase` ausente ou inválida é refeita pela regra acima, com aviso;
  - `sanearLinhasBase` descarta a entrada `linhasBase[n]` inválida de uma tarefa (n fora de 1–10, data não ISO, `duracaoMin` não inteira ou fora de 0 a 50 anos, custo não finito ou negativo), com o aviso "N linha(s) de base inválida(s) descartada(s) do estado salvo.";
  - `meta.linhaBaseAtiva` inválida (não inteira, fora de 1–10 ou de uma LB inexistente) é removida, com aviso;
  - `eEstado` passa a exigir `Array.isArray(linhasBase)`.
- **Por que um passo, e não só campo opcional** (o precedente do 00004 dispensa passo para campo aditivo): `linhasBase` é chave obrigatória e, com o esquema 6, o app da 00006 (esquema 5) **recusa** a obra em vez de abri-la e gravá-la sem as LB1–10 (proteção do ADR 00002).
- **Seed e obra em branco:**
  - `buildSeedState()` com `linhasBase = [LB0 { origem: 'cronoai', nome: 'Linha de base 0', motivo: 'Linha de base inicial do exemplo' }]`;
  - `estadoObraVazia` com `[]`;
  - `importXml` monta a lista pelo arquivo (seção 05).
- **IndexedDB:** `VERSAO_ESTRUTURA` sobe de 2 (00006) para 3, com as stores `fechamentos` e `fechamentoTarefas` (D-20). O `onupgradeneeded` não toca as stores existentes. Obra, índice e recorte ficam intactos (P-5, E2E).
- **Testes do formato anterior (lição 4):** P-1 a P-7 (seção 13). O P-1 usa o **registro real** da C-5, com cenários aplicados e `undo`. Depois da migração:
  - os números do N-1 continuam iguais;
  - desfazer a hora extra e o crashing devolve a entrega da base;
  - o recorte continua vinculado.
- **Rollback:** reverter os 4 commits.
  - O app da 00006 (esquema 5) recusa a obra no esquema 6 e nunca a sobrescreve.
  - Ao abrir a estrutura 3, o app recebe `VersionError` e cai na memória com o aviso "Armazenamento local indisponível" (`armazenamentoObras.ts:198-206`), sem gravar nada. As obras ficam inacessíveis até reaplicar a versão nova.
  - No PR, recomendar exportar o `.xml` e o histórico (JSON) das obras importantes antes de atualizar.

## 07. Dados (T8 com banco)
Não se aplica: sem backend. O modelo da SPEC-01 (`snapshot`, `snapshot_tarefa`, `linha_base`, `linha_base_tarefa`) é a referência para a migração futura. Os campos deste plano batem com ele, salvo a autoria, que na SPEC-02 vira identidade.

## 08. Segurança
| Superfície | Ameaça | Mitigação | Teste |
|---|---|---|---|
| Textos novos (nome e motivo da LB, autor, observação, motivo da retificação) | XSS ao exibir | Só interpolação, nunca `v-html`. Limites: 60 / 500 / 120 / 500 / 500. Caracteres de controle recusados | **S-1:** `validar-regras.mjs` + teste com `<script>` e com texto acima do limite |
| Leitura do IndexedDB (cabeçalhos, detalhe e LBs no estado) | Estado adulterado quebra a tela, polui o protótipo ou deixa a ação pela metade (lição 6) | Validação que **reconstrói** o objeto (D-24). Limites: `versaoFormato` = 1 (maior → ilegível, nunca sobrescrito); `id` e `obraId` ≤ 64 caracteres; datas ISO válidas; `sequencia` inteira ≥ 1 e única; `linhaBase` 0–10; R$ finitos entre 0 e 1e12; SPI, CPI e EAC finitos ≥ 0 ou `null`; `porPacote` ≤ 500; `quantidadeTarefas` e detalhe ≤ **20.000** tarefas; string do detalhe ≤ **8 MiB** (medida antes do `JSON.parse`); tupla com 12 posições e tipos conferidos (PV finito ≥ 0, E-3); `linhaBaseSalvaEm` data-hora ISO ou ausente; `uid` inteiro único; pct 0–100; `folgaTotalMin` inteiro dentro de ±50 anos em minutos | **S-2:** matriz de recusas (`fechamentos.test.ts`) + P-6 (store) |
| Armazenamento | Sobrescrita do histórico | `add` (D-17); nenhuma ação de edição | **S-3:** FE-4 |
| Parser | Regressão no endurecimento (DOCTYPE/ENTITY, `MAX_MSPDI_CHARS`); laço com muitos `<Baseline>` | Só a leitura das LBs; no máximo 11 por tarefa (as demais ignoradas, com aviso); textos do arquivo fora dos avisos (só números) | **S-4:** testes de segurança do parser inalterados e verdes; XML com 50 `<Baseline>` numa tarefa |
| Exportação JSON | Vazamento de dado pessoal | Só dados da obra; o autor é texto declarado, opcional. Nenhum envio pela rede | **S-5:** revisão; teste do conteúdo exportado |
| Dependências e fixtures | Pacote novo; dado real | Nenhum pacote. Fixtures fictícias (Aurora e XML montado à mão). O corpus fica fora do git | **S-6:** `auditar-dependencias.mjs` |

Referência (boa prática): [OWASP Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html), a mesma da 00006. Validação com a **Segurança da Informação**: não exigida (sem superfície nova em produção). O `seguranca` confere de S-1 a S-6.

## 09. Entregáveis
| # | Entregável | Fronteira | PLANO §3.7 | Critérios | Commit |
|---|---|---|---|---|---|
| E1 | Linhas de base no estado e no cálculo | `linhasBase.ts`, tipos, migração 5 → 6, projeção e separação agenda × valor agregado na store, salvar/selecionar LB, telas da LB | parte do E3 + T4 | AC-1, AC-2, AC-3, AC-4 | `feat(linhas-base): LB0 a LB10 por obra, LB do valor agregado no PV, EV e BAC e migração 5 → 6 (ciclo 00007)` |
| E2 | LB0–LB10 no MSPDI | parser (import, export, avisos), corpus, integração `importXml`/`exportXml` | E3 | AC-5, AC-6 | `feat(mspdi): linhas de base 1 a 10 e BaselineForEarnedValue na ida e volta (ciclo 00007)` |
| E3 | Fechamento e retificação | `fechamentos.ts`, tipos, estrutura 3 do IndexedDB, store, telas de fechar/retificar, regra da data de status, `persist()` | E1 | AC-7, AC-8, AC-9, AC-14 (RNF-04.1), AC-15, AC-17 | `feat(fechamentos): fechamento imutável da data de status e retificação com motivo (ciclo 00007)` |
| E4 | Curva S de fechamentos, tendência, comparação e exportação | `computeSCurve`, `serieDosFechamentos`, `compararFechamentos`, `exportacaoHistorico.ts`, gráfico tracejado, telas, documentação | E2 + E4 | AC-10, AC-11, AC-12, AC-13, AC-16 | `feat(evm): Curva S e tendência pelos fechamentos, comparação e exportação do histórico (ciclo 00007)` |

São 29 tarefas e cerca de 46 arquivos. Cada entregável passa no `npm run ci` sozinho. O corpus e o desempenho estrito rodam só localmente.

## 10. Tarefas

### 10.1 Tarefa 0 — `especialista-obra` (antes da implementação)
Roda **logo depois do gate e antes da tarefa 2**. A tarefa 1 só mede a base e pode correr em paralelo. O parecer vai, **separado**, para `scratchpad\planos\00007-tarefa0-especialista.md`, com `VEREDITO`, `CALCULOS` e `PENDENCIAS`. Divergência com o plano vira **emenda** (seção 17), decidida pelo orquestrador antes da tarefa 2. Perguntas:
1. **Semântica de linha de base no MS Project:** quais campos "Definir linha de base" copia (início, término, duração, trabalho, custo, distribuição no tempo)? "Baseline" = LB0 e "Baseline1…10" = LB1–10? Sobrescrever uma LB existente: o MS Project avisa e permite? Como funciona o *rollup* para as tarefas-resumo ("para todas as tarefas-resumo" × "das subtarefas para a resumo selecionada")? A data em que a LB foi salva fica no XML (MSPDI)? Em qual elemento?
2. **`BaselineForEarnedValue`:** afeta só os campos de valor agregado (BCWS, BCWP, SV, SPI…) ou também as variações de início e término? Confirmar o conflito com o RF-04.5 (gate G5).
3. **BCWS/BCWP contra a LB n:** usa o custo da LB n? Tarefa sem LB n, ou com LB n sem custo, tem BCWS 0 (D-8, LB-4, LB-5, gate G6)?
4. **Interim plans** (Início1–10/Término1–10; o elemento `Interim` dentro de `<Baseline>`): o que são, como aparecem no MSPDI e se ignorá-los com aviso está correto.
5. **O que congelar num fechamento:** a lista da D-10 basta para a rotina de controle? Faltam a duração restante, o trabalho ou o custo previsto no término por tarefa? SPI/CPI nulos sem divisor (D-11) estão corretos?
6. **Curva S planejada × replanejada:** depois de uma LB nova, a prática mostra só o PV da LB ativa ou as duas? EV e AC passados ficam como gravados (contra a LB da época), com a nota (D-26)?
7. **Interpolação entre fechamentos:** dias úteis do calendário padrão ou dias corridos (gate G3)? A reconstrução ancorada no 1º fechamento (D-28) é aceitável como "pré-histórico"?
8. **Retificação:** o que se corrige na prática (medição, custo, datas previstas)? Retificar depois de avançar a data de status? Cadeia de retificações (D-15)?
9. **Rotina de fechamento:** semanal ou mensal; dois fechamentos na mesma semana; a data de status pode voltar antes do último fechamento (D-13)? E o fechamento com a obra alterada depois, na mesma data (D-14)?
10. **Hora da LB:** o MSPDI grava a hora (09:00 no corpus) e o CronoAI guarda só a data, como já faz na LB0 (D-4). É aceitável?
11. **Trabalho (Work) da LB:** só o aviso basta, já que não há recurso no cálculo?
12. **Números:** conferir FE-1, FE-3, LB-2 a LB-5, CS-1, CS-2, TE-1 e DF-1 (contas desta seção 04) e a regra de dias úteis do DF-1.

### 10.2 Tarefas de implementação
| # | E | Tarefa (critério de pronto) | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 1 | — | **Caracterização na base, antes de qualquer mudança:** de C-1 a C-5 e C-7 em testes verdes na base. C-6 e C-8 rodados localmente e registrados no ciclo. Gera e versiona a fixture do esquema 5 | dev-frontend | `src/lib/evm.caracterizacao.test.ts`, `src/lib/msProjectXmlParser.test.ts` (C-4), `src/lib/__fixtures__/registro-esquema5-aurora-cenarios.json` | gate |
| — | — | **Checkpoint:** caracterização verde na base e parecer da tarefa 0 lido; emenda, se houver | orquestrador | ciclo | 0, 1 |
| 2 | E1 | Tipos: `DadosLinhaBase`, `LinhaBaseInfo`, `Task.linhasBase?`, `ProjectState.linhasBase`, `meta.linhaBaseAtiva?`; compila | dev-frontend | `src/types/domain.ts` | checkpoint |
| 3 | E1 | `linhasBase.ts` (D-5): projeção com `bac` = 0 sem custo na LB n (LB-7, LB-4 completo na função), cópia do cronograma, *rollup* com duração (E-6), saneamento, validação e rótulo, com testes | dev-frontend | `src/lib/linhasBase.ts`, `src/lib/linhasBase.test.ts` | 2 |
| 4 | E1 | Migração 5 → 6, `completarChaves` ≥ 6, `eEstado`. De P-1 a P-4 verdes (P-1 com a fixture real) | dev-frontend | `src/lib/migracaoEstado.ts`, `src/lib/migracaoEstado.test.ts`, `src/lib/obras.ts` (`estadoObraVazia`) | 3 |
| 5 | E1 | Store: `tarefasDoValorAgregado` e `calculoValorAgregado` separados de `calculo` (D-6, D-7). **Só** os derivados de valor agregado sobre a projeção; atraso, variação de término, cenários, DLP, Gantt e EAP com `state.tasks`. **C-1 a C-3 e N-1 a N-3 continuam verdes** | dev-frontend | `src/stores/useProjectStore.ts` | 4 |
| 6 | E1 | Store: `salvarLinhaBase` (substitui `saveBaseline`), `definirLinhaBaseAtiva`, seed com a LB0, `duplicarObra` (D-9), inclusão de escopo na LB do valor agregado (D-35), P-1b. LB-1 a LB-6, testes 64 e 65 | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.linhasBase.test.ts`, `src/stores/useProjectStore.obras.test.ts` | 5 |
| 7 | E1 | Telas: `SalvarLinhaBaseDialog` (número 0–10 com as existentes listadas, nome, motivo, autor pré-preenchido com o responsável, confirmação de sobrescrita), `SeletorLinhaBase` (no EVM, rótulo "LB do valor agregado", com a frase "o atraso e as variações medem contra a LB0, como no MS Project"), aviso da D-8, nota da D-36. Gantt e coluna da EAP **continuam na LB0** (sem mudança) | dev-frontend | `src/modules/wbs/SalvarLinhaBaseDialog.vue`, `src/components/common/SeletorLinhaBase.vue`, `src/modules/WbsModule.vue`, `src/modules/EvmModule.vue` | 6 |
| 8 | E1 | E2E: salvar a LB1, trocar a LB do valor agregado, ver PV e SPI mudarem e voltarem, e o atraso continuar em +16 d.u.; KPIs do Aurora inalterados com LB0 | dev-frontend | `e2e/linhas-base.spec.ts` | 7 |
| — | E1 | **Checkpoint:** C-1 a C-5 sem alteração; arquivos tocados conferidos contra o plano | orquestrador | — | 8 |
| 9 | E2 | Parser, import: LB1–10 por campo presente, `Interim`, `Number` inválido ou repetido, `Work`, `BaselineForEarnedValue`, aviso novo da LB0 sem datas, aviso antigo removido. MS-3 a MS-6 | dev-frontend | `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts`, `src/lib/__fixtures__/mspdi-linhas-base.xml` | E1 |
| 10 | E2 | Parser, export: `<Baseline>` 1–10 na ordem, resumo por *rollup* com duração (E-6), `BaselineForEarnedValue` só com LB do valor agregado ≥ 1, avisos de horário e de trabalho (E-12). MS-1, MS-2, teste 68; **C-4 verde (M-3)** | dev-frontend | `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts` | 9 |
| 11 | E2 | Store: `importXml` (LBs, metadados, LB ativa do arquivo, D-13 com fechamentos), `exportXml` (avisa que nomes e motivos das LBs não vão ao `.xml`) | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.linhasBase.test.ts` | 10 |
| 12 | E2 | Corpus local: inventário novo (aviso 470 → 0; 400 tarefas com LB1–10 lidas: custo 70, duração 110, início 110, término 110; `Work` 77 em 7 arquivos; LB0 sem datas 25 em 7), ida e volta 95/95 comparando as LB1–10 das folhas (data, minutos, custo). Antes e depois no relatório | dev-frontend | `src/lib/msProjectXmlParser.corpus.test.ts` | 10 |
| 13 | E3 | Tipos do fechamento, `fechamentos.ts`: `capturarFechamento` (D-10, D-11), `retificar` (D-15) com os avisos da E-5 (FE-9), PV por tarefa e `linhaBaseSalvaEm` (E-3), `efetivos`, `validarCabecalho`/`validarDetalhe` (D-24), regras (D-12, D-13, D-18), tuplas (D-23), `serieDosFechamentos` (D-32). FE-1, FE-3, FE-5 a FE-7 na função, TE-1, S-2 | dev-frontend | `src/types/fechamento.ts`, `src/lib/fechamentos.ts`, `src/lib/fechamentos.test.ts` | E1 |
| 14 | E3 | Armazenamento: estrutura 3, stores, `add`, leitura por índice, exclusão com a obra, `persistir()`; adaptador de memória igual (`ConstraintError`, `falhar`) | dev-frontend | `src/stores/armazenamentoObras.ts`, `src/types/obra.ts` | 13 |
| 15 | E3 | Store: `fechamentos` (`shallowRef` + `markRaw`), carga e troca, `fecharDataDeStatus` (fila e transação, D-16), `retificarFechamento`, `lerDetalhe`, D-13 em `setStatusDate`/`atualizarDadosObra`, D-14, D-19, avisos da E-8. FE-1 a FE-5, FE-8, P-6, P-7, teste 67 | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.fechamentos.test.ts` | 14 |
| 16 | E3 | **Desempenho (lições 3 e 6):** obra de 3.000 tarefas com 103 fechamentos existentes. Mede o 104º fechamento de ponta a ponta (captura + validação + serialização + gravação na memória + recálculo de `sCurve`, `serieFechamentos` e `evm` lidos juntos), a troca de LB (só os derivados de custo) e a abertura da obra (cabeçalhos + âncora). Tamanho do registro (P-12). CI com teto largo; local com `CRONOAI_PERF=1` | dev-frontend | `src/lib/fechamentos.desempenho.test.ts` | 15 |
| 17 | E3 | Telas: painel "Fechamentos" no EVM (botão "Fechar data de status (23/10/2026)", diálogo com autor, observação, LB e prévia dos totais; lista com tipo, totais, LB e selo "retificado"), `RetificarFechamentoDialog` (tarefas com % e custo editáveis, motivo), faixas da D-14 e de "ilegível", resultado do `persist()`, avisos da E-5 e da E-8 nos diálogos, a frase "Registro gerencial; não substitui a medição contratual." e a nota "fechado contra a LBk de dd/mm/aaaa" na lista | dev-frontend | `src/modules/evm/FechamentosPainel.vue`, `src/modules/evm/FecharDataStatusDialog.vue`, `src/modules/evm/RetificarFechamentoDialog.vue`, `src/modules/EvmModule.vue` | 15 |
| 18 | E3 | E2E: fechar, recarregar, ver o fechamento; retificar com motivo; recusa da data repetida; obra salva na estrutura 2 abre igual na 3 (P-5) | dev-frontend | `e2e/fechamentos.spec.ts` | 17 |
| 19 | E4 | `computeSCurve` reescrita (D-25 a D-30), `pontosMensais`, `monthlyIncrements` sobre os mensais. CS-1, CS-2, CS-4 e a curva por pacote; **C-1 verde** | dev-frontend | `src/lib/evm.ts`, `src/lib/evm.test.ts` | E3 |
| 20 | E4 | `compararFechamentos` (D-33). DF-1 | dev-frontend | `src/lib/comparacaoFechamentos.ts`, `src/lib/comparacaoFechamentos.test.ts` | E3 |
| 21 | E4 | Exportação do histórico (D-34). EX-1 | dev-frontend | `src/lib/exportacaoHistorico.ts`, `src/lib/exportacaoHistorico.test.ts` | E3 |
| 22 | E4 | Store: `sCurve`/`sCurveFor` com o histórico e a âncora, `serieFechamentos`, `compararFechamentosPorId`, `exportarHistorico`. CS-3, CS-3b, CS-5, CS-6 | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.fechamentos.test.ts` | 19, 20, 21 |
| 23 | E4 | Gráfico: trecho interpolado com traço pontilhado curto, diferente da tendência (E-9), marcador do fechamento, legenda; tabela alternativa com a coluna "Origem"; aviso de reconstruído; `pontoSelecionado` no lugar do "snapshot" local | dev-frontend | `src/components/charts/SCurveChart.vue`, `src/modules/EvmModule.vue` | 22 |
| 24 | E4 | Tendência e entrega: `IndexTrendChart` com a série dos fechamentos, `EntregaChart` novo (justificativa: nenhum gráfico de datas existe) com tabela; painel "Comparar fechamentos" (dois seletores, tabela por categoria, totais); botão "Exportar histórico (JSON)"; nota "índices dos fechamentos calculados contra a linha de base vigente em cada fechamento" (E-9) | dev-frontend | `src/components/charts/EntregaChart.vue`, `src/modules/evm/TendenciaFechamentos.vue`, `src/modules/evm/CompararFechamentos.vue`, `src/modules/evm/FechamentosPainel.vue` | 23 |
| 25 | E4 | E2E: 3 fechamentos com avanços diferentes, e a tabela da Curva S mostra os EV/AC gravados nos pontos ◆; trecho pontilhado presente; comparação; download do JSON | dev-frontend | `e2e/fechamentos.spec.ts` | 24 |
| 26 | E4 | Conferência dos E2E existentes (`fluxos`, `obras`, `navegacao`, `cronograma`) com os números da base | dev-frontend | `e2e/*.spec.ts` (só se o texto do botão "Salvar linha de base" mudar) | 25 |
| 27 | E4 | Evidências do orquestrador: exportação do seed antes × depois (diff vazio com datas normalizadas, M-3), corpus local (M-6), desempenho local (AC-14) e telas (V-1 a V-5) | orquestrador | ciclo | 26 |
| 28 | E4 | Documentação: `CLAUDE.md` (mapa com `linhasBase.ts`, `fechamentos.ts`, `comparacaoFechamentos.ts`, `exportacaoHistorico.ts`; dívida "Curva S reconstruída linearmente" vira "só para a obra sem fechamentos, e antes do 1º, com aviso"), `calculo-precisao.md` (LB do valor agregado só nos campos de valor agregado e variações na LB0; PV linear como **regra do CronoAI**, D-36; fechamento; interpolação), `msproject-mspdi.md` (LB0–10, `BaselineForEarnedValue`, avisos novos, inventário do corpus, planos provisórios por `ExtendedAttribute`), `divida-conhecida.md` (**custo da LB0 = `bac` vivo**, enquanto as LB1–10 congelam o custo e o MS Project congelaria o da LB0 (E-2); duração da LB = vão em minutos úteis; LB0 do resumo com `Duration` 0; hora da LB; `Work` da LB não preservado; LB0 sem datas recalculada; `persist()` feito), emenda da Estrutura e do Volume do ADR 00002 | dev-frontend | `CLAUDE.md`, `.claude/rules/calculo-precisao.md`, `.claude/rules/msproject-mspdi.md`, `.claude/rules/divida-conhecida.md`, `.claude/adrs/00002-armazenamento-local-fase-1.md` | 27 |

### Grafo de tarefas
```
gate ─┬─ 0 (especialista, parecer separado) ─┐
      └─ 1 (caracterização na BASE) ─────────┴─ [checkpoint + emenda] ─ 2 ─ 3 ─ 4 ─ 5 ─ 6 ─ 7 ─ 8 ─ [checkpoint]   (E1)
E1 ─ 9 ─ 10 ─┬─ 11                                                                                  (E2)
             └─ 12 (local)
E1 ─ 13 ─ 14 ─ 15 ─┬─ 16 (local)                                                                    (E3)
                   └─ 17 ─ 18
E3 ─┬─ 19 ─┐
    ├─ 20 ─┼─ 22 ─ 23 ─ 24 ─ 25 ─ 26 ─ 27 ─ 28                                                      (E4)
    └─ 21 ─┘
```
- **Paralelo possível:**
  - a tarefa 0 com a 1;
  - E2 (9, 10, 12: parser) com a parte pura do E3 (13: `fechamentos.ts`), porque os arquivos são disjuntos;
  - no E4, a 19, a 20 e a 21.
- **Sequencial:** tudo o que toca `useProjectStore.ts` (5, 6, 11, 15, 22) fica com um dev só, em ordem. A 14 depende da interface da 00006 já no tronco.
- **Ordem dos commits:** E1 → E2 → E3 → E4. O E2 pode ir depois do E3, se o corpus atrasar. O E4 exige E1 e E3.

## 11. Testes previstos
| # | Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|---|
| 1 | AC-1 | Curva S do Aurora na base (C-1) | `evm.caracterizacao.test.ts` | ponto a ponto da medição; out/26 = 7.259.250 / 6.448.200 / 6.896.900 |
| 2 | AC-2 | PV e atraso depois de salvar a LB pelo previsto (C-2, C-3) | idem | PV = medição (~6.496.233,42); atraso 0 |
| 3 | AC-1 | Previsão por tarefa na data de status (C-7) | idem | 302 e 104 = medição (~2026-11-05) |
| 4 | AC-5 | Exportação do seed igual à da base (C-4) | `msProjectXmlParser.test.ts` | SHA-256 e comprimento medidos |
| 5 | AC-4 | P-1: registro real do esquema 5 → 6 | `migracaoEstado.test.ts` | `linhasBase` = [LB0 migrada]; o resto `toEqual`; N-1 igual |
| 6 | AC-4 | P-2: v1 → 6 pela cadeia (e o registro real do esquema 4 do 00006 → 6) | idem | abre; números da v1 iguais |
| 7 | AC-4 | P-3: esquema 7 recusado e não sobrescrito | idem | erro "versão mais nova"; registro igual |
| 8 | AC-4 | P-4: esquema 6 com `linhasBase` inválida, LBn malformada, `linhaBaseAtiva` 11 | idem | saneado, com os 3 avisos |
| 9 | AC-4 | P-1b: desfazer HE e crashing depois da migração | `useProjectStore.obras.test.ts` | entrega 2027-06-23; calendário derivado removido |
| 10 | AC-3 | Projeção LB0 = mesmo array (LB-7) | `linhasBase.test.ts` | `toBe` |
| 11 | AC-3 | Projeção LBn: datas, custo, tarefa sem LBn (LB-4, E-2) | idem | BAC 18.993.000,00; EV 6.448.200,00; EAC 20.314.633,80; variante 104: EV 6.381.000,00, CPI 0,925198, BAC 18.945.000,00; aviso |
| 12 | AC-2 | Cópia do cronograma para a LB n | idem | início, término, duração e custo de cada folha |
| 13 | AC-4 | `sanearLinhasBase` | idem | entradas inválidas descartadas e contadas |
| 14 | AC-5 | *Rollup* das LBn no resumo, com duração (E-6) | idem | folhas LB1 05–09/01 e 12–16/01/2026 (sem feriados): início 05/01, término 16/01, soma do custo, duração 10 d.u. × 480 = **4.800 min** |
| 15 | AC-2 | LB-1: salvar a LB1 não altera a LB0 | `useProjectStore.linhasBase.test.ts` | `toEqual` da LB0 |
| 16 | AC-3 | LB-2: PV contra LB0 e LB1 ("regra do CronoAI", D-36) | idem | 7.259.250,00 e a C-2 |
| 17 | AC-3 | LB-3: atraso com a LB1 do valor agregado | idem | **+16 d.u.** (continua contra a LB0) |
| 18 | AC-3 | LB-5: custo congelado da LB2 | idem | EV 6.453.000,00 × 6.448.200,00 |
| 19 | AC-2 | LB-6: sobrescrita exige confirmação; log | idem | recusa; depois aceita e registra |
| 20 | AC-2 | Validação de nome, motivo e autor (S-1) | idem | limites; `<script>` como texto |
| 21 | AC-2 | Duplicar copia as LBs e não os fechamentos (D-9) | `useProjectStore.obras.test.ts` | LBs iguais; 0 fechamentos na cópia |
| 22 | AC-3 | `computeEvm` com tarefas projetadas | `evm.test.ts` | PV e EV de LB-2 e LB-5 |
| 23 | AC-5 | MS-1: export de LB0–10, ordem, `strictOrder` | `msProjectXmlParser.test.ts` | `errors` = []; `Number` 0, 1, 3 em ordem |
| 24 | AC-5 | MS-2: ida e volta das LBs parciais da fixture | idem | campos presentes iguais; ausentes ausentes |
| 25 | AC-5 | MS-3: `BaselineForEarnedValue` na ida e na volta; LB ausente → 0 com aviso | idem | `linhaBaseAtiva` 3; aviso |
| 26 | AC-6 | MS-4: `Interim`, `Number` 11 e `Number` repetido | idem | ignorados, com contagem |
| 27 | AC-6 | MS-5: `Work` no aviso único | idem | "N valor(es) de trabalho…" |
| 28 | AC-6 | MS-6: LB0 sem datas → aviso | idem | contagem |
| 29 | AC-6 | S-4: DOCTYPE, `MAX_MSPDI_CHARS`, 50 `<Baseline>` | idem | inalterados; no máximo 11 lidos |
| 30 | AC-6 | Corpus: inventário novo, ida e volta 95/95 com LB1–10 (M-6) | `msProjectXmlParser.corpus.test.ts` (local) | 470 → 0; 400; 77; 25; 95/95 |
| 31 | AC-5 | `importXml`: LBs, metadados, LB ativa | `useProjectStore.linhasBase.test.ts` | `state.linhasBase` com as importadas |
| 32 | AC-15 | Import com data de status anterior ao último fechamento | `useProjectStore.fechamentos.test.ts` | data de status mantida; aviso |
| 33 | AC-7 | FE-1 (função): totais, tuplas com PV e `linhaBaseSalvaEm` | `fechamentos.test.ts` | números da 4.3; Σ PV das tuplas = 7.259.250,00 |
| 34 | AC-7 | Tuplas: serializar e ler de volta; tamanho | idem | `toEqual`; ≤ 400 mil caracteres para 3.000 tarefas |
| 35 | AC-9 | Matriz de recusas do cabeçalho (S-2) | idem | uma recusa por regra da seção 08 |
| 36 | AC-9 | Matriz de recusas do detalhe; detalhe incoerente com o cabeçalho | idem | ilegível |
| 37 | AC-8 | FE-3 (função): retificação | idem | 6.456.600,00 / 6.899.900,00 / 0,889431 / 0,935753 |
| 38 | AC-8 | Efetivos: cadeia de retificações | idem | maior `sequencia` |
| 39 | AC-7 | FE-6: limites 104 e 52 | idem | recusas |
| 40 | AC-15 | FE-5 (função): regras de data | idem | recusas e aceite |
| 41 | AC-7 | FE-7: SPI/CPI/EAC nulos | idem | `null` |
| 42 | AC-11 | TE-1: série dos fechamentos | idem | 0,894737 / 0,937931; F0 fora de SPI/CPI |
| 43 | AC-7 | FE-4: `add` não sobrescreve | `useProjectStore.fechamentos.test.ts` | `ConstraintError` |
| 44 | AC-7 | FE-1 (ação), na fila | idem | cabeçalho + detalhe gravados; log com 1 entrada |
| 45 | AC-7 | FE-2: falha na transação | idem | nada gravado; estado `toEqual` |
| 46 | AC-8 | FE-3 (ação): original intacto | idem | registro original igual byte a byte |
| 47 | AC-15 | FE-5 (ação): `setStatusDate`/`atualizarDadosObra` | idem | recusas da D-13 |
| 48 | AC-9 | P-6: registros adulterados (formato 2, NaN, detalhe de 9 MiB, `__proto__`) | idem | ignorados; aviso; fechar bloqueado; nada regravado |
| 49 | AC-7 | P-7: excluir a obra apaga os fechamentos; trocar de obra recarrega | idem | 0 registros; lista da outra obra |
| 50 | AC-17 | FE-8: `persist()` no 1º fechamento | idem | 1 chamada; log |
| 51 | AC-14 | RNF-04.1 de ponta a ponta (lição 3) | `fechamentos.desempenho.test.ts` | local < 2.000 ms (mediana de 5); CI < 6.000 ms |
| 52 | AC-14 | Troca de LB só nos derivados de custo | idem | local < 1.000 ms (opinião); sem recálculo do CPM (contagem de chamadas) |
| 53 | AC-14 | Abertura da obra com 104 cabeçalhos + âncora; tamanho do registro (P-12) | idem | medido e registrado |
| 54 | AC-10 | CS-1 | `evm.test.ts` | 25.000 / 20.000 / 22.000 … |
| 55 | AC-10 | CS-2 (exatamente 3 pontos) | idem | 65.000,00 / 69.000,00 (G3 = a) |
| 56 | AC-10 | CS-4: sem fechamentos = C-1, com aviso | idem | igual à C-1 |
| 57 | AC-10 | Curva por pacote (D-30) | idem | EV/AC do `porPacote` |
| 58 | AC-10 | CS-3 e CS-3b (continuidade; passado parado) | `useProjectStore.fechamentos.test.ts` | igual à C-1; mai–set inalterados |
| 59 | AC-10 | CS-5 e CS-6 | idem | 6.456.600,00 / 6.899.900,00; `linhaBaseFechamento` 0 |
| 60 | AC-12 | DF-1 (com D explícita) | `comparacaoFechamentos.test.ts` | categorias; +15.000 / +3 d.u.; EV e AC 55.000; BAC 180.000 |
| 61 | AC-13 | EX-1 | `exportacaoHistorico.test.ts` | ida pelo `JSON.parse` igual |
| 62 | AC-2, AC-3 | E2E das linhas de base | `e2e/linhas-base.spec.ts` | KPIs do Aurora com LB0; PV/SPI mudam com a LB1; atraso continua +16 |
| 63 | AC-7 a AC-13 | E2E dos fechamentos (P-5 incluído) | `e2e/fechamentos.spec.ts` | ◆ com EV/AC gravados; pontilhado; estrutura 2 → 3 |
| 64 | AC-3 | R-6: a LB do valor agregado não muda atraso, variação de término, cenários, DLP, Gantt e EAP (E-1) | `useProjectStore.linhasBase.test.ts` | com a LB1: atraso 16; crashing 3 d.u. e R$ 12.616,80; DLP do `m-concreto` e `finishVarianceDays` iguais aos da LB0 |
| 65 | AC-2 | Inclusão de escopo com a LB1 do valor agregado (D-35, E-7) | idem | tarefa nova com `linhasBase['1']` = as datas da LB0 dela e custo = bac; log |
| 66 | AC-8 | FE-9: avisos da retificação (E-5) | `fechamentos.test.ts` | EV 6.507.000,00 > 6.500.000,00; 1 tarefa com % acima; gravada |
| 67 | AC-7 | Avisos ao fechar (E-8) | `useProjectStore.fechamentos.test.ts` | Aurora: 4 relatos pendentes; data de status futura com `vi.setSystemTime`; fechamento gravado |
| 68 | AC-5 | Avisos da exportação (E-12) | `useProjectStore.linhasBase.test.ts` | com LB do arquivo: os 2 avisos; seed: nenhum aviso novo |

**68 testes previstos** (emenda 01: eram 63): 66 Vitest, dos quais 4 rodam só localmente (corpus e desempenho), e 2 E2E novos. Mais a suíte existente inalterada (R-5).

## 12. Critérios de aceite e escopo fechado
- **AC-1:** sem nenhum fechamento e com a LB0 ativa, nenhum número muda: Curva S ponto a ponto, EVM, atraso, cenários, DLP e a exportação do seed (C-1, C-4, C-7, N-1 a N-3).
- **AC-2:** salvar a LB n (0 a 10) com nome, motivo, autor (declarado) e data. Salvar a LB1 não altera a LB0. Sobrescrever exige confirmação e motivo e fica no log. A tarefa incluída com a LB do valor agregado ≠ 0 ganha também essa LB (LB-1, LB-6, D-35).
- **AC-3:** a LB do valor agregado vale para PV, EV, BAC, SPI, CPI, EAC, a Curva S e a previsão pelo SPI, com o custo gravado na LB (G6 = a). O atraso e as variações medem contra a LB0, como no MS Project (G5 = b). Tarefa sem custo na LB n tem BAC, PV e EV zero, e o AC conta, com aviso. Voltar à LB0 restabelece os números da base (LB-2 a LB-5, LB-7, R-6).
- **AC-4:** toda obra salva (v1, esquemas 2 a 5) abre no esquema 6 com os mesmos números; o `undo` funciona; o esquema 7 é recusado sem sobrescrita; o estado adulterado é saneado com aviso (P-1 a P-4, com o registro real do esquema 4).
- **AC-5:** o MSPDI exportado contém todas as LBs gravadas (`<Baseline><Number>n</Number>`, em ordem, só com os campos presentes) (o resumo com a duração do *rollup*) e o `BaselineForEarnedValue` da LB do valor agregado; avisa que horário e trabalho das LBs do arquivo não voltam; `validateMspdi(…, { strictOrder: true })` sem erros; a ida e volta preserva as LBs 0–10; a exportação do seed fica igual à da base (MS-1 a MS-3, M-3).
- **AC-6:** o import lê as LB1–10 (o aviso antigo some), avisa o que não preserva (`Interim`, `Number` inválido, `Work`, LB0 sem datas) e não regride no corpus (inventário novo registrado, ida e volta 95/95) (MS-4 a MS-6, M-6).
- **AC-7:** "Fechar data de status" grava um fechamento imutável com os campos do RF-04.1, da D-10 e da D-11, numa transação: a falha não grava nada nem deixa log. O cabeçalho guarda a data da LB usada e cada tarefa o PV. A data precisa ser posterior à do último fechamento. Relatos pendentes e data futura geram aviso sem bloquear. Limites de 104 e 52 (FE-1, FE-2, FE-4, FE-6, FE-7).
- **AC-8:** a retificação preserva o original, exige motivo, aponta para a raiz e passa a ser a efetiva daquela data. Avisa, sem bloquear, quando fica incoerente com o fechamento seguinte (FE-3, FE-9).
- **AC-9:** registros de fechamento adulterados, maiores que o limite ou de formato mais novo são ignorados com aviso e nunca regravados. A obra abre, e o novo fechamento fica bloqueado até resolver (P-6, S-2).
- **AC-10:** a Curva S mostra **exatamente** o EV/AC gravado em cada fechamento. Entre fechamentos, a interpolação aparece com traço próprio, diferente da tendência. Antes do 1º fechamento, há a reconstrução ancorada; sem fechamentos, o *fallback* de hoje com aviso. A curva por pacote vem do `porPacote` (CS-1 a CS-6).
- **AC-11:** a tendência de SPI/CPI e a evolução da data de entrega vêm dos fechamentos, sem os nulos (TE-1).
- **AC-12:** a comparação entre dois fechamentos lista as tarefas que avançaram, atrasaram ou adiantaram, mudaram de custo, entraram ou saíram, mais os Δ dos totais (DF-1).
- **AC-13:** o histórico da obra é exportado em JSON com as LBs e todos os fechamentos (EX-1).
- **AC-14:** desempenho medido lendo tudo o que a tela recalcula. Fechamento de 3.000 tarefas de ponta a ponta em menos de 2 s (RNF-04.1, local). Troca de LB sem refazer o CPM. Abertura com 104 fechamentos e tamanho do registro medidos.
- **AC-15:** a data de status não volta antes do último fechamento, e a data de início não passa do 1º. O import mantém a data de status nesse caso, com aviso (FE-5).
- **AC-16:** `CLAUDE.md`, as regras e o ADR 00002 atualizados (tarefa 28).
- **AC-17:** pedido de armazenamento persistente no 1º fechamento, com o resultado visível e sem bloquear (FE-8).

**Dentro do escopo:** as tarefas 0 a 28 da seção 10, e só os arquivos listados nelas.

**Fora do escopo:**
- RF-04.7 (fechamento automático) e RF-04.8 (`TimephasedData`, histórico retroativo do arquivo).
- RF-14.9 (histórico do portfólio).
- Importar o JSON do histórico. Excluir, arquivar ou rotacionar fechamentos. Excluir ou "limpar" uma LB.
- *Interim plans* (Início1–10/Término1–10); `Work` e hora das datas da LB; LB de recurso e de atribuição (`Assignment/Baseline`); `BCWS`/`BCWP` no XML.
- Recalcular a previsão (datas, folgas) numa retificação.
- Série de PV da LB0 como referência quando a LB do valor agregado ≠ 0 (E-9: opcional; pendência de Planejamento/Controle).
- Seletor separado "comparar variações com: LB0 | LBn" (forma compatível com o MS Project de medir o atraso contra a LB replanejada; pendência de Planejamento/Controle).
- Corrigir a duração da LB gravada como vão, a `Duration` 0 da LB0 do resumo, o custo vivo da LB0 e preservar o `Work` (dívidas registradas; `Work` no 00010).
- Retificar datas reais (pendência de Planejamento/Controle).
- Métodos de EV, PV por pacote e limiares (00008); `safeDiv` e `progressPatch` (00008): o fechamento só não congela o *fallback* (D-11).
- Identidade e trilha de auditoria (SPEC-02); armazenamento no servidor (SPEC-01).
- Mudar o LB0 sem datas do import, que segue calculado (só ganha o aviso).
- `cpm.ts`, `calendarioTrabalho.ts`, cenários, DLP e atraso (continuam na LB0, sem a projeção), CI, Docker e dependências.
- Mapeamento de `ExtendedAttribute` (00010).

## 13. Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 … AC-17 | Seção 12 | Testes da seção 11; `npm run ci` por entregável | sim |
| N-1 | Entrega 2027-06-23, +16 d.u., SPI 0,8883, CPI 0,9349 com LB0 (Inviolável 1) | `useProjectStore.test.ts` (inalterado) | sim |
| N-2 | Aprovar 75% no 104: entrega 2027-06-16 | idem | sim |
| N-3 | Crashing: 3 d.u., R$ 12.616,80, 2027-06-18 | idem | sim |
| N-4 | C-1 a C-5 e C-7 verdes antes da 1ª mudança (lição 2) | commit da tarefa 1 antes do da tarefa 2 + saída no ciclo | sim |
| N-5 | FE-1, FE-3, LB-2 a LB-5, CS-1, CS-2, TE-1 e DF-1 conferidos pelo `especialista-obra` | parecer da tarefa 0 + validação | sim |
| M-1 | Ida e volta do seed com `strictOrder` (Inviolável 2) | `core.test.ts` + `msProjectXmlParser.test.ts` | sim |
| M-2 | Ida e volta com LB0, LB1 e LB3 salvas e LBs parciais | testes 23 e 24 | sim |
| M-3 | Exportação do seed igual à da base, byte a byte, com datas normalizadas (lição 5) | teste 4 (hash) + diff do orquestrador (tarefa 27) | sim |
| M-4 | `.xml` com LB1–LB3 e `BaselineForEarnedValue` abre no MS Project real; paridade de G5, G6, `Interim`, *rollup*, sobrescrita e SPI ≈ 1,00 depois de salvar a LB (D-36) | conferência manual | não (`NOT_RUN` esperado) |
| M-5 | `validateMspdi` com `strictOrder` em toda exportação dos testes | testes 23 a 25 | sim |
| M-6 | Corpus local: inventário novo, sem perda de UID, vínculo, %, datas reais, LB0; ida e volta 95/95 com LB1–10 (lição 5) | `msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` | sim |
| P-1 | Registro real do esquema 5 (C-5) → 6 | teste 5 | sim |
| P-1b | `undo` depois da migração | teste 9 | sim |
| P-2 | v1 → 6; registro real do esquema 4 (00006) → 6 | teste 6 | sim |
| P-3 | Esquema 7 recusado e não sobrescrito | teste 7 | sim |
| P-4 | Esquema 6 adulterado saneado | teste 8 | sim |
| P-5 | Estrutura 2 → 3: obra, índice e recorte intactos | E2E (teste 63) | sim |
| P-6 | Fechamentos adulterados ignorados, sem regravar | teste 48 | sim |
| P-7 | Excluir e trocar obra com fechamentos | teste 49 | sim |
| P-8 | Rollback: o app da 00006 cai na memória sem gravar | argumento (`armazenamentoObras.ts:198-206`) | não |
| P-10 | RNF-04.1 < 2 s local (mediana de 5) | teste 51 | sim |
| P-11 | Troca de LB sem CPM | teste 52 | sim |
| P-12 | Tamanho do fechamento e da obra com 11 LBs (3.000 tarefas); emenda do volume do ADR | teste 53 | não |
| R-1 | `src/lib` puro | `validar-regras.mjs` + revisão | sim |
| R-2 | Nenhum `put` nas stores de fechamento | revisão + FE-4 | sim |
| R-3 | Ações e gravação usam `state.tasks`, nunca a projeção | revisão do `arquiteto` | sim |
| R-6 | Atraso, variação de término, cenários, DLP, Gantt e EAP com `state.tasks` (LB0), nunca a projeção (G5 = b) | teste 64 + revisão | sim |
| R-4 | Cobertura ≥ 80% nas 4 métricas | `npm run test:coverage` | sim |
| R-5 | E2E existentes com os números da base | `npm run e2e` | sim |
| S-1 … S-6 | Seção 08 | testes e revisão | sim |
| V-1 | Diálogo de salvar LB e seletor da LB do valor agregado (rótulos, frase das variações, confirmação) | `npm run dev` | não |
| V-2 | Fechar e retificar (prévia, faixas, selo "retificado") | `npm run dev` | não |
| V-3 | Curva S com ◆, trecho pontilhado distinto da tendência, legenda e tabela "Origem", nos temas claro e escuro | `npm run dev`, captura | não |
| V-4 | Tendência, entrega e comparação | `npm run dev` | não |
| V-5 | JSON exportado aberto num editor | conferência manual | não |

## 14. Validadores e outras áreas
**Validadores** (em paralelo, por entregável ou no lote final):
- `testes`: executa a suíte, o corpus e o desempenho local, e fecha a matriz.
- `arquiteto` (revisão): aderência, camadas, R-2 e R-3, escopo fechado e o desvio do ADR.
- `especialista-obra`: tarefa 0 e conferência de PV/EV contra a LB, retificação, interpolação e o MSPDI das LBs.
- `seguranca`: de S-1 a S-6, a leitura do IndexedDB e o parser.
- **Auditoria independente:** `revisor` em `MODO: AUDITAR`, com o pedido, o diff, a matriz e a evidência bruta.

| Tema | Área | Antes de quê |
|---|---|---|
| Rotina de fechamento (semanal ou mensal; quem fecha; retificação; data de status) | **Planejamento/Controle** | Piloto (SPEC-13); não bloqueia o merge |
| Atualizar o texto do RF-04.5 (G5 = b: LB do valor agregado; variações contra a LB0) | **Planejamento/Controle** (dono da SPEC-04) | Piloto |
| Custo da LB n = `bac` do momento; tarefa sem LB n com BAC, PV e EV zero e AC contando (E-2); inclusão de escopo na LB ativa (E-7); custo vivo da LB0 | **Planejamento/Controle** e **Orçamento/Controladoria** | Piloto |
| Texto "registro gerencial; não substitui a medição contratual" (o fechamento local não tem valor probatório) | **Jurídico** | Piloto |
| Autor como texto livre (nome de pessoa) no fechamento, na LB e no JSON exportado | **Jurídico** (LGPD), junto com a pendência de dados de várias obras no navegador (ADR 00002) | Abrir para clientes |
| Abrir no MS Project real o `.xml` com LB1–LB3 (M-4) | Planejamento (usuário) | Não bloqueia o merge |
| Durabilidade do histórico só no navegador (best-effort) e o limite de 104 | **Infraestrutura** (persistência na SPEC-01) | Uso real (Fase 2) |

## 15. Decisões que exigem gate
O orquestrador decide com a autorização do usuário. Rótulos: **opinião**, **boa prática (link)** ou **exigência**.

**G1 — Onde mora o histórico de fechamentos.** Muda a estrutura do IndexedDB e o ADR 00002.
- **(a) Recomendação:** duas stores, `fechamentos` (cabeçalhos) e `fechamentoTarefas` (detalhe), com chave `id`, índice `obraId`, gravação por `add` e emenda do ADR. *Opinião*, apoiada na *boa prática* do `add` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/add)). Comporta a retificação na mesma data e abre a obra lendo só os cabeçalhos.
- **(b)** Uma store, como o ADR (`[obraId, dataStatus]`). A retificação exigiria outra chave, e abrir a obra leria até ~40 milhões de caracteres.
- **(c)** Cabeçalhos dentro do estado da obra e detalhe numa store. Mais simples de ler, mas o histórico ficaria no estado editável e seria regravado a cada alteração.

**G2 — Modelo das linhas de base e sobrescrita.**
- **(a) Recomendação:** a LB0 nos campos atuais, as LB1–10 num mapa esparso por tarefa e os metadados em `state.linhasBase`; sobrescrever com confirmação, motivo e log. *Opinião*. A sobrescrita imita o MS Project (*a confirmar*, pergunta 1).
- **(b)** Tudo em `linhasBase[0..10]`, com migração da LB0. Refaz 14 consumidores e refixa números.
- **(c)** A como (a), mas LB imutável depois de salva. Esgota as 11 posições.

**G3 — Curva S entre fechamentos e antes do 1º.** Muda os valores exibidos nos pontos que não são de fechamento.
- **(a) Recomendação:** interpolação em **dias úteis** do calendário padrão (CS-2: R$ 65.000,00 / R$ 69.000,00) e reconstrução **ancorada no 1º fechamento** (continuidade, CS-3; passado parado, CS-3b). Exibir a interpolação tracejada é *exigência* (RF-04.3). O método é *opinião*.
- **(b)** Dias corridos (CS-2: R$ 67.142,86 / R$ 71.428,57) e a mesma âncora.
- **(c)** Dias úteis e, antes do 1º fechamento, uma linha reta nos totais desde o 1º início real. Não guarda as datas reais, mas a curva muda ao fechar o 1º fechamento.

**G4 — Limite e o que fazer ao atingi-lo.**
- **(a) Recomendação:** 104 fechamentos (*exigência*, RNF-04.2) mais 52 retificações (*opinião*); ao atingir, recusa com exportação JSON, sem exclusão nem rotação.
- **(b)** 104 no total, contando as retificações. Uma obra com correções frequentes não chega a 2 anos.
- **(c)** Rotação automática do mais antigo. Destrói histórico imutável; não recomendado.

**G5 — Alcance da LB ativa.** Muda atraso, variações, cenários e DLP quando a LB ativa ≠ 0.
- **(a) Recomendação original (antes da tarefa 0; substituída):** PV, EV, SPI **e** todas as comparações com linha de base (atraso, variação de término, previsão por SPI, Gantt, EAP, cenários, DLP), pela projeção única. *Exigência* (RF-04.5: "no PV e nas variações").
- **(b)** Só PV, EV, SPI e Curva S; as variações continuam na LB0. Paridade com o MS Project, *a confirmar* (pergunta 2). Contraria o texto do RF-04.5 e pede a atualização da spec.
- **Decidido: (b)** (emenda 01). A tarefa 0 confirmou o MS Project (alta confiança; M-4).

**G6 — Custo da LB n no PV e no EV.** Muda PV e EV com a LB ≠ 0 quando o BAC mudou depois de salvar a LB.
- **(a) Recomendação:** o custo gravado na LB n (o BAC do momento em que ela foi salva; do arquivo, o `Cost` da LB n). A LB0 continua com `bac`. Paridade com o MS Project (BCWS/BCWP pelo custo da linha de base do valor agregado), *a confirmar* (pergunta 3). LB-5: EV 6.448.200,00 com a LB2 × 6.453.000,00 com a LB0.
- **(b)** Sempre o BAC atual: a LB só fornece datas. Mais simples, mas o PV da LB n "anda" quando o orçamento muda.
- **Decidido: (a)**, confirmado pela tarefa 0 e completado pela E-2 (sem custo na LB n: BAC, PV e EV zero; AC conta).

## 16. Riscos e pós-entrega
| Risco | Mitigação |
|---|---|
| Número que muda sem querer (LB0 e Curva S) | Tarefa 1 na base antes de tudo; projeção LB0 = mesmo array; checkpoints depois do E1 e da curva (C-1 verde) |
| Conflito com a 00006 em `useProjectStore.ts`, `armazenamentoObras.ts`, `types/obra.ts` e `CLAUDE.md` | Base = branch da 00006; estender a interface dela (`gravarObra(…, extras?)`); linhas reconfirmadas antes de cada tarefa |
| Semântica do MS Project diferente da assumida | G5 e G6 resolvidos pela tarefa 0 (alta confiança); `Interim`, BCWP sem datas e o SPI depois de salvar a LB (D-36) ficam no M-4 `NOT_RUN` |
| Volume (11 LBs × 3.000 tarefas: +~2 a 2,5 milhões de caracteres na obra; histórico de ~40 milhões) e cota | Tuplas no detalhe; P-12 medido; aviso de cota de hoje; `persist()`; exportação JSON; limite G4 |
| Imutabilidade só local (o usuário pode apagar os dados do site) | Declarado na tela e no ciclo; auditoria real na SPEC-02 e persistência na SPEC-01 |
| Fila de gravação e fechamento concorrentes | Fechamento dentro da mesma `fila`; captura a partir de cópia simples; FE-2 |
| Store maior (~2.000 linhas) | Regras em `src/lib`; ações agrupadas por seção; separar a store é decisão do `CLAUDE.md` (fora daqui) |
| A 00008 mexe em `computeEvm`/`plannedFraction` logo depois | A projeção mantém as assinaturas; SPI/CPI nulos já gravados para a decisão do `safeDiv` |
| A 00010 mexe no parser | O 00007 só toca `<Baseline>` e `BaselineForEarnedValue`; o `ExtendedAttribute` fica intacto |
| Desempenho acima da meta | A lição 3 já separa agenda e custo; se o RNF-04.1 passar de 2 s, o primeiro suspeito é a serialização e a validação do detalhe (medidas em separado no teste 51) |
| Rollback | Seção 06: o app anterior cai na memória sem gravar; exportar `.xml` e JSON antes de atualizar |

**Pós-entrega:** nenhuma publicação nem hospedagem (Inviolável 8). O histórico continua só no navegador até a SPEC-01. Planejamento/Controle valida a rotina antes do piloto.

## 17. Emendas
- **Emenda 01 (tarefa 0)**, de 25/10/2026: seção "Emenda 01 (tarefa 0)" no fim do arquivo.

CONHECIMENTO NOVO:
- No corpus do MPXJ, os 7 arquivos `task-baselines` gravam **um campo por `<Baseline>`**: custo, duração, início, término ou trabalho. Nos de 2010 em diante, também a duração, o início e o término estimados, como campos comuns. Sem `Interim` e com `BaselineForEarnedValue` 0. LB parcial é o caso comum, e não a exceção — import e export das LBs.
- A LB0 do arquivo **sem nenhuma data** (só custo, duração ou trabalho; 25 tarefas em 7 arquivos) é trocada pela LB0 calculada pelo `baselineFor(…, onlyMissing)` sem aviso, porque o CR-12 só protege a LB0 com uma das datas. A ida e volta do corpus compara só as datas da LB0 e não pega isso — `importXml`, Inviolável 2.
- O `saveBaseline()` de hoje é exatamente o que a "LB1 pelo previsto" vai gravar. Medir o PV depois dele na base dá o número de referência da LB1 sem esperar o código novo — caracterização de linhas de base.
- `safeDiv` devolve 1 sem divisor. Num registro imutável, isso congelaria um SPI/CPI de 1,00 falso que a 00008 não poderia mais corrigir. O fechamento grava `null` — fechamentos e 00008.
- Uma chave `[obraId, dataStatus]` (ADR 00002) não comporta a retificação, que tem por definição a mesma data do original — armazenamento de fechamentos.

## Gate do orquestrador (25/10/2026)

Decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR. Segue as recomendações do plano:

- **G1:** duas stores (`fechamentos` e `fechamentoTarefas`), chave `id`, gravação por `add`, e emenda do ADR 00002.
- **G2:** LB0 nos campos atuais e LB1–10 num mapa por tarefa. Sobrescrever pede confirmação e motivo.
- **G3:** interpolação em dias úteis e reconstrução ancorada no 1º fechamento.
- **G4:** 104 fechamentos + 52 retificações. No limite, a gravação é recusada e a exportação JSON é oferecida.
- **G5 → (b), decidido** depois da tarefa 0: seguir o MS Project. A "LB do valor agregado" vale para PV, EV, BAC, índices, Curva S e previsão pelo SPI. Atraso, cenários, DLP, Gantt e coluna da EAP continuam contra a LB0. O texto do RF-04.5 vai para Planejamento/Controle atualizar.
- **G6 → (a), decidido e confirmado** pela tarefa 0: PV, EV e BAC com o custo gravado na LB n, completado pela E-2.
- **Emendas da tarefa 0:** as obrigatórias E-1 a E-4 e as recomendadas E-5 a E-12 foram aceitas (seção "Emenda 01 (tarefa 0)").

Tarefa 0 do `especialista-obra`: disparada antes de qualquer implementação. O parecer fica em `00007-tarefa0-especialista.md`. A implementação só começa depois desse parecer e da eventual emenda.

## Emenda 01 (tarefa 0)
**Origem:** parecer da tarefa 0 do `especialista-obra` (`scratchpad\planos\00007-tarefa0-especialista.md`, 25/10/2026, `VEREDITO: APROVADO` condicionado às E-1 a E-4). **Decisão** do orquestrador, com autorização do usuário e sujeita à revisão dele no PR:
- G5 = (b), seguir o MS Project;
- G6 = (a), confirmado;
- emendas obrigatórias E-1 a E-4 e recomendadas E-5 a E-12 aceitas.

Os gates G1 a G4 não mudam. A emenda vale antes da tarefa 2. A tarefa 1 (caracterização na base) não muda.

**Números novos, conferidos à mão** (`node -e`, só aritmética, a partir de `src/data/seed.ts`):
- **BAC 18.993.000,00** = 19.113.000 − 120.000 (BAC do 801).
- **EAC 20.314.633,80** = 18.993.000 × 6.896.900 ÷ 6.448.200 = 20.314.633,8048 (o CPI fica 0,934942).
- **EV 6.381.000,00** = 6.448.200 − 0,40 × 168.000 (variante com o 104 sem LB3).
- **CPI 0,925198** = 6.381.000 ÷ 6.896.900 = 0,9251983.
- Também conferidos:
  - variante do 104: BAC 18.945.000,00 e EAC 20.476.691,82 (18.945.000 × 6.896.900 ÷ 6.381.000);
  - FE-9: EV 6.507.000,00 = 6.448.200 + 0,35 × 168.000;
  - DF-1: BAC 170.000 → 180.000;
  - teste 14: 10 d.u. × 480 = 4.800 min.

| # | Item | Onde mudou | Antes | Depois |
|---|---|---|---|---|
| 1 | E-1 (G5 = b) | Resumo, 00 (contexto), 01 (conflito 3), 02 (T2), D-6, D-7, §04 "Efeito", AC-3, LB-3, tarefas 5, 7 e 8, testes 17, 62 e 64, R-6, V-1, §14, §15, Gate | "LB ativa" no PV, no EV **e** em atraso, variação de término, cenários, DLP, Gantt e EAP, pela projeção única | "LB do valor agregado" só em PV, EV, BAC, SV, CV, SPI, CPI, EAC, Curva S, EVM por pacote, tendência e previsão pelo SPI. Atraso, variação de término, cenários, DLP, Gantt e EAP continuam em `state.tasks` (LB0). RF-04.5 para Planejamento/Controle atualizar |
| 2 | LB-3 | §4.2, teste 17 | Atraso **0 d.u.** com a LB1 ativa | Atraso **+16 d.u.** (contra a LB0); `finishVarianceDays`, crashing (3 d.u., R$ 12.616,80) e DLP iguais aos da LB0 |
| 3 | E-2 (D-8 completada; G6 = a) | D-6, D-8, LB-4, LB-5, teste 11, §14, tarefa 28 | Tarefa sem LB n: só PV zero; aviso "o PV delas é zero" | Sem custo na LB n: **BAC, PV e EV = 0**, AC conta; aviso com "PV, EV e orçamento (BAC)". **Dívida:** o custo da LB0 acompanha o `bac` atual (no MS Project ficaria congelado), enquanto as LB1–10 congelam o custo |
| 4 | LB-4 | §4.2, teste 11 | Só PV 7.259.250,00; variante do 104 só com PV "medido" | BAC **18.993.000,00**; PV 7.259.250,00; EV 6.448.200,00; AC 6.896.900,00; CPI 0,934942; EAC **20.314.633,80**. Variante do 104: BAC 18.945.000,00; EV **6.381.000,00**; CPI **0,925198**; EAC 20.476.691,82; PV = medição (C-7) |
| 5 | E-3 (fechamento) | tipos (§03), D-10, D-23, D-26, S-2 (§08), C-7, FE-1, AC-7, tarefas 13 e 17, teste 33 | Cabeçalho só com o número da LB; tupla com 11 posições, sem PV; ~85 caracteres por tarefa | `linhaBaseSalvaEm` no cabeçalho; tupla com **12** posições, com o **PV** por tarefa; ~95 caracteres por tarefa (~44 milhões em 156 fechamentos); FE-1 com o PV do 302 e do 104 (C-7) e Σ PV das tuplas = 7.259.250,00 |
| 6 | E-4 (PV linear) | D-36 (nova), LB-2, teste 16, tarefas 7 e 28, M-4 | PV da LB1 (C-2) apresentado só como estimativa | Rotulado **"regra do CronoAI"**: PV linear entre o início e o término da LB; a LB salva no meio da obra nasce com SPI 0,992606, e o MS Project daria ≈ 1,00 (M-4). Nota na tela e na `calculo-precisao.md` |
| 7 | E-5 (retificação) | D-15, FE-9 (novo), AC-8, tarefas 13 e 17, teste 66 | Sem salvaguardas | Avisos sem bloquear: EV retificado acima do fechamento seguinte (6.507.000,00 > 6.500.000,00) e % acima do seguinte; frase "a retificação não altera a obra atual" |
| 8 | E-6 (*rollup*) | D-5, §05, tarefas 3 e 10, teste 14 | Resumo da LB n sem duração | Duração = d.u. do calendário padrão entre o menor início e o maior término × `minutosPorDia` (4.800 min no teste). LB0 do resumo continua com `Duration` 0 (dívida, para não quebrar a C-4) |
| 9 | E-7 (inclusão de escopo) | D-35 (nova), AC-2, tarefa 6, teste 65, §14 | Tarefa nova só com a LB0 | Também a LB do valor agregado ≠ 0 (datas, duração e custo = bac), com log; validar com Planejamento/Controle |
| 10 | E-8 (avisos ao fechar) | D-12, FE-1, AC-7, tarefas 15 e 17, teste 67 | — | Avisos sem bloquear: relatos pendentes (4 no Aurora) e data de status futura; frase "Registro gerencial; não substitui a medição contratual" |
| 11 | E-9 (gráfico e nota) | Resumo, 00, D-26, D-31, AC-10, tarefas 23 e 24, teste 63, V-3, fora do escopo | EV/AC interpolado tracejado, como a tendência | Traço pontilhado curto, diferente da tendência; nota "índices dos fechamentos calculados contra a linha de base vigente em cada fechamento" e "fechado contra a LBk de dd/mm/aaaa". Série de PV da LB0 como referência: opcional, fora (pendência) |
| 12 | E-10 (DF-1) | §4.5, teste 60 | Tarefa D sem valores | D com 0%, custo 0, BAC 20.000; totais EV e AC 55.000; BAC 170.000 → **180.000** |
| 13 | E-11 (CS-2) | §4.4, teste 55 | Pontos não contados | **Exatamente 3 pontos**; a curva não mostra os 200.000 da LB (comportamento da base, não corrigir de passagem) |
| 14 | E-12 e pergunta 10 (exportação) | §05, AC-5, tarefa 10, teste 68, fora do escopo | Sem aviso | Avisos "datas das linhas de base com horário padrão (08:00 e 17:00)" e "o trabalho (Work) das linhas de base não volta ao .xml"; preservação opaca do `Work` no 00010 |
| 15 | Duração da LB como vão (pergunta 1) | D-2, tarefa 28 | — | Registrada como dívida: `s.duracaoMin` é o vão em minutos úteis (302: ~36,9 d em vez de 36 d) |
| 16 | Planos provisórios e data de gravação (perguntas 1 e 4) | §05 | "A tarefa 0 confirma" | Data de gravação da LB não existe no MSPDI (corpus: só `LastSaved`); planos provisórios chegam por `ExtendedAttribute` (00010) |
| 17 | Referências internas | D-10, D-12 | "(D-17)" e "(D-25)" | "(D-28)" e "(D-24)" (correção de remissão) |
| 18 | Commit do E1 | §09 | `… LB ativa no PV e nas variações …` | `feat(linhas-base): LB0 a LB10 por obra, LB do valor agregado no PV, EV e BAC e migração 4 → 5 (ciclo 00007)` |
| 19 | Contagens | §11, §12 | 17 AC; 63 testes (61 Vitest, 2 E2E) | **17 AC** (AC-2, AC-3, AC-5, AC-7, AC-8 e AC-10 reescritos); **68 testes** (66 Vitest, 4 só locais, e 2 E2E): novos 64 a 68 |

**Números inalterados:**
- C-1 a C-8;
- LB-1, LB-2 (só o rótulo), LB-5 a LB-7;
- FE-1 (totais), FE-2 a FE-8;
- CS-1, CS-3 a CS-6;
- TE-1 e EX-1;
- o inventário esperado do corpus.

**Pendências abertas pela emenda:**
- Planejamento/Controle: atualizar o RF-04.5; validar E-2 e E-7 (com Orçamento/Controladoria); decidir a série de PV da LB0 e o seletor de variações.
- Jurídico: texto "registro gerencial".
- M-4 `NOT_RUN`: G5, G6, BCWP com LB sem datas, `Interim`, SPI ≈ 1,00 depois de salvar a LB.

## Emenda 02 (coordenação do esquema com o 00006)
**Origem:** emenda 01 do plano 00006 (`.claude/ciclos/00006-sinapi-layout-2025-plano.md`, D-14 emendada), por decisão do orquestrador com autorização do usuário, sujeita à revisão dele no PR. O 00006 passou a ter o passo de esquema **4 → 5** (saneamento do recorte e da equipe por função), e este ciclo, que vem depois, passa a **5 → 6**. Nenhum número de cálculo muda. A estrutura do IndexedDB continua 2 (00006) → 3 (00007).

| # | Item | Onde | Antes | Depois |
|---|---|---|---|---|
| 1 | Passo de esquema | Resumo (E1), §00 (`migracaoEstado.ts`), §02 T4, §06 (título, passo, `completarChaves`, motivo, rollback), tarefa 4, commit do E1 | `{ de: 4, para: 5 }`, `ESQUEMA_ATUAL = 5`, `completarChaves` ≥ 5 | `{ de: 5, para: 6 }`, `ESQUEMA_ATUAL = 6`, `completarChaves` ≥ 6; o app da 00006 (esquema 5) recusa a obra no esquema 6 |
| 2 | Registro real (lição 4) | C-5, tarefa 1, teste 5, P-1 | Fixture `registro-esquema4-aurora-cenarios.json` | `registro-esquema5-aurora-cenarios.json`, gerada na base 00006 (com recorte vinculado); a do esquema 4 é do 00006 e entra no P-2 |
| 3 | Cadeia e recusa | testes 6 a 8, AC-4, P-2 a P-4 | v1 → 5; esquema 6 recusado; esquema 5 adulterado | v1 → 6 e esquema 4 (00006) → 6; esquema **7** recusado; esquema 6 adulterado |
| 4 | Commit do E1 | §09 | `… e migração 4 → 5 (ciclo 00007)` | `feat(linhas-base): LB0 a LB10 por obra, LB do valor agregado no PV, EV e BAC e migração 5 → 6 (ciclo 00007)` |

A linha 18 da tabela da emenda 01 fica como registro histórico; vale o commit desta emenda. **Contagens inalteradas:** 17 AC e 68 testes.
