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

const ANOS_45 = 45 * 260 * 480 // 45 anos de dias úteis, em minutos

describe('rodada 03: prévias e ações que recusam a hipótese que estoura o horizonte', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.()
    usarArmazenamento(undefined)
    setActivePinia(createPinia())
  })

  /** Obra de uma tarefa de 45 anos úteis a 90%: calcula (o restante cabe); a 10% o restante (40 anos a partir de 2040) passa de 2076. */
  async function obraNoLimite() {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    store.state.meta.startDate = '2026-01-05'
    store.state.meta.statusDate = '2040-01-02'
    store.state.tasks = [
      { uid: 1, wbs: '1', name: 'Tarefa longa', outlineLevel: 1, isSummary: false, duracaoMin: ANOS_45, predecessors: [], percentComplete: 90, actualStart: '2026-01-05', bac: 1000, actualCost: 0, resources: [] },
    ]
    store.state.reports = []
    store.state.materials = []
    expect(store.erroCronograma).toBeUndefined()
    return store
  }

  it('previewProgress devolve o erro em português (e não "sem impacto") e previewTaskXml não monta XML da hipótese inválida', async () => {
    const store = await obraNoLimite()
    const ok = store.previewProgress(1, 95)
    expect(ok.erro).toBeUndefined()
    const ruim = store.previewProgress(1, 10)
    expect(ruim).toEqual({ erro: 'O cronograma ultrapassa o horizonte de 50 anos a partir da data-base; confira durações, prazos e calendários.' })
    expect(store.previewTaskXml(1, 10)).toBeUndefined()
  })

  it('approveReport recusa o apontamento que estoura o horizonte e não muda tarefa, relato nem registro', async () => {
    const store = await obraNoLimite()
    const relato = store.addReport({ author: 'Fulano (fictício)', role: 'Mestre', transcript: 'terminamos pouco' })
    const antes = JSON.stringify(store.state)
    const r = store.approveReport(relato.id, 1, 10, [])
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/horizonte de 50 anos/) })
    expect(JSON.stringify(store.state)).toBe(antes)
    expect(store.approveReport('inexistente', 1, 10, [])).toEqual({ ok: false, erro: 'Relato ou tarefa não encontrado.' })
    expect(store.approveReport(relato.id, 1, 95, [])).toEqual({ ok: true, delta: -585 }) // 5% de 45 anos úteis = 585 d.u. a menos
  })

  it('previewSinapiTask e addSinapiTask recusam o pacote de 60 anos úteis; o de 5 dias entra', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const antes = store.state.tasks.length
    const insere = (durationDays: number) => ({
      name: 'Pacote', code: '00001', unit: 'm2', quantity: 10, unitCost: 10, durationDays, resources: [], parentWbs: '03', linkType: 'FS' as const, lagDays: 0,
    })
    expect(store.previewSinapiTask(insere(60 * 260)).erro).toMatch(/horizonte de 50 anos/)
    expect(store.addSinapiTask(insere(60 * 260))).toEqual({ ok: false, erro: expect.stringMatching(/horizonte de 50 anos/) })
    expect(store.state.tasks).toHaveLength(antes)
    expect(store.previewSinapiTask(insere(5)).erro).toBeUndefined()
    const ok = store.addSinapiTask(insere(5))
    expect(ok.ok).toBe(true)
    expect(store.state.tasks).toHaveLength(antes + 1)
  })

  it('previewBudgetBatch e generateFromBudget recusam a planilha com uma linha de duração absurda e mantêm a planilha', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const tarefas = store.state.tasks.length
    const linhas = store.state.budget.length
    store.state.budget[0].quantity = 1e12
    const previa = store.previewBudgetBatch({ mode: 'FS', overlapPct: 40 })
    expect(previa?.erro).toMatch(/horizonte de 50 anos/)
    expect(store.generateFromBudget({ mode: 'FS', overlapPct: 40 })).toEqual({ ok: false, erro: expect.stringMatching(/horizonte de 50 anos/) })
    expect(store.state.tasks).toHaveLength(tarefas)
    expect(store.state.budget).toHaveLength(linhas)
  })

  it('applyScenario recusa o cenário cuja alteração estoura o horizonte e não grava custo, undo nem cenário aplicado', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    const base = store.scenarios.crashing
    expect(base.applicable).toBe(true)
    const hipotese = { ...base, taskPatch: { uid: 105, patch: { duracaoMin: 60 * 260 * 480 } } }
    const antes = JSON.stringify(store.state)
    expect(store.applyScenario(hipotese)).toEqual({ ok: false, erro: expect.stringMatching(/horizonte de 50 anos/) })
    expect(JSON.stringify(store.state)).toBe(antes)
    expect(store.applyScenario(base)).toEqual({ ok: true })
    expect(store.state.appliedScenarios).toEqual(['crashing'])
    expect(store.applyScenario(base).ok).toBe(false) // já aplicado
  })
})

