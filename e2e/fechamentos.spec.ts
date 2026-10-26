import { readFile } from 'node:fs/promises'
// Fechamento da data de status e retificação (ciclo 00007, E3): fechar, recarregar, retificar com motivo, recusa da data repetida e
// a obra salva na estrutura 2 do IndexedDB que abre igual na 3 (P-5). Números do Aurora conferidos à mão no plano.
import type { Page } from '@playwright/test'
import { expect, kpi, obraAtivaSalvaContem, test, toast } from './fixtures'

/** Quantos registros há na store `fechamentos` do IndexedDB (-1 = a store ainda não existe). */
const contarFechamentos = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onerror = () => resolve(-2)
        abrir.onsuccess = () => {
          const db = abrir.result
          if (!db.objectStoreNames.contains('fechamentos')) {
            db.close()
            resolve(-1)
            return
          }
          const c = db.transaction('fechamentos', 'readonly').objectStore('fechamentos').count()
          c.onsuccess = () => {
            db.close()
            resolve(c.result)
          }
        }
      }),
  )

/** Chaves da store `recortesSinapi` do IndexedDB. */
const chavesDeRecorte = (page: Page): Promise<string[]> =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onerror = () => resolve([])
        abrir.onsuccess = () => {
          const db = abrir.result
          const c = db.transaction('recortesSinapi', 'readonly').objectStore('recortesSinapi').getAllKeys()
          c.onsuccess = () => {
            db.close()
            resolve(c.result.map(String))
          }
        }
      }),
  )

async function fecharPelaTela(page: Page) {
  await page.getByTestId('abrir-fechar').click()
  const dialogo = page.getByRole('dialog', { name: /Fechar data de status/ })
  await expect(dialogo.getByTestId('previa-fechamento')).toContainText('19.113.000,00')
  await dialogo.getByRole('button', { name: 'Fechar data de status' }).click()
  await expect(toast(page, 'Data de status fechada').last()).toBeVisible() // pode haver o aviso de um fechamento anterior ainda na tela
  await expect(dialogo).toBeHidden()
}

test('fechar a data de status mostra a prévia, grava e sobrevive ao recarregar', async ({ page }) => {
  await page.goto('/#/evm')
  await expect(page.getByTestId('sem-fechamentos')).toContainText('Esta obra ainda não tem fechamentos')
  await page.getByTestId('abrir-fechar').click()
  const dialogo = page.getByRole('dialog', { name: 'Fechar data de status (23/10/2026)' })
  // Prévia dos totais do Aurora (conferidos à mão no plano) e os avisos que não bloqueiam
  const previa = dialogo.getByTestId('previa-fechamento')
  await expect(previa).toContainText('19.113.000,00')
  await expect(previa).toContainText('7.259.250,00')
  await expect(previa).toContainText('6.448.200,00')
  await expect(previa).toContainText('6.896.900,00')
  await expect(previa).toContainText('0,89')
  await expect(previa).toContainText('0,93')
  await expect(previa).toContainText('23/06/2027')
  await expect(dialogo.getByTestId('avisos-fechamento')).toContainText('Há 4 relato(s) de campo pendente(s) de aprovação')
  await expect(dialogo).toContainText('Registro gerencial; não substitui a medição contratual.')
  await dialogo.getByRole('button', { name: 'Fechar data de status' }).click()
  await expect(toast(page, 'Data de status fechada')).toBeVisible()
  const linha = page.getByTestId('lista-fechamentos').getByRole('row').filter({ hasText: '23/10/2026' })
  await expect(linha).toContainText('Fechamento')
  await expect(linha).toContainText('efetivo')
  await expect(linha).toContainText('fechado contra a LB0 de 27/04/2026')
  await expect(page.getByTestId('persistencia')).toContainText('Armazenamento persistente:')
  // A gravação tem atraso: espera o cabeçalho chegar ao IndexedDB, sem sleep fixo, e recarrega
  await expect.poll(() => contarFechamentos(page)).toBe(1)
  await page.reload()
  await expect(page.getByTestId('lista-fechamentos').getByRole('row').filter({ hasText: '23/10/2026' })).toContainText('efetivo')
  // Nada mudou na obra: os KPIs do Aurora continuam os mesmos
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
})

