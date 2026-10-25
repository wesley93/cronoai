// Leitura do estado salvo pela versão anterior (v1) e cadeia de migrações do esquema da obra (SPEC-15 RNF-15.3).
// Cada ciclo que muda o formato da obra acrescenta um passo em MIGRACOES e o teste com o formato anterior.
import type { PersistedState, RegistroObra } from '@/types/obra'
import { defaultHolidays } from './calendar'
import { UID_CALENDARIO_PADRAO, calendarioPadrao, diasParaMinutos, erroDoCalendario } from './calendarioTrabalho'
import type { CalendarioObra } from '@/types/domain'

/**
 * Esquema 1 = formato do `cronoai-state-v1`; esquema 2 = o mesmo estado dentro de um registro por obra;
 * esquema 3 = tempo em minutos inteiros e calendários por intervalo (ciclo 00004, ADR 00003).
 */
export const ESQUEMA_ATUAL = 3

/** Estado como foi lido do armazenamento, ainda sem forma garantida. */
export type EstadoBruto = Record<string, unknown>

export interface PassoMigracao {
  de: number
  para: number
  aplicar: (estado: EstadoBruto) => EstadoBruto
}

const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * Converte as chaves de tempo de uma tarefa (inteira ou parcial, como as do `undo`) do esquema 2 para o 3.
 * Só mexe nas chaves antigas presentes; chave desconhecida passa intacta.
 * `durationDays` e `baselineDuration` (dias, já arredondados pelo motor antigo) viram minutos; `lagDays` vira `lag`;
 * `snet` vira `restricao`. É o mesmo arredondamento do motor de hoje (`Math.round`), então nenhum número muda.
 */
export function tarefaDoEsquema2Para3(t: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...t }
  if ('durationDays' in out) {
    const d = out.durationDays
    if (eNumero(d)) out.duracaoMin = diasParaMinutos(Math.round(d))
    delete out.durationDays
  }
  if ('baselineDuration' in out) {
    const d = out.baselineDuration
    if (eNumero(d)) out.baselineDuracaoMin = diasParaMinutos(Math.round(d))
    delete out.baselineDuration
  }
  if ('snet' in out) {
    const d = out.snet
    if (typeof d === 'string' && d !== '') out.restricao = { tipo: 'SNET', data: d }
    delete out.snet
  }
  if (Array.isArray(out.predecessors)) {
    out.predecessors = out.predecessors.map((p) => {
      if (!eObjeto(p) || !('lagDays' in p)) return p
      const { lagDays, ...resto } = p
      return { ...resto, lag: { tipo: 'util', minutos: eNumero(lagDays) ? diasParaMinutos(lagDays) : 0 } }
    })
  }
  return out
}

/** Passo 2 → 3: tarefas, `undo` por obra (`before` e `result.taskPatch.patch`) e calendário. */
function migrar2Para3(estado: EstadoBruto): EstadoBruto {
  const { calendar, ...resto } = estado
  const saida: EstadoBruto = { ...resto }
  if (Array.isArray(saida.tasks)) saida.tasks = saida.tasks.map((t) => (eObjeto(t) ? tarefaDoEsquema2Para3(t) : t))
  if (Array.isArray(saida.undo)) {
    saida.undo = saida.undo.map((u) => {
      if (!eObjeto(u)) return u
      const novo: Record<string, unknown> = { ...u }
      if (eObjeto(novo.before)) novo.before = tarefaDoEsquema2Para3(novo.before)
      if (eObjeto(novo.result) && eObjeto(novo.result.taskPatch) && eObjeto(novo.result.taskPatch.patch)) {
        novo.result = { ...novo.result, taskPatch: { ...novo.result.taskPatch, patch: tarefaDoEsquema2Para3(novo.result.taskPatch.patch) } }
      }
      return novo
    })
  }
  // Calendário: feriados viram exceções não úteis e dias extras, exceções úteis no mesmo expediente (08–12 e 13–17)
  const cal = eObjeto(calendar) ? calendar : {}
  const feriados = Array.isArray(cal.holidays) ? cal.holidays.filter((d): d is string => typeof d === 'string') : []
  const extras = Array.isArray(cal.extraWorkingDays) ? cal.extraWorkingDays.filter((d): d is string => typeof d === 'string') : []
  saida.calendarios = [calendarioPadrao(feriados, extras)]
  saida.calendarioPadraoUid = UID_CALENDARIO_PADRAO
  return saida
}

