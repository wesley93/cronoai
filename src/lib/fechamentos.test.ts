// Fechamento da data de status e retificação (ciclo 00007, E3): captura, retificação, validação do que é lido, regras e série.
// Números do Edifício Aurora (data de status 2026-10-23) conferidos à mão no plano e afirmados aqui como literais.
import { describe, expect, it, vi } from 'vitest'
import type { ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import { POS, type CabecalhoFechamento, type DetalheFechamento, type TarefaFechamento } from '@/types/fechamento'
import { buildSeedState } from '@/stores/useProjectStore'
import { calendarioPadrao, compilarCalendarios } from './calendarioTrabalho'
import { calcularObra } from './horizonte'
import {
  LIMITES_FECHAMENTO,
  avisoDeRepetidas,
  avisosAoFechar,
  capturarFechamento,
  efetivos,
  erroAoFechar,
  erroDeGravacaoDoRegistro,
  erroDeTextosFechamento,
  erroDeDataDeInicio,
  erroDeDataDeStatus,
  hojeLocalIso,
  indicesDoFechamento,
  lerDetalheFechamento,
  limparControles,
  notasDaLinhaBaseDosFechamentos,
  proximaSequencia,
  retificar,
  tarefasComWbsLongo,
  trechoDaLinhaBaseDoFechamento,
  serializarDetalhe,
  serieDosFechamentos,
  validarCabecalhoFechamento,
  validarCabecalhosFechamento,
} from './fechamentos'

const seed = buildSeedState()
const calc = calcularObra(seed.tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid, { feriados: seed.feriados })

const entrada = (extra: Partial<Parameters<typeof capturarFechamento>[0]> = {}) => ({
  obraId: 'o1',
  id: 'f1',
  sequencia: 1,
  dataStatus: '2026-10-23',
  fechadoEm: '2026-10-25T15:00:00.000Z',
  linhaBase: 0,
  linhaBaseSalvaEm: '2026-04-27T12:00:00.000Z',
  versaoPremissas: 1,
  esquemaObra: 6,
  tarefas: JSON.parse(JSON.stringify(seed.tasks)) as Task[],
  cals: calc.calsPv,
  schedule: calc.sch,
  atrasoDiasUteis: calc.atraso.delayDays,
  ...extra,
})
const fe1 = () => capturarFechamento(entrada())
const tupla = (d: DetalheFechamento, uid: number): TarefaFechamento => d.tarefas.find((t) => t[POS.uid] === uid)!

describe('capturarFechamento (FE-1, D-10, D-11)', () => {
  it('FE-1: totais, pacote 01 e tuplas do Aurora fechado em 23/10/2026 com a LB0', () => {
    const { cabecalho: c, detalhe: d } = fe1()
    expect([c.totais.bac, c.totais.pv, c.totais.ev, c.totais.ac]).toEqual([19113000, 7259250, 6448200, 6896900])
    expect(c.totais.spi).toBeCloseTo(0.888274, 6)
    expect(c.totais.cpi).toBeCloseTo(0.934942, 6)
    expect(c.totais.eac).toBeCloseTo(20442984.04, 2)
    expect(c.totais.entregaPrevista).toBe('2027-06-23')
    expect(c.totais.atrasoDiasUteis).toBe(16)
    expect([c.linhaBase, c.linhaBaseSalvaEm, c.quantidadeTarefas, c.sequencia, c.tipo, c.versaoFormato]).toEqual([0, '2026-04-27T12:00:00.000Z', 20, 1, 'fechamento', 1])
    const p01 = c.porPacote.find((p) => p.wbs === '01')!
    expect([p01.bac, p01.pv, p01.ev, p01.ac]).toEqual([2150000, 2150000, 2150000, 2239900])
    // Tupla do 302 (78%, custo 1.871.000, BAC e PV 2.200.000; início real 14/09; previsto até 05/11 pelo C-7) e do 104 (PV 168.000)
    expect(tupla(d, 302)).toEqual([302, '02.02', 78, 1871000, 2200000, 2200000, '2026-09-14', null, '2026-09-14', '2026-11-05', 26534, 0])
    expect(tupla(d, 104)).toEqual([104, '03.01.02', 40, 72000, 168000, 168000, '2026-10-05', null, '2026-10-05', '2026-11-05', 0, 1])
    expect(d.tarefas.reduce((a, t) => a + t[POS.pv], 0)).toBeCloseTo(7259250, 2) // soma dos PVs das tuplas = PV da obra
    expect(d.tarefas).toHaveLength(20)
  })

  it('o cabeçalho e o detalhe capturados passam na validação de leitura (ida e volta pelo texto)', () => {
    const { cabecalho, detalhe } = fe1()
    expect(validarCabecalhoFechamento(JSON.parse(JSON.stringify(cabecalho)), 'o1')).toEqual(cabecalho)
    expect(lerDetalheFechamento(serializarDetalhe(detalhe), cabecalho)).toEqual(detalhe)
  })

  it('FE-7: PV = 0 e AC = 0 (obra que não começou): SPI, CPI e EAC são null, não 1,00', () => {
    expect(indicesDoFechamento(1000, 0, 0, 0)).toEqual({ spi: null, cpi: null, eac: null })
    expect(indicesDoFechamento(1000, 500, 0, 0)).toEqual({ spi: 0, cpi: null, eac: null }) // EV 0: SPI 0 de verdade, CPI e EAC sem divisor
    expect(indicesDoFechamento(1000, 0, 300, 400)).toEqual({ spi: null, cpi: 0.75, eac: 1333.3333333333333 })
    const obraNova = capturarFechamento(entrada({ tarefas: seed.tasks.map((t) => ({ ...t, percentComplete: 0, actualCost: 0, baselineStart: '2030-01-07', baselineFinish: '2030-01-11' })) }))
    expect([obraNova.cabecalho.totais.pv, obraNova.cabecalho.totais.ev, obraNova.cabecalho.totais.ac]).toEqual([0, 0, 0])
    expect([obraNova.cabecalho.totais.spi, obraNova.cabecalho.totais.cpi, obraNova.cabecalho.totais.eac]).toEqual([null, null, null])
    expect(validarCabecalhoFechamento(JSON.parse(JSON.stringify(obraNova.cabecalho)))).toEqual(obraNova.cabecalho) // null é valor legível e volta como null
  })

  it('teste 34: tuplas serializam e voltam iguais; 3.000 tarefas cabem em até 400 mil caracteres', () => {
    const cal = compilarCalendarios('2026-05-04', [calendarioPadrao([])], 1)
    const tarefas: Task[] = Array.from({ length: 3000 }, (_, i) => ({
      uid: 1000 + i, wbs: `03.${String(1 + (i % 40)).padStart(2, '0')}.${String(1 + i).padStart(4, '0')}`, name: `T${i}`, outlineLevel: 3, isSummary: false, duracaoMin: 4800, predecessors: [],
      percentComplete: (i * 7) % 101, bac: 12345.67 + i, actualCost: 9876.54 + i, resources: [], actualStart: '2026-09-14', baselineStart: '2026-09-14', baselineFinish: '2026-10-09', baselineDuracaoMin: 9600,
    }))
    const byUid = new Map<number, ScheduledTask>(tarefas.map((t) => [t.uid, { uid: t.uid, start: '2026-09-14', finish: '2026-11-05', folgaTotalMin: 79600, critical: false } as ScheduledTask]))
    const { cabecalho, detalhe } = capturarFechamento(entrada({ tarefas, cals: cal, schedule: { byUid, projectFinish: '2027-01-01' } as ScheduleResult }))
    const reg = serializarDetalhe(detalhe)
    expect(reg.json.length).toBeLessThanOrEqual(400_000)
    expect(lerDetalheFechamento(reg, cabecalho)).toEqual(detalhe)
  })
})

describe('retificar (FE-3, D-15, E-5)', () => {
  const base = () => fe1()
  const ret = (extra: Partial<Parameters<typeof retificar>[0]> = {}) => {
    const { cabecalho, detalhe } = base()
    return retificar({
      base: { cabecalho, detalhe },
      alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }],
      motivo: 'Medição revisada em campo',
      id: 'f2',
      sequencia: 2,
      fechadoEm: '2026-10-26T12:00:00.000Z',
      cabecalhos: [cabecalho],
      ...extra,
    })
  }
  const ok = (r: ReturnType<typeof retificar>) => {
    if (!r.ok) throw new Error(r.erro)
    return r
  }

  it('FE-3: 104 de 40% para 45% e de R$ 72.000 para R$ 75.000: EV 6.456.600,00, AC 6.899.900,00, SPI 0,889431, CPI 0,935753, EAC 20.425.268,52; PV e entrega do original', () => {
    const r = ok(ret())
    const t = r.cabecalho.totais
    expect([t.ev, t.ac]).toEqual([6456600, 6899900])
    expect(t.spi).toBeCloseTo(0.889431, 6)
    expect(t.cpi).toBeCloseTo(0.935753, 6)
    expect(t.eac).toBeCloseTo(20425268.52, 2)
    expect([t.pv, t.bac, t.entregaPrevista, t.atrasoDiasUteis]).toEqual([7259250, 19113000, '2027-06-23', 16])
    expect([r.cabecalho.tipo, r.cabecalho.retificaId, r.cabecalho.sequencia, r.cabecalho.motivo, r.cabecalho.dataStatus]).toEqual(['retificacao', 'f1', 2, 'Medição revisada em campo', '2026-10-23'])
    // O pacote da 104 (03) muda no EV e no AC; o PV, as datas previstas e as folgas ficam os do original
    const p03 = r.cabecalho.porPacote.find((p) => p.wbs === '03')!
    const p03Antes = base().cabecalho.porPacote.find((p) => p.wbs === '03')!
    expect([p03.ev - p03Antes.ev, p03.ac - p03Antes.ac, p03.pv]).toEqual([8400, 3000, p03Antes.pv])
    const t104 = tupla(r.detalhe, 104)
    expect(t104).toEqual([104, '03.01.02', 45, 75000, 168000, 168000, '2026-10-05', null, '2026-10-05', '2026-11-05', 0, 1])
    expect(validarCabecalhoFechamento(JSON.parse(JSON.stringify(r.cabecalho)))).toEqual(r.cabecalho)
    expect(lerDetalheFechamento(serializarDetalhe(r.detalhe), r.cabecalho)).toEqual(r.detalhe)
    expect(r.avisos).toEqual([])
  })

  it('o original fica intacto (byte a byte) e a retificação de uma retificação aponta para a raiz', () => {
    const { cabecalho, detalhe } = base()
    const antes = JSON.stringify([cabecalho, detalhe])
    const r1 = ok(retificar({ base: { cabecalho, detalhe }, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm', id: 'f2', sequencia: 2, fechadoEm: '2026-10-26T12:00:00.000Z', cabecalhos: [cabecalho] }))
    expect(JSON.stringify([cabecalho, detalhe])).toBe(antes)
    const r2 = ok(retificar({ base: { cabecalho: r1.cabecalho, detalhe: r1.detalhe }, alteracoes: [{ uid: 302, custoReal: 1900000 }], motivo: 'm2', id: 'f3', sequencia: 3, fechadoEm: '2026-10-27T12:00:00.000Z', cabecalhos: [cabecalho, r1.cabecalho] }))
    expect(r2.cabecalho.retificaId).toBe('f1') // sempre a raiz
    expect(tupla(r2.detalhe, 104)[POS.pct]).toBe(45) // parte da efetiva: a correção anterior continua
    expect(r2.cabecalho.totais.ac).toBe(6925900) // 6.896.900 (a 1ª retificação só mudou o %) + 29.000 do 302
  })

  it('recusas: motivo vazio ou grande, sem alteração, tarefa inexistente, % e custo fora da faixa, textos com controle, nada mudou', () => {
    expect(ret({ motivo: '  ' })).toEqual({ ok: false, erro: 'Informe o motivo da retificação.' })
    expect(ret({ motivo: 'm'.repeat(501) })).toEqual({ ok: false, erro: 'O motivo da retificação passa de 500 caracteres.' })
    expect(ret({ motivo: 'm\u0007' })).toEqual({ ok: false, erro: 'Os textos não podem ter caracteres de controle.' })
    expect(ret({ alteracoes: [] })).toEqual({ ok: false, erro: 'Escolha ao menos uma tarefa para retificar.' })
    expect(ret({ alteracoes: [{ uid: 99999, pct: 10 }] })).toEqual({ ok: false, erro: 'Tarefa não encontrada neste fechamento.' })
    expect(ret({ alteracoes: [{ uid: 104, pct: 101 }] })).toEqual({ ok: false, erro: 'O % físico precisa estar entre 0 e 100.' })
    expect(ret({ alteracoes: [{ uid: 104, pct: Number.NaN }] }).ok).toBe(false)
    expect(ret({ alteracoes: [{ uid: 104, custoReal: -1 }] })).toEqual({ ok: false, erro: 'O custo real precisa ser um valor em R$ de 0 a 1 trilhão.' })
    expect(ret({ alteracoes: [{ uid: 104, pct: 40, custoReal: 72000 }] })).toEqual({ ok: false, erro: 'Nenhuma alteração: o % físico e o custo real escolhidos são os do fechamento.' })
  })

  it('FE-9: avisos sem bloquear: EV retificado acima do fechamento seguinte e tarefa com % acima do seguinte; a retificação é gravada', () => {
    const { cabecalho, detalhe } = base()
    // F2 sintético em 30/10/2026: 104 em 60% e a 105 em ~11,03%, de modo que o EV do fechamento seja R$ 6.500.000,00
    const tarefas = detalhe.tarefas.map((t): TarefaFechamento => (t[POS.uid] === 104 ? [t[0], t[1], 60, t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11]] : t[POS.uid] === 105 ? [t[0], t[1], (18200 / t[POS.bac]) * 100, t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11]] : t))
    const f2: CabecalhoFechamento = { ...cabecalho, id: 'f2', sequencia: 2, dataStatus: '2026-10-30', totais: { ...cabecalho.totais, ev: 6500000 } }
    const f2Detalhe: DetalheFechamento = { ...detalhe, id: 'f2', tarefas }
    const r = ok(
      retificar({
        base: { cabecalho, detalhe },
        seguinte: { cabecalho: f2, detalhe: f2Detalhe },
        alteracoes: [{ uid: 104, pct: 75 }],
        motivo: 'Medição revisada',
        id: 'f3',
        sequencia: 3,
        fechadoEm: '2026-10-31T12:00:00.000Z',
        cabecalhos: [cabecalho, f2],
      }),
    )
    expect(r.cabecalho.totais.ev).toBe(6507000) // 6.448.200 + 0,35 × 168.000
    expect(r.avisos).toEqual([
      'O EV retificado (R$ 6.507.000,00) fica acima do EV do fechamento de 30/10/2026 (R$ 6.500.000,00): confira os fechamentos seguintes.',
      '1 tarefa(s) com % acima do fechamento seguinte.',
    ])
  })

  it('FE-6: o limite de 52 retificações recusa a 53ª; o de 104 fechamentos recusa o 105º', () => {
    const { cabecalho } = base()
    const muitas = (tipo: 'fechamento' | 'retificacao', n: number): CabecalhoFechamento[] =>
      Array.from({ length: n }, (_, i) => ({ ...cabecalho, id: `x${i}`, sequencia: i + 1, tipo, dataStatus: `2027-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + Math.floor(i / 12)).padStart(2, '0')}` }))
    expect(ret({ cabecalhos: muitas('retificacao', 51) }).ok).toBe(true)
    expect(ret({ cabecalhos: muitas('retificacao', 52) })).toEqual({
      ok: false,
      erro: 'Limite de 52 retificações desta obra atingido. Exporte o histórico (JSON) e registre a pendência com a equipe responsável pelo servidor (SPEC-01).',
    })
    const cem = muitas('fechamento', 103)
    expect(erroAoFechar({ cabecalhos: cem, ilegiveis: 0, dataStatus: '2030-01-01', folhas: 20 })).toBeUndefined()
    expect(erroAoFechar({ cabecalhos: muitas('fechamento', 104), ilegiveis: 0, dataStatus: '2030-01-01', folhas: 20 })).toBe(
      'Limite de 104 fechamentos desta obra atingido. Exporte o histórico (JSON) e registre a pendência com a equipe responsável pelo servidor (SPEC-01).',
    )
    expect(LIMITES_FECHAMENTO.fechamentos).toBe(104)
  })
})

