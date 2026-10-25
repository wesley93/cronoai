import { expect, test as base, type Locator, type Page } from '@playwright/test'

// Todo teste falha se a página emitir console.error ou erro não tratado (avisos não contam).
export const test = base.extend<{ errosDeConsole: string[] }>({
  errosDeConsole: [
    async ({ page }, use) => {
      const erros: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') erros.push(`console.error: ${msg.text()}`)
      })
      page.on('pageerror', (err) => erros.push(`pageerror: ${err.message}`))
      await use(erros)
      expect(erros, 'erros de console durante o teste').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Cabeçalho do topo (banner): escopo dos KPIs e dos botões de importar/exportar. */
export const topo = (page: Page): Locator => page.getByRole('banner')

/** Bloco de KPI do topo pelo rótulo (ex.: "Entrega das chaves", "SPI"). */
export const kpi = (page: Page, rotulo: string): Locator => topo(page).getByText(rotulo, { exact: true }).locator('xpath=..')

/** Toast pelo título, dentro da região aria-live (o mesmo texto pode aparecer em tabelas da tela). */
export const toast = (page: Page, titulo: string): Locator =>
  page.locator('[aria-live="polite"]').getByText(titulo, { exact: true }).locator('xpath=..')

/** Cartão de cenário pelo título do h3. */
export const cartaoCenario = (page: Page, titulo: string): Locator =>
  page.getByRole('article').filter({ has: page.getByRole('heading', { name: titulo }) })

/**
 * Lê do IndexedDB (banco `cronoai`) o JSON da obra ativa e diz se contém o trecho.
 * A gravação tem atraso de 300 ms: use dentro de `expect.poll`, sem sleep fixo.
 */
export const obraAtivaSalvaContem = (page: Page, trecho: string): Promise<boolean> =>
  page.evaluate(
    (t) =>
      new Promise<boolean>((resolve) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onerror = () => resolve(false)
        abrir.onsuccess = () => {
          const db = abrir.result
          if (!db.objectStoreNames.contains('meta') || !db.objectStoreNames.contains('obras')) {
            db.close()
            resolve(false)
            return
          }
          const tx = db.transaction(['meta', 'obras'], 'readonly')
          const pedidoIndice = tx.objectStore('meta').get('indice')
          pedidoIndice.onsuccess = () => {
            const ativa = pedidoIndice.result?.obraAtivaId
            if (!ativa) {
              resolve(false)
              return
            }
            const pedidoObra = tx.objectStore('obras').get(ativa)
            pedidoObra.onsuccess = () => resolve(typeof pedidoObra.result?.json === 'string' && pedidoObra.result.json.includes(t))
          }
          tx.oncomplete = () => db.close()
          tx.onerror = () => resolve(false)
        }
      }),
    trecho,
  )

/**
 * Número de recortes SINAPI gravados no IndexedDB (store `recortesSinapi`, estrutura 2) e a versão da estrutura do banco.
 * `recortes` é -1 se a store não existe (banco ainda na estrutura 1).
 */
export const estadoDoBanco = (page: Page): Promise<{ versao: number; recortes: number; obras: number }> =>
  page.evaluate(
    () =>
      new Promise<{ versao: number; recortes: number; obras: number }>((resolve, reject) => {
        const abrir = indexedDB.open('cronoai')
        abrir.onerror = () => reject(abrir.error)
        abrir.onsuccess = () => {
          const db = abrir.result
          const nomes = ['obras', 'recortesSinapi'].filter((n) => db.objectStoreNames.contains(n))
          const tx = db.transaction(nomes, 'readonly')
          const contar = (n: string) => new Promise<number>((r) => (nomes.includes(n) ? (tx.objectStore(n).count().onsuccess = (e) => r((e.target as IDBRequest<number>).result)) : r(-1)))
          Promise.all([contar('obras'), contar('recortesSinapi')]).then(([obras, recortes]) => {
            const versao = db.version
            db.close()
            resolve({ versao, recortes, obras })
          })
        }
      }),
  )
