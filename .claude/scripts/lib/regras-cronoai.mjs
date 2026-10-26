// Adaptado do SophIA (.claude/scripts/lib/regras-sophia.ps1) para o CronoAI em 25/10/2026.
//
// Biblioteca comum dos scripts do processo (classificar-diff, validar-regras,
// testar-afetado, auditar-dependencias, gerar-changelog, hook-pos-edicao).
//
//   raizRepo()               raiz do repositório
//   git(args)                executa git sem shell (stdout em texto)
//   executar(cmd, args)      executa npm/npx (shell só no Windows, args citados)
//   resolverBase(base)       merge-base entre <base> e HEAD (tenta origin/<base>)
//   arquivosAlterados(...)   arquivos do diff (commits da branch; --pendente: + working tree + untracked)
//   linhasAdicionadas(...)   linhas ADICIONADAS por arquivo (git diff -U0)
//   classificar(...)         sinais T1–T8, faixa exigida, seguranca / especialista-obra
//   aplicarRegras(...)       regras determinísticas do CLAUDE.md sobre as linhas novas
//
// Fonte da verdade: CLAUDE.md e .claude/skills/desenvolver-recurso/SKILL.md (triagem T1–T8).
// Só leitura: nada aqui grava arquivo, chama rede ou altera o git.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const DIR_LIB = path.dirname(fileURLToPath(import.meta.url))
const EH_WINDOWS = process.platform === 'win32'

/** Erro de uso/ambiente: o script imprime a mensagem e sai com o código indicado. */
export class ErroScript extends Error {
  constructor(mensagem, codigo = 2) {
    super(mensagem)
    this.codigo = codigo
  }
}

// ------------------------------------------------------------------ raiz / git

let raizCache = null
/** Raiz do repositório: git rev-parse; sem git, sobe de .claude/scripts/lib. */
export function raizRepo() {
  if (raizCache) return raizCache
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: DIR_LIB, encoding: 'utf8' })
  const topo = r.status === 0 ? r.stdout.trim() : ''
  raizCache = topo ? path.resolve(topo) : path.resolve(DIR_LIB, '..', '..', '..')
  return raizCache
}

/**
 * Executa git na raiz, sem shell (os argumentos não passam por interpretação).
 * core.quotepath=false: caminho com acento não volta escapado em octal.
 */
