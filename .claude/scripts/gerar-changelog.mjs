#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/gerar-changelog.ps1) para o CronoAI em 25/10/2026.
//
// Rascunho de changelog (Markdown) a partir dos commits <base>..HEAD em Conventional
// Commits, agrupados por tipo, com o cabeçalho no formato do TEMPLATE-CHANGELOG
// (data, issue, faixa, o que mudou, arquivos principais, pós-entrega). Campos que só
// quem fez a mudança sabe ficam com marcador {…}: o script não inventa descrição.
//
// Uso:
//   node .claude/scripts/gerar-changelog.mjs --base <ref> [--versao X.Y.Z]
//
// Parâmetros:
//   --base <ref>       ref de comparação (padrão: master). Commits = git log <ref>..HEAD, sem merges.
//   --versao X.Y.Z     versão do título (ex.: 1.2.0). Sem ela: "não lançado".
//   --help             mostra esta ajuda.
//
// Grupos: Mudanças incompatíveis (tipo! ou BREAKING CHANGE), Funcionalidades (feat),
//         Correções (fix), Documentação (docs), Build/CI (build, ci), Outros (demais
//         tipos e commits fora do padrão). A linha Co-Authored-By não entra.
//
// Saída: stdout (redirecione para arquivo se quiser). Exit: 0 ok | 2 erro de parâmetro/base.

import process from 'node:process'
import { parseArgs } from 'node:util'
import {
  ErroScript, arquivosAlterados, classificar, git, linhasAdicionadas, tratarErro, validarRef,
} from './lib/regras-cronoai.mjs'

const AJUDA = `Uso: node .claude/scripts/gerar-changelog.mjs --base <ref> [--versao X.Y.Z]

  --base <ref>     ref de comparação (padrão: master); commits = git log <ref>..HEAD
  --versao X.Y.Z   versão do título (padrão: "não lançado")
  --help           esta ajuda

Exit: 0 ok | 2 erro`

const GRUPOS = [
  ['breaking', 'Mudanças incompatíveis'],
  ['feat', 'Funcionalidades'],
  ['fix', 'Correções'],
  ['docs', 'Documentação'],
  ['buildci', 'Build/CI'],
  ['outros', 'Outros'],
]
const CABECALHO_CC = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/

function grupoDe(tipo) {
  if (tipo === 'feat') return 'feat'
  if (tipo === 'fix') return 'fix'
  if (tipo === 'docs') return 'docs'
  if (tipo === 'build' || tipo === 'ci') return 'buildci'
  return 'outros'
}

function lerCommits(base) {
  const SEP_CAMPO = '\u001f'
  const SEP_COMMIT = '\u001e'
  const saida = git(['log', `${base}..HEAD`, '--no-merges', `--pretty=format:%h${SEP_CAMPO}%s${SEP_CAMPO}%b${SEP_COMMIT}`])
  return saida.split(SEP_COMMIT).map((c) => c.replace(/^\s+/, '')).filter(Boolean).map((c) => {
    const [sha, assunto, corpo = ''] = c.split(SEP_CAMPO)
    const m = CABECALHO_CC.exec(assunto.trim())
    const corpoLimpo = corpo.split(/\r?\n/).filter((l) => !/^co-authored-by:/i.test(l.trim())).join('\n').trim()
    const breaking = Boolean(m?.[3]) || /^BREAKING[ -]CHANGE:/m.test(corpoLimpo)
    return {
      sha,
      tipo: m ? m[1].toLowerCase() : null,
      escopo: m?.[2] ?? null,
      descricao: m ? m[4].trim() : assunto.trim(),
      breaking,
      notaBreaking: /^BREAKING[ -]CHANGE:\s*(.+)$/m.exec(corpoLimpo)?.[1]?.trim() ?? null,
    }
  })
}

