// Tipos de domínio do CronoAI (cronograma, EVM, suprimentos e apontamentos de canteiro)
import type { RegimeSinapi, UF } from '@/data/ufs'

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

/** Faixa de trabalho dentro do dia, em minutos desde 00:00 (0–1440; 1440 = 24:00). */
export interface IntervaloTrabalho {
  de: number
  ate: number
}

/** Dia com horário próprio (lista vazia = dia não útil). `data` é `yyyy-mm-dd`. */
export interface ExcecaoCalendario {
  data: string
  intervalos: IntervaloTrabalho[]
}

/** Calendário da obra: semana por intervalo de horário e exceções (ADR 00003). */
export interface CalendarioObra {
  /** UID do calendário (no MSPDI, `Calendar/UID`). */
  uid: number
  nome: string
  /** 7 posições: 0 = domingo … 6 = sábado; no máximo 5 intervalos por dia (esquema MSPDI). */
  semana: IntervaloTrabalho[][]
  excecoes: ExcecaoCalendario[]
}

/**
 * Latência do vínculo (negativa = antecipação). `util`: minutos úteis, contados no calendário da sucessora;
 * `corrido`: minutos de relógio (24 h por dia, sem calendário); `percentual`: % da duração da predecessora.
 * `codigoMspdi` guarda o `LagFormat` do arquivo para devolvê-lo na exportação.
 */
export type Lag =
  | { tipo: 'util'; minutos: number; codigoMspdi?: number }
  | { tipo: 'corrido'; minutos: number; codigoMspdi?: number }
  | { tipo: 'percentual'; percentual: number; codigoMspdi?: number }

/** Restrições de data com data (as outras, ASAP, é a ausência de restrição, e ALAP não tem data). */
export const RESTRICOES_COM_DATA = ['SNET', 'SNLT', 'MSO', 'MFO', 'FNET', 'FNLT'] as const
export type RestricaoComData = (typeof RESTRICOES_COM_DATA)[number]

/**
 * Restrição de data da tarefa (os códigos do MS Project: SNET 4, SNLT 5, MSO 2, MFO 3, FNET 6, FNLT 7, ALAP 1).
 * `data` é `yyyy-mm-dd` (início do expediente nas de início; fim do expediente nas de término) ou `yyyy-mm-ddThh:mm`,
 * hora local sem fuso. `inferida`: o import deduziu a restrição (tarefa sem vínculo), o arquivo não a tinha.
 */
export type Restricao = { tipo: RestricaoComData; data: string; inferida?: true } | { tipo: 'ALAP' }

/** Opções de cronograma da obra (RF-05.5). */
export interface OpcoesCronograma {
  /**
   * `retida` (padrão do MS Project): o restante de tarefa iniciada fora de sequência começa depois da predecessora e
   * restringe a predecessora na volta. `substituir`: o progresso substitui a lógica (ignora a predecessora).
   */
  logica: 'retida' | 'substituir'
  /** Política do CronoAI: o restante (e a tarefa não iniciada) começa depois da data de status. */
  moverRestante: boolean
}

/**
 * Dados de uma tarefa como vieram do MSPDI. Só tarefas folha; ausente quando a tarefa não veio de arquivo.
 * `inicio` e `termino` são `Start`/`Finish` do arquivo (`yyyy-mm-dd`); `restricao` e `prazoFinal` são os explícitos
 * (a restrição inferida pelo import não entra aqui); `manual` guarda `Manual` (agendada manualmente) e `ativa`, o `Active`.
 */
export interface DadosDoArquivo {
  inicio?: string
  termino?: string
  duracaoMin: number
  percentComplete: number
  restricao?: Restricao
  prazoFinal?: string
  manual?: boolean
  ativa?: true
  /** `LevelingDelay` > 0: o MS Project atrasou a tarefa por nivelamento de recursos. */
  nivelamento?: true
}

export interface PredecessorLink {
  uid: number
  type: LinkType
  lag: Lag
}

export const RESOURCE_KINDS = [
  'Pedreiro',
  'Servente',
  'Carpinteiro',
  'Armador',
  'Eletricista',
  'Encanador',
  'Gesseiro',
  'Azulejista',
  'Pintor',
  'Operador de equipamento',
] as const
export type ResourceKind = (typeof RESOURCE_KINDS)[number]

