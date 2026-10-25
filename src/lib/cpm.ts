// Motor de Caminho Crítico (CPM) em minutos úteis, com vínculos FS/SS/FF/SF, latência, calendário por tarefa
// e reprogramação pela data de status (ciclo 00004, ADR 00003).
//
// Todo cálculo usa "momentos": minutos de relógio desde 00:00 da data-base. Cada calendário converte momento ↔ minuto útil.
// Início de tarefa com duração vai para o próximo momento útil do calendário dela; o término fica no fim do último trecho
// útil (17:00, e não 08:00 do dia seguinte); somar lag 0 não normaliza (o marco fica no término da predecessora).
import type { Lag, PredecessorLink, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import {
  MINUTOS_NO_DIA_CORRIDO,
  MINUTOS_POR_DIA_PADRAO,
  dataDoMomento,
  diasParaMinutos,
  diaRelativo,
  horaDoMomento,
  lerDataHora,
  minutosParaDias,
  type CalendarioCompilado,
  type CalendariosCompilados,
} from './calendarioTrabalho'

export interface ScheduleOptions {
  /** baseline = ignora avanço; forecast = reprograma o saldo a partir da data de status (como o MS Project). */
  mode: 'baseline' | 'forecast'
  statusDate?: string
  /** Minutos por dia da obra, só para as folgas em dias e o restante em dias inteiros (padrão 480). */
  minutosPorDia?: number
}

interface Edge {
  pred: number
  succ: number
  type: PredecessorLink['type']
  lag: Lag
}

/**
 * Calendário em que o lag útil de um vínculo é contado (gate P1): o da SUCESSORA, ou o padrão da obra quando
 * ela não tem calendário próprio. Fonte: relatos técnicos (Boyle 2018, Trajkovski 2013), sem documentação oficial;
 * validação final pela Engenharia de planejamento no MS Project real. A regra mora só aqui, para trocar com 1 teste.
 */
export function calendarioDoLag(cals: CalendariosCompilados, _pred: Task, succ: Task): CalendarioCompilado {
  return cals.de(succ.calendarioUid)
}

/** Expande vínculos que apontam para tarefas-resumo em vínculos para suas folhas. */
function buildEdges(tasks: Task[], leaves: Task[]): Edge[] {
  const leafSet = new Set(leaves.map((t) => t.uid))
  const byUid = new Map(tasks.map((t) => [t.uid, t]))
  const leafDescendants = (summary: Task): number[] =>
    leaves.filter((l) => l.wbs.startsWith(summary.wbs + '.')).map((l) => l.uid)

  const edges: Edge[] = []
  for (const t of leaves) {
    for (const p of t.predecessors) {
      const pred = byUid.get(p.uid)
      if (!pred || p.uid === t.uid) continue
      const targets = leafSet.has(p.uid) ? [p.uid] : pred.isSummary ? leafDescendants(pred) : []
      for (const uid of targets) {
        if (uid !== t.uid) edges.push({ pred: uid, succ: t.uid, type: p.type, lag: p.lag })
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
  for (let head = 0; head < queue.length; head++) {
    const uid = queue[head]
    order.push(uid)
    for (const e of out.get(uid) ?? []) {
      const n = (indeg.get(e.succ) ?? 0) - 1
      indeg.set(e.succ, n)
      if (n === 0) queue.push(e.succ)
    }
  }
  if (order.length < leaves.length) {
    // Ciclo: adiciona as restantes na ordem da EAP e ignora as arestas problemáticas
    const placed = new Set(order)
    for (const t of leaves) if (!placed.has(t.uid)) order.push(t.uid)
  }
  const pos = new Map(order.map((uid, i) => [uid, i]))
  const validEdges = edges.filter((e) => (pos.get(e.pred) ?? 0) < (pos.get(e.succ) ?? 0))
  return { order, validEdges }
}

/** Fim de uma tarefa que começa em `inicio` (já normalizado) e dura `dur` minutos úteis. */
const terminarEm = (cal: CalendarioCompilado, inicio: number, dur: number): number => (dur > 0 ? cal.somarUteis(inicio, dur) : inicio)

/** Início de tarefa: com duração, vai para o próximo momento útil; marco (duração 0) fica onde está. */
const iniciarEm = (cal: CalendarioCompilado, m: number, dur: number): number => (dur > 0 ? cal.proximoUtil(m) : m)

export function computeSchedule(tasks: Task[], cals: CalendariosCompilados, opts: ScheduleOptions): ScheduleResult {
  const leaves = tasks.filter((t) => !t.isSummary)
  const byUid = new Map(leaves.map((t) => [t.uid, t]))
  const { order, validEdges } = topoSort(leaves, buildEdges(tasks, leaves))
  const forecast = opts.mode === 'forecast' && !!opts.statusDate
  const base = cals.base
  const mpd = opts.minutosPorDia ?? MINUTOS_POR_DIA_PADRAO
  const statusDia = forecast ? diaRelativo(base, opts.statusDate!) : 0
  const calOf = new Map(leaves.map((t) => [t.uid, cals.de(t.calendarioUid)]))
  const cal = (uid: number) => calOf.get(uid)!

  const incoming = new Map<number, Edge[]>()
  const outgoing = new Map<number, Edge[]>()
  for (const e of validEdges) {
    if (!incoming.has(e.succ)) incoming.set(e.succ, [])
    if (!outgoing.has(e.pred)) outgoing.set(e.pred, [])
    incoming.get(e.succ)!.push(e)
    outgoing.get(e.pred)!.push(e)
  }
  const lagCal = (e: Edge) => calendarioDoLag(cals, byUid.get(e.pred)!, byUid.get(e.succ)!)
  /** Momento depois de somar o lag do vínculo (no calendário do lag). */
  const maisLag = (m: number, e: Edge) => lagCal(e).somarUteis(m, e.lag.minutos)
  /** Momento antes de descontar o lag do vínculo (volta). */
  const menosLag = (m: number, e: Edge) => lagCal(e).somarUteis(m, -e.lag.minutos)

  const es = new Map<number, number>()
  const ef = new Map<number, number>()
  const restante = new Map<number, number>()
  const started = (t: Task) => forecast && t.percentComplete > 0
  const done = (t: Task) => forecast && t.percentComplete >= 100

  /** Início do restante: primeiro momento útil depois do dia da data de status (calendário da tarefa). */
  const aposStatus = (c: CalendarioCompilado) => c.proximoUtil((statusDia + 1) * MINUTOS_NO_DIA_CORRIDO)

  const linkDrivenStart = (t: Task, dur: number, c: CalendarioCompilado): number => {
    let start = 0
    for (const e of incoming.get(t.uid) ?? []) {
      const pEs = es.get(e.pred) ?? 0
      const pEf = ef.get(e.pred) ?? 0
      switch (e.type) {
        case 'FS': start = Math.max(start, maisLag(pEf, e)); break
        case 'SS': start = Math.max(start, maisLag(pEs, e)); break
        case 'FF': start = Math.max(start, c.somarUteis(maisLag(pEf, e), -dur)); break
        case 'SF': start = Math.max(start, c.somarUteis(maisLag(pEs, e), -dur)); break
      }
    }
    const r = t.restricao
    if (r?.tipo === 'SNET') {
      const dh = lerDataHora(r.data)
      if (dh) start = Math.max(start, c.proximoUtil(diaRelativo(base, dh.data) * MINUTOS_NO_DIA_CORRIDO + (dh.minuto ?? 0)))
    }
    return start
  }

  // ---------- Passo de ida ----------
  for (const uid of order) {
    const t = byUid.get(uid)!
    const c = cal(uid)
    const dur = Math.max(0, Math.round(t.duracaoMin))
    const inicioReal = t.actualStart ? c.proximoUtil(diaRelativo(base, t.actualStart) * MINUTOS_NO_DIA_CORRIDO) : undefined
    if (done(t)) {
      const s = inicioReal ?? Math.min(iniciarEm(c, linkDrivenStart(t, dur, c), dur), c.inicioDoDiaUtilNoOuAntes(statusDia))
      const f = t.actualFinish
        ? c.fimUtilAte((diaRelativo(base, t.actualFinish) + 1) * MINUTOS_NO_DIA_CORRIDO)
        : Math.min(terminarEm(c, s, dur), c.fimUtilAte(aposStatus(c)))
      es.set(uid, s)
      ef.set(uid, Math.max(s, f))
      restante.set(uid, 0)
    } else if (started(t)) {
      const s = inicioReal ?? Math.min(iniciarEm(c, linkDrivenStart(t, dur, c), dur), c.inicioDoDiaUtilNoOuAntes(statusDia))
      // E1: o restante segue em dias inteiros, ⌈dur × (1 − %)⌉ com mínimo de 1 dia, para não mudar nenhuma data
      const restDias = Math.max(1, Math.ceil(minutosParaDias(dur, mpd) * (1 - t.percentComplete / 100) - 1e-9))
      const rem = diasParaMinutos(restDias, mpd)
      es.set(uid, s)
      ef.set(uid, terminarEm(c, Math.max(s, aposStatus(c)), rem))
      restante.set(uid, rem)
    } else {
      const s = iniciarEm(c, Math.max(linkDrivenStart(t, dur, c), forecast ? aposStatus(c) : 0), dur)
      es.set(uid, s)
      ef.set(uid, terminarEm(c, s, dur))
      restante.set(uid, dur)
    }
  }

  const terminoProjeto = order.reduce((m, u) => Math.max(m, ef.get(u) ?? 0), 0)

  // Duração efetiva (do início ao término cedo), em minutos úteis do calendário da tarefa
  const efetiva = (uid: number) => cal(uid).minutosUteisEntre(es.get(uid)!, ef.get(uid)!)

  // ---------- Passo de volta ----------
  const ls = new Map<number, number>()
  const lf = new Map<number, number>()
  for (let i = order.length - 1; i >= 0; i--) {
    const uid = order[i]
    const c = cal(uid)
    const d = efetiva(uid)
    /** Término tarde que corresponde a um limite de INÍCIO tarde (LF = LS + d). */
    const doInicio = (limite: number) => terminarEm(c, iniciarEm(c, limite, d), d)
    let late = terminoProjeto
    for (const e of outgoing.get(uid) ?? []) {
      const succ = byUid.get(e.succ)!
      if (started(succ)) continue // sucessora já iniciada não restringe a predecessora
      const sLs = ls.get(e.succ) ?? terminoProjeto
      const sLf = lf.get(e.succ) ?? terminoProjeto
      switch (e.type) {
        case 'FS': late = Math.min(late, menosLag(sLs, e)); break
        case 'SS': late = Math.min(late, doInicio(menosLag(sLs, e))); break
        case 'FF': late = Math.min(late, menosLag(sLf, e)); break
        case 'SF': late = Math.min(late, doInicio(menosLag(sLf, e))); break
      }
    }
    lf.set(uid, late)
    ls.set(uid, c.somarUteis(late, -d))
  }

  // ---------- Folgas e datas ----------
  const result = new Map<number, ScheduledTask>()
  for (const uid of order) {
    const t = byUid.get(uid)!
    const c = cal(uid)
    const s = es.get(uid)!
    const f = ef.get(uid)!
    const concluida = done(t)
    const folgaTotal = concluida ? 0 : c.minutosUteisEntre(f, lf.get(uid)!)

    let folgaLivre = c.minutosUteisEntre(f, terminoProjeto)
    for (const e of outgoing.get(uid) ?? []) {
      const sEs = es.get(e.succ)!
      const sEf = ef.get(e.succ)!
      let slack: number
      switch (e.type) {
        case 'FS': slack = c.minutosUteisEntre(f, menosLag(sEs, e)); break
        case 'SS': slack = c.minutosUteisEntre(s, menosLag(sEs, e)); break
        case 'FF': slack = c.minutosUteisEntre(f, menosLag(sEf, e)); break
        case 'SF': slack = c.minutosUteisEntre(s, menosLag(sEf, e)); break
      }
      folgaLivre = Math.min(folgaLivre, slack)
    }

    const marco = f === s
    const dataTermino = (m: number) => dataDoMomento(base, c.fimUtilAte(m) - 1)
    const inicioNorm = c.proximoUtil(s)
    const earlyFinish = marco ? undefined : dataTermino(f)
    // Marco: data do último trecho útil até o momento (o dia da predecessora); no início do projeto, o 1º dia útil
    let finish = marco ? (c.uteisAte(s) === 0 ? dataDoMomento(base, inicioNorm) : dataTermino(s)) : dataTermino(f)
    let start = marco ? finish : dataDoMomento(base, s)
    if (forecast && t.percentComplete > 0 && t.actualStart) start = t.actualStart
    if (concluida && t.actualFinish) finish = t.actualFinish

    const folgaLivreMin = concluida ? 0 : Math.max(0, folgaLivre)
    result.set(uid, {
      uid,
      inicioCedoMin: s,
      terminoCedoMin: f,
      inicioTardeMin: ls.get(uid)!,
      terminoTardeMin: lf.get(uid)!,
      earlyStart: dataDoMomento(base, inicioNorm),
      earlyFinish: earlyFinish ?? finish,
      lateStart: dataDoMomento(base, c.proximoUtil(ls.get(uid)!)),
      lateFinish: dataTermino(lf.get(uid)!),
      start,
      finish,
      inicioHora: horaDoMomento(marco ? s : inicioNorm),
      terminoHora: horaDoMomento(c.fimUtilAte(f)),
      folgaTotalMin: folgaTotal,
      folgaLivreMin,
      totalFloat: minutosParaDias(folgaTotal, mpd),
      freeFloat: minutosParaDias(folgaLivreMin, mpd),
      critical: !concluida && folgaTotal <= 0,
      duracaoMin: c.minutosUteisEntre(s, f),
      restanteMin: restante.get(uid)!,
    })
  }

  const scheduled = [...result.values()]
  const projectStart = scheduled.reduce((m, x) => (x.start < m ? x.start : m), scheduled[0]?.start ?? base)
  const projectFinish = scheduled.reduce((m, x) => (x.finish > m ? x.finish : m), scheduled[0]?.finish ?? base)
  const criticalPath = scheduled
    .filter((x) => x.critical)
    .sort((a, b) => a.inicioCedoMin - b.inicioCedoMin || a.terminoCedoMin - b.terminoCedoMin)
    .map((x) => x.uid)

  return { byUid: result, projectStart, projectFinish, terminoProjetoMin: terminoProjeto, criticalPath, order }
}

/** Grava a linha de base (datas e duração) a partir de um cálculo sem avanço. */
export function withBaseline(tasks: Task[], baseline: ScheduleResult, onlyMissing = false): Task[] {
  return tasks.map((t) => {
    const s = baseline.byUid.get(t.uid)
    // Linha de base incompleta (só início ou só término) é a do arquivo: mantém (CR-12)
    if (!s || (onlyMissing && (t.baselineStart || t.baselineFinish))) return t
    return { ...t, baselineStart: s.start, baselineFinish: s.finish, baselineDuracaoMin: s.duracaoMin }
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
