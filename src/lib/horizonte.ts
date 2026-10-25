// Cálculo completo da obra e verificação do horizonte (50 anos a partir da data-base).
// Uma só lista de cálculos serve ao derivado `calculo` da store e à simulação antes de gravar uma edição ou um arquivo importado.
import type { CalendarioObra, ConfigFeriadosObra, ProjectMeta, Task } from '@/types/domain'
import { MSG_TETO, type WorkCalendar } from './calendar'
import { calendarioDeDias, compilarCalendarios, type CalendariosCompilados } from './calendarioTrabalho'
import { computeSchedule, optsDaObra } from './cpm'
import { computeEvm } from './evm'
import { criarFeriadosPorAno } from './feriadosObra'
import { analyzeDelay } from './scenarios'

export const MSG_CALCULO_GENERICA = 'Não foi possível calcular o cronograma desta obra.'

/** Erros que o motor lança de propósito, com texto próprio e em português (sem dado do arquivo). */
const MSG_SEM_PADRAO = 'O calendário padrão da obra não existe.'
const PREFIXO_CALENDARIO_INVALIDO = 'Calendário inválido: '

/**
 * Mensagem de um cálculo que falhou. O texto do Error só vai para a tela quando é um erro conhecido do motor (teto de 50 anos,
 * calendário inválido ou ausente); qualquer outra causa vira a mensagem genérica, sem detalhe interno.
 */
export function mensagemDoCalculo(e: unknown): string {
  if (e instanceof Error) {
    if (e.message === MSG_TETO || e.message === MSG_SEM_PADRAO || e.message.startsWith(PREFIXO_CALENDARIO_INVALIDO)) return e.message
  }
  return MSG_CALCULO_GENERICA
}

/** Tudo o que a tela deriva do estado da obra, calculado numa só passada. */
export interface CalculoObra {
  /** Calendários compilados com os dias úteis extras (hora extra). */
  cals: CalendariosCompilados
  /** Calendários do valor planejado: sem as exceções úteis, como a linha de base. */
  calsPv: CalendariosCompilados
  /** Previsão (reprogramada pela data de status). */
  sch: ReturnType<typeof computeSchedule>
  evm: ReturnType<typeof computeEvm>
  atraso: ReturnType<typeof analyzeDelay>
  /** Contas por dia útil ("+16 d.u.") no calendário padrão, com e sem os dias extras. */
  calendar: WorkCalendar
  baseCalendar: WorkCalendar
}

/**
 * Uma só lista de cálculos da obra: calendários, previsão, EVM e atraso; com `comLinhaDeBase`, também a linha de base (sem avanço).
 * A tela chama sem a linha de base (ela não é exibida e custa um cronograma inteiro a cada edição); a verificação antes de gravar
 * chama com ela, porque é na linha de base que a duração de 50 anos estoura primeiro. Lança se estourar o teto ou se o calendário
 * for inválido (a store e `verificarCalculo` tratam o erro). Não altera nada.
 */
export function calcularObra(
  tasks: Task[],
  meta: ProjectMeta,
  calendarios: CalendarioObra[],
  calendarioPadraoUid: number,
  opcoes: { comLinhaDeBase?: boolean; feriados?: ConfigFeriadosObra } = {},
): CalculoObra {
  // Feriados da obra: gerados por ano para os calendários com `aplicaFeriadosObra`; sem configuração, a compilação usa a padrão
  // (nacionais, Carnaval e Corpus Christi), como numa obra sem `feriados` salvo
  const feriadosPorAno = opcoes.feriados ? criarFeriadosPorAno(opcoes.feriados) : undefined
  const cals = compilarCalendarios(meta.startDate, calendarios, calendarioPadraoUid, { feriadosPorAno })
  const calsPv = compilarCalendarios(meta.startDate, calendarios, calendarioPadraoUid, { semExcecoesUteis: true, feriadosPorAno })
  const sch = computeSchedule(tasks, cals, optsDaObra(meta, 'forecast', meta.statusDate))
  if (opcoes.comLinhaDeBase) computeSchedule(tasks, calsPv, optsDaObra(meta, 'baseline'))
  const evm = computeEvm(tasks, calsPv, meta.statusDate)
  const calendar = calendarioDeDias(cals.padrao)
  const baseCalendar = calendarioDeDias(calsPv.padrao)
  const atraso = analyzeDelay(tasks, sch, baseCalendar)
  return { cals, calsPv, sch, evm, atraso, calendar, baseCalendar }
}

/** `undefined` = o estado (real ou hipotético) cabe no horizonte e calcula; senão, a mensagem em português. */
export function verificarCalculo(
  tasks: Task[],
  meta: ProjectMeta,
  calendarios: CalendarioObra[],
  calendarioPadraoUid: number,
  feriados?: ConfigFeriadosObra,
): string | undefined {
  try {
    calcularObra(tasks, meta, calendarios, calendarioPadraoUid, { comLinhaDeBase: true, feriados })
    return undefined
  } catch (e) {
    return mensagemDoCalculo(e)
  }
}
