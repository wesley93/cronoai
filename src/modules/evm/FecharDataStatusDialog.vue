<script setup lang="ts">
// Fechar a data de status (ciclo 00007, SPEC-04): prévia dos totais, autor declarado, observação e os avisos que não bloqueiam (E-8).
import { computed, ref } from 'vue'
import ModalBase from '@/components/common/ModalBase.vue'
import { LIMITES_FECHAMENTO, dmy } from '@/lib/fechamentos'
import { fmtBRLCents, fmtIndex } from '@/lib/format'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits<{ fechar: [] }>()
const project = useProjectStore()
const ui = useUiStore()

const previa = computed(() => project.previaFechamento())
// O autor é um texto declarado (ainda não há login, SPEC-02), pré-preenchido com o responsável da obra
const autor = ref(project.state.meta.manager)
const observacao = ref('')
const salvando = ref(false)
const erro = ref('')
const avisosDoResultado = ref<string[]>([])
const gravado = ref(false)

async function confirmar() {
  erro.value = ''
  salvando.value = true
  try {
    const r = await project.fecharDataDeStatus({ autor: autor.value, observacao: observacao.value })
    if (!r.ok) {
      erro.value = r.erro
      return
    }
    ui.notify('success', 'Data de status fechada', `Fechamento de ${dmy(previa.value.dataStatus)} gravado. Ele é imutável: para corrigir, use "Retificar".`)
    for (const a of r.avisos) ui.notify('warning', 'Atenção no fechamento', a)
    avisosDoResultado.value = r.avisos
    gravado.value = true
    emit('fechar')
  } finally {
    salvando.value = false
  }
}
const indice = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtIndex(v))
</script>

<template>
  <ModalBase :titulo="`Fechar data de status (${dmy(previa.dataStatus)})`" @fechar="emit('fechar')">
    <form class="space-y-4" novalidate @submit.prevent="confirmar">
      <p class="text-[12px] text-zinc-600 dark:text-zinc-400">
        Grava um registro <strong>imutável</strong> da obra nesta data: % físico, custo real, BAC, PV, datas reais e previstas, folga e criticidade de cada tarefa, e os totais.
        Medido contra a linha de base <strong>LB{{ previa.linhaBase }}</strong> do valor agregado.
      </p>
      <p class="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11.5px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
        Registro gerencial; não substitui a medição contratual. O histórico fica só neste navegador: exporte o JSON de tempos em tempos.
      </p>
      <div v-if="previa.erro" class="rounded-md border border-coral-500/40 bg-coral-500/10 px-3 py-2 text-[12px] text-coral-700 dark:text-coral-300" role="alert" data-testid="fechar-erro">{{ previa.erro }}</div>
      <table v-else-if="previa.totais" class="table-base" data-testid="previa-fechamento">
        <thead><tr><th>BAC</th><th>PV</th><th>EV</th><th>AC</th><th>SPI</th><th>CPI</th><th>Entrega prevista</th></tr></thead>
        <tbody>
          <tr>
            <td class="tabular-nums">{{ fmtBRLCents(previa.totais.bac) }}</td>
            <td class="tabular-nums">{{ fmtBRLCents(previa.totais.pv) }}</td>
            <td class="tabular-nums">{{ fmtBRLCents(previa.totais.ev) }}</td>
            <td class="tabular-nums">{{ fmtBRLCents(previa.totais.ac) }}</td>
            <td class="tabular-nums">{{ indice(previa.totais.spi) }}</td>
            <td class="tabular-nums">{{ indice(previa.totais.cpi) }}</td>
            <td class="tabular-nums">{{ dmy(previa.totais.entregaPrevista) }} ({{ previa.totais.atrasoDiasUteis > 0 ? '+' : '' }}{{ previa.totais.atrasoDiasUteis }} d.u.)</td>
          </tr>
        </tbody>
      </table>
      <ul v-if="previa.avisos.length" class="space-y-1" data-testid="avisos-fechamento">
        <li v-for="a in previa.avisos" :key="a" class="rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-[12px] text-amber-800 dark:text-amber-200" role="status">{{ a }}</li>
      </ul>
      <div>
        <label class="label" for="fech-autor">Autor (texto declarado)</label>
        <input id="fech-autor" v-model="autor" class="input" :maxlength="LIMITES_FECHAMENTO.autor" autocomplete="off" />
        <p class="mt-1 text-[11px] text-zinc-500">O CronoAI ainda não tem login: o autor é só um texto informado por quem fecha (opcional).</p>
      </div>
      <div>
        <label class="label" for="fech-obs">Observação (opcional)</label>
        <textarea id="fech-obs" v-model="observacao" class="input" rows="2" :maxlength="LIMITES_FECHAMENTO.observacao" />
      </div>
      <p v-if="erro" class="text-[12px] text-coral-600 dark:text-coral-400" role="alert">{{ erro }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('fechar')">Cancelar</button>
        <button type="submit" class="btn-primary" :disabled="!!previa.erro || salvando || gravado">{{ salvando ? 'Gravando…' : 'Fechar data de status' }}</button>
      </div>
    </form>
  </ModalBase>
</template>
