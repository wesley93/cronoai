import { describe, expect, it } from 'vitest'
import type { RecorteSinapi } from '@/types/sinapi'
import { fmtPct } from './format'
import {
  MAX_RECORTE_BYTES,
  buscarComposicoes,
  chaveRecorte,
  conferirRecorteComObra,
  descreverFonte,
  indexarRecorte,
  itemCatalogoDoRecorte,
  lerChaveRecorte,
  lerRecorteDeTexto,
  linhaDoRecorte,
  unidadeParaExibicao,
  validarRecorteSinapi,
} from './recorteSinapi'
import { lineDuration, lineResources } from './sinapiBudget'

// Recorte montado no teste com 3 composições públicas da Caixa (SINAPI 09/2026, SP, não desonerado; SHA-256 do xlsx de origem).
// O custo da 103681 em SP não foi lido aqui: o valor é só do teste (a conferência com a planilha é do teste de referência).
const SHA = '9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2'
function recorte(): RecorteSinapi {
  return {
    formato: 'cronoai-recorte-sinapi',
    versao: 1,
    uf: 'SP',
    regime: 'nao-desonerado',
    dataBase: '2026-09',
    fonte: { publicacao: 'SINAPI — Caixa — Relatórios mensais (formato a partir de 2025)', arquivo: 'SINAPI_Referencia_2026_09.xlsx', sha256: SHA, bytes: 13631798, dataEmissao: '2026-10-09', abaCustos: 'CSD', layout: '2025' },
    encargos: { horista: 1.1501, mensalista: 0.7118 },
    filtro: { codigos: [], grupos: [] },
    totais: { composicoes: 3, excluidasSemCusto: 2155, excluidasCustoZeroNaUf: 1 },
    geradoEm: '2026-10-25T12:00:00.000Z',
    composicoes: [
      {
        codigo: '103332',
        descricao: 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X14X19 CM',
        unidade: 'M2',
        grupo: 'Alvenaria de Vedação',
        custoUnitario: 123.96,
        maoDeObra: [
          { codigo: '88316', funcao: 'SERVENTE', coeficiente: 0.8112688 },
          { codigo: '88309', funcao: 'PEDREIRO', coeficiente: 1.6225376 },
        ],
        percentualAS: 0,
      },
      {
        codigo: '104658',
        descricao: 'PISO PODOTÁTIL DE CONCRETO',
        unidade: 'M2',
        grupo: 'Pisos',
        custoUnitario: 208.85,
        maoDeObra: [
          { codigo: '88316', funcao: 'SERVENTE', coeficiente: 1.279 },
          { codigo: '88309', funcao: 'PEDREIRO', coeficiente: 0.639 },
        ],
      },
      { codigo: '107113', descricao: 'ESTACA ESCAVADA', unidade: 'M', grupo: 'Fundações', custoUnitario: 150, maoDeObra: [] },
    ],
  }
}
const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(recorte()))
const erros = (v: unknown) => {
  const r = validarRecorteSinapi(v)
  if (r.ok) throw new Error('esperava recusa')
  return r.erros
}

describe('validarRecorteSinapi: recorte válido', () => {
  it('passa e devolve os mesmos campos', () => {
    const r = validarRecorteSinapi(recorte())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.recorte).toEqual(recorte())
  })

  it('CR-10: encargos de SP exibidos como 115,01% / 71,18% (CSD) e 99,09% / 58,51% (CCD)', () => {
    const r = recorte()
    expect([fmtPct(r.encargos.horista * 100, 2), fmtPct(r.encargos.mensalista * 100, 2)]).toEqual(['115,01%', '71,18%'])
    expect([fmtPct(0.9909 * 100, 2), fmtPct(0.5851 * 100, 2)]).toEqual(['99,09%', '58,51%'])
  })

  it('o tamanho máximo do arquivo é 6 MiB', () => {
    expect(MAX_RECORTE_BYTES).toBe(6291456)
  })
})

