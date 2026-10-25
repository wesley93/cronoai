---
issue: —
spec: SPEC-03 — RF-03.1, RF-03.2, RF-03.3, RF-03.4, RF-03.6; RF-03.5 (só o modelo e a entrada manual); RNF-03.1; RNF-03.2 (decisão no gate P2)
ciclo: .claude/ciclos/00005-premissas-calendarios.md
branch: feat/00005-premissas-calendarios
base: master depois do merge do 00004 (que já parte do 00002 e do 00003). Se o 00004 ainda não estiver na master, a branch sai da branch do 00004 (PR empilhado) e BASE = a branch do 00004
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00005 — Premissas por obra versionadas, calendários alternativos atribuídos a tarefas, meio período, hora extra por frente e feriados por obra

## Resumo
- **O que é:** as premissas que hoje são constantes no código (custo indireto, taxas por função, fator de congestionamento, mobilização, adicional de HE, contingência, margem da DLP) passam a ser **dados da obra, versionados e com origem**. O usuário cria **calendários alternativos** (com jornada por dia da semana, exceções por data e sábado de 4 h) e os atribui a tarefas, uma a uma ou em lote por pacote. Os **feriados passam a ser da obra**: os nacionais são calculados, Carnaval e Corpus Christi viram opção da obra (com o padrão atual mantido), e os estaduais e municipais entram à mão, com origem. A **hora extra** ganha meio período e **frentes escolhidas**.
- **Risco que justifica a faixa 3:** **T3.** A constatação (a) do `especialista-obra` (não injetar feriados num calendário vindo do MS Project) exige mudar o `parseMspdiXml`, que hoje põe os feriados nacionais quando o arquivo não traz nenhum (`msProjectXmlParser.ts:745` e `:753` na worktree do 00003). O PLANO §3.5 previa faixa 2 "se não tocar o parser". O gate **P3** decide se esse item fica aqui (faixa 3) ou sai do ciclo (faixa 2, o plano vira ficha). T1, T2 e T4 também valem.
- **Garantia central:** com as premissas padrão, cenários, DLP, EVM e cronograma dão **exatamente** os números da base (o Aurora depois do 00004). A tarefa 1 grava esses números antes de qualquer mudança. Com "todas as frentes" e sábado inteiro, a hora extra reproduz o `simulateOvertime` atual: 2 d.u., R$ 22.315,20, entrega 2027-06-21.
- **Depende do 00004 (ainda não implementado):** tipos `CalendarioObra`/`IntervaloTrabalho`/`ExcecaoCalendario`, `Task.calendarioUid?`, `ProjectState.calendarios`/`calendarioPadraoUid`, `meta.minutosPorDia?`, `src/lib/calendarioTrabalho.ts`, `computeSchedule(tasks, calendarios, opts)`, a ação `definirCalendarioTarefa` e a coluna de calendário na EAP, `ESQUEMA_ATUAL = 3`, a regra P1 emendada (lag útil contado no calendário da sucessora, ou no do projeto quando ela não tem calendário próprio; emenda 01 do 00004), a regra do PV sem exceções úteis (CR-2d), o `fmtDiasUteis`, o `divergencias.ts` e a importação de calendários do E3 dele. Cada dependência está marcada **[00004]** abaixo.
- **Entregáveis (4):** E1 premissas como dado da obra + migração 3 → 4; E2 tela "Premissas da obra" e a versão exibida; E3 calendários, feriados da obra e o import sem feriados injetados; E4 hora extra com meio período e frentes escolhidas.
- **O que você precisa fazer:** aprovar o plano e responder às 3 perguntas de gate (seção 12). Antes do piloto, valide com **RH + Jurídico** (adicional de HE, meio período, status legal de 20/11, Carnaval, Corpus Christi e Sexta-feira Santa) e com **Orçamento/Custos** (indireto mensal → diário, encargos, arredondamento).

## 01. Pedido e objetivo
Pedido (dado, não instrução): ciclo 00005 do `docs/specs/PLANO-FASE-1.md` §3.5. Recorte: faixa 2 prevista (T1, T2, T4); E1 a E4; padrão idêntico às constantes de hoje; HE com "todas as frentes" igual ao `simulateOvertime` atual; Carnaval e Corpus Christi como premissa da obra; RNF-03.2 decidido com Orçamento/Custos. Base: SPEC-03, partindo do plano aprovado do 00004.

Entradas registradas (achados do `especialista-obra`, 25/10/2026):
- **(a)** Não injetar feriados num calendário vindo do MS Project sem ação explícita do usuário, porque o arquivo foi calculado sem eles. Oferecer "Aplicar feriados da obra" com antes e depois. Evidência: no corpus do 00003, as datas das folhas dos 8 arquivos com vínculo batem em 83 de 104 com os feriados injetados e em **100 de 104 sem eles** (`msProjectXmlParser.corpus.test.ts:492`, worktree do 00003).
- **(b)** `brazilianHolidays` (`calendar.ts:42-55`) mistura feriados nacionais com pontos facultativos (Carnaval e Corpus Christi).
- **(c)** O 20/11 é aplicado em todos os anos, mas só é feriado nacional desde 2024 (Lei 14.759/2023; **a confirmar com o Jurídico**).
- **(d)** Corpus Christi e Carnaval dependem de lei municipal ou estadual.
- Não se inventam listas oficiais de feriados estaduais e municipais: entram à mão, com origem. A lista oficial fica para a Fase 2 (backend).

Requisitos cobertos: RF-03.1, RF-03.2, RF-03.3, RF-03.4, RF-03.6; RF-03.5 só o modelo e a entrada manual; RNF-03.1; RNF-03.2 conforme o gate P2. Critérios de aceite da SPEC-03 §5: indireto de R$ 12.000 (AC-2); sábado de 4 h = 0,5 dia no CPM e na HE (AC-9, AC-12); "Premissas v3 — vigência 01/11/2026" (AC-4); testes atuais verdes no padrão (AC-1).

**Objetivo:** cada obra calcula cenários e DLP com as próprias premissas, documentadas e versionadas. As tarefas usam o calendário certo (fachada, concretagem, sábado de 4 h). A hora extra convoca só as frentes que interessam e cobra só por elas. E os feriados refletem a obra, sem distorcer um arquivo do MS Project.

### Contexto para execução (ler antes)
As linhas abaixo são da branch `feat/00002-multiobra` em 25/10/2026, com alterações pendentes, e vão deslocar com o 00004: localize pelo nome.

| Arquivo | Por quê |
|---|---|
| Plano 00004 (`.claude/ciclos/00004-motor-minutos-calendarios-plano.md`), seções 03, 04, 06 e 12 | Tipos, nomes, regras P1/P2/P3, CR-1 e CR-2d, migração 2 → 3. O 00005 **estende** esses tipos e não os renomeia |
| ADR 00003 (minutos inteiros persistidos) | Unidade de tempo; dias exibidos = minutos ÷ `minutosPorDia` |
| `src/lib/scenarios.ts:8-13`, `:130-136`, `:202-219`, `:292-305`, `:340-400` | Constantes, `Ctx`, crashing (`× 8` h na `:216`), fast-tracking, hora extra (sábados em `:343-348`, custo em `:353-369`, textos em `:378-396`). Imitar a memória de cálculo linha a linha |
| `src/lib/scenarios.test.ts` | Testes que precisam continuar verdes no padrão (`:14-63`) |
| `src/lib/supplies.ts:6`, `:27-34` | `SAFETY_MARGIN_DAYS` e o parâmetro `marginDays` (a assinatura fica) |
| `src/data/seed.ts:6-17`, `:19-26`, `:28` | `HOURLY_RATES`, `SEED_META.dailyIndirectCost`, `SEED_HOLIDAYS` |
| `src/lib/calendar.ts:42-61` | `brazilianHolidays`/`defaultHolidays` (achados b e c) |
| `src/lib/migracaoEstado.ts:7`, `:15-18`, `:45-71`, `:99-125` | Cadeia de migrações. O 00004 deixa em `ESQUEMA_ATUAL = 3`; o passo 3 → 4 entra aqui |
| `src/types/domain.ts:71-88`, `:204-214`; `src/types/obra.ts:7-14` | `ProjectMeta` (`dailyIndirectCost`, `safetyMarginDays`), `ProjectState`, `ScenarioUndo` |
| `src/stores/useProjectStore.ts:425-427`, `:469-476`, `:665-701`, `:724-730`, `:1001-1015`, `:1067`, `:1166-1192` | Calendários derivados, `scenarioCtx`, `applyScenario`/`undoScenario`, `setSafetyMargin`, `importXml`, criação de obra em branco, `atualizarDadosObra`. Imitar `previewProgress` (`:591-595`) nas prévias |
| `src/lib/obras.ts:86-110` | `estadoObraVazia` (`:96` custo indireto vindo de quem chama; `:104` feriados) |
| `src/modules/CriticalPathModule.vue:131`, `:180-190`; `src/modules/critical/ScenarioCard.vue` | Indireto e premissas escritas à mão no texto; controles da HE |
| `src/modules/SupplyModule.vue:136-147`, `src/modules/SinapiModule.vue:13`, `:43` | Margem da DLP editável; `rateOf` usado na tela |
| `src/stores/ui.ts:4-13`; `src/modules/ObrasModule.vue`, `src/modules/obras/ObraDadosForm.vue` | Lista de módulos (entra "Premissas"); formulário de dados da obra (prévia da troca de UF/município) |
| `msProjectXmlParser.ts:740-758` e `msProjectXmlParser.corpus.test.ts:379-383`, `:492` (worktree do 00003; no 00004 a importação de calendários é reescrita no E3) | Ponto exato da injeção de feriados e da comparação do corpus |

## 02. Triagem
Conferida no código em 25/10/2026: branch `feat/00002-multiobra` (`103f319` mais alterações pendentes), worktree do 00003 (`feat/00003-corpus-mspdi`) e plano aprovado do 00004. **[00004]** = o ponto só existe depois do 00004.

- **T1 SIM.**
  - Feriados: `brazilianHolidays` (`calendar.ts:42-55`) passa a separar nacionais (20/11 só a partir de 2024) de Carnaval e Corpus Christi, e entram os feriados da obra no calendário compilado **[00004: `calendarioTrabalho.ts`]**.
  - Calendários alternativos e exceções com horário mudam datas das tarefas atribuídas **[00004: `Task.calendarioUid`, `computeSchedule(tasks, calendarios, …)`]**.
  - A hora extra deixa de pôr sábados só no calendário da obra (`scenarios.ts:343-349`; `applyScenario` grava em `state.calendar.extraWorkingDays`, `useProjectStore.ts:677-680`; **[00004]**: exceção útil no calendário padrão).
- **T2 SIM.**
  - Constantes viram premissas: `scenarios.ts:8-13` (`CONGESTION_FACTOR`, `MOBILIZATION_PER_WORKER`, `OVERTIME_PREMIUM`, `REWORK_CONTINGENCY`, `rateOf` com `?? 30`), `HOURLY_RATES` (`seed.ts:6-17`), `SAFETY_MARGIN_DAYS` (`supplies.ts:6`; store `:474`).
  - Indireto: `meta.dailyIndirectCost` (`scenarios.ts:219`, `:305`, `:370`; `seed.ts:25`; `obras.ts:96`; store `:1067`).
  - Jornada fixa de 8 h no custo (`scenarios.ts:216`, `:363`).
  - O custo da HE passa a contar só as frentes escolhidas e as horas do sábado (4 ou 8).
