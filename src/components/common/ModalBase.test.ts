// Diálogo (ciclo 00007, rodada 02: N-1 e VIS-5): foco inicial no primeiro campo, trava de foco, foco devolvido a quem abriu e fundo que não descarta o digitado.
// Teste de tela sem @vue/test-utils (como o do módulo SINAPI): monta no jsdom e consulta só o DOM.
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue'
import ModalBase from './ModalBase.vue'

let app: App | undefined
let raiz: HTMLElement

async function montar() {
  const aberto = ref(false)
  const fechou = ref(0)
  const Pagina = defineComponent({
    setup() {
      return () =>
        h('div', [
          h('button', { id: 'abrir', onClick: () => (aberto.value = true) }, 'Abrir'),
          aberto.value
            ? h(
                ModalBase,
                { titulo: 'Diálogo de teste', onFechar: () => { aberto.value = false; fechou.value++ } },
                { default: () => h('form', [h('input', { id: 'campo-a' }), h('input', { id: 'campo-b' }), h('button', { id: 'enviar', type: 'submit' }, 'Enviar')]) },
              )
            : null,
        ])
    },
  })
  raiz = document.createElement('div')
  document.body.appendChild(raiz)
  app = createApp(Pagina)
  app.mount(raiz)
  await nextTick()
  const abrir = raiz.querySelector('#abrir') as HTMLButtonElement
  abrir.focus()
  abrir.click()
  await nextTick()
  return { abrir, fechou, aberto }
}
const el = (id: string) => document.getElementById(id) as HTMLElement
const tecla = (key: string, shiftKey = false) => document.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
const fundo = () => raiz.querySelector('.fixed') as HTMLElement
const fecharDoCabecalho = () => raiz.querySelector('[aria-label="Fechar"]') as HTMLElement

afterEach(() => {
  app?.unmount()
  raiz?.remove()
  app = undefined
})

describe('ModalBase', () => {
  it('o foco inicial vai ao primeiro campo do formulário, e não ao botão "Fechar" do cabeçalho; o diálogo tem papel, modal e título', async () => {
    await montar()
    expect(document.activeElement).toBe(el('campo-a'))
    const d = raiz.querySelector('[role="dialog"]')!
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)?.textContent).toBe('Diálogo de teste')
  })

  it('trava de foco: Tab no último elemento volta ao primeiro; Shift+Tab no primeiro vai ao último', async () => {
    await montar()
    el('enviar').focus()
    tecla('Tab')
    expect(document.activeElement).toBe(fecharDoCabecalho())
    tecla('Tab', true)
    expect(document.activeElement).toBe(el('enviar'))
    // Foco fora do diálogo (clique no vazio): o Tab o traz de volta para dentro
    ;(document.activeElement as HTMLElement).blur()
    tecla('Tab')
    expect(document.activeElement).toBe(fecharDoCabecalho())
  })

  it('Esc fecha e o foco volta ao botão que abriu o diálogo', async () => {
    const { abrir, fechou } = await montar()
    tecla('Escape')
    await nextTick()
    expect(fechou.value).toBe(1)
    expect(raiz.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(abrir)
  })

  it('clicar no fundo fecha quando nada foi digitado; com texto digitado, NÃO fecha (o texto não se perde por um clique perdido)', async () => {
    const { fechou } = await montar()
    const campo = el('campo-a') as HTMLInputElement
    campo.value = 'texto digitado'
    campo.dispatchEvent(new Event('input', { bubbles: true }))
    fundo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(fechou.value).toBe(0)
    expect(raiz.querySelector('[role="dialog"]')).not.toBeNull()
    // O botão "Fechar" continua fechando, de propósito
    fecharDoCabecalho().click()
    await nextTick()
    expect(fechou.value).toBe(1)
  })

  it('sem nada digitado, clicar no fundo fecha e devolve o foco', async () => {
    const { abrir, fechou } = await montar()
    fundo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await nextTick()
    expect(fechou.value).toBe(1)
    expect(document.activeElement).toBe(abrir)
  })
})
