---
issue: —
spec: SPEC-05 (parte 1) — RF-05.1, RF-05.2 (só por tarefa, P2 do PLANO-FASE-1), RF-05.3, RF-05.4, RF-05.5, RF-05.8; RNF-05.1, RNF-05.2
ciclo: .claude/ciclos/00004-motor-minutos-calendarios.md
branch: feat/00004-motor-minutos-calendarios
base: master, depois do merge do 00002 (feat/00002-multiobra) e do 00003 (feat/00003-corpus-mspdi)
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026); emenda 01 de 25/10/2026 (parecer da tarefa 0 do especialista-obra, P1 alterado e itens herdados do 00003), sujeita à revisão do usuário no PR
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00004 — Motor em minutos, calendários e calendário por tarefa, restrições e prazo final, lag em dias úteis/corridos/%, opções de progresso e painel de divergências

## Resumo
- **O que é:** o motor de cronograma passa a contar o tempo em **minutos úteis**, com vários calendários por obra e um calendário opcional por tarefa. Ganha as 8 restrições do MS Project e o prazo final, lag em dias úteis, dias corridos (`edays`) e %, e as opções de progresso (lógica retida, substituir progresso, mover o restante). O MSPDI passa a ler e gravar tudo isso, e uma tela nova lista as tarefas cuja data difere do arquivo importado, com a causa provável.
- **Risco que justifica a faixa 3:** T3 (parser MSPDI: calendários, `CalendarUID`, `ConstraintType`, `Deadline`, todos os `LagFormat`) e T5 (calendários de arquivo externo podem travar o motor). T1, T2 e T4 também valem: o motor, o EVM e o formato salvo de **todas** as obras mudam (esquema 2 → 3).
- **Garantia central:** o E1 é refatoração. As 20 folhas do Edifício Aurora mantêm início, término, folga total, folga livre e caminho crítico, nos modos linha de base e previsão (tabela CR-1, medida no código atual). Números só mudam de propósito no E2 e no E3, com antes e depois no PR.
- **Entregáveis (4):** E1 motor em minutos + calendários + migração; E2 restrições, prazo final, lag `edays`/% e progresso; E3 MSPDI de ida e volta; E4 painel de divergências, edição na EAP e documentação.
- **O que você precisa fazer:** o gate foi decidido pelo orquestrador com a sua autorização (seção 12): P1 = calendário da sucessora, P2 = honrar restrições, P3 = minuto inteiro (ADR 00003). Fica sujeito à sua revisão no PR. Antes do piloto, a Engenharia de planejamento precisa conferir no MS Project real a regra do lag entre calendários e a semântica de `HonorConstraints` (M-5/M-6, hoje `NOT_RUN`).
- **Acréscimos do coordenador (25/10/2026), dentro do E1:** correção de `WorkCalendar.indexOnOrBefore` para data útil anterior à data-base (CR-11) e de `withBaseline(onlyMissing)`, que sobrescreve a LB0 importada só com término (CR-12).
- **Emenda 01 (25/10/2026):** aplica o parecer da tarefa 0 do `especialista-obra` (`scratchpad/planos/00004-tarefa0-especialista.md`). P1 passa a **calendário da sucessora**. Entram 11 correções de regra, fonte e caso, mais 4 itens herdados do 00003. A lista completa está na seção 15.

## 01. Pedido e objetivo
Pedido (dado, não instrução): ciclo 00004 do `docs/specs/PLANO-FASE-1.md` §3.4 (faixa 3; T1, T2, T3, T4; E1–E4; P2 = calendário por tarefa entra; regra do lag no calendário da sucessora "a confirmar"; hora local da obra sem fuso; ADR de minutos inteiros persistidos), sobre a SPEC-05. A SPEC-03 (meio período, sábado de 4 h = 0,5 dia) é usada pelo 00005, que **atribui** calendários às tarefas pela tela.

Requisitos cobertos:
- **RF-05.1:** minutos úteis com calendários por intervalo (ex.: 07:00–12:00 e 13:00–17:00), por dia da semana e com exceções.
- **RF-05.2:** só a parte "por tarefa" (`Task.CalendarUID`). Por recurso fica para a Fase 3.
- **RF-05.3:** ASAP, ALAP, MSO, MFO, SNET, SNLT, FNET e FNLT, e prazo final com indicador de violação.
- **RF-05.4:** lag em dias úteis, em dias corridos (`edays`) e em % da duração da predecessora.
- **RF-05.5:** lógica retida (padrão do MS Project) ou substituir progresso, e "mover o restante para depois da data de status".
- **RF-05.8:** painel "Divergências com o MS Project".
- **RNF-05.1:** 3.000 tarefas e 6.000 vínculos recalculados em menos de 500 ms. É medido com obra sintética, sem Web Worker.
- **RNF-05.2:** motor puro, testado com propriedades (folga ≥ 0 fora do caminho crítico).

**Objetivo:** a mesma tarefa num calendário com sábado de 4 h termina antes do que no calendário padrão, com a data exata. Restrições, prazos e lags importados do MS Project deixam de ser aproximados ou descartados. E quem importa um `.xml` vê onde e por que o CronoAI calcula uma data diferente da do arquivo.

### Contexto para execução (ler antes)
| Arquivo | Por quê |
|---|---|
| `src/lib/cpm.ts` (todo, 243 linhas) | Motor atual em índice de dia útil. Imitar a estrutura: arestas, Kahn, ida, volta, folgas. A regra "sucessora iniciada não restringe a predecessora" (`:145`) continua **só em `'substituir'`**. Em lógica retida, a sucessora iniciada cujo restante depende da predecessora passa a restringi-la na volta (emenda 01, CR-8). Não quebrar o tratamento de concluída e iniciada (`:114-131`) |
| `src/lib/calendar.ts` (todo) | `WorkCalendar` (`:67-161`): semana fixa seg–sex em `:91-96`, horizonte de 1.600 dias em `:76`, erro de `indexOnOrBefore` em `:119` (CR-11). `parseISO`/`toISO`/`addCalendarDays`/`defaultHolidays` continuam valendo |
| `src/lib/evm.ts:39-51`, `:204-208` | `elapsedFraction`/`plannedFraction` em dias úteis; `forecastFinishBySpi` usa `indexOnOrAfter`/`dateAt` |
| `src/lib/scenarios.ts:145-153`, `:202-208`, `:292-301`, `:340-399` | `reschedule`, crashing (`durationDays`), fast-tracking (`lagDays`, `ef − es`), hora extra (sábados inteiros, índices `es`/`ef`) |
| `src/lib/migracaoEstado.ts` (todo) e `.test.ts` | Cadeia de migrações do 00002: o passo 2 → 3 entra aqui. Imitar os testes do esquema anterior |
| `src/types/domain.ts:4-11`, `:34-69`, `:90-114`, `:204-214`; `src/types/obra.ts:7-17` | Tipos que mudam: `PredecessorLink.lagDays`, `Task.durationDays`/`snet`/`baselineDuration`, `WorkCalendarConfig`, `ScheduledTask`, `ProjectState`; `ScenarioUndo.before` guarda `Partial<Task>` |
| `src/stores/useProjectStore.ts` (na `master` depois do 00002) | `baselineFor`/`buildSeedState`, derivados `calendar`/`baseCalendar`/`schedule`, `applyScenario`/`undoScenario` (gravam em `state.calendar.extraWorkingDays`), `importXml`/`exportXml`. As linhas mudam com o 00002 em andamento: localizar pelos nomes |
| `src/lib/msProjectXmlParser.ts` (worktree do 00003 em `b7d54cb`: `:128-157`, `:186-264`, `:272-370`, `:508-804`; leitura do calendário `:549-641`) | Conversões, `taskNode`, `buildMspdiXml`, `parseMspdiXml`. O 00004 parte do parser **depois** do 00003. As linhas mudam a cada commit: localizar pelos nomes |
| `src/lib/msProjectXmlParser.corpus.test.ts` (00003) | Inventário fixo do corpus e, quando o 00003 terminar, a ida e volta (E3 dele) e a comparação de datas (E4 dele: 83/104 e 100/104). É a régua de "sem regressão" deste ciclo |
| `src/lib/core.test.ts:100-125`, `src/stores/useProjectStore.test.ts:54-76`, `e2e/fluxos.spec.ts`, `e2e/obras.spec.ts` | N-1 a N-3 e os KPIs do E2E (23/06/27, +16 d.u., 16/06/27, 18/06/27): **não podem mudar** em nenhum entregável |
| `.claude/adrs/00002-armazenamento-local-fase-1.md` | Uma entrada por obra; esquema mais novo nunca é sobrescrito |
| Rascunho do ADR 00003 (`00003-adr-minutos-inteiros.md`, entregue junto deste plano) | Unidade persistida e regras de arredondamento |

## 02. Triagem
Confirmada no código em 25/10/2026: branch `feat/00002-multiobra` (`0fabf1e`, mais alterações pendentes do próprio 00002) e worktree do 00003 (`feat/00003-corpus-mspdi`). Na emenda 01, as linhas do parser foram atualizadas para o commit `b7d54cb` (00003 já validado).

- **T1 SIM.**
  - `computeSchedule(tasks, cal, opts)` recebe um único `WorkCalendar` (`cpm.ts:68-72`).
  - Arredonda a duração para dias inteiros (`Math.round(t.durationDays)`, `cpm.ts:113`).
  - A única restrição é o SNET (`cpm.ts:106`).
  - O lag é somado ao índice de dia útil (`cpm.ts:100-103`, `:149-152`, `:174-177`).
  - O restante de tarefa iniciada é `⌈dur × (1 − %)⌉` em dias, com mínimo de 1 (`cpm.ts:122`).
  - O calendário tem semana fixa seg–sex (`calendar.ts:91-96`) e índice inteiro de dia (`:63-67`).
  - `indexOnOrBefore` erra 1 dia para data útil anterior à data-base (`calendar.ts:119`).
  - `withBaseline(onlyMissing)` olha só `baselineStart` (`cpm.ts:220`).
- **T2 SIM.**
  - PV usa a fração em dias úteis do calendário do projeto (`evm.ts:39-51`).
  - `forecastFinishBySpi` usa índices de dia (`evm.ts:204-208`).
  - A hora extra soma sábados inteiros ao calendário da obra (`scenarios.ts:343-348`) e conta frentes por índice de dia (`:356-361`).
  - Os números de EVM e dos cenários do seed **não mudam** (CR-1). Só muda a unidade interna e o calendário usado por tarefa (CR-2d).
- **T3 SIM** (parser da worktree do 00003, `b7d54cb`).
  - Durações: `toDuration`/`fromDuration` em dias (`:128-147`) e `Math.round` na importação (`:720`, `:753`).
  - Lag: `lagToWorkingDays` com 5/7 para dias corridos e `undefined` para % (`:150-157`), zerado com aviso (`:706-708`, `:767`). Lag em formato diferente de dias úteis gera o aviso "serão exportados em dias úteis" (`:710`, `:768`; 12 vínculos `LagFormat` 9 em 6 arquivos do corpus). Exportação com `LagFormat` 7 fixo (`:246-247`).
  - Restrições: `ConstraintType` só 0/4 (`:238`, `:754-755`); `Deadline` não é lido nem gravado.
  - Calendários:
    - a exportação grava um único calendário com semana e horário fixos (`:279`, `:325`);
    - a importação lê só o calendário do projeto, dentro do próprio `parseMspdiXml` (`:549-641`);
    - avisa sobre semana diferente de seg–sex (`:633-639`) e sobre calendário próprio da tarefa (`:703`, `:778`).
  - `SCHEMA_ORDER.Task` (`:57-70`) não tem `Active` nem `Manual`: a marca de tarefa manual se perde na volta.
  - LB0 só com término: o aviso diz "será recalculada pelo cronograma ao importar" (`:733`, `:772`), o que descreve o `withBaseline` de hoje (CR-12).
  - Cabeçalho: `HonorConstraints` 0 fixo (`:314`) e `MinutesPerDay` 480 fixo (`:308`).
- **T4 SIM.**
  - Tipos persistidos: `PredecessorLink.lagDays` (`domain.ts:6-11`), `Task.durationDays`/`baselineDuration`/`snet` (`:41`, `:56`, `:57-58`), `WorkCalendarConfig` (`:64-69`) e `ProjectState.calendar` (`:207`).
  - `ScenarioUndo.before: Partial<Task>` e `addedDays` (`obra.ts:7-14`) guardam esse formato dentro de cada obra.
  - Cadeia de migrações: `ESQUEMA_ATUAL = 2` (`migracaoEstado.ts:7`), `MIGRACOES` (`:15-18`), `completarChaves` preenche `calendar` (`:54-60`).
  - Obra em branco: `obras.ts:70`.
- **T5 SIM.** Entram dados novos de arquivo externo: vários calendários, horários (`FromTime`/`ToTime`, inclusive `00:00` = 24:00), exceções com horário, datas de restrição e prazo. Um calendário sem tempo útil ou com datas absurdas pode deixar o motor em laço ou estourar memória. Sem dependência nova.
- **T6 NÃO.** `fieldAi.ts:139` muda só pela troca de nome do campo (`durationDays > 0` → `duracaoMin > 0`). O De-Para não muda, e `core.test.ts` › "IA de canteiro" continua igual. Se o `classificar-diff.mjs` marcar T6, registrar no ciclo como renomeação.
- **T7 NÃO.** Sem mudança em CI, Docker ou `vite.config.ts`. O teste de desempenho estrito e o de corpus são locais, por variável de ambiente.
- **T8 NÃO.** Sem backend.

**Faixa 3 confirmada (T3, T5).** O `especialista-obra` é obrigatório (T1, T2, T3), e o `seguranca` também (T3, T5).

## 03. Decisões de design

