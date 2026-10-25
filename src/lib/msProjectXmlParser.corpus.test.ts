// Teste de corpus (SÓ LOCAL): caracteriza o import MSPDI com os 134 arquivos do MS Project 2002–2019 do MPXJ.
// O corpus (LGPL-2.1, MPXJ commit 421a11b) fica FORA do git. Os XML são dados não confiáveis: o teste só lê, nunca executa nada deles.
// Como rodar: CRONOAI_REF_DIR=<pasta referencias> npx vitest run src/lib/msProjectXmlParser.corpus.test.ts
// Sem a variável (CI), a suíte inteira é pulada de propósito: não há corpus no repositório (licença; ver plano 00003, P1).
// Os auxiliares moram aqui dentro: um .ts auxiliar em src/lib entraria na cobertura sem execução no CI.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { parseMspdiXml } from './msProjectXmlParser'

const REF_DIR = process.env.CRONOAI_REF_DIR
const CORPUS_DIR = REF_DIR ? join(REF_DIR, 'mpxj-mspdi') : ''
const MAX_BYTES = 15 * 1024 * 1024
const SEM_TAREFA = 'Nenhuma tarefa encontrada no XML.'
const TIMEOUT = 30_000
const LINK_CODE = { FF: '0', FS: '1', SF: '2', SS: '3' } as const

// ---------------------------------------------------------------------------
// Auxiliares (varredura, leitura estática do arquivo e relatório)
// ---------------------------------------------------------------------------

/** Só `*.xml` sob a pasta do corpus, pulando `.git`. */
function listXml(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === '.git') continue
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
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
}

function lerEstatico(xml: string): Estatico {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const project = doc.documentElement
  const tarefas = kids(kid(project, 'Tasks'), 'Task').filter(
    (t) => Number(txt(t, 'UID')) !== 0 && txt(t, 'OutlineLevel') !== '0' && txt(t, 'IsNull') !== '1' && txt(t, 'Active') !== '0',
  )
  const folhas = tarefas.filter((t) => txt(t, 'Summary') !== '1')
  return {
    uids: tarefas.map((t) => Number(txt(t, 'UID'))),
    vinculos: tarefas.flatMap((t) => kids(t, 'PredecessorLink').map((l) => `${txt(l, 'PredecessorUID')}>${txt(t, 'UID')}:${txt(l, 'Type') ?? '1'}`)),
    pct: folhas.filter((t) => Number(txt(t, 'PercentComplete') ?? 0) > 0).length,
    inicioReal: folhas.filter((t) => txt(t, 'ActualStart')).length,
    terminoReal: folhas.filter((t) => txt(t, 'ActualFinish')).length,
    lb0: tarefas.filter((t) => kids(t, 'Baseline').some((b) => (txt(b, 'Number') ?? '0') === '0' && txt(b, 'Start'))).length,
    lb1a10: tarefas.reduce((a, t) => a + kids(t, 'Baseline').filter((b) => (txt(b, 'Number') ?? '0') !== '0').length, 0),
    timephased: doc.getElementsByTagName('TimephasedData').length,
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
  resultado: 'importado' | 'recusado'
  uidsUnicos: boolean
  avisos: string[]
  ms: number
}

const linhas: Linha[] = []
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
    .map((l) => `| ${l.arquivo} | ${l.versao} | ${l.saveVersion} | ${l.kb} | ${l.resultado} | ${l.tarefasLidas}/${l.tarefasArquivo} | ${l.vinculosLidos}/${l.vinculosArquivo} | ${l.lb0Lida}/${l.lb0Arquivo} | ${l.lb1a10} | ${l.timephased} | ${l.avisos.length} | ${l.ms} |`)
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
    '| Arquivo | Versão | SaveVersion | KB | Resultado | Tarefas lidas/arquivo | Vínculos lidos/arquivo | LB0 lida/arquivo | LB 1–10 | TimephasedData | Avisos | ms |',
    '|' + ' --- |'.repeat(12),
    porArquivo,
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
  // Cada parse é síncrono e o conjunto leva mais de 1 min: sem ceder o laço de eventos entre os testes, o worker não
  // responde ao Vitest ("Timeout calling onTaskUpdate"). Não é espera por tempo: só devolve o controle uma vez por teste.
  beforeEach(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

  afterAll(() => {
    const dir = join(process.cwd(), 'test-results', 'corpus-mspdi')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'relatorio.json'), JSON.stringify(linhas, null, 1))
    writeFileSync(join(dir, 'relatorio.md'), relatorioMd())
  })

  describe.each(arquivos.map((f) => [relative(CORPUS_DIR, f).split(sep).join('/'), f] as const))('%s', (rel, caminho) => {
    it('importa sem exceção não tratada e sem perder UID, vínculo, % e datas reais', { timeout: TIMEOUT }, () => {
      expect(statSync(caminho).size).toBeLessThanOrEqual(MAX_BYTES)
      const xml = readFileSync(caminho, 'utf8')
      const est = lerEstatico(xml)
      const saveVersion = xml.match(/<SaveVersion>(\d+)<\/SaveVersion>/)?.[1] ?? '—'
      const linha: Linha = {
        arquivo: rel, versao: versaoDe(rel), saveVersion, kb: Math.round(xml.length / 1024),
        tarefasArquivo: est.uids.length, tarefasLidas: 0, vinculosArquivo: est.vinculos.length, vinculosLidos: 0,
        pctArquivo: est.pct, pctLido: 0, inicioRealArquivo: est.inicioReal, inicioRealLido: 0,
        terminoRealArquivo: est.terminoReal, terminoRealLido: 0, lb0Arquivo: est.lb0, lb0Lida: 0,
        lb1a10: est.lb1a10, timephased: est.timephased, resultado: 'recusado', uidsUnicos: true, avisos: [], ms: 0,
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

    it('tem o número de arquivos por versão da medição', () => {
      const porVersao = Object.fromEntries(VERSOES.map((v) => [v, linhas.filter((l) => l.versao === v).length]))
      expect(porVersao).toEqual({ '2002': 9, '2003': 19, '2007': 20, '2010': 21, '2013': 17, '2016': 17, '2019': 19, outros: 12 })
    })
  })
})
