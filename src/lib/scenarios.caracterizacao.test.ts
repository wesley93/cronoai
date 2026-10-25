// Caracterização do ciclo 00005 (PR-1): os números dos cenários, da DLP e do EVM do Aurora ANTES de as premissas virarem
// dado da obra. O arquivo não muda ao longo do ciclo: com as premissas padrão, tudo continua igual (AC-1).
// Fonte: medição no código do 00004 (CR-1 do plano 00005, seção 04), 25/10/2026.
import { describe, expect, it } from 'vitest'
import { buildSeedState } from '@/stores/useProjectStore'
import { calendarioDeDias, compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { computeEvm } from './evm'
import { analyzeDelay, recommendScenario, simulateAll } from './scenarios'
import { analyzeSupplies } from './supplies'

const seed = buildSeedState()
const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
const forecast = computeSchedule(seed.tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })
const ctx = {
  tasks: seed.tasks,
  calendarios: seed.calendarios,
  calendarioPadraoUid: seed.calendarioPadraoUid,
  meta: seed.meta,
  forecast,
  origin: analyzeDelay(seed.tasks, forecast, calendarioDeDias(cals.padrao)).origin,
}

describe('PR-1: cenários do Aurora com as premissas padrão', () => {
  const r = simulateAll(ctx)

  it('crashing: 105, 16 → 13 d, 3 d.u., R$ 12.616,80, economia R$ 29.550,00, 2027-06-18, risco Baixo', () => {
    const c = r.crashing
    expect(c.applicable).toBe(true)
    expect(c.targetUid).toBe(105)
    expect(c.daysRecovered).toBe(3)
    expect(c.newFinish).toBe('2027-06-18')
    expect(c.extraCost).toBeCloseTo(12616.8, 2)
    expect(c.indirectSavings).toBe(29550)
    expect(c.netImpact).toBeCloseTo(-16933.2, 2)
    expect(c.risk).toBe('Baixo')
    expect(c.details[0].value).toBe('16 → 13 dias úteis')
  })

  it('fast tracking: 105 → 401 SS+3, 13 d.u., contingência R$ 25.350,00, economia R$ 128.050,00, 2027-06-04, risco Alto', () => {
    const f = r['fast-tracking']
    expect([f.predecessorUid, f.targetUid]).toEqual([105, 401])
    expect(f.daysRecovered).toBe(13)
    expect(f.newFinish).toBe('2027-06-04')
    expect(f.extraCost).toBeCloseTo(25350, 2)
    expect(f.indirectSavings).toBe(128050)
    expect(f.netImpact).toBeCloseTo(-102700, 2)
    expect(f.risk).toBe('Alto')
  })

  it('hora extra: 2 sábados, 2 d.u., R$ 22.315,20, 64 profissionais-dia, economia R$ 19.700,00, saldo +R$ 2.615,20, 2027-06-21, risco Médio', () => {
    const h = r.overtime
    expect(h.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    expect(h.daysRecovered).toBe(2)
    expect(h.newFinish).toBe('2027-06-21')
    // (756,40 + 173,40) × 8 h × 1,5 × 2 sábados (302: 26 profissionais; 104: 6)
    expect(h.extraCost).toBeCloseTo(22315.2, 2)
    expect(h.details[0].value).toBe('64')
    expect(h.indirectSavings).toBe(19700)
    expect(h.netImpact).toBeCloseTo(2615.2, 2)
    expect(h.risk).toBe('Médio')
    expect(h.summary).toContain('(8 h, adicional de 50%)')
  })

  it('recomendação: crashing', () => {
    expect(recommendScenario(r).kind).toBe('crashing')
  })
})

describe('PR-1: DLP e EVM do Aurora', () => {
  it('DLP do m-concreto: necessária 2026-11-05, DLP 2026-10-30, atenção', () => {
    const a = analyzeSupplies(seed.materials, seed.tasks, forecast, seed.meta.statusDate, []).find((x) => x.material.id === 'm-concreto')!
    expect([a.needDate, a.dlp, a.status]).toEqual(['2026-11-05', '2026-10-30', 'atencao'])
  })

  it('PV 7.259.250,00; SPI 0,8883; CPI 0,9349; entrega 2027-06-23', () => {
    const calsPv = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid, { semExcecoesUteis: true })
    const e = computeEvm(seed.tasks, calsPv, seed.meta.statusDate)
    expect(e.pv).toBeCloseTo(7259250, 2)
    expect(e.spi).toBeCloseTo(0.8883, 4)
    expect(e.cpi).toBeCloseTo(0.9349, 4)
    expect(forecast.projectFinish).toBe('2027-06-23')
  })
})

describe('PR-7: hora extra com todas as frentes e sábado inteiro reproduz o PR-1', () => {
  it('{ saturdays: 2, jornada: integral, frentes: todas }: 2 d.u., R$ 22.315,20, 64 profissionais-dia, 2027-06-21', () => {
    const h = simulateAll(ctx, { crashing: { addOfficials: 2, addServentes: 1 }, fastTracking: { lagDays: 3 }, overtime: { saturdays: 2, jornada: 'integral', frentes: 'todas' } }).overtime
    expect(h.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    expect([h.daysRecovered, h.newFinish, h.details[0].value]).toEqual([2, '2027-06-21', '64'])
    expect(h.extraCost).toBeCloseTo(22315.2, 2)
    expect(h.netImpact).toBeCloseTo(2615.2, 2)
  })
})
