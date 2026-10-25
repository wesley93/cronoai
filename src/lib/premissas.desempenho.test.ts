// Desempenho da mudança de premissa (RNF-03.1, AC-6): numa obra de 3.000 tarefas, criar uma versão das premissas recalcula os
// cenários (3 reprogramações do cronograma inteiro) e a DLP. No CI: uma execução abaixo de 3.000 ms (teto largo contra máquina
// lenta e instrumentação de cobertura). Local (CRONOAI_PERF=1): mediana de 5 execuções abaixo de 1.000 ms.
// A previsão da obra (CPM) não depende das premissas: continua em cache e não é recalculada (só os cenários e a DLP).
import { beforeAll, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PremissasObra, Task } from '@/types/domain'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { diasParaMinutos } from './calendarioTrabalho'

const FRENTES = 100
const POR_FRENTE = 30
const TIMEOUT_SUITE = 60_000

/** Obra sintética (semente fixa): 100 frentes de 30 tarefas em série, com equipe de pedreiros e serventes. */
function gerarObra(): Task[] {
  let semente = 20260425
  const sorteio = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }
  const tasks: Task[] = []
  let uid = 0
  for (let f = 0; f < FRENTES; f++) {
    for (let i = 0; i < POR_FRENTE; i++) {
      uid++
      const concluida = sorteio() < 0.2
      tasks.push({
        uid,
        wbs: String(uid),
        name: `T${uid}`,
        outlineLevel: 1,
        isSummary: false,
        duracaoMin: diasParaMinutos(1 + Math.floor(sorteio() * 20)),
        predecessors: uid > 1 ? [{ uid: uid - 1, type: 'FS', lag: { tipo: 'util', minutos: 0 } }] : [],
        percentComplete: concluida ? 100 : 0,
        bac: 1000,
        actualCost: 0,
        resources: [
          { resource: 'Pedreiro', units: 2 + Math.floor(sorteio() * 6) },
          { resource: 'Servente', units: 1 + Math.floor(sorteio() * 4) },
        ],
      })
    }
  }
  return tasks
}

describe('desempenho: mudar uma premissa recalcula cenários e DLP (RNF-03.1, obra de 3.000 tarefas)', { timeout: TIMEOUT_SUITE }, () => {
  let store: ReturnType<typeof useProjectStore>
  const vigencia = '2026-10-23'
  let indireto = 10000

  beforeAll(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    setActivePinia(createPinia())
    store = useProjectStore()
    const seed = buildSeedState()
    store.state.meta = { ...seed.meta }
    store.state.tasks = gerarObra()
    store.state.materials = []
    store.state.reports = []
    expect(store.erroCronograma).toBeUndefined() // calcula (e aquece) antes de medir
    expect(store.scenarios.crashing.kind).toBe('crashing')
  }, TIMEOUT_SUITE)

  /** Mede SÓ a criação da versão e a leitura dos cenários e da DLP (a tela recalcula). */
  const mudarIndireto = () => {
    indireto += 100
    const t0 = performance.now()
    const valores: PremissasObra = { ...JSON.parse(JSON.stringify(store.premissasVigentes)), custoIndiretoDiario: indireto }
    const r = store.criarVersaoPremissas({ vigencia, motivo: 'medição de desempenho', valores })
    const cenarios = store.scenarios
    const dlp = store.supplies
    return { ms: performance.now() - t0, ok: r.ok, cenarios, dlp }
  }

  it('a obra sintética tem 3.000 folhas e a premissa nova chega aos três cenários', () => {
    expect(store.state.tasks).toHaveLength(3000)
    const r = mudarIndireto()
    expect(r.ok).toBe(true)
    const c = r.cenarios
    // economia = max(0, d.u.) × indireto diário, com o indireto da versão nova (R$ 10.100,00)
    expect(c.crashing.indirectSavings).toBe(Math.max(0, c.crashing.daysRecovered) * 10100)
    expect(c.overtime.indirectSavings).toBe(Math.max(0, c.overtime.daysRecovered) * 10100)
    expect(store.premissasVigentes.custoIndiretoDiario).toBe(10100)
  })

  it('uma mudança de premissa recalcula tudo em menos de 3.000 ms (teto largo para o CI)', () => {
    const r = mudarIndireto()
    expect(r.ok).toBe(true)
    expect(r.ms).toBeLessThan(3000)
  })

  it.skipIf(!process.env.CRONOAI_PERF)('local (CRONOAI_PERF=1): mediana de 5 mudanças de premissa abaixo de 1.000 ms', () => {
    mudarIndireto() // aquecimento
    const tempos: number[] = []
    for (let i = 0; i < 5; i++) tempos.push(mudarIndireto().ms)
    tempos.sort((a, b) => a - b)
    console.info(`[CRONOAI_PERF] mudança de premissa (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${tempos[2].toFixed(0)} ms`)
    expect(tempos[2]).toBeLessThan(1000)
  })

  // R-12 (rodada 03): a hora extra por frentes escolhidas roda o ponto fixo (uma reprogramação do cronograma inteiro por volta, mais a lista de
  // frentes da tela): mede a mudança de premissa com algumas frentes escolhidas.
  const mudarIndiretoComFrentes = () => {
    indireto += 100
    const t0 = performance.now()
    const valores: PremissasObra = { ...JSON.parse(JSON.stringify(store.premissasVigentes)), custoIndiretoDiario: indireto }
    const r = store.criarVersaoPremissas({ vigencia, motivo: 'medição de desempenho (frentes)', valores })
    const cenarios = store.scenarios
    const dlp = store.supplies
    const opcoes = store.scenarioOptions
    return { ms: performance.now() - t0, ok: r.ok, cenarios, dlp, opcoes }
  }

  it('com frentes escolhidas, a mudança de premissa chega à hora extra e recalcula tudo em menos de 5.000 ms (teto largo para o CI)', () => {
    store.scenarioParams.overtime.frentes = 'todas'
    const lista = store.scenarioOptions.overtime
    expect(lista.length).toBeGreaterThan(0)
    store.scenarioParams.overtime.frentes = lista.slice(0, 3).map((o) => Number(o.value))
    const r = mudarIndiretoComFrentes()
    expect(r.ok).toBe(true)
    const he = r.cenarios.overtime
    expect(he.applicable).toBe(true)
    expect(he.horaExtra?.atribuicoes.length).toBeGreaterThan(0)
    expect(he.indirectSavings).toBe(Math.max(0, he.daysRecovered) * indireto)
    expect(r.ms).toBeLessThan(5000)
  })

  it.skipIf(!process.env.CRONOAI_PERF)('local (CRONOAI_PERF=1): mediana de 5 mudanças de premissa com frentes escolhidas (informativo; meta 1.000 ms)', () => {
    mudarIndiretoComFrentes() // aquecimento
    const tempos: number[] = []
    for (let i = 0; i < 5; i++) tempos.push(mudarIndiretoComFrentes().ms)
    tempos.sort((a, b) => a - b)
    const voltas = store.scenarios.overtime.horaExtra?.voltas
    console.info(`[CRONOAI_PERF] mudança de premissa com frentes escolhidas (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${tempos[2].toFixed(0)} ms; voltas do ajuste ${voltas}`)
    expect(tempos[2]).toBeLessThan(5000) // o número medido vai para o relatório; acima de 1.000 ms é reportado, não otimizado
  })
})
