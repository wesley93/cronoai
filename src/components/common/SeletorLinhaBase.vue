<script setup lang="ts">
// Escolha da linha de base do valor agregado (ciclo 00007, G5 = b): vale para PV, EV, BAC, índices, Curva S e previsão pelo SPI.
// O atraso e as variações medem sempre contra a LB0, como no MS Project.
import { computed } from 'vue'
import { rotuloLinhaBase } from '@/lib/linhasBase'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'

const project = useProjectStore()
const ui = useUiStore()
const opcoes = computed(() => project.state.linhasBase.map((i) => ({ numero: i.numero, rotulo: rotuloLinhaBase(i) })))

function escolher(e: Event) {
  const r = project.definirLinhaBaseAtiva(Number((e.target as HTMLSelectElement).value))
  if (!r.ok) ui.notify('error', 'Linha de base não alterada', r.erro)
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 text-[12px]" data-testid="seletor-linha-base">
    <label class="font-medium text-zinc-700 dark:text-zinc-200" for="lb-valor-agregado">LB do valor agregado:</label>
    <select id="lb-valor-agregado" class="rounded-md border border-zinc-200 bg-transparent px-2 py-1 text-[12px] dark:border-zinc-700" :value="project.linhaBaseAtiva" @change="escolher">
      <option v-for="o in opcoes" :key="o.numero" :value="o.numero">{{ o.rotulo }}</option>
      <option v-if="!opcoes.length" :value="0">LB0</option>
    </select>
    <span class="chip-neutral" data-testid="rotulo-lb-valor-agregado">LB{{ project.linhaBaseAtiva }}</span>
    <p class="basis-full text-[11px] text-zinc-500">
      Vale para PV, EV, BAC, índices, Curva S e previsão pelo SPI. O atraso e as variações medem contra a LB0, como no MS Project.
      O PV é distribuído linearmente entre o início e o término da linha de base.
    </p>
    <p v-if="project.avisoSemLinhaBase" class="basis-full rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-2 py-1 text-[11.5px] text-amber-800 dark:text-amber-200" role="status">
      {{ project.avisoSemLinhaBase }}
    </p>
  </div>
</template>
