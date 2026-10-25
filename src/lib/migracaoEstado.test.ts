import { describe, expect, it } from 'vitest'
import aurora from './__fixtures__/estado-v1-aurora.json?raw'
import aurora75 from './__fixtures__/estado-v1-aurora-75.json?raw'
import auroraCenarios from './__fixtures__/estado-v2-aurora-cenarios.json?raw'
import fixtureEsquema4 from './__fixtures__/registro-esquema4-aurora-cenarios.json?raw'
import {
  ESQUEMA_ATUAL,
  MIGRACOES,
  criarRegistro,
  lerEstadoV1 as lerV1,
  migrarRegistro as migrar,
  tarefaDoEsquema2Para3,
} from './migracaoEstado'
import { defaultHolidays } from './calendar'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import type { CalendarioObra } from '@/types/domain'
import type { PersistedState, RegistroObra } from '@/types/obra'
import { buildSeedState } from '@/stores/useProjectStore'
import { premissasPadrao } from './premissas'

// Ano usado quando a obra não informa a data de início (os testes fixam 2026 para os feriados serem previsíveis)
const ANO = 2026
const lerEstadoV1 = (raw: string | null | undefined) => lerV1(raw, ANO)
const migrarRegistro = (reg: RegistroObra | undefined) => migrar(reg, ANO)
const feriadosDe = (e: PersistedState) => e.calendarios[0].excecoes.filter((x) => x.intervalos.length === 0).map((x) => x.data)
const extrasDe = (e: PersistedState) => e.calendarios[0].excecoes.filter((x) => x.intervalos.length > 0).map((x) => x.data)
const entrega = (e: PersistedState) =>
  computeSchedule(e.tasks, compilarCalendarios(e.meta.startDate, e.calendarios, e.calendarioPadraoUid), { mode: 'forecast', statusDate: e.meta.statusDate }).projectFinish

