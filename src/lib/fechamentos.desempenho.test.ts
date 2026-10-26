// Desempenho do fechamento (ciclo 00007, RNF-04.1, AC-14): obra de 3.000 tarefas com 98 fechamentos já gravados.
// Mede o que a TELA recalcula de verdade (lição 3): o fechamento de ponta a ponta (captura, serialização, gravação na memória e a leitura de
// `sCurve`, `serieFechamentos` e `evm` juntas), a troca da linha de base do valor agregado (só os derivados de custo, sem refazer o cronograma)
// e a abertura da obra com 104 cabeçalhos e a âncora. No CI: uma execução com teto largo (a cobertura e os workers em paralelo deixam a medida instável);
// local (CRONOAI_PERF=1): mediana de 5 execuções. O tamanho dos registros (P-12) vai para o log e tem teto.
import { beforeAll, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CalendarioObra, Lag, LinkType, PredecessorLink, Restricao, Task } from '@/types/domain'
import type { CabecalhoFechamento } from '@/types/fechamento'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from '@/stores/armazenamentoObras'
import { buildSeedState, useProjectStore } from '@/stores/useProjectStore'
import { addCalendarDays, brazilianHolidays } from './calendar'
import { calendarioPadrao, diasParaMinutos } from './calendarioTrabalho'
import { capturarFechamento, lerDetalheFechamento, serializarDetalhe, validarCabecalhosFechamento } from './fechamentos'
import { calcularObra } from './horizonte'

// Local (CRONOAI_PERF=1): a obra de 3.000 tarefas da RNF-04.1. No CI (com cobertura e workers em paralelo) a obra é 5x menor: o teste só confere o comportamento
// e não pode roubar CPU dos outros testes de 3.000 tarefas que já rodam no mesmo processo
const LOCAL = !!process.env.CRONOAI_PERF
const FRENTES = LOCAL ? 100 : 20
const POR_FRENTE = 30
const TAREFAS = FRENTES * POR_FRENTE
const BASE = '2026-05-04'
const STATUS = '2026-10-23'
const EXISTENTES = 98
const TIMEOUT_SUITE = 120_000

const padrao = calendarioPadrao(brazilianHolidays(2026).concat(brazilianHolidays(2027), brazilianHolidays(2028)))
const sabado4h: CalendarioObra = { ...padrao, uid: 2, nome: 'Sábado 4 h', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
const noturno: CalendarioObra = { ...padrao, uid: 3, nome: 'Noturno', semana: padrao.semana.map((_, i) => (i >= 1 && i <= 5 ? [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }] : [])) }

/** Gerador congruencial linear: a mesma obra em toda execução (a mesma mistura do desempenho do motor: lags, restrições, prazos e tarefas iniciadas). */
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
      if (i === 0 && f > 0) candidatas.push(uid - 1)
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
        predecessors, percentComplete: concluida ? 100 : iniciada ? 50 : 0, bac: 1000, actualCost: concluida ? 1100 : iniciada ? 600 : 0, resources: [],
        ...(concluida || iniciada ? { actualStart: addCalendarDays(BASE, 10) } : {}),
        calendarioUid: calSorteio < 0.15 ? 2 : calSorteio < 0.3 ? 3 : undefined,
        ...(restricao ? { restricao } : {}),
        ...(comPrazo ? { prazoFinal: `${addCalendarDays(BASE, 500)}T17:00` } : {}),
      })
    }
  }
  return tasks
}

const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