- **T3 SIM.**
  - `parseMspdiXml` injeta `defaultHolidays` quando o calendário do arquivo não tem feriado, com aviso (`msProjectXmlParser.ts:745`, `:753`, worktree do 00003; **[00004 E3]** reescreve esse trecho). Achado (a): parar de injetar e trocar o aviso.
  - Exportação: os calendários alternativos, os feriados da obra (materializados) e o calendário derivado de HE vão para o MSPDI pela exportação genérica de calendários **[00004 E3]**, sem mudar o `buildMspdiXml`. Mesmo assim, a ida e volta com `strictOrder` entra como prova.
  - O resultado depende do gate P3.
- **T4 SIM.**
  - `ProjectMeta.dailyIndirectCost`/`safetyMarginDays` (`domain.ts:77-80`) saem do `meta` e viram a v1 das premissas (PLANO §3.5).
  - Novas chaves `premissas` e `feriados` em `ProjectState` (`domain.ts:204-214`).
  - Opcionais novos em `CalendarioObra` **[00004]** e em `ScenarioUndo` (`obra.ts:7-14`).
  - Passo 3 → 4 na cadeia (`migracaoEstado.ts:7`, `:15-18`; **[00004]** deixa `ESQUEMA_ATUAL = 3`).
- **T5 NÃO.** Não entra arquivo externo novo. Os textos novos (nome de calendário, feriado, origem, referência da taxa) são digitados pelo próprio usuário e só aparecem por interpolação. O parser só perde a injeção, sem afrouxar o endurecimento do 00003 (DOCTYPE/ENTITY e `MAX_MSPDI_CHARS`). Mesmo assim o `seguranca` valida, por ser faixa 3.
- **T6 NÃO.** `fieldAi.ts` e `approveReport` não mudam.
- **T7 NÃO.** Sem mudança em CI, Docker ou dependências.
- **T8 NÃO.** Sem backend. A lista oficial de feriados (RF-03.5) fica para a Fase 2.

**Faixa 3 (T3)**, condicionada ao gate P3. Com P3 = (b) ou (c), sai o item (a) e o ciclo volta à faixa 2: o arquivo vira `00005-premissas-calendarios-ficha.md`, com o mesmo conteúdo menos a tarefa 17 e os itens M-2/M-3. Validação: `especialista-obra` (T1/T2/T3), `testes`, `arquiteto` (revisão), `seguranca` (T3) e auditoria independente.

## 03. Decisões de design

### Premissas (E1, E2)
Busca de equivalente: não existe modelo de premissas no código. Hoje há constantes soltas (`scenarios.ts:8-13`, `seed.ts:6`, `supplies.ts:6`) e dois campos no `meta`. Tipos novos em `src/types/domain.ts`:

```ts
type OrigemPremissa = 'ilustrativa' | 'nao-documentada' | 'sinapi' | 'acordo-coletivo' | 'proposta-empreiteiro' | 'orcamento-obra' | 'outra'
interface Origem { origem: OrigemPremissa; referencia?: string }   // referencia: "SINAPI SP 09/2026 desonerado" (até 120 caracteres)
interface TaxaFuncao { funcao: string; valorHora: number; incluiEncargos: boolean; dataReferencia?: string /* AAAA-MM */ } & Origem
interface PremissasObra {
  custoIndiretoDiario: number                // R$/dia útil: é o valor que o cálculo usa
  custoIndiretoMensal?: { valor: number; diasUteisAno: number; ano: number }  // P1: entrada mensal e o divisor usado
  encargosSociaisPct?: number                // ausente = não informado (sem número inventado)
  taxas: TaxaFuncao[]
  taxaFuncaoNaoCadastrada: number            // 30 (hoje `?? 30`, scenarios.ts:13)
  perdaCongestionamentoPct: number           // 5  (1 + 5/100 === 1.05, conferido)
  mobilizacaoPorProfissional: number         // 1200
  adicionalHoraExtraPct: number              // 50
  contingenciaRetrabalhoPct: number          // 4
  margemDlpDias: number                      // 3 (dias corridos)
  origens: Partial<Record<'custoIndiretoDiario' | 'encargosSociaisPct' | 'taxaFuncaoNaoCadastrada' | 'perdaCongestionamentoPct' | 'mobilizacaoPorProfissional' | 'adicionalHoraExtraPct' | 'contingenciaRetrabalhoPct' | 'margemDlpDias', Origem>>
}
interface VersaoPremissas { versao: number; vigencia: string /* yyyy-mm-dd */; criadaEm?: string; motivo: string; valores: PremissasObra }
```

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `ProjectState.premissas: VersaoPremissas[]`, imutáveis. Alterar = criar versão nova (`criarVersaoPremissas`), com log. Não se apaga versão | Premissas mutáveis com histórico só no log | RF-03.3; o cenário precisa dizer qual versão usou |
| **Versão vigente** = a de maior número com `vigencia ≤ meta.statusDate`. A v1 tem vigência = `meta.startDate`, então sempre existe uma. A vigência nova tem de ser ≥ à da última versão. A tela sugere a data de status, o que aplica "na hora" (SPEC §5), e aceita data futura, mostrada como "agendada" | Usar sempre a última versão criada | A vigência perderia o sentido. Com data futura, o resultado do cenário mudaria antes da data |
| Percentuais persistidos de 0 a 100 (50, 4, 5), convertidos na função (`1 + p/100`) | Fatores (0,5; 1,05) | Mesma convenção do % concluído (`calculo-precisao.md`). A igualdade em ponto flutuante dos padrões foi conferida (`1 + 5/100 === 1.05`, `50/100 === 0.5`, `4/100 === 0.04`) |
| Taxa efetiva = `valorHora × (1 + encargosSociaisPct/100)` quando `incluiEncargos = false`. Padrão: todas as taxas com `incluiEncargos = true` (é assim que a taxa ilustrativa é usada hoje). Taxa sem encargos sem `encargosSociaisPct` informado é recusada na validação | Aplicar encargos a toda taxa | Mudaria todo número. A tabela SINAPI publica custo horário com encargos; acordo coletivo costuma vir sem. A validar com Orçamento |
| Regime de encargos: continua em `meta.regimeSinapi` (00002) e só aparece na tela de premissas | Duplicar na premissa | Uma fonte só. O SINAPI do 00006 lê de lá |
| **Jornada diária e dias úteis da semana (RF-03.1):** a fonte é o **calendário padrão** (semana com intervalos). A tela de premissas mostra o resumo ("seg–sex 8 h; sáb —") com link para o editor de calendários. As horas por dia do custo do crashing vêm de `minutosPorDia ÷ 60` **[00004]** (480 → 8, como `scenarios.ts:216`) | Campo de jornada na premissa, separado do calendário | Duas fontes da mesma jornada divergiriam. `minutosPorDia` é a conversão dia ↔ minuto do MS Project e não é editado neste ciclo |
| Toda premissa padrão nasce com origem `'ilustrativa'` e mostra o selo "ilustrativa" na tela e na memória do cenário, até o usuário trocar a origem (Inviolável 7). Os valores migrados do `meta` ganham origem `'nao-documentada'` | Padrões sem marca | Inviolável 7: premissa ilustrativa não vira verdade |
| Funções puras em `src/lib/premissas.ts` (novo): `premissasPadrao()`, `versaoVigente(versoes, data)`, `taxaHora(premissas, funcao)`, `custoIndiretoDiarioDeMensal(mensal, diasUteisAno)`, `diasUteisNoAno(calendarioCompilado, ano)`, `validarPremissas`, `validarNovaVersao`, `rotuloVersao(v)` ("Premissas v3 — vigência 01/11/2026") | Espalhar na store | Camada `src/lib` (`CLAUDE.md › Convenções`) |
| Cenários recebem `ctx.premissas` (a versão vigente) e devolvem `ScenarioResult.premissas?: { versao, vigencia }`. `rateOf(premissas, recurso)` troca de assinatura (a `SinapiModule.vue:43` passa as premissas vigentes). Os nomes `CONGESTION_FACTOR` etc. somem de `scenarios.ts`, e os valores passam para `premissasPadrao()`. A DLP continua com `analyzeSupplies(…, marginDays)`; a store passa `premissasVigentes.margemDlpDias` | Manter as constantes exportadas como padrão | Duas fontes. Nenhum teste importa essas constantes (conferido por busca em `src/**/*.test.ts` e `e2e/`) |
| A margem da DLP em `SupplyModule.vue:136-147` vira só leitura, com link "alterar nas premissas". `setSafetyMargin` (`useProjectStore.ts:724-730`) é removido | Cada alteração do campo cria uma versão | Um campo numérico geraria uma versão a cada clique |
| Calendários e feriados **não** entram nas versões de premissas: a alteração vai para o log da obra (antes → depois) | Versionar o calendário junto | O calendário é dado do cronograma e vai para o MSPDI. Versionar exige snapshot (SPEC-04, ciclo 00007) |

### Calendários e feriados (E3)
Busca de equivalente: o 00004 entrega `CalendarioObra { uid, nome, semana, excecoes }` e a compilação em `calendarioTrabalho.ts`, sem edição na tela (o fora do escopo dele manda criar e editar calendários no 00005). Feriados por obra: não existe nada além de `holidays`/`defaultHolidays`.

