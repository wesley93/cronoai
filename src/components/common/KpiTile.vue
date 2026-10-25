<script lang="ts">
export type KpiTone = 'neutral' | 'ok' | 'warn' | 'critical' | 'accent'
</script>

<script setup lang="ts">
import type { Component } from 'vue'

const props = withDefaults(
  defineProps<{ label: string; value: string; sub?: string; tone?: KpiTone; icon?: Component; hint?: string }>(),
  { tone: 'neutral' },
)

const toneClass: Record<KpiTone, string> = {
  neutral: 'text-zinc-900 dark:text-zinc-50',
  ok: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-300',
  critical: 'text-coral-600 dark:text-coral-400',
  accent: 'text-amber-600 dark:text-amber-400',
}
const barClass: Record<KpiTone, string> = {
  neutral: 'bg-zinc-300 dark:bg-zinc-700',
  ok: 'bg-emerald-500',
  warn: 'bg-amber-400',
  critical: 'bg-coral-500',
  accent: 'bg-amber-400',
}
</script>

<template>
  <div class="card relative overflow-hidden px-4 py-3" :title="props.hint">
    <span class="absolute inset-y-0 left-0 w-0.5" :class="barClass[props.tone]" />
    <div class="flex items-center justify-between gap-2">
      <span class="eyebrow">{{ props.label }}</span>
      <component :is="props.icon" v-if="props.icon" class="h-3.5 w-3.5 text-zinc-400" />
    </div>
    <div class="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums tracking-tight" :class="toneClass[props.tone]">{{ props.value }}</div>
    <div v-if="props.sub" class="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">{{ props.sub }}</div>
  </div>
</template>
