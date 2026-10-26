// Conversor MS Project Data Interchange (MSPDI): estado da store <-> arquivo .xml do MS Project.
// Referência do esquema: https://learn.microsoft.com/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference
// A ordem dos elementos segue as sequências (xs:sequence) do esquema MSPDI; o validador abaixo confere essa ordem.
import type { CalendarioObra, DadosLinhaBase, IntervaloTrabalho, Lag, LinhaBaseInfo, LinkType, ProjectMeta, Restricao, ScheduleResult, Task } from '@/types/domain'
import { WorkCalendar, addCalendarDays, diffCalendarDays } from './calendar'
import {
  EXPEDIENTE_PADRAO,
  JANELA_ANOS_DATAS,
  MAX_INTERVALOS_POR_DIA,
  MINUTOS_NO_DIA_CORRIDO,
  TETO_DIAS,
  UID_CALENDARIO_PADRAO,
  calendarioDeDias,
  calendarioPadrao,
  compilarCalendarios,
  diasParaMinutos,
  erroDoCalendario,
  dataDoMomento,
  horaDoMomento,
  horaParaMinutos,
  lerDataHora,
  type CalendariosCompilados,
} from './calendarioTrabalho'
import { arredondarBancario } from './format'
import { NUMERO_MAX_LINHA_BASE, rollupLinhaBase } from './linhasBase'
import { alteradaDepoisDaImportacao } from './restricoes'
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
    'UID', 'ID', 'Name', 'Active', 'Manual', 'Type', 'IsNull', 'CreateDate', 'Contact', 'WBS', 'WBSLevel', 'OutlineNumber', 'OutlineLevel', 'Priority',
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
  WorkingTime: ['FromTime', 'ToTime'],
  TimePeriod: ['FromDate', 'ToDate'],
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

/** Minutos → PT{h}H{m}M0S (inteiros, sem segundos). */
export function minutosParaDuracao(minutos: number): string {
  const total = Math.max(0, Math.round(minutos))
  return `PT${Math.floor(total / 60)}H${total % 60}M0S`
}

/** PT80H0M0S / P2DT4H -> minutos brutos (sem arredondar); `undefined` se o texto não é uma duração ISO 8601. */
function durationMinutes(value: string | undefined, minutesPerDay: number): number | undefined {
  if (!value) return undefined
  const m = value.match(/^(-?)P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/)
  if (!m) return undefined
  const [, , d, h, min, sec] = m.map((v) => (v ? Number(v) : 0)) as number[]
  const total = d * minutesPerDay + h * 60 + min + sec / 60
  return m[1] === '-' ? -total : total // o sinal negativo é preservado: a faixa do import o recusa
}

/** Lag do domínio → `LinkLag` (décimos de minuto; no lag %, o percentual inteiro) e `LagFormat` (o original, se veio de arquivo). */
export function lagParaMspdi(lag: Lag): { linkLag: number; lagFormat: number } {
  if (lag.tipo === 'percentual') return { linkLag: Math.round(lag.percentual), lagFormat: lag.codigoMspdi ?? 19 }
  return { linkLag: lag.minutos * 10, lagFormat: lag.codigoMspdi ?? (lag.tipo === 'corrido' ? 8 : 7) }
}

/** `ConstraintType` do MSPDI e do VBA (PjConstraint). */
const RESTRICAO_PARA_CODIGO = { ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 } as const

/** `ConstraintDate`: com hora, a própria; só a data, o início do expediente (restrições de início) ou o fim (de término). */
function constraintDate(r: Exclude<Restricao, { tipo: 'ALAP' }>): string | undefined {
  if (r.data.length > 10) return `${r.data.slice(0, 16)}:00`
  return dt(r.data, r.tipo === 'FNET' || r.tipo === 'FNLT' || r.tipo === 'MFO' ? '17:00:00' : '08:00:00')
}

// `24:00:00` (fim de um dia de 24 h) não existe no MSPDI: vira 00:00:00 do dia seguinte
const dt = (iso: string | undefined, time: string) =>
  iso ? (time.startsWith('24:') ? `${addCalendarDays(iso.slice(0, 10), 1)}T00:00:00` : `${iso.slice(0, 10)}T${time}`) : undefined
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
  /** Minutos por dia da obra (jornada), para converter os dias úteis do resumo em minutos. */
  minutosPorDia: number
  /** Data-base (início do projeto): referência dos momentos do cálculo. */
  base: string
  /** Linhas de base 1 a 10 das tarefas-resumo (rollup das folhas, com a duração em dias úteis do calendário padrão), por número e UID. */
  lbResumo: Map<number, Map<number, DadosLinhaBase>>
}

function createContext(input: MspdiExportInput): TaskContext {
  const cals = compilarCalendarios(input.meta.startDate, input.calendarios, input.calendarioPadraoUid)
  const cal = calendarioDeDias(cals.padrao)
  const minutosPorDia = input.meta.minutosPorDia ?? DEFAULT_MINUTES_PER_DAY
  // Só as linhas de base que alguma folha tem: o seed (só a LB0) não paga o rollup
  const numeros = new Set<number>()
  for (const t of input.tasks) for (const k of Object.keys(t.linhasBase ?? {})) numeros.add(Number(k))
  const lbResumo = new Map<number, Map<number, DadosLinhaBase>>()
  for (const n of [...numeros].sort((a, b) => a - b)) if (n >= 1 && n <= NUMERO_MAX_LINHA_BASE) lbResumo.set(n, rollupLinhaBase(input.tasks, n, cal, minutosPorDia))
  return {
    schedule: input.schedule,
    rollups: rollupSummaries(input.tasks, input.schedule),
    cal,
    cals,
    minutosPorDia,
    base: input.meta.startDate,
    lbResumo,
  }
}

