import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

// E2E contra o build de produção (vite preview), só Chromium: o público usa Edge/Chrome.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'pt-BR',
    viewport: { width: 1440, height: 900 }, // KPIs do topo só aparecem a partir de 1280 px
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
