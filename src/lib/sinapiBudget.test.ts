import { describe, expect, it } from 'vitest'
import type { ItemCatalogoSinapi } from '@/types/sinapi'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import { AVISO_MODELO_CSV, BUDGET_CSV_TEMPLATE, HELPER_RATIO_PADRAO, LIMITES_LINHA, MAX_BUDGET_LINES, ehFonteAlterada, erroDeValorDaLinha, fonteBase, lineDuration, lineFromCatalog, lineResources, marcarFonteAlterada, parseBudgetCsv, parseNumberBR } from './sinapiBudget'

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

// ---------------------------------------------------------------------------
// Ciclo 00006: equipe por função, horas por dia da obra e CSV com o recorte
// ---------------------------------------------------------------------------
describe('caracterização: linha do catálogo ilustrativo segue igual (CR-9, N-4)', () => {
  const b1 = lineFromCatalog(SINAPI_CATALOG.find((c) => c.code === '103332')!, 'b-1', 640, 4, 'Áreas comuns (térreo)')

  it('seedBudget b-1: 17 d.u., Pedreiro 4 + Servente 2, sem equipe nem fonte (ilustrativa)', () => {
    expect(lineDuration(b1, 8)).toBe(17) // HH 524,8 ÷ (4 × 8) = 16,4
    expect(lineResources(b1)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(b1.equipe).toBeUndefined()
    expect(b1.fonte).toBeUndefined()
  })

  it('o ceil do helperRatio mantém o −1e-9 (sem a tolerância de 0,05 da equipe por função)', () => {
    // 3 × 0,35 = 1,05: com −1e-9 vira 2 servente; com a tolerância da EO-2 seria 1
    expect(lineResources({ professional: 'Gesseiro', team: 3, helperRatio: 0.35 })).toEqual([{ resource: 'Gesseiro', units: 3 }, { resource: 'Servente', units: 2 }])
    // 2 × 0,5 = 1 exato: 1 servente (o ruído de ponto flutuante não acrescenta um)
    expect(lineResources({ professional: 'Pedreiro', team: 2, helperRatio: 0.5 })[1]).toEqual({ resource: 'Servente', units: 1 })
  })

  it('CR-12: o mesmo CR-1 com 450 min/dia (7,5 h) dá 35 d.u.; com 480, 33 (a linha do recorte)', () => {
    const l = { quantity: 640, rup: 1.6225376, team: 4 }
    expect(lineDuration(l, 8)).toBe(33)
    expect(lineDuration(l, 450 / 60)).toBe(35) // antes (8 h fixas): 33 d.u. = 14.850 min com 450 min/dia
  })
})

describe('CSV com o código do recorte (AC-12)', () => {
  const item: ItemCatalogoSinapi = {
    code: '103332',
    description: 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X14X19 CM',
    unit: 'm²',
    rup: 1.6225376,
    professional: 'Pedreiro',
    helperRatio: 0,
    unitCost: 123.96,
    group: '03',
    equipe: [{ recurso: 'Servente', proporcao: 0.5 }],
    fonte: 'SINAPI SP 09/2026 não desonerado',
  }

  it('103332 completa RUP, custo, função e equipe pelo recorte', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade;equipe\n103332;;m²;640;4', [item])
    expect(r.errors).toEqual([])
    expect(r.lines[0]).toMatchObject({ code: '103332', rup: 1.6225376, unitCost: 123.96, professional: 'Pedreiro', equipe: [{ recurso: 'Servente', proporcao: 0.5 }], fonte: 'SINAPI SP 09/2026 não desonerado', team: 4, group: '03' })
    expect(r.lines[0]!.description).toBe(item.description)
    expect(lineDuration(r.lines[0]!, 8)).toBe(33)
    expect(lineResources(r.lines[0]!)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  const ALTERADA = 'SINAPI SP 09/2026 não desonerado · alterado'

  it('CSV com a mesma RUP, o mesmo custo e o mesmo profissional do recorte: segue "publicado" (fonte sem marca, equipe do recorte)', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade;rup;custo unitario;profissional;equipe\n103332;;m²;640;1,6225376;123,96;Pedreiro;4', [item])
    expect(r.lines[0]).toMatchObject({ fonte: 'SINAPI SP 09/2026 não desonerado', equipe: [{ recurso: 'Servente', proporcao: 0.5 }], helperRatio: 0 })
  })

  // Itens reais do recorte de SP (09/2026) para o CR-2 (104658) e o CR-3 (103681): proporções publicadas 1,279 ÷ 0,639 e 1,145 ÷ 1,428 / 0,357 ÷ 1,428
  const cr2: ItemCatalogoSinapi = { ...item, code: '104658', description: 'PISO PODOTÁTIL', rup: 0.639, unitCost: 208.85, group: '06', equipe: [{ recurso: 'Servente', proporcao: 1.279 / 0.639 }] }
  const cr3: ItemCatalogoSinapi = {
    ...item,
    code: '103681',
    description: 'CONCRETAGEM DE VIGAS E LAJES',
    unit: 'm³',
    rup: 1.428,
    unitCost: 732.45,
    group: '02',
    equipe: [{ recurso: 'Servente', proporcao: 1.145 / 1.428 }, { recurso: 'Carpinteiro', proporcao: 0.357 / 1.428 }],
  }
  const texto = (cab: string, linha: string) => `codigo;descricao;unidade;quantidade;${cab}\n${linha}`

  it('RUP digitada diferente da publicada: fonte "· alterado", MANTÉM a equipe por função do recorte (duração pela RUP digitada)', () => {
    const l = parseBudgetCsv('codigo;descricao;unidade;quantidade;rup;equipe\n103332;;m²;640;0,9;4', [item]).lines[0]!
    expect(l).toMatchObject({ rup: 0.9, fonte: ALTERADA, helperRatio: 0, equipe: [{ recurso: 'Servente', proporcao: 0.5 }] })
    expect(lineDuration(l, 8)).toBe(18) // 640 × 0,9 ÷ (4 × 8) = 18 (com a RUP publicada seriam 33)
    expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  it('custo digitado diferente do publicado: fonte "· alterado", o custo digitado e a equipe por função mantida', () => {
    const l = parseBudgetCsv('codigo;descricao;unidade;quantidade;custo unitario;equipe\n103332;;m²;640;150,00;4', [item]).lines[0]!
    expect(l).toMatchObject({ unitCost: 150, rup: 1.6225376, fonte: ALTERADA, helperRatio: 0, equipe: [{ recurso: 'Servente', proporcao: 0.5 }] })
  })

  it('CR-2: custo ou RUP alterados mantêm Pedreiro 2 + Servente 4 (antes desta rodada: Pedreiro 2 + Servente 1, e o servente precisaria de 16 d numa tarefa de 4 d)', () => {
    for (const cab of ['custo unitario;equipe', 'rup;equipe']) {
      const valor = cab.startsWith('custo') ? '300' : '0,7'
      const l = parseBudgetCsv(texto(cab, `104658;;m²;100;${valor};2`), [cr2]).lines[0]!
      expect(l.fonte).toBe(ALTERADA)
      expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 4 }])
    }
    // O comportamento da rodada anterior (equipe trocada pelo helperRatio 0,5) dava 1 servente: Math.ceil(2 × 0,5 − 1e-9)
    expect(Math.ceil(2 * HELPER_RATIO_PADRAO - 1e-9)).toBe(1)
  })

  it('CR-3: custo ou RUP alterados mantêm Pedreiro 4 + Servente 4 + Carpinteiro 1 (antes desta rodada: Pedreiro 4 + Servente 2, e o carpinteiro sumia)', () => {
    for (const cab of ['custo unitario;equipe', 'rup;equipe']) {
      const valor = cab.startsWith('custo') ? '800' : '1,5'
      const l = parseBudgetCsv(texto(cab, `103681;;m³;320;${valor};4`), [cr3]).lines[0]!
      expect(l.fonte).toBe(ALTERADA)
      expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 4 }, { resource: 'Carpinteiro', units: 1 }])
    }
  })

  it('profissional trocado (CR-3): só aí cai no servente por oficial comum (0,5), sem as funções do recorte', () => {
    const l = parseBudgetCsv(texto('profissional;equipe', '103681;;m³;320;Armador;4'), [cr3]).lines[0]!
    expect(l).toMatchObject({ professional: 'Armador', fonte: ALTERADA, helperRatio: HELPER_RATIO_PADRAO })
    expect('equipe' in l).toBe(false)
    expect(lineResources(l)).toEqual([{ resource: 'Armador', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  it('profissional trocado no CSV (CR-1): fonte "· alterado", a equipe efetiva é a do profissional informado (nunca a do recorte)', () => {
    const l = parseBudgetCsv('codigo;descricao;unidade;quantidade;profissional;equipe\n103332;;m²;640;Carpinteiro;4', [item]).lines[0]!
    expect(l).toMatchObject({ professional: 'Carpinteiro', fonte: ALTERADA, helperRatio: 0.5 })
    expect('equipe' in l).toBe(false)
    expect(lineResources(l)).toEqual([{ resource: 'Carpinteiro', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  it('cabeçalho com sublinhado ("custo_unitario") é o custo (antes da rodada 03: a coluna era ignorada e valia o custo do recorte, R$ 123,96)', () => {
    const l = parseBudgetCsv('codigo;descricao;local;unidade;quantidade;rup;custo_unitario;equipe\n103332;;;m²;640;0,82;98,50;4', [item]).lines[0]!
    expect(l.unitCost).toBe(98.5)
    expect(l.rup).toBe(0.82)
    expect(l.fonte).toBe(ALTERADA)
  })

  it('modelo baixável: "rup" e "custo_unitario" VAZIOS valem o recorte (R$ 123,96 e RUP 1,6225376) ou o catálogo; as linhas fora do recorte dão erro com o número da linha do ARQUIVO', () => {
    // ANTES (rodada 03): o modelo trazia RUP 0,82 e custo 98,50 preenchidos, e com recorte a linha 103332 saía "alterada" com BAC 640 × 98,50 = R$ 63.040,00
    const r = parseBudgetCsv(BUDGET_CSV_TEMPLATE, [item])
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0]).toMatchObject({ code: '103332', rup: 1.6225376, unitCost: 123.96, fonte: 'SINAPI SP 09/2026 não desonerado', equipe: [{ recurso: 'Servente', proporcao: 0.5 }] })
    expect(r.lines[0]!.quantity * r.lines[0]!.unitCost).toBeCloseTo(79334.4, 2) // DEPOIS: o publicado
    expect(r.errors).toEqual(['Linha 5: RUP ausente e código 87529 fora do catálogo.', 'Linha 6: RUP ausente e código 87263 fora do catálogo.'])
    // Sem recorte: o catálogo ilustrativo, com os mesmos valores que o modelo trazia antes (nada muda)
    const cat = parseBudgetCsv(BUDGET_CSV_TEMPLATE)
    expect(cat.errors).toEqual([])
    expect(cat.lines.map((l) => [l.code, l.rup, l.unitCost, l.team])).toEqual([['103332', 0.82, 98.5, 4], ['87529', 0.62, 38.9, 4], ['87263', 0.7, 189, 3]])
  })

  it('o texto do modelo explica que valor preenchido substitui o publicado e sai "alterado"; linhas "#" e em branco são ignoradas', () => {
    expect(BUDGET_CSV_TEMPLATE.startsWith(`# ${AVISO_MODELO_CSV}`)).toBe(true)
    expect(AVISO_MODELO_CSV).toContain('VAZIOS')
    expect(AVISO_MODELO_CSV).toContain('substitui o publicado')
    expect(AVISO_MODELO_CSV).toContain('"alterado"')
    const r = parseBudgetCsv('# comentário\n\ncodigo;descricao;unidade;quantidade\n;x;m²;0')
    expect(r.errors).toEqual(['Linha 4: quantidade inválida.']) // a linha do arquivo, contando o comentário e a linha em branco
    expect(parseBudgetCsv('# só comentário\n')).toEqual({ lines: [], errors: ['Arquivo vazio.'] })
  })

  it('"1e308", "1e999" e valores acima do teto são recusados com o motivo (quantidade, custo, RUP e equipe); no teto vale', () => {
    const um = (cab: string, linha: string) => parseBudgetCsv(`codigo;descricao;unidade;quantidade;${cab}\n${linha}`, [item])
    expect(um('equipe', '103332;;m²;1e308;4').errors).toEqual(['Linha 2: quantidade acima do limite de 1.000.000.000.'])
    expect(um('equipe', '103332;;m²;1e999;4').errors).toEqual(['Linha 2: quantidade inválida.'])
    expect(um('custo unitario;equipe', '103332;;m²;10;1e308;4').errors).toEqual(['Linha 2: custo unitário acima do limite de 10.000.000.'])
    expect(um('custo unitario;equipe', '103332;;m²;10;1e999;4').errors).toEqual(['Linha 2: custo unitário inválida.'])
    expect(um('rup;equipe', '103332;;m²;10;1e999;4').errors).toEqual(['Linha 2: RUP inválida.'])
    expect(um('rup;equipe', '103332;;m²;10;10001;4').errors).toEqual(['Linha 2: RUP acima do limite de 10.000.'])
    expect(um('equipe', '103332;;m²;10;1001').errors).toEqual(['Linha 2: equipe acima do limite de 1.000.'])
    for (const l of [um('custo unitario;equipe', '103332;;m²;1000000000;10000000;4').lines[0]!]) {
      expect(l.quantity).toBe(1e9)
      expect(Number.isFinite(l.quantity * l.unitCost)).toBe(true) // 1e16: finito
    }
  })

  it('erroDeValorDaLinha: não finito, negativo, zero (menos no custo) e acima do teto', () => {
    expect(erroDeValorDaLinha('quantity', Infinity)).toBe('quantidade inválida')
    expect(erroDeValorDaLinha('quantity', NaN)).toBe('quantidade inválida')
    expect(erroDeValorDaLinha('quantity', 0)).toBe('quantidade inválida')
    expect(erroDeValorDaLinha('unitCost', 0)).toBeUndefined()
    expect(erroDeValorDaLinha('unitCost', -1)).toBe('custo unitário inválida')
    expect(erroDeValorDaLinha('rup', 345.33)).toBeUndefined() // o maior RUP publicado em 09/2026
    expect(erroDeValorDaLinha('unitCost', 228977.2)).toBeUndefined() // o maior custo publicado
    expect(erroDeValorDaLinha('team', 1001)).toBe('equipe acima do limite de 1.000')
    expect(LIMITES_LINHA).toEqual({ quantity: 1e9, unitCost: 1e7, rup: 1e4, team: 1000 })
  })

  it('as funções da marca de alteração', () => {
    expect(ehFonteAlterada(ALTERADA)).toBe(true)
    expect(ehFonteAlterada('SINAPI SP 09/2026 não desonerado')).toBe(false)
    expect(ehFonteAlterada(undefined)).toBe(false)
    expect(fonteBase(ALTERADA)).toBe('SINAPI SP 09/2026 não desonerado')
    expect(fonteBase('SINAPI SP 09/2026 não desonerado')).toBe('SINAPI SP 09/2026 não desonerado')
    expect(marcarFonteAlterada('SINAPI SP 09/2026 não desonerado')).toBe(ALTERADA)
    expect(marcarFonteAlterada(ALTERADA)).toBe(ALTERADA)
  })

  it('código fora do recorte segue a regra de hoje (RUP ausente é erro)', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade\n999999;Serviço;m²;10', [item])
    expect(r.lines).toHaveLength(0)
    expect(r.errors).toEqual(['Linha 2: RUP ausente e código 999999 fora do catálogo.'])
  })

  it('composição do recorte sem mão de obra (RUP 0) exige a RUP na planilha, com mensagem própria (não "fora do catálogo")', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade\n107113;;M;100', [{ ...item, code: '107113', rup: 0, equipe: undefined }])
    expect(r.lines).toHaveLength(0)
    expect(r.errors).toEqual(['Linha 2: composição sem mão de obra no recorte (código 107113): informe a RUP na planilha.'])
    // Com a RUP digitada a linha entra (fonte alterada: a RUP é do usuário)
    const ok = parseBudgetCsv('codigo;descricao;unidade;quantidade;rup\n107113;;M;100;1,5', [{ ...item, code: '107113', rup: 0, equipe: undefined }])
    expect(ok.errors).toEqual([])
    expect(ok.lines[0]).toMatchObject({ rup: 1.5, fonte: ALTERADA })
  })
})
