/// <reference types="node" />
// Planilha SINAPI sintética no layout 2025 (abas CSD, CCD e Analítico) com poucas composições, para os testes do leitor,
// do gerador e do CLI. Coeficientes e custos de SP e SC vêm da tabela 4.2 do plano (SINAPI 09/2026, Caixa, dado público);
// os valores marcados "fictício" não vêm da planilha. Só para teste.
import { criarXlsxSintetico, type AbaSintetica, type CelulaSintetica, type OpcoesXlsxSintetico } from './xlsxSintetico.ts'

export interface ItemSintetico {
  tipo: 'COMPOSICAO' | 'INSUMO'
  codigo: string
  descricao: string
  unidade: string
  coeficiente: number
}

export interface CompSintetica {
  codigo: string
  grupo: string
  descricao: string
  unidade: string
  situacao: 'COM CUSTO' | 'SEM CUSTO'
  /** Custo nas UFs `SP` e `SC`, no CSD e no CCD. */
  csd: { SP: number; SC: number }
  ccd: { SP: number; SC: number }
  itens: ItemSintetico[]
}

const mo = (codigo: string, funcao: string, coeficiente: number): ItemSintetico => ({ tipo: 'COMPOSICAO', codigo, descricao: `${funcao} COM ENCARGOS COMPLEMENTARES`, unidade: 'H', coeficiente })
const insumo = (codigo: string, descricao: string, unidade: string, coeficiente: number): ItemSintetico => ({ tipo: 'INSUMO', codigo, descricao, unidade, coeficiente })

export const COMPOSICOES_SINTETICAS: CompSintetica[] = [
  {
    codigo: '103332',
    grupo: 'Alvenaria de Vedação',
    descricao: 'ALVENARIA DE VEDAÇÃO DE BLOCOS CERÂMICOS FURADOS NA HORIZONTAL DE 9X14X19 CM (resumida)',
    unidade: 'M2',
    situacao: 'COM CUSTO',
    csd: { SP: 123.96, SC: 130.5 }, // SC fictício
    ccd: { SP: 119.05, SC: 125.1 }, // SC fictício
    itens: [mo('88316', 'SERVENTE', 0.8112688), mo('88309', 'PEDREIRO', 1.6225376), insumo('7258', 'BLOCO CERAMICO', 'UN', 38.5), insumo('43459', 'SEGURO - HORISTA', 'H', 1.2)],
  },
  {
    codigo: '104658',
    grupo: 'Acessibilidade',
    descricao: 'PISO PODOTÁTIL DE ALERTA OU DIRECIONAL, DE CONCRETO (resumida)',
    unidade: 'M2',
    situacao: 'COM CUSTO',
    csd: { SP: 208.85, SC: 0 }, // SC com custo 0: fictício, para o teste de exclusão
    ccd: { SP: 205.36, SC: 0 },
    itens: [mo('88316', 'SERVENTE', 1.279), mo('88309', 'PEDREIRO', 0.639), insumo('36178', 'PISO TATIL', 'UN', 6.4375)],
  },
  {
    codigo: '103681',
    grupo: 'Estrutura',
    descricao: 'CONCRETAGEM DE VIGAS E LAJES, FCK 25 MPA, COM GRUA (resumida)',
    unidade: 'M3',
    situacao: 'COM CUSTO',
    csd: { SP: 900, SC: 904.47 }, // SP fictício; SC da tabela 4.2
    ccd: { SP: 890, SC: 897.96 },
    itens: [mo('88316', 'SERVENTE', 1.145), mo('88309', 'PEDREIRO', 1.428), mo('88262', 'CARPINTEIRO DE FORMAS', 0.357)],
  },
  {
    codigo: '107113',
    grupo: 'Fundações',
    descricao: 'ESTACA ESCAVADA, DIÂMETRO 25 CM (resumida)',
    unidade: 'M',
    situacao: 'COM CUSTO',
    csd: { SP: 150, SC: 151 }, // fictícios
    ccd: { SP: 148, SC: 149 },
    itens: [mo('88316', 'SERVENTE', 1.5816), mo('90001', 'ENGENHEIRO CIVIL DE OBRA PLENO', 0.0041)],
  },
  {
    codigo: '999001',
    grupo: 'Diversos',
    descricao: 'SERVIÇO FICTÍCIO SÓ COM INSUMOS',
    unidade: 'UN',
    situacao: 'COM CUSTO',
    csd: { SP: 10, SC: 11 },
    ccd: { SP: 9, SC: 10 },
    itens: [insumo('1', 'INSUMO QUALQUER', 'UN', 1)],
  },
  {
    codigo: '105006',
    grupo: 'Acessibilidade',
    descricao: 'RAMPA PRÉ-MOLDADA (resumida)',
    unidade: 'UN',
    situacao: 'SEM CUSTO',
    csd: { SP: 0, SC: 0 },
    ccd: { SP: 0, SC: 0 },
    itens: [mo('88309', 'PEDREIRO', 2)],
  },
]

