// Calendário de trabalho: dias úteis seg-sex, feriados nacionais brasileiros e exceções (sábados de HE).
import type { WorkCalendarConfig } from '@/types/domain'

const DAY_MS = 86_400_000

/** Teto do horizonte: 50 anos, em dias corridos, para cada lado da data-base. Acima disso, erro explícito (nunca laço sem fim). */
export const TETO_DIAS = 50 * 365
export const MSG_TETO = 'O cronograma ultrapassa o horizonte de 50 anos a partir da data-base; confira durações, prazos e calendários.'

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISO(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addCalendarDays(iso: string, days: number): string {
  return toISO(new Date(parseISO(iso).getTime() + days * DAY_MS))
}

export function diffCalendarDays(fromIso: string, toIso: string): number {
  return Math.round((parseISO(toIso).getTime() - parseISO(fromIso).getTime()) / DAY_MS)
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Feriados nacionais + Carnaval e Corpus Christi (pontos facultativos usuais na construção civil). */
export function brazilianHolidays(year: number): string[] {
  const easter = easterSunday(year)
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25'].map(
    (md) => `${year}-${md}`,
  )
  const mobile = [
    addCalendarDays(easter, -48), // segunda de Carnaval
    addCalendarDays(easter, -47), // terça de Carnaval
    addCalendarDays(easter, -2), // Sexta-feira Santa
    addCalendarDays(easter, 60), // Corpus Christi
  ]
  return [...fixed, ...mobile].sort()
}

export function defaultHolidays(fromYear: number, toYear: number): string[] {
  const out: string[] = []
  for (let y = fromYear; y <= toYear; y++) out.push(...brazilianHolidays(y))
  return out
}

/**
 * Calendário indexado por dia útil: o índice 0 é o primeiro dia útil a partir da data-base.
 * O motor de CPM trabalha em minutos (calendarioTrabalho.ts); este calendário só serve às contas por dia
 * ("+16 d.u.", previsão pelo SPI, duração das tarefas-resumo) e a limites de data.
 */
export class WorkCalendar {
  private readonly dates: string[] = []
  private readonly indexByDate = new Map<string, number>()
  private readonly holidays: Set<string>
  private readonly extra: Set<string>
  private readonly isWorking?: (iso: string) => boolean

  /**
   * `config` simples (seg–sex com feriados e dias extras) ou uma função que diz se a data é dia útil
   * (calendário compilado, ver `calendarioDeDias` em calendarioTrabalho.ts).
   */
  constructor(
    readonly baseDate: string,
    config: WorkCalendarConfig | ((iso: string) => boolean),
    private readonly horizon = 1600,
  ) {
    if (typeof config === 'function') this.isWorking = config
    this.holidays = new Set(typeof config === 'function' ? [] : config.holidays)
    this.extra = new Set(typeof config === 'function' ? [] : config.extraWorkingDays)
    let cursor = parseISO(baseDate)
    for (let dias = 0; this.dates.length < this.horizon; dias++) {
      if (dias > TETO_DIAS) throw new Error(MSG_TETO) // calendário sem dia útil: nunca laço sem fim
      const iso = toISO(cursor)
      if (this.isWorkingDay(iso)) {
        this.indexByDate.set(iso, this.dates.length)
        this.dates.push(iso)
      }
      cursor = new Date(cursor.getTime() + DAY_MS)
    }
  }

  isWorkingDay(iso: string): boolean {
    if (this.isWorking) return this.isWorking(iso)
    if (this.extra.has(iso)) return true
    const dow = parseISO(iso).getUTCDay()
    if (dow === 0 || dow === 6) return false
    return !this.holidays.has(iso)
  }

  /** Data do dia útil de índice `idx` (extrapola para índices fora do horizonte). */
  dateAt(idx: number): string {
    if (idx < 0) return this.walkBack(this.baseDate, -idx)
    if (idx < this.dates.length) return this.dates[idx]
    return this.walkForward(this.dates[this.dates.length - 1], idx - this.dates.length + 1)
  }

  /** Índice do dia útil em `iso`; se não for útil, o próximo dia útil. */
  indexOnOrAfter(iso: string): number {
    if (iso < this.baseDate) return -this.countWorkingBetween(iso, this.baseDate)
    let cursor = iso
    for (let guard = 0; guard < 30; guard++) {
      const idx = this.indexByDate.get(cursor)
      if (idx !== undefined) return idx
      cursor = addCalendarDays(cursor, 1)
    }
    return this.dates.length
  }

  /** Índice do dia útil em `iso`; se não for útil, o dia útil anterior. */
  indexOnOrBefore(iso: string): number {
    // Dias úteis em (iso, base) + 1 = distância até a base; se `iso` é útil, o resultado é o próprio índice (CR-11)
    if (iso < this.baseDate) return -this.countWorkingBetween(addCalendarDays(iso, 1), this.baseDate) - 1
    let cursor = iso
    for (let guard = 0; guard < 30; guard++) {
      const idx = this.indexByDate.get(cursor)
      if (idx !== undefined) return idx
      if (cursor <= this.baseDate) return -1
      cursor = addCalendarDays(cursor, -1)
    }
    return -1
  }

  /** Dias úteis no intervalo [from, to). */
  countWorkingBetween(fromIso: string, toIso: string): number {
    if (toIso <= fromIso) return 0
    if (diffCalendarDays(fromIso, toIso) > TETO_DIAS) throw new Error(MSG_TETO)
    let n = 0
    let cursor = fromIso
    while (cursor < toIso) {
      if (this.isWorkingDay(cursor)) n++
      cursor = addCalendarDays(cursor, 1)
    }
    return n
  }

  private walkForward(fromIso: string, workingDays: number): string {
    let cursor = fromIso
    let left = workingDays
    for (let dias = 0; left > 0; dias++) {
      if (dias > TETO_DIAS) throw new Error(MSG_TETO)
      cursor = addCalendarDays(cursor, 1)
      if (this.isWorkingDay(cursor)) left--
    }
    return cursor
  }

  private walkBack(fromIso: string, workingDays: number): string {
    let cursor = fromIso
    let left = workingDays
    for (let dias = 0; left > 0; dias++) {
      if (dias > TETO_DIAS) throw new Error(MSG_TETO)
      cursor = addCalendarDays(cursor, -1)
      if (this.isWorkingDay(cursor)) left--
    }
    return cursor
  }
}

/** Próximos `count` sábados após a data informada. */
export function nextSaturdays(afterIso: string, count: number): string[] {
  const out: string[] = []
  let cursor = afterIso
  while (out.length < count) {
    cursor = addCalendarDays(cursor, 1)
    if (parseISO(cursor).getUTCDay() === 6) out.push(cursor)
  }
  return out
}
