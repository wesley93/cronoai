<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CalendarClock, CalendarPlus, Plus, Trash2 } from '@lucide/vue'
import type { IntervaloTrabalho } from '@/types/domain'
import type { PreviaImpacto as PreviaImpactoTipo } from '@/types/previas'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import {
  MAX_CALENDARIOS,
  MAX_DESCRICAO_EXCECAO,
  MAX_INTERVALOS_POR_DIA,
  MAX_NOME_CALENDARIO,
  PREDEFINICOES_JORNADA,
  ROTULO_PREDEFINICAO,
  intervaloDeTextos,
  intervalosDaPredefinicao,
  minutosParaHora,
  predefinicaoDe,
  resumoJornadaSemana,
  type PredefinicaoJornada,
} from '@/lib/calendarioTrabalho'
import { fmtDate } from '@/lib/format'
import PreviaImpacto from './PreviaImpacto.vue'

const project = useProjectStore()
const ui = useUiStore()

// Segunda a domingo (índice da semana do modelo: 0 = domingo)
const DIAS = [
  { i: 1, nome: 'Segunda-feira' },
  { i: 2, nome: 'Terça-feira' },
  { i: 3, nome: 'Quarta-feira' },
  { i: 4, nome: 'Quinta-feira' },
  { i: 5, nome: 'Sexta-feira' },
  { i: 6, nome: 'Sábado' },
  { i: 0, nome: 'Domingo' },
]

const selecionado = ref(project.state.calendarioPadraoUid)
const calendario = computed(() => project.state.calendarios.find((c) => c.uid === selecionado.value) ?? project.state.calendarios[0])
const ehPadrao = computed(() => calendario.value.uid === project.state.calendarioPadraoUid)
const emUso = computed(() => project.state.tasks.filter((t) => t.calendarioUid === calendario.value.uid).length)

// ---------------------------------------------------------------- jornada da semana (rascunho em texto hh:mm)
type IntervaloTexto = { de: string; ate: string }
const semanaTexto = reactive<IntervaloTexto[][]>([[], [], [], [], [], [], []])
const erroJornada = ref('')

const paraTexto = (ivs: readonly IntervaloTrabalho[]): IntervaloTexto[] => ivs.map((iv) => ({ de: minutosParaHora(iv.de), ate: minutosParaHora(iv.ate) }))

function carregar() {
  const c = calendario.value
  for (let d = 0; d < 7; d++) semanaTexto[d] = paraTexto(c.semana[d])
  erroJornada.value = ''
}
watch(() => [calendario.value.uid, JSON.stringify(calendario.value.semana)], carregar, { immediate: true })

/** Intervalos do rascunho do dia em minutos, ou `undefined` se algum horário é inválido. */
function converterDia(d: number): IntervaloTrabalho[] | undefined {
  const out: IntervaloTrabalho[] = []
  for (const t of semanaTexto[d]) {
    const r = intervaloDeTextos(t.de, t.ate)
    if ('erro' in r) return undefined
    out.push(r.intervalo)
  }
  return out
}

const predefinicaoDoDia = (d: number): PredefinicaoJornada | 'personalizado' => {
  const ivs = converterDia(d)
  return (ivs && predefinicaoDe(ivs)) ?? 'personalizado'
}

function escolherPredefinicao(d: number, valor: string) {
  const p = PREDEFINICOES_JORNADA.find((x) => x === valor)
  if (p) semanaTexto[d] = paraTexto(intervalosDaPredefinicao(p))
  else if (!semanaTexto[d].length) semanaTexto[d] = [{ de: '08:00', ate: '12:00' }]
}

function adicionarIntervalo(d: number) {
  if (semanaTexto[d].length < MAX_INTERVALOS_POR_DIA) semanaTexto[d].push({ de: '13:00', ate: '17:00' })
}

