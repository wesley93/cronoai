import { readFile } from 'node:fs/promises'
import type { Page } from '@playwright/test'
import { estadoDoBanco, expect, kpi, test, toast } from './fixtures'

// Ciclo 00006: recorte SINAPI importado na obra, usado na calculadora e na planilha (SPEC-07 RF-07.3; SPEC-15 RF-15.2).
// Fonte dos números: SINAPI 09/2026, Caixa, SP, não desonerado (3 composições públicas no arquivo de exemplo).

const AMOSTRA = new URL('./arquivos/recorte-sinapi-sp-2026-09-amostra.json', import.meta.url)
const FIXTURE_ESQUEMA4 = new URL('../src/lib/__fixtures__/registro-esquema4-aurora-cenarios.json', import.meta.url)

const nav = (page: Page, nome: RegExp) => page.getByRole('navigation').getByRole('button', { name: nome }).click()

/** Cria uma obra em branco com UF, regime e data-base do SINAPI pela tela Obras (a obra criada fica ativa). */
async function criarObra(page: Page, nome: string, uf: string, regime: string, dataBase: string) {
  await nav(page, /Obras/)
  if (!(await page.locator('#nova-nome').isVisible())) await page.getByRole('button', { name: 'Nova obra' }).click()
  const nova = page.locator('form').filter({ has: page.locator('#nova-nome') })
  await nova.getByLabel('Nome da obra').fill(nome)
  await nova.getByLabel('UF').selectOption(uf)
  await nova.getByLabel('Município').fill('Cidade fictícia')
  await nova.getByLabel('Data de início').fill('2026-11-03')
  await nova.getByLabel('Data de status').fill('2026-11-03')
  await nova.getByLabel('Regime SINAPI').selectOption(regime)
  await nova.getByLabel('Data-base SINAPI').fill(dataBase)
  await nova.getByRole('button', { name: 'Criar obra' }).click()
  // O toast leva o nome da obra: dois toasts "Obra criada" podem coexistir (criações em sequência)
  await expect(toast(page, 'Obra criada').filter({ hasText: nome })).toBeVisible()
}

const cartaoSinapi = (page: Page) => page.locator('article').filter({ has: page.getByRole('heading', { name: 'SINAPI', exact: true }) })
const estadoSinapi = (page: Page) => cartaoSinapi(page).getByTestId('estado-integracao')

async function importarAmostra(page: Page) {
  await page.getByTestId('sinapi-arquivo-input').setInputFiles({ name: 'recorte-sinapi-sp-2026-09-amostra.json', mimeType: 'application/json', buffer: await readFile(AMOSTRA) })
}

/** O controle de equipe é um range: ajusta o valor e avisa o Vue. */
async function definirEquipe(page: Page, n: number) {
  await page.getByLabel('Tamanho da equipe').evaluate((el, v) => {
    const campo = el as HTMLInputElement
    campo.value = String(v)
    campo.dispatchEvent(new Event('input', { bubbles: true }))
  }, n)
}

