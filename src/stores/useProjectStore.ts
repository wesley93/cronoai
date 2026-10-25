// Estado global reativo da obra: toda ação (apontamento, cenário, SINAPI, XML) recalcula CPM, EVM e suprimentos.
import { defineStore } from 'pinia'
import { computed, nextTick, reactive, ref, toRaw, watch } from 'vue'
import type {
  CalendarioObra,
  ConfigFeriadosObra,
  DecisionLogEntry,
  ExcecaoCalendario,
  FeriadoManual,
  IntervaloTrabalho,
  OpcoesCronograma,
  DetectedRestriction,
  FieldReport,
  LinkType,
  MaterialItem,
  PhotoKind,
  ProjectState,
  ResourceAssignment,
  ScenarioKind,
  ScheduleResult,
  Task,
  VersaoPremissas,
} from '@/types/domain'
import type { MSProjectPredecessor, MSProjectTask } from '@/types/msProject'
import type { IndiceObras, MigracaoV1, PersistedState, ResumoObra, ScenarioUndo } from '@/types/obra'
import { SEED_MATERIALS, SEED_META, SEED_PREMISSAS, SEED_REPORTS, SEED_TASKS } from '@/data/seed'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import {
  DEFAULT_BATCH_OPTIONS,
  MAX_BUDGET_LINES,
  lineDuration,
  lineFromCatalog,
  lineName,
  lineResources,
  parseBudgetCsv,
  type BatchOptions,
  type BudgetLine,
} from '@/lib/sinapiBudget'
import { addCalendarDays, defaultHolidays, type WorkCalendar } from '@/lib/calendar'
import {
  MAX_CALENDARIOS,
  MINUTOS_POR_DIA_PADRAO,
  UID_CALENDARIO_PADRAO,
  calendarioDeDias,
  calendarioPadrao,
  comDiasExtras,
  compilarCalendarios,
  copiarCalendario,
  diasParaMinutos,
  intervalosDaPredefinicao,
  erroDoCalendario,
  erroDoNomeCalendario,
  proximoUidCalendario,
  type CalendariosCompilados,
  minutosParaDias,
  semDiasExtras,
} from '@/lib/calendarioTrabalho'
import { computeSchedule, optsDaObra, withBaseline } from '@/lib/cpm'
import { computeEvm, computePackageEvm, computeSCurve, eacVariants, forecastFinishBySpi, plannedFraction } from '@/lib/evm'
import { interpretReport } from '@/lib/fieldAi'
import { MAX_CALENDAR_DAYS, buildMspdiXml, buildTaskXml, lagParaMspdi, parseMspdiXml, validateMspdi, type MspdiValidation } from '@/lib/msProjectXmlParser'
import {
  DEFAULT_SCENARIO_PARAMS,
  analyzeDelay,
  agendaFastTracking,
  agendaHoraExtra,
  crashingTargets,
  custoFastTracking,
  custoHoraExtra,
  fastTrackOptions,
  overtimeTargets,
  recommendScenario,
  simulateAll,
  simulateCrashing,
  workingVariance,
  type ResultadoAgendaFT,
  type ResultadoAgendaHE,
  type ScenarioParams,
  type ScenarioResult,
} from '@/lib/scenarios'
import { analyzeSupplies } from '@/lib/supplies'
import { MAX_VERSOES_PREMISSAS, premissasPadrao, validarNovaVersao, versaoVigente, type NovaVersaoPremissas } from '@/lib/premissas'
import {
  calendariosParaExportar,
  configFeriadosPadrao,
  criarFeriadosPorAno,
  faixaDeAnosDaExportacao,
  feriadosForaDoLocal,
  validarFeriadoManual,
  type NovoFeriadoManual,
} from '@/lib/feriadosObra'
import { compararCronogramas } from '@/lib/previaImpacto'
import { fmtBRL, fmtMonth, uid } from '@/lib/format'
import { calcularDivergencias } from '@/lib/divergencias'
import type { PreviaImpacto, PreviaPlanilha, PreviaProgresso, PreviaSinapi } from '@/types/previas'
import { calcularObra, mensagemDoCalculo, verificarCalculo } from '@/lib/horizonte'
import { ROTULO_RESTRICAO, calendarioExiste, montarRestricao, tarefasManuaisAlteradas, validarPrazoFinal, validarRestricao, type TipoRestricaoTela } from '@/lib/restricoes'
import { lagEmDias, nextChildWbs, nextUid, parseFloorRange, rollupSummaries, sortByWbs } from '@/lib/wbs'
import { criarRegistro, lerEstadoV1, migrarRegistro } from '@/lib/migracaoEstado'
import { avaliarCota, erroDoRegistroDeDesfazer, erroDeStatusForaDaJanela, estadoObraVazia, nomeDaCopia, percentualCota, resumirObra, validarDadosObra, validarIndice, validarOpcoesCronograma, type DadosObra } from '@/lib/obras'
import { obterArmazenamento, type ArmazenamentoObras } from './armazenamentoObras'
import { useUiStore } from './ui'

/** Atraso entre a última alteração e a gravação no armazenamento. */
const ATRASO_GRAVACAO_MS = 300
/** Intervalo mínimo entre duas consultas da cota de armazenamento. */
const INTERVALO_COTA_MS = 60_000

export type EstadoGravacao = 'salvo' | 'pendente' | 'erro'
export type ResultadoAcao = { ok: true } | { ok: false; erro: string }
export type ResultadoCalendario = { ok: true; uid: number } | { ok: false; erro: string }
/** Prévia da troca de UF ou município: os feriados manuais de outro local e, se houver, o impacto de removê-los. */
export interface PreviaTrocaLocal {
  foraDoLocal: FeriadoManual[]
  /** Não há nenhum feriado estadual ou municipal cadastrado: eles não são carregados automaticamente nesta fase. */
  semFeriadosLocais: boolean
  impactoDeRemover?: PreviaImpacto
}
export type ResultadoCriacao = { ok: true; id: string } | { ok: false; erro: string; erros?: string[] }
export type NovaObra = { modelo: 'exemplo' } | { modelo: 'branco'; dados: DadosObra }

