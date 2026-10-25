<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { FileSpreadsheet, Upload, Download, Trash2, Wand2, KeyRound, Eraser } from '@lucide/vue'
import type { ScheduledTask, Task } from '@/types/domain'
import type { BudgetLine } from '@/lib/sinapiBudget'
import { BUDGET_CSV_TEMPLATE, DEFAULT_BATCH_OPTIONS, ehFonteAlterada, fonteBase, lineDuration, lineName, lineResources, parseNumberBR } from '@/lib/sinapiBudget'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import { downloadText } from '@/lib/download'
import SectionCard from '@/components/common/SectionCard.vue'
import { fmtBRLCents, fmtDate, fmtNum } from '@/lib/format'
import { rotuloCurtoDaFonte } from '@/lib/recorteSinapi'
import { horasPorDia } from '@/lib/calendarioTrabalho'
import { formatPredecessors } from '@/lib/wbs'

const project = useProjectStore()
const ui = useUiStore()
const fileInput = ref<HTMLInputElement>()
const opts = reactive({ ...DEFAULT_BATCH_OPTIONS })
const MAX_CSV_BYTES = 2 * 1024 * 1024

const lines = computed(() => project.state.budget)
/** A linha vem de um recorte que não é o da obra (outra data-base ou UF, recorte trocado ou removido). */
const outroRecorte = (l: BudgetLine) => !!l.fonte && fonteBase(l.fonte) !== project.recorteAtual?.fonte
const groups = computed(() => project.tasksByWbs.filter((t) => t.isSummary && t.outlineLevel === 1))
const groupName = (wbs: string) => groups.value.find((g) => g.wbs === wbs)?.name ?? 'Novo grupo (Serviços complementares)'
const totals = computed(() => ({
  bac: lines.value.reduce((a, l) => a + l.quantity * l.unitCost, 0),
  hh: lines.value.reduce((a, l) => a + l.quantity * l.rup, 0),
}))
const preview = computed(() => project.previewBudgetBatch(opts))
const previewByName = computed(() => {
  const p = preview.value
  return p && p.erro === undefined ? new Map(p.created.map((c) => [c.task.name, c])) : new Map<string, { task: Task; sched: ScheduledTask }>()
})

function edit(l: BudgetLine, field: 'quantity' | 'rup' | 'unitCost' | 'team', raw: string) {
  const v = parseNumberBR(raw)
  const limits = { quantity: 1e8, rup: 50, unitCost: 1e7, team: 60 }
  if (!Number.isFinite(v) || v <= 0 || v > limits[field]) return
  project.updateBudgetLine(l.id, { [field]: field === 'team' ? Math.round(v) : v })
}

async function onCsv(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!/\.(csv|txt)$/i.test(file.name) || file.size > MAX_CSV_BYTES) {
    ui.notify('error', 'Arquivo não aceito', 'Envie um .csv de até 2 MB (Excel: Salvar como › CSV separado por ponto e vírgula).')
    return
  }
  const { added, errors } = project.importBudgetCsv(await file.text())
  if (added) ui.notify('success', `${added} linha(s) importada(s)`, 'Ajuste equipes e gere o cronograma.')
  errors.slice(0, 3).forEach((er) => ui.notify(added ? 'warning' : 'error', 'Atenção na importação', er))
}

function downloadTemplate() {
  downloadText('modelo_planilha_sinapi.csv', '\uFEFF' + BUDGET_CSV_TEMPLATE, 'text/csv')
}

function generate() {
  const res = project.generateFromBudget(opts)
  if (!res.ok) {
    ui.notify('error', 'Cronograma não gerado', res.erro)
    return
  }
  const created = res.created
  if (created.length) {
    ui.notify('success', `${created.length} pacote(s) adicionados à EAP`, `Vínculos ${opts.mode === 'SS' ? `SS com defasagem de ${opts.overlapPct}%` : 'FS em série'} · caminho crítico, EVM e Gantt recalculados.`)
  }
}

function clear() {
  if (window.confirm('Esvaziar a planilha orçamentária? As tarefas já geradas na EAP não são afetadas.')) project.clearBudget()
}

const cell =
  'rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700'
</script>