test('importar o recorte na obra SP, calcular o CR-1 na calculadora e manter tudo ao recarregar', async ({ page }) => {
  await page.goto('/')
  await criarObra(page, 'Obra SP (fictícia)', 'SP', 'nao-desonerado', '2026-09')

  // Cartão SINAPI: sem recorte, "Não configurada"; a calculadora usa o catálogo ilustrativo e o aviso
  await nav(page, /Integrações/)
  await expect(estadoSinapi(page)).toHaveText('Não configurada')
  await nav(page, /Gerador SINAPI/)
  await expect(page.getByTestId('aviso-ilustrativo')).toContainText('Catálogo SINAPI ilustrativo: não corresponde a SP · 09/2026 · não desonerado.')

  // Importa o recorte: "Configurada", com a fonte, o SHA-256 abreviado e as 3 composições
  await nav(page, /Integrações/)
  await importarAmostra(page)
  await expect(toast(page, 'Recorte SINAPI importado')).toBeVisible()
  await expect(estadoSinapi(page)).toHaveText('Configurada')
  await expect(cartaoSinapi(page).getByTestId('sinapi-arquivo')).toHaveText('SINAPI_Referencia_2026_09.xlsx')
  await expect(cartaoSinapi(page).getByTestId('sinapi-sha')).toHaveText('9f1a69dfbe10…')
  await expect(cartaoSinapi(page).getByTestId('sinapi-composicoes')).toHaveText('3')
  await expect(cartaoSinapi(page).getByTestId('sinapi-encargos')).toHaveText('horista 115,01% · mensalista 71,18%')
  expect((await estadoDoBanco(page)).recortes).toBe(1)

  // Calculadora: busca a 103332, custo publicado R$ 123,96; 640 m², equipe 4 → 33 d.u., Pedreiro 4 + Servente 2, BAC R$ 79.334,40
  await nav(page, /Gerador SINAPI/)
  await expect(page.getByTestId('aviso-ilustrativo')).toHaveCount(0)
  await expect(page.getByTestId('fonte-recorte')).toContainText('Fonte: SINAPI SP 09/2026 não desonerado.')
  await page.getByTestId('busca-composicao').fill('alvenaria vedacao')
  await page.getByTestId('busca-resultados').getByRole('button', { name: /103332/ }).click()
  await expect(page.getByTestId('composicao-escolhida')).toContainText('103332')
  await expect(page.getByTestId('custo-unitario')).toHaveValue('123.96')
  await expect(page.getByTestId('rup')).toHaveValue('1.6225376')
  await page.getByTestId('quantidade').fill('640')
  await definirEquipe(page, 4)
  await expect(page.getByTestId('dias-uteis')).toHaveText('33 dias úteis')
  await expect(page.getByTestId('equipe-por-funcao')).toContainText('Pedreiro 4 + Servente 2')
  await expect(page.getByTestId('bac')).toContainText('79.334,40')
  await expect(page.getByTestId('termino-cpm')).toContainText('término pelo CPM')

  // Recarregar mantém o vínculo e o recorte
  await expect.poll(async () => (await estadoDoBanco(page)).recortes).toBe(1)
  await page.reload()
  await nav(page, /Integrações/)
  await expect(estadoSinapi(page)).toHaveText('Configurada')
  await expect(cartaoSinapi(page).getByTestId('sinapi-composicoes')).toHaveText('3')
  await nav(page, /Gerador SINAPI/)
  await page.getByTestId('busca-composicao').fill('103681')
  await expect(page.getByTestId('busca-resultados').getByRole('button', { name: /103681/ })).toBeVisible()
})

test('a 2ª obra com a mesma chave usa o recorte sem reimportar; remover de uma mantém para a outra', async ({ page }) => {
  await page.goto('/')
  await criarObra(page, 'Obra SP 1', 'SP', 'nao-desonerado', '2026-09')
  await nav(page, /Integrações/)
  await importarAmostra(page)
  await expect(estadoSinapi(page)).toHaveText('Configurada')

  await criarObra(page, 'Obra SP 2', 'SP', 'nao-desonerado', '2026-09')
  await nav(page, /Integrações/)
  // Nada muda sozinho: a obra 2 só vê a opção
  await expect(estadoSinapi(page)).toHaveText('Não configurada')
  await expect(page.getByTestId('sinapi-disponivel')).toContainText('SP 09/2026 não desonerado')
  await page.getByTestId('sinapi-usar').click()
  await expect(estadoSinapi(page)).toHaveText('Configurada')
  expect((await estadoDoBanco(page)).recortes).toBe(1)

  // Remover da obra 2 (com a confirmação) mantém o recorte para a obra 1
  page.once('dialog', (d) => void d.accept())
  await page.getByTestId('sinapi-remover').click()
  await expect(estadoSinapi(page)).toHaveText('Não configurada')
  expect((await estadoDoBanco(page)).recortes).toBe(1)
})

