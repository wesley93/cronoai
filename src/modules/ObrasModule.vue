<script setup lang="ts">
import { computed, ref } from 'vue'
import { Building2, Copy, FolderOpen, Plus, Settings2, Trash2, Info } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'
import ModuleHeader from '@/components/common/ModuleHeader.vue'
import SectionCard from '@/components/common/SectionCard.vue'
import ObraDadosForm from './obras/ObraDadosForm.vue'
import { dataLocalISO, type DadosObra } from '@/lib/obras'

const project = useProjectStore()
const ui = useUiStore()

const criando = ref(false)
const hoje = dataLocalISO(new Date())
const dadosNovaObra: DadosObra = { nome: '', uf: '', municipio: '', responsavel: '', dataInicio: hoje, dataStatus: hoje, regimeSinapi: '', dataBaseSinapi: '' }

// Dados da obra ativa; a chave refaz o formulário quando o meta muda por fora (ex.: importar .xml)
const dadosAtivos = computed<DadosObra>(() => {
  const m = project.state.meta
  return {
    nome: m.name,
    uf: m.uf ?? '',
    municipio: m.municipio ?? '',
    responsavel: m.manager,
    dataInicio: m.startDate,
    dataStatus: m.statusDate,
    regimeSinapi: m.regimeSinapi ?? '',
    dataBaseSinapi: m.dataBaseSinapi ?? '',
  }
})
const contextoInicio = computed(() => ({
  inicioOriginal: project.state.meta.startDate,
  statusOriginal: project.state.meta.statusDate,
  comAvanco: project.obraComAvanco,
  primeiroInicioReal: project.primeiroInicioReal,
}))
const chaveDados = computed(() => JSON.stringify(dadosAtivos.value))

const unica = computed(() => project.obras.length <= 1)
const obraEmBranco = computed(() => project.state.tasks.length === 0)

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function falha(titulo: string, detalhe: string) {
  ui.notify('error', titulo, detalhe)
}

async function criarEmBranco(dados: DadosObra) {
  const r = await project.criarObra({ modelo: 'branco', dados })
  if (r.ok) ui.notify('success', 'Obra criada', `${dados.nome.trim()} está aberta. Use Importar .xml no topo para trazer o cronograma.`)
  else falha('Não foi possível criar a obra', r.erro)
}

async function criarExemplo() {
  const r = await project.criarObra({ modelo: 'exemplo' })
  if (r.ok) ui.notify('info', 'Obra de exemplo criada', 'As suas obras continuam salvas.')
  else falha('Não foi possível criar a obra de exemplo', r.erro)
}

async function abrir(id: string) {
  const r = await project.trocarObra(id)
  if (r.ok) ui.notify('info', 'Obra trocada', project.state.meta.name)
  else falha('Não foi possível abrir a obra', r.erro)
}

async function duplicar(id: string) {
  const r = await project.duplicarObra(id)
  if (r.ok) ui.notify('success', 'Obra duplicada', 'A cópia é independente da original.')
  else falha('Não foi possível duplicar a obra', r.erro)
}

async function excluir(id: string, nome: string) {
  if (!window.confirm(`Excluir a obra "${nome}"? Esta ação não pode ser desfeita. Exporte para MS Project (.xml) antes, se precisar guardar o cronograma.`)) return
  const r = await project.excluirObra(id)
  if (r.ok) ui.notify('info', 'Obra excluída', nome)
  else falha('Não foi possível excluir a obra', r.erro)
}

function salvarDados(dados: DadosObra) {
  const r = project.atualizarDadosObra(dados)
  if (r.ok) ui.notify('success', 'Dados da obra atualizados')
  else falha('Dados da obra inválidos', r.erros[0])
}
</script>

