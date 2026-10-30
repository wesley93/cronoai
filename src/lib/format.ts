// Formatação pt-BR (moeda, números, datas).
import { parseISO } from './calendar'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' })

export const fmtBRL = (v: number) => brl.format(Number.isFinite(v) ? v : 0)
export const fmtBRLCents = (v: number) => brlCents.format(Number.isFinite(v) ? v : 0)
export const fmtNum = (v: number) => num.format(Number.isFinite(v) ? v : 0)
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

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

// Otimização: formatar datas extraindo as partes diretamente da string ISO
export const fmtDate = (iso?: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—')
export const fmtDateLong = (iso?: string) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)} de ${MONTHS[Number(iso.slice(5, 7)) - 1]} de ${iso.slice(0, 4)}` : '—')
export const fmtMonth = (iso: string) => (iso && iso.length >= 7 ? `${MONTHS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}` : '—')
export const fmtWeekday = (iso: string) => weekday.format(parseISO(iso)).replace('.', '')

export function fmtDays(n: number, unit = 'dia útil', plural = 'dias úteis'): string {
  const abs = Math.abs(n)
  return `${abs} ${abs === 1 ? unit : plural}`
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}
