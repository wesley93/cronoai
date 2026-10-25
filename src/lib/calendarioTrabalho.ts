// Calendário de trabalho em minutos (ciclo 00004, ADR 00003): vários calendários por obra, com intervalos de horário
// por dia da semana e exceções. Toda conversão de unidade de tempo (dias ↔ minutos, data-hora sem fuso) mora aqui.
//
// Modelo: um "momento" é um número inteiro de minutos de relógio desde 00:00 da data-base da obra (pode ser negativo).
// Hora local da obra, sem fuso: a aritmética de dia usa UTC só como relógio (como calendar.ts).
// Cada calendário converte "momento" ↔ "minuto útil": W(m) = minutos úteis antes do momento m (relativo à data-base).
import type { CalendarioObra, ExcecaoCalendario, IntervaloTrabalho } from '@/types/domain'
import { configFeriadosPadrao, criarFeriadosPorAno } from './feriadosObra'
import { MSG_TETO, TETO_DIAS, WorkCalendar, addCalendarDays, diffCalendarDays, parseISO } from './calendar'

export { TETO_DIAS }

export const MINUTOS_POR_DIA_PADRAO = 480
export const MINUTOS_NO_DIA_CORRIDO = 1440
/** Máximo de intervalos de trabalho num dia (limite do esquema MSPDI, `WorkingTime` maxOccurs = 5). */
export const MAX_INTERVALOS_POR_DIA = 5

/** Datas de restrição, prazo, datas reais e linha de base a mais de 45 anos do início da obra são recusadas (o motor trava em 50). */
export const JANELA_ANOS_DATAS = 45

export const UID_CALENDARIO_PADRAO = 1
export const NOME_CALENDARIO_PADRAO = 'Padrão Obra (seg-sex, 8h)'
/** Expediente do calendário padrão migrado: 08:00–12:00 e 13:00–17:00. */
export const EXPEDIENTE_PADRAO: readonly IntervaloTrabalho[] = [
  { de: 480, ate: 720 },
  { de: 780, ate: 1020 },
]

// ---------------------------------------------------------------------------
// Conversões de unidade
// ---------------------------------------------------------------------------

/** Dias de trabalho → minutos, para o minuto inteiro mais próximo (meio para cima). */
export function diasParaMinutos(dias: number, minutosPorDia = MINUTOS_POR_DIA_PADRAO): number {
  return Math.round(dias * minutosPorDia)
}

/** Minutos → dias de trabalho (pode ser fracionário; só para exibição e contas de dia). */
export function minutosParaDias(minutos: number, minutosPorDia = MINUTOS_POR_DIA_PADRAO): number {
  return minutos / minutosPorDia
}

/** `hh:mm` ou `hh:mm:ss` → minutos do dia (0–1440). `undefined` se o texto não é um horário válido. */
export function horaParaMinutos(texto: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(texto.trim())
  if (!m) return undefined
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)]
  if (min > 59 || s > 59 || h > 24 || (h === 24 && (min > 0 || s > 0))) return undefined
  return h * 60 + min
}

/** Minutos do dia → `hh:mm` (1440 vira 24:00). */
export function minutosParaHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const DATA_HORA = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2})(?::\d{2})?)?$/

/** `yyyy-mm-dd` ou `yyyy-mm-ddThh:mm` (sem fuso) → data e minuto do dia (`undefined` quando só veio a data). */
export function lerDataHora(texto: string): { data: string; minuto?: number } | undefined {
  const m = DATA_HORA.exec(texto)
  if (!m) return undefined
  const [y, mo, d] = m[1].split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return undefined
  if (m[2] === undefined) return { data: m[1] }
  const minuto = Number(m[2]) * 60 + Number(m[3])
  return Number(m[2]) > 23 || Number(m[3]) > 59 ? undefined : { data: m[1], minuto }
}

/** Dia relativo à data-base (0 = a própria data-base; pode ser negativo). */
export function diaRelativo(base: string, iso: string): number {
  return diffCalendarDays(base, iso.slice(0, 10))
}

