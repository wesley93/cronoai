// Gerenciamento do Valor Agregado (EVM / PMBOK) e Curva S físico-financeira.
import type { ScheduleResult, Task } from '@/types/domain'
import { POS, type CabecalhoFechamento, type DetalheFechamento } from '@/types/fechamento'
import { addCalendarDays, parseISO, toISO, type WorkCalendar } from './calendar'
import { MINUTOS_NO_DIA_CORRIDO, diaRelativo, type CalendarioCompilado, type CalendariosCompilados } from './calendarioTrabalho'

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

/** De onde vêm o EV e o AC de um ponto da Curva S (ciclo 00007, SPEC-04). */
export type OrigemPonto = 'fechamento' | 'interpolado' | 'reconstruido' | 'atual'

export interface SCurvePoint {
  date: string
  label: string
  pv: number
  ev: number | null
  ac: number | null
  forecast: number | null
  /** 'mes' = fim de mês (ou a data de status); 'fechamento' = ponto extra na data de um fechamento que não cai num fim de mês. */
  tipo: 'mes' | 'fechamento'
  /** Origem do EV e do AC: o fechamento (valor gravado), a interpolação entre fechamentos, a reconstrução linear, o estado vivo na data de status. `null` no futuro. */
  origem: OrigemPonto | null
  fechamentoId?: string
  /** Linha de base usada nos totais do fechamento (o PV da curva é sempre o da LB do valor agregado). */
  linhaBaseFechamento?: number
}

/** Histórico que a Curva S usa no lugar da reconstrução (D-25): os fechamentos efetivos e o detalhe do 1º, que ancora o que veio antes dele (D-28). */
export interface HistoricoCurva {
  /** Efetivos e legíveis (a curva só usa os de data até a data de status). */
  fechamentos: readonly CabecalhoFechamento[]
  ancora?: DetalheFechamento
  /** Pacote de 1º nível da curva: o EV e o AC vêm do `porPacote` dos fechamentos. Vazio ou ausente = obra inteira. */
  wbs?: string
}

const safeDiv = (a: number, b: number, fallback = 1) => (b === 0 ? fallback : a / b)

/**
 * Fração (0..1) do intervalo [start, finish] (inclusive) decorrida até `date`, em minutos úteis do calendário da tarefa.
 * PV usa o calendário sem as exceções úteis (regra de hoje: sábado de hora extra não entra no valor planejado, CR-2d).
 */
function elapsedFraction(cal: CalendarioCompilado, start: string, finish: string, date: string): number {
  if (date < start) return 0
  if (date >= finish) return 1
  const ini = diaRelativo(cal.base, start) * MINUTOS_NO_DIA_CORRIDO
  const total = cal.minutosUteisEntre(ini, (diaRelativo(cal.base, finish) + 1) * MINUTOS_NO_DIA_CORRIDO)
  if (total <= 0) return 1
  const done = cal.minutosUteisEntre(ini, (diaRelativo(cal.base, date) + 1) * MINUTOS_NO_DIA_CORRIDO)
  return Math.min(1, Math.max(0, done / total))
}

export function plannedFraction(task: Task, cals: CalendariosCompilados, date: string): number {
  if (!task.baselineStart || !task.baselineFinish) return 0
  return elapsedFraction(cals.de(task.calendarioUid), task.baselineStart, task.baselineFinish, date)
}

/** O que a reconstrução precisa de uma tarefa: o avanço, as datas reais e o calendário (uma tarefa de verdade ou uma tupla do fechamento). */
interface AvancoDaTarefa {
  percentComplete: number
  actualStart?: string
  actualFinish?: string
  calendarioUid?: number
}

