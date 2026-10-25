// Teste de corpus (SÓ LOCAL): caracteriza o import MSPDI com os 134 arquivos do MS Project 2002–2019 do MPXJ.
// O corpus (LGPL-2.1, MPXJ commit 421a11b) fica FORA do git. Os XML são dados não confiáveis: o teste só lê, nunca executa nada deles.
// Como rodar: CRONOAI_REF_DIR=<pasta referencias> npx vitest run src/lib/msProjectXmlParser.corpus.test.ts
// Sem a variável (CI), a suíte inteira é pulada de propósito: não há corpus no repositório (licença; ver plano 00003, P1).
// Os auxiliares moram aqui dentro: um .ts auxiliar em src/lib entraria na cobertura sem execução no CI.
import { lstatSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { addCalendarDays } from './calendar'
import { compilarCalendarios } from './calendarioTrabalho'
import { computeSchedule, optsDaObra } from './cpm'
import type { CalendarioObra, ProjectMeta, Task } from '@/types/domain'
import { MAX_MSPDI_CHARS, buildMspdiXml, parseMspdiXml, validateMspdi } from './msProjectXmlParser'

const REF_DIR = process.env.CRONOAI_REF_DIR
const CORPUS_DIR = REF_DIR ? join(REF_DIR, 'mpxj-mspdi') : ''
const SEM_TAREFA = 'Nenhuma tarefa encontrada no XML.'
const TIMEOUT = 30_000
const LINK_CODE = { FF: '0', FS: '1', SF: '2', SS: '3' } as const

const explicita = (r: Task['restricao']) => (r && !('inferida' in r && r.inferida) ? r : undefined)
type ComCalendarios = { calendarios: { excecoes: { data: string; intervalos: unknown[] }[] }[] }
/** Feriados e dias úteis extras do calendário padrão importado (exceções não úteis e úteis). */
const feriadosDe = (r: ComCalendarios) => r.calendarios[0].excecoes.filter((ex) => ex.intervalos.length === 0).map((ex) => ex.data)
const extrasDe = (r: ComCalendarios) => r.calendarios[0].excecoes.filter((ex) => ex.intervalos.length > 0).map((ex) => ex.data)

// ---------------------------------------------------------------------------
// Auxiliares (varredura, leitura estática do arquivo e relatório)
// ---------------------------------------------------------------------------

/** Só `*.xml` sob a pasta do corpus, pulando `.git` e links simbólicos. */
function listXml(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === '.git') continue
      const p = join(d, n)
      const info = lstatSync(p)
      if (info.isSymbolicLink()) continue // dado de terceiros: não segue link para fora da pasta do corpus
      if (info.isDirectory()) walk(p)
      else if (n.toLowerCase().endsWith('.xml')) out.push(p)
    }
  }
  walk(dir)
  return out.sort()
}

const kids = (p: Element | null | undefined, name: string): Element[] =>
  p ? Array.from(p.children).filter((c) => c.localName === name) : []
const kid = (p: Element | null | undefined, name: string): Element | undefined => kids(p, name)[0]
const txt = (p: Element | null | undefined, name: string): string | undefined => kid(p, name)?.textContent?.trim() || undefined

/** O que o ARQUIVO contém, lido direto do DOM (independente do parser em teste). */
interface Estatico {
  uids: number[]
  vinculos: string[] // `pred>uid:tipo`
  pct: number // folhas com % > 0
  inicioReal: number // folhas com ActualStart
  terminoReal: number // folhas com ActualFinish
  lb0: number // tarefas com Baseline Number 0 e Start
  lb1a10: number // elementos Baseline com Number != 0
  timephased: number // elementos TimephasedData (qualquer nível)
  tarefasLb1a10: number // tarefas com ao menos uma Baseline Number != 0
  lb0SemTermino: number // tarefas com Baseline 0 só com início
  lb0SemInicio: number // tarefas com Baseline 0 só com término
  elapsed: number // folhas com DurationFormat em tempo corrido e duração > 0
  curtas: number // folhas com duração > 0 que viram 0 dia
  fracionarias: number // folhas com duração > 0 arredondada para dias inteiros
  text1SemApelido: number // tarefas com Text1 preenchido e sem apelido SINAPI no arquivo
  number1SemApelido: number // tarefas com Number1 numérico e sem apelido "lead" no arquivo
  calendarioProprio: number // tarefas com CalendarUID diferente de -1 e do calendário do projeto
  nulas: number // tarefas nulas (IsNull = 1) com UID
  valoresPersonalizados: number // ExtendedAttribute de tarefa fora de Text1/Number1 (ou dos apelidos)
  camposPersonalizados: number // FieldID distintos dos anteriores
  folgas: string[] // feriados do calendário usado: lista legada + exceções não recorrentes (ordenado)
  extras: string[] // dias úteis extras idem
  semanaDiff: number // dias da semana do calendário diferentes de seg–sex
  lagOutroFormato: number // vínculos com lag != 0 e LagFormat fora de 7/39 (e não percentual)
  calendariosNaoImportados: number // calendários de recurso ou base sem uso (nem no projeto nem em tarefa): fora do import
  datasFolhas: { uid: number; inicio: string; termino: string }[] // folhas com Start e Finish no arquivo (parte da data)
}

const FIELD_TEXT1 = '188743731'
const FIELD_NUMBER1 = '188743767'
const ELAPSED = ['4', '6', '8', '10', '12', '36', '38', '40', '42', '44']

