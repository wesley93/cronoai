<script setup lang="ts">
import { computed, ref } from 'vue'
import type { ScheduleResult, Task } from '@/types/domain'
import type { SummaryRollup } from '@/lib/wbs'
import { addCalendarDays, diffCalendarDays, parseISO, toISO } from '@/lib/calendar'
import { fmtDate, fmtMonth } from '@/lib/format'

const props = withDefaults(
  defineProps<{
    tasks: Task[]
    schedule: ScheduleResult
    rollups: Map<number, SummaryRollup>
    statusDate: string
    highlight?: number[]
    showBaseline?: boolean
    showLinks?: boolean
  }>(),
  { highlight: () => [], showBaseline: true, showLinks: true },
)

const zoom = ref<'mes' | 'semana'>('mes')
const ppd = computed(() => (zoom.value === 'mes' ? 2.2 : 6))
const ROW = 30
const LEFT = 300

interface Row {
  task: Task
  start: string
  finish: string
  bStart?: string
  bFinish?: string
  pct: number
  critical: boolean
  milestone: boolean
  y: number
}

const rows = computed<Row[]>(() =>
  props.tasks
    .map((t, i): Row | undefined => {
      const s = props.schedule.byUid.get(t.uid)
      const r = props.rollups.get(t.uid)
      const start = t.isSummary ? r?.start : s?.start
      const finish = t.isSummary ? r?.finish : s?.finish
      if (!start || !finish) return undefined
      return {
        task: t,
        start,
        finish,
        bStart: t.isSummary ? r?.baselineStart : t.baselineStart,
        bFinish: t.isSummary ? r?.baselineFinish : t.baselineFinish,
        pct: t.isSummary ? (r?.percentComplete ?? 0) : t.percentComplete,
        critical: t.isSummary ? false : !!s?.critical,
        milestone: !t.isSummary && t.durationDays === 0,
        y: i * ROW,
      }
    })
    .filter((x): x is Row => x !== undefined)
    .map((r, i) => ({ ...r, y: i * ROW })),
)

const range = computed(() => {
  const dates = rows.value.flatMap((r) => [r.start, r.finish, r.bStart, r.bFinish]).filter((d): d is string => !!d)
  dates.push(props.statusDate)
  const min = dates.reduce((a, b) => (b < a ? b : a))
  const max = dates.reduce((a, b) => (b > a ? b : a))
  const d = parseISO(min)
  const from = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
  return { from, to: addCalendarDays(max, 20) }
})

const x = (iso: string) => diffCalendarDays(range.value.from, iso) * ppd.value
const width = computed(() => x(range.value.to))
const height = computed(() => rows.value.length * ROW)

const months = computed(() => {
  const out: { label: string; x: number; w: number }[] = []
  let d = parseISO(range.value.from)
  while (toISO(d) < range.value.to) {
    const start = toISO(d)
    const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    const end = toISO(next) < range.value.to ? toISO(next) : range.value.to
    out.push({ label: fmtMonth(start), x: x(start), w: x(end) - x(start) })
    d = next
  }
  return out
})

const highlightSet = computed(() => new Set(props.highlight))
const rowByUid = computed(() => new Map(rows.value.map((r) => [r.task.uid, r])))

const links = computed(() => {
  if (!props.showLinks) return []
  const out: { d: string; critical: boolean }[] = []
  for (const r of rows.value) {
    if (r.task.isSummary) continue
    for (const p of r.task.predecessors) {
      const pr = rowByUid.value.get(p.uid)
      if (!pr || pr.task.isSummary) continue
      const fromX = p.type === 'SS' || p.type === 'SF' ? x(pr.start) : x(pr.finish) + ppd.value
      const toX = p.type === 'FF' || p.type === 'SF' ? x(r.finish) + ppd.value : x(r.start)
      const y1 = pr.y + ROW / 2
      const y2 = r.y + ROW / 2
      const midX = fromX + 6
      out.push({ d: `M${fromX},${y1} H${midX} V${y2} H${toX - 2}`, critical: pr.critical && r.critical })
    }
  }
  return out
})

