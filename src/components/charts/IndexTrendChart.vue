<script setup lang="ts">
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js'
import type { IndexPoint } from '@/lib/evm'
import { fmtIndex } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

const props = defineProps<{ points: IndexPoint[] }>()
const ui = useUiStore()
// Mesmo par validado da Curva S (azul x coral); a meta 1,00 é neutra e tracejada
const PALETTE = {
  light: { spi: '#0284c7', cpi: '#e8553f', ref: '#a1a1aa', grid: 'rgba(24,24,27,0.07)', text: '#52525b', surface: '#ffffff' },
  dark: { spi: '#1d8fd6', cpi: '#e8553f', ref: '#71717a', grid: 'rgba(250,250,250,0.06)', text: '#a1a1aa', surface: '#18181b' },
}
const c = computed(() => PALETTE[ui.theme])

const data = computed<ChartData<'line'>>(() => ({
  labels: props.points.map((p) => p.label),
  datasets: [
    { label: 'SPI (EV ÷ PV)', data: props.points.map((p) => p.spi), borderColor: c.value.spi, backgroundColor: c.value.spi, borderWidth: 2, pointRadius: 4, pointBorderColor: c.value.surface, pointBorderWidth: 2, tension: 0.25 },
    { label: 'CPI (EV ÷ AC)', data: props.points.map((p) => p.cpi), borderColor: c.value.cpi, backgroundColor: c.value.cpi, borderWidth: 2, pointStyle: 'rectRot', pointRadius: 5, pointBorderColor: c.value.surface, pointBorderWidth: 2, tension: 0.25 },
    { label: 'Meta 1,00', data: props.points.map(() => 1), borderColor: c.value.ref, borderWidth: 1, borderDash: [4, 4], pointRadius: 0, pointHoverRadius: 0 },
  ],
}))

const options = computed<ChartOptions<'line'>>(() => {
  const values = props.points.flatMap((p) => [p.spi, p.cpi, 1])
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'start', labels: { color: c.value.text, usePointStyle: true, boxWidth: 8, boxHeight: 8, font: { size: 11 } } },
      tooltip: { callbacks: { label: (ctx) => (ctx.dataset.label === 'Meta 1,00' ? '' : ` ${ctx.dataset.label}: ${fmtIndex(ctx.parsed.y ?? 0)}`) } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.value.text, font: { size: 10 } } },
      y: {
        suggestedMin: Math.min(0.8, ...values) - 0.02,
        suggestedMax: Math.max(1.1, ...values) + 0.02,
        grid: { color: c.value.grid },
        border: { display: false },
        ticks: { color: c.value.text, font: { size: 10 }, callback: (v) => fmtIndex(Number(v)) },
      },
    },
  }
})
</script>

<template>
  <div class="h-[220px]">
    <Line :data="data" :options="options" role="img" aria-label="SPI e CPI acumulados por mês, com meta 1,00" />
  </div>
</template>
