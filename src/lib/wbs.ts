// Utilitários de EAP: hierarquia, consolidação (rollup) de tarefas-resumo e leitura de pavimentos.
import type { ScheduleResult, Task } from '@/types/domain'

export interface SummaryRollup {
  uid: number
  start: string
  finish: string
  bac: number
  actualCost: number
  percentComplete: number
  baselineStart?: string
  baselineFinish?: string
  critical: boolean
}

export function leafTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.isSummary)
}

export function childrenOf(tasks: Task[], summary: Task): Task[] {
  return tasks.filter((t) => !t.isSummary && t.wbs.startsWith(summary.wbs + '.'))
}

/** Compara códigos de EAP numericamente (01.10 > 01.9). */
export function compareWbs(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

export function sortByWbs(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => compareWbs(a.wbs, b.wbs))
}

export function rollupSummaries(tasks: Task[], schedule: ScheduleResult): Map<number, SummaryRollup> {
  const out = new Map<number, SummaryRollup>()
  for (const s of tasks.filter((t) => t.isSummary)) {
    const kids = childrenOf(tasks, s)
    const scheduled = kids.map((k) => schedule.byUid.get(k.uid)).filter((x) => !!x)
    if (!scheduled.length) continue
    const bac = kids.reduce((acc, k) => acc + k.bac, 0)
    const earned = kids.reduce((acc, k) => acc + (k.bac * k.percentComplete) / 100, 0)
    const durTotal = kids.reduce((acc, k) => acc + k.durationDays, 0)
    const pct = bac > 0 ? (earned / bac) * 100 : durTotal > 0 ? kids.reduce((a, k) => a + k.durationDays * k.percentComplete, 0) / durTotal : 0
    const bStarts = kids.map((k) => k.baselineStart).filter((x): x is string => !!x)
    const bFinishes = kids.map((k) => k.baselineFinish).filter((x): x is string => !!x)
    out.set(s.uid, {
      uid: s.uid,
      start: scheduled.reduce((m, x) => (x.start < m ? x.start : m), scheduled[0].start),
      finish: scheduled.reduce((m, x) => (x.finish > m ? x.finish : m), scheduled[0].finish),
      bac,
      actualCost: kids.reduce((acc, k) => acc + k.actualCost, 0),
      percentComplete: pct,
      baselineStart: bStarts.length ? bStarts.sort()[0] : undefined,
      baselineFinish: bFinishes.length ? bFinishes.sort().at(-1) : undefined,
      critical: scheduled.some((x) => x.critical),
    })
  }
  return out
}

const ORDINAL_WORDS: Record<string, number> = {
  terreo: 0,
  primeiro: 1,
  segundo: 2,
  terceiro: 3,
  quarto: 4,
  quinto: 5,
  sexto: 6,
  setimo: 7,
  oitavo: 8,
  nono: 9,
  decimo: 10,
  'decimo primeiro': 11,
  'decimo segundo': 12,
}

export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[º°ª]/g, 'o')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Extrai a faixa de pavimentos de um nome de tarefa ("Pav. 5 ao 12", "2º Pav.", "3º e 4º Pav."). */
export function parseFloorRange(name: string): [number, number] | undefined {
  const n = normalizeText(name)
  const range = n.match(/(\d{1,2})o?\s*(?:pav\.?|pavimento|andar)?\s*(?:ao|a|-|ate)\s*(\d{1,2})o?/)
  if (range && /pav|andar/.test(n)) return [Number(range[1]), Number(range[2])]
  const pair = n.match(/(\d{1,2})o?\s*e\s*(\d{1,2})o?\s*(?:pav|andar)/)
  if (pair) return [Number(pair[1]), Number(pair[2])]
  const single = n.match(/(\d{1,2})o?\s*(?:pav|andar)/)
  if (single) return [Number(single[1]), Number(single[1])]
  if (/terreo/.test(n)) return [0, 0]
  return undefined
}

/** Extrai o pavimento citado em um relato coloquial ("2º pavimento", "segundo andar", "andar 3"). */
export function parseFloorMention(text: string): number | undefined {
  const n = normalizeText(text)
  const digit = n.match(/(\d{1,2})\s*o?\s*(?:pav(?:imento)?|andar|piso|laje)/) ?? n.match(/(?:pav(?:imento)?|andar)\s*(\d{1,2})/)
  if (digit) return Number(digit[1])
  const words = Object.keys(ORDINAL_WORDS).sort((a, b) => b.length - a.length)
  for (const w of words) {
    if (new RegExp(`\\b${w}\\s+(pav|andar|piso)`).test(n) || (w === 'terreo' && /\bterreo\b/.test(n))) {
      return ORDINAL_WORDS[w]
    }
  }
  return undefined
}

/** Próximo código de EAP filho de um grupo (ex.: 03 -> 03.03). */
export function nextChildWbs(tasks: Task[], parentWbs: string): string {
  const depth = parentWbs.split('.').length + 1
  const siblings = tasks
    .filter((t) => t.wbs.startsWith(parentWbs + '.') && t.wbs.split('.').length === depth)
    .map((t) => Number(t.wbs.split('.').at(-1)))
  const next = (siblings.length ? Math.max(...siblings) : 0) + 1
  return `${parentWbs}.${String(next).padStart(2, '0')}`
}

export function nextUid(tasks: Task[]): number {
  return Math.max(900, ...tasks.map((t) => t.uid)) + 1
}

const LINK_PT: Record<string, string> = { FS: 'Término-Início', SS: 'Início-Início', FF: 'Término-Término', SF: 'Início-Término' }

/** Predecessoras no estilo MS Project: "104FS; 401SS+10". */
export function formatPredecessors(task: Task): string {
  return task.predecessors
    .map((p) => `${p.uid}${p.type}${p.lagDays ? (p.lagDays > 0 ? `+${p.lagDays}` : p.lagDays) : ''}`)
    .join('; ')
}

export function describeLink(type: string): string {
  return LINK_PT[type] ?? type
}
