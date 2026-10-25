<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TrendingUp, Gauge, Wallet, Target, Bot, Copy, Table2, LineChart, ClipboardList, Sigma, Activity, CalendarCheck, MousePointerClick } from 'lucide-vue-next'
import IndexTrendChart from '@/components/charts/IndexTrendChart.vue'
import { indexSeries, monthlyIncrements } from '@/lib/evm'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import KpiTile, { type KpiTone } from '@/components/common/KpiTile.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import SCurveChart from '@/components/charts/SCurveChart.vue'
import { buildDiagnosis } from '@/lib/diagnosis'
import { fmtBRL, fmtBRLCompact, fmtDate, fmtIndex, fmtPct } from '@/lib/format'

const project = useProjectStore()
const ui = useUiStore()
const e = computed(() => project.evm)
const view = ref<'grafico' | 'tabela'>('grafico')

// Curva S interativa: recorte por pacote, acumulado x mensal e detalhe do mês clicado
const pkg = ref('')
const mode = ref<'acumulado' | 'mensal'>('acumulado')
const curve = computed(() => project.sCurveFor(pkg.value || undefined))
const curveShown = computed(() => (mode.value === 'mensal' ? monthlyIncrements(curve.value) : curve.value))
const curveEvm = computed(() => project.evmFor(pkg.value || undefined))
const selectedIdx = ref<number>()
const statusIdx = computed(() => curve.value.findIndex((p) => p.label.endsWith('●')))
const snapshotIdx = computed(() => selectedIdx.value ?? (statusIdx.value >= 0 ? statusIdx.value : undefined))
const snapshot = computed(() => {
  const i = snapshotIdx.value
  if (i === undefined || !curve.value[i]) return undefined
  const acc = curve.value[i]
  const month = monthlyIncrements(curve.value)[i]
  return {
    acc,
    month,
    spi: acc.ev !== null && acc.pv > 0 ? acc.ev / acc.pv : undefined,
    cpi: acc.ev !== null && acc.ac ? acc.ev / acc.ac : undefined,
    future: acc.ev === null,
  }
})
watch(pkg, () => (selectedIdx.value = undefined))
const indexPoints = computed(() => indexSeries(curve.value))
/** Variações menores que o arredondamento exibido (0,01) contam como estáveis. */
const trendWord = (before: number, after: number) => (Math.abs(after - before) < 0.005 ? 'ficou estável' : after > before ? 'melhorou' : 'piorou')
const forecast = computed(() => project.evmForecast)
const pkgName = computed(() => project.packageEvm.find((p) => p.wbs === pkg.value)?.name)

const idxTone = (v: number): KpiTone => (v >= 1 ? 'ok' : v >= 0.95 ? 'warn' : 'critical')
const moneyTone = (v: number): KpiTone => (v >= 0 ? 'ok' : 'critical')

const diagnosis = computed(() =>
  buildDiagnosis({
    projectName: project.state.meta.name,
    statusDate: project.state.meta.statusDate,
    evm: e.value,
    packages: project.packageEvm,
    delay: project.delay,
    tasks: project.state.tasks,
    restrictions: project.state.restrictions,
    supplies: project.supplies,
    recoveryTotal: project.recoveryTotal,
  }),
)
const statusStyle = computed(
  () =>
    ({
      verde: { chip: 'chip-ok', label: 'Verde · sob controle' },
      amarelo: { chip: 'chip-warn', label: 'Amarelo · atenção' },
      vermelho: { chip: 'chip-critical', label: 'Vermelho · ação imediata' },
    })[diagnosis.value.status],
)

