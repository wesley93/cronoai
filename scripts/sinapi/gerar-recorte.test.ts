// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { validarRecorteSinapi } from '@/lib/recorteSinapi'
import { USO, estaDentroDe, executar } from './gerar-recorte.ts'
import { COMPOSICOES_SINTETICAS, criarPlanilhaSinapiSintetica } from './__testes__/sinapiSintetico.ts'

let base: string
let repo: string
let ref: string
let xlsx: string
const RAIZ_REAL = fileURLToPath(new URL('../..', import.meta.url))

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'cronoai-recorte-'))
  repo = join(base, 'repo')
  ref = join(base, 'referencias')
  mkdirSync(join(repo, 'src'), { recursive: true })
  mkdirSync(join(repo, 'public'), { recursive: true })
  mkdirSync(join(ref, 'sinapi', '2026-09', 'xlsx'), { recursive: true })
  // O nome real tem acento (e no zip nacional vem em CP850): a busca é pelo nome normalizado
  xlsx = join(ref, 'sinapi', '2026-09', 'xlsx', 'SINAPI_Referência_2026_09.xlsx')
  writeFileSync(xlsx, criarPlanilhaSinapiSintetica())
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

const rodar = (argv: string[], env: Record<string, string | undefined> = { CRONOAI_REF_DIR: ref }) => executar(argv, env, repo)
const basicos = ['--uf', 'SP', '--regime', 'nao-desonerado', '--data-base', '2026-09']

describe('CLI do gerador: recorte válido (AC-7)', () => {
  it('acha a planilha pela data-base, grava o recorte válido em $CRONOAI_REF_DIR/recortes e resume', () => {
    const r = rodar(basicos)
    expect(r.erros).toEqual([])
    expect(r.codigo).toBe(0)
    const destino = join(ref, 'recortes', 'recorte-sinapi-SP-nao-desonerado-2026-09.json')
    expect(r.saida[0]).toBe(`Recorte gravado em ${destino}`)
    expect(r.saida[1]).toMatch(/^SP · 2026-09 · nao-desonerado: 5 composição\(ões\)/)
    expect(r.saida[2]).toBe('Fora do recorte: 1 sem custo e 0 com custo zero na UF.')
    const lido = JSON.parse(readFileSync(destino, 'utf8'))
    const v = validarRecorteSinapi(lido)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.recorte.composicoes.map((c) => c.codigo)).toEqual(['103332', '104658', '103681', '107113', '999001'])
    // Compacto: sem indentação
    expect(readFileSync(destino, 'utf8')).not.toContain('\n')
  })

  it('--arquivo, --codigos, --grupos e --saida explícitos', () => {
    const saida = join(base, 'fora', 'meu.json')
    const r = rodar(['--uf', 'sc', '--regime', 'desonerado', '--arquivo', xlsx, '--codigos', '103681', '--grupos', 'Fundações', '--saida', saida], {})
    expect(r.erros).toEqual([])
    const v = validarRecorteSinapi(JSON.parse(readFileSync(saida, 'utf8')))
    expect(v.ok && v.recorte.composicoes.map((c) => c.codigo)).toEqual(['103681', '107113'])
    expect(v.ok && v.recorte.uf).toBe('SC')
  })
})

