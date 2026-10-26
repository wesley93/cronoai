<script setup lang="ts">
// Salvar a linha de base 0 a 10 (ciclo 00007, D-2): número com as existentes listadas, nome, motivo, autor declarado e confirmação de sobrescrita.
import { computed, ref } from 'vue'
import ModalBase from '@/components/common/ModalBase.vue'
import { LIMITES_LINHA_BASE, NUMERO_MAX_LINHA_BASE, dataLocalDeIso, validarTextosLinhaBase } from '@/lib/linhasBase'
import { fmtDate } from '@/lib/format'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits<{ fechar: [] }>()
const project = useProjectStore()
const ui = useUiStore()

const numeros = Array.from({ length: NUMERO_MAX_LINHA_BASE + 1 }, (_, n) => n)
const existentes = computed(() => new Map(project.state.linhasBase.map((i) => [i.numero, i])))
const primeiraLivre = () => numeros.find((n) => n > 0 && !existentes.value.has(n)) ?? 1

const numero = ref(primeiraLivre())
const nome = ref('')
const motivo = ref('')
// O autor é um texto declarado (ainda não há login, SPEC-02), pré-preenchido com o responsável da obra
const autor = ref(project.state.meta.manager)
const confirmar = ref(false)
const tentou = ref(false)
const erroDaAcao = ref('')

const existente = computed(() => existentes.value.get(numero.value))
const errosDeTexto = computed(() => validarTextosLinhaBase({ nome: nome.value, motivo: motivo.value, autor: autor.value }))
const rotuloExistente = (n: number) => {
  const i = existentes.value.get(n)
  return i ? `LB${n} — ${i.nome}${i.salvaEm ? ` (${dataLocalDeIso(i.salvaEm)})` : ''} · já salva` : `LB${n} — livre`
}

function salvar() {
  tentou.value = true
  erroDaAcao.value = ''
  if (errosDeTexto.value.length) return
  if (existente.value && !confirmar.value) {
    erroDaAcao.value = `Marque a confirmação para substituir a linha de base ${numero.value}.`
    return
  }
  const r = project.salvarLinhaBase({ numero: numero.value, nome: nome.value, motivo: motivo.value, autor: autor.value, confirmarSobrescrita: confirmar.value })
  if (!r.ok) {
    erroDaAcao.value = r.erro
    return
  }
  ui.notify('success', `Linha de base ${numero.value} salva`, 'Salvar a linha de base não altera as outras. Escolha, no Valor Agregado, contra qual delas medir o PV e o EV.')
  emit('fechar')
}
</script>

<template>
  <ModalBase titulo="Salvar linha de base" @fechar="emit('fechar')">
    <form class="space-y-4" novalidate @submit.prevent="salvar">
      <p class="text-[12px] text-zinc-600 dark:text-zinc-400">
        Grava o cronograma reprogramado de {{ fmtDate(project.state.meta.statusDate) }} (início, término, duração e custo de cada tarefa) na linha escolhida.
        Linha nova não apaga as outras, e o histórico de fechamentos não muda.
      </p>
      <div>
        <label class="label" for="lb-numero">Linha de base</label>
        <select id="lb-numero" v-model.number="numero" class="input" @change="confirmar = false">
          <option v-for="n in numeros" :key="n" :value="n">{{ rotuloExistente(n) }}</option>
        </select>
      </div>
      <div>
        <label class="label" for="lb-nome">Nome</label>
        <input id="lb-nome" v-model="nome" class="input" :maxlength="LIMITES_LINHA_BASE.nome" autocomplete="off" placeholder="Ex.: Replanejamento após as chuvas" />
      </div>
      <div>
        <label class="label" for="lb-motivo">Motivo</label>
        <textarea id="lb-motivo" v-model="motivo" class="input" rows="3" :maxlength="LIMITES_LINHA_BASE.motivo" />
      </div>
      <div>
        <label class="label" for="lb-autor">Autor (texto declarado)</label>
        <input id="lb-autor" v-model="autor" class="input" :maxlength="LIMITES_LINHA_BASE.autor" autocomplete="off" />
        <p class="mt-1 text-[11px] text-zinc-500">O CronoAI ainda não tem login: o autor é só um texto informado por quem salva (opcional).</p>
      </div>
      <label v-if="existente" class="flex items-start gap-2 rounded-lg border border-amber-400/40 bg-amber-400/[0.06] p-3 text-[12px]">
        <input v-model="confirmar" type="checkbox" class="mt-0.5" />
        <span>
          Confirmo substituir a linha de base {{ numero }} ("{{ existente.nome }}"{{ existente.salvaEm ? `, de ${dataLocalDeIso(existente.salvaEm)}` : '' }}).
          Os fechamentos já gravados guardam os próprios totais e não mudam.
        </span>
      </label>
      <ul v-if="tentou && errosDeTexto.length" class="list-disc space-y-0.5 pl-4 text-[12px] text-coral-600 dark:text-coral-400" role="alert">
        <li v-for="e in errosDeTexto" :key="e">{{ e }}</li>
      </ul>
      <p v-if="erroDaAcao" class="text-[12px] text-coral-600 dark:text-coral-400" role="alert">{{ erroDaAcao }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('fechar')">Cancelar</button>
        <button type="submit" class="btn-primary">Salvar linha de base</button>
      </div>
    </form>
  </ModalBase>
</template>
