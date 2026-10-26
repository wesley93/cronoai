// Linhas de base LB0 a LB10 (ciclo 00007, SPEC-04): projeção para o valor agregado, cópia do cronograma, rollup, saneamento e rótulos.
// Funções puras. A LB0 continua nos campos `baselineStart/Finish/DuracaoMin` da tarefa e no `bac` (D-1); as LB1 a LB10 ficam em `Task.linhasBase`.
import type { DadosLinhaBase, LinhaBaseInfo, LinhasBaseDaTarefa, ScheduleResult, Task } from '@/types/domain'
import { ORIGENS_LINHA_BASE } from '@/types/domain'
import { TETO_DIAS, addCalendarDays, parseISO, toISO, type WorkCalendar } from './calendar'

export const NUMERO_MAX_LINHA_BASE = 10
/** Limites dos textos digitados pelo usuário (D-4). */
export const LIMITES_LINHA_BASE = { nome: 60, motivo: 500, autor: 120 } as const
/** Duração máxima de uma linha de base: o horizonte de 50 anos do motor, em minutos de relógio. */
const MAX_DURACAO_LB_MIN = TETO_DIAS * 1440
const MAX_CUSTO = 1e12

const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
// eslint-disable-next-line no-control-regex -- é justamente o que se quer recusar
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/

/** Data ISO `yyyy-mm-dd` que existe no calendário. */
export function dataIsoValida(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  try {
    return toISO(parseISO(v)) === v
  } catch {
    return false
  }
}

/** Data-hora ISO (`2026-10-25T15:00:00.000Z` ou sem fração), com limite de tamanho. */
export function dataHoraIsoValida(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(v) && !Number.isNaN(Date.parse(v))
}

