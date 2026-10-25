<script setup lang="ts">
import { computed, ref } from 'vue'
import { TableProperties, Save, History, Download, Upload, Search } from '@lucide/vue'
import type { Task } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { useMsProject } from '@/lib/useMsProject'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import ProgressBar from '@/components/common/ProgressBar.vue'
import { fmtBRL, fmtDate } from '@/lib/format'
import { formatPredecessors } from '@/lib/wbs'

const project = useProjectStore()
const ui = useUiStore()
const { exportXml, importFile } = useMsProject()
const fileInput = ref<HTMLInputElement>()
const filter = ref('')
const statusDate = ref(project.state.meta.statusDate)

const rows = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return project.tasksByWbs.filter((t) => !q || `${t.uid} ${t.wbs} ${t.name} ${t.sinapi ?? ''}`.toLowerCase().includes(q))
})

function clampNumber(v: string, min: number, max: number): number | undefined {
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined
}

function edit(t: Task, field: 'percentComplete' | 'durationDays' | 'bac' | 'actualCost', raw: string) {
  const limits = { percentComplete: [0, 100], durationDays: [0, 2000], bac: [0, 1e10], actualCost: [0, 1e10] } as const
  const v = clampNumber(raw, limits[field][0], limits[field][1])
  if (v === undefined) return
  const value = field === 'durationDays' ? Math.round(v) : v
  if (value === t[field]) return
  project.updateTask(t.uid, { [field]: value })
}

function saveBaseline() {
  if (window.confirm('Substituir a linha de base pelo cronograma reprogramado atual? A variação passará a ser medida a partir dele.')) {
    project.saveBaseline()
    ui.notify('success', 'Linha de base atualizada', 'Variações e PV recalculados a partir da nova linha de base.')
  }
}

function applyStatusDate() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(statusDate.value)) return
  project.setStatusDate(statusDate.value)
  ui.notify('info', 'Data de status alterada', 'Cronograma, EVM e suprimentos reprogramados.')
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) await importFile(file)
  input.value = ''
}