/** Fração do avanço físico atual que já havia sido realizada em `date` (distribuição linear no período real). */
function earnedShareAt(task: AvancoDaTarefa, cals: CalendariosCompilados, date: string, statusDate: string): number {
  if (task.percentComplete <= 0 || !task.actualStart) return 0
  const end = task.percentComplete >= 100 && task.actualFinish ? task.actualFinish : statusDate
  if (end < task.actualStart) return date >= task.actualStart ? 1 : 0
  return elapsedFraction(cals.de(task.calendarioUid), task.actualStart, end, date)
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

export function computeEvm(tasks: Task[], cal: CalendariosCompilados, statusDate: string): EvmMetrics {
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
export function computePackageEvm(tasks: Task[], cal: CalendariosCompilados, statusDate: string): PackageEvm[] {
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
 * Fração (0..1) do tempo útil do calendário padrão entre o fim do dia `de` e o fim do dia `ate` que já passou em `corte` (D-27: a mesma régua do PV,
 * sem as exceções úteis). Sem tempo útil entre as duas datas, o valor vai direto ao do fim.
 */
function fracaoUtilEntre(cals: CalendariosCompilados, de: string, ate: string, corte: string): number {
  const cal = cals.padrao
  const fimDoDia = (d: string) => (diaRelativo(cal.base, d) + 1) * MINUTOS_NO_DIA_CORRIDO
  const total = cal.minutosUteisEntre(fimDoDia(de), fimDoDia(ate))
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, cal.minutosUteisEntre(fimDoDia(de), fimDoDia(corte)) / total))
}

/** `dd/mm ◆`: rótulo do ponto de um fechamento que não cai num fim de mês nem na data de status. */
const rotuloDeFechamento = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)} ◆`

interface Marco {
  data: string
  ev: number
  ac: number
}

/**
 * Curva S acumulada: PV (linha de base do valor agregado), EV e AC (até a data de status) e tendência reprogramada (PV recalculado sobre o cronograma previsto).
 *
 * Sem `historico` (ou sem fechamentos): a reconstrução linear de hoje, ponto a ponto, com `origem: 'reconstruido'`.
 * Com fechamentos (D-25 a D-30): os pontos são os fins de mês, a data de status e **um ponto por fechamento**; neles o EV e o AC são **exatamente** os gravados;
 * entre dois fechamentos e depois do último até a data de status, a interpolação em minutos úteis do calendário padrão (o último ponto é o estado vivo, `'atual'`);
 * antes do 1º fechamento, a reconstrução ancorada nos dados dele. O PV é sempre o da linha de base que as `tasks` carregam.
 */
export function computeSCurve(
  tasks: Task[],
  cal: CalendariosCompilados,
  statusDate: string,
  forecast: ScheduleResult,
  monthLabel: (iso: string) => string,
  historico?: HistoricoCurva,
): SCurvePoint[] {
  const leaves = tasks.filter((t) => !t.isSummary)
  const starts = leaves.map((t) => t.baselineStart ?? forecast.byUid.get(t.uid)?.start).filter((x): x is string => !!x)
  const finishes = leaves.map((t) => t.baselineFinish ?? '').concat(forecast.projectFinish).filter(Boolean)
  if (!starts.length) return []
  const first = starts.sort()[0]
  const last = finishes.sort().at(-1)!
  const statusMonthEnd = monthEnds(statusDate, statusDate)[0]

  const pacote = historico?.wbs || undefined
  const valorDoFechamento = (f: CabecalhoFechamento): { ev: number; ac: number } | undefined => {
    if (!pacote) return { ev: f.totais.ev, ac: f.totais.ac }
    const p = f.porPacote.find((x) => x.wbs === pacote)
    return p ? { ev: p.ev, ac: p.ac } : undefined // fechamento sem o pacote fica fora da curva do pacote
  }
  const marcos = new Map<string, { id: string; linhaBase: number; ev: number; ac: number }>()
  for (const f of [...(historico?.fechamentos ?? [])].sort((a, b) => (a.dataStatus < b.dataStatus ? -1 : 1))) {
    const v = f.dataStatus <= statusDate ? valorDoFechamento(f) : undefined
    if (v) marcos.set(f.dataStatus, { id: f.id, linhaBase: f.linhaBase, ...v })
  }
  const datasDosMarcos = [...marcos.keys()].sort()

  // Pontos: fins de mês (no mês da data de status, o corte é a própria data) mais um por fechamento que não cai neles
  interface Candidato {
    date: string
    cut: string
    tipo: 'mes' | 'fechamento'
    label: string
  }
  const candidatos: Candidato[] = monthEnds(first, last).map((end) => {
    const cut = end === statusMonthEnd ? statusDate : end
    return { date: end, cut, tipo: 'mes', label: end === statusMonthEnd ? `${monthLabel(end)} ●` : monthLabel(end) }
  })
  for (const d of datasDosMarcos) {
    if (!candidatos.some((c) => c.cut === d)) candidatos.push({ date: d, cut: d, tipo: 'fechamento', label: rotuloDeFechamento(d) })
  }
  candidatos.sort((a, b) => (a.cut < b.cut ? -1 : a.cut > b.cut ? 1 : 0))

  // Estado vivo na data de status (soma do avanço e do custo real de agora)
  const vivo: Marco = { data: statusDate, ev: 0, ac: 0 }
  for (const t of leaves) {
    vivo.ev += (t.bac * t.percentComplete) / 100
    vivo.ac += t.actualCost
  }
  // Reconstrução ancorada no 1º fechamento (D-28): o avanço e o custo de cada tarefa dele, no calendário atual da tarefa (ou no padrão se ela saiu)
  const primeiraData = datasDosMarcos[0]
  const calendarioPorUid = new Map(tasks.map((t) => [t.uid, t.calendarioUid]))
  const ancora = historico?.ancora?.tarefas.filter((t) => !pacote || t[POS.wbs] === pacote || t[POS.wbs].startsWith(pacote + '.'))
  const reconstruirAncorado = (corte: string): { ev: number; ac: number } => {
    let ev = 0
    let ac = 0
    for (const t of ancora ?? []) {
      const share = earnedShareAt(
        { percentComplete: t[POS.pct], actualStart: t[POS.inicioReal] ?? undefined, actualFinish: t[POS.terminoReal] ?? undefined, calendarioUid: calendarioPorUid.get(t[POS.uid]) },
        cal,
        corte,
        primeiraData,
      )
      ev += ((t[POS.bac] * t[POS.pct]) / 100) * share
      ac += t[POS.custoReal] * share
    }
    return { ev, ac }
  }
  const reconstruirVivo = (corte: string): { ev: number; ac: number } => {
    let ev = 0
    let ac = 0
    for (const t of leaves) {
      const share = earnedShareAt(t, cal, corte, statusDate)
      ev += ((t.bac * t.percentComplete) / 100) * share
      ac += t.actualCost * share
    }
    return { ev, ac }
  }
  /** Interpolação entre o marco anterior e o próximo (o próximo fechamento, ou o estado vivo na data de status). */
  const interpolar = (corte: string): { ev: number; ac: number } => {
    const anterior = [...datasDosMarcos].reverse().find((d) => d < corte)!
    const seguinte = datasDosMarcos.find((d) => d > corte)
    const a = marcos.get(anterior)!
    const b: Marco = seguinte ? { data: seguinte, ...marcos.get(seguinte)! } : vivo
    const f = fracaoUtilEntre(cal, anterior, b.data, corte)
    return { ev: a.ev + (b.ev - a.ev) * f, ac: a.ac + (b.ac - a.ac) * f }
  }

  // Desempenho (lição 3): com um ponto por fechamento são ~100 pontos a mais, cada um somando o PV de TODAS as tarefas. O que não depende do ponto (o dia da linha
  // de base de cada tarefa e o total de minutos úteis dela) sai do laço, e o dia do corte é convertido uma vez por ponto: a mesma conta de `plannedFraction`, sem
  // reconverter datas em texto 3 vezes por tarefa e por ponto. Os números são idênticos (a caracterização C-1 segue verde).
  const baseDoCalendario = cal.padrao.base
  const planejadas = leaves.map((t) => {
    const ct = cal.de(t.calendarioUid)
    if (!t.baselineStart || !t.baselineFinish || ct.base !== baseDoCalendario) return { t, ct, rapida: false as const }
    const ini = diaRelativo(baseDoCalendario, t.baselineStart) * MINUTOS_NO_DIA_CORRIDO
    const total = ct.minutosUteisEntre(ini, (diaRelativo(baseDoCalendario, t.baselineFinish) + 1) * MINUTOS_NO_DIA_CORRIDO)
    return { t, ct, rapida: true as const, ini, total, inicio: t.baselineStart, termino: t.baselineFinish }
  })

  return candidatos.map((c) => {
    const cut = c.cut
    const isPast = cut <= statusDate
    const fimDoCorte = (diaRelativo(baseDoCalendario, cut) + 1) * MINUTOS_NO_DIA_CORRIDO
    let pv = 0, fc = 0
    for (const pl of planejadas) {
      const t = pl.t
      // PV: no mês da data de status, até a data de status (coerente com EV/AC)
      if (!pl.rapida) pv += t.bac * plannedFraction(t, cal, cut)
      else if (cut < pl.inicio) pv += t.bac * 0
      else if (cut >= pl.termino || pl.total <= 0) pv += t.bac * 1
      else pv += t.bac * Math.min(1, Math.max(0, pl.ct.minutosUteisEntre(pl.ini, fimDoCorte) / pl.total))
    }
    // A tendência só aparece do mês da data de status em diante: o resto não a calcula
    if (c.date >= statusMonthEnd) {
      for (const t of leaves) {
        const s = forecast.byUid.get(t.uid)
        if (s) {
          const earnedNow = (t.bac * t.percentComplete) / 100
          const remainingValue = t.bac - earnedNow
          // Saldo distribuído no período previsto restante
          const restStart = s.start > statusDate ? s.start : addCalendarDays(statusDate, 1)
          const frac = s.finish < restStart ? (cut >= s.finish ? 1 : 0) : elapsedFraction(cal.de(t.calendarioUid), restStart, s.finish, cut)
          fc += earnedNow + remainingValue * (cut > statusDate ? frac : 0)
        }
      }
    }
    let ev: number | null = null
    let ac: number | null = null
    let origem: OrigemPonto | null = null
    let marco: { id: string; linhaBase: number } | undefined
    if (isPast) {
      const m = marcos.get(cut)
      if (m) {
        ;({ ev, ac } = m)
        origem = 'fechamento'
        marco = m
      } else if (!datasDosMarcos.length) {
        ;({ ev, ac } = reconstruirVivo(cut))
        origem = 'reconstruido'
      } else if (cut < primeiraData) {
        ;({ ev, ac } = ancora ? reconstruirAncorado(cut) : reconstruirVivo(cut))
        origem = 'reconstruido'
      } else if (cut === statusDate) {
        ;({ ev, ac } = vivo)
        origem = 'atual'
      } else {
        ;({ ev, ac } = interpolar(cut))
        origem = 'interpolado'
      }
    }
    return {
      date: c.date,
      label: c.label,
      pv,
      ev,
      ac,
      forecast: c.date >= statusMonthEnd ? fc : null,
      tipo: c.tipo,
      origem,
      ...(marco ? { fechamentoId: marco.id, linhaBaseFechamento: marco.linhaBase } : {}),
    }
  })
}

/** Só os pontos de fim de mês (os pontos de fechamento ficam de fora das contas mensais). */
export function pontosMensais(points: SCurvePoint[]): SCurvePoint[] {
  return points.filter((p) => p.tipo === 'mes')
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
export function monthlyIncrements(allPoints: SCurvePoint[]): SCurvePoint[] {
  const points = pontosMensais(allPoints) // os pontos de fechamento não são fins de mês: ficam fora das contas mensais
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
