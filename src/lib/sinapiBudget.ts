// Planilha orçamentária SINAPI: leitura de CSV e dimensionamento de cada linha para a EAP.
import type { ResourceAssignment } from '@/types/domain'
import type { EquipeProporcional, ItemCatalogoSinapi } from '@/types/sinapi'
import { SINAPI_CATALOG } from '@/data/sinapiCatalog'
import { durationFromTeam, scheduleDays } from './sinapi'
import { recursosDaEquipe } from './sinapiRup'
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
  /** Demais funções da equipe em proporção da principal (recorte SINAPI). Ausente = `helperRatio` (catálogo ilustrativo). */
  equipe?: EquipeProporcional[]
  /** Fonte do custo e da RUP ("SINAPI SP 09/2026 não desonerado"). Ausente = ilustrativo. */
  fonte?: string
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

/** Duração em dias úteis; `horasPorDia` = minutos por dia da obra ÷ 60 (D-18, parâmetro obrigatório). */
export function lineDuration(l: Pick<BudgetLine, 'quantity' | 'rup' | 'team'>, horasPorDia: number): number {
  return scheduleDays(durationFromTeam(l.quantity, l.rup, Math.max(1, l.team), horasPorDia))
}

/**
 * Recursos da linha. Com `equipe` (recorte): cada função com `max(1, ⌈equipe × round2(proporção)⌉)`.
 * Sem `equipe` (catálogo ilustrativo): a principal e o "Servente" pelo `helperRatio`, com o ceil de sempre (−1e-9).
 */
export function lineResources(l: Pick<BudgetLine, 'professional' | 'team' | 'helperRatio'> & { equipe?: readonly EquipeProporcional[] }): ResourceAssignment[] {
  if (l.equipe) return recursosDaEquipe(l.professional, l.team, l.equipe)
  const helpers = Math.ceil(Math.max(1, l.team) * Math.max(0, l.helperRatio) - 1e-9)
  return [{ resource: l.professional, units: Math.max(1, l.team) }, ...(helpers > 0 ? [{ resource: 'Servente', units: helpers }] : [])]
}

/** Serventes por oficial quando não há equipe por função publicada (o padrão da planilha CSV e da linha alterada). */
export const HELPER_RATIO_PADRAO = 0.5

/** Sufixo da fonte da linha cujo RUP, custo ou profissional o usuário mudou: ela deixa de ser "o publicado". */
export const SUFIXO_FONTE_ALTERADA = ' · alterado'
export const ehFonteAlterada = (fonte: string | undefined): boolean => !!fonte && fonte.endsWith(SUFIXO_FONTE_ALTERADA)
/** Fonte do recorte sem o sufixo de alteração (a que se compara com a fonte do recorte da obra). */
export const fonteBase = (fonte: string): string => (fonte.endsWith(SUFIXO_FONTE_ALTERADA) ? fonte.slice(0, -SUFIXO_FONTE_ALTERADA.length) : fonte)
export const marcarFonteAlterada = (fonte: string): string => (ehFonteAlterada(fonte) ? fonte : fonte + SUFIXO_FONTE_ALTERADA)

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

export function lineFromCatalog(item: ItemCatalogoSinapi, id: string, quantity = item.sampleQuantity ?? 1, team = 6, location = ''): BudgetLine {
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
    ...(item.equipe ? { equipe: item.equipe } : {}),
    ...(item.fonte ? { fonte: item.fonte } : {}),
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
export function parseBudgetCsv(text: string, catalog: readonly ItemCatalogoSinapi[] = SINAPI_CATALOG, defaultTeam = 6): CsvImportResult {
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
    if (!finalRup) {
      // Composição do recorte sem mão de obra: tem custo, mas a RUP precisa vir da planilha
      if (item?.fonte) return void errors.push(`Linha ${lineNo}: composição sem mão de obra no recorte (código ${code}): informe a RUP na planilha.`)
      return void errors.push(`Linha ${lineNo}: RUP ausente e código ${code || '—'} fora do catálogo.`)
    }
    const custoFinal = Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : (item?.unitCost ?? 0)
    const profissionalFinal = (get('professional') || item?.professional || 'Pedreiro').slice(0, 40)
    // Do recorte, mas com RUP, custo ou profissional diferentes do publicado: a linha é "alterada" e não usa mais a equipe proporcional dele
    const alterada = !!item?.fonte && (finalRup !== item.rup || custoFinal !== item.unitCost || profissionalFinal !== item.professional)
    lines.push({
      code: code || item?.code || '',
      description,
      location: (get('location') ?? '').slice(0, 60),
      unit: (get('unit') || item?.unit || 'un').slice(0, 8),
      quantity,
      rup: finalRup,
      unitCost: custoFinal,
      professional: profissionalFinal,
      helperRatio: alterada ? HELPER_RATIO_PADRAO : (item?.helperRatio ?? HELPER_RATIO_PADRAO),
      team: Number.isFinite(team) && team >= 1 ? Math.round(team) : defaultTeam,
      group: item?.group ?? inferGroup(description),
      // Equipe por função só enquanto a linha é o publicado; alterada (RUP, custo ou profissional), usa o servente por oficial comum
      ...(item?.equipe && !alterada ? { equipe: item.equipe } : {}),
      ...(item?.fonte ? { fonte: alterada ? marcarFonteAlterada(item.fonte) : item.fonte } : {}),
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
