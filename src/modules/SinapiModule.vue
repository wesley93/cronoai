<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Calculator, ListPlus, Users, Timer, ExternalLink, Trash2, GitCommitHorizontal, KeyRound, TableProperties } from '@lucide/vue'
import type { LinkType } from '@/types/domain'
import { RESOURCE_KINDS } from '@/types/domain'
import type { EquipeProporcional, FuncaoMaoDeObra } from '@/types/sinapi'
import { useProjectStore, type SinapiInsert } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import BudgetSheet from './sinapi/BudgetSheet.vue'
import BuscaComposicao from './sinapi/BuscaComposicao.vue'
import { SINAPI_CATALOG, SINAPI_REFERENCE_URL } from '@/data/sinapiCatalog'
import { horasPorDia } from '@/lib/calendarioTrabalho'
import { custoMaoDeObraPorHorasAlocadas, durationFromTeam, scheduleDays, teamFromDuration, totalManHours } from '@/lib/sinapi'
import { custoMaoDeObraPorFuncao, equipeDaComposicao, horasDeSupervisao, recursosDaEquipe, type ValoresInformados } from '@/lib/sinapiRup'
import { itemCatalogoDoRecorte } from '@/lib/recorteSinapi'
import type { ComposicaoRecorte } from '@/types/sinapi'
import { rateOf } from '@/lib/scenarios'
import { taxaCadastrada, taxaHora } from '@/lib/premissas'
import { fmtBRLCents, fmtDate, fmtDiasUteis, fmtNum } from '@/lib/format'
import { descreverTabelaSinapi } from '@/lib/obras'
import { LIMITES_LINHA, erroDeValorDaLinha, marcarFonteAlterada } from '@/lib/sinapiBudget'

const project = useProjectStore()
const ui = useUiStore()
const tabelaSinapi = computed(() => descreverTabelaSinapi(project.state.meta))

// Com o recorte da obra (UF, regime e data-base), a composição vem dele: custo e RUP publicados e equipe por função.
// Sem recorte, o catálogo ilustrativo de sempre, com o aviso (Inviolável 7).
const recorte = computed(() => project.recorteAtual)
const usaRecorte = computed(() => !!recorte.value)

const catalogIdx = ref(0)
const item = reactive<{
  code: string
  description: string
  unit: string
  rup: number
  professional: string
  helperRatio: number
  unitCost: number
  group: string
  equipe: EquipeProporcional[] | undefined
  fonte: string | undefined
}>({ ...SINAPI_CATALOG[0], equipe: undefined, fonte: undefined })
/** Mão de obra da composição escolhida no recorte (para o custo por função e a supervisão nas notas). */
const maoDeObra = ref<readonly FuncaoMaoDeObra[]>([])
const quantity = ref(SINAPI_CATALOG[0].sampleQuantity)
const mode = ref<'equipe' | 'prazo'>('equipe')
const team = ref(6)
const desiredDays = ref(30)

function usarCatalogo(i: number) {
  const c = SINAPI_CATALOG[i]
  Object.assign(item, c, { equipe: undefined, fonte: undefined })
  maoDeObra.value = []
  quantity.value = c.sampleQuantity
  taskName.value = c.description
  parentWbs.value = groups.value.some((g) => g.wbs === c.group) ? c.group : groups.value[0]?.wbs ?? ''
}

function limparItem() {
  Object.assign(item, { code: '', description: '', unit: 'm²', rup: 0, professional: 'Pedreiro', helperRatio: 0, unitCost: 0, group: '09', equipe: undefined, fonte: undefined })
  maoDeObra.value = []
  quantity.value = 100
  taskName.value = ''
}

watch(catalogIdx, (i) => {
  if (i >= 0 && !usaRecorte.value) usarCatalogo(i)
})

