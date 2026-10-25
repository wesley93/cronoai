// Verificação do horizonte de cálculo (50 anos a partir da data-base): roda os mesmos cálculos que a tela usa sobre um estado
// HIPOTÉTICO e devolve a mensagem de erro, em português, antes de gravar uma edição ou um arquivo importado que estouraria o teto.
import type { CalendarioObra, ProjectMeta, Task } from '@/types/domain'
import { calendarioDeDias, compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule, optsDaObra } from './cpm'
import { computeEvm, computeSCurve } from './evm'
import { fmtMonth } from './format'
import { analyzeDelay } from './scenarios'

const MSG_PADRAO = 'O cronograma não pôde ser calculado com esses dados.'

/** Mensagem de erro de um cálculo que falhou (as do motor já vêm em português; outra causa vira a mensagem genérica). */
export function mensagemDoCalculo(e: unknown): string {
  return e instanceof Error && e.message ? e.message : MSG_PADRAO
}

/**
 * Calcula a previsão, a linha de base, o EVM, a Curva S e o atraso do estado informado. `undefined` = cabe no horizonte;
 * senão, a mensagem (teto de 50 anos, calendário inválido). Não altera nada.
 */
export function verificarCalculo(tasks: Task[], meta: ProjectMeta, calendarios: CalendarioObra[], calendarioPadraoUid: number): string | undefined {
  try {
    const cals = compilarCalendarios(meta.startDate, calendarios, calendarioPadraoUid)
    const calsPv = compilarCalendarios(meta.startDate, calendarios, calendarioPadraoUid, { semExcecoesUteis: true })
    const previsao = computeSchedule(tasks, cals, optsDaObra(meta, 'forecast', meta.statusDate))
    computeSchedule(tasks, calsPv, optsDaObra(meta, 'baseline'))
    computeEvm(tasks, calsPv, meta.statusDate)
    computeSCurve(tasks, calsPv, meta.statusDate, previsao, fmtMonth)
    analyzeDelay(tasks, previsao, calendarioDeDias(calsPv.padrao))
    return undefined
  } catch (e) {
    return mensagemDoCalculo(e)
  }
}
