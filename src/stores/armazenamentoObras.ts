// Acesso ao armazenamento local das obras (ADR 00002): IndexedDB no navegador e memória nos testes ou quando o IndexedDB falta.
// Fica em src/stores (e não em src/lib) porque toca armazenamento do navegador. Nenhuma regra de negócio mora aqui.
import type { ExtrasDeGravacao, IndiceObras, RegistroObra, RegistroRecorte, ResultadoPersistencia } from '@/types/obra'

export const NOME_BANCO = 'cronoai'
/**
 * Versão de ESTRUTURA do banco (stores). A versão do esquema de cada obra é outra coisa (src/lib/migracaoEstado.ts).
 * 1 = obras e meta; 2 = + `recortesSinapi` (ciclo 00006, ADR 00002); 3 = + `fechamentos` e `fechamentoTarefas` (ciclo 00007).
 * Um app que só conhece a estrutura anterior recebe `VersionError` ao abrir a nova e cai na memória sem gravar.
 */
export const VERSAO_ESTRUTURA = 3
export const CHAVE_V1 = 'cronoai-state-v1'
const STORE_OBRAS = 'obras'
const STORE_META = 'meta'
const STORE_RECORTES = 'recortesSinapi'
/** Cabeçalhos dos fechamentos (`keyPath: 'id'`, índice `obraId`) e o detalhe por tarefa (`keyPath: 'id'`). */
const STORE_FECHAMENTOS = 'fechamentos'
const STORE_DETALHES = 'fechamentoTarefas'
const INDICE_OBRA = 'obraId'
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
  /** Cabeçalhos de fechamento da obra como estão gravados (dado externo: quem lê valida com `validarCabecalhosFechamento`). */
  lerCabecalhosFechamento(obraId: string): Promise<unknown[]>
  /** Registro do detalhe de um fechamento (dado externo: quem lê valida com `lerDetalheFechamento`). */
  lerDetalheFechamento(id: string): Promise<unknown>
  /** Pede ao navegador armazenamento persistente (não bloqueia nada; o resultado vai para a tela e o log). */
  persistir(): Promise<ResultadoPersistencia>
  /**
   * Grava a obra e o índice na mesma transação (e, com `extras`, o recorte importado, a exclusão dos órfãos e o fechamento): ou tudo, ou nada.
   * O fechamento entra por `add`: um `id` que já existe falha com `ConstraintError` e nada é gravado (imutabilidade, D-17).
   */
  gravarObra(registro: RegistroObra, indice: IndiceObras, extras?: ExtrasDeGravacao): Promise<void>
  /** Remove a obra, grava o índice, apaga os recortes órfãos e os fechamentos da obra na mesma transação. */
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
  /** Cabeçalhos e detalhes dos fechamentos, por `id`. `unknown`: os testes de leitura adulterada gravam lixo aqui. */
  fechamentos: Map<string, unknown>
  detalhes: Map<string, unknown>
  /** Resultado que `persistir()` devolve e quantas vezes foi chamado (testes). */
  persistencia: { resultado: ResultadoPersistencia; chamadas: number }
  indice: IndiceObras | undefined
  estimativa: EstimativaArmazenamento
}

// Clone estruturado, como o do IndexedDB real: um proxy reativo do Vue falha aqui (DataCloneError), e o teste pega o erro
const copia = <T>(v: T): T => structuredClone(v)

/** `obraId` de um registro de fechamento qualquer (lixo incluído): só o que o índice do IndexedDB enxergaria. */
const obraDoRegistro = (v: unknown): unknown => (typeof v === 'object' && v !== null ? (v as { obraId?: unknown }).obraId : undefined)