async function copyReport() {
  const d = diagnosis.value
  const text = `RELATÓRIO SEMANAL — ${project.state.meta.name}\nData de status: ${fmtDate(project.state.meta.statusDate)}\nStatus: ${statusStyle.value.label}\n\n${d.headline}\n\n${d.paragraphs.join('\n\n')}\n\nAções recomendadas:\n${d.actions.map((a) => `• ${a}`).join('\n')}`
  try {
    await navigator.clipboard.writeText(text)
    ui.notify('success', 'Diagnóstico copiado', 'Cole no relatório semanal da diretoria.')
  } catch {
    ui.notify('error', 'Não foi possível copiar', 'Permita o acesso à área de transferência no navegador.')
  }
}
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Dor 5"
      title="Dashboard de Valor Agregado (EVM) e Curva S"
      description="Indicadores PMBOK calculados tarefa a tarefa a partir do BAC, do avanço físico e do custo real — atualizados a cada apontamento, cenário ou pacote SINAPI."
    >
      <span :class="statusStyle.chip">{{ statusStyle.label }}</span>
    </ModuleHeader>

    <div class="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      <KpiTile label="BAC" :value="fmtBRLCompact(e.bac)" sub="Orçamento total" :icon="Wallet" hint="Budget at Completion" />
      <KpiTile label="PV" :value="fmtBRLCompact(e.pv)" :sub="`${fmtPct(e.plannedPct, 1)} planejado`" :icon="Target" hint="Valor Planejado até a data de status" />
      <KpiTile label="EV" :value="fmtBRLCompact(e.ev)" :sub="`${fmtPct(e.earnedPct, 1)} agregado`" tone="accent" :icon="TrendingUp" hint="Valor Agregado = Σ BAC × % concluído" />
      <KpiTile label="AC" :value="fmtBRLCompact(e.ac)" sub="Custo real" :icon="Wallet" hint="Custo Real incorrido" />
      <KpiTile label="SPI" :value="fmtIndex(e.spi)" sub="EV / PV" :tone="idxTone(e.spi)" :icon="Gauge" />
      <KpiTile label="CPI" :value="fmtIndex(e.cpi)" sub="EV / AC" :tone="idxTone(e.cpi)" :icon="Gauge" />
      <KpiTile label="EAC" :value="fmtBRLCompact(e.eac)" sub="BAC / CPI" :tone="e.eac > e.bac ? 'critical' : 'ok'" :icon="Sigma" />
      <KpiTile label="VAC" :value="fmtBRLCompact(e.vac)" sub="BAC − EAC" :tone="moneyTone(e.vac)" :icon="Sigma" />
    </div>

    <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,8fr)_minmax(0,5fr)]">
      <SectionCard
        title="Curva S Físico-Financeira"
        :subtitle="`${pkgName ? `Pacote ${pkg} ${pkgName}` : 'Obra inteira'} · ● = mês da data de status · clique num mês para detalhar`"
        :icon="LineChart"
      >
        <template #actions>
          <select v-model="pkg" class="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-[11px] dark:border-zinc-700" aria-label="Recorte da Curva S">
            <option value="">Obra inteira</option>
            <option v-for="p in project.packageEvm" :key="p.wbs" :value="p.wbs">{{ p.wbs }} {{ p.name }}</option>
          </select>
          <div class="flex rounded-md border border-zinc-200 text-[11px] dark:border-zinc-700">
            <button class="px-2 py-1" :class="mode === 'acumulado' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" @click="mode = 'acumulado'">Acumulado</button>
            <button class="px-2 py-1" :class="mode === 'mensal' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" @click="mode = 'mensal'">Mensal</button>
          </div>
          <div class="flex rounded-md border border-zinc-200 text-[11px] dark:border-zinc-700">
            <button class="flex items-center gap-1 px-2 py-1" :class="view === 'grafico' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" @click="view = 'grafico'"><LineChart class="h-3 w-3" /> Gráfico</button>
            <button class="flex items-center gap-1 px-2 py-1" :class="view === 'tabela' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" @click="view = 'tabela'"><Table2 class="h-3 w-3" /> Tabela</button>
          </div>
        </template>
        <SCurveChart v-if="view === 'grafico'" :points="curveShown" :bac="curveEvm.bac" :mode="mode" :selected-index="snapshotIdx" @select="(i) => (selectedIdx = i)" />
        <div v-else class="max-h-[340px] overflow-auto">
          <table class="table-base">
            <thead><tr><th>Mês</th><th class="text-right">PV {{ mode }}</th><th class="text-right">EV {{ mode }}</th><th class="text-right">AC {{ mode }}</th><th class="text-right">Tendência</th></tr></thead>
            <tbody>
              <tr v-for="(p, i) in curveShown" :key="p.date" class="cursor-pointer" :class="i === snapshotIdx ? 'bg-amber-400/10' : ''" @click="selectedIdx = i">
                <td class="capitalize">{{ p.label }}</td>
                <td class="text-right tabular-nums">{{ fmtBRL(p.pv) }}</td>
                <td class="text-right tabular-nums">{{ p.ev === null ? '—' : fmtBRL(p.ev) }}</td>
                <td class="text-right tabular-nums">{{ p.ac === null ? '—' : fmtBRL(p.ac) }}</td>
                <td class="text-right tabular-nums text-zinc-500">{{ p.forecast === null ? '—' : fmtBRL(p.forecast) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Detalhe do mês selecionado -->
        <div v-if="snapshot" class="mt-3 rounded-lg border border-amber-400/40 bg-amber-400/[0.05] p-3 text-[12px]">
          <div class="mb-2 flex items-center gap-1.5 font-semibold">
            <MousePointerClick class="h-3.5 w-3.5 text-amber-500" />
            <span class="capitalize">{{ snapshot.acc.label.replace(' ●', '') }}</span>
            <span class="text-[11px] font-normal text-zinc-500">{{ snapshotIdx === statusIdx ? '(até a data de status)' : snapshot.future ? '(planejado — mês futuro)' : '(acumulado no fim do mês)' }}</span>
          </div>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div><span class="text-zinc-500">PV acum.</span><div class="font-semibold tabular-nums">{{ fmtBRLCompact(snapshot.acc.pv) }}</div><div class="text-[10.5px] text-zinc-500">mês {{ fmtBRLCompact(snapshot.month.pv) }}</div></div>
            <div><span class="text-zinc-500">EV acum.</span><div class="font-semibold tabular-nums">{{ snapshot.acc.ev === null ? '—' : fmtBRLCompact(snapshot.acc.ev) }}</div><div v-if="snapshot.month.ev !== null" class="text-[10.5px] text-zinc-500">mês {{ fmtBRLCompact(snapshot.month.ev) }}</div></div>
            <div><span class="text-zinc-500">AC acum.</span><div class="font-semibold tabular-nums">{{ snapshot.acc.ac === null ? '—' : fmtBRLCompact(snapshot.acc.ac) }}</div><div v-if="snapshot.month.ac !== null" class="text-[10.5px] text-zinc-500">mês {{ fmtBRLCompact(snapshot.month.ac) }}</div></div>
            <div><span class="text-zinc-500">SPI</span><div class="font-semibold tabular-nums" :class="snapshot.spi !== undefined && snapshot.spi < 0.95 ? 'text-coral-600 dark:text-coral-400' : ''">{{ snapshot.spi === undefined ? '—' : fmtIndex(snapshot.spi) }}</div></div>
            <div><span class="text-zinc-500">CPI</span><div class="font-semibold tabular-nums" :class="snapshot.cpi !== undefined && snapshot.cpi < 0.95 ? 'text-coral-600 dark:text-coral-400' : ''">{{ snapshot.cpi === undefined ? '—' : fmtIndex(snapshot.cpi) }}</div></div>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-200 pt-3 text-[12px] dark:border-zinc-800 sm:grid-cols-4">
          <div><span class="text-zinc-500">SV (EV − PV)</span><div class="font-semibold tabular-nums" :class="curveEvm.sv < 0 ? 'text-coral-600 dark:text-coral-400' : 'text-emerald-600 dark:text-emerald-400'">{{ fmtBRL(curveEvm.sv) }}</div></div>
          <div><span class="text-zinc-500">CV (EV − AC)</span><div class="font-semibold tabular-nums" :class="curveEvm.cv < 0 ? 'text-coral-600 dark:text-coral-400' : 'text-emerald-600 dark:text-emerald-400'">{{ fmtBRL(curveEvm.cv) }}</div></div>
          <div><span class="text-zinc-500">ETC (EAC − AC)</span><div class="font-semibold tabular-nums">{{ fmtBRL(curveEvm.etc) }}</div></div>
          <div><span class="text-zinc-500">TCPI</span><div class="font-semibold tabular-nums" :class="curveEvm.tcpi > 1.05 ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtIndex(curveEvm.tcpi) }}</div></div>
        </div>
      </SectionCard>

      <section class="card flex flex-col border-amber-400/40 xl:max-h-[540px]">
        <header class="card-header">
          <div class="flex items-start gap-2.5">
            <div class="mt-0.5 rounded-md bg-amber-400/15 p-1.5"><Bot class="h-4 w-4 text-amber-500" /></div>
            <div>
              <h2 class="card-title">Diagnóstico Executivo da IA</h2>
              <p class="card-subtitle">Texto pronto para o relatório semanal da diretoria</p>
            </div>
          </div>
          <button class="btn-secondary" @click="copyReport"><Copy class="h-3.5 w-3.5" /> Copiar</button>
        </header>
        <div class="flex-1 space-y-3 overflow-y-auto p-5 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          <p class="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{{ diagnosis.headline }}</p>
          <p v-for="(p, i) in diagnosis.paragraphs" :key="i">{{ p }}</p>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <div class="eyebrow mb-1.5 flex items-center gap-1"><ClipboardList class="h-3 w-3" /> Ações recomendadas</div>
            <ul class="list-disc space-y-1 pl-4 text-[12.5px]"><li v-for="a in diagnosis.actions" :key="a">{{ a }}</li></ul>
          </div>
          <p class="text-[10.5px] text-zinc-500">Gerado de forma determinística a partir dos indicadores calculados nesta tela. Revise antes de enviar.</p>
        </div>
      </section>
    </div>

    <div class="grid items-start gap-5 xl:grid-cols-2">
      <SectionCard title="Tendência de SPI e CPI" :subtitle="`Índices acumulados mês a mês · ${pkgName ? `pacote ${pkg}` : 'obra inteira'} · abaixo de 1,00 = atraso / estouro`" :icon="Activity">
        <IndexTrendChart v-if="indexPoints.length" :points="indexPoints" />
        <p v-else class="py-10 text-center text-xs text-zinc-500">Sem execução registrada neste recorte.</p>
        <div v-if="indexPoints.length >= 2" class="mt-2 text-[11.5px] text-zinc-500">
          No último mês o SPI {{ trendWord(indexPoints.at(-2)!.spi, indexPoints.at(-1)!.spi) }}
          ({{ fmtIndex(indexPoints.at(-2)!.spi) }} → {{ fmtIndex(indexPoints.at(-1)!.spi) }}) e o CPI {{ trendWord(indexPoints.at(-2)!.cpi, indexPoints.at(-1)!.cpi) }}
          ({{ fmtIndex(indexPoints.at(-2)!.cpi) }} → {{ fmtIndex(indexPoints.at(-1)!.cpi) }}).
        </div>
      </SectionCard>

      <SectionCard title="Previsão no término" subtitle="Três premissas de EAC e término pelo SPI x CPM" :icon="CalendarCheck">
        <table class="table-base">
          <thead><tr><th>Premissa</th><th>Fórmula</th><th class="text-right">EAC</th><th class="text-right">VAC</th></tr></thead>
          <tbody>
            <tr v-for="v in forecast.eac" :key="v.id" :title="v.hint">
              <td class="font-medium">{{ v.label }}<div class="text-[10.5px] font-normal text-zinc-500">{{ v.hint }}</div></td>
              <td class="mono whitespace-nowrap">{{ v.formula }}</td>
              <td class="text-right font-semibold tabular-nums">{{ fmtBRLCompact(v.value) }}</td>
              <td class="text-right tabular-nums" :class="v.vac < 0 ? 'text-coral-600 dark:text-coral-400' : 'text-emerald-600 dark:text-emerald-400'">{{ fmtBRLCompact(v.vac) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="mt-4 grid grid-cols-3 gap-3 text-[12px]">
          <div class="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
            <div class="eyebrow">Linha de base</div>
            <div class="mt-0.5 font-semibold tabular-nums">{{ fmtDate(forecast.baselineFinish) }}</div>
            <div class="text-[10.5px] text-zinc-500">{{ forecast.bySpi.plannedDays }} d.u. planejados</div>
          </div>
          <div class="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
            <div class="eyebrow">Pelo SPI</div>
            <div class="mt-0.5 font-semibold tabular-nums" :class="forecast.bySpi.date > forecast.baselineFinish ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtDate(forecast.bySpi.date) }}</div>
            <div class="text-[10.5px] text-zinc-500">{{ forecast.bySpi.plannedDays }} ÷ {{ fmtIndex(e.spi) }} = {{ forecast.bySpi.estimatedDays }} d.u.</div>
          </div>
          <div class="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
            <div class="eyebrow">Pelo CPM</div>
            <div class="mt-0.5 font-semibold tabular-nums" :class="forecast.cpmFinish > forecast.baselineFinish ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtDate(forecast.cpmFinish) }}</div>
            <div class="text-[10.5px] text-zinc-500">rede reprogramada</div>
          </div>
        </div>
        <p class="mt-3 text-[10.5px] leading-relaxed text-zinc-500">
          O SPI mede o desempenho médio da obra; o CPM mede o caminho crítico. Quando o término pelo SPI fica muito depois do CPM, o atraso está espalhado em frentes com folga, que podem virar críticas.
          Fórmulas usuais de EVM (<a href="https://www.pmi.org/standards/pmbok" target="_blank" rel="noopener noreferrer" class="underline">PMBOK Guide</a>).
        </p>
      </SectionCard>
    </div>

    <SectionCard title="EVM por pacote da EAP" subtitle="Onde está o desvio de prazo e de custo" :icon="Table2" body-class="overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>EAP</th><th>Pacote</th><th class="text-right">BAC</th><th class="min-w-[140px]">Físico (EV/BAC)</th><th class="text-right">PV</th><th class="text-right">EV</th><th class="text-right">AC</th>
            <th class="text-right">SV</th><th class="text-right">CV</th><th class="text-right">SPI</th><th class="text-right">CPI</th><th class="text-right">EAC</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="p in project.packageEvm" :key="p.wbs">
            <td class="mono">{{ p.wbs }}</td>
            <td class="font-medium">{{ p.name }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(p.bac) }}</td>
            <td>
              <div class="flex items-center gap-2"><ProgressBar :value="p.earnedPct" :tone="p.spi < 0.95 ? 'critical' : 'ok'" /><span class="w-10 text-right tabular-nums text-[11px]">{{ fmtPct(p.earnedPct) }}</span></div>
            </td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(p.pv) }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(p.ev) }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(p.ac) }}</td>
            <td class="text-right tabular-nums" :class="p.sv < -1 ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtBRLCompact(p.sv) }}</td>
            <td class="text-right tabular-nums" :class="p.cv < -1 ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtBRLCompact(p.cv) }}</td>
            <td class="text-right font-semibold tabular-nums" :class="p.pv > 0 && p.spi < 0.95 ? 'text-coral-600 dark:text-coral-400' : ''">{{ p.pv > 0 ? fmtIndex(p.spi) : '—' }}</td>
            <td class="text-right font-semibold tabular-nums" :class="p.ac > 0 && p.cpi < 0.95 ? 'text-coral-600 dark:text-coral-400' : ''">{{ p.ac > 0 ? fmtIndex(p.cpi) : '—' }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(p.eac) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="project.recoveryTotal > 0" class="border-t border-zinc-200 px-4 py-2.5 text-[12px] dark:border-zinc-800">
        Custos de recuperação comprometidos (cenários aplicados): <strong class="tabular-nums text-coral-600 dark:text-coral-400">{{ fmtBRL(project.recoveryTotal) }}</strong> — EAC ajustado:
        <strong class="tabular-nums">{{ fmtBRL(e.eac + project.recoveryTotal) }}</strong>
      </p>
    </SectionCard>
  </div>
</template>
