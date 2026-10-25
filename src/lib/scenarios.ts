// Efeito dominó e simulador de recuperação (Crashing, Fast Tracking e Hora Extra).
import type { ProjectMeta, ScenarioKind, ScheduleResult, Task, WorkCalendarConfig } from '@/types/domain'
import { HOURLY_RATES } from '@/data/seed'
import { WorkCalendar, diffCalendarDays, nextSaturdays } from './calendar'
import { computeSchedule, downstreamOf } from './cpm'
import { normalizeText } from './wbs'

export const CONGESTION_FACTOR = 1.05 // perda de produtividade por adensamento da frente
export const MOBILIZATION_PER_WORKER = 1200 // integração, EPI, exames (R$/profissional)
export const OVERTIME_PREMIUM = 0.5 // adicional de 50% (validar convenção coletiva com RH/Jurídico)
export const REWORK_CONTINGENCY = 0.04 // % do BAC da sucessora reservado para retrabalho no paralelismo

export const rateOf = (resource: string) => (HOURLY_RATES as Record<string, number>)[resource] ?? 30

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
      return pa - pb || forecast.byUid.get(a.uid)!.es - forecast.byUid.get(b.uid)!.es
    })
  const origin = candidates[0]

  const affected: AffectedTask[] = origin
    ? downstreamOf(leaves, origin.uid)
        .map((uid) => ({ uid, shiftDays: late(leaves.find((t) => t.uid === uid)!), critical: !!forecast.byUid.get(uid)?.critical }))
        .filter((a) => a.shiftDays > 0)
        .sort((a, b) => forecast.byUid.get(a.uid)!.es - forecast.byUid.get(b.uid)!.es)
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
  overtime: { saturdays: number }
}

export const DEFAULT_SCENARIO_PARAMS: ScenarioParams = {
  crashing: { addOfficials: 2, addServentes: 1 },
  fastTracking: { lagDays: 3 },
  overtime: { saturdays: 2 },
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
  /** Alterações a aplicar no estado se o engenheiro aprovar. */
  taskPatch?: { uid: number; patch: Partial<Task> }
  addedWorkingDays?: string[]
}

export interface ScenarioOption {
  value: string
  label: string
  critical: boolean
}

