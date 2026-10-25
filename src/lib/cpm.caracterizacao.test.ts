// Caracterização do ciclo 00004 (CR-1): as 20 folhas do Edifício Aurora, medidas no motor em dias úteis ANTES da
// refatoração para minutos. O E1 não mudou nenhuma célula (só o adaptador `agendar` acompanha a API do motor).
// No E2 a previsão muda de propósito, só pelo restante exato de tarefa iniciada (CR-9): antes → depois abaixo.
// A linha de base, o EVM e os cenários continuam iguais.
import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'

type Modo = 'baseline' | 'forecast'

function agendar(modo: Modo) {
  const seed = buildSeedState()
  const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
  return computeSchedule(seed.tasks, cals, { mode: modo, statusDate: seed.meta.statusDate })
}

// uid, linha de base [início, término, FT (d), FL (d), crítica]: o E2 não muda nenhuma célula da linha de base.
type LinhaBase = [number, string, string, number, number, boolean]
const LINHA_DE_BASE: LinhaBase[] = [
  [201, '2026-05-04', '2026-05-15', 0, 0, true],
  [202, '2026-05-18', '2026-06-15', 0, 0, true],
  [203, '2026-06-16', '2026-07-06', 0, 0, true],
  [301, '2026-07-07', '2026-08-31', 0, 0, true],
  [302, '2026-09-01', '2026-10-22', 49, 0, false],
  [303, '2026-10-23', '2026-12-21', 49, 0, false],
  [103, '2026-09-09', '2026-09-24', 0, 0, true],
  [104, '2026-09-25', '2026-10-13', 0, 0, true],
  [105, '2026-10-14', '2026-11-05', 0, 0, true],
  [106, '2026-11-06', '2027-02-02', 60, 11, false],
  [401, '2026-11-06', '2027-01-26', 0, 0, true],
  [402, '2026-11-23', '2027-02-18', 10, 0, false],
  [501, '2026-11-30', '2027-03-18', 0, 0, true],
  [502, '2027-01-06', '2027-03-25', 0, 0, true],
  [601, '2026-12-21', '2027-02-25', 30, 20, false],
  [602, '2027-02-19', '2027-05-03', 10, 10, false],
  [701, '2027-02-19', '2027-05-17', 0, 0, true],
  [702, '2026-12-22', '2027-03-05', 49, 49, false],
  [801, '2027-05-18', '2027-06-01', 0, 0, true],
  [802, '2027-06-01', '2027-06-01', 0, 0, true],
]

// Previsão ANTES do E2 (restante de tarefa iniciada em dias inteiros, teto de dur × (1 − %)): o que o E1 deixou.
// uid → [início, término, FT (d), FL (d), crítica]
const PREVISAO_ANTES: Record<number, [string, string, number, number, boolean]> = {
  201: ['2026-05-04', '2026-05-15', 0, 0, false],
  202: ['2026-05-18', '2026-06-17', 0, 0, false],
  203: ['2026-06-18', '2026-07-10', 0, 0, false],
  301: ['2026-07-13', '2026-09-11', 0, 0, false],
  302: ['2026-09-14', '2026-11-05', 56, 0, false],
  303: ['2026-11-06', '2027-01-05', 56, 0, false],
  103: ['2026-09-16', '2026-10-02', 0, 0, false],
  104: ['2026-10-05', '2026-11-05', 0, 0, true],
  105: ['2026-11-06', '2026-11-30', 0, 0, true],
  106: ['2026-12-01', '2027-02-26', 60, 4, false],
  401: ['2026-12-01', '2027-02-19', 0, 0, true],
  402: ['2026-12-15', '2027-03-12', 10, 0, false],
  501: ['2026-12-22', '2027-04-12', 0, 0, true],
  502: ['2027-01-28', '2027-04-19', 0, 0, true],
  601: ['2027-01-14', '2027-03-19', 30, 20, false],
  602: ['2027-03-15', '2027-05-25', 10, 10, false],
  701: ['2027-03-15', '2027-06-09', 0, 0, true],
  702: ['2027-01-06', '2027-03-18', 56, 56, false],
  801: ['2027-06-10', '2027-06-23', 0, 0, true],
  802: ['2027-06-23', '2027-06-23', 0, 0, true],
}

