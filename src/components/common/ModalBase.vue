<script setup lang="ts">
// Janela de diálogo simples (ciclo 00007): sobreposição, título, Esc para fechar e foco no primeiro campo. O conteúdo é sempre interpolação.
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{ titulo: string; largura?: string }>()
const emit = defineEmits<{ fechar: [] }>()

const idTitulo = useId()
const caixa = ref<HTMLElement>()

function aoTeclar(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('fechar')
}
onMounted(() => {
  document.addEventListener('keydown', aoTeclar)
  caixa.value?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')?.focus()
})
onBeforeUnmount(() => document.removeEventListener('keydown', aoTeclar))
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4" @mousedown.self="emit('fechar')">
    <div ref="caixa" role="dialog" aria-modal="true" :aria-labelledby="idTitulo" class="card max-h-[90vh] w-full overflow-y-auto" :class="largura ?? 'max-w-xl'">
      <header class="card-header">
        <h2 :id="idTitulo" class="card-title">{{ titulo }}</h2>
        <button type="button" class="btn-ghost" aria-label="Fechar" @click="emit('fechar')">Fechar</button>
      </header>
      <div class="p-5"><slot /></div>
    </div>
  </div>
</template>
