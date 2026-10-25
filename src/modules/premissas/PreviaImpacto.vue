<script setup lang="ts">
import { computed } from 'vue'
import { ArrowRight } from '@lucide/vue'
import type { PreviaImpacto } from '@/types/previas'
import { useProjectStore } from '@/stores/useProjectStore'
import { fmtDate, fmtDays } from '@/lib/format'

const props = defineProps<{ previa: PreviaImpacto }>()
const project = useProjectStore()

const LIMITE = 30
const resumo = computed(() => (props.previa.erro === undefined ? props.previa : undefined))
const ordenadas = computed(() => {
  const r = resumo.value
  if (!r) return []
  const wbs = (uid: number) => project.taskByUid.get(uid)?.wbs ?? ''
  return [...r.tarefas].sort((a, b) => wbs(a.uid).localeCompare(wbs(b.uid), 'pt-BR', { numeric: true }))
})
const exibidas = computed(() => ordenadas.value.slice(0, LIMITE))
</script>

<template>
  <div class="rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-800" data-testid="previa-impacto">
    <p v-if="previa.erro !== undefined" role="alert" class="text-coral-600 dark:text-coral-400">{{ previa.erro }}</p>
    <template v-else-if="resumo">
      <p class="flex flex-wrap items-center gap-2">
        <span class="font-medium">Entrega:</span>
        <span class="tabular-nums" data-testid="previa-entrega-antes">{{ fmtDate(resumo.entregaAntes) }}</span>
        <ArrowRight class="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
        <span class="font-semibold tabular-nums" data-testid="previa-entrega-depois">{{ fmtDate(resumo.entregaDepois) }}</span>
        <span
          class="chip-neutral"
          :class="resumo.deltaDiasUteis > 0 ? 'text-coral-600 dark:text-coral-400' : resumo.deltaDiasUteis < 0 ? 'text-emerald-600 dark:text-emerald-400' : ''"
        >
          {{ resumo.deltaDiasUteis === 0 ? 'sem mudança na entrega' : `${resumo.deltaDiasUteis > 0 ? '+' : '−'}${fmtDays(resumo.deltaDiasUteis)}` }}
        </span>
      </p>
      <p class="mt-1 text-zinc-500">{{ resumo.tarefas.length ? `${resumo.tarefas.length} tarefa(s) mudam de data.` : 'Nenhuma tarefa muda de data.' }}</p>
      <div v-if="exibidas.length" class="mt-2 max-h-56 overflow-auto">
        <table class="table-base">
          <thead>
            <tr><th>EAP</th><th>Tarefa</th><th>Início</th><th>Término</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in exibidas" :key="t.uid">
              <td class="mono">{{ project.taskByUid.get(t.uid)?.wbs }}</td>
              <td class="max-w-[260px] truncate" :title="project.taskByUid.get(t.uid)?.name">{{ project.taskByUid.get(t.uid)?.name }}</td>
              <td class="whitespace-nowrap tabular-nums">{{ fmtDate(t.inicioAntes) }} → {{ fmtDate(t.inicioDepois) }}</td>
              <td class="whitespace-nowrap tabular-nums">{{ fmtDate(t.terminoAntes) }} → {{ fmtDate(t.terminoDepois) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-if="ordenadas.length > LIMITE" class="mt-1 text-[11px] text-zinc-500">e mais {{ ordenadas.length - LIMITE }} tarefa(s).</p>
      </div>
    </template>
  </div>
</template>
