/// <reference types="node" />
// CLI: gera o recorte SINAPI (UF + regime + data-base) a partir da planilha nacional. Uso: `npm run sinapi:recorte -- --uf SP --regime nao-desonerado --data-base 2026-09`.
// A saída fica FORA do repositório (D-17): a tabela nacional nunca vai ao navegador nem ao git. Mensagens em português, sem pilha.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { REGIMES_SINAPI, UFS } from '../../src/data/ufs.ts'
import { ErroLayout, lerSinapi, mesDoNomeDoArquivo, normalizar } from './layout2025.ts'
import { ErroPlanilha, abrirPlanilha } from './planilha.ts'
import { ErroRecorte, montarRecorte, sha256Hex } from './recorte.ts'
import { ErroZip, LIMITES_ZIP_PADRAO, abrirZip } from './zip.ts'

/** Mesmo teto do app (`MAX_RECORTE_BYTES`, 6 MiB): acima disso o app recusaria o arquivo. */
const MAX_SAIDA_BYTES = 6 * 1024 * 1024

export const USO = `Uso: npm run sinapi:recorte -- --uf SP --regime nao-desonerado --data-base 2026-09 [opções]

Gera o recorte SINAPI de uma UF, um regime e uma data-base, para importar em Integrações.

  --uf <sigla>             UF (ex.: SP)
  --regime <regime>        nao-desonerado ou desonerado
  --data-base <AAAA-MM>    mês da publicação (acha a planilha em $CRONOAI_REF_DIR/sinapi/AAAA-MM/xlsx/)
  --arquivo <caminho>      planilha SINAPI_Referencia_AAAA_MM.xlsx (no lugar da busca pela data-base)
  --codigos <a,b,c>        só estes códigos de composição (junto com --grupos: união)
  --grupos <a;b;c>         só estes grupos (separados por ponto e vírgula)
  --saida <caminho>        arquivo de saída (padrão: $CRONOAI_REF_DIR/recortes/recorte-sinapi-UF-regime-AAAA-MM.json)
  --sobrescrever           permite sobrescrever o arquivo de saída
  --ajuda                  mostra esta ajuda

A saída precisa ficar fora do repositório. A planilha nacional não entra no git nem no navegador.`

export interface ResultadoCli {
  codigo: number
  saida: string[]
  erros: string[]
}

const falha = (codigo: number, ...erros: string[]): ResultadoCli => ({ codigo, saida: [], erros })

