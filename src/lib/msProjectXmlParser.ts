// Conversor MS Project Data Interchange (MSPDI): estado da store <-> arquivo .xml do MS Project.
// Referência do esquema: https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference
// A ordem dos elementos segue as sequências (xs:sequence) do esquema MSPDI; o validador abaixo confere essa ordem.
import type { CalendarioObra, IntervaloTrabalho, Lag, LinkType, ProjectMeta, ScheduleResult, Task } from '@/types/domain'
import { WorkCalendar, addCalendarDays, defaultHolidays } from './calendar'
import {
  UID_CALENDARIO_PADRAO,
  calendarioDeDias,
  calendarioPadrao,
  compilarCalendarios,
  diasParaMinutos,
  minutosParaDias,
  type CalendariosCompilados,
} from './calendarioTrabalho'
import { compareWbs, normalizeText, parseFloorRange, rollupSummaries, type SummaryRollup } from './wbs'

export const MSPDI_NAMESPACE = 'http://schemas.microsoft.com/project'
/** Text1 e Number1 de tarefa no MS Project. */
export const FIELD_SINAPI = '188743731'
export const FIELD_LEAD_TIME = '188743767'
const DEFAULT_MINUTES_PER_DAY = 480
/** Limite de tamanho do texto do MSPDI aceito pelo import (defesa em profundidade; o limite de bytes fica em useMsProject.ts). */
export const MAX_MSPDI_CHARS = 15 * 1024 * 1024
/** Dias de uma única exceção de calendário expandidos pelo import. */
const MAX_EXCEPTION_DAYS = 400
/**
 * Orçamento de dias PERCORRIDOS (não só inseridos) na expansão de todas as exceções do calendário importado (≈ 27 anos de dias
 * corridos). Limita o trabalho de CPU: milhares de exceções repetidas de intervalo longo não travam a aba. Como cada dia inserido
 * foi percorrido, também limita o total de feriados + dias úteis extras.
 */
export const MAX_CALENDAR_DAYS = 10_000
/**
 * DurationFormat em tempo corrido (elapsed): 4 min, 6 h, 8 dia, 10 sem, 12 mês; +32 = estimado.
 * Fora de propósito: 19/20 (percentual; 20 = e%) e 51/52 (estimados) não são duração em tempo.
 */
const ELAPSED_FORMATS = new Set(['4', '6', '8', '10', '12', '36', '38', '40', '42', '44'])

const LINK_TO_CODE: Record<LinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }
const CODE_TO_LINK: Record<string, LinkType> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' }
/** Tipo de vínculo pelo código do arquivo. `Object.hasOwn`: `in`/índice aceitariam `constructor`, `toString`… (chave vinda do XML). */
const linkTypeOf = (code: string): LinkType | undefined => (Object.hasOwn(CODE_TO_LINK, code) ? CODE_TO_LINK[code] : undefined)
/** Data ISO `yyyy-mm-dd` existente no calendário (rejeita texto livre e dias inexistentes como 2026-02-30). */
function isValidIsoDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

// Subsequências do esquema MSPDI para os elementos que geramos/lemos (usadas na validação de ordem).
export const SCHEMA_ORDER = {
  Project: [
    'SaveVersion', 'UID', 'Name', 'Title', 'Subject', 'Category', 'Company', 'Manager', 'Author', 'CreationDate', 'Revision',
    'LastSaved', 'ScheduleFromStart', 'StartDate', 'FinishDate', 'FYStartDate', 'CriticalSlackLimit', 'CurrencyDigits',
    'CurrencySymbol', 'CurrencyCode', 'CurrencySymbolPosition', 'CalendarUID', 'DefaultStartTime', 'DefaultFinishTime',
    'MinutesPerDay', 'MinutesPerWeek', 'DaysPerMonth', 'DefaultTaskType', 'DefaultFixedCostAccrual', 'DefaultStandardRate',
    'DefaultOvertimeRate', 'DurationFormat', 'WorkFormat', 'EditableActualCosts', 'HonorConstraints', 'EarnedValueMethod',
    'InsertedProjectsLikeSummary', 'MultipleCriticalPaths', 'NewTasksEffortDriven', 'NewTasksEstimated', 'SplitsInProgressTasks',
    'SpreadActualCost', 'SpreadPercentComplete', 'TaskUpdatesResource', 'FiscalYearStart', 'WeekStartDay', 'MoveCompletedEndsBack',
    'MoveRemainingStartsBack', 'MoveRemainingStartsForward', 'MoveCompletedEndsForward', 'BaselineForEarnedValue',
    'AutoAddNewResourcesAndTasks', 'StatusDate', 'CurrentDate', 'MicrosoftProjectServerURL', 'Autolink', 'NewTaskStartDate',
    'DefaultTaskEVMethod', 'ProjectExternallyEdited', 'ExtendedCreationDate', 'ActualsInSync', 'RemoveFileProperties',
    'AdminProject', 'OutlineCodes', 'WBSMasks', 'ExtendedAttributes', 'Calendars', 'Tasks', 'Resources', 'Assignments',
  ],
  Task: [
    'UID', 'ID', 'Name', 'Type', 'IsNull', 'CreateDate', 'Contact', 'WBS', 'WBSLevel', 'OutlineNumber', 'OutlineLevel', 'Priority',
    'Start', 'Finish', 'Duration', 'ManualStart', 'ManualFinish', 'ManualDuration', 'DurationFormat', 'Work', 'Stop', 'Resume',
    'ResumeValid', 'EffortDriven', 'Recurring', 'OverAllocated', 'Estimated', 'Milestone', 'Summary', 'DisplayAsSummary',
    'Critical', 'IsSubproject', 'IsSubprojectReadOnly', 'SubprojectName', 'ExternalTask', 'ExternalTaskProject', 'EarlyStart',
    'EarlyFinish', 'LateStart', 'LateFinish', 'StartVariance', 'FinishVariance', 'WorkVariance', 'FreeSlack', 'TotalSlack',
    'StartSlack', 'FinishSlack', 'FixedCost', 'FixedCostAccrual', 'PercentComplete', 'PercentWorkComplete', 'Cost',
    'OvertimeCost', 'OvertimeWork', 'ActualStart', 'ActualFinish', 'ActualDuration', 'ActualCost', 'ActualOvertimeCost',
    'ActualWork', 'ActualOvertimeWork', 'RegularWork', 'RemainingDuration', 'RemainingCost', 'RemainingWork',
    'RemainingOvertimeCost', 'RemainingOvertimeWork', 'ACWP', 'CV', 'ConstraintType', 'CalendarUID', 'ConstraintDate',
    'Deadline', 'LevelAssignments', 'LevelingCanSplit', 'LevelingDelay', 'LevelingDelayFormat', 'IgnoreResourceCalendar',
    'Notes', 'HideBar', 'Rollup', 'BCWS', 'BCWP', 'PhysicalPercentComplete', 'EarnedValueMethod', 'PredecessorLink',
    'ExtendedAttribute', 'Baseline', 'OutlineCode', 'TimephasedData',
  ],
  PredecessorLink: ['PredecessorUID', 'Type', 'CrossProject', 'CrossProjectName', 'LinkLag', 'LagFormat'],
  Baseline: ['TimephasedData', 'Number', 'Interim', 'Start', 'Finish', 'Duration', 'DurationFormat', 'EstimatedDuration', 'Work', 'Cost', 'BCWS', 'BCWP'],
  Calendar: ['UID', 'GUID', 'Name', 'IsBaseCalendar', 'IsBaselineCalendar', 'BaseCalendarUID', 'WeekDays', 'Exceptions', 'WorkWeeks'],
  WeekDay: ['DayType', 'DayWorking', 'TimePeriod', 'WorkingTimes'],
  Resource: [
    'UID', 'GUID', 'ID', 'Name', 'Type', 'IsNull', 'Initials', 'Phonetics', 'NTAccount', 'MaterialLabel', 'Code', 'Group',
    'WorkGroup', 'EmailAddress', 'Hyperlink', 'HyperlinkAddress', 'HyperlinkSubAddress', 'MaxUnits', 'PeakUnits', 'OverAllocated',
    'AvailableFrom', 'AvailableTo', 'Start', 'Finish', 'CanLevel', 'AccrueAt', 'Work', 'RegularWork', 'OvertimeWork', 'ActualWork',
    'RemainingWork', 'ActualOvertimeWork', 'RemainingOvertimeWork', 'PercentWorkComplete', 'StandardRate', 'StandardRateFormat',
    'Cost', 'OvertimeRate', 'OvertimeRateFormat',
  ],
  Assignment: ['UID', 'GUID', 'TaskUID', 'ResourceUID', 'PercentWorkComplete', 'ActualCost', 'ActualFinish', 'ActualStart', 'Cost', 'Finish', 'Start', 'Units'],
  ExtendedAttributeDef: ['FieldID', 'FieldName', 'CFType', 'Guid', 'ElemType', 'MaxMultiValues', 'UserDef', 'Alias'],
} as const

