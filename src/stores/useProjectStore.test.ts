import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import fixtureDivergencias from '@/lib/__fixtures__/mspdi-divergencias.xml?raw'
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
    expect(store.divergencias.map((x) => x.uid)).toEqual([2, 3, 4, 5]) // D-1 (T1) é igual ao arquivo
    expect([d(2).causa, d(2).diferencaTerminoDu]).toEqual(['feriado', 1]) // D-2
    expect([d(3).causa, d(3).predecessoraUid, d(3).diferencaTerminoDu]).toEqual(['predecessora', 2, 1]) // D-3
    expect([d(4).causa, d(4).diferencaTerminoDu]).toEqual(['manual', -4]) // D-4
    expect([d(5).causa, d(5).predecessoraUid, d(5).diferencaTerminoDu]).toEqual(['predecessora', 4, -4]) // D-6
    // D-5: depois de importar, a duração da T1 passa a 6 d
    store.updateTask(1, { duracaoMin: 6 * 480 })
    expect([d(1).terminoCalculado, d(1).terminoArquivo, d(1).diferencaTerminoDu, d(1).causa]).toEqual(['2026-09-08', '2026-09-04', 1, 'alterada'])
    expect(store.state.meta.feriadosNacionaisAplicados).toBe(true)
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
