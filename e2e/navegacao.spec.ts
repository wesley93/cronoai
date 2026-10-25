import { expect, test } from './fixtures'

// Rótulo da barra lateral, hash e h1 (src/stores/ui.ts e ModuleHeader de cada módulo)
const MODULOS = [
  { rotulo: 'Apontamento IA', hash: '#/apontamento', h1: 'Apontamento de Canteiro via IA & Sincronização MS Project' },
  { rotulo: 'Caminho Crítico', hash: '#/caminho-critico', h1: 'Motor de Caminho Crítico & Simulador “E se?”' },
  { rotulo: 'Suprimentos JIT', hash: '#/suprimentos', h1: 'Orquestrador de Suprimentos Just-in-Time' },
  { rotulo: 'Gerador SINAPI', hash: '#/sinapi', h1: 'Gerador de Cronograma via Orçamento SINAPI' },
  { rotulo: 'Valor Agregado', hash: '#/evm', h1: 'Dashboard de Valor Agregado (EVM) e Curva S' },
  { rotulo: 'EAP / MS Project', hash: '#/eap', h1: 'EAP / Cronograma do MS Project' },
]

// O módulo inicial (Apontamento) não grava hash ao ser clicado: ele fica por último, depois de sair dele
const ORDEM = [...MODULOS.slice(1), MODULOS[0]]

test('navega pelos 6 módulos sem erro de console', async ({ page }) => {
  await page.goto('/')
  for (const m of ORDEM) {
    await page.getByRole('navigation').getByRole('button', { name: new RegExp(m.rotulo) }).click()
    await expect(page.getByRole('heading', { level: 1, name: m.h1 })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${m.hash}$`))
  }
})

// SPEC-15 E5 (ciclo 00006): a tela Integrações mostra o cartão SINAPI e os 5 da Fase 2, sem campo nenhum nos da Fase 2
test('Integrações: 6 cartões, estado em texto e nenhum campo de credencial nos da Fase 2', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: /Integrações/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Integrações' })).toBeVisible()
  await expect(page).toHaveURL(/#\/integracoes$/)
  const cartoes = page.locator('article')
  await expect(cartoes).toHaveCount(6)
  await expect(page.getByTestId('estado-integracao').filter({ hasText: 'Requer servidor (Fase 2)' })).toHaveCount(5)
  await expect(page.getByTestId('estado-integracao').filter({ hasText: 'Não configurada' })).toHaveCount(1)
  const fase2 = page.locator('article').filter({ hasNot: page.getByRole('heading', { name: 'SINAPI' }) })
  await expect(fase2).toHaveCount(5)
  await expect(fase2.locator('input, textarea, select, button, [contenteditable]')).toHaveCount(0)
  await expect(page.locator('input[type=password]')).toHaveCount(0)
})