function barTitle(r: Row) {
  const base = r.bStart ? `\nLinha de base: ${fmtDate(r.bStart)} → ${fmtDate(r.bFinish)}` : ''
  return `${r.task.wbs} ${r.task.name}\nPrevisto: ${fmtDate(r.start)} → ${fmtDate(r.finish)} · ${Math.round(r.pct)}%${base}`
}
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
    <div class="flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center gap-3 text-zinc-500">
        <span class="flex items-center gap-1"><span class="h-2 w-4 rounded-sm bg-coral-500" /> Crítica</span>
        <span class="flex items-center gap-1"><span class="h-2 w-4 rounded-sm bg-emerald-500" /> Com folga</span>
        <span class="flex items-center gap-1"><span class="h-2 w-4 rounded-sm bg-zinc-400 dark:bg-zinc-600" /> Concluída</span>
        <span v-if="showBaseline" class="flex items-center gap-1"><span class="h-1 w-4 rounded-sm bg-zinc-400/70" /> Linha de base</span>
        <span class="flex items-center gap-1"><span class="h-3 w-px border-l-2 border-dashed border-amber-400" /> Data de status</span>
        <span v-if="highlight.length" class="flex items-center gap-1"><span class="h-2 w-4 rounded-sm ring-2 ring-amber-400" /> Afetada pelo atraso</span>
      </div>
      <div class="flex rounded-md border border-zinc-200 dark:border-zinc-700">
        <button class="px-2 py-0.5" :class="zoom === 'mes' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" :aria-pressed="zoom === 'mes'" @click="zoom = 'mes'">Mês</button>
        <button class="px-2 py-0.5" :class="zoom === 'semana' ? 'bg-zinc-200 font-semibold dark:bg-zinc-700' : ''" :aria-pressed="zoom === 'semana'" @click="zoom = 'semana'">Semana</button>
      </div>
    </div>

    <div class="max-h-[560px] overflow-auto">
      <div class="relative" :style="{ width: `${LEFT + width}px` }">
        <!-- Cabeçalho -->
        <div class="sticky top-0 z-20 flex h-7 border-b border-zinc-200 bg-white text-[10px] dark:border-zinc-800 dark:bg-zinc-950">
          <div class="sticky left-0 z-10 flex shrink-0 items-center border-r border-zinc-200 bg-white px-3 font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950" :style="{ width: `${LEFT}px` }">
            EAP / Tarefa
          </div>
          <div class="relative" :style="{ width: `${width}px` }">
            <div v-for="m in months" :key="m.label" class="absolute top-0 flex h-full items-center border-l border-zinc-200 pl-1.5 capitalize text-zinc-500 dark:border-zinc-800" :style="{ left: `${m.x}px`, width: `${m.w}px` }">
              {{ m.label }}
            </div>
          </div>
        </div>

        <div class="relative flex">
          <!-- Coluna de nomes -->
          <div class="sticky left-0 z-10 shrink-0 border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950" :style="{ width: `${LEFT}px` }">
            <div
              v-for="r in rows"
              :key="r.task.uid"
              class="flex items-center gap-2 border-b border-zinc-100 px-3 text-[11.5px] dark:border-zinc-900"
              :style="{ height: `${ROW}px`, paddingLeft: `${12 + (r.task.outlineLevel - 1) * 12}px` }"
              :title="`[UID ${r.task.uid}] ${r.task.wbs} - ${r.task.name}`"
            >
              <span class="mono shrink-0 text-zinc-400">{{ r.task.wbs }}</span>
              <span class="truncate" :class="[r.task.isSummary ? 'font-semibold' : '', r.critical ? 'text-coral-600 dark:text-coral-400' : '']">{{ r.task.name }}</span>
            </div>
          </div>

          <!-- Área do gráfico -->
          <div class="relative" :style="{ width: `${width}px`, height: `${height}px` }">
            <div v-for="m in months" :key="`g${m.label}`" class="absolute inset-y-0 border-l border-zinc-100 dark:border-zinc-900" :style="{ left: `${m.x}px` }" />
            <div v-for="r in rows" :key="`row${r.task.uid}`" class="absolute inset-x-0 border-b border-zinc-100 dark:border-zinc-900" :style="{ top: `${r.y}px`, height: `${ROW}px` }" />

            <svg v-if="links.length" class="pointer-events-none absolute inset-0" :width="width" :height="height">
              <path
                v-for="(l, i) in links"
                :key="i"
                :d="l.d"
                fill="none"
                :stroke="l.critical ? '#ff6b5e' : '#a1a1aa'"
                :stroke-opacity="l.critical ? 0.8 : 0.35"
                stroke-width="1"
              />
            </svg>

            <template v-for="r in rows" :key="`bar${r.task.uid}`">
              <!-- Linha de base -->
              <div
                v-if="showBaseline && r.bStart && r.bFinish && !r.task.isSummary && !r.milestone"
                class="absolute h-[3px] rounded-full bg-zinc-400/60 dark:bg-zinc-500/60"
                :style="{ left: `${x(r.bStart)}px`, width: `${Math.max(2, x(r.bFinish) - x(r.bStart) + ppd)}px`, top: `${r.y + ROW - 7}px` }"
              />
              <!-- Resumo -->
              <div
                v-if="r.task.isSummary"
                class="absolute h-2 bg-zinc-700 dark:bg-zinc-300"
                :style="{ left: `${x(r.start)}px`, width: `${Math.max(3, x(r.finish) - x(r.start) + ppd)}px`, top: `${r.y + 10}px`, clipPath: 'polygon(0 0,100% 0,100% 100%,calc(100% - 5px) 50%,5px 50%,0 100%)' }"
                :title="barTitle(r)"
              />
              <!-- Marco -->
              <div
                v-else-if="r.milestone"
                class="absolute h-3 w-3 rotate-45 border-2"
                :class="r.critical ? 'border-coral-500 bg-coral-500/30' : 'border-zinc-500 bg-zinc-400/30'"
                :style="{ left: `${x(r.finish) - 2}px`, top: `${r.y + 8}px` }"
                :title="barTitle(r)"
              />
              <!-- Tarefa -->
              <div
                v-else
                class="absolute overflow-hidden rounded-[3px]"
                :class="[
                  r.pct >= 100 ? 'bg-zinc-400 dark:bg-zinc-600' : r.critical ? 'bg-coral-500/80' : 'bg-emerald-500/75',
                  highlightSet.has(r.task.uid) ? 'ring-2 ring-amber-400 ring-offset-1 ring-offset-white dark:ring-offset-zinc-950' : '',
                ]"
                :style="{ left: `${x(r.start)}px`, width: `${Math.max(3, x(r.finish) - x(r.start) + ppd)}px`, top: `${r.y + 7}px`, height: '13px' }"
                :title="barTitle(r)"
              >
                <div class="h-full bg-black/25 dark:bg-black/35" :style="{ width: `${r.pct}%` }" />
              </div>
            </template>

            <div class="absolute inset-y-0 z-[5] border-l-2 border-dashed border-amber-400" :style="{ left: `${x(statusDate) + ppd}px` }" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
