import { describe, expect, it } from 'vitest'
import type { Task } from '@/types/domain'
import { buildSeedState } from '@/stores/useProjectStore'
import fixtureCalendarios from './__fixtures__/mspdi-calendarios-restricoes.xml?raw'
import { addCalendarDays } from './calendar'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule, optsDaObra } from './cpm'
import {
  MAX_CALENDAR_DAYS,
  MAX_CALENDARIOS_IMPORTADOS,
  MAX_MSPDI_CHARS,
  buildMspdiXml,
  buildTaskXml,
  fromDuration,
  lagParaMspdi,
  lagDeMspdi,
  parseMspdiXml,
  validateMspdi,
} from './msProjectXmlParser'

const seed = buildSeedState()
const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
const schedule = computeSchedule(seed.tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })
const input = { meta: seed.meta, tasks: seed.tasks, calendarios: seed.calendarios, calendarioPadraoUid: seed.calendarioPadraoUid, schedule }

/** Feriados e dias úteis extras do calendário padrão importado (as exceções não úteis e as úteis). */
const feriados = (r: { calendarios: { excecoes: { data: string; intervalos: unknown[] }[] }[] }) =>
  r.calendarios[0].excecoes.filter((ex) => ex.intervalos.length === 0).map((ex) => ex.data)
const diasExtras = (r: { calendarios: { excecoes: { data: string; intervalos: unknown[] }[] }[] }) =>
  r.calendarios[0].excecoes.filter((ex) => ex.intervalos.length > 0).map((ex) => ex.data)

describe('buildMspdiXml', () => {
  const xml = buildMspdiXml(input)
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const task = (uid: number) =>
    Array.from(doc.getElementsByTagName('Task')).find((t) => t.getElementsByTagName('UID')[0]?.textContent === String(uid))!
  const field = (el: Element, name: string) => Array.from(el.children).find((c) => c.localName === name)?.textContent

  it('gera XML bem formado, no namespace MSPDI e na ordem do esquema', () => {
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0)
    expect(doc.documentElement.namespaceURI).toBe('http://schemas.microsoft.com/project')
    const v = validateMspdi(xml, { strictOrder: true })
    expect(v.errors).toEqual([])
    expect(v.taskCount).toBe(seed.tasks.length + 1) // + tarefa-resumo do projeto (UID 0)
  })

  it('escreve os campos da tarefa 104 como o MS Project espera', () => {
    const t = task(104)
    expect(field(t, 'WBS')).toBe('03.01.02')
    expect(field(t, 'PercentComplete')).toBe('40')
    expect(field(t, 'ActualStart')).toBe('2026-10-05T08:00:00')
    expect(field(t, 'Duration')).toBe('PT96H0M0S')
    expect(field(t, 'Critical')).toBe('1')
    const link = t.getElementsByTagName('PredecessorLink')[0]
    expect(field(link, 'PredecessorUID')).toBe('103')
    expect(field(link, 'Type')).toBe('1') // FS
  })

  it('resumos trazem duração real e custo consolidado', () => {
    const t = task(3)
    expect(field(t, 'Summary')).toBe('1')
    expect(field(t, 'Duration')).not.toBe('PT0H0M0S')
    expect(Number(field(t, 'Cost'))).toBe(165000 + 168000 + 330000 + 1300000)
  })

  it('escapa caracteres especiais e remove controles inválidos em XML 1.0', () => {
    const tasks = seed.tasks.map((t) => (t.uid === 201 ? { ...t, name: 'Canteiro <A&B> "teste"\u0007' } : t))
    const out = buildMspdiXml({ ...input, tasks })
    expect(validateMspdi(out).valid).toBe(true)
    expect(parseMspdiXml(out).tasks.find((t) => t.uid === 201)?.name).toBe('Canteiro <A&B> "teste"')
  })

  it('buildTaskXml gera só o elemento <Task>', () => {
    const t = buildTaskXml(seed.tasks.find((x) => x.uid === 104)!, input)
    expect(t.trim().startsWith('<Task>')).toBe(true)
    expect(t).toContain('<UID>104</UID>')
  })
})

describe('validateMspdi', () => {
  it('aponta UID duplicado, vínculo órfão, data e ordem inválidas', () => {
    const bad = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project"><Tasks>
      <Task><UID>1</UID><Name>A</Name><Start>2026-01-01</Start></Task>
      <Task><UID>1</UID><Name>B</Name></Task>
      <Task><Name>C</Name><UID>2</UID><PredecessorLink><PredecessorUID>99</PredecessorUID><Type>7</Type></PredecessorLink></Task>
    </Tasks></Project>`
    const v = validateMspdi(bad, { strictOrder: true })
    expect(v.valid).toBe(false)
    expect(v.errors.join(' ')).toMatch(/UID duplicado/)
    expect(v.errors.join(' ')).toMatch(/predecessora 99 não existe/)
    expect(v.errors.join(' ')).toMatch(/tipo de vínculo 7/)
    expect(v.errors.join(' ')).toMatch(/<Start> fora do formato/)
    expect(v.errors.join(' ')).toMatch(/fora da ordem/)
  })

  it('recusa XML mal formado', () => {
    expect(validateMspdi('<Project><Tasks>').valid).toBe(false)
  })
})

describe('parseMspdiXml (arquivos vindos do MS Project)', () => {
  it('respeita MinutesPerDay, LagFormat, tarefas inativas e <Exceptions>', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Title>Obra 9h</Title><StartDate>2026-03-02T07:00:00</StartDate><MinutesPerDay>540</MinutesPerDay><StatusDate>2026-03-20T17:00:00</StatusDate>
  <Calendars><Calendar><UID>1</UID><Name>Obra</Name>
    <Exceptions><Exception><TimePeriod><FromDate>2026-04-03T00:00:00</FromDate><ToDate>2026-04-03T23:59:00</ToDate></TimePeriod><Name>Sexta Santa</Name><DayWorking>0</DayWorking></Exception></Exceptions>
  </Calendar></Calendars>
  <Tasks>
    <Task><UID>0</UID><Name>Obra 9h</Name><OutlineLevel>0</OutlineLevel></Task>
    <Task><UID>10</UID><Name>Fundação</Name><WBS>1</WBS><OutlineLevel>1</OutlineLevel><Start>2026-03-02T07:00:00</Start><Duration>PT90H0M0S</Duration><Cost>100000</Cost></Task>
    <Task><UID>11</UID><Name>Estrutura</Name><WBS>2</WBS><OutlineLevel>1</OutlineLevel><Duration>PT180H0M0S</Duration>
      <PredecessorLink><PredecessorUID>10</PredecessorUID><Type>3</Type><LinkLag>16200</LinkLag><LagFormat>7</LagFormat></PredecessorLink>
      <PredecessorLink><PredecessorUID>12</PredecessorUID><Type>1</Type><LinkLag>100800</LinkLag><LagFormat>8</LagFormat></PredecessorLink>
    </Task>
    <Task><UID>12</UID><Name>Sondagem</Name><WBS>3</WBS><OutlineLevel>1</OutlineLevel><Duration>PT9H0M0S</Duration></Task>
    <Task><UID>13</UID><Name>Rascunho</Name><WBS>4</WBS><OutlineLevel>1</OutlineLevel><Active>0</Active></Task>
  </Tasks>
</Project>`
    const r = parseMspdiXml(xml)
    expect(r.tasks.map((t) => t.uid)).toEqual([10, 11, 12])
    // Antes do E3: 90 h ÷ 9 h = 10 dias × 480 min = 4.800 min (a jornada do arquivo era descartada)
    expect(r.tasks[0].duracaoMin).toBe(5400) // 90 h exatas
    expect(r.meta.minutosPorDia).toBe(540)
    expect(r.tasks[0].restricao).toEqual({ tipo: 'SNET', data: '2026-03-02', inferida: true }) // sem vínculo: mantém a data do arquivo
    expect(r.tasks[1].predecessors).toEqual([
      { uid: 10, type: 'SS', lag: { tipo: 'util', minutos: 1620, codigoMspdi: 7 } }, // 16.200 décimos = 1.620 min (antes: 3 dias × 480)
      { uid: 12, type: 'FS', lag: { tipo: 'corrido', minutos: 10080, codigoMspdi: 8 } }, // 7 dias corridos exatos (antes: 5 úteis por 5/7)
    ])
    expect(feriados(r)).toEqual(['2026-04-03'])
    expect(r.meta.statusDate).toBe('2026-03-20')
    expect(r.warnings.join(' ')).toMatch(/inativa/)
    expect(r.warnings.join(' ')).not.toMatch(/h\/dia/) // a jornada do arquivo agora é preservada, sem aviso
  })

  it('converte durações e latências', () => {
    expect(fromDuration('PT45H0M0S', 540)).toBe(5)
    expect(fromDuration('P1DT4H', 480)).toBe(1.5)
  })

  it('lag do MSPDI em todos os formatos: útil, corrido, percentual (inteiro), estimados e fora da faixa', () => {
    expect(lagDeMspdi(4800, 7)).toEqual({ lag: { tipo: 'util', minutos: 480, codigoMspdi: 7 }, arredondado: false, percentualCorrido: false })
    expect(lagDeMspdi(4800, 39)).toMatchObject({ lag: { tipo: 'util', minutos: 480, codigoMspdi: 39 } }) // dia útil estimado
    expect(lagDeMspdi(-4800, 7)).toMatchObject({ lag: { tipo: 'util', minutos: -480 } })
    expect(lagDeMspdi(600, 3)).toMatchObject({ lag: { tipo: 'util', minutos: 60 } })
    expect(lagDeMspdi(100800, 8)).toMatchObject({ lag: { tipo: 'corrido', minutos: 10080, codigoMspdi: 8 } }) // 7 ed
    expect(lagDeMspdi(432000, 12)).toMatchObject({ lag: { tipo: 'corrido', minutos: 43200 } }) // 1 emo = 30 ed
    expect(lagDeMspdi(100800, 44)).toMatchObject({ lag: { tipo: 'corrido', minutos: 10080, codigoMspdi: 44 } }) // estimado
    expect(lagDeMspdi(50, 19)).toEqual({ lag: { tipo: 'percentual', percentual: 50, codigoMspdi: 19 }, arredondado: false, percentualCorrido: false })
    expect(lagDeMspdi(-25, 51)).toMatchObject({ lag: { tipo: 'percentual', percentual: -25, codigoMspdi: 51 } })
    expect(lagDeMspdi(50, 20)).toMatchObject({ lag: { tipo: 'percentual', percentual: 50 }, percentualCorrido: true })
    expect(lagDeMspdi(5, 7)).toMatchObject({ lag: { minutos: 1 }, arredondado: true }) // 0,5 min arredonda para cima
    expect(lagDeMspdi(0, 21)).toMatchObject({ lag: { tipo: 'util', minutos: 0, codigoMspdi: 21 } }) // formato nulo sem valor
    expect(lagDeMspdi(10, 21)).toEqual({ erro: 'desconhecido' })
    expect(lagDeMspdi(10 * 10 * 365 * 1440 + 10, 7)).toEqual({ erro: 'faixa' }) // acima de 10 anos
    expect(lagDeMspdi(1001, 19)).toEqual({ erro: 'faixa' })
  })

  it('rejeita arquivo que não é MSPDI', () => {
    expect(() => parseMspdiXml('<Workbook/>')).toThrow(/MSPDI/)
  })
})

