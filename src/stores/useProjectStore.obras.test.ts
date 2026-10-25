import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import aurora from '@/lib/__fixtures__/estado-v1-aurora.json?raw'
import aurora75 from '@/lib/__fixtures__/estado-v1-aurora-75.json?raw'
import type { DadosObra } from '@/lib/obras'
import { criarArmazenamentoMemoria, usarArmazenamento, type ArmazenamentoMemoria } from './armazenamentoObras'
import { useProjectStore } from './useProjectStore'

const NOME_AURORA = 'Edifício Residencial Aurora - 12 Pavimentos'

const recife: DadosObra = {
  nome: 'Residencial Recife (exemplo fictício)',
  uf: 'PE',
  municipio: 'Recife',
  dataInicio: '2026-11-03',
  dataStatus: '2026-11-03',
}

async function carregarCom(v1: string | null) {
  const adaptador = criarArmazenamentoMemoria(v1)
  const store = await recarregar(adaptador)
  return { adaptador, store }
}

/** Nova pinia (= nova abertura do app) sobre o mesmo armazenamento. */
async function recarregar(adaptador: ArmazenamentoMemoria) {
  usarArmazenamento(adaptador)
  setActivePinia(createPinia())
  const store = useProjectStore()
  await store.carregar()
  return store
}

const estadoDe = (s: ReturnType<typeof useProjectStore>): unknown => JSON.parse(JSON.stringify(s.state))