describe(`desempenho do fechamento e da troca de linha de base (obra de ${TAREFAS.toLocaleString('pt-BR')} tarefas, 98 fechamentos)`, { timeout: TIMEOUT_SUITE }, () => {
  let store: ReturnType<typeof useProjectStore>
  let adaptador: ArmazenamentoMemoria
  let obraId = ''
  let tamanhos = { detalhe: 0, cabecalho: 0 }

  beforeAll(async () => {
    globalThis.localStorage?.clear?.()
    adaptador = criarArmazenamentoMemoria()
    usarArmazenamento(adaptador)
    setActivePinia(createPinia())
    store = useProjectStore()
    await store.carregar()
    obraId = store.obraAtivaId
    // A obra sintética dentro da store (fora da janela medida)
    const seed = buildSeedState()
    store.state.meta = { ...seed.meta, startDate: BASE, statusDate: STATUS }
    store.state.calendarios = [padrao, sabado4h, noturno]
    store.state.calendarioPadraoUid = 1
    store.state.tasks = gerarObra()
    store.state.materials = []
    store.state.reports = []
    store.state.linhasBase = []
    expect(store.erroCronograma).toBeUndefined()
    // 98 fechamentos anteriores (um por dia, de 04/05 a 09/08/2026, antes da data de status): o cabeçalho de uma captura real da obra, copiado com id, sequência e data
    const calc = calcularObra(JSON.parse(JSON.stringify(store.state.tasks)) as Task[], JSON.parse(JSON.stringify(store.state.meta)), JSON.parse(JSON.stringify(store.state.calendarios)), 1, { feriados: JSON.parse(JSON.stringify(store.state.feriados)) })
    const modelo = capturarFechamento({
      obraId, id: 'modelo', sequencia: 1, dataStatus: STATUS, fechadoEm: '2026-10-01T12:00:00.000Z', linhaBase: 0, versaoPremissas: 1, esquemaObra: 6,
      tarefas: JSON.parse(JSON.stringify(store.state.tasks)) as Task[], cals: calc.calsPv, schedule: calc.sch, atrasoDiasUteis: calc.atraso.delayDays,
    })
    const registro = serializarDetalhe(modelo.detalhe)
    tamanhos = { detalhe: registro.json.length, cabecalho: JSON.stringify(modelo.cabecalho).length }
    for (let i = 1; i <= EXISTENTES; i++) {
      const id = `f-${i}`
      const cab: CabecalhoFechamento = { ...modelo.cabecalho, id, sequencia: i, dataStatus: addCalendarDays('2026-05-03', i) }
      adaptador.fechamentos.set(id, cab)
      adaptador.detalhes.set(id, { id, json: registro.json.replace('"id":"modelo"', `"id":"${id}"`) }) // o detalhe confere o id com o cabeçalho
    }
    await store.salvarAgora()
    // reabre o app sobre o armazenamento: o histórico é lido como no uso real
    setActivePinia(createPinia())
    store = useProjectStore()
    await store.carregar()
    expect(store.fechamentos).toHaveLength(EXISTENTES)
    expect(store.fechamentosIlegiveis).toBe(0)
    expect(store.erroCronograma).toBeUndefined()
    void store.sCurve // aquece
  }, TIMEOUT_SUITE)

  /** O fechamento de ponta a ponta + o que a tela recalcula depois (Curva S, série dos fechamentos e KPIs lidos juntos). */
  async function fecharMedindo(dia: number) {
    store.setStatusDate(addCalendarDays(STATUS, dia)) // fora da janela medida
    void store.schedule // o cronograma da data nova (a edição da data já o refaz): não entra na medida
    const t0 = performance.now()
    const r = await store.fecharDataDeStatus()
    const pontos = store.sCurve.length
    const serie = store.serieFechamentos.length
    const ev = store.evm.ev
    return { ms: performance.now() - t0, ok: r.ok, pontos, serie, ev }
  }

  it('o fechamento número 99 é gravado e a tela recalcula tudo (CI: uma execução, teto largo)', async () => {
    const r = await fecharMedindo(1)
    expect(r.ok).toBe(true)
    expect(store.fechamentos).toHaveLength(EXISTENTES + 1)
    expect(r.serie).toBe(EXISTENTES + 1)
    expect(r.pontos).toBeGreaterThan(EXISTENTES)
    // O CI roda com cobertura (o tempo sobe ~3x e varia com os workers em paralelo): teto largo, só contra regressão patológica. A meta está no teste local
    expect(r.ms).toBeLessThan(LOCAL ? 6000 : 30_000)
  })

  it.skipIf(!LOCAL)('local (CRONOAI_PERF=1): mediana de 5 fechamentos de ponta a ponta (do 100º ao 104º) abaixo de 2.000 ms (RNF-04.1); o 105º é recusado pelo limite', async () => {
    const tempos: number[] = []
    for (let d = 2; d <= 6; d++) {
      const r = await fecharMedindo(d)
      expect(r.ok).toBe(true)
      tempos.push(r.ms)
    }
    expect(store.fechamentos.filter((c) => c.tipo === 'fechamento')).toHaveLength(104)
    console.info(`[CRONOAI_PERF] fechamento de ponta a ponta, 3.000 tarefas (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${mediana(tempos).toFixed(0)} ms`)
    expect(mediana(tempos)).toBeLessThan(2000)
    store.setStatusDate(addCalendarDays(STATUS, 7))
    expect(await store.fecharDataDeStatus()).toEqual({
      ok: false,
      erro: 'Limite de 104 fechamentos desta obra atingido. Exporte o histórico (JSON) e registre a pendência com a equipe responsável pelo servidor (SPEC-01).',
    })
  })

  it('a troca da linha de base do valor agregado refaz só os derivados de custo: o cronograma e o atraso são os mesmos objetos', async () => {
    store.salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Medição de desempenho' })
    const schedule = store.schedule
    const delay = store.delay
    const t0 = performance.now()
    store.definirLinhaBaseAtiva(1)
    void store.sCurve.length
    void store.evm.pv
    void store.packageEvm.length
    void store.evmForecast.cpmFinish
    const ms = performance.now() - t0
    expect(store.schedule).toBe(schedule) // sem refazer o CPM (~0,8 a 1,5 s com 3.000 tarefas)
    expect(store.delay).toBe(delay)
    console.info(`[CRONOAI_PERF] troca da LB do valor agregado, 3.000 tarefas: ${ms.toFixed(0)} ms (derivados de custo apenas)`)
    // A 1ª troca é a fria (primeira projeção das 3.000 tarefas e das ~100 pontos da curva); a mediana das seguintes está no teste local abaixo
    expect(ms).toBeLessThan(LOCAL ? 3000 : 12000)
    store.definirLinhaBaseAtiva(0)
    expect(store.schedule).toBe(schedule)
  })

  it.skipIf(!LOCAL)('local (CRONOAI_PERF=1): mediana de 5 trocas de linha de base abaixo de 1.000 ms (opinião; a base refazia ~1 s com o clone das 11 LBs)', () => {
    const tempos: number[] = []
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now()
      store.definirLinhaBaseAtiva(i % 2 === 0 ? 1 : 0)
      void store.sCurve.length
      void store.evm.pv
      void store.packageEvm.length
      void store.evmForecast.cpmFinish
      tempos.push(performance.now() - t0)
    }
    console.info(`[CRONOAI_PERF] trocas de LB (ms): ${tempos.map((t) => t.toFixed(0)).join(', ')}; mediana ${mediana(tempos).toFixed(0)} ms`)
    expect(mediana(tempos)).toBeLessThan(1000)
  })

  it('abertura da obra: validar 104 cabeçalhos e ler a âncora de 3.000 tarefas (e o tamanho do registro, P-12)', async () => {
    const brutos = await adaptador.lerCabecalhosFechamento(obraId)
    const t0 = performance.now()
    const v = validarCabecalhosFechamento(brutos, obraId)
    const primeiro = v.cabecalhos[0]
    const detalhe = lerDetalheFechamento(await adaptador.lerDetalheFechamento(primeiro.id), primeiro)
    const ms = performance.now() - t0
    expect(v.cabecalhos.length).toBeGreaterThanOrEqual(EXISTENTES)
    expect(v.ilegiveis).toBe(0)
    expect(detalhe?.tarefas).toHaveLength(TAREFAS)
    console.info(`[CRONOAI_PERF] abertura: ${v.cabecalhos.length} cabeçalhos + âncora de ${detalhe?.tarefas.length} tarefas validados em ${ms.toFixed(0)} ms`)
    expect(ms).toBeLessThan(LOCAL ? 500 : 3000)
    // P-12: tamanho do registro. 3.000 tarefas: o detalhe cabe em 400 mil caracteres; 156 registros (104 + 52 retificações) ficam perto dos ~44 milhões do ADR
    console.info(`[CRONOAI_PERF] tamanho: detalhe ${tamanhos.detalhe} caracteres, cabeçalho ${tamanhos.cabecalho}; 156 registros ≈ ${((156 * (tamanhos.detalhe + tamanhos.cabecalho)) / 1e6).toFixed(1)} milhões de caracteres`)
    expect(tamanhos.detalhe).toBeLessThanOrEqual(400_000)
    expect(tamanhos.cabecalho).toBeLessThanOrEqual(10_000)
    // a obra com 11 linhas de base (3.000 tarefas): o texto do registro, em milhões de caracteres
    const obra = adaptador.obras.get(obraId)
    console.info(`[CRONOAI_PERF] registro da obra com a LB1 salva e 3.000 tarefas: ${((obra?.json.length ?? 0) / 1e6).toFixed(2)} milhões de caracteres`)
  })
})
