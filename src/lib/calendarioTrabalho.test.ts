import { describe, expect, it } from 'vitest'
import type { CalendarioObra } from '@/types/domain'
import { brazilianHolidays } from './calendar'
import {
  EXPEDIENTE_PADRAO,
  TETO_DIAS,
  calendarioDeDias,
  calendarioPadrao,
  comDiasExtras,
  compilarCalendarios,
  dataDoMomento,
  diasExtrasDo,
  diasParaMinutos,
  erroDoCalendario,
  expedienteDoDiaUtil,
  horaDoMomento,
  horaParaMinutos,
  lerDataHora,
  minutosParaDias,
  minutosParaHora,
  momentoDe,
  resumoJornadaSemana,
  MAX_CALENDARIOS,
  PREDEFINICOES_JORNADA,
  copiarCalendario,
  erroDoNomeCalendario,
  intervaloDeTextos,
  intervalosDaPredefinicao,
  predefinicaoDe,
  proximoUidCalendario,
  semDiasExtras,
} from './calendarioTrabalho'

// Base comum do plano 00004 (seção 04): seg-sex 08:00-12:00 e 13:00-17:00; "Sábado 4 h" = igual + sábado 08:00-12:00.
// Agosto de 2026 não tem feriado nacional; 07/09/2026 (segunda) é feriado.
const BASE = '2026-08-03' // segunda-feira
const padrao = calendarioPadrao(brazilianHolidays(2026))
const sabado4h: CalendarioObra = {
  ...padrao,
  uid: 2,
  nome: 'Sábado 4 h',
  semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)),
}
const cals = compilarCalendarios(BASE, [padrao, sabado4h], 1)
const std = cals.padrao
const sab = cals.de(2)
const m = (data: string, hora = '00:00') => momentoDe(BASE, data, horaParaMinutos(hora)!)
const quando = (momento: number) => `${dataDoMomento(BASE, momento)} ${horaDoMomento(momento)}`

describe('conversões de unidade', () => {
  it('dias ↔ minutos (meio para cima) e dia de obra com outra jornada', () => {
    expect(diasParaMinutos(12)).toBe(5760)
    expect(diasParaMinutos(0.5)).toBe(240)
    expect(diasParaMinutos(1.5, 450)).toBe(675)
    expect(diasParaMinutos(7.92)).toBe(3802) // 3.801,6 → 3.802
    expect(minutosParaDias(5760)).toBe(12)
    expect(minutosParaDias(240)).toBe(0.5)
  })

  it('horários: 24:00 vale 1.440; inválidos são recusados', () => {
    expect(horaParaMinutos('08:00')).toBe(480)
    expect(horaParaMinutos('17:00:00')).toBe(1020)
    expect(horaParaMinutos('24:00:00')).toBe(1440)
    expect(horaParaMinutos('25:00')).toBeUndefined()
    expect(horaParaMinutos('12:60')).toBeUndefined()
    expect(horaParaMinutos('24:01')).toBeUndefined()
    expect(horaParaMinutos('abc')).toBeUndefined()
    expect(minutosParaHora(1440)).toBe('24:00')
    expect(minutosParaHora(785)).toBe('13:05')
  })

  it('data-hora sem fuso: data só, data com hora e datas inexistentes', () => {
    expect(lerDataHora('2026-08-12')).toEqual({ data: '2026-08-12' })
    expect(lerDataHora('2026-08-12T13:30')).toEqual({ data: '2026-08-12', minuto: 810 })
    expect(lerDataHora('2026-08-12T13:30:00')).toEqual({ data: '2026-08-12', minuto: 810 })
    expect(lerDataHora('2026-02-30')).toBeUndefined()
    expect(lerDataHora('2026-08-12T25:00')).toBeUndefined()
    expect(lerDataHora('12/08/2026')).toBeUndefined()
  })

  it('momento ↔ data e hora, inclusive antes da data-base', () => {
    expect(momentoDe(BASE, '2026-08-03', 480)).toBe(480)
    expect(momentoDe(BASE, '2026-08-04')).toBe(1440)
    expect(quando(momentoDe(BASE, '2026-07-31', 1020))).toBe('2026-07-31 17:00')
    expect(momentoDe(BASE, '2026-07-31', 1020)).toBe(-3 * 1440 + 1020)
  })
})

