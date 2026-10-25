// Motor de Caminho Crítico (CPM) em minutos úteis, com vínculos FS/SS/FF/SF, latência (útil, corrida e %), calendário por
// tarefa, as 8 restrições do MS Project, prazo final e reprogramação pela data de status (ciclo 00004, ADR 00003).
//
// Todo cálculo usa "momentos": minutos de relógio desde 00:00 da data-base. Cada calendário converte momento ↔ minuto útil.
// Início de tarefa com duração vai para o próximo momento útil do calendário dela; o término fica no fim do último trecho
// útil (17:00, e não 08:00 do dia seguinte); somar lag 0 não normaliza (o marco fica no término da predecessora).
import type { Lag, OpcoesCronograma, PredecessorLink, ProjectMeta, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import {
  MINUTOS_NO_DIA_CORRIDO,
  MINUTOS_POR_DIA_PADRAO,
  dataDoMomento,
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
  /** Minutos por dia da obra, só para as folgas em dias (padrão 480). */
  minutosPorDia?: number
  /** Opções de progresso (ausente = lógica retida e mover o restante para depois da data de status). */
  opcoes?: Partial<OpcoesCronograma>
}

export const OPCOES_PADRAO: OpcoesCronograma = { logica: 'retida', moverRestante: true }

/** Opções do motor a partir dos dados da obra (minutos por dia e opções de cronograma). */
export function optsDaObra(meta: ProjectMeta, mode: ScheduleOptions['mode'], statusDate?: string): ScheduleOptions {
  return { mode, statusDate, minutosPorDia: meta.minutosPorDia, opcoes: meta.opcoesCronograma }
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

/** Restante de tarefa iniciada: round(duração × (1 − %)), meio para cima, com mínimo de 1 minuto (Remaining Duration do MS Project). */
const restanteDe = (dur: number, pct: number): number => (dur > 0 ? Math.max(1, Math.round((dur * (100 - pct)) / 100)) : 0)

export function computeSchedule(tasks: Task[], cals: CalendariosCompilados, opts: ScheduleOptions): ScheduleResult {
  const leaves = tasks.filter((t) => !t.isSummary)
  const byUid = new Map(leaves.map((t) => [t.uid, t]))
  const { order, validEdges } = topoSort(leaves, buildEdges(tasks, leaves))
  const forecast = opts.mode === 'forecast' && !!opts.statusDate
  const base = cals.base
  const mpd = opts.minutosPorDia ?? MINUTOS_POR_DIA_PADRAO
  const retida = (opts.opcoes?.logica ?? OPCOES_PADRAO.logica) === 'retida'
  const mover = opts.opcoes?.moverRestante ?? OPCOES_PADRAO.moverRestante
  const statusDia = forecast ? diaRelativo(base, opts.statusDate!) : 0
  /** Calendário de início da tarefa e calendário em que a duração corre (o de 24 h para duração corrida). */
  const calInicio = new Map(leaves.map((t) => [t.uid, cals.de(t.calendarioUid)]))
  const calDuracao = new Map(leaves.map((t) => [t.uid, t.duracaoCorrida ? cals.corrido : cals.de(t.calendarioUid)]))
  const cal = (uid: number) => calInicio.get(uid)!
  const calD = (uid: number) => calDuracao.get(uid)!

  const incoming = new Map<number, Edge[]>()
  const outgoing = new Map<number, Edge[]>()
  for (const e of validEdges) {
    if (!incoming.has(e.succ)) incoming.set(e.succ, [])
    if (!outgoing.has(e.pred)) outgoing.set(e.pred, [])
    incoming.get(e.succ)!.push(e)
    outgoing.get(e.pred)!.push(e)
  }
  const lagCal = (e: Edge) => calendarioDoLag(cals, byUid.get(e.pred)!, byUid.get(e.succ)!)
  /** Lag em minutos: o próprio valor, ou, no lag %, round(% × duração da predecessora ÷ 100). */
  const minutosDoLag = (e: Edge): number =>
    e.lag.tipo === 'percentual' ? Math.round((e.lag.percentual * Math.max(0, Math.round(byUid.get(e.pred)!.duracaoMin))) / 100) : e.lag.minutos
  /** Momento depois de somar o lag do vínculo: útil no calendário do lag; corrido em minutos de relógio. */
  const maisLag = (m: number, e: Edge) => (e.lag.tipo === 'corrido' ? m + e.lag.minutos : lagCal(e).somarUteis(m, minutosDoLag(e)))
  /** Momento antes de descontar o lag do vínculo (passo de volta). */
  const menosLag = (m: number, e: Edge) => (e.lag.tipo === 'corrido' ? m - e.lag.minutos : lagCal(e).somarUteis(m, -minutosDoLag(e)))

  const es = new Map<number, number>()
  const ef = new Map<number, number>()
  const restante = new Map<number, number>()
  const conflito = new Set<number>()
  const started = (t: Task) => forecast && t.percentComplete > 0
  const done = (t: Task) => forecast && t.percentComplete >= 100

  /** Primeiro momento útil depois do dia da data de status (calendário da tarefa). */
  const aposStatus = (c: CalendarioCompilado) => c.proximoUtil((statusDia + 1) * MINUTOS_NO_DIA_CORRIDO)

  /** Momento de uma restrição de INÍCIO: só a data = início do expediente do dia; com hora, o momento exato. */
  const momentoDeInicio = (data: string, c: CalendarioCompilado): number | undefined => {
    const dh = lerDataHora(data)
    return dh ? c.proximoUtil(diaRelativo(base, dh.data) * MINUTOS_NO_DIA_CORRIDO + (dh.minuto ?? 0)) : undefined
  }
  /** Momento de uma restrição de TÉRMINO (ou prazo): só a data = fim do expediente do dia; com hora, o momento exato. */
  const momentoDeTermino = (data: string, c: CalendarioCompilado): number | undefined => {
    const dh = lerDataHora(data)
    if (!dh) return undefined
    const dia = diaRelativo(base, dh.data)
    return dh.minuto === undefined ? c.fimUtilAte((dia + 1) * MINUTOS_NO_DIA_CORRIDO) : dia * MINUTOS_NO_DIA_CORRIDO + dh.minuto
  }

  /** Início pelos vínculos, ou `undefined` quando a tarefa não tem vínculo (quem chama aplica o início do projeto, 0). */
  const porVinculos = (t: Task, dur: number): number | undefined => {
    const cd = calD(t.uid)
    let start: number | undefined
    const maior = (v: number) => (start = start === undefined ? v : Math.max(start, v))
    for (const e of incoming.get(t.uid) ?? []) {
      const pEs = es.get(e.pred) ?? 0
      const pEf = ef.get(e.pred) ?? 0
      switch (e.type) {
        case 'FS': maior(maisLag(pEf, e)); break
        case 'SS': maior(maisLag(pEs, e)); break
        case 'FF': maior(cd.somarUteis(maisLag(pEf, e), -dur)); break
        case 'SF': maior(cd.somarUteis(maisLag(pEs, e), -dur)); break
      }
    }
    return start
  }
  /** Início pelos vínculos com o piso do início do projeto (momento 0). */
  const doProjeto = (t: Task, dur: number): number => Math.max(porVinculos(t, dur) ?? 0, 0)

  /** Limites inferiores de data: SNET (início) e FNET (término). */
  const comLimitesInferiores = (t: Task, m: number, dur: number): number => {
    const r = t.restricao
    if (r?.tipo === 'SNET') {
      const lim = momentoDeInicio(r.data, cal(t.uid))
      if (lim !== undefined) return Math.max(m, lim)
    }
    if (r?.tipo === 'FNET') {
      const lim = momentoDeTermino(r.data, calD(t.uid))
      if (lim !== undefined) return Math.max(m, dur > 0 ? calD(t.uid).somarUteis(lim, -dur) : lim)
    }
    return m
  }

  let terminoProjeto = 0
  // ---------- Passo de ida ----------
  /** `fixos` trava tarefas ALAP com sucessora nas datas agendadas (2ª rodada). */
  const ida = (fixos?: Map<number, { s: number; f: number }>) => {
    es.clear()
    ef.clear()
    restante.clear()
    conflito.clear()
    for (const uid of order) {
      const t = byUid.get(uid)!
      const c = cal(uid)
      const cd = calD(uid)
      const dur = Math.max(0, Math.round(t.duracaoMin))
      const fixo = fixos?.get(uid)
      if (fixo) {
        // ALAP com sucessora (2ª rodada): a tarefa fica nas datas agendadas e as sucessoras partem delas
        es.set(uid, fixo.s)
        ef.set(uid, fixo.f)
        restante.set(uid, dur)
        continue
      }
      const inicioReal = t.actualStart ? c.proximoUtil(diaRelativo(base, t.actualStart) * MINUTOS_NO_DIA_CORRIDO) : undefined
      if (done(t)) {
        const s = inicioReal ?? Math.min(iniciarEm(c, comLimitesInferiores(t, doProjeto(t, dur), dur), dur), c.inicioDoDiaUtilNoOuAntes(statusDia))
        const f = t.actualFinish
          ? c.fimUtilAte((diaRelativo(base, t.actualFinish) + 1) * MINUTOS_NO_DIA_CORRIDO)
          : Math.min(terminarEm(cd, s, dur), c.fimUtilAte(aposStatus(c)))
        es.set(uid, s)
        ef.set(uid, Math.max(s, f))
        restante.set(uid, 0)
      } else if (started(t)) {
        const porLigacao = iniciarEm(c, comLimitesInferiores(t, doProjeto(t, dur), dur), dur)
        const s = inicioReal ?? Math.min(porLigacao, c.inicioDoDiaUtilNoOuAntes(statusDia))
        const rem = restanteDe(dur, t.percentComplete)
        // Só os vínculos (sem o piso do início do projeto) restringem o restante: ele já está em andamento.
        // FF e SF contam com a duração do RESTANTE (início do restante = término exigido − restante).
        const vinculos = porVinculos(t, rem)
        const apos = vinculos === undefined ? undefined : iniciarEm(c, vinculos, rem)
        // Parte já feita: termina (duração − restante) minutos úteis depois do início real
        const feito = dur > rem ? cd.somarUteis(s, dur - rem) : s
        // Lógica retida: o restante começa depois da predecessora (fora de sequência); substituir: o progresso ignora o vínculo.
        // Mover o restante (política do CronoAI): começa depois da data de status; sem mover, logo depois da parte já feita.
        let rs = mover ? Math.max(s, aposStatus(c)) : feito
        if (retida && apos !== undefined) rs = Math.max(rs, apos)
        es.set(uid, s)
        const fim = terminarEm(cd, rs, rem)
        ef.set(uid, fim)
        restante.set(uid, rem)
        // FNLT e MFO continuam valendo na tarefa iniciada: término previsto depois do limite é conflito
        const rIni = t.restricao
        if (rIni && (rIni.tipo === 'FNLT' || rIni.tipo === 'MFO')) {
          const lim = momentoDeTermino(rIni.data, cd)
          if (lim !== undefined && fim > lim) conflito.add(uid)
        }
      } else {
        let m = Math.max(doProjeto(t, dur), forecast && mover ? aposStatus(c) : 0)
        m = comLimitesInferiores(t, m, dur)
        let s = iniciarEm(c, m, dur)
        const sVinculos = s
        const r = t.restricao
        const limInicio = r && (r.tipo === 'SNLT' || r.tipo === 'MSO') ? momentoDeInicio(r.data, c) : undefined
        if (limInicio !== undefined) s = r?.tipo === 'MSO' ? iniciarEm(c, limInicio, dur) : Math.min(s, limInicio)
        let f = terminarEm(cd, s, dur)
        const limTermino = r && (r.tipo === 'FNLT' || r.tipo === 'MFO') ? momentoDeTermino(r.data, cd) : undefined
        if (limTermino !== undefined && (r?.tipo === 'MFO' || f > limTermino)) {
          f = limTermino
          s = dur > 0 ? cd.somarUteis(f, -dur) : f
        }
        // A restrição prevalece sobre o vínculo (honrar restrições, gate P2): sinaliza quando começa antes do que os vínculos permitem
        if (s < sVinculos) conflito.add(uid)
        es.set(uid, s)
        ef.set(uid, f)
        restante.set(uid, dur)
      }
    }
    terminoProjeto = order.reduce((m, u) => Math.max(m, ef.get(u) ?? 0), 0)
  }
  ida()

  // Duração efetiva (do início ao término cedo), em minutos úteis do calendário em que a duração corre
  const efetiva = (uid: number) => calD(uid).minutosUteisEntre(es.get(uid)!, ef.get(uid)!)

  // ---------- Passo de volta ----------
  const ls = new Map<number, number>()
  const lf = new Map<number, number>()
  /** Início tarde do RESTANTE: o que restringe a predecessora quando a sucessora está iniciada (lógica retida). */
  const lsRestante = new Map<number, number>()
  const volta = () => {
    ls.clear()
    lf.clear()
    lsRestante.clear()
    for (let i = order.length - 1; i >= 0; i--) {
      const uid = order[i]
      const t = byUid.get(uid)!
      const c = cal(uid)
      const cd = calD(uid)
      const d = efetiva(uid)
      /** Término tarde que corresponde a um limite de INÍCIO tarde (LF = LS + d). */
      const doInicio = (limite: number) => terminarEm(cd, iniciarEm(c, limite, d), d)
      let late = terminoProjeto
      for (const e of outgoing.get(uid) ?? []) {
        const succ = byUid.get(e.succ)!
        if (done(succ) || (started(succ) && !retida)) continue // sucessora concluída não restringe; iniciada só em "substituir"
        const sLs = lsRestante.get(e.succ) ?? terminoProjeto
        const sLf = lf.get(e.succ) ?? terminoProjeto
        switch (e.type) {
          case 'FS': late = Math.min(late, menosLag(sLs, e)); break
          case 'SS': late = Math.min(late, doInicio(menosLag(sLs, e))); break
          case 'FF': late = Math.min(late, menosLag(sLf, e)); break
          case 'SF': late = Math.min(late, doInicio(menosLag(sLf, e))); break
        }
      }
      // Restrições que limitam o término tarde (SNLT, FNLT, MSO e MFO) e o prazo final (LF = min(LF, prazo))
      const r = t.restricao
      // SNLT e MSO deixam de valer na tarefa iniciada (o início já aconteceu); FNLT e MFO continuam limitando o término
      if (r && !started(t) && (r.tipo === 'SNLT' || r.tipo === 'MSO')) {
        const lim = momentoDeInicio(r.data, c)
        if (lim !== undefined) late = Math.min(late, doInicio(lim))
      }
      if (r && !done(t) && (r.tipo === 'FNLT' || r.tipo === 'MFO')) {
        const lim = momentoDeTermino(r.data, cd)
        if (lim !== undefined) late = Math.min(late, lim)
      }
      if (t.prazoFinal) {
        const prazo = momentoDeTermino(t.prazoFinal, cd)
        if (prazo !== undefined) late = Math.min(late, prazo)
      }
      lf.set(uid, late)
      const lateStart = cd.somarUteis(late, -d)
      ls.set(uid, lateStart)
      lsRestante.set(uid, started(t) && !done(t) ? cd.somarUteis(late, -(restante.get(uid) ?? d)) : lateStart)
    }
  }
  volta()

  // ALAP com sucessora: a tarefa vai para as datas tardias e as sucessoras partem delas (nenhuma FS começa antes de o ALAP terminar).
  // 2ª rodada de ida e volta com o ALAP travado; sem sucessora, o ALAP só muda as datas agendadas e mantém as folgas cedo.
  const fixados = new Map<number, { s: number; f: number }>()
  for (const uid of order) {
    const t = byUid.get(uid)!
    if (t.restricao?.tipo === 'ALAP' && !started(t) && (outgoing.get(uid)?.length ?? 0) > 0) {
      fixados.set(uid, { s: cal(uid).proximoUtil(ls.get(uid)!), f: calD(uid).fimUtilAte(lf.get(uid)!) })
    }
  }
  if (fixados.size) {
    ida(fixados)
    volta()
  }

  // ---------- Folgas e datas ----------
  const result = new Map<number, ScheduledTask>()
  for (const uid of order) {
    const t = byUid.get(uid)!
    const c = cal(uid)
    const cd = calD(uid)
    const s = es.get(uid)!
    const f = ef.get(uid)!
    const concluida = done(t)
    const folgaTotal = concluida ? 0 : cd.minutosUteisEntre(f, lf.get(uid)!)

    let folgaLivre = cd.minutosUteisEntre(f, terminoProjeto)
    for (const e of outgoing.get(uid) ?? []) {
      const sEs = es.get(e.succ)!
      const sEf = ef.get(e.succ)!
      let slack: number
      switch (e.type) {
        case 'FS': slack = cd.minutosUteisEntre(f, menosLag(sEs, e)); break
        case 'SS': slack = cd.minutosUteisEntre(s, menosLag(sEs, e)); break
        case 'FF': slack = cd.minutosUteisEntre(f, menosLag(sEf, e)); break
        case 'SF': slack = cd.minutosUteisEntre(s, menosLag(sEf, e)); break
      }
      folgaLivre = Math.min(folgaLivre, slack)
    }

    // ALAP: depois da volta, a tarefa vai para as datas tardias; as datas cedo e as folgas continuam as do cálculo cedo
    const alap = t.restricao?.tipo === 'ALAP' && !started(t) && !fixados.has(uid)
    const sAgendado = alap ? c.proximoUtil(ls.get(uid)!) : s
    const fAgendado = alap ? lf.get(uid)! : f
    const marco = fAgendado === sAgendado
    const dataTermino = (m: number) => dataDoMomento(base, cd.fimUtilAte(m) - 1)
    const inicioNorm = c.proximoUtil(sAgendado)
    /**
     * Data e momento de um marco: os do próprio momento (SNET/MSO em 12/08 aparece em 12/08; SS +0 de tarefa que começa
     * seg 10/08 aparece em 10/08). Só às 00:00 em ponto (fim de um dia de 24 h) vale o dia anterior; antes de qualquer
     * tempo útil (início do projeto), o 1º momento útil.
     */
    const marcoDe = (m: number): { data: string; momento: number } => {
      if (c.uteisAte(m) === 0) {
        const n = c.proximoUtil(m)
        return { data: dataDoMomento(base, n), momento: n }
      }
      if (m === Math.floor(m / MINUTOS_NO_DIA_CORRIDO) * MINUTOS_NO_DIA_CORRIDO) {
        const fim = cd.fimUtilAte(m)
        return { data: dataDoMomento(base, fim - 1), momento: fim }
      }
      return { data: dataDoMomento(base, m), momento: m }
    }
    const marcoAgendado = marco ? marcoDe(sAgendado) : undefined
    const marcoMomento = marcoAgendado?.momento ?? 0
    let finish = marcoAgendado ? marcoAgendado.data : dataTermino(fAgendado)
    let start = marcoAgendado ? marcoAgendado.data : dataDoMomento(base, sAgendado)
    if (forecast && t.percentComplete > 0 && t.actualStart) start = t.actualStart
    if (concluida && t.actualFinish) finish = t.actualFinish

    const folgaLivreMin = concluida ? 0 : Math.max(0, folgaLivre)
    const unidadeDia = t.duracaoCorrida ? MINUTOS_NO_DIA_CORRIDO : mpd
    const prazo = t.prazoFinal ? momentoDeTermino(t.prazoFinal, cd) : undefined
    result.set(uid, {
      uid,
      inicioCedoMin: s,
      terminoCedoMin: f,
      inicioTardeMin: ls.get(uid)!,
      terminoTardeMin: lf.get(uid)!,
      earlyStart: f === s ? marcoDe(s).data : dataDoMomento(base, c.proximoUtil(s)),
      earlyFinish: f === s ? marcoDe(s).data : dataTermino(f),
      lateStart: lf.get(uid) === ls.get(uid) ? marcoDe(lf.get(uid)!).data : dataDoMomento(base, c.proximoUtil(ls.get(uid)!)),
      lateFinish: lf.get(uid) === ls.get(uid) ? marcoDe(lf.get(uid)!).data : dataTermino(lf.get(uid)!),
      start,
      finish,
      inicioHora: horaDoMomento(marco ? marcoMomento : inicioNorm),
      terminoHora: horaDoMomento(marco ? marcoMomento : cd.fimUtilAte(fAgendado)),
      folgaTotalMin: folgaTotal,
      folgaLivreMin,
      totalFloat: minutosParaDias(folgaTotal, unidadeDia),
      freeFloat: minutosParaDias(folgaLivreMin, unidadeDia),
      critical: !concluida && folgaTotal <= 0,
      duracaoMin: cd.minutosUteisEntre(s, f),
      restanteMin: restante.get(uid)!,
      corrida: !!t.duracaoCorrida,
      prazoFinalPerdido: prazo !== undefined && fAgendado > prazo,
      restricaoConflito: conflito.has(uid),
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