/** Momento (minutos desde 00:00 da data-base) de uma data e um minuto do dia. */
export function momentoDe(base: string, iso: string, minutoDoDia = 0): number {
  return diaRelativo(base, iso) * MINUTOS_NO_DIA_CORRIDO + minutoDoDia
}

/** Data (`yyyy-mm-dd`) do dia que contém o momento. */
export function dataDoMomento(base: string, momento: number): string {
  return addCalendarDays(base, Math.floor(momento / MINUTOS_NO_DIA_CORRIDO))
}

/** Hora (`hh:mm`) do momento dentro do próprio dia. */
export function horaDoMomento(momento: number): string {
  return minutosParaHora(momento - Math.floor(momento / MINUTOS_NO_DIA_CORRIDO) * MINUTOS_NO_DIA_CORRIDO)
}

// ---------------------------------------------------------------------------
// Validação e compilação
// ---------------------------------------------------------------------------

const eDataValida = (iso: string) => lerDataHora(iso)?.minuto === undefined && lerDataHora(iso) !== undefined

function erroDeIntervalos(intervalos: readonly IntervaloTrabalho[], onde: string): string | undefined {
  if (intervalos.length > MAX_INTERVALOS_POR_DIA) return `${onde}: mais de ${MAX_INTERVALOS_POR_DIA} intervalos de trabalho no dia.`
  let anterior = 0
  for (const iv of intervalos) {
    if (!Number.isInteger(iv.de) || !Number.isInteger(iv.ate) || iv.de < 0 || iv.ate > MINUTOS_NO_DIA_CORRIDO) {
      return `${onde}: horário fora de 00:00–24:00.`
    }
    if (iv.ate <= iv.de) return `${onde}: o fim do intervalo deve ser depois do início.`
    if (iv.de < anterior) return `${onde}: intervalos fora de ordem ou sobrepostos.`
    anterior = iv.ate
  }
  return undefined
}

/** Primeiro problema do calendário (em português, sem texto livre do arquivo), ou `undefined` se é válido. */
export function erroDoCalendario(cal: CalendarioObra): string | undefined {
  if (!Array.isArray(cal.semana) || cal.semana.length !== 7 || !cal.semana.every(Array.isArray)) return 'a semana deve ter 7 dias.'
  if (!Array.isArray(cal.excecoes)) return 'as exceções devem ser uma lista.'
  let temTempoNaSemana = false
  for (let d = 0; d < 7; d++) {
    const e = erroDeIntervalos(cal.semana[d], `dia ${d} da semana`)
    if (e) return e
    if (cal.semana[d].length > 0) temTempoNaSemana = true
  }
  for (const ex of cal.excecoes) {
    if (!ex || typeof ex.data !== 'string' || !eDataValida(ex.data)) return 'exceção com data inválida.'
    if (!Array.isArray(ex.intervalos)) return 'exceção com horário inválido.'
    const e = erroDeIntervalos(ex.intervalos, 'exceção')
    if (e) return e
    if (ex.descricao !== undefined && (typeof ex.descricao !== 'string' || ex.descricao.length > MAX_DESCRICAO_EXCECAO)) return 'exceção com descrição inválida.'
  }
  // A semana precisa ter tempo útil: só com exceções úteis o motor varreria dezenas de anos de dias sem trabalho
  return temTempoNaSemana ? undefined : 'a semana do calendário não tem nenhum tempo útil.'
}

/** Minutos úteis de uma lista de intervalos do dia. */
export const minutosDeIntervalos = (ivs: readonly IntervaloTrabalho[]) => ivs.reduce((a, iv) => a + (iv.ate - iv.de), 0)
const somaIntervalos = minutosDeIntervalos

/**
 * Calendário compilado: aritmética de minutos úteis por busca binária sobre minutos úteis acumulados por dia.
 * Estende o acumulado sob demanda (horizonte dinâmico), até o teto de 50 anos.
 */
