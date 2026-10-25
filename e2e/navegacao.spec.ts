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
