// "De-Para semântico" local: traduz o relato coloquial do canteiro para a linha da EAP.
// Heurística determinística (léxico de obra + pavimento + estado da tarefa), executada no navegador:
// nenhum relato é enviado a serviço externo. Pode ser substituída por um LLM com saída estruturada
// mantendo a mesma interface `AiInterpretation`.
import type { AiInterpretation, DetectedRestriction, MatchCandidate, Task } from '@/types/domain'
import { normalizeText, parseFloorMention } from './wbs'

interface ActivityLexicon {
  key: string
  label: string
  terms: string[]
  taskTerms: string[]
}

const ACTIVITIES: ActivityLexicon[] = [
  { key: 'alvenaria', label: 'Alvenaria', terms: ['tijolo', 'baiano', 'bloco ceramico', 'alvenaria', 'parede', 'levantamos', 'levantar', 'fiada', 'vedacao', 'marcacao', 'turma do bloco'], taskTerms: ['alvenaria'] },
  { key: 'estrutura', label: 'Estrutura', terms: ['laje', 'concretamos', 'concretagem', 'forma', 'ferragem', 'armacao', 'pilar', 'viga', 'escoramento', 'desforma', 'estrutura'], taskTerms: ['estrutura', 'concreto armado'] },
  { key: 'fundacao', label: 'Fundação', terms: ['estaca', 'fundacao', 'coroamento', 'baldrame', 'helice', 'sondagem'], taskTerms: ['estaca', 'baldrame', 'coroamento'] },
  { key: 'eletrica', label: 'Instalações elétricas', terms: ['eletric', 'eletroduto', 'conduite', 'caixinha', '4x2', 'rasgo', 'fiacao', 'quadro de luz'], taskTerms: ['eletric'] },
  { key: 'hidraulica', label: 'Instalações hidrossanitárias', terms: ['hidraul', 'encanamento', 'cano', 'esgoto', 'prumada', 'ramal', 'pvc', 'agua fria', 'encanador'], taskTerms: ['hidrossanit'] },
  { key: 'reboco', label: 'Reboco', terms: ['reboco', 'emboco', 'massa unica', 'chapisco', 'rebocar', 'rebocamos'], taskTerms: ['reboco'] },
  { key: 'gesso', label: 'Gesso', terms: ['gesso', 'gesseiro'], taskTerms: ['gesso'] },
  { key: 'contrapiso', label: 'Contrapiso', terms: ['contrapiso', 'regularizacao de piso', 'nivelamento'], taskTerms: ['contrapiso'] },
  { key: 'porcelanato', label: 'Porcelanato', terms: ['porcelanato', 'piso', 'ceramica', 'assentamento', 'rejunte', 'azulej'], taskTerms: ['porcelanato'] },
  { key: 'pintura', label: 'Pintura', terms: ['pintura', 'tinta', 'massa corrida', 'lixar', 'demao', 'pintor'], taskTerms: ['pintura'] },
  { key: 'fachada', label: 'Fachada', terms: ['fachada', 'balancim', 'textura', 'reboco externo'], taskTerms: ['fachada'] },
  { key: 'limpeza', label: 'Limpeza e entrega', terms: ['limpeza', 'vistoria', 'habite'], taskTerms: ['limpeza'] },
]

const STOPWORDS = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'o', 'a', 'em', 'no', 'na', 'com', 'para', 'pav', 'ao', 'um', 'uns', 'ta', 'tudo', 'que', 'mas'])

function tokens(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(' ')
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  )
}

export function extractPercent(text: string): { value: number; evidence: string } | undefined {
  const n = normalizeText(text)
  const explicit = [...n.matchAll(/(\d{1,3}(?:[.,]\d)?)\s*(?:%|por ?cento)/g)]
  if (explicit.length) {
    const last = explicit[explicit.length - 1]
    const value = Math.min(100, Math.round(Number(last[1].replace(',', '.'))))
    return { value, evidence: last[0] }
  }
  const rules: [RegExp, number][] = [
    [/\b(terminamos|concluimos|finalizamos|acabamos|entregamos|ficou pronto|100 ?% pronto)\b/, 100],
    [/\b(quase tudo|quase pronto|quase terminando|falta pouco|so falta o acabamento)\b/, 90],
    [/\bdois tercos\b/, 67],
    [/\b(metade|meio caminho)\b/, 50],
    [/\bum terco\b/, 33],
    [/\bum quarto\b/, 25],
    [/\b(comecamos|iniciamos|demos inicio|primeira fiada)\b/, 5],
  ]
  for (const [re, value] of rules) {
    const m = n.match(re)
    if (m) return { value, evidence: m[0] }
  }
  return undefined
}

function hoursLost(n: string, around: number): number | undefined {
  const window = n.slice(Math.max(0, around - 60), around + 90)
  const after = window.match(/depois d[ao]s? (\d{1,2}) ?h/)
  if (after) return Math.max(0, 17 - Number(after[1]))
  const range = window.match(/d[ao]s? (\d{1,2}) ?h? (?:as|ate) (\d{1,2}) ?h/)
  if (range) return Math.max(0, Number(range[2]) - Number(range[1]))
  const plain = window.match(/(\d{1,2}) ?(?:h\b|horas?\b)/)
  if (plain) return Number(plain[1])
  if (/dia (todo|inteiro)/.test(window)) return 8
  return undefined
}

const MATERIALS = ['cimento', 'areia', 'bloco', 'tijolo', 'argamassa', 'aco', 'ferro', 'brita', 'cal', 'concreto', 'porcelanato', 'eletroduto', 'gesso', 'tinta']
const EQUIPMENT = ['betoneira', 'grua', 'guincho', 'elevador', 'cremalheira', 'bomba', 'vibrador', 'serra', 'balancim']

