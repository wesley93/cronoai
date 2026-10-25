import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/useProjectStore'
import { eacVariants, indexSeries, monthlyIncrements } from './evm'
import { inferGroup, lineDuration, parseBudgetCsv, parseNumberBR } from './sinapiBudget'

beforeEach(() => {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  setActivePinia(createPinia())
})

describe('Planilha SINAPI (CSV)', () => {
  it('lê números brasileiros', () => {
    expect(parseNumberBR('1.850,50')).toBe(1850.5)
    expect(parseNumberBR('R$ 98,50')).toBe(98.5)
    expect(parseNumberBR('0.82')).toBe(0.82)
    // Milhar pt-BR sem vírgula decimal (regressão: era lido como 1,28)
    expect(parseNumberBR('1.280')).toBe(1280)
    expect(parseNumberBR('12.500.000')).toBe(12500000)
    expect(parseNumberBR('1.5')).toBe(1.5)
  })

  it('importa CSV com ; completando RUP/custo pelo catálogo e apontando erros', () => {
    const csv = [
      'Código;Descrição;Local;Unidade;Quantidade;Custo unitário',
      '87529;Massa única interna;Hall;m²;1.280;',
      '99999;Serviço sem catálogo;;m²;100;10',
      ';Contrapiso garagem;Garagem;m²;0;45',
      '"88489";"Pintura látex; áreas comuns";Áreas comuns;m²;2100;18,40',
    ].join('\n')
    const r = parseBudgetCsv(csv)
    expect(r.lines).toHaveLength(2)
    expect(r.lines[0]).toMatchObject({ code: '87529', quantity: 1280, rup: 0.62, unitCost: 38.9, group: '05', location: 'Hall' })
    expect(r.lines[1]).toMatchObject({ code: '88489', description: 'Pintura látex; áreas comuns', professional: 'Pintor', group: '07' })
    expect(r.errors.join(' ')).toMatch(/Linha 3: RUP ausente/)
    expect(r.errors.join(' ')).toMatch(/Linha 4: quantidade inválida/)
  })

  it('infere o grupo da EAP pela descrição', () => {
    expect(inferGroup('Chapisco interno')).toBe('05')
    expect(inferGroup('Assentamento de porcelanato')).toBe('06')
    expect(inferGroup('Serviço genérico')).toBe('09')
  })
})

describe('Geração em lote na EAP', () => {
  it('cria os pacotes com vínculos de engenharia e esvazia a planilha', () => {
    const store = useProjectStore()
    const lines = [...store.state.budget]
    expect(lines).toHaveLength(5)
    const before = store.leaves.length
    const preview = store.previewBudgetBatch({ mode: 'SS', overlapPct: 40 })!
    const created = store.generateFromBudget({ mode: 'SS', overlapPct: 40 })

    expect(created).toHaveLength(5)
    expect(store.leaves.length).toBe(before + 5)
    expect(store.state.budget).toHaveLength(0)
    expect(store.schedule.projectFinish).toBe(preview.projectFinish)

    const contrapiso = created.find((t) => t.sinapi === '87630')!
    const porcelanato = created.find((t) => t.sinapi === '87263')!
    // 1ª linha do grupo 06: FS na última tarefa do grupo anterior; 2ª: SS com 40% da anterior
    expect(contrapiso.predecessors[0].type).toBe('FS')
    expect(porcelanato.predecessors).toEqual([{ uid: contrapiso.uid, type: 'SS', lagDays: Math.round(contrapiso.durationDays * 0.4) }])
    expect(porcelanato.durationDays).toBe(lineDuration(lines.find((l) => l.code === '87263')!))
    expect(porcelanato.wbs.startsWith('06.')).toBe(true)
    expect(store.taskByUid.get(porcelanato.uid)!.baselineStart).toBeTruthy()
  })

  it('FS em série encadeia o mesmo grupo sem sobreposição', () => {
    const store = useProjectStore()
    const created = store.generateFromBudget({ mode: 'FS', overlapPct: 40 })
    const porcelanato = created.find((t) => t.sinapi === '87263')!
    expect(porcelanato.predecessors[0]).toMatchObject({ type: 'FS', lagDays: 0 })
  })
})

describe('EVM: previsões e séries', () => {
  it('três premissas de EAC', () => {
    const store = useProjectStore()
    const e = store.evm
    const [cpi, atipico, composto] = eacVariants(e)
    expect(cpi.value).toBeCloseTo(e.bac / e.cpi, 2)
    expect(atipico.value).toBeCloseTo(e.ac + (e.bac - e.ev), 2)
    expect(composto.value).toBeCloseTo(e.ac + (e.bac - e.ev) / (e.cpi * e.spi), 2)
    expect(composto.value).toBeGreaterThan(cpi.value) // SPI < 1 agrava o composto
  })

  it('o último ponto da série de índices bate com o SPI/CPI da data de status', () => {
    const store = useProjectStore()
    const last = indexSeries(store.sCurve).at(-1)!
    expect(last.spi).toBeCloseTo(store.evm.spi, 3)
    expect(last.cpi).toBeCloseTo(store.evm.cpi, 3)
  })

  it('valores mensais somam o acumulado', () => {
    const store = useProjectStore()
    const monthly = monthlyIncrements(store.sCurve)
    const sum = monthly.reduce((a, p) => a + p.pv, 0)
    expect(sum).toBeCloseTo(store.sCurve.at(-1)!.pv, 2)
  })

  it('Curva S por pacote fecha com o EV do pacote', () => {
    const store = useProjectStore()
    const curve = store.sCurveFor('02')
    const lastExecuted = [...curve].reverse().find((p) => p.ev !== null)!
    expect(lastExecuted.ev!).toBeCloseTo(store.evmFor('02').ev, 2)
  })

  it('término pelo SPI fica depois da linha de base quando SPI < 1', () => {
    const store = useProjectStore()
    const f = store.evmForecast
    expect(f.bySpi.estimatedDays).toBe(Math.round(f.bySpi.plannedDays / store.evm.spi))
    expect(f.bySpi.date > f.baselineFinish).toBe(true)
  })
})