describe('aritmética de minutos úteis', () => {
  it('CR-2a: 12 dias (5.760 min) desde 03/08 08:00 terminam em 18/08 17:00 no padrão e em 17/08 17:00 com sábado de 4 h', () => {
    const ini = m('2026-08-03', '08:00')
    expect(quando(std.somarUteis(std.proximoUtil(m('2026-08-03')), 5760))).toBe('2026-08-18 17:00')
    expect(quando(sab.somarUteis(ini, 5760))).toBe('2026-08-17 17:00')
  })

  it('CR-2b: 5 dias desde sex 07/08 08:00 no sábado de 4 h terminam em qui 13/08 12:00; no padrão, 13/08 17:00', () => {
    const ini = m('2026-08-07', '08:00')
    expect(quando(sab.somarUteis(ini, 2400))).toBe('2026-08-13 12:00')
    expect(quando(std.somarUteis(ini, 2400))).toBe('2026-08-13 17:00')
  })

  it('CR-2b: a sucessora no padrão começa onde a predecessora termina, no próximo momento útil', () => {
    // A no padrão: B vai de 14/08 08:00 a 14/08 17:00
    const fimA = std.somarUteis(m('2026-08-07', '08:00'), 2400)
    expect(quando(std.proximoUtil(fimA))).toBe('2026-08-14 08:00')
    expect(quando(std.somarUteis(std.proximoUtil(fimA), 480))).toBe('2026-08-14 17:00')
    // A no sábado de 4 h: B vai de 13/08 13:00 a 14/08 12:00
    const fimA2 = sab.somarUteis(m('2026-08-07', '08:00'), 2400)
    const iniB = std.proximoUtil(fimA2)
    expect(quando(iniB)).toBe('2026-08-13 13:00')
    expect(quando(std.somarUteis(iniB, 480))).toBe('2026-08-14 12:00')
  })

  it('somar 0 não normaliza (o marco fica às 17:00); o término termina às 17:00 e não às 08:00 do dia seguinte', () => {
    const fim = m('2026-08-07', '17:00')
    expect(std.somarUteis(fim, 0)).toBe(fim)
    expect(quando(std.somarUteis(m('2026-08-07', '08:00'), 480))).toBe('2026-08-07 17:00')
    expect(quando(std.proximoUtil(fim))).toBe('2026-08-10 08:00')
    expect(quando(std.fimUtilAte(m('2026-08-10', '08:00')))).toBe('2026-08-07 17:00')
  })

  it('o intervalo do meio-dia entra na conta: 11:00 + 120 min = 14:00', () => {
    expect(quando(std.somarUteis(m('2026-08-04', '11:00'), 120))).toBe('2026-08-04 14:00')
    expect(quando(std.somarUteis(m('2026-08-04', '12:00'), 60))).toBe('2026-08-04 14:00')
    expect(quando(std.proximoUtil(m('2026-08-04', '12:00')))).toBe('2026-08-04 13:00')
  })

  it('feriado e fim de semana: sex 04/09 16:00 + 120 min = ter 08/09 09:00 (07/09 é feriado)', () => {
    expect(quando(std.somarUteis(m('2026-09-04', '16:00'), 120))).toBe('2026-09-08 09:00')
    expect(std.dataUtil('2026-09-07')).toBe(false)
    expect(std.dataUtil('2026-08-08')).toBe(false)
    expect(sab.dataUtil('2026-08-08')).toBe(true)
  })

  it('lag negativo e retrocesso: voltar 480 min de 14/08 08:00 dá 13/08 08:00', () => {
    expect(quando(std.somarUteis(m('2026-08-14', '08:00'), -480))).toBe('2026-08-13 08:00')
    expect(quando(std.somarUteis(m('2026-08-14', '17:00'), -480))).toBe('2026-08-14 08:00')
    expect(quando(sab.somarUteis(m('2026-08-10', '08:00'), -240))).toBe('2026-08-08 08:00') // sábado de 4 h
  })

  it('minutos úteis entre dois momentos, com sinal', () => {
    expect(std.minutosUteisEntre(m('2026-08-03', '08:00'), m('2026-08-07', '17:00'))).toBe(2400)
    expect(std.minutosUteisEntre(m('2026-08-07', '17:00'), m('2026-08-03', '08:00'))).toBe(-2400)
    expect(std.minutosUteisEntre(m('2026-08-07', '17:00'), m('2026-08-10', '08:00'))).toBe(0)
    expect(sab.minutosUteisEntre(m('2026-08-03'), m('2026-08-10'))).toBe(2640)
  })

  it('antes da data-base a conta continua exata', () => {
    expect(quando(std.somarUteis(m('2026-08-03', '08:00'), -480))).toBe('2026-07-31 08:00')
    expect(quando(std.proximoUtil(m('2026-07-31', '17:00')))).toBe('2026-08-03 08:00')
    expect(quando(std.fimUtilAte(m('2026-07-30', '10:00')))).toBe('2026-07-30 10:00')
    expect(std.minutosUteisEntre(m('2026-07-27', '08:00'), m('2026-08-03', '08:00'))).toBe(2400)
  })

  it('início do último dia útil em ou antes do dia (sábado volta para a sexta)', () => {
    expect(quando(std.inicioDoDiaUtilNoOuAntes(5))).toBe('2026-08-07 08:00') // 08/08 é sábado
    expect(quando(std.inicioDoDiaUtilNoOuAntes(4))).toBe('2026-08-07 08:00')
    expect(quando(sab.inicioDoDiaUtilNoOuAntes(5))).toBe('2026-08-08 08:00')
  })

  it('exceção útil com horário: sábado 15/08 08:00-12:00 no padrão', () => {
    const comSabado = calendarioPadrao(brazilianHolidays(2026))
    comSabado.excecoes.push({ data: '2026-08-15', intervalos: [{ de: 480, ate: 720 }] })
    const c = compilarCalendarios(BASE, [comSabado], 1).padrao
    expect(quando(c.somarUteis(m('2026-08-14', '16:00'), 120))).toBe('2026-08-15 09:00')
    expect(quando(c.somarUteis(m('2026-08-14', '16:00'), 300))).toBe('2026-08-15 12:00')
    expect(quando(c.somarUteis(m('2026-08-14', '16:00'), 301))).toBe('2026-08-17 08:01')
  })

  it('calendário de 24 horas (00:00-24:00, "24 Horas" do MS Project) e calendário interno corrido', () => {
    const horas24: CalendarioObra = { uid: 3, nome: '24 Horas', semana: Array.from({ length: 7 }, () => [{ de: 0, ate: 1440 }]), excecoes: [] }
    const c = compilarCalendarios(BASE, [padrao, horas24], 1).de(3)
    expect(c.minutosNoDia(0)).toBe(1440)
    expect(quando(c.somarUteis(m('2026-08-07', '08:00'), 1440))).toBe('2026-08-08 08:00')
    expect(quando(c.somarUteis(m('2026-08-07', '00:00'), 1440))).toBe('2026-08-08 00:00')
    expect(quando(cals.corrido.somarUteis(m('2026-08-07', '08:00'), 1440))).toBe('2026-08-08 08:00')
  })

  it('turno noturno em dois intervalos por dia: seg 23:00 + 120 min = ter 01:00', () => {
    const noturno: CalendarioObra = {
      uid: 4,
      nome: 'Noturno',
      semana: [[], [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }], [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }], [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }], [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }], [{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }], []],
      excecoes: [],
    }
    const c = compilarCalendarios(BASE, [padrao, noturno], 1).de(4)
    expect(quando(c.somarUteis(m('2026-08-03', '23:00'), 120))).toBe('2026-08-04 01:00')
    expect(quando(c.somarUteis(m('2026-08-03', '23:00'), 60))).toBe('2026-08-04 00:00') // 23:59 → 00:00 = fim do intervalo, no dia seguinte
    expect(quando(c.somarUteis(m('2026-08-07', '23:00'), 120))).toBe('2026-08-10 01:00') // sexta à noite: segue na segunda 00:00
    expect(c.minutosNoDia(1)).toBe(540)
  })

  it('o horizonte tem teto de 50 anos: acima dele, erro explícito em português', () => {
    expect(TETO_DIAS).toBe(18_250)
    expect(() => std.somarUteis(0, 10_000_000)).toThrow(/horizonte de 50 anos/)
    expect(() => std.somarUteis(0, -10_000_000)).toThrow(/horizonte de 50 anos/)
    // 30 anos de 5 dias úteis × 480 min continuam dentro do teto
    expect(quando(std.somarUteis(0, 480 * 260 * 30)).slice(0, 4)).toBe('2056')
  })
})

