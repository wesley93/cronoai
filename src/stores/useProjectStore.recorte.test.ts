// Recorte SINAPI na obra (ciclo 00006, entregável 4): importação atômica, compartilhamento por chave, desvínculo, leitura adulterada,
// calculadora e planilha com custo e RUP publicados. Fonte dos números: SINAPI 09/2026, Caixa (SP, não desonerado), 3 composições públicas.
import { isProxy } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import amostraTexto from '../../e2e/arquivos/recorte-sinapi-sp-2026-09-amostra.json?raw'
import type { DadosObra } from '@/lib/obras'
import { MAX_RECORTE_BYTES, buscarComposicoes, itemCatalogoDoRecorte, linhaDoRecorte } from '@/lib/recorteSinapi'
import { recursosDaEquipe } from '@/lib/sinapiRup'
import type { RecorteSinapi } from '@/types/sinapi'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from './armazenamentoObras'
import { useProjectStore } from './useProjectStore'

const CHAVE = 'SP|nao-desonerado|2026-09'
const sp: DadosObra = { nome: 'Obra SP (fictícia)', uf: 'SP', municipio: 'São Paulo', dataInicio: '2026-11-03', dataStatus: '2026-11-03', regimeSinapi: 'nao-desonerado', dataBaseSinapi: '2026-09' }
const amostra = (): RecorteSinapi => JSON.parse(amostraTexto)
const texto = (r: RecorteSinapi | Record<string, unknown> = amostra()) => JSON.stringify(r)

async function abrir(adaptador: ArmazenamentoMemoria = criarArmazenamentoMemoria()) {
  usarArmazenamento(adaptador)
  setActivePinia(createPinia())
  const store = useProjectStore()
  await store.carregar()
  return { adaptador, store }
}
/** Nova pinia (= nova abertura do app) sobre o mesmo armazenamento. */
const reabrir = async (adaptador: ArmazenamentoMemoria) => (await abrir(adaptador)).store

/** Obra em branco de SP/não desonerado/2026-09, já ativa. */
async function obraSp(store: ReturnType<typeof useProjectStore>, nome = sp.nome) {
  const r = await store.criarObra({ modelo: 'branco', dados: { ...sp, nome } })
  if (!r.ok) throw new Error(r.erro)
  return r.id
}

async function comRecorte() {
  const { adaptador, store } = await abrir()
  const idA = await obraSp(store)
  const r = await store.importarRecorteSinapi(texto())
  if (!r.ok) throw new Error(r.erro)
  return { adaptador, store, idA }
}

beforeEach(() => {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  usarArmazenamento(undefined)
  setActivePinia(createPinia())
})
afterEach(() => usarArmazenamento(undefined))

