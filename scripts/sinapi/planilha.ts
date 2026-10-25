/// <reference types="node" />
// Leitor mínimo de xlsx (SpreadsheetML) para o SINAPI, sem dependência (D-1): só o subconjunto medido na planilha da Caixa
// (`<c r s t><v>`, `<f>` e texto compartilhado simples). Entrada externa: sem DTD nem entidades (XXE e billion laughs), só as 5
// entidades predefinidas e referências numéricas; limites de linhas, colunas e células; mensagens sem conteúdo do arquivo.
// Referência: OWASP XML External Entity Prevention Cheat Sheet.
import type { LeitorZip } from './zip.ts'

export class ErroPlanilha extends Error {}

export interface LimitesPlanilha {
  maxLinhas: number
  maxColunas: number
  maxTextosCompartilhados: number
  /** Texto de uma célula (o Excel limita a 32.767). */
  maxTexto: number
}

/** Medido em 09/2026: 67.177 linhas e 58 colunas na maior aba; 17.022 textos compartilhados. */
export const LIMITES_PLANILHA_PADRAO: LimitesPlanilha = { maxLinhas: 200_000, maxColunas: 200, maxTextosCompartilhados: 500_000, maxTexto: 32_767 }

export interface Celula {
  /** 1 = A. */
  coluna: number
  valor?: string | number
  /** Texto da fórmula (nunca avaliada). */
  formula?: string
}

export interface Linha {
  numero: number
  /** Células na ordem do arquivo; a coluna vem da referência `A1`. */
  celulas: Celula[]
}

export interface Planilha {
  /** Nomes das abas, na ordem do arquivo. */
  abas: readonly string[]
  /** Linhas de uma aba, em fluxo (a aba de custos tem 23 MB de XML). */
  linhas(aba: string): Generator<Linha>
}

// eslint-disable-next-line no-control-regex -- é justamente o que se quer remover
const CONTROLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g
const PROIBIDO = /<!\s*(DOCTYPE|ENTITY)|<!\[CDATA\[/i

/** Recusa DTD e entidades declaradas (e CDATA, que o subconjunto medido não usa). */
function conferirXml(xml: string, onde: string): void {
  if (PROIBIDO.test(xml)) throw new ErroPlanilha(`${onde}: o XML tem DOCTYPE, ENTITY ou CDATA, que o leitor recusa.`)
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/** Decodifica as 5 entidades predefinidas e referências numéricas; qualquer outra entidade é erro. */
export function decodificarEntidades(texto: string): string {
  if (!texto.includes('&')) return texto
  return texto.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|[A-Za-z]{1,8});/g, (_m, ref: string) => {
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      const valido = cp === 0x9 || cp === 0xa || cp === 0xd || (cp >= 0x20 && cp <= 0xd7ff) || (cp >= 0xe000 && cp <= 0xfffd) || (cp >= 0x10000 && cp <= 0x10ffff)
      if (!valido) throw new ErroPlanilha('O XML tem uma referência numérica inválida.')
      return String.fromCodePoint(cp)
    }
    const e = ENTIDADES[ref]
    if (e === undefined) throw new ErroPlanilha('O XML tem uma entidade que o leitor recusa.')
    return e
  })
}

function limpar(texto: string, max: number): string {
  return texto.replace(CONTROLE, '').slice(0, max).trim()
}

const ATRIBUTO = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
function atributos(trecho: string): Map<string, string> {
  const m = new Map<string, string>()
  ATRIBUTO.lastIndex = 0
  for (let r = ATRIBUTO.exec(trecho); r; r = ATRIBUTO.exec(trecho)) m.set(r[1]!, decodificarEntidades(r[2] ?? r[3] ?? ''))
  return m
}

/** Coluna de uma referência `A1`/`AB12` (1 = A). */
export function colunaDaReferencia(ref: string): number {
  const m = /^([A-Z]{1,3})\d*$/.exec(ref)
  if (!m) throw new ErroPlanilha('Referência de célula inválida.')
  let n = 0
  for (const ch of m[1]!) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n
}

interface Elemento {
  /** Texto dos atributos (entre o nome e o `>`). */
  atributos: string
  /** Conteúdo entre a abertura e o fechamento (vazio se a tag é autofechada). */
  corpo: string
  /** Posição logo depois do elemento. */
  fim: number
}

