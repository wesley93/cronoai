import { fileURLToPath } from 'node:url'
import { expect, kpi, test, toast, topo } from './fixtures'

const FIXTURE_DIVERGENCIAS = fileURLToPath(new URL('../src/lib/__fixtures__/mspdi-divergencias.xml', import.meta.url))

test('criar "Concretagem — sábado manhã", atribuir ao pacote 03.01 e ver as datas (entrega 23/06/27 → 18/06/27)', async ({ page }) => {
  await page.goto('/#/premissas')
  await page.getByRole('tab', { name: 'Calendários' }).click()
  await page.getByLabel('Novo calendário (cópia de outro)').fill('Concretagem — sábado manhã')
  await page.getByRole('button', { name: 'Criar', exact: true }).click()
  await expect(toast(page, 'Calendário criado')).toBeVisible()
  await expect(page.getByLabel('Calendário', { exact: true })).toContainText('Concretagem — sábado manhã')
  // sábado de 4 h: predefinição "4 h" no sábado e salvar a jornada
  await page.getByLabel('Jornada de Sábado').selectOption({ label: '4 h (08:00–12:00)' })
  await page.getByRole('button', { name: 'Salvar jornada' }).click()
  await expect(toast(page, 'Jornada salva')).toContainText('sáb 4 h')

  // EAP: aplicar o calendário às tarefas do pacote 03.01
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  await page.getByLabel('Pacote da EAP').selectOption('03.01')
  await page.getByLabel('Calendário', { exact: true }).selectOption({ label: 'Concretagem — sábado manhã' })
  await page.getByRole('button', { name: 'Aplicar calendário às 3 tarefas do pacote' }).click()
  await expect(toast(page, 'Calendário atribuído')).toContainText('3 tarefa(s) do pacote 03.01')
  await expect(page.getByRole('row').filter({ hasText: '03.01.02' }).getByLabel('Calendário da tarefa')).toHaveText(/Concretagem — sábado manhã/)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('18/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+13 d.u.')
})

test('importar arquivo sem feriados avisa, não injeta e "Aplicar feriados da obra" mostra a prévia antes de aplicar', async ({ page }) => {
  await page.goto('/')
  const seletor = page.waitForEvent('filechooser')
  await topo(page).getByRole('button', { name: 'Importar .xml' }).click()
  await (await seletor).setFiles(FIXTURE_DIVERGENCIAS)
  await expect(toast(page, 'Cronograma importado')).toContainText('5 tarefas carregadas')
  await expect(page.locator('[aria-live="polite"]')).toContainText('O CronoAI não acrescentou nenhum')

  await page.goto('/#/premissas')
  await page.getByRole('tab', { name: 'Feriados' }).click()
  await expect(page.getByTestId('aviso-sem-feriados')).toContainText('1 calendário(s) não aplicam os feriados da obra')
  await page.getByRole('button', { name: 'Ver a prévia na aba Calendários' }).click()

  await expect(page.getByTestId('calendario-sem-feriados')).toBeVisible()
  await page.getByRole('button', { name: 'Ver a prévia de aplicar os feriados da obra' }).click()
  const previa = page.getByTestId('previa-impacto')
  await expect(previa).toContainText('4 tarefa(s) mudam de data.') // T2 a T5 (a T1 termina antes do feriado de 07/09)
  await expect(previa.getByTestId('previa-entrega-antes')).not.toHaveText('')
  // a prévia não grava nada: o painel continua com 2 divergências até aplicar
  await page.goto('/#/caminho-critico')
  await expect(page.getByTestId('divergencias-tabela').getByRole('row')).toHaveCount(3)

  await page.goto('/#/premissas')
  await page.getByRole('tab', { name: 'Calendários' }).click()
  await page.getByRole('button', { name: 'Ver a prévia de aplicar os feriados da obra' }).click()
  await page.getByRole('button', { name: 'Aplicar feriados da obra', exact: true }).click()
  await expect(toast(page, 'Feriados da obra aplicados')).toBeVisible()

  await page.goto('/#/caminho-critico')
  const tabela = page.getByTestId('divergencias-tabela')
  await expect(tabela.getByRole('row')).toHaveCount(5) // D-2 a D-6 voltam
  await expect(tabela.getByRole('row').filter({ has: page.getByRole('cell', { name: '2', exact: true }) })).toContainText('Feriados da obra aplicados ao calendário importado.')
})

test('feriados da obra: desligar o Carnaval antecipa a entrega para 21/06/27 (+14 d.u.)', async ({ page }) => {
  await page.goto('/#/premissas')
  await page.getByRole('tab', { name: 'Feriados' }).click()
  await page.getByLabel(/^Carnaval/).uncheck()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('21/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+14 d.u.')
})
