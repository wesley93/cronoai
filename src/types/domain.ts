// Tipos de domínio do CronoAI (cronograma, EVM, suprimentos e apontamentos de canteiro)
import type { RegimeSinapi, UF } from '@/data/ufs'

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export interface PredecessorLink {
  uid: number
  type: LinkType
  /** Latência em dias úteis (pode ser negativa = antecipação). */
  lagDays: number
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
  /** Duração planejada (dias úteis). Para resumo é calculada. */
  durationDays: number
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
  baselineDuration?: number
  /** Restrição "Não iniciar antes de" (ISO). */
  snet?: string
  /** Pavimentos atendidos [de, até] — usado pelo match semântico. */
  floors?: [number, number]
  notes?: string
}

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
}

export interface ScheduledTask {
  uid: number
  es: number
  ef: number
  ls: number
  lf: number
  totalFloat: number
  freeFloat: number
  critical: boolean
  start: string
  finish: string
  /** Duração efetiva usada pelo cálculo (dias úteis). */
  duration: number
  remaining: number
}

export interface ScheduleResult {
  byUid: Map<number, ScheduledTask>
  projectStart: string
  projectFinish: string
  projectEf: number
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
  calendar: WorkCalendarConfig
  reports: FieldReport[]
  restrictions: SiteRestriction[]
  materials: MaterialItem[]
  recoveryCosts: RecoveryCost[]
  appliedScenarios: ScenarioKind[]
  log: DecisionLogEntry[]
}
