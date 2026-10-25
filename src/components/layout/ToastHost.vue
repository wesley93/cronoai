<script setup lang="ts">
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from '@lucide/vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const icons = { success: CheckCircle2, info: Info, warning: TriangleAlert, error: XCircle }
const tones = {
  success: 'text-emerald-500',
  info: 'text-sky-500',
  warning: 'text-amber-500',
  error: 'text-coral-500',
}
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="opacity-0"
      leave-active-class="transition duration-150"
    >
      <div v-for="t in ui.toasts" :key="t.id" class="card pointer-events-auto flex items-start gap-3 p-3 shadow-lg dark:bg-zinc-900">
        <component :is="icons[t.tone]" class="mt-0.5 h-4 w-4 shrink-0" :class="tones[t.tone]" />
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-zinc-900 dark:text-zinc-50">{{ t.title }}</p>
          <p v-if="t.detail" class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{{ t.detail }}</p>
        </div>
        <button class="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200" aria-label="Fechar" @click="ui.dismiss(t.id)">
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
