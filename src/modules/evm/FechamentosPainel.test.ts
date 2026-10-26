// Telas de fechamento (ciclo 00007, rodada 02): N-3 (o painel separa "lendo" de "erro de leitura") e N-10 (o erro da prévia da retificação aparece na prévia,
// não só ao gravar). Teste de tela sem @vue/test-utils: monta no jsdom sobre a store carregada e consulta só o DOM.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from '@/stores/armazenamentoObras'
import { useProjectStore } from '@/stores/useProjectStore'
import FechamentosPainel from './FechamentosPainel.vue'
import RetificarFechamentoDialog from './RetificarFechamentoDialog.vue'

let app: App | undefined
let raiz: HTMLElement

async function abrir(adaptador: ArmazenamentoMemoria = criarArmazenamentoMemoria()) {
  usarArmazenamento(adaptador)
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectStore()
  await store.carregar()
  return { adaptador, store, pinia }
}
function montar(componente: Parameters<typeof createApp>[0], pinia: ReturnType<typeof createPinia>, props?: Record<string, unknown>) {
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(componente, props).use(pinia)
  app.mount(raiz)
}
const por = (id: string) => document.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
const texto = (id: string) => (por(id)?.textContent ?? '').replace(/\s+/g, ' ').trim()

afterEach(() => {
  app?.unmount()
  raiz?.remove()
  app = undefined
  usarArmazenamento(undefined)
  vi.useRealTimers()
})

describe('FechamentosPainel: lendo × erro de leitura (N-3)', () => {
  it('sem fechamentos, com a leitura concluída: diz que a obra ainda não tem fechamentos', async () => {
    const { pinia } = await abrir()
    montar(FechamentosPainel, pinia)
    await nextTick()
    expect(texto('sem-fechamentos')).toBe('Esta obra ainda não tem fechamentos: a Curva S usa o histórico reconstruído linearmente.')
  })

  it('leitura que FALHOU: o painel diz que não foi possível ler (e não fica em "Lendo…" para sempre); o botão de fechar fica desligado', async () => {
    const adaptador = criarArmazenamentoMemoria()
    await abrir(adaptador) // grava a obra
    adaptador.lerCabecalhosFechamento = async () => {
      throw new Error('Leitura simulada falhou')
    }
    const { store, pinia } = await abrir(adaptador)
    expect(store.fechamentosCarregados).toBe(false)
    expect(store.fechamentosErroDeLeitura).toBe(true)
    montar(FechamentosPainel, pinia)
    await nextTick()
    expect(texto('sem-fechamentos')).toBe('Não foi possível ler os fechamentos deste navegador. Nada foi alterado e novo fechamento fica bloqueado: recarregue a página.')
    expect((por('abrir-fechar') as HTMLButtonElement).disabled).toBe(true)
  })

  it('enquanto a leitura ainda corre, o painel diz "Lendo…"', async () => {
    const adaptador = criarArmazenamentoMemoria()
    await abrir(adaptador)
    let liberar!: () => void
    const portao = new Promise<void>((r) => (liberar = r))
    const original = adaptador.lerCabecalhosFechamento.bind(adaptador)
    adaptador.lerCabecalhosFechamento = async (obra) => {
      await portao
      return original(obra)
    }
    usarArmazenamento(adaptador)
    const pinia = createPinia()
    setActivePinia(pinia)
    const store = useProjectStore()
    const carga = store.carregar()
    await vi.waitFor(() => expect(store.obraAtivaId).not.toBe(''))
    montar(FechamentosPainel, pinia)
    await nextTick()
    expect(texto('sem-fechamentos')).toBe('Lendo os fechamentos desta obra…')
    liberar()
    await carga
    await nextTick()
    expect(texto('sem-fechamentos')).toContain('ainda não tem fechamentos')
  })
})

describe('FechamentosPainel: nota da linha de base do fechamento (ESP, opinião b)', () => {
  it('a LB do fechamento ainda existe e é a mesma: só "fechado contra a LB0 de ..."; se deixou de existir, a lista mostra "não existe mais" (antes: nada)', async () => {
    const { store, pinia } = await abrir()
    const r = await store.fecharDataDeStatus()
    if (!r.ok) throw new Error(r.erro)
    montar(FechamentosPainel, pinia)
    await nextTick()
    expect(texto('lista-fechamentos')).toContain('fechado contra a LB0 de 27/04/2026')
    expect(texto('lista-fechamentos')).not.toContain('não existe mais')
    store.state.linhasBase = [] // a importação de um arquivo sem a LB0 deixa a LB do fechamento sem metadado
    await nextTick()
    expect(texto('lista-fechamentos')).toContain('fechado contra a LB0 de 27/04/2026; a LB0 do fechamento não existe mais')
  })
})

describe('RetificarFechamentoDialog: erro na prévia (N-10)', () => {
  it('um % acima de 100 mostra o erro NA PRÉVIA, antes de gravar; corrigido o valor, a prévia mostra os totais', async () => {
    const { store, pinia } = await abrir()
    const r = await store.fecharDataDeStatus()
    if (!r.ok) throw new Error(r.erro)
    montar(RetificarFechamentoDialog, pinia, { fechamentoId: r.id })
    await vi.waitFor(() => expect(document.querySelector('input[aria-label="Novo % físico da tarefa 104"]')).not.toBeNull())
    const campo = document.querySelector('input[aria-label="Novo % físico da tarefa 104"]') as HTMLInputElement
    campo.value = '150'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(texto('erro-previa')).toBe('O % físico precisa estar entre 0 e 100.')
    expect(por('previa-retificacao')).toBeNull()
    campo.value = '45'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(por('erro-previa')).toBeNull()
    expect(texto('previa-retificacao')).toContain('6.456.600,00')
  })
})