describe('validarRecorteSinapi: matriz de recusas (uma por regra, mensagem em português)', () => {
  const muda = (f: (o: Record<string, unknown>) => void) => {
    const o = clone()
    f(o)
    return erros(o)
  }
  const comp = (o: Record<string, unknown>, i = 0) => (o.composicoes as Record<string, unknown>[])[i]!

  it('formato', () => {
    expect(muda((o) => (o.formato = 'outro'))).toEqual(['Este arquivo não é um recorte SINAPI do CronoAI.'])
    expect(erros(null)).toEqual(['Este arquivo não é um recorte SINAPI do CronoAI.'])
    expect(erros([])).toEqual(['Este arquivo não é um recorte SINAPI do CronoAI.'])
  })
  it('versão mais nova e versão inválida', () => {
    expect(muda((o) => (o.versao = 2))).toEqual(['Recorte gerado por uma versão mais nova do CronoAI (formato 2).'])
    expect(muda((o) => (o.versao = 0))).toContain('Versão do recorte inválida.')
    expect(muda((o) => (o.versao = '1'))).toContain('Versão do recorte inválida.')
  })
  it('uf, regime e data-base', () => {
    expect(muda((o) => (o.uf = 'XX'))).toContain('UF do recorte inválida.')
    expect(muda((o) => (o.regime = 'x'))).toContain('Regime do recorte inválido.')
    expect(muda((o) => (o.dataBase = '2026-13'))).toContain('Data-base do recorte inválida (use AAAA-MM).')
    expect(muda((o) => (o.dataBase = '2026-9'))).toContain('Data-base do recorte inválida (use AAAA-MM).')
  })
  it('fonte: sha256, arquivo, emissão, aba e coerência com o regime', () => {
    const fonte = (o: Record<string, unknown>) => o.fonte as Record<string, unknown>
    expect(muda((o) => (fonte(o).sha256 = 'ABC'))).toContain('Fonte: SHA-256 inválido.')
    expect(muda((o) => (fonte(o).arquivo = 'x'.repeat(121)))).toContain('Fonte: nome do arquivo inválido.')
    expect(muda((o) => (fonte(o).dataEmissao = '2026-02-30'))).toContain('Fonte: data de emissão inválida.')
    expect(muda((o) => (fonte(o).abaCustos = 'CSE'))).toContain('Fonte: aba de custos inválida.')
    expect(muda((o) => (fonte(o).abaCustos = 'CCD'))).toContain('Fonte: a aba de custos não corresponde ao regime.')
    expect(muda((o) => delete o.fonte)).toContain('Fonte do recorte ausente.')
  })
  it('encargos fora de (0, 3]', () => {
    const e = (o: Record<string, unknown>) => o.encargos as Record<string, unknown>
    expect(muda((o) => (e(o).horista = 0))).toContain('Encargos inválidos (devem estar entre 0 e 3).')
    expect(muda((o) => (e(o).mensalista = 3.01))).toContain('Encargos inválidos (devem estar entre 0 e 3).')
    expect(muda((o) => (e(o).horista = NaN))).toContain('Encargos inválidos (devem estar entre 0 e 3).')
  })
  it('lista de composições: vazia ou acima de 12.000', () => {
    expect(muda((o) => (o.composicoes = []))).toContain('O recorte deve ter de 1 a 12.000 composições.')
    expect(muda((o) => (o.composicoes = new Array(12001).fill(0)))).toContain('O recorte deve ter de 1 a 12.000 composições.')
  })
  it('composição: código, repetido, descrição, unidade, grupo e custo', () => {
    expect(muda((o) => (comp(o).codigo = 'abc'))).toEqual(['composicoes[0]: código inválido.'])
    expect(muda((o) => (comp(o, 1).codigo = '103332'))).toEqual(['composicoes[1]: código repetido no recorte.'])
    expect(muda((o) => (comp(o).descricao = ''))).toEqual(['composicoes[0]: descrição inválida (1 a 400 caracteres, sem controle).'])
    expect(muda((o) => (comp(o).descricao = 'a'.repeat(401)))).toHaveLength(1)
    expect(muda((o) => (comp(o).descricao = 'a\u0007b'))).toHaveLength(1)
    expect(muda((o) => (comp(o).unidade = 'm2'))).toEqual(['composicoes[0]: unidade inválida.'])
    expect(muda((o) => (comp(o).grupo = 'g'.repeat(161)))).toEqual(['composicoes[0]: grupo inválido (até 160 caracteres).'])
    expect(muda((o) => (comp(o).custoUnitario = 0))).toEqual(['composicoes[0]: custo unitário inválido.'])
    expect(muda((o) => (comp(o).custoUnitario = 10_000_001))).toHaveLength(1)
    expect(muda((o) => (comp(o).custoUnitario = '12'))).toHaveLength(1)
  })
  it('mão de obra: mais de 16, código, função de 61 caracteres e coeficiente', () => {
    const mo = (o: Record<string, unknown>, i = 0) => (comp(o).maoDeObra as Record<string, unknown>[])[i]!
    expect(muda((o) => (comp(o).maoDeObra = new Array(17).fill(0)))).toEqual(['composicoes[0]: mão de obra inválida (até 16 funções).'])
    expect(muda((o) => (mo(o).codigo = 'x'))).toEqual(['composicoes[0].maoDeObra[0]: código inválido.'])
    expect(muda((o) => (mo(o).funcao = 'F'.repeat(61)))).toEqual(['composicoes[0].maoDeObra[0]: função inválida (1 a 60 caracteres).'])
    const sessenta = clone()
    ;((comp(sessenta).maoDeObra as Record<string, unknown>[])[0] as Record<string, unknown>).funcao = 'F'.repeat(60)
    expect(validarRecorteSinapi(sessenta).ok).toBe(true) // 60 passa (MAX_FUNCAO)
    expect(muda((o) => (mo(o).coeficiente = 0))).toEqual(['composicoes[0].maoDeObra[0]: coeficiente inválido.'])
    expect(muda((o) => (mo(o).coeficiente = 10_001))).toHaveLength(1)
    expect(muda((o) => (comp(o).maoDeObra = [1]))).toEqual(['composicoes[0].maoDeObra[0]: formato inválido.'])
  })
  it('%AS fora de 0 a 100 (D-24)', () => {
    expect(muda((o) => (comp(o).percentualAS = 101))).toEqual(['composicoes[0]: %AS fora de 0 a 100.'])
    expect(muda((o) => (comp(o).percentualAS = -1))).toHaveLength(1)
    const cem = clone()
    comp(cem).percentualAS = 100
    expect(validarRecorteSinapi(cem).ok).toBe(true)
  })
  it('totais, filtro e data de geração', () => {
    expect(muda((o) => ((o.totais as Record<string, unknown>).composicoes = -1))).toContain('Totais inválidos.')
    expect(muda((o) => ((o.filtro as Record<string, unknown>).codigos = ['12a']))).toContain('Filtro: códigos inválidos.')
    expect(muda((o) => (o.geradoEm = 'ontem'))).toContain('Data de geração inválida.')
  })
  it('para no limite de mensagens (não devolve milhares de erros)', () => {
    const o = clone()
    o.composicoes = Array.from({ length: 500 }, () => ({}))
    expect(erros(o).length).toBeLessThanOrEqual(20)
  })
  it('a mensagem não repete o conteúdo do arquivo', () => {
    const msg = muda((o) => (comp(o).codigo = 'SEGREDO-<script>'))
    expect(msg.join(' ')).not.toContain('SEGREDO')
  })
})

