// Recorte SINAPI na obra (ciclo 00006, entregável 4): importação atômica, compartilhamento por chave, desvínculo, leitura adulterada,
// calculadora e planilha com custo e RUP publicados. Fonte dos números: SINAPI 09/2026, Caixa (SP, não desonerado), 3 composições públicas.
import { isProxy } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('linha da planilha alterada pelo usuário: fonte, equipe e notas (B2)', () => {
  const ALTERADA = 'SINAPI SP 09/2026 não desonerado · alterado'
  const PUBLICADA = 'SINAPI SP 09/2026 não desonerado'
  const csv = (cabecalho: string, linha: string) => [`codigo;descricao;unidade;quantidade;${cabecalho}`, linha].join('\n')
  const CAB = 'Gerado pelo CronoAI a partir do SINAPI 103332 (SP 09/2026 não desonerado · alterado): 640 m². '
  const FIM = ' HH de subcomposições (ex.: preparo de argamassa) não incluída.'

  async function comLinha(cabecalho: string, linha: string) {
    const ctx = await comRecorte()
    ctx.store.clearBudget()
    const r = ctx.store.importBudgetCsv(csv(cabecalho, linha))
    expect(r.errors).toEqual([])
    return { ...ctx, linha: ctx.store.state.budget[0]! }
  }
  const gerar = (store: ReturnType<typeof useProjectStore>) => {
    const r = store.generateFromBudget({ mode: 'FS', overlapPct: 0 })
    if (!r.ok) throw new Error(r.erro)
    return r.created[0]!
  }

  it('RUP editada na célula: a linha vira "alterada" e MANTÉM a equipe por função; a duração usa a RUP digitada (18 d.u., e não 33) e as notas citam só a RUP como informada', async () => {
    const { store, linha } = await comLinha('equipe', '103332;;m²;640;4')
    expect(linha.fonte).toBe(PUBLICADA)
    expect(linha.equipe).toEqual([{ recurso: 'Servente', proporcao: 0.5 }])
    store.updateBudgetLine(linha.id, { rup: 0.9 })
    const l = store.state.budget[0]!
    expect(l.fonte).toBe(ALTERADA)
    expect(l.equipe).toEqual([{ recurso: 'Servente', proporcao: 0.5 }])
    const t = gerar(store)
    expect(t.duracaoMin / 480).toBe(18) // 640 × 0,9 ÷ (4 × 8); com a RUP publicada seriam 33
    expect(t.resources).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(t.notes).toBe(CAB + 'Função principal PEDREIRO. RUP 0,9 h/m² (informada pelo usuário; publicada 1,6225376). Equipe: Pedreiro 4 + Servente 2.' + FIM)
  })

  it('custo editado na célula: fonte "alterada", equipe mantida, BAC com o custo digitado; só o custo é citado como informado (com o publicado)', async () => {
    const { store, linha } = await comLinha('equipe', '103332;;m²;640;4')
    store.updateBudgetLine(linha.id, { unitCost: 150 })
    expect(store.state.budget[0]!.fonte).toBe(ALTERADA)
    expect(store.state.budget[0]!.equipe).toEqual([{ recurso: 'Servente', proporcao: 0.5 }])
    const t = gerar(store)
    expect(t.bac).toBeCloseTo(96000, 2)
    expect(t.notes).toBe(CAB + 'Função principal PEDREIRO. RUP 1,6225376 h/m². Custo R$ 150/m² (informado pelo usuário; publicado R$ 123,96). Equipe: Pedreiro 4 + Servente 2.' + FIM)
  })

  it('profissional trocado no CSV: as notas usam a função e a equipe EFETIVAS; só a função é citada como informada', async () => {
    const { store } = await comLinha('profissional;equipe', '103332;;m²;640;Carpinteiro;4')
    expect(store.state.budget[0]!.fonte).toBe(ALTERADA)
    expect('equipe' in store.state.budget[0]!).toBe(false)
    const t = gerar(store)
    expect(t.resources).toEqual([{ resource: 'Carpinteiro', units: 4 }, { resource: 'Servente', units: 2 }])
    expect(t.notes).toBe(CAB + 'Função principal Carpinteiro (informada pelo usuário; publicada PEDREIRO). RUP 1,6225376 h/m². Equipe: Carpinteiro 4 + Servente 2.' + FIM)
    expect(t.notes).not.toContain('Função principal PEDREIRO')
  })

  it('profissional trocado na célula derruba a equipe por função e cai no servente por oficial comum (0,5)', async () => {
    const { store, linha } = await comLinha('equipe', '103332;;m²;640;4')
    store.updateBudgetLine(linha.id, { professional: 'Armador' })
    const l = store.state.budget[0]!
    expect(l).toMatchObject({ fonte: ALTERADA, professional: 'Armador', helperRatio: 0.5 })
    expect('equipe' in l).toBe(false)
    expect(gerar(store).resources).toEqual([{ resource: 'Armador', units: 4 }, { resource: 'Servente', units: 2 }])
  })

  it('RUP e custo diferentes no CSV: os dois informados; o profissional segue o publicado; equipe mantida', async () => {
    const { store } = await comLinha('rup;custo unitario;equipe', '103332;;m²;640;0,9;150;4')
    expect(store.state.budget[0]!.fonte).toBe(ALTERADA)
    expect(gerar(store).notes).toBe(
      CAB + 'Função principal PEDREIRO. RUP 0,9 h/m² (informada pelo usuário; publicada 1,6225376). Custo R$ 150/m² (informado pelo usuário; publicado R$ 123,96). Equipe: Pedreiro 4 + Servente 2.' + FIM,
    )
  })

  it('CR-2 (104658, 100 m², equipe 2) e CR-3 (103681, 320 m³, equipe 4) com custo alterado mantêm as funções do recorte (antes desta rodada: CR-2 Pedreiro 2 + Servente 1; CR-3 sem o carpinteiro)', async () => {
    const { store } = await comRecorte()
    store.clearBudget()
    store.importBudgetCsv(['codigo;descricao;unidade;quantidade;custo unitario;equipe', '104658;;m²;100;300;2', '103681;;m³;320;800;4'].join('\n'))
    expect(store.state.budget.map((l) => l.fonte)).toEqual([ALTERADA.replace('SINAPI SP', 'SINAPI SP'), ALTERADA])
    const r = store.generateFromBudget({ mode: 'FS', overlapPct: 0 })
    if (!r.ok) throw new Error(r.erro)
    const cr2 = r.created.find((t) => t.sinapi === '104658')!
    const cr3 = r.created.find((t) => t.sinapi === '103681')!
    expect(cr2.resources).toEqual([{ resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 4 }])
    expect(cr2.duracaoMin / 480).toBe(4)
    expect(cr3.resources).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 4 }, { resource: 'Carpinteiro', units: 1 }])
    expect(cr3.duracaoMin / 480).toBe(15)
  })

  it('só a quantidade ou a equipe mudam: a linha segue "publicada" e a equipe do recorte continua', async () => {
    const { store, linha } = await comLinha('equipe', '103332;;m²;640;4')
    store.updateBudgetLine(linha.id, { quantity: 700, team: 5 })
    const l = store.state.budget[0]!
    expect(l.fonte).toBe(PUBLICADA)
    expect(l.equipe).toEqual([{ recurso: 'Servente', proporcao: 0.5 }])
    const t = gerar(store)
    expect(t.notes).toContain('Função principal PEDREIRO, RUP 1,6225376 h/m².')
    expect(t.notes).not.toContain('informad')
  })

  it('editar a célula com o MESMO valor não altera a linha', async () => {
    const { store, linha } = await comLinha('equipe', '103332;;m²;640;4')
    store.updateBudgetLine(linha.id, { rup: 1.6225376, unitCost: 123.96 })
    expect(store.state.budget[0]!.fonte).toBe(PUBLICADA)
  })

  it('a linha alterada sobrevive ao recarregar e continua alterada, com a equipe por função', async () => {
    const { store, adaptador, linha } = await comLinha('equipe', '103332;;m²;640;4')
    store.updateBudgetLine(linha.id, { rup: 0.9 })
    expect(await store.salvarAgora()).toBe(true)
    const outra = await reabrir(adaptador)
    expect(outra.state.budget[0]).toMatchObject({ fonte: ALTERADA, rup: 0.9, equipe: [{ recurso: 'Servente', proporcao: 0.5 }] })
  })
})