describe('efetivos e regras de data (FE-5, D-12, D-13)', () => {
  const h = (id: string, sequencia: number, dataStatus: string, tipo: 'fechamento' | 'retificacao' = 'fechamento'): CabecalhoFechamento => ({ ...fe1().cabecalho, id, sequencia, dataStatus, tipo, ...(tipo === 'retificacao' ? { retificaId: 'a', motivo: 'm' } : {}) })

  it('o efetivo de cada data é a retificação de maior sequência (cadeia de retificações); em ordem de data', () => {
    const lista = [h('c', 3, '2026-10-30'), h('a', 1, '2026-10-23'), h('b', 2, '2026-10-23', 'retificacao'), h('d', 4, '2026-10-23', 'retificacao')]
    expect(efetivos(lista).map((c) => [c.id, c.dataStatus])).toEqual([['d', '2026-10-23'], ['c', '2026-10-30']])
    expect(proximaSequencia(lista)).toBe(5)
    expect(proximaSequencia([])).toBe(1)
  })

  it('FE-5: fechar na mesma data pede "Retificar"; data anterior ao último fechamento é recusada; data posterior é aceita', () => {
    const lista = [h('a', 1, '2026-10-23')]
    const base = { cabecalhos: lista, ilegiveis: 0, folhas: 20 }
    expect(erroAoFechar({ ...base, dataStatus: '2026-10-23' })).toBe("Já existe fechamento em 23/10/2026: use 'Retificar'.")
    expect(erroAoFechar({ ...base, dataStatus: '2026-10-16' })).toBe("A data de status não pode ser anterior ao último fechamento (23/10/2026). Para corrigir um fechamento, use 'Retificar'.")
    expect(erroAoFechar({ ...base, dataStatus: '2026-10-30' })).toBeUndefined()
    expect(erroAoFechar({ cabecalhos: [], ilegiveis: 0, dataStatus: '2026-10-23', folhas: 20 })).toBeUndefined()
  })

  it('obra sem folhas e fechamento ilegível bloqueiam o fechar (D-12)', () => {
    expect(erroAoFechar({ cabecalhos: [], ilegiveis: 0, dataStatus: '2026-10-23', folhas: 0 })).toBe('A obra precisa de ao menos uma tarefa para fechar a data de status.')
    expect(erroAoFechar({ cabecalhos: [], ilegiveis: 2, dataStatus: '2026-10-23', folhas: 20 })).toBe('Há 2 fechamento(s) ilegível(is) nesta obra: novo fechamento bloqueado até resolver (os registros foram mantidos sem alteração).')
  })

  it('D-13: a data de status não volta antes do último fechamento e a de início não passa da data do primeiro', () => {
    const lista = [h('a', 1, '2026-10-23'), h('b', 2, '2026-10-30')]
    expect(erroDeDataDeStatus('2026-10-29', lista)).toBe("A data de status não pode ser anterior ao último fechamento (30/10/2026). Para corrigir um fechamento, use 'Retificar'.")
    expect(erroDeDataDeStatus('2026-10-30', lista)).toBeUndefined()
    expect(erroDeDataDeStatus('2026-01-01', [])).toBeUndefined()
    expect(erroDeDataDeInicio('2026-10-24', lista)).toBe('A data de início não pode ser posterior à data do primeiro fechamento (23/10/2026).')
    expect(erroDeDataDeInicio('2026-10-23', lista)).toBeUndefined()
  })

  it('E-8: avisos sem bloquear: relatos pendentes e data de status posterior a hoje', () => {
    expect(avisosAoFechar({ relatosPendentes: 4, dataStatus: '2026-10-23', hoje: '2026-10-25' })).toEqual(['Há 4 relato(s) de campo pendente(s) de aprovação: o fechamento não inclui essas medições.'])
    expect(avisosAoFechar({ relatosPendentes: 0, dataStatus: '2026-10-30', hoje: '2026-10-25' })).toEqual(['A data de status (30/10/2026) é posterior a hoje.'])
    expect(avisosAoFechar({ relatosPendentes: 0, dataStatus: '2026-10-25', hoje: '2026-10-25' })).toEqual([])
    expect(hojeLocalIso(new Date(2026, 9, 5, 23, 59))).toBe('2026-10-05')
  })
})

