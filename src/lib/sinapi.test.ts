import { describe, expect, it } from 'vitest'
import { durationFromTeam, scheduleDays, teamFromDuration } from './sinapi'

describe('SINAPI: bordas', () => {
  it('equipe a partir da duração', () => {
    expect(teamFromDuration(100, 0.8, 5)).toBe(2)
    expect(teamFromDuration(100, 0.8, 0)).toBe(Infinity)
  })

  it('divisor zero e arredondamento para o cronograma', () => {
    expect(durationFromTeam(100, 0.8, 0)).toBe(Infinity)
    expect(scheduleDays(Infinity)).toBe(0)
    expect(scheduleDays(0.2)).toBe(1)
    expect(scheduleDays(2.0000000001)).toBe(2)
  })
})