export function detectRestrictions(text: string): DetectedRestriction[] {
  const n = normalizeText(text)
  const out: DetectedRestriction[] = []

  const rain = n.match(/chuv|chovendo|choveu|temporal|garoa|tempestade/)
  if (rain) {
    const h = hoursLost(n, rain.index ?? 0) ?? 4
    out.push({ kind: 'clima', label: `Paralisação por chuva (${h}h)`, detail: 'Serviço externo/ao tempo interrompido por condição climática.', lostHours: h })
  }

  const matRe = new RegExp(
    `(?:(${MATERIALS.join('|')})[^.!?]{0,25}(no fim|acabando|acabou|faltando|em falta|zerou|terminando|pouco))|(?:(?:falta de|faltou|sem|acabou o|acabou a)\\s+(${MATERIALS.join('|')}))`,
  )
  const mat = n.match(matRe)
  if (mat) {
    const material = mat[1] ?? mat[3]
    const pretty = material === 'aco' ? 'aço' : material
    out.push({ kind: 'material', label: `Risco de falta de ${pretty}`, detail: `Estoque de ${pretty} no canteiro reportado como crítico — risco de parada da frente.`, material })
  }

  const labor = n.match(/(?:faltou|falta de|faltando|sem)\s+(servente|pedreiro|ajudante|gente|pessoal|eletricista|encanador|armador|carpinteiro)/)
  if (labor) {
    out.push({ kind: 'mao-de-obra', label: `Equipe incompleta (${labor[1]})`, detail: 'Produtividade reduzida por falta de mão de obra na frente.' })
  }

  const eqRe = new RegExp(`(${EQUIPMENT.join('|')})[^.!?]{0,50}(quebr|parad|atras|defeito|manutenc|pifou)`)
  const eq = n.match(eqRe)
  if (eq) {
    const h = hoursLost(n, eq.index ?? 0)
    out.push({
      kind: 'equipamento',
      label: `Equipamento: ${eq[1]}${h ? ` (${h}h parado)` : ''}`,
      detail: `Indisponibilidade de ${eq[1]} impactou a produção do dia.`,
      lostHours: h,
    })
  }

  if (/acidente|machucou|interdi|embargo|sem epi/.test(n)) {
    out.push({ kind: 'seguranca', label: 'Ocorrência de segurança', detail: 'Verificar registro de ocorrência e liberação da frente pelo técnico de segurança.' })
  }
  if (/projeto|interferencia|compatibiliz/.test(n)) {
    out.push({ kind: 'projeto', label: 'Dúvida/interferência de projeto', detail: 'Abrir RFI com a projetista antes de prosseguir.' })
  }
  return out
}

export function interpretReport(text: string, tasks: Task[]): AiInterpretation {
  const n = normalizeText(text)
  const reportTokens = tokens(text)
  const floor = parseFloorMention(text)
  const rangeMatch = n.match(/(\d{1,2})o?\s*(?:ao|a|ate)\s*(\d{1,2})o?/)
  const range = rangeMatch ? ([Number(rangeMatch[1]), Number(rangeMatch[2])] as const) : undefined

  const activityHits = ACTIVITIES.map((a) => ({
    activity: a,
    hits: a.terms.filter((t) => n.includes(t)),
  })).filter((x) => x.hits.length > 0)

  const candidates: MatchCandidate[] = []
  for (const t of tasks.filter((x) => !x.isSummary && x.duracaoMin > 0)) {
    const name = normalizeText(t.name)
    const reasons: string[] = []
    let score = 0

    for (const { activity, hits } of activityHits) {
      if (activity.taskTerms.some((term) => name.includes(term))) {
        score += Math.min(60, hits.length * 25)
        reasons.push(`Jargão "${hits.slice(0, 3).join('", "')}" → ${activity.label}`)
      }
    }
    if (score === 0) continue // sem aderência de atividade, não é candidata

    if (t.floors) {
      const [lo, hi] = t.floors
      if (range && range[0] === lo && range[1] === hi) {
        score += 40
        reasons.push(`Faixa ${range[0]}º ao ${range[1]}º pav. coincide com a tarefa`)
      } else if (floor !== undefined && floor >= lo && floor <= hi) {
        score += lo === hi ? 35 : 22
        reasons.push(`Pavimento ${floor}º citado → tarefa atende ${lo === hi ? `o ${lo}º pav.` : `${lo}º ao ${hi}º pav.`}`)
      } else if (floor !== undefined) {
        score -= 25
      }
    }

    if (t.percentComplete > 0 && t.percentComplete < 100) {
      score += 10
      reasons.push(`Tarefa em andamento no MS Project (${Math.round(t.percentComplete)}%)`)
    } else if (t.percentComplete >= 100) {
      score -= 15
    }

    const nameTokens = tokens(t.name)
    const overlap = [...reportTokens].filter((w) => nameTokens.has(w)).length
    score += Math.min(15, overlap * 5)

    candidates.push({ uid: t.uid, score, confidence: 0, reasons })
  }

  candidates.sort((a, b) => b.score - a.score)
  const top = candidates[0]?.score ?? 0
  const second = candidates[1]?.score ?? 0
  for (const c of candidates) {
    const absolute = 1 - Math.exp(-Math.max(0, c.score) / 28)
    const margin = c === candidates[0] ? (top > 0 ? (top - second) / top : 0) : 0
    c.confidence = Math.max(1, Math.min(99, Math.round(100 * absolute * (0.9 + 0.1 * margin) - (c === candidates[0] ? 0 : 8))))
  }

  const pct = extractPercent(text)
  return {
    candidates: candidates.slice(0, 4),
    best: candidates[0],
    suggestedPercent: pct?.value,
    percentEvidence: pct?.evidence,
    restrictions: detectRestrictions(text),
    floor,
  }
}
