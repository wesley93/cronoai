// Motor de Caminho Crítico (CPM) com vínculos FS/SS/FF/SF, latência e reprogramação pela data de status.
import type { PredecessorLink, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import { WorkCalendar } from './calendar'

export interface ScheduleOptions {
  /** baseline = ignora avanço; forecast = reprograma o saldo a partir da data de status (como o MS Project). */
  mode: 'baseline' | 'forecast'
  statusDate?: string
}

interface Edge {
  pred: number
  succ: number
  type: PredecessorLink['type']
  lag: number
}

/** Expande vínculos que apontam para tarefas-resumo em vínculos para suas folhas. */
function buildEdges(tasks: Task[], leaves: Task[]): Edge[] {
  const leafSet = new Set(leaves.map((t) => t.uid))
  const byUid = new Map(tasks.map((t) => [t.uid, t]))

  const kidsBySummary = new Map<string, number[]>()
  for (const leaf of leaves) {
    const parts = leaf.wbs.split('.')
    let current = ''
    for (let i = 0; i < parts.length - 1; i++) {
      current = current ? `${current}.${parts[i]}` : parts[i]
      let list = kidsBySummary.get(current)
      if (!list) kidsBySummary.set(current, (list = []))
      list.push(leaf.uid)
    }
  }

  const leafDescendants = (summary: Task): number[] => kidsBySummary.get(summary.wbs) || []

  const edges: Edge[] = []
  for (const t of leaves) {
    for (const p of t.predecessors) {
      const pred = byUid.get(p.uid)
      if (!pred || p.uid === t.uid) continue
      const targets = leafSet.has(p.uid) ? [p.uid] : pred.isSummary ? leafDescendants(pred) : []
      for (const uid of targets) {
        if (uid !== t.uid) edges.push({ pred: uid, succ: t.uid, type: p.type, lag: p.lagDays })
      }
    }
  }
  return edges
}

/** Ordenação topológica (Kahn). Vínculos que formam ciclo são descartados. */
function topoSort(leaves: Task[], edges: Edge[]): { order: number[]; validEdges: Edge[] } {
  const indeg = new Map<number, number>(leaves.map((t) => [t.uid, 0]))
  const out = new Map<number, Edge[]>(leaves.map((t) => [t.uid, []]))
  for (const e of edges) {
    indeg.set(e.succ, (indeg.get(e.succ) ?? 0) + 1)
    out.get(e.pred)?.push(e)
  }
  // Fila estável pela ordem da EAP
  const queue = leaves.filter((t) => indeg.get(t.uid) === 0).map((t) => t.uid)
  const order: number[] = []
  while (queue.length) {
    const uid = queue.shift()!
    order.push(uid)
    for (const e of out.get(uid) ?? []) {
      const n = (indeg.get(e.succ) ?? 0) - 1
      indeg.set(e.succ, n)
      if (n === 0) queue.push(e.succ)
    }
  }
  if (order.length < leaves.length) {
    // Ciclo: adiciona as restantes na ordem da EAP e ignora as arestas problemáticas
    for (const t of leaves) if (!order.includes(t.uid)) order.push(t.uid)
  }
  const pos = new Map(order.map((uid, i) => [uid, i]))
  const validEdges = edges.filter((e) => (pos.get(e.pred) ?? 0) < (pos.get(e.succ) ?? 0))
  return { order, validEdges }
}

export function computeSchedule(
  tasks: Task[],
  cal: WorkCalendar,
  opts: ScheduleOptions,
): ScheduleResult {
  const leaves = tasks.filter((t) => !t.isSummary)
  const byUid = new Map(leaves.map((t) => [t.uid, t]))
  const { order, validEdges } = topoSort(leaves, buildEdges(tasks, leaves))
  const forecast = opts.mode === 'forecast' && !!opts.statusDate
  const statusIdx = forecast ? cal.indexOnOrBefore(opts.statusDate!) : -1
  const dataIdx = statusIdx + 1

  const incoming = new Map<number, Edge[]>()
  const outgoing = new Map<number, Edge[]>()
  for (const e of validEdges) {
    if (!incoming.has(e.succ)) incoming.set(e.succ, [])
    if (!outgoing.has(e.pred)) outgoing.set(e.pred, [])
    incoming.get(e.succ)!.push(e)
    outgoing.get(e.pred)!.push(e)
  }

  const es = new Map<number, number>()
  const ef = new Map<number, number>()
  const remaining = new Map<number, number>()
  const started = (t: Task) => forecast && t.percentComplete > 0

  const linkDrivenStart = (t: Task, dur: number): number => {
    let start = 0
    for (const e of incoming.get(t.uid) ?? []) {
      const pEs = es.get(e.pred) ?? 0
      const pEf = ef.get(e.pred) ?? 0
      switch (e.type) {
        case 'FS': start = Math.max(start, pEf + e.lag); break
        case 'SS': start = Math.max(start, pEs + e.lag); break
        case 'FF': start = Math.max(start, pEf + e.lag - dur); break
        case 'SF': start = Math.max(start, pEs + e.lag - dur); break
      }
    }
    if (t.snet) start = Math.max(start, cal.indexOnOrAfter(t.snet))
    return start
  }

  // ---------- Passo de ida ----------
  for (const uid of order) {
    const t = byUid.get(uid)!
    const dur = Math.max(0, Math.round(t.durationDays))
    if (forecast && t.percentComplete >= 100) {
      const s = t.actualStart ? cal.indexOnOrAfter(t.actualStart) : Math.min(linkDrivenStart(t, dur), statusIdx)
      const f = t.actualFinish ? cal.indexOnOrBefore(t.actualFinish) + 1 : Math.min(s + dur, dataIdx)
      es.set(uid, s)
      ef.set(uid, Math.max(s, f))
      remaining.set(uid, 0)
    } else if (started(t)) {
      const s = t.actualStart ? cal.indexOnOrAfter(t.actualStart) : Math.min(linkDrivenStart(t, dur), statusIdx)
      const rem = Math.max(1, Math.ceil(dur * (1 - t.percentComplete / 100) - 1e-9))
      es.set(uid, s)
      ef.set(uid, Math.max(s, dataIdx) + rem)
      remaining.set(uid, rem)
    } else {
      const s = Math.max(linkDrivenStart(t, dur), forecast ? dataIdx : 0)
      es.set(uid, s)
      ef.set(uid, s + dur)
      remaining.set(uid, dur)
    }
  }

  const projectEf = Math.max(0, ...order.map((u) => ef.get(u) ?? 0))

  // ---------- Passo de volta ----------
  const ls = new Map<number, number>()
  const lf = new Map<number, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const uid = order[i]
    const d = (ef.get(uid) ?? 0) - (es.get(uid) ?? 0)
    let late = projectEf
    for (const e of outgoing.get(uid) ?? []) {
      const succ = byUid.get(e.succ)!
      if (started(succ)) continue // sucessora já iniciada não restringe a predecessora
      const sLs = ls.get(e.succ) ?? projectEf
      const sLf = lf.get(e.succ) ?? projectEf
      switch (e.type) {
        case 'FS': late = Math.min(late, sLs - e.lag); break
        case 'SS': late = Math.min(late, sLs - e.lag + d); break
        case 'FF': late = Math.min(late, sLf - e.lag); break
        case 'SF': late = Math.min(late, sLf - e.lag + d); break
      }
    }
    lf.set(uid, late)
    ls.set(uid, late - d)
  }

  // ---------- Folgas e datas ----------
  const result = new Map<number, ScheduledTask>()
  for (const uid of order) {
    const t = byUid.get(uid)!
    const s = es.get(uid)!
    const f = ef.get(uid)!
    const done = forecast && t.percentComplete >= 100
    const totalFloat = done ? 0 : lf.get(uid)! - f

    let freeFloat = projectEf - f
    for (const e of outgoing.get(uid) ?? []) {
      const sEs = es.get(e.succ)!
      const sEf = ef.get(e.succ)!
      let slack: number
      switch (e.type) {
        case 'FS': slack = sEs - e.lag - f; break
        case 'SS': slack = sEs - e.lag - s; break
        case 'FF': slack = sEf - e.lag - f; break
        case 'SF': slack = sEf - e.lag - s; break
      }
      freeFloat = Math.min(freeFloat, slack)
    }

    const isMilestone = f === s
    let start = cal.dateAt(s)
    let finish = isMilestone ? (s > 0 ? cal.dateAt(s - 1) : cal.dateAt(0)) : cal.dateAt(f - 1)
    if (isMilestone) start = finish
    if (forecast && t.percentComplete > 0 && t.actualStart) start = t.actualStart
    if (done && t.actualFinish) finish = t.actualFinish

    result.set(uid, {
      uid,
      es: s,
      ef: f,
      ls: ls.get(uid)!,
      lf: lf.get(uid)!,
      totalFloat,
      freeFloat: done ? 0 : Math.max(0, freeFloat),
      critical: !done && totalFloat <= 0,
      start,
      finish,
      duration: f - s,
      remaining: remaining.get(uid)!,
    })
  }

  const scheduled = [...result.values()]
  const projectStart = scheduled.reduce((m, x) => (x.start < m ? x.start : m), scheduled[0]?.start ?? cal.baseDate)
  const projectFinish = scheduled.reduce((m, x) => (x.finish > m ? x.finish : m), scheduled[0]?.finish ?? cal.baseDate)
  const criticalPath = scheduled
    .filter((x) => x.critical)
    .sort((a, b) => a.es - b.es || a.ef - b.ef)
    .map((x) => x.uid)

  return { byUid: result, projectStart, projectFinish, projectEf, criticalPath, order }
}

/** Grava a linha de base (datas e duração) a partir de um cálculo sem avanço. */
export function withBaseline(tasks: Task[], baseline: ScheduleResult, onlyMissing = false): Task[] {
  return tasks.map((t) => {
    const s = baseline.byUid.get(t.uid)
    if (!s || (onlyMissing && t.baselineStart)) return t
    return { ...t, baselineStart: s.start, baselineFinish: s.finish, baselineDuration: s.duration }
  })
}

/** Todas as sucessoras (diretas e indiretas) de uma tarefa. */
export function downstreamOf(tasks: Task[], uid: number): number[] {
  const succs = new Map<number, number[]>()
  for (const t of tasks) {
    for (const p of t.predecessors) {
      if (!succs.has(p.uid)) succs.set(p.uid, [])
      succs.get(p.uid)!.push(t.uid)
    }
  }
  const seen = new Set<number>()
  const stack = [...(succs.get(uid) ?? [])]
  while (stack.length) {
    const u = stack.pop()!
    if (seen.has(u)) continue
    seen.add(u)
    stack.push(...(succs.get(u) ?? []))
  }
  return [...seen]
}
