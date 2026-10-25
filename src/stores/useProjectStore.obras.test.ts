import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import aurora from '@/lib/__fixtures__/estado-v1-aurora.json?raw'
import aurora75 from '@/lib/__fixtures__/estado-v1-aurora-75.json?raw'
import auroraCenarios from '@/lib/__fixtures__/estado-v2-aurora-cenarios.json?raw'
import fixtureCalendarios from '@/lib/__fixtures__/mspdi-calendarios-restricoes.xml?raw'
import { MIGRACOES, lerEstadoV1 } from '@/lib/migracaoEstado'
import { analyzeSupplies } from '@/lib/supplies'
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
      // O estado agora é o da v1 levado ao esquema 3 (minutos e calendários); os números são os mesmos
      // Conferência independente da função de migração: cada duração e cada lag do JSON v1 (em dias) × 480 = minutos do estado novo
      const v1 = JSON.parse(aurora) as { tasks: { uid: number; durationDays: number; baselineDuration?: number; predecessors: { uid: number; lagDays: number }[] }[] }
      expect(v1.tasks).toHaveLength(store.state.tasks.length)
      expect(v1.tasks.filter((t) => t.baselineDuration !== undefined).length).toBeGreaterThan(10) // a conferência da linha de base não é vazia
      for (const t of v1.tasks) {
        const novo = store.taskByUid.get(t.uid)!
        expect([t.uid, novo.duracaoMin]).toEqual([t.uid, Math.round(t.durationDays * 480)])
        expect([t.uid, novo.baselineDuracaoMin]).toEqual([t.uid, t.baselineDuration === undefined ? undefined : Math.round(t.baselineDuration * 480)])
        expect(novo.predecessors.map((p) => [p.uid, p.lag])).toEqual(t.predecessors.map((p) => [p.uid, { tipo: 'util', minutos: Math.round(p.lagDays * 480) }]))
      }
      expect(store.state.calendarios).toHaveLength(1)
      expect(store.state.calendarioPadraoUid).toBe(1)
      const migrado = lerEstadoV1(aurora, 2026)
      if (migrado.tipo !== 'ok') throw new Error('fixture inválida')
      expect(store.state.tasks.find((t) => t.uid === 104)?.duracaoMin).toBe(5760)
      expect(store.migracaoV1?.resultado).toBe('migrado')
      expect(store.avisosCarga).toEqual([])
      expect(store.estadoGravacao).toBe('salvo')
      // gravada no esquema 4 e com a v1 intocada
      expect(adaptador.obras.get(store.obraAtivaId)?.versaoEsquema).toBe(4)
      expect(JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json)).toEqual(JSON.parse(JSON.stringify(migrado.estado)))
      expect(adaptador.v1).toBe(aurora)
      expect(adaptador.indice?.migracaoV1?.resultado).toBe('migrado')
    })

    it('P-2: obra salva no esquema 2 com os 3 cenários abre com o mesmo cronograma e desfazer devolve o Aurora', async () => {
      const adaptador = criarArmazenamentoMemoria(null)
      const em = '2026-10-25T10:00:00.000Z'
      adaptador.obras.set('o2', { id: 'o2', versaoEsquema: 2, json: auroraCenarios, atualizadoEm: em })
      adaptador.indice = { versaoIndice: 1, obraAtivaId: 'o2', obras: [{ id: 'o2', nome: NOME_AURORA, atualizadoEm: em }] }
      const store = await recarregar(adaptador)
      expect(store.avisosCarga).toEqual([])
      expect(store.state.appliedScenarios).toEqual(['crashing', 'fast-tracking', 'overtime'])
      expect(store.schedule.projectFinish).toBe('2027-06-02') // entrega gravada com a fixture (motor antigo)
      expect(store.taskByUid.get(105)!.duracaoMin).toBe(6240) // 13 dias
      for (const k of ['crashing', 'fast-tracking', 'overtime'] as const) store.undoScenario(k)
      expect(store.taskByUid.get(105)!.duracaoMin).toBe(7680) // volta aos 16 dias
      expect(store.taskByUid.get(401)!.predecessors).toEqual([{ uid: 105, type: 'FS', lag: { tipo: 'util', minutos: 0 } }])
      expect(store.state.calendarios[0].excecoes.filter((x) => x.intervalos.length > 0)).toEqual([]) // sem 24/10 e 31/10
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.state.undo).toEqual([])
      // A próxima gravação já é no esquema 4
      expect(await store.salvarAgora()).toBe(true)
      expect(adaptador.obras.get('o2')?.versaoEsquema).toBe(4)
    })

    it('hora extra aplicada e desfeita deixa o calendário padrão exatamente como estava', async () => {
      const { store } = await carregarCom(aurora)
      const antes = JSON.parse(JSON.stringify(store.state.calendarios))
      store.applyScenario(store.scenarios.overtime)
      const extras = store.state.calendarios[0].excecoes.filter((x) => x.intervalos.length > 0)
      expect(extras.map((x) => x.data)).toEqual(['2026-10-24', '2026-10-31'])
      expect(extras[0].intervalos).toEqual([{ de: 480, ate: 720 }, { de: 780, ate: 1020 }])
      store.undoScenario('overtime')
      expect(JSON.parse(JSON.stringify(store.state.calendarios))).toEqual(antes)
    })

    it('P-6: hora extra aplicada no esquema 3 (ciclo 00004) abre no esquema 4 e é desfeita com a entrega de 2027-06-23', async () => {
      const { store: origem } = await carregarCom(aurora)
      origem.applyScenario(origem.scenarios.overtime)
      expect(origem.schedule.projectFinish).toBe('2027-06-21')
      // Formato do esquema 3: indireto no meta, sem premissas nem feriados, sem a versão das premissas no resultado do cenário
      const e3 = JSON.parse(JSON.stringify(origem.state))
      e3.meta.dailyIndirectCost = 9850
      delete e3.premissas
      delete e3.feriados
      for (const u of e3.undo) delete u.result.premissas
      const adaptador = criarArmazenamentoMemoria(null)
      const em = '2026-10-25T10:00:00.000Z'
      adaptador.obras.set('o3', { id: 'o3', versaoEsquema: 3, json: JSON.stringify(e3), atualizadoEm: em })
      adaptador.indice = { versaoIndice: 1, obraAtivaId: 'o3', obras: [{ id: 'o3', nome: NOME_AURORA, atualizadoEm: em }] }
      const store = await recarregar(adaptador)
      expect(store.avisosCarga).toEqual([])
      expect(store.state.premissas).toHaveLength(1)
      expect(store.schedule.projectFinish).toBe('2027-06-21')
      expect(store.appliedResult('overtime')?.premissas).toBeUndefined() // "versão não registrada (anterior ao ciclo 00005)"
      store.undoScenario('overtime')
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.state.calendarios[0].excecoes.filter((x) => x.intervalos.length > 0)).toEqual([])
      expect(await store.salvarAgora()).toBe(true)
      expect(adaptador.obras.get('o3')?.versaoEsquema).toBe(4)
    })

    /** Registro REAL do esquema 3 (formato do ciclo 00004): fixture do esquema 2 com os 3 cenários aplicados, passada pelo passo 2 → 3. */
    const esquema3Real = (meta: Record<string, unknown> = {}) => {
      const e = MIGRACOES.find((x) => x.de === 2)!.aplicar(JSON.parse(auroraCenarios))
      return JSON.stringify({ ...e, meta: { ...(e.meta as Record<string, unknown>), ...meta } })
    }
    const abrirEsquema3 = async (json: string) => {
      const adaptador = criarArmazenamentoMemoria(null)
      const em = '2026-10-25T10:00:00.000Z'
      adaptador.obras.set('o3', { id: 'o3', versaoEsquema: 3, json, atualizadoEm: em })
      adaptador.indice = { versaoIndice: 1, obraAtivaId: 'o3', obras: [{ id: 'o3', nome: NOME_AURORA, atualizadoEm: em }] }
      return { adaptador, store: await recarregar(adaptador) }
    }

    it('P-1 (registro real do esquema 3): abre no esquema 4 com os 3 cenários aplicados e desfazer cada um devolve o PR-1 (23/06/2027, +16, SPI 0,8883, CPI 0,9349)', async () => {
      const { store } = await abrirEsquema3(esquema3Real())
      expect(store.avisosCarga).toEqual([])
      // calendário no formato de antes: 52 feriados fixos como exceção e nenhuma marca de "aplica feriados da obra"
      expect(store.state.calendarios[0].aplicaFeriadosObra).toBeUndefined()
      expect(store.state.calendarios[0].excecoes.filter((e) => e.intervalos.length === 0)).toHaveLength(52)
      expect(store.state.appliedScenarios).toEqual(['crashing', 'fast-tracking', 'overtime'])
      expect(store.schedule.projectFinish).toBe('2027-06-02') // a entrega gravada com os 3 cenários aplicados
      expect(store.premissasVigentes.custoIndiretoDiario).toBe(9850)
      store.undoScenario('overtime')
      expect(store.state.appliedScenarios).toEqual(['crashing', 'fast-tracking'])
      expect(store.state.calendarios[0].excecoes.filter((e) => e.intervalos.length > 0)).toEqual([]) // sem 24/10 e 31/10
      store.undoScenario('fast-tracking')
      expect(store.taskByUid.get(401)!.predecessors).toEqual([{ uid: 105, type: 'FS', lag: { tipo: 'util', minutos: 0 } }])
      store.undoScenario('crashing')
      expect(store.taskByUid.get(105)!.duracaoMin).toBe(7680)
      expect(store.state.appliedScenarios).toEqual([])
      expect(store.state.undo).toEqual([])
      // PR-1 igual ao do seed, com as premissas migradas (indireto 9.850, margem 3)
      expect([store.schedule.projectFinish, store.delay.delayDays]).toEqual(['2027-06-23', 16])
      expect(store.evm.spi).toBeCloseTo(0.8883, 4)
      expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
      expect(store.scenarios.crashing.extraCost).toBeCloseTo(12616.8, 2)
      expect(store.scenarios['fast-tracking'].extraCost).toBeCloseTo(25350, 2)
      expect(store.scenarios.overtime.extraCost).toBeCloseTo(22315.2, 2)
      expect(store.scenarios.overtime.daysRecovered).toBe(2)
      const dlp = store.supplies.find((x) => x.material.id === 'm-concreto')!
      expect([dlp.needDate, dlp.dlp, dlp.status]).toEqual(['2026-11-05', '2026-10-30', 'atencao'])
    })

    it('P-2 (DLP): esquema 3 com indireto 11.000 e margem 7 mantém a DLP do m-concreto que o cálculo de antes dava (margem 7), e a v1 guarda os dois valores', async () => {
      const { store } = await abrirEsquema3(esquema3Real({ dailyIndirectCost: 11000, safetyMarginDays: 7 }))
      expect(store.avisosCarga).toEqual([])
      expect(store.premissasVigentes.custoIndiretoDiario).toBe(11000)
      expect(store.safetyMarginDays).toBe(7)
      expect(store.state.premissas[0].valores.origens.margemDlpDias).toEqual({ origem: 'nao-documentada' })
      const dlp = store.supplies.find((x) => x.material.id === 'm-concreto')!
      // DLP = necessária − (lead time 3 + margem 7) = 2026-11-03 − 10 dias = 2026-10-24 (com os 3 cenários aplicados); antes da migração, o
      // campo meta.safetyMarginDays = 7 dava a mesma conta (analyzeSupplies com a margem 7); com a margem padrão (3) seria 2026-10-28
      const direto = analyzeSupplies(store.state.materials, store.state.tasks, store.schedule, store.state.meta.statusDate, store.state.restrictions, 7).find((x) => x.material.id === 'm-concreto')!
      expect(dlp.dlp).toBe(direto.dlp)
      expect([dlp.needDate, dlp.dlp, dlp.status]).toEqual(['2026-11-03', '2026-10-24', 'atencao'])
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

    it('rodada 03: obra com data de início ou de status inválida fica ilegível, a outra abre e nada é gravado por cima', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idAurora = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      const registro = adaptador.obras.get(b.id)!
      const adulterado = JSON.stringify({ ...JSON.parse(registro.json), meta: { ...JSON.parse(registro.json).meta, statusDate: '2026-02-30' } })
      adaptador.obras.set(b.id, { ...registro, json: adulterado })
      const nova = await recarregar(adaptador)
      expect(nova.obraAtivaId).toBe(idAurora)
      expect(nova.obras.find((o) => o.id === b.id)?.ilegivel).toBe(true)
      expect(adaptador.obras.get(b.id)?.json).toBe(adulterado) // intacta
      expect(await nova.trocarObra(b.id)).toEqual({ ok: false, erro: 'Os dados desta obra estão ilegíveis.' })
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

    it('falha ao LER o índice = estado desconhecido: não grava nada, bloqueia e avisa de forma persistente', async () => {
      // Parte de um índice prévio com 2 obras: ler com falha não pode seguir para "obra de exemplo" nem sobrescrevê-lo
      const { adaptador, store: primeira } = await carregarCom(aurora)
      const b = await primeira.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      const indiceAntes = structuredClone(adaptador.indice)
      const registrosAntes = structuredClone([...adaptador.obras.entries()])
      expect(indiceAntes?.obras).toHaveLength(2)

      adaptador.falhar.ler = true
      const store = await recarregar(adaptador)
      adaptador.falhar.ler = false

      expect(store.gravacaoBloqueada).toBe(true)
      expect(store.estadoGravacao).toBe('erro')
      expect(store.mensagemGravacao).toContain('Não foi possível ler as obras salvas')
      expect(await store.salvarAgora()).toBe(false)
      expect(await store.criarObra({ modelo: 'exemplo' })).toMatchObject({ ok: false })
      expect((await store.trocarObra('qualquer')).ok).toBe(false)
      expect((await store.excluirObra('qualquer')).ok).toBe(false)
      store.state.meta.name = 'Alterada com a carga bloqueada'
      await nextTick()
      expect(store.estadoGravacao).toBe('erro') // nunca "salvo"
      expect(adaptador.indice).toEqual(indiceAntes)
      expect([...adaptador.obras.entries()]).toEqual(registrosAntes)
      expect(adaptador.v1).toBe(aurora)
    })

    it('índice inválido ou de versão mais nova = ilegível: bloqueia e não grava por cima', async () => {
      const { adaptador } = await carregarCom(aurora)
      const valido = structuredClone(adaptador.indice)!
      const ruins: unknown[] = [
        { ...valido, versaoIndice: 2 },
        { ...valido, versaoIndice: 'x' },
        { ...valido, obraAtivaId: 123 },
        { ...valido, obras: 'nada' },
        { ...valido, obras: [{ id: 'a' }] },
        'texto',
      ]
      for (const ruim of ruins) {
        adaptador.indice = structuredClone(ruim) as typeof adaptador.indice
        const antes = structuredClone(adaptador.indice)
        const registros = structuredClone([...adaptador.obras.entries()])
        const store = await recarregar(adaptador)
        expect(store.gravacaoBloqueada).toBe(true)
        expect(store.estadoGravacao).toBe('erro')
        expect(store.mensagemGravacao).toMatch(/índice das obras/)
        expect(await store.salvarAgora()).toBe(false)
        expect(adaptador.indice).toEqual(antes)
        expect([...adaptador.obras.entries()]).toEqual(registros)
      }
      expect((await recarregar(Object.assign(adaptador, { indice: valido }))).gravacaoBloqueada).toBe(false)
    })

    it('índice de versão mais nova tem mensagem própria', async () => {
      const { adaptador } = await carregarCom(aurora)
      adaptador.indice = { ...structuredClone(adaptador.indice)!, versaoIndice: 2 as never }
      const store = await recarregar(adaptador)
      expect(store.mensagemGravacao).toBe('O índice das obras foi salvo por uma versão mais nova do CronoAI (índice 2). Nada foi gravado.')
    })

    it('falha inesperada na carga bloqueia a gravação e avisa (nunca "salvo")', async () => {
      const adaptador = criarArmazenamentoMemoria(aurora)
      adaptador.lerV1 = () => {
        throw new Error('quebrou')
      }
      const store = await recarregar(adaptador)
      expect(store.gravacaoBloqueada).toBe(true)
      expect(store.estadoGravacao).toBe('erro')
      expect(store.mensagemGravacao).toContain('Não foi possível carregar as obras')
      expect(adaptador.obras.size).toBe(0)
      expect(adaptador.indice).toBeUndefined()
      store.bloquearGravacao('Falha de teste')
      expect(store.mensagemGravacao).toBe('Falha de teste')
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
      expect(store.premissasVigentes.custoIndiretoDiario).toBe(9850) // premissa ilustrativa, agora nas premissas da obra (ciclo 00005)

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

    it('AC-15 / RF-14.1: importar .xml na obra em branco preserva UF e município e mantém os números do Aurora', async () => {
      const { store } = await carregarCom(aurora)
      const xml = store.exportXml().xml
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      store.importXml(xml)
      expect(store.state.tasks).toHaveLength(29)
      expect(store.state.meta.uf).toBe('PE')
      expect(store.state.meta.municipio).toBe('Recife')
      // Mesmos números do Aurora depois da ida e volta pelo .xml
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.delay.delayDays).toBe(16)
      expect(store.evm.spi).toBeCloseTo(0.8883, 4)
      expect(store.evm.cpi).toBeCloseTo(0.9349, 4)
    })

    it('CR-12: importar .xml com LB0 só de término mantém o término do arquivo e o PV da tarefa é zero', async () => {
      const { store } = await carregarCom(aurora)
      const xml = store.exportXml().xml
      // Na tarefa 303, remove o <Start> da linha de base 0 (o MS Project grava LB0 incompleta assim)
      const i = xml.indexOf('<UID>303</UID>')
      const j = xml.indexOf('<Baseline>', i)
      const fim = xml.indexOf('</Baseline>', j)
      const bloco = xml.slice(j, fim).replace(/\s*<Start>[^<]*<\/Start>/, '').replace(/<Finish>[^<]*<\/Finish>/, '<Finish>2027-01-29T17:00:00</Finish>')
      store.importXml(xml.slice(0, j) + bloco + xml.slice(fim))
      const t = store.taskByUid.get(303)!
      expect(t.baselineStart).toBeUndefined()
      expect(t.baselineFinish).toBe('2027-01-29')
      expect(store.msProjectTask(303)!.PlannedValue).toBe(0)
    })

    it('E3: importar a fixture de calendários e restrições grava o que o arquivo trouxe e calcula CR-2b e CR-6 com os números do plano', async () => {
      const { store } = await carregarCom(aurora)
      const avisos = store.importXml(fixtureCalendarios)
      expect(avisos).toContain('1 tarefa(s) agendada(s) manualmente no MS Project: o CronoAI as calcula automaticamente e preserva a marca para a exportação.')
      // Calendários, restrições e prazo do arquivo no estado salvo
      expect(store.state.calendarios.map((c) => c.nome)).toEqual(['Padrão', 'Sábado 4 h', 'Noturno', '24 Horas'])
      expect(store.state.calendarioPadraoUid).toBe(1)
      expect(store.taskByUid.get(7)!.restricao).toEqual({ tipo: 'MSO', data: '2026-08-12T08:00' })
      expect(store.taskByUid.get(12)!.prazoFinal).toBe('2026-08-31T17:00')
      expect(store.taskByUid.get(1)!.arquivo).toMatchObject({ inicio: '2026-08-03', termino: '2026-08-07' })
      expect(store.state.meta).toMatchObject({ minutosPorDia: 480, honorConstraintsArquivo: 0, opcoesCronograma: { logica: 'retida', moverRestante: true } })
      // CR-2b: A de 5 d no sábado de 4 h termina 13/08 12:00 e B (padrão) vai de 13/08 13:00 a 14/08 12:00
      const s = store.schedule.byUid
      expect([s.get(28)!.finish, s.get(28)!.terminoHora, s.get(29)!.start, s.get(29)!.inicioHora, s.get(29)!.finish, s.get(29)!.terminoHora]).toEqual(['2026-08-13', '12:00', '2026-08-13', '13:00', '2026-08-14', '12:00'])
      // CR-6 (MSO 06/08 em B): B 06/08 a 07/08, folga de A de -2 d e conflito com o vínculo
      expect([s.get(31)!.start, s.get(31)!.finish, s.get(30)!.folgaTotalMin / 480, s.get(30)!.critical, s.get(31)!.restricaoConflito]).toEqual(['2026-08-06', '2026-08-07', -2, true, true])
      // A tarefa manual é calculada automaticamente (com a marca preservada) e o export a devolve
      expect(s.get(27)!.start).toBe('2026-08-10')
      const exportado = store.exportXml()
      expect(exportado.validation.valid).toBe(true)
      expect(exportado.validation.errors).toEqual([])
      expect(exportado.xml).toContain('<Manual>1</Manual>')
      expect(exportado.xml).toContain('<Name>Noturno</Name>')
    })

    it('E3: importar outro arquivo não herda a jornada, o HonorConstraints nem as opções Move* do anterior', async () => {
      const { store } = await carregarCom(aurora)
      const variante = fixtureCalendarios.replace('<MinutesPerDay>480</MinutesPerDay>', '<MinutesPerDay>450</MinutesPerDay>').replace('<MoveRemainingStartsForward>0<', '<MoveRemainingStartsForward>1<')
      store.importXml(variante)
      expect(store.state.meta.minutosPorDia).toBe(450)
      expect(store.state.meta.moveArquivo?.remainingStartsForward).toBe(true)
      // O .xml exportado do Aurora não traz Move* nem jornada diferente da padrão: o estado do arquivo anterior não fica
      const { xml } = (await carregarCom(aurora)).store.exportXml()
      store.importXml(xml)
      expect(store.state.meta.moveArquivo).toBeUndefined()
      expect(store.state.meta.minutosPorDia).toBe(480)
      expect(store.state.meta.honorConstraintsArquivo).toBe(0)
    })

    it('adiar o início de uma obra NÃO iniciada, mantendo a data de status, desloca a entrega 19 d.u. e o atraso fica em +20 d.u.', async () => {
      // Aurora com avanço zerado e data de status no início da obra
      const base = JSON.parse(aurora)
      base.tasks = base.tasks.map((t: Record<string, unknown>) => ({ ...t, percentComplete: 0, actualCost: 0, actualStart: undefined, actualFinish: undefined }))
      base.meta.statusDate = '2026-05-04'
      const { store } = await carregarCom(JSON.stringify(base))
      const m = store.state.meta
      const dados = { nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: m.statusDate }
      const baseline = store.taskByUid.get(104)?.baselineStart
      expect(store.obraComAvanco).toBe(false)
      // Antes: início 04/05/2026 e status 04/05/2026
      expect(store.schedule.projectFinish).toBe('2027-06-02')
      expect(store.delay.delayDays).toBe(1)
      // Depois: início 01/06/2026 (+20 d.u.), status mantido: obra não iniciada, sem regra de coerência
      expect(store.atualizarDadosObra({ ...dados, dataInicio: '2026-06-01' })).toEqual({ ok: true })
      expect(store.schedule.projectFinish).toBe('2027-06-29')
      expect(store.delay.delayDays).toBe(20)
      expect(store.taskByUid.get(104)?.baselineStart).toBe(baseline) // a linha de base não muda
      // O log registra a mudança de início
      expect(store.state.log.find((l) => l.title === 'Data de início alterada')?.detail).toBe(
        'Nova data de início: 01/06/2026. Tarefas não iniciadas foram reprogramadas; a linha de base não mudou.',
      )
      // Sem mudança de início, nenhuma entrada nova
      const total = store.state.log.length
      store.atualizarDadosObra({ ...dados, dataInicio: '2026-06-01' })
      expect(store.state.log).toHaveLength(total)
    })

    it('criar obra futura (início depois da data de status) é aceito', async () => {
      const { store } = await carregarCom(aurora)
      const r = await store.criarObra({ modelo: 'branco', dados: { ...recife, dataInicio: '2026-12-01', dataStatus: '2026-10-26' } })
      expect(r.ok).toBe(true)
      expect(store.state.meta.startDate).toBe('2026-12-01')
    })

    it('com avanço, a ação da store recusa início depois da data de status ou do primeiro início real e status antes do início', async () => {
      const { store } = await carregarCom(aurora)
      const m = store.state.meta
      const dados = { nome: m.name, responsavel: m.manager, dataInicio: m.startDate, dataStatus: m.statusDate }
      expect(store.obraComAvanco).toBe(true)
      expect(store.primeiroInicioReal).toBeDefined()
      expect(store.atualizarDadosObra({ ...dados, dataInicio: '2026-10-26' })).toMatchObject({ ok: false })
      const depoisDoReal = store.atualizarDadosObra({ ...dados, dataInicio: '2026-10-20' })
      expect(depoisDoReal).toMatchObject({ ok: false })
      if (!depoisDoReal.ok) expect(depoisDoReal.erros[0]).toContain('primeiro início real')
      const statusAntes = store.atualizarDadosObra({ ...dados, dataStatus: '2026-04-01' })
      expect(statusAntes).toMatchObject({ ok: false })
      if (!statusAntes.ok) expect(statusAntes.erros[0]).toBe('A data de status não pode ser anterior à data de início.')
      expect(store.state.meta.startDate).toBe('2026-05-04') // nada mudou
      expect(store.state.meta.statusDate).toBe('2026-10-23')
      expect(store.schedule.projectFinish).toBe('2027-06-23')
      expect(store.delay.delayDays).toBe(16)
      // Editar só o nome, com as datas intactas, continua permitido
      expect(store.atualizarDadosObra({ ...dados, nome: 'Aurora Norte' })).toEqual({ ok: true })
    })

    it('obra sem tarefas é "sem cronograma" e sem orçamento; o Aurora não', async () => {
      const { store } = await carregarCom(aurora)
      expect(store.semCronograma).toBe(false)
      expect(store.semOrcamento).toBe(false)
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      expect(store.semCronograma).toBe(true)
      expect(store.semOrcamento).toBe(true)
      // O número do motor não muda: o fallback do safeDiv continua 1
      expect(store.evm.spi).toBe(1)
      expect(store.evm.cpi).toBe(1)
    })
  })

  describe('gravação · revisão e pendências', () => {
    it('alteração feita durante a escrita continua "pendente" até a próxima gravação', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const original = adaptador.gravarObra
      let liberar: () => void = () => undefined
      const portao = new Promise<void>((r) => (liberar = r))
      let chamadas = 0
      adaptador.gravarObra = async (registro, indice) => {
        chamadas++
        await portao
        return original(registro, indice)
      }
      store.updateTask(104, { percentComplete: 60 })
      await nextTick()
      const gravando = store.salvarAgora()
      await vi.waitFor(() => expect(chamadas).toBe(1))
      store.updateTask(104, { percentComplete: 70 }) // muda durante a escrita
      await nextTick()
      liberar()
      expect(await gravando).toBe(true)
      expect(store.estadoGravacao).toBe('pendente')
      adaptador.gravarObra = original
      expect(await store.salvarAgora()).toBe(true)
      expect(store.estadoGravacao).toBe('salvo')
      expect(JSON.parse(adaptador.obras.get(store.obraAtivaId)!.json).tasks.find((t: { uid: number }) => t.uid === 104).percentComplete).toBe(70)
    })

    it('trocar de obra com o atraso de gravação ainda correndo grava a obra atual antes', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      await store.trocarObra(idA)
      store.updateTask(104, { percentComplete: 60 }) // timer pendente, sem esperar o observador
      expect((await store.trocarObra(b.id)).ok).toBe(true)
      const salvo = JSON.parse(adaptador.obras.get(idA)!.json)
      expect(salvo.tasks.find((t: { uid: number }) => t.uid === 104).percentComplete).toBe(60)
    })

    it('excluir a obra ativa não deixa uma gravação pendente ressuscitá-la', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const d = await store.duplicarObra(idA)
      if (!d.ok) throw new Error(d.erro)
      vi.useFakeTimers()
      store.updateTask(104, { percentComplete: 60 })
      await nextTick()
      expect(await store.excluirObra(idA)).toEqual({ ok: true })
      await vi.advanceTimersByTimeAsync(500)
      expect(adaptador.obras.has(idA)).toBe(false)
      expect(store.obraAtivaId).toBe(d.id)
      expect(store.estadoGravacao).toBe('salvo')
    })

    it('excluir que falha reagenda a gravação pendente da obra ativa', async () => {
      const { adaptador, store } = await carregarCom(aurora)
      const idA = store.obraAtivaId
      const b = await store.criarObra({ modelo: 'branco', dados: recife })
      if (!b.ok) throw new Error(b.erro)
      await store.trocarObra(idA)
      adaptador.obras.set(b.id, { ...adaptador.obras.get(b.id)!, json: '{' }) // a única outra obra fica ilegível
      vi.useFakeTimers()
      store.updateTask(104, { percentComplete: 60 })
      await nextTick()
      expect((await store.excluirObra(idA)).ok).toBe(false)
      await vi.advanceTimersByTimeAsync(500)
      expect(store.estadoGravacao).toBe('salvo')
      expect(JSON.parse(adaptador.obras.get(idA)!.json).tasks.find((t: { uid: number }) => t.uid === 104).percentComplete).toBe(60)
    })
  })
})