function selecionarDoRecorte(c: ComposicaoRecorte) {
  const r = recorte.value
  if (!r) return
  const it = itemCatalogoDoRecorte(c, r.recorte)
  Object.assign(item, { code: it.code, description: it.description, unit: it.unit, rup: it.rup, professional: it.professional, helperRatio: 0, unitCost: it.unitCost, group: it.group, equipe: it.equipe, fonte: it.fonte })
  maoDeObra.value = c.maoDeObra
  taskName.value = it.description
  parentWbs.value = groups.value.some((g) => g.wbs === it.group) ? it.group : groups.value[0]?.wbs ?? ''
}

// O módulo fica montado (KeepAlive): importar, substituir ou remover o recorte, ou trocar de obra, muda a ORIGEM da composição. A identidade
// (fonte + SHA-256) muda mesmo com recorte nos dois lados (obra A em SP → obra B em BA): a composição com o custo de lá sai da tela.
const identidadeRecorte = computed(() => (recorte.value ? `${recorte.value.fonte}|${recorte.value.sha256Origem}` : ''))
watch(identidadeRecorte, (nova) => {
  if (nova) limparItem()
  else usarCatalogo(catalogIdx.value >= 0 ? catalogIdx.value : 0)
})

// Jornada da obra: minutos por dia ÷ 60 (480 → 8 h), a mesma fonte do crashing (D-18)
const horas = computed(() => horasPorDia(project.minutosPorDia))
const hh = computed(() => totalManHours(quantity.value, item.rup))
const rawDuration = computed(() => (mode.value === 'equipe' ? durationFromTeam(quantity.value, item.rup, team.value, horas.value) : desiredDays.value))
const officials = computed(() => (mode.value === 'equipe' ? team.value : Math.max(1, Math.ceil(teamFromDuration(quantity.value, item.rup, desiredDays.value, horas.value) - 1e-9))))
const rawTeamForDuration = computed(() => teamFromDuration(quantity.value, item.rup, desiredDays.value, horas.value))
const days = computed(() => (mode.value === 'equipe' ? scheduleDays(rawDuration.value) : scheduleDays(durationFromTeam(quantity.value, item.rup, officials.value, horas.value))))
const helpers = computed(() => Math.ceil(officials.value * item.helperRatio - 1e-9))
/** Recursos da equipe: por função quando a composição é do recorte; senão o oficial e o servente pelo `helperRatio` (como antes). */
const recursos = computed(() =>
  item.equipe
    ? recursosDaEquipe(item.professional, officials.value, item.equipe)
    : [
        { resource: item.professional, units: officials.value },
        { resource: 'Servente', units: helpers.value },
      ],
)
/** Supervisão (engenheiro, encarregado): não vira recurso; vai às notas como administração local. */
const supervisao = computed(() => horasDeSupervisao(quantity.value, maoDeObra.value.length ? (equipeDaComposicao(maoDeObra.value)?.supervisao ?? []) : []))
const bac = computed(() => quantity.value * item.unitCost)
// Custo de mão de obra ESTIMADO (ilustrativo: taxas das premissas da obra). Com mão de obra do recorte: Σ quantidade × coeficiente × taxa por função (D-21)
const custoPorFuncao = computed(() =>
  maoDeObra.value.length
    ? custoMaoDeObraPorFuncao(
        quantity.value,
        maoDeObra.value,
        (rotulo) => taxaHora(project.premissasVigentes, rotulo),
        (rotulo) => taxaCadastrada(project.premissasVigentes, rotulo),
      )
    : undefined,
)
const laborCost = computed(
  () =>
    custoPorFuncao.value?.total ??
    custoMaoDeObraPorHorasAlocadas({
      hh: hh.value,
      dias: days.value,
      horasPorDia: horas.value,
      serventes: helpers.value,
      taxaOficial: rateOf(project.premissasVigentes, item.professional),
      taxaServente: rateOf(project.premissasVigentes, 'Servente'),
    }),
)
/** Como o custo estimado é calculado (aparece na tela): por coeficiente da composição (recorte) ou por horas alocadas (catálogo). */
const metodoCusto = computed(() => (custoPorFuncao.value ? 'por coeficiente da composição' : 'por horas alocadas'))
const foraDasTaxas = computed(() => [...new Set((custoPorFuncao.value?.funcoes ?? []).filter((f) => f.foraDasTaxas).map((f) => f.rotulo))])
const dailyOutput = computed(() => (days.value ? quantity.value / days.value : 0))

