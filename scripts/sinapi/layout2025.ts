/// <reference types="node" />
// Leitor do layout 2025 da planilha nacional SINAPI_Referencia_AAAA_MM.xlsx (Caixa): abas CSD/CCD (custos) e Analítico.
// Colunas, UFs, encargos e mês são achados pelo TEXTO do cabeçalho (D-4), não pela posição: o layout muda entre publicações.
// O código da composição vem do 2º argumento da fórmula HYPERLINK da coluna B (D-3), nunca avaliada, e é conferido com o Analítico.
// Tudo que fugir do esperado é erro nomeado ("layout mudou"), nunca recorte parcial.
import { UFS, type RegimeSinapi } from '../../src/data/ufs.ts'
import { ehItemMaoDeObra, rupPorFuncao, type ItemAnalitico } from '../../src/lib/sinapiRup.ts'
import type { AbaCustos as NomeAbaCustos, FuncaoMaoDeObra } from '../../src/types/sinapi.ts'
import type { Celula, Linha, Planilha } from './planilha.ts'

export class ErroLayout extends Error {}

const MAX_LINHAS_CABECALHO = 30

/** Maiúsculas, sem acento e com espaços (inclusive quebras de linha) colapsados. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}
const colapsar = (texto: string) => texto.replace(/\s+/g, ' ').trim()

export interface CustoNaUf {
  custo: number
  percentualAS?: number
}

export interface ComposicaoCusto {
  codigo: string
  grupo: string
  descricao: string
  unidade: string
  custos: ReadonlyMap<string, CustoNaUf>
}

export interface AbaCustos {
  aba: NomeAbaCustos
  regime: RegimeSinapi
  /** AAAA-MM. */
  mes: string
  /** AAAA-MM-DD. */
  emissao: string
  ufs: readonly string[]
  encargos: ReadonlyMap<string, { horista: number; mensalista: number }>
  composicoes: ComposicaoCusto[]
}

export interface ComposicaoAnalitico {
  grupo: string
  descricao: string
  unidade: string
  situacao: string
  maoDeObra: FuncaoMaoDeObra[]
}

export interface Analitico {
  mes: string
  emissao: string
  composicoes: ReadonlyMap<string, ComposicaoAnalitico>
  contagens: { composicoes: number; itensComposicao: number; itensInsumo: number; itensMaoDeObra: number; funcoes: number }
}

export interface DadosSinapi {
  regime: RegimeSinapi
  mes: string
  emissao: string
  custos: AbaCustos
  analitico: Analitico
}

const ABA_DO_REGIME: Record<RegimeSinapi, NomeAbaCustos> = { 'nao-desonerado': 'CSD', desonerado: 'CCD' }
const SIGLAS = new Set<string>(UFS.map((u) => u.sigla))

const texto = (c: Celula | undefined): string => (c?.valor === undefined ? '' : String(c.valor))

/** Acha a aba pelo nome normalizado (sem acento, maiúsculas). */
function nomeDaAba(planilha: Planilha, alvo: string): string {
  const achada = planilha.abas.find((a) => normalizar(a) === alvo)
  if (!achada) throw new ErroLayout(`Aba "${alvo}" não encontrada na planilha (layout mudou).`)
  return achada
}

interface Cabecalho {
  topo: Linha[]
  cabecalho: Linha
  proximas: Generator<Linha>
}

/** Lê as linhas até o cabeçalho (a que tem "Código da Composição" nas 30 primeiras); o restante segue em fluxo. */
function lerAteOCabecalho(planilha: Planilha, aba: string): Cabecalho {
  const linhas = planilha.linhas(aba)
  const topo: Linha[] = []
  for (let r = linhas.next(); !r.done; r = linhas.next()) {
    const l = r.value
    if (l.numero > MAX_LINHAS_CABECALHO) break
    if (l.celulas.some((c) => normalizar(texto(c)) === 'CODIGO DA COMPOSICAO')) return { topo, cabecalho: l, proximas: linhas }
    topo.push(l)
  }
  throw new ErroLayout(`Aba "${aba}": coluna "Código da Composição" não encontrada nas ${MAX_LINHAS_CABECALHO} primeiras linhas (layout mudou).`)
}

function colunaDe(cabecalho: Linha, aba: string, rotulo: string): number {
  const c = cabecalho.celulas.find((x) => normalizar(texto(x)) === normalizar(rotulo))
  if (!c) throw new ErroLayout(`Aba "${aba}": coluna "${rotulo}" ausente (layout mudou).`)
  return c.coluna
}