test('recusas: recorte de outra UF e arquivo acima de 6 MiB não gravam nada', async ({ page }) => {
  await page.goto('/')
  await criarObra(page, 'Obra BA', 'BA', 'nao-desonerado', '2026-09')
  await nav(page, /Integrações/)
  await importarAmostra(page)
  const erro = toast(page, 'Recorte não importado')
  await expect(erro).toBeVisible()
  await expect(erro).toContainText('O recorte é de SP · 09/2026 · não desonerado; esta obra é BA · 09/2026 · não desonerado. Nada foi importado.')
  await expect(estadoSinapi(page)).toHaveText('Não configurada')

  // Acima de 6 MiB: recusado pelo tamanho, sem ler o arquivo
  await page.getByTestId('sinapi-arquivo-input').setInputFiles({ name: 'grande.json', mimeType: 'application/json', buffer: Buffer.alloc(6 * 1024 * 1024 + 1, 0x20) })
  await expect(toast(page, 'Arquivo grande demais')).toBeVisible()
  // Extensão errada
  await page.getByTestId('sinapi-arquivo-input').setInputFiles({ name: 'recorte.txt', mimeType: 'text/plain', buffer: Buffer.from('{}') })
  await expect(toast(page, 'Arquivo não aceito')).toBeVisible()
  // JSON que não é recorte
  await page.getByTestId('sinapi-arquivo-input').setInputFiles({ name: 'outro.json', mimeType: 'application/json', buffer: Buffer.from('{"formato":"outro"}') })
  await expect(erro.last()).toBeVisible()
  await expect(page.getByText('Este arquivo não é um recorte SINAPI do CronoAI.')).toBeVisible()
  expect((await estadoDoBanco(page)).recortes).toBe(0)
})

test('P-2: obra salva na estrutura 1 do IndexedDB abre igual depois da atualização (a store nova é criada e a obra não é tocada)', async ({ page }) => {
  const fx = JSON.parse(await readFile(FIXTURE_ESQUEMA4, 'utf-8')) as { registro: { id: string; versaoEsquema: number; json: string; atualizadoEm: string } }
  // Antes do app: cria o banco como a versão anterior o deixou (estrutura 1: só `obras` e `meta`) com a obra no esquema 4
  await page.addInitScript((registro) => {
    const abrir = indexedDB.open('cronoai', 1)
    abrir.onupgradeneeded = () => {
      const db = abrir.result
      db.createObjectStore('obras', { keyPath: 'id' })
      db.createObjectStore('meta')
    }
    abrir.onsuccess = () => {
      const db = abrir.result
      const tx = db.transaction(['obras', 'meta'], 'readwrite')
      tx.objectStore('obras').put(registro)
      tx.objectStore('meta').put({ versaoIndice: 1, obraAtivaId: registro.id, obras: [{ id: registro.id, nome: 'Aurora (esquema 4)', atualizadoEm: registro.atualizadoEm }] }, 'indice')
      tx.oncomplete = () => db.close()
    }
    abrir.onerror = () => undefined // o banco já está na estrutura 2 (recarga): nada a semear
  }, fx.registro)
  await page.goto('/')
  // Os números do registro (gerado pela store da base: v2 das premissas, crashing e hora extra por frente aplicados)
  await expect(kpi(page, 'Entrega das chaves')).toContainText('16/06/27')
  await expect(kpi(page, 'Entrega das chaves')).toContainText('+11 d.u.')
  await expect(kpi(page, 'SPI')).toContainText('0,89')
  await expect(kpi(page, 'CPI')).toContainText('0,93')
  // O banco subiu para a estrutura 2, com a store dos recortes vazia, e a obra continua lá, no esquema 4 e igual (nada foi regravado)
  const banco = await estadoDoBanco(page)
  expect(banco).toEqual({ versao: 2, recortes: 0, obras: 1 })
  const salva = await page.evaluate(
    () =>
      new Promise<{ versaoEsquema: number; json: string }>((resolve) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onsuccess = () => {
          const pedido = abrir.result.transaction('obras', 'readonly').objectStore('obras').get('o-esquema4')
          pedido.onsuccess = () => {
            abrir.result.close()
            resolve(pedido.result)
          }
        }
      }),
  )
  expect(salva.versaoEsquema).toBe(4)
  expect(salva.json).toBe(fx.registro.json)
})
