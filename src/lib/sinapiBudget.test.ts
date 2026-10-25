import { describe, expect, it } from 'vitest'
import { MAX_BUDGET_LINES, parseBudgetCsv, parseNumberBR } from './sinapiBudget'

describe('planilha SINAPI: bordas do CSV', () => {
  it('arquivo vazio', () => {
    expect(parseBudgetCsv('')).toEqual({ lines: [], errors: ['Arquivo vazio.'] })
  })

  it('número ausente ou em branco vira NaN', () => {
    expect(parseNumberBR(undefined)).toBeNaN()
    expect(parseNumberBR('R$ ')).toBeNaN()
  })

  it('cabeçalho sem as colunas mínimas', () => {
    const r = parseBudgetCsv('descricao;unidade;rup\nAlvenaria;m²;0,5')
    expect(r.lines).toHaveLength(0)
    expect(r.errors).toEqual(['Cabeçalho precisa ter ao menos as colunas "descrição" e "quantidade".'])
  })

  it('sem cabeçalho, separador vírgula, campo entre aspas e equipe inválida usa a padrão', () => {
    const r = parseBudgetCsv('99999,"Alvenaria, fachada",m²,10,0.5,20', [], 4)
    expect(r.errors).toEqual([])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ description: 'Alvenaria, fachada', quantity: 10, rup: 0.5, unitCost: 20, team: 4, professional: 'Pedreiro', helperRatio: 0.5 })
  })

  it('aspas duplicadas dentro do campo e equipe informada', () => {
    const r = parseBudgetCsv('descricao;quantidade;rup;equipe\n"Serviço ""especial""";5;0,4;3,6')
    expect(r.lines[0]).toMatchObject({ description: 'Serviço "especial"', team: 4 })
  })

  it('linha sem descrição', () => {
    const r = parseBudgetCsv('descricao;quantidade;rup\n;5;0,4')
    expect(r.lines).toHaveLength(0)
    expect(r.errors).toEqual(['Linha 2: sem descrição.'])
  })

  it('limita ao máximo de linhas e avisa', () => {
    const rows = Array.from({ length: MAX_BUDGET_LINES + 2 }, (_, i) => `Serviço ${i};1;0,5`)
    const r = parseBudgetCsv(['descricao;quantidade;rup', ...rows].join('\n'))
    expect(r.lines).toHaveLength(MAX_BUDGET_LINES)
    expect(r.errors).toEqual([`Somente as primeiras ${MAX_BUDGET_LINES} linhas foram lidas.`])
  })
})
