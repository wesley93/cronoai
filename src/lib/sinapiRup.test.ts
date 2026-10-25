import { describe, expect, it } from 'vitest'
import { RESOURCE_KINDS } from '@/types/domain'
import type { FuncaoMaoDeObra } from '@/types/sinapi'
import { premissasPadrao, taxaHora } from './premissas'
import { durationFromTeam, scheduleDays, totalManHours } from './sinapi'
import { horasPorDia } from './calendarioTrabalho'
import {
  TOLERANCIA_EQUIPE,
  custoMaoDeObraPorFuncao,
  ehFuncaoDeApoio,
  ehFuncaoDeSupervisao,
  ehItemMaoDeObra,
  equipeDaComposicao,
  funcaoPrincipal,
  notasDaTarefaSinapi,
  nomeDaFuncao,
  recursosDaEquipe,
  rotuloFuncao,
  rupPorFuncao,
  type ItemAnalitico,
} from './sinapiRup'

// Coeficientes e funções literais do Analítico da planilha SINAPI_Referencia_2026_09.xlsx (Caixa, mês de referência 09/2026).
// Os códigos dos itens de mão de obra são só identificadores do teste; o que vale é a função e o coeficiente publicados.
const f = (codigo: string, funcao: string, coeficiente: number): FuncaoMaoDeObra => ({ codigo, funcao, coeficiente })
const SERV = '88316'
const PED = '88309'
const MO = {
  c104658: [f(SERV, 'SERVENTE', 1.279), f(PED, 'PEDREIRO', 0.639)],
  c103332: [f(SERV, 'SERVENTE', 0.8112688), f(PED, 'PEDREIRO', 1.6225376)],
  c103681: [f(SERV, 'SERVENTE', 1.145), f(PED, 'PEDREIRO', 1.428), f('1', 'CARPINTEIRO DE FORMAS', 0.357)],
  c100700: [f(SERV, 'SERVENTE', 1.8305384), f(PED, 'PEDREIRO', 1.7058427), f('2', 'CARPINTEIRO DE ESQUADRIAS', 4.7714472)],
  c93358: [f(SERV, 'SERVENTE', 3.9557667)],
  c89357: [f('3', 'ENCANADOR OU BOMBEIRO HIDRÁULICO', 0.488576), f('4', 'AUXILIAR DE ENCANADOR OU BOMBEIRO HIDRÁULICO', 0.488576)],
  c92413: [f('1', 'CARPINTEIRO DE FORMAS', 2.052), f('5', 'AJUDANTE DE CARPINTEIRO', 0.376)],
  c103669: [f(SERV, 'SERVENTE', 7.377), f(PED, 'PEDREIRO', 2.459), f('1', 'CARPINTEIRO DE FORMAS', 2.459)],
  c107113: [f(SERV, 'SERVENTE', 1.5816), f('6', 'ENGENHEIRO CIVIL DE OBRA PLENO', 0.0041)],
  c101183: [f('7', 'ENCARREGADO GERAL', 0.351), f(PED, 'PEDREIRO', 0.276)],
}

