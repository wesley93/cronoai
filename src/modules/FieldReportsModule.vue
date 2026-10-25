<script setup lang="ts">
import { computed, ref } from 'vue'
import { MessagesSquare, Sparkles, ShieldAlert, History, Check } from '@lucide/vue'
import { useProjectStore } from '@/stores/useProjectStore'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import ReportBubble from './field/ReportBubble.vue'
import ReportComposer from './field/ReportComposer.vue'
import AiMappingPanel from './field/AiMappingPanel.vue'
import { fmtDate } from '@/lib/format'

const project = useProjectStore()
const selectedId = ref(project.state.reports.find((r) => r.status === 'pendente')?.id ?? project.state.reports[0]?.id)
const selected = computed(() => project.state.reports.find((r) => r.id === selectedId.value))
type FeedFilter = 'pendente' | 'aprovado' | 'todos'
const feedFilter = ref<FeedFilter>('todos')
const sortedReports = computed(() =>
  [...project.state.reports]
    .filter((r) => feedFilter.value === 'todos' || r.status === feedFilter.value)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
)
const pending = computed(() => project.state.reports.filter((r) => r.status === 'pendente').length)
const approved = computed(() => project.state.reports.filter((r) => r.status === 'aprovado').length)
const openRestrictions = computed(() => project.state.restrictions.filter((r) => !r.resolved))
const updates = computed(() => project.state.log.filter((l) => l.kind === 'apontamento').slice(0, 6))
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Dor 1"
      title="Apontamento de Canteiro via IA & Sincronização MS Project"
      description="Relatos de áudio, texto e foto dos encarregados viram atualização de avanço físico na linha exata da EAP — com aprovação do engenheiro antes de tocar o cronograma."
    >
      <span class="chip-warn">{{ pending }} pendente(s)</span>
      <span class="chip-ok">{{ approved }} aplicado(s)</span>
    </ModuleHeader>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <!-- Coluna esquerda: feed do canteiro -->
      <section class="card flex min-h-[640px] flex-col overflow-hidden">
        <header class="card-header">
          <div class="flex items-center gap-2.5">
            <div class="grid h-8 w-8 place-items-center rounded-full bg-emerald-500/15"><MessagesSquare class="h-4 w-4 text-emerald-500" /></div>
            <div>
              <h2 class="card-title">Canteiro · Aurora (WhatsApp)</h2>
              <p class="card-subtitle">Grupo de encarregados · áudios transcritos automaticamente</p>
            </div>
          </div>
          <span class="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> ao vivo</span>
        </header>
        <div class="flex gap-1 border-b border-zinc-200 px-3 py-2 text-[11px] dark:border-zinc-800" role="tablist" aria-label="Filtrar relatos">
          <button
            v-for="f in ([['todos', 'Todos', project.state.reports.length], ['pendente', 'Pendentes', pending], ['aprovado', 'Aplicados', approved]] as const)"
            :key="f[0]"
            role="tab"
            :aria-selected="feedFilter === f[0]"
            class="rounded-md px-2 py-1"
            :class="feedFilter === f[0] ? 'bg-zinc-200 font-semibold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            @click="feedFilter = f[0]"
          >
            {{ f[1] }} <span class="tabular-nums text-zinc-400">{{ f[2] }}</span>
          </button>
        </div>
        <div
          class="flex-1 space-y-1 overflow-y-auto bg-zinc-50 p-3 dark:bg-zinc-950/60"
          style="background-image: radial-gradient(circle at 1px 1px, rgba(120, 120, 130, 0.12) 1px, transparent 0); background-size: 16px 16px"
        >
          <div class="mx-auto mb-2 w-fit rounded-md bg-white px-2 py-0.5 text-[10px] text-zinc-500 shadow-sm dark:bg-zinc-800">{{ fmtDate(project.state.meta.statusDate) }}</div>
          <ReportBubble v-for="r in sortedReports" :key="r.id" :report="r" :selected="r.id === selectedId" @select="selectedId = r.id" />
          <p v-if="!sortedReports.length" class="py-10 text-center text-xs text-zinc-500">Nenhum relato neste filtro.</p>
        </div>
        <ReportComposer @created="(id) => { feedFilter = 'todos'; selectedId = id }" />
      </section>

      <!-- Coluna direita: De-Para IA -> MS Project -->
      <div class="space-y-5">
        <SectionCard title="Mapeamento De-Para · IA → MS Project" subtitle="Como o relato foi traduzido para a EAP do cronograma" :icon="Sparkles">
          <AiMappingPanel v-if="selected" :report="selected" />
          <p v-else class="text-sm text-zinc-500">Selecione um relato no feed para ver a interpretação.</p>
        </SectionCard>

        <div class="grid gap-5 lg:grid-cols-2">
          <SectionCard title="Restrições de campo abertas" :subtitle="`${openRestrictions.length} restrição(ões) aguardando tratativa`" :icon="ShieldAlert" body-class="p-3">
            <ul v-if="openRestrictions.length" class="space-y-2">
              <li v-for="r in openRestrictions" :key="r.id" class="flex items-start gap-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                <div class="min-w-0 flex-1">
                  <div class="text-[12.5px] font-medium">{{ r.label }}</div>
                  <div class="text-[11px] text-zinc-500">
                    {{ fmtDate(r.date) }} · [UID {{ r.taskUid }}] {{ project.taskByUid.get(r.taskUid ?? -1)?.wbs }}
                    <span v-if="r.kind === 'material'"> · reflete em Suprimentos</span>
                  </div>
                </div>
                <button class="btn-ghost px-2 py-1" title="Marcar como resolvida" @click="project.resolveRestriction(r.id)"><Check class="h-3.5 w-3.5" /></button>
              </li>
            </ul>
            <p v-else class="p-3 text-xs text-zinc-500">Nenhuma restrição aberta. Aprovações com restrições aparecem aqui.</p>
          </SectionCard>

          <SectionCard title="Sincronizações recentes" subtitle="Trilha de auditoria dos apontamentos" :icon="History" body-class="p-3">
            <ul v-if="updates.length" class="space-y-2">
              <li v-for="u in updates" :key="u.id" class="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                <div class="font-mono text-[11.5px] font-semibold">{{ u.title }}</div>
                <div class="mt-0.5 text-[11px] text-zinc-500">{{ u.detail }}</div>
              </li>
            </ul>
            <p v-else class="p-3 text-xs text-zinc-500">Aprove um relato para gerar a primeira sincronização.</p>
          </SectionCard>
        </div>
      </div>
    </div>
  </div>
</template>