// ---------------------------------------------------------------------------
// Ciclo 00003: robustez do import. XML fictício montado aqui; os casos C-1 a C-9 do plano.
// ---------------------------------------------------------------------------

const NS = 'http://schemas.microsoft.com/project'
const projeto = (opts: { head?: string; tasks?: string; tail?: string } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?><Project xmlns="${NS}">${opts.head ?? ''}<Tasks>${opts.tasks ?? tarefa(1)}</Tasks>${opts.tail ?? ''}</Project>`
const tarefa = (uid: number, opts: { duration?: string; extra?: string } = {}) =>
  `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>Tarefa ${uid}</Name><WBS>${uid}</WBS><OutlineLevel>1</OutlineLevel><Start>2026-03-02T08:00:00</Start><Duration>${opts.duration ?? 'PT8H0M0S'}</Duration>${opts.extra ?? ''}</Task>`
const periodo = (de: string, ate: string) => `<TimePeriod><FromDate>${de}T00:00:00</FromDate><ToDate>${ate}T23:59:00</ToDate></TimePeriod>`
const legado = (dias: string[], trabalha = 0) =>
  `<WeekDays>${dias.map((d) => `<WeekDay><DayType>0</DayType><DayWorking>${trabalha}</DayWorking>${periodo(d, d)}</WeekDay>`).join('')}</WeekDays>`
const calendario = (inner: string) => `<Calendars><Calendar><UID>1</UID><Name>Obra</Name>${inner}</Calendar></Calendars>`
const excecao = (de: string, ate: string, opts: { ocorrencias?: number; trabalha?: number } = {}) =>
  `<Exception><EnteredByOccurrences>${opts.ocorrencias ? 1 : 0}</EnteredByOccurrences>${periodo(de, ate)}<Name>X</Name><DayWorking>${opts.trabalha ?? 0}</DayWorking>${opts.ocorrencias ? `<Occurrences>${opts.ocorrencias}</Occurrences>` : ''}</Exception>`

describe('parseMspdiXml: exceções recorrentes do calendário (A1)', () => {
  const natal = ['2026-12-25', '2027-12-25', '2028-12-25']

  it('C-1: recorrente usa as datas da lista legada, não o intervalo inteiro', () => {
    const xml = projeto({
      head: calendario(`${legado(natal)}<Exceptions>${excecao('2026-12-25', '2028-12-25', { ocorrencias: 3 })}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    // Antes: 400 datas seguidas, de 2026-12-25 a 2028-01-28 (limite do expandRange)
    expect(feriados(r)).toEqual(natal)
    expect(r.warnings.join(' ')).not.toMatch(/recorrente/)
  })

  it('C-2: sem lista legada a recorrente não é aplicada e gera aviso; a simples continua', () => {
    const xml = projeto({
      head: calendario(`<Exceptions>${excecao('2026-12-25', '2028-12-25', { ocorrencias: 3 })}${excecao('2026-11-20', '2026-11-20')}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    expect(feriados(r)).toEqual(['2026-11-20'])
    expect(r.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
  })

  it('recorrente com lista legada sem nenhuma data dentro do seu período não é aplicada e avisa', () => {
    const xml = projeto({
      head: calendario(`${legado(['2026-12-25'])}<Exceptions>${excecao('2027-06-01', '2028-06-01', { ocorrencias: 3 })}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    expect(feriados(r)).toEqual(['2026-12-25'])
    expect(r.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
  })

  it('C-3: recorrente útil (sábados de hora extra) usa a lista legada', () => {
    const sabados = ['2027-01-02', '2027-02-06', '2027-03-06']
    const xml = projeto({
      head: calendario(`${legado(sabados, 1)}<Exceptions>${excecao('2027-01-02', '2027-03-06', { ocorrencias: 3, trabalha: 1 })}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    // Antes: 64 dias úteis extras (o intervalo inteiro)
    expect(diasExtras(r)).toEqual(sabados)
    expect(r.warnings.join(' ')).not.toMatch(/recorrente/)
  })
})

describe('parseMspdiXml: limites de segurança (S-1, S-2, S-3)', () => {
  const doctypeExterno = `<?xml version="1.0"?><!DOCTYPE Project [<!ENTITY x SYSTEM "file:///c:/windows/win.ini">]><Project xmlns="${NS}"><Tasks/></Project>`
  const doctypeInterno = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><Project xmlns="${NS}"><Tasks/></Project>`
  const msgDoctype = 'Arquivo XML com declaração DOCTYPE/ENTITY não é aceito (o MS Project não gera esse conteúdo).'

  it('S-1: recusa DOCTYPE/ENTITY (externo e interno) no import e na validação', () => {
    for (const xml of [doctypeExterno, doctypeInterno]) {
      expect(() => parseMspdiXml(xml)).toThrow(msgDoctype)
      const v = validateMspdi(xml)
      expect(v.valid).toBe(false)
      expect(v.errors).toEqual([msgDoctype])
    }
  })

  it('S-2: recusa texto acima de MAX_MSPDI_CHARS antes do parse', () => {
    expect(MAX_MSPDI_CHARS).toBe(15 * 1024 * 1024)
    expect(() => parseMspdiXml('x'.repeat(MAX_MSPDI_CHARS + 1))).toThrow('Arquivo muito grande: o limite para importação é de 15 MB.')
  })

  it('S-3: exceção de 3 anos lê só 400 dias e avisa', () => {
    const xml = projeto({ head: calendario(`<Exceptions>${excecao('2026-01-01', '2028-12-31')}</Exceptions>`) })
    const r = parseMspdiXml(xml)
    expect(feriados(r)).toHaveLength(400)
    expect(feriados(r)[0]).toBe('2026-01-01')
    expect(feriados(r)[399]).toBe('2027-02-04')
    expect(r.warnings).toContain('1 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('S-3: milhares de exceções de intervalo longo e repetido gastam só o orçamento de dias percorridos', { timeout: 30_000 }, () => {
    // 3.000 exceções com o mesmo início e términos diferentes: cada uma tem >= 400 dias e todas caem nos mesmos 400 dias.
    // Os dias inseridos ficam em 400, mas o orçamento conta os PERCORRIDOS: acaba na 25ª exceção (25 × 400 = 10.000) e o resto é ignorado.
    const blocos = Array.from({ length: 3000 }, (_, i) => excecao('2000-01-01', addCalendarDays('2099-12-31', -i)))
    const r = parseMspdiXml(projeto({ head: calendario(`<Exceptions>${blocos.join('')}</Exceptions>`) }))
    expect(feriados(r)).toHaveLength(400)
    expect(r.warnings).toContain('Calendário com mais de 10000 dias de exceção: o excedente não foi importado; confira feriados e dias úteis extras.')
    // as 25 primeiras são cortadas em 400 dias; a mesma exceção repetida em legado e <Exceptions> conta uma vez (teste abaixo)
    expect(r.warnings).toContain('25 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('exceção que consta no legado e em <Exceptions> é expandida e avisada uma vez só', () => {
    const periodoLongo = periodo('2026-01-01', '2028-12-31')
    const legadoLongo = `<WeekDays><WeekDay><DayType>0</DayType><DayWorking>0</DayWorking>${periodoLongo}</WeekDay></WeekDays>`
    const r = parseMspdiXml(projeto({ head: calendario(`${legadoLongo}<Exceptions>${excecao('2026-01-01', '2028-12-31')}</Exceptions>`) }))
    expect(feriados(r)).toHaveLength(400)
    expect(r.warnings).toContain('1 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('S-3: calendário limitado a MAX_CALENDAR_DAYS no total, com aviso', () => {
    expect(MAX_CALENDAR_DAYS).toBe(10_000)
    const blocos = Array.from({ length: 30 }, (_, i) => {
      const de = addCalendarDays('2026-01-01', i * 400)
      return excecao(de, addCalendarDays(de, 399)) // 400 dias cada, sem sobreposição
    })
    const r = parseMspdiXml(projeto({ head: calendario(`<Exceptions>${blocos.join('')}</Exceptions>`) }))
    expect(feriados(r)).toHaveLength(10_000) // 30 × 400 = 12.000 pedidos
    expect(r.warnings).toContain('Calendário com mais de 10000 dias de exceção: o excedente não foi importado; confira feriados e dias úteis extras.')
  })

  // O DOMParser do jsdom leva ~2,5 s com 2.000 níveis (mais com a cobertura ligada): prazo folgado
  it('aninhamento de 2.000 níveis termina com erro em português, sem exceção não tratada', { timeout: 30_000 }, () => {
    const fundo = '<a>'.repeat(2000) + '</a>'.repeat(2000)
    const xml = `<?xml version="1.0"?><Project xmlns="${NS}">${fundo}</Project>`
    expect(() => parseMspdiXml(xml)).toThrow('Elemento <Tasks> ausente.')
  })
})

describe('parseMspdiXml: avisos do que o import não preserva', () => {
  it('C-4: LB0 só com início é mantida, avisa e faz ida e volta com strictOrder', () => {
    const lb = '<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start></Baseline>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: lb }) }))
    expect(r.tasks[0].baselineStart).toBe('2026-03-02')
    expect(r.tasks[0].baselineFinish).toBeUndefined()
    expect(r.warnings).toContain('1 tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.')
    expect(r.warnings.join(' ')).not.toMatch(/sem início/)

    // Volta: o export grava <Baseline> com o início e sem <Finish>, na ordem do esquema
    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, baselineStart: '2026-03-02', baselineFinish: undefined } : t))
    const parcial = { ...input, tasks }
    const el = buildTaskXml(tasks.find((t) => t.uid === 104)!, parcial)
    expect(el).toMatch(/<Number>0<\/Number>\s*<Start>2026-03-02T08:00:00<\/Start>/)
    expect(el.match(/<Baseline>[\s\S]*<\/Baseline>/)![0]).not.toContain('<Finish>')
    const xml = buildMspdiXml(parcial)
    expect(validateMspdi(xml, { strictOrder: true }).errors).toEqual([])
    const volta = parseMspdiXml(xml).tasks.find((t) => t.uid === 104)!
    expect(volta.baselineStart).toBe('2026-03-02')
    expect(volta.baselineFinish).toBeUndefined()
  })

  it('C-4b: LB0 só com término é mantida, avisa (PV zero) e faz ida e volta com strictOrder', () => {
    const lb = '<Baseline><Number>0</Number><Finish>2026-04-30T17:00:00</Finish></Baseline>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: lb }) }))
    expect(r.tasks[0].baselineStart).toBeUndefined()
    expect(r.tasks[0].baselineFinish).toBe('2026-04-30')
    expect(r.warnings).toContain('1 tarefa(s) com linha de base 0 sem início: o término do arquivo é mantido e o valor planejado (PV) delas fica zero.')
    expect(r.warnings.join(' ')).not.toMatch(/sem término/)

    const tasks = seed.tasks.map((t) => (t.uid === 104 ? { ...t, baselineStart: undefined, baselineFinish: '2026-04-30' } : t))
    const parcial = { ...input, tasks }
    const el = buildTaskXml(tasks.find((t) => t.uid === 104)!, parcial)
    const bloco = el.match(/<Baseline>[\s\S]*<\/Baseline>/)![0]
    expect(bloco).toMatch(/<Number>0<\/Number>\s*<Finish>2026-04-30T17:00:00<\/Finish>/)
    expect(bloco).not.toContain('<Start>')
    expect(bloco).not.toContain('<Duration>')
    const xml = buildMspdiXml(parcial)
    expect(validateMspdi(xml, { strictOrder: true }).errors).toEqual([])
    const volta = parseMspdiXml(xml).tasks.find((t) => t.uid === 104)!
    expect(volta.baselineStart).toBeUndefined()
    expect(volta.baselineFinish).toBe('2026-04-30')
  })

  it('C-4: LB0 completa do seed segue sem aviso e sem mudança', () => {
    const r = parseMspdiXml(buildMspdiXml(input))
    expect(r.warnings.join(' ')).not.toMatch(/linha de base 0 sem/)
    expect(r.tasks.find((t) => t.uid === 104)?.baselineFinish).toBe(seed.tasks.find((t) => t.uid === 104)?.baselineFinish)
  })

  it('C-5: linhas de base 1 a 10 não importadas avisam; a LB0 é lida como antes', () => {
    const lb = (n: number) => `<Baseline><Number>${n}</Number><Start>2026-03-0${n + 2}T08:00:00</Start><Finish>2026-03-0${n + 3}T17:00:00</Finish></Baseline>`
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: lb(0) + lb(1) + lb(2) }) }))
    expect(r.tasks[0].baselineStart).toBe('2026-03-02')
    expect(r.tasks[0].baselineFinish).toBe('2026-03-03')
    expect(r.warnings).toContain('Linhas de base 1 a 10 não importadas em 1 tarefa(s): o CronoAI usa só a linha de base 0.')
    expect(r.warnings.join(' ')).not.toMatch(/linha de base 0 sem/)
  })

  it('C-6: durações exatas em minutos: tempo corrido vira duração corrida; 1 h e 12 h não viram marco nem são arredondadas', () => {
    const tasks =
      tarefa(1, { duration: 'PT24H0M0S', extra: '<DurationFormat>8</DurationFormat>' }) +
      tarefa(2, { duration: 'PT1H0M0S', extra: '<DurationFormat>5</DurationFormat>' }) +
      tarefa(3, { duration: 'PT12H0M0S', extra: '<DurationFormat>7</DurationFormat>' })
    const r = parseMspdiXml(projeto({ tasks }))
    // Antes do E3: [1440 (lido como 3 d úteis), 0 (1 h virava marco), 960 (1,5 d arredondado para 2 d)] e 3 avisos de duração
    expect(r.tasks.map((t) => t.duracaoMin)).toEqual([1440, 60, 720])
    expect(r.tasks.map((t) => t.duracaoCorrida)).toEqual([true, undefined, undefined])
    expect(r.warnings.join(' ')).not.toMatch(/tempo corrido|menos de meio dia|fracionária/)
  })

  it('segundos do MSPDI (durações guiadas por recurso) arredondam para o minuto com aviso', () => {
    // PT57H8M24S = 3.428,4 min → 3.428 min; os 24 s da ida e volta são a tolerância de 1 min do ADR 00003
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { duration: 'PT57H8M24S' }) + tarefa(2, { duration: 'PT8H0M0S' }) }))
    expect(r.tasks.map((t) => t.duracaoMin)).toEqual([3428, 480])
    expect(r.warnings).toContain('1 valor(es) de tempo com segundos arredondado(s) para o minuto (durações guiadas por recurso).')
  })

  it('durações inteiras em dias úteis não geram aviso de duração', () => {
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { duration: 'PT16H0M0S', extra: '<DurationFormat>7</DurationFormat>' }) }))
    expect(r.tasks[0].duracaoMin).toBe(960)
    expect(r.warnings.join(' ')).not.toMatch(/duração|marco/)
  })

  it('C-7: Text1/Number1 lidos sem apelido avisam; com apelido, não', () => {
    const campos = `<ExtendedAttribute><FieldID>188743731</FieldID><Value>X-1</Value></ExtendedAttribute><ExtendedAttribute><FieldID>188743767</FieldID><Value>5</Value></ExtendedAttribute>`
    const sem = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: campos }) }))
    expect(sem.tasks[0].sinapi).toBe('X-1') // leitura igual à de antes
    expect(sem.tasks[0].leadTimeDays).toBe(5)
    expect(sem.warnings).toContain("Text1 lido como código SINAPI em 1 tarefa(s) sem apelido 'SINAPI' no arquivo: confira.")
    expect(sem.warnings).toContain("Number1 lido como lead time em 1 tarefa(s) sem apelido 'lead' no arquivo: confira.")

    const defs =
      '<ExtendedAttributes><ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName><Alias>Código SINAPI</Alias></ExtendedAttribute>' +
      '<ExtendedAttribute><FieldID>188743767</FieldID><FieldName>Number1</FieldName><Alias>Lead Time</Alias></ExtendedAttribute></ExtendedAttributes>'
    const com = parseMspdiXml(projeto({ head: defs, tasks: tarefa(1, { extra: campos }) }))
    expect(com.tasks[0].sinapi).toBe('X-1')
    expect(com.warnings.join(' ')).not.toMatch(/Text1|Number1/)
  })

  it('calendário da tarefa: compara com o calendário realmente usado, não com um CalendarUID inexistente', () => {
    // CalendarUID do projeto (9) não existe: o import usa o primeiro calendário (UID 1); a tarefa com CalendarUID 1 não tem calendário próprio.
    // A tarefa 2 aponta para o calendário 2, que não existe: usa o do projeto, com aviso (antes: "calendário próprio importado no do projeto")
    const head = `<CalendarUID>9</CalendarUID>${calendario('')}`
    const r = parseMspdiXml(projeto({ head, tasks: tarefa(1, { extra: '<CalendarUID>1</CalendarUID>' }) + tarefa(2, { extra: '<CalendarUID>2</CalendarUID>' }) }))
    expect(r.calendarioPadraoUid).toBe(1)
    expect(r.tasks.map((t) => t.calendarioUid)).toEqual([undefined, undefined])
    expect(r.warnings).toContain('1 tarefa(s) com calendário não importado (de recurso, ausente, rejeitado ou acima do limite): calculadas no calendário do projeto.')
  })

  it('vínculo com tipo não numérico não leva o texto do arquivo para a mensagem', () => {
    const xml = projeto({ tasks: tarefa(1) + tarefa(2, { extra: '<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>SEGREDO-X</Type></PredecessorLink>' }) })
    const v = validateMspdi(xml)
    expect(v.errors).toEqual(['Tarefa UID 2: tipo de vínculo (não numérico) inválido (0–3).'])
  })

  it('C-8: calendário inexistente da tarefa e tarefa nula avisam', () => {
    // O MS Project grava a linha em branco com UID e OutlineLevel 0; a de nível 1 também é descartada
    const nulaNivel0 = '<Task><UID>5</UID><ID>5</ID><IsNull>1</IsNull><OutlineLevel>0</OutlineLevel></Task>'
    const tasks = tarefa(1) + tarefa(2, { extra: '<CalendarUID>2</CalendarUID>' }) + tarefa(3, { extra: '<IsNull>1</IsNull>' }) + tarefa(4, { extra: '<CalendarUID>-1</CalendarUID>' }) + nulaNivel0
    const r = parseMspdiXml(projeto({ tasks }))
    expect(r.tasks.map((t) => t.uid)).toEqual([1, 2, 4])
    expect(r.warnings).toContain('1 tarefa(s) com calendário não importado (de recurso, ausente, rejeitado ou acima do limite): calculadas no calendário do projeto.')
    expect(r.warnings).toContain('2 linha(s) em branco (tarefa nula) ignorada(s).')
  })

  it('C-9: TimephasedData e campos personalizados viram um único aviso informativo', () => {
    const campo = '<ExtendedAttribute><FieldID>188743734</FieldID><Value>valor</Value></ExtendedAttribute>'
    const tail = '<Assignments><Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>1</ResourceUID><TimephasedData><Type>1</Type><UID>1</UID></TimephasedData></Assignment></Assignments>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: campo }) + tarefa(2, { extra: campo }), tail }))
    const informativos = r.warnings.filter((w) => /Não importado/.test(w))
    expect(informativos).toEqual(['Não importado do MS Project: 1 registro(s) distribuído(s) no tempo (TimephasedData); 2 valor(es) de 1 campo(s) personalizado(s).'])
  })

  it('arquivo simples não ganha nenhum aviso novo', () => {
    const r = parseMspdiXml(projeto())
    expect(r.warnings.join(' ')).not.toMatch(/Não importado|linha de base|calendário não importado|em branco|fracionária|Text1|Number1/)
  })
})