### Modelo de tempo (ADR 00003, proposto)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Durações, lags úteis e corridos e folgas em **minutos inteiros**. Lag % em percentual (número com até 2 casas). Exibição em dias = minutos ÷ `minutosPorDia` da obra (padrão 480) | Dias fracionários; décimos de minuto (gate P3) | Ver ADR 00003. 100 min = 0,2083… dia acumula erro em ponto flutuante. Minuto é a unidade da interface e da VBA do MS Project, e o MSPDI cabe nela, salvo segundos de durações guiadas por recurso (fora da Fase 1) |
| O motor trabalha com **minutos absolutos de relógio de parede** desde 00:00 da data-base da obra. Cada calendário converte "momento" ↔ "minuto útil" | Índice de minuto útil por calendário (como o índice de dia de hoje) | Índices de calendários diferentes não se comparam. Um vínculo entre tarefas de calendários diferentes precisa de um eixo comum, que é o relógio |
| **Hora local da obra, sem fuso.** A aritmética de dia usa `Date.UTC` (como `calendar.ts` já faz); nenhuma conversão de fuso, nenhum horário de verão | `Date` local; fuso por UF | O Brasil tem 4 fusos, e o MSPDI grava data e hora sem fuso (PLANO §3.4) |
| Data-hora persistida como `yyyy-mm-ddThh:mm` (sem `Z`) em `restricao.data` e `prazoFinal`. Data só (`yyyy-mm-dd`) continua valendo e significa início do expediente do dia (restrições de início) ou fim do expediente (restrições de término e prazo final). Data de status, datas reais e linha de base continuam `yyyy-mm-dd` | Trocar todas as datas do domínio por data-hora | Mantém o SNET migrado e o export de hoje idênticos (`ConstraintDate` T08:00). Preserva a hora do `ConstraintDate`/`Deadline` do MSPDI. Datas reais com hora ficam fora (escopo) |
| **Normalização:** início de tarefa com duração > 0 vai para o próximo momento útil do calendário dela. Término fica no fim do último trecho útil (17:00, e não 08:00 do dia seguinte). **Somar lag 0 não normaliza.** O marco fica no término da predecessora (17:00 do mesmo dia) ou no início do projeto | Normalizar sempre para frente | Reproduz o `dateAt(EF − 1)` e o marco de hoje (`cpm.ts:182-185`). O simulador do plano errou o marco 802 exatamente nesse ponto (seção 14) |
| Conversões de tempo num módulo só: `src/lib/calendarioTrabalho.ts` (novo), com dias ↔ minutos, data-hora sem fuso, compilação do calendário e aritmética útil. O MSPDI converte décimos de minuto ↔ minutos em `msProjectXmlParser.ts`, chamando esse módulo | Espalhar `× 480` pelo código | `msproject-mspdi.md`: "toda conversão mora num só lugar". Hoje há `× 480` em `msProjectXmlParser.ts:183`, `:229` |
| `WorkCalendar` (dia útil) **continua** para contas por dia: `workingVariance` (+16 d.u.), `forecastFinishBySpi`, duração do resumo no export. Passa a ser construído a partir do calendário padrão compilado (dia útil = dia com minutos úteis) e ganha a correção do CR-11 | Remover o `WorkCalendar` | Menos arquivos no E1. O "+N d.u." é uma conta de dias do calendário padrão e continua igual |
| Horizonte do calendário **dinâmico** (cresce sob demanda), com teto de 50 anos a partir da data-base. Acima do teto: erro explícito em português, sem extrapolação silenciosa | Horizonte fixo de 1.600 dias úteis | Fecha a dívida "horizonte de 1.600 dias" (`divida-conhecida.md`) e dá a proteção T5 (S-2) |

### Calendários e tipos (T4)
Busca de equivalente: só existe `WorkCalendarConfig { holidays, extraWorkingDays }` (`domain.ts:64-69`), sem horário nem semana configurável. Não há outro modelo de calendário no código. Tipos novos em `src/types/domain.ts`:

```ts
interface IntervaloTrabalho { de: number; ate: number }            // minutos do dia, 0–1440 (1440 = 24:00; 00:00–00:00 do MSPDI = 0–1440)
interface ExcecaoCalendario { data: string; intervalos: IntervaloTrabalho[] } // [] = dia não útil
interface CalendarioObra {
  uid: number            // UID do calendário no MSPDI (padrão migrado = 1)
  nome: string
  semana: IntervaloTrabalho[][]  // 7 posições, 0 = domingo … 6 = sábado; no máximo 5 intervalos por dia (esquema MSPDI)
  excecoes: ExcecaoCalendario[]
}
// E1: só 'util'. E2 amplia (sem migração: união mais larga, dado antigo continua válido)
type Lag = { tipo: 'util'; minutos: number; codigoMspdi?: number }
         | { tipo: 'corrido'; minutos: number; codigoMspdi?: number }   // E2
         | { tipo: 'percentual'; percentual: number; codigoMspdi?: number } // E2
// E1: SNET. E2: os 8 tipos
type Restricao = { tipo: 'SNET' | 'SNLT' | 'MSO' | 'MFO' | 'FNET' | 'FNLT'; data: string; inferida?: true } | { tipo: 'ALAP' }
```

- **`Task`:**
  - `durationDays` → `duracaoMin`; `baselineDuration` → `baselineDuracaoMin`; `snet` → `restricao`.
  - Opcionais novos: `calendarioUid?` (E1; ausente = calendário padrão da obra), `prazoFinal?` e `duracaoCorrida?: true` (E2), `arquivo?` (E3: datas e marcas do MSPDI para o painel).
  - `PredecessorLink.lagDays` → `lag: Lag`.
- **`ProjectState`:** `calendar` → `calendarios: CalendarioObra[]` e `calendarioPadraoUid: number`.
- **`ProjectMeta`:** opcionais `minutosPorDia?` (E1, padrão 480), `opcoesCronograma?` (E2) e `honorConstraintsArquivo?` (E3, só para a volta; gate P2).
- **`ScheduledTask`:** ganha os momentos em minutos (`inicioCedoMin`, `terminoCedoMin`, `inicioTardeMin`, `terminoTardeMin`), as datas `earlyStart`/`earlyFinish`/`lateStart`/`lateFinish` (`yyyy-mm-dd`), `inicioHora`/`terminoHora` (`hh:mm`) e `folgaTotalMin`/`folgaLivreMin`.
  - `totalFloat`/`freeFloat` continuam em dias (minutos ÷ `minutosPorDia`, podendo ser fracionários a partir do E2).
  - `es`/`ef`/`ls`/`lf` deixam de ser índices de dia. Os consumidores que os usavam como índice (`msProjectXmlParser.ts:206-209`, `CriticalPathModule.vue:63-64`, `scenarios.ts:301`, `:351-361`) passam a usar as datas ou os minutos.
- **`MSProjectTask`/`MSProjectPredecessor`** (nomes do MS Project): `Duration` continua em dias. Entram `LinkLag` (décimos de minuto) e `LagFormat` (E2). `LagDays` continua para o lag útil (dias), dias corridos para o `corrido` e 0 para o %.

**Calendário padrão migrado:** `uid` 1, nome `'Padrão Obra (seg-sex, 8h)'`. É o nome que o export grava hoje (`msProjectXmlParser.ts:308`), para a exportação do seed não mudar. Semana: seg–sex com 08:00–12:00 e 13:00–17:00. Exceções: `holidays` como não úteis e `extraWorkingDays` como úteis no mesmo horário.

**Calendário usado no PV (CR-2d):** o calendário da tarefa **sem as exceções úteis**. É a regra de hoje: `baseCalendar` sem `extraWorkingDays` (`useProjectStore.ts`, derivado `baseCalendar`). Assim o seed não muda. Separar "sábado de hora extra" de "dia útil extra do arquivo" fica para o 00005, que cria o calendário derivado de hora extra.