export interface OpcoesPlanilhaSinapi {
  mes?: string // '09/2026'
  emissao?: string // '09/10/2026'
  composicoes?: CompSintetica[]
  /** Insere uma coluna extra depois de "Grupo" nas abas de custo (o layout muda; o leitor acha as colunas pelo texto). */
  colunaExtra?: boolean
  /** Remove a coluna "Unidade" do cabeçalho de custos. */
  semColunaUnidade?: boolean
  /** Troca o título da aba CCD para "SEM DESONERAÇÃO". */
  ccdComTituloErrado?: boolean
  /** Mês de referência do Analítico (para testar divergência). */
  mesDoAnalitico?: string
  /** Muda a descrição das composições no Analítico (divergência com a aba de custos). */
  analiticoComDescricaoDiferente?: boolean
  /** Fórmula do código sem o HYPERLINK (o código fica ilegível). */
  semFormula?: boolean
  /** Código da fórmula diferente do que existe no Analítico. */
  codigoDaFormulaInexistente?: boolean
  /** Insere linha em branco na ordem do Analítico antes da composição (item antes da composição). */
  analiticoItemAntesDaComposicao?: boolean
  /** Remove a linha dos encargos. */
  semEncargos?: boolean
  /** Renomeia o nome da aba Analítico (sem acento). */
  nomeAnalitico?: string
}

const UFS_SINTETICAS = ['SP', 'SC'] as const

function abaCustos(nome: 'CSD' | 'CCD', o: OpcoesPlanilhaSinapi): AbaSintetica {
  const comps = o.composicoes ?? COMPOSICOES_SINTETICAS
  const desonerado = nome === 'CCD'
  const tituloDesonerado = desonerado && !o.ccdComTituloErrado
  const ins = (linha: CelulaSintetica[]): CelulaSintetica[] => (o.colunaExtra ? [linha[0] ?? null, null, ...linha.slice(1)] : linha)
  const enc = desonerado ? { SP: [0.9909, 0.5851], SC: [0.9, 0.55] } : { SP: [1.1501, 0.7118], SC: [1.12, 0.69] } // SC fictício
  const linhas: CelulaSintetica[][] = [
    ['SINAPI - Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil'],
    [`RELATÓRIO DE CUSTOS DE COMPOSIÇÕES - ENCARGOS SOCIAIS ${tituloDesonerado ? 'COM' : 'SEM'} DESONERAÇÃO`],
    ['Mês de Referência:', o.mes ?? '09/2026', null, 'Encargos sociais sobre a mão de obra:'],
    ['Data de emissão:', o.emissao ?? '09/10/2026', null, tituloDesonerado ? '(COM DESONERAÇÃO)' : '(SEM DESONERAÇÃO)', 'SP', null, 'SC'],
    [null, null, null, 'Localidade', 'SAO PAULO', null, 'FLORIANOPOLIS'],
    ['Observação:', '%AS (porcentagem Atribuído São Paulo) ...', null, o.semEncargos ? null : 'Horista', o.semEncargos ? null : enc.SP[0]!, null, o.semEncargos ? null : enc.SC[0]!],
    [null, 'composição que foi obtida utilizando preços de insumos de São Paulo ...', null, o.semEncargos ? null : 'Mensalista', o.semEncargos ? null : enc.SP[1]!, null, o.semEncargos ? null : enc.SC[1]!],
    [null, 'dos preços de insumos necessários ...'],
    [null, 'indica que pelo menos um dos itens da composição não tem custo/preço.', null, null, 'SP', null, 'SC'],
    ['Grupo', 'Código da\nComposição', 'Descrição', ...(o.semColunaUnidade ? [] : ['Unidade']), 'Custo (R$)', '%AS', 'Custo (R$)', '%AS'],
  ]
  const cab = linhas.map(ins)
  const dados = comps.map((c, i): CelulaSintetica[] => {
    const codigoFormula = o.codigoDaFormulaInexistente && i === 0 ? '999999' : c.codigo
    const f: CelulaSintetica = o.semFormula
      ? 'sem fórmula'
      : { formula: `HYPERLINK("#"&CELL("address",OFFSET(Analítico!$B$1,MATCH(${codigoFormula},Analítico!$B:$B,0)-1,3)),${codigoFormula})`, valor: 0 }
    const custos = desonerado ? c.ccd : c.csd
    return ins([c.grupo, f, c.descricao, ...(o.semColunaUnidade ? [] : [c.unidade]), custos.SP, 0, custos.SC, 0.0388])
  })
  // Linha em branco ao final (as planilhas reais costumam ter)
  return { nome, linhas: [...cab, ...dados, []] }
}

