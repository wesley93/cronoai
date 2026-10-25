import { describe, expect, it } from 'vitest'
import { WorkCalendar, brazilianHolidays, carnaval, corpusChristi, defaultHolidays, feriadosNacionais } from './calendar'

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

// CR-11: data útil (ou não) anterior à data-base. Antes da correção: -2, -2 e -1 (um dia a menos nas duas úteis).
describe('limite de 50 anos do WorkCalendar (calendário por função de dia útil)', () => {
  it('calendário sem nenhum dia útil: erro em português, nunca laço sem fim', () => {
    expect(() => new WorkCalendar('2026-08-03', () => false)).toThrow(/horizonte de 50 anos/)
  })

  it('contar dias úteis entre datas a mais de 50 anos uma da outra é erro explícito', () => {
    expect(() => cal().countWorkingBetween('2026-05-04', '2100-01-01')).toThrow(/horizonte de 50 anos/)
    expect(cal().countWorkingBetween('2026-05-04', '2026-05-11')).toBe(6) // 04 a 08/05 e o sábado útil 09/05
  })

  it('andar para frente ou para trás sem dia útil também respeita o teto', () => {
    const c = new WorkCalendar('2026-05-04', (iso) => iso === '2026-05-04', 1)
    expect(() => c.dateAt(5)).toThrow(/horizonte de 50 anos/)
    expect(() => c.dateAt(-5)).toThrow(/horizonte de 50 anos/)
  })
})

describe('indexOnOrBefore antes da data-base (CR-11)', () => {
  it('quinta útil antes de um feriado e da data-base (01/05 é feriado)', () => {
    expect(cal().indexOnOrBefore('2026-04-30')).toBe(-1)
  })

  it('sexta útil e sábado antes da data-base de 26/10/2026', () => {
    const c = new WorkCalendar('2026-10-26', { holidays: brazilianHolidays(2026), extraWorkingDays: [] })
    expect(c.indexOnOrBefore('2026-10-23')).toBe(-1)
    expect(c.indexOnOrBefore('2026-10-24')).toBe(-1)
  })

  it('é coerente com dateAt: o índice devolvido aponta para o dia útil pedido', () => {
    const c = new WorkCalendar('2026-10-26', { holidays: brazilianHolidays(2026), extraWorkingDays: [] })
    expect(c.dateAt(c.indexOnOrBefore('2026-10-21'))).toBe('2026-10-21')
    expect(c.indexOnOrBefore('2026-10-21')).toBe(-3)
  })
})

describe('feriados nacionais, Carnaval e Corpus Christi separados (ciclo 00005, achados b e c)', () => {
  it('CF-5: o 20/11 só é feriado nacional a partir de 2024 (Lei 14.759/2023, a confirmar com o Jurídico)', () => {
    expect(feriadosNacionais(2023)).not.toContain('2023-11-20')
    expect(feriadosNacionais(2024)).toContain('2024-11-20')
    expect(feriadosNacionais(2026)).toContain('2026-11-20')
  })

  it('2026: nacionais com Sexta-feira Santa, sem Carnaval nem Corpus Christi', () => {
    expect(feriadosNacionais(2026)).toEqual(['2026-01-01', '2026-04-03', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'])
    expect(carnaval(2026)).toEqual(['2026-02-16', '2026-02-17']) // Páscoa 05/04/2026
    expect(corpusChristi(2026)).toEqual(['2026-06-04'])
  })

  it('2027 (Páscoa em 28/03): Carnaval 08 e 09/02 e Corpus Christi 27/05', () => {
    expect(carnaval(2027)).toEqual(['2027-02-08', '2027-02-09'])
    expect(corpusChristi(2027)).toEqual(['2027-05-27'])
    expect(feriadosNacionais(2027)).toContain('2027-03-26') // Sexta-feira Santa
  })

  it('a união (legado) de 2026 é a lista de antes; de 2026 a 2029 são 52 datas; em 2023, sem o 20/11, 12', () => {
    expect(brazilianHolidays(2026)).toEqual([
      '2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25',
    ])
    expect(defaultHolidays(2026, 2029)).toHaveLength(52)
    expect(brazilianHolidays(2023)).toHaveLength(12)
  })
})