```ts
interface FeriadoManual { id: string; data: string; nome: string; abrangencia: 'estadual' | 'municipal' | 'ponto-facultativo' | 'paralisacao' | 'outro'; fonte: string /* obrigatória: "Lei municipal nº …", "Decreto …" */; recorrenteAnual: boolean; uf?: UF; municipio?: string }
interface ConfigFeriadosObra { nacionais: boolean; carnaval: boolean; corpusChristi: boolean; manuais: FeriadoManual[] }
// ProjectState.feriados: ConfigFeriadosObra   (ausente = { true, true, true, [] })
// CalendarioObra [00004] ganha opcionais: aplicaFeriadosObra?: boolean (ausente = false); derivadoDe?: number; origem?: 'hora-extra'
// ExcecaoCalendario [00004] ganha opcional: descricao?: string (até 80 caracteres)
```

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `calendar.ts`: `feriadosNacionais(ano)` (lista fixa + Sexta-feira Santa; **20/11 só a partir de 2024**), `carnaval(ano)` (segunda e terça, Páscoa −48/−47) e `corpusChristi(ano)` (Páscoa +60). `brazilianHolidays` continua como a união, para os usos legados (`migracaoEstado.completarChaves` do esquema ≤ 2) | Remover `brazilianHolidays` | Achados (b) e (c). A mudança do 20/11 só afeta datas antes de 2024: nenhum número do seed (2026+) |
| Calendário efetivo = semana → feriados da obra (se `aplicaFeriadosObra`) → **exceções próprias do calendário (prevalecem)**. A compilação **[00004]** recebe um gerador `feriadosPorAno(ano)`, memorizado por ano, em vez de uma lista fechada de anos | Materializar uma lista de N anos | Funciona para qualquer horizonte (o 00004 tem teto de 50 anos). A exceção própria permite "concretagem trabalha no feriado" |
| **Exportação:** a store materializa os feriados da obra como exceções não úteis, nos anos `[anoInício, max(anoInício + 3, anoTérminoPrevisto + 1)]`, e entrega os calendários prontos ao exportador **[00004 E3]**. O `buildMspdiXml` não muda | Ensinar o parser a conhecer feriados da obra | Mantém o parser fora disso. No seed, a faixa dá 2026–2029, igual a `SEED_HOLIDAYS` (`seed.ts:28`), e a exportação do seed fica **idêntica** |
| **Seed e obra nova:** calendário padrão com `aplicaFeriadosObra: true` e sem exceções de feriado. **Obras migradas e calendários importados:** `aplicaFeriadosObra` ausente (= false), com as exceções que já tinham, intactas | Converter as exceções migradas em "feriados da obra" | Não dá para distinguir com segurança o feriado do arquivo do feriado calculado. Converter mudaria datas além de 2029 (hoje sem feriado). Um aviso "Aplicar feriados da obra" mostra a prévia |
| **Import (achado a, T3):** o parser **para de injetar** `defaultHolidays`. Quando o calendário do projeto não tem nenhuma exceção não útil, o aviso passa a ser "O calendário do arquivo não traz feriados. O CronoAI não acrescentou nenhum: use 'Aplicar feriados da obra' em Premissas › Calendários para ver o impacto antes." O `importXml` grava os calendários importados sem `aplicaFeriadosObra` | Manter a injeção (gate P3 c) | O arquivo foi calculado sem feriados. Injetar muda as datas (83/104 × 100/104 no corpus) |
| "Aplicar feriados da obra" é uma ação por calendário, sempre com prévia: entrega antes → depois, d.u. e tarefas com datas alteradas. Também desliga ("Remover feriados da obra deste calendário") | Aplicar sem prévia | Ação explícita do usuário (achado a) |
| Carnaval e Corpus Christi: opções `carnaval`/`corpusChristi` da obra, padrão `true` (comportamento atual, PLANO §3.5), com o texto "ponto facultativo, depende de lei estadual ou municipal (validar)" | Padrão `false` | Mudaria a entrega do Aurora (CF-2 a CF-4) |
| Feriado manual exige **fonte** e guarda a UF e o município em vigor quando foi cadastrado. Até 200 por obra. Recorrente anual = mesmo dia e mês em todo ano | Lista oficial embutida | Não se inventam listas (PLANO §1; RF-03.5 parcial) |
| **Troca de UF ou município** (`atualizarDadosObra`): se houver feriado manual estadual ou municipal de outra UF ou município, uma prévia lista os feriados e o impacto de removê-los, com as opções "manter" e "remover". Sem feriado local cadastrado, a mensagem diz que os feriados estaduais e municipais **não são carregados automaticamente nesta fase** e devem ser cadastrados com a fonte | Recalcular sozinho pela UF | Não há lista oficial (Fase 2) |
| Editor de calendários: criar a partir de outro calendário (cópia), nome único (1 a 60 caracteres), jornada por dia da semana com predefinições (sem expediente / 4 h 08:00–12:00 / 8 h 08:00–12:00 e 13:00–17:00 / personalizado), exceções por data (não útil ou útil com jornada, com descrição). Limites iguais aos do import do 00004 com a emenda 01 dele: até 100 calendários; **no máximo 5 intervalos por dia** (esquema MSPDI); horário entre 00:00 e 24:00, com `00:00` como fim = 24:00 (1.440) e **`00:00–00:00` = dia inteiro**; intervalos crescentes e sem sobreposição, validados **depois** dessa conversão; calendário sem nenhum minuto útil é recusado. A validação mora em `calendarioTrabalho.ts` (`validarCalendario`) e é **reaproveitada** do 00004: se o 00004 a deixar dentro do parser, a tarefa 14 a extrai | Validação própria da tela | Uma regra só para o arquivo e para a tela |
| Excluir calendário: o padrão não se exclui; um calendário em uso só se exclui movendo as tarefas para o padrão (confirmação). Calendário derivado de HE só sai pelo "desfazer" do cenário | Exclusão livre | Tarefa órfã de calendário |
| Atribuição em lote: `atribuirCalendario(uids[], calendarioUid \| undefined)`, que reaproveita a validação de `definirCalendarioTarefa` **[00004]**. Na EAP, "aplicar calendário às N tarefas do pacote" | Só uma a uma | PLANO §3.5 E3 |
| Prévias por uma função pura nova, `compararCronogramas(antes, depois, calendarioPadrao)` em `src/lib/previaImpacto.ts` → `{ entregaAntes, entregaDepois, deltaDiasUteis, tarefas: [{ uid, inicio/termino antes → depois }] }`. Busca: a store tem `previewProgress`/`previewSinapiTask`/`previewBudgetBatch` (`:591`, `:822`, `:937`), que devolvem só o término e o delta, e nenhuma função compara tarefa a tarefa | Repetir o cálculo em cada tela | As três prévias deste ciclo (feriados, UF, calendário) precisam da lista de tarefas |
| PV: **mantida a regra do 00004 (CR-2d)**, calendário da tarefa sem as exceções úteis. O calendário derivado de HE é cópia do base com os sábados como exceção útil, então o PV dele fica igual ao do base, sem regra nova | Contar no PV as exceções úteis vindas do arquivo | A linha de base calculada pelo CronoAI ignora exceções úteis (`baselineFor`, `useProjectStore.ts:69-72`). Mudar só o PV criaria incoerência (fora do escopo) |
| `divergencias.ts` **[00004]**: a causa 3 "feriado nacional aplicado pelo CronoAI (o arquivo não trazia feriados)" passa a "feriados da obra aplicados ao calendário importado" (calendário com `aplicaFeriadosObra` e tarefa com `Task.arquivo`) | Manter o texto | Depois do achado (a), o CronoAI só aplica feriados por ação do usuário |

### Hora extra (E4)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| `ScenarioParams.overtime = { saturdays; jornada: 'integral' \| 'meio'; frentes: 'todas' \| number[] }`, padrão `{ 2, 'integral', 'todas' }` | Parâmetro de horas livre | RF-03.6 fala em meio período. Integral = intervalos do dia útil do padrão (480 min); meio = 08:00–12:00 (240 min), como o calendário "Sábado 4 h" do 00004 |
| **"Todas as frentes"** = os sábados entram como **exceção útil no calendário padrão**, como hoje **[00004 tarefa 7]**. Tarefas com calendário próprio não são convocadas, e a memória diz isso | Calendário derivado atribuído a todas as folhas sem calendário próprio | Com a P1 emendada (lag no calendário da sucessora), **as duas formas** reproduzem exatamente R$ 22.315,20 / 2 d.u. / 2027-06-21 (emenda 01, seção 15). Fica a exceção no padrão por ser a mais simples: já existe no 00004, o `undo` só remove datas, a exportação não ganha calendário nem `CalendarUID` em toda tarefa, e tarefa criada depois da HE (SINAPI, lote) continua trabalhando nos sábados, como hoje |
| **"Frentes escolhidas"** = para cada calendário base usado pelas tarefas escolhidas, cria um calendário derivado (cópia + sábados como exceção útil; `derivadoDe`, `origem: 'hora-extra'`, nome "{base} + HE 24/10 e 31/10", UID = maior + 1) e o atribui só às escolhidas que estão **ativas em ao menos um sábado convocado no cronograma atual (antes da HE)**; as outras escolhidas aparecem como "não convocadas". Pela P1 emendada, um lag útil que **chega** a uma frente escolhida é contado no calendário derivado dela e conta o sábado de HE (PR-15); um lag que chega a tarefa no padrão não conta | Somar ao calendário da obra (hoje); derivado também para escolhidas não ativas | PLANO §3.5 E4. Sem o filtro de "ativa", uma frente escolhida que não trabalha nos sábados ganharia prazo pelo lag sem custo de HE (custo e ganho descolados) |
| Sábados convocados: os próximos N sábados depois da data de status que não são úteis nem feriado (da obra ou exceção) no calendário padrão (regra de hoje, `scenarios.ts:343-345`). Para uma frente escolhida cujo calendário base já tem o sábado útil, o sábado não é HE para ela (sem custo e sem ganho) | Somar horas ao sábado já útil | Evita cobrar HE de jornada normal |
| Custo = Σ, por sábado e por frente convocada **ativa no sábado** (o intervalo agendado da tarefa cruza o expediente do sábado no calendário dela, depois da data de status): `unidades × horas do sábado × taxaHora × (1 + adicional/100)`. Horas = 8 ou 4. A equipe é convocada para o expediente inteiro do sábado (regra de hoje, `scenarios.ts:361-363`) | Cobrar só os minutos efetivamente trabalhados | Reproduz o resultado atual e a prática de convocação. A validar com RH |
| Nenhuma frente escolhida ativa nos sábados → "não aplicável", com motivo | Custo zero aplicável | Resultado vazio confundiria |
| `applyScenario`/`undoScenario`: `ScenarioUndo` ganha os opcionais `calendariosCriados?: number[]` e `calendariosAntes?: { uid: number; calendarioUid?: number }[]`. Desfazer remove os derivados e devolve cada tarefa ao calendário anterior | Guardar só `addedDays` | Desfazer precisa devolver as tarefas |

### ADR
Nenhum ADR novo. O modelo de premissas versionadas é estrutural, mas segue o padrão de dado por obra do ADR 00002 e não muda unidade (ADR 00003). Se o gate P2 escolher (b), arredondar no cálculo contraria o `CLAUDE.md` ("arredonde só na exibição"), e aí sim cabe um `/adr` e a atualização do `CLAUDE.md`.

## 04. Casos de referência (T1/T2)
Base: Aurora (`buildSeedState()`), início 2026-05-04, data de status 2026-10-23, calendário padrão seg–sex 08:00–12:00 e 13:00–17:00, depois do 00004. Os números de cenário da base são os do CR-1 do 00004, medidos no código atual. A **tarefa 1 mede de novo na base** depois do merge do 00004. Se algum mudar (por exemplo, pelo restante exato do E2 dele), vale a medição da base, registrada no ciclo: o requisito é "igual à base". Contas feitas à mão. Os dias úteis de 2026 foram contados com `node -e` (261 dias seg–sex; 12 feriados em dia de semana com Carnaval e Corpus Christi; 249 dias úteis). A cadeia 502 → 701 → 801 foi simulada com `node -e`, que reproduziu a base (701 2027-03-15 → 2027-06-09; 801 → 2027-06-23).

Composição da HE de hoje (sábados 2026-10-24 e 2026-10-31; frentes ativas 302 e 104):
- 302: 8 carpinteiros, 6 armadores e 4 pedreiros a R$ 31,40/h, mais 8 serventes a R$ 23,90/h. Total R$ 756,40/h, 26 profissionais.
- 104: 4 pedreiros a R$ 31,40/h e 2 serventes a R$ 23,90/h. Total R$ 173,40/h, 6 profissionais.
- Custo: (756,40 + 173,40) × 8 h × 1,5 × 2 sábados = **R$ 22.315,20**. Bate com o CR-1.

