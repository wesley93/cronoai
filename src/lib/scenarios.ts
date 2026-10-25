// Efeito dominó e simulador de recuperação (Crashing, Fast Tracking e Hora Extra).
import type { CalendarioObra, ConfigFeriadosObra, PremissasObra, ProjectMeta, ScenarioKind, ScheduleResult, ScheduledTask, Task, VersaoPremissas } from '@/types/domain'
import { WorkCalendar, diffCalendarDays, nextSaturdays } from './calendar'
import {
  MINUTOS_NO_DIA_CORRIDO,
  MINUTOS_POR_DIA_PADRAO,
  calendarioDeDias,
  compilarCalendarios,
  comDiasExtras,
  copiarCalendario,
  diasExtrasDo,
  expedienteDoDiaUtil,
  intervalosDaPredefinicao,
  proximoUidCalendario,
  diasParaMinutos,
  diaRelativo,
  minutosParaDias,
} from './calendarioTrabalho'
import { computeSchedule, downstreamOf, optsDaObra } from './cpm'
import { criarFeriadosPorAno, ehFeriadoDaObra } from './feriadosObra'
import { memoriaPremissas, premissasPadrao, taxaHora } from './premissas'
import { normalizeText, rotuloLag } from './wbs'

/** Taxa horária da função nas premissas da obra (R$/h); função não cadastrada usa a taxa padrão das premissas. */
export const rateOf = (premissas: PremissasObra, resource: string) => taxaHora(premissas, resource)

export interface AffectedTask {
  uid: number
  shiftDays: number
  critical: boolean
}

export interface DelayAnalysis {
  origin?: Task
  originShift: number
  keysBaseline?: string
  keysForecast: string
  delayDays: number
  delayCalendarDays: number
  affected: AffectedTask[]
}

/** Variação em dias úteis entre duas datas (positivo = atraso). */
export function workingVariance(cal: WorkCalendar, baseline: string, forecast: string): number {
  if (forecast === baseline) return 0
  return forecast > baseline
    ? cal.countWorkingBetween(baseline, forecast)
    : -cal.countWorkingBetween(forecast, baseline)
}

export function projectBaselineFinish(tasks: Task[]): string | undefined {
  const finishes = tasks.filter((t) => !t.isSummary && t.baselineFinish).map((t) => t.baselineFinish!)
  return finishes.length ? finishes.sort().at(-1) : undefined
}

export function analyzeDelay(tasks: Task[], forecast: ScheduleResult, baseCal: WorkCalendar): DelayAnalysis {
  const leaves = tasks.filter((t) => !t.isSummary)
  const keysBaseline = projectBaselineFinish(tasks)
  const delayDays = keysBaseline ? workingVariance(baseCal, keysBaseline, forecast.projectFinish) : 0
  const late = (t: Task) => {
    const s = forecast.byUid.get(t.uid)
    return s && t.baselineFinish ? workingVariance(baseCal, t.baselineFinish, s.finish) : 0
  }

  // Origem: tarefa crítica, não concluída, atrasada e mais cedo na rede (de preferência em andamento)
  const candidates = leaves
    .filter((t) => t.percentComplete < 100 && forecast.byUid.get(t.uid)?.critical && late(t) > 0)
    .sort((a, b) => {
      const pa = a.percentComplete > 0 ? 0 : 1
      const pb = b.percentComplete > 0 ? 0 : 1
      return pa - pb || forecast.byUid.get(a.uid)!.inicioCedoMin - forecast.byUid.get(b.uid)!.inicioCedoMin
    })
  const origin = candidates[0]

  const affected: AffectedTask[] = origin
    ? downstreamOf(leaves, origin.uid)
        .map((uid) => ({ uid, shiftDays: late(leaves.find((t) => t.uid === uid)!), critical: !!forecast.byUid.get(uid)?.critical }))
        .filter((a) => a.shiftDays > 0)
        .sort((a, b) => forecast.byUid.get(a.uid)!.inicioCedoMin - forecast.byUid.get(b.uid)!.inicioCedoMin)
    : []

  return {
    origin,
    originShift: origin ? late(origin) : 0,
    keysBaseline,
    keysForecast: forecast.projectFinish,
    delayDays,
    delayCalendarDays: keysBaseline ? diffCalendarDays(keysBaseline, forecast.projectFinish) : 0,
    affected,
  }
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

export type RiskLevel = 'Baixo' | 'Médio' | 'Alto'

export interface ScenarioParams {
  crashing: { addOfficials: number; addServentes: number; targetUid?: number }
  fastTracking: { lagDays: number; succUid?: number; predUid?: number }
  overtime: ParametrosHoraExtra
}

/**
 * Hora extra (RF-03.6): `saturdays` sábados, jornada `integral` (expediente do dia útil do calendário padrão) ou `meio` (08:00–12:00, 4 h) e as
 * frentes convocadas: `'todas'` (os sábados entram no calendário padrão) ou uma lista de UIDs de tarefa (calendário derivado só para elas).
 */
export interface ParametrosHoraExtra {
  saturdays: number
  jornada?: 'integral' | 'meio'
  frentes?: 'todas' | number[]
}

export const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  crashing: { addOfficials: 2, addServentes: 1 },
  fastTracking: { lagDays: 3 },
  overtime: { saturdays: 2, jornada: 'integral', frentes: 'todas' },
}

