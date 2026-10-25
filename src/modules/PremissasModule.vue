<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CalendarClock, History, SlidersHorizontal, Users } from '@lucide/vue'
import type { PremissasObra } from '@/types/domain'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import PremissasForm from './premissas/PremissasForm.vue'
import TaxasFuncao from './premissas/TaxasFuncao.vue'
import VersoesPremissas from './premissas/VersoesPremissas.vue'
import { resumoJornadaSemana, calendarioDeDias } from '@/lib/calendarioTrabalho'
import { diasUteisNoAno, MAX_MOTIVO, rotuloVersao, validarNovaVersao } from '@/lib/premissas'
import { ROTULO_REGIME_SINAPI } from '@/data/ufs'

const project = useProjectStore()
const ui = useUiStore()

const clonar = (p: PremissasObra): PremissasObra => JSON.parse(JSON.stringify(p)) as PremissasObra

// Rascunho local: nada vale até "Salvar como nova versão" (a versão antiga nunca é alterada)
const rascunho = ref<PremissasObra>(clonar(project.premissasVigentes))
const vigencia = ref(project.state.meta.statusDate)
const motivo = ref('')
const tentou = ref(false)

const alterado = computed(() => JSON.stringify(rascunho.value) !== JSON.stringify(project.premissasVigentes))
const erros = computed(() => (alterado.value ? validarNovaVersao(project.state.premissas, { vigencia: vigencia.value, motivo: motivo.value, valores: rascunho.value }) : []))
const ilustrativa = computed(() => Object.values(project.premissasVigentes.origens).some((o) => o?.origem === 'ilustrativa') || project.premissasVigentes.taxas.some((t) => t.origem === 'ilustrativa'))
const agendadas = computed(() => project.state.premissas.filter((v) => v.vigencia > project.state.meta.statusDate).length)

// Depois de salvar (ou de mudar a data de status), o rascunho volta a ser a versão vigente
watch(
  () => project.versaoPremissasVigente.versao,
  () => descartar(),
)

function descartar() {
  rascunho.value = clonar(project.premissasVigentes)
  vigencia.value = project.state.meta.statusDate
  motivo.value = ''
  tentou.value = false
}

function salvar() {
  tentou.value = true
  if (!alterado.value || erros.value.length) return
  const r = project.criarVersaoPremissas({ vigencia: vigencia.value, motivo: motivo.value, valores: rascunho.value })
  if (!r.ok) {
    ui.notify('error', 'Premissas não salvas', r.erro)
    return
  }
  const v = project.state.premissas[project.state.premissas.length - 1]
  ui.notify('success', `${rotuloVersao(v)} criada`, v.vigencia > project.state.meta.statusDate ? 'A versão está agendada: só passa a valer na data de vigência.' : 'Cenários e suprimentos recalculados com as novas premissas.')
  descartar()
}

// Dias úteis do calendário padrão no ano da vigência (divisor do custo indireto mensal)
const ano = computed(() => Number(vigencia.value.slice(0, 4)) || Number(project.state.meta.startDate.slice(0, 4)))
const diasUteisAno = computed(() => {
  try {
    return diasUteisNoAno(project.calendariosPv.padrao, ano.value)
  } catch {
    return 0
  }
})
const calendarioPadrao = computed(() => project.state.calendarios.find((c) => c.uid === project.state.calendarioPadraoUid))
const jornada = computed(() => (calendarioPadrao.value ? resumoJornadaSemana(calendarioPadrao.value) : '—'))
const diasUteisHoje = computed(() => {
  try {
    return calendarioDeDias(project.calendariosPv.padrao).countWorkingBetween(project.state.meta.startDate, project.state.meta.statusDate)
  } catch {
    return 0
  }
})
const regime = computed(() => (project.state.meta.regimeSinapi ? ROTULO_REGIME_SINAPI[project.state.meta.regimeSinapi] : 'não informado'))
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Base"
      title="Premissas da obra"
      description="Custos, taxas e fatores usados nos cenários e na data limite de pedido, com a origem de cada um. Alterar cria uma versão nova, com data de vigência."
    >
      <span class="chip-ok" data-testid="versao-vigente">{{ rotuloVersao(project.versaoPremissasVigente) }}</span>
      <span v-if="ilustrativa" class="chip-warn" title="Há valores de exemplo, ainda sem fonte documentada">Ilustrativa</span>
      <span v-if="agendadas" class="chip-info">{{ agendadas }} agendada(s)</span>
    </ModuleHeader>

    <SectionCard title="Valores e origem" subtitle="Cada valor mostra de onde vem. Valores de exemplo ficam marcados como ilustrativos até você informar a fonte." :icon="SlidersHorizontal">
      <PremissasForm v-model="rascunho" :ano="ano" :dias-uteis-ano="diasUteisAno" />
      <p class="mt-3 text-[11px] text-zinc-500">
        Regime de encargos do SINAPI: {{ regime }} (definido nos dados da obra). Percentuais de 0 a 100.
      </p>
    </SectionCard>

    <SectionCard title="Taxas por função" subtitle="Custo horário usado na mão de obra extra e na hora extra." :icon="Users">
      <TaxasFuncao v-model="rascunho.taxas" :encargos-sociais-pct="rascunho.encargosSociaisPct" :taxa-padrao="rascunho.taxaFuncaoNaoCadastrada" />
    </SectionCard>

    <SectionCard title="Jornada" subtitle="A jornada e os dias úteis vêm do calendário padrão da obra." :icon="CalendarClock">
      <p class="text-sm" data-testid="jornada-resumo">Calendário padrão: <strong>{{ jornada }}</strong></p>
      <p class="mt-1 text-[11px] text-zinc-500">{{ diasUteisAno }} dias úteis em {{ ano }} no calendário padrão; {{ diasUteisHoje }} dias úteis desde o início da obra até a data de status.</p>
    </SectionCard>

    <section class="card p-5" aria-label="Salvar as premissas">
      <div class="grid gap-3 md:grid-cols-[180px_1fr_auto]">
        <div>
          <label class="label" for="premissas-vigencia">Vigência da nova versão</label>
          <input id="premissas-vigencia" v-model="vigencia" type="date" class="input" />
        </div>
        <div>
          <label class="label" for="premissas-motivo">Motivo da alteração</label>
          <input id="premissas-motivo" v-model="motivo" class="input" :maxlength="MAX_MOTIVO" autocomplete="off" placeholder="Ex.: orçamento revisado em outubro" />
        </div>
        <div class="flex items-end gap-2">
          <button type="button" class="btn-primary" :disabled="!alterado" @click="salvar">Salvar como nova versão</button>
          <button type="button" class="btn-ghost" :disabled="!alterado" @click="descartar">Descartar alterações</button>
        </div>
      </div>
      <p class="mt-2 text-[11px] text-zinc-500">
        A vigência sugerida é a data de status: a versão vale na hora. Uma data futura deixa a versão agendada; as versões anteriores nunca são alteradas.
      </p>
      <ul v-if="alterado && (tentou || erros.length) && erros.length" role="alert" class="mt-2 list-disc space-y-0.5 pl-5 text-xs text-coral-600 dark:text-coral-400">
        <li v-for="e in erros" :key="e">{{ e }}</li>
      </ul>
    </section>

    <SectionCard title="Versões" subtitle="A versão vigente é a de maior número com vigência até a data de status." :icon="History">
      <VersoesPremissas :versoes="project.state.premissas" :vigente="project.versaoPremissasVigente.versao" :data-status="project.state.meta.statusDate" />
    </SectionCard>
  </div>
</template>
