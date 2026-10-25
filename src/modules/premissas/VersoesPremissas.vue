<script setup lang="ts">
import type { VersaoPremissas } from '@/types/domain'
import { fmtBRLCents, fmtDate } from '@/lib/format'
import { rotuloVersao } from '@/lib/premissas'

const props = defineProps<{ versoes: VersaoPremissas[]; vigente: number; dataStatus: string }>()

/** Situação da versão na data de status: vigente, agendada (vigência futura) ou substituída. */
function situacao(v: VersaoPremissas): { texto: string; classe: string } {
  if (v.versao === props.vigente) return { texto: 'Vigente', classe: 'chip-ok' }
  if (v.vigencia > props.dataStatus) return { texto: 'Agendada', classe: 'chip-info' }
  return { texto: 'Substituída', classe: 'chip-neutral' }
}
</script>

<template>
  <div class="overflow-x-auto">
    <table class="table-base">
      <thead>
        <tr><th>Versão</th><th>Vigência</th><th>Situação</th><th class="text-right">Indireto por dia útil</th><th>Motivo</th></tr>
      </thead>
      <tbody>
        <tr v-for="v in [...versoes].reverse()" :key="v.versao">
          <td class="font-medium">{{ rotuloVersao(v) }}</td>
          <td class="tabular-nums">{{ fmtDate(v.vigencia) }}</td>
          <td><span :class="situacao(v).classe">{{ situacao(v).texto }}</span></td>
          <td class="text-right tabular-nums">{{ fmtBRLCents(v.valores.custoIndiretoDiario) }}</td>
          <td class="max-w-[360px] truncate" :title="v.motivo">{{ v.motivo }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
