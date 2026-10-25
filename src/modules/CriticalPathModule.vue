<script setup lang="ts">
import { computed, ref } from 'vue'
import { AlarmClockOff, AlertTriangle, ChevronRight, GitBranch, KeyRound, Lock, ShieldCheck, Sparkles, Network, RotateCcw } from '@lucide/vue'
import type { ScenarioKind } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import GanttChart from '@/components/gantt/GanttChart.vue'
import ScenarioCard from './critical/ScenarioCard.vue'
import DivergenciasPainel from './critical/DivergenciasPainel.vue'
import { fmtBRL, fmtDate, fmtDateLong, fmtDiasUteis, fmtFolga } from '@/lib/format'
import { describeLink, formatPredecessors } from '@/lib/wbs'
import { MAX_FRENTES_HORA_EXTRA } from '@/lib/scenarios'
import { descreverPremissasDeCenario, rotuloVersao } from '@/lib/premissas'

const project = useProjectStore()
const ui = useUiStore()
const delay = computed(() => project.delay)
const onlyCritical = ref(false)
/** Alguma tarefa folha tem as datas do arquivo MSPDI: só então há o que comparar no painel de divergências. */
const temDatasDoArquivo = computed(() => project.leaves.some((t) => !!t.arquivo?.inicio))

const affectedUids = computed(() => [delay.value.origin?.uid, ...delay.value.affected.map((a) => a.uid)].filter((x): x is number => x !== undefined))
const ganttTasks = computed(() => (onlyCritical.value ? project.tasksByWbs.filter((t) => t.isSummary || project.schedule.byUid.get(t.uid)?.critical) : project.tasksByWbs))

const SCENARIOS: ScenarioKind[] = ['crashing', 'fast-tracking', 'overtime']
const params = project.scenarioParams

/** Tarefa-alvo do crashing (vazio = sugestão automática: 1ª sucessora crítica com pedreiros). */
const crashTarget = computed({
  get: () => (params.crashing.targetUid !== undefined ? String(params.crashing.targetUid) : ''),
  set: (v: string) => (params.crashing.targetUid = v ? Number(v) : undefined),
})
/** Vínculo FS a paralelizar no formato "pred>succ" (vazio = sugestão automática). */
const fastLink = computed({
  get: () => (params.fastTracking.predUid !== undefined ? `${params.fastTracking.predUid}>${params.fastTracking.succUid}` : ''),
  set: (v: string) => {
    const [p, s] = v ? v.split('>').map(Number) : [undefined, undefined]
    params.fastTracking.predUid = p
    params.fastTracking.succUid = s
  },
})
// Hora extra: jornada do sábado (inteira ou meio período) e frentes (todas no calendário padrão, ou só as escolhidas)
const modoFrentes = computed({
  get: () => (Array.isArray(params.overtime.frentes) ? 'escolher' : 'todas'),
  set: (v: string) => {
    params.overtime.frentes = v === 'escolher' ? [] : 'todas'
  },
})
const frentesEscolhidas = computed(() => (Array.isArray(params.overtime.frentes) ? params.overtime.frentes : []))
const frentesDisponiveis = computed(() =>
  project.scenarioOptions.overtime.map((o) => ({ ...o, uid: Number(o.value), wbs: project.taskByUid.get(Number(o.value))?.wbs ?? '' })),
)
const pacotesDasFrentes = computed(() => project.tasksByWbs.filter((t) => t.isSummary && frentesDisponiveis.value.some((f) => f.wbs.startsWith(t.wbs + '.'))))
const avisoLimiteFrentes = () => ui.notify('warning', 'Limite de frentes', `Escolha no máximo ${MAX_FRENTES_HORA_EXTRA} frentes para a hora extra.`)
function alternarFrente(uid: number, marcada: boolean, caixa?: HTMLInputElement) {
  const atuais = frentesEscolhidas.value.filter((u) => u !== uid)
  if (marcada && atuais.length >= MAX_FRENTES_HORA_EXTRA) {
    if (caixa) caixa.checked = false
    return avisoLimiteFrentes()
  }
  params.overtime.frentes = marcada ? [...atuais, uid] : atuais
}
function selecionarPacote(wbs: string, seletor?: HTMLSelectElement) {
  if (seletor) seletor.value = ''
  if (!wbs) return
  const doPacote = frentesDisponiveis.value.filter((f) => f.wbs.startsWith(wbs + '.')).map((f) => f.uid)
  const todas = [...new Set([...frentesEscolhidas.value, ...doPacote])]
  if (todas.length > MAX_FRENTES_HORA_EXTRA) {
    ui.notify('warning', 'O pacote passa do limite de frentes', `Com este pacote seriam ${todas.length} frentes; o máximo é ${MAX_FRENTES_HORA_EXTRA}. Nenhuma foi marcada: escolha as frentes uma a uma.`)
    return
  }
  params.overtime.frentes = todas
}
const crashTrade = computed(() => {
  const uid = project.scenarios.crashing.targetUid
  const t = uid !== undefined ? project.taskByUid.get(uid) : undefined
  return t ? (t.resources.filter((r) => r.resource !== 'Servente').sort((a, b) => b.units - a.units)[0]?.resource ?? 'Oficial') : 'Oficial'
})
const comparison = computed(() => SCENARIOS.map((k) => project.appliedResult(k) ?? project.scenarios[k]))