describe('série dos fechamentos (TE-1)', () => {
  it('SPI, CPI, entrega e atraso gravados; o F0 sem PV fica com SPI e CPI nulos (fora dos gráficos de índices)', () => {
    const { cabecalho } = fe1()
    const f2: CabecalhoFechamento = { ...cabecalho, id: 'f2', sequencia: 2, dataStatus: '2026-10-30', totais: { ...cabecalho.totais, pv: 7600000, ev: 6800000, ac: 7250000, ...indicesDoFechamento(19113000, 7600000, 6800000, 7250000), entregaPrevista: '2027-06-25', atrasoDiasUteis: 18 } }
    const f0: CabecalhoFechamento = { ...cabecalho, id: 'f0', sequencia: 3, dataStatus: '2026-11-06', totais: { ...cabecalho.totais, pv: 0, ev: 0, ac: 0, ...indicesDoFechamento(19113000, 0, 0, 0) } }
    const s = serieDosFechamentos(efetivos([cabecalho, f2, f0]))
    expect(s.map((p) => [p.data, p.entregaPrevista, p.atrasoDiasUteis])).toEqual([['2026-10-23', '2027-06-23', 16], ['2026-10-30', '2027-06-25', 18], ['2026-11-06', '2027-06-23', 16]])
    expect(s[0].spi).toBeCloseTo(0.888274, 6)
    expect(s[0].cpi).toBeCloseTo(0.934942, 6)
    expect(s[1].spi).toBeCloseTo(0.894737, 6)
    expect(s[1].cpi).toBeCloseTo(0.937931, 6)
    expect([s[2].spi, s[2].cpi]).toEqual([null, null])
  })
})