<template>
  <div class="space-y-5">
    <ModuleHeader
      pain="Base"
      title="Obras"
      description="Cada obra guarda no navegador a sua própria EAP, apontamentos, suprimentos e orçamento, com UF, município e tabela SINAPI. Os módulos mostram sempre a obra ativa."
    >
      <button class="btn-primary" @click="criando = !criando"><Plus class="h-3.5 w-3.5" /> Nova obra</button>
      <button class="btn-secondary" @click="criarExemplo"><Building2 class="h-3.5 w-3.5" /> Criar obra de exemplo</button>
    </ModuleHeader>

    <SectionCard v-if="criando" title="Nova obra em branco" subtitle="Informe os dados; o cronograma vem do MS Project em seguida" :icon="Plus">
      <ObraDadosForm :inicial="dadosNovaObra" rotulo-botao="Criar obra" id-prefixo="nova" cancelavel @salvar="criarEmBranco" @cancelar="criando = false" />
    </SectionCard>

    <SectionCard title="Obras neste navegador" :subtitle="`${project.obras.length} obra(s)`" :icon="FolderOpen" body-class="p-0">
      <div class="overflow-x-auto">
        <table class="table-base">
          <thead>
            <tr>
              <th>Nome</th>
              <th>UF</th>
              <th>Município</th>
              <th>Responsável</th>
              <th>Atualizada em</th>
              <th class="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in project.obras" :key="o.id">
              <td class="max-w-[22rem]">
                <div class="truncate font-medium text-zinc-900 dark:text-zinc-100">{{ o.nome }}</div>
                <div class="mt-0.5 flex flex-wrap gap-1">
                  <span v-if="o.id === project.obraAtivaId" class="chip-ok">Ativa</span>
                  <span v-if="o.ilegivel" class="chip-critical">Ilegível</span>
                  <span v-if="project.migracaoV1?.resultado === 'migrado' && project.migracaoV1.obraId === o.id" class="chip-info">
                    Migrada da versão anterior em {{ dataCurta(project.migracaoV1.em) }}
                  </span>
                </div>
              </td>
              <td>{{ o.uf ?? 'UF não informada' }}</td>
              <td>{{ o.municipio ?? '—' }}</td>
              <td>{{ o.responsavel ?? '—' }}</td>
              <td class="tabular-nums">{{ dataHora(o.atualizadoEm) }}</td>
              <td>
                <div class="flex justify-end gap-1">
                  <button v-if="o.id !== project.obraAtivaId" class="btn-secondary" :disabled="o.ilegivel" :aria-label="`Abrir ${o.nome}`" @click="abrir(o.id)">Abrir</button>
                  <button class="btn-ghost px-2" :disabled="o.ilegivel" :aria-label="`Duplicar ${o.nome}`" title="Duplicar" @click="duplicar(o.id)"><Copy class="h-3.5 w-3.5" /></button>
                  <button
                    class="btn-danger px-2"
                    :disabled="unica"
                    :aria-label="`Excluir ${o.nome}`"
                    :title="unica ? 'A única obra não pode ser excluída' : 'Excluir'"
                    @click="excluir(o.id, o.nome)"
                  >
                    <Trash2 class="h-3.5 w-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="unica" class="border-t border-zinc-100 px-5 py-3 text-[11px] text-zinc-500 dark:border-zinc-800">
        A única obra não pode ser excluída: crie outra antes. As obras ficam só neste navegador; exporte para MS Project (.xml) o que não pode ser perdido.
      </p>
    </SectionCard>

    <div v-if="obraEmBranco" class="card flex items-start gap-3 p-4 text-sm text-zinc-600 dark:text-zinc-300">
      <Info class="mt-0.5 h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
      <p>Esta obra ainda não tem cronograma. Para trazer o cronograma do MS Project, use <strong>Importar .xml</strong> no topo.</p>
    </div>

    <SectionCard title="Dados da obra ativa" subtitle="UF, município, responsável, datas e tabela SINAPI" :icon="Settings2">
      <ObraDadosForm :key="chaveDados" :inicial="dadosAtivos" rotulo-botao="Salvar dados" id-prefixo="ativa" :contexto-inicio="contextoInicio" @salvar="salvarDados" />
    </SectionCard>
  </div>
</template>
