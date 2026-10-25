// Diagnóstico executivo gerado a partir dos indicadores (texto determinístico, rastreável aos números).
import type { SiteRestriction, Task } from '@/types/domain'
import type { EvmMetrics, PackageEvm } from './evm'
import type { DelayAnalysis } from './scenarios'
import type { SupplyAnalysis } from './supplies'
import { fmtBRL, fmtBRLCompact, fmtDate, fmtIndex } from './format'

export interface Diagnosis {
  status: 'verde' | 'amarelo' | 'vermelho' | 'sem-dados' | 'sem-orcamento'
  headline: string
  paragraphs: string[]
  actions: string[]
}

const short = (name: string) =>
  name.replace('Alvenaria de vedação bloco cerâmico 14x19x29', 'Alvenaria').replace('Estrutura de concreto armado fck 30', 'Estrutura')

export function buildDiagnosis(args: {
  projectName: string
  statusDate: string
  evm: EvmMetrics
  packages: PackageEvm[]
  delay: DelayAnalysis
  tasks: Task[]
  restrictions: SiteRestriction[]
  supplies: SupplyAnalysis[]
  recoveryTotal: number
}): Diagnosis {
  const { evm, packages, delay, tasks, restrictions, supplies, recoveryTotal } = args

  // Sem cronograma (0 tarefas): não há entrega nem desempenho; SPI e CPI 1,00 são só o fallback do safeDiv
  if (tasks.length === 0) {
    return {
      status: 'sem-dados',
      headline: 'Obra sem cronograma para diagnosticar',
      paragraphs: [
        `O ${args.projectName} não tem tarefas na data de status (${fmtDate(args.statusDate)}). Sem elas, não há entrega prevista nem indicadores de desempenho.`,
      ],
      actions: ['Use Importar .xml no topo para trazer o cronograma do MS Project, ou cadastre os pacotes na EAP.'],
    }
  }
  // Sem orçamento (BAC = 0, mas com tarefas): somem SPI, CPI e os textos de custo e valor; o diagnóstico de prazo pelo CPM continua
  const semOrcamento = evm.bac <= 0
  const leaves = tasks.filter((t) => !t.isSummary)
  const active = packages.filter((p) => p.pv > 0 || p.ac > 0)

  const costDrain = [...active].filter((p) => p.cv < 0).sort((a, b) => a.cv - b.cv)[0]
  const scheduleDrain = [...active].filter((p) => p.sv < 0).sort((a, b) => a.spi - b.spi)[0]

  // Tarefa que mais drena margem (CV por tarefa)
  const taskCv = leaves
    .filter((t) => t.actualCost > 0)
    .map((t) => ({ t, cv: (t.bac * t.percentComplete) / 100 - t.actualCost }))
    .sort((a, b) => a.cv - b.cv)[0]

  const worst = Math.min(evm.spi, evm.cpi)
  const status: Diagnosis['status'] = semOrcamento ? 'sem-orcamento' : worst >= 0.98 ? 'verde' : worst >= 0.9 ? 'amarelo' : 'vermelho'

  const prazo =
    evm.spi >= 1
      ? `adiantada (SPI ${fmtIndex(evm.spi)})`
      : `atrasada (SPI ${fmtIndex(evm.spi)}: para cada R$ 1,00 planejado, apenas R$ ${fmtIndex(evm.spi)} foi executado)`
  const custo =
    evm.cpi >= 1
      ? `abaixo do orçamento (CPI ${fmtIndex(evm.cpi)})`
      : `acima do orçamento (CPI ${fmtIndex(evm.cpi)}: cada R$ 1,00 gasto entrega R$ ${fmtIndex(evm.cpi)} de valor)`

  const headline = semOrcamento
    ? delay.delayDays > 0
      ? `Entrega prevista com atraso de ${delay.delayDays} dias úteis — ação requerida (sem orçamento para medir custo)`
      : 'Prazo dentro da linha de base (sem orçamento para medir custo)'
    : status === 'verde'
      ? 'Obra sob controle em prazo e custo'
      : `Obra ${evm.spi < 1 ? 'atrasada' : 'no prazo'} e ${evm.cpi < 1 ? 'com estouro de custo' : 'dentro do custo'} — ação requerida`

  const paragraphs: string[] = []
  if (semOrcamento) {
    paragraphs.push(
      `Na data de status (${fmtDate(args.statusDate)}), as tarefas do ${args.projectName} não têm orçamento (BAC): os indicadores de custo e de valor agregado (SPI, CPI, EAC) não foram calculados. O diagnóstico abaixo é de prazo, pelo caminho crítico.`,
    )
  } else {
    paragraphs.push(
      `Na data de status (${fmtDate(args.statusDate)}), o ${args.projectName} apresenta avanço físico-financeiro de ${evm.earnedPct.toFixed(1).replace('.', ',')}% contra ${evm.plannedPct.toFixed(1).replace('.', ',')}% planejados. ` +
      `A obra está ${prazo} e ${custo}. Valor Agregado (EV) de ${fmtBRLCompact(evm.ev)} frente a ${fmtBRLCompact(evm.pv)} planejados (SV ${fmtBRLCompact(evm.sv)}) e custo real (AC) de ${fmtBRLCompact(evm.ac)} (CV ${fmtBRLCompact(evm.cv)}).`,
    )
  }

  if (costDrain) {
    paragraphs.push(
      `Margem: o pacote ${costDrain.wbs} ${costDrain.name} é o principal dreno financeiro, com CV de ${fmtBRL(costDrain.cv)} (CPI ${fmtIndex(costDrain.cpi)})` +
        (taskCv && taskCv.cv < 0 ? `, concentrado em [UID ${taskCv.t.uid}] ${short(taskCv.t.name)} (${fmtBRL(taskCv.cv)}).` : '.') +
        ` Mantida a eficiência atual, a estimativa no término (EAC = BAC/CPI) é ${fmtBRLCompact(evm.eac)}, ${evm.vac < 0 ? 'estouro' : 'economia'} de ${fmtBRLCompact(Math.abs(evm.vac))} (VAC) sobre o BAC de ${fmtBRLCompact(evm.bac)}. ` +
        `Para fechar no orçamento, o saldo precisa ser executado com TCPI de ${fmtIndex(evm.tcpi)}.`,
    )
  }

  if (scheduleDrain || delay.delayDays > 0) {
    const pk = scheduleDrain ? `O pacote ${scheduleDrain.wbs} ${scheduleDrain.name} tem o pior desempenho de prazo (SPI ${fmtIndex(scheduleDrain.spi)}). ` : ''
    const crit =
      delay.origin && delay.delayDays > 0
        ? `No caminho crítico, [UID ${delay.origin.uid}] ${short(delay.origin.name)} está a ${Math.round(delay.origin.percentComplete)}% e desloca ${delay.affected.filter((a) => a.critical).length} sucessoras críticas, empurrando a entrega das chaves de ${fmtDate(delay.keysBaseline)} para ${fmtDate(delay.keysForecast)} (+${delay.delayDays} dias úteis).`
        : delay.delayDays <= 0
          ? `A entrega das chaves segue prevista para ${fmtDate(delay.keysForecast)}, dentro da linha de base.`
          : ''
    paragraphs.push(pk + crit)
  }

  const openR = restrictions.filter((r) => !r.resolved)
  const supplyAlerts = supplies.filter((s) => ['ruptura', 'atrasada', 'entrega-tardia'].includes(s.status))
  if (openR.length || supplyAlerts.length) {
    paragraphs.push(
      `Riscos operacionais: ${openR.length ? `${openR.length} restrição(ões) de campo em aberto (${openR.slice(0, 3).map((r) => r.label.toLowerCase()).join('; ')})` : 'sem restrições de campo em aberto'}` +
        `${supplyAlerts.length ? ` e ${supplyAlerts.length} insumo(s) com risco de parada (${supplyAlerts.map((s) => s.material.name).join(', ')})` : ''}.`,
    )
  }

  const actions: string[] = []
  if (delay.delayDays > 0) actions.push('Aprovar plano de recuperação no módulo Caminho Crítico (comparar Crashing, Fast Tracking e Hora Extra).')
  if (supplyAlerts.length) actions.push(`Emitir hoje os pedidos atrasados: ${supplyAlerts.map((s) => s.material.name).join(', ')}.`)
  if (costDrain && costDrain.cpi < 0.95) actions.push(`Auditar apropriação de custos de ${costDrain.name} (preço de insumos, perdas e produtividade das equipes).`)
  if (supplies.some((s) => s.status === 'reagendar')) actions.push('Reagendar entregas de insumos das frentes atrasadas para preservar caixa e espaço no canteiro.')
  if (recoveryTotal > 0) actions.push(`Provisionar ${fmtBRL(recoveryTotal)} de custos de recuperação já comprometidos.`)
  if (!actions.length) actions.push('Manter rotina semanal de apontamento e reprogramação.')

  return { status, headline, paragraphs, actions }
}