describe('validação e compilação dos calendários', () => {
  const ok: CalendarioObra = { uid: 9, nome: 'Teste', semana: [[], [{ de: 480, ate: 1020 }], [], [], [], [], []], excecoes: [] }

  it('calendário válido não tem erro; a semana é de 7 dias', () => {
    expect(erroDoCalendario(ok)).toBeUndefined()
    expect(erroDoCalendario({ ...ok, semana: ok.semana.slice(0, 6) })).toBe('a semana deve ter 7 dias.')
  })

  it('recusa mais de 5 intervalos por dia, intervalo vazio, fora de ordem, sobreposto e fora de 00:00-24:00', () => {
    const seis = Array.from({ length: 6 }, (_, i) => ({ de: i * 100, ate: i * 100 + 50 }))
    expect(erroDoCalendario({ ...ok, semana: [seis, [], [], [], [], [], []] })).toMatch(/mais de 5 intervalos/)
    const cinco = seis.slice(0, 5)
    expect(erroDoCalendario({ ...ok, semana: [cinco, [], [], [], [], [], []] })).toBeUndefined()
    expect(erroDoCalendario({ ...ok, semana: [[{ de: 600, ate: 600 }], [], [], [], [], [], []] })).toMatch(/fim do intervalo/)
    expect(erroDoCalendario({ ...ok, semana: [[{ de: 900, ate: 700 }], [], [], [], [], [], []] })).toMatch(/fim do intervalo/)
    expect(erroDoCalendario({ ...ok, semana: [[{ de: 600, ate: 700 }, { de: 650, ate: 800 }], [], [], [], [], [], []] })).toMatch(/fora de ordem ou sobrepostos/)
    expect(erroDoCalendario({ ...ok, semana: [[{ de: 0, ate: 1441 }], [], [], [], [], [], []] })).toMatch(/fora de 00:00–24:00/)
    expect(erroDoCalendario({ ...ok, semana: [[{ de: -1, ate: 100 }], [], [], [], [], [], []] })).toMatch(/fora de 00:00–24:00/)
  })

  it('calendário cuja semana não tem tempo útil é recusado, mesmo com exceções úteis (evita varrer anos sem trabalho)', () => {
    const vazio: CalendarioObra = { ...ok, semana: [[], [], [], [], [], [], []] }
    expect(erroDoCalendario(vazio)).toBe('a semana do calendário não tem nenhum tempo útil.')
    expect(erroDoCalendario({ ...vazio, excecoes: [{ data: '2026-08-15', intervalos: [{ de: 480, ate: 720 }] }] })).toBe('a semana do calendário não tem nenhum tempo útil.')
    expect(() => compilarCalendarios(BASE, [vazio], 9)).toThrow('Calendário inválido: a semana do calendário não tem nenhum tempo útil.')
  })

  it('calendário com forma inválida (vindo do estado salvo) é recusado sem exceção não tratada', () => {
    expect(erroDoCalendario({ ...ok, excecoes: 'x' as unknown as [] })).toBe('as exceções devem ser uma lista.')
    expect(erroDoCalendario({ ...ok, semana: [1, 2, 3, 4, 5, 6, 7] as unknown as [][] })).toBe('a semana deve ter 7 dias.')
    expect(erroDoCalendario({ ...ok, excecoes: [{ data: '2026-08-15', intervalos: 'x' as unknown as [] }] })).toBe('exceção com horário inválido.')
    expect(erroDoCalendario({ ...ok, excecoes: [null as unknown as { data: string; intervalos: [] }] })).toBe('exceção com data inválida.')
  })

  it('exceção com data inválida é recusada; calendário padrão inexistente também', () => {
    expect(erroDoCalendario({ ...ok, excecoes: [{ data: '2026-02-30', intervalos: [] }] })).toBe('exceção com data inválida.')
    expect(() => compilarCalendarios(BASE, [ok], 1)).toThrow('O calendário padrão da obra não existe.')
  })

  it('tarefa sem calendário ou com UID inexistente usa o padrão', () => {
    expect(cals.de(undefined).uid).toBe(1)
    expect(cals.de(99).uid).toBe(1)
    expect(cals.de(2).uid).toBe(2)
    expect(cals.de(2).nome).toBe('Sábado 4 h')
  })

  it('PV: sem as exceções úteis, o sábado de hora extra deixa de contar e o feriado continua', () => {
    const extra = comDiasExtras(padrao, ['2026-08-08'])
    const normal = compilarCalendarios(BASE, [extra], 1).padrao
    const pv = compilarCalendarios(BASE, [extra], 1, { semExcecoesUteis: true }).padrao
    expect(normal.dataUtil('2026-08-08')).toBe(true)
    expect(pv.dataUtil('2026-08-08')).toBe(false)
    expect(pv.dataUtil('2026-09-07')).toBe(false)
  })
})

