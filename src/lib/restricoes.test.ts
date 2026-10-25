import { describe, expect, it } from 'vitest'
import { calendarioPadrao } from './calendarioTrabalho'
import { ROTULO_RESTRICAO, TIPOS_RESTRICAO, calendarioExiste, montarRestricao, restricaoTemData, tipoDaRestricao, validarPrazoFinal, validarRestricao } from './restricoes'

const INICIO = '2026-05-04'
const MSG_DATA = 'Informe uma data válida (aaaa-mm-dd, ou aaaa-mm-ddThh:mm com a hora).'

describe('validação de restrição e prazo final', () => {
  it('ASAP e ALAP não pedem data; os 6 tipos com data pedem', () => {
    expect(TIPOS_RESTRICAO).toEqual(['ASAP', 'ALAP', 'SNET', 'SNLT', 'MSO', 'MFO', 'FNET', 'FNLT'])
    expect(validarRestricao('ASAP', undefined, INICIO)).toEqual([])
    expect(validarRestricao('ALAP', undefined, INICIO)).toEqual([])
    for (const tipo of ['SNET', 'SNLT', 'MSO', 'MFO', 'FNET', 'FNLT']) {
      expect(restricaoTemData(tipo)).toBe(true)
      expect(validarRestricao(tipo, undefined, INICIO)).toEqual([MSG_DATA])
      expect(validarRestricao(tipo, '2026-08-12', INICIO)).toEqual([])
    }
    expect(restricaoTemData('ALAP')).toBe(false)
    for (const tipo of TIPOS_RESTRICAO) expect(ROTULO_RESTRICAO[tipo].length).toBeGreaterThan(5)
  })

  it('recusa tipo desconhecido, data inválida e data fora da faixa de 45 anos', () => {
    expect(validarRestricao('XYZ', '2026-08-12', INICIO)).toEqual(['Tipo de restrição desconhecido.'])
    expect(validarRestricao('SNET', 'ontem', INICIO)).toEqual([MSG_DATA])
    expect(validarRestricao('SNET', '2026-02-30', INICIO)).toEqual([MSG_DATA])
    expect(validarRestricao('SNET', '2026-08-12T25:00', INICIO)).toEqual([MSG_DATA])
    expect(validarRestricao('SNET', '9999-12-31', INICIO)).toEqual(['A data deve estar a menos de 45 anos do início da obra.'])
    expect(validarRestricao('MSO', '2026-08-12T14:30', INICIO)).toEqual([])
  })

  it('prazo final vazio remove; data inválida ou absurda é recusada', () => {
    expect(validarPrazoFinal(undefined, INICIO)).toEqual([])
    expect(validarPrazoFinal('', INICIO)).toEqual([])
    expect(validarPrazoFinal('2026-12-31', INICIO)).toEqual([])
    expect(validarPrazoFinal('31/12/2026', INICIO)).toEqual([MSG_DATA])
    expect(validarPrazoFinal('2200-01-01', INICIO)).toEqual(['A data deve estar a menos de 45 anos do início da obra.'])
  })

  it('calendário inexistente é recusado; o padrão (sem UID) sempre vale', () => {
    const cals = [calendarioPadrao([]), { ...calendarioPadrao([]), uid: 2 }]
    expect(calendarioExiste(cals, undefined)).toBe(true)
    expect(calendarioExiste(cals, 2)).toBe(true)
    expect(calendarioExiste(cals, 7)).toBe(false)
  })

  it('monta a restrição do domínio: ASAP some, ALAP sem data, os outros com data (e hora, se vier)', () => {
    expect(montarRestricao('ASAP', undefined)).toBeUndefined()
    expect(montarRestricao('ALAP', '2026-08-12')).toEqual({ tipo: 'ALAP' })
    expect(montarRestricao('FNLT', '2026-08-12')).toEqual({ tipo: 'FNLT', data: '2026-08-12' })
    expect(montarRestricao('MSO', '2026-08-12T14:30:00')).toEqual({ tipo: 'MSO', data: '2026-08-12T14:30' })
    expect(tipoDaRestricao(undefined)).toBe('ASAP')
    expect(tipoDaRestricao({ tipo: 'MFO', data: '2026-08-12' })).toBe('MFO')
  })
})