describe('parseMspdiXml: rodada 03 (chaves do protótipo, datas inválidas, ocorrências, semana e lag)', () => {
  it('tipo de vínculo "constructor"/"toString" é inválido: aviso sem o texto do arquivo e tipo FS', () => {
    const elo = (tipo: string) => `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>${tipo}</Type></PredecessorLink>`
    const xml = projeto({ tasks: tarefa(1) + tarefa(2, { extra: elo('constructor') + elo('toString') + elo('2') }) })
    const v = validateMspdi(xml)
    expect(v.valid).toBe(false)
    expect(v.errors).toEqual(Array(2).fill('Tarefa UID 2: tipo de vínculo (não numérico) inválido (0–3).'))
    const r = parseMspdiXml(xml)
    expect(r.tasks.find((t) => t.uid === 2)!.predecessors.map((p) => p.type)).toEqual(['FS', 'FS', 'SF'])
    expect(r.warnings).toContain('Ignorado: Tarefa UID 2: tipo de vínculo (não numérico) inválido (0–3).')
    expect(r.warnings.join(' ')).not.toMatch(/constructor|toString/)
  })

  it('exceção com data inválida ou inexistente é ignorada com aviso (sem "Invalid time value")', () => {
    const xml = projeto({
      head: calendario(
        `<Exceptions>${excecao('2026-11-20', '2026-11-20')}${excecao('abcdefghij', '2026-12-01')}${excecao('2026-02-30', '2026-03-02')}</Exceptions>`,
      ),
    })
    const r = parseMspdiXml(xml)
    expect(feriados(r)).toEqual(['2026-11-20'])
    expect(r.warnings).toContain('2 exceção(ões) do calendário com data inválida ignorada(s).')
    expect(r.warnings.join(' ')).not.toMatch(/abcdefghij|Invalid/)
  })

  it('data inválida presente no legado e em <Exceptions> é avisada uma vez só', () => {
    const legadoInvalido = `<WeekDays><WeekDay><DayType>0</DayType><DayWorking>0</DayWorking>${periodo('2026-02-30', '2026-03-02')}</WeekDay></WeekDays>`
    const xml = projeto({ head: calendario(`${legadoInvalido}<Exceptions>${excecao('2026-02-30', '2026-03-02')}</Exceptions>`) })
    expect(parseMspdiXml(xml).warnings).toContain('1 exceção(ões) do calendário com data inválida ignorada(s).')
  })

  it('recorrente com menos datas legadas no período que Occurrences não é aplicada e avisa (A1)', () => {
    const exc = `<Exceptions>${excecao('2026-12-25', '2028-12-25', { ocorrencias: 3 })}</Exceptions>`
    const duas = parseMspdiXml(projeto({ head: calendario(`${legado(['2026-12-25', '2027-12-25'])}${exc}`) }))
    expect(duas.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
    expect(feriados(duas)).toEqual(['2026-12-25', '2027-12-25']) // o que a lista legada trouxe segue lido
    const tres = parseMspdiXml(projeto({ head: calendario(`${legado(['2026-12-25', '2027-12-25', '2028-12-25'])}${exc}`) }))
    expect(tres.warnings.join(' ')).not.toMatch(/recorrente/)
  })

  it('LB0 parcial de tarefa-resumo não gera aviso (só folhas)', () => {
    const lb = '<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start></Baseline>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: '<Summary>1</Summary>' + lb }) + tarefa(2, { extra: lb }) }))
    expect(r.warnings).toContain('1 tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.')
  })

  it('a semana do calendário é lida como está (sábado útil) e não avisa mais "diferente de segunda a sexta"', () => {
    const dia = (n: number, trabalha: number) =>
      `<WeekDay><DayType>${n}</DayType><DayWorking>${trabalha}</DayWorking>${trabalha ? '<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime></WorkingTimes>' : ''}</WeekDay>`
    const sabado = [1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, n >= 2 && n <= 7 ? 1 : 0)).join('')
    const r = parseMspdiXml(projeto({ head: calendario(`<WeekDays>${sabado}</WeekDays>`) }))
    expect(r.warnings.join(' ')).not.toMatch(/segunda a sexta/)
    expect(r.calendarios[0].semana[0]).toEqual([]) // domingo
    expect(r.calendarios[0].semana[6]).toEqual([{ de: 480, ate: 720 }]) // sábado, 08:00–12:00
    expect(r.calendarios[0].semana[1]).toEqual([{ de: 480, ate: 720 }])
  })

  it('lag em qualquer formato é preservado (tipo, valor e código) e não avisa; o seed também não', () => {
    const elo = (lag: number, formato: number) =>
      `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>${lag}</LinkLag><LagFormat>${formato}</LagFormat></PredecessorLink>`
    const r = parseMspdiXml(projeto({ tasks: tarefa(1) + tarefa(2, { extra: elo(4800, 9) + elo(4800, 7) + elo(0, 9) }) }))
    // Antes: "1 vínculo(s) com lag em formato diferente de dias úteis: serão exportados em dias úteis" (LagFormat 9 virava 7)
    expect(r.tasks[1].predecessors.map((p) => p.lag)).toEqual([
      { tipo: 'util', minutos: 480, codigoMspdi: 9 },
      { tipo: 'util', minutos: 480, codigoMspdi: 7 },
      { tipo: 'util', minutos: 0, codigoMspdi: 9 },
    ])
    expect(r.warnings.join(' ')).not.toMatch(/formato diferente|latência/)
    const seedImport = parseMspdiXml(buildMspdiXml(input))
    expect(seedImport.warnings.join(' ')).not.toMatch(/formato diferente|segunda a sexta|data inválida/)
  })
})