// Previsão DEPOIS do E2 (restante exato, CR-9): uid → [início, hora, término, hora, FT (min), FL (min), crítica]
// 104: restante 40% de 5.760 = 3.456 min (7,2 d), antes 8 d; 302: 78% de 17.280 = 3.801,6, arredondado para 3.802 min (7,92 d), antes 8 d.
const PREVISAO_DEPOIS: Record<number, [string, string, string, string, number, number, boolean]> = {
  201: ['2026-05-04', '08:00', '2026-05-15', '17:00', 0, 0, false],
  202: ['2026-05-18', '08:00', '2026-06-17', '17:00', 0, 0, false],
  203: ['2026-06-18', '08:00', '2026-07-10', '17:00', 0, 0, false],
  301: ['2026-07-13', '08:00', '2026-09-11', '17:00', 0, 0, false],
  302: ['2026-09-14', '08:00', '2026-11-05', '16:22', 26534, 0, false],
  303: ['2026-11-05', '16:22', '2027-01-05', '16:22', 26534, 0, false],
  103: ['2026-09-16', '08:00', '2026-10-02', '17:00', 0, 0, false],
  104: ['2026-10-05', '08:00', '2026-11-05', '09:36', 0, 0, true],
  105: ['2026-11-05', '09:36', '2026-11-30', '09:36', 0, 0, true],
  106: ['2026-11-30', '09:36', '2027-02-26', '09:36', 28800, 2266, false],
  401: ['2026-11-30', '09:36', '2027-02-19', '09:36', 0, 0, true],
  402: ['2026-12-14', '09:36', '2027-03-12', '09:36', 4800, 0, false],
  501: ['2026-12-21', '09:36', '2027-04-12', '09:36', 0, 0, true],
  502: ['2027-01-27', '09:36', '2027-04-19', '09:36', 0, 0, true],
  601: ['2027-01-13', '09:36', '2027-03-19', '09:36', 14400, 9600, false],
  602: ['2027-03-12', '09:36', '2027-05-25', '09:36', 4800, 4800, false],
  701: ['2027-03-12', '09:36', '2027-06-09', '09:36', 0, 0, true],
  702: ['2027-01-05', '16:22', '2027-03-18', '16:22', 26534, 26534, false],
  801: ['2027-06-09', '09:36', '2027-06-23', '09:36', 0, 0, true],
  802: ['2027-06-23', '09:36', '2027-06-23', '09:36', 0, 0, true],
}