/** Tenta o cálculo; se estourar o horizonte (ou os dados forem incoerentes), devolve o valor vazio seguro. */
function tentar<T>(calculo: () => T, vazio: () => T): T {
  try {
    return calculo()
  } catch {
    return vazio()
  }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** Linha de base: cálculo sem avanço e sem dias úteis extras (hora extra não entra na linha de base). */
function baselineFor(tasks: Task[], meta: ProjectState['meta'], calendarios: CalendarioObra[], padraoUid: number, feriados: ConfigFeriadosObra, onlyMissing = false): Task[] {
  const cals = compilarCalendarios(meta.startDate, calendarios, padraoUid, { semExcecoesUteis: true, feriadosPorAno: criarFeriadosPorAno(feriados) })
  return withBaseline(tasks, computeSchedule(tasks, cals, optsDaObra(meta, 'baseline')), onlyMissing)
}

export function buildSeedState(): PersistedState {
  const meta = clone(SEED_META)
  // O calendário do exemplo aplica os feriados da obra (os mesmos de 2026 a 2029 que antes eram exceções fixas; agora valem em qualquer ano)
  const calendarios = [{ ...calendarioPadrao([]), aplicaFeriadosObra: true }]
  const feriados = configFeriadosPadrao()
  const tasks = baselineFor(clone(SEED_TASKS), meta, calendarios, UID_CALENDARIO_PADRAO, feriados)
  const materials = clone(SEED_MATERIALS).map((m) => {
    if (m.id !== 'm-porcelanato') return m
    const t = tasks.find((x) => x.uid === m.taskUid)
    return { ...m, deliveryDate: t?.baselineStart ? addCalendarDays(t.baselineStart, -5) : undefined }
  })
  return {
    meta,
    tasks,
    calendarios,
    calendarioPadraoUid: UID_CALENDARIO_PADRAO,
    premissas: clone(SEED_PREMISSAS),
    feriados,
    reports: clone(SEED_REPORTS),
    restrictions: [],
    materials,
    recoveryCosts: [],
    appliedScenarios: [],
    log: [
      { id: uid('log'), date: '2026-04-27', kind: 'sistema', title: 'Linha de base aprovada', detail: 'Cronograma executivo aprovado pela diretoria e salvo como Linha de Base 0.' },
      { id: uid('log'), date: meta.statusDate, kind: 'importacao', title: 'Cronograma sincronizado', detail: 'Última sincronização com o MS Project na data de status.' },
    ],
    undo: [],
    budget: seedBudget(),
  }
}

/** Planilha de exemplo: serviços das áreas comuns ainda fora da EAP. */
function seedBudget(): BudgetLine[] {
  const byCode = (code: string) => SINAPI_CATALOG.find((c) => c.code === code)!
  return [
    lineFromCatalog(byCode('103332'), 'b-1', 640, 4, 'Áreas comuns (térreo)'),
    lineFromCatalog(byCode('87529'), 'b-2', 1280, 4, 'Áreas comuns (térreo)'),
    lineFromCatalog(byCode('87630'), 'b-3', 900, 3, 'Garagem e hall'),
    lineFromCatalog(byCode('87263'), 'b-4', 520, 3, 'Hall e circulações'),
    lineFromCatalog(byCode('88489'), 'b-5', 2100, 3, 'Áreas comuns'),
  ]
}

/** Mensagem ao usuário para uma falha de gravação, sem detalhe técnico. */
function mensagemDeFalha(err: unknown): string {
  return err instanceof DOMException && err.name === 'QuotaExceededError'
    ? 'O armazenamento do navegador está cheio.'
    : 'Não foi possível gravar no armazenamento do navegador.'
}

export interface SinapiInsert {
  name: string
  code: string
  unit: string
  quantity: number
  unitCost: number
  durationDays: number
  resources: ResourceAssignment[]
  parentWbs: string
  newGroupName?: string
  predecessorUid?: number
  linkType: LinkType
  lagDays: number
}

export const useProjectStore = defineStore('project', () => {
  // Antes de `carregar()` o estado é a obra de exemplo e a gravação fica desligada: não há como sobrescrever a obra salva.
  const state = reactive<PersistedState>(buildSeedState())

  // ---------------------------------------------------------------- obras e armazenamento
  const obras = ref<ResumoObra[]>([])
  const obraAtivaId = ref('')
  const estadoGravacao = ref<EstadoGravacao>('salvo')
  const mensagemGravacao = ref('')
  /** Percentual de uso do armazenamento quando passa do limiar de alerta (80%). */
  const alertaCota = ref<number | undefined>(undefined)
  /** Avisos da última carga (migração da v1 parcial ou ilegível, armazenamento indisponível). */
  const avisosCarga = ref<string[]>([])
  const armazenamentoIndisponivel = ref(false)
  const migracaoV1 = ref<MigracaoV1 | undefined>(undefined)
  const carregado = ref(false)
  /** Carga sem segurança (índice ilegível, leitura falhou): nada é gravado até recarregar a página. */
  const gravacaoBloqueada = ref(false)

  let armazenamento: ArmazenamentoObras | undefined
  let indice: IndiceObras | undefined
  let gravacaoLigada = false
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  let fila: Promise<unknown> = Promise.resolve()
  let ultimaConsultaCota = 0
  /** Conta as alterações do estado: a gravação só vira "salva" se nada mudou durante a escrita. */
  let revisao = 0
  let timerPendente = false

  watch(
    state,
    () => {
      if (!gravacaoLigada) return
      revisao++
      estadoGravacao.value = 'pendente'
      agendarGravacao()
    },
    { deep: true },
  )

  function agendarGravacao() {
    clearTimeout(saveTimer)
    timerPendente = true
    saveTimer = setTimeout(() => {
      timerPendente = false
      void salvarAgora()
    }, ATRASO_GRAVACAO_MS)
  }

  /** Carga ou gravação sem segurança: aviso persistente, gravação desligada e nada escrito por cima do que existe. */
  function bloquearGravacao(mensagem: string) {
    gravacaoLigada = false
    gravacaoBloqueada.value = true
    clearTimeout(saveTimer)
    timerPendente = false
    estadoGravacao.value = 'erro'
    mensagemGravacao.value = mensagem
    carregado.value = true
  }

  /**
   * Cópias simples (sem proxy) do que vai ao IndexedDB: o valor de um `ref` é um proxy reativo
   * e o clone estruturado do IndexedDB o recusa (DataCloneError).
   */
  function migracaoPlana(): { migracaoV1?: MigracaoV1 } {
    return migracaoV1.value ? { migracaoV1: { ...migracaoV1.value } } : {}
  }
  const obrasPlanas = (): ResumoObra[] => obras.value.map((o) => ({ ...o }))

  function agora(): string {
    return new Date().toISOString()
  }

  /** Atualiza a linha da obra ativa no índice em memória com o que está no estado. */
  function indiceComAtiva(atualizadoEm: string): IndiceObras {
    const base: IndiceObras = indice ?? {
      versaoIndice: 1,
      obraAtivaId: obraAtivaId.value,
      obras: [],
      ...migracaoPlana(),
    }
    const resumo = resumirObra(obraAtivaId.value, state, atualizadoEm)
    const existe = base.obras.some((o) => o.id === resumo.id)
    return {
      ...base,
      obraAtivaId: obraAtivaId.value,
      obras: existe ? base.obras.map((o) => (o.id === resumo.id ? resumo : o)) : [...base.obras, resumo],
    }
  }

  function aceitarIndice(novo: IndiceObras) {
    indice = novo
    obras.value = novo.obras.map((o) => ({ ...o }))
  }

  function registrarFalhaDeGravacao(err: unknown) {
    const antes = estadoGravacao.value
    estadoGravacao.value = 'erro'
    mensagemGravacao.value = mensagemDeFalha(err)
    if (antes !== 'erro') useUiStore().notify('error', 'As alterações desta obra não estão sendo salvas', mensagemGravacao.value)
  }

  async function consultarCota() {
    if (!armazenamento || Date.now() - ultimaConsultaCota < INTERVALO_COTA_MS) return
    ultimaConsultaCota = Date.now()
    const { uso, cota } = await armazenamento.estimar()
    alertaCota.value = avaliarCota(uso, cota) === 'alerta' ? Math.round(percentualCota(uso, cota) ?? 0) : undefined
  }

  /** Grava agora a obra ativa (cancela o atraso). Devolve false se falhar; as gravações seguem em fila, na ordem. */
  function salvarAgora(): Promise<boolean> {
    if (gravacaoBloqueada.value) return Promise.resolve(false)
    clearTimeout(saveTimer)
    timerPendente = false
    const gravar = async (): Promise<boolean> => {
      if (!armazenamento || !obraAtivaId.value) return true
      try {
        const rev = revisao
        const em = agora()
        const novoIndice = indiceComAtiva(em)
        await armazenamento.gravarObra(criarRegistro(obraAtivaId.value, state, em), novoIndice)
        aceitarIndice(novoIndice)
        // Sem IndexedDB o "salvo" é só na memória da sessão: o aviso de indisponibilidade continua.
        // Alteração feita durante a escrita (rev mudou) continua "pendente": o observador já agendou outra gravação.
        if (!armazenamentoIndisponivel.value && rev === revisao) {
          estadoGravacao.value = 'salvo'
          mensagemGravacao.value = ''
        }
        void consultarCota().catch(() => undefined)
        return true
      } catch (err) {
        registrarFalhaDeGravacao(err)
        return false
      }
    }
    const tarefa = fila.then(gravar)
    fila = tarefa
    return tarefa
  }

  /** Coloca o estado na tela sem disparar uma gravação (trocar de obra não é alteração). */
  async function aplicarEstado(novo: PersistedState) {
    gravacaoLigada = false
    Object.assign(state, novo)
    resetScenarioParams()
    await nextTick() // o observador roda aqui, ainda desligado
    gravacaoLigada = true
  }

  /** Lê e migra uma obra do armazenamento; marca como ilegível no índice em memória se falhar. */
  async function abrirRegistro(id: string): Promise<{ estado: PersistedState; avisos: string[] } | { erro: string }> {
    if (!armazenamento) return { erro: 'Armazenamento não carregado.' }
    try {
      const r = migrarRegistro(await armazenamento.lerObra(id), new Date().getFullYear())
      if (r.tipo === 'ok') return { estado: r.estado, avisos: r.avisos }
      return { erro: r.mensagem }
    } catch {
      return { erro: 'Não foi possível ler esta obra do armazenamento do navegador.' }
    }
  }

  function marcarIlegivel(id: string, ilegivel: boolean) {
    if (!indice) return
    indice = { ...indice, obras: indice.obras.map((o) => (o.id === id ? { ...o, ilegivel: ilegivel || undefined } : o)) }
    obras.value = indice.obras.map((o) => ({ ...o }))
  }

  /**
   * Carrega as obras: índice → obra ativa; sem índice, migra o `cronoai-state-v1` (só leitura) para a 1ª obra.
   * Liga a gravação só no fim. Deve ser aguardada antes de montar a interface (main.ts).
   */
  async function carregar(): Promise<void> {
    try {
      await carregarObras()
    } catch {
      bloquearGravacao('Não foi possível carregar as obras deste navegador. Nada foi gravado, para não sobrescrever o que já existe.')
    }
  }

  async function carregarObras(): Promise<void> {
    gravacaoLigada = false
    gravacaoBloqueada.value = false
    obraAtivaId.value = ''
    indice = undefined
    const aberto = await obterArmazenamento()
    armazenamento = aberto.armazenamento
    armazenamentoIndisponivel.value = aberto.indisponivel
    const avisos: string[] = []
    if (aberto.indisponivel) {
      avisos.push('Armazenamento local indisponível: as alterações desta sessão não serão salvas.')
      estadoGravacao.value = 'erro'
      mensagemGravacao.value = 'Armazenamento local indisponível.'
    }

    // Leitura que falha = estado desconhecido: não grava nada (poderia sobrescrever o índice e deixar obras órfãs)
    let bruto: unknown
    try {
      bruto = await armazenamento.lerIndice()
    } catch {
      bloquearGravacao('Não foi possível ler as obras salvas neste navegador. Nada foi gravado, para não sobrescrever o que já existe. Recarregue a página.')
      return
    }
    let existente: IndiceObras | undefined
    if (bruto !== undefined && bruto !== null) {
      const v = validarIndice(bruto)
      if (v.tipo === 'invalido') {
        bloquearGravacao(v.mensagem)
        return
      }
      existente = v.indice
    }

    let inicial: PersistedState | undefined
    if (existente) {
      indice = existente
      obras.value = existente.obras.map((o) => ({ ...o }))
      migracaoV1.value = existente.migracaoV1
      let ids: string[] | undefined
      try {
        ids = await armazenamento.listarIdsObras()
      } catch {
        ids = undefined
      }
      const ordem = [existente.obraAtivaId, ...existente.obras.map((o) => o.id).filter((id) => id !== existente.obraAtivaId)]
      for (const id of ordem) {
        if (ids && !ids.includes(id)) {
          marcarIlegivel(id, true)
          continue
        }
        const r = await abrirRegistro(id)
        if ('estado' in r) {
          inicial = r.estado
          obraAtivaId.value = id
          avisos.push(...r.avisos)
          marcarIlegivel(id, false)
          break
        }
        marcarIlegivel(id, true)
      }
      if (!inicial) avisos.push('Nenhuma obra salva pôde ser lida: a obra de exemplo foi aberta. As obras ilegíveis continuam no navegador, sem alteração.')
    } else {
      const v1 = lerEstadoV1(armazenamento.lerV1(), new Date().getFullYear())
      if (v1.tipo === 'ok') {
        inicial = v1.estado
        avisos.push(...v1.avisos)
        migracaoV1.value = { em: agora(), resultado: 'migrado' }
      } else if (v1.tipo === 'corrompido') {
        avisos.push(
          'O estado salvo da versão anterior não pôde ser lido. Ele foi mantido no navegador sem alteração e a obra de exemplo foi aberta.',
        )
        migracaoV1.value = { em: agora(), resultado: 'ilegivel' }
      }
    }

    let precisaGravar = false
    if (!inicial) {
      inicial = buildSeedState()
      precisaGravar = true
    }
    if (!existente) {
      obraAtivaId.value = uid('obra')
      if (migracaoV1.value?.resultado === 'migrado') migracaoV1.value = { ...migracaoV1.value, obraId: obraAtivaId.value }
      precisaGravar = true
    } else if (!obraAtivaId.value) {
      // Nenhuma obra legível no índice: a obra de exemplo entra como nova, sem tocar nas ilegíveis.
      obraAtivaId.value = uid('obra')
      precisaGravar = true
    }
    await aplicarEstado(inicial)
    avisosCarga.value = avisos

    if (precisaGravar) {
      // Índice e obra na mesma transação. Se falhar, o índice não existe e a v1 fica intacta: a próxima carga tenta de novo (M-4).
      const em = agora()
      const base = indice
      const novo: IndiceObras = { ...indiceComAtiva(em), ...migracaoPlana() }
      const rev = revisao
      try {
        await armazenamento.gravarObra(criarRegistro(obraAtivaId.value, state, em), novo)
        aceitarIndice(novo)
        if (!aberto.indisponivel && rev === revisao) estadoGravacao.value = 'salvo'
      } catch (err) {
        obras.value = novo.obras.map((o) => ({ ...o }))
        indice = base // sem índice gravado (M-4); com índice, o antigo continua valendo
        registrarFalhaDeGravacao(err)
      }
    }
    carregado.value = true
  }

  // ---------------------------------------------------------------- derivados
  const minutosPorDia = computed(() => state.meta.minutosPorDia ?? MINUTOS_POR_DIA_PADRAO)
  /** Calendário padrão seg–sex com feriados nacionais: nunca falha, serve quando o cálculo da obra estoura o horizonte. */
  function calendariosSeguros(): CalendariosCompilados {
    const ano = Number(state.meta.startDate.slice(0, 4)) || new Date().getFullYear()
    return compilarCalendarios(state.meta.startDate, [calendarioPadrao(defaultHolidays(ano, ano + 3))], UID_CALENDARIO_PADRAO)
  }
  /**
   * Cálculo da obra, à prova de falha: calendários compilados (com e sem as exceções úteis), previsão e EVM.
   * Se estourar o teto de 50 anos (estado salvo ou importado com datas absurdas) ou o calendário for inválido, a tela não quebra:
   * devolve um cronograma vazio e `erro` em português (a tela mostra o aviso; o usuário troca de obra, exporta e corrige a data).
   */
  const calculo = computed(() => {
    try {
      // Cópia simples do estado: ler 3.000 tarefas pelo proxy reativo do Vue custa ~4x mais que ler objetos comuns, e a cópia (JSON) também
      // registra a dependência de todos os campos que o cálculo usa
      return { ...calcularObra(clone(state.tasks), clone(state.meta), clone(state.calendarios), state.calendarioPadraoUid, { feriados: clone(state.feriados) }), erro: undefined as string | undefined }
    } catch (e) {
      const seguros = calendariosSeguros()
      const sch = computeSchedule([], seguros, optsDaObra(state.meta, 'forecast', state.meta.statusDate))
      const padrao = calendarioDeDias(seguros.padrao)
      return {
        cals: seguros,
        calsPv: seguros,
        sch,
        evm: computeEvm([], seguros, state.meta.statusDate),
        atraso: analyzeDelay([], sch, padrao),
        calendar: padrao,
        baseCalendar: padrao,
        erro: mensagemDoCalculo(e),
      }
    }
  })
  /** Mensagem (em português) quando o cálculo da obra não coube no horizonte de 50 anos; `undefined` = tudo certo. */
  const erroCronograma = computed(() => calculo.value.erro)
  /** Calendários compilados (cálculo em minutos úteis, com os dias extras de hora extra). */
  const calendarios = computed(() => calculo.value.cals)
  /** Calendários do valor planejado (PV): sem as exceções úteis, como a linha de base (CR-2d). */
  const calendariosPv = computed(() => calculo.value.calsPv)
  /** Contas por dia útil ("+16 d.u."): o calendário padrão, com dias extras. */
  const calendar = computed(() => calculo.value.calendar)
  const baseCalendar = computed(() => calculo.value.baseCalendar)
  /** Variação em dias úteis sem deixar o teto de 50 anos derrubar a tela (0 quando não cabe). */
  const variacaoSegura = (cal: WorkCalendar, a: string, b: string) => tentar(() => workingVariance(cal, a, b), () => 0)
  /**
   * Cronograma previsto de uma HIPÓTESE (apontamento, inclusão, planilha, cenário). Não esconde a falha: se a hipótese estoura o
   * teto de 50 anos, devolve o erro em português para a prévia mostrar na tela (e não "sem impacto").
   */
  function simular(tasks: Task[], cals: CalendariosCompilados = calendarios.value): { sch: ScheduleResult; erro?: undefined } | { sch?: undefined; erro: string } {
    try {
      return { sch: computeSchedule(tasks, cals, optsDaObra(state.meta, 'forecast', state.meta.statusDate)) }
    } catch (e) {
      return { erro: mensagemDoCalculo(e) }
    }
  }
  const schedule = computed(() => calculo.value.sch)
  /** Tarefas cuja data difere da do arquivo importado, com a causa provável (RF-05.8). */
  const divergencias = computed(() => tentar(() => calcularDivergencias(state.tasks, schedule.value, calendarios.value, state.meta, { calendarios: state.calendarios, calendarioPadraoUid: state.calendarioPadraoUid, feriados: state.feriados }), () => []))
  const rollups = computed(() => rollupSummaries(state.tasks, schedule.value))
  const tasksByWbs = computed(() => sortByWbs(state.tasks))
  const leaves = computed(() => tasksByWbs.value.filter((t) => !t.isSummary))
  const taskByUid = computed(() => new Map(state.tasks.map((t) => [t.uid, t])))
  const evm = computed(() => calculo.value.evm)
  const packageEvm = computed(() => tentar(() => computePackageEvm(state.tasks, calendariosPv.value, state.meta.statusDate), () => []))
  const sCurve = computed(() => (calculo.value.erro ? [] : tentar(() => computeSCurve(clone(state.tasks), calendariosPv.value, state.meta.statusDate, schedule.value, fmtMonth), () => [])))
  const delay = computed(() => calculo.value.atraso)
  /**
   * Obra com "não mover o restante" e tarefa iniciada cujo restante termina ANTES da data de status: o cálculo é a política do
   * CronoAI (o restante segue contínuo desde o início real), mas o resultado fica no passado e o usuário precisa saber.
   */
  const avisoRestanteAntesDoStatus = computed(() => {
    if (state.meta.opcoesCronograma?.moverRestante !== false) return 0
    let n = 0
    for (const t of state.tasks) {
      if (t.isSummary || !(t.percentComplete > 0 && t.percentComplete < 100)) continue
      const s = schedule.value.byUid.get(t.uid)
      if (s && s.finish < state.meta.statusDate) n++
    }
    return n
  })
  /** Menor data de início real entre as tarefas (indefinida enquanto a obra não tem avanço). */
  const primeiroInicioReal = computed(() => state.tasks.map((t) => t.actualStart).filter((d): d is string => !!d).sort()[0])
  /** Obra com avanço: alguma tarefa com % concluído ou início real. */
  const obraComAvanco = computed(() => state.tasks.some((t) => t.percentComplete > 0 || !!t.actualStart))
  /** Obra sem tarefas: não há entrega nem desempenho a mostrar (o motor devolve a data de início e SPI/CPI 1 por `safeDiv`). */
  const semCronograma = computed(() => state.tasks.length === 0)
  /** Sem orçamento (BAC = 0): SPI e CPI 1,00 são só o fallback do `safeDiv`, não desempenho. */
  const semOrcamento = computed(() => evm.value.bac <= 0)

  /** Tarefas de um pacote de 1º nível (ou a obra inteira quando `wbs` é vazio). */
  function tasksOf(wbs?: string): Task[] {
    return wbs ? state.tasks.filter((t) => t.wbs === wbs || t.wbs.startsWith(wbs + '.')) : state.tasks
  }
  function sCurveFor(wbs?: string) {
    return wbs ? tentar(() => computeSCurve(tasksOf(wbs), calendariosPv.value, state.meta.statusDate, schedule.value, fmtMonth), () => []) : sCurve.value
  }
  function evmFor(wbs?: string) {
    return wbs ? tentar(() => computeEvm(tasksOf(wbs), calendariosPv.value, state.meta.statusDate), () => computeEvm([], calendariosPv.value, state.meta.statusDate)) : evm.value
  }
  /** EAC por três premissas + término previsto pelo SPI comparado ao CPM. */
  const evmForecast = computed(() => {
    const leavesWithBaseline = state.tasks.filter((t) => !t.isSummary && t.baselineStart && t.baselineFinish)
    const bStart = leavesWithBaseline.map((t) => t.baselineStart!).sort()[0] ?? state.meta.startDate
    const bFinish = leavesWithBaseline.map((t) => t.baselineFinish!).sort().at(-1) ?? schedule.value.projectFinish
    return {
      eac: eacVariants(evm.value),
      bySpi: tentar(
        () => forecastFinishBySpi(baseCalendar.value, bStart, bFinish, evm.value.spi),
        () => ({ plannedDays: 0, estimatedDays: 0, date: bStart }),
      ),
      cpmFinish: schedule.value.projectFinish,
      baselineFinish: bFinish,
    }
  })
  const recoveryTotal = computed(() => state.recoveryCosts.reduce((a, c) => a + c.amount, 0))
  /** Parâmetros do simulador "E se?" (ajustados pelo engenheiro na tela; não são persistidos). */
  const scenarioParams = reactive<ScenarioParams>(clone(DEFAULT_SCENARIO_PARAMS))
  /** Versão das premissas vigente na data de status (a de maior número com vigência até a data); lista vazia = padrão. */
  const versaoPremissasVigente = computed<VersaoPremissas>(
    () => versaoVigente(state.premissas, state.meta.statusDate) ?? { versao: 1, vigencia: state.meta.startDate, motivo: 'Premissas padrão', valores: premissasPadrao() },
  )
  const premissasVigentes = computed(() => versaoPremissasVigente.value.valores)
  // toRaw: o simulador reprograma a obra inteira 3 vezes e não precisa de reatividade (ler 3.000 tarefas pelo proxy do Vue é ~4x mais
  // lento). A dependência continua registrada: `schedule` (e `calculo`) já leem tarefas, meta e calendários.
  // Agenda do simulador: só o que vem do cronograma (tarefas, calendários, feriados, previsão), SEM premissas. As listas de opções
  // (`crashingTargets`, `fastTrackOptions`, `overtimeTargets`) não usam premissas e a da hora extra reprograma a obra inteira: mudar uma
  // premissa não pode refazê-las (AC-6, RNF-03.1).
  const scenarioAgenda = computed(() => ({
    // Com o cálculo da obra fora do horizonte o cronograma é vazio: o simulador não tem tarefa para comprimir
    tasks: calculo.value.erro ? [] : toRaw(state.tasks),
    calendarios: toRaw(state.calendarios),
    calendarioPadraoUid: state.calendarioPadraoUid,
    meta: toRaw(state.meta),
    forecast: schedule.value,
    origin: delay.value.origin,
    feriados: toRaw(state.feriados),
  }))
  const scenarioCtx = computed(() => ({
    ...scenarioAgenda.value,
    premissas: premissasVigentes.value,
    versaoPremissas: { versao: versaoPremissasVigente.value.versao, vigencia: versaoPremissasVigente.value.vigencia },
  }))
  // AGENDA do fast tracking e da hora extra (a parte cara: um CPM completo por volta), SEM premissas: cada uma só depende da agenda da obra e dos
  // parâmetros do próprio cenário. Mudar uma premissa refaz só o CUSTO (rápido). O crashing não se separa: a duração nova usa o fator de
  // congestionamento, que é premissa (ver `simulateCrashing`).
  const agendaFT = computed<ResultadoAgendaFT>(() =>
    tentar(
      () => agendaFastTracking(scenarioAgenda.value, scenarioParams.fastTracking),
      () => agendaFastTracking({ ...scenarioAgenda.value, tasks: [] }, scenarioParams.fastTracking),
    ),
  )
  const agendaHE = computed<ResultadoAgendaHE>(() =>
    tentar(
      () => agendaHoraExtra(scenarioAgenda.value, scenarioParams.overtime),
      () => agendaHoraExtra({ ...scenarioAgenda.value, tasks: [] }, scenarioParams.overtime),
    ),
  )
  const scenarios = computed(() =>
    tentar(
      () => ({
        crashing: simulateCrashing(scenarioCtx.value, scenarioParams.crashing),
        'fast-tracking': custoFastTracking(scenarioCtx.value, agendaFT.value),
        overtime: custoHoraExtra(scenarioCtx.value, agendaHE.value),
      }),
      () => simulateAll({ ...scenarioCtx.value, tasks: [] }, scenarioParams),
    ),
  )
  const scenarioOptions = computed(() =>
    tentar(
      () => ({ crashing: crashingTargets(scenarioAgenda.value), fastTracking: fastTrackOptions(scenarioAgenda.value), overtime: overtimeTargets(scenarioAgenda.value, scenarioParams.overtime.saturdays) }),
      () => ({ crashing: [], fastTracking: [], overtime: [] }),
    ),
  )
  const recommendation = computed(() => recommendScenario(scenarios.value, state.appliedScenarios))
  /** Margem de segurança da DLP (dias corridos): premissa da obra. */
  const safetyMarginDays = computed(() => premissasVigentes.value.margemDlpDias)
  const supplies = computed(() =>
    analyzeSupplies(state.materials, state.tasks, schedule.value, state.meta.statusDate, state.restrictions, safetyMarginDays.value),
  )

  /** Vínculo no formato MS Project: lag em dias (úteis ou corridos) e o par `LinkLag`/`LagFormat` do MSPDI. */
  function predecessorMs(p: Task['predecessors'][number]): MSProjectPredecessor {
    const { linkLag, lagFormat } = lagParaMspdi(p.lag)
    return { PredecessorUID: p.uid, Type: p.type, LagDays: lagEmDias(p.lag, minutosPorDia.value), LinkLag: linkLag, LagFormat: lagFormat }
  }

  /** Tarefas no formato MS Project (folhas + resumos), sempre coerentes com o CPM e o EVM atuais. */
  const msProjectTasks = computed<MSProjectTask[]>(() => {
    const status = state.meta.statusDate
    const pvOf = (t: Task) => tentar(() => t.bac * plannedFraction(t, calendariosPv.value, status), () => 0)
    return tasksByWbs.value.map((t): MSProjectTask => {
      if (t.isSummary) {
        const r = rollups.value.get(t.uid)
        const kids = leaves.value.filter((k) => k.wbs.startsWith(t.wbs + '.'))
        const start = r?.start ?? state.meta.startDate
        const finish = r?.finish ?? start
        return {
          UniqueID: t.uid,
          WBS: t.wbs,
          Name: t.name,
          OutlineLevel: t.outlineLevel,
          Summary: true,
          Duration: tentar(() => Math.max(0, calendar.value.countWorkingBetween(start, addCalendarDays(finish, 1))), () => 0),
          Start: start,
          Finish: finish,
          PercentComplete: Math.round((r?.percentComplete ?? 0) * 10) / 10,
          Predecessors: t.predecessors.map(predecessorMs),
          IsCritical: !!r?.critical,
          TotalSlack: null,
          BudgetAtCompletion: r?.bac ?? 0,
          PlannedValue: kids.reduce((a, k) => a + pvOf(k), 0),
          EarnedValue: kids.reduce((a, k) => a + (k.bac * k.percentComplete) / 100, 0),
          ActualCost: r?.actualCost ?? 0,
          Resources: [],
          MaterialLeadTime: null,
          SinapiCode: null,
          BaselineStart: r?.baselineStart ?? null,
          BaselineFinish: r?.baselineFinish ?? null,
        }
      }
      const s = schedule.value.byUid.get(t.uid)
      const done = t.percentComplete >= 100
      return {
        UniqueID: t.uid,
        WBS: t.wbs,
        Name: t.name,
        OutlineLevel: t.outlineLevel,
        Summary: false,
        Duration: minutosParaDias(t.duracaoMin, minutosPorDia.value),
        Start: s?.start ?? state.meta.startDate,
        Finish: s?.finish ?? state.meta.startDate,
        PercentComplete: t.percentComplete,
        Predecessors: t.predecessors.map(predecessorMs),
        IsCritical: !!s?.critical,
        TotalSlack: done || !s ? null : s.totalFloat,
        BudgetAtCompletion: t.bac,
        PlannedValue: pvOf(t),
        EarnedValue: (t.bac * t.percentComplete) / 100,
        ActualCost: t.actualCost,
        Resources: t.resources.map((r) => ({ Name: r.resource, Units: r.units })),
        MaterialLeadTime: t.leadTimeDays ?? null,
        SinapiCode: t.sinapi ?? null,
        BaselineStart: t.baselineStart ?? null,
        BaselineFinish: t.baselineFinish ?? null,
      }
    })
  })

  function msProjectTask(uniqueId: number): MSProjectTask | undefined {
    return msProjectTasks.value.find((t) => t.UniqueID === uniqueId)
  }

  function finishVarianceDays(t: Task): number {
    const s = schedule.value.byUid.get(t.uid)
    if (!s || !t.baselineFinish) return 0
    return variacaoSegura(baseCalendar.value, t.baselineFinish, s.finish)
  }

  // ---------------------------------------------------------------- helpers
  function log(kind: DecisionLogEntry['kind'], title: string, detail: string) {
    state.log.unshift({ id: uid('log'), date: state.meta.statusDate, kind, title, detail })
    if (state.log.length > 60) state.log.length = 60
  }

  function patchTask(taskUid: number, patch: Partial<Task>) {
    const idx = state.tasks.findIndex((t) => t.uid === taskUid)
    if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...patch }
  }

  /** Aplica avanço físico com apropriação proporcional de custo real. */
  /** Alterações de um novo avanço físico, com apropriação proporcional de custo real (CPI da própria tarefa). */
  function progressPatch(t: Task, newPercent: number, reportDate: string): Partial<Task> {
    const pct = Math.max(0, Math.min(100, Math.round(newPercent)))
    const delta = pct - t.percentComplete
    const earned = (t.bac * t.percentComplete) / 100
    const costRatio = earned > 0 && t.actualCost > 0 ? t.actualCost / earned : 1.03
    const patch: Partial<Task> = {
      percentComplete: pct,
      actualCost: Math.max(0, Math.round(t.actualCost + (t.bac * delta * costRatio) / 100)),
    }
    if (pct > 0 && !t.actualStart) patch.actualStart = reportDate
    if (pct >= 100) patch.actualFinish = t.actualFinish ?? reportDate
    if (pct < 100) patch.actualFinish = undefined
    if (pct === 0) patch.actualStart = undefined
    return patch
  }

  function applyProgress(taskUid: number, newPercent: number, reportDate: string) {
    const t = taskByUid.value.get(taskUid)
    if (t) patchTask(taskUid, progressPatch(t, newPercent, reportDate))
  }


  // ---------------------------------------------------------------- Módulo 1
  function interpret(report: FieldReport) {
    return interpretReport(report.transcript, state.tasks)
  }

  /** Simula o impacto de um apontamento no término da obra antes de aprovar. */
  function previewProgress(taskUid: number, pct: number, reportDate = state.meta.statusDate): PreviaProgresso {
    const tasks = state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...progressPatch(t, pct, reportDate) } : t))
    const sim = simular(tasks)
    if (sim.erro !== undefined) return { erro: sim.erro }
    const s = sim.sch
    return { finish: s.projectFinish, deltaDays: variacaoSegura(calendar.value, schedule.value.projectFinish, s.projectFinish) }
  }

  /** Elemento <Task> do MSPDI antes e depois de um apontamento (prévia do que vai para o MS Project). */
  function previewTaskXml(taskUid: number, pct: number, reportDate = state.meta.statusDate) {
    const current = taskByUid.value.get(taskUid)
    if (!current) return undefined
    const tasks = state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...progressPatch(t, pct, reportDate) } : t))
    const simulado = simular(tasks)
    if (simulado.erro !== undefined) return undefined // a prévia de datas já mostra o erro da hipótese
    const after = simulado.sch
    const comum = { meta: state.meta, calendarios: calendariosDeExportacao(), calendarioPadraoUid: state.calendarioPadraoUid }
    return {
      before: buildTaskXml(current, { ...comum, tasks: state.tasks, schedule: schedule.value }),
      after: buildTaskXml(tasks.find((t) => t.uid === taskUid)!, { ...comum, tasks, schedule: after }),
    }
  }


  function approveReport(reportId: string, taskUid: number, pct: number | undefined, restrictions: DetectedRestriction[]): { ok: true; delta: number } | { ok: false; erro: string } {
    const report = state.reports.find((r) => r.id === reportId)
    const task = taskByUid.value.get(taskUid)
    if (!report || !task) return { ok: false, erro: 'Relato ou tarefa não encontrado.' }
    const before = task.percentComplete
    const finishBefore = schedule.value.projectFinish
    const reportDate = report.timestamp.slice(0, 10)
    if (pct !== undefined && pct !== before) {
      // Recusa o apontamento que estouraria o horizonte de 50 anos antes de mudar qualquer coisa
      const erro = erroSeAplicar(state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...progressPatch(t, pct, reportDate) } : t)))
      if (erro) return { ok: false, erro }
    }
    if (pct !== undefined && pct !== before) applyProgress(taskUid, pct, reportDate)
    for (const r of restrictions) {
      state.restrictions.unshift({ ...r, id: uid('rst'), date: reportDate, taskUid, reportId, resolved: false })
    }
    report.status = 'aprovado'
    report.approvedUid = taskUid
    report.approvedPercent = pct ?? before
    report.previousPercent = before
    const delta = variacaoSegura(calendar.value, finishBefore, schedule.value.projectFinish)
    log(
      'apontamento',
      `[UID ${taskUid}] ${task.wbs} atualizado via canteiro`,
      `${report.author}: avanço ${Math.round(before)}% → ${Math.round(pct ?? before)}%` +
        (restrictions.length ? `; restrições: ${restrictions.map((r) => r.label).join(', ')}` : '') +
        (delta !== 0 ? `; término da obra ${delta < 0 ? 'antecipado' : 'adiado'} em ${Math.abs(delta)} dia(s) útil(eis).` : '.'),
    )
    return { ok: true, delta }
  }

  function rejectReport(reportId: string) {
    const report = state.reports.find((r) => r.id === reportId)
    if (report) report.status = 'rejeitado'
  }

  function addReport(input: { author: string; role: string; transcript: string; photoUrl?: string; photo?: PhotoKind }) {
    const report: FieldReport = {
      id: uid('r'),
      author: input.author,
      role: input.role,
      avatarColor: 'bg-zinc-500',
      timestamp: `${state.meta.statusDate}T${new Date().toTimeString().slice(0, 8)}`,
      channel: 'texto',
      transcript: input.transcript.trim(),
      photo: input.photo,
      photoUrl: input.photoUrl,
      status: 'pendente',
    }
    state.reports.unshift(report)
    return report
  }

  function resolveRestriction(id: string) {
    const r = state.restrictions.find((x) => x.id === id)
    if (r) r.resolved = true
  }

  // ---------------------------------------------------------------- Módulo 2
  /** Troca o calendário padrão da obra por uma versão transformada (hora extra: dias úteis extras). */
  function atualizarCalendarioPadrao(transformar: (c: CalendarioObra) => CalendarioObra) {
    state.calendarios = state.calendarios.map((c) => (c.uid === state.calendarioPadraoUid ? transformar(c) : c))
  }

  function applyScenario(result: ScenarioResult): ResultadoAcao {
    if (!result.applicable || state.appliedScenarios.includes(result.kind)) return { ok: false, erro: 'Este cenário não pode ser aplicado agora.' }
    // Hora extra: sábados no calendário padrão (todas as frentes; meio período = 08:00–12:00) ou calendários derivados só para as frentes escolhidas
    const he = result.horaExtra
    const expedienteHE = he?.jornada === 'meio' ? intervalosDaPredefinicao('quatro-horas') : undefined
    const novos = he?.calendariosNovos ?? []
    const atribuicoes = he?.atribuicoes ?? []
    if (state.calendarios.length + novos.length > MAX_CALENDARIOS) return { ok: false, erro: `Não há espaço para o calendário da hora extra: a obra já tem ${state.calendarios.length} calendários (máximo ${MAX_CALENDARIOS}).` }
    if (novos.some((n) => state.calendarios.some((c) => c.uid === n.uid))) return { ok: false, erro: 'Os calendários mudaram desde a simulação: confira o cenário e aplique de novo.' }
    // Hipótese: a tarefa alterada e os calendários com os dias extras; recusa se estourar o horizonte
    const comPatch = result.taskPatch ? state.tasks.map((t) => (t.uid === result.taskPatch!.uid ? { ...t, ...clone(result.taskPatch!.patch) } : t)) : state.tasks
    const tarefasHipotese = atribuicoes.length ? comPatch.map((t) => { const a = atribuicoes.find((x) => x.uid === t.uid); return a ? { ...t, calendarioUid: a.calendarioUid } : t }) : comPatch
    const calendariosHipotese = [
      ...(result.addedWorkingDays?.length ? state.calendarios.map((c) => (c.uid === state.calendarioPadraoUid ? comDiasExtras(c, result.addedWorkingDays!, expedienteHE) : c)) : state.calendarios),
      ...clone(novos),
    ]
    const erro = erroSeAplicar(tarefasHipotese, state.meta, calendariosHipotese)
    if (erro) return { ok: false, erro }
    const costId = uid('cost')
    // O resultado guardado para o "desfazer" e o comparativo não leva os calendários inteiros (ficam só na obra)
    const guardado = clone(result)
    if (guardado.horaExtra) guardado.horaExtra.calendariosNovos = []
    const undo: ScenarioUndo = { kind: result.kind, costId, result: guardado }
    if (result.taskPatch) {
      const t = taskByUid.value.get(result.taskPatch.uid)!
      const before: Partial<Task> = {}
      for (const k of Object.keys(result.taskPatch.patch) as (keyof Task)[]) (before as Record<string, unknown>)[k] = clone(t[k])
      undo.taskUid = t.uid
      undo.before = before
      patchTask(t.uid, clone(result.taskPatch.patch))
    }
    if (result.addedWorkingDays?.length) {
      undo.addedDays = [...result.addedWorkingDays]
      atualizarCalendarioPadrao((c) => comDiasExtras(c, result.addedWorkingDays!, expedienteHE))
    }
    if (novos.length) {
      undo.calendariosCriados = novos.map((n) => n.uid)
      undo.calendariosAntes = atribuicoes.map((a) => ({ uid: a.uid, ...(taskByUid.value.get(a.uid)?.calendarioUid !== undefined ? { calendarioUid: taskByUid.value.get(a.uid)!.calendarioUid } : {}) }))
      state.calendarios = [...state.calendarios, ...clone(novos)]
      state.tasks = state.tasks.map((t) => { const a = atribuicoes.find((x) => x.uid === t.uid); return a ? { ...t, calendarioUid: a.calendarioUid } : t })
    }
    const amount = Math.round(result.extraCost)
    state.recoveryCosts.push({ id: costId, scenario: result.kind, label: result.title, amount })
    state.appliedScenarios.push(result.kind)
    state.undo.push(undo)
    log('cenario', `Cenário aplicado: ${result.title}`, `${result.summary}. Recupera ${result.daysRecovered} dia(s) útil(eis); custo comprometido ${fmtBRL(amount)}.`)
    return { ok: true }
  }

  function appliedResult(kind: ScenarioKind): ScenarioResult | undefined {
    return state.undo.find((u) => u.kind === kind)?.result
  }

  function undoScenario(kind: ScenarioKind): ResultadoAcao {
    const idx = state.undo.findIndex((u) => u.kind === kind)
    if (idx < 0) return { ok: false, erro: 'Este cenário não está aplicado.' }
    const u = state.undo[idx]
    // Registro vindo do estado salvo com forma inválida: recusa ANTES de alterar qualquer coisa (nada de desfazer pela metade)
    if (erroDoRegistroDeDesfazer(u)) return { ok: false, erro: 'Não foi possível desfazer este cenário: o registro dele no estado salvo está inválido. Nada foi alterado.' }
    if (u.taskUid !== undefined && u.before) patchTask(u.taskUid, clone(u.before))
    if (u.addedDays) atualizarCalendarioPadrao((c) => semDiasExtras(c, u.addedDays!))
    // Hora extra por frente: cada tarefa volta ao calendário de antes e os calendários derivados saem da obra. O que veio do estado salvo é
    // conferido: só sai da obra calendário criado por hora extra e nunca o calendário padrão.
    const avisosHE: string[] = []
    const criados = new Set((u.calendariosCriados ?? []).filter((id) => Number.isInteger(id) && id !== state.calendarioPadraoUid && state.calendarios.some((c) => c.uid === id && c.origem === 'hora-extra')))
    if (criados.size || u.calendariosAntes?.length) {
      const antesValidos = (u.calendariosAntes ?? []).filter(
        (x) => !!x && Number.isInteger(x.uid) && (x.calendarioUid === undefined || (Number.isInteger(x.calendarioUid) && state.calendarios.some((c) => c.uid === x.calendarioUid && !criados.has(c.uid)))),
      )
      const derivadoDe = (taskUid: number) => u.result.horaExtra?.atribuicoes.find((x) => x.uid === taskUid)?.calendarioUid
      state.tasks = state.tasks.map((t) => {
        const antes = antesValidos.find((x) => x.uid === t.uid)
        if (!antes) return t
        const esperado = derivadoDe(t.uid)
        // atribuição feita depois da hora extra (a tarefa já não usa o derivado do cenário) é sobrescrita: avisa
        if (esperado !== undefined && t.calendarioUid !== esperado) avisosHE.push(`[UID ${t.uid}] ${t.wbs}: o calendário atribuído depois da hora extra foi desfeito; a tarefa voltou ao calendário de antes.`)
        const { calendarioUid: _derivado, ...resto } = t
        return antes.calendarioUid === undefined ? resto : { ...resto, calendarioUid: antes.calendarioUid }
      })
      state.calendarios = state.calendarios.filter((c) => !criados.has(c.uid))
      // Tarefa que ainda aponte para um calendário removido (ex.: atribuída à mão ao derivado) volta ao calendário padrão
      const existentes = new Set(state.calendarios.map((c) => c.uid))
      const orfas = state.tasks.filter((t) => t.calendarioUid !== undefined && !existentes.has(t.calendarioUid))
      if (orfas.length) {
        const uidsOrfas = new Set(orfas.map((t) => t.uid))
        state.tasks = state.tasks.map((t) => {
          if (!uidsOrfas.has(t.uid)) return t
          const { calendarioUid: _removido, ...resto } = t
          return resto
        })
        avisosHE.push(`${orfas.length} tarefa(s) apontavam para um calendário removido e voltaram ao calendário padrão: ${orfas.map((t) => t.wbs).join(', ')}.`)
      }
    }
    state.recoveryCosts = state.recoveryCosts.filter((c) => c.id !== u.costId)
    state.appliedScenarios = state.appliedScenarios.filter((k) => k !== kind)
    state.undo.splice(idx, 1)
    log('cenario', 'Cenário desfeito', `Cenário "${kind}" revertido; cronograma recalculado.`)
    if (avisosHE.length) log('cenario', 'Calendários das tarefas ajustados ao desfazer', avisosHE.join(' '))
    return { ok: true }
  }

  // ---------------------------------------------------------------- Módulo 3
  function orderMaterial(id: string, deliveryDate: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    m.ordered = true
    m.orderDate = state.meta.statusDate
    m.deliveryDate = deliveryDate
    for (const r of state.restrictions.filter((x) => x.kind === 'material' && !x.resolved && x.material && m.name.toLowerCase().includes(x.material))) {
      r.resolved = true
    }
    log('suprimentos', `Pedido emitido: ${m.name}`, `${m.quantity.toLocaleString('pt-BR')} ${m.unit} · entrega prevista ${deliveryDate.split('-').reverse().join('/')}.`)
  }

  function rescheduleDelivery(id: string, deliveryDate: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    const old = m.deliveryDate
    m.deliveryDate = deliveryDate
    log('suprimentos', `Entrega reagendada: ${m.name}`, `De ${old?.split('-').reverse().join('/') ?? '—'} para ${deliveryDate.split('-').reverse().join('/')} (frente atrasada).`)
  }

  /**
   * Cria uma versão nova das premissas (RF-03.3): valida a vigência (igual ou posterior à da última versão), o motivo e os valores,
   * grava a versão imutável e registra no log. As versões antigas nunca são alteradas nem apagadas.
   */
  function criarVersaoPremissas(nova: NovaVersaoPremissas): ResultadoAcao {
    if (state.premissas.length >= MAX_VERSOES_PREMISSAS) return { ok: false, erro: `No máximo ${MAX_VERSOES_PREMISSAS} versões de premissas por obra.` }
    const erros = validarNovaVersao(state.premissas, nova)
    if (erros.length) return { ok: false, erro: erros[0] }
    const versao = state.premissas.reduce((m, v) => Math.max(m, v.versao), 0) + 1
    state.premissas.push({ versao, vigencia: nova.vigencia, criadaEm: agora(), motivo: nova.motivo.trim(), valores: clone(nova.valores) })
    log('sistema', `Premissas v${versao} criada`, `Vigência ${nova.vigencia.split('-').reverse().join('/')}. ${nova.motivo.trim()}`)
    return { ok: true }
  }

  /** Edição de insumo (lead time, quantidade, preço, fornecedor, tarefa vinculada). */
  function updateMaterial(id: string, patch: Partial<Pick<MaterialItem, 'leadTimeDays' | 'quantity' | 'unitPrice' | 'supplier' | 'taskUid' | 'deliveryDate'>>) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    const before = m.leadTimeDays
    Object.assign(m, patch)
    if (patch.leadTimeDays !== undefined && patch.leadTimeDays !== before) {
      log('suprimentos', `Lead time alterado: ${m.name}`, `${before} → ${patch.leadTimeDays} dias (fornecedor ${m.supplier}).`)
    }
  }

  function addMaterial(input: Omit<MaterialItem, 'id' | 'ordered' | 'orderDate' | 'deliveryDate'>): MaterialItem {
    const item: MaterialItem = { ...input, id: uid('m'), ordered: false }
    state.materials.push(item)
    const t = taskByUid.value.get(item.taskUid)
    log('suprimentos', `Insumo cadastrado: ${item.name}`, `Vinculado a [UID ${item.taskUid}] ${t?.wbs ?? ''} · lead time ${item.leadTimeDays} dias.`)
    return item
  }

  /** Registra o recebimento no canteiro na data de status. */
  function registerDelivery(id: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    m.ordered = true
    m.orderDate = m.orderDate ?? state.meta.statusDate
    m.deliveryDate = state.meta.statusDate
    for (const r of state.restrictions.filter((x) => x.kind === 'material' && !x.resolved && x.material && m.name.toLowerCase().includes(x.material))) {
      r.resolved = true
    }
    log('suprimentos', `Recebido no canteiro: ${m.name}`, `${m.quantity.toLocaleString('pt-BR')} ${m.unit} em ${state.meta.statusDate.split('-').reverse().join('/')}.`)
  }

  function removeMaterial(id: string) {
    const m = state.materials.find((x) => x.id === id)
    if (!m) return
    state.materials = state.materials.filter((x) => x.id !== id)
    log('suprimentos', `Insumo removido: ${m.name}`, 'Retirado do painel de suprimentos.')
  }

  function resetScenarioParams() {
    Object.assign(scenarioParams, clone(DEFAULT_SCENARIO_PARAMS))
    scenarioParams.crashing.targetUid = undefined
    scenarioParams.fastTracking.predUid = undefined
    scenarioParams.fastTracking.succUid = undefined
  }

  // ---------------------------------------------------------------- Módulo 4
  function addSinapiTask(input: SinapiInsert): { ok: true; task: Task } | { ok: false; erro: string } {
    const { task, group } = buildSinapiTask(input, state.tasks)
    const erro = erroSeAplicar([...state.tasks, ...(group ? [group] : []), task])
    if (erro) return { ok: false, erro }
    if (group) state.tasks.push(group)
    state.tasks.push(task)
    // Linha de base da inclusão de escopo = datas calculadas no momento da inclusão
    const s = schedule.value.byUid.get(task.uid)
    if (s) patchTask(task.uid, { baselineStart: s.start, baselineFinish: s.finish, baselineDuracaoMin: s.duracaoMin })
    log('sinapi', `Pacote incluído na EAP: [UID ${task.uid}] ${task.wbs}`, `${input.name} — ${input.durationDays} dias úteis, BAC ${fmtBRL(task.bac)}.`)
    return { ok: true, task }
  }

  function buildSinapiTask(input: SinapiInsert, tasks: Task[]): { task: Task; parentWbs: string; group?: Task } {
    let parentWbs = input.parentWbs
    let group: Task | undefined
    if (input.newGroupName) {
      const topLevels = tasks.filter((t) => t.outlineLevel === 1).map((t) => Number(t.wbs))
      parentWbs = String((topLevels.length ? Math.max(...topLevels) : 0) + 1).padStart(2, '0')
      group = {
        uid: nextUid(tasks), wbs: parentWbs, name: input.newGroupName, outlineLevel: 1, isSummary: true, duracaoMin: 0,
        predecessors: [], percentComplete: 0, bac: 0, actualCost: 0, resources: [],
      }
    }
    const pool = group ? [...tasks, group] : tasks
    const wbs = nextChildWbs(pool, parentWbs)
    const task: Task = {
      uid: nextUid(pool),
      wbs,
      name: input.name,
      outlineLevel: wbs.split('.').length,
      isSummary: false,
      duracaoMin: diasParaMinutos(input.durationDays, minutosPorDia.value),
      predecessors: input.predecessorUid
        ? [{ uid: input.predecessorUid, type: input.linkType, lag: { tipo: 'util', minutos: diasParaMinutos(input.lagDays, minutosPorDia.value) } }]
        : [],
      percentComplete: 0,
      bac: Math.round(input.quantity * input.unitCost),
      actualCost: 0,
      resources: input.resources.filter((r) => r.units > 0),
      sinapi: input.code,
      floors: parseFloorRange(input.name),
      notes: `Gerado pelo CronoAI a partir do SINAPI ${input.code}: ${input.quantity.toLocaleString('pt-BR')} ${input.unit}.`,
    }
    return { task, parentWbs, group }
  }

  /** Prévia da inclusão: datas da nova tarefa e impacto na entrega. */
  function previewSinapiTask(input: SinapiInsert): PreviaSinapi {
    const { task, group } = buildSinapiTask(input, state.tasks)
    const tasks = [...state.tasks, ...(group ? [group] : []), task]
    const sim = simular(tasks)
    if (sim.erro !== undefined) return { erro: sim.erro }
    const s = sim.sch
    const sched = s.byUid.get(task.uid)
    return {
      uid: task.uid,
      wbs: task.wbs,
      start: sched?.start,
      finish: sched?.finish,
      critical: !!sched?.critical,
      totalFloat: sched?.totalFloat ?? 0,
      projectFinish: s.projectFinish,
      deltaDays: variacaoSegura(calendar.value, schedule.value.projectFinish, s.projectFinish),
    }
  }

  function removeTask(taskUid: number) {
    const t = taskByUid.value.get(taskUid)
    if (!t || t.isSummary) return
    state.tasks = state.tasks
      .filter((x) => x.uid !== taskUid)
      .map((x) => (x.predecessors.some((p) => p.uid === taskUid) ? { ...x, predecessors: x.predecessors.filter((p) => p.uid !== taskUid) } : x))
    state.materials = state.materials.filter((m) => m.taskUid !== taskUid)
    log('sinapi', `Pacote removido: [UID ${taskUid}] ${t.wbs}`, `${t.name} excluído da EAP; vínculos dependentes removidos.`)
  }

  // ---------------------------------------------------------------- Módulo 4 · planilha orçamentária
  /** Predecessora lógica de engenharia: tarefa que termina por último no grupo anterior (Fundação → Supra → Alvenaria → ...). */
  function suggestPredecessorFor(groupWbs: string, tasks: Task[] = state.tasks, sched = schedule.value): number | undefined {
    const groups = sortByWbs(tasks.filter((t) => t.isSummary && t.outlineLevel === 1)).map((g) => g.wbs)
    const idx = groups.indexOf(groupWbs)
    for (let i = (idx < 0 ? groups.length : idx) - 1; i >= 0; i--) {
      const leaves = tasks.filter((t) => !t.isSummary && t.wbs.startsWith(groups[i] + '.'))
      if (leaves.length) return leaves.reduce((best, t) => ((sched.byUid.get(t.uid)?.terminoCedoMin ?? 0) > (sched.byUid.get(best.uid)?.terminoCedoMin ?? 0) ? t : best)).uid
    }
    return undefined
  }

  function addBudgetLine(line: Omit<BudgetLine, 'id'>) {
    if (state.budget.length >= MAX_BUDGET_LINES) return
    state.budget.push({ ...line, id: uid('b') })
  }

  function updateBudgetLine(id: string, patch: Partial<Omit<BudgetLine, 'id'>>) {
    const l = state.budget.find((x) => x.id === id)
    if (l) Object.assign(l, patch)
  }

  function removeBudgetLine(id: string) {
    state.budget = state.budget.filter((x) => x.id !== id)
  }

  function clearBudget() {
    state.budget = []
  }

  function importBudgetCsv(text: string) {
    const result = parseBudgetCsv(text)
    const room = MAX_BUDGET_LINES - state.budget.length
    for (const l of result.lines.slice(0, room)) state.budget.push({ ...l, id: uid('b') })
    if (result.lines.length > room) result.errors.push(`Limite de ${MAX_BUDGET_LINES} linhas na planilha atingido.`)
    if (result.lines.length) log('sinapi', 'Planilha orçamentária importada', `${Math.min(room, result.lines.length)} linha(s) lidas do CSV.`)
    return { added: Math.min(room, result.lines.length), errors: result.errors }
  }

  /**
   * Monta as tarefas da planilha sobre uma cópia da EAP: ordem de engenharia por grupo,
   * 1ª linha de cada grupo FS na última tarefa do grupo anterior e as demais encadeadas (FS ou SS com defasagem).
   */
  function buildBudgetBatch(lines: BudgetLine[], opts: BatchOptions) {
    let tasks = [...state.tasks]
    const created: Task[] = []
    const existingGroups = new Set(tasks.filter((t) => t.isSummary && t.outlineLevel === 1).map((t) => t.wbs))
    let extraGroup: string | undefined
    const lastInGroup = new Map<string, Task>()
    const sorted = [...lines].sort((a, b) => a.group.localeCompare(b.group))
    for (const l of sorted) {
      const days = lineDuration(l)
      let parentWbs = existingGroups.has(l.group) ? l.group : extraGroup
      const prev = lastInGroup.get(parentWbs ?? '__novo__')
      const sched = computeSchedule(tasks, calendarios.value, optsDaObra(state.meta, 'forecast', state.meta.statusDate)) // lança se estourar: quem chama trata
      const predecessorUid = prev?.uid ?? suggestPredecessorFor(parentWbs ?? '99', tasks, sched)
      const linkType: LinkType = prev && opts.mode === 'SS' ? 'SS' : 'FS'
      const lagDays = prev && opts.mode === 'SS' ? Math.max(1, Math.round((minutosParaDias(prev.duracaoMin, minutosPorDia.value) * opts.overlapPct) / 100)) : 0
      const { task, group } = buildSinapiTask(
        {
          name: lineName(l),
          code: l.code,
          unit: l.unit,
          quantity: l.quantity,
          unitCost: l.unitCost,
          durationDays: days,
          resources: lineResources(l),
          parentWbs: parentWbs ?? '',
          newGroupName: parentWbs ? undefined : 'Serviços complementares (SINAPI)',
          predecessorUid,
          linkType,
          lagDays,
        },
        tasks,
      )
      if (group) {
        tasks = [...tasks, group]
        extraGroup = group.wbs
        parentWbs = group.wbs
      }
      tasks = [...tasks, task]
      created.push(task)
      lastInGroup.set(parentWbs ?? '__novo__', task)
    }
    return { tasks, created }
  }

  function previewBudgetBatch(opts: BatchOptions = DEFAULT_BATCH_OPTIONS): PreviaPlanilha | undefined {
    if (!state.budget.length) return undefined
    let lote: ReturnType<typeof buildBudgetBatch>
    try {
      lote = buildBudgetBatch(state.budget, opts)
    } catch (e) {
      return { erro: mensagemDoCalculo(e) }
    }
    const { tasks, created } = lote
    const sim = simular(tasks)
    if (sim.erro !== undefined) return { erro: sim.erro }
    const s = sim.sch
    return {
      created: created.map((t) => ({ task: t, sched: s.byUid.get(t.uid)! })),
      projectFinish: s.projectFinish,
      deltaDays: variacaoSegura(calendar.value, schedule.value.projectFinish, s.projectFinish),
      bac: created.reduce((a, t) => a + t.bac, 0),
    }
  }

  /** Gera os pacotes da planilha na EAP (com linha de base da inclusão) e esvazia a planilha. */
  function generateFromBudget(opts: BatchOptions = DEFAULT_BATCH_OPTIONS): { ok: true; created: Task[] } | { ok: false; erro: string } {
    if (!state.budget.length) return { ok: true, created: [] }
    let lote: ReturnType<typeof buildBudgetBatch>
    try {
      lote = buildBudgetBatch(state.budget, opts)
    } catch (e) {
      return { ok: false, erro: mensagemDoCalculo(e) }
    }
    const { tasks, created } = lote
    const erro = erroSeAplicar(tasks)
    if (erro) return { ok: false, erro }
    state.tasks = tasks
    for (const t of created) {
      const s = schedule.value.byUid.get(t.uid)
      if (s) patchTask(t.uid, { baselineStart: s.start, baselineFinish: s.finish, baselineDuracaoMin: s.duracaoMin })
    }
    const bac = created.reduce((a, t) => a + t.bac, 0)
    log('sinapi', `Cronograma gerado da planilha SINAPI (${created.length} pacotes)`, `Vínculos ${opts.mode === 'SS' ? `SS com defasagem de ${opts.overlapPct}%` : 'FS em série'} · BAC +${fmtBRL(bac)}.`)
    state.budget = []
    return { ok: true, created }
  }

  // ---------------------------------------------------------------- EAP / XML
  /** Recusa a edição que, aplicada, estouraria o horizonte de 50 anos (simula antes de gravar). */
  function erroSeAplicar(tasks: Task[], meta: ProjectState['meta'] = state.meta, calendariosHipotese: CalendarioObra[] = state.calendarios, feriadosHipotese: ConfigFeriadosObra = state.feriados): string | undefined {
    // toRaw: a simulação não precisa de reatividade e o proxy do Vue deixa o cálculo de 3.000 tarefas várias vezes mais lento
    return verificarCalculo(tasks.map((t) => toRaw(t)), toRaw(meta), calendariosHipotese.map((c) => toRaw(c)), state.calendarioPadraoUid, toRaw(feriadosHipotese))
  }

  function updateTask(taskUid: number, patch: Partial<Task>): ResultadoAcao {
    const atual = taskByUid.value.get(taskUid)
    if (!atual) return { ok: false, erro: 'Tarefa não encontrada.' }
    const completo = patch.percentComplete !== undefined ? { ...patch, ...progressPatch(atual, patch.percentComplete, state.meta.statusDate) } : patch
    const erro = erroSeAplicar(state.tasks.map((t) => (t.uid === taskUid ? { ...t, ...completo } : t)))
    if (erro) return { ok: false, erro }
    if (patch.percentComplete !== undefined) {
      applyProgress(taskUid, patch.percentComplete, state.meta.statusDate)
      const { percentComplete: _ignored, ...rest } = patch
      if (Object.keys(rest).length) patchTask(taskUid, rest)
    } else {
      patchTask(taskUid, patch)
    }
    return { ok: true }
  }

  function saveBaseline() {
    state.tasks = state.tasks.map((t) => {
      const s = schedule.value.byUid.get(t.uid)
      return s ? { ...t, baselineStart: s.start, baselineFinish: s.finish, baselineDuracaoMin: s.duracaoMin } : t
    })
    log('sistema', 'Nova linha de base salva', `Linha de base substituída pelo cronograma reprogramado em ${state.meta.statusDate.split('-').reverse().join('/')}.`)
  }

  /** Muda a data de status; recusa data inválida, a mais de 45 anos do início ou que estoure o horizonte de cálculo. */
  function setStatusDate(iso: string): ResultadoAcao {
    const erro = erroDeStatusForaDaJanela(state.meta.startDate, iso) ?? erroSeAplicar(state.tasks, { ...state.meta, statusDate: iso })
    if (erro) return { ok: false, erro }
    state.meta.statusDate = iso
    log('sistema', 'Data de status alterada', `Nova data de status: ${iso.split('-').reverse().join('/')}.`)
    return { ok: true }
  }

  /** Gera o .xml MSPDI do estado atual e valida estrutura e ordem dos elementos antes de entregar. */
  /**
   * Calendários prontos para o MSPDI: os feriados da obra viram exceções não úteis dos calendários que os aplicam, de 2026 (ano de início)
   * a max(início + 3, término previsto + 1): no exemplo, 2026–2029, como as exceções fixas de antes (a exportação do exemplo não muda).
   */
  function calendariosDeExportacao(): CalendarioObra[] {
    const inicio = Number(state.meta.startDate.slice(0, 4))
    const [de, ate] = faixaDeAnosDaExportacao(inicio, Number(schedule.value.projectFinish.slice(0, 4)) || inicio)
    return calendariosParaExportar(state.calendarios, state.feriados, de, ate)
  }

  function exportXml(): { filename: string; xml: string; validation: MspdiValidation; avisos: string[] } {
    // Recusa o arquivo que o importador não reimportaria inteiro: a soma das exceções dos calendários (com os feriados da obra materializados)
    // passa do limite do import (MAX_CALENDAR_DAYS). Recusar, e não cortar, evita um .xml com feriados faltando.
    const calendariosExport = calendariosDeExportacao()
    const excecoes = calendariosExport.reduce((n, c) => n + c.excecoes.length, 0)
    if (excecoes > MAX_CALENDAR_DAYS) {
      const erro = `A exportação teria ${excecoes.toLocaleString('pt-BR')} exceções de calendário (os feriados da obra viram exceções em cada calendário que os aplica), acima do limite de ${MAX_CALENDAR_DAYS.toLocaleString('pt-BR')} que o importador aceita. Reduza o número de calendários que aplicam os feriados da obra, os feriados cadastrados ou o prazo da obra.`
      return { filename: '', xml: '', validation: { valid: false, errors: [erro], warnings: [], taskCount: 0, linkCount: 0 }, avisos: [] }
    }
    const xml = buildMspdiXml({
      meta: state.meta,
      tasks: state.tasks,
      calendarios: calendariosExport,
      calendarioPadraoUid: state.calendarioPadraoUid,
      schedule: schedule.value,
    })
    const validation = validateMspdi(xml, { strictOrder: true })
    const safe = state.meta.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (validation.valid) {
      log('importacao', 'Exportado para MS Project (.xml)', `${validation.taskCount - 1} tarefas e ${validation.linkCount} vínculos exportados no padrão MSPDI.`)
    }
    // Tarefa manual alterada no CronoAI sai com as datas calculadas (a não alterada sai com as do arquivo)
    const manuais = tarefasManuaisAlteradas(state.tasks)
    const avisos = manuais ? [`${manuais} tarefa(s) manual(is) exportada(s) com datas do CronoAI: foram alteradas depois da importação.`] : []
    return { filename: `${safe}_${state.meta.statusDate}.xml`, xml, validation, avisos }
  }


  function importXml(text: string): string[] {
    const result = parseMspdiXml(text)
    // Jornada, HonorConstraints e Move* são do arquivo: o que o arquivo novo não traz não fica do arquivo anterior
    const { honorConstraintsArquivo: _honor, moveArquivo: _move, minutosPorDia: _jornada, feriadosNacionaisAplicados: _feriados, ...daObra } = state.meta
    const meta = {
      ...daObra,
      ...Object.fromEntries(Object.entries(result.meta).filter(([, v]) => v !== undefined && v !== '')),
    }
    let tasks: Task[]
    try {
      tasks = baselineFor(result.tasks, meta, result.calendarios, result.calendarioPadraoUid, state.feriados, true)
    } catch (e) {
      throw new Error(`Arquivo não importado: ${mensagemDoCalculo(e)}`)
    }
    // O cálculo previsto (data de status), o EVM e a Curva S do estado novo também precisam caber no horizonte de 50 anos
    const erroHorizonte = verificarCalculo(tasks, meta, result.calendarios, result.calendarioPadraoUid, state.feriados)
    if (erroHorizonte) throw new Error(`Arquivo não importado: ${erroHorizonte}`)
    const uids = new Set(tasks.map((t) => t.uid))
    state.meta = meta
    state.tasks = tasks
    state.calendarios = result.calendarios
    state.calendarioPadraoUid = result.calendarioPadraoUid
    state.materials = state.materials.filter((m) => uids.has(m.taskUid))
    state.reports = state.reports.map((r) => (r.approvedUid !== undefined && !uids.has(r.approvedUid) ? { ...r, approvedUid: undefined } : r))
    state.restrictions = state.restrictions.filter((r) => r.taskUid === undefined || uids.has(r.taskUid))
    state.appliedScenarios = []
    state.recoveryCosts = []
    state.undo = []
    log('importacao', 'Importado do MS Project (.xml)', `${tasks.length} tarefas carregadas de "${meta.name}".`)
    return result.warnings
  }

  // ---------------------------------------------------------------- Cronograma: restrições, prazo, calendário e opções (RF-05.3 a RF-05.5)
  /** Opções de cronograma da obra: o padrão (lógica retida, mover o restante) fica ausente, como na obra de exemplo. */
  function gravarOpcoesCronograma(opcoes: OpcoesCronograma) {
    const padrao = opcoes.logica === 'retida' && opcoes.moverRestante
    const atual = state.meta.opcoesCronograma
    if (padrao ? atual === undefined : atual?.logica === opcoes.logica && atual.moverRestante === opcoes.moverRestante) return
    if (padrao) delete state.meta.opcoesCronograma
    else state.meta.opcoesCronograma = { ...opcoes }
    log(
      'sistema',
      'Opções de cronograma alteradas',
      `Lógica ${opcoes.logica === 'retida' ? 'retida' : 'substituir progresso'}; ${opcoes.moverRestante ? 'restante movido para depois da data de status' : 'restante não movido'}.`,
    )
  }

  function tarefaFolha(taskUid: number): { ok: true; tarefa: Task } | { ok: false; erro: string } {
    const t = taskByUid.value.get(taskUid)
    if (!t) return { ok: false, erro: 'Tarefa não encontrada.' }
    if (t.isSummary) return { ok: false, erro: 'Restrição, prazo e calendário só valem para tarefas folha.' }
    return { ok: true, tarefa: t }
  }

  /** Define a restrição de data da tarefa (ASAP remove). Valida tipo e data antes de gravar. */
  function definirRestricao(taskUid: number, tipo: TipoRestricaoTela, data?: string): ResultadoAcao {
    const alvo = tarefaFolha(taskUid)
    if (!alvo.ok) return alvo
    const erros = validarRestricao(tipo, data, state.meta.startDate)
    if (erros.length) return { ok: false, erro: erros[0] }
    const restricao = montarRestricao(tipo, data)
    const { restricao: _antiga, ...resto } = alvo.tarefa
    const idx = state.tasks.findIndex((t) => t.uid === taskUid)
    const nova: Task = restricao ? { ...resto, restricao } : resto
    const estouro = erroSeAplicar(state.tasks.map((t) => (t.uid === taskUid ? nova : t)))
    if (estouro) return { ok: false, erro: estouro }
    state.tasks[idx] = nova
    log(
      'sistema',
      `Restrição alterada: [UID ${taskUid}] ${alvo.tarefa.wbs}`,
      restricao && restricao.tipo !== 'ALAP' ? `${ROTULO_RESTRICAO[restricao.tipo]} em ${restricao.data.replace('T', ' ')}.` : `${ROTULO_RESTRICAO[tipo]}.`,
    )
    return { ok: true }
  }

  /** Define o prazo final da tarefa (vazio remove). O prazo não move a tarefa: entra na folga e no indicador. */
  function definirPrazoFinal(taskUid: number, data?: string): ResultadoAcao {
    const alvo = tarefaFolha(taskUid)
    if (!alvo.ok) return alvo
    const erros = validarPrazoFinal(data, state.meta.startDate)
    if (erros.length) return { ok: false, erro: erros[0] }
    const { prazoFinal: _antigo, ...resto } = alvo.tarefa
    const idx = state.tasks.findIndex((t) => t.uid === taskUid)
    const nova: Task = data ? { ...resto, prazoFinal: data.length > 16 ? data.slice(0, 16) : data } : resto
    const estouro = erroSeAplicar(state.tasks.map((t) => (t.uid === taskUid ? nova : t)))
    if (estouro) return { ok: false, erro: estouro }
    state.tasks[idx] = nova
    log('sistema', `Prazo final alterado: [UID ${taskUid}] ${alvo.tarefa.wbs}`, data ? `Prazo final em ${data.replace('T', ' ')}.` : 'Prazo final removido.')
    return { ok: true }
  }

  const MSG_CALENDARIO_HE = 'Este calendário foi criado por um cenário de hora extra e só vale para as frentes dele: não pode ser atribuído à mão (desfaça o cenário para removê-lo).'
  /** Calendário criado por um cenário de hora extra: só o cenário atribui e só o "desfazer" remove. */
  function ehCalendarioDeHoraExtra(uidCal: number | undefined): boolean {
    return uidCal !== undefined && state.calendarios.find((c) => c.uid === uidCal)?.origem === 'hora-extra'
  }

  /** Escolhe um calendário existente para a tarefa (`undefined` = calendário padrão da obra). Criar e editar calendários: seção seguinte. */
  function definirCalendarioTarefa(taskUid: number, calendarioUid?: number): ResultadoAcao {
    const alvo = tarefaFolha(taskUid)
    if (!alvo.ok) return alvo
    if (!calendarioExiste(state.calendarios, calendarioUid)) return { ok: false, erro: 'O calendário escolhido não existe nesta obra.' }
    if (ehCalendarioDeHoraExtra(calendarioUid)) return { ok: false, erro: MSG_CALENDARIO_HE }
    const { calendarioUid: _antigo, ...resto } = alvo.tarefa
    const idx = state.tasks.findIndex((t) => t.uid === taskUid)
    const nova: Task = calendarioUid !== undefined && calendarioUid !== state.calendarioPadraoUid ? { ...resto, calendarioUid } : resto
    const estouro = erroSeAplicar(state.tasks.map((t) => (t.uid === taskUid ? nova : t)))
    if (estouro) return { ok: false, erro: estouro }
    state.tasks[idx] = nova
    const nome = state.calendarios.find((c) => c.uid === (calendarioUid ?? state.calendarioPadraoUid))?.nome ?? ''
    log('sistema', `Calendário da tarefa alterado: [UID ${taskUid}] ${alvo.tarefa.wbs}`, `Calendário "${nome}".`)
    return { ok: true }
  }

  /** Define as opções de cronograma da obra (lógica de progresso e mover o restante). */
  function definirOpcoesCronograma(opcoes: OpcoesCronograma): ResultadoAcao {
    const erros = validarOpcoesCronograma(opcoes.logica, opcoes.moverRestante)
    if (erros.length) return { ok: false, erro: erros[0] }
    const estouro = erroSeAplicar(state.tasks, { ...state.meta, opcoesCronograma: { ...opcoes } })
    if (estouro) return { ok: false, erro: estouro }
    gravarOpcoesCronograma(opcoes)
    return { ok: true }
  }

  // ---------------------------------------------------------------- Calendários e feriados da obra (ciclo 00005, RF-03.4 e RF-03.5)
  const dataBR = (iso: string) => iso.split('-').reverse().join('/')
  const calendarioDaObra = (uid: number) => state.calendarios.find((c) => c.uid === uid)

  /** Entrega e tarefas que mudam de data se a obra tivesse estes calendários e estes feriados (nada é gravado). */
  function impactoDaHipotese(calendariosHipotese: CalendarioObra[], feriadosHipotese: ConfigFeriadosObra): PreviaImpacto {
    if (calculo.value.erro) return { erro: calculo.value.erro }
    try {
      const cals = compilarCalendarios(state.meta.startDate, calendariosHipotese.map((c) => toRaw(c)), state.calendarioPadraoUid, {
        feriadosPorAno: criarFeriadosPorAno(toRaw(feriadosHipotese)),
      })
      const depois = computeSchedule(state.tasks.map((t) => toRaw(t)), cals, optsDaObra(state.meta, 'forecast', state.meta.statusDate))
      return compararCronogramas(schedule.value, depois, calendarioDeDias(cals.padrao))
    } catch (e) {
      return { erro: mensagemDoCalculo(e) }
    }
  }

  /** Cria um calendário como cópia de outro (padrão da obra, se não informado). Nome único, até 100 calendários. */
  function criarCalendario(dados: { nome: string; copiarDeUid?: number }): ResultadoCalendario {
    if (state.calendarios.length >= MAX_CALENDARIOS) return { ok: false, erro: `No máximo ${MAX_CALENDARIOS} calendários por obra.` }
    const erroNome = erroDoNomeCalendario(dados.nome, state.calendarios)
    if (erroNome) return { ok: false, erro: erroNome }
    const origem = calendarioDaObra(dados.copiarDeUid ?? state.calendarioPadraoUid)
    if (!origem) return { ok: false, erro: 'O calendário de origem não existe nesta obra.' }
    const novo = copiarCalendario(origem, proximoUidCalendario(state.calendarios), dados.nome.trim())
    const estouro = erroSeAplicar(state.tasks, state.meta, [...state.calendarios, novo])
    if (estouro) return { ok: false, erro: estouro }
    state.calendarios.push(novo)
    log('sistema', `Calendário criado: ${novo.nome}`, `Cópia de "${origem.nome}".`)
    return { ok: true, uid: novo.uid }
  }

  /** Grava um calendário alterado, depois de validar o calendário e de simular o cronograma (recusa o que estoura o horizonte). */
  function gravarCalendario(atual: CalendarioObra, novo: CalendarioObra): ResultadoAcao {
    const erro = erroDoCalendario(novo)
    if (erro) return { ok: false, erro: `Calendário inválido: ${erro}` }
    const estouro = erroSeAplicar(state.tasks, state.meta, state.calendarios.map((c) => (c.uid === atual.uid ? novo : c)))
    if (estouro) return { ok: false, erro: estouro }
    state.calendarios = state.calendarios.map((c) => (c.uid === atual.uid ? novo : c))
    return { ok: true }
  }

  /** Renomeia o calendário e/ou troca a jornada da semana (7 posições, domingo a sábado, até 5 intervalos por dia). */
  function editarCalendario(uid: number, dados: { nome?: string; semana?: IntervaloTrabalho[][] }): ResultadoAcao {
    const atual = calendarioDaObra(uid)
    if (!atual) return { ok: false, erro: 'O calendário não existe nesta obra.' }
    if (dados.nome !== undefined) {
      const erroNome = erroDoNomeCalendario(dados.nome, state.calendarios, uid)
      if (erroNome) return { ok: false, erro: erroNome }
    }
    const novo: CalendarioObra = {
      ...atual,
      nome: dados.nome !== undefined ? dados.nome.trim() : atual.nome,
      semana: dados.semana ? dados.semana.map((d) => d.map((iv) => ({ ...iv }))) : atual.semana,
    }
    const r = gravarCalendario(atual, novo)
    if (r.ok) log('sistema', `Calendário alterado: ${novo.nome}`, dados.semana ? 'Jornada da semana alterada.' : `Renomeado de "${atual.nome}".`)
    return r
  }

  /** Define (ou troca) a exceção de uma data: horário próprio (intervalos) ou dia não útil (lista vazia). Descrição de até 80 caracteres. */
  function definirExcecao(uid: number, excecao: ExcecaoCalendario): ResultadoAcao {
    const atual = calendarioDaObra(uid)
    if (!atual) return { ok: false, erro: 'O calendário não existe nesta obra.' }
    const descricao = excecao.descricao?.trim()
    const nova: ExcecaoCalendario = { data: excecao.data, intervalos: excecao.intervalos.map((iv) => ({ ...iv })), ...(descricao ? { descricao } : {}) }
    const novo: CalendarioObra = { ...atual, excecoes: [...atual.excecoes.filter((e) => e.data !== nova.data), nova].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)) }
    const r = gravarCalendario(atual, novo)
    if (r.ok) log('sistema', `Exceção definida: ${atual.nome}`, `${dataBR(nova.data)}: ${nova.intervalos.length ? 'horário próprio' : 'dia não útil'}.`)
    return r
  }

  function removerExcecao(uid: number, data: string): ResultadoAcao {
    const atual = calendarioDaObra(uid)
    if (!atual) return { ok: false, erro: 'O calendário não existe nesta obra.' }
    if (!atual.excecoes.some((e) => e.data === data)) return { ok: false, erro: 'Não há exceção nesta data.' }
    const r = gravarCalendario(atual, { ...atual, excecoes: atual.excecoes.filter((e) => e.data !== data) })
    if (r.ok) log('sistema', `Exceção removida: ${atual.nome}`, `${dataBR(data)}.`)
    return r
  }

  /**
   * Exclui um calendário. O padrão não se exclui; o de hora extra só sai pelo "desfazer" do cenário; um calendário em uso só se exclui
   * movendo as tarefas para o calendário padrão (`moverTarefasParaPadrao`, depois da confirmação do usuário).
   */
  function excluirCalendario(uid: number, opcoes: { moverTarefasParaPadrao?: boolean } = {}): ResultadoAcao {
    const atual = calendarioDaObra(uid)
    if (!atual) return { ok: false, erro: 'O calendário não existe nesta obra.' }
    if (uid === state.calendarioPadraoUid) return { ok: false, erro: 'O calendário padrão da obra não pode ser excluído.' }
    if (atual.origem === 'hora-extra') return { ok: false, erro: 'Este calendário foi criado por um cenário de hora extra: desfaça o cenário para removê-lo.' }
    const emUso = state.tasks.filter((t) => t.calendarioUid === uid)
    if (emUso.length && !opcoes.moverTarefasParaPadrao) {
      return { ok: false, erro: `O calendário está em uso por ${emUso.length} tarefa(s): confirme para movê-las ao calendário padrão.` }
    }
    const tarefas = state.tasks.map((t) => {
      if (t.calendarioUid !== uid) return t
      const { calendarioUid: _removido, ...resto } = t
      return resto
    })
    const estouro = erroSeAplicar(tarefas, state.meta, state.calendarios.filter((c) => c.uid !== uid))
    if (estouro) return { ok: false, erro: estouro }
    state.tasks = tarefas
    state.calendarios = state.calendarios.filter((c) => c.uid !== uid)
    log('sistema', `Calendário excluído: ${atual.nome}`, emUso.length ? `${emUso.length} tarefa(s) passaram ao calendário padrão.` : 'Sem tarefas atribuídas.')
    return { ok: true }
  }

  /** Atribui um calendário a várias tarefas folha de uma vez (`undefined` = calendário padrão). Tudo ou nada: uma tarefa inválida recusa o lote. */
  function atribuirCalendario(uids: number[], calendarioUid?: number): ResultadoAcao {
    if (!uids.length) return { ok: false, erro: 'Nenhuma tarefa selecionada.' }
    if (!calendarioExiste(state.calendarios, calendarioUid)) return { ok: false, erro: 'O calendário escolhido não existe nesta obra.' }
    if (ehCalendarioDeHoraExtra(calendarioUid)) return { ok: false, erro: MSG_CALENDARIO_HE }
    const alvos = new Set<number>()
    for (const u of uids) {
      const alvo = tarefaFolha(u)
      if (!alvo.ok) return alvo
      alvos.add(u)
    }
    const atribuir = calendarioUid !== undefined && calendarioUid !== state.calendarioPadraoUid
    const tarefas = state.tasks.map((t) => {
      if (!alvos.has(t.uid)) return t
      const { calendarioUid: _antigo, ...resto } = t
      return atribuir ? { ...resto, calendarioUid } : resto
    })
    const estouro = erroSeAplicar(tarefas)
    if (estouro) return { ok: false, erro: estouro }
    state.tasks = tarefas
    const nome = calendarioDaObra(calendarioUid ?? state.calendarioPadraoUid)?.nome ?? ''
    log('sistema', `Calendário atribuído a ${alvos.size} tarefa(s)`, `Calendário "${nome}".`)
    return { ok: true }
  }

  /** Liga ou desliga os nacionais, o Carnaval e o Corpus Christi da obra (os manuais têm ação própria). */
  function definirConfigFeriados(parcial: Partial<Pick<ConfigFeriadosObra, 'nacionais' | 'carnaval' | 'corpusChristi'>>): ResultadoAcao {
    const nova: ConfigFeriadosObra = { ...clone(state.feriados), ...parcial }
    const estouro = erroSeAplicar(state.tasks, state.meta, state.calendarios, nova)
    if (estouro) return { ok: false, erro: estouro }
    state.feriados = nova
    const rotulo = (v: boolean) => (v ? 'sim' : 'não')
    log('sistema', 'Feriados da obra alterados', `Nacionais: ${rotulo(nova.nacionais)}; Carnaval: ${rotulo(nova.carnaval)}; Corpus Christi: ${rotulo(nova.corpusChristi)}.`)
    return { ok: true }
  }

  /** Cadastra um feriado à mão (fonte obrigatória). Feriado estadual ou municipal guarda a UF e o município da obra, se não informados. */
  function adicionarFeriadoManual(dados: NovoFeriadoManual): ResultadoAcao {
    const local = dados.abrangencia === 'estadual' || dados.abrangencia === 'municipal'
    const feriado: NovoFeriadoManual = {
      ...dados,
      nome: dados.nome.trim(),
      fonte: dados.fonte.trim(),
      ...(local && dados.uf === undefined && state.meta.uf ? { uf: state.meta.uf } : {}),
      ...(dados.abrangencia === 'municipal' && dados.municipio === undefined && state.meta.municipio ? { municipio: state.meta.municipio } : {}),
    }
    const erros = validarFeriadoManual(feriado, state.feriados.manuais)
    if (erros.length) return { ok: false, erro: erros[0] }
    const nova: ConfigFeriadosObra = { ...clone(state.feriados), manuais: [...clone(state.feriados.manuais), { ...feriado, id: uid('fer') }] }
    const estouro = erroSeAplicar(state.tasks, state.meta, state.calendarios, nova)
    if (estouro) return { ok: false, erro: estouro }
    state.feriados = nova
    log('sistema', `Feriado cadastrado: ${feriado.nome}`, `${dataBR(feriado.data)}${feriado.recorrenteAnual ? ' (todo ano)' : ''}. Fonte: ${feriado.fonte}`)
    return { ok: true }
  }

  function removerFeriadoManual(id: string): ResultadoAcao {
    const f = state.feriados.manuais.find((x) => x.id === id)
    if (!f) return { ok: false, erro: 'Feriado não encontrado.' }
    const nova: ConfigFeriadosObra = { ...clone(state.feriados), manuais: state.feriados.manuais.filter((x) => x.id !== id).map((x) => clone(x)) }
    const estouro = erroSeAplicar(state.tasks, state.meta, state.calendarios, nova)
    if (estouro) return { ok: false, erro: estouro }
    state.feriados = nova
    log('sistema', `Feriado removido: ${f.nome}`, `${dataBR(f.data)}.`)
    return { ok: true }
  }

  function comAplicaFeriados(uid: number, aplicar: boolean): CalendarioObra[] {
    return state.calendarios.map((c) => {
      if (c.uid !== uid) return c
      const { aplicaFeriadosObra: _antigo, ...resto } = c
      return aplicar ? { ...resto, aplicaFeriadosObra: true } : resto
    })
  }

  /** Prévia de "Aplicar feriados da obra" (ou de removê-los) a um calendário: entrega antes → depois e tarefas que mudam de data. */
  function previaAplicarFeriados(uid: number, aplicar = true): PreviaImpacto {
    if (!calendarioDaObra(uid)) return { erro: 'O calendário não existe nesta obra.' }
    return impactoDaHipotese(comAplicaFeriados(uid, aplicar), state.feriados)
  }

  /** Aplica (ou remove) os feriados da obra num calendário: ação explícita do usuário, depois de ver a prévia. */
  function aplicarFeriadosObra(uid: number, aplicar = true): ResultadoAcao {
    const atual = calendarioDaObra(uid)
    if (!atual) return { ok: false, erro: 'O calendário não existe nesta obra.' }
    const calendariosNovos = comAplicaFeriados(uid, aplicar)
    const estouro = erroSeAplicar(state.tasks, state.meta, calendariosNovos)
    if (estouro) return { ok: false, erro: estouro }
    state.calendarios = calendariosNovos
    log('sistema', aplicar ? `Feriados da obra aplicados: ${atual.nome}` : `Feriados da obra removidos: ${atual.nome}`, aplicar ? 'O calendário passou a considerar os feriados da obra.' : 'O calendário deixou de considerar os feriados da obra.')
    return { ok: true }
  }

  /** Feriados manuais de outro local (UF ou município) e o impacto de removê-los, para a troca de local da obra. */
  function previaTrocaLocal(uf?: string, municipio?: string): PreviaTrocaLocal {
    const foraDoLocal = feriadosForaDoLocal(state.feriados, uf || undefined, municipio)
    const semFeriadosLocais = !state.feriados.manuais.some((f) => f.abrangencia === 'estadual' || f.abrangencia === 'municipal')
    if (!foraDoLocal.length) return { foraDoLocal, semFeriadosLocais }
    const ids = new Set(foraDoLocal.map((f) => f.id))
    const semEles: ConfigFeriadosObra = { ...clone(state.feriados), manuais: state.feriados.manuais.filter((f) => !ids.has(f.id)).map((f) => clone(f)) }
    return { foraDoLocal, semFeriadosLocais, impactoDeRemover: impactoDaHipotese(state.calendarios, semEles) }
  }

  // ---------------------------------------------------------------- Obras (SPEC-14)
  /** Grava a obra atual antes de uma troca, se houver o que gravar. Falhou: a troca é cancelada, para não perder alterações. */
  async function garantirObraAtualSalva(): Promise<boolean> {
    await nextTick() // deixa o observador do estado marcar como "pendente" uma alteração feita neste mesmo instante
    // Grava sempre que houver alteração pendente (o observador já marcou ou o atraso ainda corre)
    return estadoGravacao.value === 'salvo' && !timerPendente ? true : salvarAgora()
  }

  const ERRO_BLOQUEADO = 'As obras não foram carregadas com segurança: nada será gravado até recarregar a página.'
  const ERRO_SALVAR_ANTES = 'A obra atual não pôde ser salva. Resolva o aviso de armazenamento antes de trocar de obra.'

  function indiceComAtivaNova(ativaId: string, obrasLista: ResumoObra[]): IndiceObras {
    const base = indice ?? { versaoIndice: 1 as const, obraAtivaId: ativaId, obras: [] }
    return { ...base, obraAtivaId: ativaId, obras: obrasLista }
  }

  /** Troca a obra ativa: grava a atual, lê e migra a nova, grava o índice e só então muda a tela. */
  async function trocarObra(id: string): Promise<ResultadoAcao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    if (id === obraAtivaId.value) return { ok: true }
    if (!(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const r = await abrirRegistro(id)
    if (!('estado' in r)) {
      marcarIlegivel(id, true)
      return { ok: false, erro: r.erro }
    }
    const lista = (indice?.obras ?? obrasPlanas()).map((o) => (o.id === id ? { ...o, ilegivel: undefined } : o))
    const novoIndice = indiceComAtivaNova(id, lista)
    try {
      await armazenamento.gravarIndice(novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    obraAtivaId.value = id
    await aplicarEstado(r.estado)
    return { ok: true }
  }

  /** Cria uma obra (em branco ou a de exemplo) e a torna ativa. */
  async function criarObra(nova: NovaObra): Promise<ResultadoCriacao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    let estado: PersistedState
    if (nova.modelo === 'branco') {
      const erros = validarDadosObra(nova.dados)
      if (erros.length) return { ok: false, erro: erros[0], erros }
      estado = estadoObraVazia(nova.dados)
    } else {
      estado = buildSeedState()
      // Nome único na lista: "Edifício … (2)" quando o exemplo já existe
      const nomes = obras.value.map((o) => o.nome)
      let nome = SEED_META.name
      for (let n = 2; nomes.includes(nome); n++) nome = `${SEED_META.name} (${n})`
      estado.meta.name = nome
    }
    if (!(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const id = uid('obra')
    const em = agora()
    const novoIndice = indiceComAtivaNova(id, [...(indice?.obras ?? obrasPlanas()), resumirObra(id, estado, em)])
    try {
      await armazenamento.gravarObra(criarRegistro(id, estado, em), novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    obraAtivaId.value = id
    await aplicarEstado(estado)
    return { ok: true, id }
  }

  /** Copia uma obra para uma nova, independente (não a torna ativa). */
  async function duplicarObra(id: string): Promise<ResultadoCriacao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    if (id === obraAtivaId.value && !(await garantirObraAtualSalva())) return { ok: false, erro: ERRO_SALVAR_ANTES }
    const origem = id === obraAtivaId.value ? { estado: clone(state) } : await abrirRegistro(id)
    if (!('estado' in origem)) return { ok: false, erro: origem.erro }
    const copia = origem.estado
    copia.meta.name = nomeDaCopia(copia.meta.name, obras.value.map((o) => o.nome))
    const novoId = uid('obra')
    const em = agora()
    const base = indice ?? indiceComAtivaNova(obraAtivaId.value, obrasPlanas())
    const novoIndice: IndiceObras = { ...base, obras: [...base.obras, resumirObra(novoId, copia, em)] }
    try {
      await armazenamento.gravarObra(criarRegistro(novoId, copia, em), novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    return { ok: true, id: novoId }
  }

  /** Exclui uma obra. A única não é excluída; excluir a ativa abre a 1ª outra obra legível. */
  async function excluirObra(id: string): Promise<ResultadoAcao> {
    const tinhaGravacaoPendente = timerPendente
    const r = await excluirObraInterno(id)
    // Falhou: a obra continua aberta e o que estava pendente nela precisa ser gravado
    if (!r.ok && tinhaGravacaoPendente && id === obraAtivaId.value && !gravacaoBloqueada.value) agendarGravacao()
    return r
  }

  async function excluirObraInterno(id: string): Promise<ResultadoAcao> {
    if (!armazenamento || gravacaoBloqueada.value) return { ok: false, erro: gravacaoBloqueada.value ? ERRO_BLOQUEADO : 'As obras ainda não foram carregadas.' }
    const lista = indice?.obras ?? obrasPlanas()
    if (!lista.some((o) => o.id === id)) return { ok: false, erro: 'Obra não encontrada.' }
    if (lista.length <= 1) return { ok: false, erro: 'A obra não pode ser excluída: é a única.' }
    const restantes = lista.filter((o) => o.id !== id)
    const eraAtiva = id === obraAtivaId.value
    let proxima: { id: string; estado: PersistedState } | undefined
    if (eraAtiva) {
      clearTimeout(saveTimer) // alterações pendentes são da obra que será excluída
      timerPendente = false
      for (const o of restantes) {
        const r = await abrirRegistro(o.id)
        if ('estado' in r) {
          proxima = { id: o.id, estado: r.estado }
          break
        }
        marcarIlegivel(o.id, true)
      }
      if (!proxima) return { ok: false, erro: 'Não há outra obra legível para abrir no lugar desta.' }
    } else if (!(await garantirObraAtualSalva())) {
      return { ok: false, erro: ERRO_SALVAR_ANTES }
    }
    await fila // uma gravação em andamento não pode ressuscitar a obra excluída
    const atual = indice ?? indiceComAtivaNova(obraAtivaId.value, lista.map((o) => ({ ...o })))
    const novoIndice: IndiceObras = {
      ...atual,
      obraAtivaId: proxima?.id ?? obraAtivaId.value,
      obras: atual.obras.filter((o) => o.id !== id),
    }
    try {
      await armazenamento.excluirObra(id, novoIndice)
    } catch (err) {
      return { ok: false, erro: mensagemDeFalha(err) }
    }
    aceitarIndice(novoIndice)
    if (proxima) {
      obraAtivaId.value = proxima.id
      await aplicarEstado(proxima.estado)
      estadoGravacao.value = armazenamentoIndisponivel.value ? 'erro' : 'salvo'
    }
    return { ok: true }
  }

  /** Edita os dados da obra ativa. A data de status passa por `setStatusDate` (com registro no log). */
  function atualizarDadosObra(dados: DadosObra, opcoes: { removerFeriadosDeOutroLocal?: boolean } = {}): { ok: true } | { ok: false; erros: string[] } {
    const erros = validarDadosObra(dados, {
      inicioOriginal: state.meta.startDate,
      statusOriginal: state.meta.statusDate,
      comAvanco: obraComAvanco.value,
      primeiroInicioReal: primeiroInicioReal.value,
    })
    if (erros.length) return { ok: false, erros }
    // Simula antes de gravar: início, status e opções que estourem o horizonte de 50 anos são recusados
    const opcoesNovas =
      dados.logicaProgresso !== undefined || dados.moverRestante !== undefined
        ? {
            logica: dados.logicaProgresso ?? state.meta.opcoesCronograma?.logica ?? 'retida',
            moverRestante: dados.moverRestante ?? state.meta.opcoesCronograma?.moverRestante ?? true,
          }
        : state.meta.opcoesCronograma
    const estouro = erroSeAplicar(state.tasks, { ...state.meta, startDate: dados.dataInicio, statusDate: dados.dataStatus, opcoesCronograma: opcoesNovas })
    if (estouro) return { ok: false, erros: [estouro] }
    const meta = state.meta
    meta.name = dados.nome.trim()
    meta.manager = (dados.responsavel ?? '').trim()
    if (dados.dataInicio !== meta.startDate) {
      meta.startDate = dados.dataInicio
      // A data de início é a base do calendário: as tarefas não iniciadas são reprogramadas; a linha de base (datas ISO) não muda
      log('sistema', 'Data de início alterada', `Nova data de início: ${dados.dataInicio.split('-').reverse().join('/')}. Tarefas não iniciadas foram reprogramadas; a linha de base não mudou.`)
    }
    // Campo opcional vazio = "não informado": a propriedade some, como na obra de exemplo
    if (dados.uf) meta.uf = dados.uf
    else delete meta.uf
    if (dados.municipio?.trim()) meta.municipio = dados.municipio.trim()
    else delete meta.municipio
    if (dados.regimeSinapi) meta.regimeSinapi = dados.regimeSinapi
    else delete meta.regimeSinapi
    if (dados.dataBaseSinapi) meta.dataBaseSinapi = dados.dataBaseSinapi
    else delete meta.dataBaseSinapi
    // Troca de local: os feriados manuais de outra UF ou município ficam ("manter") ou saem ("remover"), por escolha do usuário na prévia
    if (opcoes.removerFeriadosDeOutroLocal) {
      const fora = feriadosForaDoLocal(state.feriados, dados.uf || undefined, dados.municipio?.trim())
      if (fora.length) {
        const ids = new Set(fora.map((f) => f.id))
        state.feriados = { ...clone(state.feriados), manuais: state.feriados.manuais.filter((f) => !ids.has(f.id)).map((f) => clone(f)) }
        log('sistema', 'Feriados de outro local removidos', `${fora.length} feriado(s) estadual(is) ou municipal(is) de outra UF ou município saíram da obra.`)
      }
    }
    if (dados.dataStatus !== meta.statusDate) setStatusDate(dados.dataStatus)
    if (dados.logicaProgresso !== undefined || dados.moverRestante !== undefined) {
      const atual = meta.opcoesCronograma
      gravarOpcoesCronograma({ logica: dados.logicaProgresso ?? atual?.logica ?? 'retida', moverRestante: dados.moverRestante ?? atual?.moverRestante ?? true })
    }
    obras.value = obras.value.map((o) => (o.id === obraAtivaId.value ? resumirObra(o.id, state, o.atualizadoEm) : o))
    return { ok: true }
  }

  return {
    state,
    calendar,
    baseCalendar,
    calendarios,
    calendariosPv,
    minutosPorDia,
    schedule,
    erroCronograma,
    avisoRestanteAntesDoStatus,
    divergencias,
    definirRestricao,
    definirPrazoFinal,
    definirCalendarioTarefa,
    criarCalendario,
    editarCalendario,
    excluirCalendario,
    definirExcecao,
    removerExcecao,
    atribuirCalendario,
    definirConfigFeriados,
    adicionarFeriadoManual,
    removerFeriadoManual,
    previaAplicarFeriados,
    aplicarFeriadosObra,
    previaTrocaLocal,
    definirOpcoesCronograma,
    rollups,
    tasksByWbs,
    leaves,
    taskByUid,
    evm,
    packageEvm,
    sCurve,
    sCurveFor,
    evmFor,
    evmForecast,
    delay,
    semCronograma,
    semOrcamento,
    primeiroInicioReal,
    obraComAvanco,
    scenarios,
    agendaFT,
    agendaHE,
    scenarioParams,
    scenarioOptions,
    recommendation,
    resetScenarioParams,
    supplies,
    premissasVigentes,
    versaoPremissasVigente,
    criarVersaoPremissas,
    safetyMarginDays,
    updateMaterial,
    addMaterial,
    registerDelivery,
    removeMaterial,
    recoveryTotal,
    finishVarianceDays,
    msProjectTasks,
    msProjectTask,
    interpret,
    previewProgress,
    previewTaskXml,
    approveReport,
    rejectReport,
    addReport,
    resolveRestriction,
    applyScenario,
    appliedResult,
    undoScenario,
    orderMaterial,
    rescheduleDelivery,
    addSinapiTask,
    suggestPredecessorFor,
    addBudgetLine,
    updateBudgetLine,
    removeBudgetLine,
    clearBudget,
    importBudgetCsv,
    previewBudgetBatch,
    generateFromBudget,
    previewSinapiTask,
    removeTask,
    updateTask,
    saveBaseline,
    setStatusDate,
    exportXml,
    importXml,
    obras,
    obraAtivaId,
    estadoGravacao,
    mensagemGravacao,
    alertaCota,
    avisosCarga,
    armazenamentoIndisponivel,
    migracaoV1,
    carregado,
    gravacaoBloqueada,
    bloquearGravacao,
    carregar,
    salvarAgora,
    trocarObra,
    criarObra,
    duplicarObra,
    excluirObra,
    atualizarDadosObra,
  }
})