describe('importar o recorte (AC-9)', () => {
  it('grava o recorte, a referência da obra e o índice numa transação, e registra no log', async () => {
    const { adaptador, store, idA } = await comRecorte()
    expect([...adaptador.recortes.keys()]).toEqual([CHAVE])
    const reg = adaptador.recortes.get(CHAVE)!
    expect(reg).toMatchObject({ chave: CHAVE, versaoFormato: 1, composicoes: 3, sha256Origem: '9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2' })
    const obra = JSON.parse(adaptador.obras.get(idA)!.json)
    expect(obra.meta.recorteSinapi).toMatchObject({ chave: CHAVE, sha256Origem: reg.sha256Origem, importadoEm: reg.importadoEm })
    expect(adaptador.indice!.obras.find((o) => o.id === idA)?.recorteSinapi).toBe(CHAVE)
    expect(store.state.log[0]).toMatchObject({ kind: 'sinapi', title: 'Recorte SINAPI importado' })
    expect(store.recorteAtual?.fonte).toBe('SINAPI SP 09/2026 não desonerado')
    expect(await store.salvarAgora()).toBe(true) // o registro no log, feito depois da gravação, ainda estava pendente
    expect(store.estadoGravacao).toBe('salvo')
    // O recorte NÃO vai dentro da obra: a obra salva continua pequena
    expect(adaptador.obras.get(idA)!.json.length).toBeLessThan(20_000)
  })

  it('falha de gravação reverte a referência e não grava nada (nem recorte, nem obra com referência)', async () => {
    const { adaptador, store } = await abrir()
    const id = await obraSp(store)
    adaptador.falhar.gravar = true
    const r = await store.importarRecorteSinapi(texto())
    expect(r.ok).toBe(false)
    expect(adaptador.recortes.size).toBe(0)
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(store.recorteAtual).toBeUndefined()
    expect(JSON.parse(adaptador.obras.get(id)!.json).meta.recorteSinapi).toBeUndefined()
    expect(adaptador.indice!.obras.find((o) => o.id === id)?.recorteSinapi).toBeUndefined()
    // A reversão volta o estado ao que era; a próxima gravação (que falha) mantém o aviso de erro
    expect(await store.salvarAgora()).toBe(false)
    expect(store.estadoGravacao).toBe('erro')
    expect(adaptador.recortes.size).toBe(0)
  })

  it('recusas sem gravar nada: obra sem dados SINAPI, outra UF/regime/data-base, JSON inválido, formato, versão 2 e arquivo acima de 6 MiB', async () => {
    const { adaptador, store } = await abrir()
    const semDados = await store.criarObra({ modelo: 'branco', dados: { nome: 'Sem SINAPI', dataInicio: '2026-11-03', dataStatus: '2026-11-03' } })
    expect(semDados.ok).toBe(true)
    expect(await store.importarRecorteSinapi(texto())).toEqual({ ok: false, erro: 'Informe UF, regime e data-base do SINAPI em Obras › Dados da obra antes de importar.' })

    await obraSp(store)
    const ba = { ...amostra(), uf: 'BA', regime: 'desonerado', fonte: { ...amostra().fonte, abaCustos: 'CCD' } }
    expect(await store.importarRecorteSinapi(texto(ba))).toEqual({
      ok: false,
      erro: 'O recorte é de BA · 09/2026 · desonerado; esta obra é SP · 09/2026 · não desonerado. Nada foi importado.',
    })
    expect(await store.importarRecorteSinapi(texto({ ...amostra(), dataBase: '2026-08' }))).toMatchObject({ ok: false, erro: expect.stringContaining('2026-08'.split('-').reverse().join('/')) })
    expect(await store.importarRecorteSinapi('{"formato":')).toEqual({ ok: false, erro: 'O arquivo não é um JSON válido.', erros: ['O arquivo não é um JSON válido.'] })
    expect(await store.importarRecorteSinapi('{"formato":"outro"}')).toMatchObject({ ok: false, erro: 'Este arquivo não é um recorte SINAPI do CronoAI.' })
    expect(await store.importarRecorteSinapi(texto({ ...amostra(), versao: 2 }))).toMatchObject({ ok: false, erro: 'Recorte gerado por uma versão mais nova do CronoAI (formato 2).' })
    expect(await store.importarRecorteSinapi('x'.repeat(MAX_RECORTE_BYTES + 1))).toEqual({ ok: false, erro: 'O arquivo do recorte passa de 6 MiB.' })
    const invalido = amostra()
    invalido.composicoes[0]!.custoUnitario = 0
    const r = await store.importarRecorteSinapi(texto(invalido))
    expect(r).toMatchObject({ ok: false, erros: ['composicoes[0]: custo unitário inválido.'] })
    expect(adaptador.recortes.size).toBe(0)
    expect(store.state.meta.recorteSinapi).toBeUndefined()
  })

  it('P-3: recorte já salvo em formato mais novo nunca é sobrescrito', async () => {
    const { adaptador, store } = await abrir()
    await obraSp(store)
    const novo = { chave: CHAVE, versaoFormato: 2, json: '{"formato":"futuro"}', sha256Origem: 'a'.repeat(64), importadoEm: '2027-01-01T00:00:00.000Z', composicoes: 1 }
    adaptador.recortes.set(CHAVE, novo)
    const r = await store.importarRecorteSinapi(texto())
    expect(r).toEqual({ ok: false, erro: 'O recorte salvo para esta chave é de um formato mais novo do CronoAI (formato 2). Nada foi sobrescrito.' })
    expect(adaptador.recortes.get(CHAVE)).toEqual(novo)
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    // E uma obra que aponta para ele abre com o catálogo ilustrativo e o aviso, sem tocar no registro
    store.state.meta.recorteSinapi = { chave: CHAVE, sha256Origem: 'a'.repeat(64), importadoEm: novo.importadoEm }
    expect(await store.salvarAgora()).toBe(true)
    const outra = await reabrir(adaptador)
    expect(outra.recorteAtual).toBeUndefined()
    expect(outra.avisoRecorte).toContain('mais nova do CronoAI (formato 2)')
    expect(adaptador.recortes.get(CHAVE)).toEqual(novo)
  })

  it('o recorte fica fora do estado reativo (D-13) e o estado salvo não o contém', async () => {
    const { store } = await comRecorte()
    expect(isProxy(store.recorteAtual!.recorte)).toBe(false)
    expect(isProxy(store.recorteAtual!.indice)).toBe(false)
    expect(JSON.stringify(store.state)).not.toContain('ALVENARIA')
  })

  it('reabrir o app mantém o vínculo e o recorte carregado', async () => {
    const { adaptador } = await comRecorte()
    const outra = await reabrir(adaptador)
    expect(outra.state.meta.recorteSinapi?.chave).toBe(CHAVE)
    expect(outra.recorteAtual?.recorte.composicoes.map((c) => c.codigo)).toEqual(['103332', '104658', '103681'])
    expect(outra.recorteAtual?.substituidoEm).toBeUndefined()
    expect(outra.avisoRecorte).toBe('')
  })
})

