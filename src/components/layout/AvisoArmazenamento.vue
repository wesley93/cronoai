<script setup lang="ts">
import { computed, ref } from 'vue'
import { Info, TriangleAlert, X } from '@lucide/vue'
import { useProjectStore } from '@/stores/useProjectStore'

const project = useProjectStore()

// Avisos da carga (migração, armazenamento indisponível) podem ser dispensados; falha de gravação e cota não somem sozinhas.
const dispensado = ref(false)
const avisosCarga = computed(() => (dispensado.value ? [] : project.avisosCarga))
</script>

<template>
  <div v-if="project.estadoGravacao === 'erro' || project.alertaCota !== undefined || avisosCarga.length || project.erroCronograma || project.avisoRestanteAntesDoStatus" class="space-y-px">
    <!-- Cálculo fora do horizonte: a tela segue de pé (obras, exportação e dados da obra) e o usuário corrige a data -->
    <div
      v-if="project.erroCronograma"
      role="alert"
      data-testid="erro-cronograma"
      class="flex items-start gap-2 border-b border-coral-500/40 bg-coral-500/10 px-4 py-2 text-xs text-coral-700 dark:text-coral-300"
    >
      <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>O cronograma desta obra não pôde ser calculado:</strong> {{ project.erroCronograma }} Cronograma, EVM e cenários ficam vazios até você corrigir a
        data de status, a data de início ou a tarefa em questão (tela Obras e EAP). Você pode trocar de obra ou exportar para MS Project (.xml) enquanto isso.
      </p>
    </div>
    <div
      v-if="project.avisoRestanteAntesDoStatus"
      role="status"
      data-testid="aviso-restante"
      class="flex items-start gap-2 border-b border-amber-500/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <strong>{{ project.avisoRestanteAntesDoStatus }} tarefa(s) iniciada(s) com o restante terminando antes da data de status.</strong>
        A opção "mover o restante para depois da data de status" está desligada (política do CronoAI): o restante segue contínuo desde o início real e fica no passado.
      </p>
    </div>
    <div
      v-if="project.estadoGravacao === 'erro'"
      role="alert"
      class="flex items-start gap-2 border-b border-coral-500/40 bg-coral-500/10 px-4 py-2 text-xs text-coral-700 dark:text-coral-300"
    >
      <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p v-if="project.gravacaoBloqueada">
        <strong>{{ project.mensagemGravacao }}</strong> Exporte para MS Project (.xml) o que não pode ser perdido e recarregue a página.
      </p>
      <p v-else-if="project.armazenamentoIndisponivel">
        <strong>Armazenamento local indisponível:</strong> as alterações desta sessão não serão salvas. Exporte para MS Project (.xml) antes de fechar a página.
      </p>
      <p v-else>
        <strong>As alterações desta obra não estão sendo salvas.</strong> {{ project.mensagemGravacao }} Exporte para MS Project (.xml) e libere espaço excluindo obras que não usa; a próxima alteração tenta salvar de novo.
      </p>
    </div>
    <div
      v-if="project.alertaCota !== undefined"
      role="status"
      class="flex items-start gap-2 border-b border-amber-500/40 bg-amber-400/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-200"
    >
      <TriangleAlert class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>Armazenamento local em {{ project.alertaCota }}%. Exporte para MS Project (.xml) as obras que não usa e exclua-as.</p>
    </div>
    <div
      v-for="(aviso, i) in avisosCarga"
      :key="i"
      role="status"
      class="flex items-start gap-2 border-b border-sky-500/40 bg-sky-500/10 px-4 py-2 text-xs text-sky-800 dark:text-sky-200"
    >
      <Info class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p class="flex-1">{{ aviso }}</p>
      <button class="text-sky-700 hover:text-sky-900 dark:text-sky-300" aria-label="Dispensar aviso" @click="dispensado = true"><X class="h-3.5 w-3.5" /></button>
    </div>
  </div>
</template>
