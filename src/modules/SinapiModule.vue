<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Calculator, ListPlus, Users, Timer, ExternalLink, Trash2, GitCommitHorizontal, KeyRound, TableProperties } from 'lucide-vue-next'
import type { LinkType } from '@/types/domain'
import { RESOURCE_KINDS } from '@/types/domain'
import { useProjectStore, type SinapiInsert } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import BudgetSheet from './sinapi/BudgetSheet.vue'
import { SINAPI_CATALOG, SINAPI_REFERENCE_URL } from '@/data/sinapiCatalog'
import { HOURS_PER_DAY, durationFromTeam, scheduleDays, teamFromDuration, totalManHours } from '@/lib/sinapi'
import { rateOf } from '@/lib/scenarios'
import { fmtBRL, fmtDate, fmtNum } from '@/lib/format'
import { descreverTabelaSinapi } from '@/lib/obras'

const project = useProjectStore()
const ui = useUiStore()
const tabelaSinapi = computed(() => descreverTabelaSinapi(project.state.meta))

const catalogIdx = ref(0)
const item = reactive({ ...SINAPI_CATALOG[0] })
const quantity = ref(SINAPI_CATALOG[0].sampleQuantity)
const mode = ref<'equipe' | 'prazo'>('equipe')
const team = ref(6)
const desiredDays = ref(30)

watch(catalogIdx, (i) => {
  if (i < 0) return
  Object.assign(item, SINAPI_CATALOG[i])
  quantity.value = SINAPI_CATALOG[i].sampleQuantity
  taskName.value = SINAPI_CATALOG[i].description
  parentWbs.value = groups.value.some((g) => g.wbs === SINAPI_CATALOG[i].group) ? SINAPI_CATALOG[i].group : groups.value[0]?.wbs ?? ''
})

const hh = computed(() => totalManHours(quantity.value, item.rup))
const rawDuration = computed(() => (mode.value === 'equipe' ? durationFromTeam(quantity.value, item.rup, team.value) : desiredDays.value))
const officials = computed(() => (mode.value === 'equipe' ? team.value : Math.max(1, Math.ceil(teamFromDuration(quantity.value, item.rup, desiredDays.value) - 1e-9))))
const rawTeamForDuration = computed(() => teamFromDuration(quantity.value, item.rup, desiredDays.value))
const days = computed(() => (mode.value === 'equipe' ? scheduleDays(rawDuration.value) : scheduleDays(durationFromTeam(quantity.value, item.rup, officials.value))))
const helpers = computed(() => Math.ceil(officials.value * item.helperRatio - 1e-9))
const bac = computed(() => quantity.value * item.unitCost)
const laborCost = computed(() => hh.value * rateOf(item.professional) + days.value * HOURS_PER_DAY * helpers.value * rateOf('Servente'))
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

const input = computed<SinapiInsert>(() => ({
  name: taskName.value.trim() || item.description,
  code: item.code,
  unit: item.unit,
  quantity: quantity.value,
  unitCost: item.unitCost,
  durationDays: days.value,
  resources: [
    { resource: item.professional, units: officials.value },
    { resource: 'Servente', units: helpers.value },
  ],
  parentWbs: parentWbs.value,
  newGroupName: newGroup.value ? newGroupName.value.trim() || 'Serviços complementares' : undefined,
  predecessorUid: predecessorUid.value,
  linkType: linkType.value,
  lagDays: lagDays.value,
}))
const valid = computed(() => quantity.value > 0 && item.rup > 0 && days.value > 0 && Number.isFinite(days.value) && days.value <= 2000)
const preview = computed(() => (valid.value ? project.previewSinapiTask(input.value) : undefined))
const generated = computed(() => project.leaves.filter((t) => t.notes?.startsWith('Gerado pelo CronoAI')))

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
  })
  ui.notify('success', 'Linha adicionada à planilha', `${item.code} · ${days.value} d.u. com ${officials.value} oficial(is).`)
}