describe('lerEstadoV1', () => {
  it('lê a fixture completa da v1 sem avisos e a leva ao esquema 4 com os mesmos números (AC-1, M-1)', () => {
    const r = lerEstadoV1(aurora)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.avisos).toEqual([])
    expect(r.estado.tasks).toHaveLength(29)
    const antigo = JSON.parse(aurora)
    // Tudo que não é tempo ou calendário fica igual; o indireto do meta virou a versão 1 das premissas (esquema 4, ciclo 00005)
    const { dailyIndirectCost: indiretoAntigo, ...metaAntigo } = antigo.meta
    expect(r.estado.meta).toEqual(metaAntigo)
    expect(r.estado.premissas).toHaveLength(1)
    expect(r.estado.premissas[0]).toMatchObject({ versao: 1, vigencia: '2026-05-04', valores: { custoIndiretoDiario: indiretoAntigo, margemDlpDias: 3 } })
    expect(r.estado.reports).toEqual(antigo.reports)
    expect(r.estado.materials).toEqual(antigo.materials)
    expect(r.estado.budget).toEqual(antigo.budget)
    // 104: 12 dias × 480 = 5.760 min; 402: SS com lag de 10 dias = 4.800 min; 105 não tem restrição de data
    const t104 = r.estado.tasks.find((t) => t.uid === 104)!
    expect(t104.duracaoMin).toBe(5760)
    expect(t104.baselineDuracaoMin).toBe(5760)
    expect(Object.keys(t104)).not.toContain('durationDays')
    expect(r.estado.tasks.find((t) => t.uid === 402)!.predecessors).toEqual([{ uid: 401, type: 'SS', lag: { tipo: 'util', minutos: 4800 } }])
    expect(r.estado.tasks.find((t) => t.uid === 103)!.predecessors[0].lag).toEqual({ tipo: 'util', minutos: 2400 }) // 301FS+5
    expect(r.estado.calendarioPadraoUid).toBe(1)
    expect(r.estado.calendarios).toHaveLength(1)
    expect(r.estado.calendarios[0].nome).toBe('Padrão Obra (seg-sex, 8h)')
    expect(feriadosDe(r.estado)).toEqual([...antigo.calendar.holidays].sort())
    expect(extrasDe(r.estado)).toEqual([])
    expect(Object.keys(r.estado)).not.toContain('calendar')
    // Mesmo cronograma da CR-1
    expect(entrega(r.estado)).toBe('2027-06-23')
  })

  it('lê a fixture com o apontamento aprovado (UID 104 com 75%)', () => {
    const r = lerEstadoV1(aurora75)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.tasks.find((t) => t.uid === 104)?.percentComplete).toBe(75)
    expect(entrega(r.estado)).toBe('2027-06-16')
  })

  it('sem chave salva é "ausente"', () => {
    expect(lerEstadoV1(null)).toEqual({ tipo: 'ausente' })
    expect(lerEstadoV1(undefined)).toEqual({ tipo: 'ausente' })
    expect(lerEstadoV1('')).toEqual({ tipo: 'ausente' })
  })

  it('JSON inválido, sem tarefas ou sem meta é "corrompido" (AC-4, M-3)', () => {
    expect(lerEstadoV1('{')).toEqual({ tipo: 'corrompido' })
    expect(lerEstadoV1('{"tasks":[]}')).toEqual({ tipo: 'corrompido' })
    expect(lerEstadoV1('{"tasks":[{}]}')).toEqual({ tipo: 'corrompido' })
    expect(lerEstadoV1('[1]')).toEqual({ tipo: 'corrompido' })
    expect(lerEstadoV1('{"tasks":[{}],"meta":[]}')).toEqual({ tipo: 'corrompido' })
  })

  it('tarefa sem duração numérica torna a v1 "corrompida": não se inventa duração', () => {
    const base = JSON.parse(aurora)
    base.tasks[1].durationDays = 'dez'
    expect(lerEstadoV1(JSON.stringify(base))).toEqual({ tipo: 'corrompido' })
  })

  it('v1 parcial ganha listas vazias e um aviso citando as chaves, sem dados do Aurora (AC-3, M-2)', () => {
    const { budget: _b, undo: _u, log: _l, ...parcial } = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify(parcial))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.budget).toEqual([])
    expect(r.estado.undo).toEqual([])
    expect(r.estado.log).toEqual([])
    expect(r.avisos).toEqual(['Campos ausentes ou inválidos no estado salvo foram preenchidos como vazios: log, undo, budget.'])
    expect(r.estado.tasks).toHaveLength(29)
  })

  it('chave de tipo errado também é preenchida como vazia', () => {
    const r = lerEstadoV1(JSON.stringify({ ...JSON.parse(aurora), restrictions: 'x' }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.restrictions).toEqual([])
    expect(r.avisos[0]).toContain('restrictions')
  })

  it('sem calendário, usa os feriados nacionais a partir do ano de início', () => {
    const { calendar: _c, ...semCalendario } = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify(semCalendario))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(extrasDe(r.estado)).toEqual([])
    // Início da obra em 2026-05-04: feriados nacionais de 2026 a 2029
    expect(feriadosDe(r.estado)).toEqual(defaultHolidays(2026, 2029))
    expect(r.avisos[0]).toContain('calendar')
  })

  it('o ano dos feriados vem da data de início da obra, não de um ano fixo', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: undefined, meta: { ...base.meta, startDate: '2028-03-01' } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(feriadosDe(r.estado)).toEqual(defaultHolidays(2028, 2031))
  })

  it('rodada 03: sem data de início ou de status válida a obra é ilegível (antes: abria usando o ano de quem chama)', () => {
    const base = JSON.parse(aurora)
    for (const meta of [
      { startDate: undefined },
      { startDate: 'lixo' },
      { startDate: '2026-02-30' },
      { statusDate: undefined },
      { statusDate: '2026-13-01' },
      { statusDate: 20261001 },
    ]) {
      expect(lerV1(JSON.stringify({ ...base, calendar: undefined, meta: { ...base.meta, ...meta } }), 2031), JSON.stringify(meta)).toEqual({ tipo: 'corrompido' })
    }
  })

  it('calendário só com feriados: preserva os feriados e completa só os dias extras', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: { holidays: ['2026-11-20'] } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.calendarios[0].excecoes).toEqual([{ data: '2026-11-20', intervalos: [] }])
    expect(r.avisos[0]).toContain('calendar')
  })

  it('calendário só com dias extras: preserva os extras (08–12 e 13–17) e completa os feriados', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: { extraWorkingDays: ['2026-11-21'] } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(feriadosDe(r.estado)).toEqual(defaultHolidays(2026, 2029))
    expect(extrasDe(r.estado)).toEqual(['2026-11-21'])
    const extra = r.estado.calendarios[0].excecoes.find((x) => x.data === '2026-11-21')!
    expect(extra.intervalos).toEqual([{ de: 480, ate: 720 }, { de: 780, ate: 1020 }])
  })
})

describe('tarefaDoEsquema2Para3 (tarefas e undo)', () => {
  it('converte só as chaves antigas presentes e deixa o resto intacto', () => {
    expect(tarefaDoEsquema2Para3({ durationDays: 13, resources: [{ resource: 'Pedreiro', units: 6 }], chaveNova: 1 })).toEqual({
      duracaoMin: 6240,
      resources: [{ resource: 'Pedreiro', units: 6 }],
      chaveNova: 1,
    })
    expect(tarefaDoEsquema2Para3({ predecessors: [{ uid: 105, type: 'SS', lagDays: 3 }] })).toEqual({
      predecessors: [{ uid: 105, type: 'SS', lag: { tipo: 'util', minutos: 1440 } }],
    })
    expect(tarefaDoEsquema2Para3({ snet: '2026-08-12', baselineDuration: 16 })).toEqual({
      restricao: { tipo: 'SNET', data: '2026-08-12' },
      baselineDuracaoMin: 7680,
    })
  })

  it('duração arredonda para dia inteiro como o motor antigo; valor inválido é descartado', () => {
    expect(tarefaDoEsquema2Para3({ durationDays: 2.6 })).toEqual({ duracaoMin: 1440 })
    expect(tarefaDoEsquema2Para3({ durationDays: 'x', snet: '' })).toEqual({})
  })
})

