<script setup lang="ts">
// Evolução da data de entrega prevista nos fechamentos (ciclo 00007, RF-04.4). Nenhum gráfico de datas existia: o eixo vertical é o número do dia,
// formatado como data. A tabela alternativa fica no componente que usa este gráfico.
import { computed } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js'
import { fmtDate } from '@/lib/format'
import { useUiStore } from '@/stores/ui'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

/** Um ponto por fechamento: o rótulo do eixo e a data de entrega prevista (`yyyy-mm-dd`) gravada nele. */
export interface PontoEntrega {
  label: string
  entrega: string
}
const props = defineProps<{ pontos: PontoEntrega[] }>()
const ui = useUiStore()
const PALETTE = {
  light: { linha: '#0284c7', grid: 'rgba(24,24,27,0.07)', text: '#52525b', surface: '#ffffff' },
  dark: { linha: '#1d8fd6', grid: 'rgba(250,250,250,0.06)', text: '#a1a1aa', surface: '#18181b' },
}
const c = computed(() => PALETTE[ui.theme])
const MS_DIA = 86_400_000
const numeroDoDia = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_DIA)
const dataDoDia = (n: number) => new Date(n * MS_DIA).toISOString().slice(0, 10)

const data = computed<ChartData<'line'>>(() => ({
  labels: props.pontos.map((p) => p.label),
  datasets: [
    { label: 'Entrega prevista', data: props.pontos.map((p) => numeroDoDia(p.entrega)), borderColor: c.value.linha, backgroundColor: c.value.linha, borderWidth: 2, pointStyle: 'triangle', pointRadius: 5, pointBorderColor: c.value.surface, pointBorderWidth: 2, tension: 0 },
  ],
}))
const options = computed<ChartOptions<'line'>>(() => {
  const dias = props.pontos.map((p) => numeroDoDia(p.entrega))
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => ` Entrega prevista: ${fmtDate(dataDoDia(ctx.parsed.y ?? 0))}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: c.value.text, font: { size: 10 } } },
      y: {
        suggestedMin: Math.min(...dias) - 3,
        suggestedMax: Math.max(...dias) + 3,
        grid: { color: c.value.grid },
        border: { display: false },
        ticks: { color: c.value.text, font: { size: 10 }, precision: 0, callback: (v) => fmtDate(dataDoDia(Number(v))) },
      },
    },
  }
})
</script>

<template>
  <div class="h-[200px]">
    <Line :data="data" :options="options" role="img" aria-label="Data de entrega prevista gravada em cada fechamento" />
  </div>
</template>
