// Planilha orçamentária SINAPI: leitura de CSV e dimensionamento de cada linha para a EAP.
import type { ResourceAssignment } from '@/types/domain'
import { SINAPI_CATALOG, type SinapiItem } from '@/data/sinapiCatalog'
import { durationFromTeam, scheduleDays } from './sinapi'
import { normalizeText } from './wbs'

export interface BudgetLine {
  id: string
  code: string
  description: string
  /** Local/frente do serviço (vira sufixo do nome da tarefa). */
  location: string
  unit: string
  quantity: number
  /** Razão Unitária de Produção do oficial (HH/unidade). */
  rup: number
  unitCost: number
  professional: string
  helperRatio: number
  /** Oficiais na equipe. */
  team: number
  /** Grupo de 1º nível da EAP (01, 02, ...). */
  group: string
}

export type BatchLinkMode = 'FS' | 'SS'

export interface BatchOptions {
  /** Encadeamento dentro do mesmo grupo: FS em série ou SS com defasagem. */
  mode: BatchLinkMode
  /** Defasagem do SS em % da duração da linha anterior. */
  overlapPct: number
}

export const DEFAULT_BATCH_OPTIONS: BatchOptions = { mode: 'SS', overlapPct: 40 }
export const MAX_BUDGET_LINES = 200

export function lineDuration(l: Pick<BudgetLine, 'quantity' | 'rup' | 'team'>): number {
  return scheduleDays(durationFromTeam(l.quantity, l.rup, Math.max(1, l.team)))
}

export function lineResources(l: Pick<BudgetLine, 'professional' | 'team' | 'helperRatio'>): ResourceAssignment[] {
  const helpers = Math.ceil(Math.max(1, l.team) * Math.max(0, l.helperRatio) - 1e-9)
  return [{ resource: l.professional, units: Math.max(1, l.team) }, ...(helpers > 0 ? [{ resource: 'Servente', units: helpers }] : [])]
}

export function lineName(l: Pick<BudgetLine, 'description' | 'location'>): string {
  return l.location.trim() ? `${l.description} — ${l.location.trim()}` : l.description
}

/** Grupo da EAP pela palavra-chave do serviço (quando o código não está no catálogo). */
export function inferGroup(description: string): string {
  const n = normalizeText(description)
  const rules: [RegExp, string][] = [
    [/estaca|fundacao|baldrame|sapata|bloco de coroamento/, '01'],
    [/concreto|armacao|aco ca|forma|laje|pilar|viga/, '02'],
    [/alvenaria|bloco ceramico|tijolo|vedacao/, '03'],
    [/eletroduto|tubo|tubulacao|hidraul|esgoto|eletric|cabo/, '04'],
    [/chapisco|reboco|emboco|massa unica|gesso/, '05'],
    [/contrapiso|porcelanato|piso|ceramic|revestimento ceramico/, '06'],
    [/pintura|textura|latex|impermeabiliza|fachada/, '07'],
    [/limpeza|vistoria/, '08'],
  ]
  return rules.find(([re]) => re.test(n))?.[1] ?? '09'
}

export function lineFromCatalog(item: SinapiItem, id: string, quantity = item.sampleQuantity, team = 6, location = ''): BudgetLine {
  return {
    id,
    code: item.code,
    description: item.description,
    location,
    unit: item.unit,
    quantity,
    rup: item.rup,
    unitCost: item.unitCost,
    professional: item.professional,
    helperRatio: item.helperRatio,
    team,
    group: item.group,
  }
}

/** Número em formato brasileiro ("1.850,5") ou internacional ("1850.5"). */
export function parseNumberBR(raw: string | undefined): number {
  if (!raw) return NaN
  const s = raw.trim().replace(/^R\$\s*/i, '').replace(/\s/g, '')
  if (!s) return NaN
  // "1.850,5" e "1.280" (milhar pt-BR) -> 1850.5 / 1280; "0.82" segue como decimal
  const thousandsOnly = /^\d{1,3}(\.\d{3})+$/.test(s)
  const normalized = s.includes(',') || thousandsOnly ? s.replace(/\./g, '').replace(',', '.') : s
  return Number(normalized)
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
      } else quoted = !quoted
    } else if (c === sep && !quoted) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out.map((v) => v.trim())
}

