<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { REGIMES_SINAPI, ROTULO_REGIME_SINAPI, UFS } from '@/data/ufs'
import { MAX_MUNICIPIO, MAX_NOME_OBRA, MAX_RESPONSAVEL, validarDadosObra, type DadosObra } from '@/lib/obras'

const props = defineProps<{ inicial: DadosObra; rotuloBotao: string; idPrefixo: string; cancelavel?: boolean }>()
const emit = defineEmits<{ salvar: [dados: DadosObra]; cancelar: [] }>()

const form = reactive<DadosObra>({ ...props.inicial })
const erros = computed(() => validarDadosObra(form))
const tentou = ref(false)

function enviar() {
  tentou.value = true
  if (erros.value.length) return
  emit('salvar', { ...form })
}
</script>

<template>
  <form class="space-y-4" novalidate @submit.prevent="enviar">
    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      <div class="md:col-span-2 xl:col-span-3">
        <label class="label" :for="`${idPrefixo}-nome`">Nome da obra</label>
        <input :id="`${idPrefixo}-nome`" v-model="form.nome" class="input" :maxlength="MAX_NOME_OBRA" autocomplete="off" />
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-uf`">UF</label>
        <select :id="`${idPrefixo}-uf`" v-model="form.uf" class="input">
          <option value="">Não informada</option>
          <option v-for="u in UFS" :key="u.sigla" :value="u.sigla">{{ u.sigla }} · {{ u.nome }}</option>
        </select>
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-municipio`">Município</label>
        <input :id="`${idPrefixo}-municipio`" v-model="form.municipio" class="input" :maxlength="MAX_MUNICIPIO" autocomplete="off" />
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-responsavel`">Engenheiro responsável</label>
        <input :id="`${idPrefixo}-responsavel`" v-model="form.responsavel" class="input" :maxlength="MAX_RESPONSAVEL" autocomplete="off" />
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-inicio`">Data de início</label>
        <input :id="`${idPrefixo}-inicio`" v-model="form.dataInicio" type="date" class="input" />
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-status`">Data de status</label>
        <input :id="`${idPrefixo}-status`" v-model="form.dataStatus" type="date" class="input" />
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-regime`">Regime SINAPI</label>
        <select :id="`${idPrefixo}-regime`" v-model="form.regimeSinapi" class="input">
          <option value="">Não informado</option>
          <option v-for="r in REGIMES_SINAPI" :key="r" :value="r">{{ ROTULO_REGIME_SINAPI[r] }}</option>
        </select>
      </div>
      <div>
        <label class="label" :for="`${idPrefixo}-database`">Data-base SINAPI</label>
        <input :id="`${idPrefixo}-database`" v-model="form.dataBaseSinapi" type="month" class="input" />
      </div>
    </div>
    <ul v-if="tentou && erros.length" role="alert" class="list-disc space-y-0.5 pl-5 text-xs text-coral-600 dark:text-coral-400">
      <li v-for="e in erros" :key="e">{{ e }}</li>
    </ul>
    <div class="flex flex-wrap gap-2">
      <button type="submit" class="btn-primary">{{ rotuloBotao }}</button>
      <button v-if="cancelavel" type="button" class="btn-ghost" @click="emit('cancelar')">Cancelar</button>
    </div>
  </form>
</template>
