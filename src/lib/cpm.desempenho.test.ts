// Desempenho do motor (RNF-05.1): 3.000 folhas, 100 frentes e cerca de 6.000 vínculos, 3 calendários (30% fora do padrão).
// No CI: uma execução abaixo de 2.000 ms (teto largo contra máquina lenta). Local (CRONOAI_PERF=1): mediana de 5 execuções
// do cálculo + compilação dos calendários abaixo de 500 ms. Antes do ciclo 00004, no motor em dias: mediana de 26 ms.
// A obra mistura lag útil, corrido e em %, restrições de data (SNET, FNLT, MSO, ALAP), prazo final e tarefas iniciadas
// (rodada 02: o desempenho medido vale para o motor completo, não só para vínculos FS/SS/FF simples).
import { describe, expect, it } from 'vitest'
import type { CalendarioObra, Lag, LinkType, PredecessorLink, Restricao, Task } from '@/types/domain'
import { addCalendarDays, brazilianHolidays } from './calendar'
import { calendarioPadrao, compilarCalendarios, diasParaMinutos } from './calendarioTrabalho'
import { computeSchedule } from './cpm'

const FRENTES = 100
const POR_FRENTE = 30
const BASE = '2026-05-04'
const STATUS = '2026-10-23'

const padrao = calendarioPadrao(brazilianHolidays(2026).concat(brazilianHolidays(2027), brazilianHolidays(2028)))
const sabado4h: CalendarioObra = { ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
const noturno: CalendarioObra = {
  ...padrao,
  uid: 3,
  nome: 'Noturno',
  semana: padrao.semana.map((_, i) => (i >= 1 && i <= 5 ? [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }] : [])),
}

/** Gerador congruencial linear: a mesma obra em toda execução. */
function gerarObra(): Task[] {
  let semente = 20260425
  const sorteio = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }
  const tipos: LinkType[] = ['FS', 'FS', 'SS', 'FF']
  const tasks: Task[] = []
  let uid = 0
  for (let f = 0; f < FRENTES; f++) {
    for (let i = 0; i < POR_FRENTE; i++) {
      uid++
      const predecessors: PredecessorLink[] = []
      const candidatas = Array.from({ length: Math.min(i, 10) }, (_, k) => uid - 1 - k)
      if (i === 0 && f > 0) candidatas.push(uid - 1) // a frente começa depois da última tarefa da anterior
      for (let k = 0; k < 2 && candidatas.length; k++) {
        const p = candidatas.splice(Math.floor(sorteio() * candidatas.length), 1)[0]
        const tipo = tipos[Math.floor(sorteio() * tipos.length)]
        const dias = Math.floor(sorteio() * 4) - 1
        const forma = sorteio()
        const lag: Lag = forma < 0.7 ? { tipo: 'util', minutos: diasParaMinutos(dias) } : forma < 0.85 ? { tipo: 'corrido', minutos: dias * 1440 } : { tipo: 'percentual', percentual: dias * 25 }
        predecessors.push({ uid: p, type: tipo, lag })
      }
      const r = sorteio()
      const concluida = r < 0.2
      const iniciada = !concluida && r < 0.23
      const calSorteio = sorteio()
      const sorteioRestricao = sorteio()
      const dataSorteada = addCalendarDays(BASE, Math.floor(sorteio() * 400))
      const restricao: Restricao | undefined =
        sorteioRestricao < 0.04 ? { tipo: 'SNET', data: dataSorteada }
        : sorteioRestricao < 0.07 ? { tipo: 'FNLT', data: `${dataSorteada}T17:00` }
        : sorteioRestricao < 0.09 ? { tipo: 'MSO', data: `${dataSorteada}T08:00` }
        : sorteioRestricao < 0.11 ? { tipo: 'ALAP' }
        : undefined
      const comPrazo = sorteio() < 0.05
      tasks.push({
        uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false,
        duracaoMin: diasParaMinutos(1 + Math.floor(sorteio() * 20)),
        predecessors, percentComplete: concluida ? 100 : iniciada ? 50 : 0, bac: 1000, actualCost: 0, resources: [],
        calendarioUid: calSorteio < 0.15 ? 2 : calSorteio < 0.3 ? 3 : undefined,
        ...(restricao ? { restricao } : {}),
        ...(comPrazo ? { prazoFinal: `${addCalendarDays(BASE, 500)}T17:00` } : {}),
      })
    }
  }
  return tasks
}

const calcular = (tasks: Task[]) =>
  computeSchedule(tasks, compilarCalendarios(BASE, [padrao, sabado4h, noturno], 1), { mode: 'forecast', statusDate: STATUS })

describe('desempenho do motor em minutos (RNF-05.1)', () => {
  const tasks = gerarObra()

  it('a obra sintética tem 3.000 folhas, cerca de 6.000 vínculos e 30% fora do padrão', () => {
    expect(tasks).toHaveLength(3000)
    const vinculos = tasks.reduce((a, t) => a + t.predecessors.length, 0)
    expect(vinculos).toBeGreaterThan(5500)
    expect(vinculos).toBeLessThanOrEqual(6000)
    const fora = tasks.filter((t) => t.calendarioUid !== undefined).length / tasks.length
    expect(fora).toBeGreaterThan(0.25)
    expect(fora).toBeLessThan(0.35)
    // A mistura de recursos do motor está de fato presente (senão a medição não vale para o motor completo)
    const lags = tasks.flatMap((t) => t.predecessors.map((p) => p.lag.tipo))
    for (const tipo of ['util', 'corrido', 'percentual']) expect(lags.filter((l) => l === tipo).length).toBeGreaterThan(300)
    expect(tasks.filter((t) => t.restricao).length).toBeGreaterThan(200)
    expect(tasks.filter((t) => t.prazoFinal).length).toBeGreaterThan(80)
    expect(tasks.filter((t) => t.percentComplete > 0 && t.percentComplete < 100).length).toBeGreaterThan(30)
  })

  it('calcula tudo em menos de 2.000 ms numa execução (teto largo para o CI)', () => {
    const t0 = performance.now()
    const r = calcular(tasks)
    const ms = performance.now() - t0
    expect(r.byUid.size).toBe(3000)
    expect(r.projectFinish > r.projectStart).toBe(true)
    expect(ms).toBeLessThan(2000)
  })

  it.skipIf(!process.env.CRONOAI_PERF)('local (CRONOAI_PERF=1): mediana de 5 execuções abaixo de 500 ms', () => {
    calcular(tasks) // aquecimento
    const tempos: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      calcular(tasks)
      tempos.push(performance.now() - t0)
    }
    tempos.sort((a, b) => a - b)
    console.info(`[CRONOAI_PERF] execuções (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${tempos[2].toFixed(0)} ms`)
    expect(tempos[2]).toBeLessThan(500)
  })
})
