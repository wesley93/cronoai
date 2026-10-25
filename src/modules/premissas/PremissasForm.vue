<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { TriangleAlert } from '@lucide/vue'
import { ORIGENS_PREMISSA, type ChavePremissa, type OrigemPremissa, type PremissasObra } from '@/types/domain'
import { MAX_REFERENCIA, ROTULO_ORIGEM_PREMISSA, custoIndiretoDiarioDeMensal } from '@/lib/premissas'
import { fmtBRLCents } from '@/lib/format'

const premissas = defineModel<PremissasObra>({ required: true })
const props = defineProps<{ ano: number; diasUteisAno: number }>()

/** Premissas escalares da tabela (o custo indireto tem linha própria, com a conversão do valor mensal). */
const LINHAS: { chave: ChavePremissa; rotulo: string; unidade: string; passo: string; opcional?: boolean; ajuda?: string }[] = [
  { chave: 'encargosSociaisPct', rotulo: 'Encargos sociais', unidade: '%', passo: '0.01', opcional: true, ajuda: 'Só vale para taxas marcadas como "sem encargos". Vazio = não informado.' },
  { chave: 'taxaFuncaoNaoCadastrada', rotulo: 'Taxa de função não cadastrada', unidade: 'R$/h', passo: '0.01', ajuda: 'Usada quando um recurso da tarefa não está na tabela de taxas.' },
  { chave: 'perdaCongestionamentoPct', rotulo: 'Perda por congestionamento', unidade: '%', passo: '0.1', ajuda: 'Perda de produtividade ao adensar a frente (crashing).' },
  { chave: 'mobilizacaoPorProfissional', rotulo: 'Mobilização por profissional', unidade: 'R$', passo: '1', ajuda: 'Integração, EPI e exames de cada profissional adicional.' },
  { chave: 'adicionalHoraExtraPct', rotulo: 'Adicional de hora extra', unidade: '%', passo: '1', ajuda: 'Validar com RH e Jurídico (convenção coletiva, jornada e compensação) antes de usar como regra.' },
  { chave: 'contingenciaRetrabalhoPct', rotulo: 'Contingência de retrabalho', unidade: '% do BAC', passo: '0.1', ajuda: 'Reserva sobre o orçamento da sucessora ao sobrepor atividades (fast tracking).' },
  { chave: 'margemDlpDias', rotulo: 'Margem da data limite de pedido', unidade: 'dias corridos', passo: '1', ajuda: 'DLP = data necessária − prazo de entrega − margem.' },
]

const numero = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw.replace(',', '.')))
const textoDe = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? '' : String(v))

function definir(chave: ChavePremissa, raw: string) {
  if (chave === 'encargosSociaisPct' && raw.trim() === '') {
    const { encargosSociaisPct: _sem, ...resto } = premissas.value
    premissas.value = resto
    return
  }
  premissas.value = { ...premissas.value, [chave]: numero(raw) }
}

const origemDe = (chave: ChavePremissa): OrigemPremissa | '' => premissas.value.origens[chave]?.origem ?? (chave === 'encargosSociaisPct' ? '' : 'ilustrativa')

function definirOrigem(chave: ChavePremissa, valor: string) {
  const origens = { ...premissas.value.origens }
  const origem = ORIGENS_PREMISSA.find((o) => o === valor)
  if (origem) origens[chave] = { ...origens[chave], origem }
  else delete origens[chave]
  premissas.value = { ...premissas.value, origens }
}

function definirReferencia(chave: ChavePremissa, texto: string) {
  const atual = premissas.value.origens[chave]
  if (!atual) return
  const { referencia: _antiga, ...resto } = atual
  premissas.value = { ...premissas.value, origens: { ...premissas.value.origens, [chave]: texto.trim() ? { ...resto, referencia: texto } : resto } }
}

// Custo indireto: informado por dia útil ou por mês (mensal × 12 ÷ dias úteis do ano da vigência, gate P1)
const modo = ref<'diario' | 'mensal'>(premissas.value.custoIndiretoMensal ? 'mensal' : 'diario')
const mensalTexto = ref(textoDe(premissas.value.custoIndiretoMensal?.valor))
const conversao = computed(() => custoIndiretoDiarioDeMensal(numero(mensalTexto.value), props.diasUteisAno))
const erroConversao = computed(() => (conversao.value.ok ? '' : conversao.value.erro))

watch(
  () => premissas.value.custoIndiretoMensal,
  (m) => {
    modo.value = m ? 'mensal' : 'diario'
    if (m) mensalTexto.value = String(m.valor)
  },
)

function digitarMensal(raw: string) {
  mensalTexto.value = raw // texto: o v-model de input numérico entregaria number
  aplicarMensal()
}

function aplicarMensal() {
  const c = conversao.value
  if (!c.ok) return
  premissas.value = { ...premissas.value, custoIndiretoDiario: c.valor, custoIndiretoMensal: { valor: numero(mensalTexto.value), diasUteisAno: props.diasUteisAno, ano: props.ano } }
}