export function criarArmazenamentoMemoria(v1: string | null = null): ArmazenamentoMemoria {
  const falhaGravacao = () => new DOMException('Cota simulada excedida', 'QuotaExceededError')
  const falhaLeitura = () => new Error('Leitura simulada falhou')
  const m: ArmazenamentoMemoria = {
    v1,
    falhar: { gravar: false, ler: false },
    obras: new Map(),
    recortes: new Map(),
    fechamentos: new Map(),
    detalhes: new Map(),
    persistencia: { resultado: 'concedido', chamadas: 0 },
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
    async lerCabecalhosFechamento(obraId) {
      if (m.falhar.ler) throw falhaLeitura()
      return [...m.fechamentos.values()].filter((c) => obraDoRegistro(c) === obraId).map(copia)
    },
    async lerDetalheFechamento(id) {
      if (m.falhar.ler) throw falhaLeitura()
      const r = m.detalhes.get(id)
      return r === undefined ? undefined : copia(r)
    },
    async persistir() {
      m.persistencia.chamadas++
      return m.persistencia.resultado
    },
    // A falha é simulada ANTES de qualquer escrita: nada fica pela metade, como na transação do IndexedDB
    async gravarObra(registro, indice, extras) {
      if (m.falhar.gravar) throw falhaGravacao()
      const novo = extras?.gravarFechamento
      // `add`, nunca `put`: um id que já existe aborta tudo (ConstraintError), como o `IDBObjectStore.add` do IndexedDB
      if (novo && (m.fechamentos.has(novo.cabecalho.id) || m.detalhes.has(novo.detalhe.id))) {
        throw new DOMException('Já existe um fechamento com este id', 'ConstraintError')
      }
      const obra = copia(registro)
      const ind = copia(indice)
      const recorte = extras?.gravarRecorte ? copia(extras.gravarRecorte) : undefined
      const cab = novo ? copia(novo.cabecalho) : undefined
      const det = novo ? copia(novo.detalhe) : undefined
      m.obras.set(obra.id, obra)
      m.indice = ind
      if (recorte) m.recortes.set(recorte.chave, recorte)
      for (const chave of extras?.excluirRecortes ?? []) m.recortes.delete(chave)
      if (cab && det) {
        m.fechamentos.set(cab.id, cab)
        m.detalhes.set(det.id, det)
      }
    },
    async excluirObra(id, indice, excluirRecortes) {
      if (m.falhar.gravar) throw falhaGravacao()
      m.obras.delete(id)
      m.indice = copia(indice)
      for (const chave of excluirRecortes ?? []) m.recortes.delete(chave)
      for (const [fid, c] of [...m.fechamentos]) {
        if (obraDoRegistro(c) !== id) continue
        m.fechamentos.delete(fid)
        m.detalhes.delete(fid)
      }
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

async function persistirNoNavegador(): Promise<ResultadoPersistencia> {
  try {
    if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') return 'indisponivel'
    return (await navigator.storage.persist()) ? 'concedido' : 'negado'
  } catch {
    return 'indisponivel'
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
      // Estrutura 3 (ciclo 00007): cria só o que falta; `obras`, `meta` e `recortesSinapi` ficam intactas (P-5)
      if (!db.objectStoreNames.contains(STORE_FECHAMENTOS)) db.createObjectStore(STORE_FECHAMENTOS, { keyPath: 'id' }).createIndex(INDICE_OBRA, 'obraId')
      if (!db.objectStoreNames.contains(STORE_DETALHES)) db.createObjectStore(STORE_DETALHES, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Falha ao abrir o IndexedDB'))
  })
}

/** Executa `fn` numa transação e resolve só quando ela conclui (commit); qualquer erro ou aborto rejeita. */
function transacao<T>(db: IDBDatabase, modo: IDBTransactionMode, fn: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction([STORE_OBRAS, STORE_META, STORE_RECORTES, STORE_FECHAMENTOS, STORE_DETALHES], modo)
      const req = fn(tx)
      tx.oncomplete = () => resolve(req ? req.result : undefined)
      // O erro do pedido (ex.: ConstraintError do `add`) chega em `event.target.error`; `tx.error` ainda é nulo aqui (só o aborto o preenche) e o `onerror` rejeita primeiro
      tx.onerror = (ev) => reject((ev.target as IDBRequest | null)?.error ?? tx.error ?? new Error('Falha na transação do IndexedDB'))
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
    async lerCabecalhosFechamento(obraId) {
      return (await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_FECHAMENTOS).index(INDICE_OBRA).getAll(obraId))) ?? []
    },
    async lerDetalheFechamento(id) {
      return await transacao(db, 'readonly', (tx) => tx.objectStore(STORE_DETALHES).get(id))
    },
    persistir: persistirNoNavegador,
    async gravarObra(registro, indice, extras) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).put(registro)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
        if (extras?.gravarRecorte) tx.objectStore(STORE_RECORTES).put(extras.gravarRecorte)
        for (const chave of extras?.excluirRecortes ?? []) tx.objectStore(STORE_RECORTES).delete(chave)
        // `add`, nunca `put`: um id que já existe falha com ConstraintError e aborta a transação inteira (D-17)
        if (extras?.gravarFechamento) {
          tx.objectStore(STORE_FECHAMENTOS).add(extras.gravarFechamento.cabecalho)
          tx.objectStore(STORE_DETALHES).add(extras.gravarFechamento.detalhe)
        }
      })
    },
    async excluirObra(id, indice, excluirRecortes) {
      await transacao(db, 'readwrite', (tx) => {
        tx.objectStore(STORE_OBRAS).delete(id)
        tx.objectStore(STORE_META).put(indice, CHAVE_INDICE)
        for (const chave of excluirRecortes ?? []) tx.objectStore(STORE_RECORTES).delete(chave)
        // Os fechamentos da obra saem junto (cabeçalho e detalhe), na mesma transação
        const chaves = tx.objectStore(STORE_FECHAMENTOS).index(INDICE_OBRA).getAllKeys(id)
        chaves.onsuccess = () => {
          for (const k of chaves.result) {
            tx.objectStore(STORE_FECHAMENTOS).delete(k)
            tx.objectStore(STORE_DETALHES).delete(k)
          }
        }
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