export class CalendarioCompilado {
  private readonly semana: IntervaloTrabalho[][]
  private readonly excecoes = new Map<number, IntervaloTrabalho[]>()
  private readonly dowBase: number
  /** Dia (relativo à data-base) → é feriado da obra? Memorizado: `intervalosDoDia` roda a cada consulta do motor. */
  private readonly feriados = new Map<number, boolean>()
  /** pos[i] = minutos úteis acumulados antes do dia i (i ≥ 0). */
  private readonly pos: number[] = [0]
  /** neg[j] = minutos úteis acumulados antes do dia −j, com sinal (≤ 0). */
  private readonly neg: number[] = [0]

  constructor(
    readonly base: string,
    readonly uid: number,
    readonly nome: string,
    semana: IntervaloTrabalho[][],
    excecoes: { data: string; intervalos: IntervaloTrabalho[] }[],
    /** Feriados da obra (se o calendário os aplica): o dia sem exceção própria que é feriado fica sem tempo útil. */
    private readonly feriadoDaObra?: (iso: string) => boolean,
  ) {
    this.semana = semana
    this.dowBase = parseISO(base).getUTCDay()
    for (const ex of excecoes) this.excecoes.set(diaRelativo(base, ex.data), ex.intervalos) // a última exceção da data vale
  }

  /** Semana → feriados da obra (se aplicados) → exceções próprias do calendário (prevalecem sobre os feriados). */
  intervalosDoDia(dia: number): readonly IntervaloTrabalho[] {
    const propria = this.excecoes.get(dia)
    if (propria) return propria
    if (this.feriadoDaObra && this.ehFeriado(dia)) return []
    return this.semana[(((this.dowBase + dia) % 7) + 7) % 7]
  }

  private ehFeriado(dia: number): boolean {
    let f = this.feriados.get(dia)
    if (f === undefined) {
      f = this.feriadoDaObra!(addCalendarDays(this.base, dia))
      this.feriados.set(dia, f)
    }
    return f
  }

  minutosNoDia(dia: number): number {
    return somaIntervalos(this.intervalosDoDia(dia))
  }

  /** O dia (relativo à data-base) tem tempo útil? */
  diaUtil(dia: number): boolean {
    return this.minutosNoDia(dia) > 0
  }

  /** A data `yyyy-mm-dd` tem tempo útil? */
  dataUtil(iso: string): boolean {
    return this.diaUtil(diaRelativo(this.base, iso))
  }

  private estenderPos(ate: number) {
    if (ate > TETO_DIAS) throw new Error(MSG_TETO)
    while (this.pos.length <= ate) {
      const i = this.pos.length - 1
      this.pos.push(this.pos[i] + this.minutosNoDia(i))
    }
  }

  private estenderNeg(ate: number) {
    if (ate > TETO_DIAS) throw new Error(MSG_TETO)
    while (this.neg.length <= ate) {
      const j = this.neg.length - 1
      this.neg.push(this.neg[j] - this.minutosNoDia(-(j + 1)))
    }
  }

  /** Minutos úteis acumulados antes do início do dia. */
  private acumuladoAntes(dia: number): number {
    if (dia >= 0) {
      this.estenderPos(dia)
      return this.pos[dia]
    }
    this.estenderNeg(-dia)
    return this.neg[-dia]
  }

  /** W(m): minutos úteis antes do momento `m`, relativo à data-base (negativo antes dela). */
  uteisAte(m: number): number {
    const dia = Math.floor(m / MINUTOS_NO_DIA_CORRIDO)
    const t = m - dia * MINUTOS_NO_DIA_CORRIDO
    let parcial = 0
    for (const iv of this.intervalosDoDia(dia)) parcial += Math.max(0, Math.min(iv.ate, t) - iv.de)
    return this.acumuladoAntes(dia) + parcial
  }

  /** Minutos úteis entre dois momentos, com sinal (negativo se `a` é depois de `b`). */
  minutosUteisEntre(a: number, b: number): number {
    return this.uteisAte(b) - this.uteisAte(a)
  }

