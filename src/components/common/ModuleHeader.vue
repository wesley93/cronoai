<script setup lang="ts">
const props = defineProps<{ pain: string; title: string; description: string }>()
</script>

<template>
  <div class="flex flex-wrap items-end justify-between gap-4">
    <div class="max-w-3xl">
      <div class="flex items-center gap-2">
        <span class="chip-warn">{{ props.pain }}</span>
        <h1 class="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{{ props.title }}</h1>
      </div>
      <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{{ props.description }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-2"><slot /></div>
  </div>
</template>
