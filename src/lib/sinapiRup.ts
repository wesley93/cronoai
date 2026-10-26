// RUP por função e equipe a partir do Analítico do SINAPI (ciclo 00006).
// ATENÇÃO: este módulo NÃO tem import de runtime (só `import type`): o script `scripts/sinapi` o importa direto no Node,
// pelo type stripping, como fonte única da regra de mão de obra (D-2). Não adicione `import` de valor aqui.
import type { ResourceAssignment } from '@/types/domain'
import type { EquipeProporcional, FuncaoMaoDeObra } from '@/types/sinapi'

/**
 * A proporção entre os coeficientes de duas funções (cᶠ ÷ cᵖ) é arredondada a 2 casas ANTES do teto da equipe (D-6, EO-2 revisada).
 * Os coeficientes do Analítico têm poucas casas: 1,279 ÷ 0,639 = 2,0016, e o teto sem arredondar acrescentaria 1 profissional por
 * ruído (2 pedreiros → 5 serventes em vez de 4). Diferente de uma folga absoluta, o arredondamento vale para qualquer tamanho de
 * equipe (32 pedreiros → 64 serventes, não 65). OPINIÃO do orquestrador, a validar com Orçamento/Custos.
 */
export const CASAS_PROPORCAO_EQUIPE = 2

/**
 * Proporção arredondada a `CASAS_PROPORCAO_EQUIPE` casas (meio para cima). O produto em ponto flutuante é limpo com 12 algarismos
 * significativos antes do `Math.round`: 0,145 × 100 = 14,499999999999998 (daria 0,14) e 1,005 × 100 = 100,49999999999999 (daria 1,00).
 */
export function arredondarProporcao(proporcao: number): number {
  const f = 10 ** CASAS_PROPORCAO_EQUIPE
  return Math.round(Number((proporcao * f).toPrecision(12))) / f
}

const SUFIXO_MAO_DE_OBRA = /\s*COM ENCARGOS COMPLEMENTARES\s*$/i

/** Item do Analítico como o leitor o entrega (uma linha abaixo da composição). */
export interface ItemAnalitico {
  tipoItem: string
  codigo: string
  descricao: string
  unidade: string
  coeficiente: number
}

/** Maiúsculas sem acento e com espaços normalizados, para comparar nomes de função. */
function chave(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase()
}

/** Mão de obra (D-5): `COMPOSICAO` em horas cuja descrição termina em "COM ENCARGOS COMPLEMENTARES". `INSUMO` em H (seguro, EPI) não é função. */
export function ehItemMaoDeObra(item: Pick<ItemAnalitico, 'tipoItem' | 'unidade' | 'descricao'>): boolean {
  return chave(item.tipoItem) === 'COMPOSICAO' && chave(item.unidade) === 'H' && SUFIXO_MAO_DE_OBRA.test(item.descricao)
}

/** Função = descrição sem o sufixo ("PEDREIRO COM ENCARGOS COMPLEMENTARES" → "PEDREIRO"). */
export function nomeDaFuncao(descricao: string): string {
  return descricao.replace(SUFIXO_MAO_DE_OBRA, '').trim()
}

/**
 * Funções de mão de obra de uma composição, na ordem do Analítico. RUP da função = coeficiente publicado, sem arredondar.
 * Mesmo código repetido: soma os coeficientes (1 função, 1 linha). Só o 1º nível: subcomposições não são explodidas.
 */
export function rupPorFuncao(itens: readonly ItemAnalitico[]): FuncaoMaoDeObra[] {
  const out: FuncaoMaoDeObra[] = []
  for (const item of itens) {
    if (!ehItemMaoDeObra(item) || !(item.coeficiente > 0)) continue
    const existente = out.find((f) => f.codigo === item.codigo)
    if (existente) existente.coeficiente += item.coeficiente
    else out.push({ codigo: item.codigo, funcao: nomeDaFuncao(item.descricao), coeficiente: item.coeficiente })
  }
  return out
}

/** Apoio: servente, auxiliar e ajudante. Não é "o oficial" da composição. */
export function ehFuncaoDeApoio(funcao: string): boolean {
  const c = chave(funcao)
  return c === 'SERVENTE' || c.startsWith('SERVENTE ') || c.startsWith('AUXILIAR ') || c.startsWith('AJUDANTE ')
}

/** Supervisão (administração local): engenheiro e encarregado. Fora da função principal e dos recursos (EO-1). */
export function ehFuncaoDeSupervisao(funcao: string): boolean {
  const c = chave(funcao)
  return c === 'ENGENHEIRO' || c.startsWith('ENGENHEIRO ') || c === 'ENCARREGADO' || c.startsWith('ENCARREGADO ')
}

