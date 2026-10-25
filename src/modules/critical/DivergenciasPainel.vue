<script setup lang="ts">
import { computed, ref } from 'vue'
import { GitCompareArrows } from '@lucide/vue'
import SectionCard from '@/components/common/SectionCard.vue'
import { CAUSAS_DIVERGENCIA, ROTULO_CAUSA, type CausaDivergencia, type Divergencia } from '@/lib/divergencias'
import { fmtDate } from '@/lib/format'

const props = defineProps<{
  divergencias: Divergencia[]
  /** A obra tem datas de um arquivo MSPDI para comparar (alguma tarefa folha com `arquivo`). */
  temDatasDoArquivo: boolean
}>()

const filtro = ref<CausaDivergencia | ''>('')

const contagem = computed(() => {
  const c = new Map<CausaDivergencia, number>()
  for (const d of props.divergencias) c.set(d.causa, (c.get(d.causa) ?? 0) + 1)
  return c
})
const causasPresentes = computed(() => CAUSAS_DIVERGENCIA.filter((c) => contagem.value.has(c)))
const linhas = computed(() => (filtro.value ? props.divergencias.filter((d) => d.causa === filtro.value) : props.divergencias))

/** Diferença em dias úteis com sinal: "+1", "−4", "0". */
const dif = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')
const classeDif = (n: number) => (n > 0 ? 'text-coral-600 dark:text-coral-400' : n < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500')
</script>

<template>
  <SectionCard
    title="Divergências com o MS Project"
    subtitle="Tarefas cuja data calculada pelo CronoAI difere da do arquivo importado, com a causa provável"
    :icon="GitCompareArrows"
    body-class="overflow-x-auto"
  >
    <template v-if="temDatasDoArquivo && divergencias.length" #actions>
      <label class="flex items-center gap-2 text-[11px] text-zinc-500">
        Causa
        <select v-model="filtro" class="input py-1 text-xs" aria-label="Filtrar por causa">
          <option value="">Todas ({{ divergencias.length }})</option>
          <option v-for="c in causasPresentes" :key="c" :value="c">{{ ROTULO_CAUSA[c] }} ({{ contagem.get(c) }})</option>
        </select>
      </label>
    </template>

    <p v-if="!temDatasDoArquivo" class="text-sm text-zinc-500" data-testid="divergencias-sem-arquivo">
      Esta obra não veio de um arquivo do MS Project: não há datas do arquivo para comparar. Importe um .xml para ver as divergências.
    </p>
    <p v-else-if="!divergencias.length" class="text-sm text-emerald-700 dark:text-emerald-400" data-testid="divergencias-vazio">
      Nenhuma divergência: as datas calculadas pelo CronoAI batem com as do arquivo importado.
    </p>
    <p v-else-if="!linhas.length" class="text-sm text-zinc-500">Nenhuma divergência com essa causa.</p>
    <table v-else class="table-base" data-testid="divergencias-tabela">
      <thead>
        <tr>
          <th>UID</th><th>EAP</th><th>Tarefa</th>
          <th>Início no arquivo</th><th>Início calculado</th><th>Término no arquivo</th><th>Término calculado</th>
          <th class="text-right">Dif. término (d.u.)</th><th>Causa provável</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="d in linhas" :key="d.uid">
          <td class="mono">{{ d.uid }}</td>
          <td class="mono">{{ d.wbs }}</td>
          <td class="max-w-[260px] truncate" :title="d.nome">{{ d.nome }}</td>
          <td class="tabular-nums">{{ fmtDate(d.inicioArquivo) }}</td>
          <td class="tabular-nums">{{ fmtDate(d.inicioCalculado) }}</td>
          <td class="tabular-nums">{{ fmtDate(d.terminoArquivo) }}</td>
          <td class="tabular-nums">{{ fmtDate(d.terminoCalculado) }}</td>
          <td class="text-right font-semibold tabular-nums" :class="classeDif(d.diferencaTerminoDu)">{{ dif(d.diferencaTerminoDu) }}</td>
          <td>
            <span class="chip-neutral">{{ ROTULO_CAUSA[d.causa] }}</span>
            <div class="mt-0.5 text-[11px] text-zinc-500">{{ d.detalhe }}</div>
          </td>
        </tr>
      </tbody>
    </table>
  </SectionCard>
</template>
