import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import fixtureDivergencias from '@/lib/__fixtures__/mspdi-divergencias.xml?raw'
import type { PremissasObra } from '@/types/domain'
import { rotuloVersao } from '@/lib/premissas'
import { parseMspdiXml } from '@/lib/msProjectXmlParser'
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
    expect(store.approveReport('r-tiao', 104, 75, [])).toEqual({ ok: true, delta: -5 })
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

  it('opções do cronograma da obra: padrão (retida, mover o restante) = N-1; substituir não muda o Aurora; sem mover o restante a entrega vai a 09/06/27', () => {
    const store = useProjectStore()
    expect(store.state.meta.opcoesCronograma).toBeUndefined() // ausente = lógica retida e mover o restante
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    store.state.meta.opcoesCronograma = { logica: 'substituir', moverRestante: true }
    expect([store.schedule.projectFinish, store.delay.delayDays]).toEqual(['2027-06-23', 16]) // nenhuma tarefa iniciada fora de sequência
    store.state.meta.opcoesCronograma = { logica: 'retida', moverRestante: false }
    // O restante não é empurrado para depois da data de status: a 104 (40%) termina 21/10 e a entrega antecipa
    expect([store.schedule.projectFinish, store.delay.delayDays]).toEqual(['2027-06-09', 6])
    expect([store.schedule.byUid.get(104)!.finish, store.schedule.byUid.get(105)!.start]).toEqual(['2026-10-21', '2026-10-22'])
  })

  it('a visão MS Project traz o lag em dias e o par LinkLag/LagFormat (útil 7, corrido 8, % 19)', () => {
    const store = useProjectStore()
    expect(store.msProjectTask(402)!.Predecessors).toEqual([{ PredecessorUID: 401, Type: 'SS', LagDays: 10, LinkLag: 48000, LagFormat: 7 }])
    store.updateTask(402, { predecessors: [{ uid: 401, type: 'SS', lag: { tipo: 'corrido', minutos: 14400 } }] })
    expect(store.msProjectTask(402)!.Predecessors).toEqual([{ PredecessorUID: 401, Type: 'SS', LagDays: 10, LinkLag: 144000, LagFormat: 8 }])
    store.updateTask(402, { predecessors: [{ uid: 401, type: 'SS', lag: { tipo: 'percentual', percentual: 50 } }] })
    expect(store.msProjectTask(402)!.Predecessors).toEqual([{ PredecessorUID: 401, Type: 'SS', LagDays: 0, LinkLag: 50, LagFormat: 19 }])
  })

  // ---------------------------------------------------------------- Ciclo 00004, E4: divergências e edição de cronograma
  const sabado4h = (store: ReturnType<typeof useProjectStore>) => {
    const padrao = store.state.calendarios[0]
    store.state.calendarios.push({ ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) })
  }

  it('AC-12: o painel lista as divergências da fixture importada com as causas e as diferenças em d.u.', () => {
    const store = useProjectStore()
    expect(store.divergencias).toEqual([]) // obra de exemplo: nada veio de arquivo
    store.importXml(fixtureDivergencias)
    const d = (uid: number) => store.divergencias.find((x) => x.uid === uid)!
    // Ciclo 00005: o import não injeta feriados. Antes: [2, 3, 4, 5] com D-2 +1, D-3 +1, D-4 −4, D-6 −4; depois: D-2 e D-3 sumiram (iguais ao arquivo)
    expect(store.divergencias.map((x) => x.uid)).toEqual([4, 5]) // D-1, D-2 e D-3 iguais ao arquivo
    expect([d(4).causa, d(4).diferencaTerminoDu]).toEqual(['manual', -5]) // D-4
    expect([d(5).causa, d(5).predecessoraUid, d(5).diferencaTerminoDu]).toEqual(['predecessora', 4, -5]) // D-6
    // D-5: depois de importar, a duração da T1 passa a 6 d (sem o feriado de 07/09, termina em 07/09)
    store.updateTask(1, { duracaoMin: 6 * 480 })
    expect([d(1).terminoCalculado, d(1).terminoArquivo, d(1).diferencaTerminoDu, d(1).causa]).toEqual(['2026-09-07', '2026-09-04', 1, 'alterada'])
    expect(store.state.meta.feriadosNacionaisAplicados).toBeUndefined()
  })

  it('AC-13: definirRestricao valida tipo e data, recusa resumo e tarefa inexistente, e ASAP remove a restrição', () => {
    const store = useProjectStore()
    expect(store.definirRestricao(105, 'MSO', 'ontem')).toEqual({ ok: false, erro: 'Informe uma data válida (aaaa-mm-dd, ou aaaa-mm-ddThh:mm com a hora).' })
    expect(store.definirRestricao(105, 'SNET', undefined).ok).toBe(false)
    expect(store.definirRestricao(105, 'SNET', '9999-12-31')).toEqual({ ok: false, erro: 'A data deve estar a menos de 45 anos do início da obra.' })
    expect(store.definirRestricao(105, 'XYZ' as 'SNET', '2026-12-01')).toEqual({ ok: false, erro: 'Tipo de restrição desconhecido.' })
    expect(store.definirRestricao(999, 'ALAP')).toEqual({ ok: false, erro: 'Tarefa não encontrada.' })
    expect(store.definirRestricao(1, 'ALAP')).toEqual({ ok: false, erro: 'Restrição, prazo e calendário só valem para tarefas folha.' }) // UID 1 é resumo
    expect(store.taskByUid.get(105)!.restricao).toBeUndefined()
    // Válida: 105 não pode começar antes de 01/12/2026 (era 05/11)
    expect(store.definirRestricao(105, 'SNET', '2026-12-01')).toEqual({ ok: true })
    expect(store.taskByUid.get(105)!.restricao).toEqual({ tipo: 'SNET', data: '2026-12-01' })
    expect(store.schedule.byUid.get(105)!.start).toBe('2026-12-01')
    expect(store.state.log[0].title).toBe('Restrição alterada: [UID 105] 03.01.03')
    expect(store.definirRestricao(105, 'ASAP')).toEqual({ ok: true })
    expect(Object.keys(store.taskByUid.get(105)!)).not.toContain('restricao')
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.definirRestricao(105, 'ALAP')).toEqual({ ok: true })
    expect(store.taskByUid.get(105)!.restricao).toEqual({ tipo: 'ALAP' })
  })

  it('AC-13: definirPrazoFinal acende o indicador sem mover a tarefa e o vazio remove o prazo', () => {
    const store = useProjectStore()
    expect(store.definirPrazoFinal(105, 'x')).toEqual({ ok: false, erro: 'Informe uma data válida (aaaa-mm-dd, ou aaaa-mm-ddThh:mm com a hora).' })
    expect(store.schedule.byUid.get(105)!.prazoFinalPerdido).toBe(false)
    expect(store.definirPrazoFinal(105, '2026-11-20')).toEqual({ ok: true })
    const t = store.schedule.byUid.get(105)!
    // A 105 termina 30/11 (09:36) e o prazo é 20/11 às 17:00: perdido, sem mover a tarefa; folga de -2.496 min (5 dias + 96 min antes do prazo)
    expect([t.prazoFinalPerdido, t.finish, t.critical, t.folgaTotalMin]).toEqual([true, '2026-11-30', true, -2496])
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.definirPrazoFinal(105, '2027-12-31')).toEqual({ ok: true })
    expect(store.schedule.byUid.get(105)!.prazoFinalPerdido).toBe(false)
    expect(store.definirPrazoFinal(105, '')).toEqual({ ok: true })
    expect(Object.keys(store.taskByUid.get(105)!)).not.toContain('prazoFinal')
    expect(store.definirPrazoFinal(1, '2026-12-31').ok).toBe(false) // resumo
  })

  it('AC-13: definirCalendarioTarefa recusa calendário inexistente e aceita um existente (CR-2c no cálculo da obra)', () => {
    const store = useProjectStore()
    expect(store.definirCalendarioTarefa(105, 2)).toEqual({ ok: false, erro: 'O calendário escolhido não existe nesta obra.' })
    sabado4h(store)
    expect(store.definirCalendarioTarefa(105, 2)).toEqual({ ok: true })
    const t = store.schedule.byUid.get(105)!
    // 105 (16 d) com sábado de 4 h termina 26/11 às 14:36 e a entrega antecipa 2 d.u.
    expect([t.finish, t.terminoHora, store.schedule.projectFinish, store.delay.delayDays]).toEqual(['2026-11-26', '14:36', '2027-06-21', 14])
    expect(store.definirCalendarioTarefa(105, store.state.calendarioPadraoUid)).toEqual({ ok: true }) // o padrão não grava calendarioUid
    expect(Object.keys(store.taskByUid.get(105)!)).not.toContain('calendarioUid')
    expect(store.schedule.projectFinish).toBe('2027-06-23')
  })

  it('definirOpcoesCronograma valida, grava só o que foge do padrão e o formulário da obra usa as mesmas regras', () => {
    const store = useProjectStore()
    expect(store.definirOpcoesCronograma({ logica: 'x' as 'retida', moverRestante: true }).ok).toBe(false)
    expect(store.definirOpcoesCronograma({ logica: 'retida', moverRestante: 'sim' as unknown as boolean }).ok).toBe(false)
    expect(store.definirOpcoesCronograma({ logica: 'substituir', moverRestante: true })).toEqual({ ok: true })
    expect(store.state.meta.opcoesCronograma).toEqual({ logica: 'substituir', moverRestante: true })
    expect(store.state.log[0].title).toBe('Opções de cronograma alteradas')
    expect(store.definirOpcoesCronograma({ logica: 'retida', moverRestante: true })).toEqual({ ok: true })
    expect(store.state.meta.opcoesCronograma).toBeUndefined() // o padrão fica ausente, como no seed
    const m = store.state.meta
    const dados = { nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: m.statusDate }
    expect(store.atualizarDadosObra({ ...dados, logicaProgresso: 'retida', moverRestante: false })).toEqual({ ok: true })
    expect(store.state.meta.opcoesCronograma).toEqual({ logica: 'retida', moverRestante: false })
    expect(store.schedule.projectFinish).toBe('2027-06-09')
    expect(store.atualizarDadosObra({ ...dados, logicaProgresso: 'x' as 'retida' })).toEqual({ ok: false, erros: ['Selecione uma lógica de progresso válida.'] })
  })
})