export interface ScenarioResult {
  kind: ScenarioKind
  applicable: boolean
  reason?: string
  targetUid?: number
  predecessorUid?: number
  title: string
  summary: string
  daysRecovered: number
  newFinish: string
  extraCost: number
  indirectSavings: number
  netImpact: number
  /** Custo extra por dia útil recuperado (R$/dia). */
  costPerDay: number
  risk: RiskLevel
  riskNote: string
  details: { label: string; value: string }[]
  /** Memória de cálculo, linha a linha, com os números usados. */
  memory: string[]
  /** Versão das premissas usada no cálculo (ausente em cenário aplicado antes do ciclo 00005). */
  premissas?: { versao: number; vigencia: string }
  /** Alterações a aplicar no estado se o engenheiro aprovar. */
  taskPatch?: { uid: number; patch: Partial<Task> }
  addedWorkingDays?: string[]
  /**
   * Hora extra: a jornada do sábado e, nas frentes escolhidas, os calendários derivados a criar, as tarefas que passam a usá-los e as
   * escolhidas não convocadas (no modo "todas", as três listas ficam vazias e os sábados vão em `addedWorkingDays`).
   */
  horaExtra?: {
    jornada: 'integral' | 'meio'
    dias: string[]
    calendariosNovos: CalendarioObra[]
    atribuicoes: { uid: number; calendarioUid: number }[]
    naoConvocadas: number[]
  }
}

export interface ScenarioOption {
  value: string
  label: string
  critical: boolean
}

interface Ctx {
  tasks: Task[]
  calendarios: CalendarioObra[]
  calendarioPadraoUid: number
  meta: ProjectMeta
  forecast: ScheduleResult
  origin?: Task
  /** Premissas vigentes da obra; ausente = premissas padrão (ilustrativas). */
  premissas?: PremissasObra
  /** Feriados da obra (aplicados aos calendários com `aplicaFeriadosObra`); ausente = nenhum. */
  feriados?: ConfigFeriadosObra
  /** Versão das premissas vigentes (registrada no resultado do cenário). */
  versaoPremissas?: Pick<VersaoPremissas, 'versao' | 'vigencia'>
}

const premissasDe = (ctx: Ctx): PremissasObra => ctx.premissas ?? premissasPadrao()
/** Registra no resultado a versão das premissas usada. */
const comVersao = (ctx: Ctx, r: ScenarioResult): ScenarioResult =>
  ctx.versaoPremissas ? { ...r, premissas: { versao: ctx.versaoPremissas.versao, vigencia: ctx.versaoPremissas.vigencia } } : r

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRate = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const num = (v: number, d = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: d })
const br = (iso: string) => iso.split('-').reverse().join('/')
const shortName = (name: string) =>
  name.replace('Alvenaria de vedação bloco cerâmico 14x19x29', 'Alvenaria').replace('Estrutura de concreto armado fck 30', 'Estrutura')

const minutosPorDiaDe = (ctx: Ctx) => ctx.meta.minutosPorDia ?? MINUTOS_POR_DIA_PADRAO
/** Horas por dia do custo: jornada do calendário, minutos por dia ÷ 60 (480 → 8 h). */
const horasPorDiaDe = (ctx: Ctx) => minutosPorDiaDe(ctx) / 60

const compilar = (ctx: Ctx, calendarios: CalendarioObra[]) =>
  compilarCalendarios(ctx.meta.startDate, calendarios, ctx.calendarioPadraoUid, { feriadosPorAno: ctx.feriados ? criarFeriadosPorAno(ctx.feriados) : undefined })

function reschedule(ctx: Ctx, tasks: Task[], calendarios: CalendarioObra[]) {
  const cals = compilar(ctx, calendarios)
  const schedule = computeSchedule(tasks, cals, optsDaObra(ctx.meta, 'forecast', ctx.meta.statusDate))
  return { cals, schedule }
}

function recovered(ctx: Ctx, newFinish: string): number {
  const cals = compilar(ctx, ctx.calendarios)
  return workingVariance(calendarioDeDias(cals.padrao), newFinish, ctx.forecast.projectFinish)
}

const notApplicable = (kind: ScenarioKind, title: string, reason: string, ctx: Ctx): ScenarioResult =>
  comVersao(ctx, {
    kind, applicable: false, reason, title, summary: reason, daysRecovered: 0, newFinish: ctx.forecast.projectFinish,
    extraCost: 0, indirectSavings: 0, netImpact: 0, costPerDay: 0, risk: 'Baixo', riskNote: '', details: [], memory: [],
  })

const perDay = (extra: number, days: number) => (days > 0 ? extra / days : Infinity)

/** Função principal da equipe (maior quantidade, excluindo serventes). */
export function mainTrade(t: Task): { resource: string; units: number } | undefined {
  return [...t.resources].filter((r) => r.resource !== 'Servente').sort((a, b) => b.units - a.units)[0]
}

