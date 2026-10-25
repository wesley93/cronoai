<script setup lang="ts">
import { ref } from 'vue'
import { Send, ImagePlus, X } from 'lucide-vue-next'
import { useProjectStore } from '@/stores/useProjectStore'
import { useUiStore } from '@/stores/ui'

const emit = defineEmits<{ created: [id: string] }>()
const project = useProjectStore()
const ui = useUiStore()

const AUTHORS = [
  { author: 'Mestre Tião', role: 'Mestre de Obras' },
  { author: 'Seu Raimundo', role: 'Encarregado de Alvenaria' },
  { author: 'Josué Ribeiro', role: 'Encarregado de Estrutura' },
  { author: 'Rogério Lima', role: 'Eletricista · Empreiteira de instalações' },
  { author: 'Você (simulação)', role: 'Engenheiro de Planejamento' },
]
const EXAMPLES = [
  'Chefe, terminamos o tijolo do 2º andar hoje, tá 100%. Amanhã a turma sobe pro 3º.',
  'Começamos o reboco interno no 1º andar, uns 10%, mas faltou areia na central.',
  'Concretamos a laje do 8º, estrutura do 5º ao 8º tá uns 95%. Choveu das 13h às 15h.',
  'Os encanadores já passaram as prumadas do 1º ao 4º, diria que uns 12% da hidráulica.',
]
const MAX_PHOTO_BYTES = 8 * 1024 * 1024

const who = ref(0)
const text = ref('')
const photoUrl = ref<string>()
const fileInput = ref<HTMLInputElement>()

/** Reduz a foto para ~360px (JPEG) para caber no armazenamento local. */
function downscale(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const scale = Math.min(1, 360 / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Imagem inválida'))
    }
    img.src = url
  })
}

async function onPhoto(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/') || file.size > MAX_PHOTO_BYTES) {
    ui.notify('error', 'Foto não aceita', 'Envie uma imagem (JPG/PNG) de até 8 MB.')
    return
  }
  try {
    photoUrl.value = await downscale(file)
  } catch {
    ui.notify('error', 'Não foi possível ler a imagem')
  }
}

function send() {
  const content = text.value.trim()
  if (content.length < 8) {
    ui.notify('warning', 'Relato muito curto', 'Descreva o serviço, o pavimento e o avanço (ex.: "tijolo do 3º andar uns 40%").')
    return
  }
  const r = project.addReport({ ...AUTHORS[who.value], transcript: content.slice(0, 600), photoUrl: photoUrl.value })
  text.value = ''
  photoUrl.value = undefined
  emit('created', r.id)
}
</script>

<template>
  <div class="border-t border-zinc-200 p-3 dark:border-zinc-800">
    <div class="mb-2 flex flex-wrap gap-1.5">
      <button
        v-for="(ex, i) in EXAMPLES"
        :key="i"
        class="rounded-full border border-zinc-200 px-2 py-0.5 text-[10.5px] text-zinc-500 hover:border-amber-400 hover:text-zinc-800 dark:border-zinc-700 dark:hover:text-zinc-200"
        :title="ex"
        @click="text = ex"
      >
        Exemplo {{ i + 1 }}
      </button>
    </div>
    <div class="flex items-end gap-2">
      <div class="flex-1 space-y-2">
        <select v-model.number="who" class="input py-1.5 text-xs" aria-label="Quem envia o relato">
          <option v-for="(a, i) in AUTHORS" :key="a.author" :value="i">{{ a.author }} — {{ a.role }}</option>
        </select>
        <textarea
          v-model="text"
          rows="2"
          maxlength="600"
          class="input resize-none text-[13px]"
          placeholder="Simule um relato de canteiro em linguagem coloquial… (Ctrl+Enter envia)"
          @keydown.ctrl.enter.prevent="send"
        />
        <div v-if="photoUrl" class="relative inline-block">
          <img :src="photoUrl" alt="Prévia da foto" class="h-14 rounded-md border border-zinc-300 dark:border-zinc-700" />
          <button class="absolute -right-2 -top-2 rounded-full bg-zinc-900 p-0.5 text-white" aria-label="Remover foto" @click="photoUrl = undefined">
            <X class="h-3 w-3" />
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="onPhoto" />
        <button class="btn-secondary px-2.5" title="Anexar foto da obra" @click="fileInput?.click()"><ImagePlus class="h-4 w-4" /></button>
        <button class="btn-success px-2.5" title="Enviar relato" @click="send"><Send class="h-4 w-4" /></button>
      </div>
    </div>
  </div>
</template>