describe('exportação de restrições e lag em todos os formatos (E2)', () => {
  it('lag do domínio vira LinkLag e LagFormat: útil 7, corrido 8, percentual 19 (percentual inteiro); o código do arquivo volta', () => {
    expect(lagParaMspdi({ tipo: 'util', minutos: 4800 })).toEqual({ linkLag: 48000, lagFormat: 7 })
    expect(lagParaMspdi({ tipo: 'util', minutos: -480 })).toEqual({ linkLag: -4800, lagFormat: 7 })
    expect(lagParaMspdi({ tipo: 'corrido', minutos: 10080 })).toEqual({ linkLag: 100800, lagFormat: 8 })
    expect(lagParaMspdi({ tipo: 'percentual', percentual: 50 })).toEqual({ linkLag: 50, lagFormat: 19 })
    expect(lagParaMspdi({ tipo: 'percentual', percentual: -25 })).toEqual({ linkLag: -25, lagFormat: 19 })
    expect(lagParaMspdi({ tipo: 'util', minutos: 2400, codigoMspdi: 5 })).toEqual({ linkLag: 24000, lagFormat: 5 })
    expect(lagParaMspdi({ tipo: 'corrido', minutos: 1440, codigoMspdi: 36 })).toEqual({ linkLag: 14400, lagFormat: 36 })
  })

  it('as 8 restrições saem com o ConstraintType do MS Project e a ConstraintDate (hora do expediente ou a informada)', () => {
    const xmlDe = (restricao: Task['restricao']) => {
      const tasks = seed.tasks.map((t) => (t.uid === 105 ? { ...t, restricao } : t))
      return buildTaskXml(tasks.find((t) => t.uid === 105)!, { ...input, tasks })
    }
    const campo = (xml: string, nome: string) => new RegExp(`<${nome}>([^<]*)</${nome}>`).exec(xml)?.[1]
    const casos: [Task['restricao'], string, string | undefined][] = [
      [undefined, '0', undefined],
      [{ tipo: 'ALAP' }, '1', undefined],
      [{ tipo: 'MSO', data: '2026-11-05T14:30' }, '2', '2026-11-05T14:30:00'],
      [{ tipo: 'MFO', data: '2026-11-05' }, '3', '2026-11-05T17:00:00'],
      [{ tipo: 'SNET', data: '2026-11-05' }, '4', '2026-11-05T08:00:00'],
      [{ tipo: 'SNLT', data: '2026-11-05' }, '5', '2026-11-05T08:00:00'],
      [{ tipo: 'FNET', data: '2026-11-05' }, '6', '2026-11-05T17:00:00'],
      [{ tipo: 'FNLT', data: '2026-11-05T10:00' }, '7', '2026-11-05T10:00:00'],
    ]
    for (const [restricao, codigo, data] of casos) {
      const xml = xmlDe(restricao)
      expect([campo(xml, 'ConstraintType'), campo(xml, 'ConstraintDate')], JSON.stringify(restricao)).toEqual([codigo, data])
    }
  })

  it('exporta lag corrido e em % com strictOrder e valida o arquivo', () => {
    const tasks = seed.tasks.map((t) =>
      t.uid === 105
        ? { ...t, restricao: { tipo: 'MSO' as const, data: '2026-11-05T14:30' }, predecessors: [{ uid: 104, type: 'FS' as const, lag: { tipo: 'corrido' as const, minutos: 2880 } }] }
        : t.uid === 401
          ? { ...t, predecessors: [{ uid: 105, type: 'SS' as const, lag: { tipo: 'percentual' as const, percentual: 50 } }] }
          : t,
    )
    const xml = buildMspdiXml({ ...input, tasks })
    expect(validateMspdi(xml, { strictOrder: true }).errors).toEqual([])
    expect(xml).toMatch(/<LinkLag>28800<\/LinkLag>\s*<LagFormat>8<\/LagFormat>/)
    expect(xml).toMatch(/<LinkLag>50<\/LinkLag>\s*<LagFormat>19<\/LagFormat>/)
  })
})

