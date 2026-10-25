// Catálogo de composições para o gerador de cronograma.
// ATENÇÃO: códigos, coeficientes (RUP) e custos são ILUSTRATIVOS. Valide na tabela SINAPI vigente
// (Caixa/IBGE) para a UF e a data-base do orçamento antes de usar em proposta ou medição.
import type { ResourceKind } from '@/types/domain'

export interface SinapiItem {
  code: string
  description: string
  unit: 'm²' | 'm³' | 'kg' | 'm' | 'un'
  /** Razão Unitária de Produção do oficial (HH / unidade). */
  rup: number
  professional: ResourceKind
  /** Serventes por oficial na equipe típica. */
  helperRatio: number
  unitCost: number
  /** Grupo da EAP sugerido para inserção. */
  group: string
  /** Quantidade de exemplo para o Edifício Aurora. */
  sampleQuantity: number
}

export const SINAPI_CATALOG: SinapiItem[] = [
  { code: '103332', description: 'Alvenaria de vedação bloco cerâmico 14x19x29 cm, argamassa de assentamento', unit: 'm²', rup: 0.82, professional: 'Pedreiro', helperRatio: 0.5, unitCost: 98.5, group: '03', sampleQuantity: 1850 },
  { code: '87879', description: 'Chapisco aplicado em alvenaria e estrutura (interno), traço 1:3', unit: 'm²', rup: 0.08, professional: 'Pedreiro', helperRatio: 0.5, unitCost: 6.2, group: '05', sampleQuantity: 9600 },
  { code: '87529', description: 'Massa única para recebimento de pintura, e=2 cm, interna', unit: 'm²', rup: 0.62, professional: 'Pedreiro', helperRatio: 0.5, unitCost: 38.9, group: '05', sampleQuantity: 4800 },
  { code: '87414', description: 'Aplicação manual de gesso liso em paredes e tetos, e=0,5 cm', unit: 'm²', rup: 0.32, professional: 'Gesseiro', helperRatio: 0.35, unitCost: 24.8, group: '05', sampleQuantity: 6200 },
  { code: '87630', description: 'Contrapiso em argamassa traço 1:4, e=5 cm, preparo mecânico', unit: 'm²', rup: 0.3, professional: 'Pedreiro', helperRatio: 1, unitCost: 45.7, group: '06', sampleQuantity: 2400 },
  { code: '87263', description: 'Revestimento cerâmico porcelanato 80x80 cm, argamassa AC-III', unit: 'm²', rup: 0.7, professional: 'Azulejista', helperRatio: 0.5, unitCost: 189, group: '06', sampleQuantity: 1200 },
  { code: '88489', description: 'Pintura látex acrílica premium, 2 demãos, paredes internas', unit: 'm²', rup: 0.18, professional: 'Pintor', helperRatio: 0.25, unitCost: 18.4, group: '07', sampleQuantity: 8400 },
  { code: '92873', description: 'Lançamento e adensamento de concreto em estrutura (bombeado)', unit: 'm³', rup: 1.1, professional: 'Pedreiro', helperRatio: 1.5, unitCost: 168, group: '02', sampleQuantity: 320 },
  { code: '92778', description: 'Armação de estrutura com aço CA-50 Ø 10 mm, corte e dobra', unit: 'kg', rup: 0.075, professional: 'Armador', helperRatio: 0.5, unitCost: 13.9, group: '02', sampleQuantity: 18000 },
  { code: '92413', description: 'Forma de madeira para laje e vigas, chapa compensada plastificada', unit: 'm²', rup: 1.05, professional: 'Carpinteiro', helperRatio: 0.5, unitCost: 92, group: '02', sampleQuantity: 1500 },
  { code: '98557', description: 'Impermeabilização com manta asfáltica 4 mm, áreas molhadas e cobertura', unit: 'm²', rup: 0.4, professional: 'Pedreiro', helperRatio: 0.5, unitCost: 112, group: '07', sampleQuantity: 980 },
  { code: '89357', description: 'Tubo PVC soldável água fria DN 25 mm, instalado em ramal', unit: 'm', rup: 0.25, professional: 'Encanador', helperRatio: 0.5, unitCost: 21.5, group: '04', sampleQuantity: 3600 },
]

export const SINAPI_REFERENCE_URL = 'https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx'