<template>
  <SectionCard
    title="Planilha orçamentária → cronograma"
    subtitle="Várias composições de uma vez, com vínculos automáticos na sequência de engenharia (Fundação → Supra → Alvenaria → Instalações → Revestimentos → Pisos → Pintura)"
    :icon="FileSpreadsheet"
    body-class="p-0"
  >
    <template #actions>
      <input ref="fileInput" type="file" accept=".csv,.txt,text/csv" class="hidden" @change="onCsv" />
      <button class="btn-ghost" title="Baixar modelo de CSV" @click="downloadTemplate"><Download class="h-3.5 w-3.5" /> Modelo CSV</button>
      <button class="btn-secondary" @click="fileInput?.click()"><Upload class="h-3.5 w-3.5" /> Importar CSV</button>
      <button v-if="lines.length" class="btn-ghost" @click="clear"><Eraser class="h-3.5 w-3.5" /> Esvaziar</button>
    </template>

    <div class="overflow-x-auto">
      <table class="table-base">
        <thead>
          <tr>
            <th>SINAPI</th><th class="min-w-[240px]">Serviço / local</th><th>Grupo EAP</th><th class="text-right">Qtd.</th><th class="text-right">RUP (HH/un)</th>
            <th class="text-right">HH</th><th class="text-right">Equipe</th><th class="text-right">Duração</th><th class="text-right">Custo unit.</th><th class="text-right">BAC</th>
            <th>Vínculo gerado</th><th>Início → Término</th><th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in lines" :key="l.id">
            <td class="mono">
              {{ l.code || '—' }}
              <!-- Fonte do custo e da RUP da linha: o recorte da obra (verde), o recorte com valores mudados pelo usuário (âmbar tracejado) ou o catálogo ilustrativo (cinza) -->
              <div class="mt-0.5">
                <span
                  :class="!l.fonte ? 'chip-neutral' : outroRecorte(l) ? 'chip-critical' : ehFonteAlterada(l.fonte) ? 'chip-warn border-dashed' : 'chip-ok'"
                  :title="
                    !l.fonte
                      ? 'Custo e RUP ilustrativos: valide na tabela SINAPI da UF e da data-base'
                      : outroRecorte(l)
                        ? `Custo e RUP vêm de ${fonteBase(l.fonte)}, que não é o recorte desta obra${project.recorteAtual ? ` (${project.recorteAtual.fonte})` : ' (a obra não tem recorte)'}: o lote não gera esta linha. Remova-a e inclua a composição de novo.`
                        : ehFonteAlterada(l.fonte)
                          ? 'RUP, custo ou profissional diferentes do publicado no recorte: valores informados pelo usuário'
                          : 'Custo e RUP publicados no recorte SINAPI da obra'
                  "
                  data-testid="fonte-da-linha"
                >{{ l.fonte ? (outroRecorte(l) ? `${rotuloCurtoDaFonte(l.fonte)} · outro recorte` : rotuloCurtoDaFonte(l.fonte)) : 'ilustrativo' }}</span>
              </div>
            </td>
            <td>
              <div class="truncate" :title="l.description">{{ l.description }}</div>
              <input :value="l.location" class="mt-0.5 w-full rounded border border-transparent bg-transparent px-1 text-[11px] text-zinc-500 hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700" placeholder="local / frente" maxlength="60" aria-label="Local do serviço" @change="project.updateBudgetLine(l.id, { location: ($event.target as HTMLInputElement).value })" />
            </td>
            <td>
              <select :value="l.group" class="rounded border border-zinc-200 bg-transparent px-1 py-0.5 text-[11px] dark:border-zinc-700" aria-label="Grupo da EAP" @change="project.updateBudgetLine(l.id, { group: ($event.target as HTMLSelectElement).value })">
                <option v-for="g in groups" :key="g.wbs" :value="g.wbs">{{ g.wbs }} {{ g.name }}</option>
                <option v-if="!groups.some((g) => g.wbs === l.group)" :value="l.group">{{ groupName(l.group) }}</option>
              </select>
            </td>
            <td class="whitespace-nowrap text-right"><input :value="l.quantity" :class="cell" class="w-20" aria-label="Quantidade" @change="edit(l, 'quantity', ($event.target as HTMLInputElement).value)" /> <span class="text-[10.5px] text-zinc-500">{{ l.unit }}</span></td>
            <td class="text-right"><input :value="l.rup" :class="cell" class="w-14" aria-label="RUP" @change="edit(l, 'rup', ($event.target as HTMLInputElement).value)" /></td>
            <td class="text-right tabular-nums">{{ fmtNum(l.quantity * l.rup) }}</td>
            <td class="whitespace-nowrap text-right">
              <input :value="l.team" :class="cell" class="w-10" aria-label="Oficiais na equipe" @change="edit(l, 'team', ($event.target as HTMLInputElement).value)" />
              <span class="text-[10.5px] text-zinc-500">{{ lineResources(l).map((r) => r.units).join('+') }}</span>
            </td>
            <td class="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{{ lineDuration(l, horasPorDia(project.minutosPorDia)) }} d.u.</td>
            <td class="text-right"><input :value="l.unitCost" :class="cell" class="w-16" aria-label="Custo unitário" @change="edit(l, 'unitCost', ($event.target as HTMLInputElement).value)" /></td>
            <td class="text-right tabular-nums">{{ fmtBRLCents(l.quantity * l.unitCost) }}</td>
            <td class="mono text-[10.5px]">
              <template v-if="previewByName.get(lineName(l))">
                {{ formatPredecessors(previewByName.get(lineName(l))!.task, project.minutosPorDia) || '—' }}
              </template>
            </td>
            <td class="whitespace-nowrap text-[11px] tabular-nums">
              <template v-if="previewByName.get(lineName(l))">
                {{ fmtDate(previewByName.get(lineName(l))!.sched.start) }} → {{ fmtDate(previewByName.get(lineName(l))!.sched.finish) }}
              </template>
            </td>
            <td><button class="btn-ghost px-1.5 py-1" :aria-label="`Remover ${l.description}`" @click="project.removeBudgetLine(l.id)"><Trash2 class="h-3.5 w-3.5" /></button></td>
          </tr>
          <tr v-if="!lines.length">
            <td colspan="13" class="py-8 text-center text-zinc-500">Planilha vazia. Use "Adicionar à planilha" na calculadora acima ou importe um CSV.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="lines.length" class="flex flex-wrap items-center gap-4 border-t border-zinc-200 px-5 py-4 text-[12px] dark:border-zinc-800">
      <div class="flex items-center gap-2">
        <span class="text-zinc-500">Encadeamento no mesmo grupo:</span>
        <select v-model="opts.mode" class="rounded border border-zinc-300 bg-transparent px-1.5 py-1 dark:border-zinc-700" aria-label="Tipo de encadeamento">
          <option value="SS">SS com defasagem</option>
          <option value="FS">FS em série</option>
        </select>
        <template v-if="opts.mode === 'SS'">
          <input v-model.number="opts.overlapPct" type="range" min="10" max="90" step="5" class="w-28" aria-label="Defasagem em %" />
          <span class="tabular-nums">{{ opts.overlapPct }}% da anterior</span>
        </template>
      </div>
      <div class="text-zinc-500">Total: <strong class="text-zinc-800 dark:text-zinc-100">{{ fmtNum(totals.hh) }} HH</strong> · BAC <strong class="text-zinc-800 dark:text-zinc-100">{{ fmtBRLCents(totals.bac) }}</strong></div>
      <div v-if="preview?.erro" class="text-coral-600 dark:text-coral-400" role="alert" data-testid="erro-previa">{{ preview.erro }}</div>
      <div v-else-if="preview && preview.erro === undefined" class="flex items-center gap-1.5">
        <KeyRound class="h-3.5 w-3.5 text-amber-500" /> Entrega: {{ fmtDate(preview.projectFinish) }}
        <span v-if="preview.deltaDays > 0" class="chip-critical">+{{ preview.deltaDays }} dias úteis</span>
        <span v-else class="chip-ok">sem impacto</span>
      </div>
      <button class="btn-primary ml-auto" @click="generate"><Wand2 class="h-4 w-4" /> Gerar cronograma ({{ lines.length }} pacotes)</button>
    </div>
  </SectionCard>
</template>
