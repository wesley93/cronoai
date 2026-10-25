// Rodada 02 do ciclo 00004, item A: o teto de 50 anos do cálculo não pode quebrar a tela nem a obra salva.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { criarRegistro } from '@/lib/migracaoEstado'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from './armazenamentoObras'
import { buildSeedState, useProjectStore } from './useProjectStore'

const CALENDARIO = (uid: number) =>
  `<Calendar><UID>${uid}</UID><Name>Padrão</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${[1, 2, 3, 4, 5, 6, 7]
    .map((d) =>
      d >= 2 && d <= 6
        ? `<WeekDay><DayType>${d}</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>`
        : `<WeekDay><DayType>${d}</DayType><DayWorking>0</DayWorking></WeekDay>`,
    )
    .join('')}</WeekDays></Calendar>`

/** MSPDI mínimo (fictício) com uma tarefa: o caso da sonda da segurança. */
const xmlDaSonda = (opts: { status: string; duracao: string; pct?: number; actualStart?: string }) =>
  `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project"><Name>sonda</Name><StartDate>2026-01-05T08:00:00</StartDate>` +
  `<StatusDate>${opts.status}T17:00:00</StatusDate><CalendarUID>1</CalendarUID><Calendars>${CALENDARIO(1)}</Calendars><Tasks>` +
  `<Task><UID>1</UID><ID>1</ID><Name>T1</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Duration>${opts.duracao}</Duration>` +
  `<PercentComplete>${opts.pct ?? 0}</PercentComplete>${opts.actualStart ? `<ActualStart>${opts.actualStart}T08:00:00</ActualStart>` : ''}</Task></Tasks></Project>`

async function abrir(adaptador: ArmazenamentoMemoria) {
  usarArmazenamento(adaptador)
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectStore(pinia)
  await store.carregar()
  return { store, pinia }
}

/** Estado salvo que estoura o horizonte: a tarefa de 24.000 h a 10% com o restante empurrado para depois da data de status em 2070. */
function estadoQuebrado() {
  const estado = JSON.parse(JSON.stringify(buildSeedState()))
  estado.meta.startDate = '2026-01-05'
  estado.meta.statusDate = '2070-06-01'
  estado.tasks = [
    {
      uid: 1, wbs: '1', name: 'Tarefa gigante', outlineLevel: 1, isSummary: false, duracaoMin: 24_000 * 60, predecessors: [],
      percentComplete: 10, actualStart: '2026-01-05', bac: 1000, actualCost: 0, resources: [],
    },
  ]
  estado.materials = []
  estado.reports = []
  estado.undo = []
  estado.recoveryCosts = []
  estado.appliedScenarios = []
  return estado
}

function adaptadorComObraQuebrada() {
  const adaptador = criarArmazenamentoMemoria(null)
  const em = '2026-10-25T10:00:00.000Z'
  const estado = estadoQuebrado()
  adaptador.obras.set('o1', criarRegistro('o1', estado, em))
  adaptador.indice = { versaoIndice: 1, obraAtivaId: 'o1', obras: [{ id: 'o1', nome: 'Obra quebrada', atualizadoEm: em }] }
  return adaptador
}