export const MIGRACOES: PassoMigracao[] = [
  // v1 → v2: só embrulha o estado num registro por obra; o conteúdo não muda.
  { de: 1, para: 2, aplicar: (estado) => estado },
  { de: 2, para: 3, aplicar: migrar2Para3 },
]

export type LeituraV1 =
  | { tipo: 'ausente' }
  | { tipo: 'corrompido' }
  | { tipo: 'ok'; estado: PersistedState; avisos: string[] }

export type ResultadoMigracao = { tipo: 'ok'; estado: PersistedState; avisos: string[] } | { tipo: 'erro'; mensagem: string }

/** Critério de validade do estado: o mesmo de antes da multiobra (tarefas não vazias e meta). */
function temTarefasEMeta(v: unknown): v is Record<string, unknown> {
  return eObjeto(v) && Array.isArray(v.tasks) && v.tasks.length > 0 && eObjeto(v.meta)
}

const CHAVES_LISTA = ['reports', 'restrictions', 'materials', 'recoveryCosts', 'appliedScenarios', 'log', 'undo', 'budget'] as const

/** Fronteira de confiança: chaves e listas já verificadas; o conteúdo interno de cada lista não é revalidado (a v1 já o gravava assim). */
function eEstado(v: Record<string, unknown>): v is Record<string, unknown> & PersistedState {
  return (
    Array.isArray(v.tasks) &&
    eObjeto(v.meta) &&
    Array.isArray(v.calendarios) &&
    v.calendarios.every(eObjeto) &&
    eNumero(v.calendarioPadraoUid) &&
    CHAVES_LISTA.every((c) => Array.isArray(v[c]))
  )
}

function anoDaObra(estado: Record<string, unknown>, anoPadrao: number): number {
  const meta = eObjeto(estado.meta) ? estado.meta : {}
  return Number(String(meta.startDate ?? '').slice(0, 4)) || anoPadrao
}

/**
 * Completa as chaves ausentes ou de tipo errado com o valor vazio. Diferente do merge raso antigo,
 * não injeta orçamento nem relatos do Edifício Aurora numa obra que não é o Aurora.
 * Esquema ≤ 2: completa `calendar`. Esquema ≥ 3: completa `calendarios` e o calendário padrão.
 */
function completarChaves(bruto: EstadoBruto, anoPadrao: number, esquema: number): { estado: EstadoBruto; preenchidas: string[] } {
  const preenchidas: string[] = []
  const saida: EstadoBruto = { ...bruto }
  for (const chave of CHAVES_LISTA) {
    if (!Array.isArray(saida[chave])) {
      saida[chave] = []
      preenchidas.push(chave)
    }
  }
  const ano = anoDaObra(saida, anoPadrao)
  if (esquema <= 2) {
    // Calendário: preserva o que existe (feriados cadastrados, dias extras) e completa só o que falta.
    // Sem feriados, usa os nacionais a partir do ano de início da obra (ou do ano informado por quem chama).
    const cal = eObjeto(saida.calendar) ? saida.calendar : {}
    const semFeriados = !Array.isArray(cal.holidays)
    const semExtras = !Array.isArray(cal.extraWorkingDays)
    if (semFeriados || semExtras) {
      saida.calendar = {
        ...cal,
        holidays: semFeriados ? defaultHolidays(ano, ano + 3) : cal.holidays,
        extraWorkingDays: semExtras ? [] : cal.extraWorkingDays,
      }
      preenchidas.push('calendar')
    }
  } else {
    const validos = Array.isArray(saida.calendarios) && saida.calendarios.length > 0 && saida.calendarios.every(eObjeto)
    if (!validos) {
      saida.calendarios = [calendarioPadrao(defaultHolidays(ano, ano + 3))]
      saida.calendarioPadraoUid = UID_CALENDARIO_PADRAO
      preenchidas.push('calendarios')
    } else {
      const lista = saida.calendarios as Record<string, unknown>[]
      if (!lista.some((c) => c.uid === saida.calendarioPadraoUid)) {
        saida.calendarioPadraoUid = lista[0].uid
        preenchidas.push('calendarioPadraoUid')
      }
    }
  }
  return { estado: saida, preenchidas }
}

function avisoDePreenchidas(preenchidas: string[]): string[] {
  return preenchidas.length
    ? [`Campos ausentes ou inválidos no estado salvo foram preenchidos como vazios: ${preenchidas.join(', ')}.`]
    : []
}