function maior(funcoes: readonly FuncaoMaoDeObra[]): FuncaoMaoDeObra | undefined {
  // Empate: a primeira na ordem do Analítico (só troca quando é estritamente maior)
  return funcoes.reduce<FuncaoMaoDeObra | undefined>((m, f) => (!m || f.coeficiente > m.coeficiente ? f : m), undefined)
}

/**
 * Função principal (D-6): maior coeficiente entre os oficiais (nem apoio nem supervisão); sem oficial, a maior de apoio;
 * só supervisão, a maior de supervisão. Empate: a primeira na ordem do Analítico.
 */
export function funcaoPrincipal(maoDeObra: readonly FuncaoMaoDeObra[]): FuncaoMaoDeObra | undefined {
  return (
    maior(maoDeObra.filter((f) => !ehFuncaoDeApoio(f.funcao) && !ehFuncaoDeSupervisao(f.funcao))) ??
    maior(maoDeObra.filter((f) => ehFuncaoDeApoio(f.funcao))) ??
    maior(maoDeObra)
  )
}

/** Função SINAPI → `ResourceKind` quando há equivalente (D-16, D-22): os rótulos são exatamente as chaves de `premissas.taxas`. */
const ROTULOS: Record<string, string> = {
  PEDREIRO: 'Pedreiro',
  SERVENTE: 'Servente',
  'CARPINTEIRO DE FORMAS': 'Carpinteiro',
  ARMADOR: 'Armador',
  ELETRICISTA: 'Eletricista',
  'ENCANADOR OU BOMBEIRO HIDRAULICO': 'Encanador',
  GESSEIRO: 'Gesseiro',
  'AZULEJISTA OU LADRILHEIRO': 'Azulejista',
  PINTOR: 'Pintor',
  'OPERADOR DE MAQUINAS E EQUIPAMENTOS': 'Operador de equipamento',
}

