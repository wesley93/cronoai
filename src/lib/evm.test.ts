import { describe, expect, it } from 'vitest'
import type { CalendarioObra, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import type { CabecalhoFechamento, DetalheFechamento } from '@/types/fechamento'
import { brazilianHolidays } from './calendar'
import { calendarioPadrao, comDiasExtras, compilarCalendarios } from './calendarioTrabalho'
import { computeEvm, computeSCurve, monthlyIncrements, plannedFraction, pontosMensais } from './evm'
import { projetarLinhaBase } from './linhasBase'

// CR-2d: o PV usa os minutos úteis do calendário da TAREFA (PMBOK: PV = BAC × fração planejada).
const padrao = calendarioPadrao(brazilianHolidays(2026))
const sabado4h: CalendarioObra = { ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
const cals = compilarCalendarios('2026-08-03', [padrao, sabado4h], 1)

// 12 dias (5.760 min) no sábado de 4 h: de seg 03/08 a seg 17/08, BAC R$ 12.000,00
const tarefa: Task = {
  uid: 1, wbs: '1', name: 'Fundação', outlineLevel: 1, isSummary: false, duracaoMin: 5760, calendarioUid: 2, predecessors: [],
  percentComplete: 0, bac: 12000, actualCost: 0, resources: [], baselineStart: '2026-08-03', baselineFinish: '2026-08-17', baselineDuracaoMin: 5760,
}

describe('PV no calendário da tarefa (CR-2d)', () => {
  it('status em sex 07/08: 2.400 de 5.760 min = R$ 5.000,00', () => {
    expect(plannedFraction(tarefa, cals, '2026-08-07')).toBeCloseTo(2400 / 5760, 10)
    expect(computeEvm([tarefa], cals, '2026-08-07').pv).toBeCloseTo(5000, 2)
  })

  it('status em sáb 08/08 (útil de 4 h para a tarefa): 2.640 de 5.760 min = R$ 5.500,00', () => {
    expect(computeEvm([tarefa], cals, '2026-08-08').pv).toBeCloseTo(5500, 2)
  })

  it('o mesmo intervalo no calendário padrão tem outra conta: 10 dias úteis (4.800 min), PV de 5/10 na sexta', () => {
    const noPadrao = { ...tarefa, calendarioUid: undefined, baselineFinish: '2026-08-14' }
    expect(plannedFraction(noPadrao, cals, '2026-08-07')).toBeCloseTo(0.5, 10)
    expect(computeEvm([noPadrao], cals, '2026-08-07').pv).toBeCloseTo(6000, 2)
  })

  it('antes do início o PV é zero; depois do término, o BAC inteiro; sem linha de base completa, zero', () => {
    expect(computeEvm([tarefa], cals, '2026-07-31').pv).toBe(0)
    expect(computeEvm([tarefa], cals, '2026-08-17').pv).toBeCloseTo(12000, 2)
    expect(computeEvm([tarefa], cals, '2026-09-30').pv).toBeCloseTo(12000, 2)
    expect(plannedFraction({ ...tarefa, baselineFinish: undefined }, cals, '2026-08-07')).toBe(0)
  })

  it('o PV ignora as exceções úteis (sábado de hora extra) e conta os feriados', () => {
    const comExtra = comDiasExtras(padrao, ['2026-08-08'])
    const semExtra = compilarCalendarios('2026-08-03', [comExtra], 1, { semExcecoesUteis: true })
    const noPadrao = { ...tarefa, calendarioUid: undefined, baselineFinish: '2026-08-14' }
    // Com o sábado extra contando seriam 5.280 min no total e 2.880 até 08/08; sem ele, são 4.800 e 2.400
    expect(plannedFraction(noPadrao, semExtra, '2026-08-08')).toBeCloseTo(0.5, 10)
    expect(plannedFraction(noPadrao, compilarCalendarios('2026-08-03', [comExtra], 1), '2026-08-08')).toBeCloseTo(2880 / 5280, 10)
  })

  it('EV e AC não dependem do calendário; SPI = EV ÷ PV', () => {
    const avancada = { ...tarefa, percentComplete: 25, actualCost: 3500 }
    const e = computeEvm([avancada], cals, '2026-08-07')
    expect(e.ev).toBeCloseTo(3000, 2)
    expect(e.ac).toBeCloseTo(3500, 2)
    expect(e.spi).toBeCloseTo(0.6, 4)
    expect(e.cpi).toBeCloseTo(0.8571, 4)
  })
})

describe('computeEvm com a LB do valor agregado projetada (ciclo 00007, G5 = b e G6 = a)', () => {
  // Calendário padrão seg–sex, sem feriados. LB0: 03/08 a 14/08 (10 d.u.), BAC 1.000; LB2: 10/08 a 21/08 (10 d.u.), custo congelado de 800
  const cal = compilarCalendarios('2026-08-03', [calendarioPadrao([])], 1)
  const t: Task = {
    uid: 1, wbs: '1', name: 'Alvenaria', outlineLevel: 1, isSummary: false, duracaoMin: 4800, predecessors: [], percentComplete: 50, bac: 1000, actualCost: 600, resources: [],
    baselineStart: '2026-08-03', baselineFinish: '2026-08-14', baselineDuracaoMin: 4800,
    linhasBase: { '2': { inicio: '2026-08-10', termino: '2026-08-21', duracaoMin: 4800, custo: 800 } },
  }

  it('status em 07/08: LB0 PV 500,00 e EV 500,00; LB2 PV 0,00 (a LB2 começa em 10/08) e EV 400,00 (50% do custo congelado)', () => {
    const lb0 = computeEvm(projetarLinhaBase([t], 0), cal, '2026-08-07')
    expect([lb0.bac, lb0.pv, lb0.ev, lb0.ac]).toEqual([1000, 500, 500, 600])
    const lb2 = computeEvm(projetarLinhaBase([t], 2), cal, '2026-08-07')
    expect([lb2.bac, lb2.pv, lb2.ev, lb2.ac]).toEqual([800, 0, 400, 600])
    expect(lb2.cpi).toBeCloseTo(0.666667, 6)
  })

  it('status em 14/08: LB0 PV 1.000,00; LB2 PV 400,00 (5 de 10 d.u. de R$ 800,00)', () => {
    expect(computeEvm(projetarLinhaBase([t], 0), cal, '2026-08-14').pv).toBe(1000)
    expect(computeEvm(projetarLinhaBase([t], 2), cal, '2026-08-14').pv).toBe(400)
  })
})

describe('Curva S de fechamentos (ciclo 00007, E4: D-25 a D-30)', () => {
  // Calendário seg–sex 08–12 e 13–17 SEM feriados. Uma tarefa A de BAC 100.000 (20 d.u.: 05 a 30/01/2026) e o previsto indo até 06/02
  const sem = compilarCalendarios('2026-01-05', [calendarioPadrao([])], 1)
  const rotulo = (iso: string) => ['jan/26', 'fev/26', 'mar/26'][Number(iso.slice(5, 7)) - 1]
  const previsto = (fim: string) => ({ byUid: new Map([[1, { uid: 1, start: '2026-01-05', finish: fim } as ScheduledTask]]), projectFinish: fim } as ScheduleResult)
  const tarefaA = (extra: Partial<Task> = {}): Task => ({
    uid: 1, wbs: '01.01', name: 'A', outlineLevel: 2, isSummary: false, duracaoMin: 9600, predecessors: [], percentComplete: 60, bac: 100000, actualCost: 66000, resources: [],
    actualStart: '2026-01-05', baselineStart: '2026-01-05', baselineFinish: '2026-01-30', baselineDuracaoMin: 9600, ...extra,
  })
  const cab = (id: string, dataStatus: string, ev: number, ac: number, extra: Partial<CabecalhoFechamento> = {}): CabecalhoFechamento => ({
    versaoFormato: 1, id, obraId: 'o1', sequencia: 1, tipo: 'fechamento', dataStatus, fechadoEm: '2026-02-01T12:00:00.000Z', linhaBase: 0, versaoPremissas: 1, esquemaObra: 6,
    totais: { bac: 100000, pv: 0, ev, ac, spi: null, cpi: null, eac: null, entregaPrevista: '2026-02-06', atrasoDiasUteis: 0 }, porPacote: [], quantidadeTarefas: 1, ...extra,
  })
  const resumo = (pts: ReturnType<typeof computeSCurve>) => pts.map((p) => [p.label, p.tipo, p.origem, p.pv, p.ev, p.ac])

  it('CS-1: 3 fechamentos: os pontos de fechamento mostram EXATAMENTE o EV e o AC gravados; fevereiro só tem o PV', () => {
    const f1 = cab('f1', '2026-01-09', 20000, 22000)
    const f2 = cab('f2', '2026-01-16', 45000, 47000)
    const f3 = cab('f3', '2026-01-23', 60000, 66000)
    const pontos = computeSCurve([tarefaA()], sem, '2026-01-23', previsto('2026-02-06'), rotulo, { fechamentos: [f1, f2, f3] })
    expect(resumo(pontos)).toEqual([
      ['09/01 ◆', 'fechamento', 'fechamento', 25000, 20000, 22000],
      ['16/01 ◆', 'fechamento', 'fechamento', 50000, 45000, 47000],
      ['jan/26 ●', 'mes', 'fechamento', 75000, 60000, 66000], // o fechamento F3 é a data de status: vira o ponto do mês
      ['fev/26', 'mes', null, 100000, null, null],
    ])
    expect(pontos.map((p) => [p.date, p.fechamentoId])).toEqual([['2026-01-09', 'f1'], ['2026-01-16', 'f2'], ['2026-01-31', 'f3'], ['2026-02-28', undefined]])
    expect(pontos.map((p) => p.linhaBaseFechamento)).toEqual([0, 0, 0, undefined])
  })

  it('CS-2: a interpolação em dias úteis do calendário padrão: R$ 65.000,00 e R$ 69.000,00 em 31/01 (dias corridos dariam R$ 67.142,86 e R$ 71.428,57); exatamente 3 pontos', () => {
    const t = tarefaA({ bac: 200000, baselineFinish: '2026-02-27', baselineDuracaoMin: 19200, percentComplete: 40, actualCost: 86000 })
    const f1 = cab('f1', '2026-01-23', 50000, 52000)
    const f2 = cab('f2', '2026-02-06', 80000, 86000)
    const pontos = computeSCurve([t], sem, '2026-02-06', previsto('2026-02-27'), rotulo, { fechamentos: [f1, f2] })
    expect(resumo(pontos)).toEqual([
      ['23/01 ◆', 'fechamento', 'fechamento', 75000, 50000, 52000],
      ['jan/26', 'mes', 'interpolado', 100000, 65000, 69000], // 5 de 10 dias úteis entre os dois fechamentos
      ['fev/26 ●', 'mes', 'fechamento', 125000, 80000, 86000], // a curva termina aqui (comportamento da base, E-11): os 200.000 da LB não aparecem
    ])
  })

  it('depois do último fechamento até a data de status a curva interpola até o estado vivo (origem "atual"); no mês da data de status o ponto é o vivo', () => {
    const t = tarefaA({ bac: 200000, baselineFinish: '2026-02-27', baselineDuracaoMin: 19200, percentComplete: 40, actualCost: 86000 })
    const pontos = computeSCurve([t], sem, '2026-02-06', previsto('2026-02-27'), rotulo, { fechamentos: [cab('f1', '2026-01-23', 50000, 52000)] })
    expect(resumo(pontos)).toEqual([
      ['23/01 ◆', 'fechamento', 'fechamento', 75000, 50000, 52000],
      ['jan/26', 'mes', 'interpolado', 100000, 65000, 69000],
      ['fev/26 ●', 'mes', 'atual', 125000, 80000, 86000], // EV e AC de agora (40% de R$ 200.000 e custo real de R$ 86.000)
    ])
  })

  it('CS-4: sem fechamentos a curva é a reconstrução de hoje, com origem "reconstruido" (e igual com `historico` vazio)', () => {
    const t = tarefaA()
    const sem1 = computeSCurve([t], sem, '2026-01-23', previsto('2026-02-06'), rotulo)
    const sem2 = computeSCurve([t], sem, '2026-01-23', previsto('2026-02-06'), rotulo, { fechamentos: [] })
    expect(sem2).toEqual(sem1)
    expect(sem1.map((p) => [p.label, p.tipo, p.origem])).toEqual([['jan/26 ●', 'mes', 'reconstruido'], ['fev/26', 'mes', null]])
    expect([sem1[0].pv, sem1[0].ev, sem1[0].ac]).toEqual([75000, 60000, 66000])
  })

  it('antes do 1º fechamento: reconstrução ancorada nos dados do detalhe dele (a mudança posterior do avanço não mexe no passado)', () => {
    // Obra que começou em dezembro: o fim de dezembro é anterior ao 1º fechamento (23/01) e é reconstruído
    const antiga = tarefaA({ baselineStart: '2025-12-01', actualStart: '2025-12-01', baselineFinish: '2026-01-30', baselineDuracaoMin: 24000 })
    const calAntigo = compilarCalendarios('2025-12-01', [calendarioPadrao([])], 1)
    // O fechamento guardou a tarefa com 60% e R$ 66.000; hoje ela está com 90% e R$ 99.000
    const detalhe: DetalheFechamento = { versaoFormato: 1, id: 'f1', tarefas: [[1, '01.01', 60, 66000, 100000, 75000, '2025-12-01', null, '2025-12-01', '2026-02-06', 0, 1]] }
    const f1 = cab('f1', '2026-01-23', 60000, 66000)
    const hoje = { ...antiga, percentComplete: 90, actualCost: 99000 }
    const comAncora = computeSCurve([hoje], calAntigo, '2026-01-30', previsto('2026-02-06'), rotulo, { fechamentos: [f1], ancora: detalhe })
    const semAncora = computeSCurve([hoje], calAntigo, '2026-01-30', previsto('2026-02-06'), rotulo, { fechamentos: [f1] })
    const dezembro = (pts: ReturnType<typeof computeSCurve>) => pts.find((p) => p.date === '2025-12-31')!
    expect(dezembro(comAncora).origem).toBe('reconstruido')
    // Dezembro tem 23 dias úteis. Com a âncora: janela de 01/12 a 23/01 (40 d.u.), parte feita 23/40 de 60% de R$ 100.000 e de R$ 66.000 do fechamento.
    // Sem a âncora (estado de hoje): janela até 30/01 (45 d.u.), 23/45 de 90% e de R$ 99.000
    expect([dezembro(comAncora).ev, dezembro(comAncora).ac]).toEqual([34500, 37950])
    expect(dezembro(semAncora).ev).toBeCloseTo(46000, 6)
    expect(dezembro(semAncora).ac).toBeCloseTo(50600, 6)
    // E o ponto do próprio fechamento mostra o gravado
    expect(comAncora.find((p) => p.fechamentoId === 'f1')).toMatchObject({ ev: 60000, ac: 66000, origem: 'fechamento' })
  })

  it('curva do pacote (D-30): EV e AC vêm do porPacote dos fechamentos; fechamento sem o pacote fica fora da curva do pacote', () => {
    const pacote = (wbs: string, ev: number, ac: number) => ({ wbs, nome: `Pacote ${wbs}`, bac: 100000, pv: 0, ev, ac })
    const f1 = cab('f1', '2026-01-09', 30000, 33000, { porPacote: [pacote('01', 10000, 11000), pacote('02', 20000, 22000)] })
    const f2 = cab('f2', '2026-01-16', 45000, 47000, { porPacote: [pacote('01', 45000, 47000)] }) // sem o pacote 02
    const f3 = cab('f3', '2026-01-23', 60000, 66000, { porPacote: [pacote('01', 20000, 22000), pacote('02', 40000, 44000)] })
    const t02 = tarefaA({ wbs: '02.01' })
    const pontos = computeSCurve([t02], sem, '2026-01-23', previsto('2026-02-06'), rotulo, { fechamentos: [f1, f2, f3], wbs: '02' })
    expect(resumo(pontos)).toEqual([
      ['09/01 ◆', 'fechamento', 'fechamento', 25000, 20000, 22000],
      ['jan/26 ●', 'mes', 'fechamento', 75000, 40000, 44000],
      ['fev/26', 'mes', null, 100000, null, null],
    ])
  })

  it('o PV é sempre o da linha de base das tarefas recebidas (LB do valor agregado), mesmo nos pontos de fechamento', () => {
    const lb1 = tarefaA({ baselineStart: '2026-01-12', baselineFinish: '2026-02-06', baselineDuracaoMin: 9600 })
    const pontos = computeSCurve([lb1], sem, '2026-01-23', previsto('2026-02-06'), rotulo, { fechamentos: [cab('f1', '2026-01-16', 45000, 47000, { linhaBase: 0 })] })
    expect(pontos.find((p) => p.fechamentoId === 'f1')!.pv).toBe(25000) // 5 de 20 d.u. da LB de 12/01 a 06/02 (não os 50.000 da LB0)
    expect(pontos.find((p) => p.fechamentoId === 'f1')!.ev).toBe(45000)
  })

  it('monthlyIncrements só opera sobre os pontos de fim de mês (os de fechamento ficam de fora)', () => {
    const f1 = cab('f1', '2026-01-09', 20000, 22000)
    const pontos = computeSCurve([tarefaA()], sem, '2026-01-23', previsto('2026-02-06'), rotulo, { fechamentos: [f1] })
    const mensal = monthlyIncrements(pontos)
    expect(mensal.map((p) => p.label)).toEqual(['jan/26 ●', 'fev/26'])
    expect(pontosMensais(pontos).map((p) => p.tipo)).toEqual(['mes', 'mes'])
  })
})
