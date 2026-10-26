// Caracterização do ciclo 00007 (tarefa 1, lição 1): números do Edifício Aurora medidos NA BASE (00006, dd58ba9),
// ANTES de qualquer mudança do ciclo. Os valores abaixo saem do código de produção (store e lib), não de aritmética do teste.
// Sem nenhum fechamento e com a LB0, nada disto pode mudar (AC-1): curva, PV por tarefa, previsão por tarefa.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProjectStore } from '@/stores/useProjectStore'
import { plannedFraction } from './evm'

beforeEach(() => {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  setActivePinia(createPinia())
})

// [data, rótulo, PV, EV, AC, tendência]: Curva S do Aurora, ponto a ponto (data de status 2026-10-23)
type Ponto = [string, string, number, number | null, number | null, number | null]
const CURVA_C1: Ponto[] = [
  ['2026-05-31', 'mai/26', 755000, 702727.2727272727, 737309.0909090909, null],
  ['2026-06-30', 'jun/26', 1931333.3333333333, 1764117.6470588236, 1843900, null],
  ['2026-07-31', 'jul/26', 3266250, 2951136.3636363633, 3105127.2727272725, null],
  ['2026-08-31', 'ago/26', 4500000, 4072727.272727273, 4316445.454545455, null],
  ['2026-09-30', 'set/26', 6004333.333333334, 5408856.76392573, 5765547.214854112, null],
  ['2026-10-31', 'out/26 ●', 7259250, 6448200, 6896900, 6448200],
  ['2026-11-30', 'nov/26', 9589492.424242424, null, null, 8414093.705374992],
  ['2026-12-31', 'dez/26', 12332242.424242426, null, null, 10859358.321333122],
  ['2027-01-31', 'jan/27', 14659575.757575758, null, null, 13013526.774989547],
  ['2027-02-28', 'fev/27', 16354084.848484848, null, null, 15059261.525317634],
  ['2027-03-31', 'mar/27', 17883133.333333336, null, null, 16938026.071688384],
  ['2027-04-30', 'abr/27', 18805733.333333332, null, null, 18119010.928961746],
  ['2027-05-31', 'mai/27', 19101000, null, null, 18894311.475409836],
  ['2027-06-30', 'jun/27', 19113000, null, null, 19113000],
]

// uid → [início, término, folga total (d), crítica, vão em minutos úteis, PV na LB0 em R$]: previsão e PV por tarefa na data de status
type Prevista = [number, string, string, number, boolean, number, number]
const PREVISAO_C7: Prevista[] = [
  [201, '2026-05-04', '2026-05-15', 0, false, 4800, 180000],
  [202, '2026-05-18', '2026-06-17', 0, false, 10560, 1150000],
  [203, '2026-06-18', '2026-07-10', 0, false, 8160, 820000],
  [301, '2026-07-13', '2026-09-11', 0, false, 21120, 2350000],
  [302, '2026-09-14', '2026-11-05', 55.27916666666667, false, 17722, 2200000],
  [303, '2026-11-05', '2027-01-05', 55.27916666666667, false, 19200, 61250],
  [103, '2026-09-16', '2026-10-02', 0, false, 6240, 165000],
  [104, '2026-10-05', '2026-11-05', 0, true, 10176, 168000],
  [105, '2026-11-05', '2026-11-30', 0, true, 7680, 165000],
  [106, '2026-11-30', '2027-02-26', 60, false, 28800, 0],
  [401, '2026-11-30', '2027-02-19', 0, true, 26400, 0],
  [402, '2026-12-14', '2027-03-12', 10, false, 28800, 0],
  [501, '2026-12-21', '2027-04-12', 0, true, 36000, 0],
  [502, '2027-01-27', '2027-04-19', 0, true, 26400, 0],
  [601, '2027-01-13', '2027-03-19', 30, false, 21600, 0],
  [602, '2027-03-12', '2027-05-25', 10, false, 24000, 0],
  [701, '2027-03-12', '2027-06-09', 0, true, 28800, 0],
  [702, '2027-01-05', '2027-03-18', 55.27916666666667, false, 24000, 0],
  [801, '2027-06-09', '2027-06-23', 0, true, 4800, 0],
  [802, '2027-06-23', '2027-06-23', 0, true, 0, 0],
]