describe('mão de obra do Analítico (D-5)', () => {
  const item = (tipoItem: string, unidade: string, descricao: string, coeficiente = 1, codigo = '1'): ItemAnalitico => ({ tipoItem, codigo, unidade, descricao, coeficiente })

  it('funções da 104658 e da 100700 vêm do Analítico com o coeficiente publicado, na ordem', () => {
    const itens104658 = [
      item('COMPOSICAO', 'H', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 1.279, SERV),
      item('COMPOSICAO', 'H', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 0.639, PED),
      item('INSUMO', 'KG', 'CIMENTO PORTLAND', 12),
    ]
    expect(rupPorFuncao(itens104658)).toEqual([f(SERV, 'SERVENTE', 1.279), f(PED, 'PEDREIRO', 0.639)])
    const itens100700 = [
      item('COMPOSICAO', 'H', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 1.8305384, SERV),
      item('COMPOSICAO', 'H', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 1.7058427, PED),
      item('COMPOSICAO', 'H', 'CARPINTEIRO DE ESQUADRIAS COM ENCARGOS COMPLEMENTARES', 4.7714472, '2'),
    ]
    expect(rupPorFuncao(itens100700).map((x) => [x.funcao, x.coeficiente])).toEqual([
      ['SERVENTE', 1.8305384],
      ['PEDREIRO', 1.7058427],
      ['CARPINTEIRO DE ESQUADRIAS', 4.7714472],
    ])
  })

  it('item de insumo, unidade ≠ H ou sem o sufixo não é mão de obra', () => {
    expect(ehItemMaoDeObra(item('INSUMO', 'H', 'SEGURO - HORISTA COM ENCARGOS COMPLEMENTARES'))).toBe(false)
    expect(ehItemMaoDeObra(item('COMPOSICAO', 'H', 'CAMINHÃO TOCO, PESO BRUTO 13000 KG'))).toBe(false)
    expect(ehItemMaoDeObra(item('COMPOSICAO', 'M3', 'PEDREIRO COM ENCARGOS COMPLEMENTARES'))).toBe(false)
    expect(ehItemMaoDeObra(item('COMPOSICAO', 'H', 'PEDREIRO COM ENCARGOS COMPLEMENTARES'))).toBe(true)
    expect(nomeDaFuncao('PEDREIRO COM ENCARGOS COMPLEMENTARES')).toBe('PEDREIRO')
  })

  it('mesmo código repetido soma o coeficiente; coeficiente não positivo é ignorado', () => {
    const r = rupPorFuncao([
      item('COMPOSICAO', 'H', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 0.5, PED),
      item('COMPOSICAO', 'H', 'PEDREIRO COM ENCARGOS COMPLEMENTARES', 0.25, PED),
      item('COMPOSICAO', 'H', 'SERVENTE COM ENCARGOS COMPLEMENTARES', 0, SERV),
    ])
    expect(r).toEqual([f(PED, 'PEDREIRO', 0.75)])
  })
})

describe('função principal (D-6, EO-1)', () => {
  it('apoio e supervisão são reconhecidos', () => {
    expect(['SERVENTE', 'AUXILIAR DE ELETRICISTA', 'AJUDANTE ESPECIALIZADO', 'AJUDANTE DE ARMADOR'].every(ehFuncaoDeApoio)).toBe(true)
    expect(['PEDREIRO', 'IMPERMEABILIZADOR', 'ENGENHEIRO CIVIL DE OBRA PLENO'].some(ehFuncaoDeApoio)).toBe(false)
    expect(['ENGENHEIRO CIVIL DE OBRA PLENO', 'ENCARREGADO GERAL'].every(ehFuncaoDeSupervisao)).toBe(true)
    expect(ehFuncaoDeSupervisao('PEDREIRO')).toBe(false)
  })

  it('maior oficial; empate pelo 1º do Analítico; só apoio → a maior de apoio (CR-8)', () => {
    expect(funcaoPrincipal(MO.c104658)?.funcao).toBe('PEDREIRO')
    expect(funcaoPrincipal(MO.c103669)?.funcao).toBe('PEDREIRO') // 2,459 = 2,459: o 1º é o pedreiro
    expect(funcaoPrincipal(MO.c93358)?.funcao).toBe('SERVENTE')
    expect(funcaoPrincipal([])).toBeUndefined()
    expect(funcaoPrincipal([f('1', 'AJUDANTE DE ARMADOR', 0.1), f('2', 'SERVENTE', 0.3)])?.funcao).toBe('SERVENTE')
  })

  it('só supervisão → a maior de supervisão', () => {
    expect(funcaoPrincipal([f('7', 'ENCARREGADO GERAL', 0.351), f('6', 'ENGENHEIRO CIVIL DE OBRA PLENO', 0.02)])?.funcao).toBe('ENCARREGADO GERAL')
  })

  it('supervisão não é principal nem recurso: 107113 → SERVENTE e 101183 → PEDREIRO', () => {
    expect(funcaoPrincipal(MO.c107113)?.funcao).toBe('SERVENTE') // ANTES da EO-1: o engenheiro (0,0041 h/m)
    expect(funcaoPrincipal(MO.c101183)?.funcao).toBe('PEDREIRO') // ANTES da EO-1: o encarregado (0,351)
    const eq = equipeDaComposicao(MO.c107113)!
    expect(eq.proporcoes).toEqual([])
    expect(eq.supervisao.map((x) => x.funcao)).toEqual(['ENGENHEIRO CIVIL DE OBRA PLENO'])
  })

  it('CR-8: 103669 → proporções Servente 3,0 e Carpinteiro 1,0', () => {
    const eq = equipeDaComposicao(MO.c103669)!
    expect(eq.principal.funcao).toBe('PEDREIRO')
    expect(eq.proporcoes).toEqual([
      { recurso: 'Servente', proporcao: 3 },
      { recurso: 'Carpinteiro', proporcao: 1 },
    ])
  })
})

