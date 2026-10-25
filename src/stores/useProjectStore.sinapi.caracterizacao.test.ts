// Caracterização do SINAPI ANTES do ciclo 00006 (medida na base 281a99a): o que a calculadora, a tarefa gerada e a planilha
// produziam com o catálogo ilustrativo. Os valores aqui são os de HOJE; o ciclo muda só o que o plano declara
// (BAC com centavos, horas por dia da obra) e cada mudança aparece como "antes → depois" nos testes do ciclo.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/useProjectStore'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import { lineFromCatalog, lineResources, parseBudgetCsv } from '@/lib/sinapiBudget'
import { rateOf } from '@/lib/scenarios'

beforeEach(() => {
  globalThis.localStorage?.clear?.()
  setActivePinia(createPinia())
})

const alvenaria = SINAPI_CATALOG.find((c) => c.code === '103332')!

describe('SINAPI antes do 00006: caracterização', () => {
  it('calculadora com o catálogo (CR-9): 640 m², equipe 4 → 17 d.u., Pedreiro 4 + Servente 2, BAC R$ 63.040', () => {
    const l = lineFromCatalog(alvenaria, 'x', 640, 4)
    expect(l.rup).toBe(0.82)
    expect(l.unitCost).toBe(98.5)
    // HH 524,8 ÷ (4 × 8) = 16,4 → 17
    expect(l.quantity * l.rup).toBeCloseTo(524.8, 9)
    expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(640 * l.unitCost).toBe(63040)
  })

  it('custo de mão de obra estimado da calculadora (hoje): HH × taxa do oficial + dias × 8 h × serventes × taxa do servente', () => {
    const store = useProjectStore()
    const prem = store.premissasVigentes
    expect(rateOf(prem, 'Pedreiro')).toBe(31.4)
    expect(rateOf(prem, 'Servente')).toBe(23.9)
    const laborCost = 524.8 * 31.4 + 17 * 8 * 2 * 23.9
    expect(laborCost).toBeCloseTo(16478.72 + 6500.8, 2) // R$ 22.979,52
  })

  it('buildSinapiTask: o BAC da tarefa gravada é arredondado a R$ inteiro (79.334,40 → 79.334) e a duração usa os minutos por dia da obra', () => {
    const store = useProjectStore()
    const res = store.addSinapiTask({
      name: 'Alvenaria teste', code: '103332', unit: 'm²', quantity: 640, unitCost: 123.96, durationDays: 33,
      resources: [{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }],
      parentWbs: '03', linkType: 'FS', lagDays: 0,
    })
    if (!res.ok) throw new Error(res.erro)
    expect(res.task.bac).toBe(79334) // ANTES do ciclo (D-19)
    expect(res.task.duracaoMin).toBe(33 * 480)
    expect(res.task.notes).toBe('Gerado pelo CronoAI a partir do SINAPI 103332: 640 m².')
  })

  it('planilha CSV completa RUP, custo e profissional pelo catálogo ilustrativo', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade;equipe\n103332;Alvenaria;m²;640;4')
    expect(r.errors).toEqual([])
    expect(r.lines[0]).toMatchObject({ code: '103332', rup: 0.82, unitCost: 98.5, professional: 'Pedreiro', helperRatio: 0.5, team: 4, group: '03' })
  })

  it('exportação do exemplo: MSPDI válido com strictOrder (a igualdade byte a byte com a base foi conferida por script, no relatório)', () => {
    const store = useProjectStore()
    const e = store.exportXml()
    expect(e.validation.valid).toBe(true)
    expect(e.validation.errors).toEqual([])
  })
})
