<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Plus, Trash2 } from '@lucide/vue'
import type { CalendarioObra, IntervaloTrabalho } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { MAX_DESCRICAO_EXCECAO, intervaloDeTextos, intervalosDaPredefinicao, minutosParaHora } from '@/lib/calendarioTrabalho'
import { fmtDate } from '@/lib/format'

const props = defineProps<{ calendario: CalendarioObra }>()
const project = useProjectStore()
const ui = useUiStore()

type TipoExcecao = 'nao-util' | 'quatro-horas' | 'oito-horas' | 'proprio'
const excecao = reactive({ data: '', tipo: 'quatro-horas' as TipoExcecao, de: '08:00', ate: '12:00', descricao: '' })
const erroExcecao = ref('')
const excecoesOrdenadas = computed(() => props.calendario.excecoes)
const LIMITE_EXCECOES = 200

function descreverExcecao(ivs: readonly IntervaloTrabalho[]): string {
  return ivs.length ? ivs.map((iv) => `${minutosParaHora(iv.de)}–${minutosParaHora(iv.ate)}`).join(' e ') : 'Dia não útil'
}

function adicionarExcecao() {
  let intervalos: IntervaloTrabalho[] = []
  if (excecao.tipo === 'quatro-horas') intervalos = intervalosDaPredefinicao('quatro-horas')
  else if (excecao.tipo === 'oito-horas') intervalos = intervalosDaPredefinicao('oito-horas')
  else if (excecao.tipo === 'proprio') {
    const r = intervaloDeTextos(excecao.de, excecao.ate)
    if ('erro' in r) {
      erroExcecao.value = r.erro
      return
    }
    intervalos = [r.intervalo]
  }
  if (!excecao.data) {
    erroExcecao.value = 'Informe a data da exceção.'
    return
  }
  const r = project.definirExcecao(props.calendario.uid, { data: excecao.data, intervalos, descricao: excecao.descricao })
  if (!r.ok) {
    erroExcecao.value = r.erro
    return
  }
  erroExcecao.value = ''
  Object.assign(excecao, { data: '', descricao: '' })
}

function removerExcecao(data: string) {
  const r = project.removerExcecao(props.calendario.uid, data)
  if (!r.ok) ui.notify('error', 'Exceção não removida', r.erro)
}
</script>

<template>
  <section class="space-y-3">
    <h3 class="text-sm font-semibold">Exceções por data</h3>
    <p class="text-[11.5px] text-zinc-500">Dia não útil ou horário próprio numa data (ex.: sábado de 4 h). A exceção do calendário vale mais que os feriados da obra.</p>
    <div class="max-h-60 overflow-auto">
      <table class="table-base">
        <thead>
          <tr><th>Data</th><th>Horário</th><th>Descrição</th><th><span class="sr-only">Remover</span></th></tr>
        </thead>
        <tbody>
          <tr v-for="e in excecoesOrdenadas.slice(0, LIMITE_EXCECOES)" :key="e.data">
            <td class="whitespace-nowrap tabular-nums">{{ fmtDate(e.data) }}</td>
            <td>{{ descreverExcecao(e.intervalos) }}</td>
            <td class="max-w-[260px] truncate" :title="e.descricao">{{ e.descricao ?? '' }}</td>
            <td><button type="button" class="btn-ghost px-2 py-1" :aria-label="`Remover a exceção de ${fmtDate(e.data)}`" @click="removerExcecao(e.data)"><Trash2 class="h-3.5 w-3.5" aria-hidden="true" /></button></td>
          </tr>
          <tr v-if="!excecoesOrdenadas.length">
            <td colspan="4" class="py-3 text-center text-zinc-500">Nenhuma exceção neste calendário.</td>
          </tr>
        </tbody>
      </table>
      <p v-if="excecoesOrdenadas.length > LIMITE_EXCECOES" class="p-2 text-[11px] text-zinc-500">Mostrando as {{ LIMITE_EXCECOES }} primeiras de {{ excecoesOrdenadas.length }} exceções.</p>
    </div>
    <form class="grid gap-3 md:grid-cols-5" novalidate @submit.prevent="adicionarExcecao">
      <div>
        <label class="label" for="exc-data">Data</label>
        <input id="exc-data" v-model="excecao.data" type="date" class="input" />
      </div>
      <div>
        <label class="label" for="exc-tipo">Tipo</label>
        <select id="exc-tipo" v-model="excecao.tipo" class="input">
          <option value="nao-util">Dia não útil</option>
          <option value="quatro-horas">Meio período (4 h, 08:00–12:00)</option>
          <option value="oito-horas">Dia inteiro (8 h)</option>
          <option value="proprio">Horário próprio</option>
        </select>
      </div>
      <div v-if="excecao.tipo === 'proprio'" class="flex items-end gap-1">
        <input v-model="excecao.de" class="input w-20 text-center" maxlength="5" aria-label="Início da exceção" />
        <span class="pb-2 text-zinc-400">–</span>
        <input v-model="excecao.ate" class="input w-20 text-center" maxlength="5" aria-label="Fim da exceção" />
      </div>
      <div :class="excecao.tipo === 'proprio' ? '' : 'md:col-span-2'">
        <label class="label" for="exc-desc">Descrição</label>
        <input id="exc-desc" v-model="excecao.descricao" class="input" :maxlength="MAX_DESCRICAO_EXCECAO" autocomplete="off" />
      </div>
      <div class="flex items-end"><button type="submit" class="btn-secondary"><Plus class="h-3.5 w-3.5" aria-hidden="true" /> Adicionar exceção</button></div>
    </form>
    <p v-if="erroExcecao" role="alert" class="text-xs text-coral-600 dark:text-coral-400">{{ erroExcecao }}</p>
  </section>
</template>
