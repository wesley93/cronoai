<script setup lang="ts">
// Retificar um fechamento (ciclo 00007, D-15): corrige o % físico e o custo real de tarefas do fechamento efetivo da data, com motivo obrigatório.
// O original fica intacto, e a retificação não altera a obra atual. Os avisos de incoerência com o fechamento seguinte (E-5) não bloqueiam.
import { computed, onMounted, ref } from 'vue'
import ModalBase from '@/components/common/ModalBase.vue'
import { LIMITES_FECHAMENTO, dmy, retificar, type AlteracaoTarefa } from '@/lib/fechamentos'
import { fmtBRLCents, fmtIndex } from '@/lib/format'
import { parseNumberBR } from '@/lib/sinapiBudget'
import { POS, type CabecalhoFechamento, type DetalheFechamento } from '@/types/fechamento'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ fechamentoId: string }>()
const emit = defineEmits<{ fechar: [] }>()
const project = useProjectStore()
const ui = useUiStore()

/** Linhas mostradas por vez (a obra pode ter milhares de tarefas): o filtro encontra o resto. */
const LIMITE_LINHAS = 200

const base = computed<CabecalhoFechamento | undefined>(() => {
  const alvo = project.fechamentos.find((c) => c.id === props.fechamentoId)
  return alvo ? project.fechamentosEfetivos.find((c) => c.dataStatus === alvo.dataStatus) : undefined
})
const proximo = computed(() => (base.value ? project.fechamentosEfetivos.find((c) => c.dataStatus > base.value!.dataStatus) : undefined))
const detalhe = ref<DetalheFechamento>()
const detalheSeguinte = ref<DetalheFechamento>()
const carregando = ref(true)
const erroDeLeitura = ref('')
const filtro = ref('')
const motivo = ref('')
const edicoes = ref<Record<number, { pct: string; custo: string }>>({})
const erro = ref('')
const salvando = ref(false)

onMounted(async () => {
  if (!base.value) {
    erroDeLeitura.value = 'Fechamento não encontrado nesta obra.'
    carregando.value = false
    return
  }
  detalhe.value = await project.lerDetalhe(base.value.id)
  if (proximo.value) detalheSeguinte.value = await project.lerDetalhe(proximo.value.id)
  if (!detalhe.value) erroDeLeitura.value = 'O detalhe deste fechamento está ilegível: ele não pode ser retificado.'
  carregando.value = false
})

const linhas = computed(() => {
  const q = filtro.value.trim().toLowerCase()
  const todas = (detalhe.value?.tarefas ?? []).filter((t) => !q || `${t[POS.uid]} ${t[POS.wbs]}`.toLowerCase().includes(q))
  return { mostradas: todas.slice(0, LIMITE_LINHAS), total: todas.length }
})

const numero = (v: string): number => parseNumberBR(v) // "1.871.000,50" e "45" valem; "0.82" segue como decimal
/** Alterações digitadas: só as tarefas em que o valor foi mexido. */
const alteracoes = computed<AlteracaoTarefa[]>(() => {
  const out: AlteracaoTarefa[] = []
  for (const [uid, e] of Object.entries(edicoes.value)) {
    const a: AlteracaoTarefa = { uid: Number(uid) }
    if (e.pct.trim() !== '') a.pct = numero(e.pct)
    if (e.custo.trim() !== '') a.custoReal = numero(e.custo)
    if (a.pct !== undefined || a.custoReal !== undefined) out.push(a)
  }
  return out
})

/** Prévia pela mesma função da gravação (a store a confere de novo na vez da fila). */
const previa = computed(() => {
  if (!base.value || !detalhe.value || !alteracoes.value.length) return undefined
  return retificar({
    base: { cabecalho: base.value, detalhe: detalhe.value },
    seguinte: proximo.value && detalheSeguinte.value ? { cabecalho: proximo.value, detalhe: detalheSeguinte.value } : undefined,
    alteracoes: alteracoes.value,
    motivo: motivo.value.trim() || 'prévia',
    id: 'previa',
    sequencia: 0,
    fechadoEm: new Date().toISOString(),
    cabecalhos: project.fechamentos,
  })
})
const indice = (v: number | null | undefined) => (v === null || v === undefined ? '—' : fmtIndex(v))

async function confirmar() {
  erro.value = ''
  if (!base.value) return
  salvando.value = true
  try {
    const r = await project.retificarFechamento({ fechamentoId: base.value.id, alteracoes: alteracoes.value, motivo: motivo.value })
    if (!r.ok) {
      erro.value = r.erro
      return
    }
    ui.notify('success', 'Fechamento retificado', `A retificação de ${dmy(base.value.dataStatus)} é a efetiva; o original foi mantido.`)
    for (const a of r.avisos) ui.notify('warning', 'Atenção na retificação', a)
    emit('fechar')
  } finally {
    salvando.value = false
  }
}

function editar(uid: number, campo: 'pct' | 'custo', valor: string) {
  edicoes.value = { ...edicoes.value, [uid]: { pct: edicoes.value[uid]?.pct ?? '', custo: edicoes.value[uid]?.custo ?? '', [campo]: valor } }
}
</script>

