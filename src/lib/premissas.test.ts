import { describe, expect, it } from 'vitest'
import type { PremissasObra, VersaoPremissas } from '@/types/domain'
import { brazilianHolidays } from './calendar'
import { calendarioPadrao, compilarCalendarios } from './calendarioTrabalho'
import { fmtBRLCents } from './format'
import {
  custoIndiretoDiarioDeMensal,
  descreverPremissasDeCenario,
  diasUteisNoAno,
  memoriaPremissas,
  premissasPadrao,
  rotuloVersao,
  taxaEfetiva,
  taxaHora,
  validarNovaVersao,
  validarPremissas,
  versaoVigente,
  versoesValidas,
} from './premissas'

const versao = (n: number, vigencia: string, indireto = 9850): VersaoPremissas => ({
  versao: n,
  vigencia,
  motivo: 'teste',
  valores: { ...premissasPadrao(), custoIndiretoDiario: indireto },
})

describe('premissas padrão (os valores que eram constantes no código)', () => {
  it('são os números de antes do ciclo 00005, todos ilustrativos', () => {
    const p = premissasPadrao()
    expect(p.custoIndiretoDiario).toBe(9850)
    expect(p.taxaFuncaoNaoCadastrada).toBe(30)
    expect(p.perdaCongestionamentoPct).toBe(5)
    expect(1 + p.perdaCongestionamentoPct / 100).toBe(1.05) // conferido em ponto flutuante
    expect(p.mobilizacaoPorProfissional).toBe(1200)
    expect(p.adicionalHoraExtraPct).toBe(50)
    expect(p.adicionalHoraExtraPct / 100).toBe(0.5)
    expect(p.contingenciaRetrabalhoPct).toBe(4)
    expect(p.contingenciaRetrabalhoPct / 100).toBe(0.04)
    expect(p.margemDlpDias).toBe(3)
    expect(p.encargosSociaisPct).toBeUndefined() // nenhum número inventado
    expect(p.taxas).toHaveLength(10)
    expect(p.taxas.find((t) => t.funcao === 'Pedreiro')).toEqual({ funcao: 'Pedreiro', valorHora: 31.4, incluiEncargos: true, origem: 'ilustrativa' })
    expect(Object.values(p.origens).every((o) => o?.origem === 'ilustrativa')).toBe(true)
    expect(validarPremissas(p)).toEqual([])
  })
})

describe('PR-3: indireto mensal → diário (gate P1 = a: mensal × 12 ÷ dias úteis do ano)', () => {
  const cal = (feriados: string[]) => compilarCalendarios('2026-05-04', [calendarioPadrao(feriados)], 1).padrao

  it('2026 com Carnaval e Corpus Christi tem 249 dias úteis: R$ 249.000/mês = R$ 12.000/dia exatos', () => {
    const dias = diasUteisNoAno(cal(brazilianHolidays(2026)), 2026)
    expect(dias).toBe(249) // 261 dias de seg a sex menos 12 feriados em dia de semana
    expect(custoIndiretoDiarioDeMensal(249000, dias)).toEqual({ ok: true, valor: 12000 })
  })

  it('sem Carnaval e Corpus Christi são 252: R$ 11.857,142857…/dia, exibido R$ 11.857,14', () => {
    const feriados = brazilianHolidays(2026).filter((d) => !['2026-02-16', '2026-02-17', '2026-06-04'].includes(d))
    const dias = diasUteisNoAno(cal(feriados), 2026)
    expect(dias).toBe(252)
    const r = custoIndiretoDiarioDeMensal(249000, dias)
    expect(r.ok && r.valor).toBeCloseTo(11857.142857, 6) // o cálculo usa o valor sem arredondar
    expect(fmtBRLCents(r.ok ? r.valor : 0).replaceAll(String.fromCharCode(160), ' ')).toBe('R$ 11.857,14')
  })

  it('sem dia útil no ano ou valor inválido: recusa com mensagem, nunca Infinity', () => {
    expect(custoIndiretoDiarioDeMensal(1000, 0)).toEqual({ ok: false, erro: 'O calendário padrão não tem dia útil nesse ano; não é possível converter o custo mensal.' })
    expect(custoIndiretoDiarioDeMensal(-1, 249).ok).toBe(false)
    expect(custoIndiretoDiarioDeMensal(Number.NaN, 249).ok).toBe(false)
    expect(custoIndiretoDiarioDeMensal(0, 249)).toEqual({ ok: true, valor: 0 })
  })
})