describe('useProjectStore · premissas versionadas (ciclo 00005, E1)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  const valores = (store: ReturnType<typeof useProjectStore>, parcial: Partial<PremissasObra>): PremissasObra => ({ ...JSON.parse(JSON.stringify(store.premissasVigentes)), ...parcial })

  it('o Aurora abre na v1 padrão (ilustrativa), vigente desde o início da obra, com os mesmos números (CF-1, N-1)', () => {
    const store = useProjectStore()
    expect(store.state.premissas).toHaveLength(1)
    expect(rotuloVersao(store.versaoPremissasVigente)).toBe('Premissas v1 — vigência 04/05/2026')
    expect(store.premissasVigentes.custoIndiretoDiario).toBe(9850)
    expect(store.safetyMarginDays).toBe(3)
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.delay.delayDays).toBe(16)
    expect(store.evm.spi).toBeCloseTo(0.8883, 4)
    expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
    expect(store.scenarios.crashing.extraCost).toBeCloseTo(12616.8, 2)
    expect(store.scenarios.crashing.premissas).toEqual({ versao: 1, vigencia: '2026-05-04' })
  })

  it('PR-2: criar a v2 com indireto de R$ 12.000 recalcula os cenários na hora (economia da HE R$ 24.000, risco Baixo)', () => {
    const store = useProjectStore()
    expect(store.scenarios.overtime.risk).toBe('Médio')
    expect(store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'Orçamento revisado', valores: valores(store, { custoIndiretoDiario: 12000 }) })).toEqual({ ok: true })
    expect(rotuloVersao(store.versaoPremissasVigente)).toBe('Premissas v2 — vigência 23/10/2026')
    expect(store.scenarios.crashing.indirectSavings).toBe(36000)
    expect(store.scenarios['fast-tracking'].indirectSavings).toBe(156000)
    expect(store.scenarios.overtime.indirectSavings).toBe(24000)
    expect(store.scenarios.overtime.netImpact).toBeCloseTo(-1684.8, 2)
    expect(store.scenarios.overtime.risk).toBe('Baixo')
    expect(store.scenarios.overtime.premissas).toEqual({ versao: 2, vigencia: '2026-10-23' })
    expect(store.recommendation.kind).toBe('crashing')
    // O cronograma, o EVM e a v1 não mudam
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.state.premissas[0].valores.custoIndiretoDiario).toBe(9850)
    expect(store.state.log[0].title).toBe('Premissas v2 criada')
  })

  it('PR-4: a versão vigente acompanha a data de status; a vigência retroativa é recusada', () => {
    const store = useProjectStore()
    store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'v2', valores: valores(store, { custoIndiretoDiario: 12000 }) })
    store.criarVersaoPremissas({ vigencia: '2026-11-01', motivo: 'v3', valores: valores(store, { custoIndiretoDiario: 15000 }) })
    expect(rotuloVersao(store.versaoPremissasVigente)).toBe('Premissas v2 — vigência 23/10/2026') // a v3 está "agendada"
    expect(store.scenarios.overtime.indirectSavings).toBe(24000)
    expect(store.setStatusDate('2026-11-01')).toEqual({ ok: true })
    expect(rotuloVersao(store.versaoPremissasVigente)).toBe('Premissas v3 — vigência 01/11/2026')
    const he = store.scenarios.overtime
    expect(he.indirectSavings).toBe(Math.max(0, he.daysRecovered) * 15000)
    expect(he.premissas).toEqual({ versao: 3, vigencia: '2026-11-01' })
    expect(store.criarVersaoPremissas({ vigencia: '2026-10-01', motivo: 'retroativa', valores: valores(store, {}) })).toEqual({
      ok: false,
      erro: 'A vigência deve ser igual ou posterior à da versão 3 (01/11/2026).',
    })
    expect(store.state.premissas).toHaveLength(3)
  })

  it('valores inválidos são recusados sem criar versão', () => {
    const store = useProjectStore()
    const r = store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'x', valores: valores(store, { adicionalHoraExtraPct: 500 }) })
    expect(r.ok).toBe(false)
    expect(store.state.premissas).toHaveLength(1)
  })

  it('a margem da DLP vem das premissas: v2 com margem 10 desloca a DLP do concreto em 7 dias', () => {
    const store = useProjectStore()
    const dlp = () => store.supplies.find((x) => x.material.id === 'm-concreto')!.dlp
    expect(dlp()).toBe('2026-10-30')
    store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'margem maior', valores: valores(store, { margemDlpDias: 10 }) })
    expect(store.safetyMarginDays).toBe(10)
    expect(dlp()).toBe('2026-10-23')
  })

  it('a taxa da obra entra no custo: Pedreiro a R$ 40,00/h muda o custo da hora extra', () => {
    const store = useProjectStore()
    const taxas = store.premissasVigentes.taxas.map((t) => (t.funcao === 'Pedreiro' ? { ...t, valorHora: 40 } : { ...t }))
    store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'taxa', valores: valores(store, { taxas }) })
    // 302: 8 carpinteiros, 6 armadores e 4 pedreiros; 104: 4 pedreiros → só os 8 pedreiros-dia de cada sábado mudam (+8,60/h)
    expect(store.scenarios.overtime.extraCost).toBeCloseTo(22315.2 + 8.6 * 8 * 1.5 * 8 * 2, 2) // + R$ 8,60/h × 8 h × 1,5 × 8 pedreiros × 2 sábados = R$ 1.651,20
  })
})

