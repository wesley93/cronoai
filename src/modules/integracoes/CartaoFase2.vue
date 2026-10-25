<script setup lang="ts">
import type { Component } from 'vue'
import type { IntegracaoFase2 } from '@/data/integracoes'
import CartaoIntegracao from './CartaoIntegracao.vue'

// Integração da Fase 2: SÓ informação (spec, área que aprova e o aviso). Nenhum campo, botão ou link: não existe servidor para guardar credencial.
const props = defineProps<{ integracao: IntegracaoFase2; icone?: Component }>()
</script>

<template>
  <CartaoIntegracao :titulo="props.integracao.titulo" estado="requer-servidor" :icone="props.icone">
    <p>{{ props.integracao.descricao }}</p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt class="text-zinc-500">Spec</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ props.integracao.spec }}</dd>
      <dt class="text-zinc-500">Aprova</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ props.integracao.areas.join(' e ') }}</dd>
    </dl>
    <p class="text-[11.5px] text-zinc-500">Na Fase 2, a credencial é cadastrada só no servidor e nunca volta para a tela.</p>
  </CartaoIntegracao>
</template>
