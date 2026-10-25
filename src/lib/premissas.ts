// Premissas da obra versionadas (ciclo 00005, SPEC-03): custo indireto, taxas por função, fator de congestionamento,
// mobilização, adicional de hora extra, contingência de retrabalho e margem da DLP. Funções puras; sem store nem DOM.
// Todos os valores padrão são ILUSTRATIVOS (Inviolável 7) até a validação com Orçamento/Custos e RH/Jurídico.
import {
  CHAVES_PREMISSA,
  ORIGENS_PREMISSA,
  RESOURCE_KINDS,
  type ChavePremissa,
  type OrigemPremissa,
  type PremissasObra,
  type TaxaFuncao,
  type VersaoPremissas,
} from '@/types/domain'
import { parseISO, toISO } from './calendar'
import type { CalendarioCompilado } from './calendarioTrabalho'

export const MAX_TAXAS = 100
export const MAX_FUNCAO = 60
export const MAX_REFERENCIA = 120
export const MAX_MOTIVO = 200
const MAX_VALOR = 1e9

export const ROTULO_ORIGEM_PREMISSA: Record<OrigemPremissa, string> = {
  ilustrativa: 'Ilustrativa (sem validação)',
  'nao-documentada': 'Valor anterior, sem documentação',
  sinapi: 'SINAPI',
  'acordo-coletivo': 'Acordo ou convenção coletiva',
  'proposta-empreiteiro': 'Proposta de empreiteiro',
  'orcamento-obra': 'Orçamento da obra',
  outra: 'Outra fonte',
}

export const ROTULO_PREMISSA: Record<ChavePremissa, string> = {
  custoIndiretoDiario: 'custo indireto diário',
  encargosSociaisPct: 'encargos sociais',
  taxaFuncaoNaoCadastrada: 'taxa da função não cadastrada',
  perdaCongestionamentoPct: 'perda por congestionamento',
  mobilizacaoPorProfissional: 'mobilização por profissional',
  adicionalHoraExtraPct: 'adicional de hora extra',
  contingenciaRetrabalhoPct: 'contingência de retrabalho',
  margemDlpDias: 'margem da DLP',
}

