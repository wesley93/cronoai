<script setup lang="ts">
import { computed } from 'vue'
import { Mic, CheckCheck, Ban, Clock3 } from 'lucide-vue-next'
import type { FieldReport } from '@/types/domain'
import SitePhoto from '@/components/illustrations/SitePhoto.vue'

const props = defineProps<{ report: FieldReport; selected: boolean }>()
defineEmits<{ select: [] }>()

const initials = computed(() =>
  props.report.author
    .split(' ')
    .filter((p) => p.length > 2 || /^[A-Z]/.test(p))
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase(),
)
const time = computed(() => props.report.timestamp.slice(11, 16))
const bars = computed(() => Array.from({ length: 28 }, (_, i) => 30 + Math.round(Math.abs(Math.sin(i * 1.7 + props.report.id.length)) * 70)))
</script>

<template>
  <button
    class="group flex w-full gap-2.5 rounded-xl p-2 text-left transition-colors"
    :class="selected ? 'bg-amber-400/10 ring-1 ring-amber-400/60' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50'"
    @click="$emit('select')"
  >
    <div class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" :class="report.avatarColor">{{ initials }}</div>
    <div class="min-w-0 flex-1">
      <div class="flex items-baseline gap-2">
        <span class="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">{{ report.author }}</span>
        <span class="truncate text-[10px] text-zinc-500">{{ report.role }}</span>
      </div>

      <div class="mt-1 rounded-lg rounded-tl-none border border-zinc-200 bg-white p-2.5 shadow-sm dark:border-zinc-700/70 dark:bg-zinc-800/80">
        <div v-if="report.channel === 'audio'" class="mb-2 flex items-center gap-2">
          <div class="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white"><Mic class="h-3 w-3" /></div>
          <div class="flex h-5 flex-1 items-center gap-[2px]">
            <span v-for="(h, i) in bars" :key="i" class="w-[3px] rounded-full bg-zinc-400 dark:bg-zinc-500" :style="{ height: `${h}%` }" />
          </div>
          <span class="mono text-zinc-500">0:{{ String(report.audioSeconds ?? 0).padStart(2, '0') }}</span>
        </div>
        <p class="text-[12.5px] leading-relaxed text-zinc-700 dark:text-zinc-200">
          <span v-if="report.channel === 'audio'" class="mr-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Transcrição ·</span>
          “{{ report.transcript }}”
        </p>
        <SitePhoto v-if="report.photo || report.photoUrl" :kind="report.photo" :src="report.photoUrl" class="mt-2 h-24 w-40" />
        <div class="mt-1.5 flex items-center justify-end gap-2 text-[10px] text-zinc-500">
          <span v-if="report.status === 'aprovado'" class="chip-ok"><CheckCheck class="h-3 w-3" /> Aplicado na EAP</span>
          <span v-else-if="report.status === 'rejeitado'" class="chip-neutral"><Ban class="h-3 w-3" /> Descartado</span>
          <span v-else class="chip-warn"><Clock3 class="h-3 w-3" /> Aguardando engenheiro</span>
          <span class="tabular-nums">{{ time }}</span>
        </div>
      </div>
    </div>
  </button>
</template>