describe('calendário padrão e dias extras', () => {
  it('padrão: seg-sex 08:00-12:00 e 13:00-17:00, feriados como exceções não úteis, ordenadas por data', () => {
    expect(padrao.uid).toBe(1)
    expect(padrao.nome).toBe('Padrão Obra (seg-sex, 8h)')
    expect(padrao.semana[0]).toEqual([])
    expect(padrao.semana[6]).toEqual([])
    expect(padrao.semana[3]).toEqual([...EXPEDIENTE_PADRAO])
    expect(padrao.excecoes.every((ex) => ex.intervalos.length === 0)).toBe(true)
    expect(padrao.excecoes.map((e) => e.data)).toEqual([...padrao.excecoes.map((e) => e.data)].sort())
    expect(padrao.excecoes.map((e) => e.data)).toContain('2026-09-07')
  })

  it('dia extra vence o feriado da mesma data; comDiasExtras e semDiasExtras são inversos', () => {
    const c = calendarioPadrao(['2026-08-08', '2026-09-07'], ['2026-08-08'])
    expect(c.excecoes).toEqual([
      { data: '2026-08-08', intervalos: [{ de: 480, ate: 720 }, { de: 780, ate: 1020 }] },
      { data: '2026-09-07', intervalos: [] },
    ])
    const base = calendarioPadrao(brazilianHolidays(2026))
    const com = comDiasExtras(base, ['2026-10-31', '2026-10-24'])
    expect(diasExtrasDo(com)).toEqual(['2026-10-24', '2026-10-31'])
    expect(semDiasExtras(com, ['2026-10-24', '2026-10-31'])).toEqual(base)
    expect(expedienteDoDiaUtil(base)).toEqual([...EXPEDIENTE_PADRAO])
  })

  it('WorkCalendar a partir do calendário compilado: dia útil = dia com minutos úteis', () => {
    const w = calendarioDeDias(sab)
    expect(w.isWorkingDay('2026-08-08')).toBe(true) // sábado de 4 h
    expect(w.isWorkingDay('2026-08-09')).toBe(false)
    expect(w.isWorkingDay('2026-09-07')).toBe(false)
    expect(w.indexOnOrAfter('2026-08-08')).toBe(5)
    expect(calendarioDeDias(std).dateAt(5)).toBe('2026-08-10')
  })
})

