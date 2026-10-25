// Efeito dominó e simulador de recuperação (Crashing, Fast Tracking e Hora Extra).
import type { CalendarioObra, ConfigFeriadosObra, IntervaloTrabalho, PremissasObra, ProjectMeta, ScenarioKind, ScheduleResult, ScheduledTask, Task, VersaoPremissas } from '@/types/domain'
import { WorkCalendar, diffCalendarDays, nextSaturdays } from './calendar'
import {
  MAX_CALENDARIOS,
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
import { configFeriadosPadrao, criarFeriadosPorAno, ehFeriadoDaObra } from './feriadosObra'
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
    /** Voltas do ajuste dos sábados por frente (0 no modo "todas"). */
    voltas?: number
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
  /** Feriados da obra (aplicados aos calendários com `aplicaFeriadosObra`); ausente = a configuração padrão (nacionais, Carnaval e Corpus Christi), como na compilação. */
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

/** Feriados efetivos da obra: sem configuração informada vale a padrão, o mesmo critério da compilação dos calendários. */
const feriadosEfetivos = (ctx: Ctx): ConfigFeriadosObra => ctx.feriados ?? configFeriadosPadrao()

/** O dia é feriado nesse calendário: exceção não útil própria ou feriado da obra (se o calendário os aplica). */
function ehFeriadoNoCalendario(ctx: Ctx, cal: CalendarioObra, dia: string): boolean {
  if (cal.excecoes.some((e) => e.data === dia && e.intervalos.length === 0)) return true
  return !!cal.aplicaFeriadosObra && ehFeriadoDaObra(feriadosEfetivos(ctx), dia)
}

/** Os próximos sábados depois da data de status que não são úteis nem feriado (da obra ou exceção) no calendário padrão. */
function sabadosConvocados(ctx: Ctx, padrao: CalendarioObra, quantos: number): string[] {
  const cals = compilar(ctx, ctx.calendarios)
  const extras = diasExtrasDo(padrao)
  return nextSaturdays(ctx.meta.statusDate, quantos + extras.length + 4)
    .filter((d) => !extras.includes(d) && !ehFeriadoNoCalendario(ctx, padrao, d) && !cals.padrao.dataUtil(d))
    .slice(0, quantos)
}

/** A tarefa tem trabalho agendado nesse dia, nunca antes da data de status (o restante só começa depois dela). */
function agendadaNoDia(s: ScheduledTask, aposStatus: number, inicioDia: number): boolean {
  return !(Math.max(s.inicioCedoMin, aposStatus) >= inicioDia + MINUTOS_NO_DIA_CORRIDO || s.terminoCedoMin <= inicioDia)
}

type Compilados = ReturnType<typeof compilar>

/**
 * Minutos úteis que a tarefa (já com o calendário da hipótese) trabalha nesse sábado depois da hora extra: o intervalo agendado, nunca antes da
 * data de status, cruzado com o expediente do sábado no calendário dela. Zero = a frente não trabalha nesse sábado.
 */
function minutosNoSabadoDepois(ctx: Ctx, t: Task, dia: string, schedule: ScheduleResult, cals: Compilados): number {
  const s = schedule.byUid.get(t.uid)
  if (!s) return 0
  const cal = cals.de(t.calendarioUid)
  const apos = cal.proximoUtil((diaRelativo(cals.base, ctx.meta.statusDate) + 1) * MINUTOS_NO_DIA_CORRIDO)
  const inicioDia = diaRelativo(cals.base, dia) * MINUTOS_NO_DIA_CORRIDO
  const de = Math.max(s.inicioCedoMin, apos, inicioDia)
  const ate = Math.min(s.terminoCedoMin, inicioDia + MINUTOS_NO_DIA_CORRIDO)
  return ate > de ? cal.minutosUteisEntre(de, ate) : 0
}

/** Nome do calendário derivado: cabe em 60 caracteres e é único na obra (sufixo "(2)", "(3)"… se já existir). */
function nomeDoDerivado(baseNome: string, sufixo: string, nDias: number, existentes: string[]): string {
  const nome = baseNome.length + sufixo.length <= MAX_NOME_CALENDARIO_HE ? `${baseNome}${sufixo}` : `${baseNome.slice(0, MAX_NOME_CALENDARIO_HE - 18)} + HE (${nDias} sáb.)`
  const usados = new Set(existentes.map((n) => n.trim().toLowerCase()))
  let candidato = nome
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) {
    const suf = ` (${n})`
    candidato = `${nome.slice(0, MAX_NOME_CALENDARIO_HE - suf.length)}${suf}`
  }
  return candidato
}

