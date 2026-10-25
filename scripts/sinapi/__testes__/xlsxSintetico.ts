/// <reference types="node" />
// Monta xlsx sintéticos (zip + SpreadsheetML mínimo) para os testes do leitor. Só para teste.
import { criarZipSintetico, type EntradaSintetica } from './zipSintetico.ts'

/** Texto (vai para os textos compartilhados), número, fórmula com valor em cache, ou vazio. */
export type CelulaSintetica = string | number | null | { formula: string; valor?: number | string }
export interface AbaSintetica {
  nome: string
  linhas: CelulaSintetica[][]
}
export interface OpcoesXlsxSintetico {
  /** Texto cru inserido no início de `xl/sharedStrings.xml` (teste de DOCTYPE/ENTITY). */
  prefixoSharedStrings?: string
  /** Texto cru inserido no início da 1ª aba. */
  prefixoAba?: string
  /** Texto cru inserido no início de `xl/workbook.xml`. */
  prefixoWorkbook?: string
  /** XML cru das linhas (`<row>…</row>`) que substitui as da 1ª aba. */
  linhasBrutas?: string
  /** XML cru dos `<si>` que substitui os textos compartilhados gerados. */
  sharedStringsBruto?: string
  /** Entradas extras do zip. */
  extras?: EntradaSintetica[]
  /** Omite o sharedStrings (todos os textos viram `inlineStr`). */
  semSharedStrings?: boolean
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function nomeDaColuna(i: number): string {
  let n = i + 1
  let s = ''
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

export function criarXlsxSintetico(abas: AbaSintetica[], opcoes: OpcoesXlsxSintetico = {}): Buffer {
  const textos: string[] = []
  const posicao = new Map<string, number>()
  const indice = (t: string) => {
    let i = posicao.get(t)
    if (i === undefined) {
      i = textos.push(t) - 1
      posicao.set(t, i)
    }
    return i
  }
  const folhas = abas.map((aba, k) => {
    const linhas = aba.linhas
      .map((cels, r) => {
        const corpo = cels
          .map((c, col) => {
            if (c === null) return ''
            const ref = `${nomeDaColuna(col)}${r + 1}`
            if (typeof c === 'number') return `<c r="${ref}"><v>${c}</v></c>`
            if (typeof c === 'string') {
              return opcoes.semSharedStrings ? `<c r="${ref}" t="inlineStr"><is><t>${esc(c)}</t></is></c>` : `<c r="${ref}" t="s"><v>${indice(c)}</v></c>`
            }
            const v = c.valor === undefined ? '<v>0</v>' : `<v>${c.valor}</v>`
            return `<c r="${ref}"><f>${esc(c.formula)}</f>${v}</c>`
          })
          .join('')
        return `<row r="${r + 1}">${corpo}</row>`
      })
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${k === 0 ? (opcoes.prefixoAba ?? '') : ''}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${k === 0 && opcoes.linhasBrutas !== undefined ? opcoes.linhasBrutas : linhas}</sheetData></worksheet>`
  })
  const workbook =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + (opcoes.prefixoWorkbook ?? '') + '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
    abas.map((a, k) => `<sheet name="${esc(a.nome)}" sheetId="${k + 1}" r:id="rId${k + 1}"/>`).join('') +
    '</sheets></workbook>'
  const rels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    abas.map((_a, k) => `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${k + 1}.xml"/>`).join('') +
    '</Relationships>'
  const entradas: EntradaSintetica[] = [
    { nome: 'xl/workbook.xml', dados: workbook },
    { nome: 'xl/_rels/workbook.xml.rels', dados: rels },
    ...folhas.map((x, k) => ({ nome: `xl/worksheets/sheet${k + 1}.xml`, dados: x })),
  ]
  if (!opcoes.semSharedStrings) {
    entradas.push({
      nome: 'xl/sharedStrings.xml',
      dados: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${opcoes.prefixoSharedStrings ?? ''}<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">${opcoes.sharedStringsBruto ?? textos.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`,
    })
  }
  return criarZipSintetico([...entradas, ...(opcoes.extras ?? [])])
}