describe('useProjectStore · multiobra', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    globalThis.localStorage?.clear?.() // Node 26 pode expor localStorage indefinido
    usarArmazenamento(undefined)
    setActivePinia(createPinia())
  })

  describe('migração da v1', () => {
    it('N-4: migra o Aurora salvo na v1 sem mudar nenhum número', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      expect(store.obras).toHaveLength(1)
      expect(store.obras[0].nome).toBe(NOME_AURORA)
      expect(store.obraAtivaId).toBe(store.obras[0].id)
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.delay.delayDays).toBe(16)
      expect(store.evm.spi).toBeCloseTo(0.8883, 4)
      expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
      expect(store.state.tasks).toHaveLength(29)
      expect(store.state.tasks.filter((t) => !t.isSummary)).toHaveLength(20)
      expect(estadoDe(store)).toEqual(JSON.parse(aurora))
      expect(store.migracaoV1?.resultado).toBe('migrado')
      expect(store.avisosCarga).toEqual([])
      expect(store.estadoGravacao).toBe('salvo')
      // gravada como a mesma string da v1 e com a v1 intocada
      expect(adaptador.obras.get(store.obraAtivaId)?.json).toBe(aurora)
      expect(adaptador.v1).toBe(aurora)
      expect(adaptador.indice?.migracaoV1?.resultado).toBe('migrado')
    })

    it('N-5: migra a v1 com apontamento aprovado (16/06/27, +11 d.u., UID 104 em 75%)', async () => {
      const { store } = await carregarCom(aurora75)
      expect(store.schedule.projectFinish).toBe('2027-06-16')
      expect(store.delay.delayDays).toBe(11)
      expect(store.taskByUid.get(104)?.percentComplete).toBe(75)
    })

    it('a obra migrada não tem UF (nunca assume um estado)', async () => {
      const { store } = await carregarCom(aurora)
      expect(store.state.meta.uf).toBeUndefined()
      expect(store.obras[0].uf).toBeUndefined()
    })

    it('M-2: v1 parcial ganha listas vazias, 1 aviso e os mesmos números', async () => {
      const { budget: _b, undo: _u, log: _l, ...parcial } = JSON.parse(aurora)
      const { store } = await carregarCom(JSON.stringify(parcial))
      expect(store.state.budget).toEqual([])
      expect(store.state.undo).toEqual([])
      expect(store.state.log).toEqual([])
      expect(store.avisosCarga).toHaveLength(1)
      expect(store.avisosCarga[0]).toContain('log, undo, budget')
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.delay.delayDays).toBe(16)
    })

    it('M-3: v1 corrompida abre a obra de exemplo, avisa só na 1ª carga e não toca a v1', async () => {
      for (const ruim of ['{', '{"tasks":[]}', '{"tasks":[{}]}']) {
        const { adaptador, store } = await carregarCom(ruim)
        expect(store.state.meta.name).toBe(NOME_AURORA)
        expect(store.schedule.projectFinish).toBe('2027-06-23')
        expect(store.avisosCarga).toEqual([
          'O estado salvo da versão anterior não pôde ser lido. Ele foi mantido no navegador sem alteração e a obra de exemplo foi aberta.',
        ])
        expect(store.migracaoV1?.resultado).toBe('ilegivel')
        expect(adaptador.v1).toBe(ruim)
        const segunda = await recarregar(adaptador)
        expect(segunda.avisosCarga).toEqual([])
        expect(segunda.obras).toHaveLength(1)
        expect(adaptador.v1).toBe(ruim)
      }
    })

    it('sem v1 e sem índice (1º acesso), abre a obra de exemplo e a grava', async () => {
      const { adaptador, store } = await carregarCom(null)
      expect(store.obras).toHaveLength(1)
      expect(store.avisosCarga).toEqual([])
      expect(store.migracaoV1).toBeUndefined()
      expect(adaptador.obras.size).toBe(1)
      expect(store.schedule.projectFinish).toBe('2027-06-23')
    })

    it('M-4: cota cheia na migração mantém a obra em memória, não grava o índice e tenta de novo na próxima carga', async () => {
      const adaptador = criarArmazenamentoMemoria(aurora)
      adaptador.falhar.gravar = true
      const store = await recarregar(adaptador)
      expect(store.estadoGravacao).toBe('erro')
      expect(store.mensagemGravacao).toBe('O armazenamento do navegador está cheio.')
      expect(adaptador.indice).toBeUndefined()
      expect(adaptador.obras.size).toBe(0)
      expect(adaptador.v1).toBe(aurora)
      expect(store.schedule.projectFinish).toBe('2027-06-23')

      adaptador.falhar.gravar = false
      const nova = await recarregar(adaptador)
      expect(nova.obras).toHaveLength(1)
      expect(nova.estadoGravacao).toBe('salvo')
      expect(nova.schedule.projectFinish).toBe('2027-06-23')
      expect(nova.delay.delayDays).toBe(16)
      expect(adaptador.indice?.migracaoV1?.resultado).toBe('migrado')
    })

    it('M-5: obra excluída depois da migração não volta, mesmo com a v1 ainda salva', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idAurora = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      expect(b.ok).toBe(true)
      expect(await store.excluirObra(idAurora)).toEqual({ ok: true })
      const nova = await recarregar(adaptador)
      expect(nova.obras).toHaveLength(1)
      expect(nova.state.meta.name).toBe(recife.nome)
      expect(adaptador.v1).toBe(aurora)
    })

    it('M-6: obra ilegível no índice aparece marcada, as demais abrem e nada é gravado por cima', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idAurora = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      // A obra ativa (B) fica ilegível: esquema mais novo que o do app
      const registro = adaptador.obras.get(b.id)!
      adaptador.obras.set(b.id, { ...registro, versaoEsquema: 99 })
      const nova = await recarregar(adaptador)
      expect(nova.obraAtivaId).toBe(idAurora)
      expect(nova.state.meta.name).toBe(NOME_AURORA)
      expect(nova.obras.find((o) => o.id === b.id)?.ilegivel).toBe(true)
      expect(nova.obras.find((o) => o.id === idAurora)?.ilegivel).toBeUndefined()
      expect(adaptador.obras.get(b.id)?.versaoEsquema).toBe(99)
      expect(adaptador.obras.get(b.id)?.json).toBe(registro.json)
      const troca = await nova.trocarObra(b.id)
      expect(troca).toEqual({ ok: false, erro: 'Obra salva por uma versão mais nova do CronoAI (esquema 99).' })
      expect(nova.obraAtivaId).toBe(idAurora)
    })

    it('M-6: registro ausente também vira ilegível', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      adaptador.obras.delete(b.id)
      const nova = await recarregar(adaptador)
      expect(nova.obras.find((o) => o.id === b.id)?.ilegivel).toBe(true)
      expect(nova.state.meta.name).toBe(NOME_AURORA)
    })

    it('M-6: sem nenhuma obra legível, abre a obra de exemplo como nova e mantém as ilegíveis', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const antiga = store.obraAtivaId
      const registro = adaptador.obras.get(antiga)!
      adaptador.obras.set(antiga, { ...registro, json: '{' })
      const nova = await recarregar(adaptador)
      expect(nova.obras).toHaveLength(2)
      expect(nova.obraAtivaId).not.toBe(antiga)
      expect(nova.obras.find((o) => o.id === antiga)?.ilegivel).toBe(true)
      expect(adaptador.obras.get(antiga)?.json).toBe('{')
      expect(nova.avisosCarga[0]).toContain('Nenhuma obra salva pôde ser lida')
    })

    it('M-7: sem IndexedDB, usa a memória e avisa de forma persistente', async () => {
      usarArmazenamento(undefined) // o jsdom não tem indexedDB
      setActivePinia(createPinia())
      const store = useProjectStore()
      await store.carregar()
      expect(store.armazenamentoIndisponivel).toBe(true)
      expect(store.estadoGravacao).toBe('erro')
      expect(store.avisosCarga).toContain('Armazenamento local indisponível: as alterações desta sessão não serão salvas.')
      await store.salvarAgora()
      expect(store.estadoGravacao).toBe('erro')
    })

    it('falha ao ler o índice não derruba a carga nem sobrescreve o que está salvo', async () => {
      const adaptador = criarArmazenamentoMemoria(aurora)
      adaptador.falhar.ler = true
      const store = await recarregar(adaptador)
      expect(store.avisosCarga[0]).toContain('Não foi possível ler as obras salvas')
      expect(adaptador.v1).toBe(aurora)
    })
  })

  describe('gravação', () => {
    it('antes de carregar, a gravação está desligada (não grava a obra de exemplo por cima)', async () => {
      const adaptador = criarArmazenamentoMemoria(aurora)
      usarArmazenamento(adaptador)
      setActivePinia(createPinia())
      const store = useProjectStore()
      store.state.meta.name = 'Alterado antes de carregar'
      expect(await store.salvarAgora()).toBe(true) // sem obra ativa, não há o que gravar
      expect(adaptador.obras.size).toBe(0)
      expect(store.estadoGravacao).toBe('salvo')
    })

    it('uma alteração fica "pendente" e salvar grava a obra ativa e atualiza o índice', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      store.approveReport('r-tiao', 104, 75, [])
      await nextTick() // o observador do estado roda aqui
      expect(store.estadoGravacao).toBe('pendente')
      expect(await store.salvarAgora()).toBe(true)
      expect(store.estadoGravacao).toBe('salvo')
      const salvo = JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json)
      expect(salvo.tasks.find((t: { uid: number }) => t.uid === 104).percentComplete).toBe(75)
    })

    it('falha de gravação fica visível e a próxima tentativa recupera', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      adaptador.falhar.gravar = true
      store.updateTask(104, { percentComplete: 60 })
      expect(await store.salvarAgora()).toBe(false)
      expect(store.estadoGravacao).toBe('erro')
      expect(store.mensagemGravacao).toBe('O armazenamento do navegador está cheio.')
      adaptador.falhar.gravar = false
      expect(await store.salvarAgora()).toBe(true)
      expect(store.estadoGravacao).toBe('salvo')
      expect(store.mensagemGravacao).toBe('')
    })

    it('erro que não é de cota usa a mensagem genérica', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      adaptador.gravarObra = async () => {
        throw new Error('x')
      }
      store.updateTask(104, { percentComplete: 60 })
      expect(await store.salvarAgora()).toBe(false)
      expect(store.mensagemGravacao).toBe('Não foi possível gravar no armazenamento do navegador.')
    })

    it('alerta de cota a partir de 80% do uso', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      adaptador.estimativa = { uso: 85, cota: 100 }
      store.updateTask(104, { percentComplete: 60 })
      await store.salvarAgora()
      await vi.waitFor(() => expect(store.alertaCota).toBe(85))
    })
  })

  describe('trocar, criar, duplicar e excluir', () => {
    it('C-4 e AC-7: cada módulo vê só a obra ativa; voltar à A mantém as alterações e a B não muda', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      store.approveReport('r-tiao', 104, 75, [])
      expect(store.schedule.projectFinish).toBe('2027-06-16')

      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      expect(store.obraAtivaId).toBe(b.id)
      expect(store.state.tasks).toHaveLength(0)
      expect(store.state.reports).toHaveLength(0)
      expect(store.schedule.projectFinish).toBe('2026-11-03')
      expect(store.delay.delayDays).toBe(0)
      expect(store.evm.spi).toBe(1)
      expect(store.evm.cpi).toBe(1)
      expect(store.state.meta.uf).toBe('PE')
      expect(store.state.meta.municipio).toBe('Recife')
      expect(store.state.meta.dailyIndirectCost).toBe(9850)

      expect(await store.trocarObra(idA)).toEqual({ ok: true })
      expect(store.schedule.projectFinish).toBe('2027-06-16')
      expect(store.taskByUid.get(104)?.percentComplete).toBe(75)

      expect(await store.trocarObra(b.id)).toEqual({ ok: true })
      expect(store.schedule.projectFinish).toBe('2026-11-03')
    })

    it('trocar para a própria obra ativa não faz nada', async () => {
      const { store } = await carregarCom(aurora)
      expect(await store.trocarObra(store.obraAtivaId)).toEqual({ ok: true })
    })

    it('trocar não conta como alteração (a data de atualização não muda)', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      const antes = store.obras.find((o) => o.id === idA)?.atualizadoEm
      vi.useFakeTimers()
      await store.trocarObra(idA)
      await vi.advanceTimersByTimeAsync(400) // além do atraso de gravação
      expect(store.estadoGravacao).toBe('salvo')
      expect(store.obras.find((o) => o.id === idA)?.atualizadoEm).toBe(antes)
    })

    it('AC-7: a troca zera o simulador e cada obra guarda o próprio desfazer', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      store.applyScenario(store.scenarios.crashing)
      expect(store.schedule.projectFinish).toBe('2027-06-18')
      store.scenarioParams.crashing.targetUid = 104

      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      expect(store.scenarioParams.crashing.targetUid).toBeUndefined()
      expect(store.state.undo).toEqual([])

      await store.trocarObra(idA)
      expect(store.state.appliedScenarios).toEqual(['crashing'])
      store.undoScenario('crashing')
      expect(store.schedule.projectFinish).toBe('2027-06-23')
    })

    it('AC-7: a troca é cancelada se a obra atual não pode ser salva', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      await store.trocarObra(idA)
      adaptador.falhar.gravar = true
      store.updateTask(104, { percentComplete: 60 })
      const r = await store.trocarObra(b.id)
      expect(r.ok).toBe(false)
      expect(store.obraAtivaId).toBe(idA)
      expect(store.taskByUid.get(104)?.percentComplete).toBe(60) // a alteração não foi perdida
    })

    it('AC-7: a troca também é cancelada se o índice não pode ser gravado', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      await store.trocarObra(idA)
      adaptador.falhar.gravar = true
      const r = await store.trocarObra(b.id)
      expect(r).toEqual({ ok: false, erro: 'O armazenamento do navegador está cheio.' })
      expect(store.obraAtivaId).toBe(idA)
      expect(store.state.meta.name).toBe(NOME_AURORA)
    })

    it('criar falha sem tocar nada se os dados são inválidos ou a gravação falha', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const invalido = await store.criarObra({ modelo: 'branco', dados: { ...recife, nome: '' } })
      expect(invalido).toMatchObject({ ok: false, erro: 'Informe o nome da obra.' })
      adaptador.falhar.gravar = true
      const cheio = await store.criarObra({ modelo: 'exemplo' })
      expect(cheio.ok).toBe(false)
      expect(store.obras).toHaveLength(1)
      expect(store.state.meta.name).toBe(NOME_AURORA)
    })

    it('criar a obra de exemplo não destrói a obra ativa e dá nome único', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      store.approveReport('r-tiao', 104, 75, [])
      const r = await store.criarObra({ modelo: 'exemplo' })
      expect(r.ok).toBe(true)
      expect(store.state.meta.name).toBe(`${NOME_AURORA} (2)`)
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      await store.trocarObra(idA)
      expect(store.schedule.projectFinish).toBe('2027-06-16')
    })

    it('AC-8 / C-3: duplicar copia sem ligar as obras', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const d = await store.duplicarObra(idA)
      if (!d.ok) throw new Error(d.erro)
      expect(d.id).not.toBe(idA)
      expect(store.obraAtivaId).toBe(idA)
      expect(store.obras).toHaveLength(2)
      expect(store.obras.find((o) => o.id === d.id)?.nome).toBe(`${NOME_AURORA} (cópia)`)

      expect(await store.trocarObra(d.id)).toEqual({ ok: true })
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.delay.delayDays).toBe(16)
      expect(store.evm.spi).toBeCloseTo(0.8883, 4)
      expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
      store.approveReport('r-tiao', 104, 75, [])
      expect(store.schedule.projectFinish).toBe('2027-06-16')

      await store.trocarObra(idA)
      expect(store.schedule.projectFinish).toBe('2027-06-23')
    })

    it('duplicar uma obra que não é a ativa lê do armazenamento', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      const d = await store.duplicarObra(idA)
      expect(d.ok).toBe(true)
      expect(store.obraAtivaId).toBe(b.id)
      expect(store.obras).toHaveLength(3)
    })

    it('duplicar falha com a gravação cheia ou com obra ilegível', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      adaptador.falhar.gravar = true
      expect((await store.duplicarObra(idA)).ok).toBe(false)
      expect(store.obras).toHaveLength(1)
      adaptador.falhar.gravar = false
      expect(await store.duplicarObra('inexistente')).toMatchObject({ ok: false })
    })

    it('AC-9: excluir a ativa abre a 1ª restante; excluir a única devolve erro', async () => {
      const { store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      expect(await store.excluirObra(idA)).toEqual({ ok: false, erro: 'A obra não pode ser excluída: é a única.' })
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      expect(await store.excluirObra(b.id)).toEqual({ ok: true })
      expect(store.obras.map((o) => o.id)).toEqual([idA])
      expect(store.obraAtivaId).toBe(idA)
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(await store.excluirObra('nao-existe')).toEqual({ ok: false, erro: 'Obra não encontrada.' })
    })

    it('excluir uma obra que não é a ativa não troca a obra aberta', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const d = await store.duplicarObra(idA)
      if (!d.ok) throw new Error(d.erro)
      expect(await store.excluirObra(d.id)).toEqual({ ok: true })
      expect(store.obraAtivaId).toBe(idA)
      expect(adaptador.obras.has(d.id)).toBe(false)
    })

    it('excluir a ativa pula obras ilegíveis; se nenhuma abre, recusa', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      adaptador.obras.set(idA, { ...adaptador.obras.get(idA)!, json: '{' })
      expect((await store.excluirObra(b.id)).ok).toBe(false)
      expect(store.obras).toHaveLength(2)
      expect(store.obras.find((o) => o.id === idA)?.ilegivel).toBe(true)
    })

    it('excluir falha sem mudar nada se a gravação falha', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const d = await store.duplicarObra(idA)
      if (!d.ok) throw new Error(d.erro)
      adaptador.falhar.gravar = true
      expect((await store.excluirObra(idA)).ok).toBe(false)
      expect(store.obras).toHaveLength(2)
      expect(store.obraAtivaId).toBe(idA)
    })

    it('antes de carregar, as ações de obra avisam e não fazem nada', async () => {
      const store = useProjectStore()
      expect((await store.trocarObra('x')).ok).toBe(false)
      expect((await store.criarObra({ modelo: 'exemplo' })).ok).toBe(false)
      expect((await store.duplicarObra('x')).ok).toBe(false)
      expect((await store.excluirObra('x')).ok).toBe(false)
    })
  })

  describe('dados da obra', () => {
    const normalizar = (xml: string) => xml.replace(/<(CreationDate|LastSaved)>[^<]*<\/\1>/g, '')

    it('AC-10: o .xml exportado não muda com UF, município, regime e data-base', async () => {
      const { store } = await carregarCom(aurora)
      const sem = normalizar(store.exportXml().xml)
      const r = store.atualizarDadosObra({
        nome: store.state.meta.name,
        uf: 'PE',
        municipio: 'Recife',
        responsavel: store.state.meta.manager,
        dataInicio: store.state.meta.startDate,
        dataStatus: store.state.meta.statusDate,
        regimeSinapi: 'desonerado',
        dataBaseSinapi: '2026-09',
      })
      expect(r).toEqual({ ok: true })
      expect(store.state.meta).toMatchObject({ uf: 'PE', municipio: 'Recife', regimeSinapi: 'desonerado', dataBaseSinapi: '2026-09' })
      expect(normalizar(store.exportXml().xml)).toBe(sem)
    })

    it('atualiza nome, responsável e data de status (com registro no log) e limpa os opcionais vazios', async () => {
      const { store } = await carregarCom(aurora)
      store.atualizarDadosObra({
        nome: ' Aurora Norte ', uf: 'PE', municipio: 'Recife', responsavel: 'Eng. Teste',
        dataInicio: '2026-05-04', dataStatus: '2026-10-30', regimeSinapi: 'desonerado', dataBaseSinapi: '2026-09',
      })
      expect(store.state.meta.name).toBe('Aurora Norte')
      expect(store.state.meta.manager).toBe('Eng. Teste')
      expect(store.state.meta.statusDate).toBe('2026-10-30')
      expect(store.state.log[0].title).toBe('Data de status alterada')
      expect(store.obras[0].nome).toBe('Aurora Norte')
      expect(store.obras[0].uf).toBe('PE')

      store.atualizarDadosObra({ nome: 'Aurora Norte', uf: '', municipio: '', responsavel: '', dataInicio: '2026-05-04', dataStatus: '2026-10-30', regimeSinapi: '', dataBaseSinapi: '' })
      expect(Object.keys(store.state.meta)).not.toContain('uf')
      expect(Object.keys(store.state.meta)).not.toContain('municipio')
      expect(Object.keys(store.state.meta)).not.toContain('regimeSinapi')
      expect(Object.keys(store.state.meta)).not.toContain('dataBaseSinapi')
    })

    it('dados inválidos não alteram a obra', async () => {
      const { store } = await carregarCom(aurora)
      const r = store.atualizarDadosObra({ nome: '', dataInicio: '2026-05-04', dataStatus: '2026-10-23' })
      expect(r).toEqual({ ok: false, erros: ['Informe o nome da obra.'] })
      expect(store.state.meta.name).toBe(NOME_AURORA)
    })

    it('AC-4: importar .xml na obra em branco preserva UF e município', async () => {
      const { store } = await carregarCom(aurora)
      const xml = store.exportXml().xml
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      store.importXml(xml)
      expect(store.state.tasks).toHaveLength(29)
      expect(store.state.meta.uf).toBe('PE')
      expect(store.state.meta.municipio).toBe('Recife')
    })
  })
})
