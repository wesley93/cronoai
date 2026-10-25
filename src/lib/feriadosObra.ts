// Feriados da obra (ciclo 00005, SPEC-03): os nacionais são calculados; Carnaval e Corpus Christi são opção da obra (padrão ligado,
// o comportamento anterior); os estaduais e municipais entram à mão, sempre com a fonte. Nenhuma lista oficial de feriado estadual
// ou municipal é embutida (RF-03.5 parcial: a lista oficial é da Fase 2). Funções puras.
import { UFS } from '@/data/ufs'
import { ABRANGENCIAS_FERIADO, type CalendarioObra, type ConfigFeriadosObra, type FeriadoManual } from '@/types/domain'
import { carnaval, corpusChristi, feriadosNacionais, parseISO, toISO } from './calendar'

export const MAX_FERIADOS_MANUAIS = 200
export const MAX_NOME_FERIADO = 80
export const MAX_FONTE_FERIADO = 200
export const MAX_MUNICIPIO_FERIADO = 80
const ANO_MIN = 1990
const ANO_MAX = 2100

/** Padrão: nacionais, Carnaval e Corpus Christi ligados (o comportamento anterior ao ciclo 00005) e nenhum feriado manual. */
export function configFeriadosPadrao(): ConfigFeriadosObra {
  return { nacionais: true, carnaval: true, corpusChristi: true, manuais: [] }
}

const eObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Lê a configuração do estado salvo (dado externo): a forma (três opções booleanas e a lista) e cada feriado manual com as mesmas regras de
 * `validarFeriadoManual` (tipos e tamanhos). Feriado inválido é descartado e contado; mais de 200 também. Sem a forma, `config` é
 * indefinido. Os feriados válidos são recriados campo a campo (campo desconhecido não passa).
 */
export function sanearConfigFeriados(v: unknown): { config?: ConfigFeriadosObra; descartados: number } {
  if (!eObj(v) || typeof v.nacionais !== 'boolean' || typeof v.carnaval !== 'boolean' || typeof v.corpusChristi !== 'boolean' || !Array.isArray(v.manuais)) {
    return { descartados: 0 }
  }
  const manuais: FeriadoManual[] = []
  let descartados = 0
  for (const m of v.manuais) {
    if (!eObj(m) || typeof m.id !== 'string' || m.id === '' || m.id.length > 60 || validarFeriadoManual(m).length > 0 || manuais.length >= MAX_FERIADOS_MANUAIS) {
      descartados++
      continue
    }
    const abrangencia = ABRANGENCIAS_FERIADO.find((a) => a === m.abrangencia)
    if (!abrangencia || typeof m.data !== 'string' || typeof m.nome !== 'string' || typeof m.fonte !== 'string' || typeof m.recorrenteAnual !== 'boolean') {
      descartados++
      continue
    }
    const uf = UFS.find((u) => u.sigla === m.uf)?.sigla
    manuais.push({
      id: m.id,
      data: m.data,
      nome: m.nome.trim(),
      abrangencia,
      fonte: m.fonte.trim(),
      recorrenteAnual: m.recorrenteAnual,
      ...(uf ? { uf } : {}),
      ...(typeof m.municipio === 'string' && m.municipio.trim() ? { municipio: m.municipio.trim() } : {}),
    })
  }
  return { config: { nacionais: v.nacionais, carnaval: v.carnaval, corpusChristi: v.corpusChristi, manuais }, descartados }
}

/** A configuração está íntegra: forma certa e nenhum feriado manual descartável. */
export function configFeriadosValida(v: unknown): boolean {
  const r = sanearConfigFeriados(v)
  return r.config !== undefined && r.descartados === 0
}

