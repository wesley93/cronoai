// Fechamento da data de status e retificação (ciclo 00007, SPEC-04, E3). Funções puras: captura, retificação, validação do que é lido do
// armazenamento (dado externo, sempre reconstruído), regras de data e de limite, avisos e a série dos fechamentos.
import type { ScheduleResult, Task } from '@/types/domain'
import {
  POS,
  TIPOS_FECHAMENTO,
  VERSAO_FORMATO_FECHAMENTO,
  type CabecalhoFechamento,
  type DetalheFechamento,
  type PacoteFechamento,
  type RegistroDetalheFechamento,
  type TarefaFechamento,
  type TotaisFechamento,
} from '@/types/fechamento'
import { TETO_DIAS } from './calendar'
import { MINUTOS_NO_DIA_CORRIDO, type CalendariosCompilados } from './calendarioTrabalho'
import { computeEvm, computePackageEvm, plannedFraction } from './evm'
import { fmtBRLCents } from './format'
import { CONTROLE_SEM_QUEBRA, NUMERO_MAX_LINHA_BASE, dataHoraIsoValida, dataIsoValida, dataLocalDeIso, normalizarQuebras } from './linhasBase'

/** Limites do histórico e da leitura (G4, RNF-04.2 e seção 08 do plano). */
export const LIMITES_FECHAMENTO = {
  /** 104 fechamentos por obra: 2 anos semanais (RNF-04.2). */
  fechamentos: 104,
  /** Retificações por obra (opinião; G4). */
  retificacoes: 52,
  /** Folhas por detalhe (e `quantidadeTarefas`). */
  tarefas: 20_000,
  pacotes: 500,
  /** Tamanho do texto do detalhe, medido ANTES do `JSON.parse`. */
  detalheChars: 8 * 1024 * 1024,
  id: 64,
  /** Código de EAP (WBS): o estado e o importador não limitam o tamanho; acima disto o fechamento é recusado ANTES de gravar (rede de segurança). */
  wbs: 200,
  autor: 120,
  observacao: 500,
  motivo: 500,
  nomePacote: 200,
  valorMax: 1e12,
} as const

/** Diferença aceita entre os totais do cabeçalho e a soma do detalhe (R$). */
const TOLERANCIA_SOMA = 0.01
/** Folga em minutos dentro de ±50 anos. */
const FOLGA_MAX_MIN = TETO_DIAS * MINUTOS_NO_DIA_CORRIDO

// eslint-disable-next-line no-control-regex -- é justamente o que se quer recusar
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/
const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const eInteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const dinheiro = (v: unknown): v is number => eNumero(v) && v >= 0 && v <= LIMITES_FECHAMENTO.valorMax
const textoCurto = (v: unknown, max: number, minimo = 1): v is string => typeof v === 'string' && v.length >= minimo && v.length <= max && !CONTROLE.test(v)
/** Texto de várias linhas (observação e motivo): a quebra de linha `\n` vale; os outros caracteres de controle não. */
const textoLongo = (v: unknown, max: number, minimo = 1): v is string => typeof v === 'string' && v.length >= minimo && v.length <= max && !CONTROLE_SEM_QUEBRA.test(v)
/** Texto vindo da obra (nome do pacote, código de EAP) vira texto sem caractere de controle: o TAB de um .xml não pode tornar o registro ilegível. */
// eslint-disable-next-line no-control-regex -- é justamente o que se quer trocar
export const limparControles = (s: string): string => s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')

export const dmy = (iso: string): string => iso.split('-').reverse().join('/')

