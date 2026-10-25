// Gerenciamento do Valor Agregado (EVM / PMBOK) e Curva S físico-financeira.
import type { ScheduleResult, Task } from '@/types/domain'
import { addCalendarDays, parseISO, toISO, type WorkCalendar } from './calendar'

export interface EvmMetrics {
  bac: number
  pv: number
  ev: number
  ac: number
  sv: number
  cv: number
  spi: number
  cpi: number
  eac: number
  etc: number
  vac: number
  tcpi: number
  plannedPct: number
  earnedPct: number
}

export interface PackageEvm extends EvmMetrics {
  wbs: string
  name: string
}

export interface SCurvePoint {
  date: string
  label: string
  pv: number
  ev: number | null
  ac: number | null
  forecast: number | null
}

const safeDiv = (a: number, b: number, fallback = 1) => (b === 0 ? fallback : a / b)

/** Fração (0..1) do intervalo [start, finish] (inclusive, dias úteis) decorrida até `date`. */
function elapsedFraction(cal: WorkCalendar, start: string, finish: string, date: string): number {
  if (date < start) return 0
  if (date >= finish) return 1
  const total = cal.countWorkingBetween(start, addCalendarDays(finish, 1))
  if (total <= 0) return 1
  const done = cal.countWorkingBetween(start, addCalendarDays(date, 1))
  return Math.min(1, Math.max(0, done / total))
}

export function plannedFraction(task: Task, cal: WorkCalendar, date: string): number {
  if (!task.baselineStart || !task.baselineFinish) return 0
  return elapsedFraction(cal, task.baselineStart, task.baselineFinish, date)
}

/** Fração do avanço físico atual que já havia sido realizada em `date` (distribuição linear no período real). */
function earnedShareAt(task: Task, cal: WorkCalendar, date: string, statusDate: string): number {
  if (task.percentComplete <= 0 || !task.actualStart) return 0
  const end = task.percentComplete >= 100 && task.actualFinish ? task.actualFinish : statusDate
  if (end < task.actualStart) return date >= task.actualStart ? 1 : 0
  return elapsedFraction(cal, task.actualStart, end, date)
}

function metrics(bac: number, pv: number, ev: number, ac: number): EvmMetrics {
  const spi = safeDiv(ev, pv)
  const cpi = safeDiv(ev, ac)
  const eac = cpi > 0 ? bac / cpi : bac
  return {
    bac,
    pv,
    ev,
    ac,
    sv: ev - pv,
    cv: ev - ac,
    spi,
    cpi,
    eac,
    etc: eac - ac,
    vac: bac - eac,
    tcpi: safeDiv(bac - ev, bac - ac),
    plannedPct: safeDiv(pv, bac, 0) * 100,
    earnedPct: safeDiv(ev, bac, 0) * 100,
  }
}

export function computeEvm(tasks: Task[], cal: WorkCalendar, statusDate: string): EvmMetrics {
  const leaves = tasks.filter((t) => !t.isSummary)
  let bac = 0, pv = 0, ev = 0, ac = 0
  for (const t of leaves) {
    bac += t.bac
    pv += t.bac * plannedFraction(t, cal, statusDate)
    ev += (t.bac * t.percentComplete) / 100
    ac += t.actualCost
  }
  return metrics(bac, pv, ev, ac)
}

/** EVM por pacote de 1º nível da EAP (01, 02, ...). */
export function computePackageEvm(tasks: Task[], cal: WorkCalendar, statusDate: string): PackageEvm[] {
  const groups = tasks.filter((t) => t.isSummary && t.outlineLevel === 1)
  return groups.map((g) => {
    const kids = tasks.filter((t) => !t.isSummary && t.wbs.startsWith(g.wbs + '.'))
    return { wbs: g.wbs, name: g.name, ...computeEvm(kids, cal, statusDate) }
  })
}

function monthEnds(fromIso: string, toIso: string): string[] {
  const out: string[] = []
  const d = parseISO(fromIso)
  let y = d.getUTCFullYear()
  let m = d.getUTCMonth()
  for (let guard = 0; guard < 120; guard++) {
    const end = toISO(new Date(Date.UTC(y, m + 1, 0)))
    out.push(end)
    if (end >= toIso) break
    m++
    if (m > 11) { m = 0; y++ }
  }
  return out
}

/**
 * Curva S mensal acumulada: PV (linha de base), EV e AC (até a data de status) e
 * tendência reprogramada (PV recalculado sobre o cronograma previsto).
 */