  /** Menor momento x com W(x) = alvo: o FIM do `alvo`-ésimo minuto útil (17:00, e não 08:00 do dia seguinte). */
  private menorMomentoComUteis(alvo: number): number {
    let e: number // menor e com acumuladoAntes(e) ≥ alvo
    if (alvo > 0) {
      while (this.pos[this.pos.length - 1] < alvo) this.estenderPos(this.pos.length)
      let lo = 1
      let hi = this.pos.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (this.pos[mid] >= alvo) hi = mid
        else lo = mid + 1
      }
      e = lo
    } else {
      while (this.neg[this.neg.length - 1] >= alvo) this.estenderNeg(this.neg.length)
      let lo = 0
      let hi = this.neg.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (this.neg[mid] >= alvo) lo = mid
        else hi = mid - 1
      }
      e = -lo
    }
    const dia = e - 1
    let falta = alvo - this.acumuladoAntes(dia)
    for (const iv of this.intervalosDoDia(dia)) {
      const len = iv.ate - iv.de
      if (falta <= len) return dia * MINUTOS_NO_DIA_CORRIDO + iv.de + falta
      falta -= len
    }
    throw new Error(MSG_TETO) // inalcançável: o acumulado do dia contém o alvo
  }

  /** Maior momento x com W(x) = alvo: o INÍCIO do (`alvo`+1)-ésimo minuto útil. */
  private maiorMomentoComUteis(alvo: number): number {
    let dia: number // maior dia com acumuladoAntes(dia) ≤ alvo
    if (alvo >= 0) {
      while (this.pos[this.pos.length - 1] <= alvo) this.estenderPos(this.pos.length)
      let lo = 0
      let hi = this.pos.length - 1
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        if (this.pos[mid] <= alvo) lo = mid
        else hi = mid - 1
      }
      dia = lo
    } else {
      while (this.neg[this.neg.length - 1] > alvo) this.estenderNeg(this.neg.length)
      let lo = 1
      let hi = this.neg.length - 1
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (this.neg[mid] <= alvo) hi = mid
        else lo = mid + 1
      }
      dia = -lo
    }
    let falta = alvo - this.acumuladoAntes(dia)
    for (const iv of this.intervalosDoDia(dia)) {
      const len = iv.ate - iv.de
      if (falta < len) return dia * MINUTOS_NO_DIA_CORRIDO + iv.de + falta
      falta -= len
    }
    throw new Error(MSG_TETO) // inalcançável
  }

  /** Primeiro momento útil em `m` ou depois (normaliza o INÍCIO de uma tarefa com duração). */
  proximoUtil(m: number): number {
    return this.maiorMomentoComUteis(this.uteisAte(m))
  }

  /** Último fim de trecho útil em `m` ou antes (normaliza o TÉRMINO: 17:00, e não 08:00 do dia seguinte). */
  fimUtilAte(m: number): number {
    return this.menorMomentoComUteis(this.uteisAte(m))
  }

  /**
   * Soma `n` minutos úteis ao momento `m` (n negativo retrocede). Com n > 0 devolve o fim do último minuto contado
   * (ex.: 17:00); com n < 0, o início do último minuto contado (ex.: 08:00). Com n = 0 devolve `m` sem normalizar:
   * somar lag 0 não empurra o marco para 08:00 do dia seguinte.
   */
  somarUteis(m: number, n: number): number {
    if (n === 0) return m
    const w = this.uteisAte(m)
    return n > 0 ? this.menorMomentoComUteis(w + n) : this.maiorMomentoComUteis(w + n)
  }

  /** Primeiro momento útil do último dia útil em `dia` ou antes (início do "dia da data de status"). */
  inicioDoDiaUtilNoOuAntes(dia: number): number {
    const fim = this.fimUtilAte((dia + 1) * MINUTOS_NO_DIA_CORRIDO)
    return this.proximoUtil(Math.floor((fim - 1) / MINUTOS_NO_DIA_CORRIDO) * MINUTOS_NO_DIA_CORRIDO)
  }
}

