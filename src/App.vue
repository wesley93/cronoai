<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import AppTopbar from '@/components/layout/AppTopbar.vue'
import AvisoArmazenamento from '@/components/layout/AvisoArmazenamento.vue'
import ToastHost from '@/components/layout/ToastHost.vue'
import { useUiStore, type ModuleId } from '@/stores/ui'
import { useProjectStore } from '@/stores/useProjectStore'

const ui = useUiStore()
const project = useProjectStore()

const views: Record<ModuleId, ReturnType<typeof defineAsyncComponent>> = {
  apontamento: defineAsyncComponent(() => import('@/modules/FieldReportsModule.vue')),
  'caminho-critico': defineAsyncComponent(() => import('@/modules/CriticalPathModule.vue')),
  suprimentos: defineAsyncComponent(() => import('@/modules/SupplyModule.vue')),
  sinapi: defineAsyncComponent(() => import('@/modules/SinapiModule.vue')),
  evm: defineAsyncComponent(() => import('@/modules/EvmModule.vue')),
  eap: defineAsyncComponent(() => import('@/modules/WbsModule.vue')),
  obras: defineAsyncComponent(() => import('@/modules/ObrasModule.vue')),
  premissas: defineAsyncComponent(() => import('@/modules/PremissasModule.vue')),
  integracoes: defineAsyncComponent(() => import('@/modules/IntegracoesModule.vue')),
}
</script>

<template>
  <div class="flex h-full">
    <AppSidebar />
    <div v-if="ui.sidebarOpen" class="fixed inset-0 z-30 bg-black/40 lg:hidden" @click="ui.sidebarOpen = false" />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar />
      <AvisoArmazenamento />
      <main class="flex-1 overflow-y-auto">
        <!-- A chave remonta todas as telas na troca de obra: nenhum estado local (relato, UID, data) sobrevive à obra anterior -->
        <div :key="project.obraAtivaId" class="mx-auto max-w-[1600px] p-4 lg:p-6">
          <KeepAlive>
            <component :is="views[ui.current]" :key="ui.current" />
          </KeepAlive>
        </div>
      </main>
    </div>
    <ToastHost />
  </div>
</template>