test('fechar de novo na mesma data é recusado, com a mensagem de "Retificar"', async ({ page }) => {
  await page.goto('/#/evm')
  await fecharPelaTela(page)
  await page.getByTestId('abrir-fechar').click()
  const dialogo = page.getByRole('dialog', { name: /Fechar data de status/ })
  await expect(dialogo.getByTestId('fechar-erro')).toHaveText("Já existe fechamento em 23/10/2026: use 'Retificar'.")
  await expect(dialogo.getByRole('button', { name: 'Fechar data de status' })).toBeDisabled()
  await dialogo.getByRole('button', { name: 'Cancelar' }).click()
  await expect.poll(() => contarFechamentos(page)).toBe(1)
})

test('retificar exige o motivo, grava a retificação como efetiva e mantém o original com o selo "retificado"', async ({ page }) => {
  await page.goto('/#/evm')
  await fecharPelaTela(page)
  await page.getByTestId('retificar-1').click()
  const dialogo = page.getByRole('dialog', { name: /Retificar o fechamento de 23\/10\/2026/ })
  await dialogo.getByLabel('Novo % físico da tarefa 104').fill('45')
  await dialogo.getByLabel('Novo custo real da tarefa 104').fill('75000')
  // Prévia pela mesma função da gravação: EV 6.456.600,00 e AC 6.899.900,00 (conferidos à mão no plano)
  await expect(dialogo.getByTestId('previa-retificacao')).toContainText('6.456.600,00')
  await expect(dialogo.getByTestId('previa-retificacao')).toContainText('6.899.900,00')
  await dialogo.getByRole('button', { name: 'Gravar retificação' }).click()
  await expect(dialogo.getByRole('alert')).toHaveText('Informe o motivo da retificação.')
  await dialogo.getByLabel('Motivo da retificação (obrigatório)').fill('Medição revisada em campo')
  await dialogo.getByRole('button', { name: 'Gravar retificação' }).click()
  await expect(toast(page, 'Fechamento retificado')).toBeVisible()
  const lista = page.getByTestId('lista-fechamentos')
  const retificacao = lista.getByRole('row').filter({ hasText: 'Retificação' })
  await expect(retificacao).toContainText('Motivo: Medição revisada em campo')
  await expect(retificacao).toContainText('efetivo')
  const original = lista.getByRole('row').filter({ hasText: 'retificado' })
  await expect(original).toContainText('Fechamento')
  await expect(original).not.toContainText('efetivo')
  await expect.poll(() => contarFechamentos(page)).toBe(2)
  // A retificação não altera a obra atual
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
})

