#!/usr/bin/env node
// Adaptado do SophIA (.claude/scripts/auditar-dependencias.ps1) para o CronoAI em 25/10/2026.
//
// Auditoria de dependências npm: vulnerabilidades por severidade, separando produção
// (dependencies) × desenvolvimento (devDependencies), e — com --base — as dependências
// novas/alteradas no package.json e a licença de cada uma.
//
// Uso:
//   node .claude/scripts/auditar-dependencias.mjs [--base <ref>] [--json]
//
// Parâmetros:
//   --base <ref>   compara o package.json do merge-base com <ref> e o atual; lista
//                  dependências novas, alteradas e removidas, com a licença instalada
//                  (node_modules/<pacote>/package.json).
//   --json         saída em JSON.
//   --help         mostra esta ajuda.
//
// Comandos: `npm audit --json` (todas) e `npm audit --omit=dev --json` (produção).
// Precisa de rede (registry npm) e do package-lock.json. Não roda `npm audit fix`.
//
// Política (boa prática geral, alinhada ao CI que audita só produção; prazos de
// correção seguem a política da Segurança da Informação):
//   alta/crítica em produção -> exit 1
//   demais (inclusive alta/crítica só de desenvolvimento) -> aviso
// Licença fora de MIT/ISC/BSD/0BSD/Apache-2.0 -> sinalizada para revisão do Jurídico.
// Pacote novo exige revisão de segurança e de licenciamento antes de produção.
//
// Exit: 0 sem alta/crítica em produção | 1 alta/crítica em produção | 2 auditoria não executada.

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'
import { compararDependencias, executar, raizRepo, resolverBase, tratarErro } from './lib/regras-cronoai.mjs'

const AJUDA = `Uso: node .claude/scripts/auditar-dependencias.mjs [--base <ref>] [--json]

  --base <ref>   lista dependências novas/alteradas desde o merge-base e suas licenças
  --json         saída em JSON
  --help         esta ajuda

Exit: 0 ok | 1 alta/crítica em produção | 2 auditoria não executada`

const SEVERIDADES = ['critical', 'high', 'moderate', 'low', 'info']
const LICENCAS_OK = new Set(['MIT', 'ISC', 'BSD-2-CLAUSE', 'BSD-3-CLAUSE', '0BSD', 'APACHE-2.0'])

function auditar(args) {
  const r = executar('npm', ['audit', '--json', ...args], { capturar: true, timeoutMs: 180_000 })
  let json
  try { json = JSON.parse(r.stdout) } catch {
    return { erro: `saída de "npm audit ${args.join(' ')}" ilegível (sem rede ou sem package-lock.json?)` }
  }
  if (json.error) return { erro: `npm audit devolveu erro: ${json.error.summary ?? json.error.code ?? 'desconhecido'}` }
  const pacotes = Object.entries(json.vulnerabilities ?? {}).map(([nome, v]) => ({
    nome,
    severidade: v.severity,
    direta: Boolean(v.isDirect),
    correcao: v.fixAvailable === false ? 'sem correção' : (typeof v.fixAvailable === 'object' ? `${v.fixAvailable.name}@${v.fixAvailable.version}${v.fixAvailable.isSemVerMajor ? ' (major)' : ''}` : 'npm audit fix'),
  }))
  return { pacotes }
}

function contar(pacotes) {
  const c = Object.fromEntries(SEVERIDADES.map((s) => [s, 0]))
  for (const p of pacotes) c[p.severidade] = (c[p.severidade] ?? 0) + 1
  return c
}

/** Licença instalada do pacote (campo license/licenses do package.json em node_modules). */
function licencaDe(nome) {
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(nome)) return { licenca: null, situacao: 'nome inválido' }
  const arq = path.join(raizRepo(), 'node_modules', ...nome.split('/'), 'package.json')
  if (!existsSync(arq)) return { licenca: null, situacao: 'não instalado (rode npm ci)' }
  try {
    const pkg = JSON.parse(readFileSync(arq, 'utf8'))
    let lic = pkg.license ?? pkg.licenses
    if (Array.isArray(lic)) lic = lic.map((l) => l.type ?? l).join(' OR ')
    else if (lic && typeof lic === 'object') lic = lic.type
    if (!lic) return { licenca: null, situacao: 'sem licença declarada — revisar com o Jurídico' }
    return { licenca: String(lic), situacao: licencaAceita(String(lic)) ? 'ok' : 'revisar com o Jurídico' }
  } catch {
    return { licenca: null, situacao: 'package.json ilegível' }
  }
}

