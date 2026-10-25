// Teste de tela da calculadora SINAPI (sem @vue/test-utils, D-15): monta o módulo no jsdom sobre a store carregada e consulta só o DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import amostraTexto from '../../e2e/arquivos/recorte-sinapi-sp-2026-09-amostra.json?raw'
import SinapiModule from '@/modules/SinapiModule.vue'
import type { DadosObra } from '@/lib/obras'
import { criarArmazenamentoMemoria, usarArmazenamento } from '@/stores/armazenamentoObras'
import { useProjectStore } from '@/stores/useProjectStore'

let app: App | undefined
let raiz: HTMLElement

const sp: DadosObra = { nome: 'Obra SP (fictícia)', uf: 'SP', dataInicio: '2026-11-03', dataStatus: '2026-11-03', regimeSinapi: 'nao-desonerado', dataBaseSinapi: '2026-09' }
const textoBa = () => JSON.stringify({ ...JSON.parse(amostraTexto), uf: 'BA' })

async function montar(opcoes: { comRecorte?: boolean } = {}) {
  usarArmazenamento(criarArmazenamentoMemoria())
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectStore()
  await store.carregar()
  if (opcoes.comRecorte) {
    expect((await store.criarObra({ modelo: 'branco', dados: sp })).ok).toBe(true)
    expect(await store.importarRecorteSinapi(amostraTexto)).toEqual({ ok: true })
  }
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(SinapiModule).use(pinia)
  app.mount(raiz)
  await nextTick()
  return store
}