test('P-5: a obra salva na estrutura 2 do IndexedDB abre igual na 3 (obra, índice e recorte intactos) e passa a poder fechar', async ({ page }) => {
  await page.route('**/__em_branco', (rota) => rota.fulfill({ contentType: 'text/html', body: '<!doctype html><title>em branco</title>' }))
  await page.goto('/')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect.poll(() => obraAtivaSalvaContem(page, '"statusDate":"2026-10-23"')).toBe(true)
  // Sem a conexão do app aberta (página em branco da mesma origem): recria o banco na estrutura 2, com as mesmas stores e dados, sem as de fechamento
  await page.goto('/__em_branco')
  const antes = await page.evaluate(
    () =>
      new Promise<{ obras: number; indice: boolean }>((resolve, reject) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onerror = () => reject(abrir.error)
        abrir.onsuccess = () => {
          const db = abrir.result
          const tx = db.transaction(['obras', 'meta', 'recortesSinapi'], 'readonly')
          const obras = tx.objectStore('obras').getAll()
          const indice = tx.objectStore('meta').get('indice')
          const recortes = tx.objectStore('recortesSinapi').getAll()
          tx.oncomplete = () => {
            db.close()
            const apagar = indexedDB.deleteDatabase('cronoai')
            apagar.onerror = () => reject(apagar.error)
            apagar.onsuccess = () => {
              const criar = indexedDB.open('cronoai', 2) // estrutura 2: obras, meta e recortesSinapi
              criar.onupgradeneeded = () => {
                const d = criar.result
                d.createObjectStore('obras', { keyPath: 'id' })
                d.createObjectStore('meta')
                d.createObjectStore('recortesSinapi', { keyPath: 'chave' })
              }
              criar.onerror = () => reject(criar.error)
              criar.onsuccess = () => {
                const d = criar.result
                const t = d.transaction(['obras', 'meta', 'recortesSinapi'], 'readwrite')
                for (const o of obras.result) t.objectStore('obras').put(o)
                t.objectStore('meta').put(indice.result, 'indice')
                for (const r of recortes.result) t.objectStore('recortesSinapi').put(r)
                // Um recorte já salvo na estrutura 2 (registro de teste): precisa sobreviver à passagem para a 3
                t.objectStore('recortesSinapi').put({ chave: 'SP|nao-desonerado|2026-09', versaoFormato: 1, json: '{}', sha256Origem: 'a'.repeat(64), importadoEm: '2026-10-25T00:00:00.000Z', composicoes: 0 })
                t.oncomplete = () => {
                  const ver = d.version
                  d.close()
                  resolve({ obras: obras.result.length, indice: ver === 2 && !!indice.result })
                }
              }
            }
          }
        }
      }),
  )
  expect(antes).toEqual({ obras: 1, indice: true })
  // O app abre a estrutura 3 sobre o banco da 2: a obra é a mesma e as stores novas passam a existir
  await page.goto('/#/evm')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('23/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+16 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect.poll(() => contarFechamentos(page)).toBe(0)
  expect(await chavesDeRecorte(page)).toEqual(['SP|nao-desonerado|2026-09']) // o recorte da estrutura 2 continua lá
  await fecharPelaTela(page)
  await expect.poll(() => contarFechamentos(page)).toBe(1)
})

