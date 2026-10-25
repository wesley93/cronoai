// Acesso ao armazenamento local das obras (ADR 00002): IndexedDB no navegador e memória nos testes ou quando o IndexedDB falta.
// Fica em src/stores (e não em src/lib) porque toca armazenamento do navegador. Nenhuma regra de negócio mora aqui.
import type { IndiceObras, RegistroObra } from '@/types/obra'

export const NOME_BANCO = 'cronoai'
/** Versão de ESTRUTURA do banco (stores). A versão do esquema de cada obra é outra coisa (src/lib/migracaoEstado.ts). */
export const VERSAO_ESTRUTURA = 1
export const CHAVE_V1 = 'cronoai-state-v1'
const STORE_OBRAS = 'obras'
const STORE_META = 'meta'
const CHAVE_INDICE = 'indice'

export interface EstimativaArmazenamento {
  uso?: number
  cota?: number
}

export interface ArmazenamentoObras {
  lerIndice(): Promise<IndiceObras | undefined>
  lerObra(id: string): Promise<RegistroObra | undefined>
  /** Ids com registro gravado (para achar obra ausente sem ler o conteúdo). */
  listarIdsObras(): Promise<string[]>
  /** Grava a obra e o índice na mesma transação: ou os dois, ou nenhum. */
  gravarObra(registro: RegistroObra, indice: IndiceObras): Promise<void>
  /** Remove a obra e grava o índice na mesma transação. */
  excluirObra(id: string, indice: IndiceObras): Promise<void>
  gravarIndice(indice: IndiceObras): Promise<void>
  estimar(): Promise<EstimativaArmazenamento>
  /** Texto bruto de `cronoai-state-v1`: só leitura, essa chave nunca é gravada nem apagada. */
  lerV1(): string | null
}

// ------------------------------------------------------------------ memória

export interface ArmazenamentoMemoria extends ArmazenamentoObras {
  /** Texto de `cronoai-state-v1` simulado (testes). */
  v1: string | null
  /** Liga para simular falha (cota cheia etc.) nas gravações ou nas leituras. */
  falhar: { gravar: boolean; ler: boolean }
  obras: Map<string, RegistroObra>
  indice: IndiceObras | undefined
  estimativa: EstimativaArmazenamento
}

// Clone estruturado, como o do IndexedDB real: um proxy reativo do Vue falha aqui (DataCloneError), e o teste pega o erro
const copia = <T>(v: T): T => structuredClone(v)

export function criarArmazenamentoMemoria(v1: string | null = null): ArmazenamentoMemoria {
  const falhaGravacao = () => new DOMException('Cota simulada excedida', 'QuotaExceededError')
  const falhaLeitura = () => new Error('Leitura simulada falhou')
  const m: ArmazenamentoMemoria = {
    v1,
    falhar: { gravar: false, ler: false },
    obras: new Map(),
    indice: undefined,
    estimativa: {},
    async lerIndice() {
      if (m.falhar.ler) throw falhaLeitura()
      return m.indice ? copia(m.indice) : undefined
    },
    async lerObra(id) {
      if (m.falhar.ler) throw falhaLeitura()
      const r = m.obras.get(id)
      return r ? copia(r) : undefined
    },
    async listarIdsObras() {
      if (m.falhar.ler) throw falhaLeitura()
      return [...m.obras.keys()]
    },
    async gravarObra(registro, indice) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.obras.set(registro.id, copia(registro))
      m.indice = copia(indice)
    },
    async excluirObra(id, indice) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.obras.delete(id)
      m.indice = copia(indice)
    },
    async gravarIndice(indice) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.indice = copia(indice)
    },
    async estimar() {
      return { ...m.estimativa }
    },
    lerV1: () => m.v1,
  }
  return m
}

// ------------------------------------------------------------------ IndexedDB

function lerV1DoLocalStorage(): string | null {
  try {
    return localStorage.getItem(CHAVE_V1)
  } catch {
    return null // localStorage bloqueado ou indefinido: sem estado antigo para migrar
  }
}

async function estimarDoNavegador(): Promise<EstimativaArmazenamento> {
  try {
    const e = await navigator.storage?.estimate?.()
    return { uso: e?.usage, cota: e?.quota }
  } catch {
    return {}
  }
}

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'))
      return
    }
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(NOME_BANCO, VERSAO_ESTRUTURA)
    } catch (e) {
      reject(e)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_OBRAS)) db.createObjectStore(STORE_OBRAS, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB'))
  })
}

/** Executa `fn` numa transação e resolve só quando ela conclui (commit); qualquer erro ou aborto rejeita. */
function transacao<T>(db: IDBDatabase, modo: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_OBRAS, STORE_META], modo)
      const req = fn(tx)
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      tx.onerror = () => reject(tx.error ?? new Error('Falha na transação do IndexedDB'))
      tx.onabort = () => reject(tx.error ?? new Error('Transação do IndexedDB abortada'))
    } catch (e) {
      reject(e)
    }
  })
}

/** Abre o banco real. Rejeita se o navegador não oferece IndexedDB (o chamador cai para a memória). */
export async function criarArmazenamentoIndexedDB(): Promise<ArmazenamentoObras> {
  const db = await abrirBanco()
  return {
    async lerIndice() {
      return (await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_META).get(CHAVE_INDICE))) as IndiceObras | undefined
    },
    async lerObra(id) {
      return (await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_OBRAS).get(id))) as RegistroObra | undefined
    },
    async listarIdsObras() {
      const chaves = await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_OBRAS).getAllKeys())
      return (chaves ?? []).map(String)
    },
    async gravarObra(registro, indice) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).put(registro)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
      })
    },
    async excluirObra(id, indice) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).delete(id)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
      })
    },
    async gravarIndice(indice) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
      })
    },
    estimar: estimarDoNavegador,
    lerV1: lerV1DoLocalStorage,
  }
}

// ------------------------------------------------------------------ seleção do adaptador

let atual: ArmazenamentoObras | undefined
let indisponivel = false

/** Define o adaptador (testes) ou volta ao padrão com `undefined`. */
export function usarArmazenamento(adaptador: ArmazenamentoObras | undefined): void {
  atual = adaptador
  indisponivel = false
}

/** Adaptador em uso: IndexedDB; se falhar ao abrir, memória com `indisponivel = true` (M-7). */
export async function obterArmazenamento(): Promise<{ armazenamento: ArmazenamentoObras; indisponivel: boolean }> {
  if (!atual) {
    try {
      atual = await criarArmazenamentoIndexedDB()
    } catch {
      atual = criarArmazenamentoMemoria(lerV1DoLocalStorage())
      indisponivel = true
    }
  }
  return { armazenamento: atual, indisponivel }
}