const anoBissexto = (ano: number) => (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0

/** Datas (yyyy-mm-dd) dos feriados da obra num ano. */
export function feriadosDoAno(config: ConfigFeriadosObra, ano: number): Set<string> {
  const out = new Set<string>()
  if (config.nacionais) for (const d of feriadosNacionais(ano)) out.add(d)
  if (config.carnaval) for (const d of carnaval(ano)) out.add(d)
  if (config.corpusChristi) for (const d of corpusChristi(ano)) out.add(d)
  for (const f of config.manuais) {
    if (f.recorrenteAnual) {
      const md = f.data.slice(5)
      if (md === '02-29' && !anoBissexto(ano)) continue
      out.add(`${ano}-${md}`)
    } else if (f.data.startsWith(`${ano}-`)) out.add(f.data)
  }
  return out
}

/** Gerador de feriados por ano, memorizado por ano: funciona para qualquer horizonte (sem lista fechada de anos). */
export function criarFeriadosPorAno(config: ConfigFeriadosObra): (ano: number) => ReadonlySet<string> {
  const cache = new Map<number, Set<string>>()
  return (ano) => {
    let s = cache.get(ano)
    if (!s) {
      s = feriadosDoAno(config, ano)
      cache.set(ano, s)
    }
    return s
  }
}

/** A data é feriado da obra? */
export function ehFeriadoDaObra(config: ConfigFeriadosObra, iso: string): boolean {
  return feriadosDoAno(config, Number(iso.slice(0, 4))).has(iso)
}

/** Feriados da obra de um intervalo de anos, em ordem (para exportar como exceções não úteis do calendário). */
export function materializarFeriados(config: ConfigFeriadosObra, deAno: number, ateAno: number): string[] {
  const out: string[] = []
  for (let a = deAno; a <= ateAno; a++) out.push(...[...feriadosDoAno(config, a)].sort())
  return out
}

/** Faixa de anos exportada: do ano de início até o maior entre início + 3 e o ano do término previsto + 1 (no seed, 2026–2029). */
export function faixaDeAnosDaExportacao(anoInicio: number, anoTerminoPrevisto: number): [number, number] {
  return [anoInicio, Math.max(anoInicio + 3, anoTerminoPrevisto + 1)]
}

export type NovoFeriadoManual = Omit<FeriadoManual, 'id'>

/**
 * Valida um feriado manual (dado do usuário ou do estado salvo, por isso `unknown`); lista vazia = válido. A fonte é obrigatória e os textos
 * têm limite de tamanho.
 */
export function validarFeriadoManual(entrada: unknown, existentes: readonly FeriadoManual[] = []): string[] {
  if (!eObj(entrada)) return ['O feriado está em formato inválido.']
  const erros: string[] = []
  const data = entrada.data
  const dataOk = typeof data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data) && toISO(parseISO(data)) === data
  if (!dataOk) erros.push('Informe uma data válida para o feriado.')
  else if (Number(data.slice(0, 4)) < ANO_MIN || Number(data.slice(0, 4)) > ANO_MAX) erros.push(`O ano do feriado deve estar entre ${ANO_MIN} e ${ANO_MAX}.`)
  const nome = typeof entrada.nome === 'string' ? entrada.nome.trim() : undefined
  if (nome === undefined) erros.push('O nome do feriado deve ser um texto.')
  else if (!nome) erros.push('Informe o nome do feriado.')
  else if (nome.length > MAX_NOME_FERIADO) erros.push(`O nome do feriado deve ter no máximo ${MAX_NOME_FERIADO} caracteres.`)
  const fonte = typeof entrada.fonte === 'string' ? entrada.fonte.trim() : undefined
  if (fonte === undefined) erros.push('A fonte do feriado deve ser um texto.')
  else if (!fonte) erros.push('Informe a fonte do feriado (lei, decreto ou ato oficial).')
  else if (fonte.length > MAX_FONTE_FERIADO) erros.push(`A fonte deve ter no máximo ${MAX_FONTE_FERIADO} caracteres.`)
  if (!ABRANGENCIAS_FERIADO.some((a) => a === entrada.abrangencia)) erros.push('Selecione a abrangência do feriado.')
  if (entrada.uf !== undefined && !UFS.some((u) => u.sigla === entrada.uf)) erros.push('Selecione uma UF válida.')
  if (entrada.municipio !== undefined && (typeof entrada.municipio !== 'string' || entrada.municipio.trim().length > MAX_MUNICIPIO_FERIADO)) {
    erros.push(typeof entrada.municipio !== 'string' ? 'O município deve ser um texto.' : `O município deve ter no máximo ${MAX_MUNICIPIO_FERIADO} caracteres.`)
  }
  if (typeof entrada.recorrenteAnual !== 'boolean') erros.push('Informe se o feriado se repete todo ano.')
  if (existentes.length >= MAX_FERIADOS_MANUAIS) erros.push(`No máximo ${MAX_FERIADOS_MANUAIS} feriados manuais por obra.`)
  if (dataOk && nome && existentes.some((e) => e.data === data && e.nome.trim().toLowerCase() === nome.toLowerCase())) erros.push('Este feriado já está cadastrado.')
  return erros
}

const normaliza = (t?: string) => (t ?? '').trim().toLowerCase()

/**
 * Feriados manuais estaduais ou municipais cadastrados para outra UF ou outro município (troca de local da obra).
 * O CronoAI não carrega feriados locais sozinho nesta fase: só estes, digitados pelo usuário, são avaliados.
 */
export function feriadosForaDoLocal(config: ConfigFeriadosObra, uf?: string, municipio?: string): FeriadoManual[] {
  return config.manuais.filter((f) => {
    if (f.abrangencia === 'estadual') return (f.uf ?? '') !== (uf ?? '')
    if (f.abrangencia === 'municipal') return (f.uf ?? '') !== (uf ?? '') || normaliza(f.municipio) !== normaliza(municipio)
    return false
  })
}

const porData = (a: { data: string }, b: { data: string }) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)

/**
 * Calendários prontos para exportar ao MSPDI (que não conhece "feriados da obra"): os feriados da obra viram exceções não úteis,
 * nos anos de `deAno` a `ateAno`, nos calendários com `aplicaFeriadosObra`. Exceção própria do calendário na mesma data prevalece
 * e é mantida. O calendário exportado não leva a marca (ela não existe no arquivo).
 */
export function calendariosParaExportar(calendarios: CalendarioObra[], config: ConfigFeriadosObra, deAno: number, ateAno: number): CalendarioObra[] {
  const datas = materializarFeriados(config, deAno, ateAno)
  return calendarios.map((c) => {
    if (!c.aplicaFeriadosObra) return c
    const proprias = new Set(c.excecoes.map((e) => e.data))
    const { aplicaFeriadosObra: _marca, ...resto } = c
    const novas = datas.filter((d) => !proprias.has(d)).map((data) => ({ data, intervalos: [] }))
    return { ...resto, excecoes: [...c.excecoes, ...novas].sort(porData) }
  })
}