const baseUidDe = (padrao: CalendarioObra, t: Task) => t.calendarioUid ?? padrao.uid
const baseCalDe = (ctx: Ctx, padrao: CalendarioObra, t: Task) => ctx.calendarios.find((c) => c.uid === baseUidDe(padrao, t)) ?? padrao

/**
 * Sábados candidatos da frente: o calendário base não trabalha neles (já útil = jornada normal, sem custo e sem ganho) e eles não são feriado
 * nesse calendário (trabalho em feriado tem regra própria: RH e Jurídico).
 */
function diasBaseDe(ctx: Ctx, padrao: CalendarioObra, cals0: Compilados, days: string[], t: Task): string[] {
  return days.filter((d) => !cals0.de(baseUidDe(padrao, t)).dataUtil(d) && !ehFeriadoNoCalendario(ctx, baseCalDe(ctx, padrao, t), d))
}

interface MontagemHE {
  criados: CalendarioObra[]
  atribuidos: { uid: number; calendarioUid: number }[]
  calendarios: CalendarioObra[]
  tarefas: Task[]
}

/** Um calendário derivado por calendário base e conjunto de sábados (nome único, UID = maior + 1), atribuído às frentes do `mapa`. */
function montarDerivados(ctx: Ctx, padrao: CalendarioObra, alvos: Task[], mapa: Map<number, string[]>, expediente: IntervaloTrabalho[] | undefined): MontagemHE {
  const derivados = new Map<string, CalendarioObra>()
  const criados: CalendarioObra[] = []
  const atribuidos: { uid: number; calendarioUid: number }[] = []
  for (const t of alvos) {
    const dias = mapa.get(t.uid)
    if (!dias) continue
    const base = baseCalDe(ctx, padrao, t)
    const chave = `${base.uid}|${dias.join(',')}`
    if (!derivados.has(chave)) {
      const nome = nomeDoDerivado(base.nome, ` + HE ${listaDeDias(dias)}`, dias.length, [...ctx.calendarios, ...criados].map((c) => c.nome))
      const uid = proximoUidCalendario([...ctx.calendarios, ...criados])
      const derivado = comDiasExtras({ ...copiarCalendario(base, uid, nome), derivadoDe: base.uid, origem: 'hora-extra' }, dias, expediente ?? expedienteDoDiaUtil(base))
      criados.push(derivado)
      derivados.set(chave, derivado)
    }
    atribuidos.push({ uid: t.uid, calendarioUid: derivados.get(chave)!.uid })
  }
  const porUid = new Map(atribuidos.map((a) => [a.uid, a.calendarioUid]))
  return {
    criados,
    atribuidos,
    calendarios: [...ctx.calendarios, ...criados],
    tarefas: ctx.tasks.map((x) => (porUid.has(x.uid) ? { ...x, calendarioUid: porUid.get(x.uid) } : x)),
  }
}

/** Sábados dos pares (frente, sábado) ainda candidatos. */
const totalDePares = (mapa: Map<number, string[]>) => [...mapa.values()].reduce((n, d) => n + d.length, 0)

/**
 * Ponto fixo dos sábados por frente. Parte da hipótese máxima (todos os sábados candidatos já no calendário de cada frente) e tira, até
 * estabilizar, os sábados em que a frente não trabalha DEPOIS da hora extra (o lag que chega a ela só conta o sábado em que ela trabalha: sem
 * ganho de lag sem custo). Cada volta que muda tira ao menos um par (frente, sábado): o teto de voltas é o total de pares mais a volta de
 * conferência. `mapa` é alterado no lugar; `montado` corresponde ao `mapa` final.
 */
