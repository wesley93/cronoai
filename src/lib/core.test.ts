import { describe, expect, it } from 'vitest'
import { buildSeedState } from '@/stores/useProjectStore'
import { easterSunday } from './calendar'
import { calendariosParaExportar } from './feriadosObra'
import { calendarioDeDias, compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule } from './cpm'
import { computeEvm } from './evm'
import { interpretReport } from './fieldAi'
import { buildMspdiXml, minutosParaDuracao, parseMspdiXml } from './msProjectXmlParser'
import { analyzeDelay, simulateAll } from './scenarios'
import { analyzeSupplies } from './supplies'
import { durationFromTeam } from './sinapi'

const seed = buildSeedState()
const cals = compilarCalendarios(seed.meta.startDate, seed.calendarios, seed.calendarioPadraoUid)
const cal = calendarioDeDias(cals.padrao)
const forecast = computeSchedule(seed.tasks, cals, { mode: 'forecast', statusDate: seed.meta.statusDate })

describe('calendário', () => {
  it('calcula a Páscoa', () => {
    expect(easterSunday(2026)).toBe('2026-04-05')
    expect(easterSunday(2027)).toBe('2027-03-28')
  })
  it('pula feriados nacionais', () => {
    expect(cal.isWorkingDay('2026-09-07')).toBe(false)
    expect(cal.isWorkingDay('2026-10-12')).toBe(false)
    expect(cal.isWorkingDay('2026-10-13')).toBe(true)
  })
})

describe('CPM', () => {
  it('linha de base: caminho crítico passa por alvenaria, reboco, gesso e pintura', () => {
    const base = computeSchedule(seed.tasks, cals, { mode: 'baseline' })
    for (const uid of [201, 202, 203, 301, 103, 104, 105, 401, 501, 502, 701, 801, 802]) {
      expect(base.byUid.get(uid)?.critical, `UID ${uid}`).toBe(true)
    }
    expect(base.byUid.get(702)?.critical).toBe(false)
    expect(base.byUid.get(104)?.finish).toBe('2026-10-13')
  })
  it('reprogramação: 104 a 40% empurra a entrega', () => {
    const d = analyzeDelay(seed.tasks, forecast, cal)
    expect(d.origin?.uid).toBe(104)
    expect(d.delayDays).toBeGreaterThan(10)
    expect(d.affected.map((a) => a.uid)).toEqual(expect.arrayContaining([105, 401, 501, 502, 701, 801]))
  })
})

describe('EVM', () => {
  it('SPI e CPI abaixo de 1 no seed', () => {
    const e = computeEvm(seed.tasks, cals, seed.meta.statusDate)
    expect(e.spi).toBeLessThan(1)
    expect(e.cpi).toBeLessThan(1)
    expect(e.eac).toBeGreaterThan(e.bac)
    expect(e.vac).toBeCloseTo(e.bac - e.eac)
  })
})

describe('IA de canteiro', () => {
  it('mapeia o relato do Mestre Tião para o UID 104', () => {
    const r = interpretReport(seed.reports[0].transcript, seed.tasks)
    expect(r.best?.uid).toBe(104)
    expect(r.best!.confidence).toBeGreaterThan(85)
    expect(r.suggestedPercent).toBe(75)
    expect(r.restrictions.map((x) => x.kind)).toEqual(expect.arrayContaining(['clima', 'material']))
    expect(r.restrictions.find((x) => x.kind === 'clima')?.lostHours).toBe(2)
  })
  it('mapeia estrutura, elétrica e betoneira', () => {
    expect(interpretReport(seed.reports[1].transcript, seed.tasks).best?.uid).toBe(302)
    expect(interpretReport(seed.reports[2].transcript, seed.tasks).best?.uid).toBe(401)
    const eq = interpretReport(seed.reports[3].transcript, seed.tasks)
    expect(eq.best?.uid).toBe(104)
    expect(eq.suggestedPercent).toBeUndefined()
    expect(eq.restrictions[0]?.lostHours).toBe(3)
  })
})

describe('cenários', () => {
  it('os três cenários recuperam prazo', () => {
    const d = analyzeDelay(seed.tasks, forecast, cal)
    const s = simulateAll({ tasks: seed.tasks, calendarios: seed.calendarios, calendarioPadraoUid: seed.calendarioPadraoUid, meta: seed.meta, forecast, origin: d.origin })
    expect(s.crashing.targetUid).toBe(105)
    expect(s.crashing.daysRecovered).toBeGreaterThan(0)
    expect(s['fast-tracking'].targetUid).toBe(401)
    expect(s['fast-tracking'].daysRecovered).toBeGreaterThan(0)
    expect(s.overtime.daysRecovered).toBe(2)
  })
})

describe('suprimentos', () => {
  it('aço atrasado e porcelanato a reagendar', () => {
    const a = analyzeSupplies(seed.materials, seed.tasks, forecast, seed.meta.statusDate, [])
    expect(a.find((x) => x.material.id === 'm-aco')?.status).toBe('atrasada')
    expect(a.find((x) => x.material.id === 'm-porcelanato')?.status).toBe('reagendar')
  })
})

describe('SINAPI', () => {
  it('Duração = Q × HH / (equipe × 8)', () => {
    expect(durationFromTeam(1000, 0.8, 5)).toBe(20)
  })
})

describe('MSPDI', () => {
  it('converte durações', () => {
    expect(minutosParaDuracao(4800)).toBe('PT80H0M0S')
    expect(minutosParaDuracao(5400)).toBe('PT90H0M0S')
    expect(minutosParaDuracao(1)).toBe('PT0H1M0S')
  })
  it('exporta e reimporta sem perda', () => {
    // O calendário do exemplo aplica os feriados da obra: a exportação (como a da store) os materializa como exceções de 2026 a 2029
    const calendarios = calendariosParaExportar(seed.calendarios, seed.feriados, 2026, 2029)
    const xml = buildMspdiXml({ meta: seed.meta, tasks: seed.tasks, calendarios, calendarioPadraoUid: seed.calendarioPadraoUid, schedule: forecast })
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">')
    expect(xml).toContain('<PredecessorLink>')
    const back = parseMspdiXml(xml)
    expect(back.tasks.length).toBe(seed.tasks.length)
    const t104 = back.tasks.find((t) => t.uid === 104)!
    expect(t104.wbs).toBe('03.01.02')
    expect(t104.percentComplete).toBe(40)
    expect(t104.actualStart).toBe('2026-10-05')
    expect(t104.sinapi).toBe('103332')
    expect(t104.bac).toBe(168000)
    expect(t104.resources).toEqual([{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }])
    const t402 = back.tasks.find((t) => t.uid === 402)!
    expect(t402.predecessors).toEqual([{ uid: 401, type: 'SS', lag: { tipo: 'util', minutos: 4800, codigoMspdi: 7 } }]) // o LagFormat do arquivo volta (E3)
    expect(back.meta.statusDate).toBe('2026-10-23')
    expect(back.calendarios[0].excecoes).toContainEqual({ data: '2026-09-07', intervalos: [] })
    const reCal = compilarCalendarios(seed.meta.startDate, back.calendarios, back.calendarioPadraoUid)
    const re = computeSchedule(back.tasks, reCal, { mode: 'forecast', statusDate: '2026-10-23' })
    expect(re.projectFinish).toBe(forecast.projectFinish)
  })
})