/** Data de hoje no fuso do navegador (`yyyy-mm-dd`). */
export function hojeLocalIso(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------------------------------------------------------- totais

/** SPI, CPI e EAC sem o `safeDiv` (D-11): sem divisor valem `null`, nunca um "1,00" falso congelado num registro imutável. */
export function indicesDoFechamento(bac: number, pv: number, ev: number, ac: number): Pick<TotaisFechamento, 'spi' | 'cpi' | 'eac'> {
  return {
    spi: pv > 0 ? ev / pv : null, // SPI = EV ÷ PV
    cpi: ac > 0 ? ev / ac : null, // CPI = EV ÷ AC
    eac: ev > 0 && ac > 0 ? (bac * ac) / ev : null, // EAC = BAC ÷ CPI = BAC × AC ÷ EV
  }
}

export interface EntradaCaptura {
  obraId: string
  id: string
  sequencia: number
  dataStatus: string
  fechadoEm: string
  autor?: string
  observacao?: string
  /** Linha de base do valor agregado dos totais e a data em que ela foi salva. */
  linhaBase: number
  linhaBaseSalvaEm?: string
  versaoPremissas: number
  esquemaObra: number
  /** Tarefas do valor agregado (projeção da LB; cópia simples, não o proxy reativo). */
  tarefas: Task[]
  /** Calendários do PV (sem as exceções úteis). */
  cals: CalendariosCompilados
  schedule: ScheduleResult
  atrasoDiasUteis: number
}

/**
 * Captura o fechamento (D-10): por folha, % físico, custo real, BAC, PV, datas reais e previstas, folga e se é crítica; os totais e os totais
 * por pacote de 1º nível. PV, EV, AC e BAC saem do mesmo `computeEvm` da tela, então os números com divisor são idênticos (FE-1).
 */
export function capturarFechamento(e: EntradaCaptura): { cabecalho: CabecalhoFechamento; detalhe: DetalheFechamento } {
  const folhas = e.tarefas.filter((t) => !t.isSummary)
  const tarefas: TarefaFechamento[] = folhas.map((t) => {
    const s = e.schedule.byUid.get(t.uid)
    return [
      t.uid,
      limparControles(t.wbs),
      t.percentComplete,
      t.actualCost,
      t.bac,
      t.bac * plannedFraction(t, e.cals, e.dataStatus),
      t.actualStart ?? null,
      t.actualFinish ?? null,
      s?.start ?? e.dataStatus,
      s?.finish ?? e.dataStatus,
      s?.folgaTotalMin ?? 0,
      s?.critical ? 1 : 0,
    ]
  })
  const evm = computeEvm(e.tarefas, e.cals, e.dataStatus)
  const totais: TotaisFechamento = {
    bac: evm.bac,
    pv: evm.pv,
    ev: evm.ev,
    ac: evm.ac,
    ...indicesDoFechamento(evm.bac, evm.pv, evm.ev, evm.ac),
    entregaPrevista: e.schedule.projectFinish,
    atrasoDiasUteis: e.atrasoDiasUteis,
  }
  const porPacote: PacoteFechamento[] = computePackageEvm(e.tarefas, e.cals, e.dataStatus).map((p) => ({
    wbs: limparControles(p.wbs),
    nome: limparControles(p.name).slice(0, LIMITES_FECHAMENTO.nomePacote),
    bac: p.bac,
    pv: p.pv,
    ev: p.ev,
    ac: p.ac,
  }))
  const cabecalho: CabecalhoFechamento = {
    versaoFormato: VERSAO_FORMATO_FECHAMENTO,
    id: e.id,
    obraId: e.obraId,
    sequencia: e.sequencia,
    tipo: 'fechamento',
    dataStatus: e.dataStatus,
    fechadoEm: e.fechadoEm,
    ...(e.autor ? { autor: e.autor } : {}),
    ...(e.observacao ? { observacao: e.observacao } : {}),
    linhaBase: e.linhaBase,
    ...(e.linhaBaseSalvaEm ? { linhaBaseSalvaEm: e.linhaBaseSalvaEm } : {}),
    versaoPremissas: e.versaoPremissas,
    esquemaObra: e.esquemaObra,
    totais,
    porPacote,
    quantidadeTarefas: tarefas.length,
  }
  return { cabecalho, detalhe: { versaoFormato: VERSAO_FORMATO_FECHAMENTO, id: e.id, tarefas } }
}

export function serializarDetalhe(d: DetalheFechamento): RegistroDetalheFechamento {
  return { id: d.id, json: JSON.stringify(d) }
}

// -------------------------------------------------------------------------------------------------------------- efetivos e regras

/** O fechamento efetivo de cada data: a retificação de maior `sequencia` (ou o original), em ordem de data. */
/** O registro mais novo: maior `sequencia`; sequência repetida (duas abas gravando ao mesmo tempo) desempata por `fechadoEm` e depois por `id`, sempre do mesmo jeito. */
const maisNovo = (a: CabecalhoFechamento, b: CabecalhoFechamento): boolean =>
  a.sequencia !== b.sequencia ? a.sequencia > b.sequencia : a.fechadoEm !== b.fechadoEm ? a.fechadoEm > b.fechadoEm : a.id > b.id

export function efetivos(cabecalhos: readonly CabecalhoFechamento[]): CabecalhoFechamento[] {
  const porData = new Map<string, CabecalhoFechamento>()
  for (const c of cabecalhos) {
    const atual = porData.get(c.dataStatus)
    if (!atual || maisNovo(c, atual)) porData.set(c.dataStatus, c)
  }
  return [...porData.values()].sort((a, b) => (a.dataStatus < b.dataStatus ? -1 : a.dataStatus > b.dataStatus ? 1 : 0))
}

export const proximaSequencia = (cabecalhos: readonly CabecalhoFechamento[]): number => cabecalhos.reduce((m, c) => Math.max(m, c.sequencia), 0) + 1

const msgLimite = (n: number, o: string) => `Limite de ${n} ${o} desta obra atingido. Exporte o histórico (JSON) e registre a pendência com a equipe responsável pelo servidor (SPEC-01).`

/**
 * Regras do fechamento (D-12, D-18): cabeçalhos todos legíveis (senão a sequência e o limite não são garantidos), ao menos uma folha, data
 * posterior à do último fechamento efetivo e o limite de 104. `undefined` = pode fechar.
 */
export function erroAoFechar(c: { cabecalhos: readonly CabecalhoFechamento[]; ilegiveis: number; dataStatus: string; folhas: number }): string | undefined {
  if (c.ilegiveis > 0) return `Há ${c.ilegiveis} fechamento(s) ilegível(is) nesta obra: novo fechamento bloqueado até resolver (os registros foram mantidos sem alteração).`
  if (c.folhas < 1) return 'A obra precisa de ao menos uma tarefa para fechar a data de status.'
  const ef = efetivos(c.cabecalhos)
  const ultimo = ef.at(-1)
  if (ultimo && ultimo.dataStatus === c.dataStatus) return `Já existe fechamento em ${dmy(c.dataStatus)}: use 'Retificar'.`
  if (ultimo && c.dataStatus < ultimo.dataStatus) return `A data de status não pode ser anterior ao último fechamento (${dmy(ultimo.dataStatus)}). Para corrigir um fechamento, use 'Retificar'.`
  if (c.cabecalhos.filter((h) => h.tipo === 'fechamento').length >= LIMITES_FECHAMENTO.fechamentos) return msgLimite(LIMITES_FECHAMENTO.fechamentos, 'fechamentos')
  return undefined
}

/** A data de status não volta antes do último fechamento efetivo (D-13). */
export function erroDeDataDeStatus(nova: string, cabecalhos: readonly CabecalhoFechamento[]): string | undefined {
  const ultimo = efetivos(cabecalhos).at(-1)
  return ultimo && nova < ultimo.dataStatus ? `A data de status não pode ser anterior ao último fechamento (${dmy(ultimo.dataStatus)}). Para corrigir um fechamento, use 'Retificar'.` : undefined
}

/** A data de início não passa da data do 1º fechamento (D-13). */
export function erroDeDataDeInicio(nova: string, cabecalhos: readonly CabecalhoFechamento[]): string | undefined {
  const primeiro = efetivos(cabecalhos)[0]
  return primeiro && nova > primeiro.dataStatus ? `A data de início não pode ser posterior à data do primeiro fechamento (${dmy(primeiro.dataStatus)}).` : undefined
}

/** Avisos ao fechar, sem bloquear (E-8). */
export function avisosAoFechar(p: { relatosPendentes: number; dataStatus: string; hoje: string }): string[] {
  const avisos: string[] = []
  if (p.relatosPendentes > 0) avisos.push(`Há ${p.relatosPendentes} relato(s) de campo pendente(s) de aprovação: o fechamento não inclui essas medições.`)
  if (p.dataStatus > p.hoje) avisos.push(`A data de status (${dmy(p.dataStatus)}) é posterior a hoje.`)
  return avisos
}

// ------------------------------------------------------------------------------------------------------------------- retificação

export interface AlteracaoTarefa {
  uid: number
  pct?: number
  custoReal?: number
}

export interface EntradaRetificacao {
  /** O fechamento efetivo da data (original ou a última retificação), com o detalhe. */
  base: { cabecalho: CabecalhoFechamento; detalhe: DetalheFechamento }
  /** O fechamento efetivo da data seguinte, se houver (só para os avisos da E-5). */
  seguinte?: { cabecalho: CabecalhoFechamento; detalhe: DetalheFechamento }
  alteracoes: readonly AlteracaoTarefa[]
  motivo: string
  id: string
  sequencia: number
  fechadoEm: string
  autor?: string
  /** Todos os cabeçalhos da obra (para o limite de retificações). */
  cabecalhos: readonly CabecalhoFechamento[]
}

export type ResultadoRetificacao = { ok: true; cabecalho: CabecalhoFechamento; detalhe: DetalheFechamento; avisos: string[] } | { ok: false; erro: string }

const pertenceAoPacote = (wbs: string, pacote: string) => wbs === pacote || wbs.startsWith(pacote + '.')

/**
 * Retificação (D-15): copia o fechamento efetivo e muda só o % físico e o custo real das tarefas escolhidas. EV, AC, SPI, CPI, EAC e o EV/AC por
 * pacote são recalculados; PV, BAC, entrega, atraso, datas previstas, folgas e a linha de base ficam os do original. Sempre aponta para a raiz.
 * Avisos sem bloquear (E-5): EV retificado acima do EV do fechamento seguinte, e % de tarefa acima do dela no seguinte.
 */
export function retificar(e: EntradaRetificacao): ResultadoRetificacao {
  const motivo = normalizarQuebras(e.motivo).trim()
  if (!motivo) return { ok: false, erro: 'Informe o motivo da retificação.' }
  if (motivo.length > LIMITES_FECHAMENTO.motivo) return { ok: false, erro: `O motivo da retificação passa de ${LIMITES_FECHAMENTO.motivo} caracteres.` }
  if (CONTROLE_SEM_QUEBRA.test(motivo) || CONTROLE.test(e.autor ?? '')) return { ok: false, erro: 'Os textos não podem ter caracteres de controle.' }
  if (e.autor && e.autor.length > LIMITES_FECHAMENTO.autor) return { ok: false, erro: `O autor passa de ${LIMITES_FECHAMENTO.autor} caracteres.` }
  if (e.cabecalhos.filter((h) => h.tipo === 'retificacao').length >= LIMITES_FECHAMENTO.retificacoes) return { ok: false, erro: msgLimite(LIMITES_FECHAMENTO.retificacoes, 'retificações') }
  if (!e.alteracoes.length) return { ok: false, erro: 'Escolha ao menos uma tarefa para retificar.' }

  const porUid = new Map(e.base.detalhe.tarefas.map((t) => [t[POS.uid], t]))
  const novas = new Map<number, { pct: number; custoReal: number }>()
  for (const a of e.alteracoes) {
    const t = porUid.get(a.uid)
    if (!t) return { ok: false, erro: 'Tarefa não encontrada neste fechamento.' }
    const pct = a.pct ?? t[POS.pct]
    const custoReal = a.custoReal ?? t[POS.custoReal]
    if (!eNumero(pct) || pct < 0 || pct > 100) return { ok: false, erro: 'O % físico precisa estar entre 0 e 100.' }
    if (!dinheiro(custoReal)) return { ok: false, erro: 'O custo real precisa ser um valor em R$ de 0 a 1 trilhão.' }
    novas.set(a.uid, { pct, custoReal })
  }
  const mudou = [...novas].some(([uid, n]) => n.pct !== porUid.get(uid)![POS.pct] || n.custoReal !== porUid.get(uid)![POS.custoReal])
  if (!mudou) return { ok: false, erro: 'Nenhuma alteração: o % físico e o custo real escolhidos são os do fechamento.' }

  const tarefas: TarefaFechamento[] = e.base.detalhe.tarefas.map((t) => {
    const n = novas.get(t[POS.uid])
    return n ? [t[0], t[1], n.pct, n.custoReal, t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11]] : t
  })
  let ev = 0
  let ac = 0
  for (const t of tarefas) {
    ev += (t[POS.bac] * t[POS.pct]) / 100
    ac += t[POS.custoReal]
  }
  const o = e.base.cabecalho
  const totais: TotaisFechamento = { ...o.totais, ev, ac, ...indicesDoFechamento(o.totais.bac, o.totais.pv, ev, ac) }
  const porPacote: PacoteFechamento[] = o.porPacote.map((p) => {
    let pev = 0
    let pac = 0
    for (const t of tarefas) {
      if (!pertenceAoPacote(t[POS.wbs], p.wbs)) continue
      pev += (t[POS.bac] * t[POS.pct]) / 100
      pac += t[POS.custoReal]
    }
    return { ...p, ev: pev, ac: pac }
  })
  const cabecalho: CabecalhoFechamento = {
    versaoFormato: VERSAO_FORMATO_FECHAMENTO,
    id: e.id,
    obraId: o.obraId,
    sequencia: e.sequencia,
    tipo: 'retificacao',
    retificaId: o.retificaId ?? o.id,
    dataStatus: o.dataStatus,
    fechadoEm: e.fechadoEm,
    ...(e.autor ? { autor: e.autor } : {}),
    motivo,
    linhaBase: o.linhaBase,
    ...(o.linhaBaseSalvaEm ? { linhaBaseSalvaEm: o.linhaBaseSalvaEm } : {}),
    versaoPremissas: o.versaoPremissas,
    esquemaObra: o.esquemaObra,
    totais,
    porPacote,
    quantidadeTarefas: tarefas.length,
  }
  const avisos: string[] = []
  const seg = e.seguinte
  if (seg) {
    if (ev - seg.cabecalho.totais.ev > 0.005) {
      avisos.push(`O EV retificado (${fmtBRLCents(ev)}) fica acima do EV do fechamento de ${dmy(seg.cabecalho.dataStatus)} (${fmtBRLCents(seg.cabecalho.totais.ev)}): confira os fechamentos seguintes.`)
    }
    const pctSeguinte = new Map(seg.detalhe.tarefas.map((t) => [t[POS.uid], t[POS.pct]]))
    const acima = tarefas.filter((t) => {
      const s = pctSeguinte.get(t[POS.uid])
      return s !== undefined && t[POS.pct] > s
    }).length
    if (acima > 0) avisos.push(`${acima} tarefa(s) com % acima do fechamento seguinte.`)
  }
  return { ok: true, cabecalho, detalhe: { versaoFormato: VERSAO_FORMATO_FECHAMENTO, id: e.id, tarefas }, avisos }
}