// ---------------------------------------------------------------------------
// Construtor de XML mínimo (escapa texto e remove caracteres inválidos em XML 1.0)
// ---------------------------------------------------------------------------

type Child = XNode | null | undefined | false | '' | 0 // permite `cond && x(...)`
interface XNode {
  tag: string
  attrs?: Record<string, string>
  text?: string
  children?: Child[]
}

function cleanText(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
}

function esc(v: string): string {
  return cleanText(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Elemento com valor (omitido quando vazio) ou com filhos. */
function x(tag: string, content?: string | number | boolean | null | Child[]): XNode | null {
  if (Array.isArray(content)) return { tag, children: content }
  if (content === undefined || content === null || content === '') return null
  return { tag, text: typeof content === 'boolean' ? (content ? '1' : '0') : String(content) }
}

function render(node: XNode, depth = 0): string {
  const pad = '  '.repeat(depth)
  const attrs = Object.entries(node.attrs ?? {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')
  if (node.text !== undefined) return `${pad}<${node.tag}${attrs}>${esc(node.text)}</${node.tag}>\n`
  const kids = (node.children ?? []).filter((c): c is XNode => !!c)
  if (!kids.length) return `${pad}<${node.tag}${attrs}/>\n`
  return `${pad}<${node.tag}${attrs}>\n${kids.map((k) => render(k, depth + 1)).join('')}${pad}</${node.tag}>\n`
}

// ---------------------------------------------------------------------------
// Conversões de unidades MSPDI
// ---------------------------------------------------------------------------

/** Duração em dias úteis -> PT{h}H{m}M{s}S. */
export function toDuration(days: number, minutesPerDay = DEFAULT_MINUTES_PER_DAY): string {
  const totalMinutes = Math.round(Math.max(0, days) * minutesPerDay)
  return `PT${Math.floor(totalMinutes / 60)}H${totalMinutes % 60}M0S`
}

/** PT80H0M0S / P2DT4H -> minutos brutos (sem arredondar); `undefined` se o texto não é uma duração ISO 8601. */
function durationMinutes(value: string | undefined, minutesPerDay: number): number | undefined {
  if (!value) return undefined
  const m = value.match(/^-?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (!m) return undefined
  const [, d, h, min, sec] = m.map((v) => (v ? Number(v) : 0)) as number[]
  return d * minutesPerDay + h * 60 + min + sec / 60
}

/** PT80H0M0S / P2DT4H -> dias úteis, considerando os minutos por dia do projeto. */
export function fromDuration(value: string | undefined, minutesPerDay = DEFAULT_MINUTES_PER_DAY): number {
  const minutes = durationMinutes(value, minutesPerDay)
  if (minutes === undefined) return 0
  return Math.round((minutes / minutesPerDay) * 100) / 100
}

/** LinkLag (décimos de minuto) + LagFormat -> dias úteis. */
export function lagToWorkingDays(linkLag: number, lagFormat: number, minutesPerDay = DEFAULT_MINUTES_PER_DAY): number | undefined {
  const fmt = lagFormat >= 35 ? lagFormat - 32 : lagFormat // formatos "estimados" (35+) equivalem aos normais
  const minutes = linkLag / 10
  if ([3, 5, 7, 9, 11].includes(fmt)) return Math.round(minutes / minutesPerDay)
  if ([4, 6, 8, 10, 12].includes(fmt)) return Math.round(((minutes / 1440) * 5) / 7) // corridos -> úteis (aprox. 5/7)
  return undefined // percentual (19/20) ou formato desconhecido
}

const dt = (iso: string | undefined, time: string) => (iso ? `${iso.slice(0, 10)}T${time}` : undefined)
const money = (v: number) => (Math.round(v * 100) / 100).toFixed(2)

// ---------------------------------------------------------------------------
// Exportação: estado da store -> MSPDI
// ---------------------------------------------------------------------------

export interface MspdiExportInput {
  meta: ProjectMeta
  tasks: Task[]
  calendarios: CalendarioObra[]
  calendarioPadraoUid: number
  schedule: ScheduleResult
}

interface TaskContext {
  schedule: ScheduleResult
  rollups: Map<number, SummaryRollup>
  /** Dia útil do calendário padrão: só para a duração das tarefas-resumo (contagem de dias úteis). */
  cal: WorkCalendar
  cals: CalendariosCompilados
}

function createContext(input: MspdiExportInput): TaskContext {
  const cals = compilarCalendarios(input.meta.startDate, input.calendarios, input.calendarioPadraoUid)
  return {
    schedule: input.schedule,
    rollups: rollupSummaries(input.tasks, input.schedule),
    cal: calendarioDeDias(cals.padrao),
    cals,
  }
}

/** Minutos do dia → hh:mm:ss do MSPDI (24:00 vira 00:00:00, como o MS Project grava). */
function horaMspdi(minutos: number): string {
  const m = minutos >= 1440 ? 0 : minutos
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
}

const workingTimesNode = (intervalos: readonly IntervaloTrabalho[]): XNode | null =>
  x('WorkingTimes', intervalos.map((iv) => x('WorkingTime', [x('FromTime', horaMspdi(iv.de)), x('ToTime', horaMspdi(iv.ate))])))

const periodNode = (d: string): XNode | null => x('TimePeriod', [x('FromDate', `${d}T00:00:00`), x('ToDate', `${d}T23:59:00`)])

function calendarNode(cal: CalendarioObra): XNode | null {
  const naoUteis = cal.excecoes.filter((ex) => ex.intervalos.length === 0)
  const uteis = cal.excecoes.filter((ex) => ex.intervalos.length > 0)
  return x('Calendar', [
    x('UID', cal.uid),
    x('Name', cal.nome),
    x('IsBaseCalendar', 1),
    x('BaseCalendarUID', -1),
    x('WeekDays', [
      ...[1, 2, 3, 4, 5, 6, 7].map((day) => {
        const intervalos = cal.semana[day - 1] // DayType 1 = domingo … 7 = sábado
        return x('WeekDay', [x('DayType', day), x('DayWorking', intervalos.length > 0), intervalos.length > 0 && workingTimesNode(intervalos)])
      }),
      ...naoUteis.map((ex) => x('WeekDay', [x('DayType', 0), x('DayWorking', 0), periodNode(ex.data)])),
      ...uteis.map((ex) => x('WeekDay', [x('DayType', 0), x('DayWorking', 1), periodNode(ex.data), workingTimesNode(ex.intervalos)])),
    ]),
  ])
}

function taskNode(t: Task, id: number, ctx: TaskContext): XNode {
  const s = ctx.schedule.byUid.get(t.uid)
  const r = ctx.rollups.get(t.uid)
  const start = t.isSummary ? r?.start : s?.start
  const finish = t.isSummary ? r?.finish : s?.finish
  const duration = t.isSummary
    ? start && finish ? ctx.cal.countWorkingBetween(start, addCalendarDays(finish, 1)) : 0
    : minutosParaDias(t.duracaoMin)
  const milestone = !t.isSummary && duration === 0
  const pct = Math.round(t.isSummary ? (r?.percentComplete ?? 0) : t.percentComplete)
  const cost = t.isSummary ? (r?.bac ?? 0) : t.bac
  const actualCost = t.isSummary ? (r?.actualCost ?? 0) : t.actualCost
  const critical = t.isSummary ? !!r?.critical : !!s?.critical
  const startTime = milestone ? '17:00:00' : '08:00:00'
  const slackUnits = (days: number) => Math.round(days * DEFAULT_MINUTES_PER_DAY * 10)
  const leaf = !t.isSummary
  const bStart = t.isSummary ? r?.baselineStart : t.baselineStart
  const bFinish = t.isSummary ? r?.baselineFinish : t.baselineFinish

  return x('Task', [
    x('UID', t.uid),
    x('ID', id),
    x('Name', t.name),
    x('Type', 1), // duração fixa
    x('IsNull', 0),
    x('WBS', t.wbs),
    x('OutlineNumber', t.wbs),
    x('OutlineLevel', t.outlineLevel),
    x('Priority', 500),
    x('Start', dt(start, startTime)),
    x('Finish', dt(finish, '17:00:00')),
    x('Duration', toDuration(duration)),
    x('DurationFormat', 7),
    x('Milestone', milestone),
    x('Summary', t.isSummary),
    x('Critical', critical),
    leaf && s && x('EarlyStart', dt(s.earlyStart, startTime)),
    leaf && s && x('EarlyFinish', dt(s.earlyFinish, '17:00:00')),
    leaf && s && x('LateStart', dt(s.lateStart, startTime)),
    leaf && s && x('LateFinish', dt(s.lateFinish, '17:00:00')),
    leaf && s && x('FreeSlack', slackUnits(s.freeFloat)),
    leaf && s && x('TotalSlack', slackUnits(s.totalFloat)),
    x('FixedCost', money(leaf ? t.bac : 0)),
    x('FixedCostAccrual', 3), // rateado
    x('PercentComplete', pct),
    x('Cost', money(cost)),
    leaf && t.percentComplete > 0 && x('ActualStart', dt(t.actualStart ?? start, startTime)),
    leaf && t.percentComplete >= 100 && x('ActualFinish', dt(t.actualFinish ?? finish, '17:00:00')),
    leaf && x('ActualDuration', toDuration((duration * t.percentComplete) / 100)),
    x('ActualCost', money(actualCost)),
    leaf && x('RemainingDuration', toDuration((duration * (100 - t.percentComplete)) / 100)),
    x('ConstraintType', t.restricao ? 4 : 0), // 4 = Não iniciar antes de
    t.restricao && x('ConstraintDate', dt(t.restricao.data, '08:00:00')),
    x('Notes', t.notes),
    ...t.predecessors.map((p) =>
      x('PredecessorLink', [
        x('PredecessorUID', p.uid),
        x('Type', LINK_TO_CODE[p.type]),
        x('CrossProject', 0),
        x('LinkLag', p.lag.minutos * 10),
        x('LagFormat', 7),
      ]),
    ),
    t.sinapi && x('ExtendedAttribute', [x('FieldID', FIELD_SINAPI), x('Value', t.sinapi)]),
    t.leadTimeDays !== undefined && x('ExtendedAttribute', [x('FieldID', FIELD_LEAD_TIME), x('Value', t.leadTimeDays)]),
    // LB0 incompleta (só início ou só término, como o MS Project grava) é preservada com a(s) data(s) presente(s);
    // a duração só vai quando há as duas datas. Todos os filhos de <Baseline> são opcionais no esquema.
    (bStart || bFinish) &&
      x('Baseline', [
        x('Number', 0),
        x('Start', dt(bStart, startTime)),
        x('Finish', dt(bFinish, '17:00:00')),
        bStart && bFinish && x('Duration', toDuration(t.isSummary ? 0 : t.baselineDuracaoMin !== undefined ? minutosParaDias(t.baselineDuracaoMin) : duration)),
        bStart && bFinish && x('DurationFormat', 7),
        x('Cost', money(cost)),
      ]),
  ])!
}

/** XML de uma única tarefa (usado na prévia "antes x depois" do Módulo 1). */
export function buildTaskXml(task: Task, input: MspdiExportInput): string {
  const sorted = [...input.tasks].sort((a, b) => compareWbs(a.wbs, b.wbs))
  return render(taskNode(task, sorted.findIndex((t) => t.uid === task.uid) + 1, createContext(input)))
}

export function buildMspdiXml(input: MspdiExportInput): string {
  const { meta, tasks, calendarios, calendarioPadraoUid, schedule } = input
  const ctx = createContext(input)
  const now = new Date().toISOString().slice(0, 19)
  const sorted = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs))
  const resourceNames = [...new Set(tasks.flatMap((t) => t.resources.map((r) => r.resource)))]
  const totalBac = tasks.filter((t) => !t.isSummary).reduce((a, t) => a + t.bac, 0)
  const project: XNode = {
    tag: 'Project',
    attrs: { xmlns: MSPDI_NAMESPACE },
    children: [
      x('SaveVersion', 14),
      x('Name', `${meta.name}.xml`),
      x('Title', meta.name),
      x('Company', meta.company),
      x('Manager', meta.manager),
      x('Author', 'CronoAI'),
      x('CreationDate', now),
      x('LastSaved', now),
      x('ScheduleFromStart', 1),
      x('StartDate', dt(meta.startDate, '08:00:00')),
      x('FinishDate', dt(schedule.projectFinish, '17:00:00')),
      x('CriticalSlackLimit', 0),
      x('CurrencyDigits', 2),
      x('CurrencySymbol', 'R$'),
      x('CurrencyCode', 'BRL'),
      x('CurrencySymbolPosition', 2),
      x('CalendarUID', calendarioPadraoUid),
      x('DefaultStartTime', '08:00:00'),
      x('DefaultFinishTime', '17:00:00'),
      x('MinutesPerDay', DEFAULT_MINUTES_PER_DAY),
      x('MinutesPerWeek', DEFAULT_MINUTES_PER_DAY * 5),
      x('DaysPerMonth', 20),
      x('DefaultTaskType', 1),
      x('DurationFormat', 7),
      x('WorkFormat', 2),
      x('HonorConstraints', 0),
      x('MultipleCriticalPaths', 0),
      x('StatusDate', dt(meta.statusDate, '17:00:00')),
      x('CurrentDate', dt(meta.statusDate, '08:00:00')),
      x('ExtendedAttributes', [
        x('ExtendedAttribute', [x('FieldID', FIELD_SINAPI), x('FieldName', 'Text1'), x('Alias', 'Código SINAPI')]),
        x('ExtendedAttribute', [x('FieldID', FIELD_LEAD_TIME), x('FieldName', 'Number1'), x('Alias', 'Lead Time Insumo (dias)')]),
      ]),
      x('Calendars', calendarios.map(calendarNode)),
      x('Tasks', [
        x('Task', [
          x('UID', 0), x('ID', 0), x('Name', meta.name), x('Type', 1), x('IsNull', 0), x('WBS', 0), x('OutlineNumber', 0),
          x('OutlineLevel', 0), x('Start', dt(schedule.projectStart, '08:00:00')), x('Finish', dt(schedule.projectFinish, '17:00:00')),
          x('Summary', 1), x('Cost', money(totalBac)),
        ]),
        ...sorted.map((t, i) => taskNode(t, i + 1, ctx)),
      ]),
      x('Resources', resourceNames.map((name, i) =>
        x('Resource', [
          x('UID', i + 1), x('ID', i + 1), x('Name', name), x('Type', 1), x('IsNull', 0),
          x('Initials', name.slice(0, 3).toUpperCase()), x('Group', 'Mão de obra'), x('MaxUnits', '30.00'),
          // Taxa zero: o custo do pacote já está no Custo Fixo da tarefa (evita contagem dupla no MS Project)
          x('StandardRate', 0), x('StandardRateFormat', 2), x('OvertimeRate', 0), x('OvertimeRateFormat', 2),
        ]),
      )),
      x('Assignments', (() => {
        let uid = 1
        return sorted
          .filter((t) => !t.isSummary)
          .flatMap((t) =>
            t.resources.map((r) =>
              x('Assignment', [
                x('UID', uid++), x('TaskUID', t.uid), x('ResourceUID', resourceNames.indexOf(r.resource) + 1),
                x('PercentWorkComplete', Math.round(t.percentComplete)), x('Units', r.units.toFixed(2)),
              ]),
            ),
          )
      })()),
    ],
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${render(project)}`
}

// ---------------------------------------------------------------------------
// Validação estrutural
// ---------------------------------------------------------------------------

export interface MspdiValidation {
  valid: boolean
  errors: string[]
  warnings: string[]
  taskCount: number
  linkCount: number
}

const kids = (parent: Element | null | undefined, name: string): Element[] =>
  parent ? Array.from(parent.children).filter((c) => c.localName === name) : []
const kid = (parent: Element | null | undefined, name: string): Element | undefined => kids(parent, name)[0]
const text = (parent: Element | null | undefined, name: string): string | undefined => kid(parent, name)?.textContent?.trim() || undefined
const num = (parent: Element | null | undefined, name: string): number | undefined => {
  const v = text(parent, name)
  return v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v)
}
const isoDate = (v: string | undefined) => (v ? v.slice(0, 10) : undefined)
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/
const DURATION = /^-?P(\d+(\.\d+)?D)?(T(\d+(\.\d+)?H)?(\d+(\.\d+)?M)?(\d+(\.\d+)?S)?)?$/

const ERRO_DOCTYPE = 'Arquivo XML com declaração DOCTYPE/ENTITY não é aceito (o MS Project não gera esse conteúdo).'

function parseXml(xml: string): Document {
  // Recusa antes do DOMParser: o tratamento de entidade varia entre motores e abre XXE / "billion laughs".
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error(ERRO_DOCTYPE)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Arquivo XML inválido ou corrompido (não está bem formado).')
  return doc
}

function checkOrder(el: Element, order: readonly string[], label: string, errors: string[]) {
  let last = -1
  let lastName = ''
  for (const c of Array.from(el.children)) {
    const pos = order.indexOf(c.localName)
    if (pos < 0) continue
    if (pos < last) {
      errors.push(`${label}: <${c.localName}> aparece depois de <${lastName}>, fora da ordem do esquema MSPDI.`)
      return
    }
    last = pos
    lastName = c.localName
  }
}

/**
 * Confere bem-formação, raiz/namespace, UIDs, vínculos, formatos de data/duração e
 * (com `strictOrder`) a ordem dos elementos conforme as sequências do esquema MSPDI.
 */
export function validateMspdi(xml: string, options: { strictOrder?: boolean } = {}): MspdiValidation {
  const errors: string[] = []
  const warnings: string[] = []
  let doc: Document
  try {
    doc = parseXml(xml)
  } catch (e) {
    return { valid: false, errors: [(e as Error).message], warnings, taskCount: 0, linkCount: 0 }
  }
  const project = doc.documentElement
  if (project.localName !== 'Project') errors.push('Raiz <Project> ausente.')
  if (project.namespaceURI !== MSPDI_NAMESPACE) warnings.push(`Namespace diferente de ${MSPDI_NAMESPACE}.`)
  const tasksEl = kid(project, 'Tasks')
  if (!tasksEl) errors.push('Elemento <Tasks> ausente.')
  if (options.strictOrder) {
    checkOrder(project, SCHEMA_ORDER.Project, 'Project', errors)
    for (const c of kids(kid(project, 'Calendars'), 'Calendar')) {
      checkOrder(c, SCHEMA_ORDER.Calendar, 'Calendar', errors)
      for (const wd of kids(kid(c, 'WeekDays'), 'WeekDay')) checkOrder(wd, SCHEMA_ORDER.WeekDay, 'WeekDay', errors)
    }
    for (const r of kids(kid(project, 'Resources'), 'Resource')) checkOrder(r, SCHEMA_ORDER.Resource, `Resource ${text(r, 'UID')}`, errors)
    for (const a of kids(kid(project, 'Assignments'), 'Assignment')) checkOrder(a, SCHEMA_ORDER.Assignment, `Assignment ${text(a, 'UID')}`, errors)
    for (const ea of kids(kid(project, 'ExtendedAttributes'), 'ExtendedAttribute')) checkOrder(ea, SCHEMA_ORDER.ExtendedAttributeDef, 'ExtendedAttribute', errors)
  }

  const tasks = kids(tasksEl, 'Task')
  const uids = new Set<number>()
  let linkCount = 0
  for (const t of tasks) {
    const uid = num(t, 'UID')
    const label = `Tarefa UID ${uid ?? '?'}`
    if (uid === undefined) {
      errors.push('Tarefa sem <UID>.')
      continue
    }
    if (uids.has(uid)) errors.push(`${label}: UID duplicado.`)
    uids.add(uid)
    if (options.strictOrder) {
      checkOrder(t, SCHEMA_ORDER.Task, label, errors)
      for (const l of kids(t, 'PredecessorLink')) checkOrder(l, SCHEMA_ORDER.PredecessorLink, `${label} › PredecessorLink`, errors)
      for (const b of kids(t, 'Baseline')) checkOrder(b, SCHEMA_ORDER.Baseline, `${label} › Baseline`, errors)
    }
    for (const f of ['Start', 'Finish', 'ActualStart', 'ActualFinish', 'ConstraintDate']) {
      const v = text(t, f)
      if (v && !DATE_TIME.test(v)) errors.push(`${label}: <${f}> fora do formato yyyy-mm-ddThh:mm:ss.`)
    }
    for (const f of ['Duration', 'ActualDuration', 'RemainingDuration']) {
      const v = text(t, f)
      if (v && !DURATION.test(v)) errors.push(`${label}: <${f}> fora do formato de duração ISO 8601 (PT…H…M…S).`)
    }
    const pct = num(t, 'PercentComplete')
    if (pct !== undefined && (pct < 0 || pct > 100)) errors.push(`${label}: <PercentComplete> fora de 0–100.`)
    const start = text(t, 'Start')
    const finish = text(t, 'Finish')
    if (start && finish && finish < start) errors.push(`${label}: <Finish> anterior a <Start>.`)
    linkCount += kids(t, 'PredecessorLink').length
  }
  for (const t of tasks) {
    const uid = num(t, 'UID')
    for (const l of kids(t, 'PredecessorLink')) {
      const pred = num(l, 'PredecessorUID')
      const type = text(l, 'Type') ?? '1'
      if (pred === undefined || !uids.has(pred)) errors.push(`Tarefa UID ${uid}: predecessora ${pred ?? '?'} não existe.`)
      if (pred === uid) errors.push(`Tarefa UID ${uid}: vínculo com ela mesma.`)
      // Só número do arquivo na mensagem: texto livre do XML não vai para o aviso
      if (!linkTypeOf(type)) errors.push(`Tarefa UID ${uid}: tipo de vínculo ${/^\d{1,6}$/.test(type) ? type : '(não numérico)'} inválido (0–3).`)
    }
  }
  return { valid: errors.length === 0, errors, warnings, taskCount: tasks.length, linkCount }
}

// ---------------------------------------------------------------------------
// Importação: MSPDI -> estado da store
// ---------------------------------------------------------------------------

export interface MspdiImportResult {
  meta: Partial<ProjectMeta>
  tasks: Task[]
  calendarios: CalendarioObra[]
  calendarioPadraoUid: number
  warnings: string[]
}

/** Restrição "Não iniciar antes de" a partir da data do arquivo (E1: só SNET). */
const snetDe = (data: string | undefined): Task['restricao'] => (data ? { tipo: 'SNET', data } : undefined)

export function parseMspdiXml(xmlText: string): MspdiImportResult {
  if (xmlText.length > MAX_MSPDI_CHARS) throw new Error('Arquivo muito grande: o limite para importação é de 15 MB.')
  const doc = parseXml(xmlText)
  const project = doc.documentElement
  if (project.localName !== 'Project') throw new Error('O arquivo não é um XML do MS Project (MSPDI): raiz <Project> ausente.')

  const check = validateMspdi(xmlText)
  const blocking = check.errors.filter((e) => /UID duplicado|<Tasks> ausente|sem <UID>/.test(e))
  if (blocking.length) throw new Error(blocking[0])
  const warnings: string[] = check.errors.slice(0, 5).map((e) => `Ignorado: ${e}`)

  const minutesPerDay = num(project, 'MinutesPerDay') || DEFAULT_MINUTES_PER_DAY
  if (minutesPerDay !== DEFAULT_MINUTES_PER_DAY) {
    warnings.push(`Projeto com ${minutesPerDay / 60} h/dia: durações convertidas para dias úteis do calendário do arquivo.`)
  }
  const meta: Partial<ProjectMeta> = {
    name: text(project, 'Title') ?? text(project, 'Name')?.replace(/\.xml$/i, ''),
    company: text(project, 'Company'),
    manager: text(project, 'Manager') ?? text(project, 'Author'),
    startDate: isoDate(text(project, 'StartDate')),
    statusDate: isoDate(text(project, 'StatusDate')),
  }

  // Campos personalizados: SINAPI e lead time pelo FieldID padrão ou pelo apelido
  let sinapiField = FIELD_SINAPI
  let leadField = FIELD_LEAD_TIME
  let sinapiAlias = false
  let leadAlias = false
  for (const ea of kids(kid(project, 'ExtendedAttributes'), 'ExtendedAttribute')) {
    const alias = normalizeText(text(ea, 'Alias') ?? '')
    const id = text(ea, 'FieldID')
    if (id && alias.includes('sinapi')) {
      sinapiField = id
      sinapiAlias = true
    }
    if (id && alias.includes('lead')) {
      leadField = id
      leadAlias = true
    }
  }

  // Calendário do projeto: exceções legadas (WeekDay DayType=0) e <Exceptions> (Project 2007+)
  const calUid = text(project, 'CalendarUID') ?? '1'
  const calendars = kids(kid(project, 'Calendars'), 'Calendar')
  const cal = calendars.find((c) => text(c, 'UID') === calUid) ?? calendars[0]
  const projectCalUid = text(cal, 'UID') // calendário realmente usado (o CalendarUID do projeto pode não existir)
  const holidays = new Set<string>()
  const extra = new Set<string>()
  let truncatedRanges = 0
  let invalidRanges = 0
  let overLimit = false
  let walked = 0 // dias percorridos no calendário inteiro (orçamento MAX_CALENDAR_DAYS)
  const seenRanges = new Set<string>() // a mesma exceção aparece no legado e em <Exceptions>: expande e conta uma vez
  const collect = (node: Element, working: boolean) => {
    if (overLimit) return
    const p = kid(node, 'TimePeriod')
    const from = isoDate(text(p, 'FromDate'))
    const to = isoDate(text(p, 'ToDate'))
    if (!from || !to) return
    const key = `${working ? 1 : 0}|${from}|${to}`
    if (seenRanges.has(key)) return // dedupe antes de validar: a data inválida presente no legado e em <Exceptions> conta uma vez
    seenRanges.add(key)
    if (!isValidIsoDate(from) || !isValidIsoDate(to)) {
      invalidRanges++
      return
    }
    const target = working ? extra : holidays
    let cursor = from
    let days = 0
    while (cursor <= to) {
      if (days >= MAX_EXCEPTION_DAYS) {
        truncatedRanges++
        break
      }
      if (walked >= MAX_CALENDAR_DAYS) {
        overLimit = true
        break
      }
      target.add(cursor)
      walked++
      days++
      cursor = addCalendarDays(cursor, 1)
    }
  }
  // O MS Project 2007–2016 (corpus; 2019 a confirmar) grava cada exceção em dois lugares: <Exceptions> (com a regra de recorrência)
  // e os WeekDay DayType=0 legados, já expandidos ocorrência por ocorrência. Expandir FromDate..ToDate de uma recorrente marcaria o
  // intervalo inteiro; as datas certas estão na lista legada. A recorrente só é considerada aplicada se a lista legada (do mesmo tipo,
  // feriado ou dia útil extra) tem ao menos `Occurrences` datas distintas dentro de FromDate..ToDate dela; senão vira aviso. (Exigir o FromDate exato dava
  // falso aviso em 14 das 27 recorrentes do corpus: o FromDate nem sempre é uma ocorrência.) A expansão pela regra fica para a SPEC-05.
  const legacyDays = kids(kid(cal, 'WeekDays'), 'WeekDay').filter((wd) => text(wd, 'DayType') === '0')
  for (const wd of legacyDays) collect(wd, text(wd, 'DayWorking') === '1')
  const legacyHolidays = [...holidays].sort()
  const legacyExtra = [...extra].sort()
  // Busca binária: primeiro índice com data >= alvo; a contagem em [from, to] é a diferença entre dois deles
  const lowerBound = (sorted: string[], target: string) => {
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < target) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const countWithin = (sorted: string[], from: string, to: string) => {
    const end = lowerBound(sorted, to)
    return (end < sorted.length && sorted[end] === to ? end + 1 : end) - lowerBound(sorted, from)
  }
  let recurringNotApplied = 0
  for (const ex of kids(kid(cal, 'Exceptions'), 'Exception')) {
    if ((num(ex, 'Occurrences') ?? 1) > 1) {
      const period = kid(ex, 'TimePeriod')
      const first = isoDate(text(period, 'FromDate'))
      const last = isoDate(text(period, 'ToDate'))
      // Condição necessária: ao menos `Occurrences` datas legadas distintas do mesmo tipo dentro do período
      const inLegacy =
        first !== undefined && last !== undefined && isValidIsoDate(first) && isValidIsoDate(last) &&
        countWithin(text(ex, 'DayWorking') === '1' ? legacyExtra : legacyHolidays, first, last) >= (num(ex, 'Occurrences') ?? 1)
      if (!inLegacy) recurringNotApplied++
      continue
    }
    collect(ex, text(ex, 'DayWorking') === '1')
  }
  if (recurringNotApplied) warnings.push(`${recurringNotApplied} exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.`)
  if (invalidRanges) warnings.push(`${invalidRanges} exceção(ões) do calendário com data inválida ignorada(s).`)
  // Semana do calendário: o CronoAI só usa segunda a sexta (DayType 1 = domingo … 7 = sábado)
  const weekDiffs = kids(kid(cal, 'WeekDays'), 'WeekDay').filter((wd) => {
    const day = Number(text(wd, 'DayType'))
    const working = text(wd, 'DayWorking')
    return day >= 1 && day <= 7 && working !== undefined && (working === '1') !== (day >= 2 && day <= 6)
  }).length
  if (weekDiffs) warnings.push(`Calendário do projeto com ${weekDiffs} dia(s) da semana diferente(s) de segunda a sexta: o CronoAI usa só segunda a sexta; confira os dias úteis.`)
  if (truncatedRanges) warnings.push(`${truncatedRanges} exceção(ões) do calendário com mais de ${MAX_EXCEPTION_DAYS} dias: lidas apenas nos primeiros ${MAX_EXCEPTION_DAYS} dias.`)
  if (overLimit) warnings.push(`Calendário com mais de ${MAX_CALENDAR_DAYS} dias de exceção: o excedente não foi importado; confira feriados e dias úteis extras.`)

  // Recursos e atribuições
  const resources = new Map<string, string>()
  for (const r of kids(kid(project, 'Resources'), 'Resource')) {
    const id = text(r, 'UID')
    const name = text(r, 'Name')
    if (id && name && id !== '0') resources.set(id, name)
  }
  const assignments = new Map<number, { resource: string; units: number }[]>()
  for (const a of kids(kid(project, 'Assignments'), 'Assignment')) {
    const taskUid = num(a, 'TaskUID')
    const resName = resources.get(text(a, 'ResourceUID') ?? '')
    if (taskUid === undefined || !resName) continue
    if (!assignments.has(taskUid)) assignments.set(taskUid, [])
    assignments.get(taskUid)!.push({ resource: resName, units: Math.round((num(a, 'Units') ?? 1) * 100) / 100 })
  }

  let inactive = 0
  let percentLags = 0
  let lagOtherFormat = 0
  // Contadores dos avisos "o que o import não trouxe" (só números no texto: conteúdo do arquivo nunca vai para o aviso)
  let nullRows = 0
  let ownCalendar = 0
  let otherBaselines = 0
  let baselineNoFinish = 0
  let baselineNoStart = 0
  let elapsedDurations = 0
  let milestoneFromShort = 0
  let fractionalDurations = 0
  let sinapiNoAlias = 0
  let leadNoAlias = 0
  let customValues = 0
  const customFields = new Set<string>()
  const tasks: Task[] = []
  for (const node of kids(kid(project, 'Tasks'), 'Task')) {
    const uid = num(node, 'UID')
    const level = num(node, 'OutlineLevel') ?? 1
    if (uid === undefined || uid === 0) continue
    // Linha em branco (tarefa nula): o MS Project a grava com UID e OutlineLevel 0; é descartada, mas com aviso
    if (text(node, 'IsNull') === '1') {
      nullRows++
      continue
    }
    if (level === 0) continue
    if (text(node, 'Active') === '0') {
      inactive++
      continue
    }
    const name = text(node, 'Name') ?? `Tarefa ${uid}`
    const isSummary = text(node, 'Summary') === '1'
    const baseline = kids(node, 'Baseline').find((b) => (text(b, 'Number') ?? '0') === '0')
    const extNodes = kids(node, 'ExtendedAttribute')
    const ext = new Map(extNodes.map((e) => [text(e, 'FieldID') ?? '', text(e, 'Value') ?? '']))
    for (const e of extNodes) {
      const id = text(e, 'FieldID') ?? ''
      if (id === sinapiField || id === leadField) continue
      customValues++
      customFields.add(id)
    }
    if (kids(node, 'Baseline').some((b) => (text(b, 'Number') ?? '0') !== '0')) otherBaselines++
    const taskCal = text(node, 'CalendarUID')
    if (taskCal !== undefined && taskCal !== '-1' && taskCal !== projectCalUid) ownCalendar++
    const preds = kids(node, 'PredecessorLink')
      .map((l) => {
        let lagDays = lagToWorkingDays(num(l, 'LinkLag') ?? 0, num(l, 'LagFormat') ?? 7, minutesPerDay)
        if (lagDays === undefined) {
          percentLags++
          lagDays = 0
        } else if ((num(l, 'LinkLag') ?? 0) !== 0 && ![7, 39].includes(num(l, 'LagFormat') ?? 7)) lagOtherFormat++ // o export regrava em dias úteis (LagFormat 7)
        const lag: Lag = { tipo: 'util', minutos: diasParaMinutos(lagDays) }
        return { uid: num(l, 'PredecessorUID') ?? -1, type: linkTypeOf(text(l, 'Type') ?? '1') ?? 'FS', lag }
      })
      .filter((p) => p.uid > 0 && p.uid !== uid)
    const pct = Math.min(100, Math.max(0, num(node, 'PercentComplete') ?? 0))
    const start = isoDate(text(node, 'Start'))
    const cost = num(node, 'Cost') ?? 0
    const fixed = num(node, 'FixedCost') ?? 0
    const baselineCost = num(baseline, 'Cost') ?? 0
    const lead = ext.get(leadField)
    const durationDays = isSummary ? 0 : Math.round(fromDuration(text(node, 'Duration'), minutesPerDay))
    if (!isSummary) {
      // Só aviso: converter tempo corrido e fração de dia é semântica da SPEC-05 (o valor importado não muda)
      const rawMinutes = durationMinutes(text(node, 'Duration'), minutesPerDay) ?? 0
      if (rawMinutes > 0 && ELAPSED_FORMATS.has(text(node, 'DurationFormat') ?? '')) elapsedDurations++
      if (rawMinutes > 0 && durationDays === 0) milestoneFromShort++
      else if (durationDays > 0 && fromDuration(text(node, 'Duration'), minutesPerDay) !== durationDays) fractionalDurations++
    }
    if (ext.get(sinapiField) && !sinapiAlias) sinapiNoAlias++
    if (lead !== undefined && lead !== '' && !Number.isNaN(Number(lead)) && !leadAlias) leadNoAlias++
    const baselineStart = isoDate(text(baseline, 'Start'))
    const baselineFinish = isoDate(text(baseline, 'Finish'))
    if (!isSummary && baseline && baselineStart && !baselineFinish) baselineNoFinish++
    if (!isSummary && baseline && !baselineStart && baselineFinish) baselineNoStart++

    tasks.push({
      uid,
      wbs: text(node, 'WBS') ?? text(node, 'OutlineNumber') ?? String(uid),
      name,
      outlineLevel: level,
      isSummary,
      duracaoMin: diasParaMinutos(durationDays),
      predecessors: preds,
      percentComplete: isSummary ? 0 : pct,
      actualStart: pct > 0 ? (isoDate(text(node, 'ActualStart')) ?? start) : undefined,
      actualFinish: pct >= 100 ? (isoDate(text(node, 'ActualFinish')) ?? isoDate(text(node, 'Finish'))) : undefined,
      bac: isSummary ? 0 : baselineCost || cost || fixed,
      actualCost: isSummary ? 0 : (num(node, 'ActualCost') ?? 0),
      resources: assignments.get(uid) ?? [],
      sinapi: ext.get(sinapiField) || undefined,
      leadTimeDays: lead !== undefined && lead !== '' && !Number.isNaN(Number(lead)) ? Number(lead) : undefined,
      baselineStart,
      baselineFinish,
      baselineDuracaoMin: baseline ? diasParaMinutos(Math.round(fromDuration(text(baseline, 'Duration'), minutesPerDay))) : undefined,
      restricao: snetDe(
        text(node, 'ConstraintType') === '4'
          ? isoDate(text(node, 'ConstraintDate'))
          : !isSummary && preds.length === 0 && pct === 0
            ? start // sem vínculos: preserva a data do arquivo
            : undefined,
      ),
      floors: parseFloorRange(name),
      notes: text(node, 'Notes'),
    })
  }

  if (!tasks.length) throw new Error('Nenhuma tarefa encontrada no XML.')
  if (inactive) warnings.push(`${inactive} tarefa(s) inativa(s) ignorada(s).`)
  if (percentLags) warnings.push(`${percentLags} vínculo(s) com latência em % ou formato desconhecido importados com latência zero.`)
  if (lagOtherFormat) warnings.push(`${lagOtherFormat} vínculo(s) com lag em formato diferente de dias úteis: serão exportados em dias úteis.`)
  if (otherBaselines) warnings.push(`Linhas de base 1 a 10 não importadas em ${otherBaselines} tarefa(s): o CronoAI usa só a linha de base 0.`)
  // Sem término ou sem início, evm.ts devolve PV zero: a store mantém a LB0 incompleta do arquivo (withBaseline onlyMissing, CR-12).
  if (baselineNoFinish) warnings.push(`${baselineNoFinish} tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.`)
  if (baselineNoStart) warnings.push(`${baselineNoStart} tarefa(s) com linha de base 0 sem início: o término do arquivo é mantido e o valor planejado (PV) delas fica zero.`)
  if (elapsedDurations) warnings.push(`${elapsedDurations} tarefa(s) com duração em tempo corrido convertida como horas úteis: revise as durações.`)
  if (milestoneFromShort) warnings.push(`${milestoneFromShort} tarefa(s) com menos de meio dia de duração importada(s) como marco (0 dia).`)
  if (fractionalDurations) warnings.push(`${fractionalDurations} duração(ões) fracionária(s) arredondada(s) para dias úteis inteiros.`)
  if (sinapiNoAlias) warnings.push(`Text1 lido como código SINAPI em ${sinapiNoAlias} tarefa(s) sem apelido 'SINAPI' no arquivo: confira.`)
  if (leadNoAlias) warnings.push(`Number1 lido como lead time em ${leadNoAlias} tarefa(s) sem apelido 'lead' no arquivo: confira.`)
  if (ownCalendar) warnings.push(`${ownCalendar} tarefa(s) com calendário próprio importada(s) no calendário do projeto.`)
  if (nullRows) warnings.push(`${nullRows} linha(s) em branco (tarefa nula) ignorada(s).`)
  // Informativo (um aviso só, para não virar toast demais): dados que o CronoAI ainda não tem onde guardar
  const timephased = doc.getElementsByTagNameNS('*', 'TimephasedData').length
  const notImported = [
    timephased && `${timephased} registro(s) distribuído(s) no tempo (TimephasedData)`,
    customValues && `${customValues} valor(es) de ${customFields.size} campo(s) personalizado(s)`,
  ].filter(Boolean)
  if (notImported.length) warnings.push(`Não importado do MS Project: ${notImported.join('; ')}.`)
  if (tasks.filter((t) => !t.isSummary).every((t) => t.bac === 0)) {
    warnings.push('O arquivo não traz custos (Cost/Baseline Cost): os indicadores EVM ficarão zerados até que o BAC seja informado.')
  }
  if (!meta.statusDate) warnings.push('Data de status ausente no XML; mantida a data de status atual do CronoAI.')
  if (!holidays.size) warnings.push('Calendário sem feriados no XML; aplicados os feriados nacionais brasileiros.')

  const years = tasks.map((t) => Number((t.baselineStart ?? meta.startDate ?? '2026').slice(0, 4))).filter((y) => y > 1990)
  const fromYear = Math.min(...years, new Date().getFullYear())
  return {
    meta,
    tasks,
    calendarios: [calendarioPadrao(holidays.size ? [...holidays].sort() : defaultHolidays(fromYear, fromYear + 4), [...extra].sort())],
    calendarioPadraoUid: UID_CALENDARIO_PADRAO,
    warnings,
  }
}