describe('leitura validada: cabeçalho (S-2, D-24)', () => {
  const valido = (): Record<string, unknown> => JSON.parse(JSON.stringify(fe1().cabecalho))
  const retificado = (): Record<string, unknown> => ({ ...valido(), tipo: 'retificacao', retificaId: 'f1', motivo: 'Medição revisada' })
  const com = (campo: string, valor: unknown, base = valido()) => ({ ...base, [campo]: valor })
  const tot = (campo: string, valor: unknown) => ({ ...valido(), totais: { ...(valido().totais as object), [campo]: valor } })

  it('o válido (fechamento e retificação) passa e volta reconstruído; `__proto__` e chaves extras não passam', () => {
    expect(validarCabecalhoFechamento(valido(), 'o1')).toEqual(fe1().cabecalho)
    expect(validarCabecalhoFechamento(retificado(), 'o1')?.tipo).toBe('retificacao')
    const lixo = JSON.parse(JSON.stringify({ ...valido(), extra: 'x' }).replace('{', '{"__proto__":{"admin":true},'))
    const lido = validarCabecalhoFechamento(lixo)!
    expect(Object.keys(lido)).not.toContain('extra')
    expect(Object.keys(lido)).not.toContain('__proto__')
    expect((lido as unknown as { admin?: boolean }).admin).toBeUndefined()
    expect(({} as { admin?: boolean }).admin).toBeUndefined()
  })

  it.each([
    ['não é objeto', 'texto'],
    ['lista', []],
    ['formato 2 (mais novo)', com('versaoFormato', 2)],
    ['formato 0', com('versaoFormato', 0)],
    ['formato em texto', com('versaoFormato', '1')],
    ['id vazio', com('id', '')],
    ['id com 65 caracteres', com('id', 'i'.repeat(65))],
    ['id com caractere de controle', com('id', 'a\u0007')],
    ['id numérico', com('id', 5)],
    ['obraId de outra obra', com('obraId', 'outra')],
    ['sequência 0', com('sequencia', 0)],
    ['sequência fracionária', com('sequencia', 1.5)],
    ['sequência em texto', com('sequencia', '1')],
    ['tipo desconhecido', com('tipo', 'apagado')],
    ['retificação sem retificaId', { ...retificado(), retificaId: undefined }],
    ['retificação sem motivo', { ...retificado(), motivo: undefined }],
    ['fechamento com retificaId', com('retificaId', 'x')],
    ['dataStatus inexistente', com('dataStatus', '2026-02-30')],
    ['fechadoEm inválido', com('fechadoEm', 'ontem')],
    ['autor com 121 caracteres', com('autor', 'a'.repeat(121))],
    ['observação com 501 caracteres', com('observacao', 'o'.repeat(501))],
    ['linhaBase 11', com('linhaBase', 11)],
    ['linhaBase negativa', com('linhaBase', -1)],
    ['linhaBaseSalvaEm inválida', com('linhaBaseSalvaEm', 'x')],
    ['versão das premissas negativa', com('versaoPremissas', -1)],
    ['esquema 0', com('esquemaObra', 0)],
    ['totais.ev em texto', tot('ev', 'x')],
    ['totais.ev negativo', tot('ev', -1)],
    ['totais.bac acima de 1e12', tot('bac', 1e13)],
    ['totais.spi em texto', tot('spi', '0,9')],
    ['totais.cpi negativo', tot('cpi', -0.1)],
    ['totais.eac indefinido', tot('eac', undefined)],
    ['entrega inválida', tot('entregaPrevista', '2027-13-01')],
    ['atraso fracionário', tot('atrasoDiasUteis', 1.5)],
    ['totais ausentes', com('totais', undefined)],
    ['porPacote com 501 itens', com('porPacote', Array.from({ length: 501 }, () => ({ wbs: '01', nome: 'x', bac: 1, pv: 1, ev: 1, ac: 1 })))],
    ['porPacote com item inválido', com('porPacote', [{ wbs: '', nome: 'x', bac: 1, pv: 1, ev: 1, ac: 1 }])],
    ['porPacote não é lista', com('porPacote', {})],
    ['quantidadeTarefas 20.001', com('quantidadeTarefas', 20001)],
    ['quantidadeTarefas negativa', com('quantidadeTarefas', -1)],
  ])('recusa: %s', (_nome, ruim) => {
    expect(validarCabecalhoFechamento(ruim, 'o1')).toBeUndefined()
  })

  it('validarCabecalhosFechamento: id repetido e inválidos saem, com a contagem; sequência repetida NÃO é ilegível (SEG-2); o resto vem ordenado', () => {
    const a = valido()
    const b = { ...valido(), id: 'f2', sequencia: 2 }
    const r = validarCabecalhosFechamento([b, a, { ...a }, { ...a, id: 'f9' }, { ...a, versaoFormato: 2, id: 'f8', sequencia: 8 }, 'lixo'], 'o1')
    expect(r.cabecalhos.map((c) => c.id)).toEqual(['f1', 'f9', 'f2']) // f1 e f9 têm a sequência 1: desempate por fechadoEm (iguais) e depois por id
    expect(r.ilegiveis).toBe(3) // o id repetido, o formato 2 e o texto
    expect(r.repetidas).toBe(2)
  })
})