describe('resumo da jornada semanal (tela de premissas)', () => {
  it('agrupa dias seguidos com a mesma carga: "seg–sex 8 h; sáb–dom —"', () => {
    expect(resumoJornadaSemana(calendarioPadrao([]))).toBe('seg–sex 8 h; sáb–dom —')
  })
  it('sábado de 4 h e sexta mais curta', () => {
    const base = calendarioPadrao([])
    const semana = base.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : i === 5 ? [{ de: 450, ate: 690 }] : d))
    expect(resumoJornadaSemana({ ...base, semana })).toBe('seg–qui 8 h; sex–sáb 4 h; dom —')
  })
})

describe('calendários alternativos do editor (ciclo 00005, CS-1 a CS-5)', () => {
  const cal = (c: CalendarioObra) => compilarCalendarios(BASE, [c], c.uid)
  const comSemana = (semana: CalendarioObra['semana'], extra: Partial<CalendarioObra> = {}): CalendarioObra => ({ uid: 1, nome: 'Teste', semana, excecoes: [], ...extra })

  it('CS-2: sábado de 4 h por exceção de data: 12 d desde seg 03/08 terminam 18/08 12:00 (no padrão, 18/08 17:00)', () => {
    const comSabado: CalendarioObra = {
      ...calendarioPadrao([]),
      excecoes: [{ data: '2026-08-08', intervalos: [{ de: 480, ate: 720 }], descricao: 'Sábado de 4 h' }],
    }
    const c = cal(comSabado).padrao
    expect(quando(c.somarUteis(c.proximoUtil(m('2026-08-03')), 5760))).toBe('2026-08-18 12:00')
    const p = cal(calendarioPadrao([])).padrao
    expect(quando(p.somarUteis(p.proximoUtil(m('2026-08-03')), 5760))).toBe('2026-08-18 17:00')
    expect(c.minutosNoDia(m('2026-08-08') / 1440)).toBe(240) // meio dia = 0,5 d.u.
  })

  it('CS-3: jornada por dia ("Fachada — sem chuva": seg–qui 07–12 e 13–17, sex 07–11): 5 d desde seg 07:00 terminam sex 07/08 11:00', () => {
    const dia9h = [{ de: 420, ate: 720 }, { de: 780, ate: 1020 }]
    const fachada = comSemana([[], dia9h, dia9h, dia9h, dia9h, [{ de: 420, ate: 660 }], []], { nome: 'Fachada — sem chuva' })
    expect(erroDoCalendario(fachada)).toBeUndefined()
    const c = cal(fachada).padrao
    expect(quando(c.somarUteis(m('2026-08-03', '07:00'), 2400))).toBe('2026-08-07 11:00')
  })

  it('CS-5: 00:00–00:00 é o dia inteiro (1.440 min) e 22:00–00:00 são 120 min', () => {
    expect(intervaloDeTextos('00:00', '00:00')).toEqual({ intervalo: { de: 0, ate: 1440 } })
    expect(intervaloDeTextos('22:00', '00:00')).toEqual({ intervalo: { de: 1320, ate: 1440 } })
    expect(intervaloDeTextos('08:00', '12:00')).toEqual({ intervalo: { de: 480, ate: 720 } })
    const diaInteiro = comSemana(Array.from({ length: 7 }, () => [{ de: 0, ate: 1440 }]))
    expect(erroDoCalendario(diaInteiro)).toBeUndefined()
    expect(cal(diaInteiro).padrao.minutosNoDia(0)).toBe(1440)
    const noite = comSemana(Array.from({ length: 7 }, () => [{ de: 1320, ate: 1440 }]))
    expect(cal(noite).padrao.minutosNoDia(0)).toBe(120)
  })

  it('CS-5: 6 intervalos num dia e fim antes do início são recusados', () => {
    const seis = [0, 1, 2, 3, 4, 5].map((i) => ({ de: i * 120, ate: i * 120 + 60 }))
    expect(erroDoCalendario(comSemana([[], seis, [], [], [], [], []]))).toBe('dia 1 da semana: mais de 5 intervalos de trabalho no dia.')
    expect(erroDoCalendario(comSemana([[], seis.slice(0, 5), [], [], [], [], []]))).toBeUndefined()
    expect(intervaloDeTextos('13:00', '12:00')).toEqual({ erro: 'O fim do intervalo deve ser depois do início.' })
    expect(intervaloDeTextos('25:00', '12:00')).toEqual({ erro: 'Informe horários válidos (hh:mm).' })
    // intervalos validados DEPOIS da conversão: 00:00–00:00 com outro intervalo no mesmo dia se sobrepõe
    expect(erroDoCalendario(comSemana([[], [{ de: 0, ate: 1440 }, { de: 480, ate: 720 }], [], [], [], [], []]))).toBe('dia 1 da semana: intervalos fora de ordem ou sobrepostos.')
  })

  it('calendário sem nenhum minuto útil na semana é recusado, mesmo com exceção útil', () => {
    const vazio = comSemana([[], [], [], [], [], [], []], { excecoes: [{ data: '2026-08-15', intervalos: [{ de: 480, ate: 720 }] }] })
    expect(erroDoCalendario(vazio)).toBe('a semana do calendário não tem nenhum tempo útil.')
  })

  it('descrição da exceção: até 80 caracteres (S-2)', () => {
    const ex = (descricao: string): CalendarioObra => ({ ...calendarioPadrao([]), excecoes: [{ data: '2026-08-08', intervalos: [], descricao }] })
    expect(erroDoCalendario(ex('d'.repeat(80)))).toBeUndefined()
    expect(erroDoCalendario(ex('d'.repeat(81)))).toBe('exceção com descrição inválida.')
  })

  it('predefinições de jornada: sem expediente, 4 h e 8 h; o resto é personalizado', () => {
    expect(PREDEFINICOES_JORNADA.map((p) => intervalosDaPredefinicao(p))).toEqual([[], [{ de: 480, ate: 720 }], [{ de: 480, ate: 720 }, { de: 780, ate: 1020 }]])
    expect(predefinicaoDe([])).toBe('sem-expediente')
    expect(predefinicaoDe([{ de: 480, ate: 720 }])).toBe('quatro-horas')
    expect(predefinicaoDe([{ de: 480, ate: 720 }, { de: 780, ate: 1020 }])).toBe('oito-horas')
    expect(predefinicaoDe([{ de: 420, ate: 720 }])).toBeUndefined()
  })

  it('nome: 1 a 60 caracteres e único (sem diferenciar maiúsculas); o próprio calendário não conflita consigo', () => {
    const lista = [calendarioPadrao([]), { ...sabado4h, nome: 'Sábado 4 h' }]
    expect(erroDoNomeCalendario('  ', lista)).toBe('Informe o nome do calendário.')
    expect(erroDoNomeCalendario('x'.repeat(61), lista)).toBe('O nome do calendário deve ter no máximo 60 caracteres.')
    expect(erroDoNomeCalendario('sábado 4 H', lista)).toBe('Já existe um calendário com este nome.')
    expect(erroDoNomeCalendario('Sábado 4 h', lista, 2)).toBeUndefined()
    expect(erroDoNomeCalendario('Concretagem — sábado manhã', lista)).toBeUndefined()
    expect(MAX_CALENDARIOS).toBe(100)
  })

  it('copiar: cópia independente com novo UID e nome, sem a origem de hora extra; próximo UID = maior + 1', () => {
    const base: CalendarioObra = { ...calendarioPadrao(['2026-09-07']), aplicaFeriadosObra: true, origem: 'hora-extra', derivadoDe: 1 }
    const c = copiarCalendario(base, 7, 'Cópia')
    expect([c.uid, c.nome, c.origem, c.derivadoDe, c.aplicaFeriadosObra]).toEqual([7, 'Cópia', undefined, undefined, true])
    c.semana[1][0].de = 0
    c.excecoes[0].data = '2030-01-01'
    expect(base.semana[1][0].de).toBe(480)
    expect(base.excecoes[0].data).toBe('2026-09-07')
    expect(proximoUidCalendario([base, sabado4h, c])).toBe(8)
    expect(proximoUidCalendario([])).toBe(1)
  })
})