/** `caminho` está dentro de `raiz` (comparando o caminho real do ancestral que existe, contra atalhos por link simbólico). */
export function estaDentroDe(caminho: string, raiz: string): boolean {
  const real = (p: string): string => {
    let atual = resolve(p)
    const resto: string[] = []
    while (!existsSync(atual)) {
      const pai = dirname(atual)
      if (pai === atual) break
      resto.unshift(atual.slice(pai.length + 1))
      atual = pai
    }
    return join(existsSync(atual) ? realpathSync(atual) : atual, ...resto)
  }
  const norm = (p: string) => (process.platform === 'win32' ? p.toLowerCase() : p)
  const r = relative(norm(real(raiz)), norm(real(caminho)))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

function acharPlanilha(dataBase: string, refDir: string): string | undefined {
  const pasta = join(refDir, 'sinapi', dataBase, 'xlsx')
  if (!existsSync(pasta)) return undefined
  const alvo = `SINAPI_REFERENCIA_${dataBase.slice(0, 4)}_${dataBase.slice(5, 7)}.XLSX`
  const nome = readdirSync(pasta).find((n) => normalizar(n) === alvo)
  return nome ? join(pasta, nome) : undefined
}

export function executar(argv: string[], env: Record<string, string | undefined>, raizRepo: string): ResultadoCli {
  let valores
  try {
    valores = parseArgs({
      args: argv,
      strict: true,
      options: {
        uf: { type: 'string' },
        regime: { type: 'string' },
        'data-base': { type: 'string' },
        arquivo: { type: 'string' },
        codigos: { type: 'string' },
        grupos: { type: 'string' },
        saida: { type: 'string' },
        sobrescrever: { type: 'boolean' },
        ajuda: { type: 'boolean' },
      },
    }).values
  } catch {
    return falha(2, 'Opção desconhecida ou sem valor.', USO)
  }
  if (valores.ajuda) return { codigo: 0, saida: [USO], erros: [] }

  const uf = (valores.uf ?? '').toUpperCase()
  if (!UFS.some((u) => u.sigla === uf)) return falha(2, 'Informe --uf com uma sigla de UF válida (ex.: SP).')
  const regime = valores.regime ?? ''
  if (!(REGIMES_SINAPI as readonly string[]).includes(regime)) return falha(2, 'Informe --regime nao-desonerado ou desonerado.')
  const dataBaseArg = valores['data-base']
  if (dataBaseArg !== undefined && !/^\d{4}-(0[1-9]|1[0-2])$/.test(dataBaseArg)) return falha(2, 'A --data-base deve estar no formato AAAA-MM (ex.: 2026-09).')
  if (!dataBaseArg && !valores.arquivo) return falha(2, 'Informe --data-base ou --arquivo.')
  const codigos = valores.codigos ? valores.codigos.split(',').map((c) => c.trim()).filter(Boolean) : []
  if (codigos.some((c) => !/^\d{1,7}$/.test(c))) return falha(2, 'Os --codigos devem ser números separados por vírgula.')
  const grupos = valores.grupos ? valores.grupos.split(';').map((g) => g.trim()).filter(Boolean) : []
  const refDir = env.CRONOAI_REF_DIR

  // Saída: confere o destino ANTES de ler a planilha (a mais barata e a mais importante das recusas)
  let saida = valores.saida
  if (!saida) {
    if (!refDir) return falha(2, 'Sem --saida e sem CRONOAI_REF_DIR: informe onde gravar o recorte (fora do repositório).')
    const mes = dataBaseArg ?? mesDoNomeDoArquivo(basename(valores.arquivo!)) ?? 'sem-data'
    saida = join(refDir, 'recortes', `recorte-sinapi-${uf}-${regime}-${mes}.json`)
  }
  saida = resolve(saida)
  if (estaDentroDe(saida, raizRepo)) return falha(2, 'A saída não pode ficar dentro do repositório (inclusive src/ e public/, que vão no bundle). Use uma pasta fora dele.')
  if (!valores.sobrescrever && existsSync(saida)) return falha(2, 'O arquivo de saída já existe. Use --sobrescrever para trocá-lo.')

  let caminho = valores.arquivo ? resolve(valores.arquivo) : undefined
  if (!caminho) {
    if (!refDir) return falha(2, 'Sem --arquivo e sem CRONOAI_REF_DIR: informe a planilha.')
    caminho = acharPlanilha(dataBaseArg!, refDir)
    if (!caminho) return falha(1, `Planilha SINAPI_Referencia_${dataBaseArg!.replace('-', '_')}.xlsx não encontrada em CRONOAI_REF_DIR/sinapi/${dataBaseArg}/xlsx/.`)
  }
  if (!/\.xlsx$/i.test(caminho) || !existsSync(caminho) || !statSync(caminho).isFile()) return falha(1, 'O arquivo da planilha não existe ou não é .xlsx.')
  if (statSync(caminho).size > LIMITES_ZIP_PADRAO.maxArquivo) return falha(1, `A planilha passa do limite de ${Math.round(LIMITES_ZIP_PADRAO.maxArquivo / 1048576)} MiB.`)

  try {
    const bytes = readFileSync(caminho)
    const nomeArquivo = basename(caminho)
    const mesEsperado = dataBaseArg ?? mesDoNomeDoArquivo(nomeArquivo)
    const dados = lerSinapi(abrirPlanilha(abrirZip(bytes)), regime as 'nao-desonerado' | 'desonerado', mesEsperado)
    const recorte = montarRecorte(dados, { uf, filtro: { codigos, grupos }, arquivo: nomeArquivo, sha256: sha256Hex(bytes), bytes: bytes.length })
    const json = JSON.stringify(recorte) // compacto: 403 caracteres por composição
    const tamanho = Buffer.byteLength(json, 'utf8')
    if (tamanho > MAX_SAIDA_BYTES) {
      return falha(1, `O recorte tem ${(tamanho / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB, acima do limite de 6 MiB do app. Use --codigos ou --grupos para reduzir.`)
    }
    mkdirSync(dirname(saida), { recursive: true })
    writeFileSync(saida, json, { encoding: 'utf8', flag: valores.sobrescrever ? 'w' : 'wx' })
    const t = recorte.totais
    return {
      codigo: 0,
      saida: [
        `Recorte gravado em ${saida}`,
        `${recorte.uf} · ${recorte.dataBase} · ${regime}: ${t.composicoes} composição(ões), ${(tamanho / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} MiB.`,
        `Fora do recorte: ${t.excluidasSemCusto} sem custo e ${t.excluidasCustoZeroNaUf} com custo zero na UF.`,
        `SHA-256 da planilha: ${recorte.fonte.sha256}`,
      ],
      erros: [],
    }
  } catch (e) {
    if (e instanceof ErroZip || e instanceof ErroPlanilha || e instanceof ErroLayout || e instanceof ErroRecorte) return falha(1, e.message)
    if ((e as { code?: string }).code === 'EEXIST') return falha(2, 'O arquivo de saída já existe. Use --sobrescrever para trocá-lo.')
    return falha(1, 'Falha inesperada ao gerar o recorte. Confira o arquivo e as opções.')
  }
}

const raiz = fileURLToPath(new URL('../..', import.meta.url))
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const r = executar(process.argv.slice(2), process.env, raiz)
  for (const l of r.saida) process.stdout.write(`${l}\n`)
  for (const l of r.erros) process.stderr.write(`${l}\n`)
  process.exitCode = r.codigo
}