describe('migrarRegistro', () => {
  const registro = (json: string, versaoEsquema = ESQUEMA_ATUAL): RegistroObra => ({ id: 'o1', versaoEsquema, json, atualizadoEm: '2026-10-25T10:00:00.000Z' })
  const estadoV1 = (): PersistedState => {
    const l = lerEstadoV1(aurora)
    if (l.tipo !== 'ok') throw new Error('fixture inválida')
    return l.estado
  }

  it('o registro criado volta igual ao estado gravado', () => {
    const estado = estadoV1()
    const reg = criarRegistro('o1', estado, '2026-10-25T10:00:00.000Z')
    expect(reg.versaoEsquema).toBe(5)
    expect(migrarRegistro(reg)).toEqual({ tipo: 'ok', estado: JSON.parse(JSON.stringify(estado)), avisos: [] })
  })

  it('rodada 03: obra gravada com data de início ou de status inválida é ilegível, no esquema 1, 2 ou 3', () => {
    const base = estadoV1()
    for (const [campo, valor] of [['startDate', 'não é data'], ['startDate', '2026-02-30'], ['statusDate', ''], ['statusDate', '2026-00-10']] as const) {
      const estado = { ...base, meta: { ...base.meta, [campo]: valor } }
      expect(migrarRegistro(registro(JSON.stringify(estado))), `${campo}=${valor}`).toEqual({ tipo: 'erro', mensagem: 'Os dados desta obra estão ilegíveis.' })
    }
    expect(migrarRegistro(registro(JSON.stringify({ ...base, meta: { ...base.meta, statusDate: undefined } }), 2)).tipo).toBe('erro')
  })

  it('leva o esquema 1 ao atual pela cadeia, com o mesmo resultado da leitura da v1', () => {
    const m = migrarRegistro(registro(aurora, 1))
    expect(m.tipo).toBe('ok')
    if (m.tipo === 'ok') expect(m.estado).toEqual(JSON.parse(JSON.stringify(estadoV1())))
  })

  it('esquema 2 → 3 por obra: tarefas, lag, calendário e o undo dos 3 cenários aplicados (P-2)', () => {
    const m = migrarRegistro(registro(auroraCenarios, 2))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    const e = m.estado
    expect(m.avisos).toEqual([])
    // Hora extra: os 2 sábados viram exceções úteis no calendário padrão
    expect(extrasDe(e)).toEqual(['2026-10-24', '2026-10-31'])
    // Crashing: 105 de 16 para 13 dias; o undo guarda os 16 dias (7.680 min) e as equipes de antes
    expect(e.tasks.find((t) => t.uid === 105)!.duracaoMin).toBe(6240)
    const crashing = e.undo.find((u) => u.kind === 'crashing')!
    expect(crashing.before).toMatchObject({ duracaoMin: 7680 })
    expect(Object.keys(crashing.before ?? {})).not.toContain('durationDays')
    expect(crashing.result.taskPatch?.patch).toMatchObject({ duracaoMin: 6240 })
    // Fast-tracking: o undo guarda o vínculo FS lag 0 da 401; o patch, o SS + 3 dias
    const fast = e.undo.find((u) => u.kind === 'fast-tracking')!
    expect(fast.before?.predecessors).toEqual([{ uid: 105, type: 'FS', lag: { tipo: 'util', minutos: 0 } }])
    expect(fast.result.taskPatch?.patch.predecessors).toEqual([{ uid: 105, type: 'SS', lag: { tipo: 'util', minutos: 1440 } }])
    // Hora extra: a lista de datas segue como está
    expect(e.undo.find((u) => u.kind === 'overtime')!.addedDays).toEqual(['2026-10-24', '2026-10-31'])
    // Entrega gravada com a fixture (3 cenários aplicados no motor antigo)
    expect(entrega(e)).toBe('2027-06-02')
  })

  it('a cadeia cobre todos os esquemas até o atual, sem buracos', () => {
    expect(MIGRACOES.map((p) => [p.de, p.para])).toEqual([[1, 2], [2, 3], [3, 4], [4, 5]])
    expect(MIGRACOES.at(-1)?.para).toBe(ESQUEMA_ATUAL)
  })

  it('recusa esquema mais novo que o do app (AC-4, M-6, P-3)', () => {
    expect(migrarRegistro(registro(aurora, 99))).toEqual({
      tipo: 'erro',
      mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 99).',
    })
    expect(migrarRegistro(registro(aurora, 6))).toEqual({
      tipo: 'erro',
      mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 6).',
    })
  })

  it('registro ausente, JSON inválido, sem meta e esquema inválido viram erro (M-6)', () => {
    expect(migrarRegistro(undefined).tipo).toBe('erro')
    expect(migrarRegistro(registro('{')).tipo).toBe('erro')
    expect(migrarRegistro(registro('{"tasks":[]}')).tipo).toBe('erro')
    expect(migrarRegistro(registro(aurora, 0)).tipo).toBe('erro')
    expect(migrarRegistro(registro(aurora, 1.5)).tipo).toBe('erro')
  })

  it('aceita obra em branco (0 tarefas) gravada no esquema atual', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    const m = migrarRegistro(registro(JSON.stringify({ ...base, tasks: [] })))
    expect(m.tipo).toBe('ok')
    if (m.tipo === 'ok') expect(m.estado.tasks).toEqual([])
  })

  it('esquema 3 sem calendários: completa com o padrão e os feriados nacionais, com aviso (P-4)', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    delete base.calendarios
    delete base.calendarioPadraoUid
    const m = migrarRegistro(registro(JSON.stringify(base)))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.avisos[0]).toContain('calendarios')
    expect(m.estado.calendarioPadraoUid).toBe(1)
    expect(feriadosDe(m.estado)).toEqual(defaultHolidays(2026, 2029))
    expect(entrega(m.estado)).toBe('2027-06-23')
  })

  it('esquema 3 com calendário padrão inexistente passa a usar o primeiro, com aviso', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    base.calendarioPadraoUid = 77
    const m = migrarRegistro(registro(JSON.stringify(base)))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.estado.calendarioPadraoUid).toBe(1)
    expect(m.avisos[0]).toContain('calendarioPadraoUid')
  })

  it('esquema 3 sem campos opcionais (restrição, prazo, opções, calendário da tarefa) abre com os mesmos números (P-4)', () => {
    const m = migrarRegistro(registro(JSON.stringify(estadoV1())))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.estado.tasks.every((t) => t.calendarioUid === undefined && t.restricao === undefined)).toBe(true)
    expect(entrega(m.estado)).toBe('2027-06-23')
  })

  it('esquema 3 com tarefa sem duracaoMin é ilegível: não se inventa duração', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    delete base.tasks[1].duracaoMin
    expect(migrarRegistro(registro(JSON.stringify(base)))).toEqual({ tipo: 'erro', mensagem: 'Os dados desta obra estão ilegíveis.' })
  })

  it('B: esquema 3 com calendário secundário inválido (semana sem tempo útil) descarta só esse, com aviso, e o cronograma é o mesmo', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    base.calendarios.push({ uid: 2, nome: 'Vazio', semana: [[], [], [], [], [], [], []], excecoes: [{ data: '2026-08-15', intervalos: [{ de: 480, ate: 720 }] }] })
    const m = migrarRegistro(registro(JSON.stringify(base)))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.estado.calendarios.map((c) => c.uid)).toEqual([1])
    expect(m.avisos).toEqual(['1 calendário(s) inválido(s) descartado(s) do estado salvo.'])
    expect(entrega(m.estado)).toBe('2027-06-23')
  })

  it('B: calendário padrão inválido (horário 25:00 ou forma errada) é refeito com os feriados nacionais, mantendo o UID', () => {
    for (const quebra of [
      (c: Record<string, unknown>) => ({ ...c, semana: [[], [{ de: 480, ate: 1500 }], [], [], [], [], []] }),
      (c: Record<string, unknown>) => ({ ...c, excecoes: 'x' }),
      (c: Record<string, unknown>) => ({ ...c, semana: 'x' }),
    ]) {
      const base = JSON.parse(JSON.stringify(estadoV1()))
      base.calendarios = [quebra(base.calendarios[0])]
      const m = migrarRegistro(registro(JSON.stringify(base)))
      expect(m.tipo).toBe('ok')
      if (m.tipo !== 'ok') return
      expect(m.avisos).toEqual(['1 calendário(s) inválido(s) descartado(s) do estado salvo; o calendário padrão foi refeito com os feriados nacionais.'])
      expect(m.estado.calendarioPadraoUid).toBe(1)
      expect(feriadosDe(m.estado)).toEqual(defaultHolidays(2026, 2029))
      expect(m.estado.calendarios[0].semana[1]).toEqual([{ de: 480, ate: 720 }, { de: 780, ate: 1020 }])
      expect(entrega(m.estado)).toBe('2027-06-23') // mesmo cronograma: o calendário refeito tem os mesmos feriados da obra
    }
  })

  it('B: o UID do padrão refeito é preservado e as tarefas que apontavam para calendário descartado usam o padrão', () => {
    const base = JSON.parse(JSON.stringify(estadoV1()))
    base.calendarioPadraoUid = 7
    base.calendarios = [{ uid: 7, nome: 'Ruim', semana: [[], [], [], [], [], [], []], excecoes: [] }]
    base.tasks[1].calendarioUid = 7
    const m = migrarRegistro(registro(JSON.stringify(base)))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.estado.calendarioPadraoUid).toBe(7)
    expect(m.estado.calendarios.map((c) => c.uid)).toEqual([7])
    expect(entrega(m.estado)).toBe('2027-06-23')
  })

  it('B: v1 com feriado de data inválida no calendário também descarta o calendário migrado e refaz o padrão', () => {
    const base = JSON.parse(aurora)
    base.calendar.holidays.push('2026-02-30')
    const r = lerEstadoV1(JSON.stringify(base))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.avisos).toEqual(['1 calendário(s) inválido(s) descartado(s) do estado salvo; o calendário padrão foi refeito com os feriados nacionais.'])
    expect(feriadosDe(r.estado)).toEqual(defaultHolidays(2026, 2029))
  })

  it('erra quando falta o passo da cadeia', () => {
    const passos = MIGRACOES.splice(0, MIGRACOES.length)
    try {
      expect(migrarRegistro(registro(aurora, 1))).toEqual({ tipo: 'erro', mensagem: 'Não há migração do esquema 1 para o 2.' })
    } finally {
      MIGRACOES.push(...passos)
    }
  })
})

