<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Sparkles, ArrowRight, CheckCircle2, Download, XCircle, CloudRain, Package, Users, Wrench, ShieldAlert, FileQuestion, Cpu, KeyRound } from 'lucide-vue-next'
import type { FieldReport, RestrictionKind } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { useMsProject } from '@/lib/useMsProject'
import { fmtBRLCompact, fmtDate } from '@/lib/format'
import ProgressBar from '@/components/common/ProgressBar.vue'
import XmlTaskDiff from './XmlTaskDiff.vue'

const props = defineProps<{ report: FieldReport }>()
const project = useProjectStore()
const ui = useUiStore()
const { exportXml } = useMsProject()

const ai = computed(() => project.interpret(props.report))
const selectedUid = ref<number | undefined>()
const newPercent = ref<number>(0)
const includeRestrictions = ref<boolean[]>([])

const task = computed(() => (selectedUid.value !== undefined ? project.taskByUid.get(selectedUid.value) : undefined))
/** Mesma tarefa na visão tipada do MS Project (UniqueID, WBS, PercentComplete, Finish, IsCritical...). */
const msTask = computed(() => (selectedUid.value !== undefined ? project.msProjectTask(selectedUid.value) : undefined))
const candidate = computed(() => ai.value.candidates.find((c) => c.uid === selectedUid.value))
const confidence = computed(() => candidate.value?.confidence ?? 0)
const isOverride = computed(() => selectedUid.value !== ai.value.best?.uid)

function reset() {
  selectedUid.value = props.report.approvedUid ?? ai.value.best?.uid
  const t = selectedUid.value !== undefined ? project.taskByUid.get(selectedUid.value) : undefined
  newPercent.value = props.report.approvedPercent ?? ai.value.suggestedPercent ?? Math.round(t?.percentComplete ?? 0)
  includeRestrictions.value = ai.value.restrictions.map(() => true)
}
watch(() => props.report.id, reset, { immediate: true })
watch(selectedUid, (uid, old) => {
  if (old === undefined || props.report.status !== 'pendente') return
  const t = uid !== undefined ? project.taskByUid.get(uid) : undefined
  if (ai.value.suggestedPercent === undefined && t) newPercent.value = Math.round(t.percentComplete)
})

const previous = computed(() => Math.round(msTask.value?.PercentComplete ?? 0))
const reportDate = computed(() => props.report.timestamp.slice(0, 10))
const pending = computed(() => props.report.status === 'pendente')
const preview = computed(() => (task.value && pending.value ? project.previewProgress(task.value.uid, newPercent.value, reportDate.value) : undefined))
const xmlPreview = computed(() => (task.value && pending.value ? project.previewTaskXml(task.value.uid, newPercent.value, reportDate.value) : undefined))

const otherLeaves = computed(() => project.leaves.filter((t) => !ai.value.candidates.some((c) => c.uid === t.uid)))
const restrictionIcon: Record<RestrictionKind, typeof CloudRain> = {
  clima: CloudRain,
  material: Package,
  'mao-de-obra': Users,
  equipamento: Wrench,
  seguranca: ShieldAlert,
  projeto: FileQuestion,
}
const confTone = computed(() => (confidence.value >= 85 ? 'ok' : confidence.value >= 60 ? 'warn' : 'critical'))

function approve() {
  if (!task.value) return
  const before = previous.value
  const restrictions = ai.value.restrictions.filter((_, i) => includeRestrictions.value[i])
  const pct = ai.value.suggestedPercent !== undefined || newPercent.value !== previous.value ? newPercent.value : undefined
  const res = project.approveReport(props.report.id, task.value.uid, pct, restrictions)
  const delta = res?.delta ?? 0
  ui.notify(
    'success',
    `EAP atualizada: [UID ${task.value.uid}] ${task.value.wbs}`,
    `Avanço ${before}% → ${newPercent.value}%. ` +
      (delta === 0 ? 'Data de entrega mantida.' : `Entrega ${delta < 0 ? 'antecipada' : 'adiada'} em ${Math.abs(delta)} dia(s) útil(eis).`),
  )
}

function reject() {
  project.rejectReport(props.report.id)
  ui.notify('info', 'Relato descartado', 'Nenhuma alteração foi feita na EAP.')
}
</script>

