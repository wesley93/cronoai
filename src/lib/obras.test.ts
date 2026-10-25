import { describe, expect, it } from 'vitest'
import { UFS } from '@/data/ufs'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { avaliarCota, dataLocalISO, descreverTabelaSinapi, estadoObraVazia, nomeDaCopia, percentualCota, resumirObra, validarDadosObra, validarIndice, type DadosObra } from './obras'

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

describe('validarDadosObra · datas e avanço', () => {
  const comAvanco = { inicioOriginal: '2026-05-04', statusOriginal: '2026-10-23', comAvanco: true, primeiroInicioReal: '2026-05-06' }
  const semAvanco = { inicioOriginal: '2026-05-04', statusOriginal: '2026-05-04', comAvanco: false }
  const dados = { ...valido, dataInicio: '2026-05-04', dataStatus: '2026-10-23' }

  it('criação de obra futura é livre: início depois da data de status é aceito', () => {
    expect(validarDadosObra({ ...dados, dataInicio: '2026-12-01', dataStatus: '2026-10-26' })).toEqual([])
  })

  it('obra sem avanço fica livre na edição: adiar o início mantendo a data de status é aceito', () => {
    expect(validarDadosObra({ ...dados, dataInicio: '2026-06-01', dataStatus: '2026-05-04' }, semAvanco)).toEqual([])
    expect(validarDadosObra({ ...dados, dataStatus: '2026-01-01' }, semAvanco)).toEqual([])
  })

  it('com avanço, o início não pode ser depois da data de status', () => {
    expect(validarDadosObra({ ...dados, dataInicio: '2026-10-26' }, comAvanco)).toEqual([
      'A data de início não pode ser depois da data de status.',
      'A data de início não pode ser depois do primeiro início real da obra (06/05/2026).',
    ])
    expect(validarDadosObra({ ...dados, dataInicio: '2026-05-06' }, comAvanco)).toEqual([])
  })

  it('com avanço, o início não pode passar do primeiro início real', () => {
    expect(validarDadosObra({ ...dados, dataInicio: '2026-05-07' }, comAvanco)).toEqual([
      'A data de início não pode ser depois do primeiro início real da obra (06/05/2026).',
    ])
  })

  it('com avanço, a data de status não pode ficar antes do início nem do primeiro início real', () => {
    expect(validarDadosObra({ ...dados, dataStatus: '2026-05-03' }, comAvanco)).toEqual([
      'A data de status não pode ser anterior à data de início.',
      'A data de status não pode ser anterior ao primeiro início real da obra (06/05/2026).',
    ])
    expect(validarDadosObra({ ...dados, dataStatus: '2026-05-05' }, comAvanco)).toEqual([
      'A data de status não pode ser anterior ao primeiro início real da obra (06/05/2026).',
    ])
    expect(validarDadosObra({ ...dados, dataStatus: '2026-05-06' }, comAvanco)).toEqual([])
  })

  it('com avanço mas sem início real (só % concluído), confere apenas início × status', () => {
    const c = { ...comAvanco, primeiroInicioReal: undefined }
    expect(validarDadosObra({ ...dados, dataStatus: '2026-05-03' }, c)).toEqual(['A data de status não pode ser anterior à data de início.'])
  })

  it('datas herdadas incoerentes não bloqueiam a edição de outros campos (as datas não mudaram)', () => {
    const c = { inicioOriginal: '2026-05-04', statusOriginal: '2026-01-01', comAvanco: true, primeiroInicioReal: '2026-01-10' }
    expect(validarDadosObra({ ...dados, dataStatus: '2026-01-01' }, c)).toEqual([])
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
    const e = estadoObraVazia(valido)
    expect(e.tasks).toEqual([])
    expect(e.meta).toEqual({
      name: 'Residencial Teste',
      company: '',
      manager: 'Eng. Fulana',
      startDate: '2026-11-03',
      statusDate: '2026-11-03',
      uf: 'PE',
      municipio: 'Recife',
      regimeSinapi: 'desonerado',
      dataBaseSinapi: '2026-09',
    })
    expect(e.calendarioPadraoUid).toBe(1)
    expect(e.calendarios).toHaveLength(1)
    // Antes do ciclo 00005 os feriados eram exceções fixas de 4 anos; agora o calendário aplica os feriados da obra (qualquer ano)
    expect(e.calendarios[0].aplicaFeriadosObra).toBe(true)
    expect(e.calendarios[0].excecoes).toEqual([])
    expect(e.feriados).toEqual({ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] })
    const cals = compilarCalendarios(e.meta.startDate, e.calendarios, e.calendarioPadraoUid)
    expect(cals.padrao.dataUtil('2026-12-25')).toBe(false) // Natal
    expect(cals.padrao.dataUtil('2030-12-25')).toBe(false) // além dos 4 anos de antes
    expect(cals.padrao.dataUtil('2026-12-24')).toBe(true)
  })

  it('sem UF, município, regime e data-base, esses campos não existem', () => {
    const e = estadoObraVazia({ nome: ' Obra ', dataInicio: '2026-11-03', dataStatus: '2026-11-03' })
    expect(Object.keys(e.meta).sort()).toEqual(['company', 'manager', 'name', 'startDate', 'statusDate'])
    expect(e.meta.name).toBe('Obra')
  })

  it('o cronograma da obra em branco termina no início (0 tarefas)', () => {
    const e = estadoObraVazia(valido)
    const s = computeSchedule(e.tasks, compilarCalendarios(e.meta.startDate, e.calendarios, e.calendarioPadraoUid), { mode: 'forecast', statusDate: e.meta.statusDate })
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
    const e = estadoObraVazia(valido)
    expect(resumirObra('o1', e, '2026-10-25T10:00:00.000Z')).toEqual({
      id: 'o1',
      nome: 'Residencial Teste',
      uf: 'PE',
      municipio: 'Recife',
      responsavel: 'Eng. Fulana',
      atualizadoEm: '2026-10-25T10:00:00.000Z',
    })
    const nu = estadoObraVazia({ nome: 'Sem', dataInicio: '2026-11-03', dataStatus: '2026-11-03' })
    expect(resumirObra('o2', nu, 'x')).toEqual({ id: 'o2', nome: 'Sem', atualizadoEm: 'x' })
  })
})

