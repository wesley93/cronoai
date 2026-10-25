// Painel "Divergências com o MS Project" (RF-05.8): onde e por que o CronoAI calcula uma data diferente da do arquivo importado.
// Compara as datas (yyyy-mm-dd) do início e do término calculados (modo previsão) com as do arquivo (`Task.arquivo`).
// A diferença sai em dias úteis do calendário padrão da obra. Cada causa é rastreável a um campo, sem heurística de texto.
import type { ProjectMeta, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import { addCalendarDays, defaultHolidays } from './calendar'
import { calendarioDeDias, type CalendariosCompilados } from './calendarioTrabalho'
import { workingVariance } from './scenarios'
import { alteradaDepoisDaImportacao } from './restricoes'
import { sortByWbs } from './wbs'

/** Causas prováveis, na ordem de precedência (a primeira que vale é a mostrada). */
export const CAUSAS_DIVERGENCIA = ['alterada', 'manual', 'feriado', 'restricao', 'status', 'nivelamento', 'predecessora', 'nao-identificada'] as const
export type CausaDivergencia = (typeof CAUSAS_DIVERGENCIA)[number]

export const ROTULO_CAUSA: Record<CausaDivergencia, string> = {
  alterada: 'Alterada no CronoAI',
  manual: 'Agendada manualmente',
  feriado: 'Feriado ou calendário',
  restricao: 'Restrição em conflito',
  status: 'Data de status',
  nivelamento: 'Nivelamento ou recurso',
  predecessora: 'Efeito da predecessora',
  'nao-identificada': 'Não identificada',
}

export interface Divergencia {
  uid: number
  wbs: string
  nome: string
  inicioArquivo: string
  terminoArquivo: string
  inicioCalculado: string
  terminoCalculado: string
  /** Positivo = o CronoAI calcula mais tarde que o arquivo. Em dias úteis do calendário padrão. */
  diferencaInicioDu: number
  diferencaTerminoDu: number
  causa: CausaDivergencia
  /** Frase da causa, só com números e UIDs (nunca texto do arquivo). */
  detalhe: string
  /** Predecessora citada quando a causa é `predecessora`. */
  predecessoraUid?: number
}

export function calcularDivergencias(tasks: Task[], schedule: ScheduleResult, cals: CalendariosCompilados, meta: ProjectMeta): Divergencia[] {
  const cal = calendarioDeDias(cals.padrao)
  const folhas = sortByWbs(tasks.filter((t) => !t.isSummary))
  const byUid = new Map(folhas.map((t) => [t.uid, t]))

  const calculadas = new Map<number, { t: Task; s: ScheduledTask; inicio: string; termino: string }>()
  for (const t of folhas) {
    const s = schedule.byUid.get(t.uid)
    const a = t.arquivo
    if (s && a?.inicio && a.termino && (s.start !== a.inicio || s.finish !== a.termino)) {
      calculadas.set(t.uid, { t, s, inicio: a.inicio, termino: a.termino })
    }
  }

  const moverRestante = meta.opcoesCronograma?.moverRestante ?? true
  // Feriados nacionais que o CronoAI aplicou (o arquivo não trazia nenhum): dias de semana não úteis no calendário padrão
  const feriadosAplicados = (de: string, ate: string): boolean => {
    if (!meta.feriadosNacionaisAplicados) return false
    const nacionais = new Set(defaultHolidays(Number(de.slice(0, 4)), Number(ate.slice(0, 4))))
    for (let d = de; d <= ate; d = addCalendarDays(d, 1)) if (nacionais.has(d) && !cals.padrao.dataUtil(d)) return true
    return false
  }

  const out: Divergencia[] = []
  for (const { t, s, inicio, termino } of calculadas.values()) {
    const base = {
      uid: t.uid,
      wbs: t.wbs,
      nome: t.name,
      inicioArquivo: inicio,
      terminoArquivo: termino,
      inicioCalculado: s.start,
      terminoCalculado: s.finish,
      diferencaInicioDu: workingVariance(cal, inicio, s.start),
      diferencaTerminoDu: workingVariance(cal, termino, s.finish),
    }
    const de = [inicio, s.start].sort()[0]
    const ate = [termino, s.finish].sort().at(-1)!
    const status = meta.statusDate
    const predecessoraDivergente = t.predecessors.find((p) => calculadas.has(p.uid) && byUid.has(p.uid))

    let causa: CausaDivergencia
    let detalhe: string
    let predecessoraUid: number | undefined
    if (alteradaDepoisDaImportacao(t)) {
      causa = 'alterada'
      detalhe = 'Alterada no CronoAI depois da importação (duração, % concluído ou restrição diferente do arquivo).'
    } else if (t.arquivo?.manual) {
      causa = 'manual'
      detalhe = 'Agendada manualmente no MS Project: o CronoAI a calcula automaticamente.'
    } else if (feriadosAplicados(de, ate) || t.calendarioUid !== undefined) {
      causa = 'feriado'
      detalhe = t.calendarioUid !== undefined ? 'Calendário da tarefa (UID do calendário em ' + t.calendarioUid + ').' : 'Feriado nacional aplicado pelo CronoAI (o arquivo não trazia feriados).'
    } else if (s.restricaoConflito) {
      causa = 'restricao'
      detalhe = 'Restrição em conflito com vínculo: a restrição prevalece sobre a predecessora.'
    } else if (
      moverRestante &&
      t.percentComplete < 100 &&
      ((t.percentComplete === 0 && inicio <= status) || (t.percentComplete > 0 && termino <= status))
    ) {
      causa = 'status'
      detalhe = 'Data de status: o CronoAI move o restante para depois da data de status (o arquivo o agenda antes).'
    } else if (t.arquivo?.nivelamento) {
      causa = 'nivelamento'
      detalhe = 'Nivelamento ou recurso no arquivo (atraso de nivelamento do MS Project).'
    } else if (predecessoraDivergente) {
      causa = 'predecessora'
      predecessoraUid = predecessoraDivergente.uid
      detalhe = byUid.get(predecessoraUid)?.arquivo?.manual
        ? `Predecessora UID ${predecessoraUid} agendada manualmente.`
        : `Efeito da predecessora UID ${predecessoraUid}.`
    } else {
      causa = 'nao-identificada'
      detalhe = 'Causa não identificada.'
    }
    out.push({ ...base, causa, detalhe, ...(predecessoraUid !== undefined ? { predecessoraUid } : {}) })
  }
  return out
}