| Caso | Entrada | Esperado | Fonte | Teste que fixa |
|---|---|---|---|---|
| **PR-1** padrão idêntico (E1, **não pode mudar**) | Seed com `premissasPadrao()` (v1) | Crashing: 105 de 16 → 13 d, 3 d.u., extra **R$ 12.616,80**, economia **R$ 29.550,00**, entrega 2027-06-18, risco Baixo. Fast-tracking: 105 → 401 SS+3, 13 d.u., contingência **R$ 25.350,00** (780.000 × 4% × 13/16), economia **R$ 128.050,00**, 2027-06-04, risco Alto. HE: 2 d.u., **R$ 22.315,20**, 64 profissionais-dia, economia **R$ 19.700,00**, saldo **+R$ 2.615,20**, risco Médio, 2027-06-21. Recomendação: crashing. DLP do `m-concreto` igual à da base. EVM: PV 7.259.250,00; SPI 0,8883 | CR-1 do 00004 (medição) | `src/lib/scenarios.caracterizacao.test.ts` (novo, tarefa 1, **verde antes** de mexer); `scenarios.test.ts` inalterado |
| **PR-2** indireto R$ 12.000 (SPEC §5) | v2 com vigência 2026-10-23 e `custoIndiretoDiario` 12.000 | Economia: crashing **R$ 36.000,00** (saldo −23.383,20), fast-tracking **R$ 156.000,00** (saldo −130.650,00), HE **R$ 24.000,00** (saldo **−1.684,80**, e o risco da HE passa de **Médio para Baixo**, porque `net > 0` deixa de valer, `scenarios.ts:385`). Dias, custos extras e entregas iguais ao PR-1. Recomendação: crashing | `economia = max(0, d.u.) × indireto diário` (`scenarios.ts:219`, `:305`, `:370`) | `scenarios.test.ts` (função) e `useProjectStore.test.ts` (ação `criarVersaoPremissas` → `store.scenarios` recalculado na hora) |
| **PR-3** indireto mensal (gate P1 = a) | R$ 249.000,00/mês, ano da vigência 2026, calendário padrão com Carnaval e Corpus Christi | 249 d.u. → **R$ 12.000,00/dia** (exato; 249.000 × 12 ÷ 249). Sem Carnaval e sem Corpus Christi: 252 d.u. → R$ 11.857,142857…/dia, exibido **R$ 11.857,14**; o cálculo usa o valor sem arredondar | `diário = mensal × 12 ÷ dias úteis do calendário padrão no ano da vigência` (proposta, a validar com Orçamento) | `premissas.test.ts` |
| **PR-4** versão vigente e rótulo | v1 (2026-05-04), v2 (2026-10-23, indireto 12.000), v3 (2026-11-01, indireto 15.000) | Status 2026-10-23: vigente v2, "**Premissas v2 — vigência 23/10/2026**", economia da HE = d.u. × 12.000. Status 2026-11-01: v3, "**Premissas v3 — vigência 01/11/2026**", economia = `max(0, d.u.) × 15.000`. Criar uma v4 com vigência 2026-10-01: recusada ("A vigência deve ser igual ou posterior à da versão 3 (01/11/2026).") | RF-03.3; SPEC §5 | `premissas.test.ts`, `useProjectStore.test.ts` |
| **PR-5** taxa sem encargos | Pedreiro R$ 20,00/h com `incluiEncargos = false` e encargos 57% | Taxa efetiva **R$ 31,40** (`toBeCloseTo` com 2 casas; 20 × 1,57). O crashing dá o mesmo **R$ 12.616,80** do PR-1. Taxa sem encargos e encargos não informado: recusada ("Informe os encargos sociais para usar taxa sem encargos.") | Taxa com encargos = base × (1 + encargos) (a validar com Orçamento) | `premissas.test.ts`, `scenarios.test.ts` |
| **PR-6** função não cadastrada | Recurso "Montador" (não está nas taxas) | `taxaHora` = **30** (padrão, igual a `?? 30`). Com `taxaFuncaoNaoCadastrada` 35: **35** | `scenarios.ts:13` | `premissas.test.ts` |
| **PR-7** HE com todas as frentes e sábado inteiro (E4; **igual à base**) | `{ saturdays: 2, jornada: 'integral', frentes: 'todas' }` | Igual ao PR-1: sábados 2026-10-24 e 2026-10-31 como exceção útil no padrão, 2 d.u., R$ 22.315,20, 64 profissionais-dia, 2027-06-21. `{ saturdays: 1 }` → 1 d.u.; `{ saturdays: 4 }` → 4 d.u. (`scenarios.test.ts:50-55`) | `simulateOvertime` na base | `scenarios.caracterizacao.test.ts`, `scenarios.test.ts` |
| **PR-8** HE com frente escolhida {104}, sábado inteiro | `frentes: [104]` | Calendário derivado uid 2 "Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10", só no 104. O 104 termina **2026-11-03** (na base, 2026-11-05) e o 105 começa 2 d.u. antes. **2 d.u.**, custo **R$ 4.161,60** (173,40 × 8 × 1,5 × 2), **12** profissionais-dia, economia R$ 19.700,00, saldo **−R$ 15.538,40**, risco Baixo, entrega **2027-06-21**. O 302 continua no padrão e termina na data da base | Regra da seção 03 (HE); restante do 104 começa no próximo momento útil do calendário dele depois da data de status (`calculo-precisao.md`) | `scenarios.test.ts` › frentes escolhidas |
| **PR-9** HE só numa frente fora do caminho crítico | `frentes: [302]` | 0 d.u., custo **R$ 18.153,60** (756,40 × 8 × 1,5 × 2), economia 0, entrega 2027-06-23 inalterada; a nota de risco diz que a frente não está no caminho crítico; `recommendScenario` ignora o cenário | idem | idem |
| **PR-10** meio período, todas as frentes (SPEC §5: sábado de 4 h = 0,5 dia) | `{ saturdays: 2, jornada: 'meio', frentes: 'todas' }` | Exceções úteis 08:00–12:00 nos dois sábados. O 104 e o 302 terminam em **2026-11-04** (base 2026-11-05). **1 d.u.** (2 × 0,5), custo **R$ 11.157,60** (929,80 × 4 × 1,5 × 2), economia R$ 9.850,00, entrega **2027-06-22**, resumo "(4 h, adicional de 50%)" | SPEC-03 §5 | `scenarios.test.ts` › meio período |
| **PR-11** meio período, frente {104} | `jornada: 'meio', frentes: [104]` | 1 d.u., custo **R$ 2.080,80**, entrega 2027-06-22, o 104 termina em 2026-11-04 | idem | idem |
| **PR-12** frente não ativa nos sábados | `frentes: [801]` | Não aplicável: "Nenhuma frente escolhida trabalha nos sábados convocados (24/10, 31/10)." | Seção 03 | idem |
| **PR-13** desfazer as frentes escolhidas | Aplicar o PR-8 e desfazer | Calendário uid 2 removido; o 104 fica sem `calendarioUid`; entrega 2027-06-23; custo de recuperação removido | Seção 03 | `useProjectStore.test.ts` |
| **PR-14** sábado já útil na frente | Tarefa X no calendário "Concretagem — sábado manhã" (sábado 08:00–12:00 na semana), escolhida sozinha, ativa nos sábados | Não aplicável: "Os sábados convocados já são úteis no calendário das frentes escolhidas." | Seção 03 | `scenarios.test.ts` |
| **PR-15** lag que chega a uma frente com calendário derivado (emenda 01) | A no padrão, 5 d desde seg 2026-10-19 08:00 (termina 2026-10-23 17:00); B FS +1 d (480 min); modo linha de base, sem data de status | B no derivado com o sábado 2026-10-24 inteiro: B começa **2026-10-26 08:00** (o lag consome o sábado). Derivado de meio período (sábado 08:00–12:00): **2026-10-26 13:00**. B no padrão sem HE: **2026-10-27 08:00**. Com a HE "todas as frentes" (sábado no padrão) e B no padrão: 2026-10-26 08:00 | P1 emendada do 00004 (calendário da sucessora; mesma conta do CR-3 dele) | `cpm.test.ts` › lag com calendário derivado |
| **CF-1** feriados da obra no padrão (E3; **igual à base**) | Seed com padrão `aplicaFeriadosObra: true`, configuração padrão | Cronograma, EVM e cenários do PR-1. Exportação do seed **idêntica** à da base (feriados de 2026 a 2029) | Igualdade com `SEED_HOLIDAYS` | `useProjectStore.test.ts`; evidência da exportação (tarefa 26) |
| **CF-2** sem Carnaval | `feriados.carnaval = false` | 701 começa **2027-03-11** (base 2027-03-15): o lag SS+30 de 502 → 701 atravessa 08 e 09/02/2027. Entrega **2027-06-21**; atraso **14 d.u.** (base 16). PV 7.259.250,00 inalterado (a linha de base gravada não muda) | Calendário (Páscoa 2027 = 28/03; Carnaval −48/−47) | `useProjectStore.test.ts` › feriados da obra |
| **CF-3** sem Corpus Christi | `corpusChristi = false` | 701 termina em 2027-06-08 (27/05/2027 vira útil). Entrega **2027-06-22**; atraso **15 d.u.** | idem | idem |
| **CF-4** sem os dois | ambos `false` | Entrega **2027-06-18**; atraso **13 d.u.** | idem | idem |
| **CF-5** 20/11 (achado c) | `feriadosNacionais(2023)` e `(2024)`; tarefa de 5 d desde seg 2023-11-20 num calendário com feriados da obra | 2023 sem 2023-11-20; 2024 com 2024-11-20. A tarefa termina **2023-11-24** (antes: 2023-11-27) | Lei 14.759/2023 (**a confirmar com o Jurídico**) | `calendar.test.ts`, `feriadosObra.test.ts` |
| **CF-6** feriado municipal manual | Feriado municipal fictício 2026-08-20 (quinta), fonte "Lei municipal fictícia de teste", recorrente; tarefa de 5 d desde seg 2026-08-17 | Término **2026-08-24** (sem o feriado, 2026-08-21). 2027-08-20 também não útil. Exceção própria útil em 2026-08-20 no calendário prevalece: término 2026-08-21 | Seção 03 (precedência) | `feriadosObra.test.ts` |
| **CF-7** import sem feriados (achado a) | `src/lib/__fixtures__/mspdi-divergencias.xml` **[00004]** (sem feriados, início 2026-08-31) | Import sem feriado injetado e com o aviso novo. D-2 (T2) **não diverge** (2026-09-07 → 2026-09-11, igual ao arquivo); D-3 também não. D-4 calculado **2026-09-07 → 2026-09-08**, **−5 d.u.** (causa: manual); D-6 (T5) calculado **2026-09-09**, **−5 d.u.** (causa: predecessora UID 4 agendada manualmente). D-5: T1 com 6 d termina **2026-09-07**, +1 d.u. (causa: alterada no CronoAI). Depois de "Aplicar feriados da obra": prévia com entrega antes → depois e T2, T3 alteradas; o painel volta a mostrar D-2 (2026-09-08 → 2026-09-14, +1 d.u.) com a causa "feriados da obra aplicados ao calendário importado", e as diferenças voltam às do 00004 emendado (D-2 +1, D-3 +1, D-4 −4, D-5 +1, D-6 −4) | Achado (a); casos D-1 a D-6 do 00004 (emenda 01) atualizados | `msProjectXmlParser.test.ts`, `divergencias.test.ts`, `useProjectStore.obras.test.ts` |
| **CF-8** troca de UF | Obra com UF A e feriado estadual manual fictício 2026-07-09 (quinta) cadastrado com UF A; tarefa de 5 d desde 2026-07-06; troca para a UF B | A prévia lista 1 feriado estadual de A; com o feriado, término 2026-07-13; removido, **2026-07-10**. "Manter" deixa tudo como está | RF-03.5 (parcial) | `previaImpacto.test.ts`, `useProjectStore.test.ts` |
| **CS-1** calendário criado na tela | Calendário "Concretagem — sábado manhã" criado pela ação (cópia do padrão + sábado 08:00–12:00) e atribuído à tarefa A (12 d, desde 2026-08-03 08:00) | Término **2026-08-17 17:00** (no padrão, 2026-08-18 17:00): o CR-2a do 00004 pela ação da store | CR-2a do 00004; SPEC §5 | `useProjectStore.test.ts` › calendários |
| **CS-2** exceção por data (sábado de 4 h) | Padrão com exceção útil sábado 2026-08-08 08:00–12:00; tarefa A de 12 d desde 2026-08-03 | Término **2026-08-18 12:00** (0,5 d antes) | Minuto útil (RF-05.1) | `calendarioTrabalho.test.ts` |
| **CS-3** jornada por dia | "Fachada — sem chuva": seg–qui 07:00–12:00 e 13:00–17:00 (9 h), sex 07:00–11:00 (4 h); tarefa de 5 d (2.400 min) desde seg 2026-08-03 07:00 | Término **2026-08-07 11:00** | RF-03.4 | `calendarioTrabalho.test.ts` |
| **CS-5** limites de intervalo (emenda 01 do 00004) | Jornada personalizada `00:00–00:00`; `22:00–00:00`; 6 intervalos num dia; `13:00–12:00` | `00:00–00:00` = **1.440 min** no dia (dia inteiro); `22:00–00:00` = **120 min**; 6 intervalos recusados ("No máximo 5 intervalos por dia."); `13:00–12:00` recusado | Esquema MSPDI (5 `WorkingTime`); calendário nativo "24 Hours" no corpus (parecer da tarefa 0 do 00004, item 9a) | `calendarioTrabalho.test.ts` |
| **CS-4** lote por pacote | `atribuirCalendario` com as folhas do pacote 03.01 (103, 104, 105) → "Sábado 4 h" | As 3 tarefas com o `calendarioUid`; 103 (concluída) não muda de data; uid inexistente recusado | Seção 03 | `useProjectStore.test.ts` |

