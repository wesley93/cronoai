// Cartão SINAPI (SPEC-15 RF-15.2) com a store carregada sobre o armazenamento em memória: sem @vue/test-utils (D-15), só DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import amostraTexto from '../../../e2e/arquivos/recorte-sinapi-sp-2026-09-amostra.json?raw'
import IntegracoesModule from '@/modules/IntegracoesModule.vue'
import { criarArmazenamentoMemoria, usarArmazenamento } from '@/stores/armazenamentoObras'
import { useProjectStore } from '@/stores/useProjectStore'

let app: App | undefined
let raiz: HTMLElement

async function montar() {
  const adaptador = criarArmazenamentoMemoria()
  usarArmazenamento(adaptador)
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useProjectStore()
  await store.carregar()
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(IntegracoesModule).use(pinia)
  app.mount(raiz)
  return { store, adaptador }
}

beforeEach(() => globalThis.localStorage?.clear?.())
afterEach(() => {
  app?.unmount()
  app = undefined
  raiz?.remove()
  usarArmazenamento(undefined)
})

const sinapi = () => [...raiz.querySelectorAll('article')].find((a) => a.querySelector('h3')?.textContent?.trim() === 'SINAPI')!
const texto = (id: string) => sinapi().querySelector(`[data-testid="${id}"]`)?.textContent?.trim()
const botoes = () => [...sinapi().querySelectorAll('button')].map((b) => b.textContent?.trim())
const dadosSp = { nome: 'Obra SP (fictícia)', uf: 'SP' as const, dataInicio: '2026-11-03', dataStatus: '2026-11-03', regimeSinapi: 'nao-desonerado' as const, dataBaseSinapi: '2026-09' }

describe('cartão SINAPI da tela Integrações (RF-15.2)', () => {
  it('obra sem recorte: "Não configurada", importar e o aviso do catálogo ilustrativo; sem "Usar nesta obra"', async () => {
    await montar()
    expect(texto('estado-integracao')).toBe('Não configurada')
    expect(botoes()).toContain('Importar recorte')
    expect(botoes()).not.toContain('Remover desta obra')
    expect(botoes()).not.toContain('Usar nesta obra')
    expect(sinapi().textContent).toContain('catálogo ilustrativo')
    const campo = sinapi().querySelector('input')!
    expect(campo.getAttribute('type')).toBe('file')
    expect(campo.getAttribute('accept')).toBe('.json,application/json')
  })

  it('com o recorte importado: "Configurada", UF, regime, data-base, fonte, arquivo, SHA-256 abreviado (inteiro no title), data, composições e encargos', async () => {
    const { store } = await montar()
    expect((await store.criarObra({ modelo: 'branco', dados: dadosSp })).ok).toBe(true)
    expect(await store.importarRecorteSinapi(amostraTexto)).toEqual({ ok: true })
    await nextTick()
    expect(texto('estado-integracao')).toBe('Configurada')
    expect(texto('sinapi-uf')).toBe('SP')
    expect(sinapi().textContent).toContain('Não desonerado')
    expect(sinapi().textContent).toContain('09/2026')
    expect(texto('sinapi-fonte')).toBe('SINAPI — Caixa — Relatórios mensais (formato a partir de 2025)')
    expect(texto('sinapi-arquivo')).toBe('SINAPI_Referencia_2026_09.xlsx')
    expect(texto('sinapi-sha')).toBe('9f1a69dfbe10…')
    expect(sinapi().querySelector('[data-testid="sinapi-sha"]')?.getAttribute('title')).toBe('9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2')
    expect(texto('sinapi-composicoes')).toBe('3')
    expect(texto('sinapi-encargos')).toBe('horista 115,01% · mensalista 71,18%') // CR-10
    expect(texto('sinapi-importado')).toMatch(/^\d{2}\/\d{2}\/\d{2}$/)
    expect(botoes()).toEqual(expect.arrayContaining(['Substituir recorte', 'Remover desta obra']))
    expect(sinapi().querySelector('[data-testid="sinapi-aviso"]')).toBeNull()
  })

  it('outra obra com a mesma chave vê "Usar nesta obra" e a informação, sem vínculo automático (Q3)', async () => {
    const { store } = await montar()
    await store.criarObra({ modelo: 'branco', dados: dadosSp })
    await store.importarRecorteSinapi(amostraTexto)
    await store.criarObra({ modelo: 'branco', dados: { ...dadosSp, nome: 'Obra SP 2' } })
    await nextTick()
    expect(texto('estado-integracao')).toBe('Não configurada')
    expect(botoes()).toContain('Usar nesta obra')
    expect(texto('sinapi-disponivel')).toContain('SP 09/2026 não desonerado')
    ;(sinapi().querySelector('[data-testid="sinapi-usar"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(texto('estado-integracao')).toBe('Configurada'))
  })

  it('substituído em outra importação: mostra o aviso com a data', async () => {
    const { store, adaptador } = await montar()
    const { id } = (await store.criarObra({ modelo: 'branco', dados: dadosSp })) as { ok: true; id: string }
    await store.importarRecorteSinapi(amostraTexto)
    const reg = adaptador.recortes.get('SP|nao-desonerado|2026-09')!
    // O registro compartilhado passa a ter outro SHA-256 (outra obra o substituiu): ao reabrir esta obra, o cartão avisa
    const recorte = JSON.parse(reg.json)
    recorte.fonte.sha256 = 'd'.repeat(64)
    adaptador.recortes.set(reg.chave, { ...reg, json: JSON.stringify(recorte), sha256Origem: 'd'.repeat(64), importadoEm: '2026-12-01T10:00:00.000Z' })
    await store.criarObra({ modelo: 'exemplo' })
    await store.trocarObra(id)
    await nextTick()
    expect(texto('sinapi-substituido')).toContain('Recorte substituído em 01/12/26')
  })

  it('recorte salvo ilegível: aviso no cartão e a obra segue no catálogo ilustrativo', async () => {
    const { store, adaptador } = await montar()
    const { id } = (await store.criarObra({ modelo: 'branco', dados: dadosSp })) as { ok: true; id: string }
    await store.importarRecorteSinapi(amostraTexto)
    const reg = adaptador.recortes.get('SP|nao-desonerado|2026-09')!
    adaptador.recortes.set(reg.chave, { ...reg, json: '{lixo' })
    await store.criarObra({ modelo: 'exemplo' })
    await store.trocarObra(id)
    await nextTick()
    expect(texto('estado-integracao')).toBe('Não configurada')
    expect(texto('sinapi-aviso')).toBe('O recorte SINAPI salvo está corrompido: a obra usa o catálogo ilustrativo.')
  })
})