/** Rótulo do recurso: o `ResourceKind` equivalente ou o nome da função com a 1ª letra maiúscula ("Auxiliar de encanador ou bombeiro hidráulico"). */
export function rotuloFuncao(funcao: string): string {
  const mapeado = ROTULOS[chave(funcao)]
  if (mapeado) return mapeado
  const t = funcao.trim().replace(/\s+/g, ' ').toLowerCase()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export interface EquipePorFuncao {
  /** Função principal (dimensiona a duração). */
  principal: FuncaoMaoDeObra
  /** Demais funções exceto supervisão, em proporção da principal (cᶠ ÷ cᵖ). */
  proporcoes: EquipeProporcional[]
  /** Supervisão: não vira recurso, vai às notas como administração local. */
  supervisao: FuncaoMaoDeObra[]
}

/** Separa a mão de obra da composição em principal, proporções e supervisão. Sem mão de obra: `undefined` (a RUP é informada à mão). */
export function equipeDaComposicao(maoDeObra: readonly FuncaoMaoDeObra[]): EquipePorFuncao | undefined {
  const principal = funcaoPrincipal(maoDeObra)
  if (!principal) return undefined
  const proporcoes: EquipeProporcional[] = []
  const supervisao: FuncaoMaoDeObra[] = []
  for (const f of maoDeObra) {
    if (f === principal) continue
    if (ehFuncaoDeSupervisao(f.funcao)) supervisao.push(f)
    else proporcoes.push({ recurso: rotuloFuncao(f.funcao), proporcao: f.coeficiente / principal.coeficiente })
  }
  return { principal, proporcoes, supervisao }
}

/**
 * Recursos da equipe: a principal com `equipe` profissionais e cada outra função com `max(1, ⌈equipe × round2(cᶠ ÷ cᵖ) − 1e-9⌉)`
 * (o 1e-9 só absorve o ruído do ponto flutuante). Rótulos repetidos somam as unidades.
 */
export function recursosDaEquipe(principal: string, equipe: number, proporcoes: readonly EquipeProporcional[]): ResourceAssignment[] {
  const n = Math.max(1, equipe)
  const out: ResourceAssignment[] = [{ resource: principal, units: n }]
  for (const p of proporcoes) {
    const units = Math.max(1, Math.ceil(n * arredondarProporcao(p.proporcao) - 1e-9))
    const igual = out.find((r) => r.resource === p.recurso)
    if (igual) igual.units += units
    else out.push({ resource: p.recurso, units })
  }
  return out
}

export interface CustoPorFuncao {
  funcao: string
  rotulo: string
  /** R$ = quantidade × coeficiente × taxa horária. */
  custo: number
  /** A função não está nas taxas da obra: usa a taxa "não cadastrada" (ilustrativa). */
  foraDasTaxas: boolean
}

/**
 * Custo de mão de obra estimado por função (D-21, ilustrativo): Σ quantidade × cᶠ × taxa horária do rótulo, supervisão incluída.
 * `taxaDe` e `cadastrada` vêm das premissas da obra (`taxaHora`), que este módulo não importa.
 */
export function custoMaoDeObraPorFuncao(
  quantidade: number,
  maoDeObra: readonly FuncaoMaoDeObra[],
  taxaDe: (rotulo: string) => number,
  cadastrada: (rotulo: string) => boolean,
): { total: number; funcoes: CustoPorFuncao[] } {
  const q = Math.max(0, quantidade)
  const funcoes = maoDeObra.map((f): CustoPorFuncao => {
    const rotulo = rotuloFuncao(f.funcao)
    return { funcao: f.funcao, rotulo, custo: q * f.coeficiente * taxaDe(rotulo), foraDasTaxas: !cadastrada(rotulo) }
  })
  return { total: funcoes.reduce((s, f) => s + f.custo, 0), funcoes }
}

const numeroBR = (v: number, casas = 7) => v.toLocaleString('pt-BR', { maximumFractionDigits: casas })

/** Horas de supervisão (administração local) da quantidade: `quantidade × coeficiente` por função, com o rótulo da função. */
export function horasDeSupervisao(quantidade: number, supervisao: readonly FuncaoMaoDeObra[]): { rotulo: string; horas: number }[] {
  return supervisao.map((f) => ({ rotulo: rotuloFuncao(f.funcao), horas: Math.max(0, quantidade) * f.coeficiente }))
}

/**
 * O que o usuário informou no lugar do publicado: SÓ os campos que ele mudou (os ausentes valem o publicado).
 * Sem mão de obra publicada (composição sem equipe), a RUP e o profissional são, por natureza, informados.
 */
export interface ValoresInformados {
  rup?: number
  custo?: number
  profissional?: string
  /** Custo publicado no recorte, citado só como referência junto do custo informado. */
  custoPublicado?: number
}

export interface DadosNotasSinapi {
  codigo: string
  quantidade: number
  unidade: string
  /** "SP 09/2026 não desonerado" (com " · alterado" quando o usuário mudou valores); ausente = catálogo ilustrativo. */
  fonte?: string
  maoDeObra?: readonly FuncaoMaoDeObra[]
  recursos: readonly ResourceAssignment[]
  /** Campos mudados pelo usuário: as notas os citam como "informados pelo usuário", com o publicado ao lado como referência. */
  informado?: ValoresInformados
}

/**
 * Notas da tarefa gerada (D-23): fonte, principal e coeficiente, equipe, supervisão não alocada e o aviso das subcomposições.
 * Só o campo que o usuário mudou (RUP, custo ou função principal) é citado como "informado pelo usuário", com o publicado como referência;
 * o que não mudou segue como publicado. A equipe citada é sempre a efetiva.
 */
export function notasDaTarefaSinapi(d: DadosNotasSinapi): string {
  const base = `Gerado pelo CronoAI a partir do SINAPI ${d.codigo}${d.fonte ? ` (${d.fonte})` : ''}: ${d.quantidade.toLocaleString('pt-BR')} ${d.unidade}.`
  if (!d.fonte || (!d.maoDeObra?.length && !d.informado)) return base
  const eq = d.maoDeObra?.length ? equipeDaComposicao(d.maoDeObra) : undefined
  const i = d.informado
  const partes = [base]
  if (!i) {
    if (eq) partes.push(`Função principal ${eq.principal.funcao}, RUP ${numeroBR(eq.principal.coeficiente)} h/${d.unidade}.`)
  } else {
    const publicada = (texto: string | undefined) => (texto ? `; publicad${texto}` : '')
    const funcao = i.profissional ?? eq?.principal.funcao
    if (funcao) partes.push(`Função principal ${funcao}${i.profissional !== undefined ? ` (informada pelo usuário${publicada(eq ? `a ${eq.principal.funcao}` : undefined)})` : ''}.`)
    const rup = i.rup ?? eq?.principal.coeficiente
    if (rup !== undefined) partes.push(`RUP ${numeroBR(rup)} h/${d.unidade}${i.rup !== undefined ? ` (informada pelo usuário${publicada(eq ? `a ${numeroBR(eq.principal.coeficiente)}` : undefined)})` : ''}.`)
    if (i.custo !== undefined) partes.push(`Custo R$ ${numeroBR(i.custo, 2)}/${d.unidade} (informado pelo usuário${publicada(i.custoPublicado !== undefined ? `o R$ ${numeroBR(i.custoPublicado, 2)}` : undefined)}).`)
  }
  partes.push(`Equipe: ${d.recursos.filter((r) => r.units > 0).map((r) => `${r.resource} ${r.units}`).join(' + ')}.`)
  if (eq?.supervisao.length) {
    const s = horasDeSupervisao(d.quantidade, eq.supervisao).map((h) => `${h.rotulo}: ${numeroBR(h.horas, 2)} h, não alocado`).join('; ')
    partes.push(`Supervisão (administração local): ${s}.`)
  }
  partes.push('HH de subcomposições (ex.: preparo de argamassa) não incluída.')
  return partes.join(' ')
}