const sched = (t: Task) => (t.isSummary ? project.rollups.get(t.uid) : project.schedule.byUid.get(t.uid))
const pct = (t: Task) => (t.isSummary ? (project.rollups.get(t.uid)?.percentComplete ?? 0) : t.percentComplete)
const bac = (t: Task) => (t.isSummary ? (project.rollups.get(t.uid)?.bac ?? 0) : t.bac)
const ac = (t: Task) => (t.isSummary ? (project.rollups.get(t.uid)?.actualCost ?? 0) : t.actualCost)
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Base"
      title="EAP / Cronograma do MS Project"
      description="Tabela única que alimenta todos os módulos. Edite avanço, duração e custos diretamente — o CPM, o EVM e os suprimentos recalculam na hora."
    >
      <input ref="fileInput" type="file" accept=".xml" class="hidden" @change="onFile" />
      <button class="btn-secondary" @click="fileInput?.click()"><Upload class="h-3.5 w-3.5" /> Importar .xml</button>
      <button class="btn-primary" @click="exportXml"><Download class="h-3.5 w-3.5" /> Exportar para MS Project (.xml)</button>
    </ModuleHeader>

    <div class="card flex flex-wrap items-end gap-4 p-4">
      <div class="relative min-w-[220px] flex-1">
        <label class="label">Filtrar</label>
        <Search class="absolute bottom-2.5 left-3 h-3.5 w-3.5 text-zinc-400" />
        <input v-model="filter" class="input pl-8" placeholder="UID, EAP, nome ou código SINAPI" />
      </div>
      <div>
        <label class="label">Data de status</label>
        <div class="flex gap-2">
          <input v-model="statusDate" type="date" class="input w-auto" />
          <button class="btn-secondary" @click="applyStatusDate">Reprogramar</button>
        </div>
      </div>
      <button class="btn-secondary" @click="saveBaseline"><Save class="h-3.5 w-3.5" /> Salvar linha de base</button>
    </div>

    <SectionCard title="Estrutura Analítica do Projeto" :subtitle="`${project.leaves.length} tarefas · ${project.tasksByWbs.length - project.leaves.length} resumos · BAC ${fmtBRL(project.evm.bac)}`" :icon="TableProperties" body-class="overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>UID</th><th>EAP</th><th class="min-w-[260px]">Nome</th><th class="text-right">Dur.</th><th>Início</th><th>Término</th><th>LB término</th>
            <th class="min-w-[130px]">% concl.</th><th>Início real</th><th class="text-right">BAC (R$)</th><th class="text-right">Custo real (R$)</th>
            <th>Predec.</th><th>Recursos</th><th>SINAPI</th><th class="text-right">Folga</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in rows" :key="t.uid" :class="t.isSummary ? 'bg-zinc-50 font-semibold dark:bg-zinc-900/60' : ''">
            <td class="mono">{{ t.uid }}</td>
            <td class="mono">{{ t.wbs }}</td>
            <td :style="{ paddingLeft: `${12 + (t.outlineLevel - 1) * 14}px` }">
              <span :class="!t.isSummary && project.schedule.byUid.get(t.uid)?.critical ? 'text-coral-600 dark:text-coral-400' : ''">{{ t.name }}</span>
            </td>
            <td class="text-right">
              <input v-if="!t.isSummary" :value="t.durationDays" class="w-14 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700" aria-label="Duração" @change="edit(t, 'durationDays', ($event.target as HTMLInputElement).value)" />
              <span v-else class="text-zinc-500">—</span>
            </td>
            <td class="tabular-nums">{{ fmtDate(sched(t)?.start) }}</td>
            <td class="tabular-nums">{{ fmtDate(sched(t)?.finish) }}</td>
            <td class="tabular-nums text-zinc-500">{{ fmtDate(t.isSummary ? project.rollups.get(t.uid)?.baselineFinish : t.baselineFinish) }}</td>
            <td>
              <div class="flex items-center gap-2">
                <input v-if="!t.isSummary" :value="Math.round(t.percentComplete)" class="w-12 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700" aria-label="Percentual concluído" @change="edit(t, 'percentComplete', ($event.target as HTMLInputElement).value)" />
                <span v-else class="w-12 text-right tabular-nums">{{ Math.round(pct(t)) }}</span>
                <ProgressBar :value="pct(t)" :tone="pct(t) >= 100 ? 'ok' : 'accent'" />
              </div>
            </td>
            <td class="tabular-nums text-zinc-500">{{ t.isSummary ? '' : fmtDate(t.actualStart) }}</td>
            <td class="text-right">
              <input v-if="!t.isSummary" :value="Math.round(t.bac)" class="w-28 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700" aria-label="Orçamento" @change="edit(t, 'bac', ($event.target as HTMLInputElement).value)" />
              <span v-else class="tabular-nums">{{ fmtBRL(bac(t)) }}</span>
            </td>
            <td class="text-right">
              <input v-if="!t.isSummary" :value="Math.round(t.actualCost)" class="w-28 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700" aria-label="Custo real" @change="edit(t, 'actualCost', ($event.target as HTMLInputElement).value)" />
              <span v-else class="tabular-nums">{{ fmtBRL(ac(t)) }}</span>
            </td>
            <td class="mono">{{ formatPredecessors(t) }}</td>
            <td class="max-w-[180px] truncate text-[11px] text-zinc-500" :title="t.resources.map((r) => `${r.units} ${r.resource}`).join(', ')">{{ t.resources.map((r) => `${r.units} ${r.resource}`).join(', ') }}</td>
            <td class="mono">{{ t.sinapi }}</td>
            <td class="text-right tabular-nums">
              <template v-if="!t.isSummary && t.percentComplete < 100">{{ project.schedule.byUid.get(t.uid)?.totalFloat }}d</template>
            </td>
          </tr>
        </tbody>
      </table>
    </SectionCard>

    <SectionCard title="Registro de decisões" subtitle="Trilha de auditoria de tudo que alterou o cronograma" :icon="History" body-class="p-3">
      <ul class="divide-y divide-zinc-100 dark:divide-zinc-800">
        <li v-for="l in project.state.log" :key="l.id" class="flex gap-3 px-2 py-2.5">
          <span class="chip-neutral h-fit shrink-0 capitalize">{{ l.kind }}</span>
          <div class="min-w-0">
            <div class="text-[12.5px] font-medium">{{ l.title }}</div>
            <div class="text-[11.5px] text-zinc-500">{{ fmtDate(l.date) }} · {{ l.detail }}</div>
          </div>
        </li>
      </ul>
    </SectionCard>
  </div>
</template>
