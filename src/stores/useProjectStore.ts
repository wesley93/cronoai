// Estado global reativo da obra: toda ação (apontamento, cenário, SINAPI, XML) recalcula CPM, EVM e suprimentos.
import { defineStore } from 'pinia'
import { computed, reactive, watch } from 'vue'
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

const STORAGE_KEY = 'cronoai-state-v1'

interface ScenarioUndo {
  kind: ScenarioKind
  taskUid?: number
  before?: Partial<Task>
  addedDays?: string[]
  costId: string
  result: ScenarioResult
}

type PersistedState = ProjectState & { undo: ScenarioUndo[]; budget: BudgetLine[] }

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

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedState
      if (parsed?.tasks?.length && parsed.meta) return { ...buildSeedState(), ...parsed }
    }
  } catch {
    /* estado salvo corrompido ou indisponível: recomeça com os dados de exemplo */
  }
  return buildSeedState()
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
  const state = reactive<PersistedState>(loadState())

  let saveTimer: ReturnType<typeof setTimeout> | undefined
  watch(
    state,
    () => {
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
        } catch {
          /* cota excedida ou modo privado: segue apenas em memória */
        }
      }, 300)
    },
    { deep: true },
  )

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
    const kidsBySummary = new Map<string, Task[]>()
    for (const leaf of leaves.value) {
      const parts = leaf.wbs.split('.')
      let current = ''
      for (let i = 0; i < parts.length - 1; i++) {
        current = current ? `${current}.${parts[i]}` : parts[i]
        let list = kidsBySummary.get(current)
        if (!list) kidsBySummary.set(current, (list = []))
        list.push(leaf)
      }
    }
    return tasksByWbs.value.map((t): MSProjectTask => {
      if (t.isSummary) {
        const r = rollups.value.get(t.uid)
        const kids = kidsBySummary.get(t.wbs) || []
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

  function resetToSeed() {
    Object.assign(state, buildSeedState())
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
    resetToSeed,
  }
})