function horasDoDia(d: number): string {
  const ivs = converterDia(d)
  if (!ivs) return '—'
  const min = ivs.reduce((a, iv) => a + (iv.ate - iv.de), 0)
  return min === 0 ? '—' : `${(min / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}

function salvarJornada() {
  const semana: IntervaloTrabalho[][] = []
  for (let d = 0; d < 7; d++) {
    const ivs: IntervaloTrabalho[] = []
    for (const t of semanaTexto[d]) {
      const r = intervaloDeTextos(t.de, t.ate)
      if ('erro' in r) {
        erroJornada.value = `${DIAS.find((x) => x.i === d)?.nome}: ${r.erro}`
        return
      }
      ivs.push(r.intervalo)
    }
    semana.push(ivs)
  }
  const r = project.editarCalendario(calendario.value.uid, { semana })
  if (!r.ok) {
    erroJornada.value = r.erro
    return
  }
  erroJornada.value = ''
  ui.notify('success', 'Jornada salva', `${calendario.value.nome}: ${resumoJornadaSemana(calendario.value)}.`)
}

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

// ---------------------------------------------------------------- exceções por data
type TipoExcecao = 'nao-util' | 'quatro-horas' | 'oito-horas' | 'proprio'
const excecao = reactive({ data: '', tipo: 'quatro-horas' as TipoExcecao, de: '08:00', ate: '12:00', descricao: '' })
const erroExcecao = ref('')
const excecoesOrdenadas = computed(() => calendario.value.excecoes)
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
  const r = project.definirExcecao(calendario.value.uid, { data: excecao.data, intervalos, descricao: excecao.descricao })
  if (!r.ok) {
    erroExcecao.value = r.erro
    return
  }
  erroExcecao.value = ''
  Object.assign(excecao, { data: '', descricao: '' })
}

function removerExcecao(data: string) {
  const r = project.removerExcecao(calendario.value.uid, data)
  if (!r.ok) ui.notify('error', 'Exceção não removida', r.erro)
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

    <section class="space-y-3">
      <h3 class="text-sm font-semibold">Jornada por dia da semana</h3>
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr><th>Dia</th><th>Jornada</th><th>Intervalos (hh:mm)</th><th class="text-right">Total</th></tr>
          </thead>
          <tbody>
            <tr v-for="d in DIAS" :key="d.i">
              <td class="font-medium">{{ d.nome }}</td>
              <td>
                <select class="input py-1 text-xs" :aria-label="`Jornada de ${d.nome}`" :value="predefinicaoDoDia(d.i)" @change="escolherPredefinicao(d.i, ($event.target as HTMLSelectElement).value)">
                  <option v-for="p in PREDEFINICOES_JORNADA" :key="p" :value="p">{{ ROTULO_PREDEFINICAO[p] }}</option>
                  <option value="personalizado">Personalizado</option>
                </select>
              </td>
              <td>
                <div class="flex flex-wrap items-center gap-2">
                  <span v-for="(t, k) in semanaTexto[d.i]" :key="k" class="flex items-center gap-1">
                    <input v-model="t.de" class="input w-16 py-1 text-center text-xs" maxlength="5" :aria-label="`${d.nome}: início do intervalo ${k + 1}`" />
                    <span class="text-zinc-400">–</span>
                    <input v-model="t.ate" class="input w-16 py-1 text-center text-xs" maxlength="5" :aria-label="`${d.nome}: fim do intervalo ${k + 1}`" />
                    <button type="button" class="btn-ghost px-1.5 py-1" :aria-label="`Remover o intervalo ${k + 1} de ${d.nome}`" @click="semanaTexto[d.i].splice(k, 1)"><Trash2 class="h-3 w-3" aria-hidden="true" /></button>
                  </span>
                  <button type="button" class="btn-ghost px-1.5 py-1 text-[11px]" :disabled="semanaTexto[d.i].length >= MAX_INTERVALOS_POR_DIA" :aria-label="`Adicionar intervalo em ${d.nome}`" @click="adicionarIntervalo(d.i)"><Plus class="h-3 w-3" aria-hidden="true" /> intervalo</button>
                </div>
              </td>
              <td class="text-right tabular-nums">{{ horasDoDia(d.i) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="text-[11px] text-zinc-500">Até {{ MAX_INTERVALOS_POR_DIA }} intervalos por dia. Fim 00:00 vale 24:00: 00:00–00:00 é o dia inteiro (24 h) e 22:00–00:00 são 2 h.</p>
      <div class="flex flex-wrap items-center gap-3">
        <button type="button" class="btn-primary" @click="salvarJornada"><CalendarClock class="h-3.5 w-3.5" aria-hidden="true" /> Salvar jornada</button>
        <button type="button" class="btn-ghost" @click="carregar">Descartar alterações</button>
      </div>
      <p v-if="erroJornada" role="alert" class="text-xs text-coral-600 dark:text-coral-400">{{ erroJornada }}</p>
    </section>

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