// --------------------------------------------------------------------------------------------------- validação do que é lido (D-24)

function totaisValidos(v: unknown): TotaisFechamento | undefined {
  if (!eObjeto(v)) return undefined
  const { bac, pv, ev, ac, spi, cpi, eac, entregaPrevista, atrasoDiasUteis } = v
  if (!dinheiro(bac) || !dinheiro(pv) || !dinheiro(ev) || !dinheiro(ac)) return undefined
  for (const i of [spi, cpi, eac]) if (i !== null && !dinheiro(i)) return undefined // finitos ≥ 0 ou null
  if (!dataIsoValida(entregaPrevista)) return undefined
  if (!eInteiro(atrasoDiasUteis) || Math.abs(atrasoDiasUteis) > 1e5) return undefined
  return { bac, pv, ev, ac, spi: spi as number | null, cpi: cpi as number | null, eac: eac as number | null, entregaPrevista, atrasoDiasUteis }
}

function pacotesValidos(v: unknown): PacoteFechamento[] | undefined {
  if (!Array.isArray(v) || v.length > LIMITES_FECHAMENTO.pacotes) return undefined
  const out: PacoteFechamento[] = []
  for (const p of v) {
    if (!eObjeto(p) || !textoCurto(p.wbs, LIMITES_FECHAMENTO.wbs) || !textoCurto(p.nome, LIMITES_FECHAMENTO.nomePacote, 0)) return undefined
    if (!dinheiro(p.bac) || !dinheiro(p.pv) || !dinheiro(p.ev) || !dinheiro(p.ac)) return undefined
    out.push({ wbs: p.wbs, nome: p.nome, bac: p.bac, pv: p.pv, ev: p.ev, ac: p.ac })
  }
  return out
}