describe('Aurora na base 00006 (caracterização, ciclo 00007)', () => {
  it('C-1: Curva S do Aurora, ponto a ponto (mai/26 a jun/27)', () => {
    const s = useProjectStore()
    expect(s.sCurve).toHaveLength(CURVA_C1.length)
    s.sCurve.forEach((p, i) => {
      const [data, rotulo, pv, ev, ac, tendencia] = CURVA_C1[i]
      expect(p.date).toBe(data)
      expect(p.label).toBe(rotulo)
      expect(p.pv).toBeCloseTo(pv, 2)
      if (ev === null) expect(p.ev).toBeNull()
      else expect(p.ev).toBeCloseTo(ev, 2)
      if (ac === null) expect(p.ac).toBeNull()
      else expect(p.ac).toBeCloseTo(ac, 2)
      if (tendencia === null) expect(p.forecast).toBeNull()
      else expect(p.forecast).toBeCloseTo(tendencia, 2)
    })
    // O ponto da data de status é o de referência do plano (conferido à mão): PV 7.259.250,00, EV 6.448.200,00, AC 6.896.900,00
    const out = s.sCurve.find((p) => p.label === 'out/26 ●')!
    expect([out.pv, out.ev, out.ac]).toEqual([7259250, 6448200, 6896900])
  })

  it('totais do Aurora: BAC, PV, EV, AC, SPI, CPI, EAC, atraso e entrega (conferidos à mão no plano)', () => {
    const s = useProjectStore()
    expect([s.evm.bac, s.evm.pv, s.evm.ev, s.evm.ac]).toEqual([19113000, 7259250, 6448200, 6896900])
    expect(s.evm.spi).toBeCloseTo(0.888274, 6)
    expect(s.evm.cpi).toBeCloseTo(0.934942, 6)
    expect(s.evm.eac).toBeCloseTo(20442984.04, 2)
    expect(s.delay.delayDays).toBe(16)
    expect(s.schedule.projectFinish).toBe('2027-06-23')
  })

  it('C-7: previsão por tarefa na data de status e PV por tarefa na LB0 (a soma dos PVs é o PV da obra)', () => {
    const s = useProjectStore()
    const folhas = s.leaves
    expect(folhas.map((t) => t.uid).sort((a, b) => a - b)).toEqual(PREVISAO_C7.map((p) => p[0]).sort((a, b) => a - b))
    for (const [uid, inicio, termino, folga, critica, vao, pvTarefa] of PREVISAO_C7) {
      const t = s.taskByUid.get(uid)!
      const prev = s.schedule.byUid.get(uid)!
      expect([uid, prev.start, prev.finish, prev.critical, prev.duracaoMin]).toEqual([uid, inicio, termino, critica, vao])
      expect(prev.totalFloat).toBeCloseTo(folga, 6)
      expect(t.bac * plannedFraction(t, s.calendariosPv, s.state.meta.statusDate)).toBeCloseTo(pvTarefa, 2)
    }
    // Contribuição do 104 na LB0 (usada pelo LB-4, variante): R$ 168.000,00 (a LB0 do 104 termina antes da data de status)
    expect(PREVISAO_C7.find((p) => p[0] === 104)![6]).toBe(168000)
  })

  it('C-2 e C-3: saveBaseline() seguido de evm.pv = PV da LB1 pelo cronograma previsto (SPI 0,992606) e atraso 0', () => {
    const s = useProjectStore()
    s.saveBaseline()
    // Antes → depois: PV 7.259.250,00 → 6.496.233,42 (o previsto do 302 e do 104 termina em 05/11, e a LB nasce com o vão da interrupção)
    expect(s.evm.pv).toBeCloseTo(6496233.415233416, 2)
    expect(s.evm.spi).toBeCloseTo(0.992606, 6)
    expect(s.evm.ev).toBe(6448200)
    expect(s.delay.delayDays).toBe(0) // C-3: término previsto = término da LB
    const lb = (uid: number) => s.taskByUid.get(uid)!
    expect([lb(302).baselineStart, lb(302).baselineFinish, lb(302).baselineDuracaoMin]).toEqual(['2026-09-14', '2026-11-05', 17722])
    expect([lb(104).baselineStart, lb(104).baselineFinish, lb(104).baselineDuracaoMin]).toEqual(['2026-10-05', '2026-11-05', 10176])
  })
})
