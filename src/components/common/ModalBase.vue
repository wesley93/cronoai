<script setup lang="ts">
// Janela de diálogo (ciclo 00007; padrão WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): sobreposição, título, foco inicial no
// primeiro campo do formulário, Tab que circula dentro do diálogo, Esc para fechar, foco devolvido a quem abriu e fundo que não descarta o que foi digitado.
// O conteúdo é sempre interpolação.
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

defineProps<{ titulo: string; largura?: string }>()
const emit = defineEmits<{ fechar: [] }>()

const FOCAVEL = 'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
const idTitulo = useId()
const caixa = ref<HTMLElement>()
const corpo = ref<HTMLElement>()
/** Quem tinha o foco quando o diálogo abriu (o botão que o abriu): recebe o foco de volta ao fechar. */
const quemAbriu = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null
/** O usuário digitou ou escolheu algo: clicar no fundo não fecha (o texto não se perde por um clique perdido). */
const alterado = ref(false)

const focaveis = (): HTMLElement[] => Array.from(caixa.value?.querySelectorAll<HTMLElement>(FOCAVEL) ?? []).filter((e) => !e.closest('[hidden]'))

function aoTeclar(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('fechar')
    return
  }
  if (e.key !== 'Tab') return
  // Trava de foco: Tab no último volta ao primeiro, Shift+Tab no primeiro vai ao último
  const lista = focaveis()
  if (!lista.length) {
    e.preventDefault()
    return
  }
  const primeiro = lista[0]
  const ultimo = lista[lista.length - 1]
  const ativo = document.activeElement
  if (!caixa.value?.contains(ativo)) {
    e.preventDefault()
    primeiro.focus()
  } else if (e.shiftKey && ativo === primeiro) {
    e.preventDefault()
    ultimo.focus()
  } else if (!e.shiftKey && ativo === ultimo) {
    e.preventDefault()
    primeiro.focus()
  }
}

onMounted(() => {
  document.addEventListener('keydown', aoTeclar)
  // Foco inicial no primeiro campo do formulário (não no "Fechar" do cabeçalho); sem campo, no primeiro elemento focável
  const campo = corpo.value?.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])')
  ;(campo ?? focaveis()[0])?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', aoTeclar)
  if (quemAbriu?.isConnected) quemAbriu.focus()
})
function aoClicarNoFundo() {
  if (!alterado.value) emit('fechar')
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 p-4" @mousedown.self="aoClicarNoFundo">
    <div ref="caixa" role="dialog" aria-modal="true" :aria-labelledby="idTitulo" class="card max-h-[90vh] w-full overflow-y-auto" :class="largura ?? 'max-w-xl'" @input="alterado = true" @change="alterado = true">
      <header class="card-header">
        <h2 :id="idTitulo" class="card-title">{{ titulo }}</h2>
        <button type="button" class="btn-ghost" aria-label="Fechar" @click="emit('fechar')">Fechar</button>
      </header>
      <div ref="corpo" class="p-5"><slot /></div>
    </div>
  </div>
</template>
