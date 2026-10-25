// Orquestrador Just-in-Time: Data Necessária, Data Limite de Pedido (DLP) e alertas de suprimentos.
import type { MaterialItem, ScheduleResult, SiteRestriction, Task } from '@/types/domain'
import { addCalendarDays, diffCalendarDays } from './calendar'
import { normalizeText } from './wbs'

export const SAFETY_MARGIN_DAYS = 3

export type SupplyStatus = 'ruptura' | 'atrasada' | 'entrega-tardia' | 'reagendar' | 'atencao' | 'entregue' | 'ok'

export interface SupplyAnalysis {
  material: MaterialItem
  task?: Task
  needDate: string
  dlp: string
  status: SupplyStatus
  headline: string
  message: string
  /** Dias de parada previstos da frente se nada for feito. */
  stopDays: number
  postponeDays: number
  recommendedDelivery?: string
  orderValue: number
}

export const STATUS_ORDER: SupplyStatus[] = ['ruptura', 'atrasada', 'entrega-tardia', 'reagendar', 'atencao', 'ok', 'entregue']

export function analyzeSupplies(
  materials: MaterialItem[],
  tasks: Task[],
  schedule: ScheduleResult,
  statusDate: string,
  restrictions: SiteRestriction[],
  marginDays = SAFETY_MARGIN_DAYS,
): SupplyAnalysis[] {
  const byUid = new Map(tasks.map((t) => [t.uid, t]))
  const openMaterialAlerts = restrictions.filter((r) => r.kind === 'material' && !r.resolved && r.material)

  return materials
    .map((m): SupplyAnalysis => {
      const task = byUid.get(m.taskUid)
      const s = schedule.byUid.get(m.taskUid)
      const forecastStart = s?.start ?? statusDate
      const inProgress = (task?.percentComplete ?? 0) > 0
      const needDate = inProgress || forecastStart < statusDate ? addCalendarDays(statusDate, 1) : forecastStart
      const dlp = addCalendarDays(needDate, -(m.leadTimeDays + marginDays))
      const orderValue = m.quantity * m.unitPrice
      const base = { material: m, task, needDate, dlp, stopDays: 0, postponeDays: 0, orderValue }

      const fieldAlert = openMaterialAlerts.find((r) => normalizeText(m.name).includes(normalizeText(r.material!)))
      if (fieldAlert && !m.ordered) {
        const arrival = addCalendarDays(statusDate, m.leadTimeDays)
        return {
          ...base,
          status: 'ruptura',
          headline: 'Ruptura reportada no canteiro',
          message: `Relato de campo (${fieldAlert.label.toLowerCase()}). Emitir pedido emergencial hoje: chegada estimada ${arrival.slice(8, 10)}/${arrival.slice(5, 7)}.`,
          stopDays: Math.max(0, diffCalendarDays(needDate, arrival)),
        }
      }

      if (!m.ordered) {
        if (dlp < statusDate) {
          const arrival = addCalendarDays(statusDate, m.leadTimeDays)
          const stop = Math.max(0, diffCalendarDays(needDate, arrival))
          return {
            ...base,
            status: 'atrasada',
            headline: 'Compra atrasada — vai parar a obra',
            message: `DLP venceu há ${diffCalendarDays(dlp, statusDate)} dias e o pedido não foi emitido. ${
              stop > 0 ? `Mesmo emitindo hoje, a frente fica parada ~${stop} dias.` : 'Emitir hoje consome toda a margem de segurança.'
            }`,
            stopDays: stop,
          }
        }
        const daysToDlp = diffCalendarDays(statusDate, dlp)
        if (daysToDlp <= 7) {
          return { ...base, status: 'atencao', headline: `Emitir pedido em ${daysToDlp} dias`, message: 'Pedido deve ser colocado nesta semana para respeitar o lead time do fornecedor.' }
        }
        return { ...base, status: 'ok', headline: 'Dentro do prazo', message: `Pedido pode ser emitido até a DLP (${daysToDlp} dias de folga).` }
      }

      // Pedido emitido
      if (m.deliveryDate && m.deliveryDate <= statusDate) {
        return { ...base, status: 'entregue', headline: 'Entregue no canteiro', message: 'Material disponível para a frente de serviço.' }
      }
      if (m.deliveryDate && m.deliveryDate > needDate) {
        return {
          ...base,
          status: 'entrega-tardia',
          headline: 'Entrega após a necessidade',
          message: `Entrega programada ${diffCalendarDays(needDate, m.deliveryDate)} dias depois do início da tarefa. Antecipar com o fornecedor.`,
          stopDays: diffCalendarDays(needDate, m.deliveryDate),
          recommendedDelivery: addCalendarDays(needDate, -2),
        }
      }
      const frontShift = task?.baselineStart && s ? diffCalendarDays(task.baselineStart, s.start) : 0
      const earlyBy = m.deliveryDate ? diffCalendarDays(m.deliveryDate, needDate) : 0
      if (m.deliveryDate && frontShift >= 3 && earlyBy > 5) {
        const recommended = addCalendarDays(m.deliveryDate, frontShift)
        return {
          ...base,
          status: 'reagendar',
          headline: `Reagendar entrega (+${frontShift} dias)`,
          message: `A frente predecessora atrasou e a tarefa começará ${frontShift} dias depois do planejado. Adiar a entrega evita estoque parado no canteiro e posterga ${orderValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })} no fluxo de caixa.`,
          postponeDays: frontShift,
          recommendedDelivery: recommended,
        }
      }
      return { ...base, status: 'ok', headline: 'Pedido em dia', message: 'Entrega programada compatível com a necessidade da obra.' }
    })
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.dlp.localeCompare(b.dlp))
}