/**
 * Valida um cabeçalho lido do IndexedDB e o RECONSTRÓI só com os campos conhecidos (`__proto__` e chaves extras não passam). `undefined` = ilegível:
 * formato diferente de 1 (um formato mais novo nunca é sobrescrito), ids de até 64, datas ISO, `sequencia` inteira ≥ 1, `linhaBase` de 0 a 10, R$ finitos de
 * 0 a 1e12, SPI/CPI/EAC finitos ≥ 0 ou `null`, `porPacote` ≤ 500 e `quantidadeTarefas` ≤ 20.000. `obraId` confere com a obra, se informada.
 */
export function validarCabecalhoFechamento(v: unknown, obraId?: string): CabecalhoFechamento | undefined {
  if (!eObjeto(v)) return undefined
  if (v.versaoFormato !== VERSAO_FORMATO_FECHAMENTO) return undefined
  if (!textoCurto(v.id, LIMITES_FECHAMENTO.id) || !textoCurto(v.obraId, LIMITES_FECHAMENTO.id)) return undefined
  if (obraId !== undefined && v.obraId !== obraId) return undefined
  if (!eInteiro(v.sequencia) || v.sequencia < 1 || v.sequencia > 1e6) return undefined
  if (typeof v.tipo !== 'string' || !(TIPOS_FECHAMENTO as readonly string[]).includes(v.tipo)) return undefined
  const retificacao = v.tipo === 'retificacao'
  if (retificacao && !textoCurto(v.retificaId, LIMITES_FECHAMENTO.id)) return undefined
  if (!retificacao && v.retificaId !== undefined) return undefined
  if (!dataIsoValida(v.dataStatus) || !dataHoraIsoValida(v.fechadoEm)) return undefined
  if (v.autor !== undefined && !textoCurto(v.autor, LIMITES_FECHAMENTO.autor, 0)) return undefined
  if (v.observacao !== undefined && !textoLongo(v.observacao, LIMITES_FECHAMENTO.observacao, 0)) return undefined
  if (retificacao ? !textoLongo(v.motivo, LIMITES_FECHAMENTO.motivo) : v.motivo !== undefined && !textoLongo(v.motivo, LIMITES_FECHAMENTO.motivo, 0)) return undefined
  if (!eInteiro(v.linhaBase) || v.linhaBase < 0 || v.linhaBase > NUMERO_MAX_LINHA_BASE) return undefined
  if (v.linhaBaseSalvaEm !== undefined && !dataHoraIsoValida(v.linhaBaseSalvaEm)) return undefined
  if (!eInteiro(v.versaoPremissas) || v.versaoPremissas < 0 || v.versaoPremissas > 1e6) return undefined
  if (!eInteiro(v.esquemaObra) || v.esquemaObra < 1 || v.esquemaObra > 1e3) return undefined
  const totais = totaisValidos(v.totais)
  const porPacote = pacotesValidos(v.porPacote)
  if (!totais || !porPacote) return undefined
  if (!eInteiro(v.quantidadeTarefas) || v.quantidadeTarefas < 0 || v.quantidadeTarefas > LIMITES_FECHAMENTO.tarefas) return undefined
  return {
    versaoFormato: VERSAO_FORMATO_FECHAMENTO,
    id: v.id,
    obraId: v.obraId as string,
    sequencia: v.sequencia,
    tipo: v.tipo as CabecalhoFechamento['tipo'],
    ...(retificacao ? { retificaId: v.retificaId as string } : {}),
    dataStatus: v.dataStatus,
    fechadoEm: v.fechadoEm,
    ...(v.autor !== undefined ? { autor: v.autor as string } : {}),
    ...(v.observacao !== undefined ? { observacao: v.observacao as string } : {}),
    ...(v.motivo !== undefined ? { motivo: v.motivo as string } : {}),
    linhaBase: v.linhaBase,
    ...(v.linhaBaseSalvaEm !== undefined ? { linhaBaseSalvaEm: v.linhaBaseSalvaEm } : {}),
    versaoPremissas: v.versaoPremissas,
    esquemaObra: v.esquemaObra,
    totais,
    porPacote,
    quantidadeTarefas: v.quantidadeTarefas,
  }
}

