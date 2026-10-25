// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { validarRecorteSinapi } from '@/lib/recorteSinapi'
import { lerSinapi } from './layout2025.ts'
import { abrirPlanilha } from './planilha.ts'
import { ErroRecorte, montarRecorte, sha256Hex, type OpcoesRecorte } from './recorte.ts'
import { abrirZip } from './zip.ts'
import { COMPOSICOES_SINTETICAS, criarPlanilhaSinapiSintetica } from './__testes__/sinapiSintetico.ts'

const xlsx = criarPlanilhaSinapiSintetica()
const dados = (regime: 'nao-desonerado' | 'desonerado' = 'nao-desonerado') => lerSinapi(abrirPlanilha(abrirZip(xlsx)), regime, '2026-09')
const opcoes = (extra: Partial<OpcoesRecorte> = {}): OpcoesRecorte => ({
  uf: 'SP',
  arquivo: 'SINAPI_Referencia_2026_09.xlsx',
  sha256: sha256Hex(xlsx),
  bytes: xlsx.length,
  geradoEm: '2026-10-25T12:00:00.000Z',
  ...extra,
})

describe('montarRecorte (D-7)', () => {
  it('SP não desonerado: exclui SEM CUSTO e custo 0; mão de obra por função; totais; passa na validação do app', () => {
    const r = montarRecorte(dados(), opcoes())
    expect(r).toMatchObject({ formato: 'cronoai-recorte-sinapi', versao: 1, uf: 'SP', regime: 'nao-desonerado', dataBase: '2026-09', geradoEm: '2026-10-25T12:00:00.000Z' })
    expect(r.fonte).toMatchObject({ arquivo: 'SINAPI_Referencia_2026_09.xlsx', dataEmissao: '2026-10-09', abaCustos: 'CSD', layout: '2025', bytes: xlsx.length })
    expect(r.fonte.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(r.encargos).toEqual({ horista: 1.1501, mensalista: 0.7118 })
    // 5 COM CUSTO com custo > 0 em SP; a 105006 é SEM CUSTO
    expect(r.composicoes.map((c) => c.codigo)).toEqual(['103332', '104658', '103681', '107113', '999001'])
    expect(r.totais).toEqual({ composicoes: 5, excluidasSemCusto: 1, excluidasCustoZeroNaUf: 0 })
    const c = r.composicoes[0]!
    expect(c).toEqual({
      codigo: '103332',
      descricao: COMPOSICOES_SINTETICAS[0]!.descricao,
      unidade: 'M2',
      grupo: 'Alvenaria de Vedação',
      custoUnitario: 123.96,
      maoDeObra: [
        { codigo: '88316', funcao: 'SERVENTE', coeficiente: 0.8112688 },
        { codigo: '88309', funcao: 'PEDREIRO', coeficiente: 1.6225376 },
      ],
      percentualAS: 0,
    })
    expect(r.composicoes.find((x) => x.codigo === '999001')!.maoDeObra).toEqual([])
    const v = validarRecorteSinapi(JSON.parse(JSON.stringify(r)))
    expect(v.ok).toBe(true)
  })

  it('SC: custo 0 na UF fica de fora e é contado (como a 104088 em SP na planilha real)', () => {
    const r = montarRecorte(dados(), opcoes({ uf: 'SC' }))
    expect(r.composicoes.map((c) => c.codigo)).not.toContain('104658')
    expect(r.totais).toEqual({ composicoes: 4, excluidasSemCusto: 1, excluidasCustoZeroNaUf: 1 })
    expect(r.composicoes.find((c) => c.codigo === '103681')!.custoUnitario).toBe(904.47) // tabela 4.2: SC
    expect(r.composicoes.find((c) => c.codigo === '103681')!.percentualAS).toBe(0.0388)
    expect(validarRecorteSinapi(JSON.parse(JSON.stringify(r))).ok).toBe(true)
  })

  it('desonerado usa a aba CCD, os custos e os encargos dela', () => {
    const r = montarRecorte(dados('desonerado'), opcoes())
    expect(r.regime).toBe('desonerado')
    expect(r.fonte.abaCustos).toBe('CCD')
    expect(r.encargos).toEqual({ horista: 0.9909, mensalista: 0.5851 })
    expect(r.composicoes.find((c) => c.codigo === '104658')!.custoUnitario).toBe(205.36)
    expect(validarRecorteSinapi(JSON.parse(JSON.stringify(r))).ok).toBe(true)
  })

  it('filtro por códigos e por grupos (união); os excluídos contam só dentro do filtro', () => {
    const porCodigo = montarRecorte(dados(), opcoes({ filtro: { codigos: ['103332', '105006'] } }))
    expect(porCodigo.composicoes.map((c) => c.codigo)).toEqual(['103332'])
    expect(porCodigo.totais).toEqual({ composicoes: 1, excluidasSemCusto: 1, excluidasCustoZeroNaUf: 0 })
    expect(porCodigo.filtro).toEqual({ codigos: ['103332', '105006'], grupos: [] })
    const porGrupo = montarRecorte(dados(), opcoes({ filtro: { grupos: ['acessibilidade'], codigos: ['103681'] } }))
    expect(porGrupo.composicoes.map((c) => c.codigo)).toEqual(['104658', '103681'])
  })

  it('UF fora da planilha, código e grupo pedidos que não existem, e filtro que esvazia o recorte', () => {
    expect(() => montarRecorte(dados(), opcoes({ uf: 'BA' }))).toThrow(new ErroRecorte('A UF BA não existe na aba CSD da planilha.'))
    expect(() => montarRecorte(dados(), opcoes({ filtro: { codigos: ['1'] } }))).toThrow('Código(s) pedido(s) fora da planilha: 1.')
    expect(() => montarRecorte(dados(), opcoes({ filtro: { grupos: ['Inexistente'] } }))).toThrow('Grupo(s) pedido(s) fora da planilha (1): confira a grafia.')
    expect(() => montarRecorte(dados(), opcoes({ filtro: { codigos: ['105006'] } }))).toThrow('Nenhuma composição com custo na UF e no regime pedidos (confira o filtro).')
  })

  it('texto acima dos limites do esquema é cortado, não recusado', () => {
    const comps = [{ ...COMPOSICOES_SINTETICAS[0]!, descricao: 'A'.repeat(450), grupo: 'G'.repeat(200) }]
    const planilha = abrirPlanilha(abrirZip(criarPlanilhaSinapiSintetica({ composicoes: comps })))
    const r = montarRecorte(lerSinapi(planilha, 'nao-desonerado'), opcoes())
    expect(r.composicoes[0]!.descricao).toHaveLength(400)
    expect(r.composicoes[0]!.grupo).toHaveLength(160)
    expect(validarRecorteSinapi(JSON.parse(JSON.stringify(r))).ok).toBe(true)
  })

  it('unidade inesperada é erro nomeado', () => {
    const comps = [{ ...COMPOSICOES_SINTETICAS[0]!, unidade: 'm²' }]
    const planilha = abrirPlanilha(abrirZip(criarPlanilhaSinapiSintetica({ composicoes: comps })))
    expect(() => montarRecorte(lerSinapi(planilha, 'nao-desonerado'), opcoes())).toThrow('Unidade inesperada na composição 103332: o layout mudou.')
  })

  it('geradoEm padrão é a data atual em ISO e o SHA-256 vem do conteúdo', () => {
    const r = montarRecorte(dados(), { ...opcoes(), geradoEm: undefined })
    expect(Number.isNaN(Date.parse(r.geradoEm))).toBe(false)
    expect(sha256Hex(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
