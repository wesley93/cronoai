<script setup lang="ts">
// Evolução da data de entrega prevista nos fechamentos (ciclo 00007, RF-04.4): gráfico e tabela com o que cada fechamento gravou.
import { computed } from 'vue'
import { CalendarClock } from '@lucide/vue'
import EntregaChart from '@/components/charts/EntregaChart.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import { dmy } from '@/lib/fechamentos'
import { fmtIndex } from '@/lib/format'
import { useProjectStore } from '@/stores/useProjectStore'

const project = useProjectStore()
const serie = computed(() => project.serieFechamentos)
const pontos = computed(() => serie.value.map((p) => ({ label: dmy(p.data).slice(0, 5), entrega: p.entregaPrevista })))
const indice = (v: number | null) => (v === null ? '—' : fmtIndex(v))
</script>

<template>
  <SectionCard title="Entrega prevista em cada fechamento" subtitle="Evolução da data de entrega e dos índices gravados nos fechamentos efetivos" :icon="CalendarClock">
    <template v-if="serie.length">
      <EntregaChart :pontos="pontos" />
      <table class="table-base mt-3" data-testid="tabela-entrega">
        <thead><tr><th>Data de status</th><th>Entrega prevista</th><th class="text-right">Atraso (d.u.)</th><th class="text-right">SPI</th><th class="text-right">CPI</th></tr></thead>
        <tbody>
          <tr v-for="p in serie" :key="p.fechamentoId">
            <td class="tabular-nums">{{ dmy(p.data) }}<span v-if="p.tipo === 'retificacao'" class="chip-info ml-1">retificação</span></td>
            <td class="tabular-nums">{{ dmy(p.entregaPrevista) }}</td>
            <td class="text-right tabular-nums">{{ p.atrasoDiasUteis > 0 ? '+' : '' }}{{ p.atrasoDiasUteis }}</td>
            <td class="text-right tabular-nums">{{ indice(p.spi) }}</td>
            <td class="text-right tabular-nums">{{ indice(p.cpi) }}</td>
          </tr>
        </tbody>
      </table>
      <p class="mt-2 text-[11px] leading-relaxed text-zinc-500" data-testid="nota-indices">
        Índices dos fechamentos calculados contra a linha de base vigente em cada fechamento. SPI e CPI sem divisor (sem PV ou sem custo real) ficam em branco: não viram "1,00".
      </p>
    </template>
    <p v-else class="py-10 text-center text-xs text-zinc-500">Sem fechamentos: a evolução da entrega aparece depois do primeiro fechamento.</p>
  </SectionCard>
</template>
