// Regras puras da edição de restrições, prazo final e calendário por tarefa (RF-05.3): validação e rótulos para a tela.
import type { CalendarioObra, Restricao, Task } from '@/types/domain'
import { RESTRICOES_COM_DATA } from '@/types/domain'
import { JANELA_ANOS_DATAS, lerDataHora } from './calendarioTrabalho'
import { diffCalendarDays } from './calendar'

/** Tipos que a tela oferece: ASAP é a ausência de restrição, ALAP não tem data, os outros 6 têm. */
export const TIPOS_RESTRICAO = ['ASAP', 'ALAP', ...RESTRICOES_COM_DATA] as const
export type TipoRestricaoTela = (typeof TIPOS_RESTRICAO)[number]

export const ROTULO_RESTRICAO: Record<TipoRestricaoTela, string> = {
  ASAP: 'O mais cedo possível (ASAP)',
  ALAP: 'O mais tarde possível (ALAP)',
  SNET: 'Não iniciar antes de (SNET)',
  SNLT: 'Não iniciar depois de (SNLT)',
  MSO: 'Deve iniciar em (MSO)',
  MFO: 'Deve terminar em (MFO)',
  FNET: 'Não terminar antes de (FNET)',
  FNLT: 'Não terminar depois de (FNLT)',
}

/** O tipo de restrição pede uma data? (ASAP e ALAP não pedem.) */
export const restricaoTemData = (tipo: string): boolean => (RESTRICOES_COM_DATA as readonly string[]).includes(tipo)

const MSG_DATA = 'Informe uma data válida (aaaa-mm-dd, ou aaaa-mm-ddThh:mm com a hora).'

/** Data (ou data e hora) dentro da faixa que o motor aceita: a menos de 45 anos do início da obra. */
function erroDeData(data: string | undefined, inicioDaObra: string): string | undefined {
  if (!data) return MSG_DATA
  const dh = lerDataHora(data)
  if (!dh) return MSG_DATA
  if (Math.abs(diffCalendarDays(inicioDaObra, dh.data)) > JANELA_ANOS_DATAS * 365) {
    return `A data deve estar a menos de ${JANELA_ANOS_DATAS} anos do início da obra.`
  }
  return undefined
}

/** Valida o tipo e a data de uma restrição vinda da tela; devolve as mensagens em português (lista vazia = válida). */
export function validarRestricao(tipo: string, data: string | undefined, inicioDaObra: string): string[] {
  if (!(TIPOS_RESTRICAO as readonly string[]).includes(tipo)) return ['Tipo de restrição desconhecido.']
  if (!restricaoTemData(tipo)) return []
  const erro = erroDeData(data, inicioDaObra)
  return erro ? [erro] : []
}

/** Valida o prazo final; vazio ou `undefined` remove o prazo e é válido. */
export function validarPrazoFinal(data: string | undefined, inicioDaObra: string): string[] {
  if (data === undefined || data === '') return []
  const erro = erroDeData(data, inicioDaObra)
  return erro ? [erro] : []
}

/** O calendário escolhido existe na obra? `undefined` = calendário padrão da obra, sempre válido. */
export function calendarioExiste(calendarios: CalendarioObra[], uid: number | undefined): boolean {
  return uid === undefined || calendarios.some((c) => c.uid === uid)
}

/** Restrição do domínio a partir do que a tela informou (ASAP vira "sem restrição"). Assume entrada já validada. */
export function montarRestricao(tipo: TipoRestricaoTela, data: string | undefined): Restricao | undefined {
  if (tipo === 'ASAP') return undefined
  if (tipo === 'ALAP') return { tipo: 'ALAP' }
  return { tipo, data: data!.length > 16 ? data!.slice(0, 16) : data! }
}

/** Restrição explícita da tarefa (a inferida pelo import não é do arquivo). */
const explicita = (r: Restricao | undefined) => (r && !('inferida' in r && r.inferida) ? r : undefined)

/** A tarefa importada foi alterada no CronoAI depois da importação (duração, % concluído ou restrição diferentes do arquivo)? */
export function alteradaDepoisDaImportacao(t: Task): boolean {
  const a = t.arquivo
  if (!a) return false
  return (
    t.duracaoMin !== a.duracaoMin ||
    t.percentComplete !== a.percentComplete ||
    JSON.stringify(explicita(t.restricao) ?? null) !== JSON.stringify(a.restricao ?? null)
  )
}

/** Quantas tarefas manuais do arquivo foram alteradas no CronoAI (a exportação delas leva as datas calculadas, não as do arquivo). */
export function tarefasManuaisAlteradas(tasks: Task[]): number {
  return tasks.filter((t) => !t.isSummary && t.arquivo?.manual === true && alteradaDepoisDaImportacao(t)).length
}

/** Tipo de restrição de uma tarefa para a tela (ausente = ASAP). */
export const tipoDaRestricao = (r: Restricao | undefined): TipoRestricaoTela => r?.tipo ?? 'ASAP'