Bordas cobertas: marco; tarefa concluída e iniciada; feriado no sábado convocado; vigência igual à da última versão (aceita); divisão por dias úteis zero no indireto mensal (calendário sem dia útil no ano: recusa com mensagem, nunca `Infinity`); taxa 0 ou negativa (recusada); percentual fora da faixa (recusado).

**Efeito em quem consome os números:** cartões de cenário e recomendação (Caminho Crítico), memória de cálculo, custos de recuperação (`recoveryCosts`), DLP (Suprimentos), rótulo da versão no EVM. A Curva S e o EVM não mudam de número (premissas não entram no PV, EV ou AC). Calendários e feriados mudam datas no Gantt, na EAP, no MSPDI e no painel de divergências.

## 05. MS Project e arquivos (T3)
- **Arquivos de exemplo (fictícios, versionados):**
  - `src/lib/__fixtures__/mspdi-divergencias.xml` **[00004]**: calendário sem feriados (CF-7);
  - `src/lib/__fixtures__/mspdi-calendarios-restricoes.xml` **[00004]**: vários calendários;
  - o seed (Aurora);
  - o corpus local do MPXJ (`CRONOAI_REF_DIR`, fora do git).
  
  Nenhum arquivo novo.
- **Preservado na ida e volta:** tudo o que o 00004 preserva, mais:
  - calendários alternativos criados na tela (UID, nome, semana, exceções com horário);
  - calendário derivado de HE e o `CalendarUID` das tarefas escolhidas;
  - feriados da obra como exceções não úteis do calendário que os aplica.
  
  Não voltam do MSPDI: a **origem** do feriado (fonte, abrangência), `descricao` da exceção, `derivadoDe` e `aplicaFeriadosObra`, porque o formato legado de exceção não tem nome. Reimportar o próprio `.xml` traz esses dias como exceções do arquivo, com as mesmas datas. O aviso do import não muda por isso: as datas são preservadas.
- **Elementos novos no `SCHEMA_ORDER`:** nenhum.
- **Mudança no parser (só esta):** `parseMspdiXml` não chama mais `defaultHolidays` no calendário sem feriados. Troca o texto do aviso e remove o import, se ficar sem uso. `buildMspdiXml` não muda.
- **Comportamento esperado no MS Project:**
  - os calendários "Concretagem — sábado manhã" e "{base} + HE …" aparecem em "Alterar período útil";
  - as tarefas escolhidas mostram o ícone de calendário;
  - feriados da obra aparecem como exceções.
  
  Conferência no MS Project real: **`M-5` `NOT_RUN`** (sem acesso).
- **Avisos ao usuário no import:** o aviso "Calendário sem feriados no XML; aplicados os feriados nacionais brasileiros." é substituído pelo da seção 03. O corpus (local) registra a contagem antes e depois.

## 06. Estado salvo (T4) — migração esquema 3 → 4
- **Onde:** `src/lib/migracaoEstado.ts`, com `ESQUEMA_ATUAL = 4` e o passo `{ de: 3, para: 4 }`. A cadeia 1 → 2 → 3 → 4 serve à chave `cronoai-state-v1` e aos registros do IndexedDB. Cada obra é migrada ao ser lida (`migrarRegistro`) e regravada no esquema 4 na próxima gravação.
- **Conversões do passo (pura e determinística):**
  - `premissas = [{ versao: 1, vigencia: meta.startDate, motivo: 'Premissas anteriores ao ciclo 00005 (migradas)', valores }]`, com `valores = premissasPadrao()` e:
    - `custoIndiretoDiario = meta.dailyIndirectCost` (número finito ≥ 0; senão o padrão 9.850, com aviso);
    - `margemDlpDias = meta.safetyMarginDays ?? 3`;
    - `origens` dos dois campos `'nao-documentada'` quando diferentes do padrão, e `'ilustrativa'` quando iguais.
  - `delete meta.dailyIndirectCost` e `delete meta.safetyMarginDays`.
  - `feriados` ausente → `{ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] }`.
  - Calendários: **nenhuma mudança** (`aplicaFeriadosObra` ausente = false; as exceções ficam como estão). Por isso nenhuma data muda.
  - `undo`: sem conversão. `ScenarioUndo.result` antigo não tem `premissas` e aparece como "versão não registrada (anterior ao ciclo 00005)". O `addedDays` de uma HE aplicada no 00004 continua sendo desfeito como exceção útil do padrão.
- **`completarChaves` do esquema 4:** `premissas` ausente, vazio ou inválido (sem versão com `valores` válidos por `validarPremissas`) → `[v1 padrão]`, com o aviso de chaves preenchidas que já existe. `feriados` ausente ou inválido → padrão.
- **Campos opcionais dos E3 e E4** (`aplicaFeriadosObra`, `derivadoDe`, `origem`, `descricao`, campos novos de `ScenarioUndo`): **sem passo novo**. Ausente = comportamento anterior (mesma abordagem dos E2–E4 do 00004).
- **Seed e obra em branco:** `buildSeedState()` e `estadoObraVazia` (`obras.ts`) nascem no esquema 4.
  - Seed: `premissas = [v1 padrão]` com vigência 2026-05-04; padrão com `aplicaFeriadosObra: true` e sem exceções de feriado (E3).
  - Obra em branco: `custoIndiretoDiario` igual ao de hoje (9.850, premissa ilustrativa, `useProjectStore.ts:1067`).
- **Compatibilidade e rollback:**
  - O app do 00004 (esquema 3) recusa a obra no esquema 4 e nunca a sobrescreve (ADR 00002).
  - Reverter o ciclo deixa as obras migradas inacessíveis até reaplicar. A chave v1 fica intacta.
  - O rollback é do ciclo inteiro (os 4 commits).
- **Testes do formato anterior:** P-1 a P-6 (seção 12).

## 07. Dados (T8 com banco)
Não se aplica — sem backend.

## 08. Segurança
| Superfície | Ameaça | Mitigação | Teste |
|---|---|---|---|
| Textos digitados (nome de calendário, feriado, fonte, motivo, referência) | XSS ao exibir | Só interpolação (nada de `v-html`); limites de tamanho (60/80/120/200) na validação da store | **S-1:** `validar-regras.mjs` (`v-html`) + teste de validação com texto acima do limite e com `<script>` (exibido como texto) |
| Estado salvo | Crescimento (cota) com versões, feriados e calendários | Até 200 feriados manuais, 100 calendários e 5 intervalos por dia (limites do 00004, emenda 01); a versão de premissas tem cerca de 1 KB | **S-2:** teste de recusa acima dos limites |
| Parser | Regressão no endurecimento do 00003/00004 | Só a remoção da injeção; DOCTYPE/ENTITY e `MAX_MSPDI_CHARS` intactos | **S-3:** testes de segurança do parser inalterados e verdes |
| Números | `NaN`/`Infinity` no estado ou na tela (indireto mensal ÷ 0, taxa inválida) | Validação recusa; nada de divisão sem guarda | **S-4:** bordas da seção 04 |
| Dependências e fixtures | Pacote novo; dado real | Nenhum pacote; feriados e UFs de teste fictícios (nenhum feriado real de UF ou município citado como lista) | **S-5:** `auditar-dependencias.mjs`; revisão |

Validação com a **Segurança da Informação:** não exigida (sem superfície nova em produção). O `seguranca` confere S-1 a S-5.

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| E1 | Premissas como dado da obra, versionadas; cenários e DLP por parâmetro; migração 3 → 4 | `src/lib` (`premissas.ts`, `scenarios.ts`, `format.ts`, `migracaoEstado.ts`, `obras.ts`), tipos, seed, store | AC-1, AC-2, AC-3, AC-4 (função), AC-5, AC-6 | `feat(premissas): premissas por obra versionadas nos cenários e na DLP (ciclo 00005)` |
| E2 | Tela "Premissas da obra" e versão exibida nos cenários e no EVM | `src/modules/PremissasModule.vue` + `src/modules/premissas/`, `ui.ts`, telas que mostram premissas, E2E | AC-4 (tela), AC-7 | `feat(premissas): tela de premissas da obra com origem e versões (ciclo 00005)` |
| E3 | Calendários alternativos, exceções, jornada por dia, atribuição em lote, feriados da obra, import sem feriados injetados | `calendar.ts`, `feriadosObra.ts`, `previaImpacto.ts`, `calendarioTrabalho.ts`, `divergencias.ts`, parser (só a injeção), store, telas, E2E | AC-8 a AC-11 | `feat(calendarios): calendários alternativos, feriados da obra e import sem feriados injetados (ciclo 00005)` |
| E4 | Hora extra com meio período e frentes escolhidas; documentação | `scenarios.ts`, store, `CriticalPathModule.vue`, E2E, docs | AC-12, AC-13, AC-14 | `feat(cenarios): hora extra com meio período e frentes escolhidas (ciclo 00005)` |

São cerca de 27 tarefas e 45 arquivos. Cada entregável passa no `npm run ci` sozinho. O corpus e o desempenho estrito rodam só localmente.

