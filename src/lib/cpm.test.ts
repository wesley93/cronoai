// Testes do motor de cronograma (ciclo 00004). Os números dos casos de referência CR-xx estão no plano
// `.claude/ciclos/00004-motor-minutos-calendarios-plano.md`.
import { describe, expect, it } from 'vitest'
import type { CalendarioObra, LinkType, Task } from '@/types/domain'
import { buildSeedState } from '@/stores/useProjectStore'
import { brazilianHolidays } from './calendar'
import { calendarioDeDias, calendarioPadrao, compilarCalendarios, diasParaMinutos } from './calendarioTrabalho'
import { calendarioDoLag, computeSchedule, withBaseline } from './cpm'
import { workingVariance } from './scenarios'

// Base do plano 00004: padrão seg-sex 08-12/13-17 e "Sábado 4 h" (igual + sábado 08:00-12:00), feriados nacionais.
const padrao = calendarioPadrao(brazilianHolidays(2026))
const sabado4h: CalendarioObra = { ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
const dias = (n: number) => diasParaMinutos(n)

const tarefa = (uid: number, duracaoDias: number, over: Partial<Task> = {}): Task => ({
  uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false, duracaoMin: dias(duracaoDias), predecessors: [],
  percentComplete: 0, bac: 0, actualCost: 0, resources: [], ...over,
})
const liga = (uid: number, type: LinkType = 'FS', lagDias = 0) => ({ uid, type, lag: { tipo: 'util' as const, minutos: dias(lagDias) } })
const agendar = (tasks: Task[], base: string, modo: 'baseline' | 'forecast' = 'baseline', statusDate?: string) =>
  computeSchedule(tasks, compilarCalendarios(base, [padrao, sabado4h], 1), { mode: modo, statusDate })

describe('início da obra depois da data de status (CR-11b)', () => {
  const seed = buildSeedState()
  const entrega = (inicio: string) => {
    const cals = compilarCalendarios(inicio, seed.calendarios, seed.calendarioPadraoUid)
    const s = computeSchedule(seed.tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })
    return { s, atraso: workingVariance(calendarioDeDias(cals.padrao), '2027-06-01', s.projectFinish) }
  }

  it('início em 26/10/2026: entrega 23/06/2027, atraso de 16 d.u. (antes da correção: 22/06 e 15)', () => {
    const { s, atraso } = entrega('2026-10-26')
    expect(s.projectFinish).toBe('2027-06-23')
    expect(atraso).toBe(16)
    expect(s.byUid.get(104)?.finish).toBe('2026-11-05')
    // 105 começava em 06/11 no E1 (restante em dias inteiros); com o restante exato do E2 (CR-9) começa em 05/11, às 09:36
    expect([s.byUid.get(105)?.start, s.byUid.get(105)?.inicioHora]).toEqual(['2026-11-05', '09:36'])
  })

  it('início em 03/11/2026: mesma entrega', () => {
    const { s, atraso } = entrega('2026-11-03')
    expect(s.projectFinish).toBe('2027-06-23')
    expect(atraso).toBe(16)
  })
})

describe('withBaseline (CR-12)', () => {
  const seed = buildSeedState()
  const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
  const base = computeSchedule(seed.tasks, cals, { mode: 'baseline' })

  it('linha de base só com término não é sobrescrita (o término do arquivo se mantém)', () => {
    const tasks = seed.tasks.map((t) => {
      if (t.uid !== 303) return t
      const { baselineStart: _ignorado, ...resto } = t
      return { ...resto, baselineFinish: '2027-01-29' }
    })
    const out = withBaseline(tasks, base, true).find((t) => t.uid === 303)!
    expect(out.baselineStart).toBeUndefined()
    expect(out.baselineFinish).toBe('2027-01-29')
  })

  it('só com início também é mantida; sem linha de base é preenchida; completa fica intacta', () => {
    const tasks = seed.tasks.map((t) => {
      if (t.uid === 303) return { ...t, baselineStart: '2026-10-23', baselineFinish: undefined }
      if (t.uid === 105) return { ...t, baselineStart: undefined, baselineFinish: undefined, baselineDuration: undefined }
      if (t.uid === 106) return { ...t, baselineStart: '2030-01-01', baselineFinish: '2030-02-01' }
      return t
    })
    const out = withBaseline(tasks, base, true)
    const por = (uid: number) => out.find((t) => t.uid === uid)!
    expect(por(303).baselineStart).toBe('2026-10-23')
    expect(por(303).baselineFinish).toBeUndefined()
    expect(por(105).baselineStart).toBe('2026-10-14')
    expect(por(105).baselineFinish).toBe('2026-11-05')
    expect(por(106).baselineStart).toBe('2030-01-01')
    expect(por(106).baselineFinish).toBe('2030-02-01')
  })

  it('sem onlyMissing, sobrescreve tudo', () => {
    const tasks = seed.tasks.map((t) => (t.uid === 106 ? { ...t, baselineStart: '2030-01-01', baselineFinish: '2030-02-01' } : t))
    expect(withBaseline(tasks, base).find((t) => t.uid === 106)!.baselineStart).toBe('2026-11-06')
  })
})