/** Taxas horárias do exemplo (R$/h, com encargos): ilustrativas, não correspondem a nenhuma tabela. */
const TAXAS_PADRAO: Record<(typeof RESOURCE_KINDS)[number], number> = {
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

/** Premissas padrão (versão 1 de uma obra nova): os valores que eram constantes no código antes do ciclo 00005. */
export function premissasPadrao(): PremissasObra {
  const origens: PremissasObra['origens'] = {}
  for (const chave of CHAVES_PREMISSA) if (chave !== 'encargosSociaisPct') origens[chave] = { origem: 'ilustrativa' }
  return {
    custoIndiretoDiario: 9850, // canteiro, equipe técnica, equipamentos (R$/dia útil)
    taxas: RESOURCE_KINDS.map((funcao): TaxaFuncao => ({ funcao, valorHora: TAXAS_PADRAO[funcao], incluiEncargos: true, origem: 'ilustrativa' })),
    taxaFuncaoNaoCadastrada: 30, // R$/h
    perdaCongestionamentoPct: 5, // 1 + 5/100 = 1,05
    mobilizacaoPorProfissional: 1200, // integração, EPI, exames (R$/profissional)
    adicionalHoraExtraPct: 50, // validar convenção coletiva com RH/Jurídico
    contingenciaRetrabalhoPct: 4, // % do BAC da sucessora no paralelismo
    margemDlpDias: 3, // dias corridos
    origens,
  }
}

/**
 * Versão vigente na data: a de maior número com vigência ≤ data. Data anterior a todas as versões: a de menor vigência
 * (a v1 vale desde o início da obra). Lista vazia: `undefined`.
 */
export function versaoVigente(versoes: readonly VersaoPremissas[], data: string): VersaoPremissas | undefined {
  let vigente: VersaoPremissas | undefined
  for (const v of versoes) if (v.vigencia <= data && (!vigente || v.versao > vigente.versao)) vigente = v
  if (vigente) return vigente
  return versoes.reduce<VersaoPremissas | undefined>((menor, v) => (!menor || v.vigencia < menor.vigencia || (v.vigencia === menor.vigencia && v.versao < menor.versao) ? v : menor), undefined)
}

const dataBR = (iso: string) => iso.split('-').reverse().join('/')

/** "Premissas v3 — vigência 01/11/2026". */
export function rotuloVersao(v: Pick<VersaoPremissas, 'versao' | 'vigencia'>): string {
  return `Premissas v${v.versao} — vigência ${dataBR(v.vigencia)}`
}

/** Taxa efetiva em R$/h: `valorHora × (1 + encargos/100)` quando a taxa não inclui encargos (e eles foram informados). */
export function taxaEfetiva(taxa: TaxaFuncao, encargosSociaisPct?: number): number {
  return taxa.incluiEncargos || encargosSociaisPct === undefined ? taxa.valorHora : taxa.valorHora * (1 + encargosSociaisPct / 100)
}

/** Taxa horária da função (R$/h); função fora das taxas usa `taxaFuncaoNaoCadastrada`. */
export function taxaHora(premissas: PremissasObra, funcao: string): number {
  const t = premissas.taxas.find((x) => x.funcao === funcao)
  return t ? taxaEfetiva(t, premissas.encargosSociaisPct) : premissas.taxaFuncaoNaoCadastrada
}

export type ResultadoConversao = { ok: true; valor: number } | { ok: false; erro: string }

/**
 * Indireto mensal → diário (gate P1 = a): `diário = mensal × 12 ÷ dias úteis do calendário padrão no ano da vigência`.
 * Proposta a validar com Orçamento/Custos. Sem dia útil no ano ou valor inválido: recusa (nunca `Infinity`).
 */
export function custoIndiretoDiarioDeMensal(mensal: number, diasUteisAno: number): ResultadoConversao {
  if (!Number.isFinite(mensal) || mensal < 0 || mensal > MAX_VALOR) return { ok: false, erro: 'Informe um custo indireto mensal válido.' }
  if (!Number.isInteger(diasUteisAno) || diasUteisAno <= 0) return { ok: false, erro: 'O calendário padrão não tem dia útil nesse ano; não é possível converter o custo mensal.' }
  return { ok: true, valor: (mensal * 12) / diasUteisAno }
}

/** Dias úteis (com tempo útil) do calendário no ano; passe o calendário sem as exceções úteis de hora extra. */
export function diasUteisNoAno(cal: CalendarioCompilado, ano: number): number {
  const fim = Date.UTC(ano, 11, 31)
  let n = 0
  for (let d = Date.UTC(ano, 0, 1); d <= fim; d += 86_400_000) if (cal.dataUtil(toISO(new Date(d)))) n++
  return n
}

const eObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const eNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Data ISO `yyyy-mm-dd` que existe no calendário. */
export function dataIsoExiste(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  return toISO(parseISO(v)) === v
}

const FAIXAS: { chave: ChavePremissa; rotulo: string; min: number; max: number; inteiro?: boolean }[] = [
  { chave: 'custoIndiretoDiario', rotulo: 'O custo indireto diário', min: 0, max: MAX_VALOR },
  { chave: 'taxaFuncaoNaoCadastrada', rotulo: 'A taxa da função não cadastrada', min: 0.01, max: MAX_VALOR },
  { chave: 'perdaCongestionamentoPct', rotulo: 'A perda por congestionamento', min: 0, max: 100 },
  { chave: 'mobilizacaoPorProfissional', rotulo: 'A mobilização por profissional', min: 0, max: MAX_VALOR },
  { chave: 'adicionalHoraExtraPct', rotulo: 'O adicional de hora extra', min: 0, max: 200 },
  { chave: 'contingenciaRetrabalhoPct', rotulo: 'A contingência de retrabalho', min: 0, max: 100 },
  { chave: 'margemDlpDias', rotulo: 'A margem da DLP', min: 0, max: 30, inteiro: true },
]

const textoOk = (v: unknown, max: number) => typeof v === 'string' && v.length <= max

/** Valida o conjunto de premissas (dado do usuário ou do estado salvo). Lista vazia = válido. */
export function validarPremissas(p: unknown): string[] {
  if (!eObjeto(p)) return ['As premissas estão em formato inválido.']
  const erros: string[] = []
  for (const f of FAIXAS) {
    const v = p[f.chave]
    if (!eNumero(v) || v < f.min || v > f.max || (f.inteiro && !Number.isInteger(v))) {
      erros.push(`${f.rotulo} deve ser ${f.inteiro ? 'um número inteiro' : 'um número'} entre ${f.min} e ${f.max}.`)
    }
  }
  if (p.encargosSociaisPct !== undefined && (!eNumero(p.encargosSociaisPct) || p.encargosSociaisPct < 0 || p.encargosSociaisPct > 300)) {
    erros.push('Os encargos sociais devem ser um percentual entre 0 e 300.')
  }
  if (p.custoIndiretoMensal !== undefined) {
    const m = p.custoIndiretoMensal
    if (!eObjeto(m) || !eNumero(m.valor) || m.valor < 0 || !Number.isInteger(m.diasUteisAno) || (m.diasUteisAno as number) <= 0 || !Number.isInteger(m.ano)) {
      erros.push('A conversão do custo indireto mensal está inválida.')
    }
  }
  if (!Array.isArray(p.taxas)) erros.push('A lista de taxas por função está inválida.')
  else {
    if (p.taxas.length > MAX_TAXAS) erros.push(`No máximo ${MAX_TAXAS} taxas por função.`)
    const vistas = new Set<string>()
    for (const t of p.taxas.slice(0, MAX_TAXAS)) {
      if (!eObjeto(t) || typeof t.funcao !== 'string' || !t.funcao.trim() || t.funcao.length > MAX_FUNCAO) {
        erros.push(`O nome da função deve ter de 1 a ${MAX_FUNCAO} caracteres.`)
        continue
      }
      if (vistas.has(t.funcao)) erros.push(`A função "${t.funcao}" está repetida nas taxas.`)
      vistas.add(t.funcao)
      if (!eNumero(t.valorHora) || t.valorHora <= 0 || t.valorHora > MAX_VALOR) erros.push(`A taxa de "${t.funcao}" deve ser maior que zero.`)
      if (typeof t.incluiEncargos !== 'boolean') erros.push(`Informe se a taxa de "${t.funcao}" inclui encargos.`)
      if (t.incluiEncargos === false && p.encargosSociaisPct === undefined) erros.push('Informe os encargos sociais para usar taxa sem encargos.')
      if (!ORIGENS_PREMISSA.some((o) => o === t.origem)) erros.push(`A origem da taxa de "${t.funcao}" é inválida.`)
      if (t.referencia !== undefined && !textoOk(t.referencia, MAX_REFERENCIA)) erros.push(`A referência da taxa de "${t.funcao}" deve ter no máximo ${MAX_REFERENCIA} caracteres.`)
      if (t.dataReferencia !== undefined && !(typeof t.dataReferencia === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(t.dataReferencia))) {
        erros.push(`A data-base da taxa de "${t.funcao}" deve estar no formato AAAA-MM.`)
      }
    }
  }
  if (!eObjeto(p.origens)) erros.push('As origens das premissas estão inválidas.')
  else {
    for (const [chave, o] of Object.entries(p.origens)) {
      if (!CHAVES_PREMISSA.some((c) => c === chave) || !eObjeto(o) || !ORIGENS_PREMISSA.some((x) => x === o.origem) || (o.referencia !== undefined && !textoOk(o.referencia, MAX_REFERENCIA))) {
        erros.push('As origens das premissas estão inválidas.')
        break
      }
    }
  }
  return erros
}

export interface NovaVersaoPremissas {
  vigencia: string
  motivo: string
  valores: PremissasObra
}

/** Valida uma versão nova: vigência igual ou posterior à da última versão, motivo e valores. */
export function validarNovaVersao(versoes: readonly VersaoPremissas[], nova: NovaVersaoPremissas): string[] {
  const erros: string[] = []
  if (!dataIsoExiste(nova.vigencia)) erros.push('Informe uma data de vigência válida.')
  else {
    const ultima = versoes.reduce<VersaoPremissas | undefined>((a, v) => (!a || v.versao > a.versao ? v : a), undefined)
    if (ultima && nova.vigencia < ultima.vigencia) erros.push(`A vigência deve ser igual ou posterior à da versão ${ultima.versao} (${dataBR(ultima.vigencia)}).`)
  }
  const motivo = nova.motivo.trim()
  if (!motivo) erros.push('Informe o motivo da alteração.')
  else if (motivo.length > MAX_MOTIVO) erros.push(`O motivo deve ter no máximo ${MAX_MOTIVO} caracteres.`)
  erros.push(...validarPremissas(nova.valores))
  return erros
}

/** Valida a lista de versões lida do estado salvo: forma, sequência de números e valores. Lista vazia é inválida. */
export function versoesValidas(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false
  return v.every(
    (x, i) =>
      eObjeto(x) &&
      x.versao === i + 1 &&
      dataIsoExiste(x.vigencia) &&
      typeof x.motivo === 'string' &&
      (x.criadaEm === undefined || typeof x.criadaEm === 'string') &&
      validarPremissas(x.valores).length === 0,
  )
}

/** Linha da memória de cálculo com a versão usada e as premissas ilustrativas (Inviolável 7). */
export function memoriaPremissas(
  versao: Pick<VersaoPremissas, 'versao' | 'vigencia'> | undefined,
  premissas: PremissasObra,
  usadas: ChavePremissa[],
  funcoes: string[] = [],
): string {
  const ilustrativas: string[] = usadas.filter((c) => (premissas.origens[c]?.origem ?? 'ilustrativa') === 'ilustrativa').map((c) => ROTULO_PREMISSA[c])
  if (funcoes.some((f) => (premissas.taxas.find((t) => t.funcao === f)?.origem ?? 'ilustrativa') === 'ilustrativa')) ilustrativas.push('taxas por função')
  const quem = versao ? rotuloVersao(versao) : 'Premissas padrão'
  return ilustrativas.length ? `${quem}. Ilustrativas, sem validação: ${ilustrativas.join(', ')}.` : `${quem}.`
}
