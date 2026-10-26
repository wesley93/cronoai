// Tipos da persistência multiobra (ciclo 00002). Ficam aqui, e não na store, para a migração em src/lib não importar a store.
import type { ProjectState, ScenarioKind, Task } from './domain'
import type { BudgetLine } from '@/lib/sinapiBudget'
import type { ScenarioResult } from '@/lib/scenarios'
import type { UF } from '@/data/ufs'
import type { CabecalhoFechamento, RegistroDetalheFechamento } from './fechamento'

export interface ScenarioUndo {
  kind: ScenarioKind
  taskUid?: number
  before?: Partial<Task>
  addedDays?: string[]
  /** Hora extra por frente: calendários derivados criados pelo cenário (UIDs) e o calendário que cada tarefa tinha antes. */
  calendariosCriados?: number[]
  calendariosAntes?: { uid: number; calendarioUid?: number }[]
  costId: string
  result: ScenarioResult
}

/** Estado completo de uma obra, como é gravado (string JSON de `JSON.stringify(state)`). */
export type PersistedState = ProjectState & { undo: ScenarioUndo[]; budget: BudgetLine[] }

/** Linha da lista de obras (guardada no índice, para não ler cada obra só para listar). */
export interface ResumoObra {
  id: string
  nome: string
  uf?: UF
  municipio?: string
  responsavel?: string
  /** Data e hora ISO da última gravação. */
  atualizadoEm: string
  /** Marcada quando o registro não pôde ser lido (ausente, JSON inválido ou esquema mais novo). */
  ilegivel?: boolean
  /** Chave `UF|regime|AAAA-MM` do recorte SINAPI da obra (ciclo 00006): permite apagar o recorte órfão sem ler todas as obras. */
  recorteSinapi?: string
}

export interface MigracaoV1 {
  /** Data e hora ISO da migração. */
  em: string
  resultado: 'migrado' | 'ilegivel'
  /** Obra que nasceu da migração (quando `resultado` é 'migrado'). */
  obraId?: string
}

export interface IndiceObras {
  versaoIndice: 1
  obraAtivaId: string
  obras: ResumoObra[]
  migracaoV1?: MigracaoV1
}

/** Entrada da store `obras` do IndexedDB. */
export interface RegistroObra {
  id: string
  /** Versão do esquema do estado (cadeia em src/lib/migracaoEstado.ts); não confundir com a versão de estrutura do banco. */
  versaoEsquema: number
  json: string
  atualizadoEm: string
}

/**
 * Entrada da store `recortesSinapi` do IndexedDB (estrutura 2), uma por UF/regime/data-base, compartilhada entre as obras
 * (ADR 00002). Dado externo na leitura: quem lê valida de novo (`validarRecorteSinapi`).
 */
export interface RegistroRecorte {
  /** `UF|regime|AAAA-MM`. */
  chave: string
  /** Versão do formato do recorte (`versao` do JSON). */
  versaoFormato: number
  /** JSON compacto do recorte validado. */
  json: string
  /** SHA-256 da planilha de origem, para saber se o recorte foi substituído. */
  sha256Origem: string
  /** Data e hora ISO da importação. */
  importadoEm: string
  /** Número de composições (conferência barata sem ler o JSON). */
  composicoes: number
}

/** Mudanças que acompanham a gravação de uma obra, na MESMA transação (ou tudo, ou nada). */
export interface ExtrasDeGravacao {
  /** Recorte a gravar (importação). */
  gravarRecorte?: RegistroRecorte
  /** Chaves de recortes que ficaram órfãos (nenhuma obra do índice os usa mais). */
  excluirRecortes?: string[]
  /** Fechamento ou retificação a gravar (ciclo 00007): cabeçalho e detalhe por `add` (nunca `put`), na mesma transação da obra e do índice. */
  gravarFechamento?: { cabecalho: CabecalhoFechamento; detalhe: RegistroDetalheFechamento }
}

/** Resultado do pedido de armazenamento persistente ao navegador (`navigator.storage.persist()`). */
export type ResultadoPersistencia = 'concedido' | 'negado' | 'indisponivel'