/** Valor da célula à direita de um rótulo ("Mês de Referência:" → "09/2026"). */
function valorAoLado(topo: readonly Linha[], rotulo: string): string | undefined {
  for (const l of topo) {
    const i = l.celulas.findIndex((c) => normalizar(texto(c)) === rotulo)
    if (i >= 0) return l.celulas.slice(i + 1).map(texto).find((t) => t !== '')
  }
  return undefined
}

function mesDe(topo: readonly Linha[], aba: string): string {
  const v = valorAoLado(topo, 'MES DE REFERENCIA:')
  const m = v ? /^(0[1-9]|1[0-2])\/(\d{4})$/.exec(v.trim()) : null
  if (!m) throw new ErroLayout(`Aba "${aba}": "Mês de Referência" ausente ou fora do formato MM/AAAA (layout mudou).`)
  return `${m[2]}-${m[1]}`
}

function emissaoDe(topo: readonly Linha[], aba: string): string {
  const v = valorAoLado(topo, 'DATA DE EMISSAO:')
  const m = v ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v.trim()) : null
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : ''
  if (!m || new Date(`${iso}T00:00:00Z`).toISOString().slice(0, 10) !== iso) throw new ErroLayout(`Aba "${aba}": "Data de emissão" ausente ou inválida (layout mudou).`)
  return iso
}

function numero(c: Celula | undefined): number | undefined {
  return typeof c?.valor === 'number' && Number.isFinite(c.valor) ? c.valor : undefined
}

/** Código = 2º argumento da fórmula `HYPERLINK(..., 104658)`; sem fórmula, um número inteiro literal. Nunca avalia a fórmula. */
function codigoDaCelula(c: Celula | undefined): string | undefined {
  if (c?.formula !== undefined) {
    const m = /,\s*(\d{1,7})\s*\)\s*$/.exec(c.formula)
    return m ? m[1] : undefined
  }
  if (typeof c?.valor === 'number' && Number.isInteger(c.valor) && c.valor > 0) return String(c.valor)
  if (typeof c?.valor === 'string' && /^\d{1,7}$/.test(c.valor)) return c.valor
  return undefined
}

