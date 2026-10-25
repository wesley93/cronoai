import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import './style.css'

const pinia = createPinia()

// Monta só depois de carregar a obra ativa do armazenamento: assim a obra de exemplo não "pisca" antes da obra salva.
// (Sem `await` no topo: o alvo de build padrão do Vite não o aceita.) Se a carga falhar, monta mesmo assim,
// com a gravação desligada (nada é sobrescrito no que está salvo).
useProjectStore(pinia)
  .carregar()
  .catch(() => undefined)
  .then(() => createApp(App).use(pinia).mount('#app'))
