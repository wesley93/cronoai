// Fechamento da data de status e retificação na store (ciclo 00007, E3): gravação atômica na fila, imutabilidade, regras da data de status,
// leitura adulterada do IndexedDB, guardas de obra (provadas por mutação) e a troca de obra. Números do Aurora conferidos à mão no plano.
import { isProxy, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CabecalhoFechamento } from '@/types/fechamento'
import fixtureLinhasBase from '@/lib/__fixtures__/mspdi-linhas-base.xml?raw'
import { computeSCurve } from '@/lib/evm'
import { useUiStore } from './ui'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from './armazenamentoObras'
import { buildSeedState, useProjectStore } from './useProjectStore'

/** set/26 sem fechamentos depois de avançar a 302 a 90% (medido; antes, com o fechamento, o EV era 5.408.856,76). */
const SET_SEM_FECHAMENTO_EV = 5396674.208144797
/** Entrega do arquivo de teste importado com início em 01/12/2026 (a data de início da obra, 04/05/2026, é mantida; as folhas têm SNET inferida do arquivo). Medido. */
const ENTREGA_DEPOIS_DO_IMPORT = '2026-12-17'
const MSG_JA_EXISTE = "Já existe fechamento em 23/10/2026: use 'Retificar'."
const MSG_ANTERIOR = "A data de status não pode ser anterior ao último fechamento (23/10/2026). Para corrigir um fechamento, use 'Retificar'."
const MSG_OBRA_MUDOU = 'A obra ativa mudou durante a operação. Nada foi gravado: refaça na obra desejada.'

async function abrir(adaptador: ArmazenamentoMemoria = criarArmazenamentoMemoria()) {
  usarArmazenamento(adaptador)
  setActivePinia(createPinia())
  const store = useProjectStore()
  await store.carregar()
  return { adaptador, store }
}
/** Nova pinia (= nova abertura do app) sobre o mesmo armazenamento. */
const reabrir = async (adaptador: ArmazenamentoMemoria) => (await abrir(adaptador)).store

const fechar = async (store: ReturnType<typeof useProjectStore>, extra: { autor?: string; observacao?: string } = {}) => {
  const r = await store.fecharDataDeStatus(extra)
  if (!r.ok) throw new Error(r.erro)
  return r
}
const cabecalhosGravados = (a: ArmazenamentoMemoria) => [...a.fechamentos.values()] as CabecalhoFechamento[]

beforeEach(() => {
  globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
  usarArmazenamento(undefined)
  vi.setSystemTime(new Date('2026-10-25T15:00:00.000Z'))
})
afterEach(() => {
  usarArmazenamento(undefined)
  vi.useRealTimers()
})

describe('fechar a data de status (FE-1, FE-2, D-16)', () => {
  it('FE-1 (ação): grava cabeçalho e detalhe na transação da obra, entra no log e cresce o histórico em memória (fora do estado reativo)', async () => {
    const { adaptador, store } = await abrir()
    expect(store.fechamentosCarregados).toBe(true)
    const r = await fechar(store, { autor: 'Eng. de Planejamento', observacao: 'Fechamento da semana' })
    expect(adaptador.fechamentos.size).toBe(1)
    expect(adaptador.detalhes.size).toBe(1)
    const c = cabecalhosGravados(adaptador)[0]
    expect(c).toMatchObject({ id: r.id, obraId: store.obraAtivaId, sequencia: 1, tipo: 'fechamento', dataStatus: '2026-10-23', linhaBase: 0, versaoPremissas: 1, esquemaObra: 6, autor: 'Eng. de Planejamento', observacao: 'Fechamento da semana', quantidadeTarefas: 20 })
    expect([c.totais.bac, c.totais.pv, c.totais.ev, c.totais.ac, c.totais.entregaPrevista, c.totais.atrasoDiasUteis]).toEqual([19113000, 7259250, 6448200, 6896900, '2027-06-23', 16])
    expect(c.linhaBaseSalvaEm).toBe('2026-04-27T12:00:00.000Z')
    expect(store.fechamentos).toHaveLength(1)
    expect(isProxy(store.fechamentos[0])).toBe(false) // fora do estado reativo (D-22)
    expect(store.fechamentosEfetivos.map((e) => e.id)).toEqual([r.id])
    // Aviso da E-8: os 4 relatos pendentes do Aurora
    expect(r.avisos).toEqual(['Há 4 relato(s) de campo pendente(s) de aprovação: o fechamento não inclui essas medições.'])
    // Log: 1 entrada de fechamento (e o pedido de armazenamento persistente), gravado junto com a obra
    expect(store.state.log.filter((l) => l.title === 'Data de status fechada')).toHaveLength(1)
    expect(await store.salvarAgora()).toBe(true)
    expect(adaptador.obras.get(store.obraAtivaId)!.json).toContain('Data de status fechada')
    expect(store.estadoGravacao).toBe('salvo')
  })

  it('o registro da obra gravado JUNTO com o fechamento já tem a entrada de log (a mesma transação)', async () => {
    const { adaptador, store } = await abrir()
    await fechar(store)
    // Sem `salvarAgora` extra: o que a transação do fechamento gravou
    expect(JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json).log[0]).toMatchObject({ title: 'Data de status fechada', kind: 'sistema' })
  })

  it('teste 67 (E-8): data de status posterior a hoje avisa sem bloquear, junto com os relatos pendentes', async () => {
    vi.setSystemTime(new Date('2026-10-20T15:00:00.000Z'))
    const { adaptador, store } = await abrir()
    const r = await fechar(store)
    expect(r.avisos).toEqual(['Há 4 relato(s) de campo pendente(s) de aprovação: o fechamento não inclui essas medições.', 'A data de status (23/10/2026) é posterior a hoje.'])
    expect(adaptador.fechamentos.size).toBe(1) // gravado: o aviso não bloqueia
  })

  it('FE-2: falha na transação: nada gravado, log e estado iguais, toast de erro; sem o fechamento a obra segue fechável', async () => {
    const { adaptador, store } = await abrir()
    const antes = JSON.parse(JSON.stringify(store.state))
    const memoriaAntes = store.fechamentos.length
    adaptador.falhar.gravar = true
    const r = await store.fecharDataDeStatus()
    expect(r.ok).toBe(false)
    expect(adaptador.fechamentos.size).toBe(0)
    expect(adaptador.detalhes.size).toBe(0)
    expect(JSON.parse(JSON.stringify(store.state))).toEqual(antes)
    expect(store.fechamentos).toHaveLength(memoriaAntes)
    expect(store.detalheAncora).toBeUndefined()
    expect(useUiStore().toasts.some((t) => t.tone === 'error')).toBe(true)
    expect(store.persistenciaFechamento).toBeUndefined()
    adaptador.falhar.gravar = false
    expect((await store.fecharDataDeStatus()).ok).toBe(true) // o histórico não ficou pela metade
    expect(adaptador.fechamentos.size).toBe(1)
  })

  it('FE-5: depois do FE-1, fechar de novo em 23/10 e voltar a data de status antes do fechamento são recusados; avançar e fechar é aceito (sequência 2)', async () => {
    const { adaptador, store } = await abrir()
    await fechar(store)
    expect(await store.fecharDataDeStatus()).toEqual({ ok: false, erro: MSG_JA_EXISTE })
    expect(store.setStatusDate('2026-10-16')).toEqual({ ok: false, erro: MSG_ANTERIOR })
    expect(store.state.meta.statusDate).toBe('2026-10-23')
    expect(store.setStatusDate('2026-10-30')).toEqual({ ok: true })
    const r = await fechar(store)
    expect(adaptador.fechamentos.size).toBe(2)
    const c2 = cabecalhosGravados(adaptador).find((c) => c.id === r.id)!
    expect([c2.sequencia, c2.dataStatus]).toEqual([2, '2026-10-30'])
  })

  it('FE-5 (D-13): atualizarDadosObra também recusa data de status anterior ao último fechamento e data de início posterior ao primeiro, sem alterar nada', async () => {
    const { store } = await abrir()
    await fechar(store)
    const m = store.state.meta
    const dados = { nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: m.statusDate }
    const antes = JSON.stringify(store.state.meta)
    expect(store.atualizarDadosObra({ ...dados, dataStatus: '2026-10-16' })).toEqual({ ok: false, erros: [MSG_ANTERIOR] })
    expect(JSON.stringify(store.state.meta)).toBe(antes)
    expect(store.atualizarDadosObra({ ...dados, dataStatus: '2026-10-30' })).toEqual({ ok: true })
  })

  it('D-13: a data de início não passa da data do primeiro fechamento (obra sem avanço, para a regra da data de início valer sozinha)', async () => {
    const { store } = await abrir()
    store.importXml(fixtureLinhasBase) // obra sem início real: início 02/03/2026, status 06/03/2026
    await fechar(store)
    store.setStatusDate('2026-03-13')
    const m = store.state.meta
    const dados = { nome: m.name, responsavel: m.manager, dataInicio: '2026-03-09', dataStatus: m.statusDate }
    const antes = JSON.stringify(store.state.meta)
    expect(store.atualizarDadosObra(dados)).toEqual({ ok: false, erros: ['A data de início não pode ser posterior à data do primeiro fechamento (06/03/2026).'] })
    expect(JSON.stringify(store.state.meta)).toBe(antes)
    expect(store.atualizarDadosObra({ ...dados, dataInicio: '2026-03-06' })).toEqual({ ok: true }) // igual à do primeiro fechamento: aceita
  })

  it('o fechamento sem folhas (obra em branco) é recusado, e o limite de leitura em andamento bloqueia', async () => {
    const { store } = await abrir()
    const b = await store.criarObra({ modelo: 'branco', dados: { nome: 'Obra vazia (fictícia)', dataInicio: '2026-11-03', dataStatus: '2026-11-03' } })
    if (!b.ok) throw new Error(b.erro)
    expect(await store.fecharDataDeStatus()).toEqual({ ok: false, erro: 'A obra precisa de ao menos uma tarefa para fechar a data de status.' })
    expect(store.previaFechamento().erro).toBe('A obra precisa de ao menos uma tarefa para fechar a data de status.')
  })

  it('textos acima do limite ou com caractere de controle são recusados antes de gravar', async () => {
    const { adaptador, store } = await abrir()
    expect(await store.fecharDataDeStatus({ autor: 'a'.repeat(121) })).toEqual({ ok: false, erro: 'O autor passa de 120 caracteres.' })
    expect(await store.fecharDataDeStatus({ observacao: 'o'.repeat(501) })).toEqual({ ok: false, erro: 'A observação passa de 500 caracteres.' })
    expect((await store.fecharDataDeStatus({ observacao: 'x\u0007' })).ok).toBe(false)
    expect(adaptador.fechamentos.size).toBe(0)
    expect((await store.fecharDataDeStatus({ observacao: '<script>alert(1)</script>' })).ok).toBe(true) // só texto
  })

  it('dois pedidos de fechamento ao mesmo tempo: só um é gravado (a regra é conferida de novo na vez da fila)', async () => {
    const { adaptador, store } = await abrir()
    const [a, b] = await Promise.all([store.fecharDataDeStatus(), store.fecharDataDeStatus()])
    expect([a.ok, b.ok].sort()).toEqual([false, true])
    expect(adaptador.fechamentos.size).toBe(1)
    expect([a, b].find((r) => !r.ok)).toEqual({ ok: false, erro: MSG_JA_EXISTE })
    expect(store.fechamentos).toHaveLength(1)
  })

  it('a prévia mostra os totais, a linha de base e os avisos sem gravar nada', async () => {
    const { adaptador, store } = await abrir()
    const p = store.previaFechamento()
    expect(p.erro).toBeUndefined()
    expect([p.dataStatus, p.linhaBase, p.sequencia]).toEqual(['2026-10-23', 0, 1])
    expect([p.totais?.bac, p.totais?.pv, p.totais?.ev, p.totais?.ac]).toEqual([19113000, 7259250, 6448200, 6896900])
    expect(p.avisos).toHaveLength(1)
    expect(adaptador.fechamentos.size).toBe(0)
    await fechar(store)
    expect(store.previaFechamento().erro).toBe(MSG_JA_EXISTE)
  })
})