describe('compartilhar por chave (AC-10, Q3 = a)', () => {
  it('a 2ª obra vê "Usar nesta obra" e nada muda sozinho; usar vincula sem reimportar (1 registro)', async () => {
    const { adaptador, store } = await comRecorte()
    const idB = await obraSp(store, 'Obra SP 2')
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(store.recorteAtual).toBeUndefined()
    expect(store.recorteDisponivel).toBe(CHAVE)
    expect(await store.usarRecorteDisponivel()).toEqual({ ok: true })
    expect(store.recorteAtual?.fonte).toBe('SINAPI SP 09/2026 não desonerado')
    expect(store.recorteDisponivel).toBeUndefined()
    expect(adaptador.recortes.size).toBe(1)
    expect(adaptador.indice!.obras.filter((o) => o.recorteSinapi === CHAVE).map((o) => o.id)).toContain(idB)
    expect(adaptador.indice!.obras.filter((o) => o.recorteSinapi === CHAVE)).toHaveLength(2)
    expect(store.state.log[0]?.title).toBe('Recorte SINAPI vinculado')
  })

  it('"Usar nesta obra" sem recorte disponível é recusado', async () => {
    const { store } = await abrir()
    await obraSp(store)
    expect(await store.usarRecorteDisponivel()).toEqual({ ok: false, erro: 'Não há recorte salvo para a UF, o regime e a data-base desta obra.' })
  })

  it('remover de uma obra mantém o recorte da outra; remover da última apaga (1 → 1 → 0)', async () => {
    const { adaptador, store, idA } = await comRecorte()
    const idB = await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    expect(adaptador.recortes.size).toBe(1)
    expect(await store.removerRecorteSinapi()).toEqual({ ok: true }) // B
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(store.recorteAtual).toBeUndefined()
    expect(adaptador.recortes.size).toBe(1)
    expect(adaptador.indice!.obras.find((o) => o.id === idB)?.recorteSinapi).toBeUndefined()
    expect(store.recorteDisponivel).toBe(CHAVE) // a obra B pode voltar a usá-lo
    expect(await store.trocarObra(idA)).toEqual({ ok: true })
    expect(await store.removerRecorteSinapi()).toEqual({ ok: true }) // A, a última
    expect(adaptador.recortes.size).toBe(0)
    expect(store.state.log[0]?.title).toBe('Recorte SINAPI removido desta obra')
  })

  it('excluir a obra apaga o recorte órfão na mesma transação; com outra obra usando, ele fica', async () => {
    const { adaptador, store, idA } = await comRecorte()
    const idB = await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    expect(await store.excluirObra(idB)).toEqual({ ok: true }) // B ativa: abre a 1ª outra obra legível
    expect(adaptador.recortes.size).toBe(1)
    expect(await store.trocarObra(idA)).toEqual({ ok: true })
    expect(store.recorteAtual).toBeDefined()
    const idC = await obraSp(store, 'Obra SP 3')
    expect(await store.excluirObra(idA)).toEqual({ ok: true }) // A, a última a usar, não é a ativa
    expect(adaptador.recortes.size).toBe(0)
    expect(store.obraAtivaId).toBe(idC)
  })

  it('duplicar a obra copia a referência (mesma chave, recorte compartilhado)', async () => {
    const { adaptador, store, idA } = await comRecorte()
    const copia = await store.duplicarObra(idA)
    if (!copia.ok) throw new Error(copia.erro)
    expect(adaptador.indice!.obras.filter((o) => o.recorteSinapi === CHAVE)).toHaveLength(2)
    expect(JSON.parse(adaptador.obras.get(copia.id)!.json).meta.recorteSinapi.chave).toBe(CHAVE)
    expect(adaptador.recortes.size).toBe(1)
  })

  it('trocar UF, regime ou data-base em "Dados da obra" desvincula, com registro no log, e apaga o recorte órfão', async () => {
    const { adaptador, store } = await comRecorte()
    const r = store.atualizarDadosObra({ ...sp, uf: 'BA', municipio: 'Salvador' })
    expect(r).toEqual({ ok: true })
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(store.state.log[0]).toMatchObject({ kind: 'sinapi', title: 'Recorte SINAPI desvinculado', detail: 'Recorte SINAPI desvinculado: UF/regime/data-base mudaram. A obra voltou ao catálogo ilustrativo.' })
    expect(await store.salvarAgora()).toBe(true)
    expect(adaptador.recortes.size).toBe(0)
    expect(store.recorteAtual).toBeUndefined()
  })

  it('trocar os dados SINAPI de uma obra que compartilha o recorte não o apaga', async () => {
    const { adaptador, store, idA } = await comRecorte()
    await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    store.atualizarDadosObra({ ...sp, nome: 'Obra SP 2', dataBaseSinapi: '2026-10' })
    expect(await store.salvarAgora()).toBe(true)
    expect(adaptador.recortes.size).toBe(1)
    expect(adaptador.indice!.obras.find((o) => o.id === idA)?.recorteSinapi).toBe(CHAVE)
  })

  it('substituir um recorte usado por outra obra pede confirmação; a outra obra mostra "substituído em"', async () => {
    const { adaptador, store, idA } = await comRecorte()
    await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    const outro = amostra()
    outro.fonte.sha256 = 'b'.repeat(64)
    outro.fonte.arquivo = 'SINAPI_Referencia_2026_09_revisada.xlsx'
    const sem = await store.importarRecorteSinapi(texto(outro))
    expect(sem).toMatchObject({ ok: false, precisaConfirmar: true })
    expect(adaptador.recortes.get(CHAVE)!.sha256Origem).toBe('9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2')
    expect(await store.importarRecorteSinapi(texto(outro), { confirmarSubstituicao: true })).toEqual({ ok: true })
    expect(adaptador.recortes.size).toBe(1)
    expect(adaptador.recortes.get(CHAVE)!.sha256Origem).toBe('b'.repeat(64))
    // A obra A ainda aponta para o SHA antigo: avisa que o recorte foi substituído
    expect(await store.trocarObra(idA)).toEqual({ ok: true })
    expect(store.recorteAtual?.substituidoEm).toBe(adaptador.recortes.get(CHAVE)!.importadoEm)
  })

  it('o mesmo arquivo de novo (mesmo SHA) não pede confirmação', async () => {
    const { store } = await comRecorte()
    await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    expect(await store.importarRecorteSinapi(texto())).toEqual({ ok: true })
  })

  it('obra ilegível mantém a chave no índice: o recorte dela não é apagado', async () => {
    const { adaptador, store, idA } = await comRecorte()
    const idB = await obraSp(store, 'Obra SP 2')
    await store.usarRecorteDisponivel()
    // B fica ilegível (registro adulterado), mas o índice ainda lista a chave dela
    adaptador.obras.set(idB, { ...adaptador.obras.get(idB)!, json: '{lixo' })
    const reaberta = await reabrir(adaptador)
    expect(reaberta.obras.find((o) => o.id === idB)?.ilegivel).toBe(true)
    expect(reaberta.obras.find((o) => o.id === idB)?.recorteSinapi).toBe(CHAVE)
    // Ativa B é ilegível: abre A (ou outra). Remover o vínculo de A não apaga o recorte, porque B ainda o lista
    expect(reaberta.obraAtivaId).not.toBe(idB)
    await reaberta.trocarObra(idA)
    expect(await reaberta.removerRecorteSinapi()).toEqual({ ok: true })
    expect(adaptador.recortes.size).toBe(1)
  })
})

