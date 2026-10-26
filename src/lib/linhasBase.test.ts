// Linhas de base LB0 a LB10 (ciclo 00007, E1): projeção para o valor agregado, cópia do cronograma, rollup, saneamento e validação.
// Números do Edifício Aurora conferidos à mão no plano (data de status 2026-10-23) e afirmados aqui como literais.
import { describe, expect, it } from 'vitest'
import type { LinhaBaseInfo, ScheduleResult, ScheduledTask, Task } from '@/types/domain'
import { buildSeedState } from '@/stores/useProjectStore'
import { calendarioDeDias, calendarioPadrao, compilarCalendarios } from './calendarioTrabalho'
import { calcularObra } from './horizonte'
import { computeEvm } from './evm'
import {
  avisoTarefasSemLinhaBase,
  dadosDaLinhaBase,
  linhaBaseAtivaEfetiva,
  linhaBaseDoCronograma,
  normalizarQuebras,
  projetarLinhaBase,
  rollupLinhaBase,
  rotuloLinhaBase,
  sanearInfosLinhaBase,
  sanearLinhasBase,
  validarDadosLinhaBaseInfo,
  validarTextosLinhaBase,
} from './linhasBase'

const seed = buildSeedState()
const calculo = calcularObra(seed.tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid, { feriados: seed.feriados })

/** Aurora com a LB `n` copiada da LB0 (custo = bac), exceto nas tarefas de `semLb`. */
function auroraComLb(n: number, semLb: number[] = []): Task[] {
  return seed.tasks.map((t) =>
    t.isSummary || semLb.includes(t.uid)
      ? t
      : { ...t, linhasBase: { [String(n)]: { inicio: t.baselineStart, termino: t.baselineFinish, duracaoMin: t.baselineDuracaoMin, custo: t.bac } } },
  )
}
const evmDa = (tasks: Task[]) => computeEvm(tasks, calculo.calsPv, seed.meta.statusDate)

const tarefa = (uid: number, extra: Partial<Task> = {}): Task => ({
  uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false, duracaoMin: 4800, predecessors: [], percentComplete: 0, bac: 1000, actualCost: 0, resources: [], ...extra,
})

describe('projetarLinhaBase (D-6, G5 = b, G6 = a)', () => {
  it('LB-7: com a LB0 devolve o MESMO array (nenhum número muda)', () => {
    expect(projetarLinhaBase(seed.tasks, 0)).toBe(seed.tasks)
  })

  it('LB n: datas, duração e custo da LB n viram os campos de linha de base e o BAC; a tarefa original não é alterada', () => {
    const t = tarefa(1, { baselineStart: '2026-01-05', baselineFinish: '2026-01-30', bac: 1000, linhasBase: { '2': { inicio: '2026-02-02', termino: '2026-02-27', duracaoMin: 9600, custo: 800 } } })
    const [p] = projetarLinhaBase([t], 2)
    expect([p.baselineStart, p.baselineFinish, p.baselineDuracaoMin, p.bac]).toEqual(['2026-02-02', '2026-02-27', 9600, 800])
    expect([t.baselineStart, t.baselineFinish, t.bac]).toEqual(['2026-01-05', '2026-01-30', 1000])
  })

  it('LB-4 (função): a 801 sem a LB3: BAC 18.993.000,00; PV 7.259.250,00; EV 6.448.200,00; AC 6.896.900,00; CPI 0,934942; EAC 20.314.633,80', () => {
    const tasks = auroraComLb(3, [801])
    const e = evmDa(projetarLinhaBase(tasks, 3))
    expect(e.bac).toBe(18993000)
    expect(e.pv).toBe(7259250) // a 801 tem a LB0 em 2027: contribuição 0
    expect(e.ev).toBe(6448200) // a 801 está em 0%
    expect(e.ac).toBe(6896900) // o custo real continua contando
    expect(e.cpi).toBeCloseTo(0.934942, 6)
    expect(e.eac).toBeCloseTo(20314633.8, 2)
    expect(avisoTarefasSemLinhaBase(tasks, 3)).toBe('1 tarefa(s) sem a linha de base 3: o PV, o EV e o orçamento (BAC) delas são zero; o custo real continua contando.')
  })

  it('LB-4 (variante): o 104 sem a LB3: BAC 18.945.000,00; EV 6.381.000,00; AC inalterado; CPI 0,925198; EAC 20.476.691,82; PV 7.091.250,00 (sem a contribuição de 168.000,00 do 104 na LB0, C-7)', () => {
    const e = evmDa(projetarLinhaBase(auroraComLb(3, [104]), 3))
    expect(e.bac).toBe(18945000)
    expect(e.ev).toBe(6381000)
    expect(e.ac).toBe(6896900)
    expect(e.pv).toBe(7091250)
    expect(e.cpi).toBeCloseTo(0.925198, 6)
    expect(e.eac).toBeCloseTo(20476691.82, 2)
  })

  it('LB incompleta (custo sem datas): PV 0 e EV = % × custo da LB; custo sem nada: BAC 0', () => {
    const comCusto = tarefa(1, { percentComplete: 50, linhasBase: { '1': { custo: 600 } } })
    const sem = tarefa(2, { percentComplete: 50, linhasBase: { '1': {} } })
    const e = evmDa(projetarLinhaBase([comCusto, sem], 1))
    expect([e.bac, e.pv, e.ev]).toEqual([600, 0, 300])
  })

  it('o aviso da D-8 some quando todas as folhas têm custo na LB e com a LB0', () => {
    expect(avisoTarefasSemLinhaBase(auroraComLb(1), 1)).toBeUndefined()
    expect(avisoTarefasSemLinhaBase(seed.tasks, 0)).toBeUndefined()
  })
})