describe('lote da planilha com linhas de outro recorte (B1)', () => {
  async function comLinhasSp() {
    const ctx = await comRecorte()
    ctx.store.clearBudget()
    ctx.store.importBudgetCsv(['codigo;descricao;unidade;quantidade;equipe', '103332;;m²;640;4', '104658;;m²;100;2'].join('\n'))
    expect(ctx.store.state.budget).toHaveLength(2)
    return ctx
  }

  it('troca da data-base: as linhas ficam com a fonte do recorte antigo e o lote recusa (prévia e geração), sem criar tarefa, listando as linhas', async () => {
    const { store } = await comLinhasSp()
    expect(store.atualizarDadosObra({ ...sp, dataBaseSinapi: '2026-10' })).toEqual({ ok: true })
    expect(store.recorteAtual).toBeUndefined()
    const antes = store.state.tasks.length
    const msg = '2 linha(s) da planilha vêm de SINAPI SP 09/2026 não desonerado, que não é o recorte desta obra (a obra não tem recorte): 103332, 104658. Remova essas linhas e inclua de novo as composições; nada foi gerado.'
    expect(store.previewBudgetBatch()).toEqual({ erro: msg })
    expect(store.generateFromBudget()).toEqual({ ok: false, erro: msg })
    expect(store.state.tasks).toHaveLength(antes)
    expect(store.state.budget).toHaveLength(2)
  })

  it('obra com OUTRO recorte (data-base 2026-10 importada): as linhas de 2026-09 também são recusadas, citando o recorte da obra', async () => {
    const { store } = await comLinhasSp()
    store.atualizarDadosObra({ ...sp, dataBaseSinapi: '2026-10' })
    const novo = JSON.parse(amostraTexto)
    novo.dataBase = '2026-10'
    expect(await store.importarRecorteSinapi(JSON.stringify(novo))).toEqual({ ok: true })
    const r = store.generateFromBudget()
    expect(r).toMatchObject({ ok: false })
    expect(r.ok ? '' : r.erro).toContain('(SINAPI SP 10/2026 não desonerado)')
  })

  it('linhas do catálogo ilustrativo (sem fonte) e do recorte vigente seguem gerando', async () => {
    const { store } = await comLinhasSp()
    expect(store.generateFromBudget({ mode: 'FS', overlapPct: 0 }).ok).toBe(true)
    const { store: sem } = await abrir()
    expect(sem.generateFromBudget({ mode: 'SS', overlapPct: 40 }).ok).toBe(true)
  })
})