describe('leitura do armazenamento adulterado (recorte e referência)', () => {
  async function reabrirComRegistro(alterar: (reg: Record<string, unknown>) => void) {
    const { adaptador } = await comRecorte()
    const original = structuredClone(adaptador.recortes.get(CHAVE)!)
    const reg = structuredClone(original) as unknown as Record<string, unknown>
    alterar(reg)
    adaptador.recortes.set(CHAVE, reg as never)
    const store = await reabrir(adaptador)
    return { adaptador, store, reg }
  }

  it.each([
    ['JSON malformado', (r: Record<string, unknown>) => (r.json = '{"formato":')],
    ['registro de tamanho absurdo (acima de 6 MiB)', (r: Record<string, unknown>) => (r.json = 'x'.repeat(MAX_RECORTE_BYTES + 1))],
    ['json que não é texto', (r: Record<string, unknown>) => (r.json = { formato: 'cronoai-recorte-sinapi' })],
    ['chave do registro diferente', (r: Record<string, unknown>) => (r.chave = 'BA|desonerado|2026-09')],
    ['contagem de composições que não bate', (r: Record<string, unknown>) => (r.composicoes = 8443)],
    ['SHA-256 de controle inválido', (r: Record<string, unknown>) => (r.sha256Origem = 'xyz')],
    ['SHA-256 diferente do conteúdo', (r: Record<string, unknown>) => (r.sha256Origem = 'c'.repeat(64))],
    ['versão do formato inválida', (r: Record<string, unknown>) => (r.versaoFormato = 'um')],
    ['recorte com uma composição inválida', (r: Record<string, unknown>) => {
      const rec = JSON.parse(String(r.json))
      rec.composicoes[0].custoUnitario = -5
      r.json = JSON.stringify(rec)
    }],
  ])('%s: a obra abre com o catálogo ilustrativo e um aviso, sem alterar o registro', async (_nome, alterar) => {
    const { adaptador, store, reg } = await reabrirComRegistro(alterar)
    expect(store.recorteAtual).toBeUndefined()
    expect(store.avisoRecorte).not.toBe('')
    expect(store.carregado).toBe(true)
    expect(store.state.tasks.length).toBeGreaterThanOrEqual(0)
    expect(adaptador.recortes.get(CHAVE)).toEqual(reg)
    expect(store.gravacaoBloqueada).toBe(false)
  })

  it('registro ausente: aviso para importar de novo', async () => {
    const { adaptador } = await comRecorte()
    adaptador.recortes.delete(CHAVE)
    const store = await reabrir(adaptador)
    expect(store.recorteAtual).toBeUndefined()
    expect(store.avisoRecorte).toBe('O recorte SINAPI desta obra não foi encontrado neste navegador: a obra usa o catálogo ilustrativo. Importe o recorte de novo.')
  })

  it('leitura do recorte que falha: aviso e a obra abre', async () => {
    const { adaptador, store: aberta } = await comRecorte()
    const chave = aberta.obraAtivaId
    const original = adaptador.lerRecorte
    adaptador.lerRecorte = async () => {
      throw new Error('falha simulada')
    }
    const store = await reabrir(adaptador)
    adaptador.lerRecorte = original
    expect(store.obraAtivaId).toBe(chave)
    expect(store.recorteAtual).toBeUndefined()
    expect(store.avisoRecorte).toBe('Não foi possível ler o recorte SINAPI deste navegador: a obra usa o catálogo ilustrativo.')
  })

  it('"__proto__" e chaves extras no recorte salvo não chegam ao objeto em memória', async () => {
    const { store } = await reabrirComRegistro((r) => {
      r.json = String(r.json).replace('{"formato"', '{"__proto__":{"polui":true},"extra":1,"formato"')
    })
    expect(store.recorteAtual).toBeDefined()
    expect(Object.keys(store.recorteAtual!.recorte)).not.toContain('extra')
    expect(({} as Record<string, unknown>).polui).toBeUndefined()
  })
})