describe('tolerância do ceil e mínimo de 1 por função (EO-2)', () => {
  it('TOLERANCIA_EQUIPE = 0,05', () => {
    expect(TOLERANCIA_EQUIPE).toBe(0.05)
  })

  it('4,0031 → 4 (antes 5); 3,2073 → 4; 1,0994 → 2; 0,3836 → 1', () => {
    const un = (n: number, proporcao: number) => recursosDaEquipe('Principal', n, [{ recurso: 'Outro', proporcao }])[1].units
    expect(un(2, 1.279 / 0.639)).toBe(4) // ⌈4,0031 − 0,05⌉; antes da EO-2: ⌈4,0031 − 1e-9⌉ = 5
    expect(Math.ceil(2 * (1.279 / 0.639) - 1e-9)).toBe(5)
    expect(un(4, 1.145 / 1.428)).toBe(4)
    expect(un(6, 0.376 / 2.052)).toBe(2)
    expect(un(1, 1.8305384 / 4.7714472)).toBe(1) // 0,3836 → mínimo de 1
  })

  it('a principal leva o mínimo de 1 e rótulos repetidos somam', () => {
    expect(recursosDaEquipe('Pedreiro', 0, [])).toEqual([{ resource: 'Pedreiro', units: 1 }])
    expect(
      recursosDaEquipe('Pedreiro', 2, [
        { recurso: 'Servente', proporcao: 1 },
        { recurso: 'Servente', proporcao: 1 },
      ]),
    ).toEqual([
      { resource: 'Pedreiro', units: 2 },
      { resource: 'Servente', units: 4 },
    ])
  })
})

