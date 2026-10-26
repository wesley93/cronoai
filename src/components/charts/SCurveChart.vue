<script setup lang="ts">
import { computed } from 'vue'
import { Bar, Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
  type ActiveElement,
} from 'chart.js'
import type { SCurvePoint } from '@/lib/evm'
import { fmtBRL, fmtBRLCompact } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip, Legend)

const props = withDefaults(defineProps<{ points: SCurvePoint[]; bac: number; mode?: 'acumulado' | 'mensal'; selectedIndex?: number }>(), {
  mode: 'acumulado',
  selectedIndex: undefined,
})
const emit = defineEmits<{ select: [index: number] }>()
const ui = useUiStore()

// Paleta validada (scripts/validate_palette.js do skill de dataviz) para fundo claro e escuro
const PALETTE = {
  light: { pv: '#0284c7', ev: '#059669', ac: '#e8553f', fc: '#71717a', grid: 'rgba(24,24,27,0.07)', text: '#52525b', surface: '#ffffff', sel: 'rgba(251,191,36,0.18)' },
  dark: { pv: '#1d8fd6', ev: '#0f9f73', ac: '#e8553f', fc: '#a1a1aa', grid: 'rgba(250,250,250,0.06)', text: '#a1a1aa', surface: '#18181b', sel: 'rgba(251,191,36,0.14)' },
}
const c = computed(() => PALETTE[ui.theme])
const labels = computed(() => props.points.map((p) => p.label))
const radius = (base: number) => (ctx: { dataIndex: number }) => (ctx.dataIndex === props.selectedIndex ? base + 3 : base)
const origemDe = (i: number) => props.points[i]?.origem
// Ponto de fechamento (EV e AC gravados): maior e com anel âmbar; interpolado: pequeno (é uma estimativa). A cor não é a única pista: o rótulo do eixo traz ◆ e a tabela, a coluna Origem
const raioDoPonto = (base: number) => (ctx: { dataIndex: number }) => {
  const o = origemDe(ctx.dataIndex)
  const r = o === 'fechamento' ? base + 2 : o === 'interpolado' ? 2 : base
  return ctx.dataIndex === props.selectedIndex ? r + 3 : r
}
const anelDoPonto = (ctx: { dataIndex: number }) => (origemDe(ctx.dataIndex) === 'fechamento' ? '#f59e0b' : c.value.surface)
const larguraDoAnel = (ctx: { dataIndex: number }) => (origemDe(ctx.dataIndex) === 'fechamento' ? 3 : 2)
// Trecho interpolado (estimativa entre fechamentos): pontilhado CURTO, diferente do tracejado longo da tendência (borderDash [6, 5])
const trechoInterpolado = (ctx: { p1DataIndex: number }) => (['interpolado', 'atual'].includes(origemDe(ctx.p1DataIndex) ?? '') ? [2, 3] : undefined)

const lineData = computed<ChartData<'line'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'PV — Planejado (linha de base)', data: props.points.map((p) => p.pv), borderColor: c.value.pv, backgroundColor: c.value.pv + '14', fill: true, borderWidth: 2, pointRadius: radius(0), pointHoverRadius: 5, tension: 0.35 },
    { label: 'EV — Agregado', data: props.points.map((p) => p.ev), borderColor: c.value.ev, backgroundColor: c.value.ev, borderWidth: 2, pointRadius: raioDoPonto(3), pointHoverRadius: 6, pointBorderColor: anelDoPonto, pointBorderWidth: larguraDoAnel, tension: 0.3, segment: { borderDash: trechoInterpolado } },
    { label: 'AC — Custo Real', data: props.points.map((p) => p.ac), borderColor: c.value.ac, backgroundColor: c.value.ac, borderWidth: 2, pointStyle: 'rectRot', pointRadius: raioDoPonto(4), pointHoverRadius: 7, pointBorderColor: anelDoPonto, pointBorderWidth: larguraDoAnel, tension: 0.3, segment: { borderDash: trechoInterpolado } },
    { label: 'Tendência reprogramada (EV previsto)', data: props.points.map((p) => p.forecast), borderColor: c.value.fc, borderWidth: 2, borderDash: [6, 5], pointRadius: 0, pointHoverRadius: 4, tension: 0.35 },
  ],
}))