describe('calendário por tarefa (CR-2a, CR-2b)', () => {
  it('CR-2a: 12 dias sem vínculo desde seg 03/08 08:00 terminam em 18/08 17:00 no padrão e em 17/08 17:00 no sábado de 4 h', () => {
    const padraoRes = agendar([tarefa(1, 12)], '2026-08-03').byUid.get(1)!
    expect([padraoRes.start, padraoRes.inicioHora, padraoRes.finish, padraoRes.terminoHora]).toEqual(['2026-08-03', '08:00', '2026-08-18', '17:00'])
    const sab = agendar([tarefa(1, 12, { calendarioUid: 2 })], '2026-08-03').byUid.get(1)!
    expect([sab.start, sab.inicioHora, sab.finish, sab.terminoHora]).toEqual(['2026-08-03', '08:00', '2026-08-17', '17:00'])
    expect(sab.duracaoMin).toBe(5760)
  })

  it('CR-2b: A no padrão termina 13/08 17:00 e B vai de 14/08 08:00 a 14/08 17:00', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 1, { predecessors: [liga(1)] })], '2026-08-07')
    const [a, b] = [r.byUid.get(1)!, r.byUid.get(2)!]
    expect([a.finish, a.terminoHora]).toEqual(['2026-08-13', '17:00'])
    expect([b.start, b.inicioHora, b.finish, b.terminoHora]).toEqual(['2026-08-14', '08:00', '2026-08-14', '17:00'])
  })

  it('CR-2b: A no sábado de 4 h termina 13/08 12:00 e B vai de 13/08 13:00 a 14/08 12:00', () => {
    const r = agendar([tarefa(1, 5, { calendarioUid: 2 }), tarefa(2, 1, { predecessors: [liga(1)] })], '2026-08-07')
    const [a, b] = [r.byUid.get(1)!, r.byUid.get(2)!]
    expect([a.finish, a.terminoHora]).toEqual(['2026-08-13', '12:00'])
    expect([b.start, b.inicioHora, b.finish, b.terminoHora]).toEqual(['2026-08-13', '13:00', '2026-08-14', '12:00'])
  })

  it('CR-2c: Aurora com a UID 105 no sábado de 4 h (linha de base): datas, horas e folgas fracionárias', () => {
    const seed = buildSeedState()
    const tasks = seed.tasks.map((t) => (t.uid === 105 ? { ...t, calendarioUid: 2 } : t))
    const padraoAurora = seed.calendarios[0]
    const sabAurora: CalendarioObra = { ...padraoAurora, uid: 2, nome: 'Sábado 4 h', semana: padraoAurora.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
    const cals = compilarCalendarios(seed.meta.startDate, [padraoAurora, sabAurora], 1)
    const r = computeSchedule(tasks, cals, { mode: 'baseline' })
    const u = (uid: number) => r.byUid.get(uid)!
    // 105: termina 04/11 às 12:00 (antes: 05/11)
    expect([u(105).start, u(105).inicioHora, u(105).finish, u(105).terminoHora]).toEqual(['2026-10-14', '08:00', '2026-11-04', '12:00'])
    // 401 e 106 começam 04/11 às 13:00 (antes: 06/11)
    expect([u(401).start, u(401).inicioHora]).toEqual(['2026-11-04', '13:00'])
    expect([u(106).start, u(106).inicioHora]).toEqual(['2026-11-04', '13:00'])
    // Fim do projeto (802): 31/05/2027 às 12:00 (antes: 01/06)
    expect([u(802).finish, u(802).terminoHora]).toEqual(['2027-05-31', '12:00'])
    expect(r.projectFinish).toBe('2027-05-31')
    // Folgas: 47,5 d nas três (antes: 49) e folga livre da 106 de 12,5 d (antes: 11)
    for (const uid of [302, 303, 702]) expect([uid, u(uid).folgaTotalMin, u(uid).totalFloat]).toEqual([uid, 22800, 47.5])
    expect([u(106).folgaLivreMin, u(106).freeFloat]).toEqual([6000, 12.5])
    // Continuam críticas, com folga zero
    for (const uid of [105, 401, 501, 502, 701, 801]) expect([uid, u(uid).critical, u(uid).folgaTotalMin]).toEqual([uid, true, 0])
  })
})

describe('lag entre calendários diferentes (CR-3, gate P1)', () => {
  const cals = compilarCalendarios('2026-08-03', [padrao, sabado4h], 1)

  it('a regra mora numa função: o calendário do lag é o da sucessora, ou o padrão quando ela não tem calendário próprio', () => {
    const comSab = tarefa(1, 5, { calendarioUid: 2 })
    const comum = tarefa(2, 1)
    expect(calendarioDoLag(cals, comum, comSab).uid).toBe(2) // sucessora com calendário próprio
    expect(calendarioDoLag(cals, comSab, comum).uid).toBe(1) // sucessora sem calendário próprio: padrão da obra
  })

  it('CR-3: A no padrão (termina 07/08 17:00) e B no sábado de 4 h com FS +1 d: B começa 10/08 às 13:00', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 1, { calendarioUid: 2, predecessors: [liga(1, 'FS', 1)] })], '2026-08-03')
    expect(r.byUid.get(1)!.finish).toBe('2026-08-07')
    const b = r.byUid.get(2)!
    // sábado 240 min + segunda 240 min = 1 dia de 480 min no calendário de B; B começa depois, às 13:00
    expect([b.start, b.inicioHora]).toEqual(['2026-08-10', '13:00'])
  })

  it('lado de controle: A no sábado de 4 h e B no padrão: o lag conta no padrão (da sucessora) e B começa 11/08 às 08:00', () => {
    const r = agendar([tarefa(1, 5, { calendarioUid: 2 }), tarefa(2, 1, { predecessors: [liga(1, 'FS', 1)] })], '2026-08-03')
    const b = r.byUid.get(2)!
    // Pela regra da predecessora seria 10/08 às 13:00 (sábado 240 + segunda 240): não é a regra ativa
    expect([b.start, b.inicioHora]).toEqual(['2026-08-11', '08:00'])
  })

  it('lag zero entre calendários não depende da regra', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 1, { calendarioUid: 2, predecessors: [liga(1)] })], '2026-08-03')
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.inicioHora]).toEqual(['2026-08-08', '08:00']) // sábado de 4 h já é útil para B
  })
})

