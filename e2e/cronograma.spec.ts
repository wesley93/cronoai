import { fileURLToPath } from 'node:url'
import { expect, kpi, test, toast, topo } from './fixtures'

// Ciclo 00004, E4: painel de divergências com o MS Project e edição de restrição e prazo final na EAP.

const FIXTURE_DIVERGENCIAS = fileURLToPath(new URL('../src/lib/__fixtures__/mspdi-divergencias.xml', import.meta.url))

test('os KPIs do Aurora continuam os mesmos e o painel avisa que não há arquivo para comparar (R-2)', async ({ page }) => {
  await page.goto('/')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect(kpi(page, 'CPI')).toContainText('0,93')

  await page.goto('/#/caminho-critico')
  await expect(page.getByRole('heading', { name: 'Divergências com o MS Project' })).toBeVisible()
  await expect(page.getByTestId('divergencias-sem-arquivo')).toContainText('não veio de um arquivo do MS Project')
})

test('importar o .xml de divergências mostra D-2, D-3, D-4 e D-6 com as causas, e a T1 igual ao arquivo fica de fora', async ({ page }) => {
  await page.goto('/')
  const seletor = page.waitForEvent('filechooser')
  await topo(page).getByRole('button', { name: 'Importar .xml' }).click()
  await (await seletor).setFiles(FIXTURE_DIVERGENCIAS)
  await expect(toast(page, 'Cronograma importado')).toContainText('5 tarefas carregadas')

  await page.goto('/#/caminho-critico')
  const tabela = page.getByTestId('divergencias-tabela')
  await expect(tabela).toBeVisible()
  await expect(tabela.getByRole('row')).toHaveCount(5) // cabeçalho + 4 tarefas (a T1 é igual ao arquivo)
  const linha = (uid: number) => tabela.getByRole('row').filter({ has: page.getByRole('cell', { name: String(uid), exact: true }) })
  // D-2: feriado nacional aplicado (o arquivo não trazia feriados), +1 d.u.
  await expect(linha(2)).toContainText('Feriado nacional aplicado pelo CronoAI')
  await expect(linha(2)).toContainText('+1')
  // D-3: efeito da predecessora UID 2
  await expect(linha(3)).toContainText('Efeito da predecessora UID 2.')
  // D-4: agendada manualmente, -4 d.u.
  await expect(linha(4)).toContainText('Agendada manualmente no MS Project')
  await expect(linha(4)).toContainText('−4')
  // D-6: a sucessora aponta para o UID da manual
  await expect(linha(5)).toContainText('Predecessora UID 4 agendada manualmente.')

  // Filtro por causa
  await page.getByLabel('Filtrar por causa').selectOption({ label: 'Agendada manualmente (1)' })
  await expect(tabela.getByRole('row')).toHaveCount(2)
})

test('editar o prazo final de uma tarefa para antes do término acende o indicador sem mudar a entrega', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  const linha105 = page.getByRole('row').filter({ hasText: '03.01.03' })
  await expect(linha105.getByText('Prazo perdido')).toHaveCount(0)
  // A UID 105 termina em 30/11/26: prazo em 20/11/26
  await linha105.getByLabel('Prazo final').fill('2026-11-20')
  await expect(linha105.getByText('Prazo perdido')).toBeVisible()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27') // o prazo não move a tarefa

  await page.getByRole('navigation').getByRole('button', { name: /Caminho Crítico/ }).click()
  await expect(page.getByRole('row').filter({ hasText: '03.01.03' }).getByText('Prazo perdido')).toBeVisible()
})

test('restrição MSO antes do que o vínculo permite mostra o indicador de conflito (rótulo e ícone)', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation').getByRole('button', { name: /EAP \/ MS Project/ }).click()
  const linha105 = page.getByRole('row').filter({ hasText: '03.01.03' })
  await linha105.getByLabel('Tipo de restrição').selectOption({ label: 'Deve iniciar em (MSO)' })
  await expect(linha105.getByLabel('Data da restrição')).toBeVisible() // a data começa no início calculado da tarefa
  await linha105.getByLabel('Data da restrição').fill('2026-10-30')
  await expect(linha105.getByText('Restrição em conflito')).toBeVisible()
  // Voltar para ASAP remove a restrição e o indicador
  await linha105.getByLabel('Tipo de restrição').selectOption({ label: 'O mais cedo possível (ASAP)' })
  await expect(linha105.getByText('Restrição em conflito')).toHaveCount(0)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
})
