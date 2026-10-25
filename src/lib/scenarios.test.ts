import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { WorkCalendar, addCalendarDays } from './calendar'
import { computeSchedule } from './cpm'
import { analyzeDelay, crashingTargets, fastTrackOptions, recommendScenario, simulateAll, simulateCrashing, simulateFastTracking, simulateOvertime } from './scenarios'
import { analyzeSupplies } from './supplies'

const seed = buildSeedState()
const cal = new WorkCalendar(seed.meta.startDate, seed.calendar)
const forecast = computeSchedule(seed.tasks, cal, { mode: 'forecast', statusDate: seed.meta.statusDate })
const ctx = { tasks: seed.tasks, calendar: seed.calendar, meta: seed.meta, forecast, origin: analyzeDelay(seed.tasks, forecast, cal).origin }

describe('Crashing parametrizável', () => {
  it('padrão: +2 pedreiros e +1 servente na sucessora crítica (105) com memória de cálculo', () => {
    const r = simulateCrashing(ctx)
    expect(r.targetUid).toBe(105)
    expect(r.daysRecovered).toBe(3)
    expect(r.memory[0]).toContain('⌈16 × 6 ÷ (6 + 2) × 1,05⌉')
    expect(r.extraCost).toBeCloseTo((2 * 31.4 + 23.9) * 8 * 13 + 3 * 1200, 2)
  })
  it('mais equipe recupera mais dias, com risco maior', () => {
    const r = simulateCrashing(ctx, { addOfficials: 6, addServentes: 3 })
    expect(r.daysRecovered).toBeGreaterThan(3)
    expect(r.risk).not.toBe('Baixo')
  })
  it('tarefa fora do caminho crítico não antecipa a entrega', () => {
    const nonCritical = crashingTargets(ctx).find((o) => !o.critical)!
    const r = simulateCrashing(ctx, { addOfficials: 2, addServentes: 1, targetUid: Number(nonCritical.value) })
    expect(r.daysRecovered).toBe(0)
    expect(r.riskNote).toMatch(/não está no caminho crítico/)
  })
  it('zero profissionais não é aplicável', () => {
    expect(simulateCrashing(ctx, { addOfficials: 0, addServentes: 0 }).applicable).toBe(false)
  })
})

describe('Fast Tracking parametrizável', () => {
  it('sugere Alvenaria → Elétrica e quanto maior a latência, menor o ganho', () => {
    expect(fastTrackOptions(ctx)[0].value).toBe('105>401')
    const lag3 = simulateFastTracking(ctx, { lagDays: 3 })
    const lag10 = simulateFastTracking(ctx, { lagDays: 10 })
    expect(lag3.daysRecovered).toBeGreaterThan(lag10.daysRecovered)
    expect(lag3.risk).toBe('Alto')
    expect(lag10.risk).toBe('Médio') // (16 − 10) ÷ 16 = 37,5% de sobreposição
  })
})

describe('Hora extra parametrizável', () => {
  it('cada sábado convocado vale 1 dia útil enquanto há frente crítica ativa', () => {
    expect(simulateOvertime(ctx, { saturdays: 1 }).daysRecovered).toBe(1)
    const four = simulateOvertime(ctx, { saturdays: 4 })
    expect(four.daysRecovered).toBe(4)
    expect(four.addedWorkingDays).toHaveLength(4)
  })
})

describe('Recomendação', () => {
  it('prefere o menor saldo entre cenários de risco baixo/médio', () => {
    const rec = recommendScenario(simulateAll(ctx))
    expect(rec.kind).toBe('crashing')
    expect(rec.reason).toMatch(/Fast Tracking/)
  })
})

describe('Suprimentos', () => {
  it('a margem de segurança desloca a DLP', () => {
    const base = analyzeSupplies(seed.materials, seed.tasks, forecast, seed.meta.statusDate, [], 3).find((x) => x.material.id === 'm-concreto')!
    const wide = analyzeSupplies(seed.materials, seed.tasks, forecast, seed.meta.statusDate, [], 10).find((x) => x.material.id === 'm-concreto')!
    expect(wide.dlp).toBe(addCalendarDays(base.dlp, -7))
  })

  beforeEach(() => {
    globalThis.localStorage?.clear?.()
    setActivePinia(createPinia())
  })

  it('store: editar lead time, cadastrar, receber e remover insumo', () => {
    const store = useProjectStore()
    const status = () => (id: string) => store.supplies.find((x) => x.material.id === id)!.status
    expect(status()('m-concreto')).toBe('ok')
    store.updateMaterial('m-concreto', { leadTimeDays: 20 })
    expect(status()('m-concreto')).toBe('atrasada')

    const m = store.addMaterial({ name: 'Esquadria de alumínio', spec: 'Linha 25', unit: 'un', quantity: 480, unitPrice: 900, supplier: 'Exemplo', taskUid: 701, leadTimeDays: 60 })
    expect(store.supplies.find((x) => x.material.id === m.id)?.needDate).toBe(store.schedule.byUid.get(701)!.start)

    store.registerDelivery('m-bloco')
    expect(status()('m-bloco')).toBe('entregue')

    store.removeMaterial(m.id)
    expect(store.state.materials.some((x) => x.id === m.id)).toBe(false)
  })

  it('store: parâmetros do simulador recalculam os cenários na hora', () => {
    const store = useProjectStore()
    const before = store.scenarios.overtime.daysRecovered
    store.scenarioParams.overtime.saturdays = 3
    expect(store.scenarios.overtime.daysRecovered).toBe(before + 1)
    store.resetScenarioParams()
    expect(store.scenarios.overtime.daysRecovered).toBe(before)
  })
})
