// Dados iniciais: Edifício Residencial Aurora - 12 Pavimentos.
// Códigos SINAPI, custos e coeficientes são ILUSTRATIVOS — validar na tabela SINAPI vigente da UF da obra.
import type { FieldReport, MaterialItem, ProjectMeta, ResourceKind, Task } from '@/types/domain'
import { defaultHolidays } from '@/lib/calendar'

export const HOURLY_RATES: Record<ResourceKind, number> = {
  Pedreiro: 31.4,
  Servente: 23.9,
  Carpinteiro: 31.4,
  Armador: 31.4,
  Eletricista: 33.1,
  Encanador: 33.1,
  Gesseiro: 31.9,
  Azulejista: 32.2,
  Pintor: 30.8,
  'Operador de equipamento': 36.5,
}

export const SEED_META: ProjectMeta = {
  name: 'Edifício Residencial Aurora - 12 Pavimentos',
  company: 'Construtora Aurora Engenharia (dados de exemplo)',
  manager: 'Eng. de Planejamento',
  startDate: '2026-05-04',
  statusDate: '2026-10-23',
  dailyIndirectCost: 9850,
}

export const SEED_HOLIDAYS = defaultHolidays(2026, 2029)

type Seed = Omit<Task, 'outlineLevel' | 'isSummary' | 'percentComplete' | 'actualCost' | 'resources' | 'predecessors'> &
  Partial<Pick<Task, 'percentComplete' | 'actualCost' | 'resources' | 'predecessors'>>

const summary = (uid: number, wbs: string, name: string): Task => ({
  uid,
  wbs,
  name,
  outlineLevel: wbs.split('.').length,
  isSummary: true,
  durationDays: 0,
  predecessors: [],
  percentComplete: 0,
  bac: 0,
  actualCost: 0,
  resources: [],
})

const leaf = (s: Seed): Task => ({
  percentComplete: 0,
  actualCost: 0,
  resources: [],
  predecessors: [],
  ...s,
  outlineLevel: s.wbs.split('.').length,
  isSummary: false,
})

const ALVENARIA = 'Alvenaria de vedação bloco cerâmico 14x19x29'

