// Recorte SINAPI (ciclo 00006): validação do JSON importado (dado externo, nunca instrução), chave, conferência com a obra,
// busca e conversão da composição em item/linha da calculadora e da planilha.
import { REGIMES_SINAPI, ROTULO_REGIME_SINAPI, UFS, type RegimeSinapi } from '@/data/ufs'
import type { ProjectMeta } from '@/types/domain'
import type { RegistroRecorte } from '@/types/obra'
import {
  FORMATO_RECORTE,
  VERSAO_RECORTE,
  type ComposicaoRecorte,
  type FuncaoMaoDeObra,
  type ItemCatalogoSinapi,
  type RecorteSinapi,
} from '@/types/sinapi'
import type { BudgetLine } from './sinapiBudget'
import { inferGroup } from './sinapiBudget'
import { equipeDaComposicao, rotuloFuncao } from './sinapiRup'
import { normalizeText } from './wbs'

/** Tamanho máximo do arquivo do recorte, conferido por `file.size` ANTES de ler. O recorte SP sem filtro tem 3,46 MB compacto e 4,77 MB indentado. */
export const MAX_RECORTE_BYTES = 6 * 1024 * 1024
/** Limites com folga sobre a medição de 09/2026 (plano, seção 05). */
export const LIMITES_RECORTE = {
  composicoes: 12_000,
  descricao: 400,
  grupo: 160,
  maoDeObra: 16,
  funcao: 60,
  custoMax: 10_000_000,
  coeficienteMax: 10_000,
  encargosMax: 3,
  arquivo: 120,
  textoCurto: 200,
  filtros: 12_000,
} as const
const MAX_ERROS = 20
export const MAX_RESULTADOS_BUSCA = 50

const REGEX_DATA_BASE = /^\d{4}-(0[1-9]|1[0-2])$/
const REGEX_CODIGO = /^\d{1,7}$/
const REGEX_UNIDADE = /^[A-Z0-9]{1,8}$/
const REGEX_SHA = /^[0-9a-f]{64}$/
// eslint-disable-next-line no-control-regex -- é justamente o que se quer recusar
const CONTROLE = /[\u0000-\u001f\u007f-\u009f]/

export type ResultadoRecorte = { ok: true; recorte: RecorteSinapi } | { ok: false; erros: string[] }

type Obj = Record<string, unknown>
const eObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
/** Lê só propriedade própria: nada herdado do protótipo entra no objeto reconstruído. */
const campo = (o: Obj, k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined)
const eNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const texto = (v: unknown, max: number, min = 1): v is string => typeof v === 'string' && v.length >= min && v.length <= max && !CONTROLE.test(v)