describe('rodada 03: calendar e baseCalendar dentro da proteção do cálculo; mensagem sem detalhe interno', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.()
    usarArmazenamento(undefined)
    setActivePinia(createPinia())
  })

  it('calendário padrão adulterado em memória (semana sem tempo útil): nenhum derivado lança e a mensagem é a do calendário', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    expect(store.erroCronograma).toBeUndefined()
    // A migração já descarta calendário inválido do estado salvo (rodada 02); aqui a adulteração vem depois do carregamento
    store.state.calendarios[0].semana = store.state.calendarios[0].semana.map(() => [])
    for (const derivado of ['calendar', 'baseCalendar', 'calendarios', 'schedule', 'evm', 'sCurve', 'delay', 'divergencias'] as const) {
      expect(() => store[derivado], derivado).not.toThrow()
    }
    expect(store.erroCronograma).toMatch(/^Calendário inválido: /)
    expect(store.calendar.isWorkingDay('2026-10-26')).toBe(true) // calendário seguro seg–sex
    expect(store.baseCalendar.isWorkingDay('2026-10-24')).toBe(false) // sábado
  })

  it('erro que não é do motor vira a mensagem genérica (sem texto interno na tela)', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    // Lista de tarefas adulterada em memória (dado interno inesperado): o cálculo falha por causa desconhecida
    ;(store.state.tasks as unknown[]).push(null)
    expect(store.erroCronograma).toBe('Não foi possível calcular o cronograma desta obra.')
    expect(() => store.calendar).not.toThrow()
  })
})

describe('rodada 04: aviso da exportação de tarefa manual alterada no CronoAI', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear?.()
    usarArmazenamento(undefined)
    setActivePinia(createPinia())
  })

  const tarefaManual = (uid: number) =>
    `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>Manual ${uid}</Name><OutlineLevel>1</OutlineLevel><Manual>1</Manual><Start>2026-03-16T09:30:00</Start><Finish>2026-03-20T16:45:00</Finish><Duration>PT40H0M0S</Duration></Task>`
  const xmlManuais = `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="http://schemas.microsoft.com/project"><Name>manuais</Name><StartDate>2026-03-02T08:00:00</StartDate><StatusDate>2026-03-01T17:00:00</StatusDate><CalendarUID>1</CalendarUID><Calendars>${CALENDARIO(1)}</Calendars><Tasks>${tarefaManual(1)}${tarefaManual(2)}${tarefaManual(3)}</Tasks></Project>`

  it('sem nenhuma manual alterada o aviso não existe (0); com N alteradas diz "N tarefa(s) manual(is)…"', async () => {
    const { store } = await abrir(criarArmazenamentoMemoria(null))
    store.importXml(xmlManuais)
    expect(store.state.tasks.filter((t) => t.arquivo?.manual)).toHaveLength(3)
    expect(store.exportXml().avisos).toEqual([])
    expect(store.updateTask(1, { duracaoMin: 4800 })).toEqual({ ok: true })
    expect(store.exportXml().avisos).toEqual(['1 tarefa(s) manual(is) exportada(s) com datas do CronoAI: foram alteradas depois da importação.'])
    expect(store.updateTask(2, { duracaoMin: 4800 })).toEqual({ ok: true })
    expect(store.updateTask(3, { percentComplete: 50 })).toEqual({ ok: true })
    expect(store.exportXml().avisos).toEqual(['3 tarefa(s) manual(is) exportada(s) com datas do CronoAI: foram alteradas depois da importação.'])
  })
})