describe('dadosDaLinhaBase', () => {
  it('LB0 = campos atuais com o custo = bac; sem nenhuma data nem duração: ausente', () => {
    expect(dadosDaLinhaBase(tarefa(1, { baselineStart: '2026-01-05', baselineFinish: '2026-01-09', baselineDuracaoMin: 2400, bac: 700 }), 0)).toEqual({ inicio: '2026-01-05', termino: '2026-01-09', duracaoMin: 2400, custo: 700 })
    expect(dadosDaLinhaBase(tarefa(1), 0)).toBeUndefined()
    expect(dadosDaLinhaBase(tarefa(1, { linhasBase: { '4': { custo: 1 } } }), 4)).toEqual({ custo: 1 })
    expect(dadosDaLinhaBase(tarefa(1), 4)).toBeUndefined()
  })
})

describe('linhaBaseDoCronograma (D-2)', () => {
  const sch = (uid: number, start: string, finish: string, duracaoMin: number): [number, ScheduledTask] => [uid, { uid, start, finish, duracaoMin } as ScheduledTask]
  const schedule = { byUid: new Map([sch(1, '2026-03-02', '2026-03-13', 9600), sch(2, '2026-03-16', '2026-03-20', 4800)]) } as ScheduleResult
  const tasks = [tarefa(1, { bac: 500, baselineStart: '2026-01-05' }), tarefa(2, { bac: 700 }), tarefa(3, { isSummary: true, bac: 0 })]

  it('LB n copia início, término, duração e custo = bac das folhas do cronograma; a LB0 e as outras LBs ficam intactas', () => {
    const out = linhaBaseDoCronograma(tasks.map((t) => (t.uid === 2 ? { ...t, linhasBase: { '1': { custo: 9 } } } : t)), schedule, 2)
    expect(out[0].linhasBase).toEqual({ '2': { inicio: '2026-03-02', termino: '2026-03-13', duracaoMin: 9600, custo: 500 } })
    expect(out[1].linhasBase).toEqual({ '1': { custo: 9 }, '2': { inicio: '2026-03-16', termino: '2026-03-20', duracaoMin: 4800, custo: 700 } })
    expect(out[0].baselineStart).toBe('2026-01-05')
    expect(out[2]).toBe(tasks[2]) // o resumo não tem LB n no estado (vem do rollup)
  })

  it('LB0 faz o que o antigo saveBaseline fazia: datas e duração nos campos da LB0, sem mexer em linhasBase', () => {
    const out = linhaBaseDoCronograma(tasks, schedule, 0)
    expect([out[0].baselineStart, out[0].baselineFinish, out[0].baselineDuracaoMin]).toEqual(['2026-03-02', '2026-03-13', 9600])
    expect(out[0].linhasBase).toBeUndefined()
    expect(out[2]).toBe(tasks[2])
  })
})