function ajustarSabadosPorFrente(ctx: Ctx, padrao: CalendarioObra, alvos: Task[], mapa: Map<number, string[]>, expediente: IntervaloTrabalho[] | undefined) {
  const teto = totalDePares(mapa)
  let montado = montarDerivados(ctx, padrao, alvos, mapa, expediente)
  let voltas = 0
  let estabilizou = false
  for (let volta = 1; volta <= teto + 1 && mapa.size; volta++) {
    voltas = volta
    const { cals, schedule } = reschedule(ctx, montado.tarefas, montado.calendarios)
    let mudou = false
    for (const [uid, dias] of [...mapa]) {
      const t = montado.tarefas.find((x) => x.uid === uid)!
      const ativos = dias.filter((d) => minutosNoSabadoDepois(ctx, t, d, schedule, cals) > 0)
      if (ativos.length === dias.length) continue
      mudou = true
      if (ativos.length) mapa.set(uid, ativos)
      else mapa.delete(uid)
    }
    if (!mudou) {
      estabilizou = true
      break
    }
    if (mapa.size) montado = montarDerivados(ctx, padrao, alvos, mapa, expediente)
  }
  return { montado, voltas, estabilizou }
}

/**
 * Frentes (tarefas folha não concluídas) com trabalho nos sábados convocados, avaliadas com esses sábados JÁ no calendário de cada frente
 * (hipótese máxima: a frente pode começar a trabalhar no sábado por causa da hora extra); críticas primeiro.
 */
export function overtimeTargets(ctx: Ctx, saturdays = DEFAULT_SCENARIO_PARAMS.overtime.saturdays): ScenarioOption[] {
  const padrao = ctx.calendarios.find((c) => c.uid === ctx.calendarioPadraoUid)
  if (!padrao) return []
  const days = sabadosConvocados(ctx, padrao, Math.max(1, Math.min(8, Math.round(saturdays))))
  const cals0 = compilar(ctx, ctx.calendarios)
  const alvos = ctx.tasks.filter((t) => !t.isSummary && t.percentComplete < 100 && ctx.forecast.byUid.has(t.uid))
  const mapa = new Map<number, string[]>()
  for (const t of alvos) {
    const ds = diasBaseDe(ctx, padrao, cals0, days, t)
    if (ds.length) mapa.set(t.uid, ds)
  }
  if (!mapa.size) return []
  const montado = montarDerivados(ctx, padrao, alvos, mapa, undefined)
  const { cals, schedule } = reschedule(ctx, montado.tarefas, montado.calendarios)
  const crit = (t: Task) => !!ctx.forecast.byUid.get(t.uid)?.critical
  return montado.tarefas
    .filter((t) => mapa.get(t.uid)?.some((d) => minutosNoSabadoDepois(ctx, t, d, schedule, cals) > 0))
    .sort((a, b) => Number(crit(b)) - Number(crit(a)) || ctx.forecast.byUid.get(a.uid)!.inicioCedoMin - ctx.forecast.byUid.get(b.uid)!.inicioCedoMin)
    .map((t) => ({ value: String(t.uid), label: `${t.wbs} ${shortName(t.name)}`, critical: crit(t) }))
}