describe('validarRecorteSinapi: poluição de protótipo e chaves extras (S-3)', () => {
  it('__proto__, constructor e chaves extras não aparecem no objeto validado e o protótipo fica intacto', () => {
    const texto = JSON.stringify(recorte()).replace('{"formato"', '{"__proto__":{"polui":true},"constructor":{"x":1},"extra":1,"formato"')
    const bruto = JSON.parse(texto)
    // Em JSON.parse, "__proto__" vira propriedade própria
    expect(Object.prototype.hasOwnProperty.call(bruto, '__proto__')).toBe(true)
    const r = validarRecorteSinapi(bruto)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(Object.keys(r.recorte)).toEqual(['formato', 'versao', 'uf', 'regime', 'dataBase', 'fonte', 'encargos', 'filtro', 'totais', 'geradoEm', 'composicoes'])
    expect(Object.prototype.hasOwnProperty.call(r.recorte, '__proto__')).toBe(false)
    expect(Object.keys(r.recorte.composicoes[0]!)).toEqual(['codigo', 'descricao', 'unidade', 'grupo', 'custoUnitario', 'maoDeObra', 'percentualAS'])
    expect(({} as Record<string, unknown>).polui).toBeUndefined()
    expect(Object.getPrototypeOf(r.recorte)).toBe(Object.prototype)
  })

  it('propriedade só herdada do protótipo não conta', () => {
    const o = Object.create({ formato: 'cronoai-recorte-sinapi' })
    expect(erros(o)).toEqual(['Este arquivo não é um recorte SINAPI do CronoAI.'])
  })
})

