// Dimensionamento de duração e equipe a partir da produtividade (RUP).
// Duração (dias) = (Quantidade × Coeficiente HH) / (Equipe × 8 h)

export const HOURS_PER_DAY = 8

export function totalManHours(quantity: number, rup: number): number {
  return Math.max(0, quantity) * Math.max(0, rup)
}

export function durationFromTeam(quantity: number, rup: number, team: number): number {
  if (team <= 0) return Infinity
  return totalManHours(quantity, rup) / (team * HOURS_PER_DAY)
}

export function teamFromDuration(quantity: number, rup: number, days: number): number {
  if (days <= 0) return Infinity
  return totalManHours(quantity, rup) / (days * HOURS_PER_DAY)
}

/** Duração inteira em dias úteis para o cronograma (arredonda para cima). */
export function scheduleDays(rawDays: number): number {
  if (!Number.isFinite(rawDays)) return 0
  return Math.max(1, Math.ceil(rawDays - 1e-9))
}