describe('composição de outro recorte não vira tarefa desta obra (B1)', () => {
  const baText = () => texto({ ...amostra(), uf: 'BA' })
  const dadosBa: DadosObra = { ...sp, nome: 'Obra BA (fictícia)', uf: 'BA' }
  const inputDe = (fonte: string | undefined, nome = 'Alvenaria') => ({
    name: nome, code: '103332', unit: 'm²', quantity: 640, unitCost: 123.96, durationDays: 33,
    resources: [{ resource: 'Pedreiro', units: 4 }], parentWbs: '', newGroupName: 'Grupo (teste)', linkType: 'FS' as const, lagDays: 0, fonte,
  })

  it('obra A (SP) e obra B (BA) com recorte: o custo de SP não entra na obra BA (prévia e inclusão recusam, com mensagem); na obra SP vale', async () => {
    const { store, idA } = await comRecorte()
    const b = await store.criarObra({ modelo: 'branco', dados: dadosBa })
    if (!b.ok) throw new Error(b.erro)
    expect(await store.importarRecorteSinapi(baText())).toEqual({ ok: true })
    expect(store.recorteAtual?.fonte).toBe('SINAPI BA 09/2026 não desonerado')
    const antes = store.state.tasks.length
    const msg = 'A composição escolhida vem de SINAPI SP 09/2026 não desonerado, que não é o recorte desta obra (SINAPI BA 09/2026 não desonerado). Escolha a composição de novo.'
    expect(store.previewSinapiTask(inputDe(PUBLICADA_SP))).toEqual({ erro: msg })
    expect(store.addSinapiTask(inputDe(PUBLICADA_SP))).toEqual({ ok: false, erro: msg })
    expect(store.state.tasks).toHaveLength(antes)
    // A fonte com a marca "alterado" também é conferida pela base
    expect(store.addSinapiTask(inputDe(`${PUBLICADA_SP} · alterado`)).ok).toBe(false)
    // Na própria obra (BA) a composição de BA entra
    expect(store.addSinapiTask(inputDe('SINAPI BA 09/2026 não desonerado')).ok).toBe(true)
    // De volta à obra SP: o de SP entra e o de BA é recusado
    expect(await store.trocarObra(idA)).toEqual({ ok: true })
    expect(store.addSinapiTask(inputDe(PUBLICADA_SP)).ok).toBe(true)
    expect(store.addSinapiTask(inputDe('SINAPI BA 09/2026 não desonerado'))).toMatchObject({ ok: false })
  })

  it('obra sem recorte recusa fonte de recorte; sem fonte (catálogo ilustrativo) segue como sempre', async () => {
    const { store } = await abrir()
    await obraSp(store)
    expect(store.addSinapiTask(inputDe(PUBLICADA_SP))).toEqual({
      ok: false,
      erro: 'A composição escolhida vem de SINAPI SP 09/2026 não desonerado, que não é o recorte desta obra (a obra não tem recorte). Escolha a composição de novo.',
    })
    expect(store.addSinapiTask(inputDe(undefined)).ok).toBe(true)
  })

  it('recorte substituído na mesma obra por outro de mesma fonte (SHA diferente): a fonte é a mesma e a inclusão segue valendo', async () => {
    const { store } = await comRecorte()
    const outro = amostra()
    outro.fonte.sha256 = 'e'.repeat(64)
    expect(await store.importarRecorteSinapi(texto(outro))).toEqual({ ok: true })
    expect(store.addSinapiTask(inputDe(PUBLICADA_SP)).ok).toBe(true)
  })
})