// ---------------------------------------------------------------- Crashing

/** Tarefas que podem ser comprimidas: não iniciadas e com equipe; críticas e sucessoras da origem do atraso primeiro. */
export function crashingTargets(ctx: Ctx): ScenarioOption[] {
  const mpd = minutosPorDiaDe(ctx)
  const leaves = ctx.tasks.filter((t) => !t.isSummary && t.percentComplete === 0 && minutosParaDias(t.duracaoMin, mpd) > 1 && mainTrade(t))
  const downstream = new Set(ctx.origin ? downstreamOf(ctx.tasks.filter((t) => !t.isSummary), ctx.origin.uid) : [])
  const crit = (t: Task) => !!ctx.forecast.byUid.get(t.uid)?.critical
  return leaves
    .sort(
      (a, b) =>
        Number(crit(b)) - Number(crit(a)) ||
        Number(downstream.has(b.uid)) - Number(downstream.has(a.uid)) ||
        ctx.forecast.byUid.get(a.uid)!.inicioCedoMin - ctx.forecast.byUid.get(b.uid)!.inicioCedoMin,
    )
    .map((t) => {
      const trade = mainTrade(t)!
      return { value: String(t.uid), label: `${t.wbs} ${shortName(t.name)} · ${trade.units} ${trade.resource.toLowerCase()}(s)`, critical: crit(t) }
    })
}

export function simulateCrashing(ctx: Ctx, p: ScenarioParams['crashing'] = DEFAULT_SCENARIO_PARAMS.crashing): ScenarioResult {
  const title = 'Crashing (Compressão)'
  const options = crashingTargets(ctx)
  const preferred =
    options.find((o) => o.critical && ctx.tasks.find((t) => String(t.uid) === o.value)?.resources.some((r) => r.resource === 'Pedreiro')) ??
    options[0]
  const uid = p.targetUid ?? (preferred ? Number(preferred.value) : undefined)
  const target = ctx.tasks.find((t) => t.uid === uid && !t.isSummary && t.percentComplete === 0)
  if (!target || !mainTrade(target)) return notApplicable('crashing', title, 'Nenhuma tarefa não iniciada com equipe disponível para comprimir.', ctx)

  const trade = mainTrade(target)!
  const add = Math.max(0, Math.round(p.addOfficials))
  const addS = Math.max(0, Math.round(p.addServentes))
  if (add + addS === 0) return notApplicable('crashing', title, 'Informe ao menos 1 profissional adicional.', ctx)

  const mpd = minutosPorDiaDe(ctx)
  const prem = premissasDe(ctx)
  const congestionamento = 1 + prem.perdaCongestionamentoPct / 100 // 1 + 5/100 = 1,05
  const horas = horasPorDiaDe(ctx)
  const durDias = minutosParaDias(target.duracaoMin, mpd)
  const raw = (durDias * trade.units) / (trade.units + add)
  const newDuration = Math.max(1, Math.ceil(raw * congestionamento - 1e-9))
  const resources = target.resources.map((r) =>
    r.resource === trade.resource ? { ...r, units: r.units + add } : r.resource === 'Servente' ? { ...r, units: r.units + addS } : r,
  )
  if (!resources.some((r) => r.resource === 'Servente') && addS > 0) resources.push({ resource: 'Servente', units: addS })
  const patch: Partial<Task> = { duracaoMin: diasParaMinutos(newDuration, mpd), resources }
  const tasks = ctx.tasks.map((t) => (t.uid === target.uid ? { ...t, ...patch } : t))
  const { schedule } = reschedule(ctx, tasks, ctx.calendarios)
  const days = recovered(ctx, schedule.projectFinish)
  const critical = !!ctx.forecast.byUid.get(target.uid)?.critical

  const rateO = rateOf(prem, trade.resource)
  const rateS = rateOf(prem, 'Servente')
  const labor = (add * rateO + addS * rateS) * horas * newDuration
  const mobilization = prem.mobilizacaoPorProfissional * (add + addS)
  const extraCost = labor + mobilization
  const indirectSavings = Math.max(0, days) * prem.custoIndiretoDiario
  const density = (trade.units + add) / trade.units

  return comVersao(ctx, {
    kind: 'crashing',
    applicable: true,
    targetUid: target.uid,
    title,
    summary: `+${add} ${trade.resource.toLowerCase()}(s) e +${addS} servente(s) em "${shortName(target.name)}"`,
    daysRecovered: days,
    newFinish: schedule.projectFinish,
    extraCost,
    indirectSavings,
    netImpact: extraCost - indirectSavings,
    costPerDay: perDay(extraCost, days),
    risk: density > 1.6 ? 'Alto' : density > 1.35 ? 'Médio' : 'Baixo',
    riskNote: critical
      ? `A equipe passa a ${Math.round(density * 100)}% da original. Acima de ~135% a frente congestiona (perda de ${Math.round(prem.perdaCongestionamentoPct)}% já considerada).`
      : 'Atenção: a tarefa escolhida não está no caminho crítico — reduzir a duração dela não antecipa a entrega.',
    details: [
      { label: 'Duração', value: `${num(durDias)} → ${newDuration} dias úteis` },
      { label: 'Equipe', value: `${trade.units} → ${trade.units + add} ${trade.resource.toLowerCase()}(s)` },
      { label: 'Mão de obra extra', value: fmt(labor) },
      { label: 'Mobilização/EPI', value: fmt(mobilization) },
    ],
    memory: [
      `Duração nova = ⌈${num(durDias)} × ${trade.units} ÷ (${trade.units} + ${add}) × ${num(congestionamento)}⌉ = ⌈${num(raw * congestionamento)}⌉ = ${newDuration} d.u.`,
      `Mão de obra extra = (${add} × ${fmtRate(rateO)}/h + ${addS} × ${fmtRate(rateS)}/h) × ${num(horas)} h × ${newDuration} d = ${fmt(labor)}`,
      `Mobilização = ${add + addS} × ${fmt(prem.mobilizacaoPorProfissional)} = ${fmt(mobilization)}`,
      `CPM recalculado: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${days} d.u.)`,
      `Economia de indireto = ${Math.max(0, days)} d × ${fmt(prem.custoIndiretoDiario)} = ${fmt(indirectSavings)}`,
      memoriaPremissas(ctx.versaoPremissas, prem, ['perdaCongestionamentoPct', 'mobilizacaoPorProfissional', 'custoIndiretoDiario'], [trade.resource, 'Servente']),
    ],
    taskPatch: { uid: target.uid, patch },
  })
}