function dataIso(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

export const chaveRecorte = (uf: string, regime: string, dataBase: string) => `${uf}|${regime}|${dataBase}`

/** Confere a forma `UF|regime|AAAA-MM` de uma chave lida do armazenamento; devolve as partes ou `undefined`. */
export function lerChaveRecorte(chave: unknown): { uf: string; regime: RegimeSinapi; dataBase: string } | undefined {
  if (typeof chave !== 'string') return undefined
  const [uf, regime, dataBase, resto] = chave.split('|')
  if (resto !== undefined || !UFS.some((u) => u.sigla === uf)) return undefined
  if (!(REGIMES_SINAPI as readonly string[]).includes(regime ?? '') || !REGEX_DATA_BASE.test(dataBase ?? '')) return undefined
  return { uf: uf!, regime: regime as RegimeSinapi, dataBase: dataBase! }
}

const mesAno = (dataBase: string) => `${dataBase.slice(5, 7)}/${dataBase.slice(0, 4)}`

/** "SP 09/2026 não desonerado". */
export function descreverChave(uf: string, regime: RegimeSinapi, dataBase: string): string {
  return `${uf} ${mesAno(dataBase)} ${ROTULO_REGIME_SINAPI[regime].toLowerCase()}`
}

/** Fonte citada na tela, nas linhas da planilha e nas notas: "SINAPI SP 09/2026 não desonerado". */
export function descreverFonte(r: Pick<RecorteSinapi, 'uf' | 'regime' | 'dataBase'>): string {
  return `SINAPI ${descreverChave(r.uf, r.regime, r.dataBase)}`
}

function validarComposicao(c: unknown, i: number, codigos: Set<string>, erros: string[]): ComposicaoRecorte | undefined {
  const rot = `composicoes[${i}]`
  if (!eObj(c)) return void erros.push(`${rot}: formato inválido.`)
  const codigo = campo(c, 'codigo')
  const descricao = campo(c, 'descricao')
  const unidade = campo(c, 'unidade')
  const grupo = campo(c, 'grupo')
  const custo = campo(c, 'custoUnitario')
  const mo = campo(c, 'maoDeObra')
  const as = campo(c, 'percentualAS')
  const antes = erros.length
  if (typeof codigo !== 'string' || !REGEX_CODIGO.test(codigo)) erros.push(`${rot}: código inválido.`)
  else if (codigos.has(codigo)) erros.push(`${rot}: código repetido no recorte.`)
  if (!texto(descricao, LIMITES_RECORTE.descricao)) erros.push(`${rot}: descrição inválida (1 a ${LIMITES_RECORTE.descricao} caracteres, sem controle).`)
  if (typeof unidade !== 'string' || !REGEX_UNIDADE.test(unidade)) erros.push(`${rot}: unidade inválida.`)
  if (!texto(grupo, LIMITES_RECORTE.grupo, 0)) erros.push(`${rot}: grupo inválido (até ${LIMITES_RECORTE.grupo} caracteres).`)
  if (!eNumero(custo) || custo <= 0 || custo > LIMITES_RECORTE.custoMax) erros.push(`${rot}: custo unitário inválido.`)
  if (as !== undefined && (!eNumero(as) || as < 0 || as > 100)) erros.push(`${rot}: %AS fora de 0 a 100.`)
  const maoDeObra: FuncaoMaoDeObra[] = []
  if (!Array.isArray(mo) || mo.length > LIMITES_RECORTE.maoDeObra) erros.push(`${rot}: mão de obra inválida (até ${LIMITES_RECORTE.maoDeObra} funções).`)
  else {
    mo.forEach((m, j) => {
      const r = `${rot}.maoDeObra[${j}]`
      if (!eObj(m)) return void erros.push(`${r}: formato inválido.`)
      const cod = campo(m, 'codigo')
      const fun = campo(m, 'funcao')
      const coef = campo(m, 'coeficiente')
      if (typeof cod !== 'string' || !REGEX_CODIGO.test(cod)) erros.push(`${r}: código inválido.`)
      else if (!texto(fun, LIMITES_RECORTE.funcao)) erros.push(`${r}: função inválida (1 a ${LIMITES_RECORTE.funcao} caracteres).`)
      else if (!eNumero(coef) || coef <= 0 || coef > LIMITES_RECORTE.coeficienteMax) erros.push(`${r}: coeficiente inválido.`)
      else maoDeObra.push({ codigo: cod, funcao: fun, coeficiente: coef })
    })
  }
  if (erros.length > antes) return undefined
  codigos.add(codigo as string)
  const out: ComposicaoRecorte = {
    codigo: codigo as string,
    descricao: descricao as string,
    unidade: unidade as string,
    grupo: grupo as string,
    custoUnitario: custo as number,
    maoDeObra,
  }
  if (as !== undefined) out.percentualAS = as as number
  return out
}

/**
 * Valida o recorte (dado externo) e RECONSTRÓI o objeto só com os campos do esquema v1: chaves desconhecidas, `__proto__` e
 * `constructor` não passam (OWASP Prototype Pollution Prevention). Mesmo validador na importação, na leitura do IndexedDB e no teste do gerador.
 * As mensagens não repetem o conteúdo do arquivo (só o índice e o nome do campo).
 */
export function validarRecorteSinapi(entrada: unknown): ResultadoRecorte {
  if (!eObj(entrada) || campo(entrada, 'formato') !== FORMATO_RECORTE) return { ok: false, erros: ['Este arquivo não é um recorte SINAPI do CronoAI.'] }
  const versao = campo(entrada, 'versao')
  if (typeof versao === 'number' && Number.isInteger(versao) && versao > VERSAO_RECORTE) {
    return { ok: false, erros: [`Recorte gerado por uma versão mais nova do CronoAI (formato ${versao}).`] }
  }
  const erros: string[] = []
  if (versao !== VERSAO_RECORTE) erros.push('Versão do recorte inválida.')

  const uf = campo(entrada, 'uf')
  const regime = campo(entrada, 'regime')
  const dataBase = campo(entrada, 'dataBase')
  const ufOk = typeof uf === 'string' && UFS.some((u) => u.sigla === uf)
  const regimeOk = typeof regime === 'string' && (REGIMES_SINAPI as readonly string[]).includes(regime)
  if (!ufOk) erros.push('UF do recorte inválida.')
  if (!regimeOk) erros.push('Regime do recorte inválido.')
  if (typeof dataBase !== 'string' || !REGEX_DATA_BASE.test(dataBase)) erros.push('Data-base do recorte inválida (use AAAA-MM).')

  const f = campo(entrada, 'fonte')
  let fonte: RecorteSinapi['fonte'] | undefined
  if (!eObj(f)) erros.push('Fonte do recorte ausente.')
  else {
    const antesFonte = erros.length
    const aba = campo(f, 'abaCustos')
    const sha = campo(f, 'sha256')
    const bytes = campo(f, 'bytes')
    const pub = campo(f, 'publicacao')
    const arq = campo(f, 'arquivo')
    const emissao = campo(f, 'dataEmissao')
    const layout = campo(f, 'layout')
    const abaEsperada = regime === 'desonerado' ? 'CCD' : 'CSD'
    if (typeof sha !== 'string' || !REGEX_SHA.test(sha)) erros.push('Fonte: SHA-256 inválido.')
    if (!texto(arq, LIMITES_RECORTE.arquivo)) erros.push('Fonte: nome do arquivo inválido.')
    if (!texto(pub, LIMITES_RECORTE.textoCurto)) erros.push('Fonte: publicação inválida.')
    if (!dataIso(emissao)) erros.push('Fonte: data de emissão inválida.')
    if (!texto(layout, 20)) erros.push('Fonte: layout inválido.')
    if (!eNumero(bytes) || !Number.isInteger(bytes) || bytes < 0) erros.push('Fonte: tamanho do arquivo inválido.')
    if (aba !== 'CSD' && aba !== 'CCD') erros.push('Fonte: aba de custos inválida.')
    else if (regimeOk && aba !== abaEsperada) erros.push('Fonte: a aba de custos não corresponde ao regime.')
    if (erros.length === antesFonte) {
      fonte = { publicacao: pub as string, arquivo: arq as string, sha256: sha as string, bytes: bytes as number, dataEmissao: emissao as string, abaCustos: aba as 'CSD' | 'CCD', layout: layout as string }
    }
  }

  const enc = campo(entrada, 'encargos')
  let encargos: RecorteSinapi['encargos'] | undefined
  if (!eObj(enc)) erros.push('Encargos do recorte ausentes.')
  else {
    const h = campo(enc, 'horista')
    const m = campo(enc, 'mensalista')
    if (!eNumero(h) || h <= 0 || h > LIMITES_RECORTE.encargosMax || !eNumero(m) || m <= 0 || m > LIMITES_RECORTE.encargosMax) erros.push('Encargos inválidos (devem estar entre 0 e 3).')
    else encargos = { horista: h, mensalista: m }
  }

  const fil = campo(entrada, 'filtro')
  const filtro: RecorteSinapi['filtro'] = { codigos: [], grupos: [] }
  if (!eObj(fil)) erros.push('Filtro do recorte ausente.')
  else {
    const cods = campo(fil, 'codigos')
    const grs = campo(fil, 'grupos')
    if (!Array.isArray(cods) || cods.length > LIMITES_RECORTE.filtros || !cods.every((c) => typeof c === 'string' && REGEX_CODIGO.test(c))) erros.push('Filtro: códigos inválidos.')
    else filtro.codigos = cods as string[]
    if (!Array.isArray(grs) || grs.length > 200 || !grs.every((g) => texto(g, LIMITES_RECORTE.grupo))) erros.push('Filtro: grupos inválidos.')
    else filtro.grupos = grs as string[]
  }

  const tot = campo(entrada, 'totais')
  let totais: RecorteSinapi['totais'] | undefined
  const inteiroNaoNeg = (v: unknown): v is number => eNumero(v) && Number.isInteger(v) && v >= 0
  if (!eObj(tot)) erros.push('Totais do recorte ausentes.')
  else {
    const a = campo(tot, 'composicoes')
    const b = campo(tot, 'excluidasSemCusto')
    const c = campo(tot, 'excluidasCustoZeroNaUf')
    if (!inteiroNaoNeg(a) || !inteiroNaoNeg(b) || !inteiroNaoNeg(c)) erros.push('Totais inválidos.')
    else totais = { composicoes: a, excluidasSemCusto: b, excluidasCustoZeroNaUf: c }
  }

  const geradoEm = campo(entrada, 'geradoEm')
  if (!texto(geradoEm, 40) || Number.isNaN(Date.parse(geradoEm))) erros.push('Data de geração inválida.')

  const lista = campo(entrada, 'composicoes')
  const composicoes: ComposicaoRecorte[] = []
  if (!Array.isArray(lista) || lista.length < 1 || lista.length > LIMITES_RECORTE.composicoes) {
    erros.push(`O recorte deve ter de 1 a ${LIMITES_RECORTE.composicoes.toLocaleString('pt-BR')} composições.`)
  } else {
    const codigos = new Set<string>()
    for (let i = 0; i < lista.length && erros.length < MAX_ERROS; i++) {
      const c = validarComposicao(lista[i], i, codigos, erros)
      if (c) composicoes.push(c)
    }
  }

  if (erros.length || !fonte || !encargos || !totais) return { ok: false, erros: erros.slice(0, MAX_ERROS) }
  return {
    ok: true,
    recorte: {
      formato: FORMATO_RECORTE,
      versao: VERSAO_RECORTE,
      uf: uf as RecorteSinapi['uf'],
      regime: regime as RegimeSinapi,
      dataBase: dataBase as string,
      fonte,
      encargos,
      filtro,
      totais,
      geradoEm: geradoEm as string,
      composicoes,
    },
  }
}

/** Lê o texto do arquivo (JSON) e valida. JSON malformado, formato desconhecido e versão mais nova dão mensagens distintas. */
export function lerRecorteDeTexto(textoArquivo: string): ResultadoRecorte {
  let bruto: unknown
  try {
    bruto = JSON.parse(textoArquivo)
  } catch {
    return { ok: false, erros: ['O arquivo não é um JSON válido.'] }
  }
  return validarRecorteSinapi(bruto)
}

/** Confere o recorte com a UF, o regime e a data-base da obra. Devolve a mensagem de recusa, ou `undefined` se combina. */
export function conferirRecorteComObra(recorte: Pick<RecorteSinapi, 'uf' | 'regime' | 'dataBase'>, meta: Pick<ProjectMeta, 'uf' | 'regimeSinapi' | 'dataBaseSinapi'>): string | undefined {
  if (!meta.uf || !meta.regimeSinapi || !meta.dataBaseSinapi) return 'Informe UF, regime e data-base do SINAPI em Obras › Dados da obra antes de importar.'
  if (chaveRecorte(recorte.uf, recorte.regime, recorte.dataBase) === chaveRecorte(meta.uf, meta.regimeSinapi, meta.dataBaseSinapi)) return undefined
  const comPontos = (uf: string, regime: RegimeSinapi, dataBase: string) => descreverChave(uf, regime, dataBase).replace(/ /g, ' · ').replace('não · desonerado', 'não desonerado')
  return `O recorte é de ${comPontos(recorte.uf, recorte.regime, recorte.dataBase)}; esta obra é ${comPontos(meta.uf, meta.regimeSinapi, meta.dataBaseSinapi)}. Nada foi importado.`
}

/** Chave `UF|regime|AAAA-MM` dos dados SINAPI de uma obra; `undefined` se faltar UF, regime ou data-base (nunca se assume nenhum). */
export function chaveDaObra(meta: Pick<ProjectMeta, 'uf' | 'regimeSinapi' | 'dataBaseSinapi'>): string | undefined {
  return meta.uf && meta.regimeSinapi && meta.dataBaseSinapi ? chaveRecorte(meta.uf, meta.regimeSinapi, meta.dataBaseSinapi) : undefined
}

/** "SINAPI SP 09/2026 não desonerado" → "SINAPI SP 09/2026" (chip curto da planilha). */
export function rotuloCurtoDaFonte(fonte: string): string {
  return fonte.replace(/ (não )?desonerado$/, '')
}

/** "SINAPI SP 09/2026 não desonerado" → "SP 09/2026 não desonerado" (como entra nas notas da tarefa). */
export function fonteParaNotas(fonte: string): string {
  return fonte.replace(/^SINAPI /, '')
}

/** Monta o registro da store `recortesSinapi` a partir do recorte já validado (JSON compacto). */
export function montarRegistroDeRecorte(recorte: RecorteSinapi, importadoEm: string): RegistroRecorte {
  return {
    chave: chaveRecorte(recorte.uf, recorte.regime, recorte.dataBase),
    versaoFormato: recorte.versao,
    json: JSON.stringify(recorte),
    sha256Origem: recorte.fonte.sha256,
    importadoEm,
    composicoes: recorte.composicoes.length,
  }
}

export type LeituraDeRegistroRecorte =
  | { ok: true; recorte: RecorteSinapi; sha256Origem: string; importadoEm: string }
  | { ok: false; motivo: 'mais-novo' | 'invalido'; mensagem: string }

/**
 * Lê o registro da store `recortesSinapi` (dado externo: o IndexedDB pode estar adulterado). Confere forma e tamanho ANTES de interpretar o JSON,
 * valida de novo o recorte e exige que a chave, o SHA-256 e o número de composições do registro batam com o conteúdo.
 * Formato mais novo que o do app: `mais-novo` (o registro nunca é sobrescrito).
 */
export function lerRegistroDeRecorte(reg: unknown, chaveEsperada: string): LeituraDeRegistroRecorte {
  const invalido = (mensagem: string): LeituraDeRegistroRecorte => ({ ok: false, motivo: 'invalido', mensagem })
  if (!eObj(reg)) return invalido('O recorte SINAPI salvo neste navegador está ilegível: a obra usa o catálogo ilustrativo.')
  const versaoFormato = campo(reg, 'versaoFormato')
  if (typeof versaoFormato === 'number' && Number.isInteger(versaoFormato) && versaoFormato > VERSAO_RECORTE) {
    return { ok: false, motivo: 'mais-novo', mensagem: `O recorte SINAPI salvo foi gerado por uma versão mais nova do CronoAI (formato ${versaoFormato}): a obra usa o catálogo ilustrativo e o recorte não foi alterado.` }
  }
  const json = campo(reg, 'json')
  const sha = campo(reg, 'sha256Origem')
  const em = campo(reg, 'importadoEm')
  const n = campo(reg, 'composicoes')
  if (campo(reg, 'chave') !== chaveEsperada || versaoFormato !== VERSAO_RECORTE) return invalido('O recorte SINAPI salvo não corresponde a esta obra: a obra usa o catálogo ilustrativo.')
  if (typeof json !== 'string' || json.length > MAX_RECORTE_BYTES) return invalido('O recorte SINAPI salvo tem tamanho inválido: a obra usa o catálogo ilustrativo.')
  if (typeof sha !== 'string' || !REGEX_SHA.test(sha) || typeof em !== 'string' || em.length > 40 || Number.isNaN(Date.parse(em)) || typeof n !== 'number') {
    return invalido('O recorte SINAPI salvo está com os dados de controle inválidos: a obra usa o catálogo ilustrativo.')
  }
  const lido = lerRecorteDeTexto(json)
  if (!lido.ok) return invalido('O recorte SINAPI salvo está corrompido: a obra usa o catálogo ilustrativo.')
  const r = lido.recorte
  if (chaveRecorte(r.uf, r.regime, r.dataBase) !== chaveEsperada || r.fonte.sha256 !== sha || r.composicoes.length !== n) {
    return invalido('O recorte SINAPI salvo não confere com o registro: a obra usa o catálogo ilustrativo.')
  }
  return { ok: true, recorte: r, sha256Origem: sha, importadoEm: em }
}

/** M2 → m², M3 → m³, KG → kg, M → m, UN → un; o resto como publicado. */
export function unidadeParaExibicao(unidade: string): string {
  const mapa: Record<string, string> = { M2: 'm²', M3: 'm³', KG: 'kg', M: 'm', UN: 'un' }
  return mapa[unidade] ?? unidade
}

// ---------------------------------------------------------------------------
// Busca
// ---------------------------------------------------------------------------

export interface IndiceRecorte {
  composicoes: readonly ComposicaoRecorte[]
  /** Texto normalizado (sem acento, minúsculo) de cada composição, na mesma ordem: montado uma vez por recorte. */
  textos: readonly string[]
  porCodigo: ReadonlyMap<string, number>
}

export function indexarRecorte(recorte: Pick<RecorteSinapi, 'composicoes'>): IndiceRecorte {
  const porCodigo = new Map<string, number>()
  const textos = recorte.composicoes.map((c, i) => {
    porCodigo.set(c.codigo, i)
    return normalizeText(`${c.codigo} ${c.descricao} ${c.grupo}`)
  })
  return { composicoes: recorte.composicoes, textos, porCodigo }
}

/** Busca por código (prefixo) ou por texto (todas as palavras, sem acento), até `limite` resultados; códigos exatos primeiro. */
export function buscarComposicoes(indice: IndiceRecorte, consulta: string, limite = MAX_RESULTADOS_BUSCA): ComposicaoRecorte[] {
  const q = normalizeText(consulta).trim()
  if (!q) return []
  const exata = /^\d+$/.test(q) ? indice.porCodigo.get(q) : undefined
  const palavras = q.split(/\s+/)
  const out: ComposicaoRecorte[] = []
  if (exata !== undefined) out.push(indice.composicoes[exata]!)
  for (let i = 0; i < indice.textos.length && out.length < limite; i++) {
    if (i === exata) continue
    const t = indice.textos[i]!
    if (palavras.every((p) => t.includes(p))) out.push(indice.composicoes[i]!)
  }
  return out
}

// ---------------------------------------------------------------------------
// Composição → item da calculadora e linha da planilha
// ---------------------------------------------------------------------------

/**
 * Item da calculadora/planilha a partir da composição: custo publicado, RUP da função principal e demais funções em proporção dela.
 * Composição sem mão de obra: RUP 0 (a RUP é informada à mão, como hoje) e sem equipe por função.
 */
export function itemCatalogoDoRecorte(c: ComposicaoRecorte, recorte: Pick<RecorteSinapi, 'uf' | 'regime' | 'dataBase'>): ItemCatalogoSinapi {
  const eq = equipeDaComposicao(c.maoDeObra)
  return {
    code: c.codigo,
    description: c.descricao,
    unit: unidadeParaExibicao(c.unidade),
    rup: eq?.principal.coeficiente ?? 0,
    professional: eq ? rotuloFuncao(eq.principal.funcao) : 'Pedreiro',
    helperRatio: 0,
    unitCost: c.custoUnitario,
    group: inferGroup(c.descricao),
    ...(eq ? { equipe: eq.proporcoes } : {}),
    fonte: descreverFonte(recorte),
  }
}

/** Linha da planilha (sem id) a partir da composição do recorte. */
export function linhaDoRecorte(
  c: ComposicaoRecorte,
  recorte: Pick<RecorteSinapi, 'uf' | 'regime' | 'dataBase'>,
  quantidade: number,
  equipe: number,
  location = '',
): Omit<BudgetLine, 'id'> {
  const item = itemCatalogoDoRecorte(c, recorte)
  return {
    code: item.code,
    description: item.description,
    location,
    unit: item.unit,
    quantity: quantidade,
    rup: item.rup,
    unitCost: item.unitCost,
    professional: item.professional,
    helperRatio: item.helperRatio,
    team: equipe,
    group: item.group,
    ...(item.equipe ? { equipe: item.equipe } : {}),
    fonte: item.fonte,
  }
}
