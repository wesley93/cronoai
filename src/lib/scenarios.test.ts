import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { addCalendarDays } from './calendar'
import { calendarioDeDias, comDiasExtras, compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { DEFAULT_SCENARIO_PARAMS, MAX_FRENTES_HORA_EXTRA, analyzeDelay, crashingTargets, fastTrackOptions, overtimeTargets, recommendScenario, simulateAll, simulateCrashing, simulateFastTracking, simulateOvertime, type ScenarioParams } from './scenarios'
import { analyzeSupplies } from './supplies'
import { premissasPadrao } from './premissas'
import type { CalendarioObra, PremissasObra, Task } from '@/types/domain'

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

describe('Premissas da obra nos cenários (ciclo 00005)', () => {
  const comPremissas = (parcial: Partial<PremissasObra>, versaoPremissas = { versao: 2, vigencia: '2026-10-23' }) => ({
    ...ctx,
    premissas: { ...premissasPadrao(), ...parcial },
    versaoPremissas,
  })

  it('PR-2: indireto de R$ 12.000 muda a economia dos três cenários na hora (dias, custos e entregas iguais ao padrão)', () => {
    const r = simulateAll(comPremissas({ custoIndiretoDiario: 12000 }))
    // economia = max(0, d.u.) × indireto diário
    expect([r.crashing.daysRecovered, r.crashing.indirectSavings, r.crashing.newFinish]).toEqual([3, 36000, '2027-06-18'])
    expect(r.crashing.extraCost).toBeCloseTo(12616.8, 2)
    expect(r.crashing.netImpact).toBeCloseTo(-23383.2, 2)
    expect([r['fast-tracking'].daysRecovered, r['fast-tracking'].indirectSavings, r['fast-tracking'].newFinish]).toEqual([13, 156000, '2027-06-04'])
    expect(r['fast-tracking'].netImpact).toBeCloseTo(-130650, 2)
    expect([r.overtime.daysRecovered, r.overtime.indirectSavings, r.overtime.newFinish]).toEqual([2, 24000, '2027-06-21'])
    expect(r.overtime.extraCost).toBeCloseTo(22315.2, 2)
    expect(r.overtime.netImpact).toBeCloseTo(-1684.8, 2)
    expect(r.overtime.risk).toBe('Baixo') // antes: Médio (saldo +2.615,20); com o indireto de 12.000 o saldo é negativo
    expect(recommendScenario(r).kind).toBe('crashing')
  })

  it('o resultado registra a versão das premissas usada; sem versão informada o campo não existe', () => {
    expect(simulateCrashing(comPremissas({})).premissas).toEqual({ versao: 2, vigencia: '2026-10-23' })
    expect(simulateOvertime(comPremissas({}, { versao: 3, vigencia: '2026-11-01' })).premissas).toEqual({ versao: 3, vigencia: '2026-11-01' })
    expect(simulateCrashing(ctx).premissas).toBeUndefined()
  })

  it('PR-5: taxa de R$ 20,00/h sem encargos (57%) dá o mesmo crashing de R$ 12.616,80', () => {
    const base = premissasPadrao()
    const p: Partial<PremissasObra> = {
      encargosSociaisPct: 57,
      taxas: base.taxas.map((t) => (t.funcao === 'Pedreiro' ? { ...t, valorHora: 20, incluiEncargos: false } : t)),
    }
    const c = simulateCrashing(comPremissas(p))
    // (2 × 20 × 1,57 + 23,90) × 8 h × 13 d + 3 × 1.200
    expect(c.extraCost).toBeCloseTo(12616.8, 2)
  })

  it('cada premissa muda só o que deve: congestionamento, mobilização, contingência e adicional de HE', () => {
    // sem perda por congestionamento: ⌈16 × 6 ÷ 8⌉ = 12 d (e não 13)
    const semPerda = simulateCrashing(comPremissas({ perdaCongestionamentoPct: 0 }))
    expect(semPerda.memory[0]).toContain('⌈16 × 6 ÷ (6 + 2) × 1⌉ = ⌈12⌉ = 12 d.u.')
    expect(semPerda.daysRecovered).toBe(4)
    expect(simulateCrashing(comPremissas({ mobilizacaoPorProfissional: 2000 })).extraCost).toBeCloseTo((2 * 31.4 + 23.9) * 8 * 13 + 3 * 2000, 2)
    // contingência 8%: o dobro dos R$ 25.350,00
    expect(simulateFastTracking(comPremissas({ contingenciaRetrabalhoPct: 8 })).extraCost).toBeCloseTo(50700, 2)
    // adicional de 100%: (929,80 × 8 h × 2) × 2 sábados
    const he = simulateOvertime(comPremissas({ adicionalHoraExtraPct: 100 }))
    expect(he.extraCost).toBeCloseTo(929.8 * 8 * 2 * 2, 2)
    expect(he.summary).toContain('(8 h, adicional de 100%)')
  })

  it('a memória diz qual versão foi usada e marca como ilustrativas as premissas padrão (Inviolável 7)', () => {
    const c = simulateCrashing(comPremissas({}, { versao: 1, vigencia: '2026-05-04' }))
    expect(c.memory.at(-1)).toBe(
      'Premissas v1 — vigência 04/05/2026. Ilustrativas, sem validação: perda por congestionamento, mobilização por profissional, custo indireto diário, taxas por função.',
    )
    expect(c.memory[0]).toContain('⌈16 × 6 ÷ (6 + 2) × 1,05⌉')
  })

  // B2 (rodada 02): as horas do sábado são as do expediente que o cronograma usa (minutos úteis da exceção ÷ 60), e não minutosPorDia ÷ 60.
  // Antes: com minutosPorDia 450 e sábado agendado de 8 h, a HE custava R$ 20.920,50 (929,80 × 7,5 h × 1,5 × 2); depois: R$ 22.315,20.
  it('B2: minutosPorDia 450 não muda o custo do sábado inteiro agendado de 8 h (antes R$ 20.920,50, agora R$ 22.315,20)', () => {
    const he = simulateOvertime({ ...ctx, meta: { ...ctx.meta, minutosPorDia: 450 } })
    expect(he.summary).toContain('(8 h, adicional de 50%)')
    expect(he.extraCost).toBeCloseTo(22315.2, 2) // 929,80 × 8 h × 1,5 × 2 sábados
  })

  it('B2: calendário seg–qui de 9 h (07–12 e 13–17): o sábado integral agendado tem 9 h e o custo usa 9 h × taxa × 1,5', () => {
    const base = seed.calendarios[0]
    const dia9 = [{ de: 420, ate: 720 }, { de: 780, ate: 1020 }]
    const c9: CalendarioObra = { ...base, semana: base.semana.map((d, i) => (i >= 1 && i <= 4 ? dia9 : i === 5 ? [{ de: 420, ate: 660 }] : d)) }
    const forecast9 = computeSchedule(seed.tasks, compilarCalendarios(seed.meta.startDate, [c9], 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    const r = simulateOvertime({ ...ctx, calendarios: [c9], forecast: forecast9 })
    expect(r.summary).toContain('(9 h, adicional de 50%)')
    expect(r.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    // Antes (jornada de 8 h, minutosPorDia ÷ 60): R$ 25.436,40 com as mesmas equipes; depois (9 h do expediente do sábado): R$ 28.615,95.
    // 73 profissionais-dia (a frente ativa muda com a jornada de 9 h): custo = 9 h × Σ (unidades × taxa) × 1,5
    expect(r.details[0].value).toBe('73')
    expect(r.extraCost).toBeCloseTo(28615.95, 2)
    // E-12: o 03.01.03 (105) só entra às 16:36 de 31/10, trabalha 24 min e é cobrado pelo expediente inteiro (9 h); a memória mostra os minutos
    expect(r.memory).toContain('   · ● 03.01.03 trabalha: 31/10: 24 min')
    expect(r.memory).toContain('   · ● 03.01.02 trabalha: 24/10: 540 min; 31/10: 516 min')
    expect(r.memory).toContain('● 03.01.03 trabalha 24 min no sábado 31/10 e é cobrada pelo expediente inteiro (9 h): validar a convocação com RH.')
    expect(r.memory.filter((m) => m.includes('validar a convocação com RH'))).toHaveLength(1) // as demais frentes trabalham mais da metade do expediente
  })
})

describe('Hora extra: meio período e frentes escolhidas (ciclo 00005, E4)', () => {
  const he = (p: ScenarioParams['overtime'], c = ctx) => simulateOvertime(c, p)
  const fim = (r: ReturnType<typeof simulateOvertime>, uid: number) => {
    const sch = computeSchedule(
      r.horaExtra ? seed.tasks.map((t) => (r.horaExtra!.atribuicoes.find((a) => a.uid === t.uid) ? { ...t, calendarioUid: r.horaExtra!.atribuicoes.find((a) => a.uid === t.uid)!.calendarioUid } : t)) : seed.tasks,
      compilarCalendarios(seed.meta.startDate, [...seed.calendarios, ...(r.horaExtra?.calendariosNovos ?? [])], seed.calendarioPadraoUid),
      { mode: 'forecast', statusDate: seed.meta.statusDate },
    )
    return sch.byUid.get(uid)!.finish
  }

  it('PR-7: todas as frentes e sábado inteiro reproduz a base (2 d.u., R$ 22.315,20, 64 profissionais-dia, 2027-06-21); 1 e 4 sábados', () => {
    const r = he({ saturdays: 2, jornada: 'integral', frentes: 'todas' })
    expect([r.daysRecovered, r.newFinish, r.addedWorkingDays]).toEqual([2, '2027-06-21', ['2026-10-24', '2026-10-31']])
    expect(r.extraCost).toBeCloseTo(22315.2, 2)
    expect(r.details[0].value).toBe('64')
    // "todas": exceção no calendário padrão, sem calendário derivado nem atribuição
    expect(r.horaExtra).toEqual({ jornada: 'integral', dias: ['2026-10-24', '2026-10-31'], calendariosNovos: [], atribuicoes: [], naoConvocadas: [], voltas: 0 })
    expect(he({ saturdays: 1 }).daysRecovered).toBe(1)
    expect(he({ saturdays: 4 }).daysRecovered).toBe(4)
  })

  it('PR-8: frente {104}, sábado inteiro: calendário derivado só no 104, 104 termina 03/11 (base 05/11), 2 d.u., R$ 4.161,60, 12 profissionais-dia', () => {
    const r = he({ saturdays: 2, jornada: 'integral', frentes: [104] })
    expect(r.horaExtra?.calendariosNovos).toHaveLength(1)
    const derivado = r.horaExtra!.calendariosNovos[0]
    expect([derivado.uid, derivado.nome, derivado.derivadoDe, derivado.origem]).toEqual([2, 'Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10', 1, 'hora-extra'])
    expect(derivado.excecoes.filter((e) => e.intervalos.length > 0).map((e) => e.data)).toEqual(['2026-10-24', '2026-10-31'])
    expect(r.horaExtra!.atribuicoes).toEqual([{ uid: 104, calendarioUid: 2 }])
    expect(r.addedWorkingDays).toBeUndefined()
    expect(fim(r, 104)).toBe('2026-11-03') // na base, 2026-11-05
    expect(r.daysRecovered).toBe(2)
    expect(r.extraCost).toBeCloseTo(4161.6, 2) // 173,40 × 8 h × 1,5 × 2 sábados
    expect(r.details[0].value).toBe('12') // 6 profissionais × 2 sábados
    expect(r.indirectSavings).toBe(19700)
    expect(r.netImpact).toBeCloseTo(-15538.4, 2)
    expect([r.risk, r.newFinish]).toEqual(['Baixo', '2027-06-21'])
    expect(r.summary).toContain('nas frentes 03.01.02')
    expect(r.memory.some((m) => m.includes('Calendário derivado "Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10" (UID 2)'))).toBe(true)
    expect(fim(r, 302)).toBe(ctx.forecast.byUid.get(302)!.finish) // o 302 continua no padrão e termina na data da base
  })

  it('PR-9: frente fora do caminho crítico {302}: 0 d.u., R$ 18.153,60, entrega inalterada, nota de risco e a recomendação ignora', () => {
    const r = he({ saturdays: 2, jornada: 'integral', frentes: [302] })
    expect(r.applicable).toBe(true)
    expect([r.daysRecovered, r.newFinish, r.indirectSavings]).toEqual([0, '2027-06-23', 0])
    expect(r.extraCost).toBeCloseTo(18153.6, 2) // 756,40 × 8 × 1,5 × 2
    expect(r.riskNote).toContain('nenhuma frente escolhida está no caminho crítico')
    const todos = simulateAll(ctx, { ...DEFAULT_SCENARIO_PARAMS, overtime: { saturdays: 2, jornada: 'integral', frentes: [302] } })
    expect(recommendScenario(todos).kind).toBe('crashing')
    expect(recommendScenario({ ...todos, crashing: { ...todos.crashing, applicable: false }, 'fast-tracking': { ...todos['fast-tracking'], applicable: false } }).kind).toBeUndefined()
  })

  it('PR-10: meio período, todas as frentes: sábados 08:00–12:00, 104 e 302 terminam 04/11, 1 d.u., R$ 11.157,60, entrega 22/06/2027', () => {
    const r = he({ saturdays: 2, jornada: 'meio', frentes: 'todas' })
    expect([r.daysRecovered, r.newFinish]).toEqual([1, '2027-06-22'])
    expect(r.extraCost).toBeCloseTo(11157.6, 2) // 929,80 × 4 h × 1,5 × 2
    expect(r.indirectSavings).toBe(9850)
    expect(r.summary).toContain('(4 h, adicional de 50%)')
    expect(r.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    // os sábados entram no padrão como exceção útil de 08:00 às 12:00 (a store aplica com o expediente da jornada)
    const padraoComHE = comDiasExtras(seed.calendarios[0], r.addedWorkingDays!, [{ de: 480, ate: 720 }])
    const sch = computeSchedule(seed.tasks, compilarCalendarios(seed.meta.startDate, [padraoComHE], 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    expect([sch.byUid.get(104)!.finish, sch.byUid.get(302)!.finish]).toEqual(['2026-11-04', '2026-11-04'])
  })

  it('PR-11: meio período na frente {104}: 1 d.u., R$ 2.080,80, entrega 22/06/2027, 104 termina 04/11', () => {
    const r = he({ saturdays: 2, jornada: 'meio', frentes: [104] })
    expect([r.daysRecovered, r.newFinish]).toEqual([1, '2027-06-22'])
    expect(r.extraCost).toBeCloseTo(2080.8, 2) // 173,40 × 4 × 1,5 × 2
    expect(fim(r, 104)).toBe('2026-11-04')
    expect(r.horaExtra!.calendariosNovos[0].excecoes.find((e) => e.data === '2026-10-24')?.intervalos).toEqual([{ de: 480, ate: 720 }])
  })

  it('PR-12: frente que não trabalha nos sábados convocados (801): não aplicável, com os sábados no motivo', () => {
    const r = he({ saturdays: 2, jornada: 'integral', frentes: [801] })
    expect([r.applicable, r.reason]).toEqual([false, 'Nenhuma frente escolhida trabalha nos sábados convocados (24/10, 31/10).'])
  })

  it('nenhuma frente escolhida (lista vazia ou UID que não existe) não é aplicável', () => {
    expect(he({ saturdays: 2, frentes: [] }).reason).toBe('Escolha ao menos uma frente (tarefa) para a hora extra.')
    expect(he({ saturdays: 2, frentes: [99999] }).applicable).toBe(false)
    expect(he({ saturdays: 2, frentes: [1] }).applicable).toBe(false) // resumo não é frente
  })

  it('PR-14: sábado já útil no calendário da frente escolhida: não aplicável ("já são úteis")', () => {
    const base = seed.calendarios[0]
    const sabadoManha: CalendarioObra = { ...base, uid: 2, nome: 'Concretagem — sábado manhã', semana: base.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
    const calendarios = [...seed.calendarios, sabadoManha]
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const cals2 = compilarCalendarios(seed.meta.startDate, calendarios, 1)
    const forecast2 = computeSchedule(tasks, cals2, { mode: 'forecast', statusDate: seed.meta.statusDate })
    const c2 = { ...ctx, tasks, calendarios, forecast: forecast2 }
    const r = he({ saturdays: 2, frentes: [104] }, c2)
    expect([r.applicable, r.reason]).toEqual([false, 'Os sábados convocados já são úteis no calendário das frentes escolhidas.'])
  })

  it('frente escolhida que já trabalha no sábado fica de fora ("não convocada"); a outra é convocada com o calendário derivado do base dela', () => {
    const base = seed.calendarios[0]
    const sabadoManha: CalendarioObra = { ...base, uid: 2, nome: 'Concretagem — sábado manhã', semana: base.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
    const calendarios = [...seed.calendarios, sabadoManha]
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const forecast2 = computeSchedule(tasks, compilarCalendarios(seed.meta.startDate, calendarios, 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    const r = he({ saturdays: 2, frentes: [104, 302] }, { ...ctx, tasks, calendarios, forecast: forecast2 })
    expect(r.horaExtra?.naoConvocadas).toEqual([104])
    expect(r.horaExtra?.atribuicoes).toEqual([{ uid: 302, calendarioUid: 3 }])
    expect(r.horaExtra?.calendariosNovos.map((c) => [c.uid, c.derivadoDe])).toEqual([[3, 1]])
    expect(r.extraCost).toBeCloseTo(18153.6, 2) // só o 302 é hora extra
  })

  it('tarefas com calendário próprio não são convocadas no modo "todas": a memória lista as ativas (● crítica) e a entrega não muda', () => {
    const base = seed.calendarios[0]
    const outro: CalendarioObra = { ...base, uid: 2, nome: 'Outro', semana: base.semana.map((d) => d.map((iv) => ({ ...iv }))) }
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const calendarios = [...seed.calendarios, outro]
    const forecast2 = computeSchedule(tasks, compilarCalendarios(seed.meta.startDate, calendarios, 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    const r = he({ saturdays: 2 }, { ...ctx, tasks, calendarios, forecast: forecast2 })
    expect(r.memory).toContain('As tarefas com calendário próprio não são convocadas (os sábados entram só no calendário padrão): ● 03.01.02')
    expect(r.daysRecovered).toBe(0) // o 104 (caminho crítico) ficou de fora: a HE no 302 não antecipa a entrega
    expect(r.newFinish).toBe('2027-06-23')
    expect(r.extraCost).toBeCloseTo(18153.6, 2) // só o 302 (calendário padrão) é cobrado; o 104 tem calendário próprio
  })

  it('as frentes disponíveis são as tarefas com trabalho nos sábados convocados, críticas primeiro', () => {
    const o = overtimeTargets(ctx)
    expect(o.map((x) => [x.value, x.critical])).toEqual([['104', true], ['302', false]])
    expect(o[0].label).toBe('03.01.02 Alvenaria — 2º Pav.')
  })

  it('o nome do calendário derivado cabe em 60 caracteres', () => {
    const base = seed.calendarios[0]
    const longo: CalendarioObra = { ...base, uid: 2, nome: 'x'.repeat(58), semana: base.semana.map((d) => d.map((iv) => ({ ...iv }))) }
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const calendarios = [...seed.calendarios, longo]
    const forecast2 = computeSchedule(tasks, compilarCalendarios(seed.meta.startDate, calendarios, 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    const r = he({ saturdays: 2, frentes: [104] }, { ...ctx, tasks, calendarios, forecast: forecast2 })
    expect(r.horaExtra!.calendariosNovos[0].nome.length).toBeLessThanOrEqual(60)
    expect(r.horaExtra!.calendariosNovos[0].nome).toContain('+ HE (2 sáb.)')
  })
})

describe('Hora extra: derivado só com os sábados em que a frente trabalha, feriado, nome e limite (rodada 02)', () => {
  const base = seed.calendarios[0]
  const ctxDe = (calendarios: CalendarioObra[], tasks = seed.tasks) => {
    const cals = compilarCalendarios(seed.meta.startDate, calendarios, 1)
    const forecast = computeSchedule(tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })
    return { tasks, calendarios, calendarioPadraoUid: 1, meta: seed.meta, forecast, origin: analyzeDelay(tasks, forecast, calendarioDeDias(cals.padrao)).origin }
  }
  const comUid = (uid: number, nome: string, excecoes: CalendarioObra['excecoes'] = []): CalendarioObra => ({
    ...base,
    uid,
    nome,
    semana: base.semana.map((d) => d.map((iv) => ({ ...iv }))),
    excecoes,
  })

  it('E-3: frente com FS+2 que só trabalha em 31/10 recebe um derivado só com 31/10 (sem ganho de lag em 24/10 sem custo)', () => {
    const tasks: Task[] = [
      { uid: 1, wbs: '1', name: 'Predecessora concluída', outlineLevel: 1, isSummary: false, duracaoMin: 5 * 480, predecessors: [], percentComplete: 100, actualStart: '2026-10-19', actualFinish: '2026-10-23', bac: 0, actualCost: 0, resources: [] },
      { uid: 2, wbs: '2', name: 'Frente', outlineLevel: 1, isSummary: false, duracaoMin: 8 * 480, predecessors: [{ uid: 1, type: 'FS', lag: { tipo: 'util', minutos: 2 * 480 } }], percentComplete: 0, bac: 0, actualCost: 0, resources: [{ resource: 'Pedreiro', units: 2 }] },
    ]
    const c = ctxDe(seed.calendarios, tasks)
    expect(c.forecast.byUid.get(2)!.start).toBe('2026-10-28') // lag de 2 d.u. depois de sex 23/10: seg 26 e ter 27
    const r = simulateOvertime(c, { saturdays: 2, jornada: 'integral', frentes: [2] })
    const derivado = r.horaExtra!.calendariosNovos[0]
    expect(derivado.excecoes.filter((e) => e.intervalos.length > 0).map((e) => e.data)).toEqual(['2026-10-31'])
    expect(derivado.nome).toBe('Padrão Obra (seg-sex, 8h) + HE 31/10')
    expect(r.extraCost).toBeCloseTo(2 * 8 * 31.4 * 1.5, 2) // 753,60: um sábado só
    // sem o sábado de 24/10 no derivado, o lag não ganha tempo: a frente continua começando em 28/10 (com 24/10 começaria em 27/10)
    const sch = computeSchedule(tasks.map((t) => (t.uid === 2 ? { ...t, calendarioUid: derivado.uid } : t)), compilarCalendarios(seed.meta.startDate, [...seed.calendarios, derivado], 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    expect(sch.byUid.get(2)!.start).toBe('2026-10-28')
  })

  it('E-9: sábado que é feriado no calendário da frente não entra no derivado nem é cobrado, e a memória diz por quê', () => {
    const x = comUid(2, 'Calendário da frente', [{ data: '2026-10-31', intervalos: [], descricao: 'Feriado local fictício' }])
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const r = simulateOvertime(ctxDe([...seed.calendarios, x], tasks), { saturdays: 2, jornada: 'integral', frentes: [104] })
    const derivado = r.horaExtra!.calendariosNovos[0]
    expect(derivado.excecoes.filter((e) => e.intervalos.length > 0).map((e) => e.data)).toEqual(['2026-10-24'])
    expect(derivado.excecoes).toContainEqual({ data: '2026-10-31', intervalos: [], descricao: 'Feriado local fictício' }) // o feriado do calendário base fica
    expect(r.extraCost).toBeCloseTo(173.4 * 8 * 1.5, 2) // 2.080,80: só o sábado de 24/10
    expect(r.memory).toContain('sábado 31/10 é feriado no calendário da frente 03.01.02; trabalho em feriado tem regra própria (validar com RH/Jurídico)')
  })

  it('E-9: se todos os sábados são feriado no calendário da frente, não é aplicável, com a mensagem do feriado', () => {
    const x = comUid(2, 'Calendário da frente', [{ data: '2026-10-24', intervalos: [] }, { data: '2026-10-31', intervalos: [] }])
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const r = simulateOvertime(ctxDe([...seed.calendarios, x], tasks), { saturdays: 2, frentes: [104] })
    expect([r.applicable, r.reason]).toEqual([false, 'Os sábados convocados são feriado no calendário das frentes escolhidas; trabalho em feriado tem regra própria (validar com RH e Jurídico).'])
  })

  it('R-7: o nome do derivado ganha sufixo numérico se já existe, respeitando 60 caracteres', () => {
    const existente = comUid(2, 'Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10')
    const r = simulateOvertime(ctxDe([...seed.calendarios, existente]), { saturdays: 2, frentes: [104] })
    expect(r.horaExtra!.calendariosNovos.map((c) => [c.uid, c.nome])).toEqual([[3, 'Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10 (2)']])
    const longo = comUid(2, 'x'.repeat(58))
    const existente2 = comUid(3, `${'x'.repeat(42)} + HE (2 sáb.)`)
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, calendarioUid: 2 } : t))
    const r2 = simulateOvertime(ctxDe([...seed.calendarios, longo, existente2], tasks), { saturdays: 2, frentes: [104] })
    const nome = r2.horaExtra!.calendariosNovos[0].nome
    expect(nome).toBe(`${'x'.repeat(42)} + HE (2 sáb.) (2)`) // 60 caracteres
    expect(nome).toHaveLength(60)
  })

  it('Segurança 2: sem espaço para o calendário derivado (100 calendários) a hora extra por frente não é aplicável', () => {
    const muitos = Array.from({ length: 99 }, (_, i) => comUid(10 + i, `Cal ${i}`))
    const c = ctxDe([...seed.calendarios, ...muitos])
    const r = simulateOvertime(c, { saturdays: 2, frentes: [104] })
    expect([r.applicable, r.reason]).toEqual([false, 'Não há espaço para o calendário da hora extra: a obra já tem 100 calendários (máximo 100).'])
    expect(simulateOvertime(c, { saturdays: 2 }).applicable).toBe(true) // "todas" não cria calendário
  })
})

// E-13 (rodada 03): a entrada e a lista de frentes são avaliadas com os sábados candidatos já no calendário (hipótese máxima), e o ponto
// fixo poda. Com a data de status na sexta (23/10, o caso do Aurora) nenhuma frente "trabalha" no 1º sábado no cronograma de hoje, mas passa
// a trabalhar nele por causa da própria hora extra.
// Antes → depois de cada caso do E-13 (HEAD 833cb5f → rodada 03):
//   {1 sábado, [104]}: não aplicável → aplicável, 1 d.u., R$ 2.080,80;  {1 sábado, [302]}: não aplicável → aplicável, 0 d.u., R$ 9.076,80;
//   overtimeTargets(ctx, 1): [] → [104, 302];  frente que só começa na semana seguinte: não oferecida → oferecida e convocada (1 d.u., R$ 376,80).
describe('Hora extra: frentes avaliadas com os sábados já no calendário (E-13) e ponto fixo (E-14)', () => {
  it('status na sexta, 1 sábado e frente {104}: aplicável, 1 d.u., 173,40 × 8 h × 1,5 = R$ 2.080,80', () => {
    // O especialista calculou "R$ 1.040,40" para esta conta, mas a própria fórmula (173,40 × 8 × 1,5) dá R$ 2.080,80: 1.040,40 é a de 4 h
    const r = simulateOvertime(ctx, { saturdays: 1, jornada: 'integral', frentes: [104] })
    expect(r.applicable).toBe(true)
    expect(r.daysRecovered).toBe(1)
    expect(r.extraCost).toBeCloseTo(173.4 * 8 * 1.5, 2)
    expect(r.horaExtra!.dias).toEqual(['2026-10-24'])
    expect(r.details[0].value).toBe('6')
    // o modo "todas" recupera o mesmo 1 d.u. com 1 sábado
    expect(simulateOvertime(ctx, { saturdays: 1 }).daysRecovered).toBe(1)
  })

  it('1 sábado e frente {302}: R$ 9.076,80 e 0 d.u.', () => {
    const r = simulateOvertime(ctx, { saturdays: 1, frentes: [302] })
    expect([r.applicable, r.daysRecovered]).toEqual([true, 0])
    expect(r.extraCost).toBeCloseTo(756.4 * 8 * 1.5, 2)
  })

  it('a lista da tela com 1 sábado traz 104 e 302 (críticas primeiro); com 4 sábados entram 105 e 303', () => {
    expect(overtimeTargets(ctx, 1).map((o) => [o.value, o.critical])).toEqual([['104', true], ['302', false]])
    expect(overtimeTargets(ctx, 4).map((o) => o.value)).toEqual(['104', '105', '302', '303'])
  })

  it('frente que hoje só trabalha de seg a sex na semana seguinte é oferecida e convocada quando o sábado a antecipa', () => {
    const base = seed.calendarios[0]
    const tasks: Task[] = [
      { uid: 1, wbs: '1', name: 'Frente', outlineLevel: 1, isSummary: false, duracaoMin: 3 * 480, predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [{ resource: 'Pedreiro', units: 1 }] },
    ]
    const cals = compilarCalendarios(seed.meta.startDate, [base], 1)
    const forecast = computeSchedule(tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })
    const c = { tasks, calendarios: [base], calendarioPadraoUid: 1, meta: seed.meta, forecast, origin: undefined }
    expect(forecast.byUid.get(1)!.start).toBe('2026-10-26') // hoje: segunda 26/10
    expect(overtimeTargets(c, 1).map((o) => o.value)).toEqual(['1'])
    const r = simulateOvertime(c, { saturdays: 1, frentes: [1] })
    expect([r.applicable, r.daysRecovered]).toEqual([true, 1]) // é a única tarefa: o sábado antecipa o término do projeto em 1 d.u.
    expect(r.extraCost).toBeCloseTo(31.4 * 8 * 1.5, 2)
  })
})

describe('Hora extra: o ponto fixo repete até estabilizar (E-14)', () => {
  it('cadeia de 3 frentes (FS+1, FS+1, FS) com 4 sábados: poda em cascata em 3 voltas e só a última frente fica convocada', () => {
    const base = seed.calendarios[0]
    const t = (uid: number, dias: number, pred?: [number, number], extra: Partial<Task> = {}): Task => ({
      uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false, duracaoMin: dias * 480,
      predecessors: pred ? [{ uid: pred[0], type: 'FS', lag: { tipo: 'util', minutos: pred[1] * 480 } }] : [],
      percentComplete: 0, bac: 0, actualCost: 0, resources: [{ resource: 'Pedreiro', units: 1 }], ...extra,
    })
    const tasks = [t(1, 5, undefined, { percentComplete: 100, actualStart: '2026-10-19', actualFinish: '2026-10-23', resources: [] }), t(2, 4, [1, 1]), t(3, 1, [2, 1]), t(4, 7, [3, 0])]
    const forecast = computeSchedule(tasks, compilarCalendarios(seed.meta.startDate, [base], 1), { mode: 'forecast', statusDate: seed.meta.statusDate })
    const c = { tasks, calendarios: [base], calendarioPadraoUid: 1, meta: seed.meta, forecast, origin: undefined }
    const r = simulateOvertime(c, { saturdays: 4, frentes: [2, 3, 4] })
    // volta 1: todos os sábados em todas as frentes; volta 2: tira os sábados que a 2 e a 3 não trabalham (muda o lag e as datas); volta 3: confere
    expect(r.horaExtra!.voltas).toBe(3)
    expect(r.horaExtra!.atribuicoes).toEqual([{ uid: 4, calendarioUid: 2 }])
    expect(r.horaExtra!.naoConvocadas).toEqual([2, 3])
    expect(r.extraCost).toBeCloseTo(31.4 * 8 * 1.5, 2) // a frente 4 trabalha um sábado só
    expect(r.memory.some((m) => m.includes('sem estabilizar'))).toBe(false)
  })
})

describe('Hora extra: limite de frentes escolhidas (R-18)', () => {
  it('até 30 frentes é aceito; 31 é recusado com mensagem em português', () => {
    expect(MAX_FRENTES_HORA_EXTRA).toBe(30)
    const trinta = [104, ...Array.from({ length: 29 }, (_, i) => 90000 + i)] // uids que não existem são ignorados: o que conta é o tamanho da escolha
    expect(simulateOvertime(ctx, { saturdays: 2, frentes: trinta }).applicable).toBe(true)
    const trintaEUma = [...trinta, 90029]
    const r = simulateOvertime(ctx, { saturdays: 2, frentes: trintaEUma })
    expect([r.applicable, r.reason]).toEqual([false, 'Escolha no máximo 30 frentes para a hora extra.'])
  })
  it('uids repetidos contam uma vez', () => {
    expect(simulateOvertime(ctx, { saturdays: 2, frentes: Array.from({ length: 40 }, () => 104) }).applicable).toBe(true)
  })
})

// RNF-03.2 (rodada 05): os R$ dos cenários (detalhes, memória e recomendação) saem com 2 casas e arredondamento bancário.
describe('R$ dos cenários com 2 casas (RNF-03.2)', () => {
  const nb = (v: string) => v.replaceAll(String.fromCharCode(160), ' ')
  const r = simulateAll(ctx)
  it('detalhes e memória: antes "R$ 9.017" / "R$ 3.600" / "R$ 25.350" / "R$ 22.315"; depois com centavos', () => {
    expect(nb(r.crashing.details.find((d) => d.label === 'Mão de obra extra')!.value)).toBe('R$ 9.016,80') // antes: R$ 9.017
    expect(nb(r.crashing.details.find((d) => d.label === 'Mobilização/EPI')!.value)).toBe('R$ 3.600,00') // antes: R$ 3.600
    expect(nb(r['fast-tracking'].details.find((d) => d.label === 'Contingência de retrabalho')!.value)).toBe('R$ 25.350,00') // antes: R$ 25.350
    expect(nb(r.overtime.details.find((d) => d.label === 'Custo HE (com adicional)')!.value)).toBe('R$ 22.315,20') // antes: R$ 22.315
    expect(nb(r.overtime.memory[0])).toBe('Custo HE = Σ profissionais × 8 h × taxa × 1,5 = R$ 22.315,20')
    expect(nb(r.crashing.memory.find((m) => m.startsWith('Economia de indireto'))!)).toBe('Economia de indireto = 3 d × R$ 9.850,00 = R$ 29.550,00')
  })
  it('recomendação: "economiza R$ 16.933" → "economiza R$ 16.933,20"', () => {
    expect(nb(recommendScenario(r).reason)).toContain('economiza R$ 16.933,20 líquidos') // antes: R$ 16.933
  })
})