// ---------------------------------------------------------------- Fast tracking

/** Vínculos FS que podem virar SS (sucessora não iniciada). Alvenaria → elétrica e caminho crítico primeiro. */
export function fastTrackOptions(ctx: Ctx): ScenarioOption[] {
  const leaves = ctx.tasks.filter((t) => !t.isSummary)
  const byUid = new Map(leaves.map((t) => [t.uid, t]))
  const crit = (uid: number) => !!ctx.forecast.byUid.get(uid)?.critical
  const preferred = (pred: Task, succ: Task) => normalizeText(pred.name).includes('alvenaria') && normalizeText(succ.name).includes('eletric')
  return leaves
    .filter((t) => t.percentComplete === 0)
    .flatMap((succ) =>
      succ.predecessors
        .filter((l) => l.type === 'FS' && (byUid.get(l.uid)?.duracaoMin ?? 0) > 0)
        .map((l) => ({ pred: byUid.get(l.uid)!, succ })),
    )
    .sort(
      (a, b) =>
        Number(preferred(b.pred, b.succ)) - Number(preferred(a.pred, a.succ)) ||
        Number(crit(b.succ.uid) && crit(b.pred.uid)) - Number(crit(a.succ.uid) && crit(a.pred.uid)),
    )
    .map(({ pred, succ }) => ({
      value: `${pred.uid}>${succ.uid}`,
      label: `${pred.wbs} ${shortName(pred.name)} → ${succ.wbs} ${shortName(succ.name)}`,
      critical: crit(pred.uid) && crit(succ.uid),
    }))
}