/** Minutos do dia → hh:mm:ss do MSPDI (24:00 vira 00:00:00, como o MS Project grava). */
function horaMspdi(minutos: number): string {
  const m = minutos >= MINUTOS_NO_DIA_CORRIDO ? 0 : minutos
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

/** Hora (hh:mm:ss) de um momento do cálculo, no calendário dado. */
const horaDe = (momento: number): string => `${horaDoMomento(momento)}:00`
/**
 * Hora para a data informada: se o momento cai à meia-noite em ponto e a data é a do dia anterior (término de um dia de 24 h),
 * vale `24:00:00` do dia da data. O MSPDI não tem 24:00: `dt` a converte em 00:00:00 do dia seguinte.
 */
const horaDaData = (data: string | undefined, momento: number, base: string): string =>
  data && momento % MINUTOS_NO_DIA_CORRIDO === 0 && dataDoMomento(base, momento) > data.slice(0, 10) ? '24:00:00' : horaDe(momento)

/**
 * `<Baseline>` das linhas de base 1 a 10, em ordem crescente de `Number`, só as que existem e só com os campos presentes (LB incompleta é preservada).
 * Folha: os dados da tarefa; resumo: o rollup das folhas. A data vai no horário padrão (08:00, ou 17:00 no marco; término 17:00): a hora do arquivo não volta (D-4).
 */
function baselinesExtras(t: Task, ctx: TaskContext, startTime: string): (XNode | null)[] {
  const out: (XNode | null)[] = []
  for (let n = 1; n <= NUMERO_MAX_LINHA_BASE; n++) {
    const d = t.isSummary ? ctx.lbResumo.get(n)?.get(t.uid) : t.linhasBase?.[String(n)]
    if (!d || (d.inicio === undefined && d.termino === undefined && d.duracaoMin === undefined && d.custo === undefined)) continue
    out.push(
      x('Baseline', [
        x('Number', n),
        x('Start', dt(d.inicio, startTime)),
        x('Finish', dt(d.termino, '17:00:00')),
        d.duracaoMin !== undefined ? x('Duration', minutosParaDuracao(d.duracaoMin)) : null,
        d.duracaoMin !== undefined ? x('DurationFormat', 7) : null,
        d.custo !== undefined ? x('Cost', arredondarBancario(d.custo, 2).toFixed(2)) : null,
      ]),
    )
  }
  return out
}

function taskNode(t: Task, id: number, ctx: TaskContext): XNode {
  const s = ctx.schedule.byUid.get(t.uid)
  const r = ctx.rollups.get(t.uid)
  // Tarefa agendada manualmente e não alterada no CronoAI: as datas do arquivo voltam como vieram (o MS Project não as recalcula)
  const doArquivo = !t.isSummary && t.arquivo?.manual === true && !!t.arquivo.inicio && !!t.arquivo.termino && !alteradaDepoisDaImportacao(t)
  const start = doArquivo ? t.arquivo?.inicio : t.isSummary ? r?.start : s?.start
  const finish = doArquivo ? t.arquivo?.termino : t.isSummary ? r?.finish : s?.finish
  // Duração do resumo: dias úteis do calendário padrão convertidos com os minutos por dia da obra (jornada de 7,5 h, por exemplo)
  const durationMin = t.isSummary
    ? start && finish ? diasParaMinutos(ctx.cal.countWorkingBetween(start, addCalendarDays(finish, 1)), ctx.minutosPorDia) : 0
    : t.duracaoMin
  const milestone = !t.isSummary && t.duracaoMin === 0
  const pct = Math.round(t.isSummary ? (r?.percentComplete ?? 0) : t.percentComplete)
  const cost = t.isSummary ? (r?.bac ?? 0) : t.bac
  const actualCost = t.isSummary ? (r?.actualCost ?? 0) : t.actualCost
  const critical = t.isSummary ? !!r?.critical : !!s?.critical
  const startTime = milestone ? '17:00:00' : '08:00:00'
  const leaf = !t.isSummary
  const bStart = t.isSummary ? r?.baselineStart : t.baselineStart
  const bFinish = t.isSummary ? r?.baselineFinish : t.baselineFinish
  // Horas reais do cálculo; datas reais (início e término) ficam no expediente padrão
  const cInicio = ctx.cals.de(t.calendarioUid)
  const cDuracao = t.duracaoCorrida ? ctx.cals.corrido : cInicio
  const inicioHora = doArquivo ? (t.arquivo?.inicioHora ? `${t.arquivo.inicioHora}:00` : startTime) : t.isSummary ? (r ? `${r.inicioHora}:00` : startTime) : s && !(t.percentComplete > 0 && t.actualStart) ? `${s.inicioHora}:00` : startTime
  const terminoHora = doArquivo ? (t.arquivo?.terminoHora ? `${t.arquivo.terminoHora}:00` : '17:00:00') : t.isSummary ? (r ? `${r.terminoHora}:00` : '17:00:00') : s && !(t.percentComplete >= 100 && t.actualFinish) ? `${s.terminoHora}:00` : '17:00:00'
  const restricao = t.restricao && !('inferida' in t.restricao && t.restricao.inferida) ? t.restricao : undefined // a inferida não vai ao arquivo
  const prazo = t.prazoFinal ? (t.prazoFinal.length > 10 ? `${t.prazoFinal.slice(0, 16)}:00` : dt(t.prazoFinal, '17:00:00')) : undefined

  return x('Task', [
    x('UID', t.uid),
    x('ID', id),
    x('Name', t.name),
    t.arquivo?.ativa && x('Active', 1),
    t.arquivo?.manual !== undefined && x('Manual', t.arquivo.manual),
    x('Type', 1), // duração fixa
    x('IsNull', 0),
    x('WBS', t.wbs),
    x('OutlineNumber', t.wbs),
    x('OutlineLevel', t.outlineLevel),
    x('Priority', 500),
    x('Start', dt(start, inicioHora)),
    x('Finish', dt(finish, terminoHora)),
    x('Duration', minutosParaDuracao(durationMin)),
    x('DurationFormat', t.duracaoCorrida ? 8 : 7),
    x('Milestone', milestone),
    x('Summary', t.isSummary),
    x('Critical', critical),
    leaf && s && x('EarlyStart', dt(s.earlyStart, horaDaData(s.earlyStart, cInicio.proximoUtil(s.inicioCedoMin), ctx.base))),
    leaf && s && x('EarlyFinish', dt(s.earlyFinish, horaDaData(s.earlyFinish, cDuracao.fimUtilAte(s.terminoCedoMin), ctx.base))),
    leaf && s && x('LateStart', dt(s.lateStart, horaDaData(s.lateStart, cInicio.proximoUtil(s.inicioTardeMin), ctx.base))),
    leaf && s && x('LateFinish', dt(s.lateFinish, horaDaData(s.lateFinish, cDuracao.fimUtilAte(s.terminoTardeMin), ctx.base))),
    leaf && s && x('FreeSlack', s.folgaLivreMin * 10), // décimos de minuto
    leaf && s && x('TotalSlack', s.folgaTotalMin * 10),
    x('FixedCost', money(leaf ? t.bac : 0)),
    x('FixedCostAccrual', 3), // rateado
    x('PercentComplete', pct),
    x('Cost', money(cost)),
    leaf && t.percentComplete > 0 && x('ActualStart', dt(t.actualStart ?? start, startTime)),
    leaf && t.percentComplete >= 100 && x('ActualFinish', dt(t.actualFinish ?? finish, '17:00:00')),
    leaf && x('ActualDuration', minutosParaDuracao((durationMin * t.percentComplete) / 100)),
    x('ActualCost', money(actualCost)),
    leaf && x('RemainingDuration', minutosParaDuracao((durationMin * (100 - t.percentComplete)) / 100)),
    x('ConstraintType', restricao ? RESTRICAO_PARA_CODIGO[restricao.tipo] : 0),
    leaf && t.calendarioUid !== undefined && x('CalendarUID', t.calendarioUid),
    restricao && restricao.tipo !== 'ALAP' && x('ConstraintDate', constraintDate(restricao)),
    leaf && x('Deadline', prazo),
    x('Notes', t.notes),
    ...t.predecessors.map((p) => {
      const { linkLag, lagFormat } = lagParaMspdi(p.lag)
      return x('PredecessorLink', [
        x('PredecessorUID', p.uid),
        x('Type', LINK_TO_CODE[p.type]),
        x('CrossProject', 0),
        x('LinkLag', linkLag),
        x('LagFormat', lagFormat),
      ])
    }),
    t.sinapi && x('ExtendedAttribute', [x('FieldID', FIELD_SINAPI), x('Value', t.sinapi)]),
    t.leadTimeDays !== undefined && x('ExtendedAttribute', [x('FieldID', FIELD_LEAD_TIME), x('Value', t.leadTimeDays)]),
    // LB0 incompleta (só início ou só término, como o MS Project grava) é preservada com a(s) data(s) presente(s);
    // a duração só vai quando há as duas datas. Todos os filhos de <Baseline> são opcionais no esquema.
    (bStart || bFinish) &&
      x('Baseline', [
        x('Number', 0),
        x('Start', dt(bStart, startTime)),
        x('Finish', dt(bFinish, '17:00:00')),
        bStart && bFinish && x('Duration', minutosParaDuracao(t.isSummary ? 0 : (t.baselineDuracaoMin ?? durationMin))),
        bStart && bFinish && x('DurationFormat', 7),
        x('Cost', money(cost)),
      ]),
    ...baselinesExtras(t, ctx, startTime),
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
  const minutosPorDia = meta.minutosPorDia ?? DEFAULT_MINUTES_PER_DAY
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
      x('MinutesPerDay', minutosPorDia),
      x('MinutesPerWeek', minutosPorDia * 5),
      x('DaysPerMonth', 20),
      x('DefaultTaskType', 1),
      x('DurationFormat', 7),
      x('WorkFormat', 2),
      x('HonorConstraints', meta.honorConstraintsArquivo ?? 0), // o cálculo sempre honra as restrições; obra sem valor de arquivo grava 0
      x('MultipleCriticalPaths', 0),
      x('SplitsInProgressTasks', (meta.opcoesCronograma?.logica ?? 'retida') === 'retida' ? 1 : 0), // lógica retida
      meta.moveArquivo?.completedEndsBack !== undefined && x('MoveCompletedEndsBack', meta.moveArquivo.completedEndsBack),
      meta.moveArquivo?.remainingStartsBack !== undefined && x('MoveRemainingStartsBack', meta.moveArquivo.remainingStartsBack),
      meta.moveArquivo?.remainingStartsForward !== undefined && x('MoveRemainingStartsForward', meta.moveArquivo.remainingStartsForward),
      meta.moveArquivo?.completedEndsForward !== undefined && x('MoveCompletedEndsForward', meta.moveArquivo.completedEndsForward),
      meta.linhaBaseAtiva !== undefined && Number.isInteger(meta.linhaBaseAtiva) && meta.linhaBaseAtiva >= 1 && meta.linhaBaseAtiva <= NUMERO_MAX_LINHA_BASE && x('BaselineForEarnedValue', meta.linhaBaseAtiva),
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
      for (const wd of kids(kid(c, 'WeekDays'), 'WeekDay')) {
        checkOrder(wd, SCHEMA_ORDER.WeekDay, 'WeekDay', errors)
        for (const wt of kids(kid(wd, 'WorkingTimes'), 'WorkingTime')) checkOrder(wt, SCHEMA_ORDER.WorkingTime, 'WorkingTime', errors)
        const periodo = kid(wd, 'TimePeriod')
        if (periodo) checkOrder(periodo, SCHEMA_ORDER.TimePeriod, 'TimePeriod', errors)
      }
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
    for (const f of ['Start', 'Finish', 'ActualStart', 'ActualFinish', 'ConstraintDate', 'Deadline']) {
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
  /** Linhas de base (0 a 10) que o arquivo trouxe, com metadados genéricos (o MSPDI não guarda nome, motivo, autor nem data de gravação). */
  linhasBase: LinhaBaseInfo[]
  calendarios: CalendarioObra[]
  calendarioPadraoUid: number
  warnings: string[]
}

/** Máximo de calendários-base importados (limite de CPU e memória, T5 do ciclo 00004). */
export const MAX_CALENDARIOS_IMPORTADOS = 100
const JANELA_ANOS = JANELA_ANOS_DATAS
/** Lag acima de ±10 anos (em minutos de relógio) e lag % fora de ±1.000 são recusados com aviso. */
const MAX_LAG_MINUTOS = 10 * 365 * MINUTOS_NO_DIA_CORRIDO
const MAX_LAG_PERCENTUAL = 1000

type LeituraLag = { lag: Lag; arredondado: boolean; percentualCorrido: boolean } | { erro: 'faixa' | 'desconhecido' }

/**
 * Lag do MSPDI → domínio. `LinkLag` vem em décimos de minuto (nos formatos de %, é o percentual inteiro: 50 = 50%).
 * `LagFormat`: 3/5/7/9/11 dias úteis (minuto, hora, dia, semana, mês), 4/6/8/10/12 corridos, 19/20 percentual (20 = % decorrido,
 * calculado como %), 35 ou mais = os mesmos "estimados" (código − 32). O código original fica em `codigoMspdi` para a volta.
 */
export function lagDeMspdi(linkLag: number, lagFormat: number): LeituraLag {
  const fmt = lagFormat >= 35 ? lagFormat - 32 : lagFormat
  if (fmt === 19 || fmt === 20) {
    const percentual = Math.round(linkLag * 100) / 100
    if (Math.abs(percentual) > MAX_LAG_PERCENTUAL) return { erro: 'faixa' }
    return { lag: { tipo: 'percentual', percentual, codigoMspdi: lagFormat }, arredondado: false, percentualCorrido: fmt === 20 }
  }
  const util = [3, 5, 7, 9, 11].includes(fmt)
  const corrido = [4, 6, 8, 10, 12].includes(fmt)
  if (!util && !corrido) {
    // Formato desconhecido (ex.: 21 e 53, "nulos"): sem valor não há o que perder; com valor, é recusado
    return linkLag === 0 ? { lag: { tipo: 'util', minutos: 0, codigoMspdi: lagFormat }, arredondado: false, percentualCorrido: false } : { erro: 'desconhecido' }
  }
  const bruto = linkLag / 10
  const minutos = Math.round(bruto)
  if (Math.abs(minutos) > MAX_LAG_MINUTOS) return { erro: 'faixa' }
  return { lag: { tipo: util ? 'util' : 'corrido', minutos, codigoMspdi: lagFormat }, arredondado: Math.abs(bruto - minutos) > 1e-9, percentualCorrido: false }
}

/** `yyyy-mm-ddThh:mm:ss` do MSPDI → `yyyy-mm-ddThh:mm` (sem fuso); `undefined` se o texto não é data e hora válidas. */
function dataHoraMspdi(v: string | undefined): string | undefined {
  const m = v ? /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?$/.exec(v) : null
  if (!m) return undefined
  return lerDataHora(`${m[1]}T${m[2]}`) ? `${m[1]}T${m[2]}` : undefined
}

const CODIGO_PARA_RESTRICAO = { 2: 'MSO', 3: 'MFO', 4: 'SNET', 5: 'SNLT', 6: 'FNET', 7: 'FNLT' } as const

/** Intervalos do `WorkingTimes`: `ToTime` 00:00 vale 24:00 (e 00:00–00:00 é o dia inteiro). `undefined` = horário inválido. */
function lerIntervalos(workingTimes: Element | undefined): IntervaloTrabalho[] | undefined {
  const out: IntervaloTrabalho[] = []
  for (const wt of kids(workingTimes, 'WorkingTime')) {
    const de = horaParaMinutos(text(wt, 'FromTime') ?? '')
    const ate = horaParaMinutos(text(wt, 'ToTime') ?? '')
    if (de === undefined || ate === undefined) return undefined
    out.push({ de, ate: ate === 0 ? MINUTOS_NO_DIA_CORRIDO : ate })
  }
  return out.sort((a, b) => a.de - b.de)
}

interface ContagensCalendario {
  /** Exceções recorrentes sem a lista legada (não aplicadas). */
  recorrentes: number
  /** Exceções com data inválida ou horário inválido (ignoradas). */
  invalidas: number
  /** Exceções com mais de 400 dias (lidas nos 400 primeiros). */
  truncadas: number
  /** O orçamento de dias percorridos de todos os calendários acabou. */
  acimaDoOrcamento: boolean
  /** O calendário traz `WorkWeeks` (semanas alternativas não aplicadas). */
  workWeeks: boolean
}

/**
 * Lê um calendário-base do MSPDI: semana (`WeekDay` 1–7, com `WorkingTimes` de até 5 intervalos) e exceções (legadas, `DayType` 0,
 * e `<Exceptions>` simples, com horário). `undefined` em `cal` = calendário rejeitado (sem tempo útil, horário inválido ou mais
 * de 5 intervalos por dia). `orcamento` é compartilhado entre todos os calendários (MAX_CALENDAR_DAYS).
 */
function lerCalendarioMspdi(el: Element, uid: number, orcamento: { dias: number }): { cal?: CalendarioObra; contagens: ContagensCalendario } {
  const contagens: ContagensCalendario = { recorrentes: 0, invalidas: 0, truncadas: 0, acimaDoOrcamento: false, workWeeks: !!kid(el, 'WorkWeeks') }
  const semana: IntervaloTrabalho[][] = [[], [], [], [], [], [], []]
  let semanaInvalida = false
  let semanaDefinida = false
  for (const wd of kids(kid(el, 'WeekDays'), 'WeekDay')) {
    const dia = Number(text(wd, 'DayType'))
    if (!(dia >= 1 && dia <= 7)) continue // DayType 1 = domingo … 7 = sábado; 0 é exceção
    semanaDefinida = true
    const trabalha = text(wd, 'DayWorking')
    const tempos = kid(wd, 'WorkingTimes')
    if (trabalha === '0' || (trabalha === undefined && !tempos)) {
      semana[dia - 1] = []
      continue
    }
    const ivs = tempos ? lerIntervalos(tempos) : EXPEDIENTE_PADRAO.map((iv) => ({ ...iv }))
    if (ivs === undefined) semanaInvalida = true
    else semana[dia - 1] = ivs
  }

  // Calendário sem nenhum dia da semana definido (o MS Project sempre os grava): segunda a sexta, 08:00–12:00 e 13:00–17:00
  if (!semanaDefinida) for (let d = 1; d <= 5; d++) semana[d] = EXPEDIENTE_PADRAO.map((iv) => ({ ...iv }))

  const excecoes = new Map<string, IntervaloTrabalho[]>()
  const vistas = new Set<string>() // a mesma exceção aparece no legado e em <Exceptions>: expande e conta uma vez
  const coletar = (no: Element, trabalha: boolean) => {
    if (contagens.acimaDoOrcamento) return
    const p = kid(no, 'TimePeriod')
    const de = isoDate(text(p, 'FromDate'))
    const ate = isoDate(text(p, 'ToDate'))
    if (!de || !ate) return
    const intervalos = trabalha ? (kid(no, 'WorkingTimes') ? lerIntervalos(kid(no, 'WorkingTimes')) : EXPEDIENTE_PADRAO.map((iv) => ({ ...iv }))) : []
    const chave = `${JSON.stringify(intervalos)}|${de}|${ate}`
    if (vistas.has(chave)) return // dedupe antes de validar: a data inválida presente no legado e em <Exceptions> conta uma vez
    vistas.add(chave)
    if (!isValidIsoDate(de) || !isValidIsoDate(ate) || intervalos === undefined) {
      contagens.invalidas++
      return
    }
    let cursor = de
    let dias = 0
    while (cursor <= ate) {
      if (dias >= MAX_EXCEPTION_DAYS) {
        contagens.truncadas++
        break
      }
      if (orcamento.dias >= MAX_CALENDAR_DAYS) {
        contagens.acimaDoOrcamento = true
        break
      }
      excecoes.set(cursor, intervalos)
      orcamento.dias++
      dias++
      cursor = addCalendarDays(cursor, 1)
    }
  }
  // O MS Project 2007–2016 (corpus; 2019 a confirmar) grava cada exceção em dois lugares: <Exceptions> (com a regra de recorrência)
  // e os WeekDay DayType=0 legados, já expandidos ocorrência por ocorrência. Expandir FromDate..ToDate de uma recorrente marcaria o
  // intervalo inteiro; as datas certas estão na lista legada. A recorrente só é considerada aplicada se a lista legada (do mesmo tipo,
  // feriado ou dia útil extra) tem ao menos `Occurrences` datas distintas dentro de FromDate..ToDate dela; senão vira aviso. (Exigir o
  // FromDate exato dava falso aviso em 14 das 27 recorrentes do corpus: o FromDate nem sempre é uma ocorrência.) Expandir pela regra
  // (Type, Period, DaysOfWeek, MonthItem…) quando não há lista legada fica como dívida.
  for (const wd of kids(kid(el, 'WeekDays'), 'WeekDay').filter((w) => text(w, 'DayType') === '0')) coletar(wd, text(wd, 'DayWorking') === '1')
  const datas = (trabalha: boolean) => [...excecoes].filter(([, ivs]) => ivs.length > 0 === trabalha).map(([d]) => d).sort()
  const legadoFeriados = datas(false)
  const legadoExtras = datas(true)
  // Busca binária: primeiro índice com data >= alvo; a contagem em [de, ate] é a diferença entre dois deles
  const primeiroMaiorOuIgual = (ordenadas: string[], alvo: string) => {
    let lo = 0
    let hi = ordenadas.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (ordenadas[mid] < alvo) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const contarEntre = (ordenadas: string[], de: string, ate: string) => {
    const fim = primeiroMaiorOuIgual(ordenadas, ate)
    return (fim < ordenadas.length && ordenadas[fim] === ate ? fim + 1 : fim) - primeiroMaiorOuIgual(ordenadas, de)
  }
  for (const ex of kids(kid(el, 'Exceptions'), 'Exception')) {
    if ((num(ex, 'Occurrences') ?? 1) > 1) {
      const periodo = kid(ex, 'TimePeriod')
      const primeira = isoDate(text(periodo, 'FromDate'))
      const ultima = isoDate(text(periodo, 'ToDate'))
      // Condição necessária: ao menos `Occurrences` datas legadas distintas do mesmo tipo dentro do período
      const naLegada =
        primeira !== undefined && ultima !== undefined && isValidIsoDate(primeira) && isValidIsoDate(ultima) &&
        contarEntre(text(ex, 'DayWorking') === '1' ? legadoExtras : legadoFeriados, primeira, ultima) >= (num(ex, 'Occurrences') ?? 1)
      if (!naLegada) contagens.recorrentes++
      continue
    }
    coletar(ex, text(ex, 'DayWorking') === '1')
  }

  const cal: CalendarioObra = {
    uid,
    nome: (text(el, 'Name') ?? `Calendário ${uid}`).slice(0, 120),
    semana,
    excecoes: [...excecoes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([data, intervalos]) => ({ data, intervalos })),
  }
  return { cal: semanaInvalida || erroDoCalendario(cal) ? undefined : cal, contagens }
}

/** Restrição de uma tarefa do MSPDI: `ConstraintType` 0–7 e `ConstraintDate`. `undefined` + motivo quando não dá para aplicar. */
function lerRestricao(
  tipo: number | undefined,
  data: string | undefined,
): { restricao?: Restricao; motivo?: 'sem-data' | 'data' | 'tipo' } {
  if (tipo === undefined || tipo === 0) return {}
  if (tipo === 1) return { restricao: { tipo: 'ALAP' } }
  const nome = (CODIGO_PARA_RESTRICAO as Record<number, Exclude<Restricao, { tipo: 'ALAP' }>['tipo']>)[tipo]
  if (!nome) return { motivo: 'tipo' }
  if (data === undefined) return { motivo: 'sem-data' }
  const dh = dataHoraMspdi(data)
  return dh ? { restricao: { tipo: nome, data: dh } } : { motivo: 'data' }
}

export function parseMspdiXml(xmlText: string): MspdiImportResult {
  if (xmlText.length > MAX_MSPDI_CHARS) throw new Error('Arquivo muito grande: o limite para importação é de 15 MB.')
  const doc = parseXml(xmlText)
  const project = doc.documentElement
  if (project.localName !== 'Project') throw new Error('O arquivo não é um XML do MS Project (MSPDI): raiz <Project> ausente.')

  const check = validateMspdi(xmlText)
  const blocking = check.errors.filter((e) => /UID duplicado|<Tasks> ausente|sem <UID>/.test(e))
  if (blocking.length) throw new Error(blocking[0])
  const warnings: string[] = check.errors.slice(0, 5).map((e) => `Ignorado: ${e}`)

  // Jornada válida: inteiro de 1 a 1.440 minutos; fora disso vale a padrão (480) e o import avisa
  const minutosDoArquivo = num(project, 'MinutesPerDay')
  const jornadaValida = minutosDoArquivo !== undefined && Number.isInteger(minutosDoArquivo) && minutosDoArquivo >= 1 && minutosDoArquivo <= MINUTOS_NO_DIA_CORRIDO
  const jornadaInvalida = minutosDoArquivo !== undefined && minutosDoArquivo !== 0 && !jornadaValida
  const minutesPerDay = jornadaValida ? minutosDoArquivo : DEFAULT_MINUTES_PER_DAY
  const taskNodes = kids(kid(project, 'Tasks'), 'Task')

  // Faixa de datas aceita: ±45 anos do início do projeto (ou da primeira tarefa); nada de data absurda entra no motor
  const inicioCandidato = isoDate(text(project, 'StartDate')) ?? taskNodes.map((n) => isoDate(text(n, 'Start'))).find((d) => d && isValidIsoDate(d))
  const baseDaFaixa = inicioCandidato && isValidIsoDate(inicioCandidato) ? inicioCandidato : '2026-01-01'
  let datasForaDaFaixa = 0
  const dataSegura = (v: string | undefined): string | undefined => {
    const d = isoDate(v)
    if (!d) return undefined
    if (!isValidIsoDate(d) || Math.abs(diffCalendarDays(baseDaFaixa, d)) > JANELA_ANOS * 365) {
      datasForaDaFaixa++
      return undefined
    }
    return d
  }
  /** `hh:mm` do `Start`/`Finish` do arquivo, ou `undefined` se o texto não é data e hora válidas. */
  const horaDoArquivo = (v: string | undefined): string | undefined => dataHoraMspdi(v)?.slice(11)
  const horaSegura = (v: string | undefined): string | undefined => {
    const dh = dataHoraMspdi(v)
    if (!dh) return undefined
    if (Math.abs(diffCalendarDays(baseDaFaixa, dh.slice(0, 10))) > JANELA_ANOS * 365) return undefined
    return dh
  }

  const meta: Partial<ProjectMeta> = {
    name: text(project, 'Title') ?? text(project, 'Name')?.replace(/\.xml$/i, ''),
    company: text(project, 'Company'),
    manager: text(project, 'Manager') ?? text(project, 'Author'),
    startDate: dataSegura(text(project, 'StartDate')),
    statusDate: dataSegura(text(project, 'StatusDate')),
  }
  if (jornadaValida) meta.minutosPorDia = minutesPerDay
  const honor = num(project, 'HonorConstraints')
  if (honor !== undefined) meta.honorConstraintsArquivo = honor ? 1 : 0
  const splits = num(project, 'SplitsInProgressTasks')
  if (splits !== undefined) meta.opcoesCronograma = { logica: splits ? 'retida' : 'substituir', moverRestante: true }
  const move: NonNullable<ProjectMeta['moveArquivo']> = {}
  const lerMove = (campo: string, chave: keyof typeof move) => {
    const v = num(project, campo)
    if (v !== undefined) move[chave] = v !== 0
  }
  lerMove('MoveCompletedEndsBack', 'completedEndsBack')
  lerMove('MoveRemainingStartsBack', 'remainingStartsBack')
  lerMove('MoveRemainingStartsForward', 'remainingStartsForward')
  lerMove('MoveCompletedEndsForward', 'completedEndsForward')
  if (Object.keys(move).length) meta.moveArquivo = move

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

  // Calendários: só os calendários-base usados pelo projeto ou por alguma tarefa (os de recurso não entram)
  const calendariosEl = kids(kid(project, 'Calendars'), 'Calendar')
  const uidDoProjeto = text(project, 'CalendarUID') ?? '1'
  const calProjetoEl = calendariosEl.find((c) => text(c, 'UID') === uidDoProjeto) ?? calendariosEl[0]
  const uidProjetoTexto = text(calProjetoEl, 'UID') // calendário realmente usado (o CalendarUID do projeto pode não existir)
  const usadosPorTarefas = new Set(taskNodes.map((n) => text(n, 'CalendarUID')).filter((u): u is string => u !== undefined && u !== '-1'))
  const orcamento = { dias: 0 }
  const total: ContagensCalendario = { recorrentes: 0, invalidas: 0, truncadas: 0, acimaDoOrcamento: false, workWeeks: false }
  let workWeeks = 0
  let rejeitados = 0
  const importados = new Map<number, CalendarioObra>()
  const somar = (c: ContagensCalendario) => {
    total.recorrentes += c.recorrentes
    total.invalidas += c.invalidas
    total.truncadas += c.truncadas
    total.acimaDoOrcamento ||= c.acimaDoOrcamento
    if (c.workWeeks) workWeeks++
  }
  const candidatos = [...(calProjetoEl ? [calProjetoEl] : []), ...calendariosEl.filter((c) => c !== calProjetoEl && text(c, 'IsBaseCalendar') === '1' && usadosPorTarefas.has(text(c, 'UID') ?? ''))]
  let calendariosAcimaDoLimite = 0
  for (const el of candidatos) {
    const uid = Number(text(el, 'UID'))
    if (!Number.isInteger(uid) || importados.has(uid)) continue
    if (importados.size >= MAX_CALENDARIOS_IMPORTADOS) {
      calendariosAcimaDoLimite++
      continue
    }
    const lido = lerCalendarioMspdi(el, uid, orcamento)
    somar(lido.contagens)
    if (lido.cal) importados.set(uid, lido.cal)
    else rejeitados++
  }
  const calendariosNaoImportados = calendariosEl.length - importados.size - rejeitados - calendariosAcimaDoLimite

  // Calendário padrão da obra: o do projeto. Sem ele (ausente ou rejeitado), o padrão seg–sex, SEM feriados. O CronoAI nunca acrescenta
  // feriados a um calendário que veio do arquivo: o arquivo foi calculado sem eles (no corpus, as datas batem em 100 de 104 sem os
  // feriados nacionais e em 83 de 104 com eles). "Aplicar feriados da obra" é ação explícita do usuário, com prévia (ciclo 00005, P3).
  const uidPadrao = Number.isInteger(Number(uidProjetoTexto)) && uidProjetoTexto !== undefined ? Number(uidProjetoTexto) : UID_CALENDARIO_PADRAO
  let calPadrao = importados.get(uidPadrao)
  const semCalendarioDoProjeto = !calPadrao
  if (!calPadrao) {
    calPadrao = calendarioPadrao([], [], uidPadrao)
    importados.set(uidPadrao, calPadrao)
  }
  const semFeriados = !semCalendarioDoProjeto && !calPadrao.excecoes.some((ex) => ex.intervalos.length === 0)
  if (total.recorrentes) warnings.push(`${total.recorrentes} exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.`)
  if (total.invalidas) warnings.push(`${total.invalidas} exceção(ões) do calendário com data inválida ignorada(s).`)
  if (total.truncadas) warnings.push(`${total.truncadas} exceção(ões) do calendário com mais de ${MAX_EXCEPTION_DAYS} dias: lidas apenas nos primeiros ${MAX_EXCEPTION_DAYS} dias.`)
  if (total.acimaDoOrcamento) warnings.push(`Calendário com mais de ${MAX_CALENDAR_DAYS} dias de exceção: o excedente não foi importado; confira feriados e dias úteis extras.`)
  if (rejeitados) warnings.push(`${rejeitados} calendário(s) rejeitado(s) por não ter tempo útil, ter horário inválido ou mais de ${MAX_INTERVALOS_POR_DIA} intervalos por dia: as tarefas deles passam ao calendário padrão da obra.`)
  if (calendariosAcimaDoLimite) warnings.push(`${calendariosAcimaDoLimite} calendário(s) acima do limite de ${MAX_CALENDARIOS_IMPORTADOS} não importado(s): as tarefas deles passam ao calendário padrão da obra.`)
  if (workWeeks) warnings.push(`${workWeeks} calendário(s) com semanas de trabalho alternativas (WorkWeeks) não aplicadas: o cálculo usa a semana padrão.`)

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
  // Contadores dos avisos "o que o import não trouxe" (só números no texto: conteúdo do arquivo nunca vai para o aviso)
  let lagDesconhecido = 0
  let lagForaDaFaixa = 0
  let lagPercentualDecorrido = 0
  let arredondados = 0
  let duracoesForaDaFaixa = 0
  let nullRows = 0
  let calendarioDeTarefaNaoImportado = 0
  // Linhas de base: só números entram nos avisos
  let lbInterim = 0
  let lbNumeroInvalido = 0
  let lbRepetida = 0
  let lbAlemDoLimite = 0
  let lbCustoInvalido = 0
  let lbTrabalho = 0
  let lb0SemDatas = 0
  const numerosComDados = new Set<number>()
  const MAX_BASELINES_POR_TAREFA = NUMERO_MAX_LINHA_BASE + 1
  let baselineNoFinish = 0
  let baselineNoStart = 0
  let manuais = 0
  let restricaoSemData = 0
  let restricaoInvalida = 0
  let sinapiNoAlias = 0
  let leadNoAlias = 0
  let customValues = 0
  const customFields = new Set<string>()
  const minutosDe = (v: string | undefined): number => {
    const lido = durationMinutes(v, minutesPerDay)
    if (lido === undefined && v) {
      duracoesForaDaFaixa++ // texto que não é duração ISO 8601
      return 0
    }
    const bruto = lido ?? 0
    // Faixa aceita: de 0 até o teto de 50 anos; duração negativa ou maior vira zero, com aviso (o motor não a aceitaria)
    if (bruto < 0 || bruto > TETO_DIAS * MINUTOS_NO_DIA_CORRIDO) {
      duracoesForaDaFaixa++
      return 0
    }
    const minutos = Math.round(bruto)
    if (Math.abs(bruto - minutos) > 1e-9) arredondados++ // segundos (só em durações guiadas por recurso): arredondados com aviso
    return minutos
  }
  const tasks: Task[] = []
  for (const node of taskNodes) {
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
    // `Interim` = 1 não é linha de base (plano provisório): fica fora, inclusive da LB0
    const baselineNodes = kids(node, 'Baseline')
    const baseline = baselineNodes.find((b) => (text(b, 'Number') ?? '0') === '0' && text(b, 'Interim') !== '1')
    const linhasBase: Record<string, DadosLinhaBase> = {}
    const vistos = new Set<number>()
    baselineNodes.forEach((b, i) => {
      if (i >= MAX_BASELINES_POR_TAREFA) {
        lbAlemDoLimite++ // no máximo 11 por tarefa (laço limitado, S-4)
        return
      }
      if (text(b, 'Interim') === '1') {
        lbInterim++
        return
      }
      const n = Number(text(b, 'Number') ?? '0')
      if (!Number.isInteger(n) || n < 0 || n > NUMERO_MAX_LINHA_BASE) {
        lbNumeroInvalido++
        return
      }
      if (vistos.has(n)) {
        lbRepetida++ // vale o primeiro
        return
      }
      vistos.add(n)
      if (kid(b, 'Work')) lbTrabalho++ // o trabalho (Work) não tem onde morar: entra no aviso único
      const temDado = ['Start', 'Finish', 'Duration', 'Cost'].some((c) => kid(b, c) !== undefined)
      if (temDado) numerosComDados.add(n)
      if (n === 0) return // a LB0 segue nos campos de sempre, abaixo
      const dados: DadosLinhaBase = {}
      if (kid(b, 'Start')) {
        const d = dataSegura(text(b, 'Start'))
        if (d) dados.inicio = d
      }
      if (kid(b, 'Finish')) {
        const d = dataSegura(text(b, 'Finish'))
        if (d) dados.termino = d
      }
      if (kid(b, 'Duration')) dados.duracaoMin = minutosDe(text(b, 'Duration'))
      if (kid(b, 'Cost')) {
        const c = num(b, 'Cost')
        if (c !== undefined && c >= 0 && c <= 1e12) dados.custo = c
        else lbCustoInvalido++
      }
      if (Object.keys(dados).length) linhasBase[String(n)] = dados
    })
    const extNodes = kids(node, 'ExtendedAttribute')
    const ext = new Map(extNodes.map((e) => [text(e, 'FieldID') ?? '', text(e, 'Value') ?? '']))
    for (const e of extNodes) {
      const id = text(e, 'FieldID') ?? ''
      if (id === sinapiField || id === leadField) continue
      customValues++
      customFields.add(id)
    }
    const calTexto = text(node, 'CalendarUID')
    const calUid = calTexto === undefined || calTexto === '-1' ? undefined : Number(calTexto)
    const calendarioUid = calUid !== undefined && calUid !== uidPadrao && importados.has(calUid) ? calUid : undefined
    if (calUid !== undefined && calUid !== uidPadrao && !importados.has(calUid)) calendarioDeTarefaNaoImportado++
    const preds = kids(node, 'PredecessorLink')
      .map((l) => {
        const leitura = lagDeMspdi(num(l, 'LinkLag') ?? 0, num(l, 'LagFormat') ?? 7)
        let lag: Lag = { tipo: 'util', minutos: 0 }
        if ('erro' in leitura) {
          if (leitura.erro === 'faixa') lagForaDaFaixa++
          else lagDesconhecido++
        } else {
          lag = leitura.lag
          if (leitura.arredondado) arredondados++
          if (leitura.percentualCorrido) lagPercentualDecorrido++
        }
        return { uid: num(l, 'PredecessorUID') ?? -1, type: linkTypeOf(text(l, 'Type') ?? '1') ?? 'FS', lag }
      })
      .filter((p) => p.uid > 0 && p.uid !== uid)
    const pct = Math.min(100, Math.max(0, num(node, 'PercentComplete') ?? 0))
    const start = dataSegura(text(node, 'Start'))
    const finish = dataSegura(text(node, 'Finish'))
    const cost = num(node, 'Cost') ?? 0
    const fixed = num(node, 'FixedCost') ?? 0
    const baselineCost = num(baseline, 'Cost') ?? 0
    const lead = ext.get(leadField)
    const duracaoMin = isSummary ? 0 : minutosDe(text(node, 'Duration'))
    if (ext.get(sinapiField) && !sinapiAlias) sinapiNoAlias++
    if (lead !== undefined && lead !== '' && !Number.isNaN(Number(lead)) && !leadAlias) leadNoAlias++
    const baselineStart = dataSegura(text(baseline, 'Start'))
    const baselineFinish = dataSegura(text(baseline, 'Finish'))
    if (!isSummary && baseline && baselineStart && !baselineFinish) baselineNoFinish++
    if (!isSummary && baseline && !baselineStart && baselineFinish) baselineNoStart++
    // LB0 sem nenhuma data (só custo, duração ou trabalho): a store a calcula pelo cronograma (CR-12 só protege a LB0 com uma das datas)
    if (!isSummary && baseline && !baselineStart && !baselineFinish) lb0SemDatas++

    // Restrição explícita do arquivo (ConstraintType 0–7 + ConstraintDate) e prazo final (Deadline)
    const explicita = lerRestricao(num(node, 'ConstraintType'), text(node, 'ConstraintDate'))
    let restricao = explicita.restricao
    if (restricao && restricao.tipo !== 'ALAP' && !horaSegura(restricao.data)) {
      restricao = undefined
      restricaoInvalida++
    } else if (explicita.motivo === 'sem-data') restricaoSemData++
    else if (explicita.motivo) restricaoInvalida++
    let prazoFinal: string | undefined
    if (text(node, 'Deadline')) {
      prazoFinal = horaSegura(text(node, 'Deadline'))
      if (!prazoFinal) restricaoInvalida++
    }
    const sinal = (num(node, 'ConstraintType') ?? 0) === 0
    // Sem vínculos, sem avanço e sem restrição explícita: preserva a data do arquivo como SNET inferido (volta como ASAP)
    const efetiva: Restricao | undefined =
      restricao ?? (sinal && !isSummary && preds.length === 0 && pct === 0 && start ? { tipo: 'SNET', data: start, inferida: true } : undefined)
    const manual = text(node, 'Manual')
    if (!isSummary && manual === '1') manuais++

    // O MSPDI não tem 24:00: o fim de um dia de 24 h vem como 00:00 do dia seguinte. O CronoAI conta esse término (e o marco depois de
    // uma predecessora) como 24:00 do dia anterior; sem isso, reimportar o próprio export acusaria um dia de divergência
    const diaAnterior = (d: string) => addCalendarDays(d, -1)
    const terminoMeiaNoite = !!start && !!finish && duracaoMin > 0 && finish > start && horaDoArquivo(text(node, 'Finish')) === '00:00'
    const marcoMeiaNoite = duracaoMin === 0 && preds.length > 0 && !!start && horaDoArquivo(text(node, 'Start')) === '00:00'
    const inicioArquivo = marcoMeiaNoite && start ? diaAnterior(start) : start
    const terminoArquivo = finish && (terminoMeiaNoite || (marcoMeiaNoite && horaDoArquivo(text(node, 'Finish')) === '00:00')) ? diaAnterior(finish) : finish
    const horaIni = marcoMeiaNoite ? '24:00' : horaDoArquivo(text(node, 'Start'))
    const horaFim = terminoMeiaNoite || (marcoMeiaNoite && horaDoArquivo(text(node, 'Finish')) === '00:00') ? '24:00' : horaDoArquivo(text(node, 'Finish'))

    const arquivo = isSummary
      ? undefined
      : {
          ...(inicioArquivo ? { inicio: inicioArquivo } : {}),
          ...(terminoArquivo ? { termino: terminoArquivo } : {}),
          // Hora exata do arquivo da tarefa manual (a exportação a devolve como veio)
          ...(manual === '1' && start && horaIni ? { inicioHora: horaIni } : {}),
          ...(manual === '1' && finish && horaFim ? { terminoHora: horaFim } : {}),
          duracaoMin,
          percentComplete: pct,
          ...(restricao ? { restricao } : {}),
          ...(prazoFinal ? { prazoFinal } : {}),
          ...(manual !== undefined ? { manual: manual === '1' } : {}),
          ...(text(node, 'Active') !== undefined ? { ativa: true as const } : {}),
          ...((num(node, 'LevelingDelay') ?? 0) > 0 ? { nivelamento: true as const } : {}),
        }

    tasks.push({
      uid,
      wbs: text(node, 'WBS') ?? text(node, 'OutlineNumber') ?? String(uid),
      name,
      outlineLevel: level,
      isSummary,
      duracaoMin,
      ...(!isSummary && duracaoMin > 0 && ELAPSED_FORMATS.has(text(node, 'DurationFormat') ?? '') ? { duracaoCorrida: true as const } : {}),
      ...(calendarioUid !== undefined ? { calendarioUid } : {}),
      predecessors: preds,
      percentComplete: isSummary ? 0 : pct,
      actualStart: pct > 0 ? (dataSegura(text(node, 'ActualStart')) ?? start) : undefined,
      actualFinish: pct >= 100 ? (dataSegura(text(node, 'ActualFinish')) ?? finish) : undefined,
      bac: isSummary ? 0 : baselineCost || cost || fixed,
      actualCost: isSummary ? 0 : (num(node, 'ActualCost') ?? 0),
      resources: assignments.get(uid) ?? [],
      sinapi: ext.get(sinapiField) || undefined,
      leadTimeDays: lead !== undefined && lead !== '' && !Number.isNaN(Number(lead)) ? Number(lead) : undefined,
      baselineStart,
      baselineFinish,
      baselineDuracaoMin: baseline ? minutosDe(text(baseline, 'Duration')) : undefined,
      ...(Object.keys(linhasBase).length ? { linhasBase } : {}),
      restricao: efetiva,
      ...(prazoFinal ? { prazoFinal } : {}),
      ...(arquivo ? { arquivo } : {}),
      floors: parseFloorRange(name),
      notes: text(node, 'Notes'),
    })
  }

  const linhasBase: LinhaBaseInfo[] = [...numerosComDados]
    .sort((a, b) => a - b)
    .map((n) => ({ numero: n, nome: `Linha de base ${n} (importada do MS Project)`, motivo: 'Importada do arquivo', origem: 'arquivo' as const }))
  // LB do valor agregado do arquivo: só vale se a linha de base veio no arquivo
  const paraValorAgregado = num(project, 'BaselineForEarnedValue')
  if (paraValorAgregado !== undefined && paraValorAgregado !== 0) {
    if (Number.isInteger(paraValorAgregado) && paraValorAgregado >= 1 && paraValorAgregado <= NUMERO_MAX_LINHA_BASE && numerosComDados.has(paraValorAgregado)) {
      meta.linhaBaseAtiva = paraValorAgregado
    } else if (Number.isInteger(paraValorAgregado) && paraValorAgregado >= 1 && paraValorAgregado <= NUMERO_MAX_LINHA_BASE) {
      warnings.push(`O arquivo indica a linha de base ${paraValorAgregado} para o valor agregado, mas ela não veio no arquivo: o CronoAI usa a linha de base 0.`)
    } else {
      warnings.push(`O arquivo indica uma linha de base para o valor agregado fora de 0 a ${NUMERO_MAX_LINHA_BASE}: o CronoAI usa a linha de base 0.`)
    }
  }
  if (!tasks.length) throw new Error('Nenhuma tarefa encontrada no XML.')
  if (inactive) warnings.push(`${inactive} tarefa(s) inativa(s) ignorada(s).`)
  if (lagDesconhecido) warnings.push(`${lagDesconhecido} vínculo(s) com formato de latência desconhecido importados com latência zero.`)
  if (lagForaDaFaixa) warnings.push(`${lagForaDaFaixa} vínculo(s) com latência fora da faixa (mais de 10 anos ou % acima de ${MAX_LAG_PERCENTUAL}) importados com latência zero.`)
  if (lagPercentualDecorrido) warnings.push(`${lagPercentualDecorrido} vínculo(s) com latência em % decorrido calculados como % do tempo útil.`)
  if (jornadaInvalida) warnings.push(`MinutesPerDay do arquivo (${minutosDoArquivo}) fora da faixa de 1 a ${MINUTOS_NO_DIA_CORRIDO} minutos inteiros: usada a jornada padrão de ${DEFAULT_MINUTES_PER_DAY} minutos.`)
  if (duracoesForaDaFaixa) warnings.push(`${duracoesForaDaFaixa} duração(ões) negativa(s), acima de 50 anos ou ilegível(is) importada(s) como zero.`)
  if (arredondados) warnings.push(`${arredondados} valor(es) de tempo com segundos arredondado(s) para o minuto (durações guiadas por recurso).`)
  // Linhas de base 1 a 10 agora são lidas (o aviso antigo de "não importadas" deixou de existir). Só o que não é linha de base ou não cabe:
  const lbIgnoradas = [
    lbInterim && `${lbInterim} com plano provisório (Interim)`,
    lbNumeroInvalido && `${lbNumeroInvalido} com número fora de 0 a ${NUMERO_MAX_LINHA_BASE}`,
    lbRepetida && `${lbRepetida} repetida(s) na mesma tarefa (vale a primeira)`,
    lbAlemDoLimite && `${lbAlemDoLimite} além do limite de ${MAX_BASELINES_POR_TAREFA} por tarefa`,
  ].filter(Boolean)
  if (lbIgnoradas.length) warnings.push(`Linhas de base ignoradas: ${lbIgnoradas.join('; ')}.`)
  if (lbCustoInvalido) warnings.push(`${lbCustoInvalido} custo(s) de linha de base inválido(s) ou fora da faixa ignorado(s).`)
  if (lb0SemDatas) warnings.push(`${lb0SemDatas} tarefa(s) com linha de base 0 sem datas no arquivo (só custo, duração ou trabalho): o CronoAI calculou as datas da linha de base 0 delas.`)
  // Sem término ou sem início, evm.ts devolve PV zero: a store mantém a LB0 incompleta do arquivo (withBaseline onlyMissing, CR-12).
  if (baselineNoFinish) warnings.push(`${baselineNoFinish} tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.`)
  if (baselineNoStart) warnings.push(`${baselineNoStart} tarefa(s) com linha de base 0 sem início: o término do arquivo é mantido e o valor planejado (PV) delas fica zero.`)
  if (sinapiNoAlias) warnings.push(`Text1 lido como código SINAPI em ${sinapiNoAlias} tarefa(s) sem apelido 'SINAPI' no arquivo: confira.`)
  if (leadNoAlias) warnings.push(`Number1 lido como lead time em ${leadNoAlias} tarefa(s) sem apelido 'lead' no arquivo: confira.`)
  if (calendarioDeTarefaNaoImportado) warnings.push(`${calendarioDeTarefaNaoImportado} tarefa(s) com calendário não importado (de recurso, ausente, rejeitado ou acima do limite): calculadas no calendário do projeto.`)
  if (manuais) warnings.push(`${manuais} tarefa(s) agendada(s) manualmente no MS Project: o CronoAI as calcula automaticamente e preserva a marca para a exportação.`)
  if (restricaoSemData) warnings.push(`${restricaoSemData} restrição(ões) de data sem a data no arquivo ignorada(s).`)
  if (restricaoInvalida) warnings.push(`${restricaoInvalida} restrição(ões) ou prazo(s) final(is) com tipo desconhecido, data inválida ou fora da faixa ignorado(s).`)
  if (datasForaDaFaixa) warnings.push(`${datasForaDaFaixa} data(s) inválida(s) ou a mais de ${JANELA_ANOS} anos do início do projeto ignorada(s) (datas reais, linha de base e datas do arquivo).`)
  if (nullRows) warnings.push(`${nullRows} linha(s) em branco (tarefa nula) ignorada(s).`)
  // Informativo (um aviso só, para não virar toast demais): dados que o CronoAI ainda não tem onde guardar
  const timephased = doc.getElementsByTagNameNS('*', 'TimephasedData').length
  const notImported = [
    timephased && `${timephased} registro(s) distribuído(s) no tempo (TimephasedData)`,
    lbTrabalho && `${lbTrabalho} valor(es) de trabalho (Work) das linhas de base`,
    customValues && `${customValues} valor(es) de ${customFields.size} campo(s) personalizado(s)`,
    calendariosNaoImportados > 0 && `${calendariosNaoImportados} calendário(s) de recurso ou sem uso nas tarefas`,
  ].filter(Boolean)
  if (notImported.length) warnings.push(`Não importado do MS Project: ${notImported.join('; ')}.`)
  if (tasks.filter((t) => !t.isSummary).every((t) => t.bac === 0)) {
    warnings.push('O arquivo não traz custos (Cost/Baseline Cost): os indicadores EVM ficarão zerados até que o BAC seja informado.')
  }
  if (!meta.statusDate) warnings.push('Data de status ausente no XML; mantida a data de status atual do CronoAI.')
  if (semCalendarioDoProjeto) {
    warnings.push('O calendário do projeto não veio no arquivo (ou foi rejeitado): o CronoAI usou seg–sex 08:00–12:00 e 13:00–17:00 sem feriados, como o Standard do MS Project. Confira as datas.')
  } else if (semFeriados) {
    warnings.push('O calendário do arquivo não traz feriados. O CronoAI não acrescentou nenhum: use "Aplicar feriados da obra" em Premissas › Calendários para ver o impacto antes.')
  }

  return {
    meta,
    tasks,
    linhasBase,
    calendarios: [calPadrao, ...[...importados.values()].filter((c) => c.uid !== uidPadrao)],
    calendarioPadraoUid: uidPadrao,
    warnings,
  }
}
