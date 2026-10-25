<script setup lang="ts">
import type { Component } from 'vue'
import { Bot, Cable, KeyRound, Mail, MessageCircle } from '@lucide/vue'
import { INTEGRACOES_FASE2 } from '@/data/integracoes'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import CartaoFase2 from './integracoes/CartaoFase2.vue'
import CartaoSinapi from './integracoes/CartaoSinapi.vue'

// Ícone por integração da Fase 2 (só visual; o texto do cartão vem de data/integracoes.ts)
const icones: Record<string, Component> = { whatsapp: MessageCircle, 'ia-transcricao': Bot, erp: Cable, 'email-teams': Mail, login: KeyRound }
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Base"
      title="Integrações"
      description="O que a obra ativa usa hoje e o que depende do servidor da Fase 2. No protótipo, nada aqui guarda senha, token ou chave."
    />
    <div class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      <CartaoSinapi />
      <CartaoFase2 v-for="i in INTEGRACOES_FASE2" :key="i.id" :integracao="i" :icone="icones[i.id]" />
    </div>
  </div>
</template>
