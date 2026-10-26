// Linhas de base LB0 a LB10 (ciclo 00007, E1): salvar a LB1, trocar a LB do valor agregado e ver PV e SPI mudarem e voltarem,
// com o atraso e a entrega contra a LB0 (G5 = b, como no MS Project). Números do Aurora conferidos à mão no plano.
import { expect, kpi, test, toast } from './fixtures'

test('LB: KPIs do Aurora com a LB0, sem fechamento e sem LB do valor agregado, não mudam', async ({ page }) => {
  await page.goto('/#/evm')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect(kpi(page, 'CPI')).toContainText('0,93')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(page.getByTestId('rotulo-lb-valor-agregado')).toHaveText('LB0')
})

test('LB: salvar a LB1 e trocar a LB do valor agregado muda o SPI (0,89 → 0,99) e volta; o atraso continua +16 d.u.', async ({ page }) => {
  await page.goto('/#/eap')
  await page.getByRole('button', { name: 'Salvar linha de base' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Salvar linha de base' })
  await expect(dialogo.getByLabel('Linha de base')).toHaveValue('1') // a primeira livre
  await dialogo.getByLabel('Nome').fill('Replanejamento após as chuvas')
  await dialogo.getByLabel('Motivo').fill('Teste de linha de base replanejada')
  await dialogo.getByRole('button', { name: 'Salvar linha de base' }).click()
  await expect(toast(page, 'Linha de base 1 salva')).toBeVisible()
  await expect(dialogo).toBeHidden()

  await page.getByRole('navigation').getByRole('button', { name: /Valor Agregado/ }).click()
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await page.getByLabel('LB do valor agregado:').selectOption('1')
  await expect(page.getByTestId('rotulo-lb-valor-agregado')).toHaveText('LB1')
  // PV linear entre o início e o término da LB (regra do CronoAI): a LB nasce com SPI 0,99
  await expect(kpi(page, 'SPI')).toContainText('0,99')
  // o atraso e a entrega continuam contra a LB0
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await page.getByLabel('LB do valor agregado:').selectOption('0')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
})

test('LB: sobrescrever uma linha de base exige a confirmação', async ({ page }) => {
  await page.goto('/#/eap')
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Salvar linha de base' }).click()
    const dialogo = page.getByRole('dialog', { name: 'Salvar linha de base' })
    await dialogo.getByLabel('Linha de base').selectOption('1')
    await dialogo.getByLabel('Nome').fill(`Versão ${i + 1}`)
    await dialogo.getByLabel('Motivo').fill('Teste')
    if (i === 1) {
      await dialogo.getByRole('button', { name: 'Salvar linha de base' }).click()
      await expect(dialogo.getByRole('alert')).toContainText('Marque a confirmação para substituir a linha de base 1.')
      await dialogo.getByRole('checkbox').check()
    }
    await dialogo.getByRole('button', { name: 'Salvar linha de base' }).click()
    await expect(dialogo).toBeHidden()
  }
})
