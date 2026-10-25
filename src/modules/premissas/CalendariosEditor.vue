<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarPlus, Trash2 } from '@lucide/vue'
import type { PreviaImpacto as PreviaImpactoTipo } from '@/types/previas'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { MAX_CALENDARIOS, MAX_NOME_CALENDARIO, resumoJornadaSemana } from '@/lib/calendarioTrabalho'
import ExcecoesCalendario from './ExcecoesCalendario.vue'
import JornadaSemana from './JornadaSemana.vue'
import PreviaImpacto from './PreviaImpacto.vue'

const project = useProjectStore()
const ui = useUiStore()

const selecionado = ref(project.state.calendarioPadraoUid)
const calendario = computed(() => project.state.calendarios.find((c) => c.uid === selecionado.value) ?? project.state.calendarios[0])
const ehPadrao = computed(() => calendario.value.uid === project.state.calendarioPadraoUid)
const emUso = computed(() => project.state.tasks.filter((t) => t.calendarioUid === calendario.value.uid).length)

// ---------------------------------------------------------------- criar, renomear e excluir
const novoNome = ref('')
const copiarDe = ref(project.state.calendarioPadraoUid)
const erroNovo = ref('')

function criar() {
  const r = project.criarCalendario({ nome: novoNome.value, copiarDeUid: copiarDe.value })
  if (!r.ok) {
    erroNovo.value = r.erro
    return
  }
  erroNovo.value = ''
  novoNome.value = ''
  selecionado.value = r.uid
  ui.notify('success', 'Calendário criado', 'Ajuste a jornada e as exceções e atribua o calendário às tarefas na EAP.')
}

const nomeEdicao = ref('')
watch(() => calendario.value.uid, () => (nomeEdicao.value = calendario.value.nome), { immediate: true })
function renomear() {
  const r = project.editarCalendario(calendario.value.uid, { nome: nomeEdicao.value })
  if (!r.ok) ui.notify('error', 'Calendário não renomeado', r.erro)
}

function excluir() {
  const c = calendario.value
  const aviso = emUso.value ? ` As ${emUso.value} tarefa(s) que o usam passarão ao calendário padrão.` : ''
  if (!window.confirm(`Excluir o calendário "${c.nome}"?${aviso}`)) return
  const r = project.excluirCalendario(c.uid, { moverTarefasParaPadrao: true })
  if (!r.ok) {
    ui.notify('error', 'Calendário não excluído', r.erro)
    return
  }
  selecionado.value = project.state.calendarioPadraoUid
  ui.notify('info', 'Calendário excluído', c.nome)
}

// ---------------------------------------------------------------- feriados da obra neste calendário
const previa = ref<PreviaImpactoTipo | undefined>(undefined)
const aplica = computed(() => !!calendario.value.aplicaFeriadosObra)
watch(() => calendario.value.uid, () => (previa.value = undefined))

function verPrevia() {
  previa.value = project.previaAplicarFeriados(calendario.value.uid, !aplica.value)
}

function confirmarFeriados() {
  const aplicar = !aplica.value
  const r = project.aplicarFeriadosObra(calendario.value.uid, aplicar)
  if (!r.ok) {
    ui.notify('error', 'Feriados da obra não alterados', r.erro)
    return
  }
  previa.value = undefined
  ui.notify('success', aplicar ? 'Feriados da obra aplicados' : 'Feriados da obra removidos', `${calendario.value.nome}: datas recalculadas.`)
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <div class="grid gap-3 md:grid-cols-[minmax(220px,1fr)_auto]">
        <div>
          <label class="label" for="cal-selecao">Calendário</label>
          <select id="cal-selecao" v-model="selecionado" class="input">
            <option v-for="c in project.state.calendarios" :key="c.uid" :value="c.uid">{{ c.nome }}{{ c.uid === project.state.calendarioPadraoUid ? ' (padrão da obra)' : '' }}{{ c.origem === 'hora-extra' ? ' (hora extra)' : '' }}</option>
          </select>
        </div>
        <div class="flex items-end gap-2">
          <span class="chip-neutral">{{ emUso }} tarefa(s) atribuída(s)</span>
          <span v-if="aplica" class="chip-ok">Aplica os feriados da obra</span>
          <button type="button" class="btn-danger" :disabled="ehPadrao || calendario.origem === 'hora-extra'" :title="ehPadrao ? 'O calendário padrão não se exclui' : calendario.origem === 'hora-extra' ? 'Sai pelo desfazer do cenário de hora extra' : 'Excluir calendário'" @click="excluir">
            <Trash2 class="h-3.5 w-3.5" aria-hidden="true" /> Excluir
          </button>
        </div>
      </div>
      <p class="text-[11.5px] text-zinc-500">Jornada: {{ resumoJornadaSemana(calendario) }}. Atribua o calendário às tarefas na tabela da EAP (uma a uma ou por pacote).</p>
      <div class="grid gap-3 md:grid-cols-2">
        <form class="flex items-end gap-2" @submit.prevent="renomear">
          <div class="flex-1">
            <label class="label" for="cal-nome">Nome do calendário selecionado</label>
            <input id="cal-nome" v-model="nomeEdicao" class="input" :maxlength="MAX_NOME_CALENDARIO" autocomplete="off" />
          </div>
          <button type="submit" class="btn-secondary" :disabled="nomeEdicao.trim() === calendario.nome">Renomear</button>
        </form>
        <form class="flex items-end gap-2" @submit.prevent="criar">
          <div class="flex-1">
            <label class="label" for="cal-novo">Novo calendário (cópia de outro)</label>
            <input id="cal-novo" v-model="novoNome" class="input" :maxlength="MAX_NOME_CALENDARIO" autocomplete="off" placeholder="Ex.: Concretagem — sábado manhã" />
          </div>
          <select v-model="copiarDe" class="input w-auto" aria-label="Copiar de">
            <option v-for="c in project.state.calendarios" :key="c.uid" :value="c.uid">{{ c.nome }}</option>
          </select>
          <button type="submit" class="btn-primary" :disabled="project.state.calendarios.length >= MAX_CALENDARIOS"><CalendarPlus class="h-3.5 w-3.5" aria-hidden="true" /> Criar</button>
        </form>
      </div>
      <p v-if="erroNovo" role="alert" class="text-xs text-coral-600 dark:text-coral-400">{{ erroNovo }}</p>
    </section>

    <JornadaSemana :calendario="calendario" />

    <ExcecoesCalendario :calendario="calendario" />

    <section class="space-y-3">
      <h3 class="text-sm font-semibold">Feriados da obra neste calendário</h3>
      <p v-if="!aplica" class="text-[12px] text-zinc-500" data-testid="calendario-sem-feriados">
        Este calendário não aplica os feriados da obra (se veio de um arquivo do MS Project, ele foi calculado sem eles). Veja o efeito antes de aplicar.
      </p>
      <p v-else class="text-[12px] text-zinc-500">Este calendário aplica os feriados da obra (nacionais, Carnaval, Corpus Christi e os cadastrados à mão).</p>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="btn-secondary" @click="verPrevia">{{ aplica ? 'Ver a prévia de remover os feriados da obra' : 'Ver a prévia de aplicar os feriados da obra' }}</button>
        <button v-if="previa && previa.erro === undefined" type="button" class="btn-primary" @click="confirmarFeriados">{{ aplica ? 'Remover feriados da obra deste calendário' : 'Aplicar feriados da obra' }}</button>
      </div>
      <PreviaImpacto v-if="previa" :previa="previa" />
    </section>
  </div>
</template>
