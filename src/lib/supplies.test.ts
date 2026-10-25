import { describe, expect, it } from 'vitest'
import type { MaterialItem, ScheduleResult, SiteRestriction, Task } from '@/types/domain'
import { analyzeSupplies } from './supplies'

const STATUS_DATE = '2026-10-23'
const START = '2026-11-02'

const task: Task = {
  uid: 1,
  wbs: '1',
  name: 'Fundação',
  outlineLevel: 1,
  isSummary: false,
  duracaoMin: 2400,
  predecessors: [],
  percentComplete: 0,
  bac: 0,
  actualCost: 0,
  resources: [],
  baselineStart: START,
}

const schedule: ScheduleResult = {
  byUid: new Map([
    [
      1,
      {
        uid: 1, inicioCedoMin: 480, terminoCedoMin: 8160, inicioTardeMin: 480, terminoTardeMin: 8160,
        earlyStart: START, earlyFinish: '2026-11-06', lateStart: START, lateFinish: '2026-11-06',
        start: START, finish: '2026-11-06', inicioHora: '08:00', terminoHora: '17:00',
        folgaTotalMin: 0, folgaLivreMin: 0, totalFloat: 0, freeFloat: 0, critical: false, duracaoMin: 2400, restanteMin: 2400, corrida: false, prazoFinalPerdido: false, restricaoConflito: false,
      },
    ],
  ]),
  projectStart: START,
  projectFinish: '2026-11-06',
  terminoProjetoMin: 8160,
  criticalPath: [],
  order: [1],
}

const material = (over: Partial<MaterialItem> = {}): MaterialItem => ({
  id: 'm-cimento',
  name: 'Cimento CP-II',
  spec: '50 kg',
  unit: 'sc',
  quantity: 100,
  supplier: 'Fornecedor Fictício',
  taskUid: 1,
  leadTimeDays: 14,
  ordered: false,
  unitPrice: 40,
  ...over,
})

const ruptura: SiteRestriction = {
  id: 'r-1',
  date: STATUS_DATE,
  kind: 'material',
  label: 'Falta de cimento',
  detail: 'Cimento acabou',
  material: 'cimento',
  resolved: false,
}

describe('suprimentos: bordas', () => {
  it('ruptura reportada no canteiro', () => {
    const [a] = analyzeSupplies([material()], [task], schedule, STATUS_DATE, [ruptura])
    expect(a.status).toBe('ruptura')
    expect(a.stopDays).toBe(4)
  })

  it('entrega programada depois da necessidade', () => {
    const [a] = analyzeSupplies([material({ ordered: true, deliveryDate: '2026-11-06' })], [task], schedule, STATUS_DATE, [])
    expect(a.status).toBe('entrega-tardia')
    expect(a.stopDays).toBe(4)
    expect(a.recommendedDelivery).toBe('2026-10-31')
  })

  it('pedido em dia', () => {
    const [a] = analyzeSupplies([material({ ordered: true, deliveryDate: '2026-10-30' })], [task], schedule, STATUS_DATE, [])
    expect(a.status).toBe('ok')
    expect(a.headline).toBe('Pedido em dia')
  })
})
