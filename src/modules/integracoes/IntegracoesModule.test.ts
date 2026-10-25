// Teste de componente sem @vue/test-utils (D-15): monta o módulo no jsdom e consulta só o DOM (AC-8, SPEC-15: "nenhum cartão do front-only tem campo de credencial").
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp, type App } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import IntegracoesModule from '@/modules/IntegracoesModule.vue'

let app: App
let raiz: HTMLElement

beforeEach(() => {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  const pinia = createPinia()
  setActivePinia(pinia)
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(IntegracoesModule).use(pinia)
  app.mount(raiz)
})
afterEach(() => {
  app.unmount()
  raiz.remove()
})

const cartoes = () => [...raiz.querySelectorAll('article')]
const cartaoDe = (titulo: string) => cartoes().find((a) => a.querySelector('h3')?.textContent?.trim() === titulo)!

describe('tela Integrações (AC-8)', () => {
  it('mostra 6 cartões: o SINAPI e os 5 da Fase 2, cada um com o estado em texto e um ícone', () => {
    expect(raiz.querySelector('h1')?.textContent).toBe('Integrações')
    const titulos = cartoes().map((a) => a.querySelector('h3')?.textContent?.trim())
    expect(titulos).toEqual(['SINAPI', 'WhatsApp', 'IA e transcrição', 'ERP', 'E-mail e Teams', 'Login corporativo'])
    for (const a of cartoes()) {
      const estado = a.querySelector('[data-testid="estado-integracao"]')!
      expect(estado.textContent?.trim()).not.toBe('')
      expect(estado.querySelector('svg')).not.toBeNull()
    }
  })

  it('SINAPI: "Não configurada" e a UF, o regime e a data-base da obra (o exemplo não tem UF: nunca assume uma)', () => {
    const sinapi = cartaoDe('SINAPI')
    expect(sinapi.querySelector('[data-testid="estado-integracao"]')?.textContent?.trim()).toBe('Não configurada')
    expect(sinapi.querySelector('[data-testid="sinapi-uf"]')?.textContent?.trim()).toBe('não informada')
    expect(sinapi.textContent).toContain('Data-base')
  })

  it('Fase 2: "Requer servidor (Fase 2)", a spec e a área que aprova, e o aviso da credencial só no servidor', () => {
    const esperado: Record<string, [string, string]> = {
      WhatsApp: ['SPEC-08', 'Segurança da Informação e Jurídico'],
      'IA e transcrição': ['SPEC-08', 'Segurança da Informação e Jurídico'],
      ERP: ['SPEC-09 e SPEC-10', 'TI dona do ERP e Segurança da Informação'],
      'E-mail e Teams': ['SPEC-11', 'Segurança da Informação'],
      'Login corporativo': ['SPEC-02', 'Segurança da Informação e Infraestrutura'],
    }
    for (const [titulo, [spec, area]] of Object.entries(esperado)) {
      const a = cartaoDe(titulo)
      expect(a.querySelector('[data-testid="estado-integracao"]')?.textContent?.trim()).toBe('Requer servidor (Fase 2)')
      expect(a.textContent).toContain(spec)
      expect(a.textContent).toContain(area)
      expect(a.textContent).toContain('Na Fase 2, a credencial é cadastrada só no servidor e nunca volta para a tela.')
    }
  })

  it('os cartões da Fase 2 não têm input, textarea, select, button, link nem [contenteditable]: 0 campos', () => {
    const fase2 = cartoes().filter((a) => a.querySelector('h3')?.textContent?.trim() !== 'SINAPI')
    expect(fase2).toHaveLength(5)
    for (const a of fase2) {
      expect(a.querySelectorAll('input, textarea, select, button, a, [contenteditable]')).toHaveLength(0)
    }
  })

  it('nenhum input[type=password]; o único input possível é type=file com accept de JSON; nada com token, senha, chave ou segredo', () => {
    expect(raiz.querySelectorAll('input[type=password], input[type=text], input[type=hidden], textarea')).toHaveLength(0)
    for (const i of raiz.querySelectorAll('input')) {
      expect(i.getAttribute('type')).toBe('file')
      expect(i.getAttribute('accept')).toMatch(/json/)
    }
    const nomes = [...raiz.querySelectorAll('label, [placeholder], [name], [aria-label], [title]')].map((e) =>
      [e.textContent, e.getAttribute('placeholder'), e.getAttribute('name'), e.getAttribute('aria-label')].join(' '),
    )
    expect(nomes.join(' ')).not.toMatch(/token|senha|chave|segredo/i)
  })

  it('nenhum link externo nem endereço de provedor no texto da tela', () => {
    expect(raiz.querySelectorAll('a[href]')).toHaveLength(0)
    expect(raiz.textContent).not.toMatch(/https?:\/\//)
  })
})
