import { describe, expect, it } from 'vitest'
import { WorkCalendar, brazilianHolidays } from './calendar'

// Obra fictícia: base 04/05/2026 (segunda); 01/05 é feriado; 09/05 (sábado) vira dia útil de hora extra.
const cal = () => new WorkCalendar('2026-05-04', { holidays: brazilianHolidays(2026), extraWorkingDays: ['2026-05-09'] })

describe('calendário: bordas', () => {
  it('volta antes da data-base pulando feriado e fim de semana', () => {
    expect(cal().dateAt(-1)).toBe('2026-04-30')
  })

  it('índices de datas anteriores à data-base', () => {
    const c = cal()
    expect(c.indexOnOrAfter('2026-04-30')).toBe(-1)
    expect(c.indexOnOrBefore('2026-05-01')).toBe(-1)
  })

  it('sábado convertido em dia útil e o domingo seguinte', () => {
    const c = cal()
    expect(c.isWorkingDay('2026-05-09')).toBe(true)
    expect(c.isWorkingDay('2026-05-10')).toBe(false)
    expect(c.indexOnOrBefore('2026-05-10')).toBe(5)
  })

  it('intervalo invertido', () => {
    expect(cal().countWorkingBetween('2026-05-08', '2026-05-04')).toBe(0)
  })

  it('além do horizonte', () => {
    const c = new WorkCalendar('2026-05-04', { holidays: [], extraWorkingDays: [] }, 5)
    expect(c.dateAt(5)).toBe('2026-05-11')
    expect(c.dateAt(6)).toBe('2026-05-12')
  })
})
