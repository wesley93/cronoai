// Estado global reativo da obra: toda ação (apontamento, cenário, SINAPI, XML) recalcula CPM, EVM e suprimentos.
import { defineStore } from 'pinia'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type {
  DecisionLogEntry,
  DetectedRestriction,
  FieldReport,
  LinkType,
  MaterialItem,
  PhotoKind,
  ProjectState,
  ResourceAssignment,
  ScenarioKind,
  Task,
} from '@/types/domain'
import type { MSProjectTask } from '@/types/msProject'
import type { IndiceObras, MigracaoV1, PersistedState, ResumoObra, ScenarioUndo } from '@/types/obra'
import { SEED_HOLIDAYS, SEED_MATERIALS, SEED_META, SEED_REPORTS, SEED_TASKS } from '@/data/seed'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import {
  DEFAULT_BATCH_OPTIONS,
  MAX_BUDGET_LINES,
  lineDuration,
  lineFromCatalog,
  lineName,
  lineResources,
  parseBudgetCsv,
  type BatchOptions,
  type BudgetLine,
} from '@/lib/sinapiBudget'
import { WorkCalendar, addCalendarDays } from '@/lib/calendar'
import { computeSchedule, withBaseline } from '@/lib/cpm'
import { computeEvm, computePackageEvm, computeSCurve, eacVariants, forecastFinishBySpi, plannedFraction } from '@/lib/evm'
import { interpretReport } from '@/lib/fieldAi'
import { buildMspdiXml, buildTaskXml, parseMspdiXml, validateMspdi, type MspdiValidation } from '@/lib/msProjectXmlParser'
import {
  DEFAULT_SCENARIO_PARAMS,
  analyzeDelay,
  crashingTargets,
  fastTrackOptions,
  recommendScenario,
  simulateAll,
  workingVariance,
  type ScenarioParams,
  type ScenarioResult,
} from '@/lib/scenarios'
import { SAFETY_MARGIN_DAYS, analyzeSupplies } from '@/lib/supplies'
import { fmtBRL, fmtMonth, uid } from '@/lib/format'
import { nextChildWbs, nextUid, parseFloorRange, rollupSummaries, sortByWbs } from '@/lib/wbs'
import { criarRegistro, lerEstadoV1, migrarRegistro } from '@/lib/migracaoEstado'
import { avaliarCota, estadoObraVazia, nomeDaCopia, percentualCota, resumirObra, validarDadosObra, validarIndice, type DadosObra } from '@/lib/obras'
import { obterArmazenamento, type ArmazenamentoObras } from './armazenamentoObras'
import { useUiStore } from './ui'

/** Atraso entre a última alteração e a gravação no armazenamento. */
const ATRASO_GRAVACAO_MS = 300
/** Intervalo mínimo entre duas consultas da cota de armazenamento. */
const INTERVALO_COTA_MS = 60_000

export type EstadoGravacao = 'salvo' | 'pendente' | 'erro'
export type ResultadoAcao = { ok: true } | { ok: false; erro: string }
export type ResultadoCriacao = { ok: true; id: string } | { ok: false; erro: string; erros?: string[] }
export type NovaObra = { modelo: 'exemplo' } | { modelo: 'branco'; dados: DadosObra }

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function baselineFor(tasks: Task[], meta: ProjectState['meta'], holidays: string[], onlyMissing = false): Task[] {
  const cal = new WorkCalendar(meta.startDate, { holidays, extraWorkingDays: [] })
  return withBaseline(tasks, computeSchedule(tasks, cal, { mode: 'baseline' }), onlyMissing)
}

export function buildSeedState(): PersistedState {
  const meta = clone(SEED_META)
  const tasks = baselineFor(clone(SEED_TASKS), meta, SEED_HOLIDAYS)
  const materials = clone(SEED_MATERIALS).map((m) => {
    if (m.id !== 'm-porcelanato') return m
    const t = tasks.find((x) => x.uid === m.taskUid)
    return { ...m, deliveryDate: t?.baselineStart ? addCalendarDays(t.baselineStart, -5) : undefined }
  })
  return {
    meta,
    tasks,
    calendar: { holidays: [...SEED_HOLIDAYS], extraWorkingDays: [] },
    reports: clone(SEED_REPORTS),
    restrictions: [],
    materials,
    recoveryCosts: [],
    appliedScenarios: [],
    log: [
      { id: uid('log'), date: '2026-04-27', kind: 'sistema', title: 'Linha de base aprovada', detail: 'Cronograma executivo aprovado pela diretoria e salvo como Linha de Base 0.' },
      { id: uid('log'), date: meta.statusDate, kind: 'importacao', title: 'Cronograma sincronizado', detail: 'Última sincronização com o MS Project na data de status.' },
    ],
    undo: [],
    budget: seedBudget(),
  }
}

/** Planilha de exemplo: serviços das áreas comuns ainda fora da EAP. */
function seedBudget(): BudgetLine[] {
  const byCode = (code: string) => SINAPI_CATALOG.find((c) => c.code === code)!
  return [
    lineFromCatalog(byCode('103332'), 'b-1', 640, 4, 'Áreas comuns (térreo)'),
    lineFromCatalog(byCode('87529'), 'b-2', 1280, 4, 'Áreas comuns (térreo)'),
    lineFromCatalog(byCode('87630'), 'b-3', 900, 3, 'Garagem e hall'),
    lineFromCatalog(byCode('87263'), 'b-4', 520, 3, 'Hall e circulações'),
    lineFromCatalog(byCode('88489'), 'b-5', 2100, 3, 'Áreas comuns'),
  ]
}

/** Mensagem ao usuário para uma falha de gravação, sem detalhe técnico. */
function mensagemDeFalha(err: unknown): string {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
    ? 'O armazenamento do navegador está cheio.'
    : 'Não foi possível gravar no armazenamento do navegador.'
}

export interface SinapiInsert {
  name: string
  code: string
  unit: string
  quantity: number
  unitCost: number
  durationDays: number
  resources: ResourceAssignment[]
  parentWbs: string
  newGroupName?: string
  predecessorUid?: number
  linkType: LinkType
  lagDays: number
}

