import { cartaoCenario, expect, kpi, test } from './fixtures'

const ESPACO = ' ' // o Intl põe espaço não separável depois de "R$"

test('premissas: versão com indireto de R$ 12.000 mostra a economia da hora extra e o rótulo da versão', async ({ page }) => {
  await page.goto('/#/premissas')
  await expect(page.getByRole('heading', { level: 1, name: 'Premissas da obra' })).toBeVisible()
  await expect(page.getByTestId('versao-vigente')).toHaveText('Premissas v1 — vigência 04/05/2026')
  await expect(page.locator('header, div').getByText('Ilustrativa', { exact: true }).first()).toBeVisible() // selo de valor de exemplo

  await page.getByLabel('Custo indireto por dia útil').fill('12000')
  await page.getByLabel('Motivo da alteração').fill('Orçamento revisado')
  await page.getByRole('button', { name: 'Salvar como nova versão' }).click()
  await expect(page.getByTestId('versao-vigente')).toHaveText('Premissas v2 — vigência 23/10/2026')

  await page.getByRole('navigation').getByRole('button', { name: /Caminho Crítico/ }).click()
  const he = cartaoCenario(page, 'Hora Extra (Sábados)')
  await expect(he).toContainText(`− R$${ESPACO}24.000`) // 2 d.u. × R$ 12.000
  await expect(he.getByTestId('versao-premissas')).toHaveText('Premissas v2 — vigência 23/10/2026')
  await expect(cartaoCenario(page, 'Crashing (Compressão)')).toContainText(`− R$${ESPACO}36.000`) // 3 d.u. × R$ 12.000
  // Premissa não muda cronograma nem EVM
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')

  await page.getByRole('navigation').getByRole('button', { name: /Valor Agregado/ }).click()
  await expect(page.getByText('Premissas v2 — vigência 23/10/2026')).toBeVisible()
})

test('premissas: vigência anterior à da última versão é recusada com a mensagem', async ({ page }) => {
  await page.goto('/#/premissas')
  await page.getByLabel('Custo indireto por dia útil').fill('11000')
  await page.getByLabel('Motivo da alteração').fill('Teste')
  await page.getByLabel('Vigência da nova versão').fill('2026-05-03')
  await expect(page.getByRole('alert')).toContainText('A vigência deve ser igual ou posterior à da versão 1 (04/05/2026).')
})

test('premissas: indireto por mês é convertido em dia útil (R$ 249.000/mês = R$ 12.000/dia em 2026)', async ({ page }) => {
  await page.goto('/#/premissas')
  await page.getByLabel('Por mês').check()
  await page.getByLabel('Custo indireto por mês').fill('249000')
  await expect(page.getByTestId('conversao-indireto')).toContainText('249 dias úteis em 2026')
  await expect(page.getByTestId('conversao-indireto')).toContainText(`R$${ESPACO}12.000,00 por dia útil`)
  await expect(page.getByTestId('jornada-resumo')).toContainText('seg–sex 8 h; sáb–dom —')
})

test('suprimentos: a margem da DLP é só leitura e vem das premissas', async ({ page }) => {
  await page.goto('/#/suprimentos')
  await expect(page.getByText('dias (definida nas premissas da obra)')).toBeVisible()
  await expect(page.getByLabel('Margem de segurança em dias')).toHaveText('3')
})

test('hora extra por frente: escolher a 03.01.02 custa R$ 4.162 e recupera 2 d.u.; aplicar e desfazer volta a 23/06/27', async ({ page }) => {
  await page.goto('/#/caminho-critico')
  const he = cartaoCenario(page, 'Hora Extra (Sábados)')
  await expect(he).toContainText(`R$${ESPACO}22.315`) // todas as frentes: o resultado de sempre
  await he.getByLabel('Escolher as frentes').check()
  await he.getByLabel(/^Frente 03\.01\.02/).check()
  await expect(he).toContainText(`+ R$${ESPACO}4.162`) // R$ 4.161,60
  await expect(he).toContainText('−2')
  await expect(he).toContainText('nas frentes 03.01.02')
  await he.getByRole('button', { name: 'Aplicar no cronograma' }).click()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('21/06/27')
  // o calendário derivado aparece na aba de calendários
  await page.getByRole('navigation').getByRole('button', { name: /Premissas/ }).click()
  await page.getByRole('tab', { name: 'Calendários' }).click()
  await expect(page.getByLabel('Calendário', { exact: true })).toContainText('Padrão Obra (seg-sex, 8h) + HE 24/10 e 31/10')
  await page.getByRole('navigation').getByRole('button', { name: /Caminho Crítico/ }).click()
  await cartaoCenario(page, 'Hora Extra (Sábados)').getByRole('button', { name: 'Desfazer cenário' }).click()
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await page.getByRole('navigation').getByRole('button', { name: /Premissas/ }).click()
  await page.getByRole('tab', { name: 'Calendários' }).click()
  await expect(page.getByLabel('Calendário', { exact: true })).not.toContainText('HE 24/10')
})

test('hora extra em meio período: 1 d.u. e R$ 11.158 (4 h de sábado, adicional de 50%)', async ({ page }) => {
  await page.goto('/#/caminho-critico')
  const he = cartaoCenario(page, 'Hora Extra (Sábados)')
  await he.getByLabel('Jornada do sábado').selectOption('meio')
  await expect(he).toContainText('(4 h, adicional de 50%)')
  await expect(he).toContainText(`+ R$${ESPACO}11.158`)
  await expect(he).toContainText('−1')
})