describe('descreverTabelaSinapi', () => {
  it('sem UF, diz que a UF não foi informada', () => {
    expect(descreverTabelaSinapi({})).toBe('UF da obra não informada: o catálogo é ilustrativo.')
  })

  it('com UF, data-base e regime, cita os três', () => {
    expect(descreverTabelaSinapi({ uf: 'PE', dataBaseSinapi: '2026-09', regimeSinapi: 'nao-desonerado' })).toBe(
      'Catálogo SINAPI ilustrativo: não corresponde a PE · 09/2026 · não desonerado.',
    )
  })

  it('com só a UF, cita apenas a UF', () => {
    expect(descreverTabelaSinapi({ uf: 'PE' })).toBe('Catálogo SINAPI ilustrativo: não corresponde a PE.')
  })
})

describe('dataLocalISO', () => {
  it('usa a data local, não a UTC', () => {
    // 23:30 do dia 25 no horário local: em UTC (Brasil, UTC-3) já seria dia 26
    expect(dataLocalISO(new Date(2026, 9, 25, 23, 30))).toBe('2026-10-25')
    expect(dataLocalISO(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05')
  })
})

describe('validarIndice', () => {
  const ok = { versaoIndice: 1, obraAtivaId: 'a', obras: [{ id: 'a', nome: 'A', atualizadoEm: '2026-10-25T10:00:00.000Z' }] }

  it('aceita o índice válido, com e sem migração', () => {
    expect(validarIndice(ok)).toEqual({ tipo: 'ok', indice: ok })
    const comMig = { ...ok, migracaoV1: { em: '2026-10-25T10:00:00.000Z', resultado: 'migrado' } }
    expect(validarIndice(comMig).tipo).toBe('ok')
  })

  it('recusa índice de versão mais nova com mensagem própria', () => {
    expect(validarIndice({ ...ok, versaoIndice: 2 })).toEqual({
      tipo: 'invalido',
      mensagem: 'O índice das obras foi salvo por uma versão mais nova do CronoAI (índice 2). Nada foi gravado.',
    })
  })

  it('recusa formatos inválidos', () => {
    const ruins: unknown[] = [
      null,
      'x',
      [],
      { ...ok, versaoIndice: undefined },
      { ...ok, versaoIndice: 0 },
      { ...ok, obraAtivaId: 7 },
      { ...ok, obras: 'x' },
      { ...ok, obras: [{ id: 'a', nome: 'A' }] },
      { ...ok, obras: [{ id: '', nome: 'A', atualizadoEm: 'x' }] },
      { ...ok, obras: [null] },
      { ...ok, migracaoV1: { em: 'x', resultado: 'talvez' } },
      { ...ok, migracaoV1: 'x' },
    ]
    for (const ruim of ruins) {
      const r = validarIndice(ruim)
      expect(r.tipo).toBe('invalido')
    }
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
