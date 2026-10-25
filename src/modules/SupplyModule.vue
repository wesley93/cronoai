<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Truck, OctagonAlert, CalendarClock, PackageCheck, Info, Send, CalendarRange, PackagePlus, Trash2, PackageOpen, CalendarDays } from '@lucide/vue'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import KpiTile from '@/components/common/KpiTile.vue'
import { addCalendarDays, diffCalendarDays } from '@/lib/calendar'
import type { SupplyAnalysis, SupplyStatus } from '@/lib/supplies'
import { fmtBRL, fmtBRLCompact, fmtDate } from '@/lib/format'

const project = useProjectStore()
const ui = useUiStore()
const statusDate = computed(() => project.state.meta.statusDate)

const STATUS: Record<SupplyStatus, { label: string; cls: string; dot: string }> = {
  ruptura: { label: '🔴 Ruptura em campo', cls: 'chip-critical', dot: 'bg-coral-500' },
  atrasada: { label: '🔴 Compra atrasada', cls: 'chip-critical', dot: 'bg-coral-500' },
  'entrega-tardia': { label: '🔴 Entrega tardia', cls: 'chip-critical', dot: 'bg-coral-500' },
  reagendar: { label: '🟡 Reagendar entrega', cls: 'chip-warn', dot: 'bg-amber-400' },
  atencao: { label: '🟠 Pedir esta semana', cls: 'chip-warn', dot: 'bg-amber-500' },
  ok: { label: '🟢 No prazo', cls: 'chip-ok', dot: 'bg-emerald-500' },
  entregue: { label: '✔ Entregue', cls: 'chip-neutral', dot: 'bg-zinc-400' },
}
const CRITICAL: SupplyStatus[] = ['ruptura', 'atrasada', 'entrega-tardia']

type Filter = 'todos' | 'criticos' | 'reagendar' | 'pedir' | 'ok' | 'entregue'
const filter = ref<Filter>('todos')
const FILTERS: { id: Filter; label: string; match: (s: SupplyStatus) => boolean }[] = [
  { id: 'todos', label: 'Todos', match: () => true },
  { id: 'criticos', label: 'Vão parar a obra', match: (s) => CRITICAL.includes(s) },
  { id: 'reagendar', label: 'Reagendar', match: (s) => s === 'reagendar' },
  { id: 'pedir', label: 'Pedir esta semana', match: (s) => s === 'atencao' },
  { id: 'ok', label: 'No prazo', match: (s) => s === 'ok' },
  { id: 'entregue', label: 'Entregues', match: (s) => s === 'entregue' },
]
const rows = computed(() => project.supplies.filter((r) => FILTERS.find((f) => f.id === filter.value)!.match(r.status)))
const countOf = (f: (typeof FILTERS)[number]) => project.supplies.filter((r) => f.match(r.status)).length

const critical = computed(() => project.supplies.filter((r) => CRITICAL.includes(r.status)))
const reschedule = computed(() => project.supplies.filter((r) => r.status === 'reagendar'))
const deferred = computed(() => reschedule.value.reduce((a, r) => a + r.orderValue, 0))
const openOrders = computed(() => project.supplies.filter((r) => !r.material.ordered).reduce((a, r) => a + r.orderValue, 0))

// Agenda de pedidos: insumos sem pedido agrupados pela distância até a DLP
const agenda = computed(() => {
  const open = project.supplies.filter((r) => !r.material.ordered).map((r) => ({ r, days: diffCalendarDays(statusDate.value, r.dlp) }))
  const groups = [
    { id: 'vencidos', label: 'DLP vencida', tone: 'text-coral-600 dark:text-coral-400', items: open.filter((x) => x.days < 0) },
    { id: 'semana', label: 'Próximos 7 dias', tone: 'text-amber-600 dark:text-amber-300', items: open.filter((x) => x.days >= 0 && x.days <= 7) },
    { id: 'mes', label: '8 a 30 dias', tone: 'text-zinc-700 dark:text-zinc-200', items: open.filter((x) => x.days > 7 && x.days <= 30) },
    { id: 'depois', label: 'Após 30 dias', tone: 'text-zinc-500', items: open.filter((x) => x.days > 30) },
  ]
  for (const g of groups) g.items.sort((a, b) => a.days - b.days)
  return groups
})