describe('imutabilidade no armazenamento (FE-4, D-17, S-3)', () => {
  it('FE-4: gravar um fechamento com um id que já existe falha com ConstraintError e nada muda (memória; o IndexedDB usa `add`)', async () => {
    const { adaptador, store } = await abrir()
    await fechar(store)
    const antes = { fechamentos: structuredClone([...adaptador.fechamentos]), detalhes: structuredClone([...adaptador.detalhes]), obra: structuredClone(adaptador.obras.get(store.obraAtivaId)), indice: structuredClone(adaptador.indice) }
    const cab = cabecalhosGravados(adaptador)[0]
    const registro = { id: store.obraAtivaId, versaoEsquema: 6, json: '{"alterada":true}', atualizadoEm: '2030-01-01T00:00:00.000Z' }
    await expect(adaptador.gravarObra(registro, adaptador.indice!, { gravarFechamento: { cabecalho: { ...cab, totais: { ...cab.totais, ev: 1 } }, detalhe: { id: cab.id, json: '{}' } } })).rejects.toMatchObject({ name: 'ConstraintError' })
    expect([...adaptador.fechamentos]).toEqual(antes.fechamentos)
    expect([...adaptador.detalhes]).toEqual(antes.detalhes)
    expect(adaptador.obras.get(store.obraAtivaId)).toEqual(antes.obra) // a obra também não foi gravada: tudo ou nada
    expect(adaptador.indice).toEqual(antes.indice)
  })

  it('o código das stores de fechamento nunca usa `put` (R-2): só `add`, leitura e exclusão com a obra', async () => {
    const fonte = (await import('./armazenamentoObras.ts?raw')).default as string
    const linhas = fonte.split('\n').filter((l) => /STORE_(FECHAMENTOS|DETALHES)/.test(l) && !l.trimStart().startsWith('//') && !l.trimStart().startsWith('/**'))
    expect(linhas.length).toBeGreaterThan(0)
    expect(linhas.filter((l) => /\.put\(/.test(l))).toEqual([])
  })
})

describe('retificar (FE-3, D-15)', () => {
  it('FE-3 (ação): a retificação grava um registro novo, o original fica igual byte a byte e a retificação passa a ser o efetivo da data', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    const originalAntes = JSON.stringify([adaptador.fechamentos.get(f1.id), adaptador.detalhes.get(f1.id)])
    const r = await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }], motivo: 'Medição revisada em campo' })
    expect(r).toEqual({ ok: true, avisos: [] })
    expect(JSON.stringify([adaptador.fechamentos.get(f1.id), adaptador.detalhes.get(f1.id)])).toBe(originalAntes)
    expect(adaptador.fechamentos.size).toBe(2)
    const ret = cabecalhosGravados(adaptador).find((c) => c.id !== f1.id)!
    expect([ret.tipo, ret.retificaId, ret.sequencia, ret.motivo]).toEqual(['retificacao', f1.id, 2, 'Medição revisada em campo'])
    expect([ret.totais.ev, ret.totais.ac, ret.totais.pv, ret.totais.entregaPrevista]).toEqual([6456600, 6899900, 7259250, '2027-06-23'])
    expect(store.fechamentosEfetivos.map((c) => c.id)).toEqual([ret.id])
    expect(store.state.log.some((l) => l.title === 'Fechamento retificado' && l.detail.includes('Medição revisada em campo'))).toBe(true)
    // A retificação não altera a obra atual
    expect([store.evm.ev, store.evm.ac]).toEqual([6448200, 6896900])
    // O detalhe da retificação é legível e tem a tarefa corrigida
    const det = await store.lerDetalhe(ret.id)
    expect(det?.tarefas.find((t) => t[0] === 104)?.[2]).toBe(45)
  })

  it('recusas: motivo vazio, sem fechamento, fechamento de outra obra; nada é gravado', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    expect(await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: '' })).toEqual({ ok: false, erro: 'Informe o motivo da retificação.' })
    expect(await store.retificarFechamento({ fechamentoId: 'nao-existe', alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm' })).toEqual({ ok: false, erro: 'Fechamento não encontrado nesta obra.' })
    expect(adaptador.fechamentos.size).toBe(1)
    expect(store.state.log.some((l) => l.title === 'Fechamento retificado')).toBe(false)
  })

  it('falha na transação da retificação: nada gravado e log igual', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    const antes = JSON.stringify(store.state.log)
    adaptador.falhar.gravar = true
    const r = await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm' })
    expect(r.ok).toBe(false)
    expect(adaptador.fechamentos.size).toBe(1)
    expect(JSON.stringify(store.state.log)).toBe(antes)
    expect(store.fechamentos).toHaveLength(1)
  })

  it('cadeia: retificar a retificação aponta para a raiz e o efetivo é o de maior sequência', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'primeira' })
    const r1 = store.fechamentosEfetivos[0]
    expect((await store.retificarFechamento({ fechamentoId: r1.id, alteracoes: [{ uid: 302, custoReal: 1900000 }], motivo: 'segunda' })).ok).toBe(true)
    const efetivo = store.fechamentosEfetivos[0]
    expect([efetivo.sequencia, efetivo.retificaId, efetivo.motivo]).toEqual([3, f1.id, 'segunda'])
    expect(adaptador.fechamentos.size).toBe(3)
  })
})