describe('duração, equipe e BAC: CR-1 a CR-7 e CR-13/CR-14 (tabela 4.3 do plano; fonte SINAPI 09/2026)', () => {
  // Cada caso: composição, quantidade, equipe, custo unitário publicado na UF e regime, esperados.
  const casos = [
    { cr: 'CR-1', mo: MO.c103332, q: 640, equipe: 4, custo: 123.96, hh: 1038.424064, bruto: 32.450752, dias: 33, recursos: ['Pedreiro 4', 'Servente 2'], bac: 79334.4 },
    { cr: 'CR-2', mo: MO.c104658, q: 100, equipe: 2, custo: 208.85, hh: 63.9, bruto: 3.99375, dias: 4, recursos: ['Pedreiro 2', 'Servente 4'], bac: 20885 },
    { cr: 'CR-3', mo: MO.c103681, q: 320, equipe: 4, custo: 904.47, hh: 456.96, bruto: 14.28, dias: 15, recursos: ['Pedreiro 4', 'Servente 4', 'Carpinteiro 1'], bac: 289430.4 },
    { cr: 'CR-4', mo: MO.c100700, q: 10, equipe: 1, custo: 998.96, hh: 47.714472, bruto: 5.964309, dias: 6, recursos: ['Carpinteiro de esquadrias 1', 'Servente 1', 'Pedreiro 1'], bac: 9989.6 },
    { cr: 'CR-5', mo: MO.c93358, q: 50, equipe: 3, custo: 93.59, hh: 197.788335, bruto: 8.241180625, dias: 9, recursos: ['Servente 3'], bac: 4679.5 },
    { cr: 'CR-6', mo: MO.c89357, q: 3600, equipe: 6, custo: 38.84, hh: 1758.8736, bruto: 36.6432, dias: 37, recursos: ['Encanador 6', 'Auxiliar de encanador ou bombeiro hidráulico 6'], bac: 139824 },
    { cr: 'CR-7', mo: MO.c92413, q: 1500, equipe: 6, custo: 118.57, hh: 3078, bruto: 64.125, dias: 65, recursos: ['Carpinteiro 6', 'Ajudante de carpinteiro 2'], bac: 177855 },
    { cr: 'CR-13', mo: MO.c107113, q: 100, equipe: 2, custo: 1, hh: 158.16, bruto: 9.885, dias: 10, recursos: ['Servente 2'], bac: 100 },
    { cr: 'CR-14', mo: MO.c101183, q: 50, equipe: 2, custo: 1, hh: 13.8, bruto: 0.8625, dias: 1, recursos: ['Pedreiro 2'], bac: 50 },
  ]

  it.each(casos)('$cr', ({ mo, q, equipe, custo, hh, bruto, dias, recursos, bac }) => {
    const eq = equipeDaComposicao(mo)!
    const rup = eq.principal.coeficiente
    expect(totalManHours(q, rup)).toBeCloseTo(hh, 9)
    const b = durationFromTeam(q, rup, equipe, horasPorDia(480))
    expect(b).toBeCloseTo(bruto, 9)
    expect(scheduleDays(b)).toBe(dias)
    const rec = recursosDaEquipe(rotuloFuncao(eq.principal.funcao), equipe, eq.proporcoes)
    expect(rec.map((r) => `${r.resource} ${r.units}`)).toEqual(recursos)
    expect(q * custo).toBeCloseTo(bac, 2)
  })

  it('BAC com centavos: o antes → depois da tarefa (D-19) em CR-1, CR-3, CR-4 e CR-5', () => {
    // Antes: Math.round(q × custo) gravado na tarefa. Depois: q × custo.
    expect([640 * 123.96, 320 * 904.47, 10 * 998.96, 50 * 93.59].map((v) => Math.round(v))).toEqual([79334, 289430, 9990, 4680])
    expect(640 * 123.96).toBeCloseTo(79334.4, 2)
    expect(320 * 904.47).toBeCloseTo(289430.4, 2)
    expect(10 * 998.96).toBeCloseTo(9989.6, 2)
    expect(50 * 93.59).toBeCloseTo(4679.5, 2)
  })
})