/**
 * Valida a lista de cabeçalhos da obra: inválidos saem; `id` e `sequencia` repetidos também (vale o primeiro). Devolve os legíveis e quantos ficaram de fora.
 */
export function validarCabecalhosFechamento(brutos: readonly unknown[], obraId: string): { cabecalhos: CabecalhoFechamento[]; ilegiveis: number; repetidas: number } {
  const ids = new Set<string>()
  const cabecalhos: CabecalhoFechamento[] = []
  for (const b of brutos) {
    const c = validarCabecalhoFechamento(b, obraId)
    if (!c || ids.has(c.id)) continue
    ids.add(c.id)
    cabecalhos.push(c)
  }
  // Sequência repetida (duas abas gravaram ao mesmo tempo) NÃO torna nenhum dos dois ilegível: o efetivo sai do desempate (`fechadoEm`, depois `id`) e a tela avisa
  const contagem = new Map<number, number>()
  for (const c of cabecalhos) contagem.set(c.sequencia, (contagem.get(c.sequencia) ?? 0) + 1)
  const repetidas = cabecalhos.filter((c) => (contagem.get(c.sequencia) ?? 0) > 1).length
  const ordem = (a: CabecalhoFechamento, b: CabecalhoFechamento) => (a.sequencia !== b.sequencia ? a.sequencia - b.sequencia : a.fechadoEm !== b.fechadoEm ? (a.fechadoEm < b.fechadoEm ? -1 : 1) : a.id < b.id ? -1 : 1)
  return { cabecalhos: cabecalhos.sort(ordem), ilegiveis: brutos.length - cabecalhos.length, repetidas }
}

