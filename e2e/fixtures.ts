import { expect, test as base, type Locator, type Page } from '@playwright/test'

// Todo teste falha se a página emitir console.error ou erro não tratado (avisos não contam).
export const test = base.extend<{ errosDeConsole: string[] }>({
  errosDeConsole: [
    async ({ page }, use) => {
      const erros: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') erros.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => erros.push(`pageerror: ${err.message}`))
      await use(erros)
      expect(erros, 'erros de console durante o teste').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Cabeçalho do topo (banner): escopo dos KPIs e dos botões de importar/exportar. */
export const topo = (page: Page): Locator => page.getByRole('banner')

/** Bloco de KPI do topo pelo rótulo (ex.: "Entrega das chaves", "SPI"). */
export const kpi = (page: Page, rotulo: string): Locator => topo(page).getByText(rotulo, { exact: true }).locator('xpath=..')

/** Toast pelo título, dentro da região aria-live (o mesmo texto pode aparecer em tabelas da tela). */
export const toast = (page: Page, titulo: string): Locator =>
  page.locator('[aria-live="polite"]').getByText(titulo, { exact: true }).locator('xpath=..')

/** Cartão de cenário pelo título do h3. */
export const cartaoCenario = (page: Page, titulo: string): Locator =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: titulo }) })
