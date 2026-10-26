import { describe, expect, it } from 'vitest'
import type { CalendarioObra, Task } from '@/types/domain'
import { brazilianHolidays } from './calendar'
import { calendarioPadrao, comDiasExtras, compilarCalendarios } from './calendarioTrabalho'
import { computeEvm, plannedFraction } from './evm'
import { projetarLinhaBase } from './linhasBase'

// CR-2d: o PV usa os minutos úteis do calendário da TAREFA (PMBOK: PV = BAC × fração planejada).
const padrao = calendarioPadrao(brazilianHolidays(2026))
const sabado4h: CalendarioObra = { ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
const cals = compilarCalendarios('2026-08-03', [padrao, sabado4h], 1)

// 12 dias (5.760 min) no sábado de 4 h: de seg 03/08 a seg 17/08, BAC R$ 12.000,00
const tarefa: Task = {
  uid: 1, wbs: '1', name: 'Fundação', outlineLevel: 1, isSummary: false, duracaoMin: 5760, calendarioUid: 2, predecessors: [],
  percentComplete: 0, bac: 12000, actualCost: 0, resources: [], baselineStart: '2026-08-03', baselineFinish: '2026-08-17', baselineDuracaoMin: 5760,
}

describe('PV no calendário da tarefa (CR-2d)', () => {
  it('status em sex 07/08: 2.400 de 5.760 min = R$ 5.000,00', () => {
    expect(plannedFraction(tarefa, cals, '2026-08-07')).toBeCloseTo(2400 / 5760, 10)
    expect(computeEvm([tarefa], cals, '2026-08-07').pv).toBeCloseTo(5000, 2)
  })

  it('status em sáb 08/08 (útil de 4 h para a tarefa): 2.640 de 5.760 min = R$ 5.500,00', () => {
    expect(computeEvm([tarefa], cals, '2026-08-08').pv).toBeCloseTo(5500, 2)
  })

  it('o mesmo intervalo no calendário padrão tem outra conta: 10 dias úteis (4.800 min), PV de 5/10 na sexta', () => {
    const noPadrao = { ...tarefa, calendarioUid: undefined, baselineFinish: '2026-08-14' }
    expect(plannedFraction(noPadrao, cals, '2026-08-07')).toBeCloseTo(0.5, 10)
    expect(computeEvm([noPadrao], cals, '2026-08-07').pv).toBeCloseTo(6000, 2)
  })

  it('antes do início o PV é zero; depois do término, o BAC inteiro; sem linha de base completa, zero', () => {
    expect(computeEvm([tarefa], cals, '2026-07-31').pv).toBe(0)
    expect(computeEvm([tarefa], cals, '2026-08-17').pv).toBeCloseTo(12000, 2)
    expect(computeEvm([tarefa], cals, '2026-09-30').pv).toBeCloseTo(12000, 2)
    expect(plannedFraction({ ...tarefa, baselineFinish: undefined }, cals, '2026-08-07')).toBe(0)
  })

  it('o PV ignora as exceções úteis (sábado de hora extra) e conta os feriados', () => {
    const comExtra = comDiasExtras(padrao, ['2026-08-08'])
    const semExtra = compilarCalendarios('2026-08-03', [comExtra], 1, { semExcecoesUteis: true })
    const noPadrao = { ...tarefa, calendarioUid: undefined, baselineFinish: '2026-08-14' }
    // Com o sábado extra contando seriam 5.280 min no total e 2.880 até 08/08; sem ele, são 4.800 e 2.400
    expect(plannedFraction(noPadrao, semExtra, '2026-08-08')).toBeCloseTo(0.5, 10)
    expect(plannedFraction(noPadrao, compilarCalendarios('2026-08-03', [comExtra], 1), '2026-08-08')).toBeCloseTo(2880 / 5280, 10)
  })

  it('EV e AC não dependem do calendário; SPI = EV ÷ PV', () => {
    const avancada = { ...tarefa, percentComplete: 25, actualCost: 3500 }
    const e = computeEvm([avancada], cals, '2026-08-07')
    expect(e.ev).toBeCloseTo(3000, 2)
    expect(e.ac).toBeCloseTo(3500, 2)
    expect(e.spi).toBeCloseTo(0.6, 4)
    expect(e.cpi).toBeCloseTo(0.8571, 4)
  })
})

describe('computeEvm com a LB do valor agregado projetada (ciclo 00007, G5 = b e G6 = a)', () => {
  // Calendário padrão seg–sex, sem feriados. LB0: 03/08 a 14/08 (10 d.u.), BAC 1.000; LB2: 10/08 a 21/08 (10 d.u.), custo congelado de 800
  const cal = compilarCalendarios('2026-08-03', [calendarioPadrao([])], 1)
  const t: Task = {
    uid: 1, wbs: '1', name: 'Alvenaria', outlineLevel: 1, isSummary: false, duracaoMin: 4800, predecessors: [], percentComplete: 50, bac: 1000, actualCost: 600, resources: [],
    baselineStart: '2026-08-03', baselineFinish: '2026-08-14', baselineDuracaoMin: 4800,
    linhasBase: { '2': { inicio: '2026-08-10', termino: '2026-08-21', duracaoMin: 4800, custo: 800 } },
  }

  it('status em 07/08: LB0 PV 500,00 e EV 500,00; LB2 PV 0,00 (a LB2 começa em 10/08) e EV 400,00 (50% do custo congelado)', () => {
    const lb0 = computeEvm(projetarLinhaBase([t], 0), cal, '2026-08-07')
    expect([lb0.bac, lb0.pv, lb0.ev, lb0.ac]).toEqual([1000, 500, 500, 600])
    const lb2 = computeEvm(projetarLinhaBase([t], 2), cal, '2026-08-07')
    expect([lb2.bac, lb2.pv, lb2.ev, lb2.ac]).toEqual([800, 0, 400, 600])
    expect(lb2.cpi).toBeCloseTo(0.666667, 6)
  })

  it('status em 14/08: LB0 PV 1.000,00; LB2 PV 400,00 (5 de 10 d.u. de R$ 800,00)', () => {
    expect(computeEvm(projetarLinhaBase([t], 0), cal, '2026-08-14').pv).toBe(1000)
    expect(computeEvm(projetarLinhaBase([t], 2), cal, '2026-08-14').pv).toBe(400)
  })
})
