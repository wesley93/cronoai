import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useProjectStore } from '@/stores/useProjectStore'
import './style.css'

const pinia = createPinia()
const projeto = useProjectStore(pinia)

// Monta só depois de carregar a obra ativa do armazenamento: assim a obra de exemplo não "pisca" antes da obra salva.
// (Sem `await` no topo: o alvo de build padrão do Vite não o aceita.) Se a carga falhar, monta mesmo assim,
// mas com aviso persistente e a gravação desligada: nada é sobrescrito no que está salvo e nunca aparece "salvo".
projeto
  .carregar()
  .catch(() => projeto.bloquearGravacao('Não foi possível carregar as obras deste navegador. Nada foi gravado, para não sobrescrever o que já existe.'))
  .then(() => createApp(App).use(pinia).mount('#app'))