function emitOrder(r: SupplyAnalysis) {
  const earliest = addCalendarDays(statusDate.value, r.material.leadTimeDays)
  const ideal = addCalendarDays(r.needDate, -2)
  const delivery = ideal > earliest ? ideal : earliest
  project.orderMaterial(r.material.id, delivery)
  ui.notify('success', `Pedido emitido: ${r.material.name}`, `${fmtBRL(r.orderValue)} · entrega programada para ${fmtDate(delivery)}.`)
}

function applyReschedule(r: SupplyAnalysis) {
  if (!r.recommendedDelivery) return
  project.rescheduleDelivery(r.material.id, r.recommendedDelivery)
  ui.notify('success', `Entrega reagendada: ${r.material.name}`, `Nova data ${fmtDate(r.recommendedDelivery)} · ${fmtBRLCompact(r.orderValue)} postergados no fluxo de caixa.`)
}

function receive(r: SupplyAnalysis) {
  project.registerDelivery(r.material.id)
  ui.notify('success', `Recebido no canteiro: ${r.material.name}`, 'Status atualizado e restrições de material resolvidas.')
}

function remove(r: SupplyAnalysis) {
  if (window.confirm(`Remover "${r.material.name}" do painel de suprimentos?`)) project.removeMaterial(r.material.id)
}

function editNumber(r: SupplyAnalysis, field: 'leadTimeDays' | 'quantity' | 'unitPrice', raw: string) {
  const v = Number(raw.replace(',', '.'))
  const max = field === 'leadTimeDays' ? 365 : 1e9
  if (!Number.isFinite(v) || v < 0 || v > max) return
  const value = field === 'leadTimeDays' ? Math.round(v) : v
  if (value !== r.material[field]) project.updateMaterial(r.material.id, { [field]: value })
}

function setMargin(raw: string) {
  const v = Number(raw)
  if (Number.isFinite(v)) project.setSafetyMargin(v)
}

// Cadastro de novo insumo
const showForm = ref(false)
const blank = () => ({ name: '', spec: '', unit: 'un', quantity: 1, unitPrice: 0, supplier: '', taskUid: project.leaves.find((t) => t.percentComplete < 100)?.uid ?? 0, leadTimeDays: 10 })
const form = reactive(blank())
const formValid = computed(() => form.name.trim().length >= 3 && form.quantity > 0 && form.leadTimeDays >= 0 && form.leadTimeDays <= 365 && project.taskByUid.has(form.taskUid))
function addMaterial() {
  if (!formValid.value) {
    ui.notify('warning', 'Dados incompletos', 'Informe nome, quantidade, lead time (0–365 dias) e a tarefa vinculada.')
    return
  }
  const m = project.addMaterial({
    name: form.name.trim().slice(0, 80),
    spec: form.spec.trim().slice(0, 120),
    unit: form.unit.trim().slice(0, 8) || 'un',
    quantity: form.quantity,
    unitPrice: Math.max(0, form.unitPrice),
    supplier: form.supplier.trim().slice(0, 80) || 'A definir',
    taskUid: form.taskUid,
    leadTimeDays: Math.round(form.leadTimeDays),
  })
  const a = project.supplies.find((x) => x.material.id === m.id)
  ui.notify('success', `Insumo cadastrado: ${m.name}`, a ? `Necessário em ${fmtDate(a.needDate)} · DLP ${fmtDate(a.dlp)}.` : '')
  Object.assign(form, blank())
  showForm.value = false
}