export interface ResourceAssignment {
  /** Função do catálogo ou nome livre vindo de um .xml importado. */
  resource: ResourceKind | (string & {})
  /** Quantidade de profissionais alocados (1 = 100%). */
  units: number
}

export interface Task {
  uid: number
  wbs: string
  name: string
  outlineLevel: number
  isSummary: boolean
  /** Duração planejada em minutos úteis (ADR 00003). Para resumo é calculada. */
  duracaoMin: number
  /** Calendário da tarefa (UID em `ProjectState.calendarios`); ausente = padrão da obra. */
  calendarioUid?: number
  predecessors: PredecessorLink[]
  percentComplete: number
  actualStart?: string
  actualFinish?: string
  /** Orçamento na conclusão do pacote (R$). */
  bac: number
  /** Custo real incorrido (R$). */
  actualCost: number
  resources: ResourceAssignment[]
  sinapi?: string
  /** Lead time do insumo crítico do pacote (dias corridos). */
  leadTimeDays?: number
  baselineStart?: string
  baselineFinish?: string
  baselineDuracaoMin?: number
  /** Restrição de data (ausente = ASAP, o mais cedo possível). */
  restricao?: Restricao
  /** Prazo final (`yyyy-mm-dd` = fim do expediente, ou `yyyy-mm-ddThh:mm`): não move a tarefa, entra na folga e no indicador. */
  prazoFinal?: string
  /** Duração em tempo corrido (relógio de 24 h, `DurationFormat` corrido do MS Project). */
  duracaoCorrida?: true
  /** O que o arquivo MSPDI trouxe para esta tarefa (datas e marcas), para a ida e volta e o painel de divergências. */
  arquivo?: DadosDoArquivo
  /** Pavimentos atendidos [de, até] — usado pelo match semântico. */
  floors?: [number, number]
  notes?: string
}

/** Configuração simples de calendário (seg–sex, feriados e dias extras), só para `WorkCalendar` (contas por dia útil). */
export interface WorkCalendarConfig {
  /** Feriados / dias não úteis (ISO yyyy-mm-dd). */
  holidays: string[]
  /** Dias normalmente não úteis convertidos em úteis (ex.: sábados de hora extra). */
  extraWorkingDays: string[]
}

export interface ProjectMeta {
  name: string
  company: string
  manager: string
  startDate: string
  statusDate: string
  /** Custo indireto diário da obra (R$/dia útil): canteiro, equipe técnica, equipamentos. */
  dailyIndirectCost: number
  /** Margem de segurança da Data Limite de Pedido (dias corridos). */
  safetyMarginDays?: number
  /** UF da obra (ausente = não informada; nunca assumida). */
  uf?: UF
  municipio?: string
  /** Regime de encargos da tabela SINAPI da obra. */
  regimeSinapi?: RegimeSinapi
  /** Data-base da tabela SINAPI (AAAA-MM). */
  dataBaseSinapi?: string
  /** Minutos de trabalho por dia, só para exibir dias (ausente = 480). */
  minutosPorDia?: number
  /** Opções de cronograma (ausente = lógica retida e mover o restante para depois da data de status). */
  opcoesCronograma?: OpcoesCronograma
  /** `HonorConstraints` do arquivo (0 ou 1), só para a volta. O cálculo sempre honra as restrições (gate P2); obra sem valor exporta 0. */
  honorConstraintsArquivo?: number
  /** As 4 opções `Move*` do arquivo, preservadas na ida e volta sem entrar no cálculo. */
  moveArquivo?: MoveArquivo
}

/** Opções "Mover ..." do MS Project (Project/Move*): só preservadas, o motor não as usa. */
export interface MoveArquivo {
  completedEndsBack?: boolean
  remainingStartsBack?: boolean
  remainingStartsForward?: boolean
  completedEndsForward?: boolean
}