describe('marcos, lag negativo, feriado e fim de semana', () => {
  it('somar lag 0 não empurra o marco: ele fica no dia do término da predecessora', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 0, { predecessors: [liga(1)] })], '2026-08-03')
    const marco = r.byUid.get(2)!
    expect([marco.start, marco.finish, marco.terminoHora]).toEqual(['2026-08-07', '2026-08-07', '17:00'])
    expect(r.projectFinish).toBe('2026-08-07')
    expect(r.byUid.get(1)!.critical).toBe(true)
  })

  it('marco sem predecessora fica no primeiro dia útil da obra', () => {
    const r = agendar([tarefa(1, 0)], '2026-08-01') // sábado
    expect([r.byUid.get(1)!.start, r.byUid.get(1)!.finish]).toEqual(['2026-08-03', '2026-08-03'])
  })

  it('lag negativo antecipa a sucessora (FS -2 d: começa 2 dias úteis antes do fim da predecessora)', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 2, { predecessors: [liga(1, 'FS', -2)] })], '2026-08-03')
    const b = r.byUid.get(2)!
    expect([b.start, b.inicioHora, b.finish]).toEqual(['2026-08-06', '08:00', '2026-08-07'])
  })

  it('SS, FF e SF com lag: início/término alinhados pelo tipo do vínculo', () => {
    const base = [tarefa(1, 5)]
    const ss = agendar([...base, tarefa(2, 2, { predecessors: [liga(1, 'SS', 2)] })], '2026-08-03').byUid.get(2)!
    expect([ss.start, ss.finish]).toEqual(['2026-08-05', '2026-08-06'])
    const ff = agendar([...base, tarefa(2, 2, { predecessors: [liga(1, 'FF', 1)] })], '2026-08-03').byUid.get(2)!
    expect([ff.start, ff.finish]).toEqual(['2026-08-07', '2026-08-10']) // termina 1 dia útil depois do término de A (07/08)
    const sf = agendar([...base, tarefa(2, 2, { predecessors: [liga(1, 'SF', 3)] })], '2026-08-03').byUid.get(2)!
    expect([sf.start, sf.finish]).toEqual(['2026-08-04', '2026-08-05']) // termina 3 dias úteis depois do início de A
  })

  it('feriado nacional e fim de semana: 07/09/2026 não conta', () => {
    const r = agendar([tarefa(1, 3)], '2026-09-04') // sexta; segunda 07/09 é feriado
    expect([r.byUid.get(1)!.start, r.byUid.get(1)!.finish]).toEqual(['2026-09-04', '2026-09-09'])
  })

  it('SNET: início não antes da data; com hora, no próximo momento útil depois dela', () => {
    const a = agendar([tarefa(1, 2, { restricao: { tipo: 'SNET', data: '2026-08-12' } })], '2026-08-03').byUid.get(1)!
    expect([a.start, a.inicioHora, a.finish]).toEqual(['2026-08-12', '08:00', '2026-08-13'])
    const b = agendar([tarefa(1, 1, { restricao: { tipo: 'SNET', data: '2026-08-12T14:30' } })], '2026-08-03').byUid.get(1)!
    expect([b.start, b.inicioHora, b.finish, b.terminoHora]).toEqual(['2026-08-12', '14:30', '2026-08-13', '14:30'])
  })

  it('ciclo: o vínculo que fecha o ciclo é descartado e o cálculo termina', () => {
    const r = agendar([tarefa(1, 2, { predecessors: [liga(2)] }), tarefa(2, 2, { predecessors: [liga(1)] })], '2026-08-03')
    expect(r.byUid.size).toBe(2)
    expect(r.projectFinish).toBe('2026-08-06') // 1 → 2 mantido (ordem da EAP); 2 → 1 descartado
  })

  it('vínculo para tarefa-resumo vira vínculo para as folhas dela', () => {
    const resumo: Task = { ...tarefa(10, 0), wbs: '01', isSummary: true }
    const filha1: Task = { ...tarefa(11, 2), wbs: '01.01' }
    const filha2: Task = { ...tarefa(12, 4), wbs: '01.02' }
    const depois: Task = { ...tarefa(13, 1), wbs: '02', predecessors: [liga(10)] }
    const r = agendar([resumo, filha1, filha2, depois], '2026-08-03')
    expect([r.byUid.get(13)!.start, r.byUid.get(13)!.inicioHora]).toEqual(['2026-08-07', '08:00']) // depois da filha de 4 dias
  })
})

