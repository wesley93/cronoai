// Feriados da obra (ciclo 00005, SPEC-03): configuração padrão e conferência do formato salvo.
import type { ConfigFeriadosObra } from '@/types/domain'

/** Padrão: nacionais, Carnaval e Corpus Christi ligados (o comportamento anterior ao ciclo 00005) e nenhum feriado manual. */
export function configFeriadosPadrao(): ConfigFeriadosObra {
  return { nacionais: true, carnaval: true, corpusChristi: true, manuais: [] }
}

/** Confere a forma da configuração lida do estado salvo (o conteúdo dos feriados manuais é validado quando a tela os usa). */
export function configFeriadosValida(v: unknown): boolean {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const c = v as Record<string, unknown>
  return typeof c.nacionais === 'boolean' && typeof c.carnaval === 'boolean' && typeof c.corpusChristi === 'boolean' && Array.isArray(c.manuais)
}