// ---------------------------------------------------------------------------
// Ciclo 00004, E3: calendários, CalendarUID, restrições, prazo final e lag em todos os formatos (ida e volta)
// ---------------------------------------------------------------------------

describe('MSPDI de ida e volta: calendários, restrições, prazo final e lag (E3)', () => {
  const importada = parseMspdiXml(fixtureCalendarios)
  const tarefaDe = (r: ReturnType<typeof parseMspdiXml>, uid: number) => r.tasks.find((t) => t.uid === uid)!
  const SEMANA_PADRAO = [[], ...Array.from({ length: 5 }, () => [{ de: 480, ate: 720 }, { de: 780, ate: 1020 }]), []]

  it('lê os 4 calendários-base usados (UID, nome, semana com horários, 00:00 como 24:00) e deixa o de recurso de fora', () => {
    expect(importada.calendarioPadraoUid).toBe(1)
    expect(importada.calendarios.map((c) => [c.uid, c.nome])).toEqual([[1, 'Padrão'], [2, 'Sábado 4 h'], [3, 'Noturno'], [4, '24 Horas']])
    const por = (uid: number) => importada.calendarios.find((c) => c.uid === uid)!
    expect(por(1).semana).toEqual(SEMANA_PADRAO)
    expect(por(2).semana[6]).toEqual([{ de: 480, ate: 720 }]) // sábado de 4 h
    expect(por(3).semana[1]).toEqual([{ de: 0, ate: 480 }, { de: 1380, ate: 1440 }]) // ToTime 00:00 = 24:00; 2 intervalos no dia
    expect(por(3).semana[0]).toEqual([]) // domingo
    expect(por(4).semana.every((d) => d.length === 1 && d[0].de === 0 && d[0].ate === 1440)).toBe(true) // 00:00–00:00 = dia inteiro
    // Exceções do padrão: feriado e sábado útil de 4 h
    expect(por(1).excecoes).toEqual([
      { data: '2026-08-15', intervalos: [{ de: 480, ate: 720 }] },
      { data: '2026-09-07', intervalos: [] },
    ])
    expect(importada.warnings).toContain('Não importado do MS Project: 1 calendário(s) de recurso ou sem uso nas tarefas.')
    expect(importada.warnings.join(' ')).not.toMatch(/segunda a sexta|calendário próprio|Calendário sem feriados/)
  })

  it('lê o CalendarUID das tarefas só quando é um calendário importado diferente do padrão', () => {
    expect([2, 3, 4, 28].map((uid) => tarefaDe(importada, uid).calendarioUid)).toEqual([2, 3, 4, 2])
    expect([1, 5, 6, 29].map((uid) => tarefaDe(importada, uid).calendarioUid)).toEqual([undefined, undefined, undefined, undefined])
  })

  it('lê os 8 ConstraintType com a data e a hora, o prazo final e a duração corrida', () => {
    const r = (uid: number) => tarefaDe(importada, uid).restricao
    expect(r(1)).toEqual({ tipo: 'SNET', data: '2026-08-03T08:00' }) // explícita: não é inferida
    expect(r(6)).toEqual({ tipo: 'ALAP' })
    expect(r(7)).toEqual({ tipo: 'MSO', data: '2026-08-12T08:00' })
    expect(r(8)).toEqual({ tipo: 'MFO', data: '2026-08-14T17:00' })
    expect(r(9)).toEqual({ tipo: 'SNLT', data: '2026-08-20T08:00' })
    expect(r(10)).toEqual({ tipo: 'FNET', data: '2026-08-18T17:00' })
    expect(r(11)).toEqual({ tipo: 'FNLT', data: '2026-08-25T17:00' })
    expect(r(12)).toBeUndefined() // ASAP (0): sem restrição, e tem vínculo (não é inferida)
    expect(tarefaDe(importada, 12).prazoFinal).toBe('2026-08-31T17:00')
    expect(tarefaDe(importada, 5).duracaoCorrida).toBe(true) // DurationFormat 8 = dias corridos
    expect(tarefaDe(importada, 5).duracaoMin).toBe(1440)
    expect(tarefaDe(importada, 4).duracaoCorrida).toBeUndefined()
  })

  it('lê o lag de todos os formatos (3–12, 19, 20, 35+) com o valor exato e o código original', () => {
    const lag = (uid: number) => tarefaDe(importada, uid).predecessors[0].lag
    expect(lag(2)).toEqual({ tipo: 'util', minutos: 4800, codigoMspdi: 7 })
    expect(lag(13)).toEqual({ tipo: 'util', minutos: 60, codigoMspdi: 3 })
    expect(lag(14)).toEqual({ tipo: 'util', minutos: 480, codigoMspdi: 5 })
    expect(lag(15)).toEqual({ tipo: 'util', minutos: 2400, codigoMspdi: 9 }) // 1 semana = 5 dias úteis
    expect(lag(16)).toEqual({ tipo: 'util', minutos: 9600, codigoMspdi: 11 })
    expect(lag(17)).toEqual({ tipo: 'corrido', minutos: 60, codigoMspdi: 4 })
    expect(lag(18)).toEqual({ tipo: 'corrido', minutos: 360, codigoMspdi: 6 })
    expect(lag(19)).toEqual({ tipo: 'corrido', minutos: 10080, codigoMspdi: 8 }) // 7 ed
    expect(lag(20)).toEqual({ tipo: 'corrido', minutos: 10080, codigoMspdi: 10 })
    expect(lag(21)).toEqual({ tipo: 'corrido', minutos: 43200, codigoMspdi: 12 }) // 1 emo = 30 ed
    expect(lag(22)).toEqual({ tipo: 'percentual', percentual: 50, codigoMspdi: 19 }) // LinkLag 50 = 50%
    expect(lag(23)).toEqual({ tipo: 'percentual', percentual: 50, codigoMspdi: 20 })
    expect(lag(24)).toEqual({ tipo: 'util', minutos: 480, codigoMspdi: 39 })
    expect(lag(25)).toEqual({ tipo: 'util', minutos: -480, codigoMspdi: 7 }) // lag negativo
    expect(lag(26)).toEqual({ tipo: 'percentual', percentual: -25, codigoMspdi: 19 })
    expect(importada.warnings).toContain('1 vínculo(s) com latência em % decorrido calculados como % do tempo útil.')
    expect(importada.warnings.join(' ')).not.toMatch(/formato diferente|importados com latência zero|fracionária|tempo corrido convertida/)
  })

  it('guarda o que o arquivo trouxe (datas, Manual e Active) e o cabeçalho (HonorConstraints, lógica retida, Move*, jornada)', () => {
    expect(tarefaDe(importada, 1).arquivo).toEqual({
      inicio: '2026-08-03', termino: '2026-08-07', duracaoMin: 2400, percentComplete: 0, restricao: { tipo: 'SNET', data: '2026-08-03T08:00' },
    })
    expect(tarefaDe(importada, 27).arquivo).toMatchObject({ manual: true, ativa: true })
    expect(tarefaDe(importada, 1).arquivo?.manual).toBeUndefined()
    expect(importada.warnings).toContain('1 tarefa(s) agendada(s) manualmente no MS Project: o CronoAI as calcula automaticamente e preserva a marca para a exportação.')
    expect(importada.meta.minutosPorDia).toBe(480)
    expect(importada.meta.honorConstraintsArquivo).toBe(0)
    expect(importada.meta.opcoesCronograma).toEqual({ logica: 'retida', moverRestante: true })
    expect(importada.meta.moveArquivo).toEqual({ completedEndsBack: false, remainingStartsBack: false, remainingStartsForward: false, completedEndsForward: false })
  })

  /** Ida e volta: importa, calcula, exporta, valida com `strictOrder` e importa o arquivo exportado. */
  function idaEVolta(xml: string) {
    const r = parseMspdiXml(xml)
    const meta = { name: r.meta.name ?? 'Obra', company: '', manager: '', startDate: r.meta.startDate!, statusDate: r.meta.statusDate!, dailyIndirectCost: 0, ...r.meta }
    const cals = compilarCalendarios(meta.startDate, r.calendarios, r.calendarioPadraoUid)
    const schedule = computeSchedule(r.tasks, cals, optsDaObra(meta, 'forecast', meta.statusDate))
    const exportado = buildMspdiXml({ meta, tasks: r.tasks, calendarios: r.calendarios, calendarioPadraoUid: r.calendarioPadraoUid, schedule })
    return { r, meta, schedule, exportado, volta: parseMspdiXml(exportado) }
  }

  it('AC-10: a fixture faz ida e volta com strictOrder e cada campo preservado volta igual', () => {
    const { r, exportado, volta } = idaEVolta(fixtureCalendarios)
    expect(validateMspdi(exportado, { strictOrder: true }).errors).toEqual([])
    expect(volta.calendarioPadraoUid).toBe(r.calendarioPadraoUid)
    expect(volta.calendarios).toEqual(r.calendarios) // UID, nome, semana com horários e exceções
    const campos = (t: Task) => ({
      calendarioUid: t.calendarioUid, restricao: t.restricao, prazoFinal: t.prazoFinal, duracaoMin: t.duracaoMin, duracaoCorrida: t.duracaoCorrida,
      predecessors: t.predecessors, manual: t.arquivo?.manual, ativa: t.arquivo?.ativa,
    })
    for (const t of r.tasks) expect(campos(tarefaDe(volta, t.uid)), `UID ${t.uid}`).toEqual(campos(t))
    expect(volta.meta.minutosPorDia).toBe(r.meta.minutosPorDia)
    expect(volta.meta.honorConstraintsArquivo).toBe(0)
    expect(volta.meta.opcoesCronograma).toEqual(r.meta.opcoesCronograma)
    expect(volta.meta.moveArquivo).toEqual(r.meta.moveArquivo)
    // Os avisos do 00003 que sumiram não voltam na segunda leitura
    expect(volta.warnings.join(' ')).not.toMatch(/formato diferente|calendário próprio|segunda a sexta/)
  })

  it('a exportação traz CalendarUID só na tarefa com calendário próprio, as horas reais, Active/Manual e o Deadline', () => {
    const { exportado } = idaEVolta(fixtureCalendarios)
    const doc2 = new DOMParser().parseFromString(exportado, 'application/xml')
    const task = (uid: number) => Array.from(doc2.getElementsByTagName('Task')).find((t) => t.getElementsByTagName('UID')[0]?.textContent === String(uid))!
    const campo = (el: Element, nome: string) => Array.from(el.children).find((c) => c.localName === nome)?.textContent
    expect(campo(task(2), 'CalendarUID')).toBe('2')
    expect(campo(task(1), 'CalendarUID')).toBeUndefined()
    expect([campo(task(27), 'Active'), campo(task(27), 'Manual')]).toEqual(['1', '1'])
    expect(campo(task(1), 'Manual')).toBeUndefined()
    expect(campo(task(12), 'Deadline')).toBe('2026-08-31T17:00:00')
    expect([campo(task(7), 'ConstraintType'), campo(task(7), 'ConstraintDate')]).toEqual(['2', '2026-08-12T08:00:00'])
    expect([campo(task(5), 'DurationFormat'), campo(task(5), 'Duration')]).toEqual(['8', 'PT24H0M0S'])
    expect([campo(task(22), 'LinkLag'), campo(task(22), 'LagFormat')]).toEqual([undefined, undefined]) // o vínculo está em PredecessorLink
    const elo = (uid: number) => task(uid).getElementsByTagName('PredecessorLink')[0]
    expect([campo(elo(22), 'LinkLag'), campo(elo(22), 'LagFormat')]).toEqual(['50', '19'])
    expect([campo(elo(19), 'LinkLag'), campo(elo(19), 'LagFormat')]).toEqual(['100800', '8'])
    // CR-2b: A no sábado de 4 h termina 13/08 12:00 e B (padrão) vai de 13/08 13:00 a 14/08 12:00 (horas reais no Start/Finish)
    expect([campo(task(28), 'Finish'), campo(task(29), 'Start'), campo(task(29), 'Finish')]).toEqual(['2026-08-13T12:00:00', '2026-08-13T13:00:00', '2026-08-14T12:00:00'])
    // Calendários do arquivo
    expect(exportado).toContain('<Name>Noturno</Name>')
    expect(exportado).toContain('<Name>24 Horas</Name>')
    expect(exportado).not.toContain('Recurso Fictício')
  })

  it('CR-2b e CR-6 na fixture: calendário do sábado e restrição MSO em conflito com o vínculo', () => {
    const { schedule } = idaEVolta(fixtureCalendarios)
    const u = (uid: number) => schedule.byUid.get(uid)!
    expect([u(28).finish, u(28).terminoHora, u(29).start, u(29).inicioHora, u(29).finish, u(29).terminoHora]).toEqual(['2026-08-13', '12:00', '2026-08-13', '13:00', '2026-08-14', '12:00'])
    // CR-6 (MSO 06/08): B 06/08 a 07/08, folga de A -2 d, B em conflito com o vínculo
    expect([u(31).start, u(31).finish, u(31).folgaTotalMin, u(30).folgaTotalMin, u(31).restricaoConflito]).toEqual(['2026-08-06', '2026-08-07', 0, -960, true])
    // Concretagem no sábado de 4 h (UID 2): 12 dias, +1 d de lag depois da mobilização
    expect(u(2).duracaoMin).toBe(5760)
  })

  it('variante com MinutesPerDay 450 e uma opção Move* ligada: jornada, Move* e HonorConstraints voltam', () => {
    const variante = fixtureCalendarios.replace('<MinutesPerDay>480</MinutesPerDay>', '<MinutesPerDay>450</MinutesPerDay>').replace('<MoveRemainingStartsForward>0<', '<MoveRemainingStartsForward>1<')
    const { r, exportado, volta } = idaEVolta(variante)
    expect(r.meta.minutosPorDia).toBe(450)
    expect(r.meta.moveArquivo?.remainingStartsForward).toBe(true)
    expect(validateMspdi(exportado, { strictOrder: true }).errors).toEqual([])
    expect(exportado).toMatch(/<MinutesPerDay>450<\/MinutesPerDay>\s*<MinutesPerWeek>2250<\/MinutesPerWeek>/)
    expect(exportado).toContain('<MoveRemainingStartsForward>1</MoveRemainingStartsForward>')
    expect(exportado).toContain('<HonorConstraints>0</HonorConstraints>')
    expect(volta.meta.minutosPorDia).toBe(450)
    expect(volta.meta.moveArquivo).toEqual(r.meta.moveArquivo)
  })

  it('o seed exporta SplitsInProgressTasks 1, HonorConstraints 0, jornada 480 e as horas exatas do restante (801 termina 09:36)', () => {
    const xmlSeed = buildMspdiXml(input)
    expect(validateMspdi(xmlSeed, { strictOrder: true }).errors).toEqual([])
    expect(xmlSeed).toContain('<HonorConstraints>0</HonorConstraints>')
    expect(xmlSeed).toContain('<SplitsInProgressTasks>1</SplitsInProgressTasks>')
    expect(xmlSeed).toContain('<MinutesPerDay>480</MinutesPerDay>')
    expect(xmlSeed).not.toMatch(/Move(Completed|Remaining)/)
    const docSeed = new DOMParser().parseFromString(xmlSeed, 'application/xml')
    const t = (uid: number) => Array.from(docSeed.getElementsByTagName('Task')).find((x) => x.getElementsByTagName('UID')[0]?.textContent === String(uid))!
    const campo = (el: Element, nome: string) => Array.from(el.children).find((c) => c.localName === nome)?.textContent
    expect([campo(t(801), 'Start'), campo(t(801), 'Finish')]).toEqual(['2027-06-09T09:36:00', '2027-06-23T09:36:00'])
    expect(campo(t(302), 'TotalSlack')).toBe('265340') // 26.534 min em décimos de minuto
    expect(campo(t(104), 'RemainingDuration')).toBe('PT57H36M0S') // 3.456 min
    expect(campo(t(302), 'RemainingDuration')).toBe('PT63H22M0S') // 3.802 min
    // Importar o próprio export do seed não traz restrição nem calendário próprio e mantém o padrão
    const volta = parseMspdiXml(xmlSeed)
    expect(volta.calendarios).toHaveLength(1)
    expect(volta.tasks.some((tarefa) => tarefa.calendarioUid !== undefined)).toBe(false)
    expect(volta.meta.opcoesCronograma).toEqual({ logica: 'retida', moverRestante: true })
  })

  it('SNET inferido (tarefa sem vínculo e sem avanço) é marcado e volta ao arquivo como ASAP; o explícito volta como SNET', () => {
    const tasks =
      tarefa(1) + // sem vínculo, sem avanço, ConstraintType ausente: SNET inferido
      tarefa(2, { extra: '<ConstraintType>4</ConstraintType><ConstraintDate>2026-03-09T08:00:00</ConstraintDate>' }) // SNET explícito
    const { r, exportado, volta } = idaEVolta(projeto({ head: '<StartDate>2026-03-02T08:00:00</StartDate><StatusDate>2026-03-01T17:00:00</StatusDate>', tasks }))
    expect(r.tasks[0].restricao).toEqual({ tipo: 'SNET', data: '2026-03-02', inferida: true })
    expect(r.tasks[1].restricao).toEqual({ tipo: 'SNET', data: '2026-03-09T08:00' })
    const docX = new DOMParser().parseFromString(exportado, 'application/xml')
    const tt = (uid: number) => Array.from(docX.getElementsByTagName('Task')).find((x) => x.getElementsByTagName('UID')[0]?.textContent === String(uid))!
    const campo = (el: Element, nome: string) => Array.from(el.children).find((c) => c.localName === nome)?.textContent
    expect([campo(tt(1), 'ConstraintType'), campo(tt(1), 'ConstraintDate')]).toEqual(['0', undefined]) // a inferida volta como ASAP
    expect([campo(tt(2), 'ConstraintType'), campo(tt(2), 'ConstraintDate')]).toEqual(['4', '2026-03-09T08:00:00'])
    expect(volta.tasks[0].restricao).toEqual({ tipo: 'SNET', data: '2026-03-02', inferida: true }) // a mesma heurística, na releitura
    expect(volta.tasks[1].restricao).toEqual({ tipo: 'SNET', data: '2026-03-09T08:00' })
  })
})

