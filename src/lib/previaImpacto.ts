// Prévia de impacto de uma hipótese no cronograma (feriados da obra, troca de UF ou município, calendário de tarefa):
// compara a previsão de hoje com a da hipótese, tarefa a tarefa. Função pura; quem simula é a store.
import type { ScheduleResult } from '@/types/domain'
import type { ImpactoCronograma } from '@/types/previas'
import type { WorkCalendar } from './calendar'
import { workingVariance } from './scenarios'

/**
 * Entrega antes e depois, `deltaDiasUteis` (positivo = atrasa, em dias úteis do calendário padrão) e as tarefas folha cujo início ou
 * término (datas) muda, na ordem da rede. Tarefa que só existe num dos lados é ignorada.
 */
export function compararCronogramas(antes: ScheduleResult, depois: ScheduleResult, calendarioPadrao: WorkCalendar): ImpactoCronograma {
  const tarefas: ImpactoCronograma['tarefas'] = []
  for (const uid of antes.order) {
    const a = antes.byUid.get(uid)
    const d = depois.byUid.get(uid)
    if (!a || !d || (a.start === d.start && a.finish === d.finish)) continue
    tarefas.push({ uid, inicioAntes: a.start, inicioDepois: d.start, terminoAntes: a.finish, terminoDepois: d.finish })
  }
  return {
    entregaAntes: antes.projectFinish,
    entregaDepois: depois.projectFinish,
    deltaDiasUteis: workingVariance(calendarioPadrao, antes.projectFinish, depois.projectFinish),
    tarefas,
  }
}