## 10. Tarefas
| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | Conferir: (i) status legal de 20/11 (Lei 14.759/2023), Sexta-feira Santa, Carnaval e Corpus Christi (nacional, facultativo ou municipal), resumindo as fontes para o Jurídico; (ii) a regra "todas as frentes = calendário padrão" e "frentes escolhidas = calendário derivado" contra a P1 emendada (sucessora), inclusive o filtro "só escolhidas ativas"; (iii) os números de PR-7 a PR-15 e CF-2 a CF-5; (iv) a referência de arredondamento para o P2 (ex.: ABNT NBR 5891, a confirmar). Resposta resumida no ciclo; divergência volta ao usuário | especialista-obra (leitura) | — (ciclo) | gate |
| 1 | E1 | Caracterização **antes de mexer**: `scenarios.caracterizacao.test.ts` com o PR-1 inteiro (os 3 cenários: dias, extra, economia, saldo, risco, profissionais-dia, entrega, recomendação; DLP do `m-concreto`; PV/SPI). Verde na base | dev-frontend | `src/lib/scenarios.caracterizacao.test.ts` | 0 |
| 2 | E1 | Tipos (premissas, feriados, opcionais de `CalendarioObra`/`ExcecaoCalendario`/`ScenarioUndo`/`ScenarioResult`); `ProjectMeta` sem `dailyIndirectCost`/`safetyMarginDays` | dev-frontend | `src/types/domain.ts`, `src/types/obra.ts` | 1 |
| 3 | E1 | `premissas.ts` e testes PR-3 a PR-6, mais validação (faixas, textos, vigência) | dev-frontend | `src/lib/premissas.ts`, `src/lib/premissas.test.ts` | 2 |
| 4 | E1 | Arredondamento conforme o P2 (com P2 = a: `arredondarBancario(valor, casas)` em `format.ts`, usado por `fmtBRLCents`; testes 0,125 → 0,12; 0,135 → 0,14; 2,675 → 2,68; 1,005 → 1,00; −0,125 → −0,12) | dev-frontend | `src/lib/format.ts`, `src/lib/format.test.ts` | 2 |
| 5 | E1 | `scenarios.ts`: `ctx.premissas`, `rateOf(premissas, …)`, horas por dia = `minutosPorDia ÷ 60`, `result.premissas`, memória com "(ilustrativa)" quando a origem for ilustrativa. PR-1 sem alteração; PR-2, PR-5 | dev-frontend | `src/lib/scenarios.ts`, `src/lib/scenarios.test.ts` | 3 |
| 6 | E1 | Migração 3 → 4 e `completarChaves` do esquema 4. P-1 a P-5 | dev-frontend | `src/lib/migracaoEstado.ts`, `src/lib/migracaoEstado.test.ts` | 2 |
| 7 | E1 | Store, seed e obra em branco: `state.premissas`, derivados `premissasVigentes` e `versaoPremissasVigente`, `scenarioCtx`, margem da DLP pelas premissas, ação `criarVersaoPremissas` (valida e grava no log), remoção de `setSafetyMargin`, `SEED_PREMISSAS`, `estadoObraVazia`. PR-2 e PR-4 pela store; P-6 | dev-frontend | `src/data/seed.ts`, `src/stores/useProjectStore.ts`, `src/lib/obras.ts`, `src/lib/obras.test.ts` (`:120`, `:132`: chaves do `meta` mudam, com justificativa), `src/stores/useProjectStore.test.ts`, `src/stores/useProjectStore.obras.test.ts` (`:358`) | 5, 6 |
| 8 | E1 | RNF-03.1: com a obra sintética do 00004 (3.000 tarefas), mudar o indireto e recalcular `scenarios` + `supplies`. CI < 3.000 ms; local (`CRONOAI_PERF=1`) mediana < **1.000 ms**. Se passar do limite, separar o derivado de agenda (CPM) do de custo antes de otimizar outra coisa | dev-frontend | `src/lib/premissas.desempenho.test.ts` | 7 |
| — | E1 | **Checkpoint:** PR-1 verde sem alteração; arquivos tocados conferidos contra o plano | orquestrador | — | 8 |
| 9 | E2 | `PremissasModule.vue` (aba Premissas): rascunho local → "Salvar como nova versão" (vigência, motivo); indireto diário ou mensal com a conta exibida; tabela de taxas (função, R$/h, inclui encargos, origem, referência, data-base); selo "ilustrativa"; lista de versões com a vigente marcada; aviso de RH/Jurídico no adicional de HE. Entrada "Premissas" em `MODULES` | dev-frontend | `src/modules/PremissasModule.vue`, `src/modules/premissas/PremissasForm.vue`, `src/modules/premissas/TaxasFuncao.vue`, `src/modules/premissas/VersoesPremissas.vue`, `src/stores/ui.ts`, `src/App.vue` (se o roteamento por módulo exigir) | E1 |
| 10 | E2 | Rótulo da versão no `ScenarioCard` e no `EvmModule`; textos fixos de premissa (`CriticalPathModule.vue:131`, `:190`) passam a vir das premissas vigentes; margem da DLP só leitura com link (`SupplyModule.vue`); `SinapiModule.vue:43` com as premissas | dev-frontend | `src/modules/critical/ScenarioCard.vue`, `src/modules/CriticalPathModule.vue`, `src/modules/EvmModule.vue`, `src/modules/SupplyModule.vue`, `src/modules/SinapiModule.vue` | 9 |
| 11 | E2 | E2E: criar a versão com indireto 12.000 → o cartão da HE mostra economia R$ 24.000 e "Premissas v2 — vigência 23/10/2026"; KPIs do Aurora inalterados | dev-frontend | `e2e/premissas.spec.ts` (novo) | 10 |
| 12 | E3 | `calendar.ts`: `feriadosNacionais` (20/11 ≥ 2024), `carnaval`, `corpusChristi`; `brazilianHolidays` = união. CF-5 (parte de `calendar.ts`); `defaultHolidays(2026, 2029)` igual a hoje | dev-frontend | `src/lib/calendar.ts`, `src/lib/calendar.test.ts` | E1 |
| 13 | E3 | `feriadosObra.ts`: gerador por ano, materialização por faixa de anos, `validarFeriadoManual`, `feriadosForaDoLocal(config, uf, municipio)`; gancho `feriadosPorAno` na compilação **[00004]** com precedência. CF-5, CF-6 | dev-frontend | `src/lib/feriadosObra.ts`, `src/lib/feriadosObra.test.ts`, `src/lib/calendarioTrabalho.ts` | 12 |
| 14 | E3 | `calendarioTrabalho.ts`: `validarCalendario` reaproveitada ou extraída do parser **[00004]**, `copiarCalendario`, predefinições de jornada, exceção com descrição; `00:00–00:00` = dia inteiro e no máximo 5 intervalos por dia. CS-2, CS-3, CS-5, limites (S-2) | dev-frontend | `src/lib/calendarioTrabalho.ts`, `src/lib/calendarioTrabalho.test.ts` (e `msProjectXmlParser.ts`, se a extração exigir, sem mudar comportamento) | 13 |
| 15 | E3 | `previaImpacto.ts` (`compararCronogramas`); CF-8 na função | dev-frontend | `src/lib/previaImpacto.ts`, `src/lib/previaImpacto.test.ts` | 13 |
| 16 | E3 | `divergencias.ts`: causa renomeada; D-2 a D-6 atualizados (CF-7: sem feriados, D-4 e D-6 −5 d.u.; depois de aplicar, os números do 00004) | dev-frontend | `src/lib/divergencias.ts`, `src/lib/divergencias.test.ts` | 17 |
| 17 | E3 | **Parser (T3):** remover a injeção e trocar o aviso; teste do import da fixture sem feriados; ida e volta com `strictOrder` inalterada; testes de segurança do parser verdes | dev-frontend | `src/lib/msProjectXmlParser.ts`, `src/lib/msProjectXmlParser.test.ts` | E1 |
| 18 | E3 | Corpus local: a comparação de datas passa a usar o calendário importado como está. Fixar a contagem nova ("iguais"; o 00003 tinha 100/104 na coluna "sem feriados", e a contagem de referência é a que o 00004 deixar), com o antes e o depois no relatório | dev-frontend | `src/lib/msProjectXmlParser.corpus.test.ts` | 17 |
| 19 | E3 | Store: `state.feriados`; calendários compilados com feriados; ações `criarCalendario`, `editarCalendario`, `excluirCalendario`, `definirExcecao`, `atribuirCalendario`, `definirConfigFeriados`, `adicionarFeriadoManual`/`removerFeriadoManual`, `previaAplicarFeriados`/`aplicarFeriadosObra`, `previaTrocaLocal` e a opção em `atualizarDadosObra`; `importXml` sem `aplicaFeriadosObra`; `exportXml` materializa os feriados; seed com padrão `aplicaFeriadosObra: true`. Todas com log. CF-1 a CF-4, CF-6 a CF-8, CS-1, CS-4 | dev-frontend | `src/stores/useProjectStore.ts`, `src/data/seed.ts`, `src/stores/useProjectStore.test.ts`, `src/stores/useProjectStore.obras.test.ts` | 14, 15, 16 |
| 20 | E3 | Ida e volta MSPDI: exportação com calendário alternativo, feriado manual e calendário derivado → `validateMspdi(…, { strictOrder: true })` sem erros → `parseMspdiXml` → mesmas datas, calendários e `CalendarUID` | dev-frontend | `src/lib/msProjectXmlParser.test.ts` | 19 |
| 21 | E3 | Telas: abas "Calendários" e "Feriados" no módulo de premissas (editor, exceções, aviso "Aplicar feriados da obra" com prévia); atribuição em lote na EAP; prévia da troca de UF/município | dev-frontend | `src/modules/premissas/CalendariosEditor.vue`, `src/modules/premissas/FeriadosObra.vue`, `src/modules/premissas/PreviaImpacto.vue`, `src/modules/PremissasModule.vue`, `src/modules/WbsModule.vue`, `src/modules/ObrasModule.vue`, `src/modules/obras/ObraDadosForm.vue` | 19 |
| 22 | E3 | E2E: criar "Concretagem — sábado manhã", atribuir ao pacote 03.01 e ver as datas; importar a fixture sem feriados → aviso → aplicar com prévia | dev-frontend | `e2e/calendarios.spec.ts` (novo) | 21 |
| 23 | E4 | `simulateOvertime`: `jornada` e `frentes`; caminho "todas" igual ao de hoje; calendários derivados; custo por calendário da frente; derivado só para as escolhidas ativas nos sábados no cronograma atual; não aplicável. PR-7 a PR-12, PR-14, PR-15 | dev-frontend | `src/lib/scenarios.ts`, `src/lib/scenarios.test.ts`, `src/lib/scenarios.caracterizacao.test.ts` (PR-7 na caracterização, sem alterar o PR-1) | E3 |
| 24 | E4 | Store: `applyScenario`/`undoScenario` com calendários derivados e `ScenarioUndo` novo. PR-13; desfazer uma HE do 00004 depois da migração | dev-frontend | `src/stores/useProjectStore.ts`, `src/stores/useProjectStore.test.ts` | 23 |
| 25 | E4 | Tela da HE: meio período; "todas as frentes no calendário padrão" × "escolher frentes" (tarefas ativas nos sábados, críticas primeiro, com "selecionar pacote"); memória e resumo com as frentes. E2E: escolher {104} → R$ 4.161,60 e 2 d.u.; desfazer volta a 2027-06-23 | dev-frontend | `src/modules/CriticalPathModule.vue`, `src/modules/critical/ScenarioCard.vue`, `e2e/premissas.spec.ts` | 24 |
| 26 | E4 | Docs e evidências: `CLAUDE.md` (premissas por obra; mapa com `premissas.ts`/`feriadosObra.ts`/`previaImpacto.ts`; dívida "Premissas fixas no código" substituída por "premissas padrão ilustrativas até validação"), `calculo-precisao.md` (premissas, HE, feriados, arredondamento), `divida-conhecida.md`, `msproject-mspdi.md` (feriados não injetados). Evidências do orquestrador: exportação do seed antes × depois (diff vazio, com `CreationDate`/`LastSaved` normalizados), corpus local, V-1 a V-4 | dev-frontend + orquestrador | `CLAUDE.md`, `.claude/rules/calculo-precisao.md`, `.claude/rules/divida-conhecida.md`, `.claude/rules/msproject-mspdi.md` | 25 |

### Grafo
```
gate ─ 0 ─ 1 ─ 2 ─┬─ 3 ─ 5 ─┐
                  ├─ 4 ─────┤
                  └─ 6 ─────┴─ 7 ─ 8 ─ [checkpoint]                       (E1)
E1 ─ 9 ─ 10 ─ 11                                                          (E2)
E1 ─┬─ 12 ─ 13 ─┬─ 14 ─┐
    │           └─ 15 ─┼─ 19 ─┬─ 20
    └─ 17 ─┬─ 18       │      ├─ 21 ─ 22                                   (E3)
           └─ 16 ──────┘
E2 + E3 ─ 23 ─ 24 ─ 25 ─ 26                                               (E4)
```
- O E2 (telas) e o começo do E3 em `src/lib` (12–18) podem correr em paralelo depois do E1: os arquivos são disjuntos. A 19 em diante vem depois do E2, porque a store e o `PremissasModule.vue` são compartilhados.
- A 3 e a 4 correm em paralelo com a 6. O resto da store fica com um dev só, em sequência.

### Base e ordem com o 00004
- **Base:** `master` com o 00004 já mergeado. Toda tarefa marcada **[00004]** usa os nomes do plano dele. Se a implementação do 00004 mudar um nome (ex.: `calendarioUid`, `calendarioTrabalho.ts`, `definirCalendarioTarefa`), vale o nome implementado, e a troca vai para o ciclo.
- Sem o 00004 na `master`: PR empilhado sobre a branch dele (BASE = a branch do 00004), registrado no ciclo.