const HEADER_ALIASES: Record<string, string[]> = {
  code: ['codigo', 'cod', 'sinapi', 'codigo sinapi'],
  description: ['descricao', 'servico', 'item', 'descricao do servico'],
  unit: ['unidade', 'un', 'und', 'unid'],
  quantity: ['quantidade', 'qtd', 'quant', 'qtde'],
  rup: ['rup', 'coeficiente', 'hh', 'hh/un', 'produtividade', 'coef'],
  unitCost: ['custo unitario', 'preco unitario', 'custo', 'preco', 'valor unitario', 'pu'],
  professional: ['profissional', 'oficial', 'funcao'],
  location: ['local', 'frente', 'pavimento'],
  team: ['equipe', 'oficiais'],
}

export interface CsvImportResult {
  lines: Omit<BudgetLine, 'id'>[]
  errors: string[]
}

/**
 * Lê planilha orçamentária em CSV (separador ; ou ,). Colunas mínimas: código, descrição, unidade, quantidade.
 * RUP, custo e profissional são completados pelo catálogo quando ausentes.
 */
export function parseBudgetCsv(text: string, catalog: SinapiItem[] = SINAPI_CATALOG, defaultTeam = 6): CsvImportResult {
  const rows = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((r) => r.trim())
  if (!rows.length) return { lines: [], errors: ['Arquivo vazio.'] }
  const sep = (rows[0].match(/;/g)?.length ?? 0) >= (rows[0].match(/,/g)?.length ?? 0) ? ';' : ','
  const header = splitCsvLine(rows[0], sep).map((h) => normalizeText(h))
  const col: Partial<Record<keyof typeof HEADER_ALIASES, number>> = {}
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex((h) => aliases.includes(h))
    if (idx >= 0) col[key as keyof typeof HEADER_ALIASES] = idx
  }
  const hasHeader = col.description !== undefined || col.quantity !== undefined
  if (!hasHeader) Object.assign(col, { code: 0, description: 1, unit: 2, quantity: 3, rup: 4, unitCost: 5 })
  if (col.description === undefined || col.quantity === undefined) {
    return { lines: [], errors: ['Cabeçalho precisa ter ao menos as colunas "descrição" e "quantidade".'] }
  }

  const lines: Omit<BudgetLine, 'id'>[] = []
  const errors: string[] = []
  const body = hasHeader ? rows.slice(1) : rows
  body.slice(0, MAX_BUDGET_LINES).forEach((row, i) => {
    const cells = splitCsvLine(row, sep)
    const get = (k: keyof typeof HEADER_ALIASES) => (col[k] !== undefined ? cells[col[k]!] : undefined)
    const lineNo = i + (hasHeader ? 2 : 1)
    const code = (get('code') ?? '').replace(/\D/g, '').slice(0, 12)
    const item = catalog.find((c) => c.code === code)
    const description = (get('description') || item?.description || '').slice(0, 160)
    const quantity = parseNumberBR(get('quantity'))
    const rup = parseNumberBR(get('rup'))
    const unitCost = parseNumberBR(get('unitCost'))
    const team = parseNumberBR(get('team'))
    if (!description) return void errors.push(`Linha ${lineNo}: sem descrição.`)
    if (!Number.isFinite(quantity) || quantity <= 0) return void errors.push(`Linha ${lineNo}: quantidade inválida.`)
    const finalRup = Number.isFinite(rup) && rup > 0 ? rup : item?.rup
    if (!finalRup) return void errors.push(`Linha ${lineNo}: RUP ausente e código ${code || '—'} fora do catálogo.`)
    lines.push({
      code: code || item?.code || '',
      description,
      location: (get('location') ?? '').slice(0, 60),
      unit: (get('unit') || item?.unit || 'un').slice(0, 8),
      quantity,
      rup: finalRup,
      unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : (item?.unitCost ?? 0),
      professional: (get('professional') || item?.professional || 'Pedreiro').slice(0, 40),
      helperRatio: item?.helperRatio ?? 0.5,
      team: Number.isFinite(team) && team >= 1 ? Math.round(team) : defaultTeam,
      group: item?.group ?? inferGroup(description),
    })
  })
  if (body.length > MAX_BUDGET_LINES) errors.push(`Somente as primeiras ${MAX_BUDGET_LINES} linhas foram lidas.`)
  return { lines, errors }
}

export const BUDGET_CSV_TEMPLATE =
  'codigo;descricao;local;unidade;quantidade;rup;custo_unitario;equipe\n' +
  '103332;Alvenaria de vedação bloco cerâmico 14x19x29 cm;Áreas comuns (térreo);m²;640;0,82;98,50;4\n' +
  '87529;Massa única para recebimento de pintura, e=2 cm;Áreas comuns (térreo);m²;1280;0,62;38,90;4\n' +
  '87263;Revestimento porcelanato 80x80 cm, argamassa AC-III;Hall e circulações;m²;520;0,70;189,00;3\n'