describe('rollupLinhaBase (E-6)', () => {
  it('resumo: menor início, maior término, soma do custo e duração = d.u. do calendário padrão × 480 (05–09/01 e 12–16/01/2026, sem feriados: 4.800 min)', () => {
    const cal = calendarioDeDias(compilarCalendarios('2026-01-05', [calendarioPadrao([])], 1).padrao)
    const tasks = [
      tarefa(10, { isSummary: true, wbs: '01', bac: 0 }),
      tarefa(11, { wbs: '01.1', linhasBase: { '1': { inicio: '2026-01-05', termino: '2026-01-09', duracaoMin: 2400, custo: 1000 } } }),
      tarefa(12, { wbs: '01.2', linhasBase: { '1': { inicio: '2026-01-12', termino: '2026-01-16', duracaoMin: 2400, custo: 2500 } } }),
      tarefa(20, { isSummary: true, wbs: '02', bac: 0 }),
    ]
    const r = rollupLinhaBase(tasks, 1, cal, 480)
    expect(r.get(10)).toEqual({ inicio: '2026-01-05', termino: '2026-01-16', duracaoMin: 4800, custo: 3500 })
    expect(r.has(20)).toBe(false) // resumo sem folha com a LB 1
  })
})

describe('sanearLinhasBase (dado externo)', () => {
  it('descarta a entrada inválida (número, data, duração, custo) e reconstrói as demais só com os campos conhecidos', () => {
    const t = {
      uid: 1,
      linhasBase: {
        '1': { inicio: '2026-01-05', termino: '2026-01-09', duracaoMin: 2400, custo: 10, extra: 'x' },
        '11': { custo: 1 },
        '0': { custo: 1 },
        '2': { inicio: '2026-02-30' },
        '3': { duracaoMin: 1.5 },
        '4': { duracaoMin: 50 * 365 * 1440 + 1 },
        '5': { custo: -1 },
        '6': { custo: Number.NaN },
        '7': 'texto',
        '8': {},
        '09': { custo: 1 },
      },
    }
    const r = sanearLinhasBase([t])
    expect(r.tasks[0].linhasBase).toEqual({ '1': { inicio: '2026-01-05', termino: '2026-01-09', duracaoMin: 2400, custo: 10 } })
    expect(r.descartadas).toBe(10)
  })

  it('tarefa sem linhasBase fica igual (mesmo objeto); linhasBase que não é objeto perde o campo; mapa vazio vira ausente', () => {
    const a = { uid: 1 }
    const b = { uid: 2, linhasBase: [1, 2] }
    const c = { uid: 3, linhasBase: { '1': { custo: -5 } } }
    const r = sanearLinhasBase<{ uid: number; linhasBase?: unknown }>([a, b, c])
    expect(r.tasks[0]).toBe(a)
    expect(r.tasks[1]).toEqual({ uid: 2 })
    expect(r.tasks[2]).toEqual({ uid: 3 })
    expect(r.descartadas).toBe(2)
  })

  it('só aceita os números que existem na lista de metadados', () => {
    const r = sanearLinhasBase([{ uid: 1, linhasBase: { '1': { custo: 1 }, '2': { custo: 2 } } }], new Set([2]))
    expect(r.tasks[0].linhasBase).toEqual({ '2': { custo: 2 } })
    expect(r.descartadas).toBe(1)
  })

  it('__proto__ e chaves extras não passam', () => {
    const lixo = JSON.parse('{"uid":1,"linhasBase":{"1":{"custo":1,"__proto__":{"admin":true}}}}') as { uid: number; linhasBase?: unknown }
    const r = sanearLinhasBase([lixo])
    const lb = (r.tasks[0].linhasBase as Record<string, Record<string, unknown>>)['1']
    expect(Object.keys(lb)).toEqual(['custo'])
    expect(({} as Record<string, unknown>).admin).toBeUndefined()
  })
})

