import { describe, expect, it } from 'vitest'
import type { CalendarioObra, ConfigFeriadosObra, FeriadoManual, Task } from '@/types/domain'
import { calendarioPadrao, compilarCalendarios, diasParaMinutos } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import {
  configFeriadosPadrao,
  configFeriadosValida,
  criarFeriadosPorAno,
  ehFeriadoDaObra,
  faixaDeAnosDaExportacao,
  feriadosDoAno,
  feriadosForaDoLocal,
  materializarFeriados,
  validarFeriadoManual,
} from './feriadosObra'

const aplica = (c: CalendarioObra = calendarioPadrao([])): CalendarioObra => ({ ...c, aplicaFeriadosObra: true })
const manual = (parcial: Partial<FeriadoManual> = {}): FeriadoManual => ({
  id: 'f1',
  data: '2026-08-20',
  nome: 'Feriado municipal fictício',
  abrangencia: 'municipal',
  fonte: 'Lei municipal fictícia de teste',
  recorrenteAnual: true,
  uf: 'PE',
  municipio: 'Cidade Fictícia',
  ...parcial,
})
const config = (parcial: Partial<ConfigFeriadosObra> = {}): ConfigFeriadosObra => ({ ...configFeriadosPadrao(), ...parcial })

/** Tarefa de `dias` dias úteis a partir da data-base (modo linha de base): devolve a data de término. */
function termino(base: string, dias: number, calendarios: CalendarioObra[], cfg: ConfigFeriadosObra): string {
  const t: Task = {
    uid: 1, wbs: '1', name: 'T', outlineLevel: 1, isSummary: false, duracaoMin: diasParaMinutos(dias), predecessors: [],
    percentComplete: 0, bac: 0, actualCost: 0, resources: [],
  }
  const cals = compilarCalendarios(base, calendarios, 1, { feriadosPorAno: criarFeriadosPorAno(cfg) })
  return computeSchedule([t], cals, { mode: 'baseline' }).byUid.get(1)!.finish
}

describe('configuração e gerador por ano', () => {
  it('padrão: nacionais, Carnaval e Corpus Christi ligados e nenhum manual', () => {
    expect(configFeriadosPadrao()).toEqual({ nacionais: true, carnaval: true, corpusChristi: true, manuais: [] })
    expect(configFeriadosValida(configFeriadosPadrao())).toBe(true)
    expect(configFeriadosValida({ nacionais: 1 })).toBe(false)
    expect(configFeriadosValida(null)).toBe(false)
  })

  it('as opções ligam e desligam cada grupo (2027)', () => {
    expect(feriadosDoAno(config(), 2027).size).toBe(13) // 10 nacionais (com a Sexta-feira Santa e o 20/11) + 2 de Carnaval + Corpus Christi
    const sem = feriadosDoAno(config({ carnaval: false, corpusChristi: false }), 2027)
    expect(sem.has('2027-02-08')).toBe(false)
    expect(sem.has('2027-05-27')).toBe(false)
    expect(sem.has('2027-03-26')).toBe(true)
    expect(feriadosDoAno(config({ nacionais: false }), 2027)).toEqual(new Set(['2027-02-08', '2027-02-09', '2027-05-27']))
  })

  it('manual recorrente vale em todo ano; o de uma vez só, no ano da data; 29/02 só em ano bissexto', () => {
    const cfg = config({ nacionais: false, carnaval: false, corpusChristi: false, manuais: [manual(), manual({ id: 'f2', data: '2026-09-30', recorrenteAnual: false }), manual({ id: 'f3', data: '2028-02-29', nome: 'Bissexto' })] })
    expect([...feriadosDoAno(cfg, 2026)].sort()).toEqual(['2026-08-20', '2026-09-30'])
    expect([...feriadosDoAno(cfg, 2027)]).toEqual(['2027-08-20'])
    expect([...feriadosDoAno(cfg, 2028)].sort()).toEqual(['2028-02-29', '2028-08-20'])
    expect(ehFeriadoDaObra(cfg, '2027-08-20')).toBe(true)
    expect(ehFeriadoDaObra(cfg, '2027-08-19')).toBe(false)
  })

  it('materializa por faixa de anos; a faixa do seed é 2026–2029', () => {
    expect(faixaDeAnosDaExportacao(2026, 2027)).toEqual([2026, 2029]) // max(início + 3, término + 1)
    expect(faixaDeAnosDaExportacao(2026, 2031)).toEqual([2026, 2032])
    const lista = materializarFeriados(config(), 2026, 2029)
    expect(lista).toHaveLength(52)
    expect(lista[0]).toBe('2026-01-01')
    expect(lista.at(-1)).toBe('2029-12-25')
    expect([...lista].sort()).toEqual(lista)
  })
})

describe('CF-5: 20/11 só desde 2024 no calendário da obra', () => {
  it('tarefa de 5 d desde seg 2023-11-20 termina 2023-11-24 (com o 20/11 de todo ano terminaria 2023-11-27)', () => {
    expect(termino('2023-11-20', 5, [aplica()], config())).toBe('2023-11-24')
  })
  it('em 2024 o 20/11 (quarta) é feriado: 3 d desde seg 2024-11-18 terminam na quinta 21; 4 d, na sexta 22', () => {
    expect(termino('2024-11-18', 3, [aplica()], config())).toBe('2024-11-21')
    expect(termino('2024-11-18', 4, [aplica()], config())).toBe('2024-11-22')
  })
})