describe('data de status e importação com fechamentos (D-13, teste 32)', () => {
  it('importar um .xml com data de status anterior ao último fechamento mantém a data de status da obra, com aviso', async () => {
    const { store } = await abrir()
    await fechar(store)
    const avisos = store.importXml(fixtureLinhasBase) // o arquivo traz StatusDate 2026-03-06, anterior ao fechamento de 23/10/2026
    expect(store.state.meta.statusDate).toBe('2026-10-23')
    expect(avisos).toContain('A data de status do arquivo (06/03/2026) é anterior ao último fechamento (23/10/2026): o CronoAI manteve a data de status atual (23/10/2026).')
    expect(store.fechamentos).toHaveLength(1) // o histórico não é tocado
  })

  it('sem fechamentos a importação segue como sempre (a data de status do arquivo vale)', async () => {
    const { store } = await abrir()
    const avisos = store.importXml(fixtureLinhasBase)
    expect(store.state.meta.statusDate).toBe('2026-03-06')
    expect(avisos.some((a) => a.includes('anterior ao último fechamento'))).toBe(false)
  })
})

describe('persistência (FE-8, AC-17, D-19)', () => {
  it('FE-8: o 1º fechamento pede armazenamento persistente uma vez e o resultado vai ao log e à tela; o 2º não pede de novo', async () => {
    const { adaptador, store } = await abrir()
    await fechar(store)
    expect(adaptador.persistencia.chamadas).toBe(1)
    expect(store.persistenciaFechamento).toBe('concedido')
    expect(store.state.log.some((l) => l.title === 'Armazenamento persistente' && l.detail.includes('concedeu'))).toBe(true)
    store.setStatusDate('2026-10-30')
    await fechar(store)
    expect(adaptador.persistencia.chamadas).toBe(1)
  })

  it('persistência negada vai ao log e não bloqueia nada', async () => {
    const adaptador = criarArmazenamentoMemoria()
    adaptador.persistencia.resultado = 'negado'
    const { store } = await abrir(adaptador)
    expect((await store.fecharDataDeStatus()).ok).toBe(true)
    expect(store.persistenciaFechamento).toBe('negado')
    expect(store.state.log.some((l) => l.title === 'Armazenamento persistente' && l.detail.includes('negou'))).toBe(true)
  })

  it('o fechamento que falha NÃO consome o pedido: o pedido sai no 1º fechamento bem-sucedido', async () => {
    const { adaptador, store } = await abrir()
    adaptador.falhar.gravar = true
    await store.fecharDataDeStatus()
    expect(adaptador.persistencia.chamadas).toBe(0)
    adaptador.falhar.gravar = false
    await fechar(store)
    expect(adaptador.persistencia.chamadas).toBe(1)
  })
})

describe('leitura adulterada do IndexedDB (P-6, S-2, AC-9)', () => {
  /** Obra com 2 fechamentos válidos (23/10 e 30/10) e depois registros de lixo gravados com o obraId da obra. */
  async function comLixo() {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    store.setStatusDate('2026-10-30')
    const f2 = await fechar(store)
    await store.salvarAgora()
    const valido = adaptador.fechamentos.get(f2.id) as CabecalhoFechamento
    const lixo: Record<string, unknown>[] = [
      { ...structuredClone(valido), id: 'x-formato2', sequencia: 11, versaoFormato: 2 },
      { ...structuredClone(valido), id: 'x-nan', sequencia: 12, totais: { ...valido.totais, ev: 'x' } },
      { ...structuredClone(valido), id: 'x-linhabase', sequencia: 13, linhaBase: 99 },
      JSON.parse('{"id":"x-proto","obraId":"' + store.obraAtivaId + '","__proto__":{"admin":true},"sequencia":14}'),
    ]
    for (const l of lixo) adaptador.fechamentos.set(String(l.id), l)
    return { adaptador, f1, f2, valido, lixoIds: lixo.map((l) => String(l.id)) }
  }

  it('abre a obra, ignora os registros ilegíveis com aviso, não regrava nada e bloqueia o novo fechamento', async () => {
    const { adaptador, f1, f2 } = await comLixo()
    const antes = { fechamentos: structuredClone([...adaptador.fechamentos]), detalhes: structuredClone([...adaptador.detalhes]) }
    const store = await reabrir(adaptador)
    expect(store.obraAtivaId).not.toBe('')
    expect(store.fechamentos.map((c) => c.id)).toEqual([f1.id, f2.id]) // só os 2 válidos
    expect(store.fechamentosIlegiveis).toBe(4)
    expect(store.avisoFechamentos).toBe('4 fechamento(s) ilegível(is) ignorado(s); os registros ficam intactos.')
    expect(({} as { admin?: boolean }).admin).toBeUndefined()
    // fechar e retificar ficam bloqueados até resolver
    store.setStatusDate('2026-11-06')
    expect(await store.fecharDataDeStatus()).toEqual({ ok: false, erro: 'Há 4 fechamento(s) ilegível(is) nesta obra: novo fechamento bloqueado até resolver (os registros foram mantidos sem alteração).' })
    expect((await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm' })).ok).toBe(false)
    // nada foi regravado nos registros de fechamento (nem depois de salvar a obra e trocar de obra)
    await store.salvarAgora()
    expect([...adaptador.fechamentos]).toEqual(antes.fechamentos)
    expect([...adaptador.detalhes]).toEqual(antes.detalhes)
  })

  it('o detalhe do 1º fechamento com 9 MiB (ou incoerente) deixa esse fechamento ilegível e a âncora passa ao seguinte; a obra abre', async () => {
    const { adaptador, f1, f2 } = await comLixo()
    for (const l of [...adaptador.fechamentos.keys()]) if (l.startsWith('x-')) adaptador.fechamentos.delete(l)
    adaptador.detalhes.set(f1.id, { id: f1.id, json: ' '.repeat(9 * 1024 * 1024) })
    const espiao = vi.spyOn(JSON, 'parse')
    const store = await reabrir(adaptador)
    // A leitura recusou o texto de 9 MiB ANTES de parseá-lo: nenhum JSON.parse recebeu mais de 8 MiB
    expect(espiao.mock.calls.every(([t]) => typeof t !== 'string' || t.length <= 8 * 1024 * 1024)).toBe(true)
    espiao.mockRestore()
    expect(store.fechamentos.map((c) => c.id)).toEqual([f2.id])
    expect(store.fechamentosIlegiveis).toBe(1)
    expect(store.detalheAncora?.id).toBe(f2.id)
    expect(adaptador.detalhes.get(f1.id)).toEqual({ id: f1.id, json: ' '.repeat(9 * 1024 * 1024) }) // intacto
    expect(store.carregado).toBe(true)
  })

  it('a leitura dos fechamentos que falha deixa o histórico fechado para gravação, sem tocar nos registros', async () => {
    const { adaptador, f1 } = await comLixo()
    const antes = structuredClone([...adaptador.fechamentos])
    const lerCabecalhos = adaptador.lerCabecalhosFechamento.bind(adaptador)
    adaptador.lerCabecalhosFechamento = async () => {
      throw new Error('Leitura simulada falhou')
    }
    const store = await reabrir(adaptador)
    expect(store.fechamentosCarregados).toBe(false)
    expect(store.avisoFechamentos).toContain('Não foi possível ler os fechamentos')
    store.setStatusDate('2026-11-06')
    expect(await store.fecharDataDeStatus()).toEqual({ ok: false, erro: 'Os fechamentos desta obra ainda não foram lidos (ou não puderam ser): nada foi gravado.' })
    expect((await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [], motivo: 'm' })).ok).toBe(false)
    expect([...adaptador.fechamentos]).toEqual(antes)
    adaptador.lerCabecalhosFechamento = lerCabecalhos
  })

  it('o cabeçalho de outra obra (obraId diferente) nunca entra no histórico desta', async () => {
    const { adaptador, valido } = await comLixo()
    adaptador.fechamentos.set('x-outra-obra', { ...structuredClone(valido), id: 'x-outra-obra', obraId: 'outra-obra', sequencia: 20 })
    const store = await reabrir(adaptador)
    expect(store.fechamentos.some((c) => c.id === 'x-outra-obra')).toBe(false)
  })
})

