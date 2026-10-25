// Acesso ao armazenamento local das obras (ADR 00002): IndexedDB no navegador e memória nos testes ou quando o IndexedDB falta.
// Fica em src/stores (e não em src/lib) porque toca armazenamento do navegador. Nenhuma regra de negócio mora aqui.
import type { ExtrasDeGravacao, IndiceObras, RegistroObra, RegistroRecorte } from '@/types/obra'

export const NOME_BANCO = 'cronoai'
/**
 * Versão de ESTRUTURA do banco (stores). A versão do esquema de cada obra é outra coisa (src/lib/migracaoEstado.ts).
 * 1 = obras e meta; 2 = + `recortesSinapi` (ciclo 00006, ADR 00002). Um app que só conhece a 1 recebe `VersionError` ao abrir a 2 e cai na memória sem gravar.
 */
export const VERSAO_ESTRUTURA = 2
export const CHAVE_V1 = 'cronoai-state-v1'
const STORE_OBRAS = 'obras'
const STORE_META = 'meta'
const STORE_RECORTES = 'recortesSinapi'
const CHAVE_INDICE = 'indice'

export interface EstimativaArmazenamento {
  uso?: number
  cota?: number
}

export interface ArmazenamentoObras {
  /** Índice como está gravado: dado externo, validado por quem chama (`validarIndice`). */
  lerIndice(): Promise<unknown>
  lerObra(id: string): Promise<RegistroObra | undefined>
  /** Ids com registro gravado (para achar obra ausente sem ler o conteúdo). */
  listarIdsObras(): Promise<string[]>
  /** Registro do recorte SINAPI (dado externo: quem lê valida de novo). */
  lerRecorte(chave: string): Promise<RegistroRecorte | undefined>
  existeRecorte(chave: string): Promise<boolean>
  /** Grava a obra e o índice na mesma transação (e, com `extras`, o recorte importado e a exclusão dos órfãos): ou tudo, ou nada. */
  gravarObra(registro: RegistroObra, indice: IndiceObras, extras?: ExtrasDeGravacao): Promise<void>
  /** Remove a obra, grava o índice e apaga os recortes órfãos na mesma transação. */
  excluirObra(id: string, indice: IndiceObras, excluirRecortes?: string[]): Promise<void>
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
  recortes: Map<string, RegistroRecorte>
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
    recortes: new Map(),
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
    async lerRecorte(chave) {
      if (m.falhar.ler) throw falhaLeitura()
      const r = m.recortes.get(chave)
      return r ? copia(r) : undefined
    },
    async existeRecorte(chave) {
      if (m.falhar.ler) throw falhaLeitura()
      return m.recortes.has(chave)
    },
    // A falha é simulada ANTES de qualquer escrita: nada fica pela metade, como na transação do IndexedDB
    async gravarObra(registro, indice, extras) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.obras.set(registro.id, copia(registro))
      m.indice = copia(indice)
      if (extras?.gravarRecorte) m.recortes.set(extras.gravarRecorte.chave, copia(extras.gravarRecorte))
      for (const chave of extras?.excluirRecortes ?? []) m.recortes.delete(chave)
    },
    async excluirObra(id, indice, excluirRecortes) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.obras.delete(id)
      m.indice = copia(indice)
      for (const chave of excluirRecortes ?? []) m.recortes.delete(chave)
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
      // Estrutura 2: só cria a store nova; as stores `obras` e `meta` não são tocadas
      if (!db.objectStoreNames.contains(STORE_RECORTES)) db.createObjectStore(STORE_RECORTES, { keyPath: 'chave' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB'))
  })
}

/** Executa `fn` numa transação e resolve só quando ela conclui (commit); qualquer erro ou aborto rejeita. */
function transacao<T>(db: IDBDatabase, modo: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_OBRAS, STORE_META, STORE_RECORTES], modo)
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
      return await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_META).get(CHAVE_INDICE))
    },
    async lerObra(id) {
      return (await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_OBRAS).get(id))) as RegistroObra | undefined
    },
    async listarIdsObras() {
      const chaves = await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_OBRAS).getAllKeys())
      return (chaves ?? []).map(String)
    },
    async lerRecorte(chave) {
      return (await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_RECORTES).get(chave))) as RegistroRecorte | undefined
    },
    async existeRecorte(chave) {
      return ((await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_RECORTES).count(chave))) ?? 0) > 0
    },
    async gravarObra(registro, indice, extras) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).put(registro)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
        if (extras?.gravarRecorte) tx.objectStore(STORE_RECORTES).put(extras.gravarRecorte)
        for (const chave of extras?.excluirRecortes ?? []) tx.objectStore(STORE_RECORTES).delete(chave)
      })
    },
    async excluirObra(id, indice, excluirRecortes) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).delete(id)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
        for (const chave of excluirRecortes ?? []) tx.objectStore(STORE_RECORTES).delete(chave)
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
