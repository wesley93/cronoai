import { describe, expect, it } from 'vitest'
import { fmtBRL, fmtBRLCompact, fmtDate, fmtDays, fmtDiasCorridos, fmtDiasUteis, fmtFolga } from './format'

describe('formatação: bordas', () => {
  it('valores compactos', () => {
    expect(fmtBRLCompact(21_100_000)).toBe('R$ 21,10 mi')
    expect(fmtBRLCompact(-820_000)).toBe('-R$ 820 mil')
    expect(fmtBRLCompact(950)).toBe(fmtBRL(950))
  })

  it('dias no singular e no plural; data ausente', () => {
    expect(fmtDays(1)).toBe('1 dia útil')
    expect(fmtDays(-3)).toBe('3 dias úteis')
    expect(fmtDate(undefined)).toBe('—')
  })
})

describe('formatação de dias a partir de minutos', () => {
  it('dias úteis da obra, até 1 casa em pt-BR', () => {
    expect(fmtDiasUteis(5760)).toBe('12')
    expect(fmtDiasUteis(26534)).toBe('55,3')
    expect(fmtDiasUteis(22800)).toBe('47,5')
    expect(fmtDiasUteis(675, 450)).toBe('1,5') // jornada de 450 min/dia
    expect(fmtDiasUteis(-480)).toBe('-1')
  })

  it('dias corridos (folga de tarefa de duração corrida)', () => {
    expect(fmtDiasCorridos(7740)).toBe('5,4')
    expect(fmtDiasCorridos(1440)).toBe('1')
  })

  it('folga com a unidade: "d" em dias úteis e "dc" em dias corridos', () => {
    expect(fmtFolga(26534, false)).toBe('55,3d')
    expect(fmtFolga(7740, true)).toBe('5,4dc')
    expect(fmtFolga(0, false)).toBe('0d')
  })
})