export const useProjectStore = defineStore('project', () => {
  // Antes de `carregar()` o estado é a obra de exemplo e a gravação fica desligada: não há como sobrescrever a obra salva.
  const state = reactive<PersistedState>(buildSeedState())

  // ---------------------------------------------------------------- obras e armazenamento
  const obras = ref<ResumoObra[]>([])
  const obraAtivaId = ref('')
  const estadoGravacao = ref<EstadoGravacao>('salvo')
  const mensagemGravacao = ref('')
  /** Percentual de uso do armazenamento quando passa do limiar de alerta (80%). */
  const alertaCota = ref<number | undefined>(undefined)
  /** Avisos da última carga (migração da v1 parcial ou ilegível, armazenamento indisponível). */
  const avisosCarga = ref<string[]>([])
  const armazenamentoIndisponivel = ref(false)
  const migracaoV1 = ref<MigracaoV1 | undefined>(undefined)
  const carregado = ref(false)
  /** Carga sem segurança (índice ilegível, leitura falhou): nada é gravado até recarregar a página. */
  const gravacaoBloqueada = ref(false)

  let armazenamento: ArmazenamentoObras | undefined
  let indice: IndiceObras | undefined
  let gravacaoLigada = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let fila: Promise<unknown> = Promise.resolve()
  let ultimaConsultaCota = 0
  /** Conta as alterações do estado: a gravação só vira "salva" se nada mudou durante a escrita. */
  let revisao = 0
  let timerPendente = false

  watch(
    state,
    () => {
      if (!gravacaoLigada) return
      revisao++
      estadoGravacao.value = 'pendente'
      agendarGravacao()
    },
    { deep: true },
  )

  function agendarGravacao() {
    clearTimeout(saveTimer)
    timerPendente = true
    saveTimer = setTimeout(() => {
      timerPendente = false
      void salvarAgora()
    }, ATRASO_GRAVACAO_MS)
  }

  /** Carga ou gravação sem segurança: aviso persistente, gravação desligada e nada escrito por cima do que existe. */
  function bloquearGravacao(mensagem: string) {
    gravacaoLigada = false
    gravacaoBloqueada.value = true
    clearTimeout(saveTimer)
    timerPendente = false
    estadoGravacao.value = 'erro'
    mensagemGravacao.value = mensagem
    carregado.value = true
  }

  /**
   * Cópias simples (sem proxy) do que vai ao IndexedDB: o valor de um `ref` é um proxy reativo
   * e o clone estruturado do IndexedDB o recusa (DataCloneError).
   */
  function migracaoPlana(): { migracaoV1?: MigracaoV1 } {
    return migracaoV1.value ? { migracaoV1: { ...migracaoV1.value } } : {}
  }
  const obrasPlanas = (): ResumoObra[] => obras.value.map((o) => ({ ...o }))

  function agora(): string {
    return new Date().toISOString()
  }

  /** Atualiza a linha da obra ativa no índice em memória com o que está no estado. */
  function indiceComAtiva(atualizadoEm: string): IndiceObras {
    const base: IndiceObras = indice ?? {
      versaoIndice: 1,
      obraAtivaId: obraAtivaId.value,
      obras: [],
      ...migracaoPlana(),
    }
    const resumo = resumirObra(obraAtivaId.value, state, atualizadoEm)
    const existe = base.obras.some((o) => o.id === resumo.id)
    return {
      ...base,
      obraAtivaId: obraAtivaId.value,
      obras: existe ? base.obras.map((o) => (o.id === resumo.id ? resumo : o)) : [...base.obras, resumo],
    }
  }

  function aceitarIndice(novo: IndiceObras) {
    indice = novo
    obras.value = novo.obras.map((o) => ({ ...o }))
  }

  function registrarFalhaDeGravacao(err: unknown) {
    const antes = estadoGravacao.value
    estadoGravacao.value = 'erro'
    mensagemGravacao.value = mensagemDeFalha(err)
    if (antes !== 'erro') useUiStore().notify('error', 'As alterações desta obra não estão sendo salvas', mensagemGravacao.value)
  }

  async function consultarCota() {
    if (!armazenamento || Date.now() - ultimaConsultaCota < INTERVALO_COTA_MS) return
    ultimaConsultaCota = Date.now()
    const { uso, cota } = await armazenamento.estimar()
    alertaCota.value = avaliarCota(uso, cota) === 'alerta' ? Math.round(percentualCota(uso, cota) ?? 0) : undefined
  }

  /** Grava agora a obra ativa (cancela o atraso). Devolve false se falhar; as gravações seguem em fila, na ordem. */
  function salvarAgora(): Promise<boolean> {
    if (gravacaoBloqueada.value) return Promise.resolve(false)
    clearTimeout(saveTimer)
    timerPendente = false
    const gravar = async (): Promise<boolean> => {
      if (!armazenamento || !obraAtivaId.value) return true
      try {
        const rev = revisao
        const em = agora()
        const novoIndice = indiceComAtiva(em)
        await armazenamento.gravarObra(criarRegistro(obraAtivaId.value, state, em), novoIndice)
        aceitarIndice(novoIndice)
        // Sem IndexedDB o "salvo" é só na memória da sessão: o aviso de indisponibilidade continua.
        // Alteração feita durante a escrita (rev mudou) continua "pendente": o observador já agendou outra gravação.
        if (!armazenamentoIndisponivel.value && rev === revisao) {
          estadoGravacao.value = 'salvo'
          mensagemGravacao.value = ''
        }
        void consultarCota().catch(() => undefined)
        return true
      } catch (err) {
        registrarFalhaDeGravacao(err)
        return false
      }
    }
    const tarefa = fila.then(gravar)
    fila = tarefa
    return tarefa
  }

  /** Coloca o estado na tela sem disparar uma gravação (trocar de obra não é alteração). */
  async function aplicarEstado(novo: PersistedState) {
    gravacaoLigada = false
    Object.assign(state, novo)
    resetScenarioParams()
    await nextTick() // o observador roda aqui, ainda desligado
    gravacaoLigada = true
  }

  /** Lê e migra uma obra do armazenamento; marca como ilegível no índice em memória se falhar. */
  async function abrirRegistro(id: string): Promise<{ estado: PersistedState; avisos: string[] } | { erro: string }> {
    if (!armazenamento) return { erro: 'Armazenamento não carregado.' }
    try {
      const r = migrarRegistro(await armazenamento.lerObra(id), new Date().getFullYear())
      if (r.tipo === 'ok') return { estado: r.estado, avisos: r.avisos }
      return { erro: r.mensagem }
    } catch {
      return { erro: 'Não foi possível ler esta obra do armazenamento do navegador.' }
    }
  }

  function marcarIlegivel(id: string, ilegivel: boolean) {
    if (!indice) return
    indice = { ...indice, obras: indice.obras.map((o) => (o.id === id ? { ...o, ilegivel: ilegivel || undefined } : o)) }
    obras.value = indice.obras.map((o) => ({ ...o }))
  }

  /**
   * Carrega as obras: índice → obra ativa; sem índice, migra o `cronoai-state-v1` (só leitura) para a 1ª obra.
   * Liga a gravação só no fim. Deve ser aguardada antes de montar a interface (main.ts).
   */
  async function carregar(): Promise<void> {
    try {
      await carregarObras()
    } catch {
      bloquearGravacao('Não foi possível carregar as obras deste navegador. Nada foi gravado, para não sobrescrever o que já existe.')
    }
  }

  async function carregarObras(): Promise<void> {
    gravacaoLigada = false
    gravacaoBloqueada.value = false
    obraAtivaId.value = ''
    indice = undefined
    const aberto = await obterArmazenamento()
    armazenamento = aberto.armazenamento
    armazenamentoIndisponivel.value = aberto.indisponivel
    const avisos: string[] = []
    if (aberto.indisponivel) {
      avisos.push('Armazenamento local indisponível: as alterações desta sessão não serão salvas.')
      estadoGravacao.value = 'erro'
      mensagemGravacao.value = 'Armazenamento local indisponível.'
    }

    // Leitura que falha = estado desconhecido: não grava nada (poderia sobrescrever o índice e deixar obras órfãs)
    let bruto: unknown
    try {
      bruto = await armazenamento.lerIndice()
    } catch {
      bloquearGravacao('Não foi possível ler as obras salvas neste navegador. Nada foi gravado, para não sobrescrever o que já existe. Recarregue a página.')
      return
    }
    let existente: IndiceObras | undefined
    if (bruto !== undefined && bruto !== null) {
      const v = validarIndice(bruto)
      if (v.tipo === 'invalido') {
        bloquearGravacao(v.mensagem)
        return
      }
      existente = v.indice
    }

    let inicial: PersistedState | undefined
    if (existente) {
      indice = existente
      obras.value = existente.obras.map((o) => ({ ...o }))
      migracaoV1.value = existente.migracaoV1
      let ids: string[] | undefined
      try {
        ids = await armazenamento.listarIdsObras()
      } catch {
        ids = undefined
      }
      const ordem = [existente.obraAtivaId, ...existente.obras.map((o) => o.id).filter((id) => id !== existente.obraAtivaId)]
      for (const id of ordem) {
        if (ids && !ids.includes(id)) {
          marcarIlegivel(id, true)
          continue
        }
        const r = await abrirRegistro(id)
        if ('estado' in r) {
          inicial = r.estado
          obraAtivaId.value = id
          avisos.push(...r.avisos)
          marcarIlegivel(id, false)
          break
        }
        marcarIlegivel(id, true)
      }
      if (!inicial) avisos.push('Nenhuma obra salva pôde ser lida: a obra de exemplo foi aberta. As obras ilegíveis continuam no navegador, sem alteração.')
    } else {
      const v1 = lerEstadoV1(armazenamento.lerV1(), new Date().getFullYear())
      if (v1.tipo === 'ok') {
        inicial = v1.estado
        avisos.push(...v1.avisos)
        migracaoV1.value = { em: agora(), resultado: 'migrado' }
      } else if (v1.tipo === 'corrompido') {
        avisos.push(
          'O estado salvo da versão anterior não pôde ser lido. Ele foi mantido no navegador sem alteração e a obra de exemplo foi aberta.',
        )
        migracaoV1.value = { em: agora(), resultado: 'ilegivel' }
      }
    }

    let precisaGravar = false
    if (!inicial) {
      inicial = buildSeedState()
      precisaGravar = true
    }
    if (!existente) {
      obraAtivaId.value = uid('obra')
      if (migracaoV1.value?.resultado === 'migrado') migracaoV1.value = { ...migracaoV1.value, obraId: obraAtivaId.value }
      precisaGravar = true
    } else if (!obraAtivaId.value) {
      // Nenhuma obra legível no índice: a obra de exemplo entra como nova, sem tocar nas ilegíveis.
      obraAtivaId.value = uid('obra')
      precisaGravar = true
    }
    await aplicarEstado(inicial)
    avisosCarga.value = avisos

    if (precisaGravar) {
      // Índice e obra na mesma transação. Se falhar, o índice não existe e a v1 fica intacta: a próxima carga tenta de novo (M-4).
      const em = agora()
      const base = indice
      const novo: IndiceObras = { ...indiceComAtiva(em), ...migracaoPlana() }
      const rev = revisao
      try {
        await armazenamento.gravarObra(criarRegistro(obraAtivaId.value, state, em), novo)
        aceitarIndice(novo)
        if (!aberto.indisponivel && rev === revisao) estadoGravacao.value = 'salvo'
      } catch (err) {
        obras.value = novo.obras.map((o) => ({ ...o }))
        indice = base // sem índice gravado (M-4); com índice, o antigo continua valendo
        registrarFalhaDeGravacao(err)
      }
    }
    carregado.value = true
  }

  // ---------------------------------------------------------------- derivados
  const calendar = computed(() => new WorkCalendar(state.meta.startDate, state.calendar))
  const baseCalendar = computed(() => new WorkCalendar(state.meta.startDate, { holidays: state.calendar.holidays, extraWorkingDays: [] }))
  const schedule = computed(() => computeSchedule(state.tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate }))
  const rollups = computed(() => rollupSummaries(state.tasks, schedule.value))
  const tasksByWbs = computed(() => sortByWbs(state.tasks))
  const leaves = computed(() => tasksByWbs.value.filter((t) => !t.isSummary))
  const taskByUid = computed(() => new Map(state.tasks.map((t) => [t.uid, t])))
  const evm = computed(() => computeEvm(state.tasks, baseCalendar.value, state.meta.statusDate))
  const packageEvm = computed(() => computePackageEvm(state.tasks, baseCalendar.value, state.meta.statusDate))
  const sCurve = computed(() => computeSCurve(state.tasks, baseCalendar.value, state.meta.statusDate, schedule.value, fmtMonth))
  const delay = computed(() => analyzeDelay(state.tasks, schedule.value, baseCalendar.value))
  /** Obra sem tarefas: não há entrega nem desempenho a mostrar (o motor devolve a data de início e SPI/CPI 1 por `safeDiv`). */
  /** Menor data de início real entre as tarefas (indefinida enquanto a obra não tem avanço). */
  const primeiroInicioReal = computed(() => state.tasks.map((t) => t.actualStart).filter((d): d is string => !!d).sort()[0])
  const semCronograma = computed(() => state.tasks.length === 0)
  /** Sem orçamento (BAC = 0): SPI e CPI 1,00 são só o fallback do `safeDiv`, não desempenho. */
  const semOrcamento = computed(() => evm.value.bac <= 0)

  /** Tarefas de um pacote de 1º nível (ou a obra inteira quando `wbs` é vazio). */
  function tasksOf(wbs?: string): Task[] {
    return wbs ? state.tasks.filter((t) => t.wbs === wbs || t.wbs.startsWith(wbs + '.')) : state.tasks
  }
  function sCurveFor(wbs?: string) {
    return wbs ? computeSCurve(tasksOf(wbs), baseCalendar.value, state.meta.statusDate, schedule.value, fmtMonth) : sCurve.value
  }
  function evmFor(wbs?: string) {
    return wbs ? computeEvm(tasksOf(wbs), baseCalendar.value, state.meta.statusDate) : evm.value
  }
  /** EAC por três premissas + término previsto pelo SPI comparado ao CPM. */
  const evmForecast = computed(() => {
    const leavesWithBaseline = state.tasks.filter((t) => !t.isSummary && t.baselineStart && t.baselineFinish)
    const bStart = leavesWithBaseline.map((t) => t.baselineStart!).sort()[0] ?? state.meta.startDate
    const bFinish = leavesWithBaseline.map((t) => t.baselineFinish!).sort().at(-1) ?? schedule.value.projectFinish
    return {
      eac: eacVariants(evm.value),
      bySpi: forecastFinishBySpi(baseCalendar.value, bStart, bFinish, evm.value.spi),
      cpmFinish: schedule.value.projectFinish,
      baselineFinish: bFinish,
    }
  })
  const recoveryTotal = computed(() => state.recoveryCosts.reduce((a, c) => a + c.amount, 0))
  /** Parâmetros do simulador "E se?" (ajustados pelo engenheiro na tela; não são persistidos). */
  const scenarioParams = reactive<ScenarioParams>(clone(DEFAULT_SCENARIO_PARAMS))
  const scenarioCtx = computed(() => ({ tasks: state.tasks, calendar: state.calendar, meta: state.meta, forecast: schedule.value, origin: delay.value.origin }))
  const scenarios = computed(() => simulateAll(scenarioCtx.value, scenarioParams))
  const scenarioOptions = computed(() => ({ crashing: crashingTargets(scenarioCtx.value), fastTracking: fastTrackOptions(scenarioCtx.value) }))
  const recommendation = computed(() => recommendScenario(scenarios.value, state.appliedScenarios))
  const safetyMarginDays = computed(() => state.meta.safetyMarginDays ?? SAFETY_MARGIN_DAYS)
  const supplies = computed(() =>
    analyzeSupplies(state.materials, state.tasks, schedule.value, state.meta.statusDate, state.restrictions, safetyMarginDays.value),
  )

  /** Tarefas no formato MS Project (folhas + resumos), sempre coerentes com o CPM e o EVM atuais. */
  const msProjectTasks = computed<MSProjectTask[]>(() => {
    const status = state.meta.statusDate
    const pvOf = (t: Task) => t.bac * plannedFraction(t, baseCalendar.value, status)
    return tasksByWbs.value.map((t): MSProjectTask => {
      if (t.isSummary) {
        const r = rollups.value.get(t.uid)
        const kids = leaves.value.filter((k) => k.wbs.startsWith(t.wbs + '.'))
        const start = r?.start ?? state.meta.startDate
        const finish = r?.finish ?? start
        return {
          UniqueID: t.uid,
          WBS: t.wbs,
          Name: t.name,
          OutlineLevel: t.outlineLevel,
          Summary: true,
          Duration: Math.max(0, calendar.value.countWorkingBetween(start, addCalendarDays(finish, 1))),
          Start: start,
          Finish: finish,
          PercentComplete: Math.round((r?.percentComplete ?? 0) * 10) / 10,
          Predecessors: t.predecessors.map((p) => ({ PredecessorUID: p.uid, Type: p.type, LagDays: p.lagDays })),
          IsCritical: !!r?.critical,
          TotalSlack: null,
          BudgetAtCompletion: r?.bac ?? 0,
          PlannedValue: kids.reduce((a, k) => a + pvOf(k), 0),
          EarnedValue: kids.reduce((a, k) => a + (k.bac * k.percentComplete) / 100, 0),
          ActualCost: r?.actualCost ?? 0,
          Resources: [],
          MaterialLeadTime: null,
          SinapiCode: null,
          BaselineStart: r?.baselineStart ?? null,
          BaselineFinish: r?.baselineFinish ?? null,
        }
      }
      const s = schedule.value.byUid.get(t.uid)
      const done = t.percentComplete >= 100
      return {
        UniqueID: t.uid,
        WBS: t.wbs,
        Name: t.name,
        OutlineLevel: t.outlineLevel,
        Summary: false,
        Duration: t.durationDays,
        Start: s?.start ?? state.meta.startDate,
        Finish: s?.finish ?? state.meta.startDate,
        PercentComplete: t.percentComplete,
        Predecessors: t.predecessors.map((p) => ({ PredecessorUID: p.uid, Type: p.type, LagDays: p.lagDays })),
        IsCritical: !!s?.critical,
        TotalSlack: done || !s ? null : s.totalFloat,
        BudgetAtCompletion: t.bac,
        PlannedValue: pvOf(t),
        EarnedValue: (t.bac * t.percentComplete) / 100,
        ActualCost: t.actualCost,
        Resources: t.resources.map((r) => ({ Name: r.resource, Units: r.units })),
        MaterialLeadTime: t.leadTimeDays ?? null,
        SinapiCode: t.sinapi ?? null,
        BaselineStart: t.baselineStart ?? null,
        BaselineFinish: t.baselineFinish ?? null,
      }
    })
  })

  function msProjectTask(uniqueId: number): MSProjectTask | undefined {
    return msProjectTasks.value.find((t) => t.UniqueID === uniqueId)
  }

  function finishVarianceDays(t: Task): number {
    const s = schedule.value.byUid.get(t.uid)
    if (!s || !t.baselineFinish) return 0
    return workingVariance(baseCalendar.value, t.baselineFinish, s.finish)
  }

  // ---------------------------------------------------------------- helpers
  function log(kind: DecisionLogEntry['kind'], title: string, detail: string) {
    state.log.unshift({ id: uid('log'), date: state.meta.statusDate, kind, title, detail })
    if (state.log.length > 60) state.log.length = 60
  }

  function patchTask(taskUid: number, patch: Partial<Task>) {
    const idx = state.tasks.findIndex((t) => t.uid === taskUid)
    if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...patch }
  }

  /** Aplica avanço físico com apropriação proporcional de custo real. */
  /** Alterações de um novo avanço físico, com apropriação proporcional de custo real (CPI da própria tarefa). */
  function progressPatch(t: Task, newPercent: number, reportDate: string): Partial<Task> {
    const pct = Math.max(0, Math.min(100, Math.round(newPercent)))
    const delta = pct - t.percentComplete
    const earned = (t.bac * t.percentComplete) / 100
    const costRatio = earned > 0 && t.actualCost > 0 ? t.actualCost / earned : 1.03
    const patch: Partial<Task> = {
      percentComplete: pct,
      actualCost: Math.max(0, Math.round(t.actualCost + (t.bac * delta * costRatio) / 100)),
    }
    if (pct > 0 && !t.actualStart) patch.actualStart = reportDate
    if (pct >= 100) patch.actualFinish = t.actualFinish ?? reportDate
    if (pct < 100) patch.actualFinish = undefined
    if (pct === 0) patch.actualStart = undefined
    return patch
  }

  function applyProgress(taskUid: number, newPercent: number, reportDate: string) {
    const t = taskByUid.value.get(taskUid)
    if (t) patchTask(taskUid, progressPatch(t, newPercent, reportDate))
  }


  // ---------------------------------------------------------------- Módulo 1
  function interpret(report: FieldReport) {
    return interpretReport(report.transcript, state.tasks)
  }

  /** Simula o impacto de um apontamento no término da obra antes de aprovar. */
  function previewProgress(taskUid: number, pct: number, reportDate = state.meta.statusDate) {
    const tasks = state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...progressPatch(t, pct, reportDate) } : t))
    const s = computeSchedule(tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate })
    return { finish: s.projectFinish, deltaDays: workingVariance(calendar.value, schedule.value.projectFinish, s.projectFinish) }
  }

  /** Elemento <Task> do MSPDI antes e depois de um apontamento (prévia do que vai para o MS Project). */
  function previewTaskXml(taskUid: number, pct: number, reportDate = state.meta.statusDate) {
    const current = taskByUid.value.get(taskUid)
    if (!current) return undefined
    const tasks = state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...progressPatch(t, pct, reportDate) } : t))
    const after = computeSchedule(tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate })
    return {
      before: buildTaskXml(current, { meta: state.meta, tasks: state.tasks, calendar: state.calendar, schedule: schedule.value }),
      after: buildTaskXml(tasks.find((t) => t.uid === taskUid)!, { meta: state.meta, tasks, calendar: state.calendar, schedule: after }),
    }
  }


  function approveReport(reportId: string, taskUid: number, pct: number | undefined, restrictions: DetectedRestriction[]) {
    const report = state.reports.find((r) => r.id === reportId)
    const task = taskByUid.value.get(taskUid)
    if (!report || !task) return
    const before = task.percentComplete
    const finishBefore = schedule.value.projectFinish
    const reportDate = report.timestamp.slice(0, 10)
    if (pct !== undefined && pct !== before) applyProgress(taskUid, pct, reportDate)
    for (const r of restrictions) {
      state.restrictions.unshift({ ...r, id: uid('rst'), date: reportDate, taskUid, reportId, resolved: false })
    }
    report.status = 'aprovado'
    report.approvedUid = taskUid
    report.approvedPercent = pct ?? before
    report.previousPercent = before
    const delta = workingVariance(calendar.value, finishBefore, schedule.value.projectFinish)
    log(
      'apontamento',
      `[UID ${taskUid}] ${task.wbs} atualizado via canteiro`,
      `${report.author}: avanço ${Math.round(before)}% → ${Math.round(pct ?? before)}%` +
        (restrictions.length ? `; restrições: ${restrictions.map((r) => r.label).join(', ')}` : '') +
        (delta !== 0 ? `; término da obra ${delta < 0 ? 'antecipado' : 'adiado'} em ${Math.abs(delta)} dia(s) útil(eis).` : '.'),
    )
    return { delta }
  }

  function rejectReport(reportId: string) {
    const report = state.reports.find((r) => r.id === reportId)
    if (report) report.status = 'rejeitado'
  }

  function addReport(input: { author: string; role: string; transcript: string; photoUrl?: string; photo?: PhotoKind }) {
    const report: FieldReport = {
      id: uid('r'),
      author: input.author,
      role: input.role,
      avatarColor: 'bg-zinc-500',
      timestamp: `${state.meta.statusDate}T${new Date().toTimeString().slice(0, 8)}`,
      channel: 'texto',
      transcript: input.transcript.trim(),
      photo: input.photo,
      photoUrl: input.photoUrl,
      status: 'pendente',
    }
    state.reports.unshift(report)
    return report
  }

  function resolveRestriction(id: string) {
    const r = state.restrictions.find((x) => x.id === id)
    if (r) r.resolved = true
  }

  // ---------------------------------------------------------------- Módulo 2
  function applyScenario(result: ScenarioResult) {
    if (!result.applicable || state.appliedScenarios.includes(result.kind)) return
    const costId = uid('cost')
    const undo: ScenarioUndo = { kind: result.kind, costId, result: clone(result) }
    if (result.taskPatch) {
      const t = taskByUid.value.get(result.taskPatch.uid)!
      const before: Partial<Task> = {}
      for (const k of Object.keys(result.taskPatch.patch) as (keyof Task)[]) (before as Record<string, unknown>)[k] = clone(t[k])
      undo.taskUid = t.uid
      undo.before = before
      patchTask(t.uid, clone(result.taskPatch.patch))
    }
    if (result.addedWorkingDays?.length) {
      undo.addedDays = [...result.addedWorkingDays]
      state.calendar.extraWorkingDays = [...new Set([...state.calendar.extraWorkingDays, ...result.addedWorkingDays])].sort()
    }
    const amount = Math.round(result.extraCost)
    state.recoveryCosts.push({ id: costId, scenario: result.kind, label: result.title, amount })
    state.appliedScenarios.push(result.kind)
    state.undo.push(undo)
    log('cenario', `Cenário aplicado: ${result.title}`, `${result.summary}. Recupera ${result.daysRecovered} dia(s) útil(eis); custo comprometido ${fmtBRL(amount)}.`)
  }

  function appliedResult(kind: ScenarioKind): ScenarioResult | undefined {
    return state.undo.find((u) => u.kind === kind)?.result
  }

  function undoScenario(kind: ScenarioKind) {
    const idx = state.undo.findIndex((u) => u.kind === kind)
    if (idx < 0) return
    const u = state.undo[idx]
    if (u.taskUid !== undefined && u.before) patchTask(u.taskUid, clone(u.before))
    if (u.addedDays) state.calendar.extraWorkingDays = state.calendar.extraWorkingDays.filter((d) => !u.addedDays!.includes(d))
    state.recoveryCosts = state.recoveryCosts.filter((c) => c.id !== u.costId)
    state.appliedScenarios = state.appliedScenarios.filter((k) => k !== kind)
    state.undo.splice(idx, 1)
    log('cenario', 'Cenário desfeito', `Cenário "${kind}" revertido; cronograma recalculado.`)
  }

  // ---------------------------------------------------------------- Módulo 3
  function orderMaterial(id: string, deliveryDate: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    m.ordered = true
    m.orderDate = state.meta.statusDate
    m.deliveryDate = deliveryDate
    for (const r of state.restrictions.filter((x) => x.kind === 'material' && !x.resolved && x.material && m.name.toLowerCase().includes(x.material))) {
      r.resolved = true
    }
    log('suprimentos', `Pedido emitido: ${m.name}`, `${m.quantity.toLocaleString('pt-BR')} ${m.unit} · entrega prevista ${deliveryDate.split('-').reverse().join('/')}.`)
  }

  function rescheduleDelivery(id: string, deliveryDate: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    const old = m.deliveryDate
    m.deliveryDate = deliveryDate
    log('suprimentos', `Entrega reagendada: ${m.name}`, `De ${old?.split('-').reverse().join('/') ?? '—'} para ${deliveryDate.split('-').reverse().join('/')} (frente atrasada).`)
  }

  function setSafetyMargin(days: number) {
    const v = Math.max(0, Math.min(30, Math.round(days)))
    if (v === safetyMarginDays.value) return
    state.meta.safetyMarginDays = v
    log('suprimentos', 'Margem de segurança da DLP alterada', `DLP = Data necessária − lead time − ${v} dia(s).`)
  }

  /** Edição de insumo (lead time, quantidade, preço, fornecedor, tarefa vinculada). */
  function updateMaterial(id: string, patch: Partial<Pick<MaterialItem, 'leadTimeDays' | 'quantity' | 'unitPrice' | 'supplier' | 'taskUid' | 'deliveryDate'>>) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    const before = m.leadTimeDays
    Object.assign(m, patch)
    if (patch.leadTimeDays !== undefined && patch.leadTimeDays !== before) {
      log('suprimentos', `Lead time alterado: ${m.name}`, `${before} → ${patch.leadTimeDays} dias (fornecedor ${m.supplier}).`)
    }
  }

  function addMaterial(input: Omit<MaterialItem, 'id' | 'ordered' | 'orderDate' | 'deliveryDate'>): MaterialItem {
    const item: MaterialItem = { ...input, id: uid('m'), ordered: false }
    state.materials.push(item)
    const t = taskByUid.value.get(item.taskUid)
    log('suprimentos', `Insumo cadastrado: ${item.name}`, `Vinculado a [UID ${item.taskUid}] ${t?.wbs ?? ''} · lead time ${item.leadTimeDays} dias.`)
    return item
  }

  /** Registra o recebimento no canteiro na data de status. */
  function registerDelivery(id: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    m.ordered = true
    m.orderDate = m.orderDate ?? state.meta.statusDate
    m.deliveryDate = state.meta.statusDate
    for (const r of state.restrictions.filter((x) => x.kind === 'material' && !x.resolved && x.material && m.name.toLowerCase().includes(x.material))) {
      r.resolved = true
    }
    log('suprimentos', `Recebido no canteiro: ${m.name}`, `${m.quantity.toLocaleString('pt-BR')} ${m.unit} em ${state.meta.statusDate.split('-').reverse().join('/')}.`)
  }

  function removeMaterial(id: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    state.materials = state.materials.filter((x) => x.id !== id)
    log('suprimentos', `Insumo removido: ${m.name}`, 'Retirado do painel de suprimentos.')
  }

  function resetScenarioParams() {
    Object.assign(scenarioParams, clone(DEFAULT_SCENARIO_PARAMS))
    scenarioParams.crashing.targetUid = undefined
    scenarioParams.fastTracking.predUid = undefined
    scenarioParams.fastTracking.succUid = undefined
  }

  // ---------------------------------------------------------------- Módulo 4
  function addSinapiTask(input: SinapiInsert): Task {
    const { task, group } = buildSinapiTask(input, state.tasks)
    if (group) state.tasks.push(group)
    state.tasks.push(task)
    // Linha de base da inclusão de escopo = datas calculadas no momento da inclusão
    const s = schedule.value.byUid.get(task.uid)
    if (s) patchTask(task.uid, { baselineStart: s.start, baselineFinish: s.finish, baselineDuration: s.duration })
    log('sinapi', `Pacote incluído na EAP: [UID ${task.uid}] ${task.wbs}`, `${input.name} — ${input.durationDays} dias úteis, BAC ${fmtBRL(task.bac)}.`)
    return task
  }

  function buildSinapiTask(input: SinapiInsert, tasks: Task[]): { task: Task; parentWbs: string; group?: Task } {
    let parentWbs = input.parentWbs
    let group: Task | undefined
    if (input.newGroupName) {
      const topLevels = tasks.filter((t) => t.outlineLevel === 1).map((t) => Number(t.wbs))
      parentWbs = String((topLevels.length ? Math.max(...topLevels) : 0) + 1).padStart(2, '0')
      group = {
        uid: nextUid(tasks), wbs: parentWbs, name: input.newGroupName, outlineLevel: 1, isSummary: true, durationDays: 0,
        predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [],
      }
    }
    const pool = group ? [...tasks, group] : tasks
    const wbs = nextChildWbs(pool, parentWbs)
    const task: Task = {
      uid: nextUid(pool),
      wbs,
      name: input.name,
      outlineLevel: wbs.split('.').length,
      isSummary: false,
      durationDays: input.durationDays,
      predecessors: input.predecessorUid ? [{ uid: input.predecessorUid, type: input.linkType, lagDays: input.lagDays }] : [],
      percentComplete: 0,
      bac: Math.round(input.quantity * input.unitCost),
      actualCost: 0,
      resources: input.resources.filter((r) => r.units > 0),
      sinapi: input.code,
      floors: parseFloorRange(input.name),
      notes: `Gerado pelo CronoAI a partir do SINAPI ${input.code}: ${input.quantity.toLocaleString('pt-BR')} ${input.unit}.`,
    }
    return { task, parentWbs, group }
  }

  /** Prévia da inclusão: datas da nova tarefa e impacto na entrega. */
  function previewSinapiTask(input: SinapiInsert) {
    const { task, group } = buildSinapiTask(input, state.tasks)
    const tasks = [...state.tasks, ...(group ? [group] : []), task]
    const s = computeSchedule(tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate })
    const sched = s.byUid.get(task.uid)
    return {
      uid: task.uid,
      wbs: task.wbs,
      start: sched?.start,
      finish: sched?.finish,
      critical: !!sched?.critical,
      totalFloat: sched?.totalFloat ?? 0,
      projectFinish: s.projectFinish,
      deltaDays: workingVariance(calendar.value, schedule.value.projectFinish, s.projectFinish),
    }
  }

  function removeTask(taskUid: number) {
    const t = taskByUid.value.get(taskUid)
    if (!t || t.isSummary) return
    state.tasks = state.tasks
      .filter((x) => x.uid !== taskUid)
      .map((x) => (x.predecessors.some((p) => p.uid === taskUid) ? { ...x, predecessors: x.predecessors.filter((p) => p.uid !== taskUid) } : x))
    state.materials = state.materials.filter((m) => m.taskUid !== taskUid)
    log('sinapi', `Pacote removido: [UID ${taskUid}] ${t.wbs}`, `${t.name} excluído da EAP; vínculos dependentes removidos.`)
  }

  // ---------------------------------------------------------------- Módulo 4 · planilha orçamentária
  /** Predecessora lógica de engenharia: tarefa que termina por último no grupo anterior (Fundação → Supra → Alvenaria → ...). */
  function suggestPredecessorFor(groupWbs: string, tasks: Task[] = state.tasks, sched = schedule.value): number | undefined {
    const groups = sortByWbs(tasks.filter((t) => t.isSummary && t.outlineLevel === 1)).map((g) => g.wbs)
    const idx = groups.indexOf(groupWbs)
    for (let i = (idx < 0 ? groups.length : idx) - 1; i >= 0; i--) {
      const leaves = tasks.filter((t) => !t.isSummary && t.wbs.startsWith(groups[i] + '.'))
      if (leaves.length) return leaves.reduce((best, t) => ((sched.byUid.get(t.uid)?.ef ?? 0) > (sched.byUid.get(best.uid)?.ef ?? 0) ? t : best)).uid
    }
    return undefined
  }

  function addBudgetLine(line: Omit<BudgetLine, 'id'>) {
    if (state.budget.length >= MAX_BUDGET_LINES) return
    state.budget.push({ ...line, id: uid('b') })
  }

  function updateBudgetLine(id: string, patch: Partial<Omit<BudgetLine, 'id'>>) {
    const l = state.budget.find((x) => x.id === id)
    if (l) Object.assign(l, patch)
  }

  function removeBudgetLine(id: string) {
    state.budget = state.budget.filter((x) => x.id !== id)
  }

  function clearBudget() {
    state.budget = []
  }

  function importBudgetCsv(text: string) {
    const result = parseBudgetCsv(text)
    const room = MAX_BUDGET_LINES - state.budget.length
    for (const l of result.lines.slice(0, room)) state.budget.push({ ...l, id: uid('b') })
    if (result.lines.length > room) result.errors.push(`Limite de ${MAX_BUDGET_LINES} linhas na planilha atingido.`)
    if (result.lines.length) log('sinapi', 'Planilha orçamentária importada', `${Math.min(room, result.lines.length)} linha(s) lidas do CSV.`)
    return { added: Math.min(room, result.lines.length), errors: result.errors }
  }

  /**
   * Monta as tarefas da planilha sobre uma cópia da EAP: ordem de engenharia por grupo,
   * 1ª linha de cada grupo FS na última tarefa do grupo anterior e as demais encadeadas (FS ou SS com defasagem).
   */
  function buildBudgetBatch(lines: BudgetLine[], opts: BatchOptions) {
    let tasks = [...state.tasks]
    const created: Task[] = []
    const existingGroups = new Set(tasks.filter((t) => t.isSummary && t.outlineLevel === 1).map((t) => t.wbs))
    let extraGroup: string | undefined
    const lastInGroup = new Map<string, Task>()
    const sorted = [...lines].sort((a, b) => a.group.localeCompare(b.group))
    for (const l of sorted) {
      const days = lineDuration(l)
      let parentWbs = existingGroups.has(l.group) ? l.group : extraGroup
      const prev = lastInGroup.get(parentWbs ?? '__novo__')
      const sched = computeSchedule(tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate })
      const predecessorUid = prev?.uid ?? suggestPredecessorFor(parentWbs ?? '99', tasks, sched)
      const linkType: LinkType = prev && opts.mode === 'SS' ? 'SS' : 'FS'
      const lagDays = prev && opts.mode === 'SS' ? Math.max(1, Math.round((prev.durationDays * opts.overlapPct) / 100)) : 0
      const { task, group } = buildSinapiTask(
        {
          name: lineName(l),
          code: l.code,
          unit: l.unit,
          quantity: l.quantity,
          unitCost: l.unitCost,
          durationDays: days,
          resources: lineResources(l),
          parentWbs: parentWbs ?? '',
          newGroupName: parentWbs ? undefined : 'Serviços complementares (SINAPI)',
          predecessorUid,
          linkType,
          lagDays,
        },
        tasks,
      )
      if (group) {
        tasks = [...tasks, group]
        extraGroup = group.wbs
        parentWbs = group.wbs
      }
      tasks = [...tasks, task]
      created.push(task)
      lastInGroup.set(parentWbs ?? '__novo__', task)
    }
    return { tasks, created }
  }

  function previewBudgetBatch(opts: BatchOptions = DEFAULT_BATCH_OPTIONS) {
    if (!state.budget.length) return undefined
    const { tasks, created } = buildBudgetBatch(state.budget, opts)
    const s = computeSchedule(tasks, calendar.value, { mode: 'forecast', statusDate: state.meta.statusDate })
    return {
      created: created.map((t) => ({ task: t, sched: s.byUid.get(t.uid)! })),
      projectFinish: s.projectFinish,
      deltaDays: workingVariance(calendar.value, schedule.value.projectFinish, s.projectFinish),
      bac: created.reduce((a, t) => a + t.bac, 0),
    }
  }

  /** Gera os pacotes da planilha na EAP (com linha de base da inclusão) e esvazia a planilha. */
  function generateFromBudget(opts: BatchOptions = DEFAULT_BATCH_OPTIONS): Task[] {
    if (!state.budget.length) return []
    const { tasks, created } = buildBudgetBatch(state.budget, opts)
    state.tasks = tasks
    for (const t of created) {
      const s = schedule.value.byUid.get(t.uid)
      if (s) patchTask(t.uid, { baselineStart: s.start, baselineFinish: s.finish, baselineDuration: s.duration })
    }
    const bac = created.reduce((a, t) => a + t.bac, 0)
    log('sinapi', `Cronograma gerado da planilha SINAPI (${created.length} pacotes)`, `Vínculos ${opts.mode === 'SS' ? `SS com defasagem de ${opts.overlapPct}%` : 'FS em série'} · BAC +${fmtBRL(bac)}.`)
    state.budget = []
    return created
  }

  // ---------------------------------------------------------------- EAP / XML
  function updateTask(taskUid: number, patch: Partial<Task>) {
    if (patch.percentComplete !== undefined) {
      applyProgress(taskUid, patch.percentComplete, state.meta.statusDate)
      const { percentComplete: _ignored, ...rest } = patch
      if (Object.keys(rest).length) patchTask(taskUid, rest)
    } else {
      patchTask(taskUid, patch)
    }
  }

  function saveBaseline() {
    state.tasks = state.tasks.map((t) => {
      const s = schedule.value.byUid.get(t.uid)
      return s ? { ...t, baselineStart: s.start, baselineFinish: s.finish, baselineDuration: s.duration } : t
    })
    log('sistema', 'Nova linha de base salva', `Linha de base substituída pelo cronograma reprogramado em ${state.meta.statusDate.split('-').reverse().join('/')}.`)
  }

  function setStatusDate(iso: string) {
    state.meta.statusDate = iso
    log('sistema', 'Data de status alterada', `Nova data de status: ${iso.split('-').reverse().join('/')}.`)
  }

  /** Gera o .xml MSPDI do estado atual e valida estrutura e ordem dos elementos antes de entregar. */
  function exportXml(): { filename: string; xml: string; validation: MspdiValidation } {
    const xml = buildMspdiXml({ meta: state.meta, tasks: state.tasks, calendar: state.calendar, schedule: schedule.value })
    const validation = validateMspdi(xml, { strictOrder: true })
    const safe = state.meta.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (validation.valid) {
      log('importacao', 'Exportado para MS Project (.xml)', `${validation.taskCount - 1} tarefas e ${validation.linkCount} vínculos exportados no padrão MSPDI.`)
    }
    return { filename: `${safe}_${state.meta.statusDate}.xml`, xml, validation }
  }


  function importXml(text: string): string[] {
    const result = parseMspdiXml(text)
    const meta = {
      ...state.meta,
      ...Object.fromEntries(Object.entries(result.meta).filter(([, v]) => v !== undefined && v !== '')),
    }
    const tasks = baselineFor(result.tasks, meta, result.calendar.holidays, true)
    const uids = new Set(tasks.map((t) => t.uid))
    state.meta = meta
    state.tasks = tasks
    state.calendar = result.calendar
    state.materials = state.materials.filter((m) => uids.has(m.taskUid))
    state.reports = state.reports.map((r) => (r.approvedUid !== undefined && !uids.has(r.approvedUid) ? { ...r, approvedUid: undefined } : r))
    state.restrictions = state.restrictions.filter((r) => r.taskUid === undefined || uids.has(r.taskUid))
    state.appliedScenarios = []
    state.recoveryCosts = []
    state.undo = []
    log('importacao', 'Importado do MS Project (.xml)', `${tasks.length} tarefas carregadas de "${meta.name}".`)
    return result.warnings
  }

  // ---------------------------------------------------------------- Obras (SPEC-14)
  /** Grava a obra atual antes de uma troca, se houver o que gravar. Falhou: a troca é cancelada, para não perder alterações. */
  async function garantirObraAtualSalva(): Promise<boolean> {
    await nextTick() // deixa o observador do estado marcar como "pendente" uma alteração feita neste mesmo instante
    // Grava sempre que houver alteração pendente (o observador já marcou ou o atraso ainda corre)
    return estadoGravacao.value === 'salvo' && !timerPendente ? true : salvarAgora()
  }

  const ERRO_BLOQUEADO = 'As obras não foram carregadas com segurança: nada será gravado até recarregar a página.'
  const ERRO_SALVAR_ANTES = 'A obra atual não pôde ser salva. Resolva o aviso de armazenamento antes de trocar de obra.'

  function indiceComAtivaNova(ativaId: string, obrasLista: ResumoObra[]): IndiceObras {
    const base = indice ?? { versaoIndice: 1 as const, obraAtivaId: ativaId, obras: [] }
    return { ...base, obraAtivaId: ativaId, obras: obrasLista }
  }

  /** Troca a obra ativa: grava a atual, lê e migra a nova, grava o índice e só então muda a tela. */
  async function trocarObra(id: string): Promise<ResultadoAcao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    if (id === obraAtivaId.value) return { ok: true }
    if (!(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const r = await abrirRegistro(id)
    if (!('estado' in r)) {
      marcarIlegivel(id, true)
      return { ok: false, erro: r.erro }
    }
    const lista = (indice?.obras ?? obrasPlanas()).map((o) => (o.id === id ? { ...o, ilegivel: undefined } : o))
    const novoIndice = indiceComAtivaNova(id, lista)
    try {
      await armazenamento.gravarIndice(novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    obraAtivaId.value = id
    await aplicarEstado(r.estado)
    return { ok: true }
  }

  /** Cria uma obra (em branco ou a de exemplo) e a torna ativa. */
  async function criarObra(nova: NovaObra): Promise<ResultadoCriacao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    let estado: PersistedState
    if (nova.modelo === 'branco') {
      const erros = validarDadosObra(nova.dados)
      if (erros.length) return { ok: false, erro: erros[0], erros }
      estado = estadoObraVazia(nova.dados, SEED_META.dailyIndirectCost)
    } else {
      estado = buildSeedState()
      // Nome único na lista: "Edifício … (2)" quando o exemplo já existe
      const nomes = obras.value.map((o) => o.nome)
      let nome = SEED_META.name
      for (let n = 2; nomes.includes(nome); n++) nome = `${SEED_META.name} (${n})`
      estado.meta.name = nome
    }
    if (!(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const id = uid('obra')
    const em = agora()
    const novoIndice = indiceComAtivaNova(id, [...(indice?.obras ?? obrasPlanas()), resumirObra(id, estado, em)])
    try {
      await armazenamento.gravarObra(criarRegistro(id, estado, em), novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    obraAtivaId.value = id
    await aplicarEstado(estado)
    return { ok: true, id }
  }

  /** Copia uma obra para uma nova, independente (não a torna ativa). */
  async function duplicarObra(id: string): Promise<ResultadoCriacao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    if (id === obraAtivaId.value && !(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const origem = id === obraAtivaId.value ? { estado: clone(state) } : await abrirRegistro(id)
    if (!('estado' in origem)) return { ok: false, erro: origem.erro }
    const copia = origem.estado
    copia.meta.name = nomeDaCopia(copia.meta.name, obras.value.map((o) => o.nome))
    const novoId = uid('obra')
    const em = agora()
    const base = indice ?? indiceComAtivaNova(obraAtivaId.value, obrasPlanas())
    const novoIndice: IndiceObras = { ...base, obras: [...base.obras, resumirObra(novoId, copia, em)] }
    try {
      await armazenamento.gravarObra(criarRegistro(novoId, copia, em), novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    return { ok: true, id: novoId }
  }

  /** Exclui uma obra. A única não é excluída; excluir a ativa abre a 1ª outra obra legível. */
  async function excluirObra(id: string): Promise<ResultadoAcao> {
    const tinhaGravacaoPendente = timerPendente
    const r = await excluirObraInterno(id)
    // Falhou: a obra continua aberta e o que estava pendente nela precisa ser gravado
    if (!r.ok && tinhaGravacaoPendente && id === obraAtivaId.value && !gravacaoBloqueada.value) agendarGravacao()
    return r
  }

  async function excluirObraInterno(id: string): Promise<ResultadoAcao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    const lista = indice?.obras ?? obrasPlanas()
    if (!lista.some((o) => o.id === id)) return { ok: false, erro: 'Obra não encontrada.' }
    if (lista.length <= 1) return { ok: false, erro: 'A obra não pode ser excluída: é a única.' }
    const restantes = lista.filter((o) => o.id !== id)
    const eraAtiva = id === obraAtivaId.value
    let proxima: { id: string; estado: PersistedState } | undefined
    if (eraAtiva) {
      clearTimeout(saveTimer) // alterações pendentes são da obra que será excluída
      timerPendente = false
      for (const o of restantes) {
        const r = await abrirRegistro(o.id)
        if ('estado' in r) {
          proxima = { id: o.id, estado: r.estado }
          break
        }
        marcarIlegivel(o.id, true)
      }
      if (!proxima) return { ok: false, erro: 'Não há outra obra legível para abrir no lugar desta.' }
    } else if (!(await garantirObraAtualSalva())) {
      return { ok: false, erro: ERRO_SALVAR_ANTES }
    }
    await fila // uma gravação em andamento não pode ressuscitar a obra excluída
    const atual = indice ?? indiceComAtivaNova(obraAtivaId.value, lista.map((o) => ({ ...o })))
    const novoIndice: IndiceObras = {
      ...atual,
      obraAtivaId: proxima?.id ?? obraAtivaId.value,
      obras: atual.obras.filter((o) => o.id !== id),
    }
    try {
      await armazenamento.excluirObra(id, novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    if (proxima) {
      obraAtivaId.value = proxima.id
      await aplicarEstado(proxima.estado)
      estadoGravacao.value = armazenamentoIndisponivel.value ? 'erro' : 'salvo'
    }
    return { ok: true }
  }

  /** Edita os dados da obra ativa. A data de status passa por `setStatusDate` (com registro no log). */
  function atualizarDadosObra(dados: DadosObra): { ok: true } | { ok: false; erros: string[] } {
    const erros = validarDadosObra(dados, { inicioOriginal: state.meta.startDate, primeiroInicioReal: primeiroInicioReal.value })
    if (erros.length) return { ok: false, erros }
    const meta = state.meta
    meta.name = dados.nome.trim()
    meta.manager = (dados.responsavel ?? '').trim()
    if (dados.dataInicio !== meta.startDate) {
      meta.startDate = dados.dataInicio
      // A data de início é a base do calendário: as tarefas não iniciadas são reprogramadas; a linha de base (datas ISO) não muda
      log('sistema', 'Data de início alterada', `Nova data de início: ${dados.dataInicio.split('-').reverse().join('/')}. Tarefas não iniciadas foram reprogramadas; a linha de base não mudou.`)
    }
    // Campo opcional vazio = "não informado": a propriedade some, como na obra de exemplo
    if (dados.uf) meta.uf = dados.uf
    else delete meta.uf
    if (dados.municipio?.trim()) meta.municipio = dados.municipio.trim()
    else delete meta.municipio
    if (dados.regimeSinapi) meta.regimeSinapi = dados.regimeSinapi
    else delete meta.regimeSinapi
    if (dados.dataBaseSinapi) meta.dataBaseSinapi = dados.dataBaseSinapi
    else delete meta.dataBaseSinapi
    if (dados.dataStatus !== meta.statusDate) setStatusDate(dados.dataStatus)
    obras.value = obras.value.map((o) => (o.id === obraAtivaId.value ? resumirObra(o.id, state, o.atualizadoEm) : o))
    return { ok: true }
  }

  return {
    state,
    calendar,
    baseCalendar,
    schedule,
    rollups,
    tasksByWbs,
    leaves,
    taskByUid,
    evm,
    packageEvm,
    sCurve,
    sCurveFor,
    evmFor,
    evmForecast,
    delay,
    semCronograma,
    semOrcamento,
    primeiroInicioReal,
    scenarios,
    scenarioParams,
    scenarioOptions,
    recommendation,
    resetScenarioParams,
    supplies,
    safetyMarginDays,
    setSafetyMargin,
    updateMaterial,
    addMaterial,
    registerDelivery,
    removeMaterial,
    recoveryTotal,
    finishVarianceDays,
    msProjectTasks,
    msProjectTask,
    interpret,
    previewProgress,
    previewTaskXml,
    approveReport,
    rejectReport,
    addReport,
    resolveRestriction,
    applyScenario,
    appliedResult,
    undoScenario,
    orderMaterial,
    rescheduleDelivery,
    addSinapiTask,
    suggestPredecessorFor,
    addBudgetLine,
    updateBudgetLine,
    removeBudgetLine,
    clearBudget,
    importBudgetCsv,
    previewBudgetBatch,
    generateFromBudget,
    previewSinapiTask,
    removeTask,
    updateTask,
    saveBaseline,
    setStatusDate,
    exportXml,
    importXml,
    obras,
    obraAtivaId,
    estadoGravacao,
    mensagemGravacao,
    alertaCota,
    avisosCarga,
    armazenamentoIndisponivel,
    migracaoV1,
    carregado,
    gravacaoBloqueada,
    bloquearGravacao,
    carregar,
    salvarAgora,
    trocarObra,
    criarObra,
    duplicarObra,
    excluirObra,
    atualizarDadosObra,
  }
})
