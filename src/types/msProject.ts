// Visão da tarefa com os nomes de campo do MS Project (MSPDI), consumida por telas, integrações e exportação.
import type { LinkType } from './domain'

export interface MSProjectPredecessor {
  /** UniqueID da tarefa predecessora. */
  PredecessorUID: number
  /** FS = Término-Início, SS = Início-Início, FF = Término-Término, SF = Início-Término. */
  Type: LinkType
  /** Latência em dias úteis (negativa = antecipação). */
  LagDays: number
}

export interface MSProjectResource {
  /** Função/recurso (ex.: Pedreiro, Servente, Carpinteiro). */
  Name: string
  /** Quantidade de profissionais alocados (1 = 100%). */
  Units: number
}

export interface MSProjectTask {
  UniqueID: number
  WBS: string
  Name: string
  OutlineLevel: number
  /** Tarefa-resumo (agrupador da EAP): valores consolidados das filhas. */
  Summary: boolean
  /** Duração em dias úteis (calendário de 8 h/dia). */
  Duration: number
  /** Início previsto (reprogramado na data de status), ISO yyyy-mm-dd. */
  Start: string
  /** Término previsto (reprogramado na data de status), ISO yyyy-mm-dd. */
  Finish: string
  /** Percentual físico concluído (0–100). */
  PercentComplete: number
  Predecessors: MSProjectPredecessor[]
  /** Folga total ≤ 0 e tarefa não concluída. */
  IsCritical: boolean
  /** Folga total em dias úteis (null para concluídas e resumos). */
  TotalSlack: number | null
  /** Orçamento na conclusão — BAC (R$). */
  BudgetAtCompletion: number
  /** PV/BCWS na data de status (R$). */
  PlannedValue: number
  /** EV/BCWP = BAC × % concluído (R$). */
  EarnedValue: number
  /** AC/ACWP — custo real incorrido (R$). */
  ActualCost: number
  Resources: MSProjectResource[]
  /** Lead time do insumo crítico do pacote, em dias corridos (null quando não há). */
  MaterialLeadTime: number | null
  SinapiCode: string | null
  BaselineStart: string | null
  BaselineFinish: string | null
}