describe('CLI do gerador: recusas', () => {
  it('saída dentro do repositório (src/, public/ e a raiz) é recusada, sem ler a planilha', () => {
    for (const destino of [join(repo, 'src', 'r.json'), join(repo, 'public', 'r.json'), join(repo, 'r.json'), join(repo, 'src', '..', 'src', 'x', 'r.json')]) {
      const r = rodar([...basicos, '--saida', destino])
      expect(r.codigo).toBe(2)
      expect(r.erros).toEqual(['A saída não pode ficar dentro do repositório (inclusive src/ e public/, que vão no bundle). Use uma pasta fora dele.'])
      expect(existsSync(destino)).toBe(false)
    }
  })

  it('não sobrescreve sem --sobrescrever; com a opção, sobrescreve', () => {
    const saida = join(base, 'dupla.json')
    expect(rodar([...basicos, '--saida', saida]).codigo).toBe(0)
    const r = rodar([...basicos, '--saida', saida])
    expect(r.codigo).toBe(2)
    expect(r.erros).toEqual(['O arquivo de saída já existe. Use --sobrescrever para trocá-lo.'])
    expect(rodar([...basicos, '--saida', saida, '--sobrescrever']).codigo).toBe(0)
  })

  it('opções inválidas ou ausentes', () => {
    expect(rodar(['--uf', 'XX', '--regime', 'desonerado', '--data-base', '2026-09']).erros[0]).toBe('Informe --uf com uma sigla de UF válida (ex.: SP).')
    expect(rodar(['--uf', 'SP', '--regime', 'x', '--data-base', '2026-09']).erros[0]).toBe('Informe --regime nao-desonerado ou desonerado.')
    expect(rodar(['--uf', 'SP', '--regime', 'desonerado', '--data-base', '2026-9']).erros[0]).toBe('A --data-base deve estar no formato AAAA-MM (ex.: 2026-09).')
    expect(rodar(['--uf', 'SP', '--regime', 'desonerado']).erros[0]).toBe('Informe --data-base ou --arquivo.')
    expect(rodar([...basicos, '--codigos', '12,ab']).erros[0]).toBe('Os --codigos devem ser números separados por vírgula.')
    expect(rodar([...basicos, '--nao-existe']).erros[0]).toBe('Opção desconhecida ou sem valor.')
    expect(rodar(basicos, {}).erros[0]).toBe('Sem --saida e sem CRONOAI_REF_DIR: informe onde gravar o recorte (fora do repositório).')
    expect(rodar([...basicos, '--saida', join(base, 'x.json')], {}).erros[0]).toBe('Sem --arquivo e sem CRONOAI_REF_DIR: informe a planilha.')
  })

  it('planilha não encontrada, arquivo que não é xlsx e mês diferente do pedido', () => {
    expect(rodar(['--uf', 'SP', '--regime', 'desonerado', '--data-base', '2026-08', '--saida', join(base, 'a.json')]).erros[0]).toMatch(/não encontrada em CRONOAI_REF_DIR\/sinapi\/2026-08\/xlsx\//)
    const txt = join(base, 'x.txt')
    writeFileSync(txt, 'x')
    expect(rodar(['--uf', 'SP', '--regime', 'desonerado', '--arquivo', txt, '--saida', join(base, 'b.json')]).erros[0]).toBe('O arquivo da planilha não existe ou não é .xlsx.')
    const r = rodar(['--uf', 'SP', '--regime', 'nao-desonerado', '--arquivo', xlsx, '--data-base', '2026-10', '--saida', join(base, 'c.json')])
    expect(r.erros).toEqual(['O mês de referência da planilha (2026-09) não é o esperado (2026-10).'])
    expect(existsSync(join(base, 'c.json'))).toBe(false)
  })

  it('planilha que não é um zip e UF fora da planilha dão mensagem em português, sem pilha nem conteúdo', () => {
    const lixo = join(base, 'lixo.xlsx')
    writeFileSync(lixo, 'conteúdo qualquer que não é zip, com mais de vinte e dois bytes SEGREDO')
    const r = rodar(['--uf', 'SP', '--regime', 'desonerado', '--arquivo', lixo, '--saida', join(base, 'd.json')])
    expect(r.erros).toEqual(['O arquivo não é um zip válido (fim do diretório central não encontrado).'])
    expect(r.erros.join(' ')).not.toContain('SEGREDO')
    expect(rodar(['--uf', 'BA', '--regime', 'nao-desonerado', '--arquivo', xlsx, '--saida', join(base, 'e.json')]).erros).toEqual(['A UF BA não existe na aba CSD da planilha.'])
  })

  it('recorte acima de 6 MiB sugere filtro e não grava', () => {
    const longa = 'D'.repeat(390)
    const comps = Array.from({ length: 16_000 }, (_, i) => ({ ...COMPOSICOES_SINTETICAS[4]!, codigo: String(200_000 + i), descricao: longa, itens: COMPOSICOES_SINTETICAS[0]!.itens }))
    const grande = join(base, 'grande.xlsx')
    writeFileSync(grande, criarPlanilhaSinapiSintetica({ composicoes: comps }))
    const r = rodar(['--uf', 'SP', '--regime', 'nao-desonerado', '--arquivo', grande, '--saida', join(base, 'grande.json')])
    expect(r.codigo).toBe(1)
    expect(r.erros[0]).toMatch(/acima do limite de 6 MiB do app\. Use --codigos ou --grupos para reduzir\.$/)
    expect(existsSync(join(base, 'grande.json'))).toBe(false)
  }, 60_000)

  it('--ajuda mostra o uso', () => {
    expect(rodar(['--ajuda'])).toEqual({ codigo: 0, saida: [USO], erros: [] })
  })
})

describe('estaDentroDe', () => {
  it('compara pelo caminho resolvido (.. não escapa) e aceita pasta irmã', () => {
    expect(estaDentroDe(join(repo, 'a', '..', 'b.json'), repo)).toBe(true)
    expect(estaDentroDe(join(repo, '..', 'repo-irmao', 'b.json'), repo)).toBe(false)
    expect(estaDentroDe(join(base, 'fora.json'), repo)).toBe(false)
  })
})

describe('CLI como processo Node (type stripping)', () => {
  it('node --experimental-strip-types roda o script e importa sinapiRup.ts (R-1)', () => {
    const saida = execFileSync(process.execPath, ['--experimental-strip-types', join(RAIZ_REAL, 'scripts', 'sinapi', 'gerar-recorte.ts'), '--ajuda'], { encoding: 'utf8' })
    expect(saida).toContain('Uso: npm run sinapi:recorte')
  })

  it('o processo grava o recorte, usa o código de saída 2 na recusa e escreve o erro em stderr', () => {
    const script = join(RAIZ_REAL, 'scripts', 'sinapi', 'gerar-recorte.ts')
    const ok = spawnSync(process.execPath, ['--experimental-strip-types', script, ...basicos, '--saida', join(base, 'proc.json')], { encoding: 'utf8', env: { ...process.env, CRONOAI_REF_DIR: ref } })
    expect(ok.status).toBe(0)
    expect(existsSync(join(base, 'proc.json'))).toBe(true)
    const dentro = spawnSync(process.execPath, ['--experimental-strip-types', script, ...basicos, '--saida', join(RAIZ_REAL, 'src', 'recorte.json')], { encoding: 'utf8', env: { ...process.env, CRONOAI_REF_DIR: ref } })
    expect(dentro.status).toBe(2)
    expect(dentro.stderr).toContain('A saída não pode ficar dentro do repositório')
    expect(existsSync(join(RAIZ_REAL, 'src', 'recorte.json'))).toBe(false)
  })
})
