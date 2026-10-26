import { describe, expect, it } from 'vitest'
import { custoMaoDeObraPorHorasAlocadas, durationFromTeam, scheduleDays, teamFromDuration, totalManHours } from './sinapi'
import { horasPorDia } from './calendarioTrabalho'

describe('SINAPI: bordas', () => {
  it('equipe a partir da duração', () => {
    expect(teamFromDuration(100, 0.8, 5, 8)).toBe(2)
    expect(teamFromDuration(100, 0.8, 0, 8)).toBe(Infinity)
    expect(teamFromDuration(100, 0.8, 5, 0)).toBe(Infinity)
  })

  it('divisor zero e arredondamento para o cronograma', () => {
    expect(durationFromTeam(100, 0.8, 0, 8)).toBe(Infinity)
    expect(durationFromTeam(100, 0.8, 2, 0)).toBe(Infinity)
    expect(scheduleDays(Infinity)).toBe(0)
    expect(scheduleDays(0.2)).toBe(1)
    expect(scheduleDays(2.0000000001)).toBe(2)
  })
})

describe('SINAPI: horas por dia da obra (CR-12, EO-3, D-18)', () => {
  // CR-1: 103332 SP não desonerado (RUP do pedreiro 1,6225376 H/m²), 640 m², equipe 4. Fonte: SINAPI 09/2026, Caixa (Analítico).
  const hh = totalManHours(640, 1.6225376)

  it('HH = quantidade × RUP', () => {
    expect(hh).toBeCloseTo(1038.424064, 9)
  })

  it('480 min/dia (8 h): 32,45 → 33 d.u.', () => {
    expect(durationFromTeam(640, 1.6225376, 4, horasPorDia(480))).toBeCloseTo(32.450752, 9)
    expect(scheduleDays(durationFromTeam(640, 1.6225376, 4, horasPorDia(480)))).toBe(33)
  })

  it('450 min/dia (7,5 h): 34,614135 → 35 d.u. = 15.750 min, contra 33 d.u. = 14.850 min das 8 h fixas (ANTES: 726 min a menos, 726,36)', () => {
    const raw = durationFromTeam(640, 1.6225376, 4, horasPorDia(450))
    expect(raw).toBeCloseTo(34.614135, 6)
    const dias = scheduleDays(raw)
    expect(dias).toBe(35)
    expect(dias * 450).toBe(15750)
    // Minutos que a equipe precisa: HH × 60 ÷ 4
    expect((hh * 60) / 4).toBeCloseTo(15576.36, 2)
    // Antes (8 h fixas, 33 d): 33 × 450 = 14.850 min, 726,36 min abaixo do necessário
    expect(33 * 450).toBe(14850)
    expect(Math.round((hh * 60) / 4 - 33 * 450)).toBe(726)
  })
})

describe('custo de mão de obra por horas alocadas (catálogo ilustrativo, sem recorte)', () => {
  it('HH × taxa do oficial + dias × horas por dia × serventes × taxa do servente', () => {
    // Catálogo 103332, 640 m², equipe 4: HH 524,8; 17 d.u.; 2 serventes; taxas padrão R$ 31,40 e R$ 23,90
    const c = custoMaoDeObraPorHorasAlocadas({ hh: 524.8, dias: 17, horasPorDia: 8, serventes: 2, taxaOficial: 31.4, taxaServente: 23.9 })
    expect(c).toBeCloseTo(22979.52, 2)
    // Com 450 min/dia (7,5 h) o trecho dos serventes usa as horas da obra
    expect(custoMaoDeObraPorHorasAlocadas({ hh: 524.8, dias: 17, horasPorDia: 7.5, serventes: 2, taxaOficial: 31.4, taxaServente: 23.9 })).toBeCloseTo(16478.72 + 17 * 7.5 * 2 * 23.9, 2)
    expect(custoMaoDeObraPorHorasAlocadas({ hh: 0, dias: 0, horasPorDia: 8, serventes: 0, taxaOficial: 31.4, taxaServente: 23.9 })).toBe(0)
  })
})
