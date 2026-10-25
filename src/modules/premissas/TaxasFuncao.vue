<script setup lang="ts">
import { Plus, Trash2 } from '@lucide/vue'
import { ORIGENS_PREMISSA, type OrigemPremissa, type TaxaFuncao } from '@/types/domain'
import { MAX_FUNCAO, MAX_REFERENCIA, MAX_TAXAS, ROTULO_ORIGEM_PREMISSA, taxaEfetiva } from '@/lib/premissas'
import { fmtBRLCents } from '@/lib/format'

const taxas = defineModel<TaxaFuncao[]>({ required: true })
const props = defineProps<{ encargosSociaisPct?: number; taxaPadrao: number }>()

const numero = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw.replace(',', '.')))

function alterar(i: number, parcial: Partial<TaxaFuncao>) {
  taxas.value = taxas.value.map((t, k) => (k === i ? { ...t, ...parcial } : t))
}

function alterarOrigem(i: number, valor: string) {
  const origem: OrigemPremissa | undefined = ORIGENS_PREMISSA.find((o) => o === valor)
  if (origem) alterar(i, { origem })
}

function alterarOpcional(i: number, campo: 'referencia' | 'dataReferencia', valor: string) {
  const { [campo]: _antigo, ...resto } = taxas.value[i]
  taxas.value = taxas.value.map((t, k) => (k === i ? (valor.trim() ? { ...resto, [campo]: valor } : resto) : t))
}

function adicionar() {
  if (taxas.value.length >= MAX_TAXAS) return
  taxas.value = [...taxas.value, { funcao: `Nova função ${taxas.value.length + 1}`, valorHora: props.taxaPadrao, incluiEncargos: true, origem: 'outra' }]
}

function remover(i: number) {
  taxas.value = taxas.value.filter((_, k) => k !== i)
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table-base">
      <thead>
        <tr>
          <th>Função</th><th class="text-right">R$/hora</th><th>Inclui encargos</th><th class="text-right">Taxa efetiva</th><th>Origem</th><th>Referência da fonte</th><th>Data-base</th><th><span class="sr-only">Remover</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(t, i) in taxas" :key="i">
          <td>
            <input class="input py-1 text-xs" :maxlength="MAX_FUNCAO" :aria-label="`Função ${i + 1}`" :value="t.funcao" @input="alterar(i, { funcao: ($event.target as HTMLInputElement).value })" />
          </td>
          <td>
            <input class="input w-24 py-1 text-right text-xs" type="number" min="0" step="0.01" :aria-label="`Taxa por hora: ${t.funcao}`" :value="Number.isNaN(t.valorHora) ? '' : t.valorHora" @input="alterar(i, { valorHora: numero(($event.target as HTMLInputElement).value) })" />
          </td>
          <td class="text-center">
            <input type="checkbox" class="h-4 w-4 accent-amber-500" :aria-label="`Inclui encargos: ${t.funcao}`" :checked="t.incluiEncargos" @change="alterar(i, { incluiEncargos: ($event.target as HTMLInputElement).checked })" />
          </td>
          <td class="text-right tabular-nums">{{ fmtBRLCents(taxaEfetiva(t, encargosSociaisPct)) }}</td>
          <td>
            <select class="input min-w-[12.5rem] py-1 text-xs" :aria-label="`Origem da taxa: ${t.funcao}`" :value="t.origem" @change="alterarOrigem(i, ($event.target as HTMLSelectElement).value)">
              <option v-for="o in ORIGENS_PREMISSA" :key="o" :value="o">{{ ROTULO_ORIGEM_PREMISSA[o] }}</option>
            </select>
          </td>
          <td>
            <input class="input py-1 text-xs" :maxlength="MAX_REFERENCIA" :aria-label="`Referência da taxa: ${t.funcao}`" :value="t.referencia ?? ''" @input="alterarOpcional(i, 'referencia', ($event.target as HTMLInputElement).value)" />
          </td>
          <td>
            <input class="input py-1 text-xs" type="month" :aria-label="`Data-base da taxa: ${t.funcao}`" :value="t.dataReferencia ?? ''" @input="alterarOpcional(i, 'dataReferencia', ($event.target as HTMLInputElement).value)" />
          </td>
          <td>
            <button type="button" class="btn-ghost px-2 py-1" :aria-label="`Remover a função ${t.funcao}`" @click="remover(i)"><Trash2 class="h-3.5 w-3.5" aria-hidden="true" /></button>
          </td>
        </tr>
        <tr v-if="!taxas.length">
          <td colspan="8" class="py-4 text-center text-zinc-500">Nenhuma taxa cadastrada: todas as funções usam a taxa de função não cadastrada.</td>
        </tr>
      </tbody>
    </table>
    <button type="button" class="btn-secondary mt-3" :disabled="taxas.length >= MAX_TAXAS" @click="adicionar"><Plus class="h-3.5 w-3.5" aria-hidden="true" /> Adicionar função</button>
  </div>
</template>
