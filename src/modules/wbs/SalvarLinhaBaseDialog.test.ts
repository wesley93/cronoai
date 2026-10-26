// Diálogo de salvar a linha de base (ciclo 00007, rodada 02, ARQ R-1): numa obra em branco que ganhou tarefas por SINAPI ou planilha a LB0 tem dado e,
// antes da correção, não tinha metadado: o salvar pedia confirmação e o diálogo não mostrava a caixa (travava). Teste de tela sem @vue/test-utils.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { criarArmazenamentoMemoria, usarArmazenamento } from '@/stores/armazenamentoObras'
import { useProjectStore } from '@/stores/useProjectStore'
import SalvarLinhaBaseDialog from './SalvarLinhaBaseDialog.vue'

let app: App | undefined
let raiz: HTMLElement

async function obraEmBrancoComSinapi() {
  usarArmazenamento(criarArmazenamentoMemoria())
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectStore()
  await store.carregar()
  const b = await store.criarObra({ modelo: 'branco', dados: { nome: 'Obra em branco (fictícia)', dataInicio: '2026-11-03', dataStatus: '2026-11-03' } })
  if (!b.ok) throw new Error(b.erro)
  const r = store.addSinapiTask({ name: 'Pacote A', code: '00001', unit: 'm2', quantity: 10, unitCost: 10, durationDays: 5, resources: [], parentWbs: '', newGroupName: 'Grupo A', linkType: 'FS', lagDays: 0 })
  if (!r.ok) throw new Error(r.erro)
  return { store, pinia }
}
function abrirDialogo(pinia: ReturnType<typeof createPinia>) {
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(SalvarLinhaBaseDialog).use(pinia)
  app.mount(raiz)
}
const escolherLb0 = async () => {
  const select = document.getElementById('lb-numero') as HTMLSelectElement
  select.value = '0'
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}
const caixaDeConfirmacao = () => document.querySelector('input[type="checkbox"]')

afterEach(() => {
  app?.unmount()
  raiz?.remove()
  app = undefined
  usarArmazenamento(undefined)
  vi.useRealTimers()
})

describe('SalvarLinhaBaseDialog e a LB0 de uma obra em branco com tarefas (ARQ R-1)', () => {
  it('a inclusão por SINAPI cria o metadado da LB0 (pela mesma regra da migração); salvar a LB0 pede a confirmação e o diálogo a mostra', async () => {
    const { store, pinia } = await obraEmBrancoComSinapi()
    expect(store.temDadosLinhaBase0).toBe(true)
    expect(store.state.linhasBase.map((i) => [i.numero, i.nome, i.origem])).toEqual([[0, 'Linha de base 0', 'cronoai']])
    // Store: a LB0 com dado é "existente": sem confirmar, a recusa pede a confirmação
    expect(store.salvarLinhaBase({ numero: 0, nome: 'Nova', motivo: 'Teste' })).toMatchObject({ ok: false, precisaConfirmar: true })
    abrirDialogo(pinia)
    await escolherLb0()
    expect(caixaDeConfirmacao()).not.toBeNull() // o diálogo mostra a caixa que a store exige
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('já salva')
  })

  it('mesmo sem o metadado (estado antigo), o diálogo considera existente a LB0 que tem dado e mostra a confirmação', async () => {
    const { store, pinia } = await obraEmBrancoComSinapi()
    store.state.linhasBase = [] // dado de LB0 sem metadado
    expect(store.temDadosLinhaBase0).toBe(true)
    abrirDialogo(pinia)
    await escolherLb0()
    expect(caixaDeConfirmacao()).not.toBeNull()
    // Marcar, preencher e salvar funciona de ponta a ponta (antes: o botão só repetia a recusa)
    ;(caixaDeConfirmacao() as HTMLInputElement).click()
    const nome = document.getElementById('lb-nome') as HTMLInputElement
    nome.value = 'Baseline do planejamento'
    nome.dispatchEvent(new Event('input', { bubbles: true }))
    const motivo = document.getElementById('lb-motivo') as HTMLTextAreaElement
    motivo.value = 'Primeira\nlinha de base'
    motivo.dispatchEvent(new Event('input', { bubbles: true }))
    ;(document.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }))
    await nextTick()
    expect(store.state.linhasBase.find((i) => i.numero === 0)).toMatchObject({ nome: 'Baseline do planejamento', motivo: 'Primeira\nlinha de base' })
  })
})