<template>
  <ModalBase :titulo="`Retificar o fechamento de ${base ? dmy(base.dataStatus) : ''}`" largura="max-w-4xl" @fechar="emit('fechar')">
    <p v-if="carregando" class="py-6 text-center text-xs text-zinc-500">Lendo o fechamento…</p>
    <p v-else-if="erroDeLeitura" class="py-6 text-center text-xs text-coral-600 dark:text-coral-400" role="alert">{{ erroDeLeitura }}</p>
    <form v-else-if="base && detalhe" class="space-y-4" novalidate @submit.prevent="confirmar">
      <p class="text-[12px] text-zinc-600 dark:text-zinc-400">
        Corrija o <strong>% físico</strong> e o <strong>custo real</strong> das tarefas. O PV, a entrega, as datas previstas, as folgas e a linha de base ficam os do fechamento
        original ("previsão do fechamento original"). A retificação não altera a obra atual: corrija também a EAP, se o erro continuar nela.
      </p>
      <div>
        <label class="label" for="ret-filtro">Filtrar tarefas (UID ou EAP)</label>
        <input id="ret-filtro" v-model="filtro" class="input" autocomplete="off" />
      </div>
      <div class="max-h-[300px] overflow-auto">
        <table class="table-base">
          <thead><tr><th>UID</th><th>EAP</th><th class="text-right">% físico gravado</th><th class="text-right">Custo real gravado</th><th>Novo %</th><th>Novo custo real (R$)</th></tr></thead>
          <tbody>
            <tr v-for="t in linhas.mostradas" :key="t[POS.uid]" :class="edicoes[t[POS.uid]] ? 'bg-amber-400/10' : ''">
              <td class="mono">{{ t[POS.uid] }}</td>
              <td class="mono">{{ t[POS.wbs] }}</td>
              <td class="text-right tabular-nums">{{ t[POS.pct] }}%</td>
              <td class="text-right tabular-nums">{{ fmtBRLCents(t[POS.custoReal]) }}</td>
              <td><input class="input w-24" inputmode="decimal" :aria-label="`Novo % físico da tarefa ${t[POS.uid]}`" :value="edicoes[t[POS.uid]]?.pct ?? ''" @input="editar(t[POS.uid], 'pct', ($event.target as HTMLInputElement).value)" /></td>
              <td><input class="input w-36" inputmode="decimal" :aria-label="`Novo custo real da tarefa ${t[POS.uid]}`" :value="edicoes[t[POS.uid]]?.custo ?? ''" @input="editar(t[POS.uid], 'custo', ($event.target as HTMLInputElement).value)" /></td>
            </tr>
          </tbody>
        </table>
        <p v-if="linhas.total > linhas.mostradas.length" class="px-2 py-1 text-[11px] text-zinc-500">Mostrando {{ linhas.mostradas.length }} de {{ linhas.total }} tarefas: use o filtro.</p>
      </div>
      <div>
        <label class="label" for="ret-motivo">Motivo da retificação (obrigatório)</label>
        <textarea id="ret-motivo" v-model="motivo" class="input" rows="2" :maxlength="LIMITES_FECHAMENTO.motivo" />
      </div>
      <div v-if="previa && previa.ok" class="rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-700" data-testid="previa-retificacao">
        <div class="eyebrow mb-1">Totais depois da retificação</div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <div>EV <strong class="tabular-nums">{{ fmtBRLCents(previa.cabecalho.totais.ev) }}</strong><div class="text-[10.5px] text-zinc-500">antes {{ fmtBRLCents(base.totais.ev) }}</div></div>
          <div>AC <strong class="tabular-nums">{{ fmtBRLCents(previa.cabecalho.totais.ac) }}</strong><div class="text-[10.5px] text-zinc-500">antes {{ fmtBRLCents(base.totais.ac) }}</div></div>
          <div>SPI <strong class="tabular-nums">{{ indice(previa.cabecalho.totais.spi) }}</strong></div>
          <div>CPI <strong class="tabular-nums">{{ indice(previa.cabecalho.totais.cpi) }}</strong></div>
          <div>EAC <strong class="tabular-nums">{{ previa.cabecalho.totais.eac === null ? '—' : fmtBRLCents(previa.cabecalho.totais.eac) }}</strong></div>
        </div>
      </div>
      <ul v-if="previa && previa.ok && previa.avisos.length" class="space-y-1" data-testid="avisos-retificacao">
        <li v-for="a in previa.avisos" :key="a" class="rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-[12px] text-amber-800 dark:text-amber-200" role="status">{{ a }}</li>
      </ul>
      <p v-if="erro" class="text-[12px] text-coral-600 dark:text-coral-400" role="alert">{{ erro }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn-secondary" @click="emit('fechar')">Cancelar</button>
        <button type="submit" class="btn-primary" :disabled="salvando || !alteracoes.length">{{ salvando ? 'Gravando…' : 'Gravar retificação' }}</button>
      </div>
    </form>
  </ModalBase>
</template>
