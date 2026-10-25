<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search } from '@lucide/vue'
import type { ComposicaoRecorte } from '@/types/sinapi'
import { MAX_RESULTADOS_BUSCA, buscarComposicoes, unidadeParaExibicao } from '@/lib/recorteSinapi'
import { fmtBRLCents } from '@/lib/format'
import { useProjectStore } from '@/stores/useProjectStore'

// Busca no recorte SINAPI da obra (código ou texto, sem acento, até 50 resultados). Só depende do texto digitado e do índice do recorte:
// premissa, quantidade e equipe não refazem a busca. O texto da composição só entra por interpolação (nunca v-html).
const props = defineProps<{ selecionado?: string }>()
const emit = defineEmits<{ selecionar: [composicao: ComposicaoRecorte] }>()

const project = useProjectStore()
const consulta = ref('')
const resultados = computed(() => {
  const a = project.recorteAtual
  return a && consulta.value.trim() ? buscarComposicoes(a.indice, consulta.value) : []
})

function escolher(c: ComposicaoRecorte) {
  emit('selecionar', c)
  consulta.value = ''
}
</script>

<template>
  <div>
    <label class="label" for="busca-composicao">Buscar composição (código ou texto)</label>
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" aria-hidden="true" />
      <input
        id="busca-composicao"
        v-model="consulta"
        type="search"
        class="input pl-8"
        maxlength="80"
        autocomplete="off"
        placeholder="Ex.: 103332 ou alvenaria vedação"
        data-testid="busca-composicao"
      />
    </div>
    <p v-if="consulta.trim() && !resultados.length" class="mt-1.5 text-[11px] text-zinc-500" data-testid="busca-sem-resultado">Nenhuma composição encontrada no recorte.</p>
    <ul v-if="resultados.length" class="mt-1.5 max-h-64 divide-y divide-zinc-200 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800" data-testid="busca-resultados">
      <li v-for="c in resultados" :key="c.codigo">
        <button type="button" class="flex w-full items-start gap-3 px-3 py-2 text-left text-[12px] hover:bg-zinc-50 dark:hover:bg-zinc-800/60" :class="c.codigo === props.selecionado ? 'bg-amber-50 dark:bg-amber-400/10' : ''" @click="escolher(c)">
          <span class="w-14 shrink-0 font-mono font-semibold">{{ c.codigo }}</span>
          <span class="min-w-0 flex-1">{{ c.descricao }}</span>
          <span class="shrink-0 text-right tabular-nums text-zinc-500">{{ fmtBRLCents(c.custoUnitario) }}/{{ unidadeParaExibicao(c.unidade) }}</span>
        </button>
      </li>
    </ul>
    <p v-if="resultados.length >= MAX_RESULTADOS_BUSCA" class="mt-1 text-[11px] text-zinc-500">Mostrando as {{ MAX_RESULTADOS_BUSCA }} primeiras: refine a busca.</p>
  </div>
</template>