/** Minutos de uma duração ISO 8601 (PT..H..M..S / P..DT..), lida à parte do parser. */
function minutosBrutos(v: string | undefined, minutosPorDia: number): number {
  if (!v) return 0
  const n = (re: RegExp) => Number(v.match(re)?.[1] ?? 0)
  return n(/(\d+(?:\.\d+)?)D/) * minutosPorDia + n(/(\d+(?:\.\d+)?)H/) * 60 + n(/(\d+(?:\.\d+)?)M/) + n(/(\d+(?:\.\d+)?)S/) / 60
}

function lerEstatico(xml: string): Estatico {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const project = doc.documentElement
  const tarefas = kids(kid(project, 'Tasks'), 'Task').filter(
    (t) => Number(txt(t, 'UID')) !== 0 && txt(t, 'OutlineLevel') !== '0' && txt(t, 'IsNull') !== '1' && txt(t, 'Active') !== '0',
  )
  const folhas = tarefas.filter((t) => txt(t, 'Summary') !== '1')
  const minutosPorDia = Number(txt(project, 'MinutesPerDay')) || 480
  const calendarios = kids(kid(project, 'Calendars'), 'Calendar')
  const calUsado = calendarios.find((c) => txt(c, 'UID') === (txt(project, 'CalendarUID') ?? '1')) ?? calendarios[0]
  const calProjeto = txt(calUsado, 'UID') // calendário realmente usado pelo import
  const defs = kids(kid(project, 'ExtendedAttributes'), 'ExtendedAttribute')
  const idsComApelido = (trecho: string) => defs.filter((d) => (txt(d, 'Alias') ?? '').toLowerCase().includes(trecho)).map((d) => txt(d, 'FieldID'))
  const sinapiIds = idsComApelido('sinapi')
  const leadIds = idsComApelido('lead')
  const campoText1 = sinapiIds.length ? sinapiIds[sinapiIds.length - 1]! : FIELD_TEXT1
  const campoNumber1 = leadIds.length ? leadIds[leadIds.length - 1]! : FIELD_NUMBER1
  const valorDe = (t: Element, id: string) => kids(t, 'ExtendedAttribute').find((e) => txt(e, 'FieldID') === id)
  const extras = tarefas.flatMap((t) => kids(t, 'ExtendedAttribute')).filter((e) => ![campoText1, campoNumber1].includes(txt(e, 'FieldID') ?? ''))
  const dias = (t: Element) => {
    const m = minutosBrutos(txt(t, 'Duration'), minutosPorDia)
    return { m, exato: Math.round((m / minutosPorDia) * 100) / 100 }
  }
  const diasFolga = new Set<string>()
  const diasExtras = new Set<string>()
  const marcar = (no: Element) => {
    const per = kid(no, 'TimePeriod')
    const de = txt(per, 'FromDate')?.slice(0, 10)
    const ate = txt(per, 'ToDate')?.slice(0, 10)
    if (!de || !ate || !/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) return
    let n = 0
    for (let d = de; d <= ate && n < 400; d = addCalendarDays(d, 1), n++) (txt(no, 'DayWorking') === '1' ? diasExtras : diasFolga).add(d)
  }
  for (const wd of kids(kid(calUsado, 'WeekDays'), 'WeekDay')) if (txt(wd, 'DayType') === '0') marcar(wd)
  for (const ex of kids(kid(calUsado, 'Exceptions'), 'Exception')) if (Number(txt(ex, 'Occurrences') ?? 1) <= 1) marcar(ex)
  const semanaDiff = kids(kid(calUsado, 'WeekDays'), 'WeekDay').filter((wd) => {
    const dia = Number(txt(wd, 'DayType'))
    const trabalha = txt(wd, 'DayWorking')
    return dia >= 1 && dia <= 7 && trabalha !== undefined && (trabalha === '1') !== (dia >= 2 && dia <= 6)
  }).length
  const todasAsTarefas = kids(kid(project, 'Tasks'), 'Task')
  const usadosPorTarefas = new Set(todasAsTarefas.map((t) => txt(t, 'CalendarUID')).filter((u): u is string => u !== undefined && u !== '-1'))
  const importaveis = new Set<Element>(calUsado ? [calUsado] : [])
  for (const c of calendarios) if (txt(c, 'IsBaseCalendar') === '1' && usadosPorTarefas.has(txt(c, 'UID') ?? '')) importaveis.add(c)
  const lagOutroFormato = tarefas
    .flatMap((t) => kids(t, 'PredecessorLink'))
    .filter((l) => Number(txt(l, 'LinkLag') ?? 0) !== 0 && !['7', '39', '19', '20', '51', '52'].includes(txt(l, 'LagFormat') ?? '7')).length
  return {
    uids: tarefas.map((t) => Number(txt(t, 'UID'))),
    vinculos: tarefas.flatMap((t) => kids(t, 'PredecessorLink').map((l) => `${txt(l, 'PredecessorUID')}>${txt(t, 'UID')}:${txt(l, 'Type') ?? '1'}`)),
    pct: folhas.filter((t) => Number(txt(t, 'PercentComplete') ?? 0) > 0).length,
    inicioReal: folhas.filter((t) => txt(t, 'ActualStart')).length,
    terminoReal: folhas.filter((t) => txt(t, 'ActualFinish')).length,
    lb0: tarefas.filter((t) => kids(t, 'Baseline').some((b) => (txt(b, 'Number') ?? '0') === '0' && txt(b, 'Start'))).length,
    lb1a10: tarefas.reduce((a, t) => a + kids(t, 'Baseline').filter((b) => (txt(b, 'Number') ?? '0') !== '0').length, 0),
    timephased: doc.getElementsByTagName('TimephasedData').length,
    tarefasLb1a10: tarefas.filter((t) => kids(t, 'Baseline').some((b) => (txt(b, 'Number') ?? '0') !== '0')).length,
    lb0SemTermino: tarefas.filter((t) => kids(t, 'Baseline').some((b) => (txt(b, 'Number') ?? '0') === '0' && txt(b, 'Start') && !txt(b, 'Finish'))).length,
    lb0SemInicio: tarefas.filter((t) => kids(t, 'Baseline').some((b) => (txt(b, 'Number') ?? '0') === '0' && !txt(b, 'Start') && txt(b, 'Finish'))).length,
    elapsed: folhas.filter((t) => ELAPSED.includes(txt(t, 'DurationFormat') ?? '') && dias(t).m > 0).length,
    curtas: folhas.filter((t) => dias(t).m > 0 && Math.round(dias(t).exato) === 0).length,
    fracionarias: folhas.filter((t) => Math.round(dias(t).exato) > 0 && dias(t).exato !== Math.round(dias(t).exato)).length,
    text1SemApelido: sinapiIds.length ? 0 : tarefas.filter((t) => valorDe(t, FIELD_TEXT1) && txt(valorDe(t, FIELD_TEXT1), 'Value')).length,
    number1SemApelido: leadIds.length
      ? 0
      : tarefas.filter((t) => {
          const v = txt(valorDe(t, FIELD_NUMBER1), 'Value')
          return v !== undefined && !Number.isNaN(Number(v))
        }).length,
    calendarioProprio: tarefas.filter((t) => {
      const c = txt(t, 'CalendarUID')
      return c !== undefined && c !== '-1' && c !== calProjeto
    }).length,
    nulas: kids(kid(project, 'Tasks'), 'Task').filter((t) => Number(txt(t, 'UID')) !== 0 && txt(t, 'IsNull') === '1').length,
    valoresPersonalizados: extras.length,
    camposPersonalizados: new Set(extras.map((e) => txt(e, 'FieldID') ?? '')).size,
    folgas: [...diasFolga].sort(),
    extras: [...diasExtras].sort(),
    semanaDiff,
    lagOutroFormato,
    calendariosNaoImportados: calendarios.length - importaveis.size,
    datasFolhas: folhas.flatMap((t) => {
      const inicio = txt(t, 'Start')?.slice(0, 10)
      const termino = txt(t, 'Finish')?.slice(0, 10)
      return inicio && termino ? [{ uid: Number(txt(t, 'UID')), inicio, termino }] : []
    }),
  }
}