describe('teto de 50 anos: importação, edição e estado salvo', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    usarArmazenamento(undefined)
    setActivePinia(createPinia())
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('A2: o import recusa o arquivo da sonda (status em 2070, tarefa de 24.000 h a 10%) e não grava nada', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const antes = JSON.stringify(store.state)
    const xml = xmlDaSonda({ status: '2070-06-01', duracao: 'PT24000H0M0S', pct: 10, actualStart: '2026-01-05' })
    expect(() => store.importXml(xml)).toThrow(/^Arquivo não importado: O cronograma ultrapassa o horizonte de 50 anos/)
    expect(JSON.stringify(store.state)).toBe(antes) // a obra de exemplo continua intacta
    expect(store.erroCronograma).toBeUndefined()
    expect(store.schedule.projectFinish).toBe('2027-06-23')
  })

  it('A2: a variante com tarefa não iniciada de 12.480 h (a linha de base cabe, a previsão não) também é recusada', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const xml = xmlDaSonda({ status: '2070-06-01', duracao: 'PT12480H0M0S' })
    expect(() => store.importXml(xml)).toThrow(/horizonte de 50 anos/)
    expect(store.state.tasks).toHaveLength(29)
  })

  it('A2: o mesmo arquivo com a data de status dentro do razoável é aceito', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    store.importXml(xmlDaSonda({ status: '2026-06-01', duracao: 'PT24000H0M0S', pct: 10, actualStart: '2026-01-05' }))
    expect(store.erroCronograma).toBeUndefined()
    expect(store.state.tasks).toHaveLength(1)
  })

  it('A1/A4: obra já gravada quebrada abre com o aviso, sem exceção, e o usuário consegue exportar, trocar de obra e corrigir a data', async () => {
    const adaptador = adaptadorComObraQuebrada()
    const { store } = await abrir(adaptador)
    expect(store.state.meta.statusDate).toBe('2070-06-01')
    expect(store.erroCronograma).toMatch(/ultrapassa o horizonte de 50 anos/)
    // Nenhum derivado lança: cronograma vazio e valores zerados
    expect(store.schedule.byUid.size).toBe(0)
    expect(store.evm.bac).toBe(0)
    for (const derivado of ['calendar', 'baseCalendar', 'rollups', 'divergencias', 'delay', 'sCurve', 'packageEvm', 'scenarios', 'scenarioOptions', 'recommendation', 'supplies', 'evmForecast', 'msProjectTasks'] as const) {
      expect(() => store[derivado], derivado).not.toThrow()
    }
    expect(store.msProjectTasks).toHaveLength(1)
    expect(store.msProjectTasks[0].PlannedValue).toBe(0)
    expect(store.scenarios.crashing.applicable).toBe(false)
    expect(store.sCurve).toEqual([])
    // Exportar continua possível, com o XML válido
    const exportado = store.exportXml()
    expect(exportado.validation.valid).toBe(true)
    expect(exportado.validation.errors).toEqual([])
    // Corrigir a data de status pela tela de dados da obra tira o aviso
    const m = store.state.meta
    expect(store.atualizarDadosObra({ nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: '2026-06-01' })).toEqual({ ok: true })
    expect(store.erroCronograma).toBeUndefined()
    expect(store.schedule.byUid.size).toBe(1)
    expect(store.evm.bac).toBe(1000)
  })

  it('A1: com a obra quebrada, trocar de obra funciona e a outra obra calcula normalmente', async () => {
    const { store } = await abrir(adaptadorComObraQuebrada())
    expect(store.erroCronograma).toBeDefined()
    const criada = await store.criarObra({ modelo: 'exemplo' })
    expect(criada.ok).toBe(true)
    expect(store.erroCronograma).toBeUndefined()
    expect(store.schedule.projectFinish).toBe('2027-06-23')
    expect(store.obras).toHaveLength(2)
  })

  it('A1: o App monta com a obra quebrada, mostra o aviso e mantém o topo, a barra lateral e o seletor de obra', async () => {
    const { pinia } = await abrir(adaptadorComObraQuebrada())
    const el = document.createElement('div')
    document.body.appendChild(el)
    const erros: string[] = []
    const app = createApp(App).use(pinia)
    app.config.errorHandler = (e, _i, info) => erros.push(`${info}: ${(e as Error).message}`)
    app.config.warnHandler = () => undefined
    app.mount(el)
    await nextTick()
    await nextTick()
    expect(erros).toEqual([])
    expect(el.querySelector('[data-testid="erro-cronograma"]')?.textContent).toContain('não pôde ser calculado')
    expect(el.querySelector('header')?.textContent).toMatch(/Obra quebrada/)
    expect(el.querySelector('nav')).not.toBeNull()
    app.unmount()
  })

  it('A3: a data de status a mais de 45 anos do início é recusada (por ação e pelo formulário); dentro do limite, aceita', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const antes = store.state.meta.statusDate
    expect(store.setStatusDate('2099-01-01')).toEqual({ ok: false, erro: 'A data de status deve estar a menos de 45 anos da data de início.' })
    expect(store.setStatusDate('texto')).toEqual({ ok: false, erro: 'Informe uma data de status válida.' })
    expect(store.state.meta.statusDate).toBe(antes)
    const m = store.state.meta
    const dados = { nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: '2099-01-01' }
    expect(store.atualizarDadosObra(dados)).toEqual({ ok: false, erros: ['A data de status deve estar a menos de 45 anos da data de início.'] })
    expect(store.state.meta.statusDate).toBe(antes)
    expect(store.setStatusDate('2040-01-01')).toEqual({ ok: true }) // 14 anos: dentro da janela e barato de calcular
    expect(store.erroCronograma).toBeUndefined()
    expect(store.schedule.byUid.size).toBe(20)
  })

  it('A3: a duração que estouraria o horizonte é recusada e a tarefa não muda; a restrição fora da janela também', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const duracao = store.taskByUid.get(105)!.duracaoMin
    const r = store.updateTask(105, { duracaoMin: 60 * 260 * 480 }) // 60 anos de dias úteis
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erro).toMatch(/horizonte de 50 anos/)
    expect(store.taskByUid.get(105)!.duracaoMin).toBe(duracao)
    expect(store.erroCronograma).toBeUndefined()
    expect(store.updateTask(105, { duracaoMin: 480 * 20 })).toEqual({ ok: true })
    expect(store.updateTask(999, { duracaoMin: 480 })).toEqual({ ok: false, erro: 'Tarefa não encontrada.' })
    expect(store.definirRestricao(105, 'SNET', '2075-01-01').ok).toBe(false) // 48 anos do início: fora da janela de 45
    expect(store.taskByUid.get(105)!.restricao).toBeUndefined()
  })
})