describe('useProjectStore · feriados da obra, calendários e prévias (ciclo 00005, E3)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  const entrega = (store: ReturnType<typeof useProjectStore>) => [store.schedule.projectFinish, store.delay.delayDays]
  const dataDe = (store: ReturnType<typeof useProjectStore>, uid: number) => store.schedule.byUid.get(uid)!

  it('CF-1: com a configuração padrão o Aurora dá os mesmos números e o MSPDI exporta os feriados de 2026 a 2029', () => {
    const store = useProjectStore()
    expect(store.state.feriados).toEqual({ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] })
    expect(store.state.calendarios[0].aplicaFeriadosObra).toBe(true)
    expect(store.state.calendarios[0].excecoes).toEqual([])
    expect(entrega(store)).toEqual(['2027-06-23', 16])
    expect(store.evm.pv).toBeCloseTo(7259250, 2)
    const x = store.exportXml()
    expect(x.validation.valid).toBe(true)
    const back = parseMspdiXml(x.xml)
    const naoUteis = back.calendarios[0].excecoes.filter((e) => e.intervalos.length === 0).map((e) => e.data)
    expect(naoUteis).toHaveLength(52) // 13 por ano × 4 anos
    expect(naoUteis[0]).toBe('2026-01-01')
    expect(naoUteis.at(-1)).toBe('2029-12-25')
  })

  // O plano media o início do 701 antes do restante exato do ciclo 00004 (15/03 → 11/03); na base de hoje são 12/03 09:36 → 10/03 09:36
  // (os mesmos 2 d.u. a menos). Entrega e atraso são os do plano.
  it('CF-2: sem Carnaval o 701 começa 10/03/2027 (antes, 12/03); entrega 21/06/2027, atraso de 14 d.u. (antes, 16); PV igual', () => {
    const store = useProjectStore()
    expect(dataDe(store, 701).start).toBe('2027-03-12')
    expect(store.definirConfigFeriados({ carnaval: false })).toEqual({ ok: true })
    expect(dataDe(store, 701).start).toBe('2027-03-10') // o lag SS+30 de 502 → 701 atravessa 08 e 09/02/2027
    expect(entrega(store)).toEqual(['2027-06-21', 14])
    expect(store.evm.pv).toBeCloseTo(7259250, 2) // a linha de base gravada não muda
  })

  it('CF-3: sem Corpus Christi o 701 termina 08/06/2027; entrega 22/06/2027, atraso de 15 d.u.', () => {
    const store = useProjectStore()
    store.definirConfigFeriados({ corpusChristi: false })
    expect(dataDe(store, 701).finish).toBe('2027-06-08') // 27/05/2027 vira dia útil
    expect(entrega(store)).toEqual(['2027-06-22', 15])
  })

  it('CF-4: sem Carnaval e sem Corpus Christi: entrega 18/06/2027, atraso de 13 d.u.; religar volta a 23/06/2027', () => {
    const store = useProjectStore()
    store.definirConfigFeriados({ carnaval: false, corpusChristi: false })
    expect(entrega(store)).toEqual(['2027-06-18', 13])
    store.definirConfigFeriados({ carnaval: true, corpusChristi: true })
    expect(entrega(store)).toEqual(['2027-06-23', 16])
    expect(store.state.log[0].title).toBe('Feriados da obra alterados')
  })

  it('CF-6: feriado municipal manual com fonte muda as datas; sem fonte é recusado; remover desfaz', () => {
    const store = useProjectStore()
    store.state.meta = { ...store.state.meta, startDate: '2026-08-17', statusDate: '2026-08-14' }
    store.state.tasks = [{ uid: 1, wbs: '1', name: 'A', outlineLevel: 1, isSummary: false, duracaoMin: 5 * 480, predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [] }]
    expect(dataDe(store, 1).finish).toBe('2026-08-21')
    const feriado = { data: '2026-08-20', nome: 'Feriado municipal fictício', abrangencia: 'municipal' as const, fonte: 'Lei municipal fictícia de teste', recorrenteAnual: true }
    expect(store.adicionarFeriadoManual({ ...feriado, fonte: '' })).toEqual({ ok: false, erro: 'Informe a fonte do feriado (lei, decreto ou ato oficial).' })
    expect(store.adicionarFeriadoManual(feriado)).toEqual({ ok: true })
    expect(dataDe(store, 1).finish).toBe('2026-08-24')
    expect(store.state.feriados.manuais[0]).toMatchObject({ nome: 'Feriado municipal fictício', fonte: 'Lei municipal fictícia de teste' })
    expect(store.adicionarFeriadoManual(feriado).ok).toBe(false) // repetido
    expect(store.removerFeriadoManual(store.state.feriados.manuais[0].id)).toEqual({ ok: true })
    expect(dataDe(store, 1).finish).toBe('2026-08-21')
    expect(store.removerFeriadoManual('nao-existe').ok).toBe(false)
  })

  it('CF-8: troca de UF lista o feriado estadual cadastrado, mostra o impacto de removê-lo (13/07 → 10/07); manter não muda nada', () => {
    const store = useProjectStore()
    store.state.meta = { ...store.state.meta, startDate: '2026-07-06', statusDate: '2026-07-03', uf: 'PE' }
    store.state.tasks = [{ uid: 1, wbs: '1', name: 'A', outlineLevel: 1, isSummary: false, duracaoMin: 5 * 480, predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [] }]
    expect(store.adicionarFeriadoManual({ data: '2026-07-09', nome: 'Feriado estadual fictício', abrangencia: 'estadual', fonte: 'Lei estadual fictícia de teste', recorrenteAnual: true })).toEqual({ ok: true })
    expect(store.state.feriados.manuais[0].uf).toBe('PE') // guarda a UF da obra
    expect(dataDe(store, 1).finish).toBe('2026-07-13')
    // mesma UF: nada a avisar
    expect(store.previaTrocaLocal('PE', '').foraDoLocal).toEqual([])
    const previa = store.previaTrocaLocal('BA', '')
    expect(previa.foraDoLocal.map((f) => f.nome)).toEqual(['Feriado estadual fictício'])
    expect(previa.semFeriadosLocais).toBe(false)
    const impacto = previa.impactoDeRemover
    if (!impacto || impacto.erro !== undefined) throw new Error('a prévia do impacto de remover não deveria ter erro')
    expect([impacto.entregaAntes, impacto.entregaDepois, impacto.deltaDiasUteis, impacto.tarefas.map((t) => [t.uid, t.terminoAntes, t.terminoDepois])]).toEqual([
      '2026-07-13', '2026-07-10', -1, [[1, '2026-07-13', '2026-07-10']],
    ])
    const dados = { nome: store.state.meta.name, uf: 'BA' as const, municipio: '', dataInicio: '2026-07-06', dataStatus: '2026-07-03', responsavel: '' }
    // "manter" (padrão): a UF muda e o feriado fica
    expect(store.atualizarDadosObra(dados)).toEqual({ ok: true })
    expect(store.state.meta.uf).toBe('BA')
    expect(store.state.feriados.manuais).toHaveLength(1)
    expect(dataDe(store, 1).finish).toBe('2026-07-13')
    // "remover": o feriado de outra UF sai e a data volta
    expect(store.atualizarDadosObra({ ...dados, uf: 'BA' }, { removerFeriadosDeOutroLocal: true })).toEqual({ ok: true })
    expect(store.state.feriados.manuais).toHaveLength(0)
    expect(dataDe(store, 1).finish).toBe('2026-07-10')
  })

  it('sem feriado local cadastrado a prévia da troca avisa que eles não são carregados automaticamente', () => {
    const store = useProjectStore()
    const previa = store.previaTrocaLocal('SP', 'Cidade Fictícia')
    expect(previa).toEqual({ foraDoLocal: [], semFeriadosLocais: true })
  })

  it('CS-1: calendário criado pela ação (cópia do padrão + sábado 08–12) e atribuído: 12 d desde 03/08 terminam 17/08 17:00 (padrão: 18/08)', () => {
    const store = useProjectStore()
    store.state.meta = { ...store.state.meta, startDate: '2026-08-03', statusDate: '2026-07-31' }
    store.state.tasks = [{ uid: 1, wbs: '1', name: 'A', outlineLevel: 1, isSummary: false, duracaoMin: 12 * 480, predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [] }]
    expect([dataDe(store, 1).finish, dataDe(store, 1).terminoHora]).toEqual(['2026-08-18', '17:00'])
    const criado = store.criarCalendario({ nome: 'Concretagem — sábado manhã' })
    expect(criado).toEqual({ ok: true, uid: 2 })
    const padrao = store.state.calendarios[0]
    expect(store.editarCalendario(2, { semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) })).toEqual({ ok: true })
    expect(store.atribuirCalendario([1], 2)).toEqual({ ok: true })
    expect(store.taskByUid.get(1)?.calendarioUid).toBe(2)
    expect([dataDe(store, 1).finish, dataDe(store, 1).terminoHora]).toEqual(['2026-08-17', '17:00'])
    // a cópia é independente: o padrão não mudou e a cópia herdou a marca de feriados da obra
    expect(store.state.calendarios[0].semana[6]).toEqual([])
    expect(store.state.calendarios[1].aplicaFeriadosObra).toBe(true)
    // atribuir ao calendário padrão remove o campo da tarefa
    expect(store.atribuirCalendario([1], undefined)).toEqual({ ok: true })
    expect(store.taskByUid.get(1)?.calendarioUid).toBeUndefined()
  })

  it('exceção por data: sábado de 4 h no calendário padrão (CS-2 pela ação) e remoção', () => {
    const store = useProjectStore()
    store.state.meta = { ...store.state.meta, startDate: '2026-08-03', statusDate: '2026-07-31' }
    store.state.tasks = [{ uid: 1, wbs: '1', name: 'A', outlineLevel: 1, isSummary: false, duracaoMin: 12 * 480, predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [] }]
    expect(store.definirExcecao(1, { data: '2026-08-08', intervalos: [{ de: 480, ate: 720 }], descricao: 'Sábado de 4 h' })).toEqual({ ok: true })
    expect([dataDe(store, 1).finish, dataDe(store, 1).terminoHora]).toEqual(['2026-08-18', '12:00'])
    expect(store.definirExcecao(1, { data: '2026-08-08', intervalos: [{ de: 480, ate: 1500 }] }).ok).toBe(false) // 25:00
    expect(store.definirExcecao(1, { data: '2026-08-08', intervalos: [], descricao: 'd'.repeat(81) }).ok).toBe(false)
    expect(store.removerExcecao(1, '2026-08-08')).toEqual({ ok: true })
    expect([dataDe(store, 1).finish, dataDe(store, 1).terminoHora]).toEqual(['2026-08-18', '17:00'])
    expect(store.removerExcecao(1, '2026-08-08').ok).toBe(false)
  })

  it('CS-4: atribuição em lote ao pacote 03.01 (103, 104, 105): as 3 tarefas ganham o calendário; a concluída não muda de data', () => {
    const store = useProjectStore()
    const padrao = store.state.calendarios[0]
    store.criarCalendario({ nome: 'Sábado 4 h' })
    store.editarCalendario(2, { semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) })
    const antes = { 103: { ...dataDe(store, 103) } }
    expect(store.atribuirCalendario([103, 104, 105], 2)).toEqual({ ok: true })
    expect([103, 104, 105].map((u) => store.taskByUid.get(u)?.calendarioUid)).toEqual([2, 2, 2])
    expect([dataDe(store, 103).start, dataDe(store, 103).finish]).toEqual([antes[103].start, antes[103].finish])
    // calendário inexistente, tarefa inexistente e resumo são recusados sem alterar nada (tudo ou nada)
    expect(store.atribuirCalendario([104], 99)).toEqual({ ok: false, erro: 'O calendário escolhido não existe nesta obra.' })
    expect(store.atribuirCalendario([104, 99999], 1)).toEqual({ ok: false, erro: 'Tarefa não encontrada.' })
    expect(store.atribuirCalendario([1], 1).ok).toBe(false) // resumo
    expect(store.atribuirCalendario([]).ok).toBe(false)
    expect(store.taskByUid.get(104)?.calendarioUid).toBe(2)
  })

  it('criar e excluir calendários: nome único, limite de 100, padrão e calendário em uso protegidos', () => {
    const store = useProjectStore()
    expect(store.criarCalendario({ nome: 'Padrão Obra (seg-sex, 8h)' })).toEqual({ ok: false, erro: 'Já existe um calendário com este nome.' })
    expect(store.criarCalendario({ nome: ' ' }).ok).toBe(false)
    expect(store.criarCalendario({ nome: 'X', copiarDeUid: 99 })).toEqual({ ok: false, erro: 'O calendário de origem não existe nesta obra.' })
    store.criarCalendario({ nome: 'Fachada' })
    store.atribuirCalendario([104], 2)
    expect(store.excluirCalendario(1)).toEqual({ ok: false, erro: 'O calendário padrão da obra não pode ser excluído.' })
    expect(store.excluirCalendario(2)).toEqual({ ok: false, erro: 'O calendário está em uso por 1 tarefa(s): confirme para movê-las ao calendário padrão.' })
    expect(store.excluirCalendario(2, { moverTarefasParaPadrao: true })).toEqual({ ok: true })
    expect(store.state.calendarios.map((c) => c.uid)).toEqual([1])
    expect(store.taskByUid.get(104)?.calendarioUid).toBeUndefined()
    expect(store.excluirCalendario(2).ok).toBe(false)
    // preenche até 100 sem passar pela ação (cada criação simula a obra inteira)
    while (store.state.calendarios.length < 100) store.state.calendarios.push({ ...store.state.calendarios[0], uid: 100 + store.state.calendarios.length, nome: `Cal ${store.state.calendarios.length}` })
    expect(store.state.calendarios).toHaveLength(100)
    expect(store.criarCalendario({ nome: 'Um a mais' })).toEqual({ ok: false, erro: 'No máximo 100 calendários por obra.' })
  })

  it('calendário de hora extra só sai pelo desfazer do cenário', () => {
    const store = useProjectStore()
    store.criarCalendario({ nome: 'Derivado' })
    store.state.calendarios[1].origem = 'hora-extra'
    expect(store.excluirCalendario(2).ok).toBe(false)
  })

  it('CF-7: importar a fixture sem feriados avisa, não injeta, e "Aplicar feriados da obra" mostra a prévia e traz D-2 de volta', () => {
    const store = useProjectStore()
    const avisos = store.importXml(fixtureDivergencias)
    expect(avisos).toContain('O calendário do arquivo não traz feriados. O CronoAI não acrescentou nenhum: use "Aplicar feriados da obra" em Premissas › Calendários para ver o impacto antes.')
    expect(avisos.some((a) => a.startsWith('Calendário sem feriados'))).toBe(false)
    expect(store.state.calendarios[0].aplicaFeriadosObra).toBeUndefined()
    expect(store.state.calendarios[0].excecoes.filter((e) => e.intervalos.length === 0)).toEqual([])
    expect(store.divergencias.map((x) => x.uid)).toEqual([4, 5])
    const entregaAntes = store.schedule.projectFinish
    const previa = store.previaAplicarFeriados(1)
    expect(previa.erro).toBeUndefined()
    if (previa.erro !== undefined) return
    expect(previa.entregaAntes).toBe(entregaAntes)
    expect(previa.tarefas.map((t) => t.uid).sort()).toEqual([2, 3, 4, 5]) // T1 não muda: o feriado de 07/09 cai depois dela
    const t2 = previa.tarefas.find((t) => t.uid === 2)!
    expect([t2.inicioAntes, t2.inicioDepois, t2.terminoAntes, t2.terminoDepois]).toEqual(['2026-09-07', '2026-09-08', '2026-09-11', '2026-09-14'])
    expect(store.schedule.projectFinish).toBe(entregaAntes) // a prévia não grava nada
    expect(store.aplicarFeriadosObra(1)).toEqual({ ok: true })
    expect(store.state.calendarios[0].aplicaFeriadosObra).toBe(true)
    expect(store.divergencias.map((x) => x.uid)).toEqual([2, 3, 4, 5])
    expect(store.divergencias.find((x) => x.uid === 2)).toMatchObject({ causa: 'feriado', detalhe: 'Feriados da obra aplicados ao calendário importado.', diferencaTerminoDu: 1 })
    expect(store.divergencias.find((x) => x.uid === 4)?.diferencaTerminoDu).toBe(-4)
    expect(store.schedule.projectFinish).toBe(previa.entregaDepois)
    // remover os feriados da obra do calendário volta ao estado do arquivo
    expect(store.aplicarFeriadosObra(1, false)).toEqual({ ok: true })
    expect(store.divergencias.map((x) => x.uid)).toEqual([4, 5])
    expect(store.previaAplicarFeriados(99)).toEqual({ erro: 'O calendário não existe nesta obra.' })
  })
})

