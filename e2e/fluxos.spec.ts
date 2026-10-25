import { readFile } from 'node:fs/promises'
import { cartaoCenario, expect, kpi, test, toast, topo } from './fixtures'

const ESPACO = ' ' // o Intl põe espaço não separável depois de "R$"

test('C-1: estado inicial da obra de exemplo', async ({ page }) => {
  await page.goto('/')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect(kpi(page, 'CPI')).toContainText('0,93')
})

test('C-2: aprovar o apontamento do Mestre Tião antecipa a entrega', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Aprovar e Atualizar EAP' }).click()
  await expect(toast(page, 'EAP atualizada: [UID 104] 03.01.02')).toContainText('Avanço 40% → 75%. Entrega antecipada em 5 dia(s) útil(eis).')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+11 d.u.')
})

test('C-3: aplicar crashing no cronograma', async ({ page }) => {
  await page.goto('/#/caminho-critico')
  await cartaoCenario(page, 'Crashing (Compressão)').getByRole('button', { name: 'Aplicar no cronograma' }).click()
  const aviso = toast(page, 'Crashing (Compressão) aplicado')
  await expect(aviso).toContainText('Entrega: 23/06/27 → 18/06/27')
  await expect(aviso).toContainText(`R$${ESPACO}12.617`)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('18/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+13 d.u.')
})

test('C-7: recarregar mantém o estado salvo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Aprovar e Atualizar EAP' }).click()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
  // A gravação tem atraso (debounce de 300 ms): espera o estado chegar ao localStorage, sem sleep fixo
  await expect
    .poll(() => page.evaluate(() => (localStorage.getItem('cronoai-state-v1') ?? '').includes('"percentComplete":75')))
    .toBe(true)
  await page.reload()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  await expect(page.getByRole('row').filter({ hasText: '03.01.02' }).getByLabel('Percentual concluído')).toHaveValue('75')
})

test('C-4 e C-5: aprovar o apontamento, exportar o XML e importar o mesmo arquivo', async ({ page }, testInfo) => {
  await page.goto('/')

  // Canteiro → MS Project (SPEC-00 §7): o avanço aprovado precisa sair no XML
  await page.getByRole('button', { name: 'Aprovar e Atualizar EAP' }).click()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')

  // Exportar (o toast some em 5 s: é conferido antes de gravar o arquivo)
  const download = page.waitForEvent('download')
  await topo(page).getByRole('button', { name: 'Exportar para MS Project' }).click()
  const arquivo = await download
  await expect(toast(page, 'XML do MS Project gerado e validado')).toContainText('29 tarefas, 24 vínculos')
  expect(arquivo.suggestedFilename()).toBe('Edificio_Residencial_Aurora_12_Pavimentos_2026-10-23.xml')
  const caminho = testInfo.outputPath(arquivo.suggestedFilename())
  await arquivo.saveAs(caminho)
  const xml = await readFile(caminho, 'utf-8')
  expect(xml.startsWith('<?xml')).toBe(true)
  expect(xml).toContain('xmlns="http://schemas.microsoft.com/project"')
  expect(xml.match(/<Task>/g)).toHaveLength(30)
  const tarefa104 = xml.match(/<Task>\s*<UID>104<\/UID>[\s\S]*?<\/Task>/)?.[0] ?? ''
  expect(tarefa104).toContain('<PercentComplete>75</PercentComplete>')

  // Importar o arquivo exportado
  const seletor = page.waitForEvent('filechooser')
  await topo(page).getByRole('button', { name: 'Importar .xml' }).click()
  await (await seletor).setFiles(caminho)
  await expect(toast(page, 'Cronograma importado')).toContainText('29 tarefas carregadas')
  // Os avisos de importação saem no mesmo tick do toast de sucesso (useMsProject.ts), então a ausência já vale aqui
  await expect(page.locator('[aria-live="polite"]').getByText('Atenção na importação', { exact: true })).toHaveCount(0)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
})