const barData = computed<ChartData<'bar'>>(() => ({
  labels: labels.value,
  datasets: [
    { label: 'PV do mês', data: props.points.map((p) => p.pv), backgroundColor: c.value.pv, borderRadius: 4, borderSkipped: 'bottom' as const },
    { label: 'EV do mês', data: props.points.map((p) => p.ev), backgroundColor: c.value.ev, borderRadius: 4, borderSkipped: 'bottom' as const },
    { label: 'AC do mês', data: props.points.map((p) => p.ac), backgroundColor: c.value.ac, borderRadius: 4, borderSkipped: 'bottom' as const },
  ],
}))

function baseOptions() {
  const dark = ui.theme === 'dark'
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 350 },
    interaction: { mode: 'index' as const, intersect: false },
    onClick: (_e: unknown, elements: ActiveElement[]) => {
      if (elements[0]) emit('select', elements[0].index)
    },
    onHover: (e: { native: Event | null }, elements: ActiveElement[]) => {
      const target = e.native?.target as HTMLElement | undefined
      if (target) target.style.cursor = elements.length ? 'pointer' : 'default'
    },
    plugins: {
      legend: { position: 'top' as const, align: 'start' as const, labels: { color: c.value.text, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } } },
      tooltip: {
        backgroundColor: dark ? '#27272a' : '#ffffff',
        titleColor: dark ? '#fafafa' : '#18181b',
        bodyColor: dark ? '#d4d4d8' : '#3f3f46',
        borderColor: dark ? '#3f3f46' : '#e4e4e7',
        borderWidth: 1,
        padding: 10,
        usePointStyle: true,
        callbacks: {
          label: (ctx: { parsed: { y: number | null }; dataset: { label?: string } }) =>
            ctx.parsed.y === null ? '' : ` ${ctx.dataset.label}: ${fmtBRL(ctx.parsed.y)} (${((ctx.parsed.y / Math.max(1, props.bac)) * 100).toFixed(1).replace('.', ',')}% do BAC)`,
          footer: (itens: { dataIndex: number }[]) => (origemDe(itens[0]?.dataIndex ?? -1) === 'fechamento' ? 'Fechamento: EV e AC gravados. Clique para detalhar' : 'Clique para detalhar o ponto'),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
          color: (ctx: { index: number }) => (ctx.index === props.selectedIndex ? '#f59e0b' : c.value.text),
          font: { size: 10 },
          maxRotation: 0,
          autoSkipPadding: 12,
        },
      },
      y: { beginAtZero: true, grid: { color: c.value.grid }, border: { display: false }, ticks: { color: c.value.text, font: { size: 10 }, callback: (v: string | number) => fmtBRLCompact(Number(v)) } },
    },
  }
}
const temFechamento = computed(() => props.points.some((p) => p.origem === 'fechamento'))
const temInterpolado = computed(() => props.points.some((p) => p.origem === 'interpolado' || p.origem === 'atual'))
const lineOptions = computed(() => baseOptions() as unknown as ChartOptions<'line'>)
const barOptions = computed(() => baseOptions() as unknown as ChartOptions<'bar'>)
</script>

<template>
  <div class="h-[340px]">
    <Line v-if="mode === 'acumulado'" :data="lineData" :options="lineOptions" role="img" aria-label="Curva S físico-financeira acumulada: Planejado, Agregado e Custo Real por mês" />
    <Bar v-else :data="barData" :options="barOptions" role="img" aria-label="Valores mensais de Planejado, Agregado e Custo Real" />
  </div>
  <!-- Legenda dos traços e marcadores da Curva S de fechamentos (a cor nunca é a única pista) -->
  <ul v-if="mode === 'acumulado' && (temFechamento || temInterpolado)" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500" data-testid="legenda-curva">
    <li v-if="temFechamento"><span class="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-amber-500 align-middle"></span>◆ Ponto de fechamento: EV e AC gravados</li>
    <li v-if="temInterpolado"><span class="mr-1 inline-block w-5 border-t-2 border-dotted border-zinc-500 align-middle"></span>Pontilhado curto: interpolado entre fechamentos</li>
    <li><span class="mr-1 inline-block w-5 border-t-2 border-dashed border-zinc-500 align-middle"></span>Tracejado longo: tendência reprogramada</li>
  </ul>
</template>