describe('esquema 3 → 4: premissas versionadas e feriados da obra (ciclo 00005, P-1 a P-5)', () => {
  const registro = (json: string, versaoEsquema: number): RegistroObra => ({ id: 'o1', versaoEsquema, json, atualizadoEm: '2026-10-25T10:00:00.000Z' })
  /** Aurora no formato do esquema 3 (antes do ciclo 00005): indireto e margem no meta, sem premissas nem feriados. */
  const esquema3 = (meta: Record<string, unknown> = {}) => {
    const e = buildSeedState()
    const { premissas: _p, feriados: _f, ...resto } = e
    return { ...resto, meta: { ...resto.meta, dailyIndirectCost: 9850, ...meta } }
  }

  /**
   * Registro REAL do esquema 3, no formato que o ciclo 00004 gravava: a fixture do esquema 2 (Aurora com os 3 cenários aplicados: crashing,
   * fast tracking e a hora extra, esta como 2 sábados úteis) passada pelo passo 2 → 3 da cadeia. O calendário tem as 52 exceções fixas de
   * feriado e NÃO tem `aplicaFeriadosObra`; o indireto está no meta.
   */
  const esquema3Real = (meta: Record<string, unknown> = {}): Record<string, unknown> => {
    const e = MIGRACOES.find((x) => x.de === 2)!.aplicar(JSON.parse(auroraCenarios))
    return { ...e, meta: { ...(e.meta as Record<string, unknown>), ...meta } }
  }

  it('P-1 (registro real do esquema 3): vira esquema 4 com a v1 padrão, calendário sem a marca e com as exceções de antes, mesmas datas e undo intacto', () => {
    const real = esquema3Real()
    const cal0 = (real.calendarios as CalendarioObra[])[0]
    expect(cal0.aplicaFeriadosObra).toBeUndefined()
    expect(cal0.excecoes.filter((x) => x.intervalos.length === 0)).toHaveLength(52)
    expect(cal0.excecoes.filter((x) => x.intervalos.length > 0).map((x) => x.data)).toEqual(['2026-10-24', '2026-10-31']) // a HE do 00004
    expect((real.meta as Record<string, unknown>).dailyIndirectCost).toBe(9850)
    const m = migrarRegistro(registro(JSON.stringify(real), 3))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.avisos).toEqual([])
    expect(m.estado.premissas).toHaveLength(1)
    expect(m.estado.premissas[0]).toMatchObject({ versao: 1, vigencia: '2026-05-04', motivo: 'Premissas salvas antes do versionamento (migradas)', valores: premissasPadrao() })
    expect(Object.keys(m.estado.meta)).not.toContain('dailyIndirectCost')
    expect(m.estado.feriados).toEqual({ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] })
    expect(m.estado.calendarios).toEqual(JSON.parse(JSON.stringify(real.calendarios))) // nenhuma data muda: o calendário não é tocado
    expect(m.estado.appliedScenarios).toEqual(['crashing', 'fast-tracking', 'overtime'])
    expect(m.estado.undo.map((u) => u.kind)).toEqual(['crashing', 'fast-tracking', 'overtime'])
    expect(m.estado.undo.find((u) => u.kind === 'overtime')!.addedDays).toEqual(['2026-10-24', '2026-10-31'])
    expect(entrega(m.estado)).toBe('2027-06-02') // a entrega gravada com os 3 cenários aplicados
  })

  it('P-2: indireto 11.000 e margem 7 viram a v1 com origem "nao-documentada"; valores iguais ao padrão ficam "ilustrativa"', () => {
    const m = migrarRegistro(registro(JSON.stringify(esquema3({ dailyIndirectCost: 11000, safetyMarginDays: 7 })), 3))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    const v = m.estado.premissas[0].valores
    expect([v.custoIndiretoDiario, v.margemDlpDias]).toEqual([11000, 7])
    expect(v.origens.custoIndiretoDiario).toEqual({ origem: 'nao-documentada' })
    expect(v.origens.margemDlpDias).toEqual({ origem: 'nao-documentada' })
    expect(v.origens.adicionalHoraExtraPct).toEqual({ origem: 'ilustrativa' })
    const igual = migrarRegistro(registro(JSON.stringify(esquema3({ safetyMarginDays: 3 })), 3))
    if (igual.tipo !== 'ok') throw new Error('esperava ok')
    expect(igual.estado.premissas[0].valores.origens.custoIndiretoDiario).toEqual({ origem: 'ilustrativa' })
    expect(igual.estado.premissas[0].valores.origens.margemDlpDias).toEqual({ origem: 'ilustrativa' })
  })

  it('indireto ou margem inválidos voltam ao padrão, com aviso', () => {
    for (const meta of [{ dailyIndirectCost: -5 }, { dailyIndirectCost: 'x' }, { safetyMarginDays: 99 }, { safetyMarginDays: 2.5 }]) {
      const m = migrarRegistro(registro(JSON.stringify(esquema3(meta)), 3))
      expect(m.tipo, JSON.stringify(meta)).toBe('ok')
      if (m.tipo !== 'ok') return
      expect(m.avisos).toEqual(['O custo indireto ou a margem da DLP do estado salvo estavam ausentes ou inválidos: valem os valores padrão (ilustrativos) nas premissas da obra.'])
      expect([m.estado.premissas[0].valores.custoIndiretoDiario, m.estado.premissas[0].valores.margemDlpDias]).toEqual([9850, 3])
    }
  })

  it('P-3: a v1 (cronoai-state-v1) chega ao esquema 4 pela cadeia, com as premissas do indireto antigo', () => {
    const r = lerEstadoV1(aurora)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.premissas[0].valores.custoIndiretoDiario).toBe(9850)
    expect(r.estado.premissas[0].valores.origens.custoIndiretoDiario).toEqual({ origem: 'ilustrativa' })
    expect(entrega(r.estado)).toBe('2027-06-23')
  })

  it('Segurança 1: feriado manual com tipo errado (nome ou município numérico) ou tamanho acima do limite é descartado com aviso', () => {
    const base = JSON.parse(JSON.stringify(buildSeedState()))
    const bom = { id: 'f1', data: '2026-08-20', nome: 'Feriado fictício', abrangencia: 'municipal', fonte: 'Lei municipal fictícia', recorrenteAnual: true, uf: 'PE', municipio: 'Cidade Fictícia', extra: 'lixo' }
    base.feriados.manuais = [
      bom,
      { ...bom, id: 'f2', nome: 123 },
      { ...bom, id: 'f3', municipio: 5 },
      { ...bom, id: 'f4', fonte: 'f'.repeat(201) },
      { ...bom, id: 'f5', abrangencia: 'inventada' },
      { ...bom, id: 'f6', data: '2026-02-30' },
      { ...bom, id: '' },
      'texto',
    ]
    const m = migrarRegistro(registro(JSON.stringify(base), 4))
    expect(m.tipo).toBe('ok')
    if (m.tipo !== 'ok') return
    expect(m.avisos).toEqual(['7 feriado(s) manual(is) inválido(s) descartado(s) do estado salvo.'])
    expect(m.estado.feriados.manuais).toEqual([{ id: 'f1', data: '2026-08-20', nome: 'Feriado fictício', abrangencia: 'municipal', fonte: 'Lei municipal fictícia', recorrenteAnual: true, uf: 'PE', municipio: 'Cidade Fictícia' }])
    // feriados válidos: nenhum aviso
    const ok = migrarRegistro(registro(JSON.stringify({ ...base, feriados: { ...base.feriados, manuais: [bom] } }), 4))
    if (ok.tipo !== 'ok') throw new Error('esperava ok')
    expect(ok.avisos).toEqual([])
  })

  it('Segurança 4: esquema 4 com mais de 500 versões de premissas ou motivo acima de 200 caracteres volta à v1 padrão, com aviso', () => {
    const base = JSON.parse(JSON.stringify(buildSeedState()))
    const v = base.premissas[0]
    const muitas = Array.from({ length: 501 }, (_, i) => ({ ...v, versao: i + 1 }))
    const m = migrarRegistro(registro(JSON.stringify({ ...base, premissas: muitas }), 4))
    if (m.tipo !== 'ok') throw new Error('esperava ok')
    expect(m.avisos).toEqual(['Campos ausentes ou inválidos no estado salvo foram preenchidos como vazios: premissas.'])
    expect(m.estado.premissas).toHaveLength(1)
    const longo = migrarRegistro(registro(JSON.stringify({ ...base, premissas: [{ ...v, motivo: 'm'.repeat(201) }] }), 4))
    if (longo.tipo !== 'ok') throw new Error('esperava ok')
    expect(longo.estado.premissas).toHaveLength(1)
    expect(longo.estado.premissas[0].motivo).toBe('Premissas padrão (o estado salvo não tinha premissas válidas)')
  })

  it('P-4: esquema 6 é recusado (e nunca sobrescrito)', () => {
    expect(migrarRegistro(registro(JSON.stringify(esquema3()), 6))).toEqual({ tipo: 'erro', mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 6).' })
  })

  it('P-5: esquema 4 sem premissas ou feriados (ou inválidos) volta ao padrão, com aviso', () => {
    const base = JSON.parse(JSON.stringify(buildSeedState()))
    for (const quebra of [
      (e: Record<string, unknown>) => {
        delete e.premissas
      },
      (e: Record<string, unknown>) => {
        e.premissas = []
      },
      (e: Record<string, unknown>) => {
        e.premissas = [{ versao: 1, vigencia: '2026-05-04', motivo: 'x', valores: { custoIndiretoDiario: -1 } }]
      },
    ]) {
      const e = JSON.parse(JSON.stringify(base))
      quebra(e)
      const m = migrarRegistro(registro(JSON.stringify(e), 4))
      expect(m.tipo).toBe('ok')
      if (m.tipo !== 'ok') return
      expect(m.avisos).toEqual(['Campos ausentes ou inválidos no estado salvo foram preenchidos como vazios: premissas.'])
      expect(m.estado.premissas).toHaveLength(1)
      expect(m.estado.premissas[0]).toMatchObject({ versao: 1, vigencia: '2026-05-04', valores: premissasPadrao() })
    }
    const semFeriados = JSON.parse(JSON.stringify(base))
    semFeriados.feriados = { nacionais: 'sim' }
    const f = migrarRegistro(registro(JSON.stringify(semFeriados), 4))
    if (f.tipo !== 'ok') throw new Error('esperava ok')
    expect(f.avisos[0]).toContain('feriados')
    expect(f.estado.feriados).toEqual({ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] })
  })
})

