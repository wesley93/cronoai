<script setup lang="ts">
import { computed, ref } from 'vue'
import { Database } from '@lucide/vue'
import { ROTULO_REGIME_SINAPI } from '@/data/ufs'
import { estadoCartaoSinapi } from '@/lib/integracoes'
import { MAX_RECORTE_BYTES, descreverChave, lerChaveRecorte } from '@/lib/recorteSinapi'
import { fmtDate, fmtNum, fmtPct } from '@/lib/format'
import { dataLocalISO } from '@/lib/obras'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import CartaoIntegracao from './CartaoIntegracao.vue'

// Cartão SINAPI da obra ativa (SPEC-15, RF-15.2): mostra o recorte (UF, regime, data-base, fonte, SHA-256 da planilha e data da importação),
// importa, substitui e remove. O recorte é gerado offline por `npm run sinapi:recorte`; aqui só entra um arquivo .json de até 6 MiB,
// e o texto do arquivo só aparece por interpolação (nunca v-html).
const project = useProjectStore()
const ui = useUiStore()

const meta = computed(() => project.state.meta)
const ativo = computed(() => project.recorteAtual)
const dataBase = computed(() => {
  const [ano, mes] = (meta.value.dataBaseSinapi ?? '').split('-')
  return mes && ano ? `${mes}/${ano}` : 'não informada'
})
const regime = computed(() => (meta.value.regimeSinapi ? ROTULO_REGIME_SINAPI[meta.value.regimeSinapi] : 'não informado'))
const estado = computed(() => estadoCartaoSinapi(!!ativo.value))
const sha = computed(() => ativo.value?.recorte.fonte.sha256 ?? '')
const disponivel = computed(() => {
  const c = lerChaveRecorte(project.recorteDisponivel)
  return c ? descreverChave(c.uf, c.regime, c.dataBase) : ''
})
/** Data da importação no dia local do usuário (não o dia UTC). */
const dataDe = (iso: string) => fmtDate(dataLocalISO(new Date(iso)))
const ocupado = ref(false)
const arquivo = ref<HTMLInputElement>()

async function importar(texto: string, confirmar = false): Promise<void> {
  const r = await project.importarRecorteSinapi(texto, { confirmarSubstituicao: confirmar })
  if (r.ok) {
    ui.notify('success', 'Recorte SINAPI importado', `${project.recorteAtual?.fonte ?? ''}: ${fmtNum(project.recorteAtual?.recorte.composicoes.length ?? 0)} composições.`)
  } else if (r.precisaConfirmar) {
    if (window.confirm(`${r.erro}\n\nSubstituir mesmo assim?`)) await importar(texto, true)
  } else {
    // Até 3 mensagens de erro de esquema, em português e sem detalhe técnico
    ui.notify('error', 'Recorte não importado', (r.erros ?? [r.erro]).slice(0, 3).join(' '))
  }
}

async function aoEscolher(e: Event) {
  const campo = e.target as HTMLInputElement
  const f = campo.files?.[0]
  campo.value = '' // permite escolher o mesmo arquivo de novo
  if (!f) return
  if (!/\.json$/i.test(f.name)) {
    ui.notify('error', 'Arquivo não aceito', 'Escolha o arquivo .json do recorte SINAPI.')
    return
  }
  // Tamanho conferido ANTES de ler o arquivo
  if (f.size > MAX_RECORTE_BYTES) {
    ui.notify('error', 'Arquivo grande demais', 'O recorte SINAPI aceita até 6 MiB. Gere o recorte com filtro de grupos ou de códigos.')
    return
  }
  ocupado.value = true
  try {
    await importar(await f.text())
  } catch {
    ui.notify('error', 'Não foi possível ler o arquivo', 'Tente de novo ou gere o recorte outra vez.')
  } finally {
    ocupado.value = false
  }
}

async function usar() {
  ocupado.value = true
  const r = await project.usarRecorteDisponivel()
  ocupado.value = false
  if (r.ok) ui.notify('success', 'Recorte SINAPI vinculado', `${project.recorteAtual?.fonte ?? ''}: usado nesta obra sem reimportar.`)
  else ui.notify('error', 'Recorte não vinculado', r.erro)
}