let geradorPadrao: ((ano: number) => ReadonlySet<string>) | undefined
const feriadosPadraoPorAno = () => (geradorPadrao ??= criarFeriadosPorAno(configFeriadosPadrao()))

export interface OpcoesCompilacao {
  /** Ignora as exceções úteis (dia útil extra, sábado de hora extra): regra do PV (CR-2d). */
  semExcecoesUteis?: boolean
  /**
   * Gerador de feriados da obra por ano (ver `criarFeriadosPorAno`), aplicado aos calendários com `aplicaFeriadosObra`.
   * Sem gerador, vale a configuração padrão (nacionais, Carnaval e Corpus Christi), como na obra sem `feriados` salvo.
   */
  feriadosPorAno?: (ano: number) => ReadonlySet<string>
}

export interface CalendariosCompilados {
  base: string
  padrao: CalendarioCompilado
  /** Calendário da tarefa; ausente ou inexistente = padrão da obra. */
  de(uid: number | undefined): CalendarioCompilado
  /** Calendário interno de 24 h, 7 dias por semana (duração e lag em dias corridos). */
  corrido: CalendarioCompilado
}

const SEMANA_24H: IntervaloTrabalho[][] = Array.from({ length: 7 }, () => [{ de: 0, ate: MINUTOS_NO_DIA_CORRIDO }])

/** Compila os calendários da obra. Calendário inválido ou padrão inexistente: `Error` em português. */
export function compilarCalendarios(
  base: string,
  calendarios: CalendarioObra[],
  padraoUid: number,
  opcoes: OpcoesCompilacao = {},
): CalendariosCompilados {
  const porUid = new Map<number, CalendarioCompilado>()
  for (const c of calendarios) {
    const erro = erroDoCalendario(c)
    if (erro) throw new Error(`Calendário inválido: ${erro}`)
    const excecoes = opcoes.semExcecoesUteis ? c.excecoes.filter((ex) => ex.intervalos.length === 0) : c.excecoes
    const gerador = opcoes.feriadosPorAno ?? feriadosPadraoPorAno()
    const feriado = c.aplicaFeriadosObra && gerador ? (iso: string) => gerador(Number(iso.slice(0, 4))).has(iso) : undefined
    porUid.set(c.uid, new CalendarioCompilado(base, c.uid, c.nome, c.semana, excecoes, feriado))
  }
  const padrao = porUid.get(padraoUid)
  if (!padrao) throw new Error('O calendário padrão da obra não existe.')
  return {
    base,
    padrao,
    de: (uid) => (uid === undefined ? padrao : (porUid.get(uid) ?? padrao)),
    corrido: new CalendarioCompilado(base, -1, '24 horas', SEMANA_24H, []),
  }
}

/**
 * Calendário padrão da obra (seg–sex, 08:00–12:00 e 13:00–17:00) com feriados como exceções não úteis e
 * dias úteis extras (ex.: sábados de hora extra) como exceções úteis no mesmo expediente.
 */
export function calendarioPadrao(feriados: string[], diasExtras: string[] = [], uid = UID_CALENDARIO_PADRAO): CalendarioObra {
  const extras = new Set(diasExtras)
  const semana: IntervaloTrabalho[][] = [[], [], [], [], [], [], []]
  for (let d = 1; d <= 5; d++) semana[d] = EXPEDIENTE_PADRAO.map((iv) => ({ ...iv }))
  return {
    uid,
    nome: NOME_CALENDARIO_PADRAO,
    semana,
    excecoes: [
      ...[...new Set(feriados)].filter((h) => !extras.has(h)).map((data) => ({ data, intervalos: [] })),
      ...[...extras].sort().map((data) => ({ data, intervalos: EXPEDIENTE_PADRAO.map((iv) => ({ ...iv })) })),
    ].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)),
  }
}

