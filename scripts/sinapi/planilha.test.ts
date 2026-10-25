// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { ErroPlanilha, abrirPlanilha, colunaDaReferencia, decodificarEntidades, LIMITES_PLANILHA_PADRAO, type Linha } from './planilha.ts'
import { abrirZip } from './zip.ts'
import { criarXlsxSintetico, nomeDaColuna, type AbaSintetica, type OpcoesXlsxSintetico } from './__testes__/xlsxSintetico.ts'

const abrir = (abas: AbaSintetica[], opcoes?: OpcoesXlsxSintetico, limites = LIMITES_PLANILHA_PADRAO) => abrirPlanilha(abrirZip(criarXlsxSintetico(abas, opcoes)), limites)
const todas = (abas: AbaSintetica[], aba: string, opcoes?: OpcoesXlsxSintetico): Linha[] => [...abrir(abas, opcoes).linhas(aba)]
const erroDe = (f: () => unknown): string => {
  try {
    f()
  } catch (e) {
    if (e instanceof ErroPlanilha) return e.message
    throw e
  }
  throw new Error('esperava ErroPlanilha')
}

describe('planilha: leitura do subconjunto SpreadsheetML', () => {
  const aba: AbaSintetica = {
    nome: 'CSD',
    linhas: [
      ['Grupo', 'Código da\nComposição', 'Custo (R$)'],
      ['Acessibilidade', { formula: '"#"&CELL("address",OFFSET(Analítico!$B$1,MATCH(104658,Analítico!$B:$B,0)-1,3)),104658)', valor: 0 }, 208.85],
      [null, null, 0],
    ],
  }

  it('texto compartilhado, número, fórmula com texto decodificado e coluna pela referência', () => {
    const l = todas([aba], 'CSD')
    expect(l[0]!.celulas).toEqual([
      { coluna: 1, valor: 'Grupo' },
      { coluna: 2, valor: 'Código da\nComposição' },
      { coluna: 3, valor: 'Custo (R$)' },
    ])
    expect(l[1]!.celulas[0]).toEqual({ coluna: 1, valor: 'Acessibilidade' })
    expect(l[1]!.celulas[1]!.formula).toBe('"#"&CELL("address",OFFSET(Analítico!$B$1,MATCH(104658,Analítico!$B:$B,0)-1,3)),104658)')
    expect(l[1]!.celulas[2]).toEqual({ coluna: 3, valor: 208.85 })
    // Célula vazia some; a coluna das seguintes continua certa
    expect(l[2]!.celulas).toEqual([{ coluna: 3, valor: 0 }])
    expect(l.map((x) => x.numero)).toEqual([1, 2, 3])
  })

  it('lista as abas pelo nome e recusa aba inexistente', () => {
    const p = abrir([aba, { nome: 'Analítico', linhas: [] }])
    expect(p.abas).toEqual(['CSD', 'Analítico'])
    expect(erroDe(() => [...p.linhas('XYZ')])).toBe('Aba "XYZ" não encontrada.')
  })

  it('texto inline (sem sharedStrings), células sem referência e coluna pela letra', () => {
    expect(todas([aba], 'CSD', { semSharedStrings: true })[0]!.celulas[0]).toEqual({ coluna: 1, valor: 'Grupo' })
    expect(colunaDaReferencia('A1')).toBe(1)
    expect(colunaDaReferencia('AB12')).toBe(28)
    expect(colunaDaReferencia('AC')).toBe(29)
    expect(nomeDaColuna(28)).toBe('AC')
    expect(erroDe(() => colunaDaReferencia('1A'))).toBe('Referência de célula inválida.')
  })

  it('remove caracteres de controle e espaços das pontas dos textos', () => {
    const l = todas([{ nome: 'A', linhas: [['  PEDREIRO\u0007 ']] }], 'A')
    expect(l[0]!.celulas[0]!.valor).toBe('PEDREIRO')
  })

  it('entidades predefinidas e numéricas', () => {
    expect(decodificarEntidades('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos; &#65;&#x42;')).toBe('a & b <c> "d" \'e\' AB')
    expect(decodificarEntidades('sem entidade')).toBe('sem entidade')
    expect(erroDe(() => decodificarEntidades('&xxe;'))).toBe('O XML tem uma entidade que o leitor recusa.')
    expect(erroDe(() => decodificarEntidades('&#0;'))).toBe('O XML tem uma referência numérica inválida.')
    expect(erroDe(() => decodificarEntidades('&#xD800;'))).toBe('O XML tem uma referência numérica inválida.')
  })

  it('índice de texto compartilhado fora da lista e número inválido são recusados', () => {
    const idx = abrir([{ nome: 'A', linhas: [['x']] }], { linhasBrutas: '<row r="1"><c r="A1" t="s"><v>99</v></c></row>' })
    expect(erroDe(() => [...idx.linhas('A')])).toBe('Índice de texto compartilhado inválido.')
    const num = abrir([{ nome: 'A', linhas: [['x']] }], { linhasBrutas: '<row r="1"><c r="A1"><v>abc</v></c></row>' })
    expect(erroDe(() => [...num.linhas('A')])).toBe('Valor numérico inválido na planilha.')
  })

  it('linha e célula sem referência seguem a ordem; linha vazia e célula só de estilo são toleradas', () => {
    const p = abrir([{ nome: 'A', linhas: [['x']] }], { linhasBrutas: '<row><c><v>1</v></c><c s="3"/><c><v>2</v></c></row><row r="7"/>' })
    const l = [...p.linhas('A')]
    expect(l[0]).toEqual({ numero: 1, celulas: [{ coluna: 1, valor: 1 }, { coluna: 3, valor: 2 }] })
    expect(l[1]).toEqual({ numero: 7, celulas: [] })
  })

  it('texto com formatação mista e fonética: junta só os <t>, com entidades decodificadas', () => {
    const bruto = '<si><r><t>PED</t></r><r><t xml:space="preserve">REIRO &amp; </t></r><rPh sb="0" eb="1"><t>fonetica</t></rPh><r><t>CIA</t></r></si><si><t/></si>'
    const p = abrir([{ nome: 'A', linhas: [['x']] }], { sharedStringsBruto: bruto, linhasBrutas: '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' })
    expect([...p.linhas('A')][0]!.celulas).toEqual([{ coluna: 1, valor: 'PEDREIRO & CIA' }, { coluna: 2, valor: '' }])
  })
})

