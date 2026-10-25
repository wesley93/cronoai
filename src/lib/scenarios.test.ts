import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { addCalendarDays } from './calendar'
import { calendarioDeDias, compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { analyzeDelay, crashingTargets, fastTrackOptions, recommendScenario, simulateAll, simulateCrashing, simulateFastTracking, simulateOvertime } from './scenarios'
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

describe('Suprimentos do Aurora: efeito do restante exato (CR-9, antes → depois)', () => {
  it('as datas necessárias recuam 1 dia (3 dias na 602, que cai numa sexta) e os avisos acompanham', () => {
    const a = analyzeSupplies(seed.materials, seed.tasks, forecast, seed.meta.statusDate, [])
    const por = (id: string) => a.find((x) => x.material.id === id)!
    // [necessidade antes, necessidade depois, DLP depois, status depois]
    expect([por('m-aco').needDate, por('m-aco').dlp, por('m-aco').status]).toEqual(['2026-11-05', '2026-10-18', 'atrasada']) // antes: 06/11, DLP 19/10
    expect([por('m-concreto').needDate, por('m-concreto').dlp, por('m-concreto').status]).toEqual(['2026-11-05', '2026-10-30', 'atencao']) // antes: 06/11, 31/10, ok
    expect([por('m-cimento').needDate, por('m-cimento').dlp, por('m-cimento').status]).toEqual(['2026-11-05', '2026-10-31', 'ok']) // antes: 06/11, 01/11
    expect([por('m-bloco').needDate, por('m-bloco').postponeDays]).toEqual(['2026-11-30', 24]) // antes: 01/12, reagendar +25 dias
    expect([por('m-porcelanato').needDate, por('m-porcelanato').postponeDays]).toEqual(['2027-03-12', 21]) // antes: 15/03, reagendar +24 dias
    expect([por('m-ac3').needDate, por('m-ac3').status]).toEqual(['2027-03-12', 'ok']) // antes: 15/03
    expect([por('m-eletroduto').needDate, por('m-eletroduto').status]).toEqual(['2026-11-30', 'entregue']) // antes: 01/12
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
    // Antes do E2 (restante em dias inteiros) a UID 303 começava em 06/11 e a DLP do concreto era 31/10: "ok" (8 dias de folga).
    // Com o restante exato (CR-9) a 303 começa em 05/11, a DLP vai a 30/10 e faltam 7 dias: "atenção".
    expect(status()('m-concreto')).toBe('atencao')
    expect(store.supplies.find((x) => x.material.id === 'm-concreto')).toMatchObject({ needDate: '2026-11-05', dlp: '2026-10-30', headline: 'Emitir pedido em 7 dias' })
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