// Inserção na EAP
const groups = computed(() => project.tasksByWbs.filter((t) => t.isSummary && t.outlineLevel === 1))
const parentWbs = ref(SINAPI_CATALOG[0].group)
const newGroup = ref(false)
const newGroupName = ref('Serviços complementares (SINAPI)')
const taskName = ref(SINAPI_CATALOG[0].description)
const linkType = ref<LinkType>('FS')
const lagDays = ref(0)
const predecessorUid = ref<number | undefined>()

watch(
  [parentWbs, newGroup],
  () => {
    predecessorUid.value = newGroup.value ? project.leaves.at(-1)?.uid : project.suggestPredecessorFor(parentWbs.value)
  },
  { immediate: true },
)

if (usaRecorte.value) limparItem()

const input = computed<SinapiInsert>(() => ({
  name: taskName.value.trim() || item.description,
  code: item.code,
  unit: item.unit,
  quantity: quantity.value,
  unitCost: item.unitCost,
  durationDays: days.value,
  resources: recursos.value,
  parentWbs: parentWbs.value,
  newGroupName: newGroup.value ? newGroupName.value.trim() || 'Serviços complementares' : undefined,
  predecessorUid: predecessorUid.value,
  linkType: linkType.value,
  lagDays: lagDays.value,
  fonte: fonteEfetiva.value,
  maoDeObra: item.fonte ? maoDeObra.value : undefined,
  informado: informado.value,
}))
/** Quantidade, custo e RUP precisam ser finitos e ficar nos tetos (`LIMITES_LINHA`): senão o BAC viraria infinito. */
const erroDeLimite = computed(() => erroDeValorDaLinha('quantity', quantity.value) ?? (item.unitCost > 0 ? erroDeValorDaLinha('unitCost', item.unitCost) : undefined) ?? (item.rup > 0 ? erroDeValorDaLinha('rup', item.rup) : undefined))
const valid = computed(() => !erroDeLimite.value && !!item.code && quantity.value > 0 && item.rup > 0 && days.value > 0 && Number.isFinite(days.value) && days.value <= 2000)
const preview = computed(() => (valid.value ? project.previewSinapiTask(input.value) : undefined))
const generated = computed(() => project.leaves.filter((t) => t.notes?.startsWith('Gerado pelo CronoAI')))
/** Composição do recorte SEM mão de obra publicada: a RUP é a que o usuário digitou, e a fonte e as notas dizem isso. */
const fonteEfetiva = computed(() => (item.fonte && !item.equipe ? marcarFonteAlterada(item.fonte) : item.fonte))
const informado = computed<ValoresInformados | undefined>(() => (item.fonte && !item.equipe ? { rup: item.rup, profissional: item.professional } : undefined))
const textoEquipe = computed(() => recursos.value.filter((r) => r.units > 0).map((r) => `${r.resource} ${r.units}`).join(' + '))

function addToSheet() {
  if (!valid.value) {
    ui.notify('warning', 'Dados incompletos', 'Informe quantidade, RUP e equipe/prazo válidos.')
    return
  }
  project.addBudgetLine({
    code: item.code,
    description: item.description,
    location: taskName.value.trim() !== item.description ? taskName.value.replace(item.description, '').replace(/^\s*—\s*/, '').trim() : '',
    unit: item.unit,
    quantity: quantity.value,
    rup: item.rup,
    unitCost: item.unitCost,
    professional: item.professional,
    helperRatio: item.helperRatio,
    team: officials.value,
    group: newGroup.value ? '99' : parentWbs.value,
    ...(item.equipe ? { equipe: item.equipe.map((e) => ({ ...e })) } : {}),
    ...(fonteEfetiva.value ? { fonte: fonteEfetiva.value } : {}),
  })
  ui.notify('success', 'Linha adicionada à planilha', `${item.code} · ${days.value} d.u. com ${officials.value} oficial(is).`)
}

