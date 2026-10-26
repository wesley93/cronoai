<script setup lang="ts">
// Painel "Fechamentos" do EVM (ciclo 00007, SPEC-04): fechar a data de status, a lista imutável com retificações, e as faixas de aviso.
import { computed, ref } from 'vue'
import { Download, History, Lock } from '@lucide/vue'
import SectionCard from '@/components/common/SectionCard.vue'
import { LIMITES_FECHAMENTO, dmy } from '@/lib/fechamentos'
import { downloadText } from '@/lib/download'
import { fmtBRLCents, fmtIndex } from '@/lib/format'
import { dataLocalDeIso } from '@/lib/linhasBase'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import FecharDataStatusDialog from './FecharDataStatusDialog.vue'
import RetificarFechamentoDialog from './RetificarFechamentoDialog.vue'

const project = useProjectStore()
const ui = useUiStore()
const fechando = ref(false)
const retificando = ref<string>()

const efetivos = computed(() => new Set(project.fechamentosEfetivos.map((c) => c.id)))
/** Datas com retificação: o original dessas datas ganha o selo "retificado". */
const retificadas = computed(() => new Set(project.fechamentos.filter((c) => c.tipo === 'retificacao').map((c) => c.dataStatus)))
/** Mais novos primeiro: por data e, na mesma data, a retificação de maior sequência antes. */
const linhas = computed(() => [...project.fechamentos].sort((a, b) => (a.dataStatus < b.dataStatus ? 1 : a.dataStatus > b.dataStatus ? -1 : b.sequencia - a.sequencia)))
const quantidadeFechamentos = computed(() => project.fechamentos.filter((c) => c.tipo === 'fechamento').length)
const indice = (v: number | null) => (v === null ? '—' : fmtIndex(v))
const linhaBaseAtual = (n: number) => project.state.linhasBase.find((i) => i.numero === n)
/** "fechado contra a LB1 de 25/10/2026": a LB pode ter sido sobrescrita depois, e a data diz de qual versão se fala. */
const notaDaLinhaBase = (c: { linhaBase: number; linhaBaseSalvaEm?: string }) => {
  const atual = linhaBaseAtual(c.linhaBase)
  const salva = c.linhaBaseSalvaEm ? ` de ${dataLocalDeIso(c.linhaBaseSalvaEm)}` : ''
  const mudou = c.linhaBaseSalvaEm !== undefined && atual?.salvaEm !== undefined && atual.salvaEm !== c.linhaBaseSalvaEm
  return `fechado contra a LB${c.linhaBase}${salva}${mudou ? `; a LB${c.linhaBase} atual é de ${dataLocalDeIso(atual!.salvaEm!)}` : ''}`
}
/** Exporta o histórico (JSON): as linhas de base e todos os fechamentos e retificações. Só saída: nada é enviado pela rede. */
async function exportarHistorico() {
  const r = await project.exportarHistorico()
  if (!r.ok) {
    ui.notify('error', 'Histórico não exportado', r.erro)
    return
  }
  downloadText(r.nomeArquivo, r.texto, 'application/json')
  ui.notify('success', 'Histórico exportado', `${r.nomeArquivo} · linhas de base e fechamentos desta obra.`)
  for (const a of r.avisos) ui.notify('warning', 'Atenção na exportação do histórico', a)
}
const persistencia = computed(() =>
  project.persistenciaFechamento === 'concedido' ? 'concedido pelo navegador' : project.persistenciaFechamento === 'negado' ? 'negado pelo navegador' : project.persistenciaFechamento === 'indisponivel' ? 'indisponível neste navegador' : '',
)
</script>