const PUBLICADA_SP = 'SINAPI SP 09/2026 não desonerado'

describe('troca de obra durante a operação do recorte (R-3)', () => {
  const porta = () => {
    let abrir!: () => void
    const livre = new Promise<void>((r) => (abrir = r))
    return { livre, abrir }
  }

  it('a obra muda enquanto o recorte é lido: a importação desiste e não grava nada em nenhuma das obras', async () => {
    const { adaptador, store } = await abrir()
    const idA = await obraSp(store)
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    await store.trocarObra(idA)
    const g = porta()
    const original = adaptador.lerRecorte.bind(adaptador)
    adaptador.lerRecorte = async (chave) => {
      await g.livre
      return original(chave)
    }
    const importacao = store.importarRecorteSinapi(texto())
    expect(await store.trocarObra(b.id)).toEqual({ ok: true })
    g.abrir()
    expect(await importacao).toEqual({ ok: false, erro: 'A obra ativa mudou durante a operação. Nada foi gravado: refaça na obra desejada.' })
    expect(adaptador.recortes.size).toBe(0)
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(JSON.parse(adaptador.obras.get(idA)!.json).meta.recorteSinapi).toBeUndefined()
    expect(store.recorteAtual).toBeUndefined()
  })

  it('a obra muda enquanto o recorte é gravado: a gravação termina na obra pedida e a troca espera; a obra nova não ganha o recorte nem o log', async () => {
    const { adaptador, store } = await abrir()
    const idA = await obraSp(store)
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    await store.trocarObra(idA)
    const g = porta()
    let noPortao = false
    const original = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      if (extras?.gravarRecorte) {
        noPortao = true
        await g.livre
      }
      return original(reg, indice, extras)
    }
    const importacao = store.importarRecorteSinapi(texto())
    await vi.waitFor(() => expect(noPortao).toBe(true))
    const troca = store.trocarObra(b.id)
    g.abrir()
    expect(await importacao).toEqual({ ok: true })
    expect(await troca).toEqual({ ok: true })
    expect(store.obraAtivaId).toBe(b.id)
    expect(adaptador.recortes.size).toBe(1)
    expect(JSON.parse(adaptador.obras.get(idA)!.json).meta.recorteSinapi.chave).toBe(CHAVE)
    expect(store.state.meta.recorteSinapi).toBeUndefined()
    expect(store.recorteAtual).toBeUndefined()
    expect(store.state.log.some((l) => l.title === 'Recorte SINAPI importado')).toBe(false)
    expect(JSON.parse(adaptador.obras.get(b.id)!.json).meta.recorteSinapi).toBeUndefined()
  })

  it('o atraso de gravação agendado pela mudança da referência é cancelado: depois da importação o estado termina "salvo", sem nova gravação', async () => {
    const { adaptador, store } = await abrir()
    await obraSp(store)
    let gravacoes = 0
    const original = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      gravacoes++
      return original(reg, indice, extras)
    }
    const r = await store.importarRecorteSinapi(texto())
    expect(r).toEqual({ ok: true })
    // O log da importação é o único pendente; fora isso, uma gravação só (a da importação)
    expect(gravacoes).toBe(1)
  })
})