describe('CR-1: caracterização do Aurora (folhas × 2 modos)', () => {
  const base = agendar('baseline')
  const prev = agendar('forecast')

  for (const [uid, inicio, termino, ft, fl, critica] of LINHA_DE_BASE) {
    it(`UID ${uid}: linha de base (igual antes e depois do E2)`, () => {
      const s = base.byUid.get(uid)!
      expect([s.start, s.finish, s.totalFloat, s.freeFloat, s.critical]).toEqual([inicio, termino, ft, fl, critica])
    })
  }

  for (const [chave, linha] of Object.entries(PREVISAO_DEPOIS)) {
    const [inicio, hIni, termino, hFim, ftMin, flMin, critica] = linha
    it(`UID ${chave}: previsão depois do E2 (restante exato)`, () => {
      const s = prev.byUid.get(Number(chave))!
      expect([s.start, s.inicioHora, s.finish, s.terminoHora, s.folgaTotalMin, s.folgaLivreMin, s.critical]).toEqual([inicio, hIni, termino, hFim, ftMin, flMin, critica])
    })
  }

  it('CR-9 antes → depois: os inícios recuam 1 dia, os términos mantêm a data e a entrega continua 23/06/2027', () => {
    const recuam: Record<number, [string, string]> = {
      303: ['2026-11-06', '2026-11-05'], 105: ['2026-11-06', '2026-11-05'],
      106: ['2026-12-01', '2026-11-30'], 401: ['2026-12-01', '2026-11-30'],
      402: ['2026-12-15', '2026-12-14'], 501: ['2026-12-22', '2026-12-21'], 502: ['2027-01-28', '2027-01-27'],
      601: ['2027-01-14', '2027-01-13'], 602: ['2027-03-15', '2027-03-12'], 701: ['2027-03-15', '2027-03-12'],
      702: ['2027-01-06', '2027-01-05'], 801: ['2027-06-10', '2027-06-09'],
    }
    for (const [chave, antes] of Object.entries(PREVISAO_ANTES)) {
      const uid = Number(chave)
      const depois = prev.byUid.get(uid)!
      expect(depois.finish, `término do UID ${uid}`).toBe(antes[1]) // mesma data de término
      if (recuam[uid]) {
        expect(antes[0], `início antes do UID ${uid}`).toBe(recuam[uid][0])
        expect(depois.start, `início depois do UID ${uid}`).toBe(recuam[uid][1])
      } else {
        expect(depois.start, `início do UID ${uid}`).toBe(antes[0])
      }
      expect(depois.critical, `crítica do UID ${uid}`).toBe(antes[4])
    }
    expect(prev.projectFinish).toBe('2027-06-23')
    expect(prev.byUid.get(802)!.terminoHora).toBe('09:36')
    // Folga total de 302, 303 e 702: 56 d → 26.534 min (55,28 d)
    for (const uid of [302, 303, 702]) {
      expect(PREVISAO_ANTES[uid][2]).toBe(56)
      expect(prev.byUid.get(uid)!.folgaTotalMin).toBe(26534)
      expect(prev.byUid.get(uid)!.totalFloat).toBeCloseTo(55.2792, 4)
    }
    // Restante exato: 104 = 3.456 min (antes 8 d = 3.840 min), 302 = 3.802 min (antes 8 d)
    expect(prev.byUid.get(104)!.restanteMin).toBe(3456)
    expect(prev.byUid.get(302)!.restanteMin).toBe(3802)
  })

  it('fim do projeto e caminhos críticos', () => {
    expect(base.projectFinish).toBe('2027-06-01')
    expect(prev.projectFinish).toBe('2027-06-23')
    expect([...base.criticalPath].sort((a, b) => a - b)).toEqual([103, 104, 105, 201, 202, 203, 301, 401, 501, 502, 701, 801, 802])
    expect([...prev.criticalPath].sort((a, b) => a - b)).toEqual([104, 105, 401, 501, 502, 701, 801, 802])
  })
})

describe('CR-1: EVM e cenários do Aurora', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
  })

  it('EVM e atraso', () => {
    const store = useProjectStore()
    expect(store.evm.pv).toBeCloseTo(7259250, 2)
    expect(store.evm.ev).toBeCloseTo(6448200, 2)
    expect(store.evm.ac).toBeCloseTo(6896900, 2)
    expect(store.evm.spi).toBeCloseTo(0.8883, 4)
    expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
    expect(store.delay.delayDays).toBe(16)
  })

  it('crashing, fast-tracking e hora extra', () => {
    const store = useProjectStore()
    const c = store.scenarios.crashing
    expect(c.targetUid).toBe(105)
    expect(c.daysRecovered).toBe(3)
    expect(c.extraCost).toBeCloseTo(12616.8, 2)
    expect(c.newFinish).toBe('2027-06-18')
    expect(c.details[0].value).toBe('16 → 13 dias úteis')
    const f = store.scenarios['fast-tracking']
    expect(f.targetUid).toBe(401)
    expect(f.predecessorUid).toBe(105)
    expect(f.daysRecovered).toBe(13)
    expect(f.newFinish).toBe('2027-06-04')
    const o = store.scenarios.overtime
    expect(o.addedWorkingDays).toEqual(['2026-10-24', '2026-10-31'])
    expect(o.daysRecovered).toBe(2)
    expect(o.extraCost).toBeCloseTo(22315.2, 2)
    expect(o.newFinish).toBe('2027-06-21')
  })

  it('os três cenários aplicados juntos entregam em 2027-06-02 (fixture do esquema 2)', () => {
    const store = useProjectStore()
    for (const k of ['crashing', 'fast-tracking', 'overtime'] as const) store.applyScenario(store.scenarios[k])
    expect(store.schedule.projectFinish).toBe('2027-06-02')
  })
})
