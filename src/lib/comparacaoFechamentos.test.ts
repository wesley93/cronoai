// Comparação entre dois fechamentos (ciclo 00007, E4, RF-04.6, D-33): DF-1 com a tarefa D explícita (E-10).
import { describe, expect, it } from 'vitest'
import type { CabecalhoFechamento, DetalheFechamento, TarefaFechamento } from '@/types/fechamento'
import { calendarioDeDias, calendarioPadrao, compilarCalendarios } from './calendarioTrabalho'
import { compararFechamentos, type FechamentoComDetalhe } from './comparacaoFechamentos'

const cal = calendarioDeDias(compilarCalendarios('2026-10-01', [calendarioPadrao([])], 1).padrao)

// uid, wbs, %, custo real, BAC, término previsto
type Linha = [number, string, number, number, number, string]
const tupla = ([uid, wbs, pct, custo, bac, termino]: Linha): TarefaFechamento => [uid, wbs, pct, custo, bac, 0, null, null, '2026-10-05', termino, 0, 0]

function fechamento(id: string, sequencia: number, dataStatus: string, linhas: Linha[], extra: { entrega?: string; atraso?: number } = {}): FechamentoComDetalhe {
  const tarefas = linhas.map(tupla)
  const bac = linhas.reduce((a, l) => a + l[4], 0)
  const ev = linhas.reduce((a, l) => a + (l[4] * l[2]) / 100, 0)
  const ac = linhas.reduce((a, l) => a + l[3], 0)
  const cabecalho: CabecalhoFechamento = {
    versaoFormato: 1, id, obraId: 'o1', sequencia, tipo: 'fechamento', dataStatus, fechadoEm: '2026-11-01T12:00:00.000Z', linhaBase: 0, versaoPremissas: 1, esquemaObra: 6,
    totais: { bac, pv: 0, ev, ac, spi: null, cpi: null, eac: null, entregaPrevista: extra.entrega ?? '2026-12-01', atrasoDiasUteis: extra.atraso ?? 0 }, porPacote: [], quantidadeTarefas: tarefas.length,
  }
  const detalhe: DetalheFechamento = { versaoFormato: 1, id, tarefas }
  return { cabecalho, detalhe }
}

describe('compararFechamentos (DF-1, D-33)', () => {
  // Fa 23/10: A 20% (custo 10.000, BAC 50.000), B 0% (BAC 80.000), C 100% (30.000), E 0% (BAC 10.000)
  const fa = fechamento('fa', 1, '2026-10-23', [[1, '01.01', 20, 10000, 50000, '2026-11-05'], [2, '01.02', 0, 0, 80000, '2026-11-05'], [3, '01.03', 100, 30000, 30000, '2026-10-20'], [5, '01.05', 0, 0, 10000, '2026-12-01']], { entrega: '2026-12-01', atraso: 2 })
  // Fb 30/10: A 50% (custo 25.000), B com término 10/11, C igual, D nova (0%, custo 0, BAC 20.000, término 20/11), E ausente
  const fb = fechamento('fb', 2, '2026-10-30', [[1, '01.01', 50, 25000, 50000, '2026-11-05'], [2, '01.02', 0, 0, 80000, '2026-11-10'], [3, '01.03', 100, 30000, 30000, '2026-10-20'], [4, '01.04', 0, 0, 20000, '2026-11-20']], { entrega: '2026-12-03', atraso: 4 })

  it('categorias: avançaram A (+30 p.p.; ΔEV +15.000), atrasou B (+3 d.u.), custo A (ΔAC +15.000), nova D, removida E, inalterada C', () => {
    const r = compararFechamentos(fa, fb, cal)
    expect(r.avancaram.map((i) => [i.uid, i.deltaPct, i.deltaEv])).toEqual([[1, 30, 15000]])
    expect(r.atrasaram.map((i) => [i.uid, i.deltaTerminoDu])).toEqual([[2, 3]]) // 05 → 10/11/2026: 3 dias úteis (mesma regra do workingVariance)
    expect(r.adiantaram).toEqual([])
    expect(r.mudaramDeCusto.map((i) => [i.uid, i.deltaAc, i.deltaBac])).toEqual([[1, 15000, 0]])
    expect(r.novas.map((i) => [i.uid, i.wbs, i.pctB])).toEqual([[4, '01.04', 0]])
    expect(r.removidas.map((i) => [i.uid, i.wbs, i.pctA])).toEqual([[5, '01.05', 0]])
    expect(r.inalteradas.map((i) => i.uid)).toEqual([3])
  })

  it('totais: EV 40.000 → 55.000, AC 40.000 → 55.000 e BAC 170.000 → 180.000 (E-10); entrega e atraso', () => {
    const r = compararFechamentos(fa, fb, cal)
    expect(r.totais.ev).toEqual({ a: 40000, b: 55000, delta: 15000 })
    expect(r.totais.ac).toEqual({ a: 40000, b: 55000, delta: 15000 })
    expect(r.totais.bac).toEqual({ a: 170000, b: 180000, delta: 10000 })
    expect(r.deltaEntregaDu).toBe(2) // 01 → 03/12/2026
    expect(r.deltaAtrasoDu).toBe(2)
  })

  it('as categorias podem se sobrepor; adiantar é Δ negativo do término; mudança de BAC e custo abaixo de meio centavo', () => {
    const a = fechamento('a', 1, '2026-10-23', [[1, '01.01', 10, 1000, 5000, '2026-11-10'], [2, '01.02', 10, 1000, 5000, '2026-11-10'], [3, '01.03', 10, 1000, 5000, '2026-11-10']])
    const b = fechamento('b', 2, '2026-10-30', [[1, '01.01', 30, 1000.004, 5000, '2026-11-05'], [2, '01.02', 10, 1000, 5000.5, '2026-11-10'], [3, '01.03', 10, 1000, 5000, '2026-11-10']])
    const r = compararFechamentos(a, b, cal)
    expect(r.avancaram.map((i) => i.uid)).toEqual([1])
    expect(r.adiantaram.map((i) => [i.uid, i.deltaTerminoDu])).toEqual([[1, -3]]) // 10 → 05/11: 3 dias úteis a menos
    expect(r.mudaramDeCusto.map((i) => i.uid)).toEqual([2]) // a tarefa 1 teve ΔAC de 0,004 (ruído de ponto flutuante: abaixo de meio centavo); a 2 mudou de BAC
    expect(r.inalteradas.map((i) => i.uid)).toEqual([3])
  })

  it('a ordem das listas é a da EAP (01.10 depois de 01.9)', () => {
    const a = fechamento('a', 1, '2026-10-23', [[1, '01.10', 0, 0, 10, '2026-11-05'], [2, '01.9', 0, 0, 10, '2026-11-05']])
    const b = fechamento('b', 2, '2026-10-30', [[1, '01.10', 50, 0, 10, '2026-11-05'], [2, '01.9', 50, 0, 10, '2026-11-05']])
    expect(compararFechamentos(a, b, cal).avancaram.map((i) => i.wbs)).toEqual(['01.9', '01.10'])
  })
})