/**
 * Hora extra nos sábados (RF-03.6). Dois modos:
 * - `'todas'` (padrão): os sábados entram como exceção útil no calendário padrão (todas as tarefas do padrão); tarefas com calendário
 *   próprio não são convocadas (a memória lista as ativas que ficaram de fora);
 * - lista de frentes: cada frente recebe uma cópia ("derivada") do calendário base dela só com os sábados em que ela trabalha depois da hora
 *   extra (ponto fixo, ver `ajustarSabadosPorFrente`); sábado que o calendário base já trabalha não é hora extra, e sábado que é feriado nesse
 *   calendário não é convocado (trabalho em feriado tem regra própria: RH e Jurídico).
 * Custo = Σ por sábado e por frente convocada ativa no sábado: unidades × horas do sábado × taxa × (1 + adicional). As horas do sábado são os
 * minutos úteis da exceção do sábado no calendário da frente ÷ 60 (o mesmo que o cronograma usa): 8 h no dia inteiro, 4 h no meio período. A
 * equipe é convocada para o expediente inteiro (regra do plano, a validar com RH); a memória mostra os minutos efetivamente trabalhados.
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
  const diaStatus = diaRelativo(cals0.base, ctx.meta.statusDate)
  const inicioDe = (d: string) => diaRelativo(cals0.base, d) * MINUTOS_NO_DIA_CORRIDO
  const aposPre = (t: Task) => cals0.de(t.calendarioUid).proximoUtil((diaStatus + 1) * MINUTOS_NO_DIA_CORRIDO)
  const ativaHoje = (t: Task, d: string) => {
    const s = ctx.forecast.byUid.get(t.uid)
    return !!s && t.percentComplete < 100 && agendadaNoDia(s, aposPre(t), inicioDe(d))
  }
  const crit = (uid: number) => !!ctx.forecast.byUid.get(uid)?.critical

  let calendarios = ctx.calendarios
  let tarefas = ctx.tasks
  const novos: CalendarioObra[] = []
  const atribuicoes: { uid: number; calendarioUid: number }[] = []
  const naoConvocadas: number[] = []
  const avisosFeriado: string[] = []
  const foraPorCalendario: Task[] = []
  let voltas = 0
  let estabilizou = true
  /** Tarefas cobradas e os sábados que são hora extra para cada uma. */
  let participantes: { t: Task; dias: string[] }[]
  const folhas = ctx.tasks.filter((x) => !x.isSummary)

  if (frentes === 'todas') {
    // Hora extra = dia útil extra (exceção útil) no calendário padrão; só as tarefas do calendário padrão são convocadas
    calendarios = ctx.calendarios.map((c) => (c.uid === padrao.uid ? comDiasExtras(c, days, expediente) : c))
    participantes = folhas.filter((t) => (t.calendarioUid ?? padrao.uid) === padrao.uid).map((t) => ({ t, dias: days }))
    for (const t of folhas) if (t.calendarioUid !== undefined && t.calendarioUid !== padrao.uid && days.some((d) => ativaHoje(t, d))) foraPorCalendario.push(t)
  } else {
    const uids = new Set(frentes)
    const escolhidas = folhas.filter((t) => uids.has(t.uid))
    if (!escolhidas.length) return notApplicable('overtime', title, 'Escolha ao menos uma frente (tarefa) para a hora extra.', ctx)
    const semTrabalho = `Nenhuma frente escolhida trabalha nos sábados convocados (${days.map(fmtDia).join(', ')}).`
    const abertas = escolhidas.filter((t) => t.percentComplete < 100 && ctx.forecast.byUid.has(t.uid))
    if (!abertas.length) return notApplicable('overtime', title, semTrabalho, ctx)
    // Candidatas: as frentes abertas com algum sábado que é hora extra para elas. Não se filtra pelo cronograma de hoje: a frente pode passar a
    // trabalhar no sábado por causa da própria hora extra (ex.: data de status na sexta); quem poda é o ponto fixo, depois.
    const candidatas = abertas.filter((t) => diasBaseDe(ctx, padrao, cals0, days, t).length > 0)
    if (!candidatas.length) {
      const jaUteis = abertas.some((t) => days.some((d) => cals0.de(baseUidDe(padrao, t)).dataUtil(d)))
      return notApplicable(
        'overtime',
        title,
        jaUteis
          ? 'Os sábados convocados já são úteis no calendário das frentes escolhidas.'
          : 'Os sábados convocados são feriado no calendário das frentes escolhidas; trabalho em feriado tem regra própria (validar com RH e Jurídico).',
        ctx,
      )
    }
    for (const t of abertas) {
      const s = ctx.forecast.byUid.get(t.uid)!
      for (const d of days) {
        const cobre = s.inicioCedoMin < inicioDe(d) + MINUTOS_NO_DIA_CORRIDO && s.terminoCedoMin > inicioDe(d)
        if (cobre && ehFeriadoNoCalendario(ctx, baseCalDe(ctx, padrao, t), d) && !cals0.de(baseUidDe(padrao, t)).dataUtil(d)) {
          avisosFeriado.push(`sábado ${fmtDia(d)} é feriado no calendário da frente ${t.wbs}; trabalho em feriado tem regra própria (validar com RH/Jurídico)`)
        }
      }
    }

    const mapa = new Map<number, string[]>(candidatas.map((t) => [t.uid, diasBaseDe(ctx, padrao, cals0, days, t)]))
    const ajuste = ajustarSabadosPorFrente(ctx, padrao, candidatas, mapa, expediente)
    voltas = ajuste.voltas
    estabilizou = ajuste.estabilizou
    if (!mapa.size) return notApplicable('overtime', title, semTrabalho, ctx)
    for (const t of escolhidas) if (!mapa.has(t.uid)) naoConvocadas.push(t.uid)
    novos.push(...ajuste.montado.criados)
    atribuicoes.push(...ajuste.montado.atribuidos)
    if (ctx.calendarios.length + novos.length > MAX_CALENDARIOS) {
      return notApplicable('overtime', title, `Não há espaço para o calendário da hora extra: a obra já tem ${ctx.calendarios.length} calendários (máximo ${MAX_CALENDARIOS}).`, ctx)
    }
    calendarios = ajuste.montado.calendarios
    tarefas = ajuste.montado.tarefas
    participantes = candidatas.filter((t) => mapa.has(t.uid)).map((t) => ({ t: tarefas.find((x) => x.uid === t.uid)!, dias: mapa.get(t.uid)! }))
  }

  const { cals, schedule } = reschedule(ctx, tarefas, calendarios)
  const gained = recovered({ ...ctx, calendarios }, schedule.projectFinish)

  // Custo de HE: cada frente convocada ativa no sábado (o intervalo agendado cruza o expediente do sábado no calendário dela, nunca antes da
  // data de status); a equipe inteira é convocada para o expediente do sábado, e as horas são as dele (minutos úteis da exceção ÷ 60)
  let overtimeCost = 0
  let workers = 0
  const horasUsadas = new Set<number>()
  const byTask = new Map<string, number>()
  /** Minutos efetivamente trabalhados por frente e sábado (memória de cálculo e alerta de convocação). */
  const trabalhados: { uid: number; wbs: string; dia: string; minutos: number; expediente: number }[] = []
  for (const { t, dias } of participantes) {
    const cal = cals.de(t.calendarioUid)
    for (const day of dias) {
      const minutos = minutosNoSabadoDepois(ctx, t, day, schedule, cals)
      if (minutos <= 0) continue
      const expedienteMin = cal.minutosNoDia(diaRelativo(cals.base, day))
      const horas = expedienteMin / 60
      horasUsadas.add(horas)
      trabalhados.push({ uid: t.uid, wbs: t.wbs, dia: day, minutos, expediente: expedienteMin })
      for (const r of t.resources) {
        const c = r.units * horas * rateOf(prem, r.resource) * (1 + adicional)
        overtimeCost += c
        workers += r.units
        byTask.set(t.wbs, (byTask.get(t.wbs) ?? 0) + c)
      }
    }
  }
  // Sem custo cobrado, as horas do texto são as do expediente da jornada escolhida
  const horasTexto = [...(horasUsadas.size ? horasUsadas : new Set([(expediente ?? expedienteDoDiaUtil(padrao)).reduce((a, iv) => a + (iv.ate - iv.de), 0) / 60]))].sort((a, b) => a - b).map((h) => num(h)).join(' / ')
  const indirectSavings = Math.max(0, gained) * prem.custoIndiretoDiario
  const net = overtimeCost - indirectSavings
  const escolhidasNoCritico = frentes !== 'todas' && frentes.some((u) => crit(u))
  const nomeFrentes = (uids: number[]) => uids.map((u) => ctx.tasks.find((t) => t.uid === u)?.wbs ?? String(u)).join(', ')
  const LIMITE_LINHAS = 12
  const limitar = (linhas: string[]) => (linhas.length > LIMITE_LINHAS ? [...linhas.slice(0, LIMITE_LINHAS), `… e mais ${linhas.length - LIMITE_LINHAS}`] : linhas)
  // E-12: minutos efetivamente trabalhados por frente e sábado; a frente que trabalha menos da metade do expediente é cobrada por ele inteiro
  const porFrente = new Map<number, typeof trabalhados>()
  for (const x of trabalhados) porFrente.set(x.uid, [...(porFrente.get(x.uid) ?? []), x])
  const memoriaMinutos = [...porFrente.values()]
    .sort((a, b) => a[0].wbs.localeCompare(b[0].wbs, 'pt-BR', { numeric: true }))
    .map((xs) => `   · ${crit(xs[0].uid) ? '● ' : ''}${xs[0].wbs} trabalha: ${xs.map((x) => `${fmtDia(x.dia)}: ${x.minutos} min`).join('; ')}`)
  const memoriaConvocacao = trabalhados
    .filter((x) => x.minutos * 2 < x.expediente)
    .map((x) => `${crit(x.uid) ? '● ' : ''}${x.wbs} trabalha ${x.minutos} min no sábado ${fmtDia(x.dia)} e é cobrada pelo expediente inteiro (${num(x.expediente / 60)} h): validar a convocação com RH.`)
  const memoriaFrentes =
    frentes === 'todas'
      ? foraPorCalendario.length
        ? [`As tarefas com calendário próprio não são convocadas (os sábados entram só no calendário padrão): ${foraPorCalendario.map((t) => `${crit(t.uid) ? '● ' : ''}${t.wbs}`).join(', ')}`]
        : []
      : [
          `Frentes convocadas: ${nomeFrentes(atribuicoes.map((a) => a.uid)) || '—'}${naoConvocadas.length ? `; não convocadas (sem trabalho nos sábados convocados, já trabalham neles ou o sábado é feriado no calendário delas): ${nomeFrentes(naoConvocadas)}` : ''}`,
          ...avisosFeriado,
          ...novos.map((c) => `Calendário derivado "${c.nome}" (UID ${c.uid}) atribuído a ${nomeFrentes(atribuicoes.filter((a) => a.calendarioUid === c.uid).map((a) => a.uid))}`),
          ...(estabilizou ? [] : [`O ajuste dos sábados por frente não estabilizou em ${voltas} voltas (teto: um par frente × sábado por volta): o resultado foi conferido uma última vez; confira as datas e o custo.`]),
        ]

  return comVersao(ctx, {
    kind: 'overtime',
    applicable: true,
    title,
    summary:
      `Trabalho em ${days.length} sábado(s): ${days.map(fmtDia).join(', ')} (${horasTexto} h, adicional de ${num(prem.adicionalHoraExtraPct)}%)` +
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
      `Custo HE = Σ profissionais × ${horasTexto} h × taxa × ${num(1 + adicional)} = ${fmt(overtimeCost)}`,
      ...[...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([wbs, c]) => `   · frente ${wbs}: ${fmt(c)}`),
      ...(memoriaMinutos.length ? ['Minutos efetivamente trabalhados por frente e sábado (a equipe é convocada para o expediente inteiro):', ...limitar(memoriaMinutos)] : []),
      ...limitar(memoriaConvocacao),
      ...memoriaFrentes,
      `CPM recalculado com ${days.length} dia(s) útil(eis) a mais${jornada === 'meio' ? ' (meio período: 4 h)' : ''}: entrega ${br(ctx.forecast.projectFinish)} → ${br(schedule.projectFinish)} (${gained} d.u.)`,
      `Economia de indireto = ${Math.max(0, gained)} d × ${fmt(prem.custoIndiretoDiario)} = ${fmt(indirectSavings)}`,
      memoriaPremissas(ctx.versaoPremissas, prem, ['adicionalHoraExtraPct', 'custoIndiretoDiario'], [...new Set(ctx.tasks.flatMap((t) => t.resources.map((r) => r.resource)))]),
    ],
    ...(frentes === 'todas' ? { addedWorkingDays: days } : {}),
    horaExtra: { jornada, dias: days, calendariosNovos: novos, atribuicoes, naoConvocadas, voltas },
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