export function simulateFastTracking(ctx: Ctx, p: ScenarioParams['fastTracking'] = DEFAULT_SCENARIO_PARAMS.fastTracking): ScenarioResult {
  const title = 'Fast Tracking (Paralelismo)'
  const chosen = p.predUid !== undefined && p.succUid !== undefined ? `${p.predUid}>${p.succUid}` : fastTrackOptions(ctx)[0]?.value
  const [predUid, succUid] = (chosen ?? '').split('>').map(Number)
  const pred = ctx.tasks.find((t) => t.uid === predUid)
  const succ = ctx.tasks.find((t) => t.uid === succUid)
  if (!pred || !succ || succ.percentComplete > 0 || !succ.predecessors.some((l) => l.uid === pred.uid && l.type === 'FS')) {
    return notApplicable('fast-tracking', title, 'Não há vínculo Término-Início (FS) disponível para paralelizar.', ctx)
  }

  const mpd = minutosPorDiaDe(ctx)
  const lag = Math.max(0, Math.round(p.lagDays))
  const antigo = succ.predecessors.find((l) => l.uid === pred.uid)?.lag
  // Vínculo de antes, em texto: "5" dias úteis vira " + 5" (e " + 5 d" na memória); dias corridos e % usam o rótulo ("+7dc", "+50%")
  const lagUtilAntigo = antigo?.tipo === 'util' && antigo.minutos !== 0 ? minutosParaDias(antigo.minutos, mpd) : 0
  const lagOutroAntigo = antigo && antigo.tipo !== 'util' ? rotuloLag(antigo, mpd) : ''
  const oldLagResumo = lagUtilAntigo ? ` + ${lagUtilAntigo}` : lagOutroAntigo ? ` ${lagOutroAntigo}` : ''
  const oldLagMemoria = lagUtilAntigo ? ` + ${lagUtilAntigo} d` : lagOutroAntigo ? ` ${lagOutroAntigo}` : ''
  const predecessors = succ.predecessors.map((l) =>
    l.uid === pred.uid ? { ...l, type: 'SS' as const, lag: { tipo: 'util' as const, minutos: diasParaMinutos(lag, mpd) } } : l,
  )
  const patch: Partial<Task> = { predecessors }
  const tasks = ctx.tasks.map((t) => (t.uid === succ.uid ? { ...t, ...patch } : t))
  const { schedule } = reschedule(ctx, tasks, ctx.calendarios)
  const days = recovered(ctx, schedule.projectFinish)

  const predSched = ctx.forecast.byUid.get(pred.uid)!
  const predDur = Math.max(1, minutosParaDias(predSched.duracaoMin, mpd))
  const overlap = Math.max(0, Math.min(1, (predDur - lag) / predDur))
  const risk: RiskLevel = overlap > 0.6 ? 'Alto' : overlap > 0.3 ? 'Médio' : 'Baixo'
  const prem = premissasDe(ctx)
  const contingency = succ.bac * (prem.contingenciaRetrabalhoPct / 100) * overlap // 4/100 = 0,04
  const indirectSavings = Math.max(0, days) * prem.custoIndiretoDiario

  return comVersao(ctx, {
    kind: 'fast-tracking',
    applicable: true,
    targetUid: succ.uid,
    predecessorUid: pred.uid,
    title,
    summary: `Vínculo ${pred.wbs} → ${succ.wbs}: FS${oldLagResumo} → SS + ${lag} dias`,
    daysRecovered: days,
    newFinish: schedule.projectFinish,
    extraCost: contingency,
    indirectSavings,
    netImpact: contingency - indirectSavings,
    costPerDay: perDay(contingency, days),
    risk,
    riskNote: `Sobreposição de ${Math.round(overlap * 100)}% entre as frentes: exige liberação por pavimento, marcação prévia dos pontos e conferência antes do fechamento para evitar retrabalho.`,
    details: [
      { label: 'Predecessora', value: `${pred.wbs} ${shortName(pred.name)}` },
      { label: 'Sobreposição', value: `${Math.round(overlap * 100)}% da duração` },
      { label: 'Contingência de retrabalho', value: fmt(contingency) },
    ],
    memory: [
      `Antes: início de ${succ.wbs} ≥ término de ${pred.wbs}${oldLagMemoria} (FS)`,
      `Depois: início de ${succ.wbs} ≥ início de ${pred.wbs} + ${lag} d (SS)`,
      `Sobreposição = (${predDur} − ${lag}) ÷ ${predDur} = ${Math.round(overlap * 100)}% da predecessora`,
      `Contingência de retrabalho = ${Math.round(prem.contingenciaRetrabalhoPct)}% × ${fmt(succ.bac)} × ${Math.round(overlap * 100)}% = ${fmt(contingency)}`,
      `CPM recalculado: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${days} d.u.)`,
      `Economia de indireto = ${Math.max(0, days)} d × ${fmt(prem.custoIndiretoDiario)} = ${fmt(indirectSavings)}`,
      memoriaPremissas(ctx.versaoPremissas, prem, ['contingenciaRetrabalhoPct', 'custoIndiretoDiario']),
    ],
    taskPatch: { uid: succ.uid, patch },
  })
}

// ---------------------------------------------------------------- Hora extra

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
/** "24/10 e 31/10", "24/10, 31/10 e 07/11". */
const listaDeDias = (ds: string[]) => (ds.length <= 1 ? ds.map(fmtDia).join('') : `${ds.slice(0, -1).map(fmtDia).join(', ')} e ${fmtDia(ds[ds.length - 1])}`)
const PREDEFINICAO_MEIO_PERIODO = 'quatro-horas' as const
const MAX_NOME_CALENDARIO_HE = 60

/** Os próximos sábados depois da data de status que não são úteis nem feriado (da obra ou exceção) no calendário padrão. */
function sabadosConvocados(ctx: Ctx, padrao: CalendarioObra, quantos: number): string[] {
  const cals = compilar(ctx, ctx.calendarios)
  const extras = diasExtrasDo(padrao)
  const feriados = padrao.excecoes.filter((ex) => ex.intervalos.length === 0).map((ex) => ex.data)
  return nextSaturdays(ctx.meta.statusDate, quantos + extras.length + 4)
    .filter((d) => !extras.includes(d) && !feriados.includes(d) && !(padrao.aplicaFeriadosObra && ctx.feriados && ehFeriadoDaObra(ctx.feriados, d)) && !cals.padrao.dataUtil(d))
    .slice(0, quantos)
}

/** A tarefa tem trabalho agendado nesse dia, nunca antes da data de status (o restante só começa depois dela). */
function agendadaNoDia(s: ScheduledTask, aposStatus: number, inicioDia: number): boolean {
  return !(Math.max(s.inicioCedoMin, aposStatus) >= inicioDia + MINUTOS_NO_DIA_CORRIDO || s.terminoCedoMin <= inicioDia)
}