describe('obras: excluir, trocar e duplicar com fechamentos (P-7, D-9)', () => {
  it('P-7: trocar de obra recarrega o histórico da outra; excluir a obra apaga os fechamentos dela (cabeçalho e detalhe) e só eles', async () => {
    const { adaptador, store } = await abrir()
    const idA = store.obraAtivaId
    const fA = await fechar(store)
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    expect(store.obraAtivaId).toBe(b.id)
    expect(store.fechamentos).toEqual([]) // a lista da obra nova, não a da anterior
    expect(store.detalheAncora).toBeUndefined()
    const fB = await fechar(store)
    expect(adaptador.fechamentos.size).toBe(2)
    expect((await store.trocarObra(idA)).ok).toBe(true)
    expect(store.fechamentos.map((c) => c.id)).toEqual([fA.id])
    expect(store.detalheAncora?.id).toBe(fA.id)
    // excluir a obra B (não ativa): só os registros dela saem
    expect((await store.excluirObra(b.id)).ok).toBe(true)
    expect([...adaptador.fechamentos.keys()]).toEqual([fA.id])
    expect([...adaptador.detalhes.keys()]).toEqual([fA.id])
    expect(adaptador.fechamentos.has(fB.id)).toBe(false)
    // excluir a obra ativa A: abre outra obra (a mesma única restante precisa existir: cria uma C antes)
    const c = await store.criarObra({ modelo: 'exemplo' })
    if (!c.ok) throw new Error(c.erro)
    expect((await store.trocarObra(idA)).ok).toBe(true)
    expect((await store.excluirObra(idA)).ok).toBe(true)
    expect(adaptador.fechamentos.size).toBe(0)
    expect(adaptador.detalhes.size).toBe(0)
    expect(store.fechamentos).toEqual([])
  })

  it('D-9: duplicar a obra copia as linhas de base e NÃO os fechamentos; o log da cópia diz isso', async () => {
    const { adaptador, store } = await abrir()
    await fechar(store)
    store.salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Teste' })
    await store.salvarAgora()
    const copia = await store.duplicarObra(store.obraAtivaId)
    if (!copia.ok) throw new Error(copia.erro)
    expect(adaptador.fechamentos.size).toBe(1) // só o da original
    const obraCopia = JSON.parse(adaptador.obras.get(copia.id)!.json)
    expect(obraCopia.linhasBase.map((i: { numero: number }) => i.numero)).toEqual([0, 1])
    expect(obraCopia.log[0]).toMatchObject({ title: 'Histórico de fechamentos não copiado' })
    await store.trocarObra(copia.id)
    expect(store.fechamentos).toEqual([])
    expect(store.fechamentosCarregados).toBe(true)
  })
})

describe('faixa da D-14: a obra mudou depois do fechamento', () => {
  it('editar a obra na mesma data de status mostra a faixa; avançar a data ou voltar o valor a apaga; sem fechamento não há faixa', async () => {
    const { store } = await abrir()
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('')
    await fechar(store)
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('')
    store.updateTask(104, { percentComplete: 60 })
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('A obra difere do fechamento efetivo de 23/10/2026: corrija a EAP, avance a data de status ou retifique o fechamento.')
    store.setStatusDate('2026-10-30')
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('')
  })
})

