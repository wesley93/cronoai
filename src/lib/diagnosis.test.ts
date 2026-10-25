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
    expect(d.headline).toBe('Obra sem cronograma para diagnosticar')
    expect(d.headline).not.toContain('sob controle')
    expect(d.paragraphs).toHaveLength(1)
    expect(d.paragraphs[0]).toContain('não tem tarefas')
    expect(d.paragraphs[0]).toContain('03/11/26')
    expect(d.actions).toEqual(['Use Importar .xml no topo para trazer o cronograma do MS Project, ou cadastre os pacotes na EAP.'])
  })

  it('tarefas sem orçamento (BAC = 0) e com atraso: some o texto de custo, o diagnóstico de prazo continua', () => {
    const tarefa: Task = {
      uid: 7, wbs: '01.01', name: 'Estrutura', outlineLevel: 2, isSummary: false, durationDays: 10, predecessors: [],
      percentComplete: 0, bac: 0, actualCost: 0, resources: [], baselineStart: '2026-11-10', baselineFinish: '2026-11-23',
    }
    const delay: DelayAnalysis = {
      origin: tarefa, originShift: 5, keysBaseline: '2026-12-01', keysForecast: '2026-12-08', delayDays: 5, delayCalendarDays: 7, affected: [],
    }
    const args = { ...argumentos([tarefa]), delay }
    expect(args.evm.bac).toBe(0)
    const d = buildDiagnosis(args)
    expect(d.status).toBe('sem-orcamento')
    expect(d.headline).toBe('Entrega prevista com atraso de 5 dias úteis — ação requerida (sem orçamento para medir custo)')
    expect(d.headline).not.toContain('sem cronograma')
    const texto = d.paragraphs.join(' ')
    expect(texto).not.toContain('Importar .xml')
    expect(d.actions.join(' ')).not.toContain('Importar .xml')
    // custo e valor agregado não aparecem
    expect(texto).not.toMatch(/SPI \d|CPI \d|EAC =|estouro|Valor Agregado \(EV\)/)
    expect(d.paragraphs[0]).toContain('não têm orçamento (BAC)')
    // prazo pelo CPM: caminho crítico com os d.u. e a ação de recuperação
    expect(texto).toContain('No caminho crítico, [UID 7] Estrutura está a 0%')
    expect(texto).toContain('de 01/12/26 para 08/12/26 (+5 dias úteis)')
    expect(d.actions).toEqual(['Aprovar plano de recuperação no módulo Caminho Crítico (comparar Crashing, Fast Tracking e Hora Extra).'])
  })

  it('BAC = 0 com custo real (AC > 0): não aparece Margem, EAC, TCPI nem auditoria de custo; o prazo continua', () => {
    const tarefa: Task = {
      uid: 7, wbs: '01.01', name: 'Estrutura', outlineLevel: 2, isSummary: false, durationDays: 10, predecessors: [],
      percentComplete: 40, bac: 0, actualCost: 5000, resources: [], baselineStart: '2026-11-10', baselineFinish: '2026-11-23',
    }
    const delay: DelayAnalysis = {
      origin: tarefa, originShift: 5, keysBaseline: '2026-12-01', keysForecast: '2026-12-08', delayDays: 5, delayCalendarDays: 7, affected: [],
    }
    const args = { ...argumentos([tarefa]), delay }
    expect(args.evm.bac).toBe(0)
    expect(args.evm.ac).toBe(5000)
    const d = buildDiagnosis(args)
    const texto = d.paragraphs.join(' ')
    expect(d.status).toBe('sem-orcamento')
    expect(texto).not.toContain('Margem')
    expect(texto).not.toContain('EAC =')
    expect(texto).not.toContain('TCPI')
    expect(texto).not.toContain('dreno financeiro')
    expect(d.actions.join(' ')).not.toContain('Auditar')
    // O prazo pelo CPM continua
    expect(texto).toContain('(+5 dias úteis)')
    expect(d.actions).toEqual(['Aprovar plano de recuperação no módulo Caminho Crítico (comparar Crashing, Fast Tracking e Hora Extra).'])
  })

  it('tarefas sem orçamento e sem atraso: prazo dentro da linha de base', () => {
    const tarefa: Task = {
      uid: 7, wbs: '01.01', name: 'Estrutura', outlineLevel: 2, isSummary: false, durationDays: 10, predecessors: [],
      percentComplete: 0, bac: 0, actualCost: 0, resources: [], baselineStart: '2026-11-10', baselineFinish: '2026-11-23',
    }
    const d = buildDiagnosis(argumentos([tarefa]))
    expect(d.status).toBe('sem-orcamento')
    expect(d.headline).toBe('Prazo dentro da linha de base (sem orçamento para medir custo)')
    expect(d.actions).toEqual(['Manter rotina semanal de apontamento e reprogramação.'])
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