/** Frentes (tarefas folha não concluídas) com trabalho agendado nos sábados convocados, antes da hora extra: críticas primeiro. */
export function overtimeTargets(ctx: Ctx, saturdays = DEFAULT_SCENARIO_PARAMS.overtime.saturdays): ScenarioOption[] {
  const padrao = ctx.calendarios.find((c) => c.uid === ctx.calendarioPadraoUid)
  if (!padrao) return []
  const days = sabadosConvocados(ctx, padrao, Math.max(1, Math.min(8, Math.round(saturdays))))
  const cals = compilar(ctx, ctx.calendarios)
  const crit = (t: Task) => !!ctx.forecast.byUid.get(t.uid)?.critical
  return ctx.tasks
    .filter((t) => {
      const s = ctx.forecast.byUid.get(t.uid)
      if (t.isSummary || t.percentComplete >= 100 || !s) return false
      const apos = cals.de(t.calendarioUid).proximoUtil((diaRelativo(cals.base, ctx.meta.statusDate) + 1) * MINUTOS_NO_DIA_CORRIDO)
      return days.some((d) => agendadaNoDia(s, apos, diaRelativo(cals.base, d) * MINUTOS_NO_DIA_CORRIDO))
    })
    .sort((a, b) => Number(crit(b)) - Number(crit(a)) || ctx.forecast.byUid.get(a.uid)!.inicioCedoMin - ctx.forecast.byUid.get(b.uid)!.inicioCedoMin)
    .map((t) => ({ value: String(t.uid), label: `${t.wbs} ${shortName(t.name)}`, critical: crit(t) }))
}

/**
 * Hora extra nos sábados (RF-03.6). Dois modos:
 * - `'todas'` (padrão): os sábados entram como exceção útil no calendário padrão (todas as tarefas do padrão); tarefas com calendário
 *   próprio não são convocadas;
 * - lista de frentes: cada calendário base das frentes escolhidas ganha uma cópia ("derivada") com os sábados como exceção útil, atribuída
 *   só às escolhidas ativas num sábado convocado no cronograma de hoje; sábado que o calendário base já trabalha não é hora extra.
 * Custo = Σ por sábado e por frente convocada ativa no sábado: unidades × horas do sábado (8 ou 4) × taxa × (1 + adicional).
 */