describe('calculadora e planilha com o recorte (AC-11, AC-12, AC-13, AC-14)', () => {
  const alvenaria = (store: ReturnType<typeof useProjectStore>) => store.recorteAtual!.recorte.composicoes.find((c) => c.codigo === '103332')!

  it('busca no recorte por código e por texto, sem acento', async () => {
    const { store } = await comRecorte()
    const a = store.recorteAtual!
    expect(buscarComposicoes(a.indice, '103332').map((c) => c.codigo)).toEqual(['103332'])
    expect(buscarComposicoes(a.indice, 'concretagem vigas grua').map((c) => c.codigo)).toEqual(['103681'])
    expect(buscarComposicoes(a.indice, 'podotatil').map((c) => c.codigo)).toEqual(['104658'])
  })

  it('CR-1 na tarefa gerada: 33 d.u., Pedreiro 4 + Servente 2, BAC R$ 79.334,40 (antes: 79.334) e notas com fonte, coeficiente e equipe', async () => {
    const { store } = await comRecorte()
    const item = itemCatalogoDoRecorte(alvenaria(store), store.recorteAtual!.recorte)
    const recursos = recursosDaEquipe(item.professional, 4, item.equipe!)
    const res = store.addSinapiTask({
      name: 'Alvenaria SP',
      code: item.code,
      unit: item.unit,
      quantity: 640,
      unitCost: item.unitCost,
      durationDays: 33,
      resources: recursos,
      parentWbs: '',
      newGroupName: 'Alvenaria (teste)',
      linkType: 'FS',
      lagDays: 0,
      fonte: store.recorteAtual!.fonte,
      maoDeObra: alvenaria(store).maoDeObra,
    })
    if (!res.ok) throw new Error(res.erro)
    expect(res.task.bac).toBeCloseTo(79334.4, 2) // antes (Math.round): 79.334
    expect(res.task.duracaoMin).toBe(33 * 480)
    expect(res.task.resources).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(res.task.notes).toBe(
      'Gerado pelo CronoAI a partir do SINAPI 103332 (SP 09/2026 não desonerado): 640 m². Função principal PEDREIRO, RUP 1,6225376 h/m². ' +
        'Equipe: Pedreiro 4 + Servente 2. HH de subcomposições (ex.: preparo de argamassa) não incluída.',
    )
  })

  it('CSV com o código do recorte completa RUP, custo, função e equipe; o lote gera a tarefa com as notas da D-23', async () => {
    const { store } = await comRecorte()
    store.clearBudget()
    const csv = ['codigo;descricao;unidade;quantidade;equipe', '103332;;m²;640;4', '104658;;m²;100;2', '999999;Serviço fora do recorte;m²;10;1'].join(String.fromCharCode(10))
    const r = store.importBudgetCsv(csv)
    expect(r.added).toBe(2)
    expect(r.errors).toEqual(['Linha 4: RUP ausente e código 999999 fora do catálogo.'])
    const [l1, l2] = store.state.budget
    expect(l1).toMatchObject({ code: '103332', rup: 1.6225376, unitCost: 123.96, professional: 'Pedreiro', equipe: [{ recurso: 'Servente', proporcao: 0.5 }], fonte: 'SINAPI SP 09/2026 não desonerado', team: 4 })
    expect(l2).toMatchObject({ code: '104658', rup: 0.639, unitCost: 208.85, team: 2 })
    const res = store.generateFromBudget({ mode: 'FS', overlapPct: 0 })
    if (!res.ok) throw new Error(res.erro)
    const t1 = res.created.find((t) => t.sinapi === '103332')!
    const t2 = res.created.find((t) => t.sinapi === '104658')!
    expect([t1.duracaoMin / 480, t1.resources.map((x) => `${x.resource} ${x.units}`)]).toEqual([33, ['Pedreiro 4', 'Servente 2']])
    expect(t1.bac).toBeCloseTo(79334.4, 2)
    expect(t1.notes).toContain('(SP 09/2026 não desonerado)')
    expect(t1.notes).toContain('Função principal PEDREIRO, RUP 1,6225376 h/m².')
    // CR-2: 100 m², equipe 2 → 4 d.u., Pedreiro 2 + Servente 4 (antes da EO-2: 5 serventes)
    expect([t2.duracaoMin / 480, t2.resources.map((x) => `${x.resource} ${x.units}`)]).toEqual([4, ['Pedreiro 2', 'Servente 4']])
    expect(t2.bac).toBeCloseTo(20885, 2)
  })

  it('CR-12 (AC-13): com 450 min/dia o lote dá 35 d.u. = 15.750 min (antes, com 8 h fixas: 33 d.u. = 14.850 min); com 480, 33 d.u.; calendário de 44 h com 480, 33', async () => {
    const { store } = await comRecorte()
    const l = linhaDoRecorte(alvenaria(store), store.recorteAtual!.recorte, 640, 4)
    const gerar = () => {
      store.clearBudget()
      store.addBudgetLine(l)
      const r = store.generateFromBudget({ mode: 'FS', overlapPct: 0 })
      if (!r.ok) throw new Error(r.erro)
      return r.created[0]!
    }
    expect(gerar().duracaoMin).toBe(33 * 480)
    store.removeTask(store.leaves.at(-1)!.uid)
    store.state.meta.minutosPorDia = 450
    const t450 = gerar()
    expect(t450.duracaoMin).toBe(15750)
    expect(t450.duracaoMin / 450).toBe(35)
    // Calendário de 44 h por semana não muda a fórmula (a jornada do calendário nunca entra): minutosPorDia segue 480
    store.removeTask(t450.uid)
    store.state.meta.minutosPorDia = 480
    store.state.calendarios[0]!.semana = store.state.calendarios[0]!.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d))
    expect(gerar().duracaoMin).toBe(33 * 480)
  })

  it('CR-9 sem recorte: o lote da planilha de exemplo gera as mesmas durações de hoje (17 d.u. para a alvenaria ilustrativa)', async () => {
    const { store } = await abrir()
    const b1 = store.state.budget.find((l) => l.code === '103332')!
    expect(b1.fonte).toBeUndefined()
    expect(b1.equipe).toBeUndefined()
    const r = store.generateFromBudget({ mode: 'SS', overlapPct: 40 })
    if (!r.ok) throw new Error(r.erro)
    const t = r.created.find((x) => x.sinapi === '103332')!
    expect(t.duracaoMin / 480).toBe(17)
    expect(t.resources).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(t.bac).toBe(63040)
    expect(t.notes).toBe('Gerado pelo CronoAI a partir do SINAPI 103332: 640 m².')
  })

  it('AC-14: o BAC com centavos entra no EVM do projeto (soma exata, sem arredondar a tarefa)', async () => {
    const { store } = await comRecorte()
    store.addSinapiTask({ name: 'Pacote 1', code: '1', unit: 'm²', quantity: 640, unitCost: 123.96, durationDays: 33, resources: [], parentWbs: '', newGroupName: 'G', linkType: 'FS', lagDays: 0 })
    expect(store.evm.bac).toBeCloseTo(79334.4, 2)
  })
})