export const SEED_TASKS: Task[] = [
  summary(1, '01', 'Infraestrutura e Fundações'),
  leaf({
    uid: 201, wbs: '01.01', name: 'Mobilização do canteiro e locação da obra', durationDays: 10,
    sinapi: '99059', bac: 180_000, percentComplete: 100, actualStart: '2026-05-04', actualFinish: '2026-05-15', actualCost: 186_400,
    resources: [{ resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 4 }, { resource: 'Carpinteiro', units: 2 }],
  }),
  leaf({
    uid: 202, wbs: '01.02', name: 'Estacas hélice contínua Ø40 cm (L=18 m)', durationDays: 20, leadTimeDays: 10,
    sinapi: '100898', bac: 1_150_000, percentComplete: 100, actualStart: '2026-05-18', actualFinish: '2026-06-17', actualCost: 1_212_000,
    predecessors: [{ uid: 201, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Operador de equipamento', units: 2 }, { resource: 'Armador', units: 2 }, { resource: 'Servente', units: 4 }],
  }),
  leaf({
    uid: 203, wbs: '01.03', name: 'Blocos de coroamento e vigas baldrame', durationDays: 15, leadTimeDays: 15,
    sinapi: '96557', bac: 820_000, percentComplete: 100, actualStart: '2026-06-18', actualFinish: '2026-07-10', actualCost: 841_500,
    predecessors: [{ uid: 202, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Carpinteiro', units: 4 }, { resource: 'Armador', units: 4 }, { resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 6 }],
  }),

  summary(2, '02', 'Supraestrutura'),
  leaf({
    uid: 301, wbs: '02.01', name: 'Estrutura de concreto armado fck 30 — Térreo ao 4º Pav.', durationDays: 40, leadTimeDays: 15,
    sinapi: '103670', bac: 2_350_000, floors: [0, 4], percentComplete: 100, actualStart: '2026-07-13', actualFinish: '2026-09-11', actualCost: 2_538_000,
    predecessors: [{ uid: 203, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Carpinteiro', units: 8 }, { resource: 'Armador', units: 6 }, { resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 8 }],
  }),
  leaf({
    uid: 302, wbs: '02.02', name: 'Estrutura de concreto armado fck 30 — 5º ao 8º Pav.', durationDays: 36, leadTimeDays: 15,
    sinapi: '103670', bac: 2_200_000, floors: [5, 8], percentComplete: 78, actualStart: '2026-09-14', actualCost: 1_871_000,
    predecessors: [{ uid: 301, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Carpinteiro', units: 8 }, { resource: 'Armador', units: 6 }, { resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 8 }],
  }),
  leaf({
    uid: 303, wbs: '02.03', name: 'Estrutura de concreto armado fck 30 — 9º ao 12º Pav. + Cobertura', durationDays: 40, leadTimeDays: 15,
    sinapi: '103670', bac: 2_450_000, floors: [9, 12],
    predecessors: [{ uid: 302, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Carpinteiro', units: 8 }, { resource: 'Armador', units: 6 }, { resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 8 }],
  }),

  summary(3, '03', 'Alvenaria de Vedação'),
  summary(31, '03.01', 'Alvenaria — Pavimentos inferiores (1º ao 4º)'),
  leaf({
    uid: 103, wbs: '03.01.01', name: `${ALVENARIA} — 1º Pav.`, durationDays: 12, leadTimeDays: 10,
    sinapi: '103332', bac: 165_000, floors: [1, 1], percentComplete: 100, actualStart: '2026-09-16', actualFinish: '2026-10-02', actualCost: 176_000,
    predecessors: [{ uid: 301, type: 'FS', lagDays: 5 }],
    resources: [{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }],
  }),
  leaf({
    uid: 104, wbs: '03.01.02', name: `${ALVENARIA} — 2º Pav.`, durationDays: 12, leadTimeDays: 10,
    sinapi: '103332', bac: 168_000, floors: [2, 2], percentComplete: 40, actualStart: '2026-10-05', actualCost: 72_000,
    predecessors: [{ uid: 103, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 2 }],
  }),
  leaf({
    uid: 105, wbs: '03.01.03', name: `${ALVENARIA} — 3º e 4º Pav.`, durationDays: 16, leadTimeDays: 10,
    sinapi: '103332', bac: 330_000, floors: [3, 4],
    predecessors: [{ uid: 104, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Pedreiro', units: 6 }, { resource: 'Servente', units: 3 }],
  }),
  leaf({
    uid: 106, wbs: '03.02', name: `${ALVENARIA} — 5º ao 12º Pav.`, durationDays: 60, leadTimeDays: 10,
    sinapi: '103332', bac: 1_300_000, floors: [5, 12],
    predecessors: [{ uid: 105, type: 'FS', lagDays: 0 }, { uid: 302, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Pedreiro', units: 8 }, { resource: 'Servente', units: 4 }],
  }),

  summary(4, '04', 'Instalações Prediais'),
  leaf({
    uid: 401, wbs: '04.01', name: 'Rasgos e tubulação elétrica embutida (eletrodutos e caixas 4x2)', durationDays: 55, leadTimeDays: 7,
    sinapi: '91834', bac: 780_000, floors: [1, 12],
    predecessors: [{ uid: 105, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Eletricista', units: 4 }, { resource: 'Pedreiro', units: 2 }, { resource: 'Servente', units: 2 }],
  }),
  leaf({
    uid: 402, wbs: '04.02', name: 'Instalações hidrossanitárias — prumadas e ramais (PVC/PPR)', durationDays: 60, leadTimeDays: 10,
    sinapi: '89357', bac: 1_050_000, floors: [1, 12],
    predecessors: [{ uid: 401, type: 'SS', lagDays: 10 }],
    resources: [{ resource: 'Encanador', units: 4 }, { resource: 'Servente', units: 2 }],
  }),

  summary(5, '05', 'Revestimentos de Parede e Teto'),
  leaf({
    uid: 501, wbs: '05.01', name: 'Chapisco e reboco interno — massa única e=2 cm', durationDays: 75, leadTimeDays: 5,
    sinapi: '87529', bac: 1_250_000, floors: [1, 12],
    predecessors: [{ uid: 401, type: 'SS', lagDays: 15 }],
    resources: [{ resource: 'Pedreiro', units: 8 }, { resource: 'Servente', units: 4 }],
  }),
  leaf({
    uid: 502, wbs: '05.02', name: 'Revestimento em gesso liso — paredes e tetos', durationDays: 55, leadTimeDays: 7,
    sinapi: '87414', bac: 620_000, floors: [1, 12],
    predecessors: [{ uid: 501, type: 'SS', lagDays: 25 }],
    resources: [{ resource: 'Gesseiro', units: 6 }, { resource: 'Servente', units: 2 }],
  }),

  summary(6, '06', 'Pisos'),
  leaf({
    uid: 601, wbs: '06.01', name: 'Contrapiso argamassado e=5 cm', durationDays: 45, leadTimeDays: 5,
    sinapi: '87630', bac: 690_000, floors: [1, 12],
    predecessors: [{ uid: 501, type: 'SS', lagDays: 15 }],
    resources: [{ resource: 'Pedreiro', units: 4 }, { resource: 'Servente', units: 4 }],
  }),
  leaf({
    uid: 602, wbs: '06.02', name: 'Porcelanato 80x80 retificado assentado com argamassa AC-III', durationDays: 50, leadTimeDays: 45,
    sinapi: '87263', bac: 1_480_000, floors: [1, 12],
    predecessors: [{ uid: 601, type: 'SS', lagDays: 20 }, { uid: 402, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Azulejista', units: 6 }, { resource: 'Servente', units: 3 }],
  }),

  summary(7, '07', 'Pintura e Fachada'),
  leaf({
    uid: 701, wbs: '07.01', name: 'Pintura interna látex acrílico — massa corrida + 2 demãos', durationDays: 60, leadTimeDays: 7,
    sinapi: '88489', bac: 860_000, floors: [1, 12],
    predecessors: [{ uid: 502, type: 'SS', lagDays: 30 }],
    resources: [{ resource: 'Pintor', units: 8 }, { resource: 'Servente', units: 2 }],
  }),
  leaf({
    uid: 702, wbs: '07.02', name: 'Fachada — reboco externo e textura acrílica (balancim)', durationDays: 50, leadTimeDays: 10,
    sinapi: '87775', bac: 1_150_000, floors: [1, 12],
    predecessors: [{ uid: 303, type: 'FS', lagDays: 0 }, { uid: 106, type: 'SS', lagDays: 20 }],
    resources: [{ resource: 'Pedreiro', units: 6 }, { resource: 'Servente', units: 4 }],
  }),

  summary(8, '08', 'Entrega da Obra'),
  leaf({
    uid: 801, wbs: '08.01', name: 'Limpeza final, vistoria e Habite-se', durationDays: 10,
    sinapi: '99811', bac: 120_000,
    predecessors: [{ uid: 701, type: 'FS', lagDays: 0 }, { uid: 602, type: 'FS', lagDays: 0 }, { uid: 702, type: 'FS', lagDays: 0 }],
    resources: [{ resource: 'Servente', units: 8 }],
  }),
  leaf({
    uid: 802, wbs: '08.02', name: 'Entrega das chaves', durationDays: 0, bac: 0,
    predecessors: [{ uid: 801, type: 'FS', lagDays: 0 }],
  }),
]

export const SEED_REPORTS: FieldReport[] = [
  {
    id: 'r-tiao',
    author: 'Mestre Tião',
    role: 'Mestre de Obras',
    avatarColor: 'bg-amber-500',
    timestamp: '2026-10-23T16:42:00',
    channel: 'audio',
    audioSeconds: 42,
    transcript:
      'Chefe, aqui é o Mestre Tião. Levantamos quase tudo de tijolo baiano do 2º pavimento, tá uns 75% pronto, mas choveu depois das 15h e o cimento tá no fim.',
    photo: 'alvenaria',
    status: 'pendente',
  },
  {
    id: 'r-josue',
    author: 'Josué Ribeiro',
    role: 'Encarregado de Estrutura',
    avatarColor: 'bg-sky-500',
    timestamp: '2026-10-23T11:15:00',
    channel: 'audio',
    audioSeconds: 35,
    transcript:
      'Engenheiro, bom dia. Concretamos a laje do 7º ontem à tarde, falta só forma e ferragem do 8º. Diria que a estrutura do 5º ao 8º tá com uns 88%. A bomba da usina atrasou 1 hora.',
    photo: 'estrutura',
    status: 'pendente',
  },
  {
    id: 'r-rogerio',
    author: 'Rogério Lima',
    role: 'Eletricista · Empreiteira de instalações',
    avatarColor: 'bg-violet-500',
    timestamp: '2026-10-23T09:02:00',
    channel: 'texto',
    transcript:
      'Bom dia! Já começamos os rasgos e as caixinhas 4x2 da elétrica no 1º andar, uns 5% do total. Faltou servente pra ajudar no chumbamento.',
    photo: 'eletrica',
    status: 'pendente',
  },
  {
    id: 'r-raimundo',
    author: 'Seu Raimundo',
    role: 'Encarregado de Alvenaria',
    avatarColor: 'bg-emerald-600',
    timestamp: '2026-10-23T07:30:00',
    channel: 'audio',
    audioSeconds: 18,
    transcript:
      'A betoneira do 2º andar quebrou de manhã cedo, a turma do bloco ficou umas 3 horas parada até o mecânico chegar.',
    photo: 'betoneira',
    status: 'pendente',
  },
]

/** Entrega do porcelanato é definida na inicialização a partir da linha de base (ver store). */
export const SEED_MATERIALS: MaterialItem[] = [
  {
    id: 'm-concreto', name: 'Concreto usinado fck 30 MPa', spec: 'Bombeável, brita 1, slump 10±2 cm', unit: 'm³', quantity: 980,
    supplier: 'Usina de concreto (fornecedor exemplo)', taskUid: 303, leadTimeDays: 3, ordered: false, unitPrice: 520,
  },
  {
    id: 'm-aco', name: 'Aço CA-50 cortado e dobrado', spec: 'Ø 6,3 a 20 mm, com romaneio por pavimento', unit: 't', quantity: 62,
    supplier: 'Central de corte e dobra (fornecedor exemplo)', taskUid: 303, leadTimeDays: 15, ordered: false, unitPrice: 7800,
  },
  {
    id: 'm-bloco', name: 'Bloco cerâmico de vedação 14x19x29 cm', spec: 'NBR 15270-1, paletizado', unit: 'un', quantity: 48_000,
    supplier: 'Cerâmica regional (fornecedor exemplo)', taskUid: 106, leadTimeDays: 10, ordered: true, orderDate: '2026-10-01',
    deliveryDate: '2026-10-27', unitPrice: 2.35,
  },
  {
    id: 'm-porcelanato', name: 'Porcelanato 80x80 retificado', spec: 'PEI 4, acetinado, lote único', unit: 'm²', quantity: 9_200,
    supplier: 'Distribuidor de revestimentos (fornecedor exemplo)', taskUid: 602, leadTimeDays: 45, ordered: true,
    orderDate: '2026-10-10', unitPrice: 96,
  },
  {
    id: 'm-ac3', name: 'Argamassa colante AC-III', spec: 'Saco 20 kg, dupla colagem para 80x80', unit: 'sc', quantity: 4_600,
    supplier: 'Distribuidor de revestimentos (fornecedor exemplo)', taskUid: 602, leadTimeDays: 7, ordered: false, unitPrice: 42,
  },
  {
    id: 'm-cimento', name: 'Cimento CP II-E-32', spec: 'Saco 50 kg — argamassa de assentamento', unit: 'sc', quantity: 1_200,
    supplier: 'Depósito de materiais (fornecedor exemplo)', taskUid: 105, leadTimeDays: 2, ordered: false, unitPrice: 39,
  },
  {
    id: 'm-eletroduto', name: 'Eletroduto corrugado 3/4" + caixas 4x2', spec: 'Kit por pavimento (12 kits)', unit: 'kit', quantity: 12,
    supplier: 'Distribuidor elétrico (fornecedor exemplo)', taskUid: 401, leadTimeDays: 7, ordered: true, orderDate: '2026-10-06',
    deliveryDate: '2026-10-20', unitPrice: 6_400,
  },
]
