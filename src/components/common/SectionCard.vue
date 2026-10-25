<script setup lang="ts">
import type { Component } from 'vue'

const props = defineProps<{ title: string; subtitle?: string; icon?: Component; bodyClass?: string }>()
</script>

<template>
  <section class="card flex min-w-0 flex-col">
    <header class="card-header">
      <div class="flex min-w-0 items-start gap-2.5">
        <div v-if="props.icon" class="mt-0.5 rounded-md border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-700 dark:bg-zinc-800">
          <component :is="props.icon" class="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
        </div>
        <div class="min-w-0">
          <h2 class="card-title">{{ props.title }}</h2>
          <p v-if="props.subtitle" class="card-subtitle">{{ props.subtitle }}</p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2"><slot name="actions" /></div>
    </header>
    <div class="min-w-0 flex-1" :class="props.bodyClass ?? 'p-5'"><slot /></div>
  </section>
</template>
