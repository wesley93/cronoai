import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const MODULES = [
  { id: 'apontamento', label: 'Apontamento IA', short: 'Canteiro → MS Project', pain: 'Dor 1' },
  { id: 'caminho-critico', label: 'Caminho Crítico', short: 'Simulador "E se?"', pain: 'Dor 2' },
  { id: 'suprimentos', label: 'Suprimentos JIT', short: 'Data Limite de Pedido', pain: 'Dor 3' },
  { id: 'sinapi', label: 'Gerador SINAPI', short: 'Orçamento → Cronograma', pain: 'Dor 4' },
  { id: 'evm', label: 'Valor Agregado', short: 'EVM & Curva S', pain: 'Dor 5' },
  { id: 'eap', label: 'EAP / MS Project', short: 'Tabela do cronograma', pain: 'Base' },
  { id: 'obras', label: 'Obras', short: 'Lista e dados das obras', pain: 'Base' },
  { id: 'premissas', label: 'Premissas', short: 'Custos, taxas e versões', pain: 'Base' },
] as const
export type ModuleId = (typeof MODULES)[number]['id']

export type ToastTone = 'success' | 'info' | 'warning' | 'error'
export interface Toast {
  id: number
  tone: ToastTone
  title: string
  detail?: string
}

const THEME_KEY = 'cronoai-theme'

function readTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

function moduleFromHash(): ModuleId {
  const id = window.location.hash.replace('#/', '')
  return (MODULES.find((m) => m.id === id)?.id ?? 'apontamento') as ModuleId
}

export const useUiStore = defineStore('ui', () => {
  const theme = ref<'dark' | 'light'>(readTheme())
  const current = ref<ModuleId>(moduleFromHash())
  const toasts = ref<Toast[]>([])
  const sidebarOpen = ref(false)
  let seq = 0

  const applyTheme = () => document.documentElement.classList.toggle('dark', theme.value === 'dark')
  applyTheme()
  watch(theme, (t) => {
    applyTheme()
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* armazenamento indisponível: preferência só nesta sessão */
    }
  })

  watch(current, (id) => {
    if (window.location.hash !== `#/${id}`) window.location.hash = `/${id}`
    sidebarOpen.value = false
  })
  window.addEventListener('hashchange', () => (current.value = moduleFromHash()))

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function notify(tone: ToastTone, title: string, detail?: string) {
    const id = ++seq
    toasts.value.push({ id, tone, title, detail })
    setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 5000)
  }

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  return { theme, current, toasts, sidebarOpen, toggleTheme, notify, dismiss }
})
