// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ErroLayout, lerAnalitico, lerCustos, lerSinapi, mesDoNomeDoArquivo, normalizar } from './layout2025.ts'
import { abrirPlanilha } from './planilha.ts'
import { abrirZip } from './zip.ts'
import { criarXlsxSintetico } from './__testes__/xlsxSintetico.ts'
import { COMPOSICOES_SINTETICAS, criarPlanilhaSinapiSintetica, type OpcoesPlanilhaSinapi } from './__testes__/sinapiSintetico.ts'

const planilha = (o: OpcoesPlanilhaSinapi = {}) => abrirPlanilha(abrirZip(criarPlanilhaSinapiSintetica(o)))
const erroDe = (f: () => unknown): string => {
  try {
    f()
  } catch (e) {
    if (e instanceof ErroLayout) return e.message
    throw e
  }
  throw new Error('esperava ErroLayout')
}

describe('layout 2025: leitura por cabeçalho (AC-5)', () => {
  it('CSD: mês, emissão, UFs, encargos de SP e custos publicados das composições', () => {
    const c = lerCustos(planilha(), 'nao-desonerado')
    expect(c).toMatchObject({ aba: 'CSD', regime: 'nao-desonerado', mes: '2026-09', emissao: '2026-10-09', ufs: ['SP', 'SC'] })
    expect(c.encargos.get('SP')).toEqual({ horista: 1.1501, mensalista: 0.7118 }) // CR-10: 115,01% e 71,18%
    expect(c.composicoes.map((x) => x.codigo)).toEqual(['103332', '104658', '103681', '107113', '999001', '105006'])
    const c103332 = c.composicoes[0]!
    expect(c103332).toMatchObject({ grupo: 'Alvenaria de Vedação', unidade: 'M2' })
    expect(c103332.custos.get('SP')).toEqual({ custo: 123.96, percentualAS: 0 })
    expect(c103332.custos.get('SC')).toEqual({ custo: 130.5, percentualAS: 0.0388 })
  })

  it('CCD: o código vem da fórmula e o custo é o desonerado; encargos de SP 99,09% e 58,51%', () => {
    const c = lerCustos(planilha(), 'desonerado')
    expect(c.aba).toBe('CCD')
    expect(c.encargos.get('SP')).toEqual({ horista: 0.9909, mensalista: 0.5851 })
    expect(c.composicoes.find((x) => x.codigo === '104658')!.custos.get('SP')!.custo).toBe(205.36)
  })

  it('Analítico: mão de obra por função na ordem, com o coeficiente publicado, e as contagens', () => {
    const a = lerAnalitico(planilha())
    expect(a.mes).toBe('2026-09')
    expect(a.composicoes.get('104658')!.maoDeObra).toEqual([
      { codigo: '88316', funcao: 'SERVENTE', coeficiente: 1.279 },
      { codigo: '88309', funcao: 'PEDREIRO', coeficiente: 0.639 },
    ])
    expect(a.composicoes.get('103681')!.maoDeObra.map((f) => f.funcao)).toEqual(['SERVENTE', 'PEDREIRO', 'CARPINTEIRO DE FORMAS'])
    expect(a.composicoes.get('999001')!.maoDeObra).toEqual([])
    expect(a.composicoes.get('105006')!.situacao).toBe('SEM CUSTO')
    // O insumo em H ("SEGURO - HORISTA") não é função
    expect(a.composicoes.get('103332')!.maoDeObra.map((f) => f.funcao)).toEqual(['SERVENTE', 'PEDREIRO'])
    expect(a.contagens).toEqual({ composicoes: 6, itensComposicao: 10, itensInsumo: 4, itensMaoDeObra: 10, funcoes: 4 })
  })

  it('layout com coluna extra inserida ainda é lido (as colunas vêm do texto do cabeçalho)', () => {
    const c = lerCustos(planilha({ colunaExtra: true }), 'nao-desonerado')
    expect(c.composicoes[1]!).toMatchObject({ codigo: '104658', grupo: 'Acessibilidade', unidade: 'M2' })
    expect(c.composicoes[1]!.custos.get('SP')!.custo).toBe(208.85)
    expect(c.encargos.get('SP')!.horista).toBe(1.1501)
  })

  it('código pela fórmula HYPERLINK (2º argumento), conferido com o Analítico, no regime pedido', () => {
    const d = lerSinapi(planilha(), 'nao-desonerado', '2026-09')
    expect(d.mes).toBe('2026-09')
    expect(d.custos.composicoes).toHaveLength(COMPOSICOES_SINTETICAS.length)
    expect(d.analitico.composicoes.get('103332')!.descricao).toBe(d.custos.composicoes[0]!.descricao)
  })
})