export function simulateOvertime(ctx: Ctx, p: ScenarioParams['overtime'] = DEFAULT_SCENARIO_PARAMS.overtime): ScenarioResult {
  const title = 'Hora Extra (Sábados)'
  const wanted = Math.max(1, Math.min(8, Math.round(p.saturdays)))
  const jornada = p.jornada ?? 'integral'
  const frentes = p.frentes ?? 'todas'
  const padrao = ctx.calendarios.find((c) => c.uid === ctx.calendarioPadraoUid)
  if (!padrao) return notApplicable('overtime', title, 'O calendário padrão da obra não existe.', ctx)
  const days = sabadosConvocados(ctx, padrao, wanted)
  if (!days.length) return notApplicable('overtime', title, 'Os próximos sábados já estão no calendário de trabalho.', ctx)

  const cals0 = compilar(ctx, ctx.calendarios)
  const prem = premissasDe(ctx)
  const adicional = prem.adicionalHoraExtraPct / 100 // 50/100 = 0,5
  const expediente = jornada === 'meio' ? intervalosDaPredefinicao(PREDEFINICAO_MEIO_PERIODO) : undefined // sem valor: o expediente do dia útil
  // Horas do sábado: integral = jornada do calendário (minutos por dia ÷ 60); meio período = 4 h (08:00–12:00)
  const horas = jornada === 'meio' ? 4 : horasPorDiaDe(ctx)
  const diaStatus = diaRelativo(cals0.base, ctx.meta.statusDate)
  const inicioDe = (d: string) => diaRelativo(cals0.base, d) * MINUTOS_NO_DIA_CORRIDO

  let calendarios = ctx.calendarios
  let tarefas = ctx.tasks
  const novos: CalendarioObra[] = []
  const atribuicoes: { uid: number; calendarioUid: number }[] = []
  const naoConvocadas: number[] = []
  /** Tarefas cobradas e os sábados que são hora extra para cada uma. */
  let participantes: { t: Task; dias: string[] }[]
  const folhas = ctx.tasks.filter((x) => !x.isSummary)

  if (frentes === 'todas') {
    // Hora extra = dia útil extra (exceção útil) no calendário padrão; só as tarefas do calendário padrão são convocadas
    calendarios = ctx.calendarios.map((c) => (c.uid === padrao.uid ? comDiasExtras(c, days, expediente) : c))
    participantes = folhas.filter((t) => (t.calendarioUid ?? padrao.uid) === padrao.uid).map((t) => ({ t, dias: days }))
  } else {
    const uids = new Set(frentes)
    const escolhidas = folhas.filter((t) => uids.has(t.uid))
    if (!escolhidas.length) return notApplicable('overtime', title, 'Escolha ao menos uma frente (tarefa) para a hora extra.', ctx)
    // Ativa = com trabalho agendado em ao menos um sábado convocado, no cronograma de hoje (antes da hora extra)
    const ativas = escolhidas.filter((t) => {
      const s = ctx.forecast.byUid.get(t.uid)
      if (!s || t.percentComplete >= 100) return false
      const apos = cals0.de(t.calendarioUid).proximoUtil((diaStatus + 1) * MINUTOS_NO_DIA_CORRIDO)
      return days.some((d) => agendadaNoDia(s, apos, inicioDe(d)))
    })
    if (!ativas.length) return notApplicable('overtime', title, `Nenhuma frente escolhida trabalha nos sábados convocados (${days.map(fmtDia).join(', ')}).`, ctx)
    // Sábado que o calendário base da frente já trabalha não é hora extra para ela (sem custo e sem ganho)
    const baseDe = (t: Task) => t.calendarioUid ?? padrao.uid
    const diasHE = (t: Task) => days.filter((d) => !cals0.de(baseDe(t)).dataUtil(d))
    const convocadas = ativas.filter((t) => diasHE(t).length > 0)
    if (!convocadas.length) return notApplicable('overtime', title, 'Os sábados convocados já são úteis no calendário das frentes escolhidas.', ctx)
    for (const t of escolhidas) if (!convocadas.includes(t)) naoConvocadas.push(t.uid)

    const derivadoDe = new Map<number, CalendarioObra>()
    for (const t of convocadas) {
      const base = ctx.calendarios.find((c) => c.uid === baseDe(t)) ?? padrao
      if (!derivadoDe.has(base.uid)) {
        const diasBase = days.filter((d) => !cals0.de(base.uid).dataUtil(d))
        const sufixo = ` + HE ${listaDeDias(diasBase)}`
        const nome = base.nome.length + sufixo.length <= MAX_NOME_CALENDARIO_HE ? `${base.nome}${sufixo}` : `${base.nome.slice(0, MAX_NOME_CALENDARIO_HE - 18)} + HE (${diasBase.length} sáb.)`
        const uid = proximoUidCalendario([...ctx.calendarios, ...novos])
        const derivado = comDiasExtras({ ...copiarCalendario(base, uid, nome), derivadoDe: base.uid, origem: 'hora-extra' }, diasBase, expediente ?? expedienteDoDiaUtil(base))
        novos.push(derivado)
        derivadoDe.set(base.uid, derivado)
      }
      atribuicoes.push({ uid: t.uid, calendarioUid: derivadoDe.get(baseDe(t))!.uid })
    }
    calendarios = [...ctx.calendarios, ...novos]
    tarefas = ctx.tasks.map((t) => {
      const a = atribuicoes.find((x) => x.uid === t.uid)
      return a ? { ...t, calendarioUid: a.calendarioUid } : t
    })
    participantes = convocadas.map((t) => ({ t: tarefas.find((x) => x.uid === t.uid)!, dias: diasHE(t) }))
  }

  const { cals, schedule } = reschedule(ctx, tarefas, calendarios)
  const gained = recovered({ ...ctx, calendarios }, schedule.projectFinish)

  // Custo de HE: cada frente convocada ativa no sábado (o intervalo agendado cruza o expediente do sábado no calendário dela, nunca antes da
  // data de status); a equipe inteira é convocada para o expediente do sábado
  let overtimeCost = 0
  let workers = 0
  const byTask = new Map<string, number>()
  for (const { t, dias } of participantes) {
    const s = schedule.byUid.get(t.uid)
    if (!s) continue
    const cal = cals.de(t.calendarioUid)
    const apos = cal.proximoUtil((diaStatus + 1) * MINUTOS_NO_DIA_CORRIDO)
    for (const day of dias) {
      const inicioDia = inicioDe(day)
      const de = Math.max(s.inicioCedoMin, apos, inicioDia)
      const ate = Math.min(s.terminoCedoMin, inicioDia + MINUTOS_NO_DIA_CORRIDO)
      if (!(ate > de && cal.minutosUteisEntre(de, ate) > 0)) continue
      for (const r of t.resources) {
        const c = r.units * horas * rateOf(prem, r.resource) * (1 + adicional)
        overtimeCost += c
        workers += r.units
        byTask.set(t.wbs, (byTask.get(t.wbs) ?? 0) + c)
      }
    }
  }
  const indirectSavings = Math.max(0, gained) * prem.custoIndiretoDiario
  const net = overtimeCost - indirectSavings
  const escolhidasNoCritico = frentes !== 'todas' && frentes.some((u) => ctx.forecast.byUid.get(u)?.critical)
  const nomeFrentes = (uids: number[]) => uids.map((u) => ctx.tasks.find((t) => t.uid === u)?.wbs ?? String(u)).join(', ')
  const memoriaFrentes =
    frentes === 'todas'
      ? ctx.tasks.some((t) => !t.isSummary && t.percentComplete < 100 && t.calendarioUid !== undefined && t.calendarioUid !== padrao.uid)
        ? ['As tarefas com calendário próprio não são convocadas: os sábados entram só no calendário padrão.']
        : []
      : [
          `Frentes convocadas: ${nomeFrentes(atribuicoes.map((a) => a.uid)) || '—'}${naoConvocadas.length ? `; não convocadas (sem trabalho nos sábados convocados ou já trabalham neles): ${nomeFrentes(naoConvocadas)}` : ''}`,
          ...novos.map((c) => `Calendário derivado "${c.nome}" (UID ${c.uid}) atribuído a ${nomeFrentes(atribuicoes.filter((a) => a.calendarioUid === c.uid).map((a) => a.uid))}`),
        ]

  return comVersao(ctx, {
    kind: 'overtime',
    applicable: true,
    title,
    summary:
      `Trabalho em ${days.length} sábado(s): ${days.map(fmtDia).join(', ')} (${num(horas)} h, adicional de ${num(prem.adicionalHoraExtraPct)}%)` +
      (frentes === 'todas' ? '' : ` nas frentes ${nomeFrentes(atribuicoes.map((a) => a.uid))}`),
    daysRecovered: gained,
    newFinish: schedule.projectFinish,
    extraCost: overtimeCost,
    indirectSavings,
    netImpact: net,
    costPerDay: perDay(overtimeCost, gained),
    risk: days.length > 4 ? 'Alto' : net > 0 ? 'Médio' : 'Baixo',
    riskNote:
      (frentes === 'todas'
        ? 'Sábados aplicados ao calendário do projeto (todas as frentes ativas do calendário padrão são convocadas).'
        : `Sábados aplicados só às frentes escolhidas (calendário derivado).${gained <= 0 && !escolhidasNoCritico ? ' Atenção: nenhuma frente escolhida está no caminho crítico — a hora extra não antecipa a entrega.' : ''}`) +
      (days.length > 4 ? ' Mais de 4 sábados seguidos aumentam fadiga e risco de acidente.' : '') +
      ' Validar acordo de compensação/convenção coletiva com RH e Jurídico.',
    details: [
      { label: 'Profissionais-dia convocados', value: `${Math.round(workers)}` },
      { label: 'Custo HE (com adicional)', value: fmt(overtimeCost) },
      { label: 'Economia de indireto', value: fmt(indirectSavings) },
    ],
    memory: [
      `Custo HE = Σ profissionais × ${num(horas)} h × taxa × ${num(1 + adicional)} = ${fmt(overtimeCost)}`,
      ...[...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([wbs, c]) => `   · frente ${wbs}: ${fmt(c)}`),
      ...memoriaFrentes,
      `CPM recalculado com ${days.length} dia(s) útil(eis) a mais${jornada === 'meio' ? ' (meio período: 4 h)' : ''}: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${gained} d.u.)`,
      `Economia de indireto = ${Math.max(0, gained)} d × ${fmt(prem.custoIndiretoDiario)} = ${fmt(indirectSavings)}`,
      memoriaPremissas(ctx.versaoPremissas, prem, ['adicionalHoraExtraPct', 'custoIndiretoDiario'], [...new Set(ctx.tasks.flatMap((t) => t.resources.map((r) => r.resource)))]),
    ],
    ...(frentes === 'todas' ? { addedWorkingDays: days } : {}),
    horaExtra: { jornada, dias: days, calendariosNovos: novos, atribuicoes, naoConvocadas },
  })
}