function add() {
  if (!valid.value) {
    ui.notify('warning', 'Dados incompletos', 'Informe quantidade, RUP e equipe/prazo válidos.')
    return
  }
  const res = project.addSinapiTask(input.value)
  if (!res.ok) {
    ui.notify('error', 'Pacote não adicionado', res.erro)
    return
  }
  const t = res.task
  ui.notify('success', `Pacote adicionado: [UID ${t.uid}] ${t.wbs}`, `${fmtDiasUteis(t.duracaoMin, project.minutosPorDia)} dias úteis · ${textoEquipe.value} · vínculo ${linkType.value}.`)
}

/** Função principal em minúsculas, para a legenda do controle de equipe. */
const profissionalMinusculo = computed(() => item.professional.toLowerCase())
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Dor 4"
      title="Gerador de Cronograma via Orçamento SINAPI"
      description="Dimensione duração e equipe a partir do quantitativo e da produtividade (RUP) e insira o pacote de trabalho já vinculado na EAP do MS Project."
    >
      <a :href="SINAPI_REFERENCE_URL" target="_blank" rel="noopener noreferrer" class="btn-ghost"><ExternalLink class="h-3.5 w-3.5" /> Tabela SINAPI oficial (Caixa)</a>
    </ModuleHeader>

    <div class="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <SectionCard :title="usaRecorte ? 'Composição do recorte SINAPI e produtividade' : 'Item de orçamento e produtividade'" :subtitle="usaRecorte ? `Busque na tabela ${recorte?.fonte ?? ''}` : 'Selecione do catálogo ou edite livremente'" :icon="Calculator">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <BuscaComposicao v-if="usaRecorte" :selecionado="item.code" @selecionar="selecionarDoRecorte" />
            <template v-else>
              <label class="label">Composição SINAPI</label>
              <select v-model.number="catalogIdx" class="input">
                <option v-for="(c, i) in SINAPI_CATALOG" :key="c.code" :value="i">{{ c.code }} — {{ c.description }} ({{ c.unit }})</option>
              </select>
            </template>
          </div>
          <p v-if="usaRecorte && !item.code" class="sm:col-span-2 text-[12px] text-zinc-500" data-testid="sem-composicao">Escolha uma composição na busca para dimensionar o pacote.</p>
          <div v-if="usaRecorte && item.code" class="sm:col-span-2 rounded-lg bg-zinc-50 p-3 text-[12px] dark:bg-zinc-800/60" data-testid="composicao-escolhida">
            <span class="font-mono font-semibold">{{ item.code }}</span> — {{ item.description }}
          </div>
          <div>
            <label class="label">Código SINAPI</label>
            <input v-model="item.code" class="input font-mono" maxlength="12" :readonly="usaRecorte" />
          </div>
          <div>
            <label class="label">Unidade</label>
            <input v-if="usaRecorte" :value="item.unit" class="input" readonly aria-label="Unidade (vem do recorte)" />
            <select v-else v-model="item.unit" class="input"><option v-for="u in ['m²', 'm³', 'kg', 'm', 'un']" :key="u">{{ u }}</option></select>
          </div>
          <div>
            <label class="label">Quantidade total ({{ item.unit }})</label>
            <input v-model.number="quantity" type="number" min="0" :max="LIMITES_LINHA.quantity" step="any" class="input tabular-nums" data-testid="quantidade" />
          </div>
          <div>
            <label class="label">Produtividade — RUP (HH/{{ item.unit }})</label>
            <input v-model.number="item.rup" type="number" min="0" step="0.005" class="input tabular-nums" :readonly="!!item.equipe" data-testid="rup" />
          </div>
          <div>
            <label class="label">Profissional principal</label>
            <input v-if="item.equipe" :value="item.professional" class="input" readonly aria-label="Profissional principal (vem do recorte)" />
            <select v-else v-model="item.professional" class="input"><option v-for="r in RESOURCE_KINDS" :key="r">{{ r }}</option></select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div v-if="!item.equipe">
              <label class="label">Serventes/oficial</label>
              <input v-model.number="item.helperRatio" type="number" min="0" step="0.05" class="input tabular-nums" />
            </div>
            <div :class="item.equipe ? 'col-span-2' : ''">
              <label class="label">Custo unit. (R$)</label>
              <input v-model.number="item.unitCost" type="number" min="0" step="0.01" class="input tabular-nums" :readonly="usaRecorte && !!item.fonte" data-testid="custo-unitario" />
            </div>
          </div>
        </div>

        <!-- Dimensionamento -->
        <div class="mt-5 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="mb-3 flex rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
            <button class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5" :class="mode === 'equipe' ? 'bg-amber-400 font-semibold text-zinc-950' : 'text-zinc-500'" @click="mode = 'equipe'">
              <Users class="h-3.5 w-3.5" /> Definir tamanho da equipe
            </button>
            <button class="flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5" :class="mode === 'prazo' ? 'bg-amber-400 font-semibold text-zinc-950' : 'text-zinc-500'" @click="mode = 'prazo'">
              <Timer class="h-3.5 w-3.5" /> Definir duração desejada
            </button>
          </div>
          <div v-if="mode === 'equipe'">
            <div class="flex items-center justify-between text-xs"><span class="text-zinc-500">Nº de {{ profissionalMinusculo }}s</span><span class="text-lg font-semibold tabular-nums" data-testid="equipe-valor">{{ team }}</span></div>
            <input v-model.number="team" type="range" min="1" max="40" class="w-full" aria-label="Tamanho da equipe" />
          </div>
          <div v-else>
            <div class="flex items-center justify-between text-xs"><span class="text-zinc-500">Duração desejada (dias úteis)</span><span class="text-lg font-semibold tabular-nums">{{ desiredDays }}</span></div>
            <input v-model.number="desiredDays" type="range" min="1" max="250" class="w-full" aria-label="Duração desejada" />
            <p class="text-[11px] text-zinc-500">Equipe teórica necessária: {{ fmtNum(rawTeamForDuration) }} → {{ officials }} {{ profissionalMinusculo }}(s)</p>
          </div>

          <div class="mt-4 overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 font-mono text-[12px] text-zinc-300 dark:bg-black/50">
            <div class="text-zinc-500">// Duração = (Quantidade × Coeficiente_HH) / (Equipe × {{ fmtNum(horas) }} horas por dia)</div>
            <div class="mt-1 whitespace-nowrap">
              Duração = (<span class="text-amber-300">{{ fmtNum(quantity) }} {{ item.unit }}</span> × <span class="text-amber-300">{{ item.rup.toString().replace('.', ',') }} HH/{{ item.unit }}</span>) / (<span class="text-sky-300">{{ officials }}</span> × {{ fmtNum(horas) }} h)
              = <span class="text-white">{{ fmtNum(durationFromTeam(quantity, item.rup, officials, horas)) }}</span> → <span class="font-bold text-emerald-400" data-testid="dias-uteis">{{ days }} dias úteis</span> (de {{ fmtNum(horas) }} h)
            </div>
            <div v-if="preview && preview.erro === undefined" class="mt-1 whitespace-nowrap text-zinc-400" data-testid="termino-cpm">
              término pelo CPM: <span class="text-white">{{ fmtDate(preview.finish) }}</span>
            </div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Homem-hora</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ fmtNum(hh) }} HH</div></div>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Duração</div><div class="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ days }} d.u.</div><div class="text-[10px] text-zinc-500" data-testid="duracao-jornada">(de {{ fmtNum(horas) }} h)</div></div>
          <div v-if="item.equipe" class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Equipe</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ recursos.map((r) => r.units).join(' + ') }}</div><div class="text-[10px] text-zinc-500">por função (abaixo)</div></div>
          <div v-else class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Equipe</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ officials }} + {{ helpers }}</div><div class="text-[10px] text-zinc-500">oficiais + serventes</div></div>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Produção</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ fmtNum(dailyOutput) }}</div><div class="text-[10px] text-zinc-500">{{ item.unit }}/dia</div></div>
        </div>
        <div v-if="item.equipe" class="mt-3 rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-800" data-testid="equipe-por-funcao">
          <div><span class="text-zinc-500">Equipe por função:</span> <strong>{{ textoEquipe }}</strong></div>
          <div v-if="supervisao.length" class="mt-1 text-zinc-500" data-testid="supervisao-nao-alocada">
            Supervisão não alocada (administração local, vai às notas da tarefa):
            {{ supervisao.map((h) => `${h.rotulo} ${fmtNum(h.horas)} h`).join('; ') }}
          </div>
        </div>
        <div class="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
          <span>Orçamento do pacote (BAC): <strong class="tabular-nums" data-testid="bac">{{ fmtBRLCents(bac) }}</strong></span>
          <span class="text-zinc-500" data-testid="mao-de-obra">Mão de obra estimada (ilustrativa, {{ metodoCusto }}): {{ fmtBRLCents(laborCost) }} ({{ Math.round((laborCost / Math.max(1, bac)) * 100) }}% do BAC)</span>
        </div>
        <p v-if="foraDasTaxas.length" class="mt-1 text-[11px] text-zinc-500" data-testid="fora-das-taxas">
          Funções sem taxa nas premissas da obra, estimadas pela taxa "não cadastrada" (ilustrativa): {{ foraDasTaxas.join(', ') }}.
        </p>
        <p v-if="usaRecorte" class="mt-3 text-[11px] text-zinc-500" data-testid="fonte-recorte">
          Fonte: {{ recorte?.fonte }}. Custo e RUP são os publicados na tabela (a RUP é o coeficiente de cada função do Analítico). A mão de obra por subcomposições (ex.: preparo de argamassa) não está incluída no HH. Taxas por hora das premissas da obra seguem ilustrativas até a validação.
        </p>
        <p v-else class="mt-3 text-[11px] text-zinc-500" data-testid="aviso-ilustrativo">{{ tabelaSinapi }} Códigos, RUP e custos do catálogo são ilustrativos. Valide na tabela SINAPI vigente da UF e data-base do orçamento antes de usar em proposta ou medição.</p>
      </SectionCard>

      <div class="space-y-5">
        <SectionCard title="Inserir na EAP do MS Project" subtitle="Pacote com duração, recursos e vínculo lógico" :icon="ListPlus">
          <div class="space-y-3">
            <div>
              <label class="label">Nome da tarefa</label>
              <input v-model="taskName" class="input" maxlength="160" />
            </div>
            <div>
              <label class="label">Grupo da EAP</label>
              <select v-model="parentWbs" class="input" :disabled="newGroup">
                <option v-for="g in groups" :key="g.uid" :value="g.wbs">{{ g.wbs }} — {{ g.name }}</option>
              </select>
              <label class="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500"><input v-model="newGroup" type="checkbox" class="accent-amber-400" /> Criar novo grupo de 1º nível</label>
              <input v-if="newGroup" v-model="newGroupName" class="input mt-1.5" maxlength="80" />
            </div>
            <div>
              <label class="label">Predecessora (sequência lógica sugerida)</label>
              <select v-model.number="predecessorUid" class="input text-xs">
                <option :value="undefined">— sem predecessora —</option>
                <option v-for="t in project.leaves" :key="t.uid" :value="t.uid">[UID {{ t.uid }}] {{ t.wbs }} - {{ t.name }}</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">Tipo de vínculo</label>
                <select v-model="linkType" class="input">
                  <option value="FS">FS — Término-Início</option>
                  <option value="SS">SS — Início-Início</option>
                  <option value="FF">FF — Término-Término</option>
                  <option value="SF">SF — Início-Término</option>
                </select>
              </div>
              <div>
                <label class="label">Latência (dias úteis)</label>
                <input v-model.number="lagDays" type="number" min="-60" max="120" class="input tabular-nums" />
              </div>
            </div>

            <div v-if="erroDeLimite" class="rounded-lg border border-coral-300 p-3 text-[12px] text-coral-700 dark:border-coral-800 dark:text-coral-300" role="alert" data-testid="erro-limite">Valor fora do limite: {{ erroDeLimite }}. Corrija para dimensionar o pacote.</div>
            <div v-if="preview?.erro" class="rounded-lg border border-coral-300 p-3 text-[12px] text-coral-700 dark:border-coral-800 dark:text-coral-300" role="alert" data-testid="erro-previa">{{ preview.erro }}</div>
            <div v-else-if="preview && preview.erro === undefined" class="rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-800">
              <div class="flex items-center gap-2 font-mono text-[12px] font-semibold"><GitCommitHorizontal class="h-4 w-4 text-amber-500" /> [UID {{ preview.uid }}] {{ preview.wbs }}</div>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <div><span class="text-zinc-500">Início previsto</span><div class="font-medium tabular-nums">{{ fmtDate(preview.start) }}</div></div>
                <div><span class="text-zinc-500">Término previsto</span><div class="font-medium tabular-nums">{{ fmtDate(preview.finish) }}</div></div>
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <KeyRound class="h-3.5 w-3.5 text-amber-500" />
                <span>Entrega das chaves: {{ fmtDate(preview.projectFinish) }}</span>
                <span v-if="preview.deltaDays > 0" class="chip-critical">+{{ preview.deltaDays }} dias úteis</span>
                <span v-else class="chip-ok">sem impacto</span>
                <span v-if="preview.critical" class="chip-critical">Entra no caminho crítico</span>
                <span v-else class="chip-neutral">Folga {{ fmtNum(preview.totalFloat) }}d</span>
              </div>
            </div>

            <button class="btn-primary w-full py-2.5" :disabled="!valid" @click="add"><ListPlus class="h-4 w-4" /> Adicionar à EAP do MS Project</button>
            <button class="btn-secondary w-full" :disabled="!valid" @click="addToSheet"><TableProperties class="h-4 w-4" /> Adicionar à planilha (gerar em lote)</button>
          </div>
        </SectionCard>

        <SectionCard title="Pacotes gerados pelo CronoAI" :subtitle="`${generated.length} pacote(s) inseridos nesta obra`" body-class="p-3">
          <ul v-if="generated.length" class="space-y-2">
            <li v-for="t in generated" :key="t.uid" class="flex items-start gap-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
              <div class="min-w-0 flex-1">
                <div class="font-mono text-[11.5px] font-semibold">[UID {{ t.uid }}] {{ t.wbs }}</div>
                <div class="truncate text-[12px]">{{ t.name }}</div>
                <div class="text-[11px] text-zinc-500">{{ fmtDiasUteis(t.duracaoMin, project.minutosPorDia) }} d.u. · {{ fmtBRLCents(t.bac) }} · {{ t.resources.map((r) => `${r.units} ${r.resource}`).join(' + ') }}</div>
              </div>
              <button class="btn-ghost px-2 py-1" title="Remover da EAP" @click="project.removeTask(t.uid)"><Trash2 class="h-3.5 w-3.5" /></button>
            </li>
          </ul>
          <p v-else class="p-2 text-xs text-zinc-500">Nenhum pacote inserido ainda.</p>
        </SectionCard>
      </div>
    </div>

    <BudgetSheet />
  </div>
</template>
