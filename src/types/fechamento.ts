// Fechamento da data de status (ciclo 00007, SPEC-04): registro imutável da obra numa data, e a retificação com motivo.
// Cabeçalho e detalhe moram em stores próprias do IndexedDB (estrutura 3), fora do estado reativo da obra (ADR 00002, emenda do ciclo 00007).

/** Versão do formato do cabeçalho e do detalhe. Registro de formato mais novo é ilegível e nunca é sobrescrito. */
export const VERSAO_FORMATO_FECHAMENTO = 1

export const TIPOS_FECHAMENTO = ['fechamento', 'retificacao'] as const
export type TipoFechamento = (typeof TIPOS_FECHAMENTO)[number]

/**
 * Totais da obra no fechamento. SPI, CPI e EAC ficam `null` sem divisor (D-11): o `safeDiv` do `computeEvm` devolveria um "1,00" falso que um
 * registro imutável congelaria.
 */
export interface TotaisFechamento {
  bac: number
  pv: number
  ev: number
  ac: number
  spi: number | null
  cpi: number | null
  eac: number | null
  /** Término previsto da obra (`yyyy-mm-dd`). */
  entregaPrevista: string
  /** Atraso em dias úteis contra a LB0 (o mesmo do Caminho Crítico). */
  atrasoDiasUteis: number
}

/** Totais de um pacote de 1º nível da EAP (a curva por pacote e a retificação recalculam EV e AC a partir daqui). */
export interface PacoteFechamento {
  wbs: string
  nome: string
  bac: number
  pv: number
  ev: number
  ac: number
}

export interface CabecalhoFechamento {
  versaoFormato: typeof VERSAO_FORMATO_FECHAMENTO
  id: string
  obraId: string
  /** 1, 2, 3… por obra, independente do relógio. */
  sequencia: number
  tipo: TipoFechamento
  /** Na retificação, o id do fechamento original (a raiz). */
  retificaId?: string
  dataStatus: string
  /** Data e hora ISO do navegador. */
  fechadoEm: string
  autor?: string
  observacao?: string
  /** Obrigatório na retificação. */
  motivo?: string
  /** Linha de base do valor agregado usada nos totais (0 a 10) e a data em que ela foi salva (a LB pode ser sobrescrita depois). */
  linhaBase: number
  linhaBaseSalvaEm?: string
  versaoPremissas: number
  esquemaObra: number
  totais: TotaisFechamento
  porPacote: PacoteFechamento[]
  /** Quantidade de folhas do detalhe. */
  quantidadeTarefas: number
}

/**
 * Detalhe por folha, em tupla para caber no volume do ADR (~95 caracteres por tarefa):
 * [uid, wbs, % físico, custo real, BAC, PV, início real | null, término real | null, início previsto, término previsto, folga total em minutos, crítica 0 | 1].
 * Ordem fixada por `versaoFormato` 1.
 */
export type TarefaFechamento = readonly [number, string, number, number, number, number, string | null, string | null, string, string, number, 0 | 1]

export interface DetalheFechamento {
  versaoFormato: typeof VERSAO_FORMATO_FECHAMENTO
  id: string
  tarefas: TarefaFechamento[]
}

/** Posições da tupla (nomes no lugar de números mágicos). */
export const POS = { uid: 0, wbs: 1, pct: 2, custoReal: 3, bac: 4, pv: 5, inicioReal: 6, terminoReal: 7, inicioPrevisto: 8, terminoPrevisto: 9, folgaMin: 10, critica: 11 } as const

/** Entrada da store `fechamentoTarefas` do IndexedDB: o detalhe como texto JSON (o tamanho é conferido antes do `JSON.parse`). */
export interface RegistroDetalheFechamento {
  id: string
  json: string
}
