// Conversor MS Project Data Interchange (MSPDI): estado da store <-> arquivo .xml do MS Project.
// Referência do esquema: https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference
// A ordem dos elementos segue as sequências (xs:sequence) do esquema MSPDI; o validador abaixo confere essa ordem.
import type { LinkType, ProjectMeta, ScheduleResult, Task, WorkCalendarConfig } from '@/types/domain'
import { WorkCalendar, addCalendarDays, defaultHolidays } from './calendar'
import { compareWbs, normalizeText, parseFloorRange, rollupSummaries, type SummaryRollup } from './wbs'

export const MSPDI_NAMESPACE = 'http://schemas.microsoft.com/project'
/** Text1 e Number1 de tarefa no MS Project. */
export const FIELD_SINAPI = '188743731'
export const FIELD_LEAD_TIME = '188743767'
const DEFAULT_MINUTES_PER_DAY = 480

const LINK_TO_CODE: Record<LinkType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 }
const CODE_TO_LINK: Record<string, LinkType> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' }

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

/** PT80H0M0S / P2DT4H -> dias úteis, considerando os minutos por dia do projeto. */
export function fromDuration(value: string | undefined, minutesPerDay = DEFAULT_MINUTES_PER_DAY): number {
  if (!value) return 0
  const m = value.match(/^-?P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (!m) return 0
  const [, d, h, min, sec] = m.map((v) => (v ? Number(v) : 0)) as number[]
  const minutes = d * minutesPerDay + h * 60 + min + sec / 60
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
  calendar: WorkCalendarConfig
  schedule: ScheduleResult
}

interface TaskContext {
  schedule: ScheduleResult
  rollups: Map<number, SummaryRollup>
  cal: WorkCalendar
}

function createContext(input: MspdiExportInput): TaskContext {
  return {
    schedule: input.schedule,
    rollups: rollupSummaries(input.tasks, input.schedule),
    cal: new WorkCalendar(input.meta.startDate, input.calendar),
  }
}

function taskNode(t: Task, id: number, ctx: TaskContext): XNode {
  const s = ctx.schedule.byUid.get(t.uid)
  const r = ctx.rollups.get(t.uid)
  const start = t.isSummary ? r?.start : s?.start
  const finish = t.isSummary ? r?.finish : s?.finish
  const duration = t.isSummary
    ? start && finish ? ctx.cal.countWorkingBetween(start, addCalendarDays(finish, 1)) : 0
    : t.durationDays
  const milestone = !t.isSummary && duration === 0
  const pct = Math.round(t.isSummary ? (r?.percentComplete ?? 0) : t.percentComplete)
  const cost = t.isSummary ? (r?.bac ?? 0) : t.bac
  const actualCost = t.isSummary ? (r?.actualCost ?? 0) : t.actualCost
  const critical = t.isSummary ? !!r?.critical : !!s?.critical
  const startTime = milestone ? '17:00:00' : '08:00:00'
  const slackUnits = (days: number) => Math.round(days * DEFAULT_MINUTES_PER_DAY * 10)
  const leaf = !t.isSummary
  const lateFinishIdx = s ? Math.max(s.ls, s.lf - 1) : 0
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
    leaf && s && x('EarlyStart', dt(ctx.cal.dateAt(s.es), startTime)),
    leaf && s && x('EarlyFinish', dt(milestone ? finish : ctx.cal.dateAt(Math.max(s.es, s.ef - 1)), '17:00:00')),
    leaf && s && x('LateStart', dt(ctx.cal.dateAt(s.ls), startTime)),
    leaf && s && x('LateFinish', dt(milestone ? ctx.cal.dateAt(Math.max(0, s.lf - 1)) : ctx.cal.dateAt(lateFinishIdx), '17:00:00')),
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
    x('ConstraintType', t.snet ? 4 : 0), // 4 = Não iniciar antes de
    t.snet && x('ConstraintDate', dt(t.snet, '08:00:00')),
    x('Notes', t.notes),
    ...t.predecessors.map((p) =>
      x('PredecessorLink', [
        x('PredecessorUID', p.uid),
        x('Type', LINK_TO_CODE[p.type]),
        x('CrossProject', 0),
        x('LinkLag', Math.round(p.lagDays * DEFAULT_MINUTES_PER_DAY * 10)),
        x('LagFormat', 7),
      ]),
    ),
    t.sinapi && x('ExtendedAttribute', [x('FieldID', FIELD_SINAPI), x('Value', t.sinapi)]),
    t.leadTimeDays !== undefined && x('ExtendedAttribute', [x('FieldID', FIELD_LEAD_TIME), x('Value', t.leadTimeDays)]),
    bStart &&
      bFinish &&
      x('Baseline', [
        x('Number', 0),
        x('Start', dt(bStart, startTime)),
        x('Finish', dt(bFinish, '17:00:00')),
        x('Duration', toDuration(t.isSummary ? 0 : (t.baselineDuration ?? duration))),
        x('DurationFormat', 7),
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
  const { meta, tasks, calendar, schedule } = input
  const ctx = createContext(input)
  const now = new Date().toISOString().slice(0, 19)
  const sorted = [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs))
  const resourceNames = [...new Set(tasks.flatMap((t) => t.resources.map((r) => r.resource)))]
  const totalBac = tasks.filter((t) => !t.isSummary).reduce((a, t) => a + t.bac, 0)
  const workingTimes = x('WorkingTimes', [
    x('WorkingTime', [x('FromTime', '08:00:00'), x('ToTime', '12:00:00')]),
    x('WorkingTime', [x('FromTime', '13:00:00'), x('ToTime', '17:00:00')]),
  ])
  const period = (d: string) => x('TimePeriod', [x('FromDate', `${d}T00:00:00`), x('ToDate', `${d}T23:59:00`)])

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
      x('CalendarUID', 1),
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
      x('Calendars', [
        x('Calendar', [
          x('UID', 1),
          x('Name', 'Padrão Obra (seg-sex, 8h)'),
          x('IsBaseCalendar', 1),
          x('BaseCalendarUID', -1),
          x('WeekDays', [
            ...[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const working = day >= 2 && day <= 6
              return x('WeekDay', [x('DayType', day), x('DayWorking', working), working && workingTimes])
            }),
            ...calendar.holidays.map((h) => x('WeekDay', [x('DayType', 0), x('DayWorking', 0), period(h)])),
            ...calendar.extraWorkingDays.map((d) => x('WeekDay', [x('DayType', 0), x('DayWorking', 1), period(d), workingTimes])),
          ]),
        ]),
      ]),
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

function parseXml(xml: string): Document {
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
      if (!(type in CODE_TO_LINK)) errors.push(`Tarefa UID ${uid}: tipo de vínculo ${type} inválido (0–3).`)
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
  calendar: WorkCalendarConfig
  warnings: string[]
}

function expandRange(from: string, to: string): string[] {
  const out: string[] = []
  let cursor = from
  for (let guard = 0; cursor <= to && guard < 400; guard++) {
    out.push(cursor)
    cursor = addCalendarDays(cursor, 1)
  }
  return out
}

export function parseMspdiXml(xmlText: string): MspdiImportResult {
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
  for (const ea of kids(kid(project, 'ExtendedAttributes'), 'ExtendedAttribute')) {
    const alias = normalizeText(text(ea, 'Alias') ?? '')
    const id = text(ea, 'FieldID')
    if (id && alias.includes('sinapi')) sinapiField = id
    if (id && alias.includes('lead')) leadField = id
  }

  // Calendário do projeto: exceções legadas (WeekDay DayType=0) e <Exceptions> (Project 2007+)
  const calUid = text(project, 'CalendarUID') ?? '1'
  const calendars = kids(kid(project, 'Calendars'), 'Calendar')
  const cal = calendars.find((c) => text(c, 'UID') === calUid) ?? calendars[0]
  const holidays = new Set<string>()
  const extra = new Set<string>()
  let recurring = 0
  const collect = (node: Element, working: boolean) => {
    const p = kid(node, 'TimePeriod')
    const from = isoDate(text(p, 'FromDate'))
    const to = isoDate(text(p, 'ToDate'))
    if ((num(node, 'Occurrences') ?? 1) > 1) recurring++
    if (from && to) for (const d of expandRange(from, to)) (working ? extra : holidays).add(d)
  }
  for (const wd of kids(kid(cal, 'WeekDays'), 'WeekDay')) if (text(wd, 'DayType') === '0') collect(wd, text(wd, 'DayWorking') === '1')
  for (const ex of kids(kid(cal, 'Exceptions'), 'Exception')) collect(ex, text(ex, 'DayWorking') === '1')
  if (recurring) warnings.push(`${recurring} exceção(ões) recorrente(s) do calendário lidas apenas pelo período informado (sem expandir as repetições).`)

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
  const tasks: Task[] = []
  for (const node of kids(kid(project, 'Tasks'), 'Task')) {
    const uid = num(node, 'UID')
    const level = num(node, 'OutlineLevel') ?? 1
    if (uid === undefined || uid === 0 || level === 0 || text(node, 'IsNull') === '1') continue
    if (text(node, 'Active') === '0') {
      inactive++
      continue
    }
    const name = text(node, 'Name') ?? `Tarefa ${uid}`
    const isSummary = text(node, 'Summary') === '1'
    const baseline = kids(node, 'Baseline').find((b) => (text(b, 'Number') ?? '0') === '0')
    const ext = new Map(kids(node, 'ExtendedAttribute').map((e) => [text(e, 'FieldID') ?? '', text(e, 'Value') ?? '']))
    const preds = kids(node, 'PredecessorLink')
      .map((l) => {
        let lagDays = lagToWorkingDays(num(l, 'LinkLag') ?? 0, num(l, 'LagFormat') ?? 7, minutesPerDay)
        if (lagDays === undefined) {
          percentLags++
          lagDays = 0
        }
        return { uid: num(l, 'PredecessorUID') ?? -1, type: CODE_TO_LINK[text(l, 'Type') ?? '1'] ?? 'FS', lagDays }
      })
      .filter((p) => p.uid > 0 && p.uid !== uid)
    const pct = Math.min(100, Math.max(0, num(node, 'PercentComplete') ?? 0))
    const start = isoDate(text(node, 'Start'))
    const cost = num(node, 'Cost') ?? 0
    const fixed = num(node, 'FixedCost') ?? 0
    const baselineCost = num(baseline, 'Cost') ?? 0
    const lead = ext.get(leadField)

    tasks.push({
      uid,
      wbs: text(node, 'WBS') ?? text(node, 'OutlineNumber') ?? String(uid),
      name,
      outlineLevel: level,
      isSummary,
      durationDays: isSummary ? 0 : Math.round(fromDuration(text(node, 'Duration'), minutesPerDay)),
      predecessors: preds,
      percentComplete: isSummary ? 0 : pct,
      actualStart: pct > 0 ? (isoDate(text(node, 'ActualStart')) ?? start) : undefined,
      actualFinish: pct >= 100 ? (isoDate(text(node, 'ActualFinish')) ?? isoDate(text(node, 'Finish'))) : undefined,
      bac: isSummary ? 0 : baselineCost || cost || fixed,
      actualCost: isSummary ? 0 : (num(node, 'ActualCost') ?? 0),
      resources: assignments.get(uid) ?? [],
      sinapi: ext.get(sinapiField) || undefined,
      leadTimeDays: lead !== undefined && lead !== '' && !Number.isNaN(Number(lead)) ? Number(lead) : undefined,
      baselineStart: isoDate(text(baseline, 'Start')),
      baselineFinish: isoDate(text(baseline, 'Finish')),
      baselineDuration: baseline ? Math.round(fromDuration(text(baseline, 'Duration'), minutesPerDay)) : undefined,
      snet:
        text(node, 'ConstraintType') === '4'
          ? isoDate(text(node, 'ConstraintDate'))
          : !isSummary && preds.length === 0 && pct === 0
            ? start // sem vínculos: preserva a data do arquivo
            : undefined,
      floors: parseFloorRange(name),
      notes: text(node, 'Notes'),
    })
  }

  if (!tasks.length) throw new Error('Nenhuma tarefa encontrada no XML.')
  if (inactive) warnings.push(`${inactive} tarefa(s) inativa(s) ignorada(s).`)
  if (percentLags) warnings.push(`${percentLags} vínculo(s) com latência em % ou formato desconhecido importados com latência zero.`)
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
    calendar: {
      holidays: holidays.size ? [...holidays].sort() : defaultHolidays(fromYear, fromYear + 4),
      extraWorkingDays: [...extra].sort(),
    },
    warnings,
  }
}
