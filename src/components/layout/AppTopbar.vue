<script setup lang="ts">
import { computed, ref } from 'vue'
import { Menu, Moon, Sun, Upload, Download, CalendarClock, KeyRound } from '@lucide/vue'
import { useUiStore } from '@/stores/ui'
import { useProjectStore } from '@/stores/useProjectStore'
import { useMsProject } from '@/lib/useMsProject'
import { fmtDate, fmtDateLong, fmtIndex } from '@/lib/format'

const ui = useUiStore()
const project = useProjectStore()
const { exportXml, importFile } = useMsProject()
const fileInput = ref<HTMLInputElement>()

const delay = computed(() => project.delay.delayDays)
const idxTone = (v: number) => (v >= 1 ? 'text-emerald-600 dark:text-emerald-400' : v >= 0.95 ? 'text-amber-600 dark:text-amber-300' : 'text-coral-600 dark:text-coral-400')

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await importFile(file)
  input.value = ''
}
</script>

<template>
  <header class="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-zinc-200 bg-white/85 px-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
    <button class="btn-ghost px-2 lg:hidden" aria-label="Abrir menu" :aria-expanded="ui.sidebarOpen" @click="ui.sidebarOpen = !ui.sidebarOpen"><Menu class="h-4 w-4" /></button>

    <div class="min-w-0 flex-1">
      <div class="truncate text-sm font-semibold tracking-tight">{{ project.state.meta.name }}</div>
      <div class="flex items-center gap-1.5 text-[11px] text-zinc-500">
        <CalendarClock class="h-3 w-3" /> Data de status: <span class="font-medium text-zinc-700 dark:text-zinc-300">{{ fmtDateLong(project.state.meta.statusDate) }}</span>
      </div>
    </div>

    <div class="hidden items-center gap-4 xl:flex">
      <div class="text-right">
        <div class="eyebrow flex items-center justify-end gap-1"><KeyRound class="h-3 w-3" /> Entrega das chaves</div>
        <div class="text-sm font-semibold tabular-nums">
          {{ fmtDate(project.schedule.projectFinish) }}
          <span v-if="delay > 0" class="chip-critical ml-1">+{{ delay }} d.u.</span>
          <span v-else-if="delay < 0" class="chip-ok ml-1">{{ delay }} d.u.</span>
          <span v-else class="chip-ok ml-1">no prazo</span>
        </div>
      </div>
      <div class="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
      <div class="text-right">
        <div class="eyebrow">SPI</div>
        <div class="text-sm font-semibold tabular-nums" :class="idxTone(project.evm.spi)">{{ fmtIndex(project.evm.spi) }}</div>
      </div>
      <div class="text-right">
        <div class="eyebrow">CPI</div>
        <div class="text-sm font-semibold tabular-nums" :class="idxTone(project.evm.cpi)">{{ fmtIndex(project.evm.cpi) }}</div>
      </div>
      <div class="h-8 w-px bg-zinc-200 dark:bg-zinc-800" />
    </div>

    <input ref="fileInput" type="file" accept=".xml,application/xml,text/xml" class="hidden" @change="onFile" />
    <button class="btn-secondary" title="Importar XML do MS Project (MSPDI)" @click="fileInput?.click()">
      <Upload class="h-3.5 w-3.5" /><span class="hidden sm:inline">Importar .xml</span>
    </button>
    <button class="btn-primary" title="Exportar cronograma atualizado no padrão MSPDI" @click="exportXml">
      <Download class="h-3.5 w-3.5" /><span class="hidden sm:inline">Exportar para MS Project</span>
    </button>
    <button class="btn-ghost px-2" :aria-label="ui.theme === 'dark' ? 'Tema claro' : 'Tema escuro'" @click="ui.toggleTheme">
      <Sun v-if="ui.theme === 'dark'" class="h-4 w-4" />
      <Moon v-else class="h-4 w-4" />
    </button>
  </header>
</template>