/** Abertura de tag com mais que isto é recusada: os atributos reais têm algumas dezenas de caracteres, e a leitura deles não pode ficar quadrática. */
const MAX_ABERTURA = 1000

const ESPACO_OU_FIM = new Set([9, 10, 13, 32, 47, 62]) // tab, LF, CR, espaço, "/" e ">"

/**
 * Próximo elemento `<nome ...>…</nome>` (ou autofechado) a partir de `de`, por `indexOf` (tempo linear: cada busca anda para frente).
 * Tag sem `>` ou elemento sem fechamento é RECUSADO: nunca se varre o resto do arquivo de novo a cada tag (regex lenta com `<si>` repetido).
 */
function proximoElemento(xml: string, nome: string, de: number): Elemento | undefined {
  let i = de
  for (;;) {
    i = xml.indexOf('<' + nome, i)
    if (i < 0) return undefined
    if (ESPACO_OU_FIM.has(xml.charCodeAt(i + 1 + nome.length))) break // `<c` não casa com `<cols`
    i += 1
  }
  const fechaAbertura = xml.indexOf('>', i)
  if (fechaAbertura < 0) throw new ErroPlanilha('O XML tem uma tag que não termina.')
  if (fechaAbertura - i > MAX_ABERTURA) throw new ErroPlanilha('O XML tem uma tag com atributos longos demais.')
  if (xml.charCodeAt(fechaAbertura - 1) === 47) return { atributos: xml.slice(i + 1 + nome.length, fechaAbertura - 1), corpo: '', fim: fechaAbertura + 1 }
  const fecha = xml.indexOf('</' + nome + '>', fechaAbertura + 1)
  if (fecha < 0) throw new ErroPlanilha('O XML tem um elemento sem fechamento.')
  return { atributos: xml.slice(i + 1 + nome.length, fechaAbertura), corpo: xml.slice(fechaAbertura + 1, fecha), fim: fecha + nome.length + 3 }
}

/** Textos de todos os `<t>` de um bloco, sem os de fonética (`rPh`). */
function textosDe(bloco: string, max: number): string {
  let limpo = bloco
  if (bloco.includes('<rPh')) {
    limpo = ''
    let pos = 0
    for (let e = proximoElemento(bloco, 'rPh', 0); e; e = proximoElemento(bloco, 'rPh', pos)) {
      const ini = bloco.indexOf('<rPh', pos)
      limpo += bloco.slice(pos, ini)
      pos = e.fim
    }
    limpo += bloco.slice(pos)
  }
  let out = ''
  for (let e = proximoElemento(limpo, 't', 0); e; e = proximoElemento(limpo, 't', e.fim)) out += decodificarEntidades(e.corpo)
  return limpar(out, max)
}

function lerTextosCompartilhados(xml: string, l: LimitesPlanilha): string[] {
  conferirXml(xml, 'sharedStrings')
  const out: string[] = []
  for (let e = proximoElemento(xml, 'si', 0); e; e = proximoElemento(xml, 'si', e.fim)) {
    if (out.length >= l.maxTextosCompartilhados) throw new ErroPlanilha(`A planilha tem mais de ${l.maxTextosCompartilhados} textos compartilhados.`)
    out.push(textosDe(e.corpo, l.maxTexto))
  }
  return out
}

function textoDoZip(zip: LeitorZip, nome: string): string {
  const dados = zip.ler(nome)
  // O nome pode vir do .rels do arquivo (texto livre, até com caractere de controle): só se cita um caminho simples
  if (!dados) throw new ErroPlanilha(/^[\w./-]{1,100}$/.test(nome) ? `Entrada "${nome}" ausente no xlsx.` : 'Uma entrada necessária ausente no xlsx.')
  return dados.toString('utf8')
}

/** Normaliza o alvo de uma relação (`worksheets/sheet1.xml` ou `/xl/worksheets/sheet1.xml`) para o caminho no zip. */
function caminhoDoAlvo(alvo: string): string {
  const sem = alvo.replace(/^\/+/, '')
  return sem.startsWith('xl/') ? sem : `xl/${sem}`
}

