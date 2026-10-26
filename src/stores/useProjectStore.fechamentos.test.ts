// Fechamento da data de status e retificação na store (ciclo 00007, E3): gravação atômica na fila, imutabilidade, regras da data de status,
// leitura adulterada do IndexedDB, guardas de obra (provadas por mutação) e a troca de obra. Números do Aurora conferidos à mão no plano.
import { isProxy } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { CabecalhoFechamento } from '@/types/fechamento'
import fixtureLinhasBase from '@/lib/__fixtures__/mspdi-linhas-base.xml?raw'
import { useUiStore } from './ui'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from './armazenamentoObras'
import { useProjectStore } from './useProjectStore'

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
      { ...structuredClone(valido), id: 'x-seq-repetida', sequencia: 2 },
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
    expect(store.fechamentosIlegiveis).toBe(5)
    expect(store.avisoFechamentos).toBe('5 fechamento(s) ilegível(is) ignorado(s); os registros ficam intactos.')
    expect(({} as { admin?: boolean }).admin).toBeUndefined()
    // fechar e retificar ficam bloqueados até resolver
    store.setStatusDate('2026-11-06')
    expect(await store.fecharDataDeStatus()).toEqual({ ok: false, erro: 'Há 5 fechamento(s) ilegível(is) nesta obra: novo fechamento bloqueado até resolver (os registros foram mantidos sem alteração).' })
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
    expect(store.avisoObraMudouDepoisDoFechamento).toBe('A obra mudou depois do fechamento de 23/10/2026: avance a data de status ou retifique o fechamento.')
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