describe('metadados da linha de base (D-4)', () => {
  const info: LinhaBaseInfo = { numero: 1, nome: 'Replanejamento após chuvas', motivo: 'Chuvas de setembro', autor: 'Eng. Fictícia', salvaEm: '2026-10-25T15:00:00.000Z', dataStatus: '2026-10-23', origem: 'cronoai' }

  it('rótulo "LB1 — Replanejamento após chuvas (25/10/2026)"; sem data de gravação, sem parênteses', () => {
    expect(rotuloLinhaBase(info)).toBe('LB1 — Replanejamento após chuvas (25/10/2026)')
    expect(rotuloLinhaBase({ ...info, salvaEm: undefined })).toBe('LB1 — Replanejamento após chuvas')
  })

  it('limites: nome 1 a 60, motivo 1 a 500, autor até 120; sem caractere de controle; <script> é só texto', () => {
    expect(validarTextosLinhaBase({ nome: 'N', motivo: 'M' })).toEqual([])
    expect(validarTextosLinhaBase({ nome: '<script>alert(1)</script>', motivo: 'm', autor: '<b>x</b>' })).toEqual([])
    expect(validarTextosLinhaBase({ nome: ' ', motivo: 'm' })).toEqual(['Informe o nome da linha de base.'])
    expect(validarTextosLinhaBase({ nome: 'n'.repeat(61), motivo: 'm' })).toEqual(['O nome da linha de base passa de 60 caracteres.'])
    expect(validarTextosLinhaBase({ nome: 'n'.repeat(60), motivo: 'm'.repeat(501) })).toEqual(['O motivo da linha de base passa de 500 caracteres.'])
    expect(validarTextosLinhaBase({ nome: 'n', motivo: '' })).toEqual(['Informe o motivo da linha de base.'])
    expect(validarTextosLinhaBase({ nome: 'n', motivo: 'm', autor: 'a'.repeat(121) })).toEqual(['O autor passa de 120 caracteres.'])
    expect(validarTextosLinhaBase({ nome: 'n\u0007', motivo: 'm' })).toEqual(['Os textos não podem ter caracteres de controle.'])
  })

  it('rodada 02 (SEG-5): o motivo aceita a quebra de linha (\\r\\n vira \\n); nome e autor não; os outros caracteres de controle seguem recusados; a leitura vale o mesmo', () => {
    expect(normalizarQuebras('a\r\nb\rc\nd')).toBe('a\nb\nc\nd')
    expect(validarTextosLinhaBase({ nome: 'N', motivo: 'linha 1\r\nlinha 2' })).toEqual([])
    expect(validarTextosLinhaBase({ nome: 'N\nX', motivo: 'm' })).toEqual(['Os textos não podem ter caracteres de controle.'])
    expect(validarTextosLinhaBase({ nome: 'N', motivo: 'm', autor: 'a\nb' })).toEqual(['Os textos não podem ter caracteres de controle.'])
    expect(validarTextosLinhaBase({ nome: 'N', motivo: 'm\tx' })).toEqual(['Os textos não podem ter caracteres de controle.'])
    expect(validarTextosLinhaBase({ nome: 'N', motivo: 'm\u0007' })).toEqual(['Os textos não podem ter caracteres de controle.'])
    const gravada = { ...info, motivo: 'linha 1\nlinha 2' }
    expect(validarDadosLinhaBaseInfo(gravada)).toEqual(gravada) // lida de volta igual
    expect(validarDadosLinhaBaseInfo({ ...info, motivo: 'a\rb' })).toBeUndefined()
    expect(validarDadosLinhaBaseInfo({ ...info, nome: 'a\nb' })).toBeUndefined()
  })

  it('validarDadosLinhaBaseInfo reconstrói só os campos conhecidos e recusa o inválido', () => {
    expect(validarDadosLinhaBaseInfo({ ...info, extra: 1 })).toEqual(info)
    for (const ruim of [
      { ...info, numero: 11 },
      { ...info, numero: 1.5 },
      { ...info, numero: -1 },
      { ...info, nome: '' },
      { ...info, motivo: 7 },
      { ...info, autor: 3 },
      { ...info, salvaEm: 'ontem' },
      { ...info, dataStatus: '2026-02-30' },
      { ...info, origem: 'hacker' },
      null,
      'x',
    ]) expect(validarDadosLinhaBaseInfo(ruim)).toBeUndefined()
  })

  it('sanearInfosLinhaBase: ordena, descarta o inválido e o número repetido (vale o primeiro)', () => {
    const r = sanearInfosLinhaBase([{ ...info, numero: 3 }, info, { ...info, nome: 'repetida' }, { ...info, numero: 99 }, 'lixo'])
    expect(r.infos.map((i) => [i.numero, i.nome])).toEqual([[1, 'Replanejamento após chuvas'], [3, 'Replanejamento após chuvas']])
    expect(r.descartadas).toBe(3)
    expect(sanearInfosLinhaBase('não é lista')).toEqual({ infos: [], descartadas: 0 })
  })

  it('linhaBaseAtivaEfetiva: só vale a LB que existe; senão a LB0', () => {
    expect(linhaBaseAtivaEfetiva(undefined, [info])).toBe(0)
    expect(linhaBaseAtivaEfetiva(1, [info])).toBe(1)
    expect(linhaBaseAtivaEfetiva(2, [info])).toBe(0)
    expect(linhaBaseAtivaEfetiva(11, [{ ...info, numero: 11 }])).toBe(0)
    expect(linhaBaseAtivaEfetiva(1.5, [info])).toBe(0)
  })
})
