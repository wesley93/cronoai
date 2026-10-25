import { describe, expect, it } from 'vitest'
import type { CalendarioObra, ConfigFeriadosObra, Task } from '@/types/domain'
import { calendarioDeDias, calendarioPadrao, compilarCalendarios, diasParaMinutos } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { configFeriadosPadrao, criarFeriadosPorAno } from './feriadosObra'
import { compararCronogramas } from './previaImpacto'

const tarefa = (uid: number, dias: number, predecessora?: number): Task => ({
  uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false, duracaoMin: diasParaMinutos(dias),
  predecessors: predecessora ? [{ uid: predecessora, type: 'FS', lag: { tipo: 'util', minutos: 0 } }] : [],
  percentComplete: 0, bac: 0, actualCost: 0, resources: [],
})

const calendarios: CalendarioObra[] = [{ ...calendarioPadrao([]), aplicaFeriadosObra: true }]
const agendar = (tasks: Task[], base: string, feriados: ConfigFeriadosObra) => {
  const cals = compilarCalendarios(base, calendarios, 1, { feriadosPorAno: criarFeriadosPorAno(feriados) })
  return { s: computeSchedule(tasks, cals, { mode: 'baseline' }), cal: calendarioDeDias(cals.padrao) }
}

describe('previaImpacto: compararCronogramas (CF-8 na função)', () => {
  const comEstadual: ConfigFeriadosObra = {
    ...configFeriadosPadrao(),
    manuais: [{ id: 'f1', data: '2026-07-09', nome: 'Estadual fictício', abrangencia: 'estadual', fonte: 'Lei estadual fictícia de teste', recorrenteAnual: true, uf: 'PE' }],
  }
  const tasks = [tarefa(1, 5), tarefa(2, 2, 1), tarefa(3, 3)]

  it('remover o feriado estadual de 09/07: a T1 (5 d desde 06/07) passa de 13/07 para 10/07, a T2 acompanha e a T3 não muda', () => {
    const antes = agendar(tasks, '2026-07-06', comEstadual).s
    const depois = agendar(tasks, '2026-07-06', configFeriadosPadrao())
    const r = compararCronogramas(antes, depois.s, depois.cal)
    expect(antes.byUid.get(1)!.finish).toBe('2026-07-13')
    expect(r.entregaAntes).toBe('2026-07-15') // a T2 termina 15/07 com o feriado
    expect(r.entregaDepois).toBe('2026-07-14') // e 14/07 sem ele... (T1 até 10/07; T2 13 e 14/07)
    expect(r.deltaDiasUteis).toBe(-1)
    expect(r.tarefas).toEqual([
      { uid: 1, inicioAntes: '2026-07-06', inicioDepois: '2026-07-06', terminoAntes: '2026-07-13', terminoDepois: '2026-07-10' },
      { uid: 2, inicioAntes: '2026-07-14', inicioDepois: '2026-07-13', terminoAntes: '2026-07-15', terminoDepois: '2026-07-14' },
    ])
  })

  it('cronogramas iguais: sem tarefas alteradas e diferença zero', () => {
    const a = agendar(tasks, '2026-07-06', configFeriadosPadrao())
    const r = compararCronogramas(a.s, a.s, a.cal)
    expect(r).toEqual({ entregaAntes: a.s.projectFinish, entregaDepois: a.s.projectFinish, deltaDiasUteis: 0, tarefas: [] })
  })

  it('hipótese que atrasa a entrega dá diferença positiva', () => {
    const sem = agendar(tasks, '2026-07-06', configFeriadosPadrao())
    const com = agendar(tasks, '2026-07-06', comEstadual)
    const r = compararCronogramas(sem.s, com.s, com.cal)
    expect(r.deltaDiasUteis).toBe(1)
    expect(r.tarefas.map((t) => t.uid)).toEqual([1, 2])
  })
})