describe('desempenho com o recorte inteiro (lição 3)', () => {
  /** ~8.443 composições (a UF inteira de SP em 09/2026): ~3,4 MB. */
  function recorteGrande(): RecorteSinapi {
    const base = amostra()
    const modelo = base.composicoes[0]!
    base.composicoes = Array.from({ length: 8443 }, (_, i) => ({
      ...modelo,
      codigo: String(100_000 + i),
      descricao: `SERVIÇO NÚMERO ${i} ${'DESCRIÇÃO LONGA DE EXEMPLO '.repeat(8)}`.slice(0, 364),
      custoUnitario: 10 + (i % 997) / 7,
      maoDeObra: modelo.maoDeObra.map((f) => ({ ...f })),
    }))
    base.filtro = { codigos: [], grupos: [] }
    base.totais = { composicoes: base.composicoes.length, excluidasSemCusto: 2155, excluidasCustoZeroNaUf: 1 }
    return base
  }

  it('abrir a obra com o recorte de ~3,4 MB, buscar e editar uma tarefa: tempos medidos e o recorte nunca é regravado', async () => {
    const grande = recorteGrande()
    const json = JSON.stringify(grande)
    expect(json.length).toBeGreaterThan(3_000_000)
    const { adaptador, store } = await abrir()
    const idA = await obraSp(store)
    expect(await store.importarRecorteSinapi(json)).toEqual({ ok: true })
    const registroAntes = structuredClone(adaptador.recortes.get(CHAVE)!)

    // Abrir a obra: ler, validar (8.443 composições) e indexar
    const t0 = performance.now()
    const outra = await reabrir(adaptador)
    const abrirMs = performance.now() - t0
    expect(outra.recorteAtual?.recorte.composicoes).toHaveLength(8443)

    // Busca
    const t1 = performance.now()
    const achados = buscarComposicoes(outra.recorteAtual!.indice, 'servico numero 77 descricao')
    const buscaMs = performance.now() - t1
    expect(achados.length).toBe(50)

    // Editar uma tarefa depois de aberta a obra: o observador não percorre o recorte e a gravação não o inclui
    let regravacoes = 0
    const gravarOriginal = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      if (extras?.gravarRecorte) regravacoes++
      return gravarOriginal(reg, indice, extras)
    }
    outra.state.meta.name = 'Obra SP renomeada'
    const t2 = performance.now()
    expect(await outra.salvarAgora()).toBe(true)
    const salvarMs = performance.now() - t2
    expect(regravacoes).toBe(0)
    expect(adaptador.recortes.get(CHAVE)).toEqual(registroAntes)
    expect(adaptador.obras.get(idA)!.json.length).toBeLessThan(25_000)

    process.stdout.write(`[recorte-grande] ${json.length} caracteres: abrir a obra ${Math.round(abrirMs)} ms; busca ${buscaMs.toFixed(1)} ms; salvar a obra ${Math.round(salvarMs)} ms\n`)
    expect(abrirMs).toBeLessThan(8000) // teto largo para o CI; localmente mede ~0,2 a 0,5 s
    expect(buscaMs).toBeLessThan(500)
    expect(salvarMs).toBeLessThan(2000)
  }, 60_000)
})
