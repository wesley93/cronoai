import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { expect, kpi, obraAtivaSalvaContem, test, toast, topo } from './fixtures'

const NOME_AURORA = 'Edifício Residencial Aurora - 12 Pavimentos'
const NOME_RECIFE = 'Residencial Recife (exemplo fictício)'

const lerFixture = (nome: string) => readFile(new URL(`../src/lib/__fixtures__/${nome}`, import.meta.url), 'utf-8')

/** Simula o estado que a versão anterior deixou no navegador (a chave `cronoai-state-v1`). */
async function gravarEstadoV1(page: Page, json: string) {
  await page.addInitScript((v1) => localStorage.setItem('cronoai-state-v1', v1), json)
}

const irParaObras = (page: Page) => page.getByRole('navigation').getByRole('button', { name: /Obras/ }).click()

/** Cria a obra em branco em PE/Recife pela tela Obras (cumpre a P2 = A: em branco, depois "Importar .xml"). */
async function criarObraRecife(page: Page) {
  await irParaObras(page)
  await page.getByRole('button', { name: 'Nova obra' }).click()
  const nova = page.locator('form').filter({ has: page.locator('#nova-nome') })
  await nova.getByLabel('Nome da obra').fill(NOME_RECIFE)
  await nova.getByLabel('UF').selectOption('PE')
  await nova.getByLabel('Município').fill('Recife')
  await nova.getByLabel('Data de início').fill('2026-11-03')
  await nova.getByLabel('Data de status').fill('2026-11-03')
  await nova.getByRole('button', { name: 'Criar obra' }).click()
  await expect(toast(page, 'Obra criada')).toBeVisible()
}

test('migração: a v1 salva vira a 1ª obra com os mesmos números e sobrevive ao recarregar', async ({ page }) => {
  await gravarEstadoV1(page, await lerFixture('estado-v1-aurora.json'))
  await page.goto('/')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect(kpi(page, 'CPI')).toContainText('0,93')

  await irParaObras(page)
  await expect(page.getByRole('row').filter({ hasText: NOME_AURORA })).toHaveCount(1)
  await expect(page.getByText('Migrada da versão anterior em')).toBeVisible()

  await page.reload()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(page.getByRole('row').filter({ hasText: NOME_AURORA })).toHaveCount(1)
})

test('migração com alteração: a v1 com o apontamento aprovado mantém 16/06/27 e +11 d.u.', async ({ page }) => {
  await gravarEstadoV1(page, await lerFixture('estado-v1-aurora-75.json'))
  await page.goto('/')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+11 d.u.')
})

test('criar obra em PE, alternar e ver só a obra ativa', async ({ page }) => {
  await page.goto('/')
  await criarObraRecife(page)

  // A obra em branco: no prazo, EAP sem linhas, Apontamento sem relatos
  await expect(kpi(page, 'Entrega das chaves')).toContainText('sem cronograma')
  await expect(kpi(page, 'SPI')).toContainText('—')
  await expect(kpi(page, 'CPI')).toContainText('—')
  await expect(page.getByLabel('Obra ativa').locator('option:checked')).toHaveText(`${NOME_RECIFE} · PE`)
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  await expect(page.getByRole('row').filter({ hasText: '03.01.02' })).toHaveCount(0)
  await page.getByRole('navigation').getByRole('button', { name: /Apontamento IA/ }).click()
  await expect(page.getByText('Nenhum relato neste filtro.')).toBeVisible()

  // Volta ao Aurora pelo seletor do topo
  await page.getByLabel('Obra ativa').selectOption({ label: NOME_AURORA })
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')

  // Recarregar mantém a obra ativa
  await expect.poll(() => obraAtivaSalvaContem(page, NOME_AURORA)).toBe(true)
  await page.reload()
  await expect(page.getByLabel('Obra ativa').locator('option:checked')).toHaveText(NOME_AURORA)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
})

test('a obra em branco recebe o .xml pelo Importar do topo e mantém UF e município', async ({ page }, testInfo) => {
  await page.goto('/')
  const download = page.waitForEvent('download')
  await topo(page).getByRole('button', { name: 'Exportar para MS Project' }).click()
  const arquivo = await download
  const caminho = testInfo.outputPath(arquivo.suggestedFilename())
  await arquivo.saveAs(caminho)

  await criarObraRecife(page)
  const seletor = page.waitForEvent('filechooser')
  await topo(page).getByRole('button', { name: 'Importar .xml' }).click()
  await (await seletor).setFiles(caminho)
  await expect(toast(page, 'Cronograma importado')).toContainText('29 tarefas carregadas')

  const linhaAtiva = page.getByRole('row').filter({ hasText: 'Ativa' })
  await expect(linhaAtiva).toContainText('PE')
  await expect(linhaAtiva).toContainText('Recife')
  await expect(page.getByLabel('Município')).toHaveValue('Recife')
})

test('excluir pede confirmação e o Aurora migrado não volta, mesmo com a v1 ainda salva', async ({ page }) => {
  await gravarEstadoV1(page, await lerFixture('estado-v1-aurora.json'))
  await page.goto('/')
  await criarObraRecife(page)

  const dialogos: string[] = []
  page.on('dialog', async (d) => {
    dialogos.push(d.message())
    await d.accept()
  })
  await page.getByRole('button', { name: `Excluir ${NOME_AURORA}` }).click()
  await expect(toast(page, 'Obra excluída')).toBeVisible()
  expect(dialogos).toHaveLength(1)
  expect(dialogos[0]).toContain(NOME_AURORA)
  await expect(page.getByRole('row').filter({ hasText: NOME_AURORA })).toHaveCount(0)

  // A única obra restante não pode ser excluída
  await expect(page.getByRole('button', { name: `Excluir ${NOME_RECIFE}` })).toBeDisabled()

  // A v1 continua no navegador (o init script a regrava), mas o índice manda: o Aurora não volta
  await page.reload()
  await irParaObras(page)
  await expect(page.getByRole('row').filter({ hasText: NOME_RECIFE })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: NOME_AURORA })).toHaveCount(0)
})

test('os 7 módulos abrem na obra em branco sem erro de console', async ({ page }) => {
  await page.goto('/')
  await criarObraRecife(page)
  const rotulos = [/Apontamento IA/, /Caminho Crítico/, /Suprimentos JIT/, /Gerador SINAPI/, /Valor Agregado/, /EAP \/ MS Project/, /Obras/]
  for (const rotulo of rotulos) {
    await page.getByRole('navigation').getByRole('button', { name: rotulo }).click()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  }
  // O aviso do catálogo SINAPI cita a UF da obra
  await page.getByRole('navigation').getByRole('button', { name: /Gerador SINAPI/ }).click()
  await expect(page.getByText('Catálogo SINAPI ilustrativo: não corresponde a PE.')).toBeVisible()
})

test('falha de gravação aparece em um aviso persistente', async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (...args: Parameters<IDBObjectStore['put']>) {
      if (Reflect.get(window, '__falharGravacao')) throw new DOMException('Cota simulada', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  await expect.poll(() => obraAtivaSalvaContem(page, '"percentComplete":40')).toBe(true) // a carga gravou a obra de exemplo
  await page.evaluate(() => Reflect.set(window, '__falharGravacao', true))

  const campo = page.getByRole('row').filter({ hasText: '03.01.02' }).getByLabel('Percentual concluído')
  await campo.fill('60')
  await campo.press('Tab')
  const aviso = page.getByRole('alert')
  await expect(aviso).toContainText('As alterações desta obra não estão sendo salvas')
  await expect(aviso).toContainText('Exporte para MS Project (.xml)')
})