/** Aviso das sequências repetidas (gravações em paralelo): nenhum registro é ilegível; o efetivo é o gravado por último. */
export const avisoDeRepetidas = (repetidas: number): string =>
  `Há fechamentos gravados em paralelo (${repetidas} registro(s) com a mesma sequência, por exemplo de duas abas): o efetivo de cada data é o gravado por último. Confira a lista.`

/**
 * Rede de segurança antes de gravar (SEG-1): o registro que a captura ou a retificação montou precisa passar pela MESMA validação de leitura que o abrirá depois.
 * Se não passar (por exemplo, um código de EAP com mais de 200 caracteres), o fechamento é recusado com esta mensagem e nada é gravado.
 */
export function erroDeGravacaoDoRegistro(cabecalho: CabecalhoFechamento, detalhe: RegistroDetalheFechamento): string | undefined {
  const lido = validarCabecalhoFechamento(JSON.parse(JSON.stringify(cabecalho)), cabecalho.obraId)
  if (lido && lerDetalheFechamento(detalhe, lido)) return undefined
  // Diz QUAL tarefa causa a recusa (pelo UID): o usuário precisa saber o que corrigir no MS Project
  const culpada = tarefaQueNaoPassa(detalhe)
  // Texto livre do arquivo (o WBS) não entra na mensagem: só o UID e o TAMANHO do código (regra de msproject-mspdi.md)
  const onde = !culpada
    ? 'algum dado da obra '
    : culpada.tamanhoWbs > LIMITES_FECHAMENTO.wbs
      ? `o registro da tarefa UID ${culpada.uid} (código de EAP com ${culpada.tamanhoWbs} caracteres) `
      : `o registro da tarefa UID ${culpada.uid} `
  return `Este fechamento não pode ser gravado: ${onde}não passa na validação de leitura (por exemplo, um código de EAP com mais de ${LIMITES_FECHAMENTO.wbs} caracteres) e o registro ficaria ilegível. Corrija o dado (por exemplo, encurte o WBS no MS Project e importe de novo) e tente de novo. Nada foi gravado.`
}