describe('lag em dias corridos (CR-4) e em % (CR-5)', () => {
  const corrido = (uid: number, dc: number, type: LinkType = 'FS') => ({ uid, type, lag: { tipo: 'corrido' as const, minutos: dc * 1440 } })
  const pct = (uid: number, percentual: number, type: LinkType = 'FS') => ({ uid, type, lag: { tipo: 'percentual' as const, percentual } })

  it('CR-4: A de 1 d em qua 02/09 e FS +7 ed (LinkLag 100800): B começa 10/09 às 08:00 (7 dias úteis seriam 15/09; 5/7 dava 11/09)', () => {
    const base = [tarefa(1, 1)]
    const ed = agendar([...base, tarefa(2, 1, { predecessors: [corrido(1, 7)] })], '2026-09-02').byUid.get(2)!
    expect([ed.start, ed.inicioHora]).toEqual(['2026-09-10', '08:00'])
    const util7 = agendar([...base, tarefa(2, 1, { predecessors: [liga(1, 'FS', 7)] })], '2026-09-02').byUid.get(2)!
    expect(util7.start).toBe('2026-09-15')
    const aproximado = agendar([...base, tarefa(2, 1, { predecessors: [liga(1, 'FS', 5)] })], '2026-09-02').byUid.get(2)!
    expect(aproximado.start).toBe('2026-09-11')
  })

  it('CR-4: A termina qui 06/08 17:00 e FS +2 ed (LinkLag 28800): B começa 10/08 às 08:00 (2 dias úteis: 11/08)', () => {
    const r = agendar([tarefa(1, 1), tarefa(2, 1, { predecessors: [corrido(1, 2)] })], '2026-08-06')
    expect([r.byUid.get(1)!.finish, r.byUid.get(1)!.terminoHora]).toEqual(['2026-08-06', '17:00'])
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.inicioHora]).toEqual(['2026-08-10', '08:00'])
    const util = agendar([tarefa(1, 1), tarefa(2, 1, { predecessors: [liga(1, 'FS', 2)] })], '2026-08-06')
    expect(util.byUid.get(2)!.start).toBe('2026-08-11')
  })

  it('lag corrido ignora o calendário (também o da sucessora com sábado de 4 h) e a folga volta consistente', () => {
    const r = agendar([tarefa(1, 1), tarefa(2, 1, { calendarioUid: 2, predecessors: [corrido(1, 1)] })], '2026-08-06')
    // A termina qui 06/08 17:00; +24 h = sex 07/08 17:00; B (sábado de 4 h) começa no próximo momento útil: sáb 08/08 08:00
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.inicioHora]).toEqual(['2026-08-08', '08:00'])
    expect(r.byUid.get(1)!.critical).toBe(true)
    expect(r.byUid.get(1)!.folgaTotalMin).toBe(0)
  })

  it('CR-5: A de 4 d (03/08 08:00 a 06/08 17:00): FS +50% → B 11/08 08:00; SS +50% → B 05/08 08:00; FS -25% → B 06/08 08:00', () => {
    const a = tarefa(1, 4)
    const inicioDeB = (lag: ReturnType<typeof pct>) => {
      const b = agendar([a, tarefa(2, 1, { predecessors: [lag] })], '2026-08-03').byUid.get(2)!
      return [b.start, b.inicioHora]
    }
    expect(inicioDeB(pct(1, 50))).toEqual(['2026-08-11', '08:00'])
    expect(inicioDeB(pct(1, 50, 'SS'))).toEqual(['2026-08-05', '08:00'])
    expect(inicioDeB(pct(1, -25))).toEqual(['2026-08-06', '08:00'])
  })

  it('lag % arredonda o minuto (meio para cima) e acompanha a duração da predecessora; a volta é coerente (folga 0 na cadeia)', () => {
    // 100 min de predecessora × 33% = 33 min
    const a = { ...tarefa(1, 0), duracaoMin: 100 }
    const r = agendar([a, tarefa(2, 1, { predecessors: [pct(1, 33)] })], '2026-08-03')
    // A de 100 min vai de 08:00 a 09:40; +33 min de lag → B começa às 10:13
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.inicioHora]).toEqual(['2026-08-03', '10:13'])
    expect(r.byUid.get(1)!.folgaTotalMin).toBe(0)
    expect(r.byUid.get(2)!.critical).toBe(true)
  })

  it('FF e SF com lag corrido e %: o término da sucessora acompanha o vínculo', () => {
    const ff = agendar([tarefa(1, 4), tarefa(2, 2, { predecessors: [corrido(1, 1, 'FF')] })], '2026-08-03').byUid.get(2)!
    // A termina qui 06/08 17:00; +24 h = sex 07/08 17:00; B de 2 d termina aí e começa qui 06/08 08:00
    expect([ff.start, ff.finish, ff.terminoHora]).toEqual(['2026-08-06', '2026-08-07', '17:00'])
    const sf = agendar([tarefa(1, 4), tarefa(2, 2, { predecessors: [pct(1, 50, 'SF')] })], '2026-08-03').byUid.get(2)!
    // A começa seg 03/08 08:00; +50% de 4 d = 2 d → ter 04/08 17:00; B termina aí e começa seg 03/08 08:00
    expect([sf.start, sf.finish, sf.terminoHora]).toEqual(['2026-08-03', '2026-08-04', '17:00'])
  })
})

