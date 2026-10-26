<script setup lang="ts">
// Comparar dois fechamentos (ciclo 00007, RF-04.6): o que avançou, atrasou ou adiantou, mudou de custo, entrou ou saiu, e os Δ dos totais.
import { computed, ref } from 'vue'
import { GitCompare } from '@lucide/vue'
import SectionCard from '@/components/common/SectionCard.vue'
import type { ItemComparado, ResultadoComparacao } from '@/lib/comparacaoFechamentos'
import { dmy } from '@/lib/fechamentos'
import { fmtBRLCents } from '@/lib/format'
import { useProjectStore } from '@/stores/useProjectStore'

const project = useProjectStore()
/** Linhas por categoria na tela (a obra pode ter milhares de tarefas): o total aparece no título. */
const LIMITE = 100

const registros = computed(() => [...project.fechamentos].sort((a, b) => (a.dataStatus < b.dataStatus ? -1 : a.dataStatus > b.dataStatus ? 1 : a.sequencia - b.sequencia)))
const rotulo = (id: string) => {
  const c = project.fechamentos.find((x) => x.id === id)
  return c ? `${dmy(c.dataStatus)} · nº ${c.sequencia} · ${c.tipo === 'retificacao' ? 'retificação' : 'fechamento'}` : ''
}
const idA = ref('')
const idB = ref('')
const resultado = ref<ResultadoComparacao>()
const erro = ref('')
const comparando = ref(false)

async function comparar() {
  erro.value = ''
  resultado.value = undefined
  comparando.value = true
  try {
    const r = await project.compararFechamentosPorId(idA.value, idB.value)
    if (r.ok) resultado.value = r.resultado
    else erro.value = r.erro
  } finally {
    comparando.value = false
  }
}

const nomeDaTarefa = (uid: number) => project.taskByUid.get(uid)?.name ?? '(tarefa que saiu da EAP)'
const sinal = (v: number) => (v > 0 ? '+' : '')
const categorias = computed(() => {
  const r = resultado.value
  if (!r) return []
  return [
    { id: 'avancaram', titulo: 'Avançaram', itens: r.avancaram },
    { id: 'atrasaram', titulo: 'Atrasaram', itens: r.atrasaram },
    { id: 'adiantaram', titulo: 'Adiantaram', itens: r.adiantaram },
    { id: 'custo', titulo: 'Mudaram de custo', itens: r.mudaramDeCusto },
    { id: 'novas', titulo: 'Entraram na obra', itens: r.novas },
    { id: 'removidas', titulo: 'Saíram da obra', itens: r.removidas },
    { id: 'inalteradas', titulo: 'Inalteradas', itens: r.inalteradas },
  ]
})
const detalhe = (id: string, i: ItemComparado): string => {
  if (id === 'avancaram') return `${i.pctA}% → ${i.pctB}% (${sinal(i.deltaPct)}${i.deltaPct} p.p.) · ΔEV ${sinal(i.deltaEv)}${fmtBRLCents(i.deltaEv)}`
  if (id === 'atrasaram' || id === 'adiantaram') return `término previsto ${dmy(i.terminoA!)} → ${dmy(i.terminoB!)} (${sinal(i.deltaTerminoDu)}${i.deltaTerminoDu} d.u.)`
  if (id === 'custo') return `ΔAC ${sinal(i.deltaAc)}${fmtBRLCents(i.deltaAc)} · ΔBAC ${sinal(i.deltaBac)}${fmtBRLCents(i.deltaBac)}`
  if (id === 'novas') return `${i.pctB}% · término previsto ${dmy(i.terminoB!)}`
  if (id === 'removidas') return `${i.pctA}% · término previsto ${dmy(i.terminoA!)}`
  return `${i.pctB}%`
}
</script>

<template>
  <SectionCard title="Comparar fechamentos" subtitle="Escolha dois registros: o mais antigo é comparado com o mais novo" :icon="GitCompare">
    <div v-if="registros.length >= 2" class="space-y-3">
      <div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label class="label" for="comp-a">Fechamento A</label>
          <select id="comp-a" v-model="idA" class="input">
            <option value="">Escolha</option>
            <option v-for="c in registros" :key="c.id" :value="c.id">{{ rotulo(c.id) }}</option>
          </select>
        </div>
        <div>
          <label class="label" for="comp-b">Fechamento B</label>
          <select id="comp-b" v-model="idB" class="input">
            <option value="">Escolha</option>
            <option v-for="c in registros" :key="c.id" :value="c.id">{{ rotulo(c.id) }}</option>
          </select>
        </div>
        <button class="btn-secondary" :disabled="!idA || !idB || comparando" data-testid="comparar" @click="comparar">{{ comparando ? 'Comparando…' : 'Comparar' }}</button>
      </div>
      <p v-if="erro" class="text-[12px] text-coral-600 dark:text-coral-400" role="alert">{{ erro }}</p>

      <div v-if="resultado" class="space-y-3" data-testid="resultado-comparacao">
        <p class="text-[12px] text-zinc-600 dark:text-zinc-400">{{ dmy(resultado.a.dataStatus) }} (nº {{ resultado.a.sequencia }}) → {{ dmy(resultado.b.dataStatus) }} (nº {{ resultado.b.sequencia }})</p>
        <table class="table-base">
          <thead><tr><th></th><th class="text-right">Antes</th><th class="text-right">Depois</th><th class="text-right">Δ</th></tr></thead>
          <tbody>
            <tr v-for="[nome, t] in ([['BAC', resultado.totais.bac], ['PV', resultado.totais.pv], ['EV', resultado.totais.ev], ['AC', resultado.totais.ac]] as const)" :key="nome">
              <td class="font-medium">{{ nome }}</td>
              <td class="text-right tabular-nums">{{ fmtBRLCents(t.a) }}</td>
              <td class="text-right tabular-nums">{{ fmtBRLCents(t.b) }}</td>
              <td class="text-right tabular-nums">{{ sinal(t.delta) }}{{ fmtBRLCents(t.delta) }}</td>
            </tr>
            <tr>
              <td class="font-medium">Entrega prevista</td>
              <td class="text-right tabular-nums">{{ dmy(resultado.a.totais.entregaPrevista) }}</td>
              <td class="text-right tabular-nums">{{ dmy(resultado.b.totais.entregaPrevista) }}</td>
              <td class="text-right tabular-nums">{{ sinal(resultado.deltaEntregaDu) }}{{ resultado.deltaEntregaDu }} d.u.</td>
            </tr>
          </tbody>
        </table>
        <details v-for="c in categorias" :key="c.id" :open="c.id !== 'inalteradas' && c.itens.length > 0" :data-testid="`categoria-${c.id}`">
          <summary class="cursor-pointer text-[12.5px] font-semibold">{{ c.titulo }} ({{ c.itens.length }})</summary>
          <ul class="mt-1 space-y-0.5 pl-4 text-[12px]">
            <li v-for="i in c.itens.slice(0, LIMITE)" :key="i.uid"><span class="mono">{{ i.wbs }}</span> {{ nomeDaTarefa(i.uid) }}: {{ detalhe(c.id, i) }}</li>
            <li v-if="c.itens.length > LIMITE" class="text-zinc-500">e mais {{ c.itens.length - LIMITE }} tarefa(s).</li>
            <li v-if="!c.itens.length" class="text-zinc-500">Nenhuma tarefa.</li>
          </ul>
        </details>
      </div>
    </div>
    <p v-else class="py-10 text-center text-xs text-zinc-500">A comparação precisa de pelo menos dois registros de fechamento.</p>
  </SectionCard>
</template>