/** A 1ª tarefa do detalhe cuja tupla não passa na validação de leitura (UID e tamanho do WBS para a mensagem), se houver. */
function tarefaQueNaoPassa(detalhe: RegistroDetalheFechamento): { uid: number; tamanhoWbs: number } | undefined {
  try {
    const bruto: unknown = JSON.parse(detalhe.json)
    const tarefas = eObjeto(bruto) && Array.isArray(bruto.tarefas) ? bruto.tarefas : []
    for (const t of tarefas) {
      if (tuplaValida(t)) continue
      if (Array.isArray(t) && eInteiro(t[0]) && typeof t[1] === 'string') return { uid: t[0], tamanhoWbs: t[1].length }
    }
  } catch {
    /* detalhe que nem é JSON: sem tarefa para apontar */
  }
  return undefined
}

/** Quantas tarefas têm código de EAP acima do limite do fechamento (aviso na importação: nenhum fechamento será gravado enquanto existirem). */
export const tarefasComWbsLongo = (tasks: readonly { wbs: string }[]): number => tasks.filter((t) => t.wbs.length > LIMITES_FECHAMENTO.wbs).length

/**
 * Trecho da nota de um fechamento sobre a linha de base dele ("fechado contra a LB1 de 25/10/2026; ..."): a mesma frase na lista e nas notas da curva.
 * `diferente` = a LB de hoje não é a do fechamento (sobrescrita, trocada por importação ou inexistente).
 */
export function trechoDaLinhaBaseDoFechamento(c: { linhaBase: number; linhaBaseSalvaEm?: string }, infos: readonly { numero: number; salvaEm?: string }[]): { texto: string; diferente: boolean } {
  const atual = infos.find((i) => i.numero === c.linhaBase)
  // Sobrescrita, trocada por importação (a LB atual sem data de gravação conta como diferente) ou que não existe mais: o PV de hoje não é o do fechamento
  const diferente = c.linhaBaseSalvaEm !== undefined && atual?.salvaEm !== c.linhaBaseSalvaEm
  const quando = c.linhaBaseSalvaEm ? ` de ${dataLocalDeIso(c.linhaBaseSalvaEm)}` : ''
  const depois = !diferente
    ? ''
    : !atual
      ? `; a LB${c.linhaBase} do fechamento não existe mais`
      : atual.salvaEm
        ? `; a LB${c.linhaBase} atual é de ${dataLocalDeIso(atual.salvaEm)}`
        : `; a LB${c.linhaBase} atual não é mais a mesma (foi trocada)`
  return { texto: `fechado contra a LB${c.linhaBase}${quando}${depois}`, diferente }
}

function tuplaValida(t: unknown): TarefaFechamento | undefined {
  if (!Array.isArray(t) || t.length !== 12) return undefined
  const [uid, wbs, pct, custoReal, bac, pv, inicioReal, terminoReal, inicioPrevisto, terminoPrevisto, folga, critica] = t as unknown[]
  if (!eInteiro(uid) || !textoCurto(wbs, LIMITES_FECHAMENTO.wbs)) return undefined
  if (!eNumero(pct) || pct < 0 || pct > 100) return undefined
  if (!dinheiro(custoReal) || !dinheiro(bac) || !dinheiro(pv)) return undefined
  if (inicioReal !== null && !dataIsoValida(inicioReal)) return undefined
  if (terminoReal !== null && !dataIsoValida(terminoReal)) return undefined
  if (!dataIsoValida(inicioPrevisto) || !dataIsoValida(terminoPrevisto)) return undefined
  if (!eInteiro(folga) || Math.abs(folga) > FOLGA_MAX_MIN) return undefined
  if (critica !== 0 && critica !== 1) return undefined
  return [uid, wbs, pct, custoReal, bac, pv, inicioReal as string | null, terminoReal as string | null, inicioPrevisto, terminoPrevisto, folga, critica]
}

/**
 * Valida o detalhe lido do IndexedDB contra o cabeçalho: o texto não passa de 8 MiB (medido ANTES do `JSON.parse`), mesmo `id`, `quantidadeTarefas` igual,
 * tuplas de 12 posições com os tipos conferidos e `uid` único, e BAC, PV, EV e AC somados a até R$ 0,01 dos totais. Qualquer divergência: `undefined`.
 */
