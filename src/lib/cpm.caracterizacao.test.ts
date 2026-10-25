// Caracterização do ciclo 00004 (CR-1): as 20 folhas do Edifício Aurora, medidas no motor em dias úteis ANTES da
// refatoração para minutos. O E1 não pode mudar nenhuma célula. Só o adaptador `agendar` acompanha a API do motor.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'

type Modo = 'baseline' | 'forecast'

function agendar(modo: Modo) {
  const seed = buildSeedState()
  const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
  return computeSchedule(seed.tasks, cals, { mode: modo, statusDate: seed.meta.statusDate })
}

// uid, linha de base [início, término, FT, FL, crítica], previsão [início, término, FT, FL, crítica]
type Linha = [number, [string, string, number, number, boolean], [string, string, number, number, boolean]]
const TABELA: Linha[] = [
  [201, ['2026-05-04', '2026-05-15', 0, 0, true], ['2026-05-04', '2026-05-15', 0, 0, false]],
  [202, ['2026-05-18', '2026-06-15', 0, 0, true], ['2026-05-18', '2026-06-17', 0, 0, false]],
  [203, ['2026-06-16', '2026-07-06', 0, 0, true], ['2026-06-18', '2026-07-10', 0, 0, false]],
  [301, ['2026-07-07', '2026-08-31', 0, 0, true], ['2026-07-13', '2026-09-11', 0, 0, false]],
  [302, ['2026-09-01', '2026-10-22', 49, 0, false], ['2026-09-14', '2026-11-05', 56, 0, false]],
  [303, ['2026-10-23', '2026-12-21', 49, 0, false], ['2026-11-06', '2027-01-05', 56, 0, false]],
  [103, ['2026-09-09', '2026-09-24', 0, 0, true], ['2026-09-16', '2026-10-02', 0, 0, false]],
  [104, ['2026-09-25', '2026-10-13', 0, 0, true], ['2026-10-05', '2026-11-05', 0, 0, true]],
  [105, ['2026-10-14', '2026-11-05', 0, 0, true], ['2026-11-06', '2026-11-30', 0, 0, true]],
  [106, ['2026-11-06', '2027-02-02', 60, 11, false], ['2026-12-01', '2027-02-26', 60, 4, false]],
  [401, ['2026-11-06', '2027-01-26', 0, 0, true], ['2026-12-01', '2027-02-19', 0, 0, true]],
  [402, ['2026-11-23', '2027-02-18', 10, 0, false], ['2026-12-15', '2027-03-12', 10, 0, false]],
  [501, ['2026-11-30', '2027-03-18', 0, 0, true], ['2026-12-22', '2027-04-12', 0, 0, true]],
  [502, ['2027-01-06', '2027-03-25', 0, 0, true], ['2027-01-28', '2027-04-19', 0, 0, true]],
  [601, ['2026-12-21', '2027-02-25', 30, 20, false], ['2027-01-14', '2027-03-19', 30, 20, false]],
  [602, ['2027-02-19', '2027-05-03', 10, 10, false], ['2027-03-15', '2027-05-25', 10, 10, false]],
  [701, ['2027-02-19', '2027-05-17', 0, 0, true], ['2027-03-15', '2027-06-09', 0, 0, true]],
  [702, ['2026-12-22', '2027-03-05', 49, 49, false], ['2027-01-06', '2027-03-18', 56, 56, false]],
  [801, ['2027-05-18', '2027-06-01', 0, 0, true], ['2027-06-10', '2027-06-23', 0, 0, true]],
  [802, ['2027-06-01', '2027-06-01', 0, 0, true], ['2027-06-23', '2027-06-23', 0, 0, true]],
]

describe('CR-1: caracterização do Aurora (folhas × 2 modos)', () => {
  const base = agendar('baseline')
  const prev = agendar('forecast')

  for (const [uid, b, f] of TABELA) {
    it(`UID ${uid}: linha de base`, () => {
      const s = base.byUid.get(uid)!
      expect([s.start, s.finish, s.totalFloat, s.freeFloat, s.critical]).toEqual(b)
    })
    it(`UID ${uid}: previsão`, () => {
      const s = prev.byUid.get(uid)!
      expect([s.start, s.finish, s.totalFloat, s.freeFloat, s.critical]).toEqual(f)
    })
  }

  it('fim do projeto e caminhos críticos', () => {
    expect(base.projectFinish).toBe('2027-06-01')
    expect(prev.projectFinish).toBe('2027-06-23')
    expect([...base.criticalPath].sort((a, b) => a - b)).toEqual([103, 104, 105, 201, 202, 203, 301, 401, 501, 502, 701, 801, 802])
    expect([...prev.criticalPath].sort((a, b) => a - b)).toEqual([104, 105, 401, 501, 502, 701, 801, 802])
  })
})

describe('CR-1: EVM e cenários do Aurora', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  it('EVM e atraso', () => {
    const store = useProjectStore()
    expect(store.evm.pv).toBeCloseTo(7259250, 2)
    expect(store.evm.ev).toBeCloseTo(6448200, 2)
    expect(store.evm.ac).toBeCloseTo(6896900, 2)
    expect(store.evm.spi).toBeCloseTo(0.8883, 4)
    expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
    expect(store.delay.delayDays).toBe(16)
  })

  it('crashing, fast-tracking e hora extra', () => {
    const store = useProjectStore()
    const c = store.scenarios.crashing
    expect(c.targetUid).toBe(105)
    expect(c.daysRecovered).toBe(3)
    expect(c.extraCost).toBeCloseTo(12616.8, 2)
    expect(c.newFinish).toBe('2027-06-18')
    expect(c.details[0].value).toBe('16 → 13 dias úteis')
    const f = store.scenarios['fast-tracking']
    expect(f.targetUid).toBe(401)
    expect(f.predecessorUid).toBe(105)
    expect(f.daysRecovered).toBe(13)
    expect(f.newFinish).toBe('2027-06-04')
    const o = store.scenarios.overtime
    expect(o.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    expect(o.daysRecovered).toBe(2)
    expect(o.extraCost).toBeCloseTo(22315.2, 2)
    expect(o.newFinish).toBe('2027-06-21')
  })

  it('os três cenários aplicados juntos entregam em 2027-06-02 (fixture do esquema 2)', () => {
    const store = useProjectStore()
    for (const k of ['crashing', 'fast-tracking', 'overtime'] as const) store.applyScenario(store.scenarios[k])
    expect(store.schedule.projectFinish).toBe('2027-06-02')
  })
})