describe('lerRecorteDeTexto (M-2)', () => {
  it('JSON malformado, formato desconhecido e versão 2 dão 3 mensagens distintas', () => {
    const m = (t: string) => {
      const r = lerRecorteDeTexto(t)
      return r.ok ? [] : r.erros
    }
    expect(m('{"formato":')).toEqual(['O arquivo não é um JSON válido.'])
    expect(m('{"formato":"outro"}')).toEqual(['Este arquivo não é um recorte SINAPI do CronoAI.'])
    expect(m(JSON.stringify({ ...recorte(), versao: 2 }))).toEqual(['Recorte gerado por uma versão mais nova do CronoAI (formato 2).'])
    expect(lerRecorteDeTexto(JSON.stringify(recorte())).ok).toBe(true)
  })
})

describe('chave, fonte e conferência com a obra', () => {
  it('chave UF|regime|AAAA-MM e leitura de volta', () => {
    expect(chaveRecorte('SP', 'nao-desonerado', '2026-09')).toBe('SP|nao-desonerado|2026-09')
    expect(lerChaveRecorte('SP|nao-desonerado|2026-09')).toEqual({ uf: 'SP', regime: 'nao-desonerado', dataBase: '2026-09' })
    expect(lerChaveRecorte('SP|x|2026-09')).toBeUndefined()
    expect(lerChaveRecorte('XX|desonerado|2026-09')).toBeUndefined()
    expect(lerChaveRecorte('SP|desonerado|2026-9')).toBeUndefined()
    expect(lerChaveRecorte('SP|desonerado|2026-09|x')).toBeUndefined()
    expect(lerChaveRecorte(7)).toBeUndefined()
  })

  it('fonte citada na tela e nas notas', () => {
    expect(descreverFonte(recorte())).toBe('SINAPI SP 09/2026 não desonerado')
  })

  it('obra sem UF, regime ou data-base é recusada; BA × SP cita as duas chaves; chave igual passa', () => {
    const r = recorte()
    const pedir = 'Informe UF, regime e data-base do SINAPI em Obras › Dados da obra antes de importar.'
    expect(conferirRecorteComObra(r, { uf: 'SP', regimeSinapi: 'nao-desonerado' })).toBe(pedir)
    expect(conferirRecorteComObra(r, {})).toBe(pedir)
    expect(conferirRecorteComObra({ ...r, uf: 'BA', regime: 'desonerado' }, { uf: 'SP', regimeSinapi: 'nao-desonerado', dataBaseSinapi: '2026-09' })).toBe(
      'O recorte é de BA · 09/2026 · desonerado; esta obra é SP · 09/2026 · não desonerado. Nada foi importado.',
    )
    expect(conferirRecorteComObra(r, { uf: 'SP', regimeSinapi: 'nao-desonerado', dataBaseSinapi: '2026-09' })).toBeUndefined()
  })

  it('unidades para exibição', () => {
    expect(['M2', 'M3', 'KG', 'M', 'UN', 'M2XKM', 'H'].map(unidadeParaExibicao)).toEqual(['m²', 'm³', 'kg', 'm', 'un', 'M2XKM', 'H'])
  })
})