export function simulateAll(ctx: Ctx, params: ScenarioParams = DEFAULT_SCENARIO_PARAMS): Record<ScenarioKind, ScenarioResult> {
  return {
    crashing: simulateCrashing(ctx, params.crashing),
    'fast-tracking': simulateFastTracking(ctx, params.fastTracking),
    overtime: simulateOvertime(ctx, params.overtime),
  }
}

export interface ScenarioRecommendation {
  kind?: ScenarioKind
  reason: string
}

/**
 * Heurística de recomendação (opinião de projeto, não norma): entre os cenários que recuperam prazo,
 * prefere risco Baixo/Médio e o menor saldo financeiro (custo extra − economia de indireto).
 */
export function recommendScenario(results: Record<ScenarioKind, ScenarioResult>, applied: ScenarioKind[] = []): ScenarioRecommendation {
  const viable = Object.values(results).filter((r) => r.applicable && r.daysRecovered > 0 && !applied.includes(r.kind))
  if (!viable.length) return { reason: 'Nenhum cenário disponível recupera prazo nas condições atuais.' }
  const safe = viable.filter((r) => r.risk !== 'Alto')
  const pool = safe.length ? safe : viable
  const best = [...pool].sort((a, b) => a.netImpact - b.netImpact || b.daysRecovered - a.daysRecovered)[0]
  const why =
    best.netImpact <= 0
      ? `recupera ${best.daysRecovered} d.u. e economiza ${fmt(-best.netImpact)} líquidos`
      : `recupera ${best.daysRecovered} d.u. pelo menor custo líquido (${fmt(best.netImpact)})`
  const riskier = viable.filter((r) => r.risk === 'Alto' && r.daysRecovered > best.daysRecovered)
  return {
    kind: best.kind,
    reason: `${best.title}: ${why}, risco ${best.risk.toLowerCase()}.${safe.length && riskier.length ? ` ${riskier.map((r) => r.title).join(' e ')} recupera mais dias, porém com risco alto.` : ''}`,
  }
}