describe('recorte órfão de formato mais novo nunca é apagado (R-4)', () => {
  const futuro = (chave: string) => ({ chave, versaoFormato: 2, json: '{"formato":"futuro"}', sha256Origem: 'a'.repeat(64), importadoEm: '2027-01-01T00:00:00.000Z', composicoes: 1 })

  it('desvincular por troca de UF não apaga o registro do formato 2, mesmo sem outra obra usando', async () => {
    const { adaptador, store } = await comRecorte()
    adaptador.recortes.set(CHAVE, futuro(CHAVE))
    expect(store.atualizarDadosObra({ ...sp, uf: 'BA' })).toEqual({ ok: true })
    expect(await store.salvarAgora()).toBe(true)
    expect(adaptador.recortes.get(CHAVE)).toEqual(futuro(CHAVE))
  })

  it('remover da última obra e excluir a obra também mantêm o registro do formato 2; o de formato 1 sai', async () => {
    const { adaptador, store, idA } = await comRecorte()
    adaptador.recortes.set(CHAVE, futuro(CHAVE))
    expect(await store.removerRecorteSinapi()).toEqual({ ok: true })
    expect(adaptador.recortes.get(CHAVE)).toEqual(futuro(CHAVE))
    // Excluir a obra A (que voltou a ter referência) também mantém
    store.state.meta.recorteSinapi = { chave: CHAVE, sha256Origem: 'a'.repeat(64), importadoEm: '2027-01-01T00:00:00.000Z' }
    await store.criarObra({ modelo: 'exemplo' })
    expect(await store.excluirObra(idA)).toEqual({ ok: true })
    expect(adaptador.recortes.get(CHAVE)).toEqual(futuro(CHAVE))
  })

  it('o formato 1 continua saindo quando órfão (1 → 0)', async () => {
    const { adaptador, store } = await comRecorte()
    expect(await store.removerRecorteSinapi()).toEqual({ ok: true })
    expect(adaptador.recortes.size).toBe(0)
  })
})

