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

/** Textos de todos os `<t>` de um bloco, sem os de fonética (`rPh`). */
function textosDe(bloco: string, max: number): string {
  const semFonetica = bloco.includes('<rPh') ? bloco.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '') : bloco
  let out = ''
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g
  for (let r = re.exec(semFonetica); r; r = re.exec(semFonetica)) out += decodificarEntidades(r[1] ?? '')
  return limpar(out, max)
}

function lerTextosCompartilhados(xml: string, l: LimitesPlanilha): string[] {
  conferirXml(xml, 'sharedStrings')
  const out: string[] = []
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g
  for (let r = re.exec(xml); r; r = re.exec(xml)) {
    if (out.length >= l.maxTextosCompartilhados) throw new ErroPlanilha(`A planilha tem mais de ${l.maxTextosCompartilhados} textos compartilhados.`)
    out.push(textosDe(r[1] ?? '', l.maxTexto))
  }
  return out
}

function textoDoZip(zip: LeitorZip, nome: string): string {
  const dados = zip.ler(nome)
  if (!dados) throw new ErroPlanilha(`Entrada "${nome}" ausente no xlsx.`)
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
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = atributos(m[1]!)
    const id = a.get('Id')
    const alvo = a.get('Target')
    if (id && alvo) alvoPorId.set(id, caminhoDoAlvo(alvo))
  }
  const caminhos = new Map<string, string>()
  for (const m of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const a = atributos(m[1]!)
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
    const reLinha = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
    const reCelula = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let n = 0
    let ultimaLinha = 0
    for (let r = reLinha.exec(xml); r; r = reLinha.exec(xml)) {
      if (++n > limites.maxLinhas) throw new ErroPlanilha(`A aba "${aba}" tem mais de ${limites.maxLinhas} linhas.`)
      const a = atributos(r[1]!)
      const numero = a.has('r') ? Number(a.get('r')) : ultimaLinha + 1
      if (!Number.isInteger(numero) || numero < 1) throw new ErroPlanilha('Número de linha inválido.')
      ultimaLinha = numero
      const celulas: Celula[] = []
      const corpo = r[2] ?? ''
      reCelula.lastIndex = 0
      let ultimaColuna = 0
      for (let c = reCelula.exec(corpo); c; c = reCelula.exec(corpo)) {
        const ca = atributos(c[1]!)
        const ref = ca.get('r')
        const coluna = ref ? colunaDaReferencia(ref) : ultimaColuna + 1
        if (coluna > limites.maxColunas) throw new ErroPlanilha(`A aba "${aba}" tem mais de ${limites.maxColunas} colunas.`)
        ultimaColuna = coluna
        const interno = c[2]
        if (!interno) continue // célula vazia (só estilo)
        const celula: Celula = { coluna }
        const f = /<f\b[^>]*?(?:\/>|>([\s\S]*?)<\/f>)/.exec(interno)
        if (f?.[1]) celula.formula = limpar(decodificarEntidades(f[1]), limites.maxTexto)
        const tipo = ca.get('t') ?? 'n'
        if (tipo === 'inlineStr') {
          const is = /<is\b[^>]*>([\s\S]*?)<\/is>/.exec(interno)
          if (is) celula.valor = textosDe(is[1]!, limites.maxTexto)
        } else {
          const v = /<v\b[^>]*?(?:\/>|>([\s\S]*?)<\/v>)/.exec(interno)
          const bruto = v?.[1]
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