test('3 fechamentos com avanços diferentes: a tabela da Curva S mostra o EV e o AC gravados nos pontos de fechamento, com o trecho interpolado, a comparação e o JSON', async ({ page }) => {
  const reprogramar = async (data: string) => {
    await page.goto('/#/eap')
    await page.getByRole('button', { name: 'Reprogramar' }).locator('..').locator('input[type=date]').fill(data)
    await page.getByRole('button', { name: 'Reprogramar' }).click()
    await expect(toast(page, 'Data de status alterada').last()).toBeVisible()
  }
  // 1º fechamento (23/10): o estado do Aurora
  await page.goto('/#/evm')
  await fecharPelaTela(page)
  // 2º (30/10): o relato do Mestre Tião aprovado (104 de 40% para 75%)
  await reprogramar('2026-10-30')
  await page.goto('/#/apontamento') // só o hash muda: nada recarrega e o estado segue na tela
  await page.getByRole('button', { name: 'Aprovar e Atualizar EAP' }).click()
  await expect(toast(page, 'EAP atualizada: [UID 104] 03.01.02').last()).toBeVisible()
  await page.goto('/#/evm')
  await fecharPelaTela(page)
  // 3º (06/11): a 302 vai a 90%
  await reprogramar('2026-11-06')
  await page.getByRole('row').filter({ has: page.getByText('02.02', { exact: true }) }).getByLabel('Percentual concluído').fill('90')
  await page.getByRole('row').filter({ has: page.getByText('02.02', { exact: true }) }).getByLabel('Percentual concluído').press('Tab')
  await page.goto('/#/evm')
  await fecharPelaTela(page)
  await expect.poll(() => contarFechamentos(page)).toBe(3)

  // Tabela da Curva S: os pontos de fechamento trazem EXATAMENTE o EV gravado (R$ 6.448.200,00; 6.507.000,00; 6.771.000,00)
  await page.getByRole('button', { name: 'Tabela', exact: true }).click()
  const gravados = page.getByTestId('ev-gravado')
  await expect(gravados).toHaveCount(3)
  const textos = (await gravados.allTextContents()).map((t) => t.replace(/\s/g, ' '))
  expect(textos).toEqual(['R$ 6.448.200,00', 'R$ 6.507.000,00', 'R$ 6.771.000,00'])
  await expect(page.getByTestId('origem-fechamento')).toHaveCount(3)
  await expect(page.getByText('Interpolado entre fechamentos').first()).toBeVisible()
  await expect(page.getByTestId('aviso-curva')).toContainText('Antes do 1º fechamento (23/10/2026): reconstruído linearmente.')
  // Gráfico: a legenda diz o que é o pontilhado curto e o ponto de fechamento
  await page.getByRole('button', { name: 'Gráfico', exact: true }).click()
  await expect(page.getByTestId('legenda-curva')).toContainText('Pontilhado curto: interpolado entre fechamentos')
  await expect(page.getByTestId('legenda-curva')).toContainText('Ponto de fechamento: EV e AC gravados')

  // O cartão do ponto selecionado rotula SV, CV, ETC e TCPI como da obra na data de status (não do ponto de fechamento) e os cartões de término dizem a LB que usam
  await expect(page.getByText('SV (EV − PV) · obra na data de status')).toBeVisible()
  await expect(page.getByText('TCPI · obra na data de status')).toBeVisible()
  await expect(page.getByText('Linha de base (LB0 do valor agregado)')).toBeVisible()
  await expect(page.getByText('rede reprogramada; o atraso é medido contra a LB0')).toBeVisible()
  await expect(page.getByText('Entre os dois últimos fechamentos o SPI')).toBeVisible()
  await expect(page.getByText('Índices gravados em cada fechamento')).toBeVisible()
  // Tendência e entrega: a tabela traz os 3 fechamentos e a nota dos índices
  await expect(page.getByTestId('tabela-entrega').getByRole('row')).toHaveCount(4)
  await expect(page.getByTestId('nota-indices')).toContainText('Índices dos fechamentos calculados contra a linha de base vigente em cada fechamento.')

  // Comparar o 1º com o 3º: a 104 e a 302 avançaram
  await page.getByLabel('Fechamento A').selectOption({ index: 1 })
  await page.getByLabel('Fechamento B').selectOption({ index: 3 })
  await page.getByTestId('comparar').click()
  const comparacao = page.getByTestId('resultado-comparacao')
  await expect(comparacao).toBeVisible()
  await expect(page.getByTestId('categoria-avancaram')).toContainText('Avançaram (2)')
  await expect(page.getByTestId('categoria-avancaram')).toContainText('40% → 75%')
  await expect(page.getByTestId('categoria-avancaram')).toContainText('78% → 90%')

  // Exportar o histórico (JSON): as LBs e os 3 fechamentos
  const baixando = page.waitForEvent('download')
  await page.getByTestId('exportar-historico').click()
  const download = await baixando
  expect(download.suggestedFilename()).toBe('Edificio_Residencial_Aurora_12_Pavimentos_historico_2026-11-06.json')
  const arquivo = JSON.parse(await readFile((await download.path())!, 'utf-8')) as { formato: string; versao: number; linhasBase: unknown[]; fechamentos: { cabecalho: { dataStatus: string }; tarefas: unknown[] }[] }
  expect([arquivo.formato, arquivo.versao, arquivo.linhasBase.length]).toEqual(['cronoai-historico', 1, 1])
  expect(arquivo.fechamentos.map((f) => [f.cabecalho.dataStatus, f.tarefas.length])).toEqual([['2026-10-23', 20], ['2026-10-30', 20], ['2026-11-06', 20]])
})