export function lerDetalheFechamento(registro: unknown, cabecalho: CabecalhoFechamento): DetalheFechamento | undefined {
  if (!eObjeto(registro) || registro.id !== cabecalho.id || typeof registro.json !== 'string') return undefined
  if (registro.json.length > LIMITES_FECHAMENTO.detalheChars) return undefined
  let bruto: unknown
  try {
    bruto = JSON.parse(registro.json)
  } catch {
    return undefined
  }
  if (!eObjeto(bruto) || bruto.versaoFormato !== VERSAO_FORMATO_FECHAMENTO || bruto.id !== cabecalho.id) return undefined
  if (!Array.isArray(bruto.tarefas) || bruto.tarefas.length !== cabecalho.quantidadeTarefas || bruto.tarefas.length > LIMITES_FECHAMENTO.tarefas) return undefined
  const uids = new Set<number>()
  const tarefas: TarefaFechamento[] = []
  let bac = 0
  let pv = 0
  let ev = 0
  let ac = 0
  for (const b of bruto.tarefas) {
    const t = tuplaValida(b)
    if (!t || uids.has(t[POS.uid])) return undefined
    uids.add(t[POS.uid])
    tarefas.push(t)
    bac += t[POS.bac]
    pv += t[POS.pv]
    ev += (t[POS.bac] * t[POS.pct]) / 100
    ac += t[POS.custoReal]
  }
  const t = cabecalho.totais
  if (Math.abs(bac - t.bac) > TOLERANCIA_SOMA || Math.abs(pv - t.pv) > TOLERANCIA_SOMA || Math.abs(ev - t.ev) > TOLERANCIA_SOMA || Math.abs(ac - t.ac) > TOLERANCIA_SOMA) return undefined
  return { versaoFormato: VERSAO_FORMATO_FECHAMENTO, id: cabecalho.id, tarefas }
}

// -------------------------------------------------------------------------------------------------------------------------- série

export interface PontoSerieFechamento {
  fechamentoId: string
  sequencia: number
  tipo: CabecalhoFechamento['tipo']
  data: string
  /** `null` sem divisor: fica de fora do gráfico de índices. */
  spi: number | null
  cpi: number | null
  entregaPrevista: string
  atrasoDiasUteis: number
}

/** Série dos fechamentos efetivos (RF-04.4): SPI e CPI gravados (os nulos ficam de fora dos gráficos), entrega prevista e atraso. */
export function serieDosFechamentos(ef: readonly CabecalhoFechamento[]): PontoSerieFechamento[] {
  return ef.map((c) => ({
    fechamentoId: c.id,
    sequencia: c.sequencia,
    tipo: c.tipo,
    data: c.dataStatus,
    spi: c.totais.spi,
    cpi: c.totais.cpi,
    entregaPrevista: c.totais.entregaPrevista,
    atrasoDiasUteis: c.totais.atrasoDiasUteis,
  }))
}

/** Autor (até 120) e observação (até 500) digitados ao fechar: sem caractere de controle. `undefined` = válido. */
export function erroDeTextosFechamento(t: { autor?: string; observacao?: string }): string | undefined {
  const autor = t.autor ?? ''
  const observacao = normalizarQuebras(t.observacao ?? '')
  if (autor.length > LIMITES_FECHAMENTO.autor) return `O autor passa de ${LIMITES_FECHAMENTO.autor} caracteres.`
  if (observacao.length > LIMITES_FECHAMENTO.observacao) return `A observação passa de ${LIMITES_FECHAMENTO.observacao} caracteres.`
  if (CONTROLE.test(autor) || CONTROLE_SEM_QUEBRA.test(observacao)) return 'Os textos não podem ter caracteres de controle.'
  return undefined
}

/**
 * Notas sobre a linha de base dos fechamentos (E-9): "fechado contra a LB0 de dd/mm/aaaa" quando a LB do fechamento difere da LB do valor agregado em vigor
 * (o PV da curva é o da LB em vigor, mas o EV e o AC são os gravados) ou quando ela foi sobrescrita depois.
 */
export function notasDaLinhaBaseDosFechamentos(
  efetivosDaObra: readonly CabecalhoFechamento[],
  linhaBaseAtiva: number,
  infos: readonly { numero: number; salvaEm?: string }[],
): string[] {
  const notas: string[] = []
  for (const c of efetivosDaObra) {
    const { texto, diferente } = trechoDaLinhaBaseDoFechamento(c, infos)
    if (c.linhaBase === linhaBaseAtiva && !diferente) continue
    notas.push(`Fechamento de ${dmy(c.dataStatus)}: ${texto}.${c.linhaBase !== linhaBaseAtiva ? ` O PV da curva é o da LB${linhaBaseAtiva}.` : ''}`)
  }
  return notas
}