/** Expressão SPDX simples: OR = basta uma aceita; AND = todas aceitas. */
function licencaAceita(expr) {
  const limpa = expr.replace(/[()]/g, ' ').trim().toUpperCase()
  return limpa.split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).every((l) => LICENCAS_OK.has(l.trim())))
}

function principal() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      json: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
  })
  if (values.help) { console.log(AJUDA); return 0 }

  if (!existsSync(path.join(raizRepo(), 'package-lock.json'))) {
    console.error('auditar-dependencias: package-lock.json não encontrado (rode npm install).')
    return 2
  }

  const todas = auditar([])
  const producao = auditar(['--omit=dev'])
  const naoExecutado = [todas.erro, producao.erro].filter(Boolean)

  const nomesProd = new Set((producao.pacotes ?? []).map((p) => p.nome))
  const prod = producao.pacotes ?? []
  const dev = (todas.pacotes ?? []).filter((p) => !nomesProd.has(p.nome))
  const resumo = { producao: contar(prod), desenvolvimento: contar(dev) }

  let deps = null
  if (values.base) {
    const ref = resolverBase(values.base)
    const cmp = compararDependencias(ref)
    const comLicenca = (lista) => lista.map((d) => ({ ...d, ...licencaDe(d.nome) }))
    deps = { base: values.base, mergeBase: ref, novas: comLicenca(cmp.novas), alteradas: comLicenca(cmp.alteradas), removidas: cmp.removidas }
  }

  const bloqueiaProd = resumo.producao.critical + resumo.producao.high > 0

  if (values.json) {
    console.log(JSON.stringify({ resumo, producao: prod, desenvolvimento: dev, naoExecutado, dependencias: deps, bloqueia: bloqueiaProd }, null, 2))
  } else {
    const linhaResumo = (c) => SEVERIDADES.slice(0, 4).map((s) => `${s} ${c[s]}`).join(' · ')
    console.log('Vulnerabilidades (npm audit):')
    console.log(`  produção:        ${producao.erro ? 'não executado' : linhaResumo(resumo.producao)}`)
    console.log(`  desenvolvimento: ${todas.erro ? 'não executado' : linhaResumo(resumo.desenvolvimento)}`)
    const listar = (titulo, lista) => {
      if (!lista.length) return
      console.log(`\n${titulo}:`)
      const ordenada = [...lista].sort((a, b) => SEVERIDADES.indexOf(a.severidade) - SEVERIDADES.indexOf(b.severidade))
      for (const p of ordenada) console.log(`  [${p.severidade}] ${p.nome}${p.direta ? ' (direta)' : ''} — correção: ${p.correcao}`)
    }
    listar('Produção', prod)
    listar('Somente desenvolvimento', dev)
    for (const e of naoExecutado) console.log(`\n[não rodou] ${e}`)

    if (deps) {
      console.log(`\nDependências desde ${deps.base} (merge-base ${deps.mergeBase.slice(0, 8)}):`)
      if (!deps.novas.length && !deps.alteradas.length && !deps.removidas.length) console.log('  nenhuma mudança no package.json.')
      for (const d of deps.novas) console.log(`  + ${d.nome}@${d.versao} (${d.secao}) — licença: ${d.licenca ?? '?'} [${d.situacao}]`)
      for (const d of deps.alteradas) console.log(`  ~ ${d.nome} ${d.versaoAnterior} → ${d.versao} (${d.secao}) — licença: ${d.licenca ?? '?'} [${d.situacao}]`)
      for (const d of deps.removidas) console.log(`  - ${d.nome}@${d.versao} (${d.secao})`)
      if ([...deps.novas, ...deps.alteradas].some((d) => d.situacao !== 'ok')) {
        console.log('  Licença fora de MIT/ISC/BSD/Apache-2.0 ou não verificada: valide com o Jurídico antes de produção.')
      }
      if (deps.novas.length) console.log('  Pacote novo exige revisão de segurança e de licenciamento antes de produção (CLAUDE.md › Validações com outras áreas).')
    }

    if (bloqueiaProd) {
      console.log('\nBLOQUEIA: vulnerabilidade alta/crítica em dependência de PRODUÇÃO (o CI também falha no audit de produção).')
      console.log('Prazo de correção: siga a política da Segurança da Informação. Atualizar pacote = mudança de dependência (revisão de segurança e licença).')
    }
  }

  if (bloqueiaProd) return 1
  if (producao.erro) return 2
  return 0
}

try {
  process.exitCode = principal()
} catch (e) {
  process.exitCode = tratarErro('auditar-dependencias', e)
}