describe('useProjectStore · hora extra por frente e meio período (ciclo 00005, E4)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  it('PR-13: aplicar a hora extra na frente {104} cria o calendário derivado e desfazer devolve tudo (entrega 23/06/2027, custo removido)', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    const r = store.scenarios.overtime
    expect(r.extraCost).toBeCloseTo(4161.6, 2)
    const antes = JSON.parse(JSON.stringify(store.state.calendarios))
    expect(store.applyScenario(r)).toEqual({ ok: true })
    // calendário derivado uid 2 só no 104; o padrão e as outras tarefas não mudam
    expect(store.state.calendarios.map((c) => [c.uid, c.nome, c.origem, c.derivadoDe])).toEqual([
      [1, 'Padrão Obra (seg-sex, 8h)', undefined, undefined],
      [2, 'Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10', 'hora-extra', 1],
    ])
    expect(store.state.calendarios[0]).toEqual(antes[0])
    expect(store.taskByUid.get(104)?.calendarioUid).toBe(2)
    expect(store.taskByUid.get(302)?.calendarioUid).toBeUndefined()
    expect(store.schedule.projectFinish).toBe('2027-06-21')
    expect(store.schedule.byUid.get(104)!.finish).toBe('2026-11-03')
    expect(store.state.recoveryCosts.map((c) => c.amount)).toEqual([4162]) // Math.round(4.161,60): dívida registrada
    // o resultado guardado para o desfazer não leva o calendário inteiro
    expect(store.appliedResult('overtime')?.horaExtra?.calendariosNovos).toEqual([])
    expect(store.state.undo[0]).toMatchObject({ kind: 'overtime', calendariosCriados: [2], calendariosAntes: [{ uid: 104 }] })
    expect(store.excluirCalendario(2).ok).toBe(false) // só sai pelo desfazer
    store.undoScenario('overtime')
    expect(store.state.calendarios).toEqual(antes)
    expect(store.taskByUid.get(104)?.calendarioUid).toBeUndefined()
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.state.recoveryCosts).toEqual([])
    expect(store.state.appliedScenarios).toEqual([])
  })

  it('desfazer devolve a frente ao calendário que ela tinha antes (calendário próprio)', () => {
    const store = useProjectStore()
    store.criarCalendario({ nome: 'Fachada' })
    store.atribuirCalendario([104], 2)
    store.scenarioParams.overtime.frentes = [104]
    const r = store.scenarios.overtime
    expect(r.applicable).toBe(true)
    expect(r.horaExtra?.calendariosNovos[0].nome).toBe('Fachada + HE 24/10 e 31/10')
    expect(r.horaExtra?.calendariosNovos[0].uid).toBe(3)
    expect(store.applyScenario(r)).toEqual({ ok: true })
    expect(store.taskByUid.get(104)?.calendarioUid).toBe(3)
    store.undoScenario('overtime')
    expect(store.taskByUid.get(104)?.calendarioUid).toBe(2)
    expect(store.state.calendarios.map((c) => c.uid)).toEqual([1, 2])
  })

  it('meio período, todas as frentes: sábados 08:00–12:00 no padrão, 1 d.u., entrega 22/06/2027; desfazer deixa o calendário como estava', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.jornada = 'meio'
    const r = store.scenarios.overtime
    expect([r.daysRecovered, r.newFinish]).toEqual([1, '2027-06-22'])
    expect(r.extraCost).toBeCloseTo(11157.6, 2)
    const antes = JSON.parse(JSON.stringify(store.state.calendarios))
    expect(store.applyScenario(r)).toEqual({ ok: true })
    const extras = store.state.calendarios[0].excecoes.filter((e) => e.intervalos.length > 0)
    expect(extras.map((e) => [e.data, e.intervalos])).toEqual([
      ['2026-10-24', [{ de: 480, ate: 720 }]],
      ['2026-10-31', [{ de: 480, ate: 720 }]],
    ])
    expect(store.schedule.projectFinish).toBe('2027-06-22')
    expect(store.schedule.byUid.get(104)!.finish).toBe('2026-11-04')
    store.undoScenario('overtime')
    expect(store.state.calendarios).toEqual(antes)
    expect(store.schedule.projectFinish).toBe('2027-06-23')
  })

  it('o PV não conta o sábado de hora extra, nem o derivado: EVM igual antes e depois (CR-2d)', () => {
    const store = useProjectStore()
    const pv = store.evm.pv
    store.scenarioParams.overtime.frentes = [104]
    store.applyScenario(store.scenarios.overtime)
    expect(store.evm.pv).toBeCloseTo(pv, 2)
  })

  it('aplicar um resultado cujos calendários já existem na obra é recusado (a simulação ficou velha)', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    const r = store.scenarios.overtime
    store.criarCalendario({ nome: 'Outro' }) // ocupa o UID 2 depois da simulação
    expect(store.applyScenario(r)).toEqual({ ok: false, erro: 'Os calendários mudaram desde a simulação: confira o cenário e aplique de novo.' })
    expect(store.state.appliedScenarios).toEqual([])
  })

  it('as frentes disponíveis da hora extra vêm da store e o reset volta a "todas as frentes"', () => {
    const store = useProjectStore()
    expect(store.scenarioOptions.overtime.map((o) => o.value)).toEqual(['104', '302'])
    store.scenarioParams.overtime.frentes = [302]
    store.scenarioParams.overtime.jornada = 'meio'
    store.resetScenarioParams()
    expect(store.scenarioParams.overtime).toEqual({ saturdays: 2, jornada: 'integral', frentes: 'todas' })
  })
})

