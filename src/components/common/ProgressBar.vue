<script setup lang="ts">
const props = withDefaults(defineProps<{ value: number; tone?: 'ok' | 'warn' | 'critical' | 'accent'; height?: string }>(), {
  tone: 'ok',
  height: 'h-1.5',
})
const color = { ok: 'bg-emerald-500', warn: 'bg-amber-400', critical: 'bg-coral-500', accent: 'bg-amber-400' }
</script>

<template>
  <div class="w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800" :class="props.height">
    <div class="h-full rounded-full transition-all duration-500" :class="color[props.tone]" :style="{ width: `${Math.max(0, Math.min(100, props.value))}%` }" />
  </div>
</template>
