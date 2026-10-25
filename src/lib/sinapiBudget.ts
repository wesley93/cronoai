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

/**
 * Tetos dos valores digitados (CSV, célula e calculadora): sem eles "1e308" vira BAC infinito. Decisão do ciclo 00006: quantidade até 1e9;
 * custo unitário até R$ 10.000.000 (o mesmo teto do recorte; o maior publicado é R$ 228.977,20); RUP até 10.000 HH/un (o mesmo do recorte;
 * o maior publicado é 345,33); equipe até 1.000 profissionais. Quantidade × custo no teto dá 1e16, finito.
 */
export const LIMITES_LINHA = { quantity: 1e9, unitCost: 1e7, rup: 1e4, team: 1000 } as const
const ROTULO_CAMPO = { quantity: 'quantidade', unitCost: 'custo unitário', rup: 'RUP', team: 'equipe' } as const
export type CampoLimitado = keyof typeof LIMITES_LINHA

/** Mensagem se o valor não é um número finito acima de zero (custo pode ser 0) ou passa do teto; `undefined` se vale. */
export function erroDeValorDaLinha(campo: CampoLimitado, v: number): string | undefined {
  if (!Number.isFinite(v) || v < 0 || (v === 0 && campo !== 'unitCost')) return `${ROTULO_CAMPO[campo]} inválida`
  if (v > LIMITES_LINHA[campo]) return `${ROTULO_CAMPO[campo]} acima do limite de ${LIMITES_LINHA[campo].toLocaleString('pt-BR')}`
  return undefined
}

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
  // Linhas em branco e comentários ("# …", como as do modelo baixável) são ignorados; "Linha N" nas mensagens é a linha do ARQUIVO
  const numeradas = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((texto, i) => ({ texto, n: i + 1 }))
    .filter((r) => r.texto.trim() && !r.texto.trim().startsWith('#'))
  const rows = numeradas.map((r) => r.texto)
  if (!rows.length) return { lines: [], errors: ['Arquivo vazio.'] }
  const sep = (rows[0].match(/;/g)?.length ?? 0) >= (rows[0].match(/,/g)?.length ?? 0) ? ';' : ','
  // O modelo baixável usa "custo_unitario": o sublinhado vale como espaço, para casar com o apelido "custo unitario"
  const header = splitCsvLine(rows[0], sep).map((h) => normalizeText(h).replace(/_/g, ' '))
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
    const lineNo = numeradas[i + (hasHeader ? 1 : 0)]!.n
    const code = (get('code') ?? '').replace(/\D/g, '').slice(0, 12)
    const item = catalog.find((c) => c.code === code)
    const description = (get('description') || item?.description || '').slice(0, 160)
    const quantity = parseNumberBR(get('quantity'))
    const rup = parseNumberBR(get('rup'))
    const unitCost = parseNumberBR(get('unitCost'))
    const team = parseNumberBR(get('team'))
    if (!description) return void errors.push(`Linha ${lineNo}: sem descrição.`)
    if (!Number.isFinite(quantity) || quantity <= 0) return void errors.push(`Linha ${lineNo}: quantidade inválida.`)
    // Teto de cada valor digitado: "1e999" (infinito) e valores acima do teto recusam a linha, com o motivo (nunca viram "ausente")
    const acima = (campo: CampoLimitado, v: number) => (v > LIMITES_LINHA[campo] ? erroDeValorDaLinha(campo, v) : undefined)
    const erroDeLimite = acima('quantity', quantity) ?? acima('rup', rup) ?? acima('unitCost', unitCost) ?? acima('team', Math.round(team))
    if (erroDeLimite) return void errors.push(`Linha ${lineNo}: ${erroDeLimite}.`)
    const finalRup = Number.isFinite(rup) && rup > 0 ? rup : item?.rup
    if (!finalRup) {
      // Composição do recorte sem mão de obra: tem custo, mas a RUP precisa vir da planilha
      if (item?.fonte) return void errors.push(`Linha ${lineNo}: composição sem mão de obra no recorte (código ${code}): informe a RUP na planilha.`)
      return void errors.push(`Linha ${lineNo}: RUP ausente e código ${code || '—'} fora do catálogo.`)
    }
    const custoFinal = Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : (item?.unitCost ?? 0)
    const profissionalFinal = (get('professional') || item?.professional || 'Pedreiro').slice(0, 40)
    // Do recorte, mas com RUP, custo ou profissional diferentes do publicado: a linha é "alterada" (fonte "· alterado").
    // RUP e custo mantêm a equipe por função (a proporção publicada); só trocar o profissional a derruba (ver `equipe` abaixo)
    const alterada = !!item?.fonte && (finalRup !== item.rup || custoFinal !== item.unitCost || profissionalFinal !== item.professional)
    const profissionalTrocado = !!item?.fonte && profissionalFinal !== item.professional
    lines.push({
      code: code || item?.code || '',
      description,
      location: (get('location') ?? '').slice(0, 60),
      unit: (get('unit') || item?.unit || 'un').slice(0, 8),
      quantity,
      rup: finalRup,
      unitCost: custoFinal,
      professional: profissionalFinal,
      helperRatio: profissionalTrocado ? HELPER_RATIO_PADRAO : (item?.helperRatio ?? HELPER_RATIO_PADRAO),
      team: Number.isFinite(team) && team >= 1 ? Math.round(team) : defaultTeam,
      group: item?.group ?? inferGroup(description),
      // Equipe por função enquanto o profissional é o publicado (mesmo com RUP ou custo alterados); profissional trocado usa o servente por oficial comum
      ...(item?.equipe && !profissionalTrocado ? { equipe: item.equipe } : {}),
      ...(item?.fonte ? { fonte: alterada ? marcarFonteAlterada(item.fonte) : item.fonte } : {}),
    })
  })
  if (body.length > MAX_BUDGET_LINES) errors.push(`Somente as primeiras ${MAX_BUDGET_LINES} linhas foram lidas.`)
  return { lines, errors }
}

/** Explicação que acompanha o modelo (linhas "#" são ignoradas na importação). */
export const AVISO_MODELO_CSV =
  'Deixe "rup" e "custo_unitario" VAZIOS para valer o custo e a RUP do recorte SINAPI da obra (ou do catálogo ilustrativo, sem recorte). ' +
  'Um valor preenchido substitui o publicado e a linha sai marcada como "alterado".'

export const BUDGET_CSV_TEMPLATE =
  `# ${AVISO_MODELO_CSV}\n` +
  '# Linhas que começam com # são ignoradas na importação.\n' +
  'codigo;descricao;local;unidade;quantidade;rup;custo_unitario;equipe\n' +
  '103332;Alvenaria de vedação bloco cerâmico 14x19x29 cm;Áreas comuns (térreo);m²;640;;;4\n' +
  '87529;Massa única para recebimento de pintura, e=2 cm;Áreas comuns (térreo);m²;1280;;;4\n' +
  '87263;Revestimento porcelanato 80x80 cm, argamassa AC-III;Hall e circulações;m²;520;;;3\n'
