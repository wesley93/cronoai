<script setup lang="ts">
import { computed } from 'vue'
import { Database } from '@lucide/vue'
import { ROTULO_REGIME_SINAPI } from '@/data/ufs'
import { estadoCartaoSinapi } from '@/lib/integracoes'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import CartaoIntegracao from './CartaoIntegracao.vue'

// Cartão SINAPI da obra ativa (SPEC-15, RF-15.2). Neste ponto só mostra UF, regime e data-base e o estado; a importação do recorte vem no E4.
const project = useProjectStore()
const ui = useUiStore()

const meta = computed(() => project.state.meta)
const dataBase = computed(() => {
  const [ano, mes] = (meta.value.dataBaseSinapi ?? '').split('-')
  return mes && ano ? `${mes}/${ano}` : 'não informada'
})
const regime = computed(() => (meta.value.regimeSinapi ? ROTULO_REGIME_SINAPI[meta.value.regimeSinapi] : 'não informado'))
const estado = computed(() => estadoCartaoSinapi(false))
</script>

<template>
  <CartaoIntegracao titulo="SINAPI" :estado="estado" :icone="Database">
    <p>Tabela de custos e de produtividade (RUP) da UF, do regime e da data-base da obra, importada de um recorte gerado offline.</p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt class="text-zinc-500">UF</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-uf">{{ meta.uf ?? 'não informada' }}</dd>
      <dt class="text-zinc-500">Regime</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ regime }}</dd>
      <dt class="text-zinc-500">Data-base</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ dataBase }}</dd>
    </dl>
    <button type="button" class="btn-secondary" @click="ui.current = 'obras'">Alterar em Obras › Dados da obra</button>
  </CartaoIntegracao>
</template>
