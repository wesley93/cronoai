// Formatação pt-BR (moeda, números, datas).
import { parseISO } from './calendar'
import { MINUTOS_NO_DIA_CORRIDO, MINUTOS_POR_DIA_PADRAO, minutosParaDias } from './calendarioTrabalho'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const dateShort = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' })
const dateLong = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })

/**
 * Arredondamento bancário (meio para o par) em `casas` casas decimais — RNF-03.2, gate P2 = a. Só para EXIBIÇÃO: o cálculo
 * guarda o valor sem arredondar. O empate é detectado no valor decimal (15 algarismos significativos), não no binário:
 * 2,675 (que o ponto flutuante guarda como 2,67499…) é empate e vai para o par, 2,68. Fonte da regra: ABNT NBR 5891 (a confirmar
 * com Orçamento/Custos). Ex.: 0,125 → 0,12; 0,135 → 0,14; 2,675 → 2,68; 1,005 → 1,00; −0,125 → −0,12.
 */
export function arredondarBancario(valor: number, casas = 2): number {
  if (!Number.isFinite(valor)) return 0
  const fator = 10 ** casas
  const escalado = Number((Math.abs(valor) * fator).toPrecision(15))
  const piso = Math.floor(escalado)
  const resto = escalado - piso
  const arredondado = resto > 0.5 ? piso + 1 : resto < 0.5 ? piso : piso % 2 === 0 ? piso : piso + 1
  const r = (valor < 0 ? -arredondado : arredondado) / fator
  return r === 0 ? 0 : r // sem -0
}

export const fmtBRL = (v: number) => brl.format(Number.isFinite(v) ? v : 0)
/** Reais com centavos, arredondados pelo método bancário (meio para o par). */
export const fmtBRLCents = (v: number) => brlCents.format(Number.isFinite(v) ? arredondarBancario(v, 2) : 0)
export const fmtNum = (v: number) => num.format(Number.isFinite(v) ? v : 0)
/** Minutos úteis em dias da obra, até 1 casa (pt-BR): 5760 → "12", 26534 → "55,3" (sem a unidade). */
export const fmtDiasUteis = (minutos: number, minutosPorDia = MINUTOS_POR_DIA_PADRAO) => fmtNum(minutosParaDias(minutos, minutosPorDia))
/** Minutos de relógio em dias corridos, até 1 casa (pt-BR), para a folga de tarefa de duração corrida: 7740 → "5,4" (sem a unidade). */
export const fmtDiasCorridos = (minutos: number) => fmtNum(minutos / MINUTOS_NO_DIA_CORRIDO)
/** Folga com a unidade: "55,3d" em dias úteis da obra; "5,4dc" em dias corridos (tarefa de duração corrida). */
export const fmtFolga = (minutos: number, corrida: boolean, minutosPorDia = MINUTOS_POR_DIA_PADRAO) =>
  corrida ? `${fmtDiasCorridos(minutos)}dc` : `${fmtDiasUteis(minutos, minutosPorDia)}d`
export const fmtPct = (v: number, digits = 0) => `${(Number.isFinite(v) ? v : 0).toFixed(digits).replace('.', ',')}%`
export const fmtIndex = (v: number) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—')

/** Valores grandes compactos: R$ 21,1 mi / R$ 820 mil. */
export function fmtBRLCompact(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(2).replace('.', ',')} mi`
  if (abs >= 1_000) return `${sign}R$ ${Math.round(abs / 1_000)} mil`
  return fmtBRL(v)
}

export const fmtDate = (iso?: string) => (iso ? dateShort.format(parseISO(iso)) : '—')
export const fmtDateLong = (iso?: string) => (iso ? dateLong.format(parseISO(iso)).replace('.', '') : '—')
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const fmtMonth = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`
export const fmtWeekday = (iso: string) => weekday.format(parseISO(iso)).replace('.', '')

export function fmtDays(n: number, unit = 'dia útil', plural = 'dias úteis'): string {
  const abs = Math.abs(n)
  return `${abs} ${abs === 1 ? unit : plural}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}
