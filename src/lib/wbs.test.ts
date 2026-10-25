import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/domain'
import { formatPredecessors, lagEmDias, rotuloLag } from './wbs'

describe('rótulo e dias do lag', () => {
  it('dias úteis: "+10", "-2", "+0,5"; zero fica vazio', () => {
    expect(rotuloLag({ tipo: 'util', minutos: 4800 })).toBe('+10')
    expect(rotuloLag({ tipo: 'util', minutos: -960 })).toBe('-2')
    expect(rotuloLag({ tipo: 'util', minutos: 240 })).toBe('+0,5')
    expect(rotuloLag({ tipo: 'util', minutos: 0 })).toBe('')
  })

  it('dias corridos com "dc" e percentual com "%"', () => {
    expect(rotuloLag({ tipo: 'corrido', minutos: 7 * 1440 })).toBe('+7dc')
    expect(rotuloLag({ tipo: 'corrido', minutos: -1440 })).toBe('-1dc')
    expect(rotuloLag({ tipo: 'percentual', percentual: 50 })).toBe('+50%')
    expect(rotuloLag({ tipo: 'percentual', percentual: -25 })).toBe('-25%')
    expect(rotuloLag({ tipo: 'percentual', percentual: 0 })).toBe('')
  })

  it('lag em dias: úteis pela jornada da obra, corridos por 1.440 min e 0 para percentual', () => {
    expect(lagEmDias({ tipo: 'util', minutos: 4800 })).toBe(10)
    expect(lagEmDias({ tipo: 'util', minutos: 900 }, 450)).toBe(2)
    expect(lagEmDias({ tipo: 'corrido', minutos: 10080 })).toBe(7)
    expect(lagEmDias({ tipo: 'percentual', percentual: 50 })).toBe(0)
  })

  it('predecessoras no estilo MS Project: "104FS; 401SS+10; 7FS+3dc; 8FF+50%"', () => {
    const t = {
      predecessors: [
        { uid: 104, type: 'FS', lag: { tipo: 'util', minutos: 0 } },
        { uid: 401, type: 'SS', lag: { tipo: 'util', minutos: 4800 } },
        { uid: 7, type: 'FS', lag: { tipo: 'corrido', minutos: 4320 } },
        { uid: 8, type: 'FF', lag: { tipo: 'percentual', percentual: 50 } },
      ],
    } as Task
    expect(formatPredecessors(t)).toBe('104FS; 401SS+10; 7FS+3dc; 8FF+50%')
  })
})