export function git(args, { permitirFalha = false } = {}) {
  const r = spawnSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd: raizRepo(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (r.error) throw new ErroScript(`git indisponível: ${r.error.message}`)
  if (r.status !== 0 && !permitirFalha) {
    throw new ErroScript(`git ${args.join(' ')} falhou: ${(r.stderr || '').trim().split('\n')[0]}`)
  }
  return r.status === 0 ? r.stdout : ''
}

function linhas(texto) {
  return texto.split(/\r?\n/).filter(Boolean)
}

/** Cita um argumento para o cmd.exe (só usado quando shell: true no Windows). */
function citarWindows(arg) {
  if (/^[\w./:@=+,-]+$/.test(arg)) return arg
  return `"${arg.replace(/"/g, '""')}"`
}

/**
 * Executa npm/npx/node. No Windows npm e npx são .cmd e exigem shell; os
 * argumentos são citados e os caminhos já chegam filtrados por caminhoSeguro().
 */
export function executar(cmd, args, { capturar = false, timeoutMs, cwd } = {}) {
  const usarShell = EH_WINDOWS && cmd !== 'node' && cmd !== process.execPath
  // Com shell, a linha vai montada e citada aqui (passar args + shell: true gera o aviso DEP0190).
  const [comando, argsFinal] = usarShell ? [[cmd, ...args.map(citarWindows)].join(' '), []] : [cmd, args]
  const r = spawnSync(comando, argsFinal, {
    cwd: cwd ?? raizRepo(),
    shell: usarShell,
    encoding: 'utf8',
    stdio: capturar ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: timeoutMs,
    maxBuffer: 128 * 1024 * 1024,
    windowsHide: true,
  })
  return {
    codigo: r.status ?? (r.error || r.signal ? 1 : 0),
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    erro: r.error,
    expirou: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM',
  }
}

/** Caminho que pode ir com segurança para a linha de comando (sem metacaracteres de shell). */
export function caminhoSeguro(p) {
  return /^[\w./@+()[\] -]+$/.test(p) && !p.startsWith('-')
}

// ------------------------------------------------------------------ base / diff

/** Ref de git aceitável vinda de parâmetro (evita injeção de opção no git). */
export function validarRef(ref) {
  if (!ref || !/^[\w./~^@{}-]+$/.test(ref) || ref.startsWith('-') || ref.includes('..')) {
    throw new ErroScript(`Base inválida: ${ref ?? '(vazia)'}`)
  }
  return ref
}

/**
 * merge-base entre <base> e HEAD. Sem merge-base a lista ficaria vazia e a faixa
 * cairia para 1 em silêncio: falha FECHADA (exit 2), como no original.
 */
export function resolverBase(base) {
  validarRef(base)
  for (const candidato of [base, `origin/${base.replace(/^origin\//, '')}`]) {
    const mb = git(['merge-base', candidato, 'HEAD'], { permitirFalha: true }).trim()
    if (mb) return mb
  }
  throw new ErroScript(
    `Sem merge-base entre '${base}' e HEAD (branch ausente ou clone raso). Rode: git fetch origin ${base.replace(/^origin\//, '')}`,
  )
}

function normalizar(p) {
  return p.replace(/\\/g, '/').replace(/^"(.*)"$/, '$1')
}

/**
 * Arquivos alterados.
 *  - padrão: commits da branch (merge-base...HEAD)
 *  - pendente: merge-base contra o working tree (commits + staged + não staged) + untracked
 * Retorna { ref, arquivos: string[], removidos: Set, naoRastreados: Set }.
 */
export function arquivosAlterados({ base, pendente = false }) {
  const ref = resolverBase(base)
  const faixa = pendente ? [ref] : [ref, 'HEAD']
  const status = linhas(git(['diff', '--name-status', '--no-renames', ...faixa]))
  const arquivos = new Set()
  const removidos = new Set()
  for (const l of status) {
    const [st, ...resto] = l.split('\t')
    const p = normalizar(resto.join('\t'))
    arquivos.add(p)
    if (st.startsWith('D')) removidos.add(p)
  }
  const naoRastreados = new Set()
  if (pendente) {
    for (const p of linhas(git(['ls-files', '--others', '--exclude-standard']))) {
      naoRastreados.add(normalizar(p))
      arquivos.add(normalizar(p))
    }
  }
  return { ref, arquivos: [...arquivos].sort(), removidos, naoRastreados }
}

/**
 * Há alterações não commitadas (staged, working tree ou untracked)? Os scripts usam
 * isto para incluir os pendentes por padrão: o processo só commita no /entregar, e
 * olhar apenas os commits daria um "verde" falso durante as etapas 5 e 6.
 */
export function haPendencias() {
  return linhas(git(['status', '--porcelain', '--untracked-files=normal'])).length > 0
}

/**
 * Linhas ADICIONADAS por arquivo: Map<arquivo, {n, texto}[]>. Uma chamada só de
 * git diff -U0. Arquivo não rastreado = todas as linhas são novas.
 */
export function linhasAdicionadas({ ref, pendente = false, naoRastreados = new Set() }) {
  const faixa = pendente ? [ref] : [ref, 'HEAD']
  const saida = git(['diff', '-U0', '--no-color', '--no-ext-diff', '--no-renames', ...faixa])
  const mapa = new Map()
  let atual = null
  let n = 0
  for (const bruta of saida.split('\n')) {
    const l = bruta.replace(/\r$/, '')
    if (l.startsWith('diff --git ')) { atual = null; continue }
    if (l.startsWith('+++ ')) {
      const alvo = l.slice(4)
      atual = alvo === '/dev/null' ? null : normalizar(alvo).replace(/^b\//, '')
      if (atual && !mapa.has(atual)) mapa.set(atual, [])
      continue
    }
    if (l.startsWith('--- ')) continue
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l)
    if (hunk) { n = Number(hunk[1]); continue }
    if (atual && l.startsWith('+')) { mapa.get(atual).push({ n, texto: l.slice(1) }); n++ }
  }
  for (const p of naoRastreados) {
    const abs = path.join(raizRepo(), p)
    try {
      const conteudo = readFileSync(abs, 'utf8')
      if (conteudo.includes('\u0000')) continue // binário
      mapa.set(p, conteudo.split(/\r?\n/).map((texto, i) => ({ n: i + 1, texto })))
    } catch { /* ilegível ou diretório: ignora */ }
  }
  return mapa
}

/** Conteúdo de um arquivo numa ref (ou null se não existir lá). */
export function conteudoNaRef(ref, arquivo) {
  const r = spawnSync('git', ['show', `${ref}:${arquivo}`], { cwd: raizRepo(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return r.status === 0 ? r.stdout : null
}

// ------------------------------------------------------------------ dependências

const SECOES_DEP = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']

function lerDeps(textoJson) {
  const deps = new Map()
  if (!textoJson) return deps
  let pkg
  try { pkg = JSON.parse(textoJson) } catch { return deps }
  for (const secao of SECOES_DEP) {
    for (const [nome, versao] of Object.entries(pkg[secao] ?? {})) deps.set(nome, { versao, secao })
  }
  return deps
}

/** Compara package.json da ref com o atual: { novas, alteradas, removidas }. */
export function compararDependencias(ref) {
  const antes = lerDeps(conteudoNaRef(ref, 'package.json'))
  const caminhoAtual = path.join(raizRepo(), 'package.json')
  const depois = lerDeps(existsSync(caminhoAtual) ? readFileSync(caminhoAtual, 'utf8') : null)
  const novas = []
  const alteradas = []
  const removidas = []
  for (const [nome, d] of depois) {
    const a = antes.get(nome)
    if (!a) novas.push({ nome, ...d })
    else if (a.versao !== d.versao || a.secao !== d.secao) alteradas.push({ nome, ...d, versaoAnterior: a.versao, secaoAnterior: a.secao })
  }
  for (const [nome, a] of antes) if (!depois.has(nome)) removidas.push({ nome, ...a })
  return { novas, alteradas, removidas }
}

// ------------------------------------------------------------------ triagem T1–T8

const ARQ_T1 = /^src\/lib\/(cpm|calendar)\.ts$/
const ARQ_T2 = /^src\/lib\/(evm|scenarios|supplies|sinapi|sinapiBudget|diagnosis)\.ts$/
/** Arquivos de cálculo (T1/T2): exigem teste no mesmo diff (CLAUDE.md › Invioláveis 1). */
export const ARQ_CALCULO = /^src\/lib\/(cpm|calendar|evm|scenarios|supplies|sinapi|sinapiBudget|diagnosis)\.ts$/
const ARQ_T3 = /^src\/lib\/(msProjectXmlParser[^/]*|sinapiBudget)\.ts$/
const ARQ_T4 = /^src\/(types\/domain\.ts|stores\/useProjectStore\.ts)$/
const ARQ_T6 = /^src\/(lib\/fieldAi\.ts|(.*\/)?AiMappingPanel\.vue)$/
const ARQ_T7 = /^(Dockerfile|\.dockerignore|docker\/.*|docker-compose[^/]*\.ya?ml|\.github\/.*|\.nvmrc)$/
const ARQ_T8 = /^(api|backend|server)\//
const ARQ_TESTE = /\.(test|spec)\.ts$/
const ARQ_DOC = /^(\.claude\/|docs\/)|\.md$/

// Leitura de arquivo/texto externo em código novo (T5).
const LEITURA_EXTERNA = /\bFileReader\b|\bDOMParser\b|parseFromString\s*\(|readAs(Text|ArrayBuffer|DataURL)\s*\(|type\s*=\s*["']file["']|\.files\s*\?*\[|\bonDrop\b|@drop\b/
// Integração externa em código novo (T8): no front-only qualquer chamada de rede é integração nova.
const INTEGRACAO_EXTERNA = /\bfetch\s*\(|new\s+WebSocket\s*\(|\bXMLHttpRequest\b|sendBeacon\s*\(|new\s+EventSource\s*\(/

// Mudança sensível em workflow (T5): permissões, segredos/token, gatilhos privilegiados, OIDC.
const WORKFLOW_SENSIVEL = /\bpermissions\s*:|\b(contents|packages|id-token|actions|security-events|pull-requests|deployments)\s*:\s*write\b|\bsecrets\.|\bgithub\.token\b|\bGITHUB_TOKEN\b|\bpull_request_target\b|\bworkflow_run\b/
// Action fora dos publicadores oficiais já aceitos (actions/, github/, docker/).
const ACTION_TERCEIRO = /^\s*-?\s*uses:\s*(?!(actions|github|docker)\/|\.\/)[\w.-]+\//

export const DESCRICAO_SINAIS = {
  T1: 'cálculo de datas/rede (CPM, calendário)',
  T2: 'cálculo financeiro/quantidades (EVM, cenários, DLP, SINAPI, diagnóstico)',
  T3: 'leitura/escrita do MS Project ou formato de arquivo (XML, CSV)',
  T4: 'formato do estado persistido',
  T5: 'segurança/privacidade (arquivo externo, Nginx/CSP, dependência nova, permissão/segredo/action de terceiro em workflow)',
  T6: 'IA de campo / aprovação de apontamentos',
  T7: 'Docker/compose/Nginx/CI/Dependabot',
  T8: 'backend, endpoint, auth, banco ou integração externa',
}

function semComentario(texto) {
  const t = texto.trimStart()
  return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--') || t.startsWith('#'))
}

/**
 * Classifica os arquivos pelos sinais T1–T8 da SKILL (heurística de caminho e,
 * em T5/T8, das linhas novas). Retorna o resultado completo da triagem.
 */
export function classificar({ arquivos, removidos = new Set(), novas = new Map(), ref }) {
  const sinais = Object.fromEntries(Object.keys(DESCRICAO_SINAIS).map((k) => [k, []]))
  const revisarManual = []
  const marcar = (t, arquivo, motivo) => {
    if (!sinais[t].some((s) => s.arquivo === arquivo && s.motivo === motivo)) sinais[t].push({ arquivo, motivo })
  }
  const linhasNovasDe = (a) => (novas.get(a) ?? []).filter((l) => semComentario(l.texto))

  for (const a of arquivos) {
    if (ARQ_T1.test(a)) marcar('T1', a, 'motor CPM/calendário')
    if (ARQ_T2.test(a)) marcar('T2', a, 'cálculo financeiro/quantidades')
    if (ARQ_T3.test(a)) marcar('T3', a, a.includes('sinapiBudget') ? 'importação/exportação CSV' : 'MSPDI (XML do MS Project)')
    if (ARQ_T4.test(a)) marcar('T4', a, 'tipos/estado persistido')
    if (a === 'src/stores/useProjectStore.ts') {
      revisarManual.push({ arquivo: a, motivo: 'revisar manualmente T2/T4: progressPatch/apropriação de custo (T2) e formato do estado salvo / loadState (T4)' })
    }
    if (ARQ_T6.test(a)) marcar('T6', a, 'IA de campo / aprovação')
    if (ARQ_T7.test(a)) marcar('T7', a, 'container/CI')
    if (ARQ_T8.test(a)) marcar('T8', a, 'diretório de backend')
    if (a === 'docker/nginx.conf') marcar('T5', a, 'Nginx/CSP/headers')
    if (/^\.github\/workflows\//.test(a) && !removidos.has(a)) {
      // Workflow é T7; vira T5 só se a mudança toca permissão, segredo, gatilho privilegiado ou action de terceiro
      const sensivel = linhasNovasDe(a).find((l) => WORKFLOW_SENSIVEL.test(l.texto) || ACTION_TERCEIRO.test(l.texto))
      if (sensivel) marcar('T5', a, `workflow: permissão/segredo/gatilho/action de terceiro (linha ${sensivel.n})`)
    }
    if (/^src\/data\/seed\.ts$/.test(a)) revisarManual.push({ arquivo: a, motivo: 'revisar manualmente T4: buildSeedState/obra de exemplo mesclada ao estado salvo' })
    if (a === 'package-lock.json' && !arquivos.includes('package.json')) {
      revisarManual.push({ arquivo: a, motivo: 'lock alterado sem package.json: confirme se não entrou dependência nova (T5)' })
    }

    if (!removidos.has(a) && /^src\/.*\.(ts|vue)$/.test(a) && !ARQ_TESTE.test(a)) {
      const ln = linhasNovasDe(a)
      const leitura = ln.find((l) => LEITURA_EXTERNA.test(l.texto))
      if (leitura) marcar('T5', a, `leitura de arquivo/texto externo (linha ${leitura.n})`)
      const rede = ln.find((l) => INTEGRACAO_EXTERNA.test(l.texto))
      if (rede) marcar('T8', a, `chamada de rede nova (linha ${rede.n})`)
    }
  }

  // Dependência nova no package.json (T5); versão alterada = revisar.
  let dependencias = null
  if (ref && arquivos.includes('package.json')) {
    dependencias = compararDependencias(ref)
    for (const d of dependencias.novas) marcar('T5', 'package.json', `dependência nova: ${d.nome}@${d.versao} (${d.secao})`)
    if (dependencias.alteradas.length) {
      revisarManual.push({ arquivo: 'package.json', motivo: `versão alterada: ${dependencias.alteradas.map((d) => `${d.nome} ${d.versaoAnterior} → ${d.versao}`).join(', ')}` })
    }
  }

  const tem = (t) => sinais[t].length > 0
  const codigo = arquivos.filter((a) => !ARQ_DOC.test(a) && !ARQ_TESTE.test(a))
  let faixaExigida = 1
  const motivos = []
  if (['T1', 'T2', 'T4', 'T6', 'T7'].some(tem) || codigo.length > 3) {
    faixaExigida = 2
    if (codigo.length > 3 && !['T1', 'T2', 'T4', 'T6', 'T7'].some(tem)) motivos.push(`${codigo.length} arquivos de código (> 3)`)
  }
  if (['T3', 'T5', 'T8'].some(tem)) faixaExigida = 3
  for (const t of Object.keys(sinais)) if (tem(t)) motivos.push(t)

  return {
    arquivos: arquivos.length,
    arquivosCodigo: codigo.length,
    faixaExigida,
    motivos,
    seguranca: tem('T5') || tem('T8'),
    especialistaObra: tem('T1') || tem('T2') || tem('T3'),
    sinais,
    revisarManual,
    dependencias,
  }
}

// ------------------------------------------------------------------ regras do CLAUDE.md

const EXT_CODIGO = /\.(ts|vue)$/
const DIR_IGNORADO = /^\.claude\/|(^|\/)package-lock\.json$/ // o próprio harness cita os padrões em texto

const SEGREDO_LITERAL = [
  { re: /\bAKIA[0-9A-Z]{16}\b/, nome: 'chave de acesso AWS' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, nome: 'chave privada PEM' },
  { re: /\bghp_[A-Za-z0-9]{20,}/, nome: 'token do GitHub' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, nome: 'token do GitHub' },
  { re: /\bxox[bp]-[A-Za-z0-9-]{10,}/, nome: 'token do Slack' },
]
// R08 senha literal. Três formas, todas com o VALOR extraído para decidir se é placeholder:
//  1. atribuição com aspas (password: 'x', senha = "x");
//  2. string de conexão (Npgsql/ADO.NET): Password=valor / Pwd = valor, valor com ou sem aspas. Só conta quando a linha tem
//     cara de string de conexão (';' antes da chave ou outra chave como Host=/Database=), para não acusar inicializador C#
//     (`Password = senha,`);
//  3. JSON com chave de senha: "Password": "valor".
const SENHA_ATRIBUICAO = /\b(?:password|senha|passwd|pwd)\s*[:=]\s*(['"])([^'"\s]+)\1/gi
const SENHA_CONEXAO = /\b(?:password|pwd)\s*=\s*('[^']*'|"[^"]*"|[^\s;'"]+)/gi
const CONTEXTO_CONEXAO = /(;\s*(?:password|pwd)\s*=)|\b(?:host|server|database|username|user id|uid)\s*=/i
const SENHA_JSON = /"(?:password|pwd|senha|passwd)"\s*:\s*"([^"\s]+)"/gi
// Valor que não é segredo: <marcador>, ${VAR}, $VAR (maiúsculas), $env:VAR (PowerShell), %L, {0} / {identificador}
// (interpolação C#) ou palavra de exemplo NO VALOR (a palavra em outra parte da linha, ex.: host, não isenta).
// Sem a flag i: "$VAR" só é placeholder em MAIÚSCULAS ("$ecret" é senha literal). Sem lookbehind/modificadores (Node 22).
const VALOR_PLACEHOLDER = /^(?:<[^>]*>|\$\{[^}]*\}|\$[A-Z_][A-Z0-9_]*|\$env:\w+|%[A-Za-z]|\{[\w.]*\})$/
const VALOR_EXEMPLO = /placeholder|exemplo|example|changeme|xxx|\*\*\*/i

function valoresDeSenha(texto) {
  const valores = []
  for (const m of texto.matchAll(SENHA_ATRIBUICAO)) valores.push(m[2])
  if (CONTEXTO_CONEXAO.test(texto)) {
    for (const m of texto.matchAll(SENHA_CONEXAO)) valores.push(m[1].replace(/^(['"])(.*)\1$/, '$2'))
  }
  for (const m of texto.matchAll(SENHA_JSON)) valores.push(m[1])
  return valores
}

/** Linha com senha literal (valor que não é placeholder). Exportada para o teste da regra R08. */
export function temSenhaLiteral(texto) {
  return valoresDeSenha(texto).some((v) => v.length > 0 && !VALOR_PLACEHOLDER.test(v) && !VALOR_EXEMPLO.test(v))
}
const VITE_SEGREDO = /\bVITE_\w*(KEY|TOKEN|SECRET|PASSWORD|PASSWD|SENHA|PRIVATE|CREDENTIAL)\w*/i

// ---------------------------------------------------------------------------------------------------------------
// Regras de backend .NET (R14 a R19): só o código C# de server/src (testes ficam de fora). ADR 00004, 00006 e 00009.
// ---------------------------------------------------------------------------------------------------------------
const ARQ_SERVER_CS = /^server\/src\/.*\.cs$/
const SQL_BRUTO = /\b(FromSqlRaw|ExecuteSqlRaw|ExecuteSqlRawAsync|SqlQueryRaw)\b/
const DDL = /\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|POLICY|ROLE|SCHEMA)\b|\b(ENABLE|NO\s+FORCE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i
const DML = /\b(INSERT\s+INTO|UPDATE\s+[\w."]+\s+SET|DELETE\s+FROM)\b/i
const CONEXAO_CRUA = /\bNpgsql(Connection|DataSource)\b/
// R18: escrita em massa do EF e SQL de escrita nas entidades auditadas (ADR 00009)
const EXECUTE_EM_MASSA = /\bExecute(Update|Delete)(Async)?\s*\(/
// Escrita nas tabelas auditadas (ciclo 00014: obra, auditoria, membro_empresa e as 6 de perfis e vínculos): acusa a PRÓPRIA linha do SQL (a
// chamada pode estar na linha de cima ou num bloco $"""), com schema, aspas (inclusive escapadas em string C#: \"x\" e ""x"") e ONLY
// opcionais, também MERGE INTO; sem schema vale porque o search_path do papel da aplicação é cronoai. O \b depois do nome impede
// "obra_arquivada" e "carteira_arquivada", e a ordem da alternância não importa por causa dele ("carteira" x "carteira_obra").
const TABELAS_AUDITADAS = 'obra|auditoria|membro_empresa|acesso_obra|frente|acesso_frente|carteira|carteira_obra|acesso_carteira'
const ESCRITA_EM_AUDITADA = new RegExp(
  String.raw`\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)(\s+ONLY)?\s+((?:\\"|""|")?cronoai(?:\\"|""|")?\s*\.\s*)?(?:\\"|""|")?(${TABELAS_AUDITADAS})\b`,
  'i',
)
// Único arquivo de server/src que escreve nelas por SQL: o provisionamento de desenvolvimento (cria empresa e membros como o migrador, sem
// trilha; o papel da aplicação não tem INSERT em membro_empresa). Exceção declarada, de UM arquivo.
const ESCRITA_PERMITIDA = '/CronoAI.Dados/Rls/ProvisionamentoEmpresa.cs'
// Único arquivo que usa ExecuteUpdate/ExecuteDelete: só sobre sessao, que não é auditada.
const EXECUTE_PERMITIDO = '/CronoAI.Dados/Identidade/ConsultasIdentidade.cs'
// R19: migração que desliga ou afrouxa as garantias da trilha (alerta; revisão humana decide)
// Helpers de política (Rls/MigrationBuilderRlsExtensoes) citando a trilha: o helper esconde o SQL, então a regra por texto não o vê.
// Criar, substituir ou remover política da "auditoria" por helper é revisão humana obrigatória (o helper já RECUSA UPDATE/DELETE).
const HELPER_DA_TRILHA = /\b(?:Substituir)?Politica(?:Select|Insert|Update|Delete)\s*\(\s*"auditoria"|\bRemoverPolitica\s*\(\s*"auditoria"/
const AFROUXA_TRILHA = /\b(DISABLE\s+TRIGGER|DROP\s+TRIGGER|DROP\s+POLICY|ALTER\s+POLICY|CREATE\s+POLICY|DISABLE\s+ROW\s+LEVEL\s+SECURITY|ENABLE\s+(REPLICA\s+)?TRIGGER|CASCADE|CREATE\s+OR\s+REPLACE\s+FUNCTION|OWNER\s+TO|GRANT|NO\s+FORCE)\b/i

/**
 * Regras R14 a R19 sobre UMA linha de código C# de server/src. Devolve [{ id, regra, mensagem, severidade? }]
 * (sem severidade = bloqueia). Comentário não conta. Exportada para o teste (regras-cronoai.test.mjs).
 */
export function regrasBackend(arquivo, texto) {
  if (!ARQ_SERVER_CS.test(arquivo) || !semComentario(texto)) return []
  const achados = []
  const emMigracao = /\/Migrations\//.test(arquivo)
  const emRls = arquivo.includes('/CronoAI.Dados/Rls/')

  // R14: SQL bruto com texto montado é proibido (FromSql/ExecuteSql interpolados viram parâmetros)
  if (SQL_BRUTO.test(texto)) {
    achados.push({ id: 'R14', regra: 'SQL bruto', mensagem: 'FromSqlRaw/ExecuteSqlRaw/SqlQueryRaw com texto montado: use FromSql/ExecuteSql/SqlQuery interpolados (viram parâmetros) ou LINQ (ADR 00004).' })
  }
  // R15: DDL só em Migrations/ e no helper Rls/; DML em migração só pelo helper ExecutarDmlComRls (na mesma linha)
  if (DDL.test(texto) && !emMigracao && !emRls) {
    achados.push({ id: 'R15', regra: 'DDL fora de migração', mensagem: 'DDL (CREATE/ALTER/DROP, RLS) só em Migrations/ ou em CronoAI.Dados/Rls/: toda DDL de tabela nasce em migração (ADR 00004).' })
  }
  if (emMigracao && DML.test(texto) && !texto.includes('ExecutarDmlComRls')) {
    achados.push({ id: 'R15', regra: 'DML em migração fora do helper', mensagem: 'DML em migração sobre tabela com RLS afeta zero linhas sem erro: use ExecutarDmlComRls (NO FORCE → DML → FORCE na transação), com a chamada e o SQL na mesma linha (ADR 00006).' })
  }
  // R16: IgnoreQueryFilters só em ConsultasIdentidade.cs
  if (/\bIgnoreQueryFilters\s*\(/.test(texto) && !arquivo.endsWith('/CronoAI.Dados/Identidade/ConsultasIdentidade.cs')) {
    achados.push({ id: 'R16', regra: 'IgnoreQueryFilters', mensagem: 'IgnoreQueryFilters só em CronoAI.Dados/Identidade/ConsultasIdentidade.cs, sempre com filtro explícito por usuário (ADR 00006).' })
  }
  // R17: conexão crua não passa pelo interceptor que fixa as variáveis de sessão do RLS
  if (CONEXAO_CRUA.test(texto) && !arquivo.endsWith('/CronoDbContextDesignTimeFactory.cs')) {
    achados.push({ id: 'R17', regra: 'conexão fora do EF', mensagem: 'NpgsqlConnection/NpgsqlDataSource fora do design-time: conexão crua não seta app.usuario_id/app.empresa_id; use o CronoDbContext da fábrica (NpgsqlConnectionStringBuilder é permitido) (ADR 00006).' })
  }
  // R18: ExecuteUpdate/ExecuteDelete não passam pelo ChangeTracker nem pelo interceptor de SaveChanges: a escrita ficaria SEM trilha
  // (e sem o contador de versão do EF). Por arquivo (a cadeia LINQ quebra linhas): só ConsultasIdentidade.cs, que escreve em sessao.
  if (EXECUTE_EM_MASSA.test(texto) && !arquivo.endsWith(EXECUTE_PERMITIDO)) {
    achados.push({ id: 'R18', regra: 'escrita fora do SaveChanges', mensagem: 'ExecuteUpdate/ExecuteDelete fora de CronoAI.Dados/Identidade/ConsultasIdentidade.cs: não passam pelo interceptor de auditoria; use o contexto e SalvarAuditadoAsync (ADR 00009).' })
  }
  // R18 (SQL): INSERT/UPDATE/DELETE em obra ou auditoria (com ou sem schema) fora de migração, em qualquer linha do SQL
  if (!emMigracao && !arquivo.endsWith(ESCRITA_PERMITIDA) && ESCRITA_EM_AUDITADA.test(texto)) {
    achados.push({ id: 'R18', regra: 'escrita fora do SaveChanges', mensagem: 'SQL de escrita em tabela auditada (obra, auditoria, membro_empresa, acesso_obra, frente, acesso_frente, carteira, carteira_obra, acesso_carteira): a trilha só é gravada pelo SaveChanges auditado, a trilha é append-only e o papel da aplicação não insere membro (ADR 00009 e 00010). Única exceção: Rls/ProvisionamentoEmpresa.cs.' })
  }
  // R19: alerta (e não bloqueio) porque o Down() legítimo remove a tabela; a revisão humana decide
  if (emMigracao && (HELPER_DA_TRILHA.test(texto) || (/auditoria/i.test(texto) && AFROUXA_TRILHA.test(texto)))) {
    achados.push({ id: 'R19', severidade: 'alerta', regra: 'migração mexe nas garantias da trilha', mensagem: 'Migração que cita auditoria (inclusive pelos helpers Politica*/SubstituirPolitica*/RemoverPolitica) com DISABLE/DROP TRIGGER, ENABLE TRIGGER sem ALWAYS, DISABLE ROW LEVEL SECURITY, CREATE/DROP/ALTER POLICY, CASCADE, CREATE OR REPLACE FUNCTION, OWNER TO, GRANT ou NO FORCE: confirme que o append-only continua valendo em três camadas (REVOKE, RLS só com SELECT e INSERT, gatilho de instrução com ENABLE ALWAYS) (ADR 00009).' })
  }
  return achados
}

/**
 * R19 por INSTRUÇÃO (alerta): numa migração, o SQL pode ocupar várias linhas (bloco de texto bruto). Junta as linhas de
 * código, separa por ";" e acusa, na linha em que a instrução começa, a que cita auditoria junto de uma palavra de
 * afrouxamento quando nenhuma linha SOZINHA já foi acusada pela regra por linha. Exportada para o teste.
 */
export function r19PorInstrucao(arquivo, linhas) {
  if (!ARQ_SERVER_CS.test(arquivo) || !/\/Migrations\//.test(arquivo)) return []
  const achados = []
  let instrucao = []
  const fecha = () => {
    const texto = instrucao.map((l) => l.texto).join(' ')
    const jaAcusada = instrucao.some((l) => regrasBackend(arquivo, l.texto).some((x) => x.id === 'R19'))
    if (instrucao.length > 1 && !jaAcusada && /auditoria/i.test(texto) && AFROUXA_TRILHA.test(texto)) achados.push({ n: instrucao[0].n })
    instrucao = []
  }
  for (const l of linhas) {
    if (!semComentario(l.texto)) continue
    instrucao.push(l)
    if (l.texto.includes(';')) fecha()
  }
  fecha()
  return achados
}

function achado(id, severidade, regra, arquivo, linha, mensagem, trecho) {
  return { id, severidade, regra, arquivo, linha: linha ?? null, mensagem, trecho: trecho ?? null }
}
function recorte(texto) {
  const t = texto.trim()
  return t.length > 120 ? `${t.slice(0, 117)}...` : t
}

/**
 * Regras determinísticas sobre as linhas ADICIONADAS (arquivo novo = todas).
 * Severidade: 'bloqueia' (exit 1 no validar-regras) | 'alerta'.
 */
export function aplicarRegras({ arquivos, removidos = new Set(), novas }) {
  const achados = []
  const testesNoDiff = arquivos.filter((a) => ARQ_TESTE.test(a) && !removidos.has(a))

  for (const a of arquivos) {
    if (DIR_IGNORADO.test(a) || removidos.has(a)) continue
    const ln = novas.get(a) ?? []
    const ehTeste = ARQ_TESTE.test(a) || /(^|\/)(tests?|__tests__)\//.test(a)
    const ehVue = a.endsWith('.vue')
    const ehCodigo = EXT_CODIGO.test(a)
    const ehSrc = a.startsWith('src/')

    for (const { n, texto } of ln) {
      if (!texto) continue
      const codigoAtivo = semComentario(texto)

      // R01 v-html (CLAUDE.md › Vue)
      if (ehVue && /\bv-html\s*=/.test(texto)) {
        achados.push(achado('R01', 'bloqueia', 'v-html', a, n, 'v-html é vetor de XSS: proibido com texto do usuário, do XML importado ou de IA (CLAUDE.md › Vue). HTML estático confiável: registre o falso positivo no ciclo.', recorte(texto)))
      }
      if (ehCodigo && !ehTeste) {
        // R02 any / R03 escape do compilador / R04 dupla conversão (CLAUDE.md › TypeScript)
        if (codigoAtivo && /(:\s*any\b(?!\s*\w)|\bas\s+any\b|<any>)/.test(texto)) {
          achados.push(achado('R02', 'bloqueia', 'any', a, n, 'tipo any: modele o tipo (CLAUDE.md › TypeScript: "nada de any"). O lint também acusa (no-explicit-any).', recorte(texto)))
        }
        if (/@ts-(ignore|nocheck)\b/.test(texto)) {
          achados.push(achado('R03', 'bloqueia', '@ts-ignore', a, n, 'resolva o tipo em vez de silenciar o compilador (CLAUDE.md › TypeScript); o CI roda vue-tsc --noEmit.', recorte(texto)))
        }
        if (codigoAtivo && /\bas\s+unknown\s+as\b/.test(texto)) {
          achados.push(achado('R04', 'alerta', 'as unknown as', a, n, 'dupla conversão de tipo: só com justificativa no comentário (CLAUDE.md › TypeScript: "nada de as unknown as gratuito").', recorte(texto)))
        }
        // R05 enum TS (CLAUDE.md › TypeScript: as const + typeof)
        if (codigoAtivo && /^\s*(export\s+)?(declare\s+)?(const\s+)?enum\s+\w+/.test(texto)) {
          achados.push(achado('R05', 'alerta', 'enum TypeScript', a, n, 'use objeto "as const" + type derivado com typeof, sem enum (CLAUDE.md › TypeScript).', recorte(texto)))
        }
      }
      // R06 console.log em src (fora de teste)
      if (ehSrc && ehCodigo && !ehTeste && codigoAtivo && /\bconsole\.(log|debug)\s*\(/.test(texto)) {
        achados.push(achado('R06', 'alerta', 'console.log', a, n, 'console.log em código de produção: remova ou troque por toast/tratamento de erro; nunca registre dado de obra, pessoal ou segredo (CLAUDE.md › Invioláveis 5 e 6).', recorte(texto)))
      }
      // R07 src/lib puro (CLAUDE.md › TypeScript: nada de store/DOM/localStorage em src/lib)
      if (/^src\/lib\/.*\.ts$/.test(a) && !ehTeste && !/(download|useMsProject)\.ts$/.test(a) && codigoAtivo &&
        /\b(localStorage|sessionStorage|document\.|window\.|useProjectStore|useUiStore)\b/.test(texto)) {
        achados.push(achado('R07', 'alerta', 'src/lib impuro', a, n, 'src/lib deve ter funções puras: sem store, DOM ou localStorage (exceções: download.ts, useMsProject.ts).', recorte(texto)))
      }
      // R08 segredo literal (CLAUDE.md › Invioláveis 5) — vale também em teste e fixture; o trecho não é exibido
      const seg = SEGREDO_LITERAL.find((s) => s.re.test(texto))
      if (seg) {
        achados.push(achado('R08', 'bloqueia', 'segredo no código', a, n, `${seg.nome} literal: remova, revogue a credencial e use variável de ambiente fora do bundle (CLAUDE.md › Invioláveis 5).`))
      } else if (temSenhaLiteral(texto)) {
        achados.push(achado('R08', ehTeste ? 'alerta' : 'bloqueia', 'segredo no código', a, n, 'senha literal em código: nada de senha em código, fixture ou log (CLAUDE.md › Invioláveis 5).'))
      }
      // R14 a R19: backend .NET (server/src); R19 é alerta
      for (const x of regrasBackend(a, texto)) {
        achados.push(achado(x.id, x.severidade ?? 'bloqueia', x.regra, a, n, x.mensagem, recorte(texto)))
      }
      // R09 VITE_ com nome de segredo: tudo que é VITE_* vai para o bundle público
      if (VITE_SEGREDO.test(texto)) {
        achados.push(achado('R09', 'bloqueia', 'VITE_ com segredo', a, n, `${VITE_SEGREDO.exec(texto)[0]}: variáveis VITE_* são embutidas no bundle e ficam públicas; segredo exige backend (SPEC-01) (CLAUDE.md › Invioláveis 5).`))
      }
      // R11 pull_request_target em workflow
      if (/^\.github\/workflows\/.*\.ya?ml$/.test(a) && codigoAtivo && /\bpull_request_target\b/.test(texto)) {
        achados.push(achado('R11', 'bloqueia', 'pull_request_target', a, n, 'pull_request_target roda código do fork com token de escrita e segredos: use pull_request (validar com Segurança da Informação).', recorte(texto)))
      }
    }
  }

  // R19 por instrução (SQL em várias linhas): alerta
  for (const a of arquivos) {
    if (removidos.has(a)) continue
    for (const x of r19PorInstrucao(a, novas.get(a) ?? [])) {
      achados.push(achado('R19', 'alerta', 'migração mexe nas garantias da trilha', a, x.n, 'Instrução de migração (em várias linhas) que cita auditoria com DISABLE/DROP TRIGGER, ENABLE TRIGGER sem ALWAYS, DISABLE ROW LEVEL SECURITY, POLICY, CASCADE, CREATE OR REPLACE FUNCTION, OWNER TO, GRANT ou NO FORCE: confirme que o append-only continua valendo em três camadas (ADR 00009).', null))
    }
  }

  // R10 cálculo sem teste no diff (CLAUDE.md › Invioláveis 1)
  for (const a of arquivos) {
    if (removidos.has(a) || !ARQ_CALCULO.test(a) || !(novas.get(a) ?? []).length) continue
    if (testesNoDiff.length === 0) {
      achados.push(achado('R10', 'bloqueia', 'cálculo sem teste', a, null, 'arquivo de cálculo (T1/T2) alterado sem nenhum *.test.ts no diff: número não muda sem teste que o fixe (CLAUDE.md › Invioláveis 1).'))
    }
  }
  // R12 MSPDI sem o teste de ida e volta (CLAUDE.md › Invioláveis 2)
  if (arquivos.includes('src/lib/msProjectXmlParser.ts') && !removidos.has('src/lib/msProjectXmlParser.ts') &&
    !testesNoDiff.includes('src/lib/msProjectXmlParser.test.ts')) {
    achados.push(achado('R12', 'bloqueia', 'MSPDI sem teste', 'src/lib/msProjectXmlParser.ts', null, 'msProjectXmlParser.ts alterado sem msProjectXmlParser.test.ts: exige teste de ida e volta e validateMspdi(..., { strictOrder: true }) (CLAUDE.md › Testes e Invioláveis 2).'))
  }
  // R13 workflow sem bloco permissions: (arquivo inteiro, não só linhas novas)
  for (const a of arquivos) {
    if (removidos.has(a) || !/^\.github\/workflows\/.*\.ya?ml$/.test(a)) continue
    const abs = path.join(raizRepo(), a)
    if (!existsSync(abs)) continue
    if (!/^\s*permissions\s*:/m.test(readFileSync(abs, 'utf8'))) {
      achados.push(achado('R13', 'bloqueia', 'workflow sem permissions', a, null, 'workflow sem bloco "permissions:": declare o mínimo (ex.: contents: read) em vez do token padrão (docs/devops.md; princípio do menor privilégio).'))
    }
  }

  const ordem = { bloqueia: 0, alerta: 1 }
  return achados.sort((x, y) => ordem[x.severidade] - ordem[y.severidade] || x.arquivo.localeCompare(y.arquivo) || (x.linha ?? 0) - (y.linha ?? 0))
}

export function formatarAchado(x) {
  const onde = x.linha ? `${x.arquivo}:${x.linha}` : x.arquivo
  const trecho = x.trecho ? `\n      > ${x.trecho}` : ''
  return `[${x.severidade.toUpperCase()}] ${x.id} ${onde} — ${x.regra}: ${x.mensagem}${trecho}`
}

// ------------------------------------------------------------------ utilitários de CLI

/** Imprime o erro de forma uniforme e devolve o código de saída. */
export function tratarErro(nomeScript, e) {
  if (e instanceof ErroScript) {
    console.error(`${nomeScript}: ${e.message}`)
    return e.codigo
  }
  if (e?.code?.startsWith?.('ERR_PARSE_ARGS')) {
    console.error(`${nomeScript}: ${e.message} (use --help)`)
    return 2
  }
  console.error(`${nomeScript}: erro inesperado: ${e?.message ?? e}`)
  return 2
}