/** Datas das exceções úteis (dias úteis extras) de um calendário. */
export function diasExtrasDo(cal: CalendarioObra): string[] {
  return cal.excecoes.filter((ex) => ex.intervalos.length > 0).map((ex) => ex.data)
}

/** Expediente de um dia útil comum do calendário (o de maior tempo entre segunda e sexta), para dias extras. */
export function expedienteDoDiaUtil(cal: CalendarioObra): IntervaloTrabalho[] {
  let melhor: IntervaloTrabalho[] = []
  for (let d = 1; d <= 5; d++) if (somaIntervalos(cal.semana[d]) > somaIntervalos(melhor)) melhor = cal.semana[d]
  return melhor.map((iv) => ({ ...iv }))
}

/** `WorkCalendar` (contas por dia útil) a partir de um calendário compilado: dia útil = dia com minutos úteis. */
export function calendarioDeDias(cal: CalendarioCompilado): WorkCalendar {
  return new WorkCalendar(cal.base, (iso) => cal.dataUtil(iso))
}

const porData = (a: ExcecaoCalendario, b: ExcecaoCalendario) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)

/**
 * Cópia do calendário com dias úteis extras (exceções úteis). Sem `expedienteDoDia`, no expediente de um dia útil comum do calendário
 * (jornada integral); com ele, nesse horário (ex.: sábado de meio período, 08:00–12:00).
 */
export function comDiasExtras(cal: CalendarioObra, dias: string[], expedienteDoDia?: readonly IntervaloTrabalho[]): CalendarioObra {
  const expediente = expedienteDoDia ?? expedienteDoDiaUtil(cal)
  const novos = new Set(dias)
  const mantidas = cal.excecoes.filter((ex) => !novos.has(ex.data))
  return {
    ...cal,
    excecoes: [...mantidas, ...[...novos].map((data) => ({ data, intervalos: expediente.map((iv) => ({ ...iv })) }))].sort(porData),
  }
}

/** Cópia do calendário sem as exceções úteis dessas datas (desfaz `comDiasExtras`). */
export function semDiasExtras(cal: CalendarioObra, dias: string[]): CalendarioObra {
  const remover = new Set(dias)
  return { ...cal, excecoes: cal.excecoes.filter((ex) => !(remover.has(ex.data) && ex.intervalos.length > 0)) }
}

const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const
/** Horas do dia para a tela: 480 → "8 h", 270 → "4,5 h", 0 → "—". */
export const horasDoDiaTexto = (minutos: number) => (minutos === 0 ? '—' : `${(minutos / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`)

/**
 * Resumo da jornada semanal para a tela: dias seguidos com a mesma carga viram uma faixa ("seg–sex 8 h; sáb–dom —").
 * A semana começa na segunda-feira.
 */
export function resumoJornadaSemana(cal: CalendarioObra): string {
  const ordem = [1, 2, 3, 4, 5, 6, 0]
  const grupos: { de: number; ate: number; minutos: number }[] = []
  for (const d of ordem) {
    const minutos = somaIntervalos(cal.semana[d] ?? [])
    const ultimo = grupos[grupos.length - 1]
    if (ultimo && ultimo.minutos === minutos) ultimo.ate = d
    else grupos.push({ de: d, ate: d, minutos })
  }
  return grupos.map((g) => `${g.de === g.ate ? NOMES_DIA[g.de] : `${NOMES_DIA[g.de]}–${NOMES_DIA[g.ate]}`} ${horasDoDiaTexto(g.minutos)}`).join('; ')
}

// ---------------------------------------------------------------------------
// Editor de calendários (ciclo 00005): predefinições, texto → intervalo, cópia e nome
// ---------------------------------------------------------------------------

/** Máximo de calendários por obra (o mesmo limite do import do MSPDI). */
export const MAX_CALENDARIOS = 100
export const MAX_NOME_CALENDARIO = 60
export const MAX_DESCRICAO_EXCECAO = 80