<template>
  <SectionCard title="Fechamentos da data de status" subtitle="Registro imutável da obra em cada data: a Curva S usa o EV e o AC gravados, não uma reconstrução" :icon="Lock" body-class="p-0">
    <template #actions>
      <button class="btn-secondary" :disabled="!project.fechamentos.length" data-testid="exportar-historico" @click="exportarHistorico"><Download class="h-3.5 w-3.5" /> Exportar histórico (JSON)</button>
      <button class="btn-primary" :disabled="!project.fechamentosCarregados" data-testid="abrir-fechar" @click="fechando = true">
        <History class="h-3.5 w-3.5" /> Fechar data de status ({{ dmy(project.state.meta.statusDate) }})
      </button>
    </template>

    <div class="space-y-2 border-b border-zinc-200 p-4 text-[12px] dark:border-zinc-800">
      <p class="text-zinc-600 dark:text-zinc-400">
        Registro gerencial; não substitui a medição contratual. Fechado não se edita: para corrigir, use "Retificar" (o original fica e o motivo é registrado).
        {{ quantidadeFechamentos }} de {{ LIMITES_FECHAMENTO.fechamentos }} fechamentos desta obra.
        <span v-if="persistencia" data-testid="persistencia">Armazenamento persistente: {{ persistencia }}.</span>
      </p>
      <p v-if="project.avisoFechamentos" class="rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-amber-800 dark:text-amber-200" role="status" data-testid="aviso-fechamentos">{{ project.avisoFechamentos }}</p>
      <p v-if="project.avisoObraMudouDepoisDoFechamento" class="rounded-md border border-amber-400/40 bg-amber-400/[0.06] px-3 py-1.5 text-amber-800 dark:text-amber-200" role="status" data-testid="aviso-obra-mudou">{{ project.avisoObraMudouDepoisDoFechamento }}</p>
    </div>

    <div v-if="linhas.length" class="max-h-[360px] overflow-auto">
      <table class="table-base" data-testid="lista-fechamentos">
        <thead>
          <tr><th>Data</th><th>Tipo</th><th class="text-right">PV</th><th class="text-right">EV</th><th class="text-right">AC</th><th class="text-right">SPI</th><th class="text-right">CPI</th><th>Linha de base</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="c in linhas" :key="c.id" :class="efetivos.has(c.id) ? '' : 'text-zinc-500'">
            <td class="tabular-nums">{{ dmy(c.dataStatus) }}<div class="text-[10.5px] text-zinc-500">nº {{ c.sequencia }}</div></td>
            <td>
              <span v-if="c.tipo === 'retificacao'" class="chip-info">Retificação</span>
              <span v-else class="chip-neutral">Fechamento</span>
              <span v-if="c.tipo === 'fechamento' && retificadas.has(c.dataStatus)" class="chip-warn ml-1">retificado</span>
              <span v-if="efetivos.has(c.id)" class="chip-ok ml-1">efetivo</span>
              <div v-if="c.motivo" class="mt-0.5 max-w-[260px] text-[10.5px] text-zinc-500">Motivo: {{ c.motivo }}</div>
              <div v-if="c.autor" class="text-[10.5px] text-zinc-500">Autor declarado: {{ c.autor }}</div>
            </td>
            <td class="text-right tabular-nums">{{ fmtBRLCents(c.totais.pv) }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCents(c.totais.ev) }}</td>
            <td class="text-right tabular-nums">{{ fmtBRLCents(c.totais.ac) }}</td>
            <td class="text-right tabular-nums">{{ indice(c.totais.spi) }}</td>
            <td class="text-right tabular-nums">{{ indice(c.totais.cpi) }}</td>
            <td class="text-[11px]">LB{{ c.linhaBase }}<div class="text-[10.5px] text-zinc-500">{{ notaDaLinhaBase(c) }}</div></td>
            <td class="text-right">
              <button v-if="efetivos.has(c.id)" class="btn-secondary" :data-testid="`retificar-${c.sequencia}`" @click="retificando = c.id">Retificar</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="px-5 py-8 text-center text-xs text-zinc-500" data-testid="sem-fechamentos">
      {{ project.fechamentosCarregados ? 'Esta obra ainda não tem fechamentos: a Curva S usa o histórico reconstruído linearmente.' : 'Lendo os fechamentos desta obra…' }}
    </p>

    <FecharDataStatusDialog v-if="fechando" @fechar="fechando = false" />
    <RetificarFechamentoDialog v-if="retificando" :fechamento-id="retificando" @fechar="retificando = undefined" />
  </SectionCard>
</template>