/** `dd/mm/aaaa` no fuso do navegador a partir de uma data-hora ISO (a hora de gravação vira a data que o usuário viu). */
export function dataLocalDeIso(iso: string): string {
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}/${mm}/${d.getFullYear()}`
}

/** "LB1 — Replanejamento após chuvas (25/10/2026)": o rótulo da linha de base na tela e no log. */
export function rotuloLinhaBase(info: LinhaBaseInfo): string {
  return `LB${info.numero} — ${info.nome}${info.salvaEm && dataHoraIsoValida(info.salvaEm) ? ` (${dataLocalDeIso(info.salvaEm)})` : ''}`
}

/** Dados de uma linha de base de uma tarefa. LB0: os campos atuais, com o custo = `bac`; LB n: o mapa da tarefa. */
export function dadosDaLinhaBase(t: Task, n: number): DadosLinhaBase | undefined {
  if (n === 0) {
    if (t.baselineStart === undefined && t.baselineFinish === undefined && t.baselineDuracaoMin === undefined) return undefined
    return { inicio: t.baselineStart, termino: t.baselineFinish, duracaoMin: t.baselineDuracaoMin, custo: t.bac }
  }
  return t.linhasBase?.[String(n)]
}

/**
 * Projeção da linha de base do valor agregado (D-6, G5 = b, G6 = a): tarefas em que `baselineStart/Finish/DuracaoMin` são os da LB n e
 * `bac` = custo da LB n. Sem a LB n (ou sem custo nela), o BAC é 0 e o PV e o EV da tarefa também (D-8); o custo real continua contando.
 * Só para o PV, EV, BAC e derivados: atraso, variações, cenários, DLP, Gantt e EAP continuam com as tarefas originais (LB0).
 * Com `n = 0` devolve o MESMO array.
 */
export function projetarLinhaBase(tasks: Task[], n: number): Task[] {
  if (n === 0) return tasks
  const chave = String(n)
  return tasks.map((t) => {
    const d = t.linhasBase?.[chave]
    return { ...t, baselineStart: d?.inicio, baselineFinish: d?.termino, baselineDuracaoMin: d?.duracaoMin, bac: t.isSummary ? t.bac : (d?.custo ?? 0) }
  })
}

/** Folhas sem custo na linha de base n (a projeção as zera): base do aviso da D-8. */
export function tarefasSemLinhaBase(tasks: Task[], n: number): number {
  if (n === 0) return 0
  const chave = String(n)
  return tasks.filter((t) => !t.isSummary && t.linhasBase?.[chave]?.custo === undefined).length
}

/** Aviso da D-8 ("N tarefa(s) sem a linha de base n…"), ou `undefined` quando todas as folhas têm custo nela. */
export function avisoTarefasSemLinhaBase(tasks: Task[], n: number): string | undefined {
  const sem = tarefasSemLinhaBase(tasks, n)
  return sem > 0 ? `${sem} tarefa(s) sem a linha de base ${n}: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando.` : undefined
}

/**
 * Salva a linha de base n a partir do cronograma previsto. n = 0: início, término e duração nos campos da LB0 de todas as tarefas
 * do cronograma (exatamente o que o antigo `saveBaseline` fazia). n ≥ 1: `linhasBase[n]` das folhas, com o custo = `bac` do momento (D-2).
 * A duração gravada é o vão em minutos úteis (`duracaoMin` do previsto): numa tarefa interrompida pela data de status é maior que a duração.
 */
export function linhaBaseDoCronograma(tasks: Task[], schedule: ScheduleResult, n: number): Task[] {
  if (n === 0) {
    return tasks.map((t) => {
      const s = schedule.byUid.get(t.uid)
      return s ? { ...t, baselineStart: s.start, baselineFinish: s.finish, baselineDuracaoMin: s.duracaoMin } : t
    })
  }
  const chave = String(n)
  return tasks.map((t) => {
    const s = schedule.byUid.get(t.uid)
    if (!s || t.isSummary) return t
    return { ...t, linhasBase: { ...t.linhasBase, [chave]: { inicio: s.start, termino: s.finish, duracaoMin: s.duracaoMin, custo: t.bac } } }
  })
}

/**
 * Linha de base n das tarefas-resumo (rollup das folhas, como `wbs.ts`): menor início, maior término, soma do custo e a duração em dias úteis
 * do calendário padrão entre os dois × `minutosPorDia` (E-6). Resumo sem nenhuma folha com a LB n fica de fora.
 */
export function rollupLinhaBase(tasks: Task[], n: number, calendarioPadrao: WorkCalendar, minutosPorDia: number): Map<number, DadosLinhaBase> {
  const out = new Map<number, DadosLinhaBase>()
  for (const resumo of tasks.filter((t) => t.isSummary)) {
    const filhas = tasks.filter((t) => !t.isSummary && t.wbs.startsWith(resumo.wbs + '.'))
    const dados = filhas.map((f) => dadosDaLinhaBase(f, n)).filter((d): d is DadosLinhaBase => d !== undefined)
    if (!dados.length) continue
    const inicios = dados.map((d) => d.inicio).filter((x): x is string => !!x).sort()
    const termos = dados.map((d) => d.termino).filter((x): x is string => !!x).sort()
    const custos = dados.map((d) => d.custo).filter((x): x is number => x !== undefined)
    const r: DadosLinhaBase = {}
    if (inicios.length) r.inicio = inicios[0]
    if (termos.length) r.termino = termos[termos.length - 1]
    if (r.inicio && r.termino) r.duracaoMin = Math.max(0, calendarioPadrao.countWorkingBetween(r.inicio, addCalendarDays(r.termino, 1))) * minutosPorDia
    if (custos.length) r.custo = custos.reduce((a, c) => a + c, 0)
    out.set(resumo.uid, r)
  }
  return out
}

/** Entrada de uma linha de base de tarefa lida de dado externo: reconstruída só com os campos válidos; `undefined` se nada sobra ou algo é inválido. */
function sanearDadosLinhaBase(v: unknown): DadosLinhaBase | undefined {
  if (!eObjeto(v)) return undefined
  const r: DadosLinhaBase = {}
  if ('inicio' in v) {
    if (!dataIsoValida(v.inicio)) return undefined
    r.inicio = v.inicio
  }
  if ('termino' in v) {
    if (!dataIsoValida(v.termino)) return undefined
    r.termino = v.termino
  }
  if ('duracaoMin' in v) {
    if (!eNumero(v.duracaoMin) || !Number.isInteger(v.duracaoMin) || v.duracaoMin < 0 || v.duracaoMin > MAX_DURACAO_LB_MIN) return undefined
    r.duracaoMin = v.duracaoMin
  }
  if ('custo' in v) {
    if (!eNumero(v.custo) || v.custo < 0 || v.custo > MAX_CUSTO) return undefined
    r.custo = v.custo
  }
  return Object.keys(r).length ? r : undefined
}

/**
 * Saneamento das `linhasBase` das tarefas lidas do armazenamento (dado externo): descarta a entrada inválida (número fora de 1 a 10, data não ISO,
 * duração não inteira ou fora de 0 a 50 anos, custo não finito ou negativo) e reconstrói as demais só com os campos conhecidos.
 * Devolve as tarefas (as sem mudança, o mesmo objeto) e quantas entradas foram descartadas. Tarefa com `linhasBase` que não é objeto perde o campo.
 */
export function sanearLinhasBase<T extends { linhasBase?: unknown }>(tasks: T[], numerosValidos?: ReadonlySet<number>): { tasks: T[]; descartadas: number } {
  let descartadas = 0
  const saida = tasks.map((t) => {
    if (!eObjeto(t) || !('linhasBase' in t)) return t
    const bruto = t.linhasBase
    if (!eObjeto(bruto)) {
      descartadas++
      const { linhasBase: _descartada, ...resto } = t
      return resto as T
    }
    const limpo: Record<string, DadosLinhaBase> = {}
    let mudou = false
    for (const [k, v] of Object.entries(bruto)) {
      const n = Number(k)
      const d = Number.isInteger(n) && n >= 1 && n <= NUMERO_MAX_LINHA_BASE && String(n) === k && (!numerosValidos || numerosValidos.has(n)) ? sanearDadosLinhaBase(v) : undefined
      if (d) {
        limpo[k] = d
        if (JSON.stringify(d) !== JSON.stringify(v)) mudou = true
      } else {
        descartadas++
        mudou = true
      }
    }
    if (!mudou) return t
    const { linhasBase: _antiga, ...resto } = t
    return (Object.keys(limpo).length ? { ...resto, linhasBase: limpo as LinhasBaseDaTarefa } : resto) as T
  })
  return { tasks: saida, descartadas }
}

/** Erros de nome, motivo e autor digitados (D-4): comprimento, vazio e caracteres de controle. Lista vazia = válido. */
export function validarTextosLinhaBase(d: { nome: string; motivo: string; autor?: string }): string[] {
  const erros: string[] = []
  const nome = d.nome.trim()
  const motivo = d.motivo.trim()
  const autor = (d.autor ?? '').trim()
  if (!nome) erros.push('Informe o nome da linha de base.')
  else if (nome.length > LIMITES_LINHA_BASE.nome) erros.push(`O nome da linha de base passa de ${LIMITES_LINHA_BASE.nome} caracteres.`)
  if (!motivo) erros.push('Informe o motivo da linha de base.')
  else if (motivo.length > LIMITES_LINHA_BASE.motivo) erros.push(`O motivo da linha de base passa de ${LIMITES_LINHA_BASE.motivo} caracteres.`)
  if (autor.length > LIMITES_LINHA_BASE.autor) erros.push(`O autor passa de ${LIMITES_LINHA_BASE.autor} caracteres.`)
  if (CONTROLE.test(nome) || CONTROLE.test(motivo) || CONTROLE.test(autor)) erros.push('Os textos não podem ter caracteres de controle.')
  return erros
}

/**
 * Valida uma entrada de `state.linhasBase` lida de dado externo e a RECONSTRÓI só com os campos conhecidos (`__proto__` e chaves extras não passam).
 * Devolve `undefined` se inválida: número inteiro de 0 a 10, nome de 1 a 60, motivo de 1 a 500, autor de até 120, datas ISO e origem conhecida.
 */
export function validarDadosLinhaBaseInfo(v: unknown): LinhaBaseInfo | undefined {
  if (!eObjeto(v)) return undefined
  const { numero, nome, motivo, autor, salvaEm, dataStatus, origem } = v
  if (typeof numero !== 'number' || !Number.isInteger(numero) || numero < 0 || numero > NUMERO_MAX_LINHA_BASE) return undefined
  if (typeof nome !== 'string' || typeof motivo !== 'string') return undefined
  if (validarTextosLinhaBase({ nome, motivo, autor: typeof autor === 'string' ? autor : undefined }).length) return undefined
  if (autor !== undefined && typeof autor !== 'string') return undefined
  if (salvaEm !== undefined && !dataHoraIsoValida(salvaEm)) return undefined
  if (dataStatus !== undefined && !dataIsoValida(dataStatus)) return undefined
  if (typeof origem !== 'string' || !(ORIGENS_LINHA_BASE as readonly string[]).includes(origem)) return undefined
  const r: LinhaBaseInfo = { numero, nome, motivo, origem: origem as LinhaBaseInfo['origem'] }
  if (autor !== undefined) r.autor = autor
  if (salvaEm !== undefined) r.salvaEm = salvaEm
  if (dataStatus !== undefined) r.dataStatus = dataStatus
  return r
}

/** Lista de metadados lida de dado externo: entradas inválidas ou com número repetido saem (vale a primeira), ordenada por número. */
export function sanearInfosLinhaBase(v: unknown): { infos: LinhaBaseInfo[]; descartadas: number } {
  if (!Array.isArray(v)) return { infos: [], descartadas: 0 }
  const vistos = new Set<number>()
  const infos: LinhaBaseInfo[] = []
  let descartadas = 0
  for (const e of v) {
    const ok = validarDadosLinhaBaseInfo(e)
    if (!ok || vistos.has(ok.numero) || infos.length > NUMERO_MAX_LINHA_BASE) {
      descartadas++
      continue
    }
    vistos.add(ok.numero)
    infos.push(ok)
  }
  return { infos: infos.sort((a, b) => a.numero - b.numero), descartadas }
}

/** Número da linha de base do valor agregado em vigor: o escolhido, se a LB existe; senão a LB0. */
export function linhaBaseAtivaEfetiva(ativa: number | undefined, infos: readonly LinhaBaseInfo[]): number {
  return ativa !== undefined && Number.isInteger(ativa) && ativa >= 1 && ativa <= NUMERO_MAX_LINHA_BASE && infos.some((i) => i.numero === ativa) ? ativa : 0
}
