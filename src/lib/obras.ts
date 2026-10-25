// Regras puras da obra: validação dos dados, obra em branco, nome da cópia, resumo da lista e limiar de cota.
import type { IndiceObras, PersistedState, ResumoObra } from '@/types/obra'
import type { ProjectMeta } from '@/types/domain'
import { REGIMES_SINAPI, ROTULO_REGIME_SINAPI, UFS, type RegimeSinapi, type UF } from '@/data/ufs'
import { diffCalendarDays, parseISO, toISO } from './calendar'
import { JANELA_ANOS_DATAS, UID_CALENDARIO_PADRAO, calendarioPadrao } from './calendarioTrabalho'
import { configFeriadosPadrao } from './feriadosObra'
import { premissasPadrao } from './premissas'
import { lerChaveRecorte } from './recorteSinapi'

export const MAX_NOME_OBRA = 120
export const MAX_MUNICIPIO = 80
export const MAX_RESPONSAVEL = 120
/** Uso da cota (em %) a partir do qual o app avisa. */
export const LIMIAR_COTA_PCT = 80

export interface DadosObra {
  nome: string
  uf?: UF | ''
  municipio?: string
  responsavel?: string
  /** Data de início (ISO yyyy-mm-dd). */
  dataInicio: string
  /** Data de status (ISO yyyy-mm-dd). */
  dataStatus: string
  regimeSinapi?: RegimeSinapi | ''
  /** Data-base da tabela SINAPI (AAAA-MM). */
  dataBaseSinapi?: string
  /** Lógica de progresso da obra ativa (RF-05.5); ausente no cadastro de obra nova. */
  logicaProgresso?: 'retida' | 'substituir'
  /** Mover o restante para depois da data de status (política do CronoAI). */
  moverRestante?: boolean
}

/**
 * Contexto da edição das datas de uma obra existente. As regras de coerência só valem em obra COM avanço
 * (alguma tarefa com % concluído ou início real) e só para a data que mudou: obra futura ou não iniciada fica livre,
 * e uma obra importada com datas incoerentes pode editar outros campos.
 */
export interface ContextoInicio {
  inicioOriginal: string
  statusOriginal: string
  comAvanco: boolean
  /** Menor data de início real entre as tarefas. */
  primeiroInicioReal?: string
}

export type SituacaoCota = 'ok' | 'alerta' | 'indisponivel'

