import { describe, expect, it } from 'vitest'
import { UFS } from '@/data/ufs'
import { WorkCalendar } from './calendar'
import { computeSchedule } from './cpm'
import { avaliarCota, estadoObraVazia, nomeDaCopia, percentualCota, resumirObra, validarDadosObra, type DadosObra } from './obras'

const valido: DadosObra = {
  nome: 'Residencial Teste',
  uf: 'PE',
  municipio: 'Recife',
  responsavel: 'Eng. Fulana',
  dataInicio: '2026-11-03',
  dataStatus: '2026-11-03',
  regimeSinapi: 'desonerado',
  dataBaseSinapi: '2026-09',
}

describe('validarDadosObra', () => {
  it('aceita dados completos e só o essencial', () => {
    expect(validarDadosObra(valido)).toEqual([])
    expect(validarDadosObra({ nome: 'X', dataInicio: '2026-01-02', dataStatus: '2026-01-02' })).toEqual([])
    expect(validarDadosObra({ ...valido, uf: '', regimeSinapi: '', dataBaseSinapi: '' })).toEqual([])
  })

  it('recusa nome vazio e com 121 caracteres', () => {
    expect(validarDadosObra({ ...valido, nome: '  ' })).toEqual(['Informe o nome da obra.'])
    expect(validarDadosObra({ ...valido, nome: 'a'.repeat(121) })).toEqual(['O nome da obra deve ter no máximo 120 caracteres.'])
    expect(validarDadosObra({ ...valido, nome: 'a'.repeat(120) })).toEqual([])
  })

  it('recusa UF fora das 27', () => {
    expect(validarDadosObra({ ...valido, uf: 'XX' as never })).toEqual(['Selecione uma UF válida.'])
  })

  it('valida data-base AAAA-MM: 2026-13 erro, 2026-09 ok', () => {
    expect(validarDadosObra({ ...valido, dataBaseSinapi: '2026-13' })).toEqual(['A data-base do SINAPI deve estar no formato AAAA-MM (ex.: 2026-09).'])
    expect(validarDadosObra({ ...valido, dataBaseSinapi: '2026-09' })).toEqual([])
  })

  it('limita município (80) e responsável (120)', () => {
    expect(validarDadosObra({ ...valido, municipio: 'm'.repeat(81) })).toEqual(['O município deve ter no máximo 80 caracteres.'])
    expect(validarDadosObra({ ...valido, municipio: 'm'.repeat(80) })).toEqual([])
    expect(validarDadosObra({ ...valido, responsavel: 'r'.repeat(121) })).toEqual(['O responsável deve ter no máximo 120 caracteres.'])
  })

  it('valida datas e regime', () => {
    expect(validarDadosObra({ ...valido, dataInicio: '2026-02-30' })).toEqual(['Informe uma data de início válida.'])
    expect(validarDadosObra({ ...valido, dataStatus: 'amanha' })).toEqual(['Informe uma data de status válida.'])
    expect(validarDadosObra({ ...valido, regimeSinapi: 'x' as never })).toEqual(['Selecione um regime SINAPI válido.'])
  })
})

describe('UFS', () => {
  it('tem 27 UFs sem repetição', () => {
    expect(UFS.length).toBe(27)
    expect(new Set(UFS.map((u) => u.sigla)).size).toBe(27)
  })
})

describe('estadoObraVazia', () => {
  it('monta obra sem tarefas, com UF só se informada (C-4)', () => {
    const e = estadoObraVazia(valido, 9850)
    expect(e.tasks).toEqual([])
    expect(e.meta).toEqual({
      name: 'Residencial Teste',
      company: '',
      manager: 'Eng. Fulana',
      startDate: '2026-11-03',
      statusDate: '2026-11-03',
      dailyIndirectCost: 9850,
      uf: 'PE',
      municipio: 'Recife',
      regimeSinapi: 'desonerado',
      dataBaseSinapi: '2026-09',
    })
    expect(e.calendar.holidays).toContain('2026-12-25')
    expect(e.calendar.extraWorkingDays).toEqual([])
  })

  it('sem UF, município, regime e data-base, esses campos não existem', () => {
    const e = estadoObraVazia({ nome: ' Obra ', dataInicio: '2026-11-03', dataStatus: '2026-11-03' }, 1)
    expect(Object.keys(e.meta).sort()).toEqual(['company', 'dailyIndirectCost', 'manager', 'name', 'startDate', 'statusDate'])
    expect(e.meta.name).toBe('Obra')
  })

  it('o cronograma da obra em branco termina no início (0 tarefas)', () => {
    const e = estadoObraVazia(valido, 9850)
    const s = computeSchedule(e.tasks, new WorkCalendar(e.meta.startDate, e.calendar), { mode: 'forecast', statusDate: e.meta.statusDate })
    expect(s.projectFinish).toBe('2026-11-03')
  })
})

describe('nomeDaCopia e resumirObra', () => {
  it('acrescenta "(cópia)" e numera quando já existe', () => {
    expect(nomeDaCopia('Aurora')).toBe('Aurora (cópia)')
    expect(nomeDaCopia('Aurora', ['Aurora (cópia)'])).toBe('Aurora (cópia 2)')
    expect(nomeDaCopia('Aurora', ['Aurora (cópia)', 'Aurora (cópia 2)'])).toBe('Aurora (cópia 3)')
  })

  it('resume com os campos opcionais só quando existem', () => {
    const e = estadoObraVazia(valido, 1)
    expect(resumirObra('o1', e, '2026-10-25T10:00:00.000Z')).toEqual({
      id: 'o1',
      nome: 'Residencial Teste',
      uf: 'PE',
      municipio: 'Recife',
      responsavel: 'Eng. Fulana',
      atualizadoEm: '2026-10-25T10:00:00.000Z',
    })
    const nu = estadoObraVazia({ nome: 'Sem', dataInicio: '2026-11-03', dataStatus: '2026-11-03' }, 1)
    expect(resumirObra('o2', nu, 'x')).toEqual({ id: 'o2', nome: 'Sem', atualizadoEm: 'x' })
  })
})

describe('cota de armazenamento', () => {
  it('alerta a partir de 80% do uso', () => {
    expect(avaliarCota(80, 100)).toBe('alerta')
    expect(avaliarCota(79.9, 100)).toBe('ok')
    expect(avaliarCota(10, 0)).toBe('indisponivel')
    expect(avaliarCota(undefined, undefined)).toBe('indisponivel')
    expect(avaliarCota(Number.NaN, 100)).toBe('indisponivel')
  })

  it('calcula o percentual', () => {
    expect(percentualCota(50, 200)).toBe(25)
    expect(percentualCota(1, 0)).toBeUndefined()
  })
})