describe('useProjectStore · rodada 02 do ciclo 00005 (calendário de hora extra órfão, limites e reatividade)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  const aplicarHE104 = (store: ReturnType<typeof useProjectStore>) => {
    store.scenarioParams.overtime.frentes = [104]
    expect(store.applyScenario(store.scenarios.overtime)).toEqual({ ok: true })
  }
  const MSG_HE = 'Este calendário foi criado por um cenário de hora extra e só vale para as frentes dele: não pode ser atribuído à mão (desfaça o cenário para removê-lo).'

  it('B1(a): o calendário de hora extra não se atribui à mão, uma a uma nem em lote', () => {
    const store = useProjectStore()
    aplicarHE104(store)
    expect(store.state.calendarios[1].origem).toBe('hora-extra')
    expect(store.definirCalendarioTarefa(105, 2)).toEqual({ ok: false, erro: MSG_HE })
    expect(store.atribuirCalendario([105, 106], 2)).toEqual({ ok: false, erro: MSG_HE })
    expect(store.taskByUid.get(105)?.calendarioUid).toBeUndefined()
  })

  it('B1(b): desfazer a HE leva ao calendário padrão a tarefa que ainda aponta para o derivado, com registro no log', () => {
    const store = useProjectStore()
    aplicarHE104(store)
    store.state.tasks.find((t) => t.uid === 105)!.calendarioUid = 2 // estado adulterado: atribuição que a tela já não permite
    store.undoScenario('overtime')
    expect(store.state.calendarios.map((c) => c.uid)).toEqual([1])
    expect(store.taskByUid.get(105)?.calendarioUid).toBeUndefined()
    expect(store.taskByUid.get(104)?.calendarioUid).toBeUndefined()
    expect(store.erroCronograma).toBeUndefined()
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.state.log[0]).toMatchObject({ title: 'Calendários das tarefas ajustados ao desfazer' })
    expect(store.state.log[0].detail).toBe('1 tarefa(s) apontavam para um calendário removido e voltaram ao calendário padrão: 03.01.03.')
    // o MSPDI não sai com CalendarUID solto
    expect(store.exportXml().xml).not.toContain('<CalendarUID>2</CalendarUID>')
  })

  it('B1(b): desfazer sobrescreve a atribuição feita depois da HE e avisa no log', () => {
    const store = useProjectStore()
    aplicarHE104(store)
    store.criarCalendario({ nome: 'Fachada' }) // uid 3 (o 2 é o derivado)
    expect(store.atribuirCalendario([104], 3)).toEqual({ ok: true })
    store.undoScenario('overtime')
    expect(store.taskByUid.get(104)?.calendarioUid).toBeUndefined() // voltou ao calendário de antes (o padrão)
    expect(store.state.calendarios.map((c) => c.uid)).toEqual([1, 3])
    expect(store.state.log[0].title).toBe('Calendários das tarefas ajustados ao desfazer')
    expect(store.state.log[0].detail).toBe('[UID 104] 03.01.02: o calendário atribuído depois da hora extra foi desfeito; a tarefa voltou ao calendário de antes.')
  })

  it('Segurança 4: o undo adulterado nunca remove o calendário padrão nem aponta a tarefa para calendário inexistente', () => {
    const store = useProjectStore()
    aplicarHE104(store)
    const u = store.state.undo[0]
    u.calendariosCriados = [1, 2, 99] // o 1 é o padrão e o 99 não existe (itens de tipo errado são recusados em bloco: ver a rodada 03)
    u.calendariosAntes = [{ uid: 104, calendarioUid: 999 }, { uid: 105, calendarioUid: 7 }]
    store.undoScenario('overtime')
    expect(store.state.calendarios.map((c) => c.uid)).toEqual([1]) // o padrão ficou; o derivado saiu
    expect(store.taskByUid.get(104)?.calendarioUid).toBeUndefined()
    expect(store.erroCronograma).toBeUndefined()
  })

  it('Segurança 2: aplicar uma simulação velha sem espaço para o calendário derivado é recusado (100 calendários)', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    const r = store.scenarios.overtime
    expect(r.horaExtra?.calendariosNovos).toHaveLength(1)
    while (store.state.calendarios.length < 100) store.state.calendarios.push({ ...store.state.calendarios[0], uid: 100 + store.state.calendarios.length, nome: `Cal ${store.state.calendarios.length}` })
    expect(store.applyScenario(r)).toEqual({ ok: false, erro: 'Não há espaço para o calendário da hora extra: a obra já tem 100 calendários (máximo 100).' })
    expect(store.state.appliedScenarios).toEqual([])
    expect(store.scenarios.overtime.reason).toBe('Não há espaço para o calendário da hora extra: a obra já tem 100 calendários (máximo 100).')
  })

  it('Segurança 3: exportação com exceções demais (feriados da obra × calendários) é recusada com mensagem, e não gera arquivo que não reimporta inteiro', () => {
    const store = useProjectStore()
    expect(store.exportXml().validation.valid).toBe(true)
    while (store.state.calendarios.length < 100) store.state.calendarios.push({ ...store.state.calendarios[0], uid: 100 + store.state.calendarios.length, nome: `Cal ${store.state.calendarios.length}` })
    for (let i = 0; i < 200; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      store.state.feriados.manuais.push({ id: `f${i}`, data: d.toISOString().slice(0, 10), nome: `F${i}`, abrangencia: 'outro', fonte: 'Fonte fictícia', recorrenteAnual: true })
    }
    const x = store.exportXml()
    expect(x.xml).toBe('')
    expect(x.validation.valid).toBe(false)
    expect(x.validation.errors[0]).toMatch(/^A exportação teria [\d.]+ exceções de calendário .* acima do limite de 10\.000 que o importador aceita\./)
    expect(x.filename).toBe('')
  })

  it('Segurança 5: no máximo 500 versões de premissas por obra', () => {
    const store = useProjectStore()
    while (store.state.premissas.length < 500) store.state.premissas.push({ ...JSON.parse(JSON.stringify(store.state.premissas[0])), versao: store.state.premissas.length + 1 })
    const r = store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'x', valores: JSON.parse(JSON.stringify(store.premissasVigentes)) })
    expect(r).toEqual({ ok: false, erro: 'No máximo 500 versões de premissas por obra.' })
    expect(store.state.premissas).toHaveLength(500)
  })

  // R-3: o simulador lê tarefas, calendários e meta por toRaw (sem o proxy do Vue, ~4x mais rápido com 3.000 tarefas) e só reavalia porque
  // `schedule` (que lê tudo isso por clone) muda junto. Este teste trava a regressão: editar unidades de recurso ou BAC tem de refazer os cenários.
  it('R-3 (guarda de reatividade): editar as unidades de um recurso ou o BAC de tarefas dos cenários muda o custo dos cenários', () => {
    const store = useProjectStore()
    const antes = { crashing: store.scenarios.crashing.extraCost, ft: store.scenarios['fast-tracking'].extraCost, he: store.scenarios.overtime.extraCost }
    const t105 = store.taskByUid.get(105)!
    expect(store.updateTask(105, { resources: t105.resources.map((r) => (r.resource === 'Pedreiro' ? { ...r, units: 10 } : { ...r })) })).toEqual({ ok: true })
    expect(store.scenarios.crashing.extraCost).not.toBeCloseTo(antes.crashing, 2) // a equipe de 105 mudou: duração nova e custo de mão de obra
    expect(store.updateTask(401, { bac: 1_000_000 })).toEqual({ ok: true })
    expect(store.scenarios['fast-tracking'].extraCost).toBeCloseTo(1_000_000 * 0.04 * (13 / 16), 2) // contingência = BAC × 4% × sobreposição de 13/16
    expect(store.scenarios['fast-tracking'].extraCost).not.toBeCloseTo(antes.ft, 2)
    expect(store.updateTask(302, { resources: [{ resource: 'Pedreiro', units: 1 }] })).toEqual({ ok: true })
    expect(store.scenarios.overtime.extraCost).not.toBeCloseTo(antes.he, 2) // a equipe do 302 convocada na hora extra mudou
  })
})