<template>
  <div class="space-y-4">
    <!-- Pipeline -->
    <div class="flex flex-wrap items-center gap-1.5 text-[10.5px] text-zinc-500">
      <span class="chip-neutral"><Cpu class="h-3 w-3" /> Motor local · nenhum dado sai do navegador</span>
      <template v-for="(step, i) in ['Áudio/Texto', 'Transcrição', 'Entidades', 'Match semântico EAP', 'Sugestão']" :key="step">
        <ArrowRight v-if="i" class="h-3 w-3 text-zinc-400" />
        <span :class="i === 3 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''">{{ step }}</span>
      </template>
    </div>

    <!-- Entidades -->
    <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div class="eyebrow">Pavimento</div>
        <div class="mt-0.5 text-sm font-semibold">{{ ai.floor !== undefined ? (ai.floor === 0 ? 'Térreo' : `${ai.floor}º pav.`) : '—' }}</div>
      </div>
      <div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div class="eyebrow">Avanço citado</div>
        <div class="mt-0.5 text-sm font-semibold">{{ ai.suggestedPercent !== undefined ? `${ai.suggestedPercent}%` : 'não citado' }}</div>
        <div v-if="ai.percentEvidence" class="mono truncate text-zinc-500">“{{ ai.percentEvidence }}”</div>
      </div>
      <div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div class="eyebrow">Candidatas</div>
        <div class="mt-0.5 text-sm font-semibold">{{ ai.candidates.length }}</div>
      </div>
      <div class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
        <div class="eyebrow">Restrições</div>
        <div class="mt-0.5 text-sm font-semibold" :class="ai.restrictions.length ? 'text-coral-600 dark:text-coral-400' : ''">{{ ai.restrictions.length }}</div>
      </div>
    </div>

    <div v-if="!task" class="rounded-xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
      A IA não encontrou uma linha da EAP compatível com este relato. Selecione a tarefa manualmente:
      <select v-model.number="selectedUid" class="input mx-auto mt-3 max-w-md">
        <option v-for="t in project.leaves" :key="t.uid" :value="t.uid">[UID {{ t.uid }}] {{ t.wbs }} - {{ t.name }}</option>
      </select>
    </div>

    <template v-else>
      <!-- Tarefa identificada -->
      <div class="rounded-xl border border-amber-400/40 bg-amber-400/[0.06] p-4">
        <div class="flex items-center justify-between gap-2">
          <span class="eyebrow flex items-center gap-1 text-amber-700 dark:text-amber-300"><Sparkles class="h-3 w-3" /> Tarefa identificada no MS Project</span>
          <span v-if="isOverride" class="chip-info">Ajustada pelo engenheiro</span>
          <span v-else-if="msTask?.IsCritical" class="chip-critical">Caminho crítico</span>
        </div>
        <div class="mt-2 font-mono text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
          [UID {{ msTask?.UniqueID }}] {{ msTask?.WBS }} - {{ msTask?.Name }}
        </div>
        <div class="mt-3 flex items-center gap-3">
          <div class="flex-1"><ProgressBar :value="confidence" :tone="confTone" height="h-2" /></div>
          <span class="text-sm font-bold tabular-nums">{{ confidence }}%</span>
          <span class="text-[11px] text-zinc-500">confiança do match semântico</span>
        </div>
        <ul v-if="candidate?.reasons.length" class="mt-3 space-y-1 text-[11.5px] text-zinc-600 dark:text-zinc-300">
          <li v-for="r in candidate.reasons" :key="r" class="flex gap-1.5"><CheckCircle2 class="mt-0.5 h-3 w-3 shrink-0 text-emerald-500" />{{ r }}</li>
        </ul>
        <div v-if="pending" class="mt-3">
          <label class="label">Corrigir vínculo (De-Para)</label>
          <select v-model.number="selectedUid" class="input py-1.5 text-xs">
            <optgroup label="Sugestões da IA">
              <option v-for="c in ai.candidates" :key="c.uid" :value="c.uid">
                {{ c.confidence }}% · [UID {{ c.uid }}] {{ project.taskByUid.get(c.uid)?.wbs }} - {{ project.taskByUid.get(c.uid)?.name }}
              </option>
            </optgroup>
            <optgroup label="Demais tarefas da EAP">
              <option v-for="t in otherLeaves" :key="t.uid" :value="t.uid">[UID {{ t.uid }}] {{ t.wbs }} - {{ t.name }}</option>
            </optgroup>
          </select>
        </div>
      </div>

      <!-- Avanço -->
      <div class="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div class="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="eyebrow">Avanço anterior no MS Project</div>
          <div class="mt-1 text-2xl font-semibold tabular-nums text-zinc-500">{{ pending ? previous : (report.previousPercent ?? previous) }}%</div>
          <div class="text-[11px] text-zinc-500">Término previsto {{ fmtDate(msTask?.Finish) }} · EV {{ fmtBRLCompact(msTask?.EarnedValue ?? 0) }}</div>
        </div>
        <ArrowRight class="mx-auto hidden h-5 w-5 text-amber-500 sm:block" />
        <div class="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] p-3">
          <div class="eyebrow text-emerald-700 dark:text-emerald-400">{{ pending ? 'Novo avanço sugerido' : 'Avanço aprovado' }}</div>
          <div class="mt-1 flex items-baseline gap-2">
            <input
              v-model.number="newPercent"
              type="number"
              min="0"
              max="100"
              :disabled="!pending"
              class="w-14 bg-transparent text-2xl font-semibold tabular-nums text-emerald-600 focus:outline-none disabled:opacity-100 dark:text-emerald-400"
              aria-label="Novo percentual"
            />
            <span class="text-lg font-semibold text-emerald-600 dark:text-emerald-400">%</span>
          </div>
          <input v-if="pending" v-model.number="newPercent" type="range" min="0" max="100" class="w-full" aria-label="Ajustar percentual" />
        </div>
      </div>

      <!-- Restrições -->
      <div v-if="ai.restrictions.length" class="space-y-2">
        <div class="eyebrow">Restrições detectadas automaticamente</div>
        <label
          v-for="(r, i) in ai.restrictions"
          :key="r.label"
          class="flex cursor-pointer items-start gap-3 rounded-lg border border-coral-500/30 bg-coral-500/[0.05] p-2.5"
        >
          <input v-model="includeRestrictions[i]" type="checkbox" :disabled="!pending" class="mt-1 accent-amber-400" />
          <component :is="restrictionIcon[r.kind]" class="mt-0.5 h-4 w-4 shrink-0 text-coral-500" />
          <span class="min-w-0">
            <span class="block text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ r.label }}</span>
            <span class="block text-[11px] text-zinc-500">{{ r.detail }}</span>
          </span>
        </label>
      </div>

      <!-- Impacto -->
      <div v-if="pending && preview" class="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-800">
        <KeyRound class="h-4 w-4 text-amber-500" />
        <span>Impacto previsto na entrega das chaves:</span>
        <span class="font-semibold tabular-nums">{{ fmtDate(project.schedule.projectFinish) }}</span>
        <ArrowRight class="h-3 w-3" />
        <span class="font-semibold tabular-nums">{{ fmtDate(preview.finish) }}</span>
        <span v-if="preview.deltaDays < 0" class="chip-ok">{{ preview.deltaDays }} dias úteis</span>
        <span v-else-if="preview.deltaDays > 0" class="chip-critical">+{{ preview.deltaDays }} dias úteis</span>
        <span v-else class="chip-neutral">sem alteração</span>
      </div>

      <XmlTaskDiff v-if="xmlPreview" :before="xmlPreview.before" :after="xmlPreview.after" />

      <!-- Ações -->
      <div class="flex flex-wrap gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <template v-if="pending">
          <button class="btn-success" @click="approve"><CheckCircle2 class="h-4 w-4" /> Aprovar e Atualizar EAP</button>
          <button class="btn-ghost" @click="reject"><XCircle class="h-4 w-4" /> Descartar</button>
        </template>
        <span v-else class="chip-ok self-center py-1"><CheckCircle2 class="h-3.5 w-3.5" /> {{ report.status === 'aprovado' ? 'Apontamento aplicado na EAP' : 'Relato descartado' }}</span>
        <button class="btn-primary ml-auto" @click="exportXml"><Download class="h-4 w-4" /> Exportar .XML Atualizado para MS Project</button>
      </div>
    </template>
  </div>
</template>