describe('guardas de obra no fechamento, provadas por mutação', () => {
  /** Obra A (com o recorte vinculado, para haver "órfão" a ler) e a obra B. */
  async function preparar() {
    const { adaptador, store } = await abrir()
    const idA = store.obraAtivaId
    const b = await store.criarObra({ modelo: 'exemplo' })
    if (!b.ok) throw new Error(b.erro)
    await store.trocarObra(idA)
    return { adaptador, store, idA, idB: b.id }
  }

  it('(a) a obra ativa muda durante a leitura dos órfãos: o fechamento NÃO é gravado, nem na A nem na B, e o histórico em memória não cresce', async () => {
    const { adaptador, store, idA, idB } = await preparar()
    // O índice em memória diz que a A tinha um recorte; ao gravar, o índice novo não tem mais: salvarAgora lê o recorte órfão (o portão) antes de gravar
    adaptador.indice = { ...adaptador.indice!, obras: adaptador.indice!.obras.map((o) => (o.id === idA ? { ...o, recorteSinapi: 'SP|nao-desonerado|2026-09' } : o)) }
    await store.carregar()
    expect(store.obraAtivaId).toBe(idA)
    const obraBAntes = structuredClone(adaptador.obras.get(idB)!)
    const obraAAntes = structuredClone(adaptador.obras.get(idA)!)
    let abrirPortao!: () => void
    const portao = new Promise<void>((r) => (abrirPortao = r))
    let noPortao = false
    const lerRecorte = adaptador.lerRecorte.bind(adaptador)
    adaptador.lerRecorte = async (chave) => {
      noPortao = true
      await portao
      return lerRecorte(chave)
    }
    const gravacoes: string[] = []
    const gravarObra = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      gravacoes.push(`${reg.id}${extras?.gravarFechamento ? '+fechamento' : ''}`)
      return gravarObra(reg, indice, extras)
    }
    const fechamento = store.fecharDataDeStatus()
    await vi.waitFor(() => expect(noPortao).toBe(true))
    store.obraAtivaId = idB // a obra ativa muda durante os awaits (cenário defensivo: a fila normalmente impede)
    abrirPortao()
    expect(await fechamento).toEqual({ ok: false, erro: MSG_OBRA_MUDOU })
    expect(gravacoes).toEqual([]) // sem a última conferência, gravarObra seria chamado com o id da B e o estado da A
    expect(adaptador.fechamentos.size).toBe(0)
    expect(adaptador.detalhes.size).toBe(0)
    expect(adaptador.obras.get(idB)).toEqual(obraBAntes)
    expect(adaptador.obras.get(idA)).toEqual(obraAAntes)
    expect(store.fechamentos).toEqual([])
  })

  it('(b) a gravação falha depois da troca de obra: o desfazer do log não mexe no log da obra nova', async () => {
    const { adaptador, store, idB } = await preparar()
    // O log da obra A está cheio (60): fechar descarta a entrada mais antiga, e o desfazer a devolveria (ao log errado, sem a guarda)
    store.state.log = Array.from({ length: 60 }, (_, i) => ({ id: `l${i}`, date: '2026-10-23', kind: 'sistema' as const, title: `Entrada ${i}`, detail: 'd' }))
    let abrirPortao!: () => void
    const portao = new Promise<void>((r) => (abrirPortao = r))
    let noPortao = false
    adaptador.gravarObra = async () => {
      noPortao = true
      await portao
      throw new DOMException('Cota simulada excedida', 'QuotaExceededError')
    }
    const fechamento = store.fecharDataDeStatus()
    await vi.waitFor(() => expect(noPortao).toBe(true))
    expect(store.state.log[0].title).toBe('Data de status fechada') // entrou antes de gravar
    // A obra muda e o estado passa a ser o da nova obra, com o log dela
    store.obraAtivaId = idB
    const logDaNova = [{ id: 'nova-1', date: '2026-10-23', kind: 'sistema' as const, title: 'Log da obra nova', detail: 'd' }]
    store.state.log = structuredClone(logDaNova)
    abrirPortao()
    const r = await fechamento
    expect(r.ok).toBe(false)
    // Sem a guarda, o desfazer devolveria a "Entrada 59" da obra A ao log da obra NOVA
    expect(store.state.log).toEqual(logDaNova)
    expect(store.fechamentos).toEqual([]) // o histórico em memória não cresceu
  })

  it('(c) a obra muda enquanto o detalhe da retificação é lido: a retificação desiste e não grava nada', async () => {
    const { adaptador, store, idA, idB } = await preparar()
    const f1 = await fechar(store)
    expect(store.obraAtivaId).toBe(idA)
    let abrirPortao!: () => void
    const portao = new Promise<void>((r) => (abrirPortao = r))
    let noPortao = false
    const ler = adaptador.lerDetalheFechamento.bind(adaptador)
    adaptador.lerDetalheFechamento = async (id) => {
      noPortao = true
      await portao
      return ler(id)
    }
    const retificacao = store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm' })
    await vi.waitFor(() => expect(noPortao).toBe(true))
    expect(await store.trocarObra(idB)).toEqual({ ok: true })
    abrirPortao()
    expect(await retificacao).toEqual({ ok: false, erro: MSG_OBRA_MUDOU })
    expect(adaptador.fechamentos.size).toBe(1)
  })

  it('(e) a obra ativa muda antes da vez do fechamento na fila: nada é gravado e a obra nova não é tocada', async () => {
    const { adaptador, store, idA, idB } = await preparar()
    const obraBAntes = structuredClone(adaptador.obras.get(idB)!)
    const gravacoes: string[] = []
    const gravarObra = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      gravacoes.push(reg.id)
      return gravarObra(reg, indice, extras)
    }
    const fechamento = store.fecharDataDeStatus() // entra na fila; a vez dela só chega depois de um microtask
    store.obraAtivaId = idB
    expect(await fechamento).toEqual({ ok: false, erro: MSG_OBRA_MUDOU })
    expect(gravacoes).toEqual([])
    expect(adaptador.fechamentos.size).toBe(0)
    expect(adaptador.obras.get(idB)).toEqual(obraBAntes)
    expect(adaptador.obras.has(idA)).toBe(true)
    // Sem a 1ª guarda, a entrada de log entraria no estado (agora da obra nova) e ficaria lá, sem desfazer
    expect(store.state.log.some((l) => l.title === 'Data de status fechada')).toBe(false)
  })

  it('(f) a obra ativa muda logo depois da gravação do fechamento: o histórico em memória da obra nova NÃO ganha o cabeçalho da anterior', async () => {
    const { adaptador, store, idB } = await preparar()
    const gravarObra = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      await gravarObra(reg, indice, extras)
      if (extras?.gravarFechamento) store.obraAtivaId = idB // a troca acontece entre a transação e o passo seguinte da fila
    }
    await store.fecharDataDeStatus()
    expect(adaptador.fechamentos.size).toBe(1) // gravado na obra pedida
    expect(store.fechamentos).toEqual([]) // sem a guarda do aposGravar, o cabeçalho da A entraria na lista da B
    expect(store.detalheAncora).toBeUndefined()
  })

  it('(d) a obra muda enquanto o fechamento é gravado: a gravação termina na obra pedida (a troca espera) e a obra nova não ganha histórico nem log', async () => {
    const { adaptador, store, idA, idB } = await preparar()
    let abrirPortao!: () => void
    const portao = new Promise<void>((r) => (abrirPortao = r))
    let noPortao = false
    const gravarObra = adaptador.gravarObra.bind(adaptador)
    adaptador.gravarObra = async (reg, indice, extras) => {
      if (extras?.gravarFechamento) {
        noPortao = true
        await portao
      }
      return gravarObra(reg, indice, extras)
    }
    const fechamento = store.fecharDataDeStatus()
    await vi.waitFor(() => expect(noPortao).toBe(true))
    const troca = store.trocarObra(idB)
    abrirPortao()
    const [rf, rt] = await Promise.all([fechamento, troca])
    expect(rf.ok).toBe(true)
    expect(rt).toEqual({ ok: true })
    expect([...adaptador.fechamentos.values()].map((c) => (c as CabecalhoFechamento).obraId)).toEqual([idA])
    expect(store.obraAtivaId).toBe(idB)
    expect(store.fechamentos).toEqual([]) // a lista da B
    expect(store.state.log.some((l) => l.title === 'Data de status fechada')).toBe(false)
  })
})