### Motor
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `computeSchedule(tasks, calendarios, opts)`: o calendário de cada tarefa vem de `calendarioUid` (ausente = padrão). `duracaoCorrida` usa um calendário interno de 24 h (E2) | Uma função por calendário | Uma passagem de ida e volta, como hoje |
| **Lag útil entre calendários diferentes: contado no calendário da sucessora**, ou no do projeto quando a sucessora não tem calendário próprio (gate **P1**, emenda 01). O lag corrido continua em 24 h. A regra mora numa função só (`calendarioDoLag(pred, succ)`), com teste dos dois lados | Calendário do projeto (recomendação da 1ª versão deste plano); calendário da predecessora | Nenhuma documentação oficial da Microsoft define a regra: [Add lead or lag time to a task](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task) não diz qual calendário vale. Duas fontes técnicas independentes, com testes no MS Project 2010, 2013 e 2016, apontam a sucessora: [Boyle 2018](https://boyleprojectconsulting.com/tomsblog/2018/06/27/impact-of-calendars-on-schedule-slack-calculation-in-microsoft-project/) e [Trajkovski 2013](https://ntrajkovski.com/2013/02/27/task-calendars-and-lag-in-ms-project-2013/). A regra "do projeto" vale no cenário com calendário de recurso e sem calendário de tarefa, que o CronoAI não tem. **Confiança: terceiros, não oficial.** Coincide com a hipótese do PLANO §3.4. **Validação final:** Engenharia de planejamento, no MS Project real (M-5/M-6) |
| Lag corrido (`edays`): soma minutos de relógio (24 h/dia, ignora calendário). Depois, o início é normalizado no calendário da sucessora. Formatos corridos: {4, 6, 8, 10, 12, 36, 38, 40, 42, 44}. Os códigos 21 e 53 são nulos (não corridos), e o 39 é dia útil estimado. 1 ed = 1.440 min, 1 eh = 60, 1 ew = 10.080, 1 emo = 43.200 (30 ed), sem `MinutesPerDay` | Converter por 5/7 (hoje, no import) | O esquema MSPDI ([Tasks](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/xml-schema-for-the-tasks-element)) define 8 = ed e `LinkLag` em décimos de minuto. As 24 h por ed e os 30 dias por emo são **empíricos** (`mspdiduration.xml`, MS Project 2007: 1 ed de 08:00 a 08:00 do dia seguinte, 1 emo = `PT720H`). Fecha a aproximação de `lagToWorkingDays` (worktree `:150-157`) |
| Lag %: `round(percentual × duração da predecessora em minutos ÷ 100)`, somado como lag útil no calendário do lag. No MSPDI (`LagFormat` 19/20 e os estimados 51/52), o `LinkLag` guarda o **percentual inteiro** (50 = 50%), sem ÷ 10 nem × 10 | Lag % zerado (hoje); `LinkLag` = % × 10 (1ª versão deste plano) | RF-05.4. "% da predecessora": oficial, por inferência ([Add lead or lag time to a task](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task)). Codificação do `LinkLag`: o esquema diz só "tenths of a minute"; terceiros ([docxy #104](https://github.com/yeroo/docxy/issues/104), Project 2021) mostram `+50%` gravado como 50; o corpus não tem caso. **A confirmar no M-5** |
| Restrições com "honrar restrições" **sempre ligado** (gate **P2**). MSO, MFO, SNLT e FNLT prevalecem sobre o vínculo, e a folga negativa aparece na predecessora. SNET e FNET são limite inferior na ida. SNLT, FNLT, MSO e MFO limitam a volta. ALAP: depois da volta, a tarefa vai para as datas tardias, sem mudar as datas cedo. O `HonorConstraints` do arquivo é preservado para a volta; **obra sem valor de arquivo exporta 0**, que é o que o MS Project grava no corpus | Seguir o `HonorConstraints` do arquivo | Sentido da regra, oficial: [PROJ_OPT_HONOR_CONSTRAINTS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg217473(v=office.15)) (arquivada; "constraints take precedence over dependencies", padrão True), [Show slack in your project](https://support.microsoft.com/en-us/project/show-slack-in-your-project-in-project-desktop), [Total Slack (task field)](https://support.microsoft.com/en-us/project/total-slack-task-field) e [Set a task start or finish date (constraint)](https://support.microsoft.com/en-us/project/set-a-task-start-or-finish-date-constraint-for-a-task). Detalhe da volta: sem página oficial (confiança média). O [elemento HonorConstraints](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/honorconstraints-element) diz 0 = falso, mas os 134 arquivos gravam 0: conflito sem solução nas fontes (M-6) |
| Prazo final: não move a tarefa. Entra no término tardio (`LF = min(LF, prazo)`; prazo depois do término tardio não aumenta a folga) e marca `prazoFinalPerdido` quando o término passa do prazo | Tratar como FNLT | Oficial: [Deadline (task field)](https://support.microsoft.com/en-us/project/deadline-task-field) (só acende indicador; afeta a folga total) e [Show slack in your project](https://support.microsoft.com/en-us/project/show-slack-in-your-project-in-project-desktop) |
| Restante de tarefa iniciada: **E1** mantém `⌈dur × (1 − %)⌉` em dias de `minutosPorDia` (mínimo 1 dia), para não mudar data. **E2** passa a `round(duracaoMin × (1 − %/100))` minutos, meio para cima (302: 3.801,6 → 3.802), como o MS Project | Mudar já no E1 | Oficial: [Remaining Duration (task field)](https://support.microsoft.com/en-us/project/remaining-duration-task-field), "Remaining Duration = Duration − (Duration × Percent Complete)". E1 é refatoração. A mudança do E2 desloca inícios no Aurora, mas mantém os KPIs (CR-9). O MS Project pode mostrar o minuto vizinho: tolerância de 1 min só nesse caso (ADR 00003) |
| Opções de progresso (`opcoesCronograma`, opcional): `logica: 'retida' \| 'substituir'`, com padrão `'retida'`, e `moverRestante: boolean`, com padrão `true` (reprogramação de hoje pela data de status). **Retida:** o restante de tarefa iniciada fora de sequência começa depois da predecessora, **e essa sucessora iniciada restringe a predecessora na volta**; a exceção "sucessora iniciada não restringe" (`cpm.ts:145`) vale **só em `'substituir'`**. **Substituir:** ignora a predecessora (comportamento de hoje, `cpm.ts:120-125`). **`moverRestante` é política do CronoAI**, aproximadamente "Atualizar projeto › Reagendar trabalho não concluído" mais `MoveRemainingStartsForward`. Não é o padrão do MS Project nem equivale às opções Move\*. As 4 Move\* do arquivo (`MoveCompletedEndsBack`, `MoveRemainingStartsBack`, `MoveRemainingStartsForward`, `MoveCompletedEndsForward`) são preservadas na ida e volta, sem entrar no cálculo | Padrão `'substituir'`; mapear `moverRestante` ↔ Move\* | Retida ≈ `SplitsInProgressTasks` 1. Oficial: [Planning Wizard](https://support.microsoft.com/en-us/office/planning-wizard-8ce030a9-31e4-495c-a543-7d9652384bd5); arquivada: [PROJ_OPT_SPLIT_IN_PROGRESS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg221759(v=office.15)), padrão True; corpus 134/134 = 1. As Move\* só agem ao lançar progresso e não movem tarefa não iniciada ([Set the status date for project reporting](https://support.microsoft.com/en-US/project/set-the-status-date-for-project-reporting)); o corpus tem 134/134 = 0. No seed não há progresso fora de sequência, então nenhum número do seed muda. Sem a regra de volta em `'retida'`, a predecessora que comanda o restante sai com folga 2 d no CR-8, sem ser crítica |
| `withBaseline(onlyMissing)`: pula a tarefa que já tem `baselineStart` **ou** `baselineFinish` (CR-12) | Só `baselineStart` (hoje, `cpm.ts:220`) | O 00003 preserva a LB0 incompleta e avisa que o PV fica zero. Hoje a LB0 só com término é sobrescrita no `importXml` (`baselineFor(…, true)`): o término do arquivo se perde (Inviolável 2) e o aviso fica falso |
| Tarefas agendadas manualmente no MS Project (`<Manual>1`): **não** são suportadas no cálculo; o motor as recalcula. O import guarda `Manual` e `Active`, e o export os devolve: os dois entram no `SCHEMA_ORDER.Task` depois de `Name` e antes de `Type`, como o MSPDI 2010+ grava (`task-flags-project2016-mspdi.xml`). O painel mostra a causa na tarefa manual e nas sucessoras que divergem por efeito dela, apontando para o UID da manual | Fixar as datas da tarefa manual; descartar a marca | Oficial: [Task Mode (task field)](https://support.microsoft.com/en-us/project/task-mode-task-field), "Microsoft Project will never change the dates of a manually scheduled task". Sem preservar a marca, quem reexporta transforma a tarefa manual em automática e o MS Project a reagenda ao abrir: mudança silenciosa (Inviolável 2). No corpus: 1.136 tarefas em 38 arquivos, 32 delas nos 8 arquivos com vínculo |
| Folga de tarefa com duração corrida: medida em 24 h e exibida em dias corridos (÷ 1.440, sufixo "dc"), e não ÷ `minutosPorDia` | Exibir ÷ `minutosPorDia` | Sem isso, 1 ed de folga apareceria como "3 d". Opinião, apoiada em terceiros ([Boyle 2018](https://boyleprojectconsulting.com/tomsblog/2018/06/27/impact-of-calendars-on-schedule-slack-calculation-in-microsoft-project/)) |

### MSPDI (E3)
- **Calendários:** importa só os calendários-base (`IsBaseCalendar` 1) referenciados pelo projeto ou por uma tarefa. Os de recurso não entram e geram aviso informativo (no corpus: 152 calendários-base e 880 de recurso).
- **Refatoração inicial, sem mudar comportamento (herdada do 00003):** a leitura do calendário sai de dentro do `parseMspdiXml` (worktree `:549-641`) para uma função própria (`lerCalendarioMspdi`). O inventário do corpus fica idêntico antes de qualquer mudança de semântica.
- **Semana:** `WeekDay` 1–7 com `WorkingTimes`. `ToTime` `00:00:00` = 24:00 (1.440), e `FromTime 00:00` + `ToTime 00:00` = **dia inteiro** (0–1.440, calendário nativo "24 Hours"). São 17 ocorrências de `ToTime 00:00` no corpus, 7 delas `00:00–00:00`. Turno noturno vira 2 intervalos em dias seguidos, como o MS Project grava. Exceções legadas `DayType` 0 e `<Exception>` não recorrentes com `WorkingTimes`; recorrentes seguem a regra do 00003 (lista legada).
- **Exportação de calendários:** todos os calendários da obra (UID, nome, semana com `WorkingTimes`, exceções no formato legado com horário). `Project/CalendarUID` = padrão. `Task/CalendarUID` só na tarefa com calendário próprio, para o seed não mudar.
- **Restrições, prazo e lag:** `ConstraintType` 0–7 e `ConstraintDate` com hora; `Deadline`. Lag em qualquer `LagFormat` (3–12, 19, 20 e os estimados 35+), exato, com o código original guardado (`codigoMspdi`) e devolvido na exportação.
- **SNET inferido:** a heurística atual (tarefa sem vínculo e sem avanço recebe SNET = início do arquivo, `:692-697`) continua, mas a restrição fica marcada `inferida` e volta para o arquivo como `ConstraintType` 0. Assim a ida e volta não troca ASAP por SNET no MS Project.
- **Cabeçalho:** `MinutesPerDay` vira `minutosPorDia`. `HonorConstraints` é preservado; obra sem valor de arquivo exporta 0 (gate P2). As 4 opções Move\* são preservadas sem entrar no cálculo. `SplitsInProgressTasks` ↔ `logica`.
- **Tarefa manual:** `Manual` e `Active` lidos e devolvidos na exportação (só quando o arquivo os trouxe, para o seed não mudar).
- **Datas do arquivo:** `Start`/`Finish` e as marcas `Manual` e `LevelingDelay > 0` de cada tarefa ficam em `Task.arquivo`, para o painel.
- **Duração:** importada em minutos. Segundos são arredondados, com aviso. `DurationFormat` corrido vira `duracaoCorrida`.
- **Avisos que mudam ou somem**, com o antes e o depois no inventário do corpus:
  - A5, A6 e A7 do 00003 (tempo corrido, menos de meio dia e fração; `:773-775`): somem quando a conversão fica exata em minutos;
  - A10 (calendário próprio, `:778`) e "semana diferente de segunda a sexta" (`:639`): somem quando calendário por tarefa e semana configurável forem lidos;
  - "N vínculo(s) com lag em formato diferente de dias úteis: serão exportados em dias úteis." (`:768`; 12 vínculos `LagFormat` 9 em 6 arquivos) **some quando o E3 preservar o formato original**;
  - "linha de base 0 sem início" muda de texto no E1, junto com o CR-12.
- **Limites (T5):**
  - até 100 calendários importados;
  - **até 5 intervalos por dia**, limite do esquema MSPDI (`maxOccurs="5"`, [Calendars](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/xml-schema-for-the-calendars-element)), no tipo, no import e no export;
  - horários `hh:mm:ss` válidos;
  - a validação "`ToTime` > `FromTime`, intervalos crescentes e sem sobreposição" vale **depois** de converter `00:00` em 1.440;
  - calendário sem nenhum minuto útil na semana nem exceção útil é rejeitado: a tarefa usa o padrão, com aviso;
  - `MAX_CALENDAR_DAYS` do 00003 passa a valer para a soma de todos os calendários.

### Painel de divergências (E4)
- **Função pura:** `src/lib/divergencias.ts` (novo). Busca de equivalente: não existe comparação arquivo × cálculo no código; o E4 do 00003 é um teste, não uma função de produção.
- **Comparação:** datas (`yyyy-mm-dd`) do início e do término calculados no modo previsão contra `Task.arquivo`. A diferença sai em dias úteis do calendário padrão.
- **Causa provável, por ordem de precedência:**
  1. alterada no CronoAI depois da importação (duração, % ou restrição diferente do que veio no arquivo);
  2. agendada manualmente no MS Project;
  3. feriado nacional aplicado pelo CronoAI (o arquivo não trazia feriados) ou calendário da tarefa;
  4. restrição em conflito com vínculo;
  5. data de status (mover o restante);
  6. nivelamento ou recurso no arquivo;
  7. efeito da predecessora UID n. Quando a predecessora é manual, a causa cita "predecessora UID n agendada manualmente";
  8. não identificada.
  Cada causa é rastreável a um campo, sem heurística de texto.
- **Tela:** `src/modules/critical/DivergenciasPainel.vue` (novo), dentro do Caminho Crítico. Vizinho de referência: `src/modules/critical/ScenarioCard.vue`.

### ADR
Decisão estrutural: **ADR 00003 "Minutos inteiros persistidos"** (rascunho entregue junto). O índice `.claude/adrs/README.md` ganha a linha na tarefa 31.

## 04. Casos de referência (T1/T2)
Base comum dos casos fictícios: calendário **padrão** seg–sex 08:00–12:00 e 13:00–17:00 (480 min/dia); calendário **"Sábado 4 h"** igual mais sábado 08:00–12:00; feriados nacionais de `defaultHolidays`. Agosto de 2026 não tem feriado nacional; 07/09/2026 (segunda) é feriado. Todos os números abaixo foram feitos à mão e conferidos por um simulador descartável em minutos (fora do repositório, seção 14). O mesmo simulador reproduziu **20/20** folhas do Aurora nos dois modos.

**Fontes citadas** (conferidas pelo `especialista-obra` na tarefa 0, emenda 01). Legenda de confiança: *oficial* (página da Microsoft que afirma a regra), *oficial-arquivo* (página oficial arquivada), *empírica* (arquivo gravado pelo MS Project no corpus local), *terceiros* (não é documentação da Microsoft), *opinião*.
- **MSPDI, esquema (oficial):**
  - índice: [Project XML Data Interchange Schema Reference](https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference);
  - elementos: [Project Elements](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/project-elements-and-xml-structure), [Tasks](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/xml-schema-for-the-tasks-element) (`LinkLag` em décimos de minuto; `LagFormat`/`DurationFormat` 3–12, 19–21, 35–53), [Calendars](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/xml-schema-for-the-calendars-element) (no máximo 5 `WorkingTime` por dia), [HonorConstraints](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/honorconstraints-element) e [SplitsInProgressTasks](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/splitsinprogresstasks-element).
- **VBA (oficial):**
  - [PjConstraint](https://learn.microsoft.com/en-us/office/vba/api/project.pjconstraint): ASAP 0, ALAP 1, MSO 2, MFO 3, SNET 4, SNLT 5, FNET 6, FNLT 7, os mesmos códigos do `ConstraintType`;
  - [PjFormatUnit](https://learn.microsoft.com/en-us/office/vba/api/project.pjformatunit): **não** lista 19/20 nem define "24 h"; esses valores vêm do esquema MSPDI e do corpus;
  - [Task.Calendar](https://learn.microsoft.com/en-us/office/vba/api/project.task.calendar), [Task.ConstraintType](https://learn.microsoft.com/en-us/office/vba/api/project.task.constrainttype), [Task.Deadline](https://learn.microsoft.com/en-us/office/vba/api/project.task.deadline) e [TaskDependency.Lag](https://learn.microsoft.com/en-us/office/vba/api/project.taskdependency.lag) (lag em minutos).
- **Suporte do Microsoft Project (oficial):**
  - [Add lead or lag time to a task](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task);
  - [Set a task start or finish date (constraint)](https://support.microsoft.com/en-us/project/set-a-task-start-or-finish-date-constraint-for-a-task);
  - [Show slack in your project](https://support.microsoft.com/en-us/project/show-slack-in-your-project-in-project-desktop);
  - [Total Slack](https://support.microsoft.com/en-us/project/total-slack-task-field) e [Free Slack](https://support.microsoft.com/en-us/office/free-slack-task-field-87145b2b-8d50-45a1-b89b-89aa73015d17);
  - [Deadline](https://support.microsoft.com/en-us/project/deadline-task-field);
  - [Remaining Duration](https://support.microsoft.com/en-us/project/remaining-duration-task-field), que traz a fórmula do restante (a página VBA `Task.RemainingDuration` não traz);
  - [Create a calendar for a task within Project](https://support.microsoft.com/en-us/project/create-a-calendar-for-a-task-within-project);
  - [Task Mode](https://support.microsoft.com/en-us/project/task-mode-task-field);
  - [Planning Wizard](https://support.microsoft.com/en-us/office/planning-wizard-8ce030a9-31e4-495c-a543-7d9652384bd5);
  - [Set the status date for project reporting](https://support.microsoft.com/en-US/project/set-the-status-date-for-project-reporting).
- **Oficial-arquivo:** [PROJ_OPT_HONOR_CONSTRAINTS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg217473(v=office.15)) e [PROJ_OPT_SPLIT_IN_PROGRESS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg221759(v=office.15)), as duas com padrão True.
- **Terceiros**, usados só onde não há fonte oficial:
  - lag entre calendários: [Boyle 2018](https://boyleprojectconsulting.com/tomsblog/2018/06/27/impact-of-calendars-on-schedule-slack-calculation-in-microsoft-project/) e [Trajkovski 2013](https://ntrajkovski.com/2013/02/27/task-calendars-and-lag-in-ms-project-2013/);
  - `LinkLag` %: [docxy #104](https://github.com/yeroo/docxy/issues/104).
- **Empírica:** corpus local `referencias/mpxj-mspdi`, em especial `mspdiduration.xml` (1 ed = 08:00 → 08:00; 1 emo = `PT720H`), os calendários nativos "Night Shift" e "24 Hours" e `task-flags-project2016-mspdi.xml` (ordem `Active`, `Manual`).

| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| **CR-1** caracterização (E1: **não pode mudar**) | Seed `buildSeedState()` (Aurora, 29 tarefas, 20 folhas), início 2026-05-04, data de status 2026-10-23 | Tabela CR-1 abaixo: início, término, folga total, folga livre e crítica das 20 folhas nos modos `baseline` e `forecast`. Fim: `baseline` 2027-06-01, `forecast` 2027-06-23. Caminho crítico: `baseline` 201, 202, 203, 301, 103, 104, 105, 401, 501, 502, 701, 801, 802; `forecast` 104, 105, 401, 501, 502, 701, 801, 802. Atraso 16 d.u. EVM: PV 7.259.250,00; EV 6.448.200,00; AC 6.896.900,00; SPI 0,8883; CPI 0,9349. Cenários: crashing 105 16 → 13 d, 3 d.u., R$ 12.616,80, entrega 2027-06-18; fast-tracking 401 → SS+3 d de 105, 13 d.u., 2027-06-04; hora extra em 2026-10-24 e 2026-10-31, 2 d.u., R$ 22.315,20, 2027-06-21 | Medição do motor atual (25/10/2026, `feat/00002-multiobra` `0fabf1e`), reproduzida 20/20 por simulador independente em minutos | `src/lib/cpm.caracterizacao.test.ts` (novo, tarefa 1; verde **antes** de qualquer mudança) |
| **CR-2a** sábado 4 h | Tarefa A, 12 d (5.760 min), sem vínculo, início seg 2026-08-03 08:00 | Padrão: término **2026-08-18 17:00**. Sábado 4 h: término **2026-08-17 17:00** (1 dia antes) | `Task.Calendar` (a tarefa é agendada no calendário dela); SPEC-03 §5 (sábado de 4 h = 0,5 dia) | `cpm.test.ts` (novo) › calendário por tarefa |
| **CR-2b** sábado 4 h e sucessora | A 5 d desde sex 2026-08-07 08:00; B 1 d FS lag 0, B no padrão | A no padrão: A termina 2026-08-13 17:00; B vai de 2026-08-14 08:00 a 2026-08-14 17:00. A no sábado 4 h: A termina **2026-08-13 12:00**; B vai de **2026-08-13 13:00** a **2026-08-14 12:00** | idem; minuto útil (RF-05.1) | idem |
| **CR-2c** Aurora com 105 no sábado 4 h (modo `baseline`) | Seed com `calendarioUid` do UID 105 = "Sábado 4 h" | 105: 2026-10-14 08:00 → **2026-11-04 12:00** (hoje 2026-11-05). 401 e 106 começam **2026-11-04 13:00** (hoje 2026-11-06). Fim do projeto (802) **2027-05-31 12:00** (hoje 2027-06-01). Folga total de 302, 303 e 702: **47,5 d** (hoje 49). Folga livre de 106: **12,5 d** (hoje 11). 105, 401, 501, 502, 701 e 801 continuam críticas (folga 0) | idem. A confirmar pelo `especialista-obra`: o MS Project mostra a folga fracionária como `47,5 d` (TotalSlack em décimos de minuto ÷ 4.800) | `cpm.test.ts` › Aurora com calendário de sábado |
| **CR-2d** EVM no calendário da tarefa | Tarefa 12 d no sábado 4 h, LB 2026-08-03 → 2026-08-17, BAC R$ 12.000,00 | Total 5.760 min. Data de status 2026-08-07: PV **R$ 5.000,00** (2.400/5.760). Data de status 2026-08-08 (sábado): PV **R$ 5.500,00** (2.640/5.760) | PMBOK: PV = BAC × fração planejada. Regra do CronoAI (`calculo-precisao.md`, EVM) levada a minutos do calendário da tarefa | `evm.test.ts` (novo) |
| **CR-3** lag útil entre calendários (gate P1, emenda 01) | A no padrão, 5 d desde 2026-08-03 (termina 2026-08-07 17:00); B no sábado 4 h, FS +1 d | **Regra ativa, calendário da sucessora:** B começa **2026-08-10 13:00** (sáb 240 min + seg 240 min). Lado de controle, calendário do projeto ou da predecessora: 2026-08-11 08:00. Sucessora sem calendário próprio: conta no calendário do projeto | Sem fonte oficial. Terceiros: [Boyle 2018](https://boyleprojectconsulting.com/tomsblog/2018/06/27/impact-of-calendars-on-schedule-slack-calculation-in-microsoft-project/) e [Trajkovski 2013](https://ntrajkovski.com/2013/02/27/task-calendars-and-lag-in-ms-project-2013/), duas fontes que concordam. Confiança: terceiros. Validação final: Engenharia de planejamento no MS Project real (M-5/M-6) | `cpm.test.ts` › regra do lag entre calendários (os dois lados; a regra ativa é a sucessora) |
| **CR-4** lag `edays` (E2) | A 1 d em qua 2026-09-02 (termina 17:00); B FS +7 ed (`LinkLag` 100800, `LagFormat` 8) | B começa **2026-09-10 08:00**. Hoje: o import converte 7 ed em 5 d.u. (5/7) e B começa em 2026-09-11. Com 7 d úteis seria 2026-09-15. Segundo caso: A termina qui 2026-08-06 17:00; FS +2 ed (`LinkLag` 28800) → B **2026-08-10 08:00** (com 2 d úteis: 2026-08-11) | Esquema MSPDI [Tasks](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/xml-schema-for-the-tasks-element) (`LagFormat` 8 = ed, `LinkLag` em décimos de minuto), oficial. 24 h por ed: empírico (`mspdiduration.xml`). Confiança alta | `cpm.test.ts` › lag corrido |
| **CR-5** lag % (E2) | A 4 d, 2026-08-03 08:00 → 2026-08-06 17:00 | FS +50% → B **2026-08-11 08:00**. SS +50% → B **2026-08-05 08:00**. FS −25% → B **2026-08-06 08:00**. No MSPDI: `LinkLag` **50** (`LagFormat` 19) e **−25**, percentual inteiro, sem ÷ 10 nem × 10; a fixture do E3 usa 50. Hoje: lag zerado com aviso | % da predecessora: oficial por inferência ([Add lead or lag time to a task](https://support.microsoft.com/en-us/project/add-lead-or-lag-time-to-a-task)). Codificação do `LinkLag`: terceiros ([docxy #104](https://github.com/yeroo/docxy/issues/104), Project 2021); o corpus não tem caso. **A confirmar no M-5** | `cpm.test.ts` › lag percentual; `msProjectXmlParser.test.ts` › `LinkLag` 50 = 50% |
| **CR-6** restrições (E2), honrar = sim (P2) | A 5 d (2026-08-03 → 2026-08-07); B 2 d FS de A; restrição em B | ASAP: B 2026-08-10 → 2026-08-11; folga de A 0. SNET 2026-08-12: B 2026-08-12 → 2026-08-13; folga de A **2 d**. SNLT 2026-08-05: B 2026-08-05 → 2026-08-06; folga de A **−3 d** (FL de B 1 d, não fixada). MSO 2026-08-06: B 2026-08-06 → 2026-08-07; folga de A **−2 d**. MFO 2026-08-12: B 2026-08-11 → 2026-08-12; folga de A **1 d**. FNET 2026-08-13: B 2026-08-12 → 2026-08-13; folga de A **2 d**. FNLT 2026-08-10: B 2026-08-07 → 2026-08-10; folga de A **−1 d**. Folga total de B = 0 em todos. Folga ≤ 0 ⇒ crítica. Conflito com vínculo ⇒ `restricaoConflito` | Oficial: [PjConstraint](https://learn.microsoft.com/en-us/office/vba/api/project.pjconstraint), [Set a task start or finish date (constraint)](https://support.microsoft.com/en-us/project/set-a-task-start-or-finish-date-constraint-for-a-task), [Show slack in your project](https://support.microsoft.com/en-us/project/show-slack-in-your-project-in-project-desktop), [Total Slack](https://support.microsoft.com/en-us/project/total-slack-task-field). Oficial-arquivo: [PROJ_OPT_HONOR_CONSTRAINTS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg217473(v=office.15)) (padrão True). Confiança alta no sentido da regra e média no detalhe da volta. Os 7 casos foram conferidos pelo `especialista-obra` | `cpm.test.ts` › restrições (um `it` por tipo) |
| **CR-6b** ALAP (E2) | X 10 d (2026-08-03 → 2026-08-14); Y 3 d ALAP, sem vínculo | Y agendada **2026-08-12 08:00 → 2026-08-14 17:00**; início cedo 2026-08-03. Folga total **7 d** e folga livre **7 d**: sem sucessora, FL = FT pela definição oficial. A regra fica numa função só | FL = FT sem sucessora: oficial ([Free Slack](https://support.microsoft.com/en-us/office/free-slack-task-field-87145b2b-8d50-45a1-b89b-89aa73015d17)). FT 7 por datas cedo: opinião; nenhuma fonte oficial diz como o MS Project exibe a folga de ALAP (pode mostrar 0/0). **Exibição no MS Project: `NOT_RUN` até o M-6** | idem |
| **CR-7** prazo final (E2) | Rede do CR-6 com B ASAP e prazo final em B 2026-08-10 17:00 | B continua 2026-08-10 → 2026-08-11. `prazoFinalPerdido` = true. Folga total de B **−1 d** e de A **−1 d**; ambas críticas. Com prazo em 2026-08-14: sem indicador, folgas 0 (o prazo depois do término tardio não aumenta a folga) | Oficial: [Deadline](https://support.microsoft.com/en-us/project/deadline-task-field) e [Show slack in your project](https://support.microsoft.com/en-us/project/show-slack-in-your-project-in-project-desktop). Confiança alta | `cpm.test.ts` › prazo final |
| **CR-8** opções de progresso (E2) | A 10 d não iniciada; B 4 d FS de A, iniciada fora de sequência em 2026-08-03 com 50%; data de status 2026-08-05 | **Lógica retida:** A 2026-08-06 → 2026-08-19, **folga total 0, crítica**; B termina **2026-08-21 17:00**, **folga total 0**. Exige a regra "em retida, a sucessora iniciada restringe a predecessora": com a exceção `cpm.ts:145` em vigor, A sairia com folga 2 d, sem ser crítica. **Substituir progresso:** B termina **2026-08-07 17:00** (= hoje); **A folga total 0, B folga total 8 d**. **Mover restante** (A 5 d sem vínculo, início do projeto 2026-08-03, status 2026-08-05): `true` → A **2026-08-06 → 2026-08-12**; `false` → A **2026-08-03 → 2026-08-07** | Retida ≈ `SplitsInProgressTasks` 1: oficial ([Planning Wizard](https://support.microsoft.com/en-us/office/planning-wizard-8ce030a9-31e4-495c-a543-7d9652384bd5)) e oficial-arquivo ([PROJ_OPT_SPLIT_IN_PROGRESS](https://learn.microsoft.com/en-us/previous-versions/office/project-class/gg221759(v=office.15)), padrão True); empírica: 134/134 = 1. Confiança alta no mapeamento e média no comportamento com 0. Mover restante: **política do CronoAI**, regra de hoje em `calculo-precisao.md`. Não é o padrão do MS Project, cujas Move\* só agem ao lançar progresso ([Set the status date for project reporting](https://support.microsoft.com/en-US/project/set-the-status-date-for-project-reporting)) | `cpm.test.ts` › progresso (datas e folgas) |
| **CR-9** restante exato (E2: **antes → depois** no Aurora) | Seed, modo `forecast` | 104 (40% de 12 d): restante 3.456 min (7,2 d), hoje 8 d. 302 (78% de 36 d): 3.801,6 → **3.802 min** (7,92 d; meio para cima), hoje 8 d. **Inícios** que recuam 1 dia (antes → depois): 303 e 105 2026-11-06 → 2026-11-05; 106 e 401 2026-12-01 → 2026-11-30; 402 2026-12-15 → 2026-12-14; 501 2026-12-22 → 2026-12-21; 502 2027-01-28 → 2027-01-27; 601 2027-01-14 → 2027-01-13; 602 e 701 2027-03-15 → 2027-03-12; 702 2027-01-06 → 2027-01-05; 801 2027-06-10 → 2027-06-09. **Términos:** mesmas datas, com hora 09:36 (cadeia do 104) ou 16:22 (cadeia do 302). Folga total de 302, 303 e 702: 56 → **55,28 d** (26.534 min). **Mantidos:** entrega 2027-06-23 (09:36), +16 d.u., SPI e CPI. N-2: entrega 2027-06-16. N-3: entrega 2027-06-18 | Oficial: [Remaining Duration](https://support.microsoft.com/en-us/project/remaining-duration-task-field), "Remaining Duration = Duration − (Duration × Percent Complete)". O MS Project pode mostrar 16:21 ou 16:22 na cadeia do 302: tolerância de 1 min só aqui (ADR 00003) | `cpm.caracterizacao.test.ts` atualizado com o antes → depois; `useProjectStore.test.ts` N-1 a N-3 inalterados |
| **CR-10** duração corrida (E2/E3) | Tarefa 1 dc (`PT24H0M0S`, `DurationFormat` 8) desde sex 2026-08-07 08:00 | Término **sáb 2026-08-08 08:00**. Folga dessa tarefa medida em 24 h e exibida em dias corridos ("dc"). Hoje: lido como 3 d úteis (término 2026-08-11 17:00, com aviso) | Empírica: `mspdiduration.xml` (MS Project 2007, UID 8 `PT24H0M0S`/fmt 8, de 08:00 a 08:00 do dia seguinte; UID 10 `PT720H`/fmt 12 = 1 emo = 30 ed). Confiança alta. Exibição da folga: opinião, apoiada em terceiros (Boyle 2018) | `cpm.test.ts` + `msProjectXmlParser.test.ts` |
| **CR-11** `indexOnOrBefore` antes da data-base (E1; acréscimo do coordenador) | `WorkCalendar` com base 2026-05-04 e feriados do seed: `indexOnOrBefore('2026-04-30')` (quinta útil; 01/05 é feriado). Base 2026-10-26: `indexOnOrBefore('2026-10-23')` (sexta útil) e `('2026-10-24')` (sábado) | **−1**, **−1** e **−1** (hoje −2, −2 e −1). Correção: `-this.countWorkingBetween(addCalendarDays(iso, 1), this.baseDate) - 1` | Definição do próprio método: "índice do dia útil em `iso`; se não for útil, o dia útil anterior". Achado do `especialista-obra` | `calendar.test.ts` |
| **CR-11b** Aurora com início depois da data de status (E1) | Seed com `meta.startDate` = 2026-10-26 (e também 2026-11-03), data de status 2026-10-23, modo `forecast` | Entrega **2027-06-23** e atraso **16 d.u.**; 104 termina 2026-11-05; 105 começa 2026-11-06. Hoje: entrega 2027-06-22 e 15 d.u. (antecipa por causa do CR-11) | Regra "sucessora começa depois da data de status"; medição com e sem a correção (seção 14) | `cpm.test.ts` › início depois da data de status. A validação da data de início em `obras.ts` (00002) impede o caso pela tela, mas não pelo import |
| **CR-12** LB0 só com término não é sobrescrita (E1; acréscimo do coordenador) | Seed com UID 303 sem `baselineStart` e com `baselineFinish` 2027-01-29; `withBaseline(tasks, baseline, true)` | 303 mantém `baselineStart` `undefined` e `baselineFinish` **2027-01-29**. Hoje vira 2026-10-23 → 2026-12-21 (o término do arquivo se perde). Tarefa sem LB0: preenchida como hoje. Com as duas datas: intocada. **No mesmo diff** (herdado do 00003): o aviso do parser "N tarefa(s) com linha de base 0 sem início: a linha de base delas será recalculada pelo cronograma ao importar." (worktree `:733`, `:772`) passa a "N tarefa(s) com linha de base 0 sem início: o término do arquivo é mantido e o valor planejado (PV) delas fica zero.". Atualizar também o teste C-4b (`msProjectXmlParser.test.ts:283-288`) e as duas asserções do corpus (`msProjectXmlParser.corpus.test.ts:346` e `:505`): a contagem continua `{ total: 12, arquivos: 8 }`, muda só o texto | Decisão A3 do plano 00003 (mantém o que o arquivo trouxe e avisa que o PV fica zero) e Inviolável 2 | `cpm.test.ts` › `withBaseline`; `useProjectStore.obras.test.ts` › import com LB0 só de término (PV da tarefa 0); `msProjectXmlParser.test.ts` › C-4b |

### Tabela CR-1 — as 20 folhas do Aurora (código atual; o E1 não pode mudar nenhuma célula)
FT = folga total (d), FL = folga livre (d), C = crítica. Na previsão, a tarefa concluída mostra FT 0 e não é crítica.

| UID | Dur. (d) | Vínculos | % | Linha de base: início → término | FT | FL | C | Previsão: início → término | FT | FL | C |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 201 | 10 | — | 100 | 2026-05-04 → 2026-05-15 | 0 | 0 | sim | 2026-05-04 → 2026-05-15 | 0 | 0 | não |
| 202 | 20 | 201FS | 100 | 2026-05-18 → 2026-06-15 | 0 | 0 | sim | 2026-05-18 → 2026-06-17 | 0 | 0 | não |
| 203 | 15 | 202FS | 100 | 2026-06-16 → 2026-07-06 | 0 | 0 | sim | 2026-06-18 → 2026-07-10 | 0 | 0 | não |
| 301 | 40 | 203FS | 100 | 2026-07-07 → 2026-08-31 | 0 | 0 | sim | 2026-07-13 → 2026-09-11 | 0 | 0 | não |
| 302 | 36 | 301FS | 78 | 2026-09-01 → 2026-10-22 | 49 | 0 | não | 2026-09-14 → 2026-11-05 | 56 | 0 | não |
| 303 | 40 | 302FS | 0 | 2026-10-23 → 2026-12-21 | 49 | 0 | não | 2026-11-06 → 2027-01-05 | 56 | 0 | não |
| 103 | 12 | 301FS+5 | 100 | 2026-09-09 → 2026-09-24 | 0 | 0 | sim | 2026-09-16 → 2026-10-02 | 0 | 0 | não |
| 104 | 12 | 103FS | 40 | 2026-09-25 → 2026-10-13 | 0 | 0 | sim | 2026-10-05 → 2026-11-05 | 0 | 0 | sim |
| 105 | 16 | 104FS | 0 | 2026-10-14 → 2026-11-05 | 0 | 0 | sim | 2026-11-06 → 2026-11-30 | 0 | 0 | sim |
| 106 | 60 | 105FS, 302FS | 0 | 2026-11-06 → 2027-02-02 | 60 | 11 | não | 2026-12-01 → 2027-02-26 | 60 | 4 | não |
| 401 | 55 | 105FS | 0 | 2026-11-06 → 2027-01-26 | 0 | 0 | sim | 2026-12-01 → 2027-02-19 | 0 | 0 | sim |
| 402 | 60 | 401SS+10 | 0 | 2026-11-23 → 2027-02-18 | 10 | 0 | não | 2026-12-15 → 2027-03-12 | 10 | 0 | não |
| 501 | 75 | 401SS+15 | 0 | 2026-11-30 → 2027-03-18 | 0 | 0 | sim | 2026-12-22 → 2027-04-12 | 0 | 0 | sim |
| 502 | 55 | 501SS+25 | 0 | 2027-01-06 → 2027-03-25 | 0 | 0 | sim | 2027-01-28 → 2027-04-19 | 0 | 0 | sim |
| 601 | 45 | 501SS+15 | 0 | 2026-12-21 → 2027-02-25 | 30 | 20 | não | 2027-01-14 → 2027-03-19 | 30 | 20 | não |
| 602 | 50 | 601SS+20, 402FS | 0 | 2027-02-19 → 2027-05-03 | 10 | 10 | não | 2027-03-15 → 2027-05-25 | 10 | 10 | não |
| 701 | 60 | 502SS+30 | 0 | 2027-02-19 → 2027-05-17 | 0 | 0 | sim | 2027-03-15 → 2027-06-09 | 0 | 0 | sim |
| 702 | 50 | 303FS, 106SS+20 | 0 | 2026-12-22 → 2027-03-05 | 49 | 49 | não | 2027-01-06 → 2027-03-18 | 56 | 56 | não |
| 801 | 10 | 701FS, 602FS, 702FS | 0 | 2027-05-18 → 2027-06-01 | 0 | 0 | sim | 2027-06-10 → 2027-06-23 | 0 | 0 | sim |
| 802 | 0 (marco) | 801FS | 0 | 2027-06-01 → 2027-06-01 | 0 | 0 | sim | 2027-06-23 → 2027-06-23 | 0 | 0 | sim |

### Casos do painel de divergências (E4)
XML fictício `src/lib/__fixtures__/mspdi-divergencias.xml`: início 2026-08-31, **sem feriados** no calendário (o CronoAI aplica os nacionais, como hoje).
- **D-1:** T1 5 d, de 2026-08-31 a 2026-09-04. Igual ao arquivo: não aparece no painel.
- **D-2:** T2 5 d, FS de T1. Arquivo: 2026-09-07 → 2026-09-11. Calculado: **2026-09-08 → 2026-09-14** (07/09 é feriado), diferença de +1 d.u. Causa: "feriado nacional aplicado pelo CronoAI (o arquivo não trazia feriados)".
- **D-3:** T3 2 d, FS de T2. Arquivo: 2026-09-14 → 2026-09-15. Calculado: **2026-09-15 → 2026-09-16**. Causa: "efeito da predecessora UID 2".
- **D-4:** T4 2 d, FS de T1, `<Manual>1`. Arquivo: 2026-09-14 → 2026-09-15. Calculado: **2026-09-08 → 2026-09-09**, diferença de **−4 d.u.**. Causa: "agendada manualmente no MS Project".
- **D-5:** depois de importar, a duração de T1 passa a 6 d. T1 calculada 2026-08-31 → **2026-09-08** × arquivo 2026-09-04, diferença de **+1 d.u.** (07/09 é feriado). Causa: "alterada no CronoAI após a importação".
- **D-6:** T5 1 d, FS de T4 (a manual). Arquivo: 2026-09-16. Calculado: **2026-09-10**, diferença de **−4 d.u.**. Causa: "predecessora UID 4 agendada manualmente" (a sucessora aponta para o UID da manual).

Fonte: regras do próprio painel (RF-05.8); as datas seguem o calendário padrão com os feriados nacionais.

## 05. MS Project e arquivos (T3)
- **Arquivos de exemplo (fictícios, versionados):**
  - `src/lib/__fixtures__/mspdi-calendarios-restricoes.xml` (novo, E3). Conteúdo:
    - 4 calendários-base: UID 1 "Padrão"; UID 2 "Sábado 4 h"; UID 3 "Noturno", com 23:00–24:00 gravado como `ToTime 00:00:00` e 00:00–08:00 no dia seguinte, no máximo 5 intervalos por dia; UID 4 "24 Horas", com `00:00–00:00` = dia inteiro;
    - exceção útil com horário (sábado 2026-08-15 08:00–12:00 no padrão);
    - tarefas com `CalendarUID` 2, 3 e 4;
    - os 8 `ConstraintType`, com `ConstraintDate` com hora, e `Deadline`;
    - lags nos códigos 3 a 12, 19 (`LinkLag` **50** = 50%), 20, 35 e 39, e um lag negativo;
    - `DurationFormat` 8;
    - uma tarefa `<Active>1</Active><Manual>1</Manual>`;
    - cabeçalho com `HonorConstraints` 0, `SplitsInProgressTasks` 1, as 4 Move\* = 0 e `MinutesPerDay` 480. Uma variante em teste troca para 450 e liga uma Move\*.
  - `src/lib/__fixtures__/mspdi-divergencias.xml` (novo, E4).
  - O seed (Aurora) e o corpus local do MPXJ (`CRONOAI_REF_DIR`, fora do git).
- **Preservado na ida e volta:**
  - o que o 00003 já preserva: UID, nome, vínculos (UID e tipo), % concluído, datas reais, LB0 (inclusive incompleta);
  - **agora também:**
    - duração em minutos, com tolerância de 1 min só quando o arquivo traz segundos (com aviso) ou a duração vem de %;
    - `DurationFormat` corrido;
    - lag: tipo, valor e `LagFormat` original (o % volta como percentual inteiro);
    - calendários-base usados: UID, nome, semana com horários (até 5 por dia; `00:00–00:00` = dia inteiro) e exceções com horário;
    - `CalendarUID` da tarefa;
    - `ConstraintType` e `ConstraintDate` com hora (SNET inferido volta como 0) e `Deadline`;
    - `Manual` e `Active`;
    - no cabeçalho: `MinutesPerDay`, `HonorConstraints` (0 quando a obra não veio de arquivo), `SplitsInProgressTasks` e as 4 Move\*.
- **Elementos novos no `SCHEMA_ORDER`:**
  - `Task` ganha **`Active` e `Manual`** depois de `Name` e antes de `Type`, a ordem do MSPDI 2010+ (empírica: `task-flags-project2016-mspdi.xml`). São gravados só quando o arquivo os trouxe; o seed não muda.
  - `ConstraintType`, `CalendarUID`, `ConstraintDate` e `Deadline` já estão nessa ordem (worktree `:66-67`), e `Project` já lista `SplitsInProgressTasks`, `HonorConstraints` e as Move\*.
  - Entram duas subsequências só para validar a ordem dentro de `WorkingTimes`: `WorkingTime: ['FromTime', 'ToTime']` e `TimePeriod: ['FromDate', 'ToDate']`.
- **Exportação do seed:**
  - E1: **idêntica** à de hoje, salvo `CreationDate`/`LastSaved` (R-1).
  - E3: muda só no que está declarado (antes → depois no PR). Entra `SplitsInProgressTasks` 1. `Start`, `Finish`, `EarlyStart`, `EarlyFinish`, `LateStart`, `LateFinish`, `TotalSlack` e `FreeSlack` passam a ter as horas e as folgas exatas, que o restante exato do E2 introduziu (ex.: 801 com `Finish` 2027-06-23T09:36:00).
  - O resto fica igual: calendário com o mesmo nome, semana e exceções, `Duration` e `LinkLag`/`LagFormat` 7.
- **Comportamento esperado no MS Project:** os calendários aparecem em "Alterar período útil" com os nomes e horários. A tarefa com calendário próprio mostra o ícone de calendário. Restrições e prazo aparecem nas colunas e indicadores. Lags aparecem como `7 dd`, `50%` etc. Abrir no MS Project real: **`M-5` `NOT_RUN`** (sem acesso). A paridade da SPEC-05 §5 segue pendente (5 cronogramas reais anonimizados).
- **Avisos ao usuário no import:**
  - **Novos:**
    - segundos arredondados para o minuto;
    - calendário rejeitado (sem tempo útil, horário inválido, mais de 5 intervalos por dia ou acima dos limites);
    - `WorkWeeks` não aplicadas;
    - `LagFormat` 20 (% decorrido) calculado como % útil;
    - tarefas agendadas manualmente calculadas automaticamente (a marca é preservada).
  - **Informativos, no aviso único do 00003:** calendários de recurso ou sem uso não importados.
  - **Removidos ou alterados**, porque os dados agora são preservados:
    - A5, A6, A7 e A10 do 00003;
    - "semana diferente de segunda a sexta";
    - "lag em formato diferente de dias úteis: serão exportados em dias úteis" (12 vínculos `LagFormat` 9 no corpus);
    - "LB0 sem início", com texto novo no E1 (CR-12).

## 06. Estado salvo (T4) — migração esquema 2 → 3
- **Onde:** `src/lib/migracaoEstado.ts`. `ESQUEMA_ATUAL = 3` e passo `{ de: 2, para: 3, aplicar }` em `MIGRACOES`. A cadeia 1 → 2 → 3 serve à chave `cronoai-state-v1` (esquema 1) e aos registros do IndexedDB (esquema 2). Cada obra é migrada ao ser lida (`migrarRegistro`, chamado na carga e na troca de obra) e regravada no esquema 3 na próxima gravação.
- **Conversões do passo, pura e determinística:**
  - `tasks[].durationDays` → `duracaoMin = Math.round(durationDays) × 480`. É o mesmo arredondamento que o motor de hoje aplica (`cpm.ts:113`), então nenhum número muda.
  - `predecessors[].lagDays` → `lag: { tipo: 'util', minutos: Math.round(lagDays × 480) }`.
  - `snet` → `restricao: { tipo: 'SNET', data: snet }` (data só, ou seja, início do expediente).
  - `baselineDuration` → `baselineDuracaoMin` (× 480).
  - `calendar { holidays, extraWorkingDays }` → `calendarios: [padrão uid 1 'Padrão Obra (seg-sex, 8h)']` com `holidays` como exceções não úteis e `extraWorkingDays` como exceções úteis 08:00–12:00/13:00–17:00. `calendarioPadraoUid` = 1.
  - `meta.minutosPorDia` fica ausente (= 480).
  - **`undo` por obra:** em cada `ScenarioUndo`, as chaves de `before` (`Partial<Task>`) e de `result.taskPatch.patch` passam pelas mesmas conversões de tarefa (`durationDays`, `predecessors[].lagDays`, `snet`, `baselineDuration`). Chave desconhecida passa intacta. `addedDays` continua lista de datas. `undoScenario` passa a remover essas datas das exceções úteis do calendário padrão. `result` (números exibidos em dias) não muda.
- **`completarChaves` por versão:** para esquema ≤ 2, como hoje (completa `calendar`) e depois converte. Para o esquema 3, completa `calendarios` ausente ou inválido com o padrão de `defaultHolidays(ano, ano + 3)` e `calendarioPadraoUid` = 1, com o aviso de chaves preenchidas que já existe. Tarefa sem `duracaoMin` numérico no esquema 3 torna o registro ilegível (não se inventa duração).
- **Campos opcionais dos E2–E4** (`opcoesCronograma`, `prazoFinal`, `duracaoCorrida`, `arquivo`, `honorConstraintsArquivo`, tipos novos de `Lag` e `Restricao`): **sem passo novo**. Ausente = comportamento padrão. União mais larga não invalida dado antigo. Um teste prova que um registro de esquema 3 sem esses campos abre com os mesmos números.
- **Seed e obra em branco:** `buildSeedState()` (via `seed.ts` com helper `dias(n)`) e `obras.ts:70` já nascem no esquema 3.
- **Compatibilidade e rollback:**
  - App antigo (esquema 2) diante de obra no esquema 3: recusa ("salva por uma versão mais nova") e **nunca sobrescreve** (ADR 00002). Reverter o ciclo deixa as obras migradas intactas, mas inacessíveis até reaplicar.
  - A chave `cronoai-state-v1` continua só lida.
  - O rollback é do ciclo inteiro (os 4 commits juntos). Reverter só o E2 a E4 com obras já gravadas com campos novos não é suportado; registrar no PR.
- **Testes do formato anterior:**
  - fixture v1 (`estado-v1-aurora.json`) → esquema 3 com `duracaoMin`/`lag` exatos (ex.: 402 com `lag { util, 4800 }`, 104 com `duracaoMin` 5760), mesmo cronograma da CR-1;
  - registro esquema 2 → 3;
  - fixture nova `estado-v2-aurora-cenarios.json` (tarefa 1) com os 3 cenários aplicados → depois da migração, o cronograma é o gravado com a fixture. Desfazer os 3 cenários devolve 105 a 7.680 min com as equipes originais, 401 a `FS` lag 0 e o calendário padrão sem 2026-10-24/31, com entrega 2027-06-23;
  - esquema 4 recusado;
  - esquema 3 sem `calendarios`.

## 07. Dados (T8 com banco)
Não se aplica: sem backend.

## 08. Segurança
| Superfície | Ameaça | Mitigação | Teste |
|---|---|---|---|
| Calendários do MSPDI (T5) | Laço sem fim ou CPU com calendário sem tempo útil; memória com milhares de calendários e intervalos | Calendário sem minuto útil na semana nem exceção útil é rejeitado no import (padrão + aviso). Até 100 calendários importados e **5 intervalos por dia** (limite do esquema), com aviso. `00:00–00:00` é aceito como dia inteiro. `ToTime > FromTime` validado depois de 00:00 → 1.440. `MAX_CALENDAR_DAYS` total | **S-1:** XML com calendário todo não útil; 101 calendários; **6 intervalos** num dia; `ToTime` < `FromTime`; horário `25:00` → aviso e import concluído sem travar (teste com tempo < 2 s). Calendário "24 Horas" (`00:00–00:00`) aceito, com 1.440 min/dia |
| Motor (T5) | Datas absurdas (`ConstraintDate` 9999-12-31, `LinkLag` gigante, % 10⁹) estouram o horizonte | Horizonte dinâmico com teto de 50 anos: erro explícito em português na tela, nunca `NaN`/`Infinity`. Valores do import fora da faixa (lag acima de ±10 anos, % fora de −1.000 a 1.000) são recusados com aviso | **S-2:** os 3 casos → aviso no import; motor direto com data fora do teto → `Error` com mensagem em português |
| Texto do arquivo na tela | XSS pelo nome do calendário ou da tarefa no painel | Nomes só por interpolação de texto (sem `v-html`). Avisos sem conteúdo do arquivo (só números e UIDs, padrão do 00003) | **S-3:** revisão do diff + `validar-regras.mjs` (`v-html`) |
| Parser | Regressão no endurecimento do 00003 | DOCTYPE/ENTITY recusados e `MAX_MSPDI_CHARS` mantidos | **S-4:** testes do 00003 inalterados e verdes |
| Dependências | Pacote novo | Nenhum | **S-5:** `auditar-dependencias.mjs --base {BASE}` sem pacote novo |
| Fixtures | Dado real de obra | Só XML fictícios e o Aurora; corpus fora do git | **S-6:** revisão |

Validação com a **Segurança da Informação:** não exigida (sem superfície nova em produção além do parser no navegador). O `seguranca` confere S-1 a S-6.

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| E1 | Motor em minutos, calendários, calendário por tarefa e migração 2 → 3 (números do seed idênticos) | `src/lib` (novo `calendarioTrabalho.ts`; `calendar`, `cpm`, `evm`, `scenarios`, `wbs`, `fieldAi`, `obras`, `migracaoEstado`; parser só adaptado), tipos, `seed.ts`, store e ajustes mecânicos de tela | AC-1 a AC-5, AC-14 | `refactor(motor): cronograma em minutos com calendários e calendário por tarefa (ciclo 00004)` |
| E2 | Restrições, prazo final, lag corrido/%, duração corrida e opções de progresso | `cpm.ts`, tipos, consumidores, formatação de folga fracionária nas telas | AC-6 a AC-9 | `feat(motor): restrições, prazo final, lag em dias corridos e % e opções de progresso (ciclo 00004)` |
| E3 | MSPDI de ida e volta: calendários, `CalendarUID`, restrições, `Deadline`, todos os `LagFormat` | `msProjectXmlParser.ts`, testes, fixture, corpus, `importXml`/`exportXml` | AC-10, AC-11 | `feat(mspdi): calendários, restrições, prazo final e lag em todos os formatos na ida e volta (ciclo 00004)` |
| E4 | Painel de divergências, edição na EAP, opções da obra e documentação | `divergencias.ts`, store, telas, E2E, docs | AC-12, AC-13, AC-15 | `feat(cronograma): painel de divergências com o MS Project e edição de restrições (ciclo 00004)` |

São cerca de 31 tarefas e 60 arquivos no ciclo. O E1 é o maior (cerca de 30 arquivos, a maioria troca mecânica de nome de campo, que não dá para quebrar sem deixar o `typecheck` vermelho). Ele tem checkpoint obrigatório depois da tarefa 6 (seção 10). Cada entregável passa no `npm run ci` sozinho; o corpus e o desempenho estrito são locais.

## 10. Tarefas
| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | **Concluída** (emenda 01): parecer `scratchpad/planos/00004-tarefa0-especialista.md`, com os itens "a confirmar" e os links da seção 04 conferidos. P1 alterado pelo orquestrador para "calendário da sucessora". As correções estão na seção 15 | especialista-obra (leitura) | — (ciclo) | gate |
| 1 | E1 | Caracterização **antes de mexer**: `cpm.caracterizacao.test.ts` com a tabela CR-1 inteira (as 20 folhas × 2 modos × 5 campos, fim, caminho crítico, EVM, cenários). Fixture `estado-v2-aurora-cenarios.json` gerada pela store atual com os 3 cenários aplicados, guardando o `projectFinish` resultante no teste. **Verde no código atual** | dev-frontend | `src/lib/cpm.caracterizacao.test.ts`, `src/lib/__fixtures__/estado-v2-aurora-cenarios.json` | 0 (P1) |
| 2 | E1 | CR-11 (`indexOnOrBefore`) e CR-12 (`withBaseline`), com teste antes da correção (vermelho → verde) e CR-11b. **No mesmo diff**, o texto do aviso "LB0 sem início" do parser, o teste C-4b e as asserções do corpus `:346`/`:505` (contagem 12/8 igual) | dev-frontend | `src/lib/calendar.ts`, `src/lib/calendar.test.ts`, `src/lib/cpm.ts`, `src/lib/cpm.test.ts` (novo), `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts`, `src/lib/msProjectXmlParser.corpus.test.ts` | 1 |
| 3 | E1 | Tipos novos (seção 03) e ADR aplicado | dev-frontend | `src/types/domain.ts`, `src/types/obra.ts`, `src/types/msProject.ts` | 2 |
| 4 | E1 | `calendarioTrabalho.ts` com testes. Conteúdo: compilação (semana + exceções; **no máximo 5 intervalos por dia**; `00:00–00:00` = dia inteiro; validação de intervalos depois de 00:00 → 1.440); conversão momento ↔ minuto útil; `somarUteis`; normalização de início e término; `minutosUteisEntre`; horizonte dinâmico com teto; calendário sem tempo útil → erro; calendário de 24 h interno; conversões dias ↔ minutos e data-hora sem fuso. Testes com CR-2a/2b (aritmética) e bordas: feriado, fim de semana, marco, lag negativo, 23:59 → 00:00, "24 Horas" e "Noturno" | dev-frontend | `src/lib/calendarioTrabalho.ts`, `src/lib/calendarioTrabalho.test.ts` | 3 |
| 5 | E1 | Motor: `computeSchedule(tasks, calendarios, opts)` em minutos; calendário por tarefa; lag útil no **calendário da sucessora** (do projeto quando ela não tem calendário próprio; gate P1, emenda 01); SNET; previsão idêntica a hoje (restante `⌈⌉` em dias); `ScheduledTask` com minutos e datas. CR-2a/2b/2c, CR-3 (ativo 2026-08-10 13:00) e teste de propriedade (folga ≥ 0 fora do caminho crítico, 200 redes aleatórias com semente fixa). `cpm.caracterizacao.test.ts` verde **sem alteração** | dev-frontend | `src/lib/cpm.ts`, `src/lib/cpm.test.ts` | 4 |
| 6 | E1 | Migração 2 → 3 (seção 06) com os testes do formato anterior | dev-frontend | `src/lib/migracaoEstado.ts`, `src/lib/migracaoEstado.test.ts` | 3 |
| — | E1 | **Checkpoint obrigatório:** arquivos tocados, CR-1 verde sem alteração, decisão P1 aplicada. O orquestrador confere contra o plano antes da tarefa 7 | orquestrador | — | 5, 6 |
| 7 | E1 | Consumidores em `src/lib`: `evm.ts` (minutos no calendário da tarefa sem exceções úteis; CR-2d), `scenarios.ts` (hora extra como exceção útil no padrão; crashing e fast-tracking em minutos), `wbs.ts`, `fieldAi.ts` (nome), `obras.ts`, `msProjectXmlParser.ts` (só adaptação: exportação idêntica; importação em `duracaoMin`/`lag util`/`restricao SNET`/`calendarios[padrão]`). Testes vizinhos com os **mesmos** números | dev-frontend | `src/lib/{evm,scenarios,wbs,fieldAi,obras,msProjectXmlParser}.ts`, `src/lib/evm.test.ts` (novo), `src/lib/{scenarios,modules45,msProjectXmlParser,core,obras,supplies}.test.ts`, `src/lib/msProjectXmlParser.corpus.test.ts` | 5, 6 |
| 8 | E1 | Store e seed: `calendarios` compilados (derivados), `schedule`, `baselineFor`, `buildSeedState`, `applyScenario`/`undoScenario` nas exceções, `importXml`/`exportXml`, `msProjectTasks` (`Duration` em dias), `SinapiInsert` e lote do orçamento (dias → minutos) | dev-frontend | `src/data/seed.ts`, `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.test.ts`, `src/stores/useProjectStore.obras.test.ts` | 7 |
| 9 | E1 | Telas (mecânico, mesma exibição): Gantt (marco por `duracaoMin`), Caminho Crítico (datas tardias de `ScheduledTask`, duração em dias), SINAPI, EAP (entrada de duração em dias inteiros, como hoje), planilha (rótulo do lag por `wbs.ts`) | dev-frontend | `src/components/gantt/GanttChart.vue`, `src/modules/CriticalPathModule.vue`, `src/modules/SinapiModule.vue`, `src/modules/WbsModule.vue`, `src/modules/sinapi/BudgetSheet.vue` | 8 |
| 10 | E1 | Desempenho: gerador sintético determinístico (3.000 folhas, 100 frentes, cerca de 6.000 vínculos, 3 calendários, 30% fora do padrão) e medição (seção 11) | dev-frontend | `src/lib/cpm.desempenho.test.ts` (novo) | 5 |
| 11 | E1 | Evidências: exportação do seed antes × depois (diff vazio, com `CreationDate`/`LastSaved` normalizados; script descartável fora do repo); corpus local (inventário e 83/104, 100/104 iguais); E2E | orquestrador | — (ciclo) | 9, 10 |
| 12 | E2 | Tipos ampliados (`Lag` corrido/%, `Restricao` 8 tipos, `prazoFinal`, `duracaoCorrida`, `opcoesCronograma`) | dev-frontend | `src/types/domain.ts`, `src/types/msProject.ts` | E1 |
| 13 | E2 | Motor: restrições (ida, volta, honrar = P2), ALAP (FT = FL = 7 d no CR-6b, regra numa função só), prazo final e indicadores (`prazoFinalPerdido`, `restricaoConflito`), lag corrido e % (formatos corridos declarados na seção 03), duração corrida no calendário de 24 h, com a folga medida em 24 h. CR-4 a CR-7, CR-10 | dev-frontend | `src/lib/cpm.ts`, `src/lib/calendarioTrabalho.ts`, `src/lib/cpm.test.ts` | 12 |
| 14 | E2 | Progresso: lógica retida (a sucessora iniciada restringe a predecessora na volta; a exceção `:145` só em `'substituir'`), substituir, mover restante (política do CronoAI) e restante exato. CR-8 com datas e folgas (retida A 0/B 0; substituir A 0/B 8 d), CR-9 com antes → depois em `cpm.caracterizacao.test.ts` | dev-frontend | `src/lib/cpm.ts`, `src/lib/cpm.test.ts`, `src/lib/cpm.caracterizacao.test.ts` | 13 |
| 15 | E2 | `fmtDiasUteis(min, minutosPorDia)` (1 casa, pt-BR) e `fmtDiasCorridos(min)` (÷ 1.440, sufixo "dc", para a folga de tarefa corrida), usados nas telas que mostram folga e duração; rótulo do lag em `wbs.ts` (`+7dc`, `+50%`); `msProjectTasks` com `LinkLag`/`LagFormat` | dev-frontend | `src/lib/format.ts`, `src/lib/format.test.ts`, `src/lib/wbs.ts`, `src/stores/useProjectStore.ts`, `src/modules/CriticalPathModule.vue`, `src/modules/WbsModule.vue`, `src/modules/SinapiModule.vue` | 14 |
| 16 | E2 | Store: N-1 a N-3 inalterados; opções padrão; E2E local verde | dev-frontend | `src/stores/useProjectStore.test.ts` | 15 |
| 17 | E3 | **Primeiro**, extrair a leitura do calendário de dentro do `parseMspdiXml` para `lerCalendarioMspdi`, sem mudar comportamento (corpus idêntico). **Depois**, o import da seção 03 (MSPDI): calendários-base com até 5 intervalos e `00:00–00:00`, `CalendarUID`, restrições, `Deadline`, todos os `LagFormat` (% = percentual inteiro), `Manual`/`Active`, Move\*, limites S-1/S-2 e avisos novos e removidos (seção 05) | dev-frontend | `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts` | E2 |
| 18 | E3 | Export: vários calendários (até 5 intervalos por dia), `CalendarUID`, `ConstraintType`/`ConstraintDate`, `Deadline`, `LinkLag`/`LagFormat` preservados (% como percentual inteiro), `DurationFormat` 8, `MinutesPerDay`, `HonorConstraints` (0 para obra sem valor de arquivo), `SplitsInProgressTasks`, as 4 Move\* preservadas, `Active`/`Manual` quando vieram do arquivo, horas reais. No `SCHEMA_ORDER`: `Active` e `Manual` em `Task` e as subsequências `WorkingTime`/`TimePeriod` | dev-frontend | idem | 17 |
| 19 | E3 | Fixture `mspdi-calendarios-restricoes.xml` (seção 05: "24 Horas", "Noturno", tarefa manual, `LinkLag` 50) e ida e volta completa com `strictOrder`; XML malformado; S-1/S-2 (6 intervalos no dia) | dev-frontend | `src/lib/__fixtures__/mspdi-calendarios-restricoes.xml`, `src/lib/msProjectXmlParser.test.ts` | 18 |
| 20 | E3 | Store: `importXml` grava `Task.arquivo`, opções e `honorConstraintsArquivo`; `exportXml`; teste do import da fixture com os números do CR-2b e CR-6 | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.obras.test.ts` | 19 |
| 21 | E3 | Corpus local. Inventário de avisos antes → depois: A5 5→0, A6 4→0, A7 20→0, A10 1→0, "formato diferente de dias úteis" 12→0 (6 arquivos) e "semana diferente de segunda a sexta" → 0. Ida e volta 95/95 com os campos novos, inclusive `Manual`. Comparação de datas com a contagem nova fixada e as diferenças por UID no relatório | dev-frontend | `src/lib/msProjectXmlParser.corpus.test.ts` | 20 |
| 22 | E3 | Evidência: diff da exportação do seed E2 × E3 = só o declarado na seção 05 | orquestrador | — | 21 |
| 23 | E4 | `divergencias.ts` e testes D-1 a D-6, com as diferenças em d.u. fixadas (D-4 −4, D-5 +1, D-6 −4) | dev-frontend | `src/lib/divergencias.ts`, `src/lib/divergencias.test.ts`, `src/lib/__fixtures__/mspdi-divergencias.xml` | E3 |
| 24 | E4 | Store: derivado `divergencias`; ações `definirRestricao`, `definirPrazoFinal`, `definirCalendarioTarefa`, `definirOpcoesCronograma` (validam data, tipo e calendário existente) | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.test.ts` | 23 |
| 25 | E4 | `DivergenciasPainel.vue` no Caminho Crítico: tabela com UID, nome, datas do arquivo × calculadas, diferença em d.u. e causa; filtro por causa; estado vazio; só texto | dev-frontend | `src/modules/critical/DivergenciasPainel.vue`, `src/modules/CriticalPathModule.vue` | 24 |
| 26 | E4 | EAP: colunas de restrição (tipo + data), prazo final e calendário da tarefa (lista dos calendários existentes; criar calendário é do 00005). Indicadores de prazo perdido e restrição em conflito (rótulo e ícone, não só cor) na EAP e no Caminho Crítico | dev-frontend | `src/modules/WbsModule.vue`, `src/modules/CriticalPathModule.vue` | 24 |
| 27 | E4 | Opções de cronograma da obra (lógica retida/substituir, mover restante) no formulário de dados da obra | dev-frontend | `src/modules/obras/ObraDadosForm.vue` | 24 |
| 28 | E4 | E2E: importar `mspdi-divergencias.xml` → painel com D-2, D-3 e D-4 e causas; editar o prazo final de uma tarefa para antes do término → indicador; KPIs do Aurora inalterados | dev-frontend | `e2e/cronograma.spec.ts` (novo) | 25–27 |
| 29 | E4 | Docs: `CLAUDE.md` (convenção de minutos; mapa com `calendarioTrabalho.ts`/`divergencias.ts`; dívida "CPM em dias inteiros, calendário único" substituída pelas dívidas novas da seção 12), `calculo-precisao.md` (unidades, fórmulas de restrição, prazo, lag, progresso, regra P1), `msproject-mspdi.md` (`LagFormat` exato, calendários, restrições, `HonorConstraints`), `divida-conhecida.md` (remover 5/7, lag % `undefined`, `LagFormat` 7 fixo, horizonte de 1.600 dias e a linha do `indexOnOrBefore`; acrescentar tarefa manual, recorrência sem lista legada, PV sem exceções úteis), `testes.md` (`CRONOAI_PERF`) | dev-frontend | 5 arquivos de docs | 28 |
| 30 | E4 | Validação visual V-1 a V-4 (`npm run dev`) | orquestrador | — | 28 |
| 31 | E4 | ADR 00003 em `.claude/adrs/` e linha no índice `README.md` | orquestrador | `.claude/adrs/00003-minutos-inteiros-persistidos.md`, `.claude/adrs/README.md` | gate |

### Grafo
```
gate ─ 0 ─ 1 ─ 2 ─ 3 ─┬─ 4 ─ 5 ─┬─ 10
                      └─ 6 ─────┴─ [checkpoint] ─ 7 ─ 8 ─ 9 ─ 11        (E1)
E1 ─ 12 ─ 13 ─ 14 ─ 15 ─ 16                                             (E2)
E2 ─ 17 ─ 18 ─ 19 ─ 20 ─ 21 ─ 22                                        (E3)
E3 ─ 23 ─ 24 ─┬─ 25 ─┐
              ├─ 26 ─┼─ 28 ─ 29 ─ 30                                    (E4)
              └─ 27 ─┘
gate ─ 31 (em paralelo, antes do commit do E1)
```
- As tarefas 4–5 e 6 podem correr em paralelo depois da 3 (arquivos disjuntos). O resto é um dev só, em sequência, porque `cpm.ts`, `useProjectStore.ts` e `msProjectXmlParser.ts` concentram as mudanças.
- O E2 depende do E1 (motor em minutos). O E3 depende do E2: o export grava restrições, lags e opções. O E4 depende do E3 (`Task.arquivo`).

### Base e ordem com os ciclos 00002 e 00003
- **Base:** `master` com o 00002 e o 00003 já mergeados. O E1 toca o parser, a store e os tipos que os dois mudam agora; sem o merge, os conflitos são certos.
- Se um deles ainda não estiver na `master`: integração empilhada. Branch a partir de `feat/00002-multiobra`, com merge de `feat/00003-corpus-mspdi`; `BASE` = o commit de merge. Registrar no ciclo.
- O E3 e o E4 do 00003 (ida e volta e comparação de datas do corpus) estão em andamento. Se o formato dos testes mudar, a tarefa 7 adapta.

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|
| AC-1 | caracterização das 20 folhas | `cpm.caracterizacao.test.ts` | Tabela CR-1 inteira (`toBe` por célula); fim 2027-06-01/2027-06-23; caminhos críticos; EVM (`toBeCloseTo` 2 casas para R$, 4 para índices); cenários (CR-1). **Igual antes e depois do E1** |
| AC-2 | calendário por tarefa | `cpm.test.ts`, `calendarioTrabalho.test.ts` | CR-2a, CR-2b, CR-2c (datas e horas `hh:mm`, folgas 47,5/12,5) |
| AC-3 | PV no calendário da tarefa | `evm.test.ts` | CR-2d: 5.000,00 e 5.500,00 |
| AC-4 | migração 2 → 3 e `undo` | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | Seção 06: v1 → 3 e v2 → 3 com cronograma da CR-1; desfazer os 3 cenários → entrega 2027-06-23; esquema 4 recusado; esquema 3 sem `calendarios` com aviso |
| AC-5 | lag entre calendários | `cpm.test.ts` | CR-3: **2026-08-10 13:00** (P1 = sucessora, emenda 01); lado de controle 2026-08-11 08:00 |
| AC-5b | correções do coordenador | `calendar.test.ts`, `cpm.test.ts` | CR-11 (−1, −1, −1), CR-11b (2027-06-23, 16 d.u.), CR-12 (303 mantém só o término 2027-01-29) |
| AC-6 | restrições | `cpm.test.ts` | CR-6 (7 casos) e CR-6b (FT 7 d, FL 7 d) |
| AC-7 | prazo final | `cpm.test.ts` | CR-7 (−1 d, indicador; prazo 14/08 sem indicador) |
| AC-8 | lag corrido, %, duração corrida | `cpm.test.ts` | CR-4, CR-5, CR-10 |
| AC-9 | progresso e restante exato | `cpm.test.ts`, `cpm.caracterizacao.test.ts`, `useProjectStore.test.ts` | CR-8 (retida: B 2026-08-21, A FT 0, B FT 0; substituir: B 2026-08-07, A FT 0, B FT 8 d; mover `true`/`false`); CR-9 (antes → depois); N-1 2027-06-23, +16 d.u., SPI 0,8883, CPI 0,9349; N-2 2027-06-16 (−5); N-3 2027-06-18, 3 d.u., R$ 12.616,80 |
| AC-10 | MSPDI ida e volta | `msProjectXmlParser.test.ts` | Fixture: `buildMspdiXml` → `parseMspdiXml` com cada campo da seção 05 igual; `validateMspdi(xml, { strictOrder: true }).errors` = `[]`; variante com `MinutesPerDay` 450; XML malformado com erro em português; S-1/S-2 |
| AC-10b | exportação do seed | tarefa 11 / 22 | E1: diff vazio. E3: diff = lista da seção 05 |
| AC-11 | corpus sem regressão (local) | `msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` | 134 arquivos; 95 importados e 39 recusados; 2.481 tarefas; 53/53 vínculos; 38/38 %; 38/38 e 11/11 datas reais; LB0 11/11; ida e volta 95/95 com `strictOrder`. E1: comparação de datas 83/104 e 100/104 **iguais**; LB0 sem início 12/8 com o texto novo. E3: inventário de avisos antes → depois declarado (A5 5→0, A6 4→0, A7 20→0, A10 1→0, formato diferente de dias úteis 12→0, semana ≠ seg–sex → 0) e nova contagem da comparação fixada |
| AC-12 | painel | `divergencias.test.ts`, `useProjectStore.test.ts` | D-1 a D-6 (datas, diferença em d.u.: D-2 +1, D-3 +1, D-4 −4, D-5 +1, D-6 −4; causa) |
| AC-13 | edição e indicadores | `useProjectStore.test.ts`, `e2e/cronograma.spec.ts` | Ações validam entradas (data inválida e calendário inexistente recusados); E2E da tarefa 28 |
| AC-14 | desempenho | `cpm.desempenho.test.ts` | CI: 3.000 folhas, cerca de 6.000 vínculos, uma execução < 2.000 ms (teto largo contra máquina lenta). Local (`CRONOAI_PERF=1`): mediana de 5 execuções de `computeSchedule` + compilação dos calendários **< 500 ms** (RNF-05.1). Antes do ciclo: mediana de **26 ms** no motor atual (Node 26, jsdom, 7 execuções, 3.000/5.998, medição do plano) |
| AC-15 | docs e ADR | revisão | Tarefas 29 e 31 |

**Desempenho, detalhes:** gerador com semente fixa (LCG), 100 frentes de 30 tarefas, 2 vínculos por tarefa (FS, SS, FF; lags −1 a +2 d úteis, mais 10% corridos e 5% % no E2), 20% concluídas, 3% iniciadas, 10% com restrição (E2), 3 calendários (padrão, sábado 4 h, noturno). A importação de MSPDI de 3.000 tarefas (13,7 s no jsdom, medição do 00003) **não** entra (RNF-06.2, ciclo próprio).

## 12. Critérios de aceite e escopo fechado
- **AC-1:** E1 não muda nenhuma célula da tabela CR-1 nem os números de EVM e cenários da CR-1.
- **AC-2:** a tarefa no calendário com sábado de 4 h termina nas datas e horas da CR-2a, 2b e 2c.
- **AC-3:** o PV usa o tempo útil do calendário da tarefa (CR-2d).
- **AC-4:** toda obra salva (v1, esquema 2) abre no esquema 3 com os mesmos números, e o `undo` de cada obra continua desfazendo.
- **AC-5:** o lag útil entre calendários segue a regra decidida no gate P1 (CR-3). **AC-5b:** CR-11, CR-11b e CR-12.
- **AC-6:** as 8 restrições se comportam como na CR-6 e CR-6b.
- **AC-7:** o prazo final não move a tarefa, entra na folga e acende o indicador (CR-7).
- **AC-8:** lag em dias corridos e em % e duração corrida exatos (CR-4, CR-5, CR-10).
- **AC-9:** opções de progresso (CR-8) e restante exato (CR-9), com os KPIs do E2E inalterados.
- **AC-10:** ida e volta MSPDI com vários calendários, `CalendarUID`, restrições, `Deadline` e lag em todos os formatos, `strictOrder` sem erros, e exportação do seed conforme a seção 05.
- **AC-11:** corpus sem regressão (local), com o antes → depois declarado.
- **AC-12:** painel de divergências com causa provável (D-1 a D-6), inclusive a sucessora de tarefa manual apontando para o UID da manual.
- **AC-13:** restrição, prazo final, calendário da tarefa e opções editáveis na tela, com validação e indicadores acessíveis.
- **AC-14:** 3.000 tarefas e 6.000 vínculos < 500 ms (local).
- **AC-15:** `CLAUDE.md`, regras e ADR 00003 atualizados.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 … AC-15, AC-5b | Seção 12 | Testes da seção 11; `npm run ci` por entregável | sim |
| N-1 | Entrega 2027-06-23, +16 d.u., SPI 0,8883, CPI 0,9349 (Inviolável 1) | `useProjectStore.test.ts` N-1 | sim |
| N-2 | Aprovar 75% no 104: entrega 2027-06-16 (−5 d.u.) | `useProjectStore.test.ts` N-2 | sim |
| N-3 | Crashing: 3 d.u., R$ 12.616,80, 2027-06-18 | `useProjectStore.test.ts` N-3 | sim |
| N-4 | CR-1 tabela (E1) | `cpm.caracterizacao.test.ts` | sim |
| N-5 | CR-2a a 2d, CR-3 | `cpm.test.ts`, `evm.test.ts` | sim |
| N-6 | CR-4 a CR-10 | `cpm.test.ts` | sim |
| N-7 | CR-11, CR-11b, CR-12 | `calendar.test.ts`, `cpm.test.ts` | sim |
| N-8 | Propriedade: folga ≥ 0 fora do caminho crítico (RNF-05.2) | `cpm.test.ts` (200 redes, semente fixa) | sim |
| N-9 | Itens "a confirmar" conferidos pelo `especialista-obra` | Parecer da tarefa 0 (`00004-tarefa0-especialista.md`), resumido no ciclo; correções aplicadas na emenda 01 (seção 15) | sim |
| M-1 | Ida e volta do seed com `strictOrder` (Inviolável 2) | `core.test.ts` + `msProjectXmlParser.test.ts` | sim |
| M-2 | Ida e volta da fixture de calendários e restrições | AC-10 | sim |
| M-3 | Exportação do seed: E1 idêntica; E3 = lista declarada | Tarefas 11 e 22 | sim |
| M-4 | Corpus local sem regressão | AC-11, saída do `npx vitest run src/lib/msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` | sim |
| M-5 | `.xml` exportado (fixture e seed) abre no MS Project real com calendários, restrições, prazos e lags | Conferência manual | não (`NOT_RUN` esperado; paridade SPEC-05 §5 pendente) |
| M-6 | Regras conferidas no MS Project real: lag entre calendários (P1, CR-3), `HonorConstraints` (P2), exibição da folga de ALAP (CR-6b) e `LinkLag` % (CR-5). Roteiro do `HonorConstraints`: exportar a fixture com MSO em conflito e `HonorConstraints` 0, abrir no MS Project, anotar a caixa "As tarefas sempre respeitarão as datas de restrição" e as datas de B; repetir com 1 | Conferência manual pela Engenharia de planejamento | não (`NOT_RUN`; pendência antes do piloto) |
| P-1 | v1 → 3 | `migracaoEstado.test.ts` | sim |
| P-2 | Esquema 2 → 3 por obra, inclusive `undo` | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim |
| P-3 | Esquema 4 recusado e nunca sobrescrito | `migracaoEstado.test.ts` | sim |
| P-4 | Esquema 3 sem campos opcionais abre igual | `migracaoEstado.test.ts` | sim |
| P-5 | E2E de migração e troca de obra do 00002 inalterados | `e2e/obras.spec.ts` | sim |
| R-1 | Exportação do seed idêntica no E1 | Tarefa 11 | sim |
| R-2 | KPIs do E2E inalterados nos 4 entregáveis | `npm run e2e` | sim |
| R-3 | Nenhum `× 480` ou conversão de unidade fora de `calendarioTrabalho.ts`/parser | `git grep -n "480" src/lib src/stores src/modules` revisado | sim |
| R-4 | `src/lib` puro (sem store, DOM, `localStorage`) | `validar-regras.mjs` + revisão | sim |
| R-5 | Desempenho local < 500 ms | AC-14 (local) | sim |
| R-6 | Cobertura ≥ 80% nas 4 métricas sem o corpus | `npm run test:coverage` | sim |
| S-1 … S-6 | Seção 08 | Testes e revisão | sim |
| V-1 | Painel de divergências com a fixture importada | `npm run dev` | não |
| V-2 | Folga fracionária exibida "55,3 d" | `npm run dev` | não |
| V-3 | Colunas e indicadores de restrição, prazo e calendário na EAP (rótulo + ícone) | `npm run dev` | não |
| V-4 | Opções de cronograma no formulário da obra | `npm run dev` | não |

**Validadores obrigatórios:** `testes` (escopo afetado + matriz), `arquiteto` (revisão: camadas, conversão num lugar só, migração, aderência ao plano), `especialista-obra` (tarefa 0 antes do E1 e validação de CR-1 a CR-12, conversões MSPDI e causas do painel), `seguranca` (S-1 a S-6), **auditoria independente** (`revisor` em `MODO: AUDITAR`). Em lote, ao fim de cada entregável. A auditoria roda ao fim do ciclo, ou por entregável se o orquestrador preferir.

### Perguntas de gate (até 3)
**P1 — Calendário em que o lag útil é contado entre tarefas de calendários diferentes. DECIDIDO na emenda 01: (b) calendário da sucessora.** Só muda número quando predecessora e sucessora têm calendários diferentes e o lag em dias úteis não é zero (CR-3: 10/08 13:00 × 11/08 08:00). No seed nada muda.
- **(a)** Calendário do projeto (padrão da obra). Era a recomendação da 1ª versão deste plano; o `especialista-obra` mostrou que essa regra vem do cenário com calendário de **recurso** e sem calendário de tarefa, que o CronoAI não tem.
- **(b)** Calendário da sucessora, ou o do projeto quando a sucessora não tem calendário próprio (hipótese do PLANO §3.4). **Escolhida pelo orquestrador**, com autorização do usuário e sujeita à revisão dele no PR, pela recomendação da tarefa 0. Fonte: terceiros ([Boyle 2018](https://boyleprojectconsulting.com/tomsblog/2018/06/27/impact-of-calendars-on-schedule-slack-calculation-in-microsoft-project/), [Trajkovski 2013](https://ntrajkovski.com/2013/02/27/task-calendars-and-lag-in-ms-project-2013/); MS Project 2010, 2013 e 2016); não há fonte oficial. Confiança: terceiros. Validação final: Engenharia de planejamento no MS Project real (M-5/M-6).
- **(c)** Calendário da predecessora. Nenhuma fonte encontrada sustenta essa regra.
- *Por que importa:* o 00005 vai atribuir calendários alternativos (concretagem com sábado, hora extra por frente), e os lags entre essas frentes passam a depender da regra.

**P2 — Honrar restrições.** Os 134 arquivos do corpus gravam `HonorConstraints` = 0, mas a opção "As tarefas sempre respeitarão as datas de restrição" vem ligada por padrão no MS Project (a confirmar). Não está claro se o 0 do MSPDI quer dizer "desligado".
- **(a)** Calcular sempre honrando as restrições (MSO, MFO, SNLT e FNLT prevalecem sobre o vínculo e geram folga negativa), e preservar o valor do arquivo só para a volta. **Recomendação (opinião):** coerente com o padrão da interface. O painel aponta "restrição em conflito com vínculo".
- **(b)** Seguir o `HonorConstraints` do arquivo (0 ⇒ o vínculo prevalece). Com o corpus, nenhum import honraria restrição.
- **(c)** Opção por obra, padrão "honrar", com o import lendo o arquivo. Mesmo risco de (b) se o 0 não quiser dizer "desligado".
- *Por que importa:* muda datas e folgas de toda tarefa com MSO, MFO, SNLT ou FNLT em conflito com vínculo (CR-6).

**P3 — Unidade persistida (ADR 00003).**
- **(a)** Minuto inteiro. Segundos do arquivo (só em durações guiadas por recurso, ex.: `PT57H8M24S` no corpus) arredondados com aviso, e tolerância de 1 min na ida e volta desses casos. **Recomendação (opinião):** unidade da interface e da VBA do MS Project; números legíveis nos testes; o PLANO já trazia essa opinião.
- **(b)** Décimo de minuto (unidade do `LinkLag`/`TotalSlack` no MSPDI). Preserva segundos múltiplos de 6, mas multiplica tudo por 10 e só ganha em durações guiadas por recurso (Fase 3).
- **(c)** Dias fracionários (ponto flutuante). Acumula erro: 100 min = 0,2083… dia.
- *Por que importa:* é o formato salvo de todas as obras. Mudar depois exige outra migração.

### Fora do escopo
- RF-05.2 por recurso (interseção com o calendário do recurso), RF-05.6 (`CriticalSlackLimit` configurável e múltiplos caminhos críticos), RF-05.7 (recursos, histograma, nivelamento), Web Worker.
- Paridade da SPEC-05 §5 (5 cronogramas reais anonimizados com o gabarito do MS Project).
- Tarefas agendadas manualmente (`<Manual>1`): calculadas automaticamente, com aviso e causa no painel.
- Cadastro e edição de calendários, meio período, feriados por UF e município, hora extra por frente e calendário derivado de hora extra: **00005**. Aqui só se escolhe um calendário existente para a tarefa.
- Separar no PV o sábado de hora extra do dia útil extra do arquivo: 00005.
- Expansão de exceção recorrente pela regra quando não há lista legada, e `WorkWeeks`: só aviso.
- Datas reais com hora (`actualStart`/`actualFinish` continuam `yyyy-mm-dd`); hora da data de status (o corpus não traz).
- `LagFormat` 20 com semântica própria (calculado como 19, com aviso); edição de vínculos e de formato de lag na tela; lag no simulador e na inclusão SINAPI continuam em dias úteis.
- Alterar premissas de hora extra (8 h, 50%) e qualquer premissa ilustrativa.
- Linhas de base 1–10 (00007), mapeamento de campos (00010), `.mpp`, importação incremental, RNF-06.2.
- Mudanças em CI, Docker, `vite.config.ts` e dependências.
- Correções fora daqui vistas no código: vínculo para tarefa inativa bloqueia o export; `ActualStart` com % = 0 descartado; erros de validação além dos 5 primeiros (todos do 00003, seção 12 dele).

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Regras da empresa: lag entre calendários, honrar restrições, lógica retida, mover o restante | Engenharia de planejamento | Piloto (SPEC-13); não bloqueia o merge |
| Abrir no MS Project real o `.xml` da fixture e do seed (M-5, M-6) | Planejamento (usuário, com o MS Project da empresa) | Critério de paridade da SPEC-05; não bloqueia o merge |
| Hora extra e jornada | RH + Jurídico | Não se aplica neste ciclo (premissas da hora extra inalteradas; sábado de 4 h aqui é calendário de teste, não regra de jornada) |

## 14. Riscos e pós-entrega
- **Número que muda sem querer no E1:** caracterização gravada antes de qualquer mudança (tarefa 1) e checkpoint depois do motor e da migração. O simulador do plano, descartável e fora do repositório, mostrou as armadilhas:
  - somar lag 0 empurrava o marco 802 para 08:00 do dia seguinte, e a entrega ia de 01/06 para 02/06;
  - término normalizado para 17:00, e não 08:00 do dia seguinte;
  - `ToTime` 00:00 = 24:00.
  Os testes cobrem as três.
- **Tamanho do E1** (cerca de 30 arquivos, troca mecânica de campo): risco de erro de digitação em conversão. Mitigação: `× 480` só em `calendarioTrabalho.ts` e no passo de migração (R-3); `typecheck` estrito; caracterização.
- **Concorrência com o 00002 e o 00003:** o diretório principal está sendo alterado pelo 00002 durante este plano (`CLAUDE.md`, `e2e/obras.spec.ts`, `AppTopbar.vue`, `divida-conhecida.md` modificados), e o parser do 00003 tem alterações pendentes. O 00004 só começa com os dois na `master` ou numa integração empilhada (seção 10). As linhas citadas da store e do parser vão deslocar: localizar pelos nomes.
- **Regras do MS Project sem fonte oficial** (P1 = sucessora, apoiada em terceiros; semântica de `HonorConstraints`; exibição da folga de ALAP; codificação do `LinkLag` %): conferidas pelo `especialista-obra` na tarefa 0, com fonte e confiança registradas na seção 04 e em M-5/M-6 `NOT_RUN`. A regra de cada um mora numa função só, para trocar com 1 teste. Se P1 estiver errado, cada lag útil entre um calendário com sábado e o padrão diverge 0,5 d por sábado na janela do lag. Isso afetaria as frentes do 00005 e apareceria no painel.
- **Tarefas manuais** (1.136 no corpus) e feriados nacionais aplicados a arquivos sem feriados vão aparecer como divergência. O painel explica, inclusive nas sucessoras da manual; a correção de fundo é do 00005 (feriados por UF e município) ou de ciclo próprio (agendamento manual). A marca `Manual` agora é preservada na volta, para o MS Project não reagendar a tarefa ao abrir.
- **`moverRestante` diverge do MS Project de propósito:** todo arquivo do MS Project com tarefa não iniciada antes da data de status vai divergir (causa 5 do painel). É o esperado: é a política do CronoAI.
- **Desempenho:** busca binária sobre minutos acumulados por dia, por calendário. Hoje 26 ms; teto de 500 ms. Se passar, otimizar antes de cortar precisão (`calculo-precisao.md`).
- **Crescimento do estado salvo:** `Task.arquivo` (cerca de 60 caracteres por tarefa) e os calendários. Dentro da estimativa do ADR 00002 (+10% a 20%).
- **Rollback:** reverter os 4 commits juntos. As obras já migradas ficam no esquema 3, recusadas pelo app antigo sem sobrescrita. A chave v1 fica intacta. Recomendar no PR exportar o `.xml` das obras importantes antes de atualizar.
- **Reexportação:** quem exportou `.xml` antes do ciclo pode reexportar para levar restrições, prazos, lags no formato original e calendários.
- **Testes locais fora do CI:** corpus e desempenho estrito. A evidência é a execução local registrada na matriz (M-4, R-5).

## 15. Emenda 01 (25/10/2026)
Origem: parecer da tarefa 0 do `especialista-obra` (`scratchpad/planos/00004-tarefa0-especialista.md`; veredito REPROVADO nas regras, aritmética de CR-2 a CR-12 conferida) e itens herdados do ciclo 00003 (já validado). Decisão do orquestrador, com autorização do usuário e sujeita à revisão dele no PR.

| # | Correção | Onde no plano |
|---|---|---|
| 1 | **P1 → calendário da sucessora** (do projeto quando a sucessora não tem calendário próprio). Fonte: terceiros (Boyle 2018, Trajkovski 2013), sem fonte oficial. Validação final: Engenharia de planejamento no MS Project real (M-5/M-6). CR-3 ativo **2026-08-10 13:00** | 03 (Motor), 04 (CR-3), 10 (tarefa 5), 11 (AC-5), 12 (P1, M-6), decisões do gate |
| 2 | `LinkLag` com `LagFormat` 19/20/51/52 = **percentual inteiro** (50 = 50%), sem ÷ 10 nem × 10. A confirmar no M-5 | 03, 04 (CR-5), 05 (fixture), 10 (17–19) |
| 3 | CR-6b: folga livre = folga total = **7 d** (sem sucessora); exibição do ALAP no MS Project `NOT_RUN` até o M-6 | 04, 10 (13), 11 (AC-6) |
| 4 | CR-8: a regra "sucessora iniciada não restringe" (`cpm.ts:145`) vale só em `'substituir'`. Em retida, a sucessora iniciada restringe a predecessora. Folgas fixadas: retida A 0/B 0; substituir A 0/B 8 d | 01 (contexto), 03, 04, 10 (14), 11 (AC-9) |
| 5 | Calendários: no máximo **5 intervalos por dia** (esquema MSPDI); `00:00–00:00` = dia inteiro; `ToTime > FromTime` validado depois de 00:00 → 1.440 | 03 (MSPDI), 05, 08 (S-1), 10 (4, 17–19) |
| 6 | "Mover o restante" = **política do CronoAI**, não o padrão do MS Project nem equivalente às Move\*. As 4 Move\* preservadas na ida e volta | 03, 04 (CR-8), 05, 14 |
| 7 | Tarefa manual: `Active` e `Manual` no `SCHEMA_ORDER.Task` (depois de `Name`, antes de `Type`) e no export; o painel aponta para o UID da manual nas sucessoras (D-6 novo) | 03, 04 (D-6), 05, 10 (17–18, 23) |
| 8 | Formatos corridos {4, 6, 8, 10, 12, 36, 38, 40, 42, 44}; 21/53 nulos; 39 = dia útil estimado; 1 emo = 43.200 min; folga de tarefa corrida em 24 h, exibida em "dc" | 03, 04 (CR-10), 10 (13, 15) |
| 9 | Fontes da seção 04 corrigidas: 19/20 vêm do esquema MSPDI, não do `PjFormatUnit`; 24 h por ed vem do corpus; fórmula do restante na página de suporte "Remaining Duration"; links "a confirmar" resolvidos | 04 |
| 10 | Diferenças do painel fixadas: D-4 **−4 d.u.**, D-5 **+1 d.u.** (e D-6 −4 d.u.) | 04, 10 (23), 11 (AC-12) |
| 11 | ADR 00003: arredondamento para o minuto mais próximo, meio para cima (3.801,6 → 3.802); tolerância de 1 min só para durações derivadas de % ou com segundos | ADR, 03 |
| H1 | (00003) CR-12 troca o texto do aviso "LB0 sem início", o teste C-4b e as asserções do corpus (12/8) no mesmo diff | 04 (CR-12), 10 (2), 11 (AC-11) |
| H2 | (00003) O aviso "N vínculo(s) com lag em formato diferente de dias úteis: serão exportados em dias úteis" (12 vínculos `LagFormat` 9) some quando o E3 preservar o formato | 03, 05, 10 (21) |
| H3 | (00003) Avisos de duração A5–A7 mudam ou somem quando a conversão fica exata | 03, 05, 10 (21) |
| H4 | (00003) Leitura do calendário extraída do `parseMspdiXml` numa função (`lerCalendarioMspdi`), sem mudar comportamento, antes da semântica nova | 03, 10 (17) |

Também foram confirmados sem correção: P2 (calcular honrando e preservar o valor do arquivo; obra sem arquivo exporta 0), P3 (minuto inteiro), prazo final (`LF = min(LF, prazo)`), CR-2a a 2d, CR-4, CR-6, CR-7, CR-9, CR-10, CR-11, CR-11b e CR-12.

CONHECIMENTO NOVO:
- Os 134 MSPDI do corpus do MPXJ (MS Project 2002–2019) gravam `HonorConstraints` = 0, embora a opção "As tarefas sempre respeitarão as datas de restrição" seja ligada por padrão na interface do MS Project. Não leia 0 como "vínculo prevalece" sem confirmar no MS Project real — import de restrições (00004).
- 1.136 tarefas do corpus estão agendadas manualmente (`<Manual>1`), 32 delas nos 8 arquivos com vínculo. O MS Project 2010+ cria tarefa nova como manual por padrão. Comparar datas do arquivo com o CPM sem olhar essa marca gera falsa divergência — painel de divergências e comparação de datas do corpus.
- O corpus traz `ToTime` `00:00:00` (17 ocorrências) para turno que termina à meia-noite. Lido como 00:00, o turno fica com duração negativa ou zero — import de calendários.
- Em motor de minutos, somar lag 0 ao término de uma predecessora não pode normalizar o momento para o próximo expediente: o marco iria para 08:00 do dia seguinte e a entrega mudaria de data — `cpm.ts` (E1).
- O restante exato do MS Project (7,2 d em vez de ⌈7,2⌉ = 8 d) desloca em 1 dia o início de toda a cadeia crítica do Aurora, mas não muda a data de entrega nem o "+16 d.u.", porque o término só recua horas dentro do mesmo dia — antes e depois do E2.
- `WorkCalendar.indexOnOrBefore` com data útil anterior à data-base devolve um índice a menos. Com início da obra depois da data de status, a entrega do Aurora antecipa 1 dia (2027-06-22 × 2027-06-23) — `calendar.ts:119` (achado do `especialista-obra`, CR-11b).
- (emenda 01) Nenhuma documentação oficial da Microsoft define o calendário do lag entre tarefas de calendários diferentes. Relatos técnicos (MSP 2010, 2013 e 2016) dizem que vale o calendário da sucessora. A regra "do projeto" é do cenário com calendário de recurso — `cpm.ts` (P1) e 00005.
- (emenda 01) Com `LagFormat` 19/20, o `LinkLag` guarda o percentual inteiro (50 = 50%), e não décimos de minuto (terceiros, Project 2021) — parser MSPDI (E3).
- (emenda 01) O MSPDI aceita no máximo 5 `WorkingTime` por dia, e `FromTime 00:00` + `ToTime 00:00` é o dia inteiro (calendário nativo "24 Hours") — calendários.
- (emenda 01) As opções Move\* do MS Project só agem ao lançar progresso e não movem tarefa não iniciada. A reprogramação do CronoAI pela data de status é política própria — painel (causa 5).
- (emenda 01) Com lógica retida, manter "sucessora iniciada não restringe a predecessora" deixa a predecessora que comanda o restante sem ser crítica — `cpm.ts` (E2).

## Decisões do gate (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar até o fim das fases. O gate foi decidido pelas recomendações deste plano, **sujeito à revisão do usuário no PR**:
- **P1 → calendário do projeto** (decisão original). **Alterada pela emenda 01 (25/10/2026): P1 → calendário da sucessora**, e o do projeto quando a sucessora não tem calendário próprio, conforme o parecer da tarefa 0 do `especialista-obra`. Fonte: terceiros (Boyle 2018, Trajkovski 2013), sem fonte oficial. Confiança: terceiros. Validação final: Engenharia de planejamento no MS Project real (M-5/M-6). A emenda continua sujeita à revisão do usuário no PR.
- **P2 → calcular sempre honrando as restrições**; o `HonorConstraints` do arquivo é preservado só na exportação.
- **P3 → minuto inteiro persistido** (ADR 00003); segundos arredondados com aviso.