describe('useProjectStore · registro de desfazer inválido no estado salvo (rodada 03)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  const MSG = 'Não foi possível desfazer este cenário: o registro dele no estado salvo está inválido. Nada foi alterado.'
  const adulteracoes: [string, (u: ReturnType<typeof useProjectStore>['state']['undo'][number]) => void][] = [
    ['calendariosCriados que não é lista', (u) => Object.assign(u, { calendariosCriados: 'x' })],
    ['calendariosCriados com item que não é inteiro', (u) => Object.assign(u, { calendariosCriados: [2, 'a'] })],
    ['calendariosAntes que não é lista', (u) => Object.assign(u, { calendariosAntes: {} })],
    ['calendariosAntes com item de tipo errado', (u) => Object.assign(u, { calendariosAntes: [{ uid: 'x' }] })],
    ['atribuicoes da hora extra que não é lista', (u) => Object.assign(u.result.horaExtra ?? {}, { atribuicoes: 5 })],
    ['atribuicoes com calendarioUid de tipo errado', (u) => Object.assign(u.result.horaExtra ?? {}, { atribuicoes: [{ uid: 104, calendarioUid: 'b' }] })],
    ['resultado do cenário nulo (com calendariosAntes válido)', (u) => Object.assign(u, { result: null })],
    ['addedDays que não é lista de datas', (u) => Object.assign(u, { addedDays: [1, 2] })],
  ]

  it.each(adulteracoes)('recusa antes de alterar qualquer coisa: %s', (_nome, adulterar) => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    expect(store.applyScenario(store.scenarios.overtime)).toEqual({ ok: true })
    adulterar(store.state.undo[0])
    const antes = JSON.stringify({ tasks: store.state.tasks, calendarios: store.state.calendarios, applied: store.state.appliedScenarios, custos: store.state.recoveryCosts, undo: store.state.undo, log: store.state.log })
    expect(store.undoScenario('overtime')).toEqual({ ok: false, erro: MSG })
    // nada de desfazer pela metade: tarefas, calendários, custos, lista de cenários, undo e log ficam como estavam
    expect(JSON.stringify({ tasks: store.state.tasks, calendarios: store.state.calendarios, applied: store.state.appliedScenarios, custos: store.state.recoveryCosts, undo: store.state.undo, log: store.state.log })).toBe(antes)
    expect(store.taskByUid.get(104)?.calendarioUid).toBe(2)
  })

  it('um undo íntegro continua desfazendo e devolve ok', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    store.applyScenario(store.scenarios.overtime)
    expect(store.undoScenario('overtime')).toEqual({ ok: true })
    expect(store.undoScenario('overtime')).toEqual({ ok: false, erro: 'Este cenário não está aplicado.' })
  })
})