export interface ScheduledTask {
  uid: number
  /** Momentos em minutos de relógio desde 00:00 da data-base da obra (início e término são os cedo e os tarde). */
  inicioCedoMin: number
  terminoCedoMin: number
  inicioTardeMin: number
  terminoTardeMin: number
  /** Datas (yyyy-mm-dd) dos momentos cedo e tarde. */
  earlyStart: string
  earlyFinish: string
  lateStart: string
  lateFinish: string
  /** Início e término da tarefa (datas reais quando houver). */
  start: string
  finish: string
  /** Hora (hh:mm) do início e do término calculados. */
  inicioHora: string
  terminoHora: string
  /** Folgas em minutos úteis do calendário da tarefa. */
  folgaTotalMin: number
  folgaLivreMin: number
  /** Folgas em dias (minutos ÷ minutos por dia da obra; pode ser fracionário). */
  totalFloat: number
  freeFloat: number
  critical: boolean
  /** Duração efetiva usada pelo cálculo, em minutos úteis. */
  duracaoMin: number
  restanteMin: number
  /** Tarefa de duração corrida: a folga é medida em 24 h e exibida em dias corridos. */
  corrida: boolean
  /** O término calculado passa do prazo final. */
  prazoFinalPerdido: boolean
  /** A restrição (SNLT, FNLT, MSO ou MFO) prevalece sobre os vínculos: a tarefa começa antes do que eles permitem. */
  restricaoConflito: boolean
}

export interface ScheduleResult {
  byUid: Map<number, ScheduledTask>
  projectStart: string
  projectFinish: string
  /** Momento do término do projeto (minutos desde 00:00 da data-base). */
  terminoProjetoMin: number
  criticalPath: number[]
  /** Ordem topológica (UIDs folha). */
  order: number[]
}

export type ReportStatus = 'pendente' | 'aprovado' | 'rejeitado'

export interface FieldReport {
  id: string
  author: string
  role: string
  avatarColor: string
  timestamp: string
  channel: 'audio' | 'texto'
  audioSeconds?: number
  transcript: string
  photo?: PhotoKind
  photoUrl?: string
  status: ReportStatus
  approvedUid?: number
  approvedPercent?: number
  previousPercent?: number
}

export type PhotoKind = 'alvenaria' | 'estrutura' | 'eletrica' | 'betoneira' | 'reboco' | 'piso'

export type RestrictionKind = 'clima' | 'material' | 'mao-de-obra' | 'equipamento' | 'seguranca' | 'projeto'

export interface DetectedRestriction {
  kind: RestrictionKind
  label: string
  detail: string
  /** Horas de paralisação estimadas (quando aplicável). */
  lostHours?: number
  material?: string
}

export interface MatchCandidate {
  uid: number
  score: number
  confidence: number
  reasons: string[]
}

export interface AiInterpretation {
  candidates: MatchCandidate[]
  best?: MatchCandidate
  suggestedPercent?: number
  percentEvidence?: string
  restrictions: DetectedRestriction[]
  floor?: number
}

export interface SiteRestriction extends DetectedRestriction {
  id: string
  date: string
  taskUid?: number
  reportId?: string
  resolved: boolean
}

export interface MaterialItem {
  id: string
  name: string
  spec: string
  unit: string
  quantity: number
  supplier: string
  taskUid: number
  leadTimeDays: number
  ordered: boolean
  orderDate?: string
  deliveryDate?: string
  unitPrice: number
}

export type ScenarioKind = 'crashing' | 'fast-tracking' | 'overtime'

export interface DecisionLogEntry {
  id: string
  date: string
  kind: 'apontamento' | 'cenario' | 'sinapi' | 'suprimentos' | 'importacao' | 'sistema'
  title: string
  detail: string
}

export interface RecoveryCost {
  id: string
  scenario: ScenarioKind
  label: string
  amount: number
}

export interface ProjectState {
  meta: ProjectMeta
  tasks: Task[]
  calendarios: CalendarioObra[]
  /** UID do calendário padrão da obra (o das tarefas sem `calendarioUid`). */
  calendarioPadraoUid: number
  reports: FieldReport[]
  restrictions: SiteRestriction[]
  materials: MaterialItem[]
  recoveryCosts: RecoveryCost[]
  appliedScenarios: ScenarioKind[]
  log: DecisionLogEntry[]
}