function apply(kind: ScenarioKind) {
  const res = project.scenarios[kind]
  const before = project.schedule.projectFinish
  const aplicado = project.applyScenario(res)
  if (!aplicado.ok) {
    ui.notify('error', `${res.title} não aplicado`, aplicado.erro)
    return
  }
  ui.notify('success', `${res.title} aplicado`, `Entrega: ${fmtDate(before)} → ${fmtDate(project.schedule.projectFinish)} · custo comprometido ${fmtBRL(res.extraCost)}. Gantt, EVM e suprimentos recalculados.`)
}
function undo(kind: ScenarioKind) {
  const r = project.undoScenario(kind)
  if (!r.ok) {
    ui.notify('error', 'Cenário não desfeito', r.erro)
    return
  }
  ui.notify('info', 'Cenário desfeito', 'Cronograma restaurado e recalculado.')
}

const network = computed(() =>
  project.leaves.map((t) => {
    const s = project.schedule.byUid.get(t.uid)!
    return {
      t,
      s,
      lateStart: s.lateStart,
      lateFinish: s.lateFinish,
      variance: project.finishVarianceDays(t),
    }
  }),
)
const shortName = (name: string) => name.replace('Alvenaria de vedação bloco cerâmico 14x19x29', 'Alvenaria').replace('Estrutura de concreto armado fck 30', 'Estrutura')
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Dor 2"
      title="Motor de Caminho Crítico & Simulador “E se?”"
      description="CPM com vínculos FS/SS/FF/SF e reprogramação pela data de status: veja o efeito dominó do atraso e simule planos de recuperação antes de mexer no MS Project."
    >
      <span class="chip-critical">{{ project.schedule.criticalPath.length }} tarefas críticas em aberto</span>
    </ModuleHeader>

    <!-- Efeito dominó -->
    <section v-if="delay.delayDays > 0 && delay.origin" class="card overflow-hidden border-coral-500/40">
      <div class="flex flex-wrap items-start gap-4 bg-coral-500/[0.07] p-5">
        <div class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-coral-500/15"><AlertTriangle class="h-5 w-5 text-coral-500" /></div>
        <div class="min-w-0 flex-1">
          <div class="eyebrow text-coral-600 dark:text-coral-400">Efeito dominó detectado</div>
          <h2 class="mt-1 text-base font-semibold">
            Atraso em <span class="font-mono">[UID {{ delay.origin.uid }}] {{ delay.origin.wbs }}</span> {{ shortName(delay.origin.name) }} empurra a entrega das chaves em
            <span class="text-coral-600 dark:text-coral-400">{{ delay.delayDays }} dias úteis</span> ({{ delay.delayCalendarDays }} dias corridos)
          </h2>
          <p class="mt-1 text-[12.5px] text-zinc-600 dark:text-zinc-300">
            A tarefa está a {{ Math.round(delay.origin.percentComplete) }}% e termina {{ delay.originShift }} dias úteis após a linha de base.
            {{ delay.affected.length }} sucessoras foram deslocadas, {{ delay.affected.filter((a) => a.critical).length }} delas no caminho crítico.
          </p>
        </div>
        <div class="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <KeyRound class="h-5 w-5 text-amber-500" />
          <div>
            <div class="eyebrow">Linha de base</div>
            <div class="text-sm font-semibold tabular-nums text-zinc-500 line-through decoration-coral-500/60">{{ fmtDate(delay.keysBaseline) }}</div>
          </div>
          <ChevronRight class="h-4 w-4 text-zinc-400" />
          <div>
            <div class="eyebrow">Previsão atual</div>
            <div class="text-sm font-semibold tabular-nums text-coral-600 dark:text-coral-400">{{ fmtDate(delay.keysForecast) }}</div>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-1.5 border-t border-coral-500/20 px-5 py-3 text-[11.5px]">
        <span class="mr-1 text-zinc-500">Cadeia afetada:</span>
        <template v-for="(a, i) in delay.affected" :key="a.uid">
          <ChevronRight v-if="i" class="h-3 w-3 text-zinc-400" />
          <span :class="a.critical ? 'chip-critical' : 'chip-neutral'" :title="project.taskByUid.get(a.uid)?.name">
            {{ project.taskByUid.get(a.uid)?.wbs }} {{ shortName(project.taskByUid.get(a.uid)?.name ?? '').split(' — ')[0].slice(0, 28) }} +{{ a.shiftDays }}d
          </span>
        </template>
      </div>
    </section>
    <section v-else class="card flex items-center gap-3 border-emerald-500/40 bg-emerald-500/[0.06] p-5">
      <ShieldCheck class="h-6 w-6 text-emerald-500" />
      <div>
        <div class="text-sm font-semibold">Entrega das chaves {{ delay.delayDays < 0 ? `antecipada em ${-delay.delayDays} dias úteis` : 'no prazo da linha de base' }}</div>
        <div class="text-[12px] text-zinc-500">Previsão: {{ fmtDateLong(delay.keysForecast) }} · Linha de base: {{ fmtDateLong(delay.keysBaseline) }}</div>
      </div>
    </section>

    <!-- Simulador -->
    <SectionCard
      title="Simulador de Recuperação com IA"
      :subtitle="`Cada cenário recalcula o CPM completo. Custo indireto da obra: ${fmtBRL(project.premissasVigentes.custoIndiretoDiario)}/dia útil (${rotuloVersao(project.versaoPremissasVigente)}).`"
      :icon="Sparkles"
    >
      <template #actions>
        <button class="btn-ghost" @click="project.resetScenarioParams()"><RotateCcw class="h-3.5 w-3.5" /> Parâmetros padrão</button>
      </template>

      <div class="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-400/40 bg-amber-400/[0.07] p-3 text-[12.5px]">
        <Sparkles class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <span class="font-semibold">Recomendação:</span> {{ project.recommendation.reason }}
          <span class="block text-[11px] text-zinc-500">Critério: menor saldo (custo extra − economia de indireto) entre os cenários de risco baixo ou médio. É uma sugestão; a decisão é do engenheiro.</span>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-3">
        <ScenarioCard
          v-for="k in SCENARIOS"
          :key="k"
          :result="project.appliedResult(k) ?? project.scenarios[k]"
          :applied="project.state.appliedScenarios.includes(k)"
          :recommended="project.recommendation.kind === k"
          @apply="apply(k)"
          @undo="undo(k)"
        >
          <template v-if="k === 'crashing'" #controls>
            <label class="label">Tarefa a comprimir</label>
            <select v-model="crashTarget" class="input py-1.5 text-xs">
              <option value="">Sugestão automática (sucessora crítica)</option>
              <option v-for="o in project.scenarioOptions.crashing" :key="o.value" :value="o.value">{{ o.critical ? '● ' : '' }}{{ o.label }}</option>
            </select>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <div class="flex justify-between text-[11px]"><span class="text-zinc-500">+ {{ crashTrade.toLowerCase() }}(s)</span><strong class="tabular-nums">{{ params.crashing.addOfficials }}</strong></div>
                <input v-model.number="params.crashing.addOfficials" type="range" min="0" max="10" class="w-full" :aria-label="`${crashTrade}s adicionais`" />
              </div>
              <div>
                <div class="flex justify-between text-[11px]"><span class="text-zinc-500">+ serventes</span><strong class="tabular-nums">{{ params.crashing.addServentes }}</strong></div>
                <input v-model.number="params.crashing.addServentes" type="range" min="0" max="10" class="w-full" aria-label="Serventes adicionais" />
              </div>
            </div>
          </template>
          <template v-else-if="k === 'fast-tracking'" #controls>
            <label class="label">Vínculo Término-Início (FS) a paralelizar</label>
            <select v-model="fastLink" class="input py-1.5 text-xs">
              <option value="">Sugestão automática (Alvenaria → Elétrica)</option>
              <option v-for="o in project.scenarioOptions.fastTracking" :key="o.value" :value="o.value">{{ o.critical ? '● ' : '' }}{{ o.label }}</option>
            </select>
            <div>
              <div class="flex justify-between text-[11px]"><span class="text-zinc-500">Latência do novo vínculo SS</span><strong class="tabular-nums">SS + {{ params.fastTracking.lagDays }} d</strong></div>
              <input v-model.number="params.fastTracking.lagDays" type="range" min="0" max="20" class="w-full" aria-label="Latência em dias" />
            </div>
          </template>
          <template v-else #controls>
            <div class="flex justify-between text-[11px]"><span class="text-zinc-500">Sábados convocados (a partir da data de status)</span><strong class="tabular-nums">{{ params.overtime.saturdays }}</strong></div>
            <input v-model.number="params.overtime.saturdays" type="range" min="1" max="8" class="w-full" aria-label="Quantidade de sábados" />
            <div>
              <label class="label" for="he-jornada">Jornada do sábado</label>
              <select id="he-jornada" v-model="params.overtime.jornada" class="input py-1.5 text-xs">
                <option value="integral">Dia inteiro (jornada do dia útil)</option>
                <option value="meio">Meio período (4 h, 08:00–12:00)</option>
              </select>
            </div>
            <fieldset class="space-y-1.5 text-[12px]">
              <legend class="label">Frentes convocadas</legend>
              <label class="flex items-start gap-2"><input v-model="modoFrentes" type="radio" value="todas" class="mt-0.5 accent-amber-500" /> Todas as frentes do calendário padrão (os sábados entram nesse calendário)</label>
              <label class="flex items-start gap-2"><input v-model="modoFrentes" type="radio" value="escolher" class="mt-0.5 accent-amber-500" /> Escolher as frentes</label>
            </fieldset>
            <div v-if="modoFrentes === 'escolher'" class="space-y-2" data-testid="he-frentes">
              <p class="label">Frentes que podem trabalhar nos sábados</p>
              <p class="text-[11px] text-zinc-500">● = no caminho crítico. Sábado já útil no calendário da frente não é hora extra. Máximo de {{ MAX_FRENTES_HORA_EXTRA }} frentes.</p>
              <div v-if="pacotesDasFrentes.length">
                <label class="label" for="he-pacote">Selecionar um pacote inteiro</label>
                <select id="he-pacote" class="input py-1.5 text-xs" @change="selecionarPacote(($event.target as HTMLSelectElement).value, $event.target as HTMLSelectElement)">
                  <option value="">Escolha um pacote</option>
                  <option v-for="p in pacotesDasFrentes" :key="p.uid" :value="p.wbs">{{ p.wbs }} {{ p.name }}</option>
                </select>
              </div>
              <ul class="max-h-40 space-y-1 overflow-auto">
                <li v-for="f in frentesDisponiveis" :key="f.uid">
                  <label class="flex items-start gap-2 text-[12px]">
                    <input type="checkbox" class="mt-0.5 accent-amber-500" :checked="frentesEscolhidas.includes(f.uid)" :aria-label="`Frente ${f.label}`" @change="alternarFrente(f.uid, ($event.target as HTMLInputElement).checked, $event.target as HTMLInputElement)" />
                    <span>{{ f.critical ? '● ' : '' }}{{ f.label }}</span>
                  </label>
                </li>
                <li v-if="!frentesDisponiveis.length" class="text-[11px] text-zinc-500">Nenhuma frente com trabalho nos sábados convocados.</li>
              </ul>
              <p class="text-[11px] text-zinc-500">A lista é um limite superior: com os sábados no calendário, uma frente pode sair do cálculo quando escolhida sozinha, se não trabalhar de fato num sábado convocado.</p>
            </div>
          </template>
        </ScenarioCard>
      </div>
      <p class="mt-2 text-[10.5px] text-zinc-500">● = no caminho crítico. {{ descreverPremissasDeCenario(project.premissasVigentes) }} Altere na aba Premissas.</p>

      <!-- Comparativo -->
      <div class="mt-5 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table class="table-base">
          <thead>
            <tr><th>Cenário</th><th class="text-right">Dias recuperados</th><th>Nova entrega</th><th class="text-right">Custo extra</th><th class="text-right">Economia indireto</th><th class="text-right">Saldo</th><th class="text-right">R$/dia</th><th>Risco</th></tr>
          </thead>
          <tbody>
            <tr v-for="r in comparison" :key="r.kind" :class="project.recommendation.kind === r.kind ? 'bg-amber-400/[0.06]' : ''">
              <td class="font-medium">{{ r.title }} <span v-if="project.state.appliedScenarios.includes(r.kind)" class="chip-ok ml-1">aplicado</span></td>
              <td class="text-right tabular-nums">{{ r.applicable ? r.daysRecovered : '—' }}</td>
              <td class="tabular-nums">{{ r.applicable ? fmtDate(r.newFinish) : '—' }}</td>
              <td class="text-right tabular-nums">{{ fmtBRL(r.extraCost) }}</td>
              <td class="text-right tabular-nums">{{ fmtBRL(r.indirectSavings) }}</td>
              <td class="text-right font-semibold tabular-nums" :class="r.netImpact > 0 ? 'text-coral-600 dark:text-coral-400' : 'text-emerald-600 dark:text-emerald-400'">{{ fmtBRL(r.netImpact) }}</td>
              <td class="text-right tabular-nums">{{ Number.isFinite(r.costPerDay) && r.applicable ? fmtBRL(r.costPerDay) : '—' }}</td>
              <td><span :class="{ Baixo: 'chip-ok', Médio: 'chip-warn', Alto: 'chip-critical' }[r.risk]">{{ r.risk }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </SectionCard>

    <!-- Gantt -->
    <SectionCard title="Cronograma (Gantt) — previsto x linha de base" subtitle="Barras vermelhas = caminho crítico (folga total = 0). Contorno âmbar = afetadas pelo efeito dominó." :icon="GitBranch" body-class="p-3">
      <template #actions>
        <label class="flex items-center gap-2 text-[11px] text-zinc-500"><input v-model="onlyCritical" type="checkbox" class="accent-amber-400" /> Só caminho crítico</label>
      </template>
      <GanttChart :tasks="ganttTasks" :schedule="project.schedule" :rollups="project.rollups" :status-date="project.state.meta.statusDate" :highlight="affectedUids" />
    </SectionCard>

    <!-- Rede lógica -->
    <SectionCard title="Tabela de Rede Lógica (CPM)" subtitle="Datas mais cedo/mais tarde, folgas e vínculos — mesmos campos do MS Project" :icon="Network" body-class="overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>UID</th><th>EAP</th><th>Tarefa</th><th class="text-right">Dur.</th><th>Predecessoras</th>
            <th>Início cedo</th><th>Término cedo</th><th>Início tarde</th><th>Término tarde</th>
            <th class="text-right">Folga total</th><th class="text-right">Folga livre</th><th class="text-right">Var. LB</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in network" :key="row.t.uid" :class="row.s.critical ? 'bg-coral-500/[0.04]' : ''">
            <td class="mono">{{ row.t.uid }}</td>
            <td class="mono">{{ row.t.wbs }}</td>
            <td class="max-w-[280px] truncate" :title="row.t.name">{{ shortName(row.t.name) }}</td>
            <td class="text-right tabular-nums">{{ fmtDiasUteis(row.t.duracaoMin, project.minutosPorDia) }}d</td>
            <td class="mono" :title="row.t.predecessors.map((p) => `${p.uid}: ${describeLink(p.type)}`).join('\n')">{{ formatPredecessors(row.t, project.minutosPorDia) || '—' }}</td>
            <td class="tabular-nums">{{ fmtDate(row.s.start) }}</td>
            <td class="tabular-nums">{{ fmtDate(row.s.finish) }}</td>
            <td class="tabular-nums text-zinc-500">{{ row.t.percentComplete >= 100 ? '—' : fmtDate(row.lateStart) }}</td>
            <td class="tabular-nums text-zinc-500">{{ row.t.percentComplete >= 100 ? '—' : fmtDate(row.lateFinish) }}</td>
            <td class="text-right font-semibold tabular-nums" :class="row.s.critical ? 'text-coral-600 dark:text-coral-400' : ''">{{ row.t.percentComplete >= 100 ? '—' : fmtFolga(row.s.folgaTotalMin, row.s.corrida, project.minutosPorDia) }}</td>
            <td class="text-right tabular-nums">{{ row.t.percentComplete >= 100 ? '—' : fmtFolga(row.s.folgaLivreMin, row.s.corrida, project.minutosPorDia) }}</td>
            <td class="text-right tabular-nums" :class="row.variance > 0 ? 'text-coral-600 dark:text-coral-400' : row.variance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'">
              {{ row.variance > 0 ? `+${row.variance}` : row.variance }}d
            </td>
            <td>
              <span v-if="row.t.percentComplete >= 100" class="chip-neutral">Concluída</span>
              <span v-else-if="row.s.critical" class="chip-critical">Crítica</span>
              <span v-else class="chip-ok">Folga {{ fmtFolga(row.s.folgaTotalMin, row.s.corrida, project.minutosPorDia) }}</span>
              <span v-if="row.s.prazoFinalPerdido" class="chip-critical ml-1" title="O término calculado passa do prazo final"><AlarmClockOff class="h-3 w-3" aria-hidden="true" /> Prazo perdido</span>
              <span v-if="row.s.restricaoConflito" class="chip-warn ml-1" title="A restrição prevalece sobre o vínculo com a predecessora"><Lock class="h-3 w-3" aria-hidden="true" /> Restrição em conflito</span>
            </td>
          </tr>
        </tbody>
      </table>
    </SectionCard>

    <!-- Divergências com o arquivo do MS Project -->
    <DivergenciasPainel :divergencias="project.divergencias" :tem-datas-do-arquivo="temDatasDoArquivo" />
  </div>
</template>
