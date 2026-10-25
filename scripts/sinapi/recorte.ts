/// <reference types="node" />
// Monta o recorte de UMA UF, UM regime e UMA data-base a partir da planilha lida (D-7): só composições COM CUSTO com custo > 0 na UF,
// com a mão de obra por função do Analítico. A contagem do que ficou de fora vai em `totais`.
import { createHash } from 'node:crypto'
import { FORMATO_RECORTE, VERSAO_RECORTE, type ComposicaoRecorte, type RecorteSinapi } from '../../src/types/sinapi.ts'
import { normalizar, type DadosSinapi } from './layout2025.ts'

export class ErroRecorte extends Error {}

/** Cortes do esquema v1 (seção 05 do plano): o texto da planilha acima disso é cortado, nunca recusado. */
const MAX_DESCRICAO = 400
const MAX_GRUPO = 160
const MAX_FUNCAO = 60

export const PUBLICACAO_SINAPI = 'SINAPI — Caixa — Relatórios mensais (formato a partir de 2025)'
export const LAYOUT_SINAPI = '2025'

export interface FiltroRecorte {
  /** Códigos de composição a incluir. */
  codigos?: readonly string[]
  /** Grupos a incluir (sem diferença de acento ou caixa). */
  grupos?: readonly string[]
}

export interface OpcoesRecorte {
  uf: string
  filtro?: FiltroRecorte
  /** Nome do arquivo xlsx (sem pasta) e o que foi medido nele. */
  arquivo: string
  sha256: string
  bytes: number
  /** ISO; padrão = agora (injetável para teste). */
  geradoEm?: string
}

export function sha256Hex(dados: Uint8Array): string {
  return createHash('sha256').update(dados).digest('hex')
}

const cortar = (t: string, max: number) => (t.length > max ? t.slice(0, max).trim() : t)

/**
 * Filtros: com `codigos` e/ou `grupos`, entra a composição que casa com QUALQUER um (união); sem filtro, todas. Código ou grupo
 * pedido que não existe na planilha é erro (nunca recorte silenciosamente menor).
 */
export function montarRecorte(dados: DadosSinapi, o: OpcoesRecorte): RecorteSinapi {
  const { custos, analitico } = dados
  if (!custos.ufs.includes(o.uf)) throw new ErroRecorte(`A UF ${o.uf} não existe na aba ${custos.aba} da planilha.`)
  const codigos = new Set(o.filtro?.codigos ?? [])
  const grupos = new Map((o.filtro?.grupos ?? []).map((g) => [normalizar(g), g]))
  const comFiltro = codigos.size > 0 || grupos.size > 0

  const existentes = new Set(custos.composicoes.map((c) => c.codigo))
  const grupoExistente = new Set(custos.composicoes.map((c) => normalizar(c.grupo)))
  const faltaCodigo = [...codigos].filter((c) => !existentes.has(c))
  if (faltaCodigo.length) throw new ErroRecorte(`Código(s) pedido(s) fora da planilha: ${faltaCodigo.slice(0, 5).join(', ')}.`)
  const faltaGrupo = [...grupos.keys()].filter((g) => !grupoExistente.has(g))
  if (faltaGrupo.length) throw new ErroRecorte(`Grupo(s) pedido(s) fora da planilha (${faltaGrupo.length}): confira a grafia.`)

  const composicoes: ComposicaoRecorte[] = []
  let excluidasSemCusto = 0
  let excluidasCustoZeroNaUf = 0
  for (const c of custos.composicoes) {
    if (comFiltro && !codigos.has(c.codigo) && !grupos.has(normalizar(c.grupo))) continue
    const a = analitico.composicoes.get(c.codigo)
    if (!a || a.situacao !== 'COM CUSTO') {
      excluidasSemCusto++
      continue
    }
    const naUf = c.custos.get(o.uf)
    if (!naUf || !(naUf.custo > 0)) {
      excluidasCustoZeroNaUf++
      continue
    }
    if (!/^[A-Z0-9]{1,8}$/.test(c.unidade)) throw new ErroRecorte(`Unidade inesperada na composição ${c.codigo}: o layout mudou.`)
    const comp: ComposicaoRecorte = {
      codigo: c.codigo,
      descricao: cortar(c.descricao, MAX_DESCRICAO),
      unidade: c.unidade,
      grupo: cortar(c.grupo, MAX_GRUPO),
      custoUnitario: naUf.custo,
      maoDeObra: a.maoDeObra.map((f) => ({ codigo: f.codigo, funcao: cortar(f.funcao, MAX_FUNCAO), coeficiente: f.coeficiente })),
    }
    // %AS: valor publicado, só exibido (D-24); fora de 0 a 100 não entra
    if (naUf.percentualAS !== undefined && naUf.percentualAS >= 0 && naUf.percentualAS <= 100) comp.percentualAS = naUf.percentualAS
    composicoes.push(comp)
  }
  if (!composicoes.length) throw new ErroRecorte('Nenhuma composição com custo na UF e no regime pedidos (confira o filtro).')

  const encargos = custos.encargos.get(o.uf)!
  return {
    formato: FORMATO_RECORTE,
    versao: VERSAO_RECORTE,
    uf: o.uf as RecorteSinapi['uf'],
    regime: dados.regime,
    dataBase: dados.mes,
    fonte: { publicacao: PUBLICACAO_SINAPI, arquivo: o.arquivo, sha256: o.sha256, bytes: o.bytes, dataEmissao: dados.emissao, abaCustos: custos.aba, layout: LAYOUT_SINAPI },
    encargos: { horista: encargos.horista, mensalista: encargos.mensalista },
    filtro: { codigos: [...codigos], grupos: [...grupos.values()] },
    totais: { composicoes: composicoes.length, excluidasSemCusto, excluidasCustoZeroNaUf },
    geradoEm: o.geradoEm ?? new Date().toISOString(),
    composicoes,
  }
}