async function remover() {
  if (!window.confirm('Remover o recorte SINAPI desta obra? Ela volta ao catálogo ilustrativo. As tarefas já geradas não mudam.')) return
  ocupado.value = true
  const r = await project.removerRecorteSinapi()
  ocupado.value = false
  if (r.ok) ui.notify('info', 'Recorte SINAPI removido desta obra', 'A obra voltou ao catálogo ilustrativo.')
  else ui.notify('error', 'Recorte não removido', r.erro)
}
</script>

<template>
  <CartaoIntegracao titulo="SINAPI" :estado="estado" :icone="Database">
    <p>Tabela de custos e de produtividade (RUP) da UF, do regime e da data-base da obra, importada de um recorte gerado offline.</p>
    <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
      <dt class="text-zinc-500">UF</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-uf">{{ meta.uf ?? 'não informada' }}</dd>
      <dt class="text-zinc-500">Regime</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ regime }}</dd>
      <dt class="text-zinc-500">Data-base</dt>
      <dd class="font-medium text-zinc-800 dark:text-zinc-200">{{ dataBase }}</dd>
      <template v-if="ativo">
        <dt class="text-zinc-500">Fonte</dt>
        <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-fonte">{{ ativo.recorte.fonte.publicacao }}</dd>
        <dt class="text-zinc-500">Planilha</dt>
        <dd class="break-all font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-arquivo">{{ ativo.recorte.fonte.arquivo }}</dd>
        <dt class="text-zinc-500">SHA-256</dt>
        <dd class="font-mono font-medium text-zinc-800 dark:text-zinc-200" :title="sha" data-testid="sinapi-sha">{{ sha.slice(0, 12) }}…</dd>
        <dt class="text-zinc-500">Importado em</dt>
        <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-importado">{{ dataDe(ativo.importadoEm) }}</dd>
        <dt class="text-zinc-500">Composições</dt>
        <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-composicoes">{{ fmtNum(ativo.recorte.composicoes.length) }}</dd>
        <dt class="text-zinc-500">Encargos</dt>
        <dd class="font-medium text-zinc-800 dark:text-zinc-200" data-testid="sinapi-encargos">horista {{ fmtPct(ativo.recorte.encargos.horista * 100, 2) }} · mensalista {{ fmtPct(ativo.recorte.encargos.mensalista * 100, 2) }}</dd>
      </template>
    </dl>
    <p v-if="ativo?.substituidoEm" class="rounded-md border border-amber-500/40 bg-amber-400/10 p-2 text-[11.5px]" role="status" data-testid="sinapi-substituido">
      Recorte substituído em {{ dataDe(ativo.substituidoEm) }}: o arquivo de origem não é mais o que esta obra importou.
    </p>
    <p v-if="project.avisoRecorte" class="rounded-md border border-amber-500/40 bg-amber-400/10 p-2 text-[11.5px]" role="alert" data-testid="sinapi-aviso">{{ project.avisoRecorte }}</p>
    <p v-if="!ativo && !project.avisoRecorte" class="text-[11.5px] text-zinc-500">
      Sem recorte, a calculadora e a planilha usam o catálogo ilustrativo. Gere o recorte da UF com <code class="font-mono">npm run sinapi:recorte</code> e importe o arquivo .json aqui.
    </p>
    <p v-if="project.recorteDisponivel && !ativo" class="rounded-md border border-zinc-200 p-2 text-[11.5px] dark:border-zinc-700" data-testid="sinapi-disponivel">
      Há um recorte de {{ disponivel }} salvo neste navegador (importado em outra obra). Nada muda nesta obra até você pedir.
    </p>

    <div class="flex flex-wrap gap-2">
      <button v-if="project.recorteDisponivel && !ativo" type="button" class="btn-primary" :disabled="ocupado" data-testid="sinapi-usar" @click="usar">Usar nesta obra</button>
      <button type="button" class="btn-secondary" :disabled="ocupado" data-testid="sinapi-importar" @click="arquivo?.click()">{{ ativo ? 'Substituir recorte' : 'Importar recorte' }}</button>
      <button v-if="ativo" type="button" class="btn-ghost" :disabled="ocupado" data-testid="sinapi-remover" @click="remover">Remover desta obra</button>
      <input ref="arquivo" type="file" accept=".json,application/json" class="sr-only" aria-label="Arquivo do recorte SINAPI (.json)" data-testid="sinapi-arquivo-input" @change="aoEscolher" />
    </div>
    <button type="button" class="btn-ghost" @click="ui.current = 'obras'">Alterar UF, regime e data-base em Obras › Dados da obra</button>
  </CartaoIntegracao>
</template>
