import { describe, expect, it } from 'vitest'
import aurora from './__fixtures__/estado-v1-aurora.json?raw'
import aurora75 from './__fixtures__/estado-v1-aurora-75.json?raw'
import auroraCenarios from './__fixtures__/estado-v2-aurora-cenarios.json?raw'
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
import type { PersistedState, RegistroObra } from '@/types/obra'

// Ano usado quando a obra não informa a data de início (os testes fixam 2026 para os feriados serem previsíveis)
const ANO = 2026
const lerEstadoV1 = (raw: string | null | undefined) => lerV1(raw, ANO)
const migrarRegistro = (reg: RegistroObra | undefined) => migrar(reg, ANO)
const feriadosDe = (e: PersistedState) => e.calendarios[0].excecoes.filter((x) => x.intervalos.length === 0).map((x) => x.data)
const extrasDe = (e: PersistedState) => e.calendarios[0].excecoes.filter((x) => x.intervalos.length > 0).map((x) => x.data)
const entrega = (e: PersistedState) =>
  computeSchedule(e.tasks, compilarCalendarios(e.meta.startDate, e.calendarios, e.calendarioPadraoUid), { mode: 'forecast', statusDate: e.meta.statusDate }).projectFinish

describe('lerEstadoV1', () => {
  it('lê a fixture completa da v1 sem avisos e a leva ao esquema 3 com os mesmos números (AC-1, M-1)', () => {
    const r = lerEstadoV1(aurora)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.avisos).toEqual([])
    expect(r.estado.tasks).toHaveLength(29)
    const antigo = JSON.parse(aurora)
    // Tudo que não é tempo ou calendário fica igual
    expect(r.estado.meta).toEqual(antigo.meta)
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

  it('sem startDate válido, usa o ano recebido de quem chama', () => {
    const base = JSON.parse(aurora)
    const r = lerV1(JSON.stringify({ ...base, calendar: undefined, meta: { ...base.meta, startDate: undefined } }), 2031)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(feriadosDe(r.estado)).toEqual(defaultHolidays(2031, 2034))
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
    expect(reg.versaoEsquema).toBe(3)
    expect(migrarRegistro(reg)).toEqual({ tipo: 'ok', estado: JSON.parse(JSON.stringify(estado)), avisos: [] })
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
    expect(MIGRACOES.map((p) => [p.de, p.para])).toEqual([[1, 2], [2, 3]])
    expect(MIGRACOES.at(-1)?.para).toBe(ESQUEMA_ATUAL)
  })

  it('recusa esquema mais novo que o do app (AC-4, M-6, P-3)', () => {
    expect(migrarRegistro(registro(aurora, 99))).toEqual({
      tipo: 'erro',
      mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 99).',
    })
    expect(migrarRegistro(registro(aurora, 4))).toEqual({
      tipo: 'erro',
      mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 4).',
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

  it('erra quando falta o passo da cadeia', () => {
    const passos = MIGRACOES.splice(0, MIGRACOES.length)
    try {
      expect(migrarRegistro(registro(aurora, 1))).toEqual({ tipo: 'erro', mensagem: 'Não há migração do esquema 1 para o 2.' })
    } finally {
      MIGRACOES.push(...passos)
    }
  })
})