describe('PR-4: versão vigente e rótulo', () => {
  const v = [versao(1, '2026-05-04'), versao(2, '2026-10-23', 12000), versao(3, '2026-11-01', 15000)]

  it('a vigente é a de maior número com vigência até a data de status', () => {
    expect(versaoVigente(v, '2026-10-23')?.versao).toBe(2)
    expect(versaoVigente(v, '2026-10-31')?.versao).toBe(2)
    expect(versaoVigente(v, '2026-11-01')?.versao).toBe(3)
    expect(versaoVigente(v, '2026-05-04')?.versao).toBe(1)
    expect(versaoVigente(v, '2026-01-01')?.versao).toBe(1) // antes de tudo: a v1 vale desde o início
    expect(versaoVigente([], '2026-10-23')).toBeUndefined()
  })

  it('rótulo "Premissas v3 — vigência 01/11/2026"', () => {
    expect(rotuloVersao(v[2])).toBe('Premissas v3 — vigência 01/11/2026')
    expect(rotuloVersao(v[1])).toBe('Premissas v2 — vigência 23/10/2026')
  })

  it('vigência retroativa é recusada; igual à da última é aceita', () => {
    const nova = { vigencia: '2026-10-01', motivo: 'ajuste', valores: premissasPadrao() }
    expect(validarNovaVersao(v, nova)).toEqual(['A vigência deve ser igual ou posterior à da versão 3 (01/11/2026).'])
    expect(validarNovaVersao(v, { ...nova, vigencia: '2026-11-01' })).toEqual([])
    expect(validarNovaVersao(v, { ...nova, vigencia: '2027-01-10' })).toEqual([]) // futura: vira "agendada"
  })

  it('exige vigência válida e motivo (até 200 caracteres)', () => {
    const base = { vigencia: '2026-11-01', motivo: 'ajuste', valores: premissasPadrao() }
    expect(validarNovaVersao(v, { ...base, vigencia: '2026-02-30' })).toEqual(['Informe uma data de vigência válida.'])
    expect(validarNovaVersao(v, { ...base, motivo: '  ' })).toEqual(['Informe o motivo da alteração.'])
    expect(validarNovaVersao(v, { ...base, motivo: 'x'.repeat(201) })).toEqual(['O motivo deve ter no máximo 200 caracteres.'])
    expect(validarNovaVersao(v, { ...base, motivo: 'x'.repeat(200) })).toEqual([])
  })

  it('versoesValidas: sequência 1..n, vigência real e valores válidos', () => {
    expect(versoesValidas(v)).toBe(true)
    expect(versoesValidas([])).toBe(false)
    expect(versoesValidas([versao(2, '2026-05-04')])).toBe(false)
    expect(versoesValidas([versao(1, '2026-13-04')])).toBe(false)
    expect(versoesValidas('x')).toBe(false)
  })
})

describe('PR-5: taxa sem encargos', () => {
  it('R$ 20,00/h sem encargos com encargos de 57% vale R$ 31,40/h', () => {
    const p: PremissasObra = {
      ...premissasPadrao(),
      encargosSociaisPct: 57,
      taxas: [{ funcao: 'Pedreiro', valorHora: 20, incluiEncargos: false, origem: 'acordo-coletivo' }],
    }
    expect(taxaHora(p, 'Pedreiro')).toBeCloseTo(31.4, 2) // 20 × 1,57
    expect(taxaEfetiva(p.taxas[0], 57)).toBeCloseTo(31.4, 2)
    expect(validarPremissas(p)).toEqual([])
  })

  it('taxa com encargos não é alterada pelos encargos; sem encargos informados a taxa fica como está', () => {
    const p = { ...premissasPadrao(), encargosSociaisPct: 57 }
    expect(taxaHora(p, 'Pedreiro')).toBe(31.4)
    expect(taxaEfetiva({ funcao: 'X', valorHora: 20, incluiEncargos: false, origem: 'outra' }, undefined)).toBe(20)
  })

  it('taxa sem encargos e encargos não informados é recusada', () => {
    const p: PremissasObra = { ...premissasPadrao(), taxas: [{ funcao: 'Pedreiro', valorHora: 20, incluiEncargos: false, origem: 'outra' }] }
    expect(validarPremissas(p)).toEqual(['Informe os encargos sociais para usar taxa sem encargos.'])
  })
})

describe('PR-6: função não cadastrada', () => {
  it('"Montador" vale R$ 30 (padrão) e R$ 35 com a taxa informada', () => {
    expect(taxaHora(premissasPadrao(), 'Montador')).toBe(30)
    expect(taxaHora({ ...premissasPadrao(), taxaFuncaoNaoCadastrada: 35 }, 'Montador')).toBe(35)
    expect(taxaHora(premissasPadrao(), 'Servente')).toBe(23.9)
  })
})

