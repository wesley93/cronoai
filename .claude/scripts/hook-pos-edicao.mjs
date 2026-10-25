#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/hook-pos-edicao.ps1) para o CronoAI em 25/10/2026.
//
// Hook PostToolUse (Edit|Write|MultiEdit) do Claude Code: roda o ESLint no arquivo
// .ts/.vue recém-editado e, havendo problemas, devolve-os ao Claude.
//
// Uso (configurado em .claude/settings.json; não é para rodar à mão):
//   {"hooks":{"PostToolUse":[{"matcher":"Edit|Write|MultiEdit","hooks":[
//     {"type":"command","command":"node \"$CLAUDE_PROJECT_DIR/.claude/scripts/hook-pos-edicao.mjs\"","timeout":30}]}]}}
//
// Teste manual:
//   echo {"tool_input":{"file_path":"src/lib/cpm.ts"}} | node .claude/scripts/hook-pos-edicao.mjs
//
// Entrada: JSON no stdin (tool_input.file_path; cwd opcional). Caminho relativo é
// resolvido contra o cwd do hook (ou a raiz do repositório).
//
// Contrato (https://docs.anthropic.com/en/docs/claude-code/hooks — PostToolUse):
//   exit 0 = nada a dizer (silencioso)
//   exit 2 = stderr é mostrado ao Claude (a edição já aconteceu; ele corrige em seguida)
//   Qualquer erro interno, timeout (~20 s), arquivo fora do repositório, ignorado pelo
//   ESLint ou extensão diferente de .ts/.vue -> exit 0 silencioso. Nunca trava a sessão.
//
// Parâmetros: --help mostra esta ajuda.

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { caminhoSeguro, executar, raizRepo } from './lib/regras-cronoai.mjs'

const AJUDA = `Hook PostToolUse: lê {"tool_input":{"file_path":"..."}} do stdin e roda o ESLint no arquivo .ts/.vue.

  echo {"tool_input":{"file_path":"src/lib/cpm.ts"}} | node .claude/scripts/hook-pos-edicao.mjs

Exit: 0 sem problemas (ou erro interno, silencioso) | 2 problemas de lint no stderr`

const TIMEOUT_MS = 20_000
const MAX_LINHAS = 40

function lerStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return }
    let dados = ''
    const limite = setTimeout(() => { process.stdin.destroy(); resolve(dados) }, 3_000)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (c) => { dados += c })
    process.stdin.on('end', () => { clearTimeout(limite); resolve(dados) })
    process.stdin.on('error', () => { clearTimeout(limite); resolve('') })
  })
}

/**
 * JSON do hook. Tolera a entrada sem aspas que o Git Bash produz com
 * echo {"tool_input":{...}} (as aspas somem): extrai o file_path por expressão.
 */
function interpretarEntrada(bruto) {
  try { return JSON.parse(bruto) } catch { /* segue para o modo tolerante */ }
  const m = /file_path"?\s*:\s*"?([^"},]+)/.exec(bruto)
  return m ? { tool_input: { file_path: m[1].trim() } } : {}
}

async function principal() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(AJUDA); return 0 }

  const bruto = await lerStdin()
  if (!bruto.trim()) return 0
  const entrada = interpretarEntrada(bruto)
  const arquivo = entrada?.tool_input?.file_path ?? entrada?.tool_input?.path
  if (typeof arquivo !== 'string' || !arquivo) return 0
  if (!/\.(ts|vue)$/i.test(arquivo) || /\.d\.ts$/i.test(arquivo)) return 0

  const raiz = raizRepo()
  const cwd = typeof entrada.cwd === 'string' && entrada.cwd ? entrada.cwd : raiz
  const abs = path.resolve(cwd, arquivo)
  const rel = path.relative(raiz, abs).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return 0 // fora do repositório
  if (/^(node_modules|dist|coverage)\//.test(rel) || !existsSync(abs)) return 0
  // O caminho vai para o npx (shell no Windows) no caminho alternativo: só caracteres seguros
  if (!caminhoSeguro(rel)) return 0

  // ESLint local via node (rápido e sem shell); sem ele, npx --no-install.
  const eslintJs = path.join(raiz, 'node_modules', 'eslint', 'bin', 'eslint.js')
  const argsEslint = ['--no-warn-ignored', '--format', 'stylish', rel]
  const r = existsSync(eslintJs)
    ? executar(process.execPath, [eslintJs, ...argsEslint], { capturar: true, timeoutMs: TIMEOUT_MS })
    : executar('npx', ['--no-install', 'eslint', ...argsEslint], { capturar: true, timeoutMs: TIMEOUT_MS })

  if (r.erro || r.expirou) return 0
  // ESLint: 0 = limpo, 1 = problemas de lint, 2 = erro de configuração/execução (não é do arquivo).
  if (r.codigo !== 1) return 0

  const saida = (r.stdout || '').trim().split(/\r?\n/)
  const corpo = saida.length > MAX_LINHAS ? [...saida.slice(0, MAX_LINHAS), `... (${saida.length - MAX_LINHAS} linha(s) omitidas)`] : saida
  process.stderr.write(`ESLint encontrou problemas em ${rel} (CLAUDE.md › Convenções; o CI roda npm run lint). Corrija antes de seguir:\n${corpo.join('\n')}\n`)
  return 2
}

principal()
  .then((codigo) => { process.exitCode = codigo })
  .catch(() => { process.exitCode = 0 })