describe('leitura validada: detalhe (S-2, D-24)', () => {
  const { cabecalho, detalhe } = fe1()
  const reg = (mut: (d: { versaoFormato: number; id: string; tarefas: unknown[][] }) => void) => {
    const d = JSON.parse(JSON.stringify(detalhe)) as { versaoFormato: number; id: string; tarefas: unknown[][] }
    mut(d)
    return { id: cabecalho.id, json: JSON.stringify(d) }
  }
  const tarefa0 = (d: { tarefas: unknown[][] }, i: number, v: unknown) => {
    d.tarefas[0][i] = v
  }

  it('o válido passa', () => {
    expect(lerDetalheFechamento(serializarDetalhe(detalhe), cabecalho)).toEqual(detalhe)
  })

  it('texto acima de 8 MiB é recusado ANTES do JSON.parse', () => {
    const espiao = vi.spyOn(JSON, 'parse')
    const enorme = { id: cabecalho.id, json: ' '.repeat(LIMITES_FECHAMENTO.detalheChars + 1) }
    espiao.mockClear()
    expect(lerDetalheFechamento(enorme, cabecalho)).toBeUndefined()
    expect(espiao).not.toHaveBeenCalled()
    espiao.mockRestore()
  })

  it.each([
    ['registro de outro id', { id: 'outro', json: JSON.stringify(detalhe) }],
    ['json que não é texto', { id: cabecalho.id, json: { tarefas: [] } }],
    ['JSON inválido', { id: cabecalho.id, json: '{' }],
    ['registro ausente', undefined],
    ['formato 2', reg((d) => { d.versaoFormato = 2 })],
    ['id do detalhe diferente do cabeçalho', reg((d) => { d.id = 'x' })],
    ['quantidade diferente do cabeçalho', reg((d) => { d.tarefas.pop() })],
    ['tupla com 11 posições', reg((d) => { d.tarefas[0].pop() })],
    ['tupla com 13 posições', reg((d) => { d.tarefas[0].push(0) })],
    ['uid repetido', reg((d) => { d.tarefas[1][0] = d.tarefas[0][0] })],
    ['uid fracionário', reg((d) => tarefa0(d, 0, 1.5))],
    ['wbs vazio', reg((d) => tarefa0(d, 1, ''))],
    ['pct 101', reg((d) => tarefa0(d, 2, 101))],
    ['pct em texto', reg((d) => tarefa0(d, 2, '50'))],
    ['custo real negativo', reg((d) => tarefa0(d, 3, -1))],
    ['PV acima de 1e12', reg((d) => tarefa0(d, 5, 1e13))],
    ['início real inválido', reg((d) => tarefa0(d, 6, '2026-02-30'))],
    ['término previsto ausente', reg((d) => tarefa0(d, 9, null))],
    ['folga fracionária', reg((d) => tarefa0(d, 10, 1.5))],
    ['folga acima de 50 anos', reg((d) => tarefa0(d, 10, 26_280_001))],
    ['crítica 2', reg((d) => tarefa0(d, 11, 2))],
    ['soma do EV diferente do cabeçalho (R$ 1,00)', reg((d) => tarefa0(d, 2, Number(d.tarefas[0][2]) + 100 / Number(d.tarefas[0][4] || 1)))],
    ['soma do AC diferente do cabeçalho', reg((d) => tarefa0(d, 3, Number(d.tarefas[0][3]) + 5))],
  ])('recusa: %s (detalhe ilegível)', (_nome, registro) => {
    expect(lerDetalheFechamento(registro, cabecalho)).toBeUndefined()
  })

  it('a soma dentro de R$ 0,01 passa', () => {
    const lido = lerDetalheFechamento(reg((d) => tarefa0(d, 3, Number(d.tarefas[0][3]) + 0.004)), cabecalho)
    expect(lido?.tarefas).toHaveLength(20)
    expect(lido?.tarefas[0][3]).toBe(Number(detalhe.tarefas[0][3]) + 0.004) // o valor lido é o gravado, com a diferença de meio centavo
  })
})

