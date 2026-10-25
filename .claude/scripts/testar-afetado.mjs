#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/testar-afetado.ps1) para o CronoAI em 25/10/2026.
//
// Roda só os testes do escopo afetado pelo diff: `vitest related` sobre os .ts/.vue
// alterados (o Vitest segue o grafo de imports e acha os *.test.ts que dependem deles).
// Opcionalmente roda também `npm run lint` e `npm run typecheck`.
//
// Uso:
//   node .claude/scripts/testar-afetado.mjs --base <ref> [--pendente] [--lint] [--typecheck] [--listar]
//
// Parâmetros:
//   --base <ref>   ref de comparação (padrão: master; usa o merge-base com HEAD).
//   --pendente     inclui staged, working tree e untracked (padrão com working tree sujo).
//   --commits      considera só os commits da branch, mesmo com alterações pendentes.
//   --lint         roda também `npm run lint`.
//   --typecheck    roda também `npm run typecheck` (vue-tsc --noEmit).
//   --listar       só mostra o plano (arquivos e comandos), sem executar.
//   --help         mostra esta ajuda.
//
// Notas:
//   - Arquivos considerados: .ts/.vue existentes fora de .claude/ (d.ts fora).
//   - Mudança em configuração de build/teste (package.json, lock, vite/vitest/tsconfig)
//     gera uma nota pedindo a suíte completa (`npm test`), que este script não roda.
//   - Sem .ts/.vue alterados: informa e sai 0 (lint/typecheck ainda rodam se pedidos).
//
// Exit: 0 tudo passou (ou nada a testar) | código do primeiro passo que falhou | 2 erro de base/parâmetro.

import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { arquivosAlterados, caminhoSeguro, executar, raizRepo, tratarErro, haPendencias } from './lib/regras-cronoai.mjs'

const AJUDA = `Uso: node .claude/scripts/testar-afetado.mjs --base <ref> [--pendente] [--lint] [--typecheck] [--listar]

  --base <ref>   ref de comparação (padrão: master; usa o merge-base com HEAD)
  --pendente     inclui staged, working tree e untracked (padrão com working tree sujo)
  --commits      só os commits da branch, mesmo com alterações pendentes
  --lint         roda também npm run lint
  --typecheck    roda também npm run typecheck
  --listar       só mostra o plano, sem executar
  --help         esta ajuda

Exit: 0 passou/nada a testar | código do passo que falhou | 2 erro`

const CONFIG_TESTE = /^(package\.json|package-lock\.json|vite\.config\.ts|vitest\.config\.ts|vitest\.setup\.ts|tsconfig[^/]*\.json|src\/env\.d\.ts)$/

function principal() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'master' },
      pendente: { type: 'boolean', default: false },
      commits: { type: 'boolean', default: false },
      lint: { type: 'boolean', default: false },
      typecheck: { type: 'boolean', default: false },
      listar: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(AJUDA); return 0 }

  // Pendentes entram por padrão quando o working tree está sujo (evita verde falso antes do commit)
  const pendente = values.pendente || (!values.commits && haPendencias())
  if (pendente && !values.pendente) console.error('Aviso: alterações não commitadas incluídas automaticamente (use --commits para considerar só os commits).')
  const diff = arquivosAlterados({ base: values.base, pendente })
  const raiz = raizRepo()
  const candidatos = diff.arquivos.filter((a) =>
    /\.(ts|vue)$/.test(a) && !a.endsWith('.d.ts') && !a.startsWith('.claude/') && existsSync(path.join(raiz, a)))
  const ignorados = candidatos.filter((a) => !caminhoSeguro(a))
  const alvos = candidatos.filter(caminhoSeguro)
  const notas = diff.arquivos.filter((a) => CONFIG_TESTE.test(a))

  console.log(`Base: ${values.base} (merge-base ${diff.ref.slice(0, 8)})${pendente ? ' + pendentes' : ''} | arquivos: ${diff.arquivos.length} | .ts/.vue: ${alvos.length}`)
  for (const a of notas) console.log(`  nota: configuração de build/teste alterada (${a}) — rode a suíte completa: npm test`)
  for (const a of ignorados) console.log(`  aviso: caminho com caractere especial fora do vitest related (teste à mão): ${a}`)

  const passos = []
  if (alvos.length) passos.push({ nome: 'vitest related', cmd: 'npx', args: ['--no-install', 'vitest', 'related', '--run', '--passWithNoTests', ...alvos] })
  if (values.lint) passos.push({ nome: 'lint', cmd: 'npm', args: ['run', 'lint'] })
  if (values.typecheck) passos.push({ nome: 'typecheck', cmd: 'npm', args: ['run', 'typecheck'] })

  if (!alvos.length) console.log('Nenhum .ts/.vue alterado: nada para o vitest related.')
  if (!passos.length) { console.log('Nada a executar.'); return 0 }

  console.log('Plano:')
  for (const p of passos) {
    const args = p.nome === 'vitest related' ? [...p.args.slice(0, 5), `<${alvos.length} arquivo(s)>`] : p.args
    console.log(`  ${p.cmd} ${args.join(' ')}`)
  }
  if (alvos.length) for (const a of alvos) console.log(`    - ${a}`)
  if (values.listar) return 0

  const resultados = []
  for (const p of passos) {
    console.log(`\n== ${p.nome}`)
    const r = executar(p.cmd, p.args)
    if (r.erro) console.error(`  não foi possível executar ${p.cmd}: ${r.erro.message}`)
    resultados.push({ nome: p.nome, codigo: r.codigo })
  }

  console.log('\nResumo:')
  for (const r of resultados) console.log(`  ${r.codigo === 0 ? 'PASS' : 'FAIL'}  ${r.nome}${r.codigo === 0 ? '' : ` (exit ${r.codigo})`}`)
  const falha = resultados.find((r) => r.codigo !== 0)
  if (falha) { console.log(`FALHOU: ${resultados.filter((r) => r.codigo !== 0).map((r) => r.nome).join(', ')}`); return falha.codigo }
  console.log('OK: escopo afetado passou.')
  return 0
}

try {
  process.exitCode = principal()
} catch (e) {
  process.exitCode = tratarErro('testar-afetado', e)
}