interface Linha {
  arquivo: string
  versao: string
  saveVersion: string
  kb: number
  tarefasArquivo: number
  tarefasLidas: number
  vinculosArquivo: number
  vinculosLidos: number
  pctArquivo: number
  pctLido: number
  inicioRealArquivo: number
  inicioRealLido: number
  terminoRealArquivo: number
  terminoRealLido: number
  lb0Arquivo: number
  lb0Lida: number
  lb1a10: number
  timephased: number
  est: Estatico
  idaVoltaOk: boolean
  datas?: { total: number; iguais: number; iguaisSemFeriadosNacionais: number; diferencas: string[] }
  resultado: 'importado' | 'recusado'
  uidsUnicos: boolean
  avisos: string[]
  ms: number
}

const linhas: Linha[] = []
interface LinhaCalendario {
  arquivo: string
  recorrentes: number
  legadoFeriados: number
  legadoExtras: number
  lidosFeriados: number
  lidosExtras: number
}
const calendarios: LinhaCalendario[] = []
const VERSOES = ['2002', '2003', '2007', '2010', '2013', '2016', '2019', 'outros'] as const

function versaoDe(rel: string): string {
  return rel.match(/project(\d{4})/)?.[1] ?? 'outros'
}

function somar(ls: Linha[], campo: keyof Linha): number {
  return ls.reduce((a, l) => a + Number(l[campo]), 0)
}