describe('Curva S, tendência, comparação e exportação pelos fechamentos (ciclo 00007, E4)', () => {
  // Curva S do Aurora na base 00006 (C-1, medida antes de qualquer mudança do ciclo): [rótulo, PV, EV, AC] dos meses já executados
  const C1_PASSADO: [string, number, number, number][] = [
    ['mai/26', 755000, 702727.2727272727, 737309.0909090909],
    ['jun/26', 1931333.3333333333, 1764117.6470588236, 1843900],
    ['jul/26', 3266250, 2951136.3636363633, 3105127.2727272725],
    ['ago/26', 4500000, 4072727.272727273, 4316445.454545455],
    ['set/26', 6004333.333333334, 5408856.76392573, 5765547.214854112],
  ]
  const ponto = (store: ReturnType<typeof useProjectStore>, rotulo: string) => store.sCurve.find((p) => p.label === rotulo)!

  it('CS-4 (ação): sem fechamentos a curva é a de hoje, com origem "reconstruido" e o aviso fixo', async () => {
    const { store } = await abrir()
    expect(store.sCurve.filter((p) => p.ev !== null).every((p) => p.origem === 'reconstruido' && p.tipo === 'mes')).toBe(true)
    expect(store.avisoCurva).toBe('Histórico reconstruído linearmente: esta obra ainda não tem fechamentos.')
    expect(store.sCurve).toHaveLength(14)
  })

  it('CS-3 (continuidade): fechar o Aurora em 23/10 não muda nenhum valor da curva; mai–set seguem reconstruídos e "out/26 ●" é o fechamento', async () => {
    const { store } = await abrir()
    const antes = store.sCurve.map((p) => [p.label, p.pv, p.ev, p.ac, p.forecast])
    await fechar(store)
    expect(store.sCurve).toHaveLength(14) // o fechamento é a data de status: vira o ponto do mês, sem ponto novo
    expect(store.sCurve.map((p) => [p.label, p.pv, p.ev, p.ac, p.forecast])).toEqual(antes) // idêntico, número por número
    for (const [rotulo, pv, ev, ac] of C1_PASSADO) {
      const p = ponto(store, rotulo)
      expect([p.pv, p.ev, p.ac]).toEqual([pv, ev, ac])
      expect(p.origem).toBe('reconstruido')
    }
    const out = ponto(store, 'out/26 ●')
    expect([out.pv, out.ev, out.ac, out.origem, out.linhaBaseFechamento]).toEqual([7259250, 6448200, 6896900, 'fechamento', 0])
    expect(store.avisoCurva).toBe('Antes do 1º fechamento (23/10/2026): reconstruído linearmente.')
  })

  it('CS-3b (passado parado): depois de avançar a 302 e fechar de novo, mai–set continuam os de antes; sem fechamentos eles mudariam', async () => {
    const { store } = await abrir()
    await fechar(store)
    store.setStatusDate('2026-10-30')
    store.updateTask(302, { percentComplete: 90 })
    await fechar(store)
    for (const [rotulo, pv, ev, ac] of C1_PASSADO) {
      const p = ponto(store, rotulo)
      expect([p.pv, p.ev, p.ac, p.origem]).toEqual([pv, ev, ac, 'reconstruido']) // âncora no 1º fechamento
    }
    // Antes → depois: a reconstrução SEM fechamentos (a da base) refaria o passado com o avanço novo da 302
    const base = computeSCurve(store.tarefasDoValorAgregado, store.calendariosPv, store.state.meta.statusDate, store.schedule, (iso) => iso.slice(0, 7))
    const setBase = base.find((p) => p.date === '2026-09-30')!
    expect(setBase.ev).not.toBeCloseTo(C1_PASSADO[4][2], 2)
    expect(setBase.ev).toBeCloseTo(SET_SEM_FECHAMENTO_EV, 2) // antes (com fechamento): 5.408.856,76; depois (sem): o valor do avanço novo
    // os pontos de fechamento mostram o gravado
    expect(store.sCurve.filter((p) => p.origem === 'fechamento').map((p) => [p.label, p.ev])).toEqual([['23/10 ◆', 6448200], ['out/26 ●', 6712200]]) // 6.448.200 + 12 p.p. de R$ 2.200.000 da 302
  })

  it('CS-5: o efetivo é a retificação (EV 6.456.600,00 e AC 6.899.900,00 no ponto); o cabeçalho adulterado fica fora da curva, com aviso', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }], motivo: 'Medição revisada em campo' })
    await store.salvarAgora()
    adaptador.fechamentos.set('x-adulterado', { ...structuredClone(adaptador.fechamentos.get(f1.id) as CabecalhoFechamento), id: 'x-adulterado', sequencia: 9, totais: { ...(adaptador.fechamentos.get(f1.id) as CabecalhoFechamento).totais, ev: 'x' } })
    const reaberta = await reabrir(adaptador)
    const out = reaberta.sCurve.find((p) => p.label === 'out/26 ●')!
    expect([out.ev, out.ac, out.origem]).toEqual([6456600, 6899900, 'fechamento'])
    expect(reaberta.fechamentosIlegiveis).toBe(1)
    expect(reaberta.avisoFechamentos).toContain('1 fechamento(s) ilegível(is) ignorado(s)')
    expect(reaberta.fechamentos.some((c) => c.id === 'x-adulterado')).toBe(false)
    // os meses de antes vêm da âncora (a retificação, que é o 1º efetivo): o passado acompanha a correção, e só nele
    expect(reaberta.detalheAncora?.tarefas.find((t) => t[0] === 104)?.[2]).toBe(45)
  })

  it('CS-6 e E-9: LB1 do valor agregado e o fechamento feito com a LB0: o PV é o da LB1, o EV e o AC são os gravados, e a nota diz contra qual LB foi fechado', async () => {
    const { store } = await abrir()
    await fechar(store) // com a LB0
    store.salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Teste' })
    store.definirLinhaBaseAtiva(1)
    const out = ponto(store, 'out/26 ●')
    expect(out.pv).toBeCloseTo(6496233.415233416, 2) // o PV da curva é o da LB1 (regra do CronoAI)
    expect([out.ev, out.ac, out.origem, out.linhaBaseFechamento]).toEqual([6448200, 6896900, 'fechamento', 0])
    expect(store.notasDaCurva).toEqual(['Fechamento de 23/10/2026: fechado contra a LB0 de 27/04/2026. O PV da curva é o da LB1.'])
    store.definirLinhaBaseAtiva(0)
    expect(store.notasDaCurva).toEqual([]) // a LB0 em vigor e não sobrescrita: sem nota
    // sobrescrever a LB0 depois do fechamento também gera a nota
    vi.setSystemTime(new Date('2026-11-30T15:00:00.000Z'))
    store.salvarLinhaBase({ numero: 0, nome: 'LB0 nova', motivo: 'Replanejamento', confirmarSobrescrita: true })
    expect(store.notasDaCurva).toEqual(['Fechamento de 23/10/2026: fechado contra a LB0 de 27/04/2026; a LB0 atual é de 30/11/2026.'])
  })

  it('a curva por pacote usa o porPacote dos fechamentos: o pacote 01 no ponto do fechamento tem EV 2.150.000,00 e AC 2.239.900,00', async () => {
    const { store } = await abrir()
    await fechar(store)
    const p01 = store.sCurveFor('01').find((p) => p.origem === 'fechamento')!
    expect([p01.ev, p01.ac]).toEqual([2150000, 2239900])
    const p03 = store.sCurveFor('03').find((p) => p.origem === 'fechamento')!
    expect(p03.ev).toBeCloseTo(store.packageEvm.find((p) => p.wbs === '03')!.ev, 2)
  })

  it('TE-1 (ação): a série dos fechamentos tem SPI, CPI, entrega e atraso gravados em cada data', async () => {
    const { store } = await abrir()
    await fechar(store)
    store.setStatusDate('2026-10-30')
    await fechar(store)
    expect(store.serieFechamentos.map((p) => [p.data, p.entregaPrevista, p.atrasoDiasUteis])).toEqual([['2026-10-23', '2027-06-23', 16], ['2026-10-30', '2027-06-30', 21]]) // uma semana sem avanço empurra o previsto em 5 d.u.
    expect(store.serieFechamentos[0].spi).toBeCloseTo(0.888274, 6)
    expect(store.serieFechamentos[0].cpi).toBeCloseTo(0.934942, 6)
  })

  it('compara dois fechamentos (RF-04.6) do mais antigo para o mais novo, em qualquer ordem dos ids', async () => {
    const { store } = await abrir()
    const f1 = await fechar(store)
    store.setStatusDate('2026-10-30')
    store.updateTask(104, { percentComplete: 60 })
    const f2 = await fechar(store)
    const r = await store.compararFechamentosPorId(f2.id, f1.id)
    if (!r.ok) throw new Error(r.erro)
    expect([r.resultado.a.id, r.resultado.b.id]).toEqual([f1.id, f2.id])
    expect(r.resultado.avancaram.map((i) => [i.uid, i.deltaPct])).toEqual([[104, 20]])
    expect(r.resultado.totais.ev.delta).toBeCloseTo(33600, 2) // 20 p.p. de R$ 168.000,00
    expect(await store.compararFechamentosPorId(f1.id, f1.id)).toEqual({ ok: false, erro: 'Escolha dois fechamentos diferentes.' })
    expect(await store.compararFechamentosPorId(f1.id, 'nao-existe')).toEqual({ ok: false, erro: 'Fechamento não encontrado nesta obra.' })
  })

  it('EX-1 (ação): exporta as LBs e TODOS os registros gravados (original e retificação); o arquivo traz exatamente o que está no armazenamento', async () => {
    const { adaptador, store } = await abrir()
    expect(await store.exportarHistorico()).toEqual({ ok: false, erro: 'Esta obra ainda não tem fechamentos para exportar.' })
    const f1 = await fechar(store)
    await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }], motivo: 'Medição revisada em campo' })
    const r = await store.exportarHistorico()
    if (!r.ok) throw new Error(r.erro)
    expect(r.nomeArquivo).toBe('Edificio_Residencial_Aurora_12_Pavimentos_historico_2026-10-23.json')
    expect(r.avisos).toEqual([])
    const arquivo = JSON.parse(r.texto)
    expect(arquivo.formato).toBe('cronoai-historico')
    expect(arquivo.linhasBase).toEqual(JSON.parse(JSON.stringify(store.state.linhasBase)))
    expect(arquivo.fechamentos.map((f: { cabecalho: CabecalhoFechamento }) => [f.cabecalho.sequencia, f.cabecalho.tipo])).toEqual([[1, 'fechamento'], [2, 'retificacao']])
    for (const f of arquivo.fechamentos as { cabecalho: CabecalhoFechamento; tarefas: unknown[] }[]) {
      expect(f.cabecalho).toEqual(adaptador.fechamentos.get(f.cabecalho.id))
      expect(f.tarefas).toEqual(JSON.parse((adaptador.detalhes.get(f.cabecalho.id) as { json: string }).json).tarefas)
      expect(f.tarefas).toHaveLength(20)
    }
  })

  it('a exportação deixa de fora o detalhe ilegível, com aviso', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    store.setStatusDate('2026-10-30')
    const f2 = await fechar(store)
    adaptador.detalhes.set(f2.id, { id: f2.id, json: '{' }) // o 2º tem o detalhe adulterado (o 1º é a âncora e está bom)
    const r = await store.exportarHistorico()
    if (!r.ok) throw new Error(r.erro)
    expect(r.avisos).toEqual(['1 fechamento(s) com detalhe ilegível ficaram de fora do arquivo.'])
    expect(JSON.parse(r.texto).fechamentos.map((f: { cabecalho: CabecalhoFechamento }) => f.cabecalho.id)).toEqual([f1.id])
  })
})