describe('limites do import de calendários, restrições e lags (S-1 e S-2)', () => {
  const dia = (n: number, tempos: string) => `<WeekDay><DayType>${n}</DayType><DayWorking>${tempos ? 1 : 0}</DayWorking>${tempos}</WeekDay>`
  const horas = (...pares: [string, string][]) => `<WorkingTimes>${pares.map(([a, b]) => `<WorkingTime><FromTime>${a}</FromTime><ToTime>${b}</ToTime></WorkingTime>`).join('')}</WorkingTimes>`
  const semanaDe = (tempos: string) => `<WeekDays>${[1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, n >= 2 && n <= 6 ? tempos : '')).join('')}</WeekDays>`
  const base = (uid: number, nome: string, inner: string) => `<Calendar><UID>${uid}</UID><Name>${nome}</Name><IsBaseCalendar>1</IsBaseCalendar><BaseCalendarUID>-1</BaseCalendarUID>${inner}</Calendar>`
  const PADRAO_XML = semanaDe(horas(['08:00:00', '12:00:00'], ['13:00:00', '17:00:00']))
  const comTarefaNoCalendario = (cal: string, uidDaTarefa = 2) =>
    parseMspdiXml(
      projeto({
        head: `<StartDate>2026-03-02T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars>${base(1, 'Obra', PADRAO_XML)}${cal}</Calendars>`,
        tasks: tarefa(1) + tarefa(2, { extra: `<CalendarUID>${uidDaTarefa}</CalendarUID>` }),
      }),
    )

  it('S-1: calendário sem tempo útil, com 6 intervalos no dia, fim antes do início e hora 25:00 são rejeitados com aviso, sem travar', () => {
    const seis = horas(['01:00:00', '02:00:00'], ['03:00:00', '04:00:00'], ['05:00:00', '06:00:00'], ['07:00:00', '08:00:00'], ['09:00:00', '10:00:00'], ['11:00:00', '12:00:00'])
    const casos: [string, string][] = [
      ['todo não útil', '<WeekDays>' + [1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, '')).join('') + '</WeekDays>'],
      ['6 intervalos', semanaDe(seis)],
      ['ToTime antes de FromTime', semanaDe(horas(['17:00:00', '08:00:00']))],
      ['hora 25:00', semanaDe(horas(['08:00:00', '25:00:00']))],
      ['intervalos sobrepostos', semanaDe(horas(['08:00:00', '12:00:00'], ['11:00:00', '17:00:00']))],
    ]
    for (const [nome, semana] of casos) {
      const t0 = performance.now()
      const r = comTarefaNoCalendario(base(2, 'Ruim', semana))
      expect(performance.now() - t0, nome).toBeLessThan(2000)
      expect(r.calendarios.map((c) => c.uid), nome).toEqual([1])
      expect(r.tasks[1].calendarioUid, nome).toBeUndefined()
      expect(r.warnings, nome).toContain('1 calendário(s) rejeitado(s) por não ter tempo útil, ter horário inválido ou mais de 5 intervalos por dia: as tarefas usam o calendário do projeto.')
      expect(r.warnings, nome).toContain('1 tarefa(s) com calendário não importado (de recurso, ausente, rejeitado ou acima do limite): calculadas no calendário do projeto.')
    }
  })

  it('S-1: 5 intervalos no dia e o calendário "24 Horas" (00:00–00:00, 1.440 min por dia) são aceitos', () => {
    const cinco = horas(['01:00:00', '02:00:00'], ['03:00:00', '04:00:00'], ['05:00:00', '06:00:00'], ['07:00:00', '08:00:00'], ['09:00:00', '10:00:00'])
    expect(comTarefaNoCalendario(base(2, 'Cinco', semanaDe(cinco))).calendarios.map((c) => c.uid)).toEqual([1, 2])
    const r = comTarefaNoCalendario(base(2, '24 Horas', `<WeekDays>${[1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, horas(['00:00:00', '00:00:00']))).join('')}</WeekDays>`))
    expect(r.calendarios.map((c) => c.uid)).toEqual([1, 2])
    expect(r.calendarios[1].semana.map((d) => d.reduce((a, iv) => a + iv.ate - iv.de, 0))).toEqual([1440, 1440, 1440, 1440, 1440, 1440, 1440])
    expect(r.tasks[1].calendarioUid).toBe(2)
  })

  it('S-1: 101 calendários usados por tarefas importam só 100 (o do projeto conta), com aviso e sem travar', () => {
    const cals = Array.from({ length: 100 }, (_, i) => base(i + 2, `Cal ${i + 2}`, PADRAO_XML)).join('')
    const tasks = tarefa(1) + Array.from({ length: 100 }, (_, i) => tarefa(i + 2, { extra: `<CalendarUID>${i + 2}</CalendarUID>` })).join('')
    const t0 = performance.now()
    const r = parseMspdiXml(projeto({ head: `<StartDate>2026-03-02T08:00:00</StartDate><Calendars>${base(1, 'Obra', PADRAO_XML)}${cals}</Calendars>`, tasks }))
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(r.calendarios).toHaveLength(MAX_CALENDARIOS_IMPORTADOS)
    expect(r.warnings).toContain('1 calendário(s) acima do limite de 100 não importado(s): as tarefas usam o calendário do projeto.')
    expect(r.tasks.filter((t) => t.calendarioUid !== undefined)).toHaveLength(99)
  })

  it('calendário do projeto rejeitado: usa o padrão seg–sex com os feriados nacionais e avisa', () => {
    const r = parseMspdiXml(projeto({ head: `<StartDate>2026-03-02T08:00:00</StartDate><CalendarUID>1</CalendarUID><Calendars>${base(1, 'Ruim', semanaDe(horas(['08:00:00', '25:00:00'])))}</Calendars>` }))
    expect(r.calendarioPadraoUid).toBe(1)
    expect(r.calendarios[0].semana[1]).toEqual([{ de: 480, ate: 720 }, { de: 780, ate: 1020 }])
    expect(r.calendarios[0].excecoes.some((ex) => ex.data === '2026-12-25' && ex.intervalos.length === 0)).toBe(true)
    expect(r.warnings.some((w) => w.startsWith('1 calendário(s) rejeitado(s)'))).toBe(true)
    expect(r.warnings).toContain('Calendário sem feriados no XML; aplicados os feriados nacionais brasileiros.')
  })

  it('exceções com horário (legadas e em <Exceptions>) e WorkWeeks: o horário vale, as semanas alternativas avisam', () => {
    const legada = `<WeekDay><DayType>0</DayType><DayWorking>1</DayWorking>${periodo('2026-03-07', '2026-03-07')}${horas(['08:00:00', '12:00:00'])}</WeekDay>`
    const simples = `<Exceptions><Exception><EnteredByOccurrences>0</EnteredByOccurrences>${periodo('2026-03-14', '2026-03-14')}<Name>X</Name><DayWorking>1</DayWorking>${horas(['07:00:00', '11:00:00'])}</Exception></Exceptions>`
    const feriado = `<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking>${periodo('2026-04-03', '2026-04-03')}</WeekDay>`
    const r = parseMspdiXml(
      projeto({ head: `<StartDate>2026-03-02T08:00:00</StartDate><Calendars>${base(1, 'Obra', `<WeekDays>${[1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, n >= 2 && n <= 6 ? horas(['08:00:00', '17:00:00']) : '')).join('')}${legada}${feriado}</WeekDays>${simples}<WorkWeeks><WorkWeek><Name>Alternativa</Name></WorkWeek></WorkWeeks>`)}</Calendars>` }),
    )
    expect(r.calendarios[0].excecoes).toEqual([
      { data: '2026-03-07', intervalos: [{ de: 480, ate: 720 }] },
      { data: '2026-03-14', intervalos: [{ de: 420, ate: 660 }] },
      { data: '2026-04-03', intervalos: [] },
    ])
    expect(r.warnings).toContain('1 calendário(s) com semanas de trabalho alternativas (WorkWeeks) não aplicadas: o cálculo usa a semana padrão.')
  })

  it('S-2: restrição, prazo e datas reais absurdos (9999-12-31) são ignorados com aviso; lag acima de 10 anos e % de 10⁹ viram zero com aviso', () => {
    const elo = (lag: number, formato: number) =>
      `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>${lag}</LinkLag><LagFormat>${formato}</LagFormat></PredecessorLink>`
    const tasks =
      tarefa(1) +
      tarefa(2, { extra: '<ConstraintType>4</ConstraintType><ConstraintDate>9999-12-31T08:00:00</ConstraintDate><Deadline>9999-12-31T17:00:00</Deadline>' + elo(0, 7) }) +
      tarefa(3, { extra: '<PercentComplete>50</PercentComplete><ActualStart>9999-12-31T08:00:00</ActualStart>' + elo(900_000_000_000, 7) }) +
      tarefa(4, { extra: elo(1_000_000_000, 19) }) +
      tarefa(5, { extra: '<ConstraintType>9</ConstraintType>' + elo(0, 7) }) +
      tarefa(6, { extra: '<ConstraintType>2</ConstraintType>' + elo(0, 7) })
    const r = parseMspdiXml(projeto({ head: '<StartDate>2026-03-02T08:00:00</StartDate>', tasks }))
    const t = (uid: number) => r.tasks.find((x) => x.uid === uid)!
    expect(t(2).restricao).toBeUndefined()
    expect(t(2).prazoFinal).toBeUndefined()
    expect(t(3).predecessors[0].lag).toEqual({ tipo: 'util', minutos: 0 }) // 900 bilhões de décimos de minuto ≈ 171 anos
    expect(t(3).actualStart).toBe('2026-03-02') // a data real absurda cai no Start do arquivo
    expect(t(4).predecessors[0].lag).toEqual({ tipo: 'util', minutos: 0 })
    expect(r.warnings).toContain('3 restrição(ões) ou prazo(s) final(is) com tipo desconhecido, data inválida ou fora da faixa ignorado(s).') // data e prazo da tarefa 2 + tipo 9 da 5
    expect(r.warnings).toContain('2 vínculo(s) com latência fora da faixa (mais de 10 anos ou % acima de 1000) importados com latência zero.')
    expect(r.warnings).toContain('1 restrição(ões) de data sem a data no arquivo ignorada(s).')
    expect(r.warnings.some((w) => /^\d+ data\(s\) inválida\(s\) ou a mais de 45 anos/.test(w))).toBe(true)
    // O resultado é seguro para o motor: nenhuma data absurda chegou ao cálculo
    const cals = compilarCalendarios('2026-03-02', r.calendarios, r.calendarioPadraoUid)
    expect(() => computeSchedule(r.tasks, cals, { mode: 'forecast', statusDate: '2026-03-02' })).not.toThrow()
  })

  it('S-4: DOCTYPE e ENTITY continuam recusados e o XML malformado dá erro em português', () => {
    expect(() => parseMspdiXml('<!DOCTYPE x [<!ENTITY a "b">]><Project/>')).toThrow(/DOCTYPE/)
    expect(() => parseMspdiXml('<Project><Tasks>')).toThrow(/inválido ou corrompido/)
  })
})