describe('restrições (CR-6) com honrar restrições (P2): A 5 d (03/08 a 07/08) e B 2 d FS de A', () => {
  const rede = (restricao?: Task['restricao'], prazoFinal?: string) => {
    const r = agendar([tarefa(1, 5), tarefa(2, 2, { predecessors: [liga(1)], restricao, prazoFinal })], '2026-08-03')
    return { a: r.byUid.get(1)!, b: r.byUid.get(2)! }
  }
  const dias = (min: number) => min / 480

  it('ASAP: B 10/08 a 11/08; folga de A 0', () => {
    const { a, b } = rede()
    expect([b.start, b.finish]).toEqual(['2026-08-10', '2026-08-11'])
    expect([dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual([0, 0, false])
  })

  it('SNET 12/08: B 12/08 a 13/08; folga de A 2 d', () => {
    const { a, b } = rede({ tipo: 'SNET', data: '2026-08-12' })
    expect([b.start, b.finish, dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual(['2026-08-12', '2026-08-13', 2, 0, false])
  })

  it('SNLT 05/08: B 05/08 a 06/08 (antes do que o vínculo permite); folga de A -3 d, de B 0, folga livre de B 1 d; conflito', () => {
    const { a, b } = rede({ tipo: 'SNLT', data: '2026-08-05' })
    expect([b.start, b.finish, dias(a.folgaTotalMin), dias(b.folgaTotalMin), dias(b.folgaLivreMin), b.restricaoConflito]).toEqual(['2026-08-05', '2026-08-06', -3, 0, 1, true])
    expect(a.critical).toBe(true) // folga ≤ 0 é crítica
  })

  it('MSO 06/08: B 06/08 a 07/08; folga de A -2 d; conflito', () => {
    const { a, b } = rede({ tipo: 'MSO', data: '2026-08-06' })
    expect([b.start, b.finish, dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual(['2026-08-06', '2026-08-07', -2, 0, true])
  })

  it('MSO depois do que o vínculo permite não é conflito: a tarefa só começa mais tarde', () => {
    const { b } = rede({ tipo: 'MSO', data: '2026-08-12' })
    expect([b.start, b.finish, b.restricaoConflito]).toEqual(['2026-08-12', '2026-08-13', false])
  })

  it('MFO 12/08: B 11/08 a 12/08; folga de A 1 d', () => {
    const { a, b } = rede({ tipo: 'MFO', data: '2026-08-12' })
    expect([b.start, b.finish, b.terminoHora, dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual(['2026-08-11', '2026-08-12', '17:00', 1, 0, false])
  })

  it('FNET 13/08: B 12/08 a 13/08; folga de A 2 d', () => {
    const { a, b } = rede({ tipo: 'FNET', data: '2026-08-13' })
    expect([b.start, b.finish, dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual(['2026-08-12', '2026-08-13', 2, 0, false])
  })

  it('FNLT 10/08: B 07/08 a 10/08; folga de A -1 d; conflito', () => {
    const { a, b } = rede({ tipo: 'FNLT', data: '2026-08-10' })
    expect([b.start, b.finish, dias(a.folgaTotalMin), dias(b.folgaTotalMin), b.restricaoConflito]).toEqual(['2026-08-07', '2026-08-10', -1, 0, true])
  })

  it('restrição com hora: FNET 12/08 às 10:00 e MSO 12/08 às 14:30 usam o momento exato', () => {
    const fnet = rede({ tipo: 'FNET', data: '2026-08-12T10:00' }).b
    // B de 2 d (960 min) termina 12/08 10:00 e, contando para trás no calendário, começa 10/08 às 10:00 (o vínculo dá 10/08 08:00)
    expect([fnet.start, fnet.inicioHora, fnet.finish, fnet.terminoHora]).toEqual(['2026-08-10', '10:00', '2026-08-12', '10:00'])
    const mso = rede({ tipo: 'MSO', data: '2026-08-12T14:30' }).b
    expect([mso.start, mso.inicioHora]).toEqual(['2026-08-12', '14:30'])
  })

  it('data de restrição inválida é ignorada (o import já avisa); data além do horizonte de 50 anos é erro em português', () => {
    expect(rede({ tipo: 'SNET', data: 'ontem' }).b.start).toBe('2026-08-10')
    expect(() => rede({ tipo: 'SNET', data: '9999-12-31' })).toThrow(/horizonte de 50 anos/)
  })

  it('CR-6b ALAP: Y de 3 d sem vínculo vai para 12/08 08:00 a 14/08 17:00; início cedo 03/08; folga total e livre de 7 d', () => {
    const r = agendar([tarefa(1, 10), tarefa(2, 3, { restricao: { tipo: 'ALAP' } })], '2026-08-03')
    const y = r.byUid.get(2)!
    expect([y.start, y.inicioHora, y.finish, y.terminoHora]).toEqual(['2026-08-12', '08:00', '2026-08-14', '17:00'])
    expect([y.earlyStart, y.inicioCedoMin]).toEqual(['2026-08-03', 480])
    expect([y.folgaTotalMin, y.folgaLivreMin, y.critical]).toEqual([3360, 3360, false])
    expect(r.projectFinish).toBe('2026-08-14')
  })

  it('o prazo final não move a tarefa: CR-7 prazo 10/08 17:00 em B marca prazoFinalPerdido e folga -1 d em B e em A', () => {
    const { a, b } = rede(undefined, '2026-08-10T17:00')
    expect([b.start, b.finish, b.prazoFinalPerdido]).toEqual(['2026-08-10', '2026-08-11', true])
    expect([dias(b.folgaTotalMin), dias(a.folgaTotalMin), b.critical, a.critical]).toEqual([-1, -1, true, true])
  })

  it('CR-7: prazo só com a data (fim do expediente) e prazo depois do término tardio não aumentam a folga nem acendem o indicador', () => {
    const noDia = rede(undefined, '2026-08-10').b
    expect([noDia.prazoFinalPerdido, dias(noDia.folgaTotalMin)]).toEqual([true, -1]) // 10/08 17:00 < término 11/08 17:00
    const depois = rede(undefined, '2026-08-14')
    expect([depois.b.prazoFinalPerdido, dias(depois.b.folgaTotalMin), dias(depois.a.folgaTotalMin)]).toEqual([false, 0, 0])
    expect(rede().b.prazoFinalPerdido).toBe(false)
  })
})

describe('duração corrida (CR-10)', () => {
  it('CR-10: 1 dc (1.440 min) desde sex 07/08 08:00 termina sáb 08/08 às 08:00', () => {
    const r = agendar([tarefa(1, 0, { duracaoMin: 1440, duracaoCorrida: true })], '2026-08-07').byUid.get(1)!
    expect([r.start, r.inicioHora, r.finish, r.terminoHora, r.corrida]).toEqual(['2026-08-07', '08:00', '2026-08-08', '08:00', true])
    expect(r.duracaoMin).toBe(1440)
  })

  it('a folga da tarefa corrida é medida em 24 h e exibida em dias corridos; a sucessora segue o calendário dela', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 0, { duracaoMin: 1440, duracaoCorrida: true }), tarefa(3, 1, { predecessors: [liga(2)] })], '2026-08-07')
    const c = r.byUid.get(2)!
    // C termina sáb 08/08 08:00 e D (1 d) só pode começar até qui 13/08 08:00 para o projeto terminar em 13/08 17:00:
    // 5 dias de relógio = 7.200 min, exibidos em dias corridos (÷ 1.440), não em dias úteis (÷ 480 daria 15)
    expect(c.corrida).toBe(true)
    expect([c.folgaTotalMin, c.totalFloat]).toEqual([7200, 5])
    expect(r.byUid.get(3)!.start).toBe('2026-08-10') // próxima manhã útil depois do sábado
    expect(r.byUid.get(1)!.corrida).toBe(false)
    expect([r.byUid.get(1)!.folgaTotalMin, r.byUid.get(1)!.totalFloat]).toEqual([0, 0]) // A de 5 d define o fim do projeto (13/08): crítica
  })

  it('tarefa corrida sem sucessora: folga = minutos de relógio até o fim do projeto ÷ 1.440', () => {
    const r = agendar([tarefa(1, 5), tarefa(2, 0, { duracaoMin: 1440, duracaoCorrida: true })], '2026-08-07')
    const c = r.byUid.get(2)!
    // C termina sáb 08/08 08:00; o projeto termina qui 13/08 17:00: 5 d e 9 h de relógio = 7.740 min
    expect([c.folgaTotalMin, c.totalFloat, c.freeFloat]).toEqual([7740, 5.375, 5.375])
  })
})

describe('opções de progresso (CR-8) e restante exato', () => {
  const rede = (opcoes?: { logica?: 'retida' | 'substituir'; moverRestante?: boolean }) => {
    const tasks = [
      tarefa(1, 10),
      tarefa(2, 4, { predecessors: [liga(1)], percentComplete: 50, actualStart: '2026-08-03' }), // iniciada fora de sequência
    ]
    const r = computeSchedule(tasks, compilarCalendarios('2026-08-03', [padrao, sabado4h], 1), { mode: 'forecast', statusDate: '2026-08-05', opcoes })
    return { a: r.byUid.get(1)!, b: r.byUid.get(2)! }
  }

  it('lógica retida (padrão): A 06/08 a 19/08 com folga 0 e crítica; B termina 21/08 17:00 com folga 0', () => {
    for (const opcoes of [undefined, { logica: 'retida' as const }]) {
      const { a, b } = rede(opcoes)
      expect([a.start, a.finish, a.folgaTotalMin, a.critical]).toEqual(['2026-08-06', '2026-08-19', 0, true])
      expect([b.start, b.finish, b.terminoHora, b.folgaTotalMin, b.restanteMin]).toEqual(['2026-08-03', '2026-08-21', '17:00', 0, 960])
    }
  })

  it('substituir progresso: B termina 07/08 17:00 (como antes), A folga 0 e B folga de 8 d', () => {
    const { a, b } = rede({ logica: 'substituir' })
    expect([a.start, a.finish, a.folgaTotalMin, a.critical]).toEqual(['2026-08-06', '2026-08-19', 0, true])
    expect([b.finish, b.terminoHora, b.folgaTotalMin / 480]).toEqual(['2026-08-07', '17:00', 8])
  })

  it('mover o restante: A de 5 d sem vínculo (início 03/08, status 05/08) vai para 06/08 a 12/08; sem mover, fica 03/08 a 07/08', () => {
    const calcular = (moverRestante: boolean) => {
      const r = computeSchedule([tarefa(1, 5)], compilarCalendarios('2026-08-03', [padrao], 1), { mode: 'forecast', statusDate: '2026-08-05', opcoes: { moverRestante } })
      return [r.byUid.get(1)!.start, r.byUid.get(1)!.finish]
    }
    expect(calcular(true)).toEqual(['2026-08-06', '2026-08-12'])
    expect(calcular(false)).toEqual(['2026-08-03', '2026-08-07'])
  })

  it('a opção padrão da obra é lógica retida e mover o restante', () => {
    const { a } = rede({})
    expect(a.start).toBe('2026-08-06')
  })

  it('restante exato: 40% de 12 d = 3.456 min; 78% de 36 d = 3.801,6 → 3.802 min; tarefa quase pronta fica com 1 min no mínimo', () => {
    const r = computeSchedule(
      [tarefa(1, 12, { percentComplete: 40, actualStart: '2026-08-03' }), tarefa(2, 36, { percentComplete: 78, actualStart: '2026-08-03' }), { ...tarefa(3, 0), duracaoMin: 10, percentComplete: 99.99, actualStart: '2026-08-03' }],
      compilarCalendarios('2026-08-03', [padrao], 1),
      { mode: 'forecast', statusDate: '2026-08-05' },
    )
    expect([r.byUid.get(1)!.restanteMin, r.byUid.get(2)!.restanteMin, r.byUid.get(3)!.restanteMin]).toEqual([3456, 3802, 1])
  })
})

describe('rodada 02: progresso com vínculos, restrições de término em tarefa iniciada, ALAP com sucessora e marco', () => {
  /** Previsão com data de status 05/08 (início da obra em 03/08) e as opções pedidas. */
  const prever = (tasks: Task[], opcoes?: { logica?: 'retida' | 'substituir'; moverRestante?: boolean }) =>
    computeSchedule(tasks, compilarCalendarios('2026-08-03', [padrao, sabado4h], 1), { mode: 'forecast', statusDate: '2026-08-05', opcoes })
  const iniciada = (uid: number, dias: number, over: Partial<Task> = {}) => tarefa(uid, dias, { percentComplete: 50, actualStart: '2026-08-03', ...over })

  it('C: sem mover o restante, o restante empurrado por vínculo começa depois da parte já feita (B termina 14/08, antes 10/08)', () => {
    const a = tarefa(1, 1)
    const b = iniciada(2, 10, { predecessors: [liga(1)] })
    const r = prever([a, b], { moverRestante: false })
    // A não iniciada fica em 03/08 (não é empurrada); a parte feita de B (5 d) vai até 07/08 17:00 e o restante (5 d) até 14/08
    expect([r.byUid.get(1)!.start, r.byUid.get(1)!.finish]).toEqual(['2026-08-03', '2026-08-03'])
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.finish, r.byUid.get(2)!.terminoHora]).toEqual(['2026-08-03', '2026-08-14', '17:00'])
    // Sem predecessora o resultado é o mesmo (14/08): o vínculo já satisfeito não muda nada
    expect(prever([iniciada(2, 10)], { moverRestante: false }).byUid.get(2)!.finish).toBe('2026-08-14')
  })

  it('D: tarefa iniciada com FF usa o restante: A de 10 d (06/08 a 19/08) e B de 4 d a 50% com FF+0 terminam juntas em 19/08 17:00', () => {
    const a = tarefa(1, 10)
    const b = iniciada(2, 4, { predecessors: [liga(1, 'FF')] })
    const r = prever([a, b])
    expect([r.byUid.get(1)!.start, r.byUid.get(1)!.finish]).toEqual(['2026-08-06', '2026-08-19'])
    expect([r.byUid.get(2)!.finish, r.byUid.get(2)!.terminoHora]).toEqual(['2026-08-19', '17:00'])
    // SF + 0 também: o término de B não antecede o início de A (06/08), e o restante cabe antes
    const sf = prever([a, iniciada(2, 4, { predecessors: [liga(1, 'SF')] })])
    expect(sf.byUid.get(2)!.finish).toBe('2026-08-07') // restante de 2 d a partir do dia seguinte à data de status
  })

  it('E: FNLT e MFO continuam limitando o término tardio da tarefa iniciada (folga -3 d e conflito); SNLT e MSO deixam de valer', () => {
    const fnlt = prever([iniciada(1, 10, { restricao: { tipo: 'FNLT', data: '2026-08-07' } })]).byUid.get(1)!
    // O restante (5 d) parte de 06/08 e termina em 12/08; o limite é 07/08 17:00
    expect([fnlt.finish, fnlt.folgaTotalMin / 480, fnlt.restricaoConflito, fnlt.critical]).toEqual(['2026-08-12', -3, true, true])
    const mfo = prever([iniciada(1, 10, { restricao: { tipo: 'MFO', data: '2026-08-07' } })]).byUid.get(1)!
    expect([mfo.folgaTotalMin / 480, mfo.restricaoConflito]).toEqual([-3, true])
    // Limite depois do término previsto: sem conflito (a folga fica 0 porque o projeto termina na própria tarefa)
    const folgado = prever([iniciada(1, 10, { restricao: { tipo: 'FNLT', data: '2026-08-14' } })]).byUid.get(1)!
    expect([folgado.folgaTotalMin, folgado.restricaoConflito]).toEqual([0, false])
    // SNLT em tarefa já iniciada não limita nada: folga 0 e sem conflito
    const snlt = prever([iniciada(1, 10, { restricao: { tipo: 'SNLT', data: '2026-08-03' } })]).byUid.get(1)!
    expect([snlt.folgaTotalMin, snlt.restricaoConflito]).toEqual([0, false])
  })

  it('F: ALAP com sucessora vai para as datas tardias e a sucessora FS só começa depois (Y 10/08 a 12/08, Z de 13/08 a 14/08)', () => {
    const x = tarefa(1, 10) // define o fim do projeto em 14/08
    const y = tarefa(2, 3, { restricao: { tipo: 'ALAP' } })
    const z = tarefa(3, 2, { predecessors: [liga(2)] })
    const r = agendar([x, y, z], '2026-08-03')
    const u = (uid: number) => r.byUid.get(uid)!
    expect([u(2).start, u(2).inicioHora, u(2).finish, u(2).terminoHora]).toEqual(['2026-08-10', '08:00', '2026-08-12', '17:00'])
    expect([u(3).start, u(3).inicioHora, u(3).finish]).toEqual(['2026-08-13', '08:00', '2026-08-14'])
    // Folgas coerentes: Y e Z formam a cadeia (folga 0) e o projeto continua terminando em 14/08
    expect([u(2).folgaTotalMin, u(3).folgaTotalMin, u(2).critical, u(3).critical]).toEqual([0, 0, true, true])
    expect(r.projectFinish).toBe('2026-08-14')
    // ALAP em cadeia: o 2º ALAP também é travado e a sucessora parte do último
    const cadeia = agendar([x, tarefa(2, 3, { restricao: { tipo: 'ALAP' } }), tarefa(3, 2, { restricao: { tipo: 'ALAP' }, predecessors: [liga(2)] }), tarefa(4, 1, { predecessors: [liga(3)] })], '2026-08-03')
    expect(cadeia.byUid.get(4)!.start).toBe('2026-08-14')
    expect(cadeia.byUid.get(3)!.finish).toBe('2026-08-13')
    expect(cadeia.byUid.get(2)!.finish).toBe('2026-08-11')
  })

  it('F: ALAP sem sucessora segue como no CR-6b (datas tardias agendadas, folga cedo de 7 d)', () => {
    const y = agendar([tarefa(1, 10), tarefa(2, 3, { restricao: { tipo: 'ALAP' } })], '2026-08-03').byUid.get(2)!
    expect([y.start, y.finish, y.earlyStart, y.folgaTotalMin]).toEqual(['2026-08-12', '2026-08-14', '2026-08-03', 3360])
  })

  it('J: a data do marco é a do próprio momento (SNET e MSO em 12/08; SS +0 de tarefa que começa seg 10/08)', () => {
    for (const tipo of ['SNET', 'MSO'] as const) {
      const m = agendar([tarefa(1, 0, { restricao: { tipo, data: '2026-08-12' } })], '2026-08-03').byUid.get(1)!
      expect([tipo, m.start, m.finish, m.earlyStart, m.earlyFinish, m.inicioHora]).toEqual([tipo, '2026-08-12', '2026-08-12', '2026-08-12', '2026-08-12', '08:00'])
    }
    const r = agendar([tarefa(1, 5, { restricao: { tipo: 'SNET', data: '2026-08-10' } }), tarefa(2, 0, { predecessors: [liga(1, 'SS')] })], '2026-08-03')
    // Antes (motor em dias): o marco SS +0 aparecia no dia anterior ao início da predecessora, 07/08
    expect([r.byUid.get(2)!.start, r.byUid.get(2)!.finish, r.byUid.get(2)!.inicioHora]).toEqual(['2026-08-10', '2026-08-10', '08:00'])
  })

  it('R-1/R-A (rodadas 03 e 04): data tardia do marco = a cedo quando o término tardio é o próprio momento; senão, o fim do trecho útil anterior', () => {
    const datas = (r: ReturnType<typeof agendar>, uid: number) => {
      const m = r.byUid.get(uid)!
      return [m.earlyStart, m.earlyFinish, m.lateStart, m.lateFinish, m.folgaTotalMin / 480]
    }
    // 1. SNET 12/08 sozinho: as quatro datas em 12/08 (antes da rodada 03: tardia 11/08)
    expect(datas(agendar([tarefa(1, 0, { restricao: { tipo: 'SNET', data: '2026-08-12' } })], '2026-08-03'), 1)).toEqual(['2026-08-12', '2026-08-12', '2026-08-12', '2026-08-12', 0])
    // 2. FS entre A (sex 07/08) e B (seg 10/08), folga 0: LS = LF = 07/08 17:00 (a regra só do momento dava 10/08 na rodada 03)
    const entre = agendar([tarefa(1, 1), tarefa(2, 0, { predecessors: [liga(1)] }), tarefa(3, 1, { predecessors: [liga(2)] })], '2026-08-07')
    expect(datas(entre, 2)).toEqual(['2026-08-07', '2026-08-07', '2026-08-07', '2026-08-07', 0])
    // 3. FS no fim, sem sucessora: 07/08
    expect(datas(agendar([tarefa(1, 1), tarefa(2, 0, { predecessors: [liga(1)] })], '2026-08-07'), 2)).toEqual(['2026-08-07', '2026-08-07', '2026-08-07', '2026-08-07', 0])
    // 4. FS com folga (o projeto vai até 14/08 por outra tarefa): cedo 10/08, tardia 14/08, folga 4 d
    expect(datas(agendar([tarefa(1, 1), tarefa(2, 0, { predecessors: [liga(1)] }), tarefa(3, 5)], '2026-08-10'), 2)).toEqual(['2026-08-10', '2026-08-10', '2026-08-14', '2026-08-14', 4])
    // 5. Marco sem vínculo na previsão (status 05/08) com X de 20 d: cedo 06/08, tardia 02/09 (fim do projeto), folga de 20 d (do início de 06/08 ao fim de 02/09)
    const previsao = prever([tarefa(1, 0), tarefa(2, 20)])
    expect(datas(previsao, 1)).toEqual(['2026-08-06', '2026-08-06', '2026-09-02', '2026-09-02', 20])
    // 6. Marco SS +0 de tarefa que começa seg 10/08: cedo 10/08, tardia 14/08 (fim do projeto), folga de 5 d
    const ss = agendar([tarefa(1, 5, { restricao: { tipo: 'SNET', data: '2026-08-10' } }), tarefa(2, 0, { predecessors: [liga(1, 'SS')] })], '2026-08-03')
    expect(datas(ss, 2)).toEqual(['2026-08-10', '2026-08-10', '2026-08-14', '2026-08-14', 5])
  })

  it('J: o marco depois de uma tarefa em calendário de 24 h, às 00:00 em ponto, fica no dia anterior', () => {
    const h24: CalendarioObra = { uid: 3, nome: '24 Horas', semana: Array.from({ length: 7 }, () => [{ de: 0, ate: 1440 }]), excecoes: [] }
    const cals = compilarCalendarios('2026-08-03', [padrao, h24], 1)
    const r = computeSchedule([tarefa(1, 0, { duracaoMin: 1440, calendarioUid: 3 }), tarefa(2, 0, { calendarioUid: 3, predecessors: [liga(1)] })], cals, { mode: 'baseline' })
    expect([r.byUid.get(1)!.finish, r.byUid.get(2)!.start, r.byUid.get(2)!.finish]).toEqual(['2026-08-03', '2026-08-03', '2026-08-03'])
    // A hora do marco acompanha a data: 24:00 do dia 03/08 (e não "03/08 00:00", que seria o início do dia)
    expect([r.byUid.get(2)!.inicioHora, r.byUid.get(2)!.terminoHora]).toEqual(['24:00', '24:00'])
  })
})

describe('propriedades do cálculo (RNF-05.2, 200 redes aleatórias com semente fixa)', () => {
  // Gerador congruencial linear determinístico: a mesma rede em toda execução
  const lcg = (semente: number) => () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }

  it('folga total nunca é negativa na linha de base, o início tarde não antecede o cedo e existe tarefa crítica', () => {
    const tipos: LinkType[] = ['FS', 'SS', 'FF', 'SF']
    for (let rede = 1; rede <= 200; rede++) {
      const sorteio = lcg(rede)
      const n = 5 + Math.floor(sorteio() * 20)
      const tasks: Task[] = []
      for (let i = 1; i <= n; i++) {
        const preds = []
        for (let k = 0; k < 2; k++) {
          if (i > 1 && sorteio() < 0.6) preds.push(liga(1 + Math.floor(sorteio() * (i - 1)), tipos[Math.floor(sorteio() * 4)], Math.floor(sorteio() * 4) - 1))
        }
        const dur = sorteio() < 0.1 ? 0 : 1 + Math.floor(sorteio() * 15)
        tasks.push(tarefa(i, dur, { predecessors: preds, calendarioUid: sorteio() < 0.3 ? 2 : undefined }))
      }
      const r = agendar(tasks, '2026-08-03')
      let criticas = 0
      for (const s of r.byUid.values()) {
        expect(s.folgaTotalMin, `rede ${rede}, UID ${s.uid}`).toBeGreaterThanOrEqual(0)
        expect(s.inicioTardeMin, `rede ${rede}, UID ${s.uid}`).toBeGreaterThanOrEqual(s.inicioCedoMin)
        expect(s.terminoTardeMin, `rede ${rede}, UID ${s.uid}`).toBeGreaterThanOrEqual(s.terminoCedoMin)
        expect(Number.isFinite(s.totalFloat) && Number.isFinite(s.freeFloat)).toBe(true)
        if (s.critical) criticas++
      }
      expect(criticas, `rede ${rede}`).toBeGreaterThan(0)
    }
  })
})