describe('CF-6: feriado municipal manual (fictício)', () => {
  const cfg = config({ manuais: [manual()] })
  it('tarefa de 5 d desde seg 2026-08-17 termina 2026-08-24 (sem o feriado, 2026-08-21)', () => {
    expect(termino('2026-08-17', 5, [aplica()], cfg)).toBe('2026-08-24')
    expect(termino('2026-08-17', 5, [aplica()], config())).toBe('2026-08-21')
  })
  it('é recorrente: 2027-08-20 (sexta) também não é útil', () => {
    expect(termino('2027-08-16', 5, [aplica()], cfg)).toBe('2027-08-23')
  })
  it('a exceção própria útil do calendário prevalece sobre o feriado da obra: término 2026-08-21', () => {
    const cal = aplica({ ...calendarioPadrao([]), excecoes: [{ data: '2026-08-20', intervalos: [{ de: 480, ate: 720 }, { de: 780, ate: 1020 }], descricao: 'Concretagem trabalha no feriado' }] })
    expect(termino('2026-08-17', 5, [cal], cfg)).toBe('2026-08-21')
  })
  it('calendário sem aplicaFeriadosObra ignora os feriados da obra', () => {
    expect(termino('2026-08-17', 5, [calendarioPadrao([])], cfg)).toBe('2026-08-21')
  })
})

describe('validação do feriado manual (fonte obrigatória, limites)', () => {
  const novo = (p: Partial<Omit<FeriadoManual, 'id'>> = {}): Omit<FeriadoManual, 'id'> => {
    const { id: _id, ...resto } = manual(p)
    return resto
  }
  it('aceita o feriado completo', () => {
    expect(validarFeriadoManual(novo())).toEqual([])
  })
  it('recusa sem fonte, sem nome, data inválida, UF inválida e textos acima do limite', () => {
    expect(validarFeriadoManual(novo({ fonte: '  ' }))).toEqual(['Informe a fonte do feriado (lei, decreto ou ato oficial).'])
    expect(validarFeriadoManual(novo({ nome: '' }))).toEqual(['Informe o nome do feriado.'])
    expect(validarFeriadoManual(novo({ data: '2026-02-30' }))).toEqual(['Informe uma data válida para o feriado.'])
    expect(validarFeriadoManual(novo({ data: '1800-01-01' }))).toEqual(['O ano do feriado deve estar entre 1990 e 2100.'])
    expect(validarFeriadoManual(novo({ uf: 'XX' as never }))).toEqual(['Selecione uma UF válida.'])
    expect(validarFeriadoManual(novo({ nome: 'n'.repeat(81) }))).toEqual(['O nome do feriado deve ter no máximo 80 caracteres.'])
    expect(validarFeriadoManual(novo({ fonte: 'f'.repeat(201) }))).toEqual(['A fonte deve ter no máximo 200 caracteres.'])
    expect(validarFeriadoManual(novo({ municipio: 'm'.repeat(81) }))).toEqual(['O município deve ter no máximo 80 caracteres.'])
  })
  it('texto com <script> é só texto (S-1)', () => {
    expect(validarFeriadoManual(novo({ nome: '<script>alert(1)</script>' }))).toEqual([])
  })
  it('recusa o 201º feriado e o repetido (S-2)', () => {
    const muitos = Array.from({ length: 200 }, (_, i) => manual({ id: `f${i}`, nome: `F${i}` }))
    expect(validarFeriadoManual(novo({ nome: 'Outro' }), muitos)).toEqual(['No máximo 200 feriados manuais por obra.'])
    expect(validarFeriadoManual(novo(), [manual()])).toEqual(['Este feriado já está cadastrado.'])
  })
})

describe('feriados de outro local (troca de UF ou município)', () => {
  const cfg = config({
    manuais: [
      manual({ id: 'm1', abrangencia: 'estadual', uf: 'PE', municipio: undefined, data: '2026-07-09', nome: 'Estadual fictício' }),
      manual({ id: 'm2' }),
      manual({ id: 'm3', abrangencia: 'paralisacao', data: '2026-03-02', nome: 'Paralisação' }),
    ],
  })
  it('estadual e municipal de outra UF ou município aparecem; paralisação nunca', () => {
    expect(feriadosForaDoLocal(cfg, 'PE', 'Cidade Fictícia')).toEqual([])
    expect(feriadosForaDoLocal(cfg, 'BA', 'Cidade Fictícia').map((f) => f.id)).toEqual(['m1', 'm2'])
    expect(feriadosForaDoLocal(cfg, 'PE', 'Outra Cidade').map((f) => f.id)).toEqual(['m2'])
    expect(feriadosForaDoLocal(cfg, 'PE', ' cidade fictícia ')).toEqual([]) // sem diferenciar maiúsculas e espaços
    expect(feriadosForaDoLocal(config(), 'BA', 'X')).toEqual([])
  })
})
