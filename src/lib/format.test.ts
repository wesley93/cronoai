import { describe, expect, it } from 'vitest'
import { fmtBRL, fmtBRLCompact, fmtDate, fmtDays } from './format'

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
