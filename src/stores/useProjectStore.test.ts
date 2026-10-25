import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './useProjectStore'

describe('useProjectStore · visão MS Project', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  it('carrega o Edifício Aurora com todos os campos tipados', () => {
    const store = useProjectStore()
    const tasks = store.msProjectTasks
    expect(store.state.meta.name).toBe('Edifício Residencial Aurora - 12 Pavimentos')
    expect(tasks.filter((t) => !t.Summary)).toHaveLength(20)

    const t104 = store.msProjectTask(104)!
    expect(t104).toMatchObject({
      UniqueID: 104,
      WBS: '03.01.02',
      Duration: 12,
      PercentComplete: 40,
      IsCritical: true,
      BudgetAtCompletion: 168000,
      PlannedValue: 168000,
      EarnedValue: 67200,
      ActualCost: 72000,
      MaterialLeadTime: 10,
      Predecessors: [{ PredecessorUID: 103, Type: 'FS', LagDays: 0 }],
      Resources: [{ Name: 'Pedreiro', Units: 4 }, { Name: 'Servente', Units: 2 }],
    })
    expect(t104.Start).toBe('2026-10-05')
    expect(t104.Finish > t104.BaselineFinish!).toBe(true)
  })

  it('resumos consolidam PV/EV/AC das filhas e batem com o EVM global', () => {
    const store = useProjectStore()
    const tops = store.msProjectTasks.filter((t) => t.Summary && t.OutlineLevel === 1)
    const sum = (k: 'PlannedValue' | 'EarnedValue' | 'ActualCost') => tops.reduce((a, t) => a + t[k], 0)
    expect(sum('PlannedValue')).toBeCloseTo(store.evm.pv, 2)
    expect(sum('EarnedValue')).toBeCloseTo(store.evm.ev, 2)
    expect(sum('ActualCost')).toBeCloseTo(store.evm.ac, 2)
  })

  it('reflete na hora um apontamento aprovado', () => {
    const store = useProjectStore()
    store.approveReport('r-tiao', 104, 75, [])
    const t104 = store.msProjectTask(104)!
    expect(t104.PercentComplete).toBe(75)
    expect(t104.EarnedValue).toBe(126000)
    expect(t104.ActualCost).toBeGreaterThan(72000)
  })

  // Números de referência do E2E (e2e/fluxos.spec.ts): aqui separam falha de motor de falha de tela
  it('N-1: obra de exemplo entrega em 23/06/27, +16 d.u., SPI 0,89 e CPI 0,93', () => {
    const store = useProjectStore()
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.delay.delayDays).toBe(16)
    expect(store.evm.spi).toBeCloseTo(0.8883, 4)
    expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
  })

  it('N-2: aprovar o relato do Mestre Tião (75%) antecipa 5 d.u. e a entrega vai a 16/06/27', () => {
    const store = useProjectStore()
    expect(store.approveReport('r-tiao', 104, 75, [])).toEqual({ delta: -5 })
    expect(store.schedule.projectFinish).toBe('2027-06-16')
  })

  it('N-3: crashing no estado inicial recupera 3 d.u., custa R$ 12.616,80 e entrega em 18/06/27', () => {
    const store = useProjectStore()
    const r = store.scenarios.crashing
    expect(r.daysRecovered).toBe(3)
    expect(r.extraCost).toBeCloseTo(12616.8, 1)
    store.applyScenario(r)
    expect(store.schedule.projectFinish).toBe('2027-06-18')
  })
})
