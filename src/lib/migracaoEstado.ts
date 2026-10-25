// Leitura do estado salvo pela versão anterior (v1) e cadeia de migrações do esquema da obra (SPEC-15 RNF-15.3).
// Cada ciclo que muda o formato da obra acrescenta um passo em MIGRACOES e o teste com o formato anterior.
import type { PersistedState, RegistroObra } from '@/types/obra'
import { defaultHolidays } from './calendar'

/** Esquema 1 = formato do `cronoai-state-v1`; esquema 2 = o mesmo estado dentro de um registro por obra. */
export const ESQUEMA_ATUAL = 2

export interface PassoMigracao {
  de: number
  para: number
  aplicar: (estado: PersistedState) => PersistedState
}

export const MIGRACOES: PassoMigracao[] = [
  // v1 → v2: só embrulha o estado num registro por obra; o conteúdo não muda.
  { de: 1, para: 2, aplicar: (estado) => estado },
]

export type LeituraV1 =
  | { tipo: 'ausente' }
  | { tipo: 'corrompido' }
  | { tipo: 'ok'; estado: PersistedState; avisos: string[] }

export type ResultadoMigracao = { tipo: 'ok'; estado: PersistedState; avisos: string[] } | { tipo: 'erro'; mensagem: string }

const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Critério de validade do estado: o mesmo de antes da multiobra (tarefas não vazias e meta). */
function temTarefasEMeta(v: unknown): v is Record<string, unknown> {
  return eObjeto(v) && Array.isArray(v.tasks) && v.tasks.length > 0 && eObjeto(v.meta)
}

/** Fronteira de confiança: chaves e listas já verificadas; o conteúdo interno de cada lista não é revalidado (a v1 já o gravava assim). */
function eEstado(v: Record<string, unknown>): v is Record<string, unknown> & PersistedState {
  return Array.isArray(v.tasks) && eObjeto(v.meta) && eObjeto(v.calendar) && CHAVES_LISTA.every((c) => Array.isArray(v[c]))
}

const CHAVES_LISTA = ['reports', 'restrictions', 'materials', 'recoveryCosts', 'appliedScenarios', 'log', 'undo', 'budget'] as const

/**
 * Completa as chaves ausentes ou de tipo errado com o valor vazio. Diferente do merge raso antigo,
 * não injeta orçamento nem relatos do Edifício Aurora numa obra que não é o Aurora.
 */
function completarChaves(bruto: Record<string, unknown>): { estado: PersistedState; preenchidas: string[] } {
  const preenchidas: string[] = []
  const saida: Record<string, unknown> = { ...bruto }
  for (const chave of CHAVES_LISTA) {
    if (!Array.isArray(saida[chave])) {
      saida[chave] = []
      preenchidas.push(chave)
    }
  }
  const cal = saida.calendar
  if (!eObjeto(cal) || !Array.isArray(cal.holidays) || !Array.isArray(cal.extraWorkingDays)) {
    const meta = saida.meta as Record<string, unknown>
    const ano = Number(String(meta.startDate ?? '').slice(0, 4)) || 2026
    saida.calendar = { holidays: defaultHolidays(ano, ano + 3), extraWorkingDays: [] }
    preenchidas.push('calendar')
  }
  if (!eEstado(saida)) throw new Error('Estado da obra inválido') // inalcançável: as chaves já foram verificadas acima
  return { estado: saida, preenchidas }
}

function avisoDePreenchidas(preenchidas: string[]): string[] {
  return preenchidas.length
    ? [`Campos ausentes ou inválidos no estado salvo foram preenchidos como vazios: ${preenchidas.join(', ')}.`]
    : []
}

/** Lê o texto gravado em `cronoai-state-v1`. */
export function lerEstadoV1(raw: string | null | undefined): LeituraV1 {
  if (raw === null || raw === undefined || raw === '') return { tipo: 'ausente' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { tipo: 'corrompido' }
  }
  if (!temTarefasEMeta(parsed)) return { tipo: 'corrompido' }
  const { estado, preenchidas } = completarChaves(parsed)
  return { tipo: 'ok', estado, avisos: avisoDePreenchidas(preenchidas) }
}

/** Monta o registro gravado de uma obra: a string JSON do estado, como na v1. */
export function criarRegistro(id: string, estado: PersistedState, atualizadoEm: string): RegistroObra {
  return { id, versaoEsquema: ESQUEMA_ATUAL, json: JSON.stringify(estado), atualizadoEm }
}

/** Lê um registro gravado e o leva ao esquema atual. Esquema mais novo que o do app é recusado (e nunca sobrescrito). */
export function migrarRegistro(reg: RegistroObra | undefined): ResultadoMigracao {
  if (!reg || typeof reg.json !== 'string') return { tipo: 'erro', mensagem: 'Os dados desta obra não foram encontrados.' }
  if (!Number.isInteger(reg.versaoEsquema) || reg.versaoEsquema < 1) {
    return { tipo: 'erro', mensagem: 'Os dados desta obra estão em um formato desconhecido.' }
  }
  if (reg.versaoEsquema > ESQUEMA_ATUAL) {
    return { tipo: 'erro', mensagem: `Obra salva por uma versão mais nova do CronoAI (esquema ${reg.versaoEsquema}).` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(reg.json)
  } catch {
    return { tipo: 'erro', mensagem: 'Os dados desta obra estão ilegíveis.' }
  }
  // Obra em branco grava `tasks: []`: aqui basta a lista existir (a v1 exigia tarefas)
  if (!eObjeto(parsed) || !Array.isArray(parsed.tasks) || !eObjeto(parsed.meta)) {
    return { tipo: 'erro', mensagem: 'Os dados desta obra estão ilegíveis.' }
  }
  const { estado: completo, preenchidas } = completarChaves(parsed)
  let estado = completo
  for (let v = reg.versaoEsquema; v < ESQUEMA_ATUAL; v++) {
    const passo = MIGRACOES.find((p) => p.de === v)
    if (!passo) return { tipo: 'erro', mensagem: `Não há migração do esquema ${v} para o ${v + 1}.` }
    estado = passo.aplicar(estado)
  }
  return { tipo: 'ok', estado, avisos: avisoDePreenchidas(preenchidas) }
}
