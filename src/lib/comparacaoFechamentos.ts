// Comparação entre dois fechamentos (ciclo 00007, RF-04.6, D-33): o que avançou, atrasou ou adiantou, mudou de custo, entrou ou saiu da obra, e os Δ dos totais.
import type { WorkCalendar } from './calendar'
import { POS, type CabecalhoFechamento, type DetalheFechamento, type TarefaFechamento } from '@/types/fechamento'
import { workingVariance } from './scenarios'
import { compareWbs } from './wbs'

/** Meio centavo: abaixo disso a diferença de R$ é ruído de ponto flutuante, não mudança de custo. */
export const TOLERANCIA_CUSTO = 0.005

export interface FechamentoComDetalhe {
  cabecalho: CabecalhoFechamento
  detalhe: DetalheFechamento
}

/** Uma tarefa nos dois fechamentos (`a` ou `b` ausente: ela entrou ou saiu da obra). */
export interface ItemComparado {
  uid: number
  wbs: string
  pctA?: number
  pctB?: number
  /** Δ do % físico em pontos percentuais (B − A). */
  deltaPct: number
  /** Δ do EV da tarefa (R$): BAC × % físico, com o BAC e o % de cada fechamento. */
  deltaEv: number
  deltaAc: number
  deltaBac: number
  terminoA?: string
  terminoB?: string
  /** Δ do término previsto em dias úteis (positivo = atrasou), pela mesma regra do `workingVariance`. */
  deltaTerminoDu: number
}

export interface DeltaTotal {
  a: number
  b: number
  delta: number
}

export interface ResultadoComparacao {
  a: CabecalhoFechamento
  b: CabecalhoFechamento
  avancaram: ItemComparado[]
  atrasaram: ItemComparado[]
  adiantaram: ItemComparado[]
  mudaramDeCusto: ItemComparado[]
  novas: ItemComparado[]
  removidas: ItemComparado[]
  inalteradas: ItemComparado[]
  totais: { bac: DeltaTotal; pv: DeltaTotal; ev: DeltaTotal; ac: DeltaTotal }
  /** Δ das datas de entrega prevista, em dias úteis, e do atraso gravado. */
  deltaEntregaDu: number
  deltaAtrasoDu: number
}

const ev = (t: TarefaFechamento) => (t[POS.bac] * t[POS.pct]) / 100
const delta = (a: number, b: number): DeltaTotal => ({ a, b, delta: b - a })

/**
 * Compara `a` (o mais antigo) com `b`. As categorias podem se sobrepor (uma tarefa pode avançar e mudar de custo). Novas = só em `b`; removidas = só em `a`;
 * inalteradas = nos dois e fora de todas as categorias. `calendarioPadrao` conta os dias úteis do Δ de término.
 */
export function compararFechamentos(a: FechamentoComDetalhe, b: FechamentoComDetalhe, calendarioPadrao: WorkCalendar): ResultadoComparacao {
  const tarefasA = new Map(a.detalhe.tarefas.map((t) => [t[POS.uid], t]))
  const tarefasB = new Map(b.detalhe.tarefas.map((t) => [t[POS.uid], t]))
  const res: ResultadoComparacao = {
    a: a.cabecalho,
    b: b.cabecalho,
    avancaram: [],
    atrasaram: [],
    adiantaram: [],
    mudaramDeCusto: [],
    novas: [],
    removidas: [],
    inalteradas: [],
    totais: {
      bac: delta(a.cabecalho.totais.bac, b.cabecalho.totais.bac),
      pv: delta(a.cabecalho.totais.pv, b.cabecalho.totais.pv),
      ev: delta(a.cabecalho.totais.ev, b.cabecalho.totais.ev),
      ac: delta(a.cabecalho.totais.ac, b.cabecalho.totais.ac),
    },
    deltaEntregaDu: workingVariance(calendarioPadrao, a.cabecalho.totais.entregaPrevista, b.cabecalho.totais.entregaPrevista),
    deltaAtrasoDu: b.cabecalho.totais.atrasoDiasUteis - a.cabecalho.totais.atrasoDiasUteis,
  }
  for (const [uid, tb] of tarefasB) {
    const ta = tarefasA.get(uid)
    if (!ta) {
      res.novas.push({ uid, wbs: tb[POS.wbs], pctB: tb[POS.pct], deltaPct: 0, deltaEv: 0, deltaAc: 0, deltaBac: 0, terminoB: tb[POS.terminoPrevisto], deltaTerminoDu: 0 })
      continue
    }
    const item: ItemComparado = {
      uid,
      wbs: tb[POS.wbs],
      pctA: ta[POS.pct],
      pctB: tb[POS.pct],
      deltaPct: tb[POS.pct] - ta[POS.pct],
      deltaEv: ev(tb) - ev(ta),
      deltaAc: tb[POS.custoReal] - ta[POS.custoReal],
      deltaBac: tb[POS.bac] - ta[POS.bac],
      terminoA: ta[POS.terminoPrevisto],
      terminoB: tb[POS.terminoPrevisto],
      deltaTerminoDu: workingVariance(calendarioPadrao, ta[POS.terminoPrevisto], tb[POS.terminoPrevisto]),
    }
    const avancou = item.deltaPct > 0
    const atrasou = item.deltaTerminoDu > 0
    const adiantou = item.deltaTerminoDu < 0
    const custo = Math.abs(item.deltaAc) >= TOLERANCIA_CUSTO || Math.abs(item.deltaBac) >= TOLERANCIA_CUSTO
    if (avancou) res.avancaram.push(item)
    if (atrasou) res.atrasaram.push(item)
    if (adiantou) res.adiantaram.push(item)
    if (custo) res.mudaramDeCusto.push(item)
    if (!avancou && !atrasou && !adiantou && !custo) res.inalteradas.push(item)
  }
  for (const [uid, ta] of tarefasA) {
    if (!tarefasB.has(uid)) res.removidas.push({ uid, wbs: ta[POS.wbs], pctA: ta[POS.pct], deltaPct: 0, deltaEv: 0, deltaAc: 0, deltaBac: 0, terminoA: ta[POS.terminoPrevisto], deltaTerminoDu: 0 })
  }
  const porEap = (x: ItemComparado, y: ItemComparado) => compareWbs(x.wbs, y.wbs) || x.uid - y.uid
  for (const lista of [res.avancaram, res.atrasaram, res.adiantaram, res.mudaramDeCusto, res.novas, res.removidas, res.inalteradas]) lista.sort(porEap)
  return res
}
