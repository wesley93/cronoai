<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CalendarOff, Plus, Trash2 } from '@lucide/vue'
import { ABRANGENCIAS_FERIADO, type AbrangenciaFeriado } from '@/types/domain'
import { UFS } from '@/data/ufs'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { MAX_FERIADOS_MANUAIS, MAX_FONTE_FERIADO, MAX_MUNICIPIO_FERIADO, MAX_NOME_FERIADO, validarFeriadoManual } from '@/lib/feriadosObra'
import { fmtDate } from '@/lib/format'

const emit = defineEmits<{ 'ver-calendarios': [] }>()
const project = useProjectStore()
const ui = useUiStore()

const ROTULO_ABRANGENCIA: Record<AbrangenciaFeriado, string> = {
  estadual: 'Estadual',
  municipal: 'Municipal',
  'ponto-facultativo': 'Ponto facultativo',
  paralisacao: 'Paralisação',
  outro: 'Outro',
}

/** Calendários que ainda não aplicam os feriados da obra (migrados, importados): as opções abaixo não os afetam. */
const semFeriadosDaObra = computed(() => project.state.calendarios.filter((c) => !c.aplicaFeriadosObra && c.origem !== 'hora-extra'))

function alternar(campo: 'nacionais' | 'carnaval' | 'corpusChristi', valor: boolean) {
  const r = project.definirConfigFeriados({ [campo]: valor })
  if (!r.ok) ui.notify('error', 'Feriados não alterados', r.erro)
}

const novo = reactive({ data: '', nome: '', abrangencia: 'municipal' as AbrangenciaFeriado, fonte: '', recorrenteAnual: true, uf: '', municipio: '' })
const tentou = ref(false)
const mostraLocal = computed(() => novo.abrangencia === 'estadual' || novo.abrangencia === 'municipal')
const erros = computed(() =>
  validarFeriadoManual(
    {
      data: novo.data,
      nome: novo.nome,
      abrangencia: novo.abrangencia,
      fonte: novo.fonte,
      recorrenteAnual: novo.recorrenteAnual,
      ...(mostraLocal.value && novo.uf ? { uf: UFS.find((u) => u.sigla === novo.uf)?.sigla } : {}),
      ...(novo.abrangencia === 'municipal' && novo.municipio.trim() ? { municipio: novo.municipio.trim() } : {}),
    },
    project.state.feriados.manuais,
  ),
)

function adicionar() {
  tentou.value = true
  if (erros.value.length) return
  const uf = mostraLocal.value && novo.uf ? UFS.find((u) => u.sigla === novo.uf)?.sigla : undefined
  const r = project.adicionarFeriadoManual({
    data: novo.data,
    nome: novo.nome,
    abrangencia: novo.abrangencia,
    fonte: novo.fonte,
    recorrenteAnual: novo.recorrenteAnual,
    ...(uf ? { uf } : {}),
    ...(novo.abrangencia === 'municipal' && novo.municipio.trim() ? { municipio: novo.municipio.trim() } : {}),
  })
  if (!r.ok) {
    ui.notify('error', 'Feriado não cadastrado', r.erro)
    return
  }
  ui.notify('success', 'Feriado cadastrado', 'Vale nos calendários que aplicam os feriados da obra.')
  Object.assign(novo, { data: '', nome: '', fonte: '', municipio: '' })
  tentou.value = false
}

function remover(id: string, nome: string) {
  if (!window.confirm(`Remover o feriado "${nome}"? As datas das tarefas serão recalculadas.`)) return
  const r = project.removerFeriadoManual(id)
  if (!r.ok) ui.notify('error', 'Feriado não removido', r.erro)
}
</script>

