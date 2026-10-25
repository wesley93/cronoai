<script setup lang="ts">
import { computed, type Component } from 'vue'
import { CircleCheck, CircleDashed, Hourglass, ServerOff } from '@lucide/vue'
import type { EstadoIntegracao } from '@/data/integracoes'
import { rotuloDoEstado } from '@/lib/integracoes'

// Cartão de uma integração (SPEC-15, RF-15.1): título, estado em TEXTO com ícone (a cor nunca é a única pista) e o corpo no slot.
const props = defineProps<{ titulo: string; estado: EstadoIntegracao; area?: string; icone?: Component }>()

const iconesDoEstado: Record<EstadoIntegracao, Component> = {
  configurada: CircleCheck,
  'nao-configurada': CircleDashed,
  'requer-servidor': ServerOff,
  'aguardando-aprovacao': Hourglass,
}
const icone = computed(() => iconesDoEstado[props.estado])
const rotulo = computed(() => rotuloDoEstado(props.estado, props.area))
const tom = computed(() => (props.estado === 'configurada' ? 'chip-ok' : props.estado === 'aguardando-aprovacao' ? 'chip-warn' : 'chip-neutral'))
</script>

<template>
  <article class="card flex min-w-0 flex-col" :data-estado="props.estado">
    <header class="card-header">
      <div class="flex min-w-0 items-start gap-2.5">
        <div v-if="props.icone" class="mt-0.5 rounded-md border border-zinc-200 bg-zinc-50 p-1.5 dark:border-zinc-700 dark:bg-zinc-800">
          <component :is="props.icone" class="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" aria-hidden="true" />
        </div>
        <h3 class="card-title">{{ props.titulo }}</h3>
      </div>
      <span :class="tom" class="inline-flex items-center gap-1" data-testid="estado-integracao">
        <component :is="icone" class="h-3 w-3" aria-hidden="true" />
        {{ rotulo }}
      </span>
    </header>
    <div class="min-w-0 flex-1 space-y-2 p-5 text-[12.5px] text-zinc-600 dark:text-zinc-400"><slot /></div>
  </article>
</template>
