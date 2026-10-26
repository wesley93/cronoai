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
  await expect(toast(page, 'Data de status fechada')).toBeVisible()
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