## 11. Testes previstos
| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|
| AC-1 | caracterização no padrão | `scenarios.caracterizacao.test.ts`, `scenarios.test.ts`, `useProjectStore.test.ts` (N-1 a N-3) | PR-1 inteiro, igual antes e depois de cada entregável |
| AC-2 | indireto R$ 12.000 | `scenarios.test.ts`, `useProjectStore.test.ts` | PR-2 (36.000,00; 156.000,00; 24.000,00; risco da HE Baixo) |
| AC-3 | indireto mensal, taxas, função não cadastrada | `premissas.test.ts` | PR-3 (12.000,00; 11.857,14 exibido), PR-5 (31,40; 12.616,80), PR-6 (30; 35) |
| AC-4 | versões e rótulo | `premissas.test.ts`, `useProjectStore.test.ts`, `e2e/premissas.spec.ts` | PR-4 ("Premissas v3 — vigência 01/11/2026"; v4 retroativa recusada) |
| AC-5 | migração 3 → 4 | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | P-1 a P-6 |
| AC-6 | desempenho | `premissas.desempenho.test.ts` | < 1.000 ms local (mediana de 5); < 3.000 ms no CI |
| AC-7 | tela e textos | `e2e/premissas.spec.ts`, V-1, V-2 | Economia R$ 24.000 no cartão; selo "ilustrativa"; margem da DLP só leitura |
| AC-8 | feriados da obra | `calendar.test.ts`, `feriadosObra.test.ts`, `useProjectStore.test.ts` | CF-1 a CF-6 |
| AC-9 | calendários e sábado de 4 h | `calendarioTrabalho.test.ts`, `useProjectStore.test.ts` | CS-1 (2026-08-17 17:00), CS-2 (2026-08-18 12:00), CS-3 (2026-08-07 11:00), CS-4, CS-5 (1.440 min; 120 min; 6 intervalos recusados) |
| AC-10 | import sem feriados e aplicar com prévia | `msProjectXmlParser.test.ts`, `divergencias.test.ts`, `useProjectStore.obras.test.ts`, `e2e/calendarios.spec.ts` | CF-7 |
| AC-11 | troca de UF/município | `previaImpacto.test.ts`, `useProjectStore.test.ts` | CF-8 |
| AC-12 | HE meio período e frentes | `scenarios.test.ts`, `cpm.test.ts` | PR-7 a PR-12, PR-14, PR-15 (2026-10-26 08:00 / 13:00 / 2026-10-27 08:00) |
| AC-13 | desfazer a HE por frente | `useProjectStore.test.ts`, `e2e/premissas.spec.ts` | PR-13 |
| AC-14 | docs | revisão | Tarefa 26 |
| M | ida e volta MSPDI | `msProjectXmlParser.test.ts` | Tarefa 20: `validateMspdi(xml, { strictOrder: true }).errors` = `[]`; XML malformado com erro em português (inalterado); DOCTYPE recusado (inalterado) |

## 12. Critérios de aceite e escopo fechado
- **AC-1:** com as premissas padrão, nenhum número de cenário, DLP, EVM ou cronograma muda (PR-1, CF-1). Os testes atuais continuam passando (SPEC §5).
- **AC-2:** alterar o indireto para R$ 12.000 muda na hora a economia de indireto dos três cenários (PR-2).
- **AC-3:** indireto mensal convertido para dia útil, taxas por função com origem, referência, data-base e encargos, e taxa da função não cadastrada (PR-3, PR-5, PR-6).
- **AC-4:** alterar premissa cria versão com vigência. Cenários e EVM mostram a versão usada, por exemplo "Premissas v3 — vigência 01/11/2026" (PR-4).
- **AC-5:** toda obra salva (v1, esquema 2 ou 3) abre no esquema 4 com os mesmos números, e o `undo` continua funcionando (P-1 a P-6).
- **AC-6:** mudar uma premissa recalcula cenários e DLP em menos de 1 s numa obra de 3.000 tarefas (RNF-03.1, local).
- **AC-7:** tela "Premissas da obra" com os campos do RF-03.1/03.2, o selo "ilustrativa" e a lista de versões.
- **AC-8:** feriados por obra: nacionais calculados (20/11 a partir de 2024), Carnaval e Corpus Christi como opção (padrão ligado), estaduais e municipais manuais com fonte (CF-1 a CF-6).
- **AC-9:** calendários alternativos com jornada por dia em horas, exceções por data e sábado de 4 h = 0,5 dia, atribuídos a tarefas uma a uma e por pacote (CS-1 a CS-4).
- **AC-10:** o import não acrescenta feriados ao calendário do arquivo, avisa e oferece "Aplicar feriados da obra" com antes e depois (CF-7).
- **AC-11:** trocar a UF ou o município mostra a prévia do impacto dos feriados locais cadastrados (CF-8).
- **AC-12:** hora extra com meio período e frentes escolhidas. "Todas as frentes" com sábado inteiro reproduz o resultado da base (PR-7 a PR-12, PR-14).
- **AC-13:** desfazer a HE por frente remove o calendário derivado e devolve as tarefas (PR-13).
- **AC-14:** `CLAUDE.md` e regras atualizados.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 … AC-14 | Seção 12 | Testes da seção 11; `npm run ci` por entregável | sim |
| N-1 | Entrega 2027-06-23, +16 d.u., SPI 0,8883, CPI 0,9349 (Inviolável 1) | `useProjectStore.test.ts` N-1 | sim |
| N-2 | Aprovar 75% no 104: entrega 2027-06-16 | N-2 | sim |
| N-3 | Crashing: 3 d.u., R$ 12.616,80, 2027-06-18 | N-3 | sim |
| N-4 | PR-1 (caracterização) | `scenarios.caracterizacao.test.ts` | sim |
| N-5 | PR-2 a PR-6 | `premissas.test.ts`, `scenarios.test.ts` | sim |
| N-6 | PR-7 a PR-14 | `scenarios.test.ts`, `useProjectStore.test.ts` | sim |
| N-7 | CF-1 a CF-8, CS-1 a CS-4 | testes da seção 11 | sim |
| N-8 | Itens "a confirmar" conferidos pelo `especialista-obra` | Resposta da tarefa 0 no ciclo | sim |
| M-1 | Ida e volta do seed com `strictOrder` (Inviolável 2) | `core.test.ts` + `msProjectXmlParser.test.ts` | sim |
| M-2 | Ida e volta com calendário alternativo, feriado manual e derivado | Tarefa 20 | sim |
| M-3 | Exportação do seed idêntica à da base | Tarefa 26 (diff) | sim |
| M-4 | Corpus local: contagem nova fixada, sem perda de UID, vínculo, % ou datas | `msProjectXmlParser.corpus.test.ts` com `CRONOAI_REF_DIR` | sim |
| M-5 | `.xml` com calendários do 00005 abre no MS Project real | Conferência manual | não (`NOT_RUN` esperado) |
| P-1 | Esquema 3 (Aurora com os 3 cenários aplicados, fixture do 00004 migrada) → 4: premissas v1 = padrão, `meta` sem os dois campos, PR-1 igual | `migracaoEstado.test.ts` | sim |
| P-2 | Esquema 3 com indireto 11.000 e margem 7 → v1 com 11.000 e 7, origem `'nao-documentada'`; DLP do `m-concreto` igual à de antes | `migracaoEstado.test.ts`, `useProjectStore.obras.test.ts` | sim |
| P-3 | v1 (`cronoai-state-v1`) → 4 pela cadeia | `migracaoEstado.test.ts` | sim |
| P-4 | Esquema 5 recusado e nunca sobrescrito | `migracaoEstado.test.ts` | sim |
| P-5 | Esquema 4 sem `premissas`/`feriados` (ou inválidos) → padrão com aviso | `migracaoEstado.test.ts` | sim |
| P-6 | HE do 00004 aplicada antes da migração é desfeita depois dela (entrega 2027-06-23) | `useProjectStore.obras.test.ts` | sim |
| P-7 | E2E de migração e troca de obra inalterados | `e2e/obras.spec.ts` | sim |
| R-1 | Nenhuma premissa fixa restante em `src/lib` fora de `premissasPadrao()` | `git grep -nE "1\.05\|1200\|0\.5\|0\.04\|\?\? 30" src/lib/scenarios.ts src/lib/supplies.ts` revisado | sim |
| R-2 | `src/lib` puro (sem store, DOM, `localStorage`) | `validar-regras.mjs` + revisão | sim |
| R-3 | Premissa padrão marcada como ilustrativa na tela e na memória (Inviolável 7) | V-1 + teste da memória | sim |
| R-4 | Cobertura ≥ 80% nas 4 métricas | `npm run test:coverage` | sim |
| R-5 | KPIs do E2E inalterados nos 4 entregáveis | `npm run e2e` | sim |
| S-1 … S-5 | Seção 08 | Testes e revisão | sim |
| V-1 | Tela de premissas (versões, selo, indireto mensal) | `npm run dev` | não |
| V-2 | Rótulo da versão no cartão de cenário e no EVM | `npm run dev` | não |
| V-3 | Editor de calendários, feriados e prévia | `npm run dev` | não |
| V-4 | HE com frentes escolhidas e meio período | `npm run dev` | não |

**Validadores:** `testes`, `arquiteto` (revisão), `especialista-obra` (tarefa 0 e validação de PR, CF e CS), `seguranca` (S-1 a S-5 e o parser), auditoria independente (`revisor` em `MODO: AUDITAR`). Em lote, ao fim de cada entregável.

### Perguntas de gate (até 3)
**P1 — Conversão do custo indireto mensal para dia útil (RF-03.1).** Muda o indireto diário de quem informar o valor mensal e, com ele, a economia de todos os cenários.
- **(a)** O cálculo usa o **diário**. O mensal é só uma forma de entrada: `diário = mensal × 12 ÷ dias úteis do calendário padrão da obra no ano da vigência`. A versão guarda o mensal, o divisor e o diário. 2026 tem 249 dias úteis, então R$ 249.000/mês = R$ 12.000/dia. **Recomendação (opinião):** coerente com o calendário da obra (Carnaval, Corpus Christi e feriados manuais entram no divisor) e auditável na memória.
- **(b)** Divisor fixo de 22 dias por mês (prática comum de planilha; não achei referência normativa).
- **(c)** Dias úteis de cada mês: a economia depende do mês em que o dia é recuperado. Mais exato, mas exige saber onde cai o dia recuperado. Opinião: complexo demais para esta fase.
- *Por que importa:* com (b), R$ 249.000/mês viraria R$ 11.318,18/dia, e não R$ 12.000. Validar com **Orçamento/Custos**.

**P2 — Arredondamento monetário (RNF-03.2: "2 casas e arredondamento bancário documentado").** O `CLAUDE.md` manda arredondar só na exibição.
- **(a)** Cálculo sem arredondamento. A exibição com 2 casas usa arredondamento **bancário** (meio para o par) por uma função pura `arredondarBancario` em `format.ts`, documentada em `calculo-precisao.md`. **Recomendação (opinião):** atende ao RNF sem conflitar com o `CLAUDE.md` e não muda nenhum número calculado. O `Math.round` para real inteiro em `applyScenario` (`useProjectStore.ts:681`) continua como dívida registrada.
- **(b)** Arredondar com 2 casas (bancário) cada resultado monetário do cenário e o custo de recuperação gravado. Muda o valor gravado (R$ 22.315 → R$ 22.315,20), contraria o `CLAUDE.md` e pede ADR.
- **(c)** Adiar o RNF-03.2 inteiro até o parecer de Orçamento.
- *Por que importa:* define o centavo exibido nos casos de meio exato e o valor gravado em `recoveryCosts`. Planilhas costumam arredondar "meio para cima"; a ABNT NBR 5891 (a confirmar) usa o par. Validar com **Orçamento/Custos**.