/** Problema de um calendário vindo do estado salvo (forma ou conteúdo), ou `undefined` se está íntegro. */
function erroDoCalendarioSalvo(c: unknown): string | undefined {
  if (!eObjeto(c) || !eNumero(c.uid) || typeof c.nome !== 'string') return 'forma inválida'
  // Fronteira de confiança: uid e nome já conferidos; `erroDoCalendario` valida o resto (semana, exceções, horários)
  return erroDoCalendario(c as unknown as CalendarioObra)
}

/**
 * Valida cada calendário do estado (qualquer esquema): o inválido é descartado com aviso, para não derrubar o cálculo.
 * Se o descartado era o padrão, entra o calendário padrão com os feriados nacionais (mesmo UID: as tarefas continuam apontando para ele).
 */
function descartarCalendariosInvalidos(estado: EstadoBruto, anoPadrao: number): string[] {
  const lista = Array.isArray(estado.calendarios) ? estado.calendarios : []
  const validos = lista.filter((c) => erroDoCalendarioSalvo(c) === undefined)
  const descartados = lista.length - validos.length
  if (descartados === 0) return []
  const padraoUid = eNumero(estado.calendarioPadraoUid) ? estado.calendarioPadraoUid : UID_CALENDARIO_PADRAO
  const refeito = !validos.some((c) => eObjeto(c) && c.uid === padraoUid)
  if (refeito) {
    const ano = anoDaObra(estado, anoPadrao)
    validos.unshift(calendarioPadrao(defaultHolidays(ano, ano + 3), [], padraoUid))
  }
  estado.calendarios = validos
  estado.calendarioPadraoUid = padraoUid
  return [
    `${descartados} calendário(s) inválido(s) descartado(s) do estado salvo${refeito ? '; o calendário padrão foi refeito com os feriados nacionais' : ''}.`,
  ]
}

/** Cada tarefa precisa de duração em minutos: não se inventa duração para registro sem ela. */
const tarefasCompletas = (tasks: unknown[]): boolean => tasks.every((t) => eObjeto(t) && eNumero(t.duracaoMin))

/** Leva o estado do esquema `de` ao atual pela cadeia de migrações. */
function levarAoAtual(bruto: EstadoBruto, de: number, anoPadrao: number): ResultadoMigracao {
  const { estado: completo, preenchidas } = completarChaves(bruto, anoPadrao, de)
  let estado = completo
  for (let v = de; v < ESQUEMA_ATUAL; v++) {
    const passo = MIGRACOES.find((p) => p.de === v)
    if (!passo) return { tipo: 'erro', mensagem: `Não há migração do esquema ${v} para o ${v + 1}.` }
    estado = passo.aplicar(estado)
  }
  const descartes = descartarCalendariosInvalidos(estado, anoPadrao)
  if (!eEstado(estado) || !tarefasCompletas(estado.tasks)) {
    return { tipo: 'erro', mensagem: 'Os dados desta obra estão ilegíveis.' }
  }
  return { tipo: 'ok', estado, avisos: [...avisoDePreenchidas(preenchidas), ...descartes] }
}

/** Lê o texto gravado em `cronoai-state-v1`. */
export function lerEstadoV1(raw: string | null | undefined, anoPadrao: number): LeituraV1 {
  if (raw === null || raw === undefined || raw === '') return { tipo: 'ausente' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { tipo: 'corrompido' }
  }
  if (!temTarefasEMeta(parsed)) return { tipo: 'corrompido' }
  const r = levarAoAtual(parsed, 1, anoPadrao)
  return r.tipo === 'ok' ? { tipo: 'ok', estado: r.estado, avisos: r.avisos } : { tipo: 'corrompido' }
}

/** Monta o registro gravado de uma obra: a string JSON do estado, como na v1. */
export function criarRegistro(id: string, estado: PersistedState, atualizadoEm: string): RegistroObra {
  return { id, versaoEsquema: ESQUEMA_ATUAL, json: JSON.stringify(estado), atualizadoEm }
}

/** Lê um registro gravado e o leva ao esquema atual. Esquema mais novo que o do app é recusado (e nunca sobrescrito). */
export function migrarRegistro(reg: RegistroObra | undefined, anoPadrao: number): ResultadoMigracao {
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
  return levarAoAtual(parsed, reg.versaoEsquema, anoPadrao)
}
