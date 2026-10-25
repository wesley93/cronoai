import { describe, expect, it } from 'vitest'
import { MSG_TETO } from './calendar'
import { MSG_CALCULO_GENERICA, calcularObra, mensagemDoCalculo, verificarCalculo } from './horizonte'
import { buildSeedState } from '@/stores/useProjectStore'

describe('mensagemDoCalculo (rodada 03: só texto de erro conhecido do motor vai para a tela)', () => {
  it('devolve o texto do teto de 50 anos, do calendário inválido e do calendário padrão ausente', () => {
    expect(mensagemDoCalculo(new Error(MSG_TETO))).toBe(MSG_TETO)
    expect(mensagemDoCalculo(new Error('Calendário inválido: a semana do calendário não tem nenhum tempo útil.'))).toBe(
      'Calendário inválido: a semana do calendário não tem nenhum tempo útil.',
    )
    expect(mensagemDoCalculo(new Error('O calendário padrão da obra não existe.'))).toBe('O calendário padrão da obra não existe.')
  })

  it('qualquer outro erro (TypeError, texto interno, valor que não é Error) vira a mensagem genérica em português', () => {
    expect(MSG_CALCULO_GENERICA).toBe('Não foi possível calcular o cronograma desta obra.')
    expect(mensagemDoCalculo(new TypeError("Cannot read properties of undefined (reading 'predecessors')"))).toBe(MSG_CALCULO_GENERICA)
    expect(mensagemDoCalculo(new Error('falha em /home/usuario/segredo.ts'))).toBe(MSG_CALCULO_GENERICA)
    expect(mensagemDoCalculo('texto')).toBe(MSG_CALCULO_GENERICA)
    expect(mensagemDoCalculo(undefined)).toBe(MSG_CALCULO_GENERICA)
  })
})

describe('calcularObra e verificarCalculo usam a mesma lista de cálculos', () => {
  const seed = buildSeedState()

  it('o Aurora calcula (fim 2027-06-23) e o mesmo estado passa na verificação', () => {
    const r = calcularObra(seed.tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid)
    expect(r.sch.projectFinish).toBe('2027-06-23')
    expect(r.sch.byUid.size).toBe(20)
    expect(r.evm.bac).toBeGreaterThan(0)
    expect(verificarCalculo(seed.tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid)).toBeUndefined()
  })

  it('a verificação inclui a linha de base: a duração que só estoura sem avanço é recusada, e a tela (sem a base) ainda calcula', () => {
    // Tarefa já a 100% concluída com duração de 60 anos: a previsão usa as datas reais, a linha de base (sem avanço) estoura o teto
    const tasks = [{ ...seed.tasks.filter((t) => !t.isSummary)[0], predecessors: [], duracaoMin: 60 * 260 * 480, percentComplete: 100, actualStart: seed.meta.startDate, actualFinish: seed.meta.startDate }]
    expect(verificarCalculo(tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid)).toMatch(/horizonte de 50 anos/)
    expect(() => calcularObra(tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid)).not.toThrow()
  })

  it('a verificação devolve a mensagem do erro que o cálculo lança', () => {
    expect(() => calcularObra(seed.tasks, seed.meta, seed.calendarios, 999)).toThrow('O calendário padrão da obra não existe.')
    expect(verificarCalculo(seed.tasks, seed.meta, seed.calendarios, 999)).toBe('O calendário padrão da obra não existe.')
  })
})