describe('totais do arquivo conferem com a lista (segurança, Info 3)', () => {
  it('totais.composicoes diferente da quantidade de composições: recusado na importação, sem gravar', async () => {
    const { adaptador, store } = await abrir()
    await obraSp(store)
    const r = amostra()
    r.totais.composicoes = 99
    expect(await store.importarRecorteSinapi(texto(r))).toMatchObject({ ok: false, erro: 'Os totais do recorte não conferem com a quantidade de composições.' })
    expect(adaptador.recortes.size).toBe(0)
  })
})

describe('índice da troca de obra montado sob a fila (resíduo do R-3)', () => {
  it('a troca de obra começa antes e grava o índice durante a importação: o recorte, a referência da obra e o índice terminam coerentes', async () => {
    const { adaptador, store } = await abrir()
    const idA = await obraSp(store)
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    await store.trocarObra(idA)
    // A troca para a B fica parada logo antes de gravar o índice (como se o armazenamento demorasse)
    let abrirIndice!: () => void
    const portao = new Promise<void>((r) => (abrirIndice = r))
    const gravarIndice = adaptador.gravarIndice.bind(adaptador)
    adaptador.gravarIndice = async (indice) => {
      await portao
      return gravarIndice(indice)
    }
    const troca = store.trocarObra(b.id)
    const importacao = store.importarRecorteSinapi(texto())
    abrirIndice()
    const [rt, ri] = await Promise.all([troca, importacao])
    expect(rt).toEqual({ ok: true })
    // Ou a importação foi recusada (a obra mudou antes), ou foi gravada inteira: nunca "ok" sem vínculo, nem registro sem referência
    const obraA = JSON.parse(adaptador.obras.get(idA)!.json)
    const linhaA = adaptador.indice!.obras.find((o) => o.id === idA)!
    if (ri.ok) {
      expect(obraA.meta.recorteSinapi?.chave).toBe(CHAVE)
      expect(linhaA.recorteSinapi).toBe(CHAVE)
      expect(adaptador.recortes.size).toBe(1)
    } else {
      expect(ri.erro).toBe('A obra ativa mudou durante a operação. Nada foi gravado: refaça na obra desejada.')
      expect(obraA.meta.recorteSinapi).toBeUndefined()
      expect(linhaA.recorteSinapi).toBeUndefined()
      expect(adaptador.recortes.size).toBe(0)
    }
    expect(adaptador.indice!.obraAtivaId).toBe(b.id)
    expect(store.obraAtivaId).toBe(b.id)
  })

  it('o índice da troca é gravado depois de uma gravação já em andamento (a referência dela não se perde)', async () => {
    const { adaptador, store } = await abrir()
    const idA = await obraSp(store)
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    await store.trocarObra(idA)
    let abrirObra!: () => void
    const portao = new Promise<void>((r) => (abrirObra = r))
    let noPortao = false
    const gravarObra = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      if (extras?.gravarRecorte) {
        noPortao = true
        await portao
      }
      return gravarObra(reg, indice, extras)
    }
    const importacao = store.importarRecorteSinapi(texto())
    await vi.waitFor(() => expect(noPortao).toBe(true))
    const troca = store.trocarObra(b.id)
    abrirObra()
    expect(await importacao).toEqual({ ok: true })
    expect(await troca).toEqual({ ok: true })
    expect(adaptador.indice!.obras.find((o) => o.id === idA)?.recorteSinapi).toBe(CHAVE)
    expect(adaptador.recortes.size).toBe(1)
    expect(adaptador.indice!.obraAtivaId).toBe(b.id)
  })
})