/** Lê a aba de custos (`CSD` ou `CCD`) com todas as UFs. */
export function lerCustos(planilha: Planilha, regime: RegimeSinapi): AbaCustos {
  const abaEsperada = ABA_DO_REGIME[regime]
  const aba = nomeDaAba(planilha, abaEsperada)
  const { topo, cabecalho, proximas } = lerAteOCabecalho(planilha, aba)

  // Regime pelo título: a aba CCD com título "SEM DESONERAÇÃO" (ou o inverso) é erro
  const titulo = topo.map((l) => l.celulas.map((c) => normalizar(texto(c))).join(' ')).find((t) => t.includes('RELATORIO DE CUSTOS DE COMPOSICOES'))
  if (!titulo) throw new ErroLayout(`Aba "${aba}": título do relatório ausente (layout mudou).`)
  const regimeDoTitulo: RegimeSinapi | undefined = titulo.includes('SEM DESONERACAO') ? 'nao-desonerado' : titulo.includes('COM DESONERACAO') ? 'desonerado' : undefined
  if (regimeDoTitulo !== regime) throw new ErroLayout(`Aba "${aba}": o título não corresponde ao regime esperado (${regime === 'desonerado' ? 'COM' : 'SEM'} DESONERAÇÃO).`)

  const mes = mesDe(topo, aba)
  const emissao = emissaoDe(topo, aba)
  const colGrupo = colunaDe(cabecalho, aba, 'Grupo')
  const colCodigo = colunaDe(cabecalho, aba, 'Código da Composição')
  const colDescricao = colunaDe(cabecalho, aba, 'Descrição')
  const colUnidade = colunaDe(cabecalho, aba, 'Unidade')

  // Cada "Custo (R$)" é de uma UF (a sigla está na linha de cima) e o "%AS" fica logo à direita
  const colunasCusto = cabecalho.celulas.filter((c) => normalizar(texto(c)) === 'CUSTO (R$)')
  if (!colunasCusto.length) throw new ErroLayout(`Aba "${aba}": colunas "Custo (R$)" ausentes (layout mudou).`)
  const linhaUf = topo.find((l) => l.numero === cabecalho.numero - 1)
  const ufs: string[] = []
  const colunaDaUf = new Map<string, { custo: number; as?: number }>()
  for (const c of colunasCusto) {
    const sigla = normalizar(texto(linhaUf?.celulas.find((x) => x.coluna === c.coluna)))
    if (!SIGLAS.has(sigla)) throw new ErroLayout(`Aba "${aba}": sigla de UF ausente ou inválida acima de uma coluna "Custo (R$)" (layout mudou).`)
    if (colunaDaUf.has(sigla)) throw new ErroLayout(`Aba "${aba}": UF repetida no cabeçalho (layout mudou).`)
    const aoLado = cabecalho.celulas.find((x) => x.coluna === c.coluna + 1)
    ufs.push(sigla)
    colunaDaUf.set(sigla, { custo: c.coluna, as: aoLado && normalizar(texto(aoLado)) === '%AS' ? aoLado.coluna : undefined })
  }

  // Encargos: linhas "Horista" e "Mensalista" acima do cabeçalho, com o valor sob cada UF
  const encargos = new Map<string, { horista: number; mensalista: number }>()
  const doRotulo = (rotulo: string) => topo.find((l) => l.celulas.some((c) => normalizar(texto(c)) === rotulo))
  const linhaHorista = doRotulo('HORISTA')
  const linhaMensalista = doRotulo('MENSALISTA')
  if (!linhaHorista || !linhaMensalista) throw new ErroLayout(`Aba "${aba}": linhas de encargos "Horista" e "Mensalista" ausentes (layout mudou).`)
  for (const uf of ufs) {
    const col = colunaDaUf.get(uf)!.custo
    const h = numero(linhaHorista.celulas.find((c) => c.coluna === col))
    const m = numero(linhaMensalista.celulas.find((c) => c.coluna === col))
    if (h === undefined || m === undefined) throw new ErroLayout(`Aba "${aba}": encargos ausentes para uma UF (layout mudou).`)
    encargos.set(uf, { horista: h, mensalista: m })
  }

  const composicoes: ComposicaoCusto[] = []
  const codigos = new Set<string>()
  for (const l of proximas) {
    const porColuna = new Map(l.celulas.map((c) => [c.coluna, c]))
    const descricao = colapsar(texto(porColuna.get(colDescricao)))
    const grupo = colapsar(texto(porColuna.get(colGrupo)))
    if (!descricao && !grupo && !porColuna.has(colCodigo)) continue // linha em branco no fim
    const codigo = codigoDaCelula(porColuna.get(colCodigo))
    if (!codigo) throw new ErroLayout(`Aba "${aba}", linha ${l.numero}: código da composição sem a fórmula HYPERLINK (layout mudou).`)
    if (codigos.has(codigo)) throw new ErroLayout(`Aba "${aba}": código ${codigo} repetido.`)
    codigos.add(codigo)
    const unidade = colapsar(texto(porColuna.get(colUnidade)))
    if (!descricao || !unidade) throw new ErroLayout(`Aba "${aba}", código ${codigo}: descrição ou unidade ausente.`)
    const custos = new Map<string, CustoNaUf>()
    for (const uf of ufs) {
      const col = colunaDaUf.get(uf)!
      const custo = numero(porColuna.get(col.custo))
      if (custo === undefined) continue
      const as = col.as === undefined ? undefined : numero(porColuna.get(col.as))
      custos.set(uf, as === undefined ? { custo } : { custo, percentualAS: as })
    }
    composicoes.push({ codigo, grupo, descricao, unidade, custos })
  }
  if (!composicoes.length) throw new ErroLayout(`Aba "${aba}": nenhuma composição encontrada.`)
  return { aba: abaEsperada, regime, mes, emissao, ufs, encargos, composicoes }
}