function add() {
  if (!valid.value) {
    ui.notify('warning', 'Dados incompletos', 'Informe quantidade, RUP e equipe/prazo válidos.')
    return
  }
  const t = project.addSinapiTask(input.value)
  ui.notify('success', `Pacote adicionado: [UID ${t.uid}] ${t.wbs}`, `${t.durationDays} dias úteis · ${officials.value} ${item.professional.toLowerCase()}(s) + ${helpers.value} servente(s) · vínculo ${linkType.value}.`)
}
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
      <SectionCard title="Item de orçamento e produtividade" subtitle="Selecione do catálogo ou edite livremente" :icon="Calculator">
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="sm:col-span-2">
            <label class="label">Composição SINAPI</label>
            <select v-model.number="catalogIdx" class="input">
              <option v-for="(c, i) in SINAPI_CATALOG" :key="c.code" :value="i">{{ c.code }} — {{ c.description }} ({{ c.unit }})</option>
            </select>
          </div>
          <div>
            <label class="label">Código SINAPI</label>
            <input v-model="item.code" class="input font-mono" maxlength="12" />
          </div>
          <div>
            <label class="label">Unidade</label>
            <select v-model="item.unit" class="input"><option v-for="u in ['m²', 'm³', 'kg', 'm', 'un']" :key="u">{{ u }}</option></select>
          </div>
          <div>
            <label class="label">Quantidade total ({{ item.unit }})</label>
            <input v-model.number="quantity" type="number" min="0" step="any" class="input tabular-nums" />
          </div>
          <div>
            <label class="label">Produtividade — RUP (HH/{{ item.unit }})</label>
            <input v-model.number="item.rup" type="number" min="0" step="0.005" class="input tabular-nums" />
          </div>
          <div>
            <label class="label">Profissional principal</label>
            <select v-model="item.professional" class="input"><option v-for="r in RESOURCE_KINDS" :key="r">{{ r }}</option></select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">Serventes/oficial</label>
              <input v-model.number="item.helperRatio" type="number" min="0" step="0.05" class="input tabular-nums" />
            </div>
            <div>
              <label class="label">Custo unit. (R$)</label>
              <input v-model.number="item.unitCost" type="number" min="0" step="0.01" class="input tabular-nums" />
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
            <div class="flex items-center justify-between text-xs"><span class="text-zinc-500">Nº de {{ item.professional.toLowerCase() }}s</span><span class="text-lg font-semibold tabular-nums">{{ team }}</span></div>
            <input v-model.number="team" type="range" min="1" max="40" class="w-full" aria-label="Tamanho da equipe" />
          </div>
          <div v-else>
            <div class="flex items-center justify-between text-xs"><span class="text-zinc-500">Duração desejada (dias úteis)</span><span class="text-lg font-semibold tabular-nums">{{ desiredDays }}</span></div>
            <input v-model.number="desiredDays" type="range" min="1" max="250" class="w-full" aria-label="Duração desejada" />
            <p class="text-[11px] text-zinc-500">Equipe teórica necessária: {{ fmtNum(rawTeamForDuration) }} → {{ officials }} {{ item.professional.toLowerCase() }}(s)</p>
          </div>

          <div class="mt-4 overflow-x-auto rounded-lg bg-zinc-950 px-4 py-3 font-mono text-[12px] text-zinc-300 dark:bg-black/50">
            <div class="text-zinc-500">// Duração = (Quantidade × Coeficiente_HH) / (Equipe × 8 horas)</div>
            <div class="mt-1 whitespace-nowrap">
              Duração = (<span class="text-amber-300">{{ fmtNum(quantity) }} {{ item.unit }}</span> × <span class="text-amber-300">{{ item.rup.toString().replace('.', ',') }} HH/{{ item.unit }}</span>) / (<span class="text-sky-300">{{ officials }}</span> × 8 h)
              = <span class="text-white">{{ fmtNum(durationFromTeam(quantity, item.rup, officials)) }}</span> → <span class="font-bold text-emerald-400">{{ days }} dias úteis</span>
            </div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Homem-hora</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ fmtNum(hh) }} HH</div></div>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Duração</div><div class="mt-0.5 text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ days }} d.u.</div></div>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Equipe</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ officials }} + {{ helpers }}</div><div class="text-[10px] text-zinc-500">oficiais + serventes</div></div>
          <div class="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60"><div class="eyebrow">Produção</div><div class="mt-0.5 text-lg font-semibold tabular-nums">{{ fmtNum(dailyOutput) }}</div><div class="text-[10px] text-zinc-500">{{ item.unit }}/dia</div></div>
        </div>
        <div class="mt-3 flex flex-wrap justify-between gap-2 text-[12px]">
          <span>Orçamento do pacote (BAC): <strong class="tabular-nums">{{ fmtBRL(bac) }}</strong></span>
          <span class="text-zinc-500">Mão de obra estimada: {{ fmtBRL(laborCost) }} ({{ Math.round((laborCost / Math.max(1, bac)) * 100) }}% do BAC)</span>
        </div>
        <p class="mt-3 text-[11px] text-zinc-500">{{ tabelaSinapi }} Códigos, RUP e custos do catálogo são ilustrativos. Valide na tabela SINAPI vigente da UF e data-base do orçamento antes de usar em proposta ou medição.</p>
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

            <div v-if="preview" class="rounded-lg border border-zinc-200 p-3 text-[12px] dark:border-zinc-800">
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
                <span v-else class="chip-neutral">Folga {{ preview.totalFloat }}d</span>
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
                <div class="text-[11px] text-zinc-500">{{ t.durationDays }} d.u. · {{ fmtBRL(t.bac) }} · {{ t.resources.map((r) => `${r.units} ${r.resource}`).join(' + ') }}</div>
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