function relatorioMd(): string {
  const cab = '| Versão | SaveVersion | Arquivos | Importados | Recusados | Tarefas lidas | Vínculos lidos/arquivo | % > 0 lido/arquivo | Início real lido/arquivo | Término real lido/arquivo | LB0 lida/arquivo | LB 1–10 | TimephasedData |'
  const sep2 = '|' + ' --- |'.repeat(13)
  const linhaVersao = (nome: string, ls: Linha[]) => {
    const saves = [...new Set(ls.map((l) => l.saveVersion))].sort().join('/')
    const imp = ls.filter((l) => l.resultado === 'importado')
    return `| ${nome} | ${saves} | ${ls.length} | ${imp.length} | ${ls.length - imp.length} | ${somar(ls, 'tarefasLidas')} | ${somar(ls, 'vinculosLidos')}/${somar(imp, 'vinculosArquivo')} | ${somar(ls, 'pctLido')}/${somar(imp, 'pctArquivo')} | ${somar(ls, 'inicioRealLido')}/${somar(imp, 'inicioRealArquivo')} | ${somar(ls, 'terminoRealLido')}/${somar(imp, 'terminoRealArquivo')} | ${somar(ls, 'lb0Lida')}/${somar(imp, 'lb0Arquivo')} | ${somar(ls, 'lb1a10')} | ${somar(ls, 'timephased')} |`
  }
  const porVersao = VERSOES.map((v) => linhaVersao(v, linhas.filter((l) => l.versao === v))).join('\n')
  const porArquivo = linhas
    .map((l) => `| ${l.arquivo} | ${l.versao} | ${l.saveVersion} | ${l.kb} | ${l.resultado} | ${l.tarefasLidas}/${l.tarefasArquivo} | ${l.vinculosLidos}/${l.vinculosArquivo} | ${l.lb0Lida}/${l.lb0Arquivo} | ${l.lb1a10} | ${l.timephased} | ${l.idaVoltaOk ? 'ok' : '—'} | ${l.avisos.length} | ${l.ms} |`)
    .join('\n')
  return [
    '# Relatório de caracterização do corpus MSPDI (gerado pelo teste de corpus)',
    '',
    `Arquivos: ${linhas.length}. Corpus: MPXJ (LGPL-2.1), fora do repositório. Só nomes de arquivo e contagens.`,
    '',
    '## Por versão',
    '',
    cab,
    sep2,
    porVersao,
    linhaVersao('**Total**', linhas),
    '',
    '## Por arquivo',
    '',
    '| Arquivo | Versão | SaveVersion | KB | Resultado | Tarefas lidas/arquivo | Vínculos lidos/arquivo | LB0 lida/arquivo | LB 1–10 | TimephasedData | Ida e volta | Avisos | ms |',
    '|' + ' --- |'.repeat(13),
    porArquivo,
    '',
    '## Calendários dos arquivos de calendário (tarefa fictícia em memória)',
    '',
    '| Arquivo | Exceções recorrentes | Feriados na lista legada | Dias úteis extras na lista legada | Feriados lidos | Dias úteis extras lidos |',
    '|' + ' --- |'.repeat(6),
    ...calendarios.map((c) => `| ${c.arquivo} | ${c.recorrentes} | ${c.legadoFeriados} | ${c.legadoExtras} | ${c.lidosFeriados} | ${c.lidosExtras} |`),
    '',
    '## Datas das folhas: arquivo x CronoAI (modo baseline), arquivos com vínculos',
    '',
    '| Arquivo | Folhas com datas | Iguais (calendário importado) | Iguais (sem feriados nacionais) | Diferenças (calendário importado) |',
    '|' + ' --- |'.repeat(5),
    ...linhas.filter((l) => l.datas).map((l) => `| ${l.arquivo} | ${l.datas!.total} | ${l.datas!.iguais} | ${l.datas!.iguaisSemFeriadosNacionais} | ${l.datas!.diferencas.map((d) => d.split(':')[0]).join(', ') || '—'} |`),
    '',
    '## Avisos por arquivo',
    '',
    ...linhas.filter((l) => l.avisos.length).map((l) => `- ${l.arquivo}:\n${l.avisos.map((a) => `  - ${a}`).join('\n')}`),
    '',
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Teste
// ---------------------------------------------------------------------------

const arquivos = REF_DIR ? listXml(CORPUS_DIR) : []

describe.skipIf(!REF_DIR)('corpus MSPDI do MPXJ (local, CRONOAI_REF_DIR)', () => {
  // ATENÇÃO: as asserções do bloco "inventário fixo" leem `linhas`, preenchida pelos testes por arquivo acima: dependem da ordem
  // de execução do arquivo (sequencial por padrão no Vitest). Não usar `--sequence.shuffle` nem `-t` neste arquivo.
  // Cada parse é síncrono e o conjunto leva mais de 1 min: sem ceder o laço de eventos entre os testes, o worker não
  // responde ao Vitest ("Timeout calling onTaskUpdate"). Não é espera por tempo: só devolve o controle uma vez por teste.
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

  afterAll(() => {
    const dir = join(process.cwd(), 'test-results', 'corpus-mspdi')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'relatorio.json'), JSON.stringify(linhas.map(({ est: _est, ...l }) => l), null, 1))
    writeFileSync(join(dir, 'relatorio.md'), relatorioMd())
    writeFileSync(join(dir, 'calendarios.json'), JSON.stringify(calendarios, null, 1))
  })

  describe.each(arquivos.map((f) => [relative(CORPUS_DIR, f).split(sep).join('/'), f] as const))('%s', (rel, caminho) => {
    let importado: { linha: Linha; r: ReturnType<typeof parseMspdiXml> } | undefined
    it('importa sem exceção não tratada e sem perder UID, vínculo, % e datas reais', { timeout: TIMEOUT }, () => {
      expect(statSync(caminho).size).toBeLessThanOrEqual(MAX_MSPDI_CHARS)
      const xml = readFileSync(caminho, 'utf8')
      const est = lerEstatico(xml)
      const saveVersion = xml.match(/<SaveVersion>(\d+)<\/SaveVersion>/)?.[1] ?? '—'
      const linha: Linha = {
        arquivo: rel, versao: versaoDe(rel), saveVersion, kb: Math.round(xml.length / 1024),
        tarefasArquivo: est.uids.length, tarefasLidas: 0, vinculosArquivo: est.vinculos.length, vinculosLidos: 0,
        pctArquivo: est.pct, pctLido: 0, inicioRealArquivo: est.inicioReal, inicioRealLido: 0,
        terminoRealArquivo: est.terminoReal, terminoRealLido: 0, lb0Arquivo: est.lb0, lb0Lida: 0,
        lb1a10: est.lb1a10, timephased: est.timephased, est, idaVoltaOk: false, resultado: 'recusado', uidsUnicos: true, avisos: [], ms: 0,
      }
      linhas.push(linha)

      const t0 = performance.now()
      let r: ReturnType<typeof parseMspdiXml>
      try {
        r = parseMspdiXml(xml)
      } catch (e) {
        // Única recusa aceita: arquivo sem tarefa (só calendário ou recursos). Plano 00003, P2 = A.
        linha.ms = Math.round(performance.now() - t0)
        expect((e as Error).message).toBe(SEM_TAREFA)
        expect(est.uids).toEqual([])
        return
      }
      linha.ms = Math.round(performance.now() - t0)
      linha.resultado = 'importado'
      importado = { linha, r }
      linha.avisos = r.warnings

      const uids = r.tasks.map((t) => t.uid)
      linha.tarefasLidas = r.tasks.length
      linha.uidsUnicos = new Set(uids).size === uids.length
      const lidos = r.tasks.flatMap((t) => t.predecessors.map((p) => `${p.uid}>${t.uid}:${LINK_CODE[p.type]}`))
      linha.vinculosLidos = lidos.length
      linha.pctLido = r.tasks.filter((t) => t.percentComplete > 0).length
      linha.inicioRealLido = r.tasks.filter((t) => !t.isSummary && t.actualStart).length
      linha.terminoRealLido = r.tasks.filter((t) => !t.isSummary && t.actualFinish).length
      linha.lb0Lida = r.tasks.filter((t) => t.baselineStart).length

      expect(linha.uidsUnicos).toBe(true)
      expect([...uids].sort((a, b) => a - b)).toEqual([...est.uids].sort((a, b) => a - b)) // nenhum UID perdido nem criado
      expect([...lidos].sort()).toEqual([...est.vinculos].sort()) // vínculos: UID da predecessora e tipo
      expect(linha.pctLido).toBe(est.pct)
      expect(linha.inicioRealLido).toBe(est.inicioReal)
      expect(linha.terminoRealLido).toBe(est.terminoReal)
      expect(linha.lb0Lida).toBe(est.lb0)

      // Sem descarte silencioso (AC-4): categoria presente no arquivo => aviso com o número do arquivo; ausente => sem aviso
      const w = r.warnings
      const confere = (n: number, texto: string, prefixo: RegExp) => {
        if (n > 0) expect(w).toContain(texto)
        else expect(w.filter((a) => prefixo.test(a))).toEqual([])
      }
      confere(est.tarefasLb1a10, `Linhas de base 1 a 10 não importadas em ${est.tarefasLb1a10} tarefa(s): o CronoAI usa só a linha de base 0.`, /^Linhas de base 1 a 10/)
      confere(est.lb0SemTermino, `${est.lb0SemTermino} tarefa(s) com linha de base 0 sem término: o valor planejado (PV) delas fica zero.`, /linha de base 0 sem término/)
      confere(est.lb0SemInicio, `${est.lb0SemInicio} tarefa(s) com linha de base 0 sem início: o término do arquivo é mantido e o valor planejado (PV) delas fica zero.`, /linha de base 0 sem início/)
      // E3: duração e lag exatos em minutos e calendário por tarefa lidos. Antes: tempo corrido (5), meio dia (4), fração (20),
      // calendário próprio (1), semana ≠ seg–sex e lag em formato diferente de dias úteis (12) geravam aviso. Agora: nenhum.
      expect(w.filter((a) => /tempo corrido convertida|menos de meio dia|fracionária|calendário próprio|diferente de segunda a sexta|formato diferente/.test(a))).toEqual([])
      confere(est.text1SemApelido, `Text1 lido como código SINAPI em ${est.text1SemApelido} tarefa(s) sem apelido 'SINAPI' no arquivo: confira.`, /^Text1 lido/)
      confere(est.number1SemApelido, `Number1 lido como lead time em ${est.number1SemApelido} tarefa(s) sem apelido 'lead' no arquivo: confira.`, /^Number1 lido/)
      confere(est.nulas, `${est.nulas} linha(s) em branco (tarefa nula) ignorada(s).`, /em branco/)
      // Calendário lido = o do arquivo (lista legada + exceções simples); arquivo sem feriado nenhum recebe os nacionais, com aviso
      if (est.folgas.length) expect(feriadosDe(r)).toEqual(est.folgas)
      else expect(w.some((a) => a.startsWith('Calendário sem feriados'))).toBe(true)
      expect(extrasDe(r)).toEqual(est.extras)
      const informativo = [
        est.timephased && `${est.timephased} registro(s) distribuído(s) no tempo (TimephasedData)`,
        est.valoresPersonalizados && `${est.valoresPersonalizados} valor(es) de ${est.camposPersonalizados} campo(s) personalizado(s)`,
        est.calendariosNaoImportados > 0 && `${est.calendariosNaoImportados} calendário(s) de recurso ou sem uso nas tarefas`,
      ].filter(Boolean)
      confere(informativo.length, `Não importado do MS Project: ${informativo.join('; ')}.`, /^Não importado do MS Project/)
    })

    // E3: ida e volta (parse -> computeSchedule -> buildMspdiXml -> validateMspdi strictOrder -> parse), sem o preenchimento de LB0
    // da store: o teste é do parser, e a LB0 derivada da tarefa-resumo é dado calculado, não do arquivo.
    it('faz ida e volta com strictOrder sem erro e sem alterar os campos preservados', { timeout: TIMEOUT }, () => {
      if (!importado) return // arquivo recusado (sem tarefa): nada a exportar
      const { linha, r } = importado
      const inicio = r.meta.startDate ?? '2026-01-05'
      const meta: ProjectMeta = {
        name: r.meta.name || 'Obra', company: r.meta.company ?? '', manager: r.meta.manager ?? '',
        startDate: inicio, statusDate: r.meta.statusDate ?? inicio, dailyIndirectCost: 0,
        minutosPorDia: r.meta.minutosPorDia, honorConstraintsArquivo: r.meta.honorConstraintsArquivo,
        opcoesCronograma: r.meta.opcoesCronograma, moveArquivo: r.meta.moveArquivo,
      }
      const schedule = computeSchedule(r.tasks, compilarCalendarios(inicio, r.calendarios, r.calendarioPadraoUid), optsDaObra(meta, 'forecast', meta.statusDate))
      const xml = buildMspdiXml({ meta, tasks: r.tasks, calendarios: r.calendarios, calendarioPadraoUid: r.calendarioPadraoUid, schedule })
      expect(validateMspdi(xml, { strictOrder: true }).errors).toEqual([])

      const back = parseMspdiXml(xml)
      // Cabeçalho na ida e volta: jornada, HonorConstraints, lógica de progresso e Move*
      expect(back.meta.minutosPorDia).toBe(r.meta.minutosPorDia)
      expect(back.meta.honorConstraintsArquivo).toBe(r.meta.honorConstraintsArquivo)
      expect(back.meta.opcoesCronograma).toEqual(r.meta.opcoesCronograma)
      expect(back.meta.moveArquivo).toEqual(r.meta.moveArquivo)
      // Calendários: UID, nome, semana com horários e exceções iguais antes e depois (o padrão é o primeiro da lista nos dois lados)
      expect(back.calendarioPadraoUid).toBe(r.calendarioPadraoUid)
      expect(back.calendarios).toEqual(r.calendarios)
      // Calendário na ida e volta: feriados e dias úteis extras iguais antes e depois
      expect(feriadosDe(back)).toEqual(feriadosDe(r))
      expect(extrasDe(back)).toEqual(extrasDe(r))
      const volta = new Map(back.tasks.map((t) => [t.uid, t]))
      expect(volta.size).toBe(r.tasks.length)
      const diferencas: string[] = []
      for (const t of r.tasks.filter((x) => !x.isSummary)) {
        const b = volta.get(t.uid)
        if (!b) {
          diferencas.push(`uid ${t.uid} ausente`)
          continue
        }
        const campos: [string, unknown, unknown][] = [
          ['nome', b.name, t.name],
          ['vínculos (UID e tipo)', b.predecessors.map((p) => [p.uid, p.type]), t.predecessors.map((p) => [p.uid, p.type])],
          ['lag', b.predecessors.map((p) => p.lag), t.predecessors.map((p) => p.lag)],
          ['% concluído', b.percentComplete, Math.round(t.percentComplete)],
          ['início real', b.actualStart, t.actualStart],
          ['término real', b.actualFinish, t.actualFinish],
          ['duração', b.duracaoMin, t.duracaoMin],
          ['duração corrida', b.duracaoCorrida, t.duracaoCorrida],
          ['calendário da tarefa', b.calendarioUid, t.calendarioUid],
          // A restrição inferida (tarefa sem vínculo) é heurística do import e volta ao arquivo como ASAP: só a explícita é campo preservado
          ['restrição', explicita(b.restricao), explicita(t.restricao)],
          ['prazo final', b.prazoFinal, t.prazoFinal],
          ['Manual e Active', [b.arquivo?.manual, b.arquivo?.ativa], [t.arquivo?.manual, t.arquivo?.ativa]],
          ['início da LB0', b.baselineStart, t.baselineStart],
          ['término da LB0', b.baselineFinish, t.baselineFinish],
        ]
        for (const [campo, depois, antes] of campos) if (JSON.stringify(depois) !== JSON.stringify(antes)) diferencas.push(`uid ${t.uid}: ${campo}`)
      }
      expect(diferencas).toEqual([])
      linha.idaVoltaOk = true
    })

    // E4: datas do arquivo x datas calculadas pelo CronoAI (CPM, modo baseline, calendário importado) nas folhas dos arquivos com vínculos.
    // É CARACTERIZAÇÃO, não paridade: os números mudam de propósito quando a SPEC-05 (00004) e a SPEC-03 (00005) entrarem.
    it('compara as datas das folhas com as do arquivo (caracterização)', { timeout: TIMEOUT }, () => {
      if (!importado || !importado.linha.vinculosArquivo) return
      const { linha, r } = importado
      const inicio = r.meta.startDate ?? '2026-01-05'
      const semFeriadosNoArquivo = r.warnings.some((a) => a.startsWith('Calendário sem feriados'))
      const calcular = (calendarios: CalendarioObra[]) =>
        computeSchedule(r.tasks, compilarCalendarios(inicio, calendarios, r.calendarioPadraoUid), { mode: 'baseline', statusDate: r.meta.statusDate ?? inicio })
      const comImportado = calcular(r.calendarios)
      // Sem os feriados nacionais que o import aplica quando o arquivo não traz nenhum: o calendário do projeto fica só com os dias úteis extras
      const semNacionais = semFeriadosNoArquivo
        ? calcular(r.calendarios.map((c) => (c.uid === r.calendarioPadraoUid ? { ...c, excecoes: c.excecoes.filter((ex) => ex.intervalos.length > 0) } : c)))
        : comImportado
      const diferencas: string[] = []
      let iguais = 0
      let iguaisSemNacionais = 0
      for (const d of linha.est.datasFolhas) {
        const a = comImportado.byUid.get(d.uid)
        const b = semNacionais.byUid.get(d.uid)
        if (a?.start === d.inicio && a.finish === d.termino) iguais++
        else diferencas.push(`uid ${d.uid}: arquivo ${d.inicio}..${d.termino}, calculado ${a?.start}..${a?.finish}`)
        if (b?.start === d.inicio && b.finish === d.termino) iguaisSemNacionais++
      }
      linha.datas = { total: linha.est.datasFolhas.length, iguais, iguaisSemFeriadosNacionais: iguaisSemNacionais, diferencas }
    })
  })

  // Os 39 arquivos sem tarefa continuam recusados (não apagar a EAP da obra). O calendário dos 11 arquivos de calendário é conferido
  // injetando uma tarefa fictícia SÓ EM MEMÓRIA (o arquivo do corpus não é alterado): plano 00003, P2 = A.
  const comCalendario = arquivos.map((f) => relative(CORPUS_DIR, f).split(sep).join('/')).filter((r) => /calendar-(calendars|recurring-exceptions)/.test(r))
  const TAREFA_FICTICIA =
    '<Task><UID>1</UID><ID>1</ID><Name>Tarefa ficticia</Name><OutlineLevel>1</OutlineLevel><Start>2001-01-01T08:00:00</Start><Duration>PT8H0M0S</Duration></Task>'

  describe.each(comCalendario)('calendário de %s (tarefa fictícia em memória)', (rel) => {
    it('usa as datas gravadas pelo MS Project, sem bloco contínuo', { timeout: TIMEOUT }, () => {
      const xml = readFileSync(join(CORPUS_DIR, rel), 'utf8')
      const injetado = xml.includes('<Tasks/>') ? xml.replace('<Tasks/>', `<Tasks>${TAREFA_FICTICIA}</Tasks>`) : xml.replace('<Tasks>', `<Tasks>${TAREFA_FICTICIA}`)
      const doc = new DOMParser().parseFromString(xml, 'application/xml')
      const project = doc.documentElement
      const cals = kids(kid(project, 'Calendars'), 'Calendar')
      const cal = cals.find((c) => txt(c, 'UID') === (txt(project, 'CalendarUID') ?? '1')) ?? cals[0]
      const legado = { folga: new Set<string>(), extra: new Set<string>() }
      for (const wd of kids(kid(cal, 'WeekDays'), 'WeekDay')) {
        if (txt(wd, 'DayType') !== '0') continue
        const per = kid(wd, 'TimePeriod')
        const de = txt(per, 'FromDate')?.slice(0, 10)
        const ate = txt(per, 'ToDate')?.slice(0, 10)
        for (let d = de; d && ate && d <= ate; d = addCalendarDays(d, 1)) (txt(wd, 'DayWorking') === '1' ? legado.extra : legado.folga).add(d)
      }
      const recorrentes = kids(kid(cal, 'Exceptions'), 'Exception').filter((e) => Number(txt(e, 'Occurrences') ?? 1) > 1).length

      const r = parseMspdiXml(injetado)
      calendarios.push({ arquivo: rel, recorrentes, legadoFeriados: legado.folga.size, legadoExtras: legado.extra.size, lidosFeriados: feriadosDe(r).length, lidosExtras: extrasDe(r).length })
      if (legado.folga.size) expect(feriadosDe(r)).toEqual([...legado.folga].sort())
      expect(extrasDe(r)).toEqual([...legado.extra].sort())
      if (recorrentes && legado.folga.size + legado.extra.size) {
        expect(r.warnings.filter((a) => /recorrente/.test(a))).toEqual([])
      }
    })
  })

  describe('inventário fixo do corpus', () => {
    // MPXJ commit 421a11b. Corpus diferente faz este teste falhar de propósito: é a régua de antes/depois dos ciclos 00004, 00007 e 00010.
    it('bate com a medição de 25/10/2026', () => {
      const imp = linhas.filter((l) => l.resultado === 'importado')
      const rec = linhas.filter((l) => l.resultado === 'recusado')
      expect(linhas).toHaveLength(134)
      expect(imp).toHaveLength(95)
      expect(rec).toHaveLength(39)
      expect(somar(imp, 'tarefasLidas')).toBe(2481)
      expect(somar(imp, 'vinculosLidos')).toBe(53)
      expect(somar(imp, 'vinculosArquivo')).toBe(53)
      expect(somar(imp, 'pctLido')).toBe(38)
      expect(somar(imp, 'inicioRealLido')).toBe(38)
      expect(somar(imp, 'terminoRealLido')).toBe(11)
      expect(somar(imp, 'lb0Lida')).toBe(11)
      expect(somar(imp, 'lb1a10')).toBe(470)
      expect(somar(linhas, 'timephased')).toBe(10222)
      expect(imp.filter((l) => l.uidsUnicos)).toHaveLength(95)
    })

    it('ida e volta com strictOrder e campos preservados em 95 de 95 arquivos importáveis (AC-7)', () => {
      expect(linhas.filter((l) => l.resultado === 'importado' && l.idaVoltaOk)).toHaveLength(95)
    })

    // Antes do ciclo 00003 nenhum destes tinha aviso (só o de data de status, calendário sem feriados e custos). Depois: um aviso por categoria.
    // Contagens de tarefas (não de elementos): o plano falava em "47 tarefas" para as LB 1–10, mas são 470 tarefas com uma LB 1–10 cada.
    it('cada categoria de dado não preservado gera aviso com o número medido (antes: nenhum aviso)', () => {
      const imp = linhas.filter((l) => l.resultado === 'importado')
      const soma = (re: RegExp) => {
        const achados = imp.flatMap((l) => l.avisos.map((a) => a.match(re)?.[1])).filter((n): n is string => n !== undefined)
        return { total: achados.reduce((a, n) => a + Number(n), 0), arquivos: achados.length }
      }
      expect(soma(/^Linhas de base 1 a 10 não importadas em (\d+) tarefa/)).toEqual({ total: 470, arquivos: 7 })
      expect(soma(/^(\d+) tarefa\(s\) com linha de base 0 sem término/)).toEqual({ total: 11, arquivos: 7 })
      expect(soma(/^(\d+) tarefa\(s\) com linha de base 0 sem início/)).toEqual({ total: 12, arquivos: 8 })
      // E3 (ciclo 00004), antes → depois: duração e lag exatos em minutos, calendário por tarefa, semana e jornada lidos.
      expect(soma(/^(\d+) tarefa\(s\) com duração em tempo corrido/)).toEqual({ total: 0, arquivos: 0 }) // antes: 5 em 1 arquivo (A5)
      expect(soma(/^(\d+) tarefa\(s\) com menos de meio dia/)).toEqual({ total: 0, arquivos: 0 }) // antes: 4 em 1 arquivo (A6)
      expect(soma(/^(\d+) duração\(ões\) fracionária/)).toEqual({ total: 0, arquivos: 0 }) // antes: 20 em 4 arquivos (A7)
      expect(soma(/^(\d+) valor\(es\) de tempo com segundos arredondado/)).toEqual({ total: 3, arquivos: 3 }) // novo: durações guiadas por recurso
      expect(soma(/^(\d+) tarefa\(s\) agendada\(s\) manualmente/)).toEqual({ total: 1136, arquivos: 38 }) // novo: Manual = 1 (parecer da tarefa 0)
      expect(soma(/^(\d+) calendário\(s\) rejeitado/)).toEqual({ total: 0, arquivos: 0 })
      expect(soma(/^(\d+) calendário\(s\) com semanas de trabalho/)).toEqual({ total: 0, arquivos: 0 }) // nenhum arquivo traz WorkWeeks
      expect(soma(/^(\d+) restrição\(ões\)/)).toEqual({ total: 0, arquivos: 0 }) // só ConstraintType 0 e 4, com data
      expect(soma(/^(\d+) data\(s\) inválida\(s\) ou a mais de/)).toEqual({ total: 0, arquivos: 0 })
      expect(imp.flatMap((l) => l.avisos).filter((a) => /^Projeto com .* h\/dia/.test(a))).toEqual([]) // antes: 2 arquivos de 7,5 h/dia; a jornada agora é preservada
      expect(soma(/^Text1 lido como código SINAPI em (\d+) tarefa/)).toEqual({ total: 6, arquivos: 6 })
      expect(soma(/^Number1 lido como lead time em (\d+) tarefa/)).toEqual({ total: 6, arquivos: 6 })
      expect(soma(/^(\d+) tarefa\(s\) com calendário próprio/)).toEqual({ total: 0, arquivos: 0 }) // antes: 1 em 1 arquivo (A10)
      expect(soma(/^(\d+) tarefa\(s\) com calendário não importado/)).toEqual({ total: 0, arquivos: 0 })
      expect(soma(/^(\d+) linha\(s\) em branco/)).toEqual({ total: 3, arquivos: 1 })
      expect(soma(/^(\d+) exceção\(ões\) recorrente/)).toEqual({ total: 0, arquivos: 0 }) // todas têm a lista legada
      expect(soma(/^(\d+) exceção\(ões\) do calendário com data inválida/)).toEqual({ total: 0, arquivos: 0 })
      expect(soma(/^Calendário do projeto com (\d+) dia/)).toEqual({ total: 0, arquivos: 0 }) // a semana agora é lida: sem aviso
      expect(soma(/^(\d+) vínculo\(s\) com lag em formato diferente/)).toEqual({ total: 0, arquivos: 0 }) // antes: 12 em 6 arquivos (LagFormat 9)
      expect(soma(/^(\d+) vínculo\(s\) com (formato de )?latência/)).toEqual({ total: 0, arquivos: 0 })
      expect(imp.filter((l) => l.avisos.some((a) => a.startsWith('Não importado do MS Project')))).toHaveLength(95)
    })

    it('calendários dos 11 arquivos de calendário: lista legada do MS Project (antes: 1.950 feriados lidos e 65 dias úteis extras)', () => {
      expect(calendarios).toHaveLength(11)
      const recorrentes = calendarios.filter((c) => c.recorrentes > 0)
      expect(recorrentes).toHaveLength(4)
      for (const c of recorrentes) {
        expect(c.recorrentes).toBe(27)
        expect(c.lidosFeriados).toBe(137)
        expect(c.lidosExtras).toBe(3)
      }
    })

    // Caracterização de 25/10/2026 (CPM atual, modo baseline). Diferenças conhecidas: Carnaval 2016 e Finados 2018 aplicados pelo import,
    // tarefa de 1 dia que cruza o fim de semana (efeito de hora) e durações guiadas por recurso. Mudam de propósito na 00004/00005.
    it('datas das folhas dos 8 arquivos com vínculos: 83 de 104 iguais; 100 de 104 sem os feriados nacionais (AC-8)', () => {
      const comDatas = linhas.filter((l) => l.datas)
      expect(comDatas).toHaveLength(8)
      const soma = (campo: 'total' | 'iguais' | 'iguaisSemFeriadosNacionais') => comDatas.reduce((acc, l) => acc + l.datas![campo], 0)
      expect(soma('total')).toBe(104)
      expect(soma('iguais')).toBe(83)
      expect(soma('iguaisSemFeriadosNacionais')).toBe(100)
    })

    it('tem o número de arquivos por versão da medição', () => {
      const porVersao = Object.fromEntries(VERSOES.map((v) => [v, linhas.filter((l) => l.versao === v).length]))
      expect(porVersao).toEqual({ '2002': 9, '2003': 19, '2007': 20, '2010': 21, '2013': 17, '2016': 17, '2019': 19, outros: 12 })
    })
  })
})