describe('useProjectStore · agenda separada do custo (rodada 05, AC-6)', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })
  const novaVersao = (store: ReturnType<typeof useProjectStore>, indireto: number) =>
    store.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'teste', valores: { ...JSON.parse(JSON.stringify(store.premissasVigentes)), custoIndiretoDiario: indireto } })

  it('com "frentes escolhidas" ativo, mudar uma premissa NÃO recalcula a agenda da hora extra nem a do fast tracking, mas recalcula o custo', () => {
    const store = useProjectStore()
    store.scenarioParams.overtime.frentes = [104]
    const agendaHE = store.agendaHE
    const agendaFT = store.agendaFT
    const he = store.scenarios.overtime
    expect(novaVersao(store, 12000)).toEqual({ ok: true })
    expect(store.agendaHE).toBe(agendaHE) // mesma identidade: o cronograma da hora extra não foi refeito
    expect(store.agendaFT).toBe(agendaFT)
    expect(store.scenarios.overtime).not.toBe(he) // o custo foi refeito com a premissa nova
    expect(store.scenarios.overtime.indirectSavings).toBe(24000)
    expect(store.scenarios.overtime.extraCost).toBeCloseTo(4161.6, 2)
    expect(store.scenarios['fast-tracking'].indirectSavings).toBe(156000)
    // as frentes e as datas seguem as mesmas
    expect(store.scenarios.overtime.horaExtra?.atribuicoes).toEqual(he.horaExtra?.atribuicoes)
    expect(store.scenarios.overtime.newFinish).toBe(he.newFinish)
  })

  it('mudar o parâmetro da hora extra refaz só a agenda da hora extra; o do fast tracking, só a dele', () => {
    const store = useProjectStore()
    const agendaHE = store.agendaHE
    const agendaFT = store.agendaFT
    store.scenarioParams.overtime.saturdays = 1
    expect(store.agendaHE).not.toBe(agendaHE)
    expect(store.agendaFT).toBe(agendaFT)
    const agendaHE2 = store.agendaHE
    store.scenarioParams.fastTracking.lagDays = 5
    expect(store.agendaFT).not.toBe(agendaFT)
    expect(store.agendaHE).toBe(agendaHE2)
  })

  it('mudar uma tarefa refaz as duas agendas (a edição de equipe da 302 muda o custo da hora extra)', () => {
    const store = useProjectStore()
    const agendaHE = store.agendaHE
    const antes = store.scenarios.overtime.extraCost
    expect(store.updateTask(302, { resources: [{ resource: 'Pedreiro', units: 1 }] })).toEqual({ ok: true })
    expect(store.agendaHE).not.toBe(agendaHE)
    expect(store.scenarios.overtime.extraCost).not.toBeCloseTo(antes, 2)
  })
})
