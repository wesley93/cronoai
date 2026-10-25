<script setup lang="ts">
import { computed, ref } from 'vue'
import { FileCode2, ChevronDown } from 'lucide-vue-next'
import { diffLines } from '@/lib/textDiff'

const props = defineProps<{ before: string; after: string }>()
const onlyChanges = ref(true)

const lines = computed(() => diffLines(props.before, props.after))
const changed = computed(() => lines.value.filter((l) => l.kind !== 'same').length)
/** Com "só alterações", mantém 1 linha de contexto ao redor de cada mudança. */
const visible = computed(() => {
  if (!onlyChanges.value) return lines.value.map((l) => ({ ...l, gap: false }))
  const keep = lines.value.map((l, i, all) => l.kind !== 'same' || all[i - 1]?.kind !== 'same' || all[i + 1]?.kind !== 'same')
  const out: { kind: string; text: string; gap: boolean }[] = []
  lines.value.forEach((l, i) => {
    if (keep[i]) out.push({ ...l, gap: false })
    else if (out.at(-1)?.gap !== true) out.push({ kind: 'same', text: '…', gap: true })
  })
  return out
})
</script>

<template>
  <details class="group rounded-lg border border-zinc-200 dark:border-zinc-800">
    <summary class="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[12px]">
      <FileCode2 class="h-4 w-4 text-amber-500" />
      <span class="font-medium">Prévia do XML (MSPDI) enviado ao MS Project</span>
      <span class="chip-neutral">{{ changed }} linha(s) alterada(s)</span>
      <ChevronDown class="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180" />
    </summary>
    <div class="border-t border-zinc-200 dark:border-zinc-800">
      <label class="flex items-center gap-2 px-3 py-1.5 text-[11px] text-zinc-500">
        <input v-model="onlyChanges" type="checkbox" class="accent-amber-400" /> Mostrar só as alterações
      </label>
      <pre class="max-h-72 overflow-auto bg-zinc-950 py-2 font-mono text-[11px] leading-5 text-zinc-300"><code><span
        v-for="(l, i) in visible"
        :key="i"
        class="block whitespace-pre px-3"
        :class="l.gap ? 'text-zinc-600' : l.kind === 'added' ? 'bg-emerald-500/15 text-emerald-300' : l.kind === 'removed' ? 'bg-coral-500/15 text-coral-300 line-through decoration-coral-400/50' : ''"
      ><span class="mr-2 select-none text-zinc-600">{{ l.gap ? ' ' : l.kind === 'added' ? '+' : l.kind === 'removed' ? '−' : ' ' }}</span>{{ l.text }}</span></code></pre>
    </div>
  </details>
</template>