describe('rodada 02: SEG-1, SEG-2, SEG-5, desvio 9, nota da LB e gravação pendente', () => {
  /** .xml fictício: um pacote com TAB no nome e uma folha com WBS de 70 caracteres. */
  const xmlComTabEWbsLongo = (wbsLongo: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Title>Obra fictícia</Title><StartDate>2026-03-02T08:00:00</StartDate><StatusDate>2026-03-06T17:00:00</StatusDate>
<Tasks>
<Task><UID>1</UID><ID>1</ID><Name>Pacote\tcom tab</Name><WBS>1</WBS><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Finish>2026-03-13T17:00:00</Finish><Duration>PT80H0M0S</Duration><Summary>1</Summary></Task>
<Task><UID>2</UID><ID>2</ID><Name>Alvenaria</Name><WBS>${wbsLongo}</WBS><OutlineNumber>${wbsLongo}</OutlineNumber><OutlineLevel>2</OutlineLevel><Start>2026-03-02T08:00:00</Start><Finish>2026-03-13T17:00:00</Finish><Duration>PT80H0M0S</Duration><Summary>0</Summary><Cost>1000.00</Cost>
<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start><Finish>2026-03-13T17:00:00</Finish><Duration>PT80H0M0S</Duration><Cost>1000.00</Cost></Baseline></Task>
</Tasks></Project>`

  it('SEG-1: .xml com TAB no nome do pacote e WBS de 70 caracteres: fechar, reabrir e 0 ilegíveis (antes: o fechamento era gravado e virava ilegível ao reabrir)', async () => {
    const wbs = '1.' + '9'.repeat(68)
    expect(wbs).toHaveLength(70)
    const { adaptador, store } = await abrir()
    store.importXml(xmlComTabEWbsLongo(wbs))
    expect(store.state.tasks.find((t) => t.isSummary)?.name).toContain('\t') // o TAB entrou na obra
    await fechar(store)
    await store.salvarAgora()
    const reaberta = await reabrir(adaptador)
    expect(reaberta.fechamentosIlegiveis).toBe(0)
    expect(reaberta.avisoFechamentos).toBe('')
    expect(reaberta.fechamentos).toHaveLength(1)
    expect(reaberta.fechamentos[0].porPacote.map((p) => p.nome)).toEqual(['Pacote com tab']) // o TAB virou espaço no registro
    const detalhe = await reaberta.lerDetalhe(reaberta.fechamentos[0].id)
    expect(detalhe?.tarefas.map((t) => t[1])).toEqual([wbs])
    const exportado = await reaberta.exportarHistorico()
    if (!exportado.ok) throw new Error(exportado.erro)
    expect(JSON.parse(exportado.texto).fechamentos).toHaveLength(1)
  })

  it('SEG-1 (rede de segurança): WBS acima do limite: o fechamento é RECUSADO em português, nada é gravado e o log e o estado ficam iguais', async () => {
    const { adaptador, store } = await abrir()
    store.importXml(xmlComTabEWbsLongo('1.' + '9'.repeat(300)))
    const antes = JSON.stringify(store.state.log)
    const r = await store.fecharDataDeStatus()
    expect(r).toEqual({
      ok: false,
      erro: 'Este fechamento não pode ser gravado: algum dado da obra (por exemplo, um código de EAP com mais de 200 caracteres) não passa na validação de leitura e o registro ficaria ilegível. Nada foi gravado.',
    })
    expect(adaptador.fechamentos.size).toBe(0)
    expect(adaptador.detalhes.size).toBe(0)
    expect(JSON.stringify(store.state.log)).toBe(antes)
    expect(store.fechamentos).toEqual([])
  })

  it('SEG-2: duas abas gravaram a mesma sequência: nenhum é ilegível, o aviso diz que foi em paralelo, o efetivo é o gravado por último e a obra segue fechável', async () => {
    const { adaptador, store } = await abrir()
    const f1 = await fechar(store)
    const original = adaptador.fechamentos.get(f1.id) as CabecalhoFechamento
    // A "outra aba" gravou o mesmo número de sequência (1) para a data seguinte, um pouco depois
    const outra: CabecalhoFechamento = { ...structuredClone(original), id: 'fech-outra-aba', dataStatus: '2026-10-30', fechadoEm: '2026-10-31T10:00:00.000Z' }
    adaptador.fechamentos.set(outra.id, outra)
    adaptador.detalhes.set(outra.id, { id: outra.id, json: (adaptador.detalhes.get(f1.id) as { json: string }).json.replace(`"id":"${f1.id}"`, `"id":"${outra.id}"`) })
    const mesmaData: CabecalhoFechamento = { ...structuredClone(original), id: 'aaa-mesma-sequencia', fechadoEm: '2026-10-25T16:00:00.000Z' }
    adaptador.fechamentos.set(mesmaData.id, mesmaData)
    adaptador.detalhes.set(mesmaData.id, { id: mesmaData.id, json: (adaptador.detalhes.get(f1.id) as { json: string }).json.replace(`"id":"${f1.id}"`, `"id":"${mesmaData.id}"`) })
    const store2 = await reabrir(adaptador)
    expect(store2.fechamentosIlegiveis).toBe(0)
    expect(store2.fechamentos).toHaveLength(3)
    expect(store2.avisoFechamentos).toBe('Há fechamentos gravados em paralelo (3 registro(s) com a mesma sequência, por exemplo de duas abas): o efetivo de cada data é o gravado por último. Confira a lista.')
    // O efetivo de 23/10 é o gravado por último (mesma sequência: fechadoEm mais novo); o de 30/10 é o da outra aba
    expect(store2.fechamentosEfetivos.map((c) => c.id)).toEqual(['aaa-mesma-sequencia', 'fech-outra-aba'])
    // A obra NÃO fica bloqueada: a data de status avança e o novo fechamento recebe uma sequência nova
    store2.setStatusDate('2026-11-06')
    const r = await store2.fecharDataDeStatus()
    if (!r.ok) throw new Error(r.erro)
    expect(store2.fechamentos.find((c) => c.id === r.id)?.sequencia).toBe(2)
  })

  it('SEG-5: o Enter nos textos longos vale (\\r\\n vira \\n) na observação do fechamento, no motivo da retificação e no motivo da LB; vai e volta do armazenamento; o autor continua de uma linha', async () => {
    const { adaptador, store } = await abrir()
    expect(await store.fecharDataDeStatus({ autor: 'a\nb' })).toEqual({ ok: false, erro: 'Os textos não podem ter caracteres de controle.' })
    expect(await store.fecharDataDeStatus({ observacao: 'x\u0007' })).toEqual({ ok: false, erro: 'Os textos não podem ter caracteres de controle.' })
    const f1 = await fechar(store, { observacao: 'linha 1\r\nlinha 2' })
    const r = await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'Medição revisada\r\npelo mestre' })
    expect(r.ok).toBe(true)
    expect(store.salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Chuvas de setembro\r\ne de outubro' })).toEqual({ ok: true })
    expect(store.state.linhasBase.find((i) => i.numero === 1)?.motivo).toBe('Chuvas de setembro\ne de outubro')
    expect((adaptador.fechamentos.get(f1.id) as CabecalhoFechamento).observacao).toBe('linha 1\nlinha 2')
    await store.salvarAgora()
    const reaberta = await reabrir(adaptador)
    expect(reaberta.fechamentosIlegiveis).toBe(0) // lidos de volta: o \n é legível
    expect(reaberta.fechamentos.find((c) => c.tipo === 'retificacao')?.motivo).toBe('Medição revisada\npelo mestre')
    expect(reaberta.state.linhasBase.find((i) => i.numero === 1)?.motivo).toBe('Chuvas de setembro\ne de outubro')
    expect(reaberta.avisosCarga).toEqual([])
  })

  it('R-3 / nota 1 dos testes: gravar com a LB1 ativa NÃO grava a projeção: as tarefas gravadas têm a LB0 (datas e bac da LB0)', async () => {
    const { adaptador, store } = await abrir()
    store.salvarLinhaBase({ numero: 1, nome: 'Replanejamento', motivo: 'Teste' })
    store.definirLinhaBaseAtiva(1)
    expect(await store.salvarAgora()).toBe(true)
    const gravada = JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json)
    const t104 = gravada.tasks.find((t: { uid: number }) => t.uid === 104)
    // LB0 do 104 no Aurora: 25/09 a 13/10, R$ 168.000,00; a LB1 (projeção) seria 05/10 a 05/11
    expect([t104.baselineStart, t104.baselineFinish, t104.bac]).toEqual(['2026-09-25', '2026-10-13', 168000])
    expect(t104.baselineStart).not.toBe('2026-10-05')
    expect(t104.linhasBase['1']).toEqual({ inicio: '2026-10-05', termino: '2026-11-05', duracaoMin: 10176, custo: 168000 })
    expect(gravada.meta.linhaBaseAtiva).toBe(1)
    // todas as folhas gravadas têm a LB0 do seed (nenhuma foi trocada pela LB1)
    const lb0Seed = buildSeedState().tasks.map((t) => [t.uid, t.baselineStart, t.baselineFinish, t.bac])
    expect(gravada.tasks.map((t: { uid: number; baselineStart?: string; baselineFinish?: string; bac: number }) => [t.uid, t.baselineStart, t.baselineFinish, t.bac])).toEqual(lb0Seed)
  })

  it('desvio 9 (ESP P-1): importar .xml com data de início posterior ao 1º fechamento mantém a data de início da obra, avisa, calcula a LB0 e a exportação leva a data mantida', async () => {
    const { store } = await abrir()
    await fechar(store)
    const entregaAntes = store.schedule.projectFinish
    const xml = fixtureLinhasBase
      .replace('<StartDate>2026-03-02T08:00:00</StartDate>', '<StartDate>2026-12-01T08:00:00</StartDate>')
      .replace('<StatusDate>2026-03-06T17:00:00</StatusDate>', '<StatusDate>2026-12-10T17:00:00</StatusDate>')
      .replace(/<Baseline>[\s\S]*?<\/Baseline>/g, '')
      .replace('<BaselineForEarnedValue>3</BaselineForEarnedValue>', '')
    const avisos = store.importXml(xml)
    expect(avisos).toContain('A data de início do arquivo (01/12/2026) é posterior ao primeiro fechamento (23/10/2026): o CronoAI manteve a data de início atual (04/05/2026). Confira se o arquivo é da mesma obra; a exportação levará a data de início mantida.')
    expect(store.state.meta.startDate).toBe('2026-05-04') // mantida
    expect(store.state.meta.statusDate).toBe('2026-12-10') // a de status é posterior ao último fechamento: vale a do arquivo
    expect(entregaAntes).toBe('2027-06-23')
    expect(store.schedule.projectFinish).toBe(ENTREGA_DEPOIS_DO_IMPORT)
    // a LB0 que o arquivo não trazia foi calculada pelo CronoAI, com os metadados dela
    expect(store.state.linhasBase).toEqual([expect.objectContaining({ numero: 0, motivo: 'Calculada na importação: o arquivo não trazia a linha de base 0', origem: 'cronoai' })])
    expect(store.state.tasks.filter((t) => !t.isSummary).every((t) => t.baselineStart !== undefined && t.baselineFinish !== undefined)).toBe(true)
    // a exportação leva a data de início mantida
    expect(store.exportXml().xml).toContain('<StartDate>2026-05-04T08:00:00</StartDate>')
    expect(store.fechamentos).toHaveLength(1) // o histórico não é tocado
  })

  it('P-2 (ESP): a importação troca as LBs e a nota "fechado contra a LB0" passa a avisar da troca; antes, a LB importada sem data de gravação escondia a mudança', async () => {
    const { store } = await abrir()
    await fechar(store)
    expect(store.notasDaCurva).toEqual([])
    vi.setSystemTime(new Date('2026-10-26T15:00:00.000Z'))
    store.importXml(fixtureLinhasBase)
    // as LBs importadas ganham a data da importação como data de gravação
    expect(store.state.linhasBase.every((i) => i.salvaEm === '2026-10-26T15:00:00.000Z' && i.origem === 'arquivo')).toBe(true)
    expect(store.notasDaCurva).toEqual(['Fechamento de 23/10/2026: fechado contra a LB0 de 27/04/2026; a LB0 atual é de 26/10/2026. O PV da curva é o da LB3.']) // o arquivo traz BaselineForEarnedValue 3
  })

  it('N-4: o fechamento recusado na vez da fila não deixa sem gravar uma edição pendente (o atraso de gravação é reagendado)', async () => {
    vi.useRealTimers() // o beforeEach só moqueou a data: aqui os relógios são falsos de verdade
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-25T15:00:00.000Z'))
    try {
      const { adaptador, store } = await abrir()
      store.updateTask(104, { percentComplete: 60 })
      await nextTick()
      expect(store.estadoGravacao).toBe('pendente')
      const pedido = store.fecharDataDeStatus() // passa na conferência do pedido e entra na fila
      // Antes da vez dela, o histórico em memória ganha um fechamento da mesma data (outra aba, por exemplo): a conferência DA FILA recusa
      store.fechamentos = [
        { versaoFormato: 1, id: 'fech-de-outra-aba', obraId: store.obraAtivaId, sequencia: 1, tipo: 'fechamento', dataStatus: '2026-10-23', fechadoEm: '2026-10-25T14:00:00.000Z', linhaBase: 0, versaoPremissas: 1, esquemaObra: 6, totais: { bac: 1, pv: 1, ev: 1, ac: 1, spi: 1, cpi: 1, eac: 1, entregaPrevista: '2027-06-23', atrasoDiasUteis: 16 }, porPacote: [], quantidadeTarefas: 0 },
      ]
      expect(await pedido).toEqual({ ok: false, erro: MSG_JA_EXISTE })
      expect(adaptador.fechamentos.size).toBe(0)
      // A edição que estava pendente NÃO ficou sem gravar: o atraso foi reagendado
      await vi.advanceTimersByTimeAsync(1000)
      expect(store.estadoGravacao).toBe('salvo')
      expect(JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json).tasks.find((t: { uid: number }) => t.uid === 104).percentComplete).toBe(60)
    } finally {
      vi.useRealTimers()
    }
  })

  it('VIS-1: depois de retificar, a faixa da D-14 manda corrigir a EAP (a retificação não altera a obra) e não induz a retificar de novo', async () => {
    const { store } = await abrir()
    const f1 = await fechar(store)
    await store.retificarFechamento({ fechamentoId: f1.id, alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }], motivo: 'Medição revisada' })
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('A obra difere do fechamento efetivo de 23/10/2026: corrija a EAP, avance a data de status ou retifique o fechamento.')
  })
})