<template>
  <div class="space-y-5">
    <section class="space-y-3">
      <h3 class="text-sm font-semibold">Feriados da obra</h3>
      <p class="text-[12px] text-zinc-500">
        Os feriados nacionais são calculados para qualquer ano (o 20/11 só vale a partir de 2024). Vale só para os calendários que aplicam os feriados da obra.
      </p>
      <div class="space-y-2">
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-0.5 h-4 w-4 accent-amber-500" :checked="project.state.feriados.nacionais" @change="alternar('nacionais', ($event.target as HTMLInputElement).checked)" />
          <span>Feriados nacionais <span class="block text-[11px] text-zinc-500">Confraternização, Sexta-feira Santa, Tiradentes, Dia do Trabalho, Independência, Padroeira, Finados, República, Consciência Negra (desde 2024) e Natal.</span></span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-0.5 h-4 w-4 accent-amber-500" :checked="project.state.feriados.carnaval" @change="alternar('carnaval', ($event.target as HTMLInputElement).checked)" />
          <span>Carnaval (segunda e terça) <span class="block text-[11px] text-zinc-500">Ponto facultativo: depende de lei estadual ou municipal (validar).</span></span>
        </label>
        <label class="flex items-start gap-2 text-sm">
          <input type="checkbox" class="mt-0.5 h-4 w-4 accent-amber-500" :checked="project.state.feriados.corpusChristi" @change="alternar('corpusChristi', ($event.target as HTMLInputElement).checked)" />
          <span>Corpus Christi <span class="block text-[11px] text-zinc-500">Ponto facultativo: depende de lei estadual ou municipal (validar).</span></span>
        </label>
      </div>
      <p v-if="semFeriadosDaObra.length" class="flex flex-wrap items-start gap-2 rounded-md bg-amber-400/10 p-2 text-[11.5px] text-amber-800 dark:text-amber-200" data-testid="aviso-sem-feriados">
        <CalendarOff class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          {{ semFeriadosDaObra.length }} calendário(s) não aplicam os feriados da obra (por exemplo, os que vieram de um arquivo do MS Project, calculado sem eles):
          {{ semFeriadosDaObra.map((c) => c.nome).join('; ') }}.
          <button type="button" class="font-semibold underline" @click="emit('ver-calendarios')">Ver a prévia na aba Calendários</button>
        </span>
      </p>
    </section>

    <section class="space-y-3">
      <h3 class="text-sm font-semibold">Feriados estaduais, municipais e paralisações</h3>
      <p class="text-[12px] text-zinc-500">
        Os feriados estaduais e municipais não são carregados automaticamente nesta fase: cadastre cada um com a fonte (lei, decreto ou ato oficial).
      </p>
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr><th>Data</th><th>Nome</th><th>Abrangência</th><th>Local</th><th>Repete</th><th>Fonte</th><th><span class="sr-only">Remover</span></th></tr>
          </thead>
          <tbody>
            <tr v-for="f in project.state.feriados.manuais" :key="f.id">
              <td class="whitespace-nowrap tabular-nums">{{ fmtDate(f.data) }}</td>
              <td>{{ f.nome }}</td>
              <td>{{ ROTULO_ABRANGENCIA[f.abrangencia] }}</td>
              <td>{{ [f.municipio, f.uf].filter(Boolean).join(' / ') || '—' }}</td>
              <td>{{ f.recorrenteAnual ? 'Todo ano' : 'Só nesta data' }}</td>
              <td class="max-w-[260px] truncate" :title="f.fonte">{{ f.fonte }}</td>
              <td><button type="button" class="btn-ghost px-2 py-1" :aria-label="`Remover o feriado ${f.nome}`" @click="remover(f.id, f.nome)"><Trash2 class="h-3.5 w-3.5" aria-hidden="true" /></button></td>
            </tr>
            <tr v-if="!project.state.feriados.manuais.length">
              <td colspan="7" class="py-4 text-center text-zinc-500">Nenhum feriado cadastrado à mão.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="grid gap-3 md:grid-cols-3" novalidate @submit.prevent="adicionar">
        <div>
          <label class="label" for="fer-data">Data</label>
          <input id="fer-data" v-model="novo.data" type="date" class="input" />
        </div>
        <div>
          <label class="label" for="fer-nome">Nome</label>
          <input id="fer-nome" v-model="novo.nome" class="input" :maxlength="MAX_NOME_FERIADO" autocomplete="off" />
        </div>
        <div>
          <label class="label" for="fer-abrangencia">Abrangência</label>
          <select id="fer-abrangencia" v-model="novo.abrangencia" class="input">
            <option v-for="a in ABRANGENCIAS_FERIADO" :key="a" :value="a">{{ ROTULO_ABRANGENCIA[a] }}</option>
          </select>
        </div>
        <div v-if="mostraLocal">
          <label class="label" for="fer-uf">UF (vazio = a da obra)</label>
          <select id="fer-uf" v-model="novo.uf" class="input">
            <option value="">UF da obra</option>
            <option v-for="u in UFS" :key="u.sigla" :value="u.sigla">{{ u.sigla }} · {{ u.nome }}</option>
          </select>
        </div>
        <div v-if="novo.abrangencia === 'municipal'">
          <label class="label" for="fer-municipio">Município (vazio = o da obra)</label>
          <input id="fer-municipio" v-model="novo.municipio" class="input" :maxlength="MAX_MUNICIPIO_FERIADO" autocomplete="off" />
        </div>
        <div class="md:col-span-2">
          <label class="label" for="fer-fonte">Fonte (obrigatória)</label>
          <input id="fer-fonte" v-model="novo.fonte" class="input" :maxlength="MAX_FONTE_FERIADO" autocomplete="off" placeholder="Ex.: lei municipal, decreto, ato da prefeitura" />
        </div>
        <label class="flex items-center gap-2 pt-5 text-sm"><input v-model="novo.recorrenteAnual" type="checkbox" class="h-4 w-4 accent-amber-500" /> Repete todo ano (mesmo dia e mês)</label>
        <div class="flex items-end">
          <button type="submit" class="btn-primary" :disabled="project.state.feriados.manuais.length >= MAX_FERIADOS_MANUAIS"><Plus class="h-3.5 w-3.5" aria-hidden="true" /> Cadastrar feriado</button>
        </div>
      </form>
      <ul v-if="tentou && erros.length" role="alert" class="list-disc space-y-0.5 pl-5 text-xs text-coral-600 dark:text-coral-400">
        <li v-for="e in erros" :key="e">{{ e }}</li>
      </ul>
    </section>
  </div>
</template>