describe('layout 2025: erros nomeados (nunca recorte parcial)', () => {
  it('coluna ausente', () => {
    expect(erroDe(() => lerCustos(planilha({ semColunaUnidade: true }), 'nao-desonerado'))).toBe('Aba "CSD": coluna "Unidade" ausente (layout mudou).')
  })

  it('aba Analítico ausente', () => {
    const p = abrirPlanilha(abrirZip(criarPlanilhaSinapiSintetica({ nomeAnalitico: 'Outra' })))
    expect(erroDe(() => lerAnalitico(p))).toBe('Aba "ANALITICO" não encontrada na planilha (layout mudou).')
  })

  it('cabeçalho "Código da Composição" fora das 30 primeiras linhas', () => {
    const vazia = abrirPlanilha(abrirZip(criarXlsxSintetico([{ nome: 'CSD', linhas: [['nada']] }])))
    expect(erroDe(() => lerCustos(vazia, 'nao-desonerado'))).toBe('Aba "CSD": coluna "Código da Composição" não encontrada nas 30 primeiras linhas (layout mudou).')
  })

  it('aba CCD com título SEM DESONERAÇÃO', () => {
    expect(erroDe(() => lerCustos(planilha({ ccdComTituloErrado: true }), 'desonerado'))).toBe('Aba "CCD": o título não corresponde ao regime esperado (COM DESONERAÇÃO).')
  })

  it('mês divergente entre as abas e com o nome do arquivo', () => {
    expect(erroDe(() => lerSinapi(planilha({ mesDoAnalitico: '08/2026' }), 'nao-desonerado'))).toBe('Mês de referência divergente entre a aba CSD (2026-09) e o Analítico (2026-08).')
    expect(erroDe(() => lerSinapi(planilha(), 'nao-desonerado', '2026-10'))).toBe('O mês de referência da planilha (2026-09) não é o esperado (2026-10).')
  })

  it('mês e emissão ausentes ou fora do formato', () => {
    expect(erroDe(() => lerCustos(planilha({ mes: '9/2026' }), 'nao-desonerado'))).toMatch(/"Mês de Referência" ausente ou fora do formato MM\/AAAA/)
    expect(erroDe(() => lerCustos(planilha({ emissao: '31/02/2026' }), 'nao-desonerado'))).toMatch(/"Data de emissão" ausente ou inválida/)
  })

  it('sem fórmula no código: erro com a linha', () => {
    expect(erroDe(() => lerCustos(planilha({ semFormula: true }), 'nao-desonerado'))).toBe('Aba "CSD", linha 11: código da composição sem a fórmula HYPERLINK (layout mudou).')
  })

  it('código da fórmula que não existe no Analítico: erro com a contagem e o primeiro código', () => {
    const msg = erroDe(() => lerSinapi(planilha({ codigoDaFormulaInexistente: true }), 'nao-desonerado'))
    expect(msg).toMatch(/^A aba CSD diverge do Analítico: /)
    expect(msg).toMatch(/\(o primeiro: 999999\)/)
  })

  it('código repetido nas abas de custo é erro', () => {
    const rep = [COMPOSICOES_SINTETICAS[0]!, COMPOSICOES_SINTETICAS[0]!]
    expect(erroDe(() => lerCustos(planilha({ composicoes: rep }), 'nao-desonerado'))).toBe('Aba "CSD": código 103332 repetido.')
    expect(erroDe(() => lerAnalitico(planilha({ composicoes: rep })))).toBe('Aba "Analítico": composição 103332 repetida.')
  })

  it('descrição diferente entre a aba de custos e o Analítico', () => {
    expect(erroDe(() => lerSinapi(planilha({ analiticoComDescricaoDiferente: true }), 'nao-desonerado'))).toMatch(/0 código\(s\) ausente\(s\) e 6 com descrição ou unidade diferente \(o primeiro: 103332\)/)
  })

  it('item antes da linha da composição no Analítico', () => {
    expect(erroDe(() => lerAnalitico(planilha({ analiticoItemAntesDaComposicao: true })))).toMatch(/item antes da linha da composição 103332/)
  })

  it('encargos ausentes', () => {
    expect(erroDe(() => lerCustos(planilha({ semEncargos: true }), 'nao-desonerado'))).toBe('Aba "CSD": linhas de encargos "Horista" e "Mensalista" ausentes (layout mudou).')
  })
})

describe('utilitários', () => {
  it('normalizar tira acento, quebra de linha e caixa', () => {
    expect(normalizar('Código da\nComposição')).toBe('CODIGO DA COMPOSICAO')
    expect(normalizar('  Analítico  ')).toBe('ANALITICO')
  })
  it('mês pelo nome do arquivo', () => {
    expect(mesDoNomeDoArquivo('SINAPI_Referencia_2026_09.xlsx')).toBe('2026-09')
    expect(mesDoNomeDoArquivo('SINAPI_Referência_2026_09.xlsx')).toBe('2026-09')
    expect(mesDoNomeDoArquivo('outro.xlsx')).toBeUndefined()
    expect(mesDoNomeDoArquivo('SINAPI_Referencia_2026_13.xlsx')).toBeUndefined()
  })
})