function principal() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string', default: 'master' },
      versao: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(AJUDA); return 0 }
  validarRef(values.base)
  if (values.versao && !/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(values.versao)) {
    throw new ErroScript(`--versao deve ser X.Y.Z (recebido: ${values.versao})`)
  }
  if (!git(['rev-parse', '--verify', '--quiet', `${values.base}^{commit}`], { permitirFalha: true }).trim()) {
    throw new ErroScript(`Base não encontrada: ${values.base}`)
  }

  const commits = lerCommits(values.base)
  const branch = git(['branch', '--show-current'], { permitirFalha: true }).trim() || '(HEAD destacado)'
  const sha = git(['rev-parse', '--short', 'HEAD']).trim()
  const hoje = new Date().toISOString().slice(0, 10)

  // Faixa sugerida pela mesma triagem do classificar-diff (commits da branch).
  const diff = arquivosAlterados({ base: values.base })
  const triagem = classificar({
    arquivos: diff.arquivos,
    removidos: diff.removidos,
    novas: linhasAdicionadas({ ref: diff.ref }),
    ref: diff.ref,
  })
  // Código primeiro (src/, backend), depois raiz e infraestrutura; docs/.claude/.github por último.
  const peso = (a) => (/^(src|api|backend|server)\//.test(a) ? 0 : /^(docs|\.github)\/|\.md$/.test(a) ? 2 : 1)
  const principais = diff.arquivos
    .filter((a) => !/^\.claude\//.test(a))
    .sort((a, b) => peso(a) - peso(b) || a.localeCompare(b))
    .slice(0, 8)

  const grupos = new Map(GRUPOS.map(([k]) => [k, []]))
  for (const c of commits) {
    const grupo = c.tipo ? grupoDe(c.tipo) : 'outros'
    // Em "Outros" o tipo aparece (chore, refactor, test...), já que o grupo não o diz.
    const rotulo = grupo === 'outros' && c.tipo ? `${c.tipo}${c.escopo ? `(${c.escopo})` : ''}` : c.escopo
    const item = `- ${rotulo ? `**${rotulo}:** ` : ''}${c.descricao} (\`${c.sha}\`)`
    if (c.breaking) grupos.get('breaking').push(`${item}${c.notaBreaking ? ` — ${c.notaBreaking}` : ''}`)
    grupos.get(grupo).push(item)
  }

  const obrigatorios = [triagem.seguranca && 'seguranca', triagem.especialistaObra && 'especialista-obra'].filter(Boolean)
  const md = []
  md.push(`## Changelog — ${values.versao ? `v${values.versao}` : 'não lançado'}`)
  md.push('')
  md.push(`- **Data:** ${hoje}`)
  md.push(`- **Branch:** \`${branch}\` @ \`${sha}\` (base: \`${values.base}\`, ${commits.length} commit(s))`)
  md.push('- **Issue:** {#número | —}')
  md.push(`- **Faixa:** {1 | 2 | 3} (exigida pelo classificar-diff: ${triagem.faixaExigida}${triagem.motivos.length ? ` — ${triagem.motivos.join(', ')}` : ''})  ·  **Agentes:** {lista}${obrigatorios.length ? ` (obrigatórios pela triagem: ${obrigatorios.join(', ')})` : ''}`)
  md.push('- **O que mudou:** {1–3 linhas, linguagem de quem usa}')
  md.push(`- **Arquivos principais:** ${principais.length ? principais.map((a) => `\`${a}\``).join(', ') : '—'}${diff.arquivos.length > principais.length ? ` (+${diff.arquivos.length - principais.length})` : ''}`)
  md.push('- **Números alterados** (T1/T2): {antes → depois, teste que fixa | —}')
  md.push('- **Pós-entrega:** {migração do estado salvo / variável nova / ação de Infra | nenhum}')
  for (const [k, titulo] of GRUPOS) {
    const itens = grupos.get(k)
    if (!itens.length) continue
    md.push('')
    md.push(`### ${titulo}`)
    md.push('')
    md.push(...itens)
  }
  if (!commits.length) {
    md.push('')
    md.push('_Nenhum commit além da base._')
  }
  console.log(md.join('\n'))
  return 0
}

try {
  process.exitCode = principal()
} catch (e) {
  process.exitCode = tratarErro('gerar-changelog', e)
}