/** Lê o Analítico: composições com situação e mão de obra por função, mais as contagens de itens. */
export function lerAnalitico(planilha: Planilha): Analitico {
  const aba = nomeDaAba(planilha, 'ANALITICO')
  const { topo, cabecalho, proximas } = lerAteOCabecalho(planilha, aba)
  const mes = mesDe(topo, aba)
  const emissao = emissaoDe(topo, aba)
  const colCodigo = colunaDe(cabecalho, aba, 'Código da Composição')
  const colGrupo = colunaDe(cabecalho, aba, 'Grupo')
  const colTipo = colunaDe(cabecalho, aba, 'Tipo Item')
  const colItem = colunaDe(cabecalho, aba, 'Código do Item')
  const colDescricao = colunaDe(cabecalho, aba, 'Descrição')
  const colUnidade = colunaDe(cabecalho, aba, 'Unidade')
  const colCoef = colunaDe(cabecalho, aba, 'Coeficiente')
  const colSituacao = colunaDe(cabecalho, aba, 'Situação')

  interface Parcial extends Omit<ComposicaoAnalitico, 'maoDeObra'> {
    itens: ItemAnalitico[]
  }
  const parciais = new Map<string, Parcial>()
  let itensComposicao = 0
  let itensInsumo = 0
  let itensMaoDeObra = 0
  const codigoDe = (c: Celula | undefined): string | undefined => {
    const v = c?.valor
    const t = typeof v === 'number' && Number.isInteger(v) ? String(v) : typeof v === 'string' ? v.trim() : ''
    return /^\d{1,7}$/.test(t) ? t : undefined
  }

  for (const l of proximas) {
    const p = new Map(l.celulas.map((c) => [c.coluna, c]))
    if (!p.has(colCodigo)) continue
    const codigo = codigoDe(p.get(colCodigo))
    if (!codigo) throw new ErroLayout(`Aba "${aba}", linha ${l.numero}: código da composição inválido.`)
    const tipo = normalizar(texto(p.get(colTipo)))
    if (!tipo) {
      if (parciais.has(codigo)) throw new ErroLayout(`Aba "${aba}": composição ${codigo} repetida.`)
      parciais.set(codigo, {
        grupo: colapsar(texto(p.get(colGrupo))),
        descricao: colapsar(texto(p.get(colDescricao))),
        unidade: colapsar(texto(p.get(colUnidade))),
        situacao: normalizar(texto(p.get(colSituacao))),
        itens: [],
      })
      continue
    }
    const comp = parciais.get(codigo)
    if (!comp) throw new ErroLayout(`Aba "${aba}", linha ${l.numero}: item antes da linha da composição ${codigo} (layout mudou).`)
    if (tipo === 'COMPOSICAO') itensComposicao++
    else if (tipo === 'INSUMO') itensInsumo++
    else throw new ErroLayout(`Aba "${aba}", linha ${l.numero}: tipo de item desconhecido (layout mudou).`)
    const item = { tipoItem: tipo, descricao: colapsar(texto(p.get(colDescricao))), unidade: colapsar(texto(p.get(colUnidade))) }
    if (ehItemMaoDeObra(item)) {
      const coeficiente = numero(p.get(colCoef))
      const codigoItem = codigoDe(p.get(colItem))
      if (coeficiente === undefined || !codigoItem) throw new ErroLayout(`Aba "${aba}", composição ${codigo}: item de mão de obra sem código ou coeficiente numérico.`)
      itensMaoDeObra++
      comp.itens.push({ ...item, codigo: codigoItem, coeficiente })
    }
  }
  if (!parciais.size) throw new ErroLayout(`Aba "${aba}": nenhuma composição encontrada.`)

  const composicoes = new Map<string, ComposicaoAnalitico>()
  const funcoes = new Set<string>()
  for (const [codigo, { itens, ...resto }] of parciais) {
    const maoDeObra = rupPorFuncao(itens)
    for (const f of maoDeObra) funcoes.add(f.funcao)
    composicoes.set(codigo, { ...resto, maoDeObra })
  }
  return { mes, emissao, composicoes, contagens: { composicoes: composicoes.size, itensComposicao, itensInsumo, itensMaoDeObra, funcoes: funcoes.size } }
}

/** Mês (AAAA-MM) do nome `SINAPI_Referencia_AAAA_MM.xlsx`, ou `undefined` se o nome não segue o padrão. */
export function mesDoNomeDoArquivo(nome: string): string | undefined {
  const m = /(\d{4})_(0[1-9]|1[0-2])\.xlsx$/i.exec(normalizar(nome))
  return m ? `${m[1]}-${m[2]}` : undefined
}

/**
 * Lê a aba de custos do regime e o Analítico, e confere: mesmo mês nas duas abas (e no nome do arquivo, se informado),
 * cada código das abas de custo existe no Analítico com a mesma descrição e unidade (D-3).
 */
export function lerSinapi(planilha: Planilha, regime: RegimeSinapi, mesEsperado?: string): DadosSinapi {
  const custos = lerCustos(planilha, regime)
  const analitico = lerAnalitico(planilha)
  if (custos.mes !== analitico.mes) throw new ErroLayout(`Mês de referência divergente entre a aba ${custos.aba} (${custos.mes}) e o Analítico (${analitico.mes}).`)
  if (mesEsperado !== undefined && mesEsperado !== custos.mes) throw new ErroLayout(`O mês de referência da planilha (${custos.mes}) não é o esperado (${mesEsperado}).`)
  let ausentes = 0
  let divergentes = 0
  let primeiro: string | undefined
  for (const c of custos.composicoes) {
    const a = analitico.composicoes.get(c.codigo)
    if (!a) {
      ausentes++
      primeiro ??= c.codigo
    } else if (a.descricao !== c.descricao || a.unidade !== c.unidade) {
      divergentes++
      primeiro ??= c.codigo
    }
  }
  if (ausentes || divergentes) {
    throw new ErroLayout(
      `A aba ${custos.aba} diverge do Analítico: ${ausentes} código(s) ausente(s) e ${divergentes} com descrição ou unidade diferente (o primeiro: ${primeiro}). O layout mudou: o código vem da fórmula HYPERLINK.`,
    )
  }
  return { regime, mes: custos.mes, emissao: custos.emissao, custos, analitico }
}