describe('planilha: DOCTYPE e ENTITY recusados (S-2)', () => {
  const abas: AbaSintetica[] = [{ nome: 'A', linhas: [['x']] }]
  const dtd = '<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;">]>'

  it('no sharedStrings (billion laughs)', () => {
    const p = abrir(abas, { prefixoSharedStrings: dtd })
    expect(erroDe(() => [...p.linhas('A')])).toBe('sharedStrings: o XML tem DOCTYPE, ENTITY ou CDATA, que o leitor recusa.')
  })

  it('na aba (XXE)', () => {
    const xxe = '<!DOCTYPE x [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
    const p = abrir(abas, { prefixoAba: xxe })
    expect(erroDe(() => [...p.linhas('A')])).toBe('aba "A": o XML tem DOCTYPE, ENTITY ou CDATA, que o leitor recusa.')
  })

  it('ENTITY solto e CDATA, em qualquer caixa', () => {
    expect(erroDe(() => [...abrir(abas, { prefixoSharedStrings: '<!entity a "b">' }).linhas('A')])).toMatch(/DOCTYPE, ENTITY ou CDATA/)
    expect(erroDe(() => [...abrir(abas, { prefixoAba: '<![CDATA[x]]>' }).linhas('A')])).toMatch(/DOCTYPE, ENTITY ou CDATA/)
  })

  it('a mensagem nunca repete o conteúdo do arquivo', () => {
    const p = abrir(abas, { prefixoAba: '<!DOCTYPE SEGREDO-ABC [<!ENTITY a "b">]>' })
    expect(erroDe(() => [...p.linhas('A')])).not.toContain('SEGREDO')
  })

  it('workbook com DOCTYPE', () => {
    const zip = abrirZip(criarXlsxSintetico(abas, { prefixoWorkbook: dtd }))
    expect(erroDe(() => abrirPlanilha(zip))).toBe('workbook: o XML tem DOCTYPE, ENTITY ou CDATA, que o leitor recusa.')
  })
})

describe('planilha: limites de linhas e colunas', () => {
  it('mais de 200.000 linhas (limite configurável no teste)', () => {
    const p = abrir([{ nome: 'A', linhas: Array.from({ length: 6 }, () => ['x']) }], undefined, { ...LIMITES_PLANILHA_PADRAO, maxLinhas: 5 })
    expect(erroDe(() => [...p.linhas('A')])).toBe('A aba "A" tem mais de 5 linhas.')
  })

  it('mais de 200 colunas', () => {
    const p = abrir([{ nome: 'A', linhas: [Array.from({ length: 201 }, () => 1)] }])
    expect(erroDe(() => [...p.linhas('A')])).toBe('A aba "A" tem mais de 200 colunas.')
    expect([...abrir([{ nome: 'A', linhas: [Array.from({ length: 200 }, () => 1)] }]).linhas('A')][0]!.celulas).toHaveLength(200)
  })

  it('mais textos compartilhados que o limite', () => {
    const p = abrir([{ nome: 'A', linhas: [['a', 'b', 'c']] }], undefined, { ...LIMITES_PLANILHA_PADRAO, maxTextosCompartilhados: 2 })
    expect(erroDe(() => [...p.linhas('A')])).toBe('A planilha tem mais de 2 textos compartilhados.')
  })

  it('texto de célula cortado no limite', () => {
    const p = abrir([{ nome: 'A', linhas: [['x'.repeat(50)]] }], undefined, { ...LIMITES_PLANILHA_PADRAO, maxTexto: 10 })
    expect([...p.linhas('A')][0]!.celulas[0]!.valor).toBe('x'.repeat(10))
  })
})