function abaAnalitica(o: OpcoesPlanilhaSinapi): AbaSintetica {
  const comps = o.composicoes ?? COMPOSICOES_SINTETICAS
  const linhas: CelulaSintetica[][] = [
    ['SINAPI - Sistema Nacional de Pesquisa de Custos e Índices da Construção Civil'],
    ['RELATÓRIO ANALÍTICO DE COMPOSIÇÕES'],
    ['Mês de Referência:', o.mesDoAnalitico ?? o.mes ?? '09/2026', null, 'Situações'],
    ['Data de emissão:', o.emissao ?? '09/10/2026', null, 'COM PREÇO'],
    [null, null, null, 'SEM PREÇO'],
    [null, null, null, 'COM CUSTO'],
    [null, null, null, 'SEM CUSTO'],
    [null, null, null, 'EM ESTUDO'],
    [],
    ['Grupo', 'Código da\nComposição', 'Tipo Item', 'Código do\nItem', 'Descrição', 'Unidade', 'Coeficiente', 'Situação'],
  ]
  for (const c of comps) {
    const desc = o.analiticoComDescricaoDiferente ? `${c.descricao} DIFERENTE` : c.descricao
    const itens = c.itens.map((i): CelulaSintetica[] => [c.grupo, c.codigo, i.tipo, i.codigo, i.descricao, i.unidade, i.coeficiente, c.situacao])
    const linhaComposicao: CelulaSintetica[] = [c.grupo, c.codigo, null, null, desc, c.unidade, null, c.situacao]
    if (o.analiticoItemAntesDaComposicao && itens.length) linhas.push(itens[0]!, linhaComposicao, ...itens.slice(1))
    else linhas.push(linhaComposicao, ...itens)
  }
  return { nome: o.nomeAnalitico ?? 'Analítico', linhas }
}

/** Abas na mesma ordem da planilha real: Menu, CSD, CCD, Analítico. */
export function abasSinapiSinteticas(o: OpcoesPlanilhaSinapi = {}): AbaSintetica[] {
  return [{ nome: 'Menu', linhas: [['SINAPI']] }, abaCustos('CSD', o), abaCustos('CCD', o), abaAnalitica(o)]
}

export function criarPlanilhaSinapiSintetica(o: OpcoesPlanilhaSinapi = {}, xlsx?: OpcoesXlsxSintetico): Buffer {
  return criarXlsxSintetico(abasSinapiSinteticas(o), xlsx)
}

export const UFS_DA_PLANILHA_SINTETICA = UFS_SINTETICAS