describe('rótulos (D-16, D-22)', () => {
  it('os 10 rótulos mapeados são exatamente as chaves de premissas.taxas (RESOURCE_KINDS)', () => {
    const mapeados = [
      'PEDREIRO',
      'SERVENTE',
      'CARPINTEIRO DE FORMAS',
      'ARMADOR',
      'ELETRICISTA',
      'ENCANADOR OU BOMBEIRO HIDRÁULICO',
      'GESSEIRO',
      'AZULEJISTA OU LADRILHEIRO',
      'PINTOR',
      'OPERADOR DE MÁQUINAS E EQUIPAMENTOS',
    ].map(rotuloFuncao)
    expect(mapeados).toEqual(['Pedreiro', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Gesseiro', 'Azulejista', 'Pintor', 'Operador de equipamento'])
    expect(mapeados.every((r) => (RESOURCE_KINDS as readonly string[]).includes(r))).toBe(true)
    expect(new Set(mapeados).size).toBe(RESOURCE_KINDS.length)
  })

  it('função sem equivalente: 1ª letra maiúscula e o resto minúsculo', () => {
    expect(rotuloFuncao('AUXILIAR DE ENCANADOR OU BOMBEIRO HIDRÁULICO')).toBe('Auxiliar de encanador ou bombeiro hidráulico')
    expect(rotuloFuncao('  IMPERMEABILIZADOR ')).toBe('Impermeabilizador')
  })
})

describe('custo de mão de obra por função (CR-15, D-21, R-1)', () => {
  const prem = premissasPadrao()
  const taxaDe = (r: string) => taxaHora(prem, r)
  const cadastrada = (r: string) => prem.taxas.some((t) => t.funcao === r)

  it('CR-1 com as taxas padrão: R$ 45.015,68 (ilustrativo)', () => {
    const r = custoMaoDeObraPorFuncao(640, MO.c103332, taxaDe, cadastrada)
    // 640 × 0,8112688 × 23,90 + 640 × 1,6225376 × 31,40 = 12.409,17 + 32.606,52
    expect(r.funcoes.map((x) => x.rotulo)).toEqual(['Servente', 'Pedreiro'])
    expect(r.funcoes[0].custo).toBeCloseTo(12409.17, 2)
    expect(r.funcoes[1].custo).toBeCloseTo(32606.52, 2)
    expect(r.total).toBeCloseTo(45015.68, 2)
    // Pelo método de horas alocadas (com o ceil) daria R$ 45.225,72: o custo por função não infla com o ajudante extra
    expect(1038.424064 * 31.4 + 33 * 8 * 2 * 23.9).toBeCloseTo(45225.72, 2)
  })

  it('função fora das taxas usa a taxa não cadastrada e é listada; supervisão entra como custo', () => {
    const r = custoMaoDeObraPorFuncao(100, MO.c107113, taxaDe, cadastrada)
    expect(r.funcoes.map((x) => [x.rotulo, x.foraDasTaxas])).toEqual([
      ['Servente', false],
      ['Engenheiro civil de obra pleno', true],
    ])
    expect(r.funcoes[1].custo).toBeCloseTo(100 * 0.0041 * 30, 9) // taxaFuncaoNaoCadastrada = R$ 30/h (ilustrativa)
  })

  it('quantidade negativa não gera custo negativo', () => {
    expect(custoMaoDeObraPorFuncao(-5, MO.c93358, taxaDe, cadastrada).total).toBe(0)
  })
})

describe('notas da tarefa (D-23)', () => {
  it('com recorte: fonte, principal e coeficiente, equipe, supervisão não alocada e aviso das subcomposições', () => {
    const recursos = recursosDaEquipe('Servente', 2, [])
    expect(notasDaTarefaSinapi({ codigo: '107113', quantidade: 100, unidade: 'M', fonte: 'SP 09/2026 não desonerado', maoDeObra: MO.c107113, recursos })).toBe(
      'Gerado pelo CronoAI a partir do SINAPI 107113 (SP 09/2026 não desonerado): 100 M. Função principal SERVENTE, RUP 1,5816 h/M. Equipe: Servente 2. ' +
        'Supervisão (administração local): Engenheiro civil de obra pleno: 0,41 h, não alocado. HH de subcomposições (ex.: preparo de argamassa) não incluída.',
    )
  })

  it('sem fonte (catálogo ilustrativo): a nota de hoje', () => {
    expect(notasDaTarefaSinapi({ codigo: '103332', quantidade: 640, unidade: 'm²', recursos: [] })).toBe('Gerado pelo CronoAI a partir do SINAPI 103332: 640 m².')
    expect(notasDaTarefaSinapi({ codigo: '1', quantidade: 2, unidade: 'UN', fonte: 'SP 09/2026 não desonerado', recursos: [] })).toBe(
      'Gerado pelo CronoAI a partir do SINAPI 1 (SP 09/2026 não desonerado): 2 UN.',
    )
  })
})
