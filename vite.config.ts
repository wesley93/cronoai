/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5180, strictPort: true },
  test: {
    environment: 'jsdom',
    // Só os testes unitários: os *.spec.ts de e2e/ são do Playwright e não podem rodar no Vitest
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // download.ts e useMsProject.ts dependem de DOM/store: só o caminho feliz de export/import é coberto pelo E2E;
      // os ramos de erro de useMsProject.ts (XML inválido, extensão, tamanho, avisos, exceção) ainda não têm teste
      exclude: ['src/lib/**/*.test.ts', 'src/lib/download.ts', 'src/lib/useMsProject.ts'],
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: 'coverage',
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
})
