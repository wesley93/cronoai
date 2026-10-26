// Linhas de base LB0 a LB10 na store (ciclo 00007, E1): salvar, escolher a LB do valor agregado, G5 = b (atraso e variações na LB0),
// G6 = a (custo da LB n), inclusão de escopo e agenda × valor agregado (a troca de LB não refaz o cronograma).
// Valores esperados medidos no código de produção e conferidos à mão no plano (Aurora, data de status 2026-10-23).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from './useProjectStore'

const NOME = 'Replanejamento'
const lb = (numero: number, extra: Record<string, unknown> = {}) => ({ numero, nome: NOME, motivo: 'Teste de replanejamento', ...extra })

function nova() {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  setActivePinia(createPinia())
  return useProjectStore()
}

describe('useProjectStore · linhas de base (ciclo 00007, E1)', () => {
  let store: ReturnType<typeof useProjectStore>
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T15:00:00.000Z'))
    store = nova()
  })
  afterEach(() => vi.useRealTimers())

  const folhas = () => store.state.tasks.filter((t) => !t.isSummary)

  it('o Aurora abre com a LB0 nos metadados, sem LB do valor agregado e sem nenhum número mudado (AC-1)', () => {
    expect(store.state.linhasBase).toEqual([
      { numero: 0, nome: 'Linha de base 0', motivo: 'Linha de base inicial do exemplo', salvaEm: '2026-04-27T12:00:00.000Z', origem: 'cronoai' },
    ])
    expect(store.linhaBaseAtiva).toBe(0)
    expect(store.state.meta.linhaBaseAtiva).toBeUndefined()
    expect([store.evm.bac, store.evm.pv, store.evm.ev, store.evm.ac]).toEqual([19113000, 7259250, 6448200, 6896900])
    expect(store.avisoSemLinhaBase).toBeUndefined()
  })

  it('LB-1: salvar a LB1 copia início, término, duração e custo (bac) das folhas e NÃO altera a LB0', () => {
    const lb0 = () => JSON.stringify(store.state.tasks.map((t) => [t.uid, t.baselineStart, t.baselineFinish, t.baselineDuracaoMin, t.bac]))
    const lb0Antes = lb0()
    expect(store.salvarLinhaBase({ ...lb(1), autor: 'Eng. de Planejamento' })).toEqual({ ok: true })
    for (const t of folhas()) {
      const s = store.schedule.byUid.get(t.uid)!
      expect(t.linhasBase?.['1']).toEqual({ inicio: s.start, termino: s.finish, duracaoMin: s.duracaoMin, custo: t.bac })
    }
    // o previsto do 302 e do 104 (C-7)
    expect(store.taskByUid.get(302)!.linhasBase?.['1']).toEqual({ inicio: '2026-09-14', termino: '2026-11-05', duracaoMin: 17722, custo: 2200000 })
    expect(store.taskByUid.get(104)!.linhasBase?.['1']).toEqual({ inicio: '2026-10-05', termino: '2026-11-05', duracaoMin: 10176, custo: 168000 })
    expect(lb0()).toBe(lb0Antes)
    expect(store.state.linhasBase.map((i) => [i.numero, i.nome])).toEqual([[0, 'Linha de base 0'], [1, NOME]])
    expect(store.state.linhasBase[1]).toEqual({ numero: 1, nome: NOME, motivo: 'Teste de replanejamento', autor: 'Eng. de Planejamento', salvaEm: '2026-10-25T15:00:00.000Z', dataStatus: '2026-10-23', origem: 'cronoai' })
    expect(store.state.log[0]).toMatchObject({ kind: 'sistema', title: 'Linha de base 1 salva' })
    // o resumo não ganha LB n no estado (vem do rollup)
    expect(store.state.tasks.filter((t) => t.isSummary).every((t) => t.linhasBase === undefined)).toBe(true)
  })

  it('LB-2 (regra do CronoAI): PV linear entre o início e o término da LB. LB1: PV 6.496.233,42 e SPI 0,992606; LB0: PV 7.259.250,00 e SPI 0,888274 (o MS Project daria SPI ≈ 1,00, M-4)', () => {
    store.salvarLinhaBase(lb(1))
    expect(store.definirLinhaBaseAtiva(1)).toEqual({ ok: true })
    // Antes (LB0) → depois (LB1): PV 7.259.250,00 → 6.496.233,42; SPI 0,888274 → 0,992606; EV não muda
    expect(store.evm.pv).toBeCloseTo(6496233.415233416, 2)
    expect(store.evm.spi).toBeCloseTo(0.992606, 6)
    expect(store.evm.ev).toBe(6448200)
    expect(store.evm.bac).toBe(19113000)
    expect(store.evm.ac).toBe(6896900)
    // a Curva S segue a LB do valor agregado: o ponto da data de status tem o PV da LB1
    expect(store.sCurve.find((p) => p.label === 'out/26 ●')!.pv).toBeCloseTo(6496233.415233416, 2)
    expect(store.definirLinhaBaseAtiva(0)).toEqual({ ok: true })
    expect(store.evm.pv).toBe(7259250)
    expect(store.evm.spi).toBeCloseTo(0.888274, 6)
    expect(store.state.meta.linhaBaseAtiva).toBeUndefined()
  })

  it('R-6 / LB-3 (G5 = b): com a LB1 do valor agregado, atraso +16 d.u., entrega, variação de término, crashing e DLP continuam contra a LB0', () => {
    const atrasoAntes = store.delay.delayDays
    const varAntes = folhas().map((t) => store.finishVarianceDays(t))
    const crashing = store.scenarios.crashing
    const dlpAntes = JSON.stringify(store.supplies.map((s) => [s.material.id, s.status, s.dlp, s.needDate, s.stopDays]))
    const baseAntes = JSON.stringify(store.state.tasks.map((t) => [t.uid, t.baselineStart, t.baselineFinish, t.baselineDuracaoMin]))
    store.salvarLinhaBase(lb(1))
    store.definirLinhaBaseAtiva(1)
    expect(store.delay.delayDays).toBe(16)
    expect(atrasoAntes).toBe(16)
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(folhas().map((t) => store.finishVarianceDays(t))).toEqual(varAntes)
    expect(store.scenarios.crashing.daysRecovered).toBe(3)
    expect(store.scenarios.crashing.extraCost).toBeCloseTo(12616.8, 2)
    expect(store.scenarios.crashing.daysRecovered).toBe(crashing.daysRecovered)
    expect(JSON.stringify(store.supplies.map((s) => [s.material.id, s.status, s.dlp, s.needDate, s.stopDays]))).toBe(dlpAntes)
    // Gantt e EAP leem as datas da LB0 em `state.tasks`: não mudam
    expect(JSON.stringify(store.state.tasks.map((t) => [t.uid, t.baselineStart, t.baselineFinish, t.baselineDuracaoMin]))).toBe(baseAntes)
    // a previsão pelo SPI usa a LB do valor agregado (PV e SPI dela)
    expect(store.evmForecast.baselineFinish).toBe('2027-06-23')
  })

  it('LB-4 (store): a 801 sem a LB3 e a LB3 do valor agregado: BAC 18.993.000,00, PV 7.259.250,00, EV 6.448.200,00, AC 6.896.900,00, CPI 0,934942, EAC 20.314.633,80 e o aviso', () => {
    for (const t of folhas()) {
      if (t.uid === 801) continue
      store.updateTask(t.uid, { linhasBase: { '3': { inicio: t.baselineStart, termino: t.baselineFinish, duracaoMin: t.baselineDuracaoMin, custo: t.bac } } })
    }
    store.state.linhasBase.push({ numero: 3, nome: 'LB3 de teste', motivo: 'm', origem: 'cronoai' })
    store.definirLinhaBaseAtiva(3)
    expect(store.evm.bac).toBe(18993000)
    expect(store.evm.pv).toBe(7259250)
    expect(store.evm.ev).toBe(6448200)
    expect(store.evm.ac).toBe(6896900)
    expect(store.evm.cpi).toBeCloseTo(0.934942, 6)
    expect(store.evm.eac).toBeCloseTo(20314633.8, 2)
    expect(store.avisoSemLinhaBase).toBe('1 tarefa(s) sem a linha de base 3: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando.')
  })

  it('LB-5 (G6 = a): o custo da LB2 fica congelado. bac do 104: 168.000 → 180.000: LB0 ativa: EV 6.453.000,00; LB2 ativa: EV 6.448.200,00', () => {
    store.salvarLinhaBase(lb(2))
    store.updateTask(104, { bac: 180000 })
    expect(store.evm.ev).toBe(6453000) // a LB0 acompanha o bac vivo (dívida registrada, E-2)
    store.definirLinhaBaseAtiva(2)
    expect(store.evm.ev).toBe(6448200)
    expect(store.evm.bac).toBe(19113000)
  })

  it('LB-6: salvar a LB1 de novo exige confirmação; com ela substitui e o log registra o nome e a data da anterior', () => {
    expect(store.salvarLinhaBase(lb(1))).toEqual({ ok: true })
    vi.setSystemTime(new Date('2026-11-30T15:00:00.000Z'))
    const r = store.salvarLinhaBase({ ...lb(1), nome: 'Segunda versão' })
    expect(r).toEqual({ ok: false, precisaConfirmar: true, erro: 'A linha de base 1 já existe (Replanejamento, 25/10/2026). Confirme para substituí-la.' })
    expect(store.state.linhasBase.find((i) => i.numero === 1)!.nome).toBe(NOME) // nada mudou
    expect(store.salvarLinhaBase({ ...lb(1), nome: 'Segunda versão', confirmarSobrescrita: true })).toEqual({ ok: true })
    expect(store.state.linhasBase.find((i) => i.numero === 1)).toMatchObject({ nome: 'Segunda versão', salvaEm: '2026-11-30T15:00:00.000Z' })
    expect(store.state.log[0].detail).toContain('Substitui "Replanejamento, 25/10/2026"')
  })

  it('a LB0 também pede confirmação para ser substituída; com ela, faz o mesmo que o antigo "Salvar linha de base": PV 7.259.250,00 → 6.496.233,42 e atraso 16 → 0', () => {
    const r = store.salvarLinhaBase(lb(0))
    expect(r).toMatchObject({ ok: false, precisaConfirmar: true })
    expect(store.salvarLinhaBase({ ...lb(0), confirmarSobrescrita: true })).toEqual({ ok: true })
    expect(store.evm.pv).toBeCloseTo(6496233.415233416, 2)
    expect(store.delay.delayDays).toBe(0)
    expect(store.state.log[0].title).toBe('Nova linha de base salva')
    expect(store.state.linhasBase.map((i) => i.numero)).toEqual([0])
    expect(store.state.linhasBase[0].nome).toBe(NOME)
  })

  it('S-1: recusa número fora de 0 a 10, textos vazios ou acima do limite; <script> entra como texto e nada é gravado nas recusas', () => {
    const antes = JSON.stringify(store.state)
    expect(store.salvarLinhaBase(lb(11))).toEqual({ ok: false, erro: 'Escolha uma linha de base de 0 a 10.' })
    expect(store.salvarLinhaBase(lb(-1)).ok).toBe(false)
    expect(store.salvarLinhaBase(lb(1.5)).ok).toBe(false)
    expect(store.salvarLinhaBase({ ...lb(1), nome: '' })).toEqual({ ok: false, erro: 'Informe o nome da linha de base.' })
    expect(store.salvarLinhaBase({ ...lb(1), motivo: 'm'.repeat(501) })).toEqual({ ok: false, erro: 'O motivo da linha de base passa de 500 caracteres.' })
    expect(store.salvarLinhaBase({ ...lb(1), autor: 'a'.repeat(121) }).ok).toBe(false)
    expect(JSON.stringify(store.state)).toBe(antes)
    expect(store.salvarLinhaBase({ numero: 5, nome: '<script>alert(1)</script>', motivo: '<img src=x onerror=alert(1)>' })).toEqual({ ok: true })
    expect(store.state.linhasBase.find((i) => i.numero === 5)!.nome).toBe('<script>alert(1)</script>')
  })

  it('definirLinhaBaseAtiva recusa LB que não existe ou fora da faixa e não muda nada', () => {
    expect(store.definirLinhaBaseAtiva(2)).toEqual({ ok: false, erro: 'A linha de base 2 ainda não foi salva nesta obra.' })
    expect(store.definirLinhaBaseAtiva(11).ok).toBe(false)
    expect(store.definirLinhaBaseAtiva(0)).toEqual({ ok: true })
    expect(store.state.meta.linhaBaseAtiva).toBeUndefined()
  })

  it('P-11: trocar a LB do valor agregado ou salvar a LB1 não refaz o cronograma nem o atraso (os objetos calculados são os mesmos)', () => {
    const schedule = store.schedule
    const delay = store.delay
    const calendarios = store.calendarios
    store.salvarLinhaBase(lb(1)) // só mexe em `linhasBase` das tarefas: a agenda não muda
    expect(store.schedule).toBe(schedule)
    expect(store.delay).toBe(delay)
    store.definirLinhaBaseAtiva(1)
    expect(store.evm.pv).toBeCloseTo(6496233.415233416, 2) // o valor agregado refez
    expect(store.schedule).toBe(schedule)
    expect(store.delay).toBe(delay)
    expect(store.calendarios).toBe(calendarios)
    store.definirLinhaBaseAtiva(0)
    expect(store.schedule).toBe(schedule)
  })

  it('o PV, o EV e o BAC por tarefa e por pacote (visão MS Project e EVM por pacote) seguem a LB do valor agregado', () => {
    store.salvarLinhaBase(lb(1))
    store.definirLinhaBaseAtiva(1)
    const t302 = store.msProjectTask(302)!
    expect(t302.BudgetAtCompletion).toBe(2200000)
    expect(t302.PlannedValue).toBeCloseTo(1724324.3243243243, 2) // regra do CronoAI: PV linear entre o início e o término da LB1
    const soma = store.packageEvm.reduce((a, p) => a + p.pv, 0)
    expect(soma).toBeCloseTo(6496233.415233416, 2)
    // as datas de linha de base da visão MS Project continuam as da LB0 (variações)
    expect(t302.BaselineStart).toBe('2026-09-01')
    expect(t302.BaselineFinish).toBe('2026-10-22')
  })

  it('D-35 / teste 65: tarefa incluída com a LB1 do valor agregado ganha também a LB1 (datas da LB0 e custo = bac) e registra no log', () => {
    store.salvarLinhaBase(lb(1))
    store.definirLinhaBaseAtiva(1)
    const r = store.addSinapiTask({ name: 'Pacote novo', code: '00001', unit: 'm2', quantity: 10, unitCost: 10, durationDays: 5, resources: [], parentWbs: '03', linkType: 'FS', lagDays: 0 })
    if (!r.ok) throw new Error(r.erro)
    const t = store.taskByUid.get(r.task.uid)!
    expect(t.baselineStart).toBeDefined()
    expect(t.linhasBase?.['1']).toEqual({ inicio: t.baselineStart, termino: t.baselineFinish, duracaoMin: t.baselineDuracaoMin, custo: 100 })
    expect(store.state.log.some((l) => l.title === 'Tarefa nova incluída também na LB 1')).toBe(true)
    expect(store.avisoSemLinhaBase).toBeUndefined()
  })

  it('D-35: com a LB0 ativa a inclusão não grava LB n; o lote da planilha grava a LB n das tarefas criadas', () => {
    const r = store.addSinapiTask({ name: 'Pacote A', code: '00001', unit: 'm2', quantity: 10, unitCost: 10, durationDays: 5, resources: [], parentWbs: '03', linkType: 'FS', lagDays: 0 })
    if (!r.ok) throw new Error(r.erro)
    expect(store.taskByUid.get(r.task.uid)!.linhasBase).toBeUndefined()
    store.salvarLinhaBase(lb(2))
    store.definirLinhaBaseAtiva(2)
    const lote = store.generateFromBudget({ mode: 'FS', overlapPct: 40 })
    if (!lote.ok) throw new Error(lote.erro)
    expect(lote.created.length).toBeGreaterThan(0)
    for (const c of lote.created) {
      const t = store.taskByUid.get(c.uid)!
      expect(t.linhasBase?.['2']).toEqual({ inicio: t.baselineStart, termino: t.baselineFinish, duracaoMin: t.baselineDuracaoMin, custo: t.bac })
    }
  })
})
