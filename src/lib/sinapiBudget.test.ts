import { describe, expect, it } from 'vitest'
import type { ItemCatalogoSinapi } from '@/types/sinapi'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import { HELPER_RATIO_PADRAO, MAX_BUDGET_LINES, ehFonteAlterada, fonteBase, lineDuration, lineFromCatalog, lineResources, marcarFonteAlterada, parseBudgetCsv, parseNumberBR } from './sinapiBudget'

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

  it('RUP digitada diferente da publicada: fonte "· alterado", sem a equipe proporcional do recorte e com o servente por oficial comum (0,5)', () => {
    const r = parseBudgetCsv('codigo;descricao;unidade;quantidade;rup;equipe\n103332;;m²;640;0,9;4', [item])
    const l = r.lines[0]!
    expect(l).toMatchObject({ rup: 0.9, fonte: ALTERADA, helperRatio: HELPER_RATIO_PADRAO })
    expect(HELPER_RATIO_PADRAO).toBe(0.5)
    expect('equipe' in l).toBe(false)
    expect(lineDuration(l, 8)).toBe(18) // 640 × 0,9 ÷ (4 × 8) = 18 (com a RUP publicada seriam 33)
    expect(lineResources(l)).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  it('custo digitado diferente do publicado: fonte "· alterado" e o custo digitado', () => {
    const l = parseBudgetCsv('codigo;descricao;unidade;quantidade;custo unitario;equipe\n103332;;m²;640;150,00;4', [item]).lines[0]!
    expect(l).toMatchObject({ unitCost: 150, rup: 1.6225376, fonte: ALTERADA, helperRatio: 0.5 })
    expect('equipe' in l).toBe(false)
  })

  it('profissional trocado no CSV: fonte "· alterado", a equipe efetiva é a do profissional informado (nunca a do recorte)', () => {
    const l = parseBudgetCsv('codigo;descricao;unidade;quantidade;profissional;equipe\n103332;;m²;640;Carpinteiro;4', [item]).lines[0]!
    expect(l).toMatchObject({ professional: 'Carpinteiro', fonte: ALTERADA })
    expect('equipe' in l).toBe(false)
    expect(lineResources(l)).toEqual([{ resource: 'Carpinteiro', units: 4 }, { resource: 'Servente', units: 2 }])
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
