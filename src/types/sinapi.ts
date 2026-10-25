// Tipos do recorte SINAPI (ciclo 00006): a fatia de UM mês, UMA UF e UM regime da tabela nacional da Caixa,
// gerada offline por `scripts/sinapi` e importada na obra. Só tipos: a validação mora em `src/lib/recorteSinapi.ts`.
import type { RegimeSinapi, UF } from '@/data/ufs'

export const FORMATO_RECORTE = 'cronoai-recorte-sinapi'
export const VERSAO_RECORTE = 1

/** Uma função de mão de obra do Analítico (item `COMPOSICAO`, unidade H, "… COM ENCARGOS COMPLEMENTARES"). */
export interface FuncaoMaoDeObra {
  /** Código do item no Analítico. */
  codigo: string
  /** Descrição sem o sufixo "COM ENCARGOS COMPLEMENTARES" (ex.: "PEDREIRO"). */
  funcao: string
  /** Coeficiente publicado, em H por unidade da composição (a RUP da função), sem arredondar. */
  coeficiente: number
}

export interface ComposicaoRecorte {
  codigo: string
  descricao: string
  unidade: string
  grupo: string
  /** Custo unitário publicado (R$) na UF e no regime do recorte. */
  custoUnitario: number
  /** Mão de obra direta, na ordem do Analítico. Vazio = composição sem mão de obra (pede a RUP à mão). */
  maoDeObra: FuncaoMaoDeObra[]
  /** `%AS` da publicação (0 a 100), só exibido; o significado fica com Orçamento/Custos. */
  percentualAS?: number
}

export type AbaCustos = 'CSD' | 'CCD'

export interface FonteRecorte {
  publicacao: string
  arquivo: string
  sha256: string
  bytes: number
  dataEmissao: string
  abaCustos: AbaCustos
  layout: string
}

export interface EncargosRecorte {
  /** Fração (1,1501 = 115,01%). */
  horista: number
  mensalista: number
}

export interface TotaisRecorte {
  composicoes: number
  excluidasSemCusto: number
  excluidasCustoZeroNaUf: number
}

export interface RecorteSinapi {
  formato: typeof FORMATO_RECORTE
  versao: number
  uf: UF
  regime: RegimeSinapi
  /** AAAA-MM. */
  dataBase: string
  fonte: FonteRecorte
  encargos: EncargosRecorte
  filtro: { codigos: string[]; grupos: string[] }
  totais: TotaisRecorte
  geradoEm: string
  composicoes: ComposicaoRecorte[]
}

/** Referência que a obra guarda do recorte (o recorte em si fica numa store própria do IndexedDB). */
export interface RefRecorteObra {
  /** `UF|regime|AAAA-MM`. */
  chave: string
  sha256Origem: string
  importadoEm: string
}

/** Proporção de uma função na equipe, em relação à função principal (função ÷ principal). */
export interface EquipeProporcional {
  recurso: string
  proporcao: number
}

/** Item que alimenta a calculadora e a planilha: o do catálogo ilustrativo ou o de uma composição do recorte. */
export interface ItemCatalogoSinapi {
  code: string
  description: string
  unit: string
  /** RUP da função principal (HH/unidade). */
  rup: number
  professional: string
  /** Serventes por oficial (catálogo ilustrativo; no recorte, a equipe por função vale no lugar). */
  helperRatio: number
  unitCost: number
  group: string
  sampleQuantity?: number
  /** Presente só em item do recorte: demais funções, em proporção da principal. */
  equipe?: EquipeProporcional[]
  fonte?: string
}