interface Ctx {
  tasks: Task[]
  calendar: WorkCalendarConfig
  meta: ProjectMeta
  forecast: ScheduleResult
  origin?: Task
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtRate = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const num = (v: number, d = 2) => v.toLocaleString('pt-BR', { maximumFractionDigits: d })
const br = (iso: string) => iso.split('-').reverse().join('/')
const shortName = (name: string) =>
  name.replace('Alvenaria de vedação bloco cerâmico 14x19x29', 'Alvenaria').replace('Estrutura de concreto armado fck 30', 'Estrutura')

function reschedule(ctx: Ctx, tasks: Task[], calendar: WorkCalendarConfig) {
  const cal = new WorkCalendar(ctx.meta.startDate, calendar)
  return { cal, schedule: computeSchedule(tasks, cal, { mode: 'forecast', statusDate: ctx.meta.statusDate }) }
}

function recovered(ctx: Ctx, newFinish: string): number {
  const cal = new WorkCalendar(ctx.meta.startDate, ctx.calendar)
  return workingVariance(cal, newFinish, ctx.forecast.projectFinish)
}

const notApplicable = (kind: ScenarioKind, title: string, reason: string, ctx: Ctx): ScenarioResult => ({
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
  const leaves = ctx.tasks.filter((t) => !t.isSummary && t.percentComplete === 0 && t.durationDays > 1 && mainTrade(t))
  const downstream = new Set(ctx.origin ? downstreamOf(ctx.tasks.filter((t) => !t.isSummary), ctx.origin.uid) : [])
  const crit = (t: Task) => !!ctx.forecast.byUid.get(t.uid)?.critical
  return leaves
    .sort(
      (a, b) =>
        Number(crit(b)) - Number(crit(a)) ||
        Number(downstream.has(b.uid)) - Number(downstream.has(a.uid)) ||
        ctx.forecast.byUid.get(a.uid)!.es - ctx.forecast.byUid.get(b.uid)!.es,
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

  const raw = (target.durationDays * trade.units) / (trade.units + add)
  const newDuration = Math.max(1, Math.ceil(raw * CONGESTION_FACTOR - 1e-9))
  const resources = target.resources.map((r) =>
    r.resource === trade.resource ? { ...r, units: r.units + add } : r.resource === 'Servente' ? { ...r, units: r.units + addS } : r,
  )
  if (!resources.some((r) => r.resource === 'Servente') && addS > 0) resources.push({ resource: 'Servente', units: addS })
  const patch: Partial<Task> = { durationDays: newDuration, resources }
  const tasks = ctx.tasks.map((t) => (t.uid === target.uid ? { ...t, ...patch } : t))
  const { schedule } = reschedule(ctx, tasks, ctx.calendar)
  const days = recovered(ctx, schedule.projectFinish)
  const critical = !!ctx.forecast.byUid.get(target.uid)?.critical

  const rateO = rateOf(trade.resource)
  const rateS = rateOf('Servente')
  const labor = (add * rateO + addS * rateS) * 8 * newDuration
  const mobilization = MOBILIZATION_PER_WORKER * (add + addS)
  const extraCost = labor + mobilization
  const indirectSavings = Math.max(0, days) * ctx.meta.dailyIndirectCost
  const density = (trade.units + add) / trade.units

  return {
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
      ? `A equipe passa a ${Math.round(density * 100)}% da original. Acima de ~135% a frente congestiona (perda de ${Math.round((CONGESTION_FACTOR - 1) * 100)}% já considerada).`
      : 'Atenção: a tarefa escolhida não está no caminho crítico — reduzir a duração dela não antecipa a entrega.',
    details: [
      { label: 'Duração', value: `${target.durationDays} → ${newDuration} dias úteis` },
      { label: 'Equipe', value: `${trade.units} → ${trade.units + add} ${trade.resource.toLowerCase()}(s)` },
      { label: 'Mão de obra extra', value: fmt(labor) },
      { label: 'Mobilização/EPI', value: fmt(mobilization) },
    ],
    memory: [
      `Duração nova = ⌈${target.durationDays} × ${trade.units} ÷ (${trade.units} + ${add}) × ${num(CONGESTION_FACTOR)}⌉ = ⌈${num(raw * CONGESTION_FACTOR)}⌉ = ${newDuration} d.u.`,
      `Mão de obra extra = (${add} × ${fmtRate(rateO)}/h + ${addS} × ${fmtRate(rateS)}/h) × 8 h × ${newDuration} d = ${fmt(labor)}`,
      `Mobilização = ${add + addS} × ${fmt(MOBILIZATION_PER_WORKER)} = ${fmt(mobilization)}`,
      `CPM recalculado: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${days} d.u.)`,
      `Economia de indireto = ${Math.max(0, days)} d × ${fmt(ctx.meta.dailyIndirectCost)} = ${fmt(indirectSavings)}`,
    ],
    taskPatch: { uid: target.uid, patch },
  }
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
        .filter((l) => l.type === 'FS' && (byUid.get(l.uid)?.durationDays ?? 0) > 0)
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

  const lag = Math.max(0, Math.round(p.lagDays))
  const oldLag = succ.predecessors.find((l) => l.uid === pred.uid)?.lagDays ?? 0
  const predecessors = succ.predecessors.map((l) => (l.uid === pred.uid ? { ...l, type: 'SS' as const, lagDays: lag } : l))
  const patch: Partial<Task> = { predecessors }
  const tasks = ctx.tasks.map((t) => (t.uid === succ.uid ? { ...t, ...patch } : t))
  const { schedule } = reschedule(ctx, tasks, ctx.calendar)
  const days = recovered(ctx, schedule.projectFinish)

  const predSched = ctx.forecast.byUid.get(pred.uid)!
  const predDur = Math.max(1, predSched.ef - predSched.es)
  const overlap = Math.max(0, Math.min(1, (predDur - lag) / predDur))
  const risk: RiskLevel = overlap > 0.6 ? 'Alto' : overlap > 0.3 ? 'Médio' : 'Baixo'
  const contingency = succ.bac * REWORK_CONTINGENCY * overlap
  const indirectSavings = Math.max(0, days) * ctx.meta.dailyIndirectCost

  return {
    kind: 'fast-tracking',
    applicable: true,
    targetUid: succ.uid,
    predecessorUid: pred.uid,
    title,
    summary: `Vínculo ${pred.wbs} → ${succ.wbs}: FS${oldLag ? ` + ${oldLag}` : ''} → SS + ${lag} dias`,
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
      `Antes: início de ${succ.wbs} ≥ término de ${pred.wbs}${oldLag ? ` + ${oldLag} d` : ''} (FS)`,
      `Depois: início de ${succ.wbs} ≥ início de ${pred.wbs} + ${lag} d (SS)`,
      `Sobreposição = (${predDur} − ${lag}) ÷ ${predDur} = ${Math.round(overlap * 100)}% da predecessora`,
      `Contingência de retrabalho = ${Math.round(REWORK_CONTINGENCY * 100)}% × ${fmt(succ.bac)} × ${Math.round(overlap * 100)}% = ${fmt(contingency)}`,
      `CPM recalculado: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${days} d.u.)`,
    ],
    taskPatch: { uid: succ.uid, patch },
  }
}

// ---------------------------------------------------------------- Hora extra

export function simulateOvertime(ctx: Ctx, p: ScenarioParams['overtime'] = DEFAULT_SCENARIO_PARAMS.overtime): ScenarioResult {
  const title = 'Hora Extra (Sábados)'
  const wanted = Math.max(1, Math.min(8, Math.round(p.saturdays)))
  const days = nextSaturdays(ctx.meta.statusDate, wanted + ctx.calendar.extraWorkingDays.length + 4)
    .filter((d) => !ctx.calendar.extraWorkingDays.includes(d) && !ctx.calendar.holidays.includes(d))
    .slice(0, wanted)
  if (!days.length) return notApplicable('overtime', title, 'Os próximos sábados já estão no calendário de trabalho.', ctx)

  const calendar = { ...ctx.calendar, extraWorkingDays: [...ctx.calendar.extraWorkingDays, ...days].sort() }
  const { cal, schedule } = reschedule(ctx, ctx.tasks, calendar)
  const gained = recovered(ctx, schedule.projectFinish)
  const dataIdx = cal.indexOnOrBefore(ctx.meta.statusDate) + 1

  // Custo de HE: todas as equipes com frente ativa nos sábados convocados
  let overtimeCost = 0
  let workers = 0
  const byTask = new Map<string, number>()
  for (const day of days) {
    const idx = cal.indexOnOrAfter(day)
    for (const t of ctx.tasks.filter((x) => !x.isSummary)) {
      const s = schedule.byUid.get(t.uid)
      if (!s || idx < Math.max(s.es, dataIdx) || idx >= s.ef) continue
      for (const r of t.resources) {
        const c = r.units * 8 * rateOf(r.resource) * (1 + OVERTIME_PREMIUM)
        overtimeCost += c
        workers += r.units
        byTask.set(t.wbs, (byTask.get(t.wbs) ?? 0) + c)
      }
    }
  }
  const indirectSavings = Math.max(0, gained) * ctx.meta.dailyIndirectCost
  const net = overtimeCost - indirectSavings
  const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

  return {
    kind: 'overtime',
    applicable: true,
    title,
    summary: `Trabalho em ${days.length} sábado(s): ${days.map(fmtDay).join(', ')} (8 h, adicional de ${OVERTIME_PREMIUM * 100}%)`,
    daysRecovered: gained,
    newFinish: schedule.projectFinish,
    extraCost: overtimeCost,
    indirectSavings,
    netImpact: net,
    costPerDay: perDay(overtimeCost, gained),
    risk: days.length > 4 ? 'Alto' : net > 0 ? 'Médio' : 'Baixo',
    riskNote: `Sábados aplicados ao calendário do projeto (todas as frentes ativas são convocadas).${days.length > 4 ? ' Mais de 4 sábados seguidos aumentam fadiga e risco de acidente.' : ''} Validar acordo de compensação/convenção coletiva com RH e Jurídico.`,
    details: [
      { label: 'Profissionais-dia convocados', value: `${Math.round(workers)}` },
      { label: 'Custo HE (com adicional)', value: fmt(overtimeCost) },
      { label: 'Economia de indireto', value: fmt(indirectSavings) },
    ],
    memory: [
      `Custo HE = Σ profissionais × 8 h × taxa × ${num(1 + OVERTIME_PREMIUM)} = ${fmt(overtimeCost)}`,
      ...[...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([wbs, c]) => `   · frente ${wbs}: ${fmt(c)}`),
      `CPM recalculado com ${days.length} dia(s) útil(eis) a mais: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${gained} d.u.)`,
      `Economia de indireto = ${Math.max(0, gained)} d × ${fmt(ctx.meta.dailyIndirectCost)} = ${fmt(indirectSavings)}`,
    ],
    addedWorkingDays: days,
  }
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