export function computeSCurve(
  tasks: Task[],
  cal: WorkCalendar,
  statusDate: string,
  forecast: ScheduleResult,
  monthLabel: (iso: string) => string,
): SCurvePoint[] {
  const leaves = tasks.filter((t) => !t.isSummary)
  const starts = leaves.map((t) => t.baselineStart ?? forecast.byUid.get(t.uid)?.start).filter((x): x is string => !!x)
  const finishes = leaves.map((t) => t.baselineFinish ?? '').concat(forecast.projectFinish).filter(Boolean)
  if (!starts.length) return []
  const first = starts.sort()[0]
  const last = finishes.sort().at(-1)!
  const statusMonthEnd = monthEnds(statusDate, statusDate)[0]

  return monthEnds(first, last).map((end) => {
    const cut = end === statusMonthEnd ? statusDate : end
    const isPast = cut <= statusDate
    let pv = 0, ev = 0, ac = 0, fc = 0
    for (const t of leaves) {
      pv += t.bac * plannedFraction(t, cal, cut) // no mês da data de status, PV até a data de status (coerente com EV/AC)
      if (isPast) {
        const share = earnedShareAt(t, cal, cut, statusDate)
        ev += ((t.bac * t.percentComplete) / 100) * share
        ac += t.actualCost * share
      }
      const s = forecast.byUid.get(t.uid)
      if (s) {
        const earnedNow = (t.bac * t.percentComplete) / 100
        const remainingValue = t.bac - earnedNow
        // Saldo distribuído no período previsto restante
        const restStart = s.start > statusDate ? s.start : addCalendarDays(statusDate, 1)
        const frac = s.finish < restStart ? (cut >= s.finish ? 1 : 0) : elapsedFraction(cal, restStart, s.finish, cut)
        fc += earnedNow + remainingValue * (cut > statusDate ? frac : 0)
      }
    }
    return {
      date: end,
      label: end === statusMonthEnd ? `${monthLabel(end)} ●` : monthLabel(end),
      pv,
      ev: isPast ? ev : null,
      ac: isPast ? ac : null,
      forecast: end >= statusMonthEnd ? fc : null,
    }
  })
}

// ---------------------------------------------------------------------------
// Previsões (EAC) e índices ao longo do tempo
// ---------------------------------------------------------------------------

export interface EacVariant {
  id: 'cpi' | 'atipico' | 'composto'
  label: string
  formula: string
  value: number
  vac: number
  /** Quando usar (orientação geral de EVM). */
  hint: string
}

/** Estimativas no término mais usadas em EVM (PMBOK). */
export function eacVariants(e: EvmMetrics): EacVariant[] {
  const remaining = e.bac - e.ev
  const composite = e.cpi * e.spi > 0 ? e.ac + remaining / (e.cpi * e.spi) : e.bac
  const variants: Omit<EacVariant, 'vac'>[] = [
    { id: 'cpi', label: 'Desempenho de custo mantido', formula: 'EAC = BAC ÷ CPI', value: e.eac, hint: 'O desvio atual de custo se repete no saldo da obra (premissa padrão).' },
    { id: 'atipico', label: 'Desvio pontual (atípico)', formula: 'EAC = AC + (BAC − EV)', value: e.ac + remaining, hint: 'O estouro já ocorrido não se repete; o saldo segue o orçamento.' },
    { id: 'composto', label: 'Custo e prazo combinados', formula: 'EAC = AC + (BAC − EV) ÷ (CPI × SPI)', value: composite, hint: 'O atraso também pressiona custo (aceleração, indiretos).' },
  ]
  return variants.map((v) => ({ ...v, vac: e.bac - v.value }))
}

export interface ScheduleForecastBySpi {
  plannedDays: number
  estimatedDays: number
  /** Término estimado por desempenho de prazo (duração planejada ÷ SPI). */
  date: string
}

/** Previsão de término pelo SPI (IEAC(t) = duração planejada ÷ SPI), para comparar com a data do CPM. */
export function forecastFinishBySpi(cal: WorkCalendar, baselineStart: string, baselineFinish: string, spi: number): ScheduleForecastBySpi {
  const plannedDays = cal.countWorkingBetween(baselineStart, addCalendarDays(baselineFinish, 1))
  const estimatedDays = spi > 0 ? Math.round(plannedDays / spi) : plannedDays
  return { plannedDays, estimatedDays, date: cal.dateAt(cal.indexOnOrAfter(baselineStart) + Math.max(0, estimatedDays - 1)) }
}

export interface IndexPoint {
  label: string
  date: string
  spi: number
  cpi: number
}

/** SPI e CPI acumulados mês a mês, derivados da Curva S (só meses já executados). */
export function indexSeries(points: SCurvePoint[]): IndexPoint[] {
  return points
    .filter((p) => p.ev !== null && p.ac !== null && p.pv > 0 && (p.ac ?? 0) > 0)
    .map((p) => ({ label: p.label, date: p.date, spi: (p.ev ?? 0) / p.pv, cpi: (p.ev ?? 0) / (p.ac ?? 1) }))
}

/** Valores do mês (não acumulados) a partir da curva acumulada. */
export function monthlyIncrements(points: SCurvePoint[]): SCurvePoint[] {
  return points.map((p, i) => {
    const prev = points[i - 1]
    const diff = (cur: number | null, before: number | null | undefined) => (cur === null ? null : cur - (before ?? 0))
    return {
      ...p,
      pv: p.pv - (prev?.pv ?? 0),
      ev: diff(p.ev, prev?.ev),
      ac: diff(p.ac, prev?.ac),
      forecast: p.forecast === null ? null : p.forecast - (prev?.forecast ?? (prev?.ev ?? 0)),
    }
  })
}
