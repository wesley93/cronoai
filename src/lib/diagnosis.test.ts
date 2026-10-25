import { describe, expect, it } from 'vitest'
import { WorkCalendar, defaultHolidays } from './calendar'
import { buildDiagnosis } from './diagnosis'
import { computeEvm, computePackageEvm } from './evm'
import type { DelayAnalysis } from './scenarios'
import type { Task } from '@/types/domain'

const cal = new WorkCalendar('2026-11-03', { holidays: defaultHolidays(2026, 2029), extraWorkingDays: [] })
const semAtraso: DelayAnalysis = { originShift: 0, keysForecast: '2026-11-03', delayDays: 0, delayCalendarDays: 0, affected: [] }

const argumentos = (tasks: Task[]) => ({
  projectName: 'Obra Teste',
  statusDate: '2026-11-03',
  evm: computeEvm(tasks, cal, '2026-11-03'),
  packages: computePackageEvm(tasks, cal, '2026-11-03'),
  delay: semAtraso,
  tasks,
  restrictions: [],
  supplies: [],
  recoveryTotal: 0,
})

describe('buildDiagnosis', () => {
  it('obra sem tarefas não recebe diagnóstico de desempenho (SPI/CPI 1,00 é só o fallback do safeDiv)', () => {
    const args = argumentos([])
    expect(args.evm.bac).toBe(0)
    expect(args.evm.spi).toBe(1) // o número do motor não muda
    const d = buildDiagnosis(args)
    expect(d.status).toBe('sem-dados')
    expect(d.headline).toBe('Obra sem cronograma ou orçamento para diagnosticar')
    expect(d.headline).not.toContain('sob controle')
    expect(d.paragraphs).toHaveLength(1)
    expect(d.paragraphs[0]).toContain('não tem tarefas com orçamento (BAC)')
    expect(d.paragraphs[0]).toContain('03/11/26')
    expect(d.actions).toEqual(['Use Importar .xml no topo para trazer o cronograma do MS Project, ou cadastre os pacotes na EAP.'])
  })

  it('com orçamento e sem desvio, segue o diagnóstico normal "sob controle"', () => {
    const tarefa: Task = {
      uid: 1, wbs: '01.01', name: 'Fundação', outlineLevel: 2, isSummary: false, durationDays: 10, predecessors: [],
      percentComplete: 0, bac: 1000, actualCost: 0, resources: [], baselineStart: '2026-11-10', baselineFinish: '2026-11-23',
    }
    const d = buildDiagnosis(argumentos([tarefa]))
    expect(d.status).toBe('verde')
    expect(d.headline).toBe('Obra sob controle em prazo e custo')
  })
})