export function abrirPlanilha(zip: LeitorZip, limites: LimitesPlanilha = LIMITES_PLANILHA_PADRAO): Planilha {
  const workbook = textoDoZip(zip, 'xl/workbook.xml')
  conferirXml(workbook, 'workbook')
  const rels = textoDoZip(zip, 'xl/_rels/workbook.xml.rels')
  conferirXml(rels, 'workbook.xml.rels')

  const alvoPorId = new Map<string, string>()
  for (let e = proximoElemento(rels, 'Relationship', 0); e; e = proximoElemento(rels, 'Relationship', e.fim)) {
    const a = atributos(e.atributos)
    const id = a.get('Id')
    const alvo = a.get('Target')
    if (id && alvo) alvoPorId.set(id, caminhoDoAlvo(alvo))
  }
  const caminhos = new Map<string, string>()
  for (let e = proximoElemento(workbook, 'sheet', 0); e; e = proximoElemento(workbook, 'sheet', e.fim)) {
    const a = atributos(e.atributos)
    const nome = a.get('name')
    const id = a.get('r:id') ?? [...a.entries()].find(([k]) => k.endsWith(':id'))?.[1]
    const caminho = id ? alvoPorId.get(id) : undefined
    if (nome && caminho) caminhos.set(nome, caminho)
  }
  if (!caminhos.size) throw new ErroPlanilha('Nenhuma aba encontrada no workbook.')

  let compartilhados: string[] | undefined
  const textos = () => (compartilhados ??= zip.entradas.some((e) => e.nome === 'xl/sharedStrings.xml') ? lerTextosCompartilhados(textoDoZip(zip, 'xl/sharedStrings.xml'), limites) : [])

  function* linhas(aba: string): Generator<Linha> {
    const caminho = caminhos.get(aba)
    if (!caminho) throw new ErroPlanilha(`Aba "${aba}" não encontrada.`)
    const xml = textoDoZip(zip, caminho)
    conferirXml(xml, `aba "${aba}"`)
    const partilhados = textos()
    let n = 0
    let ultimaLinha = 0
    for (let r = proximoElemento(xml, 'row', 0); r; r = proximoElemento(xml, 'row', r.fim)) {
      if (++n > limites.maxLinhas) throw new ErroPlanilha(`A aba "${aba}" tem mais de ${limites.maxLinhas} linhas.`)
      const a = atributos(r.atributos)
      const numero = a.has('r') ? Number(a.get('r')) : ultimaLinha + 1
      if (!Number.isInteger(numero) || numero < 1) throw new ErroPlanilha('Número de linha inválido.')
      ultimaLinha = numero
      const celulas: Celula[] = []
      const corpo = r.corpo
      let ultimaColuna = 0
      for (let c = proximoElemento(corpo, 'c', 0); c; c = proximoElemento(corpo, 'c', c.fim)) {
        const ca = atributos(c.atributos)
        const ref = ca.get('r')
        const coluna = ref ? colunaDaReferencia(ref) : ultimaColuna + 1
        if (coluna > limites.maxColunas) throw new ErroPlanilha(`A aba "${aba}" tem mais de ${limites.maxColunas} colunas.`)
        ultimaColuna = coluna
        const interno = c.corpo
        if (!interno) continue // célula vazia (só estilo)
        const celula: Celula = { coluna }
        const f = proximoElemento(interno, 'f', 0)
        if (f?.corpo) celula.formula = limpar(decodificarEntidades(f.corpo), limites.maxTexto)
        const tipo = ca.get('t') ?? 'n'
        if (tipo === 'inlineStr') {
          const is = proximoElemento(interno, 'is', 0)
          if (is) celula.valor = textosDe(is.corpo, limites.maxTexto)
        } else {
          const bruto = proximoElemento(interno, 'v', 0)?.corpo
          if (bruto !== undefined && bruto !== '') {
            if (tipo === 's') {
              const i = Number(bruto)
              if (!Number.isInteger(i) || i < 0 || i >= partilhados.length) throw new ErroPlanilha('Índice de texto compartilhado inválido.')
              celula.valor = partilhados[i]
            } else if (tipo === 'str' || tipo === 'e') celula.valor = limpar(decodificarEntidades(bruto), limites.maxTexto)
            else if (tipo === 'b') celula.valor = bruto === '1' ? 1 : 0
            else {
              const num = Number(bruto)
              if (!Number.isFinite(num)) throw new ErroPlanilha('Valor numérico inválido na planilha.')
              celula.valor = num
            }
          }
        }
        if (celula.valor !== undefined || celula.formula !== undefined) celulas.push(celula)
      }
      yield { numero, celulas }
    }
  }

  return { abas: [...caminhos.keys()], linhas }
}