**P3 — Onde entra o achado (a) (não injetar feriados no calendário importado).** Define a faixa do ciclo.
- **(a)** Entra no 00005: o parser para de injetar, e a store oferece "Aplicar feriados da obra" com prévia. **Faixa 3** (este plano). **Recomendação (opinião):** o botão depende do modelo de feriados da obra, que nasce aqui. No 00004 o usuário ficaria sem feriados e sem como aplicá-los. O corpus indica que é a correção certa (83/104 → 100/104).
- **(b)** Emenda ao E3 do 00004, já aprovado e ainda não implementado: o parser dele já não injeta, e o 00005 fica na faixa 2 só com o botão. Exige reaprovar o 00004 e mudar o D-2 dele. Entre os dois merges, quem importar fica sem feriados nem botão.
- **(c)** Manter a injeção (adiar o achado). Faixa 2; o painel de divergências continua apontando feriado injetado como causa.
- *Por que importa:* muda as datas calculadas de todo `.xml` importado sem feriados e o rigor do ciclo (faixa 3 = `seguranca` + auditoria).

### Fora do escopo
- Listas oficiais de feriados estaduais e municipais e a importação de lista (RF-03.5): Fase 2/backend, com fonte oficial a definir. Nenhum feriado real de UF ou município é embutido no código ou nas fixtures.
- Código IBGE do município e recálculo automático pela UF.
- Versionar calendários e feriados junto com as premissas (snapshots: SPEC-04/00007).
- PV contando exceções úteis do arquivo (fica a regra CR-2d do 00004).
- Editar `minutosPorDia`, turnos noturnos predefinidos e calendário por recurso (RF-05.2 por recurso, Fase 3).
- HE em domingo ou feriado, HE em dia útil (horas além da jornada), banco de horas e compensação: só sábados, inteiros ou de 4 h.
- Encargos aplicados automaticamente pelo regime SINAPI (00006/SPEC-07). Composições próprias. `HOURS_PER_DAY` de `sinapi.ts` (fica como está).
- Exportar a origem dos feriados ou o nome das exceções no MSPDI (`<Exceptions>` com `Name`).
- Mudanças em `buildMspdiXml`, `SCHEMA_ORDER`, CI, Docker e dependências.
- Corrigir o `Math.round` de `applyScenario` (salvo P2 = b) e as demais dívidas de `divida-conhecida.md`.
- Qualquer mudança no motor CPM além do gancho de feriados na compilação e do uso dos calendários existentes.

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Adicional de HE (50% padrão ilustrativo), sábado de meio período, convocação da equipe inteira para o expediente do sábado, compensação; o texto de aviso da tela | **RH + Jurídico** | Piloto (SPEC-13). O padrão continua marcado como ilustrativo; não bloqueia o merge |
| Status legal do 20/11 (Lei 14.759/2023), da Sexta-feira Santa, do Carnaval e do Corpus Christi | **Jurídico** | Piloto; o padrão atual (Carnaval e Corpus ligados) se mantém até lá |
| Indireto mensal → diário (P1), encargos e taxa com ou sem encargos, arredondamento (P2), mobilização, contingência e perda por congestionamento | **Orçamento/Custos** | Piloto; P1 e P2 decididos no gate, sujeitos ao parecer |
| Regra "todas as frentes = calendário padrão" e lags que chegam a frentes com calendário derivado (P1 emendada do 00004: calendário da sucessora) | Engenharia de planejamento | Piloto |
| Abrir no MS Project real o `.xml` com os calendários do 00005 (M-5) | Planejamento (usuário) | Não bloqueia o merge |

## 14. Riscos e pós-entrega
- **Dependência de um ciclo não implementado:** os nomes do 00004 podem mudar. Mitigação: base só depois do merge do 00004; vale o nome implementado; tarefas **[00004]** marcadas.
- **Número que muda sem querer no E1:** caracterização (tarefa 1) antes de mexer, e checkpoint depois da store. A HE "todas as frentes" fica no calendário padrão: com a P1 emendada, é a forma mais simples que reproduz o resultado (seção 03 e emenda 01).
- **Datas de import mudam (achado a):** quem importar um `.xml` sem feriados passa a ver as datas do arquivo, e não as datas com os feriados nacionais. É a correção pretendida, explicada no aviso. Obras já salvas não mudam (calendários migrados intactos).
- **Obras migradas não respondem às opções de feriado** até "Aplicar feriados da obra". Mitigação: aviso fixo na aba Feriados com a prévia.
- **Store grande** (cerca de 1.280 linhas antes do ciclo): as ações novas ficam agrupadas por seção, com a regra em `src/lib`. Separar a store é decisão do `CLAUDE.md` (store única), fora daqui.
- **Desempenho:** se `simulateAll` passar de 1 s com 3.000 tarefas, separar o derivado de agenda (CPM) do de custo, para que uma mudança de premissa financeira não recalcule o CPM.
- **Calendários derivados no MS Project:** aparecem com o nome "+ HE"; ao desfazer o cenário, saem da obra, mas não de um `.xml` já exportado.
- **Rollback:** reverter os 4 commits juntos. As obras no esquema 4 são recusadas pelo app anterior, sem sobrescrita. Recomendar no PR exportar o `.xml` das obras importantes antes de atualizar.
- **Testes locais fora do CI:** corpus e desempenho estrito; a evidência é a execução local registrada na matriz (M-4, AC-6).

CONHECIMENTO NOVO:
- (emenda 01) Com a P1 emendada do 00004 (lag útil no calendário da sucessora), um calendário de HE atribuído a uma frente faz o lag que **chega** a ela consumir o sábado de HE. Se o calendário for para uma frente que não trabalha no sábado, ela ganha prazo sem custo de HE. Por isso o derivado vai só para as frentes ativas nos sábados — `simulateOvertime` (00005 E4).
- (emenda 01) No Aurora, a troca da regra do lag não muda nenhum número de HE nem de feriado: todos os vínculos que chegam às frentes de HE têm lag 0, e os lags ≠ 0 caem depois de dez/2026 — caracterização do 00005.
- Desligar o Carnaval no Aurora antecipa a entrega em 2 d.u. (2027-06-23 → 2027-06-21), embora nenhuma tarefa crítica atravesse 08 e 09/02/2027: quem atravessa é o lag SS+30 de 502 → 701. Feriado afeta lag em dias úteis, não só a duração — prévias de feriados e calendário.
- O calendário padrão de 2026 com Carnaval e Corpus Christi tem 249 dias úteis (261 dias de seg a sex menos 12 feriados em dia de semana): R$ 249.000/mês = R$ 12.000/dia exatos. Sem os dois pontos facultativos, 252 — conversão do indireto mensal.
- No corpus do MPXJ, a injeção dos feriados nacionais no import é a principal causa de data diferente do arquivo (83/104 iguais com injeção × 100/104 sem) — `parseMspdiXml` e painel de divergências.

## 15. Emenda 01 (25/10/2026)
Origem: emenda 01 do plano 00004 (seção 15 dele), feita depois do parecer da tarefa 0 do `especialista-obra` (`scratchpad/planos/00004-tarefa0-especialista.md`). Mudaram duas regras:
- **P1 do 00004:** o lag útil passa a ser contado no **calendário da sucessora** (o do projeto só quando ela não tem calendário próprio). Antes, era o calendário do projeto.
- **Correção 5:** calendário com **no máximo 5 intervalos por dia**, e `00:00–00:00` = **dia inteiro**.

Decisão do orquestrador, sujeita à revisão do usuário no PR. O gate deste plano (P1, P2 e P3 = a) não muda.

**Conta da HE refeita com a regra nova (Aurora):**
- **Os vínculos que chegam às frentes de HE têm lag 0:** 104 ← 103 FS; 105 ← 104 FS; 303 ← 302 FS; 106 ← 105 e 302 FS. Os lags diferentes de 0 do seed estão em tarefas já concluídas (103, FS+5) ou caem depois de dez/2026 (402, 501, 502, 601, 602, 701, 702), longe dos sábados 24 e 31/10. Por isso a regra do lag **não muda nenhum número** de PR-1 a PR-14. CF-2 a CF-4 também ficam: o 701 não tem calendário próprio, então o lag SS+30 continua no calendário do projeto.
- **"Todas as frentes":** duas formas reproduzem exatamente $ 22.315,20, 2 d.u. e entrega 2027-06-21, com 64 profissionais-dia:
  1. sábados como exceção útil no calendário padrão (o que o 00004 já faz);
  2. calendário derivado atribuído a todas as folhas sem calendário próprio. Agora também conta os sábados nos lags, porque cada sucessora tem o derivado. Antes da emenda isso não valia.

  Fica a **(1)**, por ser a mais simples:
  - nenhum código novo (tarefa 7 do 00004);
  - o `undo` só remove datas;
  - a exportação não ganha um calendário novo nem `CalendarUID` em toda tarefa;
  - a tarefa criada depois de aplicar a HE (SINAPI, lote) continua trabalhando nos sábados, como hoje.
  
  A (2) é descartada por esses motivos, e não mais por mudar número.
- **"Frentes escolhidas":** com a regra nova, o lag útil que **chega** a uma frente escolhida é contado no calendário derivado dela e consome o sábado de HE (PR-15). Para custo e ganho não se descolarem, o derivado vai só para as escolhidas **ativas em ao menos um sábado convocado no cronograma atual (antes da HE)**; as demais aparecem como "não convocadas". PR-8 a PR-14 não mudam: 104 e 302 estão ativas nos dois sábados, 801 não está, e o sábado já útil não é HE.
- **Sábado de 4 h:** PR-10 e PR-11 ficam como estavam (1 d.u.; $ 11.157,60 e $ 2.080,80; entrega 2027-06-22).

| # | Mudança | Onde |
|---|---|---|
| 1 | P1 do 00004 citada como regra da sucessora | Resumo, 03 (HE), 10 (tarefa 0), 13, 14, CONHECIMENTO NOVO |
| 2 | "Todas as frentes" mantida no calendário padrão, com o motivo novo (a mais simples das duas que reproduzem) | 03 (HE) |
| 3 | Frentes escolhidas: o lag que chega à frente conta o sábado; derivado só para as escolhidas ativas nos sábados | 03 (HE), 10 (tarefa 23) |
| 4 | **PR-15** novo: B começa 2026-10-26 08:00 (sábado inteiro), 2026-10-26 13:00 (meio período) e 2026-10-27 08:00 (sem HE) | 04, 10 (23), 11 (AC-12) |
| 5 | No máximo 5 intervalos por dia e `00:00–00:00` = dia inteiro no editor e na validação; **CS-5** novo | 03 (editor), 08 (S-2), 10 (tarefa 14), 04 (CS-5), 11 (AC-9) |
| 6 | CF-7 com o painel do 00004 emendado (D-6 novo): sem feriados, D-4 e D-6 −5 d.u.; depois de "Aplicar feriados da obra", os números do 00004 (D-2 +1, D-3 +1, D-4 −4, D-5 +1, D-6 −4) | 04 (CF-7), 10 (tarefa 16) |

**Números inalterados:** PR-1 a PR-14, CF-1 a CF-6, CF-8 e CS-1 a CS-4.

## Decisões do gate (25/10/2026)
O usuário autorizou o orquestrador a seguir sem parar até o fim das fases. O gate foi decidido pelas recomendações, **sujeito à revisão do usuário no PR**:
- **P1 → (a)** o cálculo usa o indireto diário; o mensal é só entrada, convertido por mensal × 12 ÷ dias úteis do calendário da obra no ano.
- **P2 → (a)** arredondamento bancário só na exibição (`arredondarBancario`), sem mudar número calculado. A regra final fica para **Orçamento/Custos** validar.
- **P3 → (a)** o achado "não injetar feriados num calendário vindo do MS Project" entra neste ciclo, que fica na faixa 3.
