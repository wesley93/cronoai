import { describe, expect, it } from 'vitest'
import { buildSeedState } from '@/stores/useProjectStore'
import { WorkCalendar } from './calendar'
import { computeSchedule } from './cpm'
import { buildMspdiXml, buildTaskXml, fromDuration, lagToWorkingDays, parseMspdiXml, validateMspdi } from './msProjectXmlParser'

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