describe('rodada 02: SEG-1 (registro que não passa na leitura), SEG-2 (sequência repetida) e SEG-5 (quebra de linha)', () => {
  const comWbs = (wbs: string, nomePacote = 'Infraestrutura') =>
    capturarFechamento(
      entrada({
        tarefas: (JSON.parse(JSON.stringify(seed.tasks)) as Task[]).map((t) => (t.uid === 301 ? { ...t, wbs } : t.uid === 3 ? { ...t, name: nomePacote } : t)),
      }),
    )

  it('SEG-1: o TAB no nome do pacote vira espaço e o WBS de 70 caracteres passa; o registro volta legível, sem nenhum caractere de controle', () => {
    const longo = '02.01.' + '9'.repeat(64) // 70 caracteres
    const { cabecalho, detalhe } = capturarFechamento(
      entrada({ tarefas: (JSON.parse(JSON.stringify(seed.tasks)) as Task[]).map((t) => (t.uid === 301 ? { ...t, wbs: longo } : t.isSummary && t.outlineLevel === 1 ? { ...t, name: `Pacote\tcom\u0007tab` } : t)) }),
    )
    expect(longo).toHaveLength(70)
    expect(cabecalho.porPacote.every((p) => p.nome === 'Pacote com tab')).toBe(true)
    expect(detalhe.tarefas.some((t) => t[POS.wbs] === longo)).toBe(true)
    expect(limparControles('a\tb\nc\u007fd')).toBe('a b c d')
    expect(validarCabecalhoFechamento(JSON.parse(JSON.stringify(cabecalho)), 'o1')).toEqual(cabecalho)
    expect(lerDetalheFechamento(serializarDetalhe(detalhe), cabecalho)?.tarefas).toHaveLength(20)
    expect(erroDeGravacaoDoRegistro(cabecalho, serializarDetalhe(detalhe))).toBeUndefined()
  })

  it('SEG-1 (rede de segurança): um código de EAP acima do limite (200) não passa na leitura: a verificação antes de gravar recusa, em português', () => {
    const { cabecalho, detalhe } = comWbs('02.01.' + '9'.repeat(300))
    expect(lerDetalheFechamento(serializarDetalhe(detalhe), cabecalho)).toBeUndefined()
    // A mensagem diz QUAL tarefa causa a recusa: o UID (301) e os primeiros 40 caracteres do WBS
    expect(erroDeGravacaoDoRegistro(cabecalho, serializarDetalhe(detalhe))).toBe(
      `Este fechamento não pode ser gravado: o registro da tarefa UID 301 (EAP "02.01.${'9'.repeat(34)}…") não passa na validação de leitura (por exemplo, um código de EAP com mais de 200 caracteres) e o registro ficaria ilegível. Corrija o dado (por exemplo, encurte o WBS no MS Project e importe de novo) e tente de novo. Nada foi gravado.`,
    )
    expect(tarefasComWbsLongo([{ wbs: '1' }, { wbs: 'x'.repeat(201) }, { wbs: 'y'.repeat(200) }])).toBe(1)
    // um campo inválido qualquer do cabeçalho também é pego (aqui, um R$ fora da faixa)
    const ruim = { ...cabecalho, totais: { ...cabecalho.totais, ev: -1 } }
    expect(erroDeGravacaoDoRegistro(ruim, serializarDetalhe(fe1().detalhe))).toContain('Nada foi gravado.')
  })

  it('SEG-2: sequência repetida (duas abas) desempata por fechadoEm e depois por id; nenhum dos dois é ilegível', () => {
    const base = fe1().cabecalho
    const a: CabecalhoFechamento = { ...base, id: 'aaa', sequencia: 2, dataStatus: '2026-10-30', fechadoEm: '2026-10-31T10:00:00.000Z' }
    const b: CabecalhoFechamento = { ...base, id: 'bbb', sequencia: 2, dataStatus: '2026-10-30', fechadoEm: '2026-10-31T10:00:05.000Z' }
    const c: CabecalhoFechamento = { ...base, id: 'ccc', sequencia: 2, dataStatus: '2026-10-30', fechadoEm: '2026-10-31T10:00:05.000Z' }
    expect(efetivos([a, b]).map((x) => x.id)).toEqual(['bbb']) // o gravado por último
    expect(efetivos([b, a]).map((x) => x.id)).toEqual(['bbb']) // a ordem de leitura não muda o resultado
    expect(efetivos([b, c]).map((x) => x.id)).toEqual(['ccc']) // mesmo fechadoEm: o id decide, sempre do mesmo jeito
    expect(efetivos([c, b]).map((x) => x.id)).toEqual(['ccc'])
    const r = validarCabecalhosFechamento([JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b))], 'o1')
    expect([r.ilegiveis, r.repetidas, r.cabecalhos.map((x) => x.id)]).toEqual([0, 2, ['aaa', 'bbb']])
    expect(avisoDeRepetidas(2)).toBe('Há fechamentos gravados em paralelo (2 registro(s) com a mesma sequência, por exemplo de duas abas): o efetivo de cada data é o gravado por último. Confira a lista.')
    expect(proximaSequencia([a, b])).toBe(3) // a obra segue fechável: a próxima sequência é nova
  })

  it('SEG-5: observação e motivo aceitam a quebra de linha (\\r\\n vira \\n); os outros caracteres de controle continuam recusados, na escrita e na leitura', () => {
    expect(erroDeTextosFechamento({ observacao: 'linha 1\r\nlinha 2' })).toBeUndefined()
    expect(erroDeTextosFechamento({ observacao: 'linha\u0007' })).toBe('Os textos não podem ter caracteres de controle.')
    expect(erroDeTextosFechamento({ observacao: 'a\tb' })).toBe('Os textos não podem ter caracteres de controle.')
    expect(erroDeTextosFechamento({ autor: 'a\nb' })).toBe('Os textos não podem ter caracteres de controle.') // o autor é de uma linha só
    const { cabecalho, detalhe } = fe1()
    const r = retificar({ base: { cabecalho, detalhe }, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'Medição revisada\r\nem campo\rpelo mestre', id: 'f2', sequencia: 2, fechadoEm: '2026-10-26T12:00:00.000Z', cabecalhos: [cabecalho] })
    if (!r.ok) throw new Error(r.erro)
    expect(r.cabecalho.motivo).toBe('Medição revisada\nem campo\npelo mestre')
    expect(retificar({ base: { cabecalho, detalhe }, alteracoes: [{ uid: 104, pct: 45 }], motivo: 'm\tx', id: 'f3', sequencia: 3, fechadoEm: '2026-10-26T12:00:00.000Z', cabecalhos: [cabecalho] })).toEqual({ ok: false, erro: 'Os textos não podem ter caracteres de controle.' })
    // Leitura: \n vale em motivo e observação; \r e TAB não
    const gravado = JSON.parse(JSON.stringify(r.cabecalho)) as Record<string, unknown>
    expect(validarCabecalhoFechamento(gravado)?.motivo).toBe('Medição revisada\nem campo\npelo mestre')
    expect(validarCabecalhoFechamento({ ...gravado, observacao: 'a\nb' })?.observacao).toBe('a\nb')
    expect(validarCabecalhoFechamento({ ...gravado, motivo: 'a\rb' })).toBeUndefined()
    expect(validarCabecalhoFechamento({ ...gravado, motivo: 'a\tb' })).toBeUndefined()
    expect(validarCabecalhoFechamento({ ...gravado, autor: 'a\nb' })).toBeUndefined()
  })

  it('a nota "fechado contra a LBk": a LB atual sem data de gravação (trocada por importação) conta como diferente', () => {
    const c: CabecalhoFechamento = { ...fe1().cabecalho, linhaBaseSalvaEm: '2026-04-27T12:00:00.000Z' }
    expect(notasDaLinhaBaseDosFechamentos([c], 0, [{ numero: 0, salvaEm: '2026-04-27T12:00:00.000Z' }])).toEqual([]) // a mesma LB: sem nota
    expect(notasDaLinhaBaseDosFechamentos([c], 0, [{ numero: 0 }])).toEqual(['Fechamento de 23/10/2026: fechado contra a LB0 de 27/04/2026; a LB0 atual não é mais a mesma (foi trocada).'])
    // A LB do fechamento deixou de existir (a importação trouxe outras): a nota diz isso, em vez de "foi trocada"
    expect(notasDaLinhaBaseDosFechamentos([c], 0, [])).toEqual(['Fechamento de 23/10/2026: fechado contra a LB0 de 27/04/2026; a LB0 do fechamento não existe mais.'])
    expect(trechoDaLinhaBaseDoFechamento(c, [])).toEqual({ texto: 'fechado contra a LB0 de 27/04/2026; a LB0 do fechamento não existe mais', diferente: true })
    expect(trechoDaLinhaBaseDoFechamento(c, [{ numero: 0, salvaEm: '2026-04-27T12:00:00.000Z' }])).toEqual({ texto: 'fechado contra a LB0 de 27/04/2026', diferente: false })
    // fechamento de uma LB migrada (sem data de gravação): não há como comparar, sem nota
    expect(notasDaLinhaBaseDosFechamentos([{ ...c, linhaBaseSalvaEm: undefined }], 0, [{ numero: 0 }])).toEqual([])
  })
})
