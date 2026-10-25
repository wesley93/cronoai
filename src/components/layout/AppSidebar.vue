<script setup lang="ts">
import { computed } from 'vue'
import { MessagesSquare, GitBranch, Truck, Calculator, TrendingUp, TableProperties, HardHat, RotateCcw, Building2, SlidersHorizontal, Plug } from '@lucide/vue'
import { MODULES, useUiStore, type ModuleId } from '@/stores/ui'
import { useProjectStore } from '@/stores/useProjectStore'

const ui = useUiStore()
const project = useProjectStore()

const icons: Record<ModuleId, typeof MessagesSquare> = {
  apontamento: MessagesSquare,
  'caminho-critico': GitBranch,
  suprimentos: Truck,
  sinapi: Calculator,
  evm: TrendingUp,
  eap: TableProperties,
  obras: Building2,
  premissas: SlidersHorizontal,
  integracoes: Plug,
}

const badges = computed<Partial<Record<ModuleId, { text: string; tone: string }>>>(() => {
  const pending = project.state.reports.filter((r) => r.status === 'pendente').length
  const alerts = project.supplies.filter((s) => ['ruptura', 'atrasada', 'entrega-tardia'].includes(s.status)).length
  const delay = project.delay.delayDays
  return {
    apontamento: pending ? { text: String(pending), tone: 'bg-amber-400 text-zinc-950' } : undefined,
    'caminho-critico': delay > 0 ? { text: `+${delay}d`, tone: 'bg-coral-500 text-white' } : undefined,
    suprimentos: alerts ? { text: String(alerts), tone: 'bg-coral-500 text-white' } : undefined,
  }
})

async function criarExemplo() {
  const r = await project.criarObra({ modelo: 'exemplo' })
  if (r.ok) ui.notify('info', 'Obra de exemplo criada', 'Uma nova obra de exemplo foi aberta; as suas obras continuam salvas.')
  else ui.notify('error', 'Não foi possível criar a obra de exemplo', r.erro)
}
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-zinc-200 bg-white transition-transform dark:border-zinc-800 dark:bg-zinc-950 lg:static lg:translate-x-0"
    :class="ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
  >
    <div class="flex h-14 items-center gap-2.5 border-b border-zinc-200 px-4 dark:border-zinc-800">
      <div class="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900 ring-1 ring-amber-400/40 dark:bg-zinc-800">
        <HardHat class="h-4 w-4 text-amber-400" />
      </div>
      <div class="leading-tight">
        <div class="text-sm font-semibold tracking-tight">Crono<span class="text-amber-500 dark:text-amber-400">AI</span></div>
        <div class="text-[10px] text-zinc-500">Copiloto de Planejamento</div>
      </div>
    </div>

    <nav class="flex-1 space-y-0.5 overflow-y-auto p-3">
      <p class="eyebrow px-2 pb-2 pt-1">Módulos</p>
      <button
        v-for="m in MODULES"
        :key="m.id"
        class="group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors"
        :class="ui.current === m.id ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800/80 dark:text-white' : 'text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400 dark:hover:bg-zinc-900'"
        @click="ui.current = m.id"
      >
        <component :is="icons[m.id]" class="h-4 w-4 shrink-0" :class="ui.current === m.id ? 'text-amber-500 dark:text-amber-400' : ''" />
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[13px] font-medium">{{ m.label }}</span>
          <span class="block truncate text-[10px] text-zinc-500">{{ m.pain }} · {{ m.short }}</span>
        </span>
        <span v-if="badges[m.id]" class="rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums" :class="badges[m.id]!.tone">{{ badges[m.id]!.text }}</span>
      </button>
    </nav>

    <div class="space-y-2 border-t border-zinc-200 p-3 text-[11px] text-zinc-500 dark:border-zinc-800">
      <div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div class="eyebrow mb-1">Obra ativa</div>
        <div class="line-clamp-2 text-xs font-medium text-zinc-800 dark:text-zinc-200">{{ project.state.meta.name }}</div>
        <div class="mt-1">{{ project.leaves.length }} tarefas · {{ project.schedule.criticalPath.length }} críticas em aberto</div>
        <button class="mt-1.5 font-medium text-amber-600 hover:underline dark:text-amber-400" @click="ui.current = 'obras'">Trocar obra</button>
      </div>
      <button class="btn-ghost w-full justify-start" @click="criarExemplo"><RotateCcw class="h-3.5 w-3.5" /> Criar obra de exemplo</button>
    </div>
  </aside>
</template>
