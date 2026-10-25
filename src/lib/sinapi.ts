// Dimensionamento de duração e equipe a partir da produtividade (RUP).
// Duração (dias) = (Quantidade × Coeficiente HH) / (Equipe × horas por dia), com horas por dia = minutosPorDia ÷ 60 da obra
// (`horasPorDia` em calendarioTrabalho.ts; 480 min → 8 h). A média de horas do calendário da tarefa nunca entra: o CPM distribui os minutos.

export function totalManHours(quantity: number, rup: number): number {
  return Math.max(0, quantity) * Math.max(0, rup)
}

export function durationFromTeam(quantity: number, rup: number, team: number, horasPorDia: number): number {
  if (team <= 0 || horasPorDia <= 0) return Infinity
  return totalManHours(quantity, rup) / (team * horasPorDia)
}

export function teamFromDuration(quantity: number, rup: number, days: number, horasPorDia: number): number {
  if (days <= 0 || horasPorDia <= 0) return Infinity
  return totalManHours(quantity, rup) / (days * horasPorDia)
}

/** Duração inteira em dias úteis para o cronograma (arredonda para cima). */
export function scheduleDays(rawDays: number): number {
  if (!Number.isFinite(rawDays)) return 0
  return Math.max(1, Math.ceil(rawDays - 1e-9))
}