describe('validação das premissas (faixas, textos e limites)', () => {
  const com = (parcial: Partial<PremissasObra>) => validarPremissas({ ...premissasPadrao(), ...parcial })

  it('recusa valor fora da faixa, negativo, NaN e Infinity', () => {
    expect(com({ custoIndiretoDiario: -1 })).toHaveLength(1)
    expect(com({ custoIndiretoDiario: Number.NaN })).toHaveLength(1)
    expect(com({ custoIndiretoDiario: Infinity })).toHaveLength(1)
    expect(com({ perdaCongestionamentoPct: 101 })).toHaveLength(1)
    expect(com({ adicionalHoraExtraPct: 201 })).toHaveLength(1)
    expect(com({ contingenciaRetrabalhoPct: -0.1 })).toHaveLength(1)
    expect(com({ margemDlpDias: 31 })).toHaveLength(1)
    expect(com({ margemDlpDias: 2.5 })).toHaveLength(1)
    expect(com({ taxaFuncaoNaoCadastrada: 0 })).toHaveLength(1)
    expect(com({ encargosSociaisPct: 301 })).toHaveLength(1)
    expect(com({ custoIndiretoDiario: 0, margemDlpDias: 0, perdaCongestionamentoPct: 0 })).toEqual([])
  })

  it('taxa 0 ou negativa, função repetida, texto acima do limite e mais de 100 taxas são recusados (S-2, S-4)', () => {
    const taxa = (funcao: string, valorHora: number) => ({ funcao, valorHora, incluiEncargos: true, origem: 'ilustrativa' as const })
    expect(com({ taxas: [taxa('A', 0)] })).toHaveLength(1)
    expect(com({ taxas: [taxa('A', -5)] })).toHaveLength(1)
    expect(com({ taxas: [taxa('A', 10), taxa('A', 11)] })).toEqual(['A função "A" está repetida nas taxas.'])
    expect(com({ taxas: [taxa('x'.repeat(61), 10)] })).toEqual(['O nome da função deve ter de 1 a 60 caracteres.'])
    expect(com({ taxas: [{ ...taxa('A', 10), referencia: 'r'.repeat(121) }] })).toHaveLength(1)
    expect(com({ taxas: [{ ...taxa('A', 10), dataReferencia: '2026-13' }] })).toHaveLength(1)
    expect(com({ taxas: Array.from({ length: 101 }, (_, i) => taxa(`F${i}`, 10)) })).toContain('No máximo 100 taxas por função.')
    expect(validarPremissas(null)).toEqual(['As premissas estão em formato inválido.'])
  })

  it('texto com <script> é só texto: a validação aceita e nada o interpreta (S-1)', () => {
    const p = { ...premissasPadrao(), taxas: [{ funcao: '<script>alert(1)</script>', valorHora: 10, incluiEncargos: true, origem: 'outra' as const }] }
    expect(validarPremissas(p)).toEqual([])
  })
})

describe('memória de cálculo: versão e premissas ilustrativas (Inviolável 7)', () => {
  it('lista o que é ilustrativo e some quando a origem é documentada', () => {
    const p = premissasPadrao()
    expect(memoriaPremissas({ versao: 1, vigencia: '2026-05-04' }, p, ['adicionalHoraExtraPct', 'custoIndiretoDiario'], ['Pedreiro'])).toBe(
      'Premissas v1 — vigência 04/05/2026. Ilustrativas, sem validação: adicional de hora extra, custo indireto diário, taxas por função.',
    )
    const doc: PremissasObra = {
      ...p,
      taxas: p.taxas.map((t) => ({ ...t, origem: 'sinapi' as const })),
      origens: { ...p.origens, adicionalHoraExtraPct: { origem: 'acordo-coletivo' }, custoIndiretoDiario: { origem: 'orcamento-obra' } },
    }
    expect(memoriaPremissas({ versao: 2, vigencia: '2026-10-23' }, doc, ['adicionalHoraExtraPct', 'custoIndiretoDiario'], ['Pedreiro'])).toBe('Premissas v2 — vigência 23/10/2026.')
  })
})

describe('texto das premissas de cenário na tela', () => {
  it('traz os números da obra e avisa que são ilustrativos enquanto a origem for ilustrativa', () => {
    expect(descreverPremissasDeCenario(premissasPadrao()).replaceAll(String.fromCharCode(160), ' ')).toBe(
      'Taxas por função, mobilização de R$ 1.200 por profissional, perda de 5% por congestionamento, contingência de 4% de retrabalho e adicional de 50% na hora extra são premissas ilustrativas, sem validação.',
    )
    const p = premissasPadrao()
    const doc: PremissasObra = {
      ...p,
      adicionalHoraExtraPct: 60,
      taxas: p.taxas.map((t) => ({ ...t, origem: 'sinapi' as const })),
      origens: { ...p.origens, mobilizacaoPorProfissional: { origem: 'orcamento-obra' }, perdaCongestionamentoPct: { origem: 'outra' }, contingenciaRetrabalhoPct: { origem: 'outra' }, adicionalHoraExtraPct: { origem: 'acordo-coletivo' } },
    }
    expect(descreverPremissasDeCenario(doc)).toContain('adicional de 60% na hora extra vêm das premissas da obra.')
  })
})
