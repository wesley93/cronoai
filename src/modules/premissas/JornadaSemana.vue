<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { CalendarClock, Plus, Trash2 } from '@lucide/vue'
import type { CalendarioObra, IntervaloTrabalho } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import {
  MAX_INTERVALOS_POR_DIA,
  PREDEFINICOES_JORNADA,
  ROTULO_PREDEFINICAO,
  horasDoDiaTexto,
  intervaloDeTextos,
  intervalosDaPredefinicao,
  minutosDeIntervalos,
  minutosParaHora,
  predefinicaoDe,
  resumoJornadaSemana,
  type PredefinicaoJornada,
} from '@/lib/calendarioTrabalho'

const props = defineProps<{ calendario: CalendarioObra }>()
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

// Rascunho em texto hh:mm
type IntervaloTexto = { de: string; ate: string }
const semanaTexto = reactive<IntervaloTexto[][]>([[], [], [], [], [], [], []])
const erroJornada = ref('')

const paraTexto = (ivs: readonly IntervaloTrabalho[]): IntervaloTexto[] => ivs.map((iv) => ({ de: minutosParaHora(iv.de), ate: minutosParaHora(iv.ate) }))

function carregar() {
  for (let d = 0; d < 7; d++) semanaTexto[d] = paraTexto(props.calendario.semana[d])
  erroJornada.value = ''
}
watch(() => [props.calendario.uid, JSON.stringify(props.calendario.semana)], carregar, { immediate: true })

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

/** Total do dia: "—" se o horário está inválido ou sem expediente. */
function totalDoDia(d: number): string {
  const ivs = converterDia(d)
  return ivs ? horasDoDiaTexto(minutosDeIntervalos(ivs)) : '—'
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
  const r = project.editarCalendario(props.calendario.uid, { semana })
  if (!r.ok) {
    erroJornada.value = r.erro
    return
  }
  erroJornada.value = ''
  ui.notify('success', 'Jornada salva', `${props.calendario.nome}: ${resumoJornadaSemana({ ...props.calendario, semana })}.`)
}
</script>

<template>
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
              <select class="input min-w-[12rem] py-1 text-xs" :aria-label="`Jornada de ${d.nome}`" :value="predefinicaoDoDia(d.i)" @change="escolherPredefinicao(d.i, ($event.target as HTMLSelectElement).value)">
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
            <td class="text-right tabular-nums">{{ totalDoDia(d.i) }}</td>
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
</template>