// Linha do tempo: janela de 150 dias a partir de 30 dias antes da data de status
const windowStart = computed(() => addCalendarDays(statusDate.value, -30))
const WINDOW = 150
const pos = (iso?: string) => (iso ? Math.max(0, Math.min(100, (diffCalendarDays(windowStart.value, iso) / WINDOW) * 100)) : 0)
const inWindow = (iso?: string) => !!iso && diffCalendarDays(windowStart.value, iso) >= 0 && diffCalendarDays(windowStart.value, iso) <= WINDOW
const cellInput =
  'w-16 rounded border border-transparent bg-transparent px-1 text-right tabular-nums hover:border-zinc-300 focus:border-amber-400 focus:outline-none dark:hover:border-zinc-700'
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Dor 3"
      title="Orquestrador de Suprimentos Just-in-Time"
      description="Cruza o início reprogramado de cada tarefa do MS Project com o lead time dos insumos críticos e calcula a Data Limite de Pedido (DLP)."
    >
      <label class="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-[11px] dark:border-zinc-800">
        <span class="font-mono text-zinc-500">DLP = Necessária − Lead time −</span>
        <input
          :value="project.safetyMarginDays"
          type="number"
          min="0"
          max="30"
          class="w-12 rounded border border-zinc-300 bg-transparent px-1 text-center font-mono tabular-nums focus:border-amber-400 focus:outline-none dark:border-zinc-700"
          aria-label="Margem de segurança em dias"
          @change="setMargin(($event.target as HTMLInputElement).value)"
        />
        <span class="font-mono text-zinc-500">dias</span>
      </label>
      <button class="btn-primary" @click="showForm = !showForm"><PackagePlus class="h-3.5 w-3.5" /> Novo insumo</button>
    </ModuleHeader>

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KpiTile label="Vai parar a obra" :value="String(critical.length)" sub="compras/entregas críticas" :tone="critical.length ? 'critical' : 'ok'" :icon="OctagonAlert" />
      <KpiTile label="Reagendar entrega" :value="String(reschedule.length)" sub="frentes atrasadas" :tone="reschedule.length ? 'warn' : 'ok'" :icon="CalendarClock" />
      <KpiTile label="Caixa a postergar" :value="fmtBRLCompact(deferred)" sub="adiando entregas sugeridas" tone="accent" :icon="CalendarRange" />
      <KpiTile label="Pedidos a emitir" :value="fmtBRLCompact(openOrders)" :sub="`${project.supplies.filter((r) => !r.material.ordered).length} insumos sem pedido`" :icon="PackageCheck" />
    </div>

    <!-- Cadastro -->
    <SectionCard v-if="showForm" title="Cadastrar insumo crítico" subtitle="A DLP é calculada a partir do início reprogramado da tarefa vinculada" :icon="PackagePlus">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="lg:col-span-2"><label class="label">Insumo</label><input v-model="form.name" class="input" maxlength="80" placeholder="Ex.: Esquadria de alumínio" /></div>
        <div class="lg:col-span-2"><label class="label">Especificação</label><input v-model="form.spec" class="input" maxlength="120" placeholder="Linha, acabamento, norma…" /></div>
        <div class="lg:col-span-2">
          <label class="label">Tarefa do MS Project que consome o insumo</label>
          <select v-model.number="form.taskUid" class="input text-xs">
            <option v-for="t in project.leaves" :key="t.uid" :value="t.uid">[UID {{ t.uid }}] {{ t.wbs }} - {{ t.name }}</option>
          </select>
        </div>
        <div><label class="label">Lead time do fornecedor (dias)</label><input v-model.number="form.leadTimeDays" type="number" min="0" max="365" class="input tabular-nums" /></div>
        <div><label class="label">Fornecedor</label><input v-model="form.supplier" class="input" maxlength="80" /></div>
        <div><label class="label">Quantidade</label><input v-model.number="form.quantity" type="number" min="0" step="any" class="input tabular-nums" /></div>
        <div><label class="label">Unidade</label><input v-model="form.unit" class="input" maxlength="8" /></div>
        <div><label class="label">Preço unitário (R$)</label><input v-model.number="form.unitPrice" type="number" min="0" step="0.01" class="input tabular-nums" /></div>
        <div class="flex items-end gap-2">
          <button class="btn-primary flex-1" :disabled="!formValid" @click="addMaterial"><PackagePlus class="h-3.5 w-3.5" /> Cadastrar</button>
          <button class="btn-ghost" @click="showForm = false">Cancelar</button>
        </div>
      </div>
    </SectionCard>

    <!-- Alertas inteligentes -->
    <div v-if="critical.length || reschedule.length" class="grid gap-4 lg:grid-cols-2">
      <article v-for="r in [...critical, ...reschedule]" :key="r.material.id" class="card p-4" :class="r.status === 'reagendar' ? 'border-amber-400/50' : 'border-coral-500/50'">
        <div class="flex items-start gap-3">
          <component :is="r.status === 'reagendar' ? CalendarClock : OctagonAlert" class="mt-0.5 h-5 w-5 shrink-0" :class="r.status === 'reagendar' ? 'text-amber-500' : 'text-coral-500'" />
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span :class="STATUS[r.status].cls">{{ STATUS[r.status].label }}</span>
              <span class="text-sm font-semibold">{{ r.material.name }}</span>
            </div>
            <p class="mt-1 text-[12.5px] font-medium">{{ r.headline }}</p>
            <p class="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-300">{{ r.message }}</p>
            <p class="mt-1 text-[11px] text-zinc-500">
              Tarefa [UID {{ r.material.taskUid }}] {{ r.task?.wbs }} · necessária em {{ fmtDate(r.needDate) }} · lead time {{ r.material.leadTimeDays }} dias · DLP {{ fmtDate(r.dlp) }}
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              <button v-if="!r.material.ordered" class="btn-danger" @click="emitOrder(r)"><Send class="h-3.5 w-3.5" /> Emitir pedido agora</button>
              <button v-if="r.recommendedDelivery" class="btn-primary" @click="applyReschedule(r)">
                <CalendarClock class="h-3.5 w-3.5" />
                {{ r.status === 'reagendar' ? `Adiar entrega para ${fmtDate(r.recommendedDelivery)} (+${r.postponeDays} dias)` : `Antecipar para ${fmtDate(r.recommendedDelivery)}` }}
              </button>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- Agenda de pedidos -->
    <SectionCard title="Agenda de pedidos" subtitle="Insumos sem pedido, pela distância até a Data Limite de Pedido" :icon="CalendarDays" body-class="p-3">
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div v-for="g in agenda" :key="g.id" class="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div class="mb-2 flex items-center justify-between">
            <span class="eyebrow" :class="g.tone">{{ g.label }}</span>
            <span class="chip-neutral">{{ g.items.length }}</span>
          </div>
          <ul v-if="g.items.length" class="space-y-2">
            <li v-for="x in g.items" :key="x.r.material.id" class="flex items-start justify-between gap-2 text-[12px]">
              <div class="min-w-0">
                <div class="truncate font-medium" :title="x.r.material.name">{{ x.r.material.name }}</div>
                <div class="text-[11px] text-zinc-500">DLP {{ fmtDate(x.r.dlp) }} · {{ x.days < 0 ? `vencida há ${-x.days} d` : x.days === 0 ? 'vence hoje' : `em ${x.days} d` }}</div>
              </div>
              <button class="btn-secondary shrink-0 px-2 py-1" @click="emitOrder(x.r)">Pedir</button>
            </li>
          </ul>
          <p v-else class="text-[11px] text-zinc-500">Nada aqui.</p>
        </div>
      </div>
    </SectionCard>

    <SectionCard title="Painel de insumos críticos x cronograma" subtitle="Lead time, quantidade e preço editáveis · datas recalculadas a cada apontamento ou cenário" :icon="Truck" body-class="overflow-x-auto">
      <template #actions>
        <div class="flex flex-wrap gap-1 text-[11px]" role="tablist" aria-label="Filtrar insumos">
          <button
            v-for="f in FILTERS"
            :key="f.id"
            role="tab"
            :aria-selected="filter === f.id"
            class="rounded-md px-2 py-1"
            :class="filter === f.id ? 'bg-zinc-200 font-semibold dark:bg-zinc-800' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'"
            @click="filter = f.id"
          >
            {{ f.label }} <span class="tabular-nums text-zinc-400">{{ countOf(f) }}</span>
          </button>
        </div>
      </template>
      <table class="table-base">
        <thead>
          <tr>
            <th>Status</th><th>Insumo</th><th>Tarefa (MS Project)</th><th class="text-right">Qtd.</th><th class="text-right">Preço unit.</th><th class="text-right">Valor</th>
            <th>Data necessária</th><th class="text-right">Lead time</th><th>DLP</th><th>Pedido / Entrega</th><th class="min-w-[200px]">Linha do tempo</th><th />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.material.id">
            <td><span :class="STATUS[r.status].cls">{{ STATUS[r.status].label }}</span></td>
            <td class="min-w-[180px]">
              <div class="font-medium">{{ r.material.name }}</div>
              <div class="text-[10.5px] text-zinc-500">{{ r.material.spec }} · {{ r.material.supplier }}</div>
            </td>
            <td class="max-w-[200px]">
              <div class="mono">[UID {{ r.material.taskUid }}] {{ r.task?.wbs }}</div>
              <div class="truncate text-[10.5px] text-zinc-500" :title="r.task?.name">{{ r.task?.name }}</div>
            </td>
            <td class="whitespace-nowrap text-right">
              <input :value="r.material.quantity" :class="cellInput" class="w-20" aria-label="Quantidade" @change="editNumber(r, 'quantity', ($event.target as HTMLInputElement).value)" />
              <span class="text-[10.5px] text-zinc-500">{{ r.material.unit }}</span>
            </td>
            <td class="text-right">
              <input :value="r.material.unitPrice" :class="cellInput" class="w-20" aria-label="Preço unitário" @change="editNumber(r, 'unitPrice', ($event.target as HTMLInputElement).value)" />
            </td>
            <td class="text-right tabular-nums">{{ fmtBRLCompact(r.orderValue) }}</td>
            <td class="tabular-nums font-medium">{{ fmtDate(r.needDate) }}</td>
            <td class="whitespace-nowrap text-right">
              <input :value="r.material.leadTimeDays" :class="cellInput" class="w-12" aria-label="Lead time em dias" @change="editNumber(r, 'leadTimeDays', ($event.target as HTMLInputElement).value)" /><span class="text-[10.5px] text-zinc-500">d</span>
            </td>
            <td class="tabular-nums font-semibold" :class="r.dlp < statusDate && !r.material.ordered ? 'text-coral-600 dark:text-coral-400' : ''">{{ fmtDate(r.dlp) }}</td>
            <td class="text-[11px]">
              <template v-if="r.material.ordered">
                <div>Pedido {{ fmtDate(r.material.orderDate) }}</div>
                <div class="text-zinc-500">Entrega {{ fmtDate(r.material.deliveryDate) }}</div>
              </template>
              <span v-else class="text-zinc-500">Não emitido</span>
            </td>
            <td>
              <div class="relative h-5 rounded bg-zinc-100 dark:bg-zinc-800">
                <div class="absolute inset-y-0 w-px bg-amber-400" :style="{ left: `${pos(statusDate)}%` }" title="Data de status" />
                <div v-if="inWindow(r.dlp)" class="absolute top-1 h-3 w-1.5 -translate-x-1/2 rounded-sm bg-zinc-500" :style="{ left: `${pos(r.dlp)}%` }" :title="`DLP ${fmtDate(r.dlp)}`" />
                <div v-if="inWindow(r.material.deliveryDate)" class="absolute top-1 h-3 w-3 -translate-x-1/2 rotate-45 bg-sky-500" :style="{ left: `${pos(r.material.deliveryDate)}%` }" :title="`Entrega ${fmtDate(r.material.deliveryDate)}`" />
                <div v-if="inWindow(r.needDate)" class="absolute top-0.5 h-4 w-1 -translate-x-1/2 rounded-sm" :class="STATUS[r.status].dot" :style="{ left: `${pos(r.needDate)}%` }" :title="`Necessária ${fmtDate(r.needDate)}`" />
                <span v-if="!inWindow(r.needDate)" class="absolute right-1 top-0.5 text-[9px] text-zinc-500">necessária → {{ fmtDate(r.needDate) }}</span>
              </div>
            </td>
            <td class="whitespace-nowrap text-right">
              <button v-if="!r.material.ordered" class="btn-secondary px-2 py-1" @click="emitOrder(r)">Emitir pedido</button>
              <button v-else-if="r.status !== 'entregue'" class="btn-secondary px-2 py-1" title="Registrar recebimento no canteiro" @click="receive(r)"><PackageOpen class="h-3.5 w-3.5" /> Recebido</button>
              <button class="btn-ghost ml-1 px-1.5 py-1" title="Remover insumo" :aria-label="`Remover ${r.material.name}`" @click="remove(r)"><Trash2 class="h-3.5 w-3.5" /></button>
            </td>
          </tr>
          <tr v-if="!rows.length"><td colspan="12" class="py-8 text-center text-zinc-500">Nenhum insumo neste filtro.</td></tr>
        </tbody>
      </table>
      <div class="flex flex-wrap items-center gap-4 border-t border-zinc-200 px-4 py-2.5 text-[10.5px] text-zinc-500 dark:border-zinc-800">
        <span class="flex items-center gap-1"><span class="h-3 w-px bg-amber-400" /> Data de status</span>
        <span class="flex items-center gap-1"><span class="h-3 w-1.5 rounded-sm bg-zinc-500" /> DLP</span>
        <span class="flex items-center gap-1"><span class="h-2.5 w-2.5 rotate-45 bg-sky-500" /> Entrega programada</span>
        <span class="flex items-center gap-1"><span class="h-3 w-1 rounded-sm bg-emerald-500" /> Data necessária</span>
        <span class="ml-auto flex items-center gap-1"><Info class="h-3 w-3" /> Lead times e preços são de exemplo — confirme com Suprimentos e fornecedores.</span>
      </div>
    </SectionCard>
  </div>
</template>
