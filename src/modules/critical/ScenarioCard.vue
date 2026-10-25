<script setup lang="ts">
import { computed } from 'vue'
import { Users, GitMerge, CalendarPlus, CheckCircle2, Undo2, Play, Sparkles, Calculator } from '@lucide/vue'
import type { ScenarioResult } from '@/lib/scenarios'
import { fmtBRL, fmtDate } from '@/lib/format'
import { rotuloVersao } from '@/lib/premissas'

const props = defineProps<{ result: ScenarioResult; applied: boolean; recommended?: boolean }>()
defineEmits<{ apply: []; undo: [] }>()

const icon = computed(() => ({ crashing: Users, 'fast-tracking': GitMerge, overtime: CalendarPlus })[props.result.kind])
const riskClass = computed(() => ({ Baixo: 'chip-ok', Médio: 'chip-warn', Alto: 'chip-critical' })[props.result.risk])
const net = computed(() => props.result.netImpact)
/** Versão das premissas usada no cálculo; cenário aplicado antes das premissas versionadas não a registrou. */
const versaoUsada = computed(() => (props.result.premissas ? rotuloVersao(props.result.premissas) : 'Premissas: versão não registrada (cenário aplicado antes das premissas versionadas)'))
</script>

<template>
  <article class="card flex flex-col p-4" :class="applied ? 'ring-1 ring-emerald-500/60' : recommended ? 'ring-1 ring-amber-400/70' : ''">
    <div class="flex items-start justify-between gap-2">
      <div class="flex items-center gap-2">
        <div class="grid h-8 w-8 place-items-center rounded-lg bg-amber-400/15"><component :is="icon" class="h-4 w-4 text-amber-500" /></div>
        <div>
          <h3 class="text-sm font-semibold">{{ result.title }}</h3>
          <p class="text-[11px] text-zinc-500">Risco <span :class="riskClass">{{ result.risk }}</span></p>
        </div>
      </div>
      <span v-if="applied" class="chip-ok"><CheckCircle2 class="h-3 w-3" /> Aplicado</span>
      <span v-else-if="recommended" class="chip-warn"><Sparkles class="h-3 w-3" /> Recomendado</span>
    </div>

    <!-- Parâmetros do cenário -->
    <div v-if="!applied && $slots.controls" class="mt-3 space-y-2.5 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <slot name="controls" />
    </div>

    <template v-if="result.applicable || applied">
      <p class="mt-3 min-h-[36px] text-[12px] text-zinc-600 dark:text-zinc-300">{{ result.summary }}</p>
      <p class="mt-1 text-[10.5px] text-zinc-500" data-testid="versao-premissas">{{ versaoUsada }}</p>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <div class="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
          <div class="eyebrow">Prazo recuperado</div>
          <div class="mt-0.5 text-xl font-semibold tabular-nums" :class="result.daysRecovered > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'">
            {{ result.daysRecovered > 0 ? `−${result.daysRecovered}` : '0' }} <span class="text-xs font-medium">dias úteis</span>
          </div>
        </div>
        <div class="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60">
          <div class="eyebrow">Nova entrega</div>
          <div class="mt-0.5 text-xl font-semibold tabular-nums">{{ fmtDate(result.newFinish) }}</div>
        </div>
      </div>

      <dl class="mt-3 space-y-1.5 text-[12px]">
        <div class="flex justify-between"><dt class="text-zinc-500">Custo extra</dt><dd class="font-medium tabular-nums text-coral-600 dark:text-coral-400">+ {{ fmtBRL(result.extraCost) }}</dd></div>
        <div class="flex justify-between"><dt class="text-zinc-500">Economia de custo indireto</dt><dd class="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">− {{ fmtBRL(result.indirectSavings) }}</dd></div>
        <div class="flex justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-800">
          <dt class="font-medium">Saldo financeiro</dt>
          <dd class="font-semibold tabular-nums" :class="net > 0 ? 'text-coral-600 dark:text-coral-400' : 'text-emerald-600 dark:text-emerald-400'">
            {{ net > 0 ? `custa ${fmtBRL(net)}` : `economiza ${fmtBRL(-net)}` }}
          </dd>
        </div>
        <div class="flex justify-between text-[11px]">
          <dt class="text-zinc-500">Custo extra por dia recuperado</dt>
          <dd class="tabular-nums">{{ Number.isFinite(result.costPerDay) ? `${fmtBRL(result.costPerDay)}/dia` : '—' }}</dd>
        </div>
      </dl>

      <ul class="mt-3 space-y-1 border-t border-zinc-200 pt-3 text-[11px] dark:border-zinc-800">
        <li v-for="d in result.details" :key="d.label" class="flex justify-between gap-2"><span class="text-zinc-500">{{ d.label }}</span><span class="text-right font-medium">{{ d.value }}</span></li>
      </ul>

      <details v-if="result.memory.length" class="group mt-3 rounded-md border border-zinc-200 dark:border-zinc-800">
        <summary class="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
          <Calculator class="h-3.5 w-3.5 text-amber-500" /> Memória de cálculo
        </summary>
        <ol class="space-y-1 border-t border-zinc-200 px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          <li v-for="(m, i) in result.memory" :key="i" class="whitespace-pre-wrap">{{ m }}</li>
        </ol>
      </details>

      <p class="mt-3 rounded-md bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-500 dark:bg-zinc-800/50">{{ result.riskNote }}</p>

      <div class="mt-auto pt-4">
        <button v-if="!applied" class="btn-primary w-full" :disabled="!result.applicable || result.daysRecovered <= 0" @click="$emit('apply')">
          <Play class="h-3.5 w-3.5" /> {{ result.daysRecovered > 0 ? 'Aplicar no cronograma' : 'Não recupera prazo' }}
        </button>
        <button v-else class="btn-secondary w-full" @click="$emit('undo')"><Undo2 class="h-3.5 w-3.5" /> Desfazer cenário</button>
      </div>
    </template>
    <p v-else class="mt-3 text-[12px] text-zinc-500">{{ result.reason }}</p>
  </article>
</template>
