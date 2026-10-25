import { describe, expect, it } from 'vitest'
import aurora from './__fixtures__/estado-v1-aurora.json?raw'
import aurora75 from './__fixtures__/estado-v1-aurora-75.json?raw'
import { ESQUEMA_ATUAL, MIGRACOES, criarRegistro, lerEstadoV1 as lerV1, migrarRegistro as migrar } from './migracaoEstado'
import { defaultHolidays } from './calendar'
import type { RegistroObra } from '@/types/obra'

// Ano usado quando a obra não informa a data de início (os testes fixam 2026 para os feriados serem previsíveis)
const ANO = 2026
const lerEstadoV1 = (raw: string | null | undefined) => lerV1(raw, ANO)
const migrarRegistro = (reg: RegistroObra | undefined) => migrar(reg, ANO)

describe('lerEstadoV1', () => {
  it('lê a fixture completa da v1 sem avisos e sem mudar o estado (AC-1, M-1)', () => {
    const r = lerEstadoV1(aurora)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.avisos).toEqual([])
    expect(r.estado).toEqual(JSON.parse(aurora))
    expect(r.estado.tasks).toHaveLength(29)
  })

  it('lê a fixture com o apontamento aprovado (UID 104 com 75%)', () => {
    const r = lerEstadoV1(aurora75)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.tasks.find((t) => t.uid === 104)?.percentComplete).toBe(75)
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
    expect(r.estado.calendar.extraWorkingDays).toEqual([])
    // Início da obra em 2026-05-04: feriados nacionais de 2026 a 2029
    expect(r.estado.calendar.holidays).toEqual(defaultHolidays(2026, 2029))
    expect(r.avisos[0]).toContain('calendar')
  })

  it('o ano dos feriados vem da data de início da obra, não de um ano fixo', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: undefined, meta: { ...base.meta, startDate: '2028-03-01' } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.calendar.holidays).toEqual(defaultHolidays(2028, 2031))
  })

  it('sem startDate válido, usa o ano recebido de quem chama', () => {
    const base = JSON.parse(aurora)
    const r = lerV1(JSON.stringify({ ...base, calendar: undefined, meta: { ...base.meta, startDate: undefined } }), 2031)
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.calendar.holidays).toEqual(defaultHolidays(2031, 2034))
  })

  it('calendário só com feriados: preserva os feriados e completa só os dias extras', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: { holidays: ['2026-11-20'] } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.calendar).toEqual({ holidays: ['2026-11-20'], extraWorkingDays: [] })
    expect(r.avisos[0]).toContain('calendar')
  })

  it('calendário só com dias extras: preserva os extras e completa os feriados', () => {
    const base = JSON.parse(aurora)
    const r = lerEstadoV1(JSON.stringify({ ...base, calendar: { extraWorkingDays: ['2026-11-21'] } }))
    expect(r.tipo).toBe('ok')
    if (r.tipo !== 'ok') return
    expect(r.estado.calendar).toEqual({ holidays: defaultHolidays(2026, 2029), extraWorkingDays: ['2026-11-21'] })
  })
})

describe('migrarRegistro', () => {
  const registro = (json: string, versaoEsquema = ESQUEMA_ATUAL): RegistroObra => ({ id: 'o1', versaoEsquema, json, atualizadoEm: '2026-10-25T10:00:00.000Z' })

  it('o registro criado volta igual ao estado gravado', () => {
    const l = lerEstadoV1(aurora)
    if (l.tipo !== 'ok') throw new Error('fixture inválida')
    const reg = criarRegistro('o1', l.estado, '2026-10-25T10:00:00.000Z')
    expect(reg.versaoEsquema).toBe(2)
    expect(migrarRegistro(reg)).toEqual({ tipo: 'ok', estado: JSON.parse(aurora), avisos: [] })
  })

  it('leva o esquema 1 ao atual pela cadeia sem mudar o estado', () => {
    const m = migrarRegistro(registro(aurora, 1))
    expect(m.tipo).toBe('ok')
    if (m.tipo === 'ok') expect(m.estado).toEqual(JSON.parse(aurora))
  })

  it('a cadeia cobre todos os esquemas até o atual, sem buracos', () => {
    expect(MIGRACOES.map((p) => [p.de, p.para])).toEqual([[1, 2]])
    expect(MIGRACOES.at(-1)?.para).toBe(ESQUEMA_ATUAL)
  })

  it('recusa esquema mais novo que o do app (AC-4, M-6)', () => {
    expect(migrarRegistro(registro(aurora, 99))).toEqual({
      tipo: 'erro',
      mensagem: 'Obra salva por uma versão mais nova do CronoAI (esquema 99).',
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
    const base = JSON.parse(aurora)
    const m = migrarRegistro(registro(JSON.stringify({ ...base, tasks: [] })))
    expect(m.tipo).toBe('ok')
    if (m.tipo === 'ok') expect(m.estado.tasks).toEqual([])
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
