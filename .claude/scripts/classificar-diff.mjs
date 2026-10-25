#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/classificar-diff.ps1) para o CronoAI em 25/10/2026.
//
// Triagem DETERMINÍSTICA (sem modelo) do risco de um diff do CronoAI: sinais T1–T8,
// faixa exigida e validadores obrigatórios. Rede de proteção da triagem: se quem
// classifica errar para baixo, o script devolve a faixa mínima que o diff exige.
//
// Uso:
//   node .claude/scripts/classificar-diff.mjs --base <ref> [--faixa N] [--pendente] [--json]
//
// Parâmetros:
//   --base <ref>   branch/ref de comparação (padrão: master). Usa o merge-base com HEAD
//                  (tenta origin/<ref> se a local não existir).
//   --faixa <N>    faixa declarada pelo fluxo (1, 2 ou 3). Se for menor que a exigida, exit 1.
//   --pendente     inclui alterações não commitadas (staged, working tree e untracked).
//                  É o padrão quando o working tree tem alterações; --commits força só os commits.
//   --json         saída em JSON.
//   --help         mostra esta ajuda.
//
// Regras (SKILL desenvolver-recurso › Etapa 2):
//   faixa 3 = T3 | T5 | T8 ; faixa 2 = T1 | T2 | T4 | T6 | T7 ou mais de 3 arquivos de código ; senão 1.
//   seguranca obrigatório = T5 | T8 ; especialista-obra obrigatório = T1 | T2 | T3.
//   "Arquivos de código" exclui testes (*.test.ts), docs/, .claude/ e *.md.
//
// Exit: 0 ok | 1 faixa declarada abaixo da exigida | 2 erro (ex.: sem merge-base).
// Só leitura: não grava nada, não altera o git.

import process from 'node:process'
import { parseArgs } from 'node:util'
import {
  ErroScript, DESCRICAO_SINAIS, arquivosAlterados, classificar, linhasAdicionadas, tratarErro, haPendencias } from './lib/regras-cronoai.mjs'

const AJUDA = `Uso: node .claude/scripts/classificar-diff.mjs --base <ref> [--faixa N] [--pendente] [--json]

  --base <ref>   ref de comparação (padrão: master; usa o merge-base com HEAD)
  --faixa <N>    faixa declarada (1|2|3); exit 1 se for menor que a exigida
  --pendente     inclui staged, working tree e untracked (padrão com working tree sujo)
  --commits      só os commits da branch, mesmo com alterações pendentes
  --json         saída em JSON
  --help         esta ajuda

Exit: 0 ok | 1 faixa declarada abaixo da exigida | 2 erro`

function principal() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'master' },
      faixa: { type: 'string' },
      pendente: { type: 'boolean', default: false },
      commits: { type: 'boolean', default: false },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(AJUDA); return 0 }

  let faixaDeclarada = null
  if (values.faixa !== undefined) {
    if (!/^[123]$/.test(values.faixa)) throw new ErroScript(`--faixa deve ser 1, 2 ou 3 (recebido: ${values.faixa})`)
    faixaDeclarada = Number(values.faixa)
  }

  // Pendentes entram por padrão quando o working tree está sujo (evita verde falso antes do commit)
  const pendente = values.pendente || (!values.commits && haPendencias())
  if (pendente && !values.pendente) console.error('Aviso: alterações não commitadas incluídas automaticamente (use --commits para considerar só os commits).')
  const diff = arquivosAlterados({ base: values.base, pendente })
  const novas = linhasAdicionadas({ ref: diff.ref, pendente, naoRastreados: diff.naoRastreados })
  const r = classificar({ arquivos: diff.arquivos, removidos: diff.removidos, novas, ref: diff.ref })
  const escalar = faixaDeclarada !== null && faixaDeclarada < r.faixaExigida

  if (values.json) {
    console.log(JSON.stringify({
      base: values.base,
      mergeBase: diff.ref,
      pendente,
      faixaDeclarada,
      escalar,
      ...r,
      listaArquivos: diff.arquivos,
    }, null, 2))
  } else {
    console.log(`Base: ${values.base} (merge-base ${diff.ref.slice(0, 8)})${pendente ? ' + pendentes' : ''} | arquivos: ${r.arquivos} (código: ${r.arquivosCodigo})`)
    console.log(`Faixa exigida (mínima): ${r.faixaExigida}${r.motivos.length ? ` — ${r.motivos.join(', ')}` : ''}`)
    console.log(`seguranca: ${r.seguranca ? 'OBRIGATÓRIO (T5/T8)' : 'não exigido pela triagem'}`)
    console.log(`especialista-obra: ${r.especialistaObra ? 'OBRIGATÓRIO (T1/T2/T3)' : 'não exigido pela triagem'}`)
    console.log('')
    console.log('Sinais:')
    for (const [t, itens] of Object.entries(r.sinais)) {
      if (!itens.length) { console.log(`  ${t}: —`); continue }
      console.log(`  ${t} ${DESCRICAO_SINAIS[t]} [${itens.length}]`)
      for (const s of itens.slice(0, 8)) console.log(`     - ${s.arquivo} (${s.motivo})`)
      if (itens.length > 8) console.log(`     ... e mais ${itens.length - 8}`)
    }
    if (r.revisarManual.length) {
      console.log('')
      console.log('Revisar manualmente:')
      for (const x of r.revisarManual) console.log(`  - ${x.arquivo}: ${x.motivo}`)
    }
    if (!r.arquivos) console.log('\nNenhum arquivo alterado em relação à base.')
  }

  if (escalar) {
    const msg = `ESCALE: faixa declarada ${faixaDeclarada} < faixa exigida ${r.faixaExigida}. Anuncie a faixa nova e volte à etapa 3 (ficha/plano).`
    if (values.json) console.error(msg)
    else console.log(`\n${msg}`)
    return 1
  }
  return 0
}

try {
  process.exitCode = principal()
} catch (e) {
  process.exitCode = tratarErro('classificar-diff', e)
}