describe('busca no recorte', () => {
  const idx = indexarRecorte(recorte())
  it('por código exato, por prefixo de palavras e sem acento', () => {
    expect(buscarComposicoes(idx, '103332').map((c) => c.codigo)).toEqual(['103332'])
    expect(buscarComposicoes(idx, 'vedacao ceramicos').map((c) => c.codigo)).toEqual(['103332'])
    expect(buscarComposicoes(idx, 'PISO podotatil').map((c) => c.codigo)).toEqual(['104658'])
    expect(buscarComposicoes(idx, 'fundacoes').map((c) => c.codigo)).toEqual(['107113'])
    expect(buscarComposicoes(idx, 'inexistente')).toEqual([])
    expect(buscarComposicoes(idx, '   ')).toEqual([])
  })
  it('limita a 50 resultados', () => {
    const grande = recorte()
    grande.composicoes = Array.from({ length: 200 }, (_, i) => ({ codigo: String(1000 + i), descricao: `SERVICO ${i}`, unidade: 'M2', grupo: 'g', custoUnitario: 1, maoDeObra: [] }))
    const ix = indexarRecorte(grande)
    expect(buscarComposicoes(ix, 'servico')).toHaveLength(50)
    expect(buscarComposicoes(ix, 'servico', 7)).toHaveLength(7)
    expect(buscarComposicoes(ix, '1005')[0]!.codigo).toBe('1005')
  })
})

describe('composição → item e linha da planilha (CR-1, CR-2)', () => {
  const r = recorte()
  it('item: custo publicado, RUP e função principal, equipe proporcional e fonte', () => {
    const item = itemCatalogoDoRecorte(r.composicoes[0]!, r)
    expect(item).toMatchObject({ code: '103332', unit: 'm²', rup: 1.6225376, professional: 'Pedreiro', unitCost: 123.96, helperRatio: 0, group: '03', fonte: 'SINAPI SP 09/2026 não desonerado' })
    expect(item.equipe).toEqual([{ recurso: 'Servente', proporcao: 0.5 }])
  })

  it('CR-1: 640 m², equipe 4 → 33 d.u., Pedreiro 4 + Servente 2', () => {
    const l = linhaDoRecorte(r.composicoes[0]!, r, 640, 4)
    expect(lineDuration(l, 8)).toBe(33)
    expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(l.quantity * l.unitCost).toBeCloseTo(79334.4, 2)
    expect(l.fonte).toBe('SINAPI SP 09/2026 não desonerado')
  })

  it('CR-2: 104658, 100 m², equipe 2 → 4 d.u., Pedreiro 2 + Servente 4', () => {
    const l = linhaDoRecorte(r.composicoes[1]!, r, 100, 2)
    expect(lineDuration(l, 8)).toBe(4)
    expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 4 }])
  })

  it('composição sem mão de obra: RUP 0 e sem equipe por função (a RUP é informada à mão)', () => {
    const item = itemCatalogoDoRecorte(r.composicoes[2]!, r)
    expect(item.rup).toBe(0)
    expect(item.equipe).toBeUndefined()
    expect(linhaDoRecorte(r.composicoes[2]!, r, 10, 2).equipe).toBeUndefined()
  })
})
