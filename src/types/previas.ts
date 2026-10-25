// Resultado das prévias da store (apontamento, inclusão SINAPI, planilha): o impacto da hipótese ou o erro em português
// quando a hipótese não cabe no horizonte de cálculo (nunca "sem impacto" por engano).
import type { ScheduledTask, Task } from './domain'

export type ErroDaPrevia = { erro: string }

export type PreviaProgresso = ErroDaPrevia | { erro?: undefined; finish: string; deltaDays: number }

export type PreviaSinapi =
  | ErroDaPrevia
  | {
      erro?: undefined
      uid: number
      wbs: string
      start: string | undefined
      finish: string | undefined
      critical: boolean
      totalFloat: number
      projectFinish: string
      deltaDays: number
    }

export type PreviaPlanilha =
  | ErroDaPrevia
  | {
      erro?: undefined
      created: { task: Task; sched: ScheduledTask }[]
      projectFinish: string
      deltaDays: number
      bac: number
    }

/** Tarefa cujo início ou término muda na hipótese (antes → depois, datas `yyyy-mm-dd`). */
export interface TarefaAlterada {
  uid: number
  inicioAntes: string
  inicioDepois: string
  terminoAntes: string
  terminoDepois: string
}

/** Comparação entre dois cronogramas: entrega antes e depois, diferença em dias úteis e as tarefas que mudam de data. */
export interface ImpactoCronograma {
  entregaAntes: string
  entregaDepois: string
  /** Positivo = a entrega atrasa. Em dias úteis do calendário padrão. */
  deltaDiasUteis: number
  tarefas: TarefaAlterada[]
}

/** Prévia de feriados da obra, de troca de local ou de calendário: o impacto ou o erro em português. */
export type PreviaImpacto = ErroDaPrevia | ({ erro?: undefined } & ImpactoCronograma)
