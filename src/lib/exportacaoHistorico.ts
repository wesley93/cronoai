// Exportação do histórico da obra em JSON (ciclo 00007, RNF-04.2, D-34): as linhas de base (com nome, motivo e autor, que o MSPDI não guarda) e todos os
// fechamentos e retificações gravados. É só saída: não há importação de JSON neste ciclo. Nenhum envio pela rede.
import type { LinhaBaseInfo } from '@/types/domain'
import type { CabecalhoFechamento, DetalheFechamento, TarefaFechamento } from '@/types/fechamento'

export const FORMATO_HISTORICO = 'cronoai-historico'
export const VERSAO_HISTORICO = 1

export interface ExportacaoHistorico {
  formato: typeof FORMATO_HISTORICO
  versao: typeof VERSAO_HISTORICO
  exportadoEm: string
  obra: { nome: string; uf?: string; municipio?: string }
  linhasBase: LinhaBaseInfo[]
  fechamentos: { cabecalho: CabecalhoFechamento; tarefas: TarefaFechamento[] }[]
}

/** Nome do arquivo: `{obra}_historico_{data de status}.json`, sem acento nem caractere fora de letras e números (a mesma regra do .xml). */
export function nomeDoArquivoDeHistorico(nomeDaObra: string, dataStatus: string): string {
  const seguro = nomeDaObra.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  return `${seguro || 'Obra'}_historico_${dataStatus}.json`
}

/** Monta o objeto exportado e o texto. Os fechamentos entram por `sequencia`, com o cabeçalho e as tuplas exatamente como foram gravados. */
export function montarExportacaoHistorico(e: {
  exportadoEm: string
  obra: { nome: string; uf?: string; municipio?: string }
  dataStatus: string
  linhasBase: readonly LinhaBaseInfo[]
  fechamentos: readonly { cabecalho: CabecalhoFechamento; detalhe: DetalheFechamento }[]
}): { nomeArquivo: string; exportacao: ExportacaoHistorico; texto: string } {
  const exportacao: ExportacaoHistorico = {
    formato: FORMATO_HISTORICO,
    versao: VERSAO_HISTORICO,
    exportadoEm: e.exportadoEm,
    obra: { nome: e.obra.nome, ...(e.obra.uf ? { uf: e.obra.uf } : {}), ...(e.obra.municipio ? { municipio: e.obra.municipio } : {}) },
    linhasBase: e.linhasBase.map((i) => ({ ...i })),
    fechamentos: [...e.fechamentos].sort((a, b) => a.cabecalho.sequencia - b.cabecalho.sequencia).map((f) => ({ cabecalho: f.cabecalho, tarefas: f.detalhe.tarefas })),
  }
  return { nomeArquivo: nomeDoArquivoDeHistorico(e.obra.nome, e.dataStatus), exportacao, texto: JSON.stringify(exportacao) }
}
