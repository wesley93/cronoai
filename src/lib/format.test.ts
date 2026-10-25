import { describe, expect, it } from 'vitest'
import { arredondarBancario, fmtBRL, fmtBRLCents, fmtBRLCompact, fmtDate, fmtDays, fmtDiasCorridos, fmtDiasUteis, fmtFolga } from './format'

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


describe('arredondamento bancário (RNF-03.2, só na exibição)', () => {
  it('meio exato vai para o par; fora do meio, o mais próximo', () => {
    expect(arredondarBancario(0.125, 2)).toBe(0.12)
    expect(arredondarBancario(0.135, 2)).toBe(0.14)
    expect(arredondarBancario(2.675, 2)).toBe(2.68) // o binário guarda 2,67499…: o empate é lido no valor decimal
    expect(arredondarBancario(1.005, 2)).toBe(1) // 1,00
    expect(arredondarBancario(-0.125, 2)).toBe(-0.12)
    expect(arredondarBancario(11857.142857142857, 2)).toBe(11857.14)
    expect(arredondarBancario(22315.2, 2)).toBe(22315.2)
  })
  it('sem sinal negativo no zero e com valor inválido', () => {
    expect(Object.is(arredondarBancario(-0.001, 2), 0)).toBe(true)
    expect(arredondarBancario(Number.NaN, 2)).toBe(0)
    expect(arredondarBancario(Infinity, 2)).toBe(0)
  })
  it('fmtBRLCents usa o arredondamento bancário', () => {
    expect(fmtBRLCents(0.125).replaceAll(String.fromCharCode(160), ' ')).toBe('R$ 0,12')
    expect(fmtBRLCents(0.135).replaceAll(String.fromCharCode(160), ' ')).toBe('R$ 0,14')
    expect(fmtBRLCents(11857.142857142857).replaceAll(String.fromCharCode(160), ' ')).toBe('R$ 11.857,14')
  })
})
