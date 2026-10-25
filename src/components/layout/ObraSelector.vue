<script setup lang="ts">
import { CalendarClock } from '@lucide/vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { fmtDateLong } from '@/lib/format'

const project = useProjectStore()
const ui = useUiStore()

async function trocar(e: Event) {
  const select = e.target as HTMLSelectElement
  const r = await project.trocarObra(select.value)
  if (r.ok) {
    ui.notify('info', 'Obra trocada', project.state.meta.name)
  } else {
    select.value = project.obraAtivaId // a troca foi cancelada: o seletor volta para a obra aberta
    ui.notify('error', 'Não foi possível trocar de obra', r.erro)
  }
}
</script>

<template>
  <div class="min-w-0 flex-1">
    <div class="flex items-center gap-2">
      <label for="obra-ativa" class="eyebrow shrink-0">Obra ativa</label>
      <select id="obra-ativa" class="input min-w-0 max-w-[30rem] truncate py-0.5 text-sm font-semibold" :value="project.obraAtivaId" @change="trocar">
        <option v-for="o in project.obras" :key="o.id" :value="o.id" :disabled="o.ilegivel">
          {{ o.nome }}{{ o.uf ? ` · ${o.uf}` : '' }}{{ o.ilegivel ? ' (ilegível)' : '' }}
        </option>
      </select>
    </div>
    <div class="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
      <CalendarClock class="h-3 w-3" /> Data de status: <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ fmtDateLong(project.state.meta.statusDate) }}</span>
      <span v-if="project.estadoGravacao === 'pendente'" class="ml-2">Salvando…</span>
    </div>
  </div>
</template>