function trocarModo(novo: 'diario' | 'mensal') {
  modo.value = novo
  if (novo === 'diario') {
    const { custoIndiretoMensal: _mensal, ...resto } = premissas.value
    premissas.value = resto
  } else {
    if (!mensalTexto.value) mensalTexto.value = textoDe(Math.round(premissas.value.custoIndiretoDiario * props.diasUteisAno) / 12)
    aplicarMensal()
  }
}

watch(
  () => [props.ano, props.diasUteisAno],
  () => {
    if (modo.value === 'mensal') aplicarMensal()
  },
)
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table-base">
      <thead>
        <tr><th>Premissa</th><th>Valor</th><th>Unidade</th><th>Origem</th><th>Referência da fonte</th></tr>
      </thead>
      <tbody>
        <tr>
          <td class="font-medium">Custo indireto</td>
          <td class="min-w-[260px]">
            <div class="mb-1 flex gap-3 text-[11px]">
              <label class="flex items-center gap-1"><input type="radio" class="accent-amber-500" :checked="modo === 'diario'" @change="trocarModo('diario')" /> Por dia útil</label>
              <label class="flex items-center gap-1"><input type="radio" class="accent-amber-500" :checked="modo === 'mensal'" @change="trocarModo('mensal')" /> Por mês</label>
            </div>
            <input
              v-if="modo === 'diario'"
              class="input py-1 text-xs"
              type="number"
              min="0"
              step="0.01"
              aria-label="Custo indireto por dia útil"
              :value="textoDe(premissas.custoIndiretoDiario)"
              @input="definir('custoIndiretoDiario', ($event.target as HTMLInputElement).value)"
            />
            <template v-else>
              <input
                class="input py-1 text-xs"
                type="number"
                min="0"
                step="0.01"
                aria-label="Custo indireto por mês"
                :value="mensalTexto"
                @input="digitarMensal(($event.target as HTMLInputElement).value)"
              />
              <p v-if="conversao.ok" class="mt-1 text-[11px] text-zinc-500" data-testid="conversao-indireto">
                {{ fmtBRLCents(Number(mensalTexto)) }} × 12 ÷ {{ diasUteisAno }} dias úteis em {{ ano }} = <strong>{{ fmtBRLCents(premissas.custoIndiretoDiario) }}</strong> por dia útil
              </p>
              <p v-else class="mt-1 text-[11px] text-coral-600 dark:text-coral-400" role="alert">{{ erroConversao }}</p>
            </template>
          </td>
          <td class="whitespace-nowrap text-zinc-500">R$ por dia útil</td>
          <td>
            <select class="input min-w-[12.5rem] py-1 text-xs" aria-label="Origem do custo indireto" :value="origemDe('custoIndiretoDiario')" @change="definirOrigem('custoIndiretoDiario', ($event.target as HTMLSelectElement).value)">
              <option v-for="o in ORIGENS_PREMISSA" :key="o" :value="o">{{ ROTULO_ORIGEM_PREMISSA[o] }}</option>
            </select>
          </td>
          <td>
            <input class="input py-1 text-xs" :maxlength="MAX_REFERENCIA" aria-label="Referência do custo indireto" :value="premissas.origens.custoIndiretoDiario?.referencia ?? ''" @input="definirReferencia('custoIndiretoDiario', ($event.target as HTMLInputElement).value)" />
          </td>
        </tr>
        <tr v-for="l in LINHAS" :key="l.chave">
          <td>
            <div class="font-medium">{{ l.rotulo }}</div>
            <div v-if="l.ajuda" class="max-w-[260px] text-[10.5px] text-zinc-500">{{ l.ajuda }}</div>
          </td>
          <td>
            <input
              class="input py-1 text-xs"
              type="number"
              min="0"
              :step="l.passo"
              :aria-label="l.rotulo"
              :value="textoDe(premissas[l.chave])"
              @input="definir(l.chave, ($event.target as HTMLInputElement).value)"
            />
          </td>
          <td class="whitespace-nowrap text-zinc-500">{{ l.unidade }}</td>
          <td>
            <select class="input min-w-[12.5rem] py-1 text-xs" :aria-label="`Origem: ${l.rotulo}`" :value="origemDe(l.chave)" @change="definirOrigem(l.chave, ($event.target as HTMLSelectElement).value)">
              <option v-if="l.opcional" value="">Não informada</option>
              <option v-for="o in ORIGENS_PREMISSA" :key="o" :value="o">{{ ROTULO_ORIGEM_PREMISSA[o] }}</option>
            </select>
          </td>
          <td>
            <input
              class="input py-1 text-xs"
              :maxlength="MAX_REFERENCIA"
              :disabled="!premissas.origens[l.chave]"
              :aria-label="`Referência: ${l.rotulo}`"
              :value="premissas.origens[l.chave]?.referencia ?? ''"
              @input="definirReferencia(l.chave, ($event.target as HTMLInputElement).value)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p v-if="origemDe('adicionalHoraExtraPct') === 'ilustrativa'" class="mt-3 flex items-start gap-2 rounded-md bg-amber-400/10 p-2 text-[11.5px] text-amber-800 dark:text-amber-200">
      <TriangleAlert class="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Adicional de hora extra, jornada e sábados trabalhados dependem de convenção coletiva e da legislação: valide com RH e Jurídico antes de tratar como regra.</span>
    </p>
  </div>
</template>