describe('esquema 4 → 5: referência ao recorte SINAPI e equipe por função (ciclo 00006, AC-15, P-1 e P-4)', () => {
  const registro = (json: string, versaoEsquema: number): RegistroObra => ({ id: 'o1', versaoEsquema, json, atualizadoEm: '2026-10-25T10:00:00.000Z' })
  const SHA = '9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2'
  const CHAVE = 'SP|nao-desonerado|2026-09'
  const ref = { chave: CHAVE, sha256Origem: SHA, importadoEm: '2026-10-25T12:00:00.000Z' }
  /** Aurora no esquema 5 com UF, regime e data-base e uma referência ao recorte (para adulterar). */
  const esquema5 = () => {
    const e = JSON.parse(JSON.stringify(buildSeedState())) as Record<string, unknown> & { meta: Record<string, unknown>; budget: Record<string, unknown>[] }
    e.meta = { ...e.meta, uf: 'SP', regimeSinapi: 'nao-desonerado', dataBaseSinapi: '2026-09', recorteSinapi: { ...ref } }
    return e
  }
  const migrarEsq5 = (e: unknown) => {
    const r = migrarRegistro(registro(JSON.stringify(e), 5))
    if (r.tipo !== 'ok') throw new Error(r.mensagem)
    return r
  }
  const AVISO_REF = 'A referência ao recorte SINAPI do estado salvo estava inválida e foi removida: a obra usa o catálogo ilustrativo.'

  it('o passo 4 → 5 existe e a cadeia termina no esquema 5', () => {
    expect(ESQUEMA_ATUAL).toBe(5)
    expect(MIGRACOES.find((p) => p.de === 4)?.para).toBe(5)
  })

  it('P-1: o registro REAL do esquema 4 (gerado pela store da base 281a99a: premissas v2, calendário alternativo, feriado manual, crashing, hora extra por frente e o undo) migra para o 5 com o resto igual', () => {
    const fx = JSON.parse(fixtureEsquema4) as { registro: RegistroObra; esperado: { tarefas: number; premissas: number; undo: number; calendarios: string[] } }
    expect(fx.registro.versaoEsquema).toBe(4)
    const r = migrarRegistro(fx.registro)
    if (r.tipo !== 'ok') throw new Error(r.mensagem)
    expect(r.avisos).toEqual([])
    // O resto igual: nenhum campo muda, nenhum campo novo aparece
    expect(r.estado).toEqual(JSON.parse(fx.registro.json))
    expect(r.estado.tasks).toHaveLength(fx.esperado.tarefas)
    expect(r.estado.premissas).toHaveLength(fx.esperado.premissas)
    expect(r.estado.undo).toHaveLength(fx.esperado.undo)
    expect(r.estado.calendarios.map((c) => c.nome)).toEqual(fx.esperado.calendarios)
    expect(r.estado.meta.recorteSinapi).toBeUndefined()
    // A próxima gravação já é no esquema 5
    expect(criarRegistro('o1', r.estado, fx.registro.atualizadoEm).versaoEsquema).toBe(5)
  })

  it('esquema 5 com referência e equipe válidas passa intacto (a referência é reconstruída só com os 3 campos)', () => {
    const e = esquema5()
    e.budget[0] = { ...e.budget[0]!, equipe: [{ recurso: 'Servente', proporcao: 0.5 }], fonte: 'SINAPI SP 09/2026 não desonerado' }
    ;(e.meta.recorteSinapi as Record<string, unknown>).extra = 'x'
    const r = migrarEsq5(e)
    expect(r.avisos).toEqual([])
    expect(r.estado.meta.recorteSinapi).toEqual(ref)
    expect(r.estado.budget[0]).toMatchObject({ equipe: [{ recurso: 'Servente', proporcao: 0.5 }], fonte: 'SINAPI SP 09/2026 não desonerado' })
  })

  it.each([
    ['chave fora do formato', { ...ref, chave: 'SP-2026' }],
    ['UF da chave inexistente', { ...ref, chave: 'XX|nao-desonerado|2026-09' }],
    ['SHA-256 fora do padrão', { ...ref, sha256Origem: 'abc' }],
    ['SHA-256 em maiúsculas', { ...ref, sha256Origem: SHA.toUpperCase() }],
    ['data de importação inválida', { ...ref, importadoEm: 'ontem' }],
    ['data de importação gigante', { ...ref, importadoEm: '2026-10-25T12:00:00.000Z'.padEnd(500, '0') }],
    ['chave de outra UF (não bate com os dados SINAPI da obra)', { ...ref, chave: 'BA|nao-desonerado|2026-09' }],
    ['campos de tipo errado', { chave: 7, sha256Origem: null, importadoEm: [] }],
    ['não é objeto', 'SP|nao-desonerado|2026-09'],
  ])('P-4: referência com %s é removida, com aviso', (_nome, adulterada) => {
    const e = esquema5()
    e.meta.recorteSinapi = adulterada
    const r = migrarEsq5(e)
    expect(r.estado.meta.recorteSinapi).toBeUndefined()
    expect(r.avisos).toEqual([AVISO_REF])
    // O resto da obra fica igual
    expect(r.estado.tasks).toEqual((e as unknown as PersistedState).tasks)
  })

  it('P-4: referência numa obra sem UF (ou regime, ou data-base) é removida: nunca se assume nenhum', () => {
    for (const campo of ['uf', 'regimeSinapi', 'dataBaseSinapi']) {
      const e = esquema5()
      delete e.meta[campo]
      expect(migrarEsq5(e).estado.meta.recorteSinapi).toBeUndefined()
    }
  })

  it.each([
    ['recurso vazio', [{ recurso: '', proporcao: 1 }]],
    ['recurso com 61 caracteres', [{ recurso: 'R'.repeat(61), proporcao: 1 }]],
    ['recurso com caractere de controle', [{ recurso: 'Servente\u0007', proporcao: 1 }]],
    ['proporção zero', [{ recurso: 'Servente', proporcao: 0 }]],
    ['proporção negativa', [{ recurso: 'Servente', proporcao: -1 }]],
    ['proporção acima do limite', [{ recurso: 'Servente', proporcao: 10_001 }]],
    ['proporção em texto', [{ recurso: 'Servente', proporcao: '0.5' }]],
    ['17 itens', Array.from({ length: 17 }, () => ({ recurso: 'Servente', proporcao: 1 }))],
    ['não é lista', { recurso: 'Servente', proporcao: 1 }],
    ['item que não é objeto', ['Servente']],
  ])('P-4: equipe com %s é removida da linha com aviso, e a linha volta ao helperRatio', (_nome, equipe) => {
    const e = esquema5()
    const original = e.budget[0]!
    e.budget[0] = { ...original, equipe }
    const r = migrarEsq5(e)
    expect('equipe' in r.estado.budget[0]!).toBe(false)
    expect(r.estado.budget[0]!.helperRatio).toBe(original.helperRatio)
    expect(r.avisos).toEqual(['1 linha(s) da planilha com equipe ou fonte inválida voltaram à equipe padrão (serventes por oficial).'])
  })

  it('P-4: fonte da linha inválida (texto longo, controle ou não texto) é removida; as linhas boas ficam', () => {
    const e = esquema5()
    e.budget[0] = { ...e.budget[0]!, fonte: 'F'.repeat(81) }
    e.budget[1] = { ...e.budget[1]!, fonte: 42 }
    e.budget[2] = { ...e.budget[2]!, fonte: 'SINAPI SP 09/2026 não desonerado' }
    const r = migrarEsq5(e)
    expect(r.estado.budget.map((l) => l.fonte)).toEqual([undefined, undefined, 'SINAPI SP 09/2026 não desonerado', undefined, undefined])
    expect(r.avisos).toEqual(['2 linha(s) da planilha com equipe ou fonte inválida voltaram à equipe padrão (serventes por oficial).'])
  })

  it('o mesmo saneamento vale para um registro do esquema 4 adulterado com os campos novos (nada passa por estar numa versão antiga)', () => {
    const e = esquema5()
    const r = migrarRegistro(registro(JSON.stringify({ ...e, meta: { ...e.meta, recorteSinapi: { chave: 'lixo' } } }), 4))
    if (r.tipo !== 'ok') throw new Error(r.mensagem)
    expect(r.estado.meta.recorteSinapi).toBeUndefined()
    expect(r.avisos).toContain(AVISO_REF)
  })

  it('P-4: o esquema 6 é recusado e nunca sobrescrito', () => {
    expect(migrarRegistro(registro(JSON.stringify(esquema5()), 6))).toEqual({ tipo: 'erro', mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 6).' })
  })
})