/** Jornadas prontas do editor: sem expediente, meio período (4 h, 08:00–12:00) e dia inteiro de 8 h (08:00–12:00 e 13:00–17:00). */
export const PREDEFINICOES_JORNADA = ['sem-expediente', 'quatro-horas', 'oito-horas'] as const
export type PredefinicaoJornada = (typeof PREDEFINICOES_JORNADA)[number]
export const ROTULO_PREDEFINICAO: Record<PredefinicaoJornada, string> = {
  'sem-expediente': 'Sem expediente',
  'quatro-horas': '4 h (08:00–12:00)',
  'oito-horas': '8 h (08:00–12:00 e 13:00–17:00)',
}

export function intervalosDaPredefinicao(p: PredefinicaoJornada): IntervaloTrabalho[] {
  if (p === 'sem-expediente') return []
  if (p === 'quatro-horas') return [{ de: 480, ate: 720 }]
  return EXPEDIENTE_PADRAO.map((iv) => ({ ...iv }))
}

/** Predefinição que corresponde exatamente aos intervalos (ou `undefined` = personalizado). */
export function predefinicaoDe(intervalos: readonly IntervaloTrabalho[]): PredefinicaoJornada | undefined {
  return PREDEFINICOES_JORNADA.find((p) => JSON.stringify(intervaloOrdenado(intervalosDaPredefinicao(p))) === JSON.stringify(intervaloOrdenado(intervalos)))
}
const intervaloOrdenado = (ivs: readonly IntervaloTrabalho[]) => ivs.map((iv) => [iv.de, iv.ate])

/**
 * Horário digitado (`hh:mm` de início e de fim) → intervalo em minutos. Fim `00:00` vale 24:00 (1.440): `22:00–00:00` são 120 min e
 * `00:00–00:00` é o dia inteiro. A ordem e a sobreposição dos intervalos são validadas depois desta conversão (`erroDoCalendario`).
 */
export function intervaloDeTextos(de: string, ate: string): { intervalo: IntervaloTrabalho } | { erro: string } {
  const d = horaParaMinutos(de)
  const a = horaParaMinutos(ate)
  if (d === undefined || a === undefined) return { erro: 'Informe horários válidos (hh:mm).' }
  const fim = a === 0 ? MINUTOS_NO_DIA_CORRIDO : a
  if (fim <= d) return { erro: 'O fim do intervalo deve ser depois do início.' }
  return { intervalo: { de: d, ate: fim } }
}

/** Nome do calendário: 1 a 60 caracteres e único na obra (sem diferenciar maiúsculas). Devolve a mensagem ou `undefined`. */
export function erroDoNomeCalendario(nome: string, calendarios: readonly CalendarioObra[], uidIgnorado?: number): string | undefined {
  const n = nome.trim()
  if (!n) return 'Informe o nome do calendário.'
  if (n.length > MAX_NOME_CALENDARIO) return `O nome do calendário deve ter no máximo ${MAX_NOME_CALENDARIO} caracteres.`
  if (calendarios.some((c) => c.uid !== uidIgnorado && c.nome.trim().toLowerCase() === n.toLowerCase())) return 'Já existe um calendário com este nome.'
  return undefined
}

/** Próximo UID livre de calendário (maior + 1). */
export const proximoUidCalendario = (calendarios: readonly CalendarioObra[]) => calendarios.reduce((m, c) => Math.max(m, c.uid), 0) + 1

/** Cópia independente do calendário com novo UID e nome (não herda a origem de hora extra). */
export function copiarCalendario(cal: CalendarioObra, uid: number, nome: string): CalendarioObra {
  const { origem: _origem, derivadoDe: _derivadoDe, ...resto } = cal
  return {
    ...resto,
    uid,
    nome,
    semana: cal.semana.map((d) => d.map((iv) => ({ ...iv }))),
    excecoes: cal.excecoes.map((ex) => ({ ...ex, intervalos: ex.intervalos.map((iv) => ({ ...iv })) })),
  }
}
