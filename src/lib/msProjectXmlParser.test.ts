import { describe, expect, it } from 'vitest'
import { buildSeedState } from '@/stores/useProjectStore'
import { WorkCalendar, addCalendarDays } from './calendar'
import { computeSchedule } from './cpm'
import {
  MAX_CALENDAR_DAYS,
  MAX_MSPDI_CHARS,
  buildMspdiXml,
  buildTaskXml,
  fromDuration,
  lagToWorkingDays,
  parseMspdiXml,
  validateMspdi,
} from './msProjectXmlParser'

const seed = buildSeedState()
const cal = new WorkCalendar(seed.meta.startDate, seed.calendar)
const schedule = computeSchedule(seed.tasks, cal, { mode: 'forecast', statusDate: seed.meta.statusDate })
const input = { meta: seed.meta, tasks: seed.tasks, calendar: seed.calendar, schedule }

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
    expect(r.tasks[0].durationDays).toBe(10) // 90 h / 9 h
    expect(r.tasks[0].snet).toBe('2026-03-02') // sem vínculo: mantém a data do arquivo
    expect(r.tasks[1].predecessors).toEqual([
      { uid: 10, type: 'SS', lagDays: 3 }, // 16200 / 10 / 540
      { uid: 12, type: 'FS', lagDays: 5 }, // 7 dias corridos ≈ 5 úteis
    ])
    expect(r.calendar.holidays).toEqual(['2026-04-03'])
    expect(r.meta.statusDate).toBe('2026-03-20')
    expect(r.warnings.join(' ')).toMatch(/inativa/)
    expect(r.warnings.join(' ')).toMatch(/9 h\/dia/)
  })

  it('converte durações e latências', () => {
    expect(fromDuration('PT45H0M0S', 540)).toBe(5)
    expect(fromDuration('P1DT4H', 480)).toBe(1.5)
    expect(lagToWorkingDays(4800, 7)).toBe(1)
    expect(lagToWorkingDays(4800, 39)).toBe(1) // formato estimado
    expect(lagToWorkingDays(50, 19)).toBeUndefined() // percentual
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
    expect(r.calendar.holidays).toEqual(natal)
    expect(r.warnings.join(' ')).not.toMatch(/recorrente/)
  })

  it('C-2: sem lista legada a recorrente não é aplicada e gera aviso; a simples continua', () => {
    const xml = projeto({
      head: calendario(`<Exceptions>${excecao('2026-12-25', '2028-12-25', { ocorrencias: 3 })}${excecao('2026-11-20', '2026-11-20')}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    expect(r.calendar.holidays).toEqual(['2026-11-20'])
    expect(r.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
  })

  it('recorrente com lista legada sem nenhuma data dentro do seu período não é aplicada e avisa', () => {
    const xml = projeto({
      head: calendario(`${legado(['2026-12-25'])}<Exceptions>${excecao('2027-06-01', '2028-06-01', { ocorrencias: 3 })}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    expect(r.calendar.holidays).toEqual(['2026-12-25'])
    expect(r.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
  })

  it('C-3: recorrente útil (sábados de hora extra) usa a lista legada', () => {
    const sabados = ['2027-01-02', '2027-02-06', '2027-03-06']
    const xml = projeto({
      head: calendario(`${legado(sabados, 1)}<Exceptions>${excecao('2027-01-02', '2027-03-06', { ocorrencias: 3, trabalha: 1 })}</Exceptions>`),
    })
    const r = parseMspdiXml(xml)
    // Antes: 64 dias úteis extras (o intervalo inteiro)
    expect(r.calendar.extraWorkingDays).toEqual(sabados)
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
    expect(r.calendar.holidays).toHaveLength(400)
    expect(r.calendar.holidays[0]).toBe('2026-01-01')
    expect(r.calendar.holidays[399]).toBe('2027-02-04')
    expect(r.warnings).toContain('1 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('S-3: milhares de exceções de intervalo longo e repetido gastam só o orçamento de dias percorridos', { timeout: 30_000 }, () => {
    // 3.000 exceções com o mesmo início e términos diferentes: cada uma tem >= 400 dias e todas caem nos mesmos 400 dias.
    // Os dias inseridos ficam em 400, mas o orçamento conta os PERCORRIDOS: acaba na 25ª exceção (25 × 400 = 10.000) e o resto é ignorado.
    const blocos = Array.from({ length: 3000 }, (_, i) => excecao('2000-01-01', addCalendarDays('2099-12-31', -i)))
    const r = parseMspdiXml(projeto({ head: calendario(`<Exceptions>${blocos.join('')}</Exceptions>`) }))
    expect(r.calendar.holidays).toHaveLength(400)
    expect(r.warnings).toContain('Calendário com mais de 10000 dias de exceção: o excedente não foi importado; confira feriados e dias úteis extras.')
    // as 25 primeiras são cortadas em 400 dias; a mesma exceção repetida em legado e <Exceptions> conta uma vez (teste abaixo)
    expect(r.warnings).toContain('25 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('exceção que consta no legado e em <Exceptions> é expandida e avisada uma vez só', () => {
    const periodoLongo = periodo('2026-01-01', '2028-12-31')
    const legadoLongo = `<WeekDays><WeekDay><DayType>0</DayType><DayWorking>0</DayWorking>${periodoLongo}</WeekDay></WeekDays>`
    const r = parseMspdiXml(projeto({ head: calendario(`${legadoLongo}<Exceptions>${excecao('2026-01-01', '2028-12-31')}</Exceptions>`) }))
    expect(r.calendar.holidays).toHaveLength(400)
    expect(r.warnings).toContain('1 exceção(ões) do calendário com mais de 400 dias: lidas apenas nos primeiros 400 dias.')
  })

  it('S-3: calendário limitado a MAX_CALENDAR_DAYS no total, com aviso', () => {
    expect(MAX_CALENDAR_DAYS).toBe(10_000)
    const blocos = Array.from({ length: 30 }, (_, i) => {
      const de = addCalendarDays('2026-01-01', i * 400)
      return excecao(de, addCalendarDays(de, 399)) // 400 dias cada, sem sobreposição
    })
    const r = parseMspdiXml(projeto({ head: calendario(`<Exceptions>${blocos.join('')}</Exceptions>`) }))
    expect(r.calendar.holidays).toHaveLength(10_000) // 30 × 400 = 12.000 pedidos
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

  it('C-4b: LB0 só com término é mantida, avisa (recalculada pelo cronograma) e faz ida e volta com strictOrder', () => {
    const lb = '<Baseline><Number>0</Number><Finish>2026-04-30T17:00:00</Finish></Baseline>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: lb }) }))
    expect(r.tasks[0].baselineStart).toBeUndefined()
    expect(r.tasks[0].baselineFinish).toBe('2026-04-30')
    expect(r.warnings).toContain('1 tarefa(s) com linha de base 0 sem início: a linha de base delas será recalculada pelo cronograma ao importar.')
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

  it('C-6: durações em tempo corrido, abaixo de meio dia e fracionárias avisam sem mudar o valor', () => {
    const tasks =
      tarefa(1, { duration: 'PT24H0M0S', extra: '<DurationFormat>8</DurationFormat>' }) +
      tarefa(2, { duration: 'PT1H0M0S', extra: '<DurationFormat>5</DurationFormat>' }) +
      tarefa(3, { duration: 'PT12H0M0S', extra: '<DurationFormat>7</DurationFormat>' })
    const r = parseMspdiXml(projeto({ tasks }))
    // Valores iguais aos de antes: 24 h ÷ 8 h = 3 dias; 1 h vira marco; 12 h ÷ 8 h = 1,5 arredondado para 2
    expect(r.tasks.map((t) => t.durationDays)).toEqual([3, 0, 2])
    expect(r.warnings).toContain('1 tarefa(s) com duração em tempo corrido convertida como horas úteis: revise as durações.')
    expect(r.warnings).toContain('1 tarefa(s) com menos de meio dia de duração importada(s) como marco (0 dia).')
    expect(r.warnings).toContain('1 duração(ões) fracionária(s) arredondada(s) para dias úteis inteiros.')
  })

  it('durações inteiras em dias úteis não geram aviso de duração', () => {
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { duration: 'PT16H0M0S', extra: '<DurationFormat>7</DurationFormat>' }) }))
    expect(r.tasks[0].durationDays).toBe(2)
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

  it('calendário próprio: compara com o calendário realmente usado, não com um CalendarUID inexistente', () => {
    // CalendarUID do projeto (9) não existe: o import usa o primeiro calendário (UID 1); a tarefa com CalendarUID 1 não tem calendário próprio
    const head = `<CalendarUID>9</CalendarUID>${calendario('')}`
    const r = parseMspdiXml(projeto({ head, tasks: tarefa(1, { extra: '<CalendarUID>1</CalendarUID>' }) + tarefa(2, { extra: '<CalendarUID>2</CalendarUID>' }) }))
    expect(r.warnings).toContain('1 tarefa(s) com calendário próprio importada(s) no calendário do projeto.')
  })

  it('vínculo com tipo não numérico não leva o texto do arquivo para a mensagem', () => {
    const xml = projeto({ tasks: tarefa(1) + tarefa(2, { extra: '<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>SEGREDO-X</Type></PredecessorLink>' }) })
    const v = validateMspdi(xml)
    expect(v.errors).toEqual(['Tarefa UID 2: tipo de vínculo (não numérico) inválido (0–3).'])
  })

  it('C-8: calendário próprio da tarefa e tarefa nula avisam', () => {
    // O MS Project grava a linha em branco com UID e OutlineLevel 0; a de nível 1 também é descartada
    const nulaNivel0 = '<Task><UID>5</UID><ID>5</ID><IsNull>1</IsNull><OutlineLevel>0</OutlineLevel></Task>'
    const tasks = tarefa(1) + tarefa(2, { extra: '<CalendarUID>2</CalendarUID>' }) + tarefa(3, { extra: '<IsNull>1</IsNull>' }) + tarefa(4, { extra: '<CalendarUID>-1</CalendarUID>' }) + nulaNivel0
    const r = parseMspdiXml(projeto({ tasks }))
    expect(r.tasks.map((t) => t.uid)).toEqual([1, 2, 4])
    expect(r.warnings).toContain('1 tarefa(s) com calendário próprio importada(s) no calendário do projeto.')
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
    expect(r.warnings.join(' ')).not.toMatch(/Não importado|linha de base|calendário próprio|em branco|fracionária|Text1|Number1/)
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
    expect(r.calendar.holidays).toEqual(['2026-11-20'])
    expect(r.warnings).toContain('2 exceção(ões) do calendário com data inválida ignorada(s).')
    expect(r.warnings.join(' ')).not.toMatch(/abcdefghij|Invalid/)
  })

  it('recorrente com menos datas legadas no período que Occurrences não é aplicada e avisa (A1)', () => {
    const exc = `<Exceptions>${excecao('2026-12-25', '2028-12-25', { ocorrencias: 3 })}</Exceptions>`
    const duas = parseMspdiXml(projeto({ head: calendario(`${legado(['2026-12-25', '2027-12-25'])}${exc}`) }))
    expect(duas.warnings).toContain('1 exceção(ões) recorrente(s) do calendário não aplicada(s): confira feriados e dias úteis extras.')
    expect(duas.calendar.holidays).toEqual(['2026-12-25', '2027-12-25']) // o que a lista legada trouxe segue lido
    const tres = parseMspdiXml(projeto({ head: calendario(`${legado(['2026-12-25', '2027-12-25', '2028-12-25'])}${exc}`) }))
    expect(tres.warnings.join(' ')).not.toMatch(/recorrente/)
  })

  it('LB0 parcial de tarefa-resumo não gera aviso (só folhas)', () => {
    const lb = '<Baseline><Number>0</Number><Start>2026-03-02T08:00:00</Start></Baseline>'
    const r = parseMspdiXml(projeto({ tasks: tarefa(1, { extra: '<Summary>1</Summary>' + lb }) + tarefa(2, { extra: lb }) }))
    expect(r.warnings).toContain('1 tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.')
  })

  it('semana do calendário diferente de segunda a sexta avisa com o número de dias', () => {
    const dia = (n: number, trabalha: number) => `<WeekDay><DayType>${n}</DayType><DayWorking>${trabalha}</DayWorking></WeekDay>`
    const padrao = [1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, n >= 2 && n <= 6 ? 1 : 0)).join('')
    const sabado = [1, 2, 3, 4, 5, 6, 7].map((n) => dia(n, n >= 2 && n <= 7 ? 1 : 0)).join('')
    const ok = parseMspdiXml(projeto({ head: calendario(`<WeekDays>${padrao}</WeekDays>`) }))
    expect(ok.warnings.join(' ')).not.toMatch(/semana|segunda a sexta/)
    const r = parseMspdiXml(projeto({ head: calendario(`<WeekDays>${sabado}</WeekDays>`) }))
    expect(r.warnings).toContain('Calendário do projeto com 1 dia(s) da semana diferente(s) de segunda a sexta: o CronoAI usa só segunda a sexta; confira os dias úteis.')
  })

  it('lag em formato diferente de dias úteis avisa; formato 7 e o seed não', () => {
    const elo = (lag: number, formato: number) =>
      `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>${lag}</LinkLag><LagFormat>${formato}</LagFormat></PredecessorLink>`
    const r = parseMspdiXml(projeto({ tasks: tarefa(1) + tarefa(2, { extra: elo(4800, 9) + elo(4800, 7) + elo(0, 9) }) }))
    expect(r.warnings).toContain('1 vínculo(s) com lag em formato diferente de dias úteis: serão exportados em dias úteis.')
    const seedImport = parseMspdiXml(buildMspdiXml(input))
    expect(seedImport.warnings.join(' ')).not.toMatch(/formato diferente|segunda a sexta|data inválida/)
  })
})
