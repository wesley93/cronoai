#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/validar-regras.ps1) para o CronoAI em 25/10/2026.
//
// Regras DETERMINÍSTICAS do CLAUDE.md aplicadas às linhas ADICIONADAS do diff
// (arquivo novo = todas). Rede barata anterior à revisão: não substitui o revisor,
// o lint, o vue-tsc nem os testes. Olha só linhas novas para não cobrar dívida
// pré-existente de quem só encostou no arquivo. Ignora .claude/** e package-lock.json.
//
// Uso:
//   node .claude/scripts/validar-regras.mjs --base <ref> [--pendente] [--json]
//
// Parâmetros:
//   --base <ref>   ref de comparação (padrão: master; usa o merge-base com HEAD).
//   --pendente     inclui staged, working tree e untracked (padrão com working tree sujo).
//   --commits      considera só os commits da branch, mesmo com alterações pendentes.
//   --json         saída em JSON.
//   --help         mostra esta ajuda.
//
// Regras (id · severidade):
//   R01 bloqueia  v-html em .vue
//   R02 bloqueia  ": any" / "as any" / "<any>" em .ts/.vue (fora de teste)
//   R03 bloqueia  @ts-ignore / @ts-nocheck (fora de teste)
//   R04 alerta    "as unknown as" (fora de teste)
//   R05 alerta    enum TypeScript (use "as const" + typeof)
//   R06 alerta    console.log/debug em src (fora de teste)
//   R07 alerta    src/lib com store/DOM/localStorage (exceto download.ts, useMsProject.ts)
//   R08 bloqueia  segredo literal (AKIA…, chave PEM, ghp_/github_pat_, xoxb-/xoxp-, password = '…')
//   R09 bloqueia  VITE_* com nome de segredo (KEY/TOKEN/SECRET/PASSWORD…)
//   R10 bloqueia  arquivo de cálculo (T1/T2) alterado sem nenhum *.test.ts no diff
//   R11 bloqueia  pull_request_target em workflow
//   R12 bloqueia  msProjectXmlParser.ts alterado sem msProjectXmlParser.test.ts
//   R13 bloqueia  workflow alterado sem bloco "permissions:"
//
// Exit: 0 sem bloqueio | 1 há achado "bloqueia" | 2 erro do script.
// Só leitura. O trecho de linhas com segredo nunca é impresso.

import process from 'node:process'
import { parseArgs } from 'node:util'
import { aplicarRegras, arquivosAlterados, formatarAchado, linhasAdicionadas, tratarErro, haPendencias } from './lib/regras-cronoai.mjs'

const AJUDA = `Uso: node .claude/scripts/validar-regras.mjs --base <ref> [--pendente] [--json]

  --base <ref>   ref de comparação (padrão: master; usa o merge-base com HEAD)
  --pendente     inclui staged, working tree e untracked (padrão com working tree sujo)
  --commits      só os commits da branch, mesmo com alterações pendentes
  --json         saída em JSON
  --help         esta ajuda

Exit: 0 sem bloqueio | 1 há achado "bloqueia" | 2 erro`

function principal() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'master' },
      pendente: { type: 'boolean', default: false },
      commits: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(AJUDA); return 0 }

  // Pendentes entram por padrão quando o working tree está sujo (evita verde falso antes do commit)
  const pendente = values.pendente || (!values.commits && haPendencias())
  if (pendente && !values.pendente) console.error('Aviso: alterações não commitadas incluídas automaticamente (use --commits para considerar só os commits).')
  const diff = arquivosAlterados({ base: values.base, pendente })
  const novas = linhasAdicionadas({ ref: diff.ref, pendente, naoRastreados: diff.naoRastreados })
  const achados = aplicarRegras({ arquivos: diff.arquivos, removidos: diff.removidos, novas })
  const bloqueios = achados.filter((x) => x.severidade === 'bloqueia')
  const alertas = achados.filter((x) => x.severidade === 'alerta')

  if (values.json) {
    console.log(JSON.stringify({
      base: values.base,
      mergeBase: diff.ref,
      pendente,
      arquivos: diff.arquivos.length,
      bloqueios: bloqueios.length,
      alertas: alertas.length,
      achados,
    }, null, 2))
  } else {
    console.log(`validar-regras: ${diff.arquivos.length} arquivo(s) contra ${values.base}${pendente ? ' + pendentes' : ''} | ${bloqueios.length} bloqueia, ${alertas.length} alerta`)
    const porRegra = new Map()
    for (const x of achados) porRegra.set(`${x.id} ${x.regra}`, (porRegra.get(`${x.id} ${x.regra}`) ?? 0) + 1)
    for (const [regra, qtd] of porRegra) console.log(`  ${regra.padEnd(32)} ${qtd}`)
    if (achados.length) {
      console.log('')
      for (const x of achados) console.log(formatarAchado(x))
    }
    if (bloqueios.length) {
      console.log('')
      console.log('BLOQUEIA: corrija antes de entregar (ou registre o falso positivo no ciclo, com o motivo).')
    }
  }
  return bloqueios.length ? 1 : 0
}

try {
  process.exitCode = principal()
} catch (e) {
  process.exitCode = tratarErro('validar-regras', e)
}