function dataIsoValida(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISO(parseISO(iso)) === iso
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/')

/** Coerência das datas em obra com avanço: só a data que mudou é conferida. */
function validarDatasComAvanco(d: DadosObra, c: ContextoInicio): string[] {
  const erros: string[] = []
  if (!dataIsoValida(d.dataInicio) || !dataIsoValida(d.dataStatus)) return erros
  if (d.dataInicio !== c.inicioOriginal) {
    if (d.dataInicio > d.dataStatus) erros.push('A data de início não pode ser depois da data de status.')
    if (c.primeiroInicioReal && d.dataInicio > c.primeiroInicioReal) {
      erros.push(`A data de início não pode ser depois do primeiro início real da obra (${dataBR(c.primeiroInicioReal)}).`)
    }
  }
  if (d.dataStatus !== c.statusOriginal) {
    if (d.dataStatus < d.dataInicio) erros.push('A data de status não pode ser anterior à data de início.')
    if (c.primeiroInicioReal && d.dataStatus < c.primeiroInicioReal) {
      erros.push(`A data de status não pode ser anterior ao primeiro início real da obra (${dataBR(c.primeiroInicioReal)}).`)
    }
  }
  return erros
}

/**
 * A data de status precisa estar a menos de 45 anos da data de início: além disso o cálculo previsto (que reprograma o restante a partir
 * da data de status) estoura o horizonte de 50 anos do motor. Data inválida também é recusada.
 */
export function erroDeStatusForaDaJanela(inicio: string, status: string): string | undefined {
  if (!dataIsoValida(status)) return 'Informe uma data de status válida.'
  if (!dataIsoValida(inicio)) return undefined
  if (Math.abs(diffCalendarDays(inicio, status)) > JANELA_ANOS_DATAS * 365) {
    return `A data de status deve estar a menos de ${JANELA_ANOS_DATAS} anos da data de início.`
  }
  return undefined
}

/** Valida as opções de cronograma (lógica de progresso e mover o restante); uma só regra para o formulário e a ação da store. */
export function validarOpcoesCronograma(logica: unknown, moverRestante: unknown): string[] {
  const erros: string[] = []
  if (logica !== undefined && logica !== 'retida' && logica !== 'substituir') erros.push('Selecione uma lógica de progresso válida.')
  if (moverRestante !== undefined && typeof moverRestante !== 'boolean') erros.push('Informe se o restante deve ser movido para depois da data de status.')
  return erros
}

/** Valida os dados de uma obra; devolve as mensagens de erro em português (lista vazia = válido). */
export function validarDadosObra(d: DadosObra, contexto?: ContextoInicio): string[] {
  const erros: string[] = []
  const nome = d.nome.trim()
  if (!nome) erros.push('Informe o nome da obra.')
  else if (nome.length > MAX_NOME_OBRA) erros.push(`O nome da obra deve ter no máximo ${MAX_NOME_OBRA} caracteres.`)
  if (d.uf && !UFS.some((u) => u.sigla === d.uf)) erros.push('Selecione uma UF válida.')
  if ((d.municipio ?? '').trim().length > MAX_MUNICIPIO) erros.push(`O município deve ter no máximo ${MAX_MUNICIPIO} caracteres.`)
  if ((d.responsavel ?? '').trim().length > MAX_RESPONSAVEL) erros.push(`O responsável deve ter no máximo ${MAX_RESPONSAVEL} caracteres.`)
  if (!dataIsoValida(d.dataInicio)) erros.push('Informe uma data de início válida.')
  if (!dataIsoValida(d.dataStatus)) erros.push('Informe uma data de status válida.')
  if (contexto?.comAvanco) erros.push(...validarDatasComAvanco(d, contexto))
  if (d.regimeSinapi && !REGIMES_SINAPI.includes(d.regimeSinapi)) erros.push('Selecione um regime SINAPI válido.')
  if (d.dataBaseSinapi && !/^\d{4}-(0[1-9]|1[0-2])$/.test(d.dataBaseSinapi)) erros.push('A data-base do SINAPI deve estar no formato AAAA-MM (ex.: 2026-09).')
  erros.push(...validarOpcoesCronograma(d.logicaProgresso, d.moverRestante))
  if (dataIsoValida(d.dataInicio) && dataIsoValida(d.dataStatus)) {
    const janela = erroDeStatusForaDaJanela(d.dataInicio, d.dataStatus)
    if (janela) erros.push(janela)
  }
  return erros
}

/**
 * Estado de uma obra em branco: sem tarefas, com feriados nacionais e sem UF (a UF só entra se informada).
 * As premissas nascem na versão 1 padrão (ilustrativas), com vigência na data de início da obra.
 */
export function estadoObraVazia(d: DadosObra): PersistedState {
  const meta: PersistedState['meta'] = {
    name: d.nome.trim(),
    company: '',
    manager: (d.responsavel ?? '').trim(),
    startDate: d.dataInicio,
    statusDate: d.dataStatus,
  }
  if (d.uf) meta.uf = d.uf
  if (d.municipio?.trim()) meta.municipio = d.municipio.trim()
  if (d.regimeSinapi) meta.regimeSinapi = d.regimeSinapi
  if (d.dataBaseSinapi) meta.dataBaseSinapi = d.dataBaseSinapi
  return {
    meta,
    tasks: [],
    calendarios: [{ ...calendarioPadrao([]), aplicaFeriadosObra: true }], // os feriados vêm da configuração da obra (`feriados`)
    calendarioPadraoUid: UID_CALENDARIO_PADRAO,
    premissas: [{ versao: 1, vigencia: d.dataInicio, motivo: 'Premissas iniciais da obra (ilustrativas)', valores: premissasPadrao() }],
    feriados: configFeriadosPadrao(),
    reports: [],
    restrictions: [],
    materials: [],
    recoveryCosts: [],
    appliedScenarios: [],
    log: [],
    undo: [],
    budget: [],
  }
}

const eInteiro = (v: unknown): v is number => Number.isInteger(v)

/**
 * Confere a forma do registro de "desfazer" lido do estado salvo (dado externo) ANTES de qualquer alteração: listas de datas, de calendários
 * criados e de calendário anterior das tarefas, e as atribuições da hora extra guardadas no resultado. Devolve o problema ou `undefined`.
 */
export function erroDoRegistroDeDesfazer(u: unknown): string | undefined {
  if (!eObj(u)) return 'registro em formato inválido'
  if (u.calendariosCriados !== undefined && !(Array.isArray(u.calendariosCriados) && u.calendariosCriados.every(eInteiro))) return 'calendários criados inválidos'
  if (
    u.calendariosAntes !== undefined &&
    !(Array.isArray(u.calendariosAntes) && u.calendariosAntes.every((x) => eObj(x) && eInteiro(x.uid) && (x.calendarioUid === undefined || eInteiro(x.calendarioUid))))
  ) {
    return 'calendários anteriores das tarefas inválidos'
  }
  if (u.addedDays !== undefined && !(Array.isArray(u.addedDays) && u.addedDays.every((d) => typeof d === 'string'))) return 'datas da hora extra inválidas'
  if (!eObj(u.result)) return 'resultado do cenário ausente ou inválido'
  const he = u.result.horaExtra
  if (he !== undefined && !(eObj(he) && Array.isArray(he.atribuicoes) && he.atribuicoes.every((a) => eObj(a) && eInteiro(a.uid) && eInteiro(a.calendarioUid)))) {
    return 'atribuições da hora extra inválidas'
  }
  return undefined
}

/** Nome da cópia de uma obra: "X (cópia)", ou "X (cópia 2)" se já existir. */
export function nomeDaCopia(nome: string, existentes: string[] = []): string {
  const base = `${nome} (cópia)`
  if (!existentes.includes(base)) return base
  for (let n = 2; ; n++) {
    const candidato = `${nome} (cópia ${n})`
    if (!existentes.includes(candidato)) return candidato
  }
}

/** Data local de hoje (yyyy-mm-dd): `toISOString` usaria UTC e, à noite no Brasil, daria o dia seguinte. */
export function dataLocalISO(d: Date): string {
  const dois = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`
}

export type ValidacaoIndice = { tipo: 'ok'; indice: IndiceObras } | { tipo: 'invalido'; mensagem: string }

const eObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** A chave do recorte guardada no índice é opcional, mas, se existir, tem a forma `UF|regime|AAAA-MM` (índice adulterado não pode apagar nem apontar para qualquer coisa). */
const chaveDoIndiceValida = (v: unknown): boolean => v === undefined || lerChaveRecorte(v) !== undefined

/** Confere a forma do índice (dado externo): versão 1, id ativo em texto e obras com id, nome e data em texto. */
function formaDoIndice(v: Record<string, unknown>): v is Record<string, unknown> & IndiceObras {
  if (v.versaoIndice !== 1 || typeof v.obraAtivaId !== 'string' || !Array.isArray(v.obras)) return false
  if (!v.obras.every((o) => eObj(o) && typeof o.id === 'string' && o.id !== '' && typeof o.nome === 'string' && typeof o.atualizadoEm === 'string' && chaveDoIndiceValida(o.recorteSinapi))) return false
  const mig = v.migracaoV1
  return mig === undefined || (eObj(mig) && typeof mig.em === 'string' && (mig.resultado === 'migrado' || mig.resultado === 'ilegivel'))
}

/**
 * Valida o índice lido do armazenamento. Índice inválido ou de versão mais nova é recusado:
 * quem chama não grava nada por cima dele.
 */
export function validarIndice(raw: unknown): ValidacaoIndice {
  const invalido = (mensagem: string): ValidacaoIndice => ({ tipo: 'invalido', mensagem })
  if (eObj(raw) && typeof raw.versaoIndice === 'number' && raw.versaoIndice > 1) {
    return invalido(`O índice das obras foi salvo por uma versão mais nova do CronoAI (índice ${raw.versaoIndice}). Nada foi gravado.`)
  }
  if (!eObj(raw) || !formaDoIndice(raw)) return invalido('O índice das obras salvas está inválido. Nada foi gravado, para não sobrescrever o que já existe.')
  return { tipo: 'ok', indice: raw }
}

/** Aviso do catálogo SINAPI com a UF, a data-base e o regime da obra (o catálogo do app é ilustrativo, de nenhuma UF). */
export function descreverTabelaSinapi(meta: Pick<ProjectMeta, 'uf' | 'regimeSinapi' | 'dataBaseSinapi'>): string {
  if (!meta.uf) return 'UF da obra não informada: o catálogo é ilustrativo.'
  const [ano, mes] = (meta.dataBaseSinapi ?? '').split('-')
  const partes = [meta.uf, meta.dataBaseSinapi ? `${mes}/${ano}` : '', meta.regimeSinapi ? ROTULO_REGIME_SINAPI[meta.regimeSinapi].toLowerCase() : ''].filter(Boolean)
  return `Catálogo SINAPI ilustrativo: não corresponde a ${partes.join(' · ')}.`
}

/** Linha da lista de obras a partir do estado. */
export function resumirObra(id: string, estado: PersistedState, atualizadoEm: string): ResumoObra {
  const { meta } = estado
  const resumo: ResumoObra = { id, nome: meta.name, atualizadoEm }
  if (meta.uf) resumo.uf = meta.uf
  if (meta.municipio) resumo.municipio = meta.municipio
  if (meta.manager) resumo.responsavel = meta.manager
  if (meta.recorteSinapi) resumo.recorteSinapi = meta.recorteSinapi.chave
  return resumo
}

/**
 * Recortes SINAPI órfãos depois de uma mudança no índice: chaves que `antes` usava e `depois` não usa mais em nenhuma obra.
 * Obra ilegível mantém a chave no índice (o resumo não perde o campo), então o recorte dela nunca é apagado.
 */
export function recortesOrfaos(antes: readonly Pick<ResumoObra, 'recorteSinapi'>[], depois: readonly Pick<ResumoObra, 'recorteSinapi'>[]): string[] {
  const usadas = new Set(depois.map((o) => o.recorteSinapi).filter((c): c is string => !!c))
  return [...new Set(antes.map((o) => o.recorteSinapi).filter((c): c is string => !!c && !usadas.has(c)))]
}

const cotaValida = (uso?: number, cota?: number): uso is number => uso !== undefined && cota !== undefined && Number.isFinite(uso) && Number.isFinite(cota) && cota > 0

/** Uso da cota em % (indefinido sem a API de estimativa ou com cota 0). */
export function percentualCota(uso?: number, cota?: number): number | undefined {
  return cotaValida(uso, cota) ? (uso / (cota as number)) * 100 : undefined
}

export function avaliarCota(uso?: number, cota?: number): SituacaoCota {
  if (!cotaValida(uso, cota)) return 'indisponivel'
  // uso ≥ 80% da cota, comparado sem divisão para não perder o limite exato por arredondamento
  return uso * 100 >= (cota as number) * LIMIAR_COTA_PCT ? 'alerta' : 'ok'
}
