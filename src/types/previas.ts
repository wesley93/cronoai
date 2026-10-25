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
