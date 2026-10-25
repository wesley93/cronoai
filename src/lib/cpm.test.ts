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
    expect(s.byUid.get(105)?.start).toBe('2026-11-06')
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
