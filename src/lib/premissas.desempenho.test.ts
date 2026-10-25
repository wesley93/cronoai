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

  /**
   * Mede a criação da versão e a leitura de TUDO o que a tela do Caminho Crítico lê: cenários, DLP e as listas de opções (`scenarioOptions`,
   * que incluem a lista de frentes da hora extra e NÃO dependem de premissa: R-16).
   */
  const mudarIndireto = () => {
    indireto += 100
    const t0 = performance.now()
    const valores: PremissasObra = { ...JSON.parse(JSON.stringify(store.premissasVigentes)), custoIndiretoDiario: indireto }
    const r = store.criarVersaoPremissas({ vigencia, motivo: 'medição de desempenho', valores })
    const cenarios = store.scenarios
    const dlp = store.supplies
    const opcoes = store.scenarioOptions
    return { ms: performance.now() - t0, ok: r.ok, cenarios, dlp, opcoes }
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

  it('R-16: mudar uma premissa NÃO recalcula scenarioOptions (a lista de frentes reprograma a obra inteira); mudar a agenda recalcula', () => {
    const opcoesAntes = store.scenarioOptions
    const cenariosAntes = store.scenarios
    expect(mudarIndireto().ok).toBe(true)
    expect(store.scenarioOptions).toBe(opcoesAntes) // mesma identidade: o computed não rodou de novo
    expect(store.scenarios).not.toBe(cenariosAntes) // os cenários dependem das premissas
    // encurta uma tarefa em 1 d direto no estado (a obra sintética é mais longa que o horizonte de 50 anos na linha de base: `updateTask` a recusaria)
    const idx = store.state.tasks.findIndex((t) => t.percentComplete < 100 && t.duracaoMin > 480)
    store.state.tasks[idx] = { ...store.state.tasks[idx], duracaoMin: store.state.tasks[idx].duracaoMin - 480 }
    expect(store.scenarioOptions).not.toBe(opcoesAntes) // a agenda mudou: as opções são refeitas
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

  it.skipIf(!process.env.CRONOAI_PERF)('local (CRONOAI_PERF=1): mediana de 5 mudanças de premissa com frentes escolhidas abaixo de 1.000 ms', () => {
    mudarIndiretoComFrentes() // aquecimento
    const tempos: number[] = []
    for (let i = 0; i < 5; i++) tempos.push(mudarIndiretoComFrentes().ms)
    tempos.sort((a, b) => a - b)
    const voltas = store.scenarios.overtime.horaExtra?.voltas
    console.info(
      `[CRONOAI_PERF] mudança de premissa com frentes escolhidas (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${tempos[2].toFixed(0)} ms; voltas do ajuste ${voltas}; ${tempos[2] > 1000 ? 'ACIMA' : 'dentro'} da meta de 1.000 ms`,
    )
    expect(tempos[2]).toBeLessThan(1000) // meta do AC-6, agora também no modo "frentes escolhidas" (agenda separada do custo, rodada 05)
  })
})

/** Obra sintética em paralelo: 40 cadeias de 75 tarefas (3.000 folhas) que começam juntas depois da data de status. */
function gerarObraParalela(): Task[] {
  let semente = 20261025
  const sorteio = () => {
    semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0
    return semente / 2 ** 32
  }
  const tasks: Task[] = []
  let uid = 0
  for (let c = 0; c < 40; c++) {
    for (let i = 0; i < 75; i++) {
      uid++
      tasks.push({
        uid,
        wbs: `${c + 1}.${i + 1}`,
        name: `C${c + 1}T${i + 1}`,
        outlineLevel: 1,
        isSummary: false,
        duracaoMin: diasParaMinutos(i === 0 ? 3 + Math.floor(sorteio() * 20) : 1 + Math.floor(sorteio() * 8)),
        predecessors: i === 0 ? [] : [{ uid: uid - 1, type: 'FS', lag: { tipo: 'util', minutos: 0 } }],
        percentComplete: 0,
        bac: 1000,
        actualCost: 0,
        resources: [
          { resource: 'Pedreiro', units: 2 },
          { resource: 'Servente', units: 1 },
        ],
      })
    }
  }
  return tasks
}

// R-18 (rodada 04): um pacote inteiro de frentes escolhidas (30, o limite) com 4 e com 8 sábados. As frentes são as primeiras tarefas de 30 das
// 40 cadeias em paralelo: todas candidatas nos primeiros sábados, o ponto fixo poda em várias voltas.
describe('desempenho: hora extra com um pacote de 30 frentes escolhidas (obra de 3.000 tarefas)', { timeout: TIMEOUT_SUITE }, () => {
  let loja: ReturnType<typeof useProjectStore>
  const cabecas = Array.from({ length: 30 }, (_, k) => k * 75 + 1)
  let ind = 10000

  beforeAll(() => {
    globalThis.localStorage?.clear?.()
    setActivePinia(createPinia())
    loja = useProjectStore()
    loja.state.meta = { ...buildSeedState().meta }
    loja.state.tasks = gerarObraParalela()
    loja.state.materials = []
    loja.state.reports = []
    expect(loja.erroCronograma).toBeUndefined()
  }, TIMEOUT_SUITE)

  const medir = (sabados: number) => {
    loja.scenarioParams.overtime.saturdays = sabados
    loja.scenarioParams.overtime.frentes = cabecas
    ind += 100
    const t0 = performance.now()
    const valores: PremissasObra = { ...JSON.parse(JSON.stringify(loja.premissasVigentes)), custoIndiretoDiario: ind }
    const r = loja.criarVersaoPremissas({ vigencia: '2026-10-23', motivo: 'medição de desempenho (pacote)', valores })
    const he = loja.scenarios.overtime
    void loja.supplies
    void loja.scenarioOptions
    return { ms: performance.now() - t0, ok: r.ok, he }
  }

  it.each([4, 8])('com %i sábados, 30 frentes: aplicável, com várias frentes convocadas e tempo abaixo de 15.000 ms (teto largo para o CI)', (sabados) => {
    const r = medir(sabados)
    expect(r.ok).toBe(true)
    expect(r.he.applicable).toBe(true)
    expect(r.he.horaExtra!.atribuicoes.length).toBeGreaterThan(5)
    expect(r.he.horaExtra!.voltas).toBeGreaterThanOrEqual(2)
    expect(r.ms).toBeLessThan(15000)
  })

  it.skipIf(!process.env.CRONOAI_PERF).each([4, 8])('local (CRONOAI_PERF=1): mediana de 3 mudanças de premissa com 30 frentes e %i sábados abaixo de 1.000 ms', (sabados) => {
    medir(sabados) // aquecimento
    const tempos: number[] = []
    let he = medir(sabados).he
    for (let i = 0; i < 3; i++) {
      const r = medir(sabados)
      tempos.push(r.ms)
      he = r.he
    }
    tempos.sort((a, b) => a - b)
    console.info(
      `[CRONOAI_PERF] 30 frentes, ${sabados} sábados (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${tempos[1].toFixed(0)} ms; voltas ${he.horaExtra?.voltas}; convocadas ${he.horaExtra?.atribuicoes.length}; ${tempos[1] > 1000 ? 'ACIMA' : 'dentro'} da meta de 1.000 ms`,
    )
    expect(tempos[1]).toBeLessThan(1000) // meta do AC-6 (agenda separada do custo, rodada 05)
  })
})