const por = (id: string) => raiz.querySelector(`[data-testid="${id}"]`) as HTMLElement | null
const texto = (id: string) => (por(id)?.textContent ?? '').replace(/\s+/g, ' ').trim()
async function digitar(id: string, valor: string) {
  const campo = por(id) as HTMLInputElement
  campo.value = valor
  campo.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function definirEquipe(n: number) {
  const campo = raiz.querySelector('input[aria-label="Tamanho da equipe"]') as HTMLInputElement
  campo.value = String(n)
  campo.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
}
async function escolher(codigo: string) {
  await digitar('busca-composicao', codigo)
  const botao = [...(por('busca-resultados')?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.includes(codigo))
  if (!botao) throw new Error(`composição ${codigo} não apareceu na busca`)
  botao.click()
  await nextTick()
}

beforeEach(() => globalThis.localStorage?.clear?.())
afterEach(() => {
  app?.unmount()
  app = undefined
  raiz?.remove()
  usarArmazenamento(undefined)
})

describe('calculadora com o recorte: a composição de outra obra ou de outro recorte sai da tela (B1)', () => {
  it('trocar da obra A (SP) para a obra B (BA), ambas com recorte, limpa a composição escolhida: o custo de SP não fica na tela', async () => {
    const store = await montar({ comRecorte: true })
    const idA = store.obraAtivaId
    const b = await store.criarObra({ modelo: 'branco', dados: { ...sp, nome: 'Obra BA', uf: 'BA' } })
    if (!b.ok) throw new Error(b.erro)
    expect(await store.importarRecorteSinapi(textoBa())).toEqual({ ok: true })
    // Volta à A (o módulo continua montado, como no KeepAlive) e escolhe a composição de SP
    expect(await store.trocarObra(idA)).toEqual({ ok: true })
    await vi.waitFor(() => expect(por('busca-composicao')).not.toBeNull())
    await escolher('103332')
    expect(texto('composicao-escolhida')).toContain('103332')
    expect((por('custo-unitario') as HTMLInputElement).value).toBe('123.96')
    // Troca para a B: a identidade do recorte muda (SP → BA) e a composição some, sem recarregar o módulo
    expect(await store.trocarObra(b.id)).toEqual({ ok: true })
    await vi.waitFor(() => expect(por('composicao-escolhida')).toBeNull())
    expect(por('sem-composicao')).not.toBeNull()
    expect((por('custo-unitario') as HTMLInputElement).value).toBe('0')
    expect(texto('fonte-recorte')).toContain('Fonte: SINAPI BA 09/2026 não desonerado.')
  })

  it('substituir o recorte da mesma obra (outro SHA-256) também limpa a composição escolhida', async () => {
    const store = await montar({ comRecorte: true })
    await escolher('103332')
    expect(por('composicao-escolhida')).not.toBeNull()
    const outro = JSON.parse(amostraTexto)
    outro.fonte.sha256 = 'f'.repeat(64)
    expect(await store.importarRecorteSinapi(JSON.stringify(outro))).toEqual({ ok: true })
    await vi.waitFor(() => expect(por('composicao-escolhida')).toBeNull())
  })

  it('remover o recorte volta ao catálogo ilustrativo, com o aviso', async () => {
    const store = await montar({ comRecorte: true })
    await escolher('103332')
    expect(await store.removerRecorteSinapi()).toEqual({ ok: true })
    await vi.waitFor(() => expect(por('aviso-ilustrativo')).not.toBeNull())
    expect(por('busca-composicao')).toBeNull()
    expect(por('composicao-escolhida')).toBeNull()
  })
})

describe('calculadora: método do custo de mão de obra, centavos e jornada (especialista, itens 2, 3 e 6)', () => {
  it('com recorte: "por coeficiente da composição" e R$ com centavos (CR-15: 640 m² de 103332 = R$ 45.015,68)', async () => {
    await montar({ comRecorte: true })
    await escolher('103332')
    await digitar('quantidade', '640')
    await definirEquipe(4)
    expect(texto('mao-de-obra')).toContain('ilustrativa, por coeficiente da composição')
    expect(texto('mao-de-obra')).toContain('R$ 45.015,68')
    expect(texto('bac')).toBe('R$ 79.334,40')
    expect(texto('dias-uteis')).toBe('33 dias úteis')
    expect(texto('equipe-por-funcao')).toContain('Pedreiro 4 + Servente 2')
  })

  it('sem recorte: "por horas alocadas" (catálogo ilustrativo, 1.850 m², equipe 6: R$ 65.989,00) e o aviso de catálogo ilustrativo', async () => {
    await montar()
    expect(texto('mao-de-obra')).toContain('ilustrativa, por horas alocadas')
    // HH 1.517 × R$ 31,40 + 32 d × 8 h × 3 serventes × R$ 23,90
    expect(texto('mao-de-obra')).toContain('R$ 65.989,00')
    expect(por('aviso-ilustrativo')).not.toBeNull()
    expect(por('fonte-recorte')).toBeNull()
  })

  it('jornada da obra de 450 min/dia: o cartão "Duração" mostra "35 d.u. (de 7,5 h)" (CR-12) e a fórmula usa 7,5 h', async () => {
    const store = await montar({ comRecorte: true })
    store.state.meta.minutosPorDia = 450
    await nextTick()
    await escolher('103332')
    await digitar('quantidade', '640')
    await definirEquipe(4)
    expect(texto('dias-uteis')).toBe('35 dias úteis')
    expect(raiz.textContent).toContain('35 d.u.')
    expect(texto('duracao-jornada')).toBe('(de 7,5 h)')
    expect(raiz.textContent).toContain('Equipe × 7,5 horas por dia')
  })

  it('com 480 min/dia o mesmo caso dá 33 d.u. (de 8 h)', async () => {
    await montar({ comRecorte: true })
    await escolher('103332')
    await digitar('quantidade', '640')
    await definirEquipe(4)
    expect(raiz.textContent).toContain('33 d.u.')
    expect(texto('duracao-jornada')).toBe('(de 8 h)')
  })
})

describe('planilha: chip da fonte de cada linha (B2)', () => {
  it('"publicada" (verde) vira "alterado" (âmbar tracejado) quando a RUP é editada, e o catálogo ilustrativo fica neutro', async () => {
    const store = await montar({ comRecorte: true })
    store.clearBudget()
    store.importBudgetCsv('codigo;descricao;unidade;quantidade;equipe\n103332;;m²;640;4')
    await nextTick()
    const chip = () => por('fonte-da-linha')!
    expect(chip().textContent?.trim()).toBe('SINAPI SP 09/2026')
    expect(chip().className).toContain('chip-ok')
    store.updateBudgetLine(store.state.budget[0]!.id, { rup: 0.9 })
    await nextTick()
    expect(chip().textContent?.trim()).toBe('SINAPI SP 09/2026 · alterado')
    expect(chip().className).toContain('chip-warn')
    expect(chip().className).toContain('border-dashed')
    expect(chip().className).not.toContain('chip-ok')
    expect(chip().getAttribute('title')).toContain('informados pelo usuário')
  })

  it('linha do catálogo ilustrativo: chip "ilustrativo" neutro', async () => {
    await montar()
    const chip = por('fonte-da-linha')!
    expect(chip.textContent?.trim()).toBe('ilustrativo')
    expect(chip.className).toContain('chip-neutral')
  })
})

describe('planilha: linhas de outro recorte (B1)', () => {
  it('troca da data-base: a linha ganha o chip vermelho "outro recorte", com o título explicativo, e o lote é recusado', async () => {
    const store = await montar({ comRecorte: true })
    store.clearBudget()
    store.importBudgetCsv('codigo;descricao;unidade;quantidade;equipe\n103332;;m²;640;4')
    await nextTick()
    expect(por('fonte-da-linha')!.className).toContain('chip-ok')
    expect(store.atualizarDadosObra({ ...sp, dataBaseSinapi: '2026-10' })).toEqual({ ok: true })
    await vi.waitFor(() => expect(por('fonte-da-linha')!.textContent?.trim()).toBe('SINAPI SP 09/2026 · outro recorte'))
    const chip = por('fonte-da-linha')!
    expect(chip.className).toContain('chip-critical')
    expect(chip.className).not.toContain('chip-ok')
    expect(chip.getAttribute('title')).toContain('não é o recorte desta obra (a obra não tem recorte)')
    expect(store.generateFromBudget()).toMatchObject({ ok: false })
  })
})

describe('calculadora: valores fora do teto não dimensionam nem entram na EAP (segurança, Info 3)', () => {
  it('quantidade "1e308" ou acima de 1e9: mensagem na tela, botões desabilitados e nenhuma prévia; no teto volta a valer', async () => {
    const store = await montar({ comRecorte: true })
    await escolher('103332')
    await definirEquipe(4)
    const botaoEap = () => [...raiz.querySelectorAll('button')].find((b) => b.textContent?.includes('Adicionar à EAP do MS Project'))!
    await digitar('quantidade', '640')
    expect(por('erro-limite')).toBeNull()
    expect(botaoEap().disabled).toBe(false)
    for (const valor of ['1e308', '1e12']) {
      await digitar('quantidade', valor)
      expect(texto('erro-limite')).toContain('quantidade acima do limite de 1.000.000.000')
      expect(botaoEap().disabled).toBe(true)
      expect(por('erro-previa')).toBeNull()
    }
    const antes = store.state.tasks.length
    botaoEap().click()
    await nextTick()
    expect(store.state.tasks).toHaveLength(antes)
    await digitar('quantidade', '1000000000')
    expect(por('erro-limite')).toBeNull()
  })
})
