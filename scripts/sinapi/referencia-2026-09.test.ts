// @vitest-environment node
// Teste de REFERÊNCIA (só local): confere o leitor e o gerador com a planilha oficial SINAPI_Referencia_2026_09.xlsx (Caixa, mês de
// referência 09/2026, emissão 09/10/2026), que fica FORA do git. Roda com CRONOAI_REF_DIR=<pasta referencias> (o arquivo é lido de
// ${CRONOAI_REF_DIR}/sinapi/2026-09/xlsx/); sem a variável a suíte é pulada por `describe.skipIf` (o CI não depende da planilha).
// Plano 00006: tabelas 4.1 (CP-1 a CP-8) e 4.2 (21 composições), CR-11, CR-13 e CR-14.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { validarRecorteSinapi } from '@/lib/recorteSinapi'
import { horasPorDia } from '@/lib/calendarioTrabalho'
import { durationFromTeam, scheduleDays, totalManHours } from '@/lib/sinapi'
import { equipeDaComposicao, funcaoPrincipal, notasDaTarefaSinapi, recursosDaEquipe, rotuloFuncao } from '@/lib/sinapiRup'
import { lerSinapi, normalizar, type DadosSinapi } from './layout2025.ts'
import { abrirPlanilha, type Planilha } from './planilha.ts'
import { montarRecorte, sha256Hex } from './recorte.ts'
import { abrirZip, type LeitorZip } from './zip.ts'

const REF = process.env.CRONOAI_REF_DIR
const ARQUIVO = REF ? join(REF, 'sinapi', '2026-09', 'xlsx', 'SINAPI_Referencia_2026_09.xlsx') : ''
/** Máximo sem espalhar o array (centenas de milhares de itens estouram a pilha em `Math.max(...)`). */
const maximo = (xs: Iterable<number>) => {
  let m = -Infinity
  for (const x of xs) if (x > m) m = x
  return m
}
const temArquivo = !!REF && existsSync(ARQUIVO)

describe.skipIf(!temArquivo)('planilha SINAPI 09/2026 (referência local)', () => {
  let bytes: Buffer
  let zip: LeitorZip
  let planilha: Planilha
  let csd: DadosSinapi
  let ccd: DadosSinapi
  let tempoLeituraMs = 0

  beforeAll(() => {
    const t0 = performance.now()
    bytes = readFileSync(ARQUIVO)
    zip = abrirZip(bytes)
    planilha = abrirPlanilha(zip)
    csd = lerSinapi(planilha, 'nao-desonerado', '2026-09')
    ccd = lerSinapi(planilha, 'desonerado', '2026-09')
    tempoLeituraMs = performance.now() - t0
    process.stdout.write(`[referencia-2026-09] leitura do xlsx (CSD + CCD + Analítico): ${Math.round(tempoLeituraMs)} ms\n`)
  }, 300_000)

  const recorteDe = (dados: DadosSinapi, uf: string) => montarRecorte(dados, { uf, arquivo: 'SINAPI_Referencia_2026_09.xlsx', sha256: sha256Hex(bytes), bytes: bytes.length, geradoEm: '2026-10-25T12:00:00.000Z' })

  describe('CP-1 estrutura do zip', () => {
    it('30 entradas; maior 23.174.487 bytes; 120.247.758 descompactados; razões', () => {
      expect(bytes.length).toBe(13_631_798)
      expect(sha256Hex(bytes)).toBe('9f1a69dfbe103bdaecb39b871a74435c364b4e6652fdbc677d8537e6742cf0d2')
      expect(zip.entradas).toHaveLength(30)
      expect(Math.max(...zip.entradas.map((e) => e.tamanhoDeclarado))).toBe(23_174_487)
      expect(zip.entradas.reduce((s, e) => s + e.tamanhoDeclarado, 0)).toBe(120_247_758)
      const razao = (e: { tamanhoDeclarado: number; tamanhoComprimido: number }) => e.tamanhoDeclarado / e.tamanhoComprimido
      expect(Math.max(...zip.entradas.map(razao))).toBeCloseTo(59.7, 1)
      expect(razao(zip.entradas.find((e) => e.nome === 'xl/sharedStrings.xml')!)).toBeCloseTo(11.2, 1)
      // Abas de custo ~8,1 (CSD, CCD e CSE)
      const sheets = zip.entradas.filter((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.nome)).sort((a, b) => b.tamanhoDeclarado - a.tamanhoDeclarado)
      expect(razao(sheets[0]!)).toBeGreaterThan(7.9)
      expect(razao(sheets[0]!)).toBeLessThan(8.3)
    })
  })

  describe('CP-2 cabeçalhos', () => {
    it('abas e linhas de cabeçalho', () => {
      expect(planilha.abas.map(normalizar)).toEqual(['MENU', 'BUSCA', 'ISD', 'ICD', 'ISE', 'CSD', 'CCD', 'CSE', 'ANALITICO', 'ANALITICO COM CUSTO'])
      const topo = [...planilha.linhas('CSD')].slice(0, 12)
      const texto = (n: number) => topo.find((l) => l.numero === n)!.celulas.map((c) => normalizar(String(c.valor ?? '')))
      expect(texto(10).slice(0, 5)).toEqual(['GRUPO', 'CODIGO DA COMPOSICAO', 'DESCRICAO', 'UNIDADE', 'CUSTO (R$)'])
      expect(texto(6)).toContain('HORISTA')
      expect(texto(7)).toContain('MENSALISTA')
      expect(texto(9).filter((t) => /^[A-Z]{2}$/.test(t))).toHaveLength(27)
      const analitico = [...planilha.linhas('Analítico')].slice(0, 11)
      expect(analitico.find((l) => l.numero === 10)!.celulas.map((c) => normalizar(String(c.valor ?? '')))).toEqual(['GRUPO', 'CODIGO DA COMPOSICAO', 'TIPO ITEM', 'CODIGO DO ITEM', 'DESCRICAO', 'UNIDADE', 'COEFICIENTE', 'SITUACAO'])
      expect(csd.custos.ufs).toHaveLength(27)
    })
  })

  describe('CP-3 código pela fórmula', () => {
    it('10.599 composições em CSD, CCD e CSE, todas com HYPERLINK; 10.599 no Analítico; nenhuma divergência', () => {
      for (const aba of ['CSD', 'CCD', 'CSE']) {
        let comFormula = 0
        let semFormula = 0
        for (const l of planilha.linhas(aba)) {
          if (l.numero <= 10) continue
          const b = l.celulas.find((c) => c.coluna === 2)
          if (!b) continue
          if (b.formula && /HYPERLINK\(/.test(b.formula) && /,\s*\d{1,7}\s*\)\s*$/.test(b.formula)) comFormula++
          else semFormula++
        }
        expect([aba, comFormula, semFormula]).toEqual([aba, 10_599, 0])
      }
      expect(csd.custos.composicoes).toHaveLength(10_599)
      expect(ccd.custos.composicoes).toHaveLength(10_599)
      expect(csd.analitico.composicoes.size).toBe(10_599)
      // lerSinapi já recusa código só de um lado e descrição ou unidade divergente: se chegou aqui, são 0
      expect(new Set(csd.custos.composicoes.map((c) => c.codigo))).toEqual(new Set(ccd.custos.composicoes.map((c) => c.codigo)))
    }, 120_000)
  })

  describe('CP-4 situação, itens e códigos', () => {
    it('8.444 COM CUSTO e 2.155 SEM CUSTO; SEM CUSTO com custo 0 em todas as UFs e regimes; itens; 4 a 6 dígitos', () => {
      const situacao = new Map<string, number>()
      for (const c of csd.analitico.composicoes.values()) situacao.set(c.situacao, (situacao.get(c.situacao) ?? 0) + 1)
      expect([...situacao.entries()].sort()).toEqual([['COM CUSTO', 8444], ['SEM CUSTO', 2155]])
      for (const d of [csd, ccd]) {
        for (const c of d.custos.composicoes) {
          if (d.analitico.composicoes.get(c.codigo)!.situacao !== 'SEM CUSTO') continue
          for (const v of c.custos.values()) expect(v.custo).toBe(0)
        }
      }
      expect(csd.analitico.contagens).toMatchObject({ itensComposicao: 34_583, itensInsumo: 21_985 })
      const digitos = new Set(csd.custos.composicoes.map((c) => c.codigo.length))
      expect([...digitos].sort()).toEqual([4, 5, 6])
    })
  })

  describe('CP-5 mão de obra', () => {
    it('16.561 itens; 61 funções; 8.595 composições com mão de obra (1 função: 1.484; 2: 6.553; 3: 379; até 7); maior coeficiente 345,33', () => {
      expect(csd.analitico.contagens).toMatchObject({ itensMaoDeObra: 16_561, funcoes: 61 })
      const porNumero = new Map<number, number>()
      let maior = 0
      for (const c of csd.analitico.composicoes.values()) {
        porNumero.set(c.maoDeObra.length, (porNumero.get(c.maoDeObra.length) ?? 0) + 1)
        for (const f of c.maoDeObra) maior = Math.max(maior, f.coeficiente)
      }
      expect(porNumero.get(1)).toBe(1484)
      expect(porNumero.get(2)).toBe(6553)
      expect(porNumero.get(3)).toBe(379)
      expect(Math.max(...porNumero.keys())).toBe(7)
      expect(10_599 - (porNumero.get(0) ?? 0)).toBe(8595)
      expect(maior).toBe(345.33)
    })
  })

  describe('CP-6 encargos por UF (CR-10)', () => {
    it('SP CSD/CCD, BA CSD, AM CSD, RS CCD', () => {
      expect(csd.custos.encargos.get('SP')).toEqual({ horista: 1.1501, mensalista: 0.7118 })
      expect(ccd.custos.encargos.get('SP')).toEqual({ horista: 0.9909, mensalista: 0.5851 })
      expect(csd.custos.encargos.get('BA')).toEqual({ horista: 1.1773, mensalista: 0.7285 })
      expect(csd.custos.encargos.get('AM')).toEqual({ horista: 1.1416, mensalista: 0.708 })
      expect(ccd.custos.encargos.get('RS')).toEqual({ horista: 0.9612, mensalista: 0.5667 })
    })
  })

  describe('CP-7 e CR-11 recorte sem filtro (D-7)', () => {
    it('SP CSD: 8.443 composições (6.842 com mão de obra); 2.155 SEM CUSTO; excluída por custo 0: só a 104088', () => {
      const r = recorteDe(csd, 'SP')
      expect(r.totais).toEqual({ composicoes: 8443, excluidasSemCusto: 2155, excluidasCustoZeroNaUf: 1 })
      expect(r.composicoes.filter((c) => c.maoDeObra.length).length).toBe(6842)
      expect(r.composicoes.some((c) => c.codigo === '104088')).toBe(false)
      expect(r.composicoes.filter((c) => c.grupo === 'Alvenaria de Vedação')).toHaveLength(28)
      expect(validarRecorteSinapi(JSON.parse(JSON.stringify(r))).ok).toBe(true)
    })

    it('SP CCD 8.443; AM CSD 8.444; ES CSD 8.442 (95137 e 104088 fora)', () => {
      expect(recorteDe(ccd, 'SP').totais.composicoes).toBe(8443)
      expect(recorteDe(csd, 'AM').totais).toEqual({ composicoes: 8444, excluidasSemCusto: 2155, excluidasCustoZeroNaUf: 0 })
      const es = recorteDe(csd, 'ES')
      expect(es.totais).toEqual({ composicoes: 8442, excluidasSemCusto: 2155, excluidasCustoZeroNaUf: 2 })
      expect(es.composicoes.some((c) => c.codigo === '95137' || c.codigo === '104088')).toBe(false)
    })

    it('tarefa 0: a 104094 também tem custo 0 em 4 UFs no CSD (AP, GO, MG, SC); a 104088 em 21', () => {
      const zeradas = (codigo: string) => csd.custos.ufs.filter((uf) => !((csd.custos.composicoes.find((c) => c.codigo === codigo)!.custos.get(uf)?.custo ?? 0) > 0))
      expect(zeradas('104094')).toEqual(['AP', 'GO', 'MG', 'SC'])
      expect(zeradas('104088')).toHaveLength(21)
      // Contagem de excluídas por custo 0 nessas UFs (a 104094 entra na conta)
      for (const uf of ['AP', 'GO', 'MG', 'SC']) expect(recorteDe(csd, uf).totais.excluidasCustoZeroNaUf).toBeGreaterThanOrEqual(1)
      expect(recorteDe(csd, 'SC').composicoes.some((c) => c.codigo === '104094')).toBe(false)
    })
  })

  describe('CP-8 tamanho do recorte SP CSD sem filtro', () => {
    it('cabe nos 6 MiB com folga; maiores textos dentro dos limites do esquema', () => {
      const r = recorteDe(csd, 'SP')
      const json = JSON.stringify(r)
      // Medido em 25/10/2026 com o formato final (com percentualAS): 3.459.176 caracteres, 3.517.844 bytes, ~410 por composição
      // (o plano media 3.399.801 / 403 sem o campo `percentualAS` por composição)
      expect(json.length).toBe(3_459_176)
      expect(Buffer.byteLength(json, 'utf8')).toBe(3_517_844)
      expect(Buffer.byteLength(json, 'utf8')).toBeLessThan(6 * 1024 * 1024)
      expect(maximo(r.composicoes.map((c) => c.descricao.length))).toBe(364)
      expect(maximo(r.composicoes.flatMap((c) => c.maoDeObra.map((f) => f.funcao.length)))).toBe(53)
      expect(maximo(r.composicoes.map((c) => c.grupo.length))).toBe(91)
      expect(maximo(r.composicoes.map((c) => c.unidade.length))).toBe(5)
      // 228.977,20 é o maior custo de toda a aba (MT, 103656); em SP o maior é 127.039,32
      expect(maximo(r.composicoes.map((c) => c.custoUnitario))).toBe(127_039.32)
      expect(maximo(csd.custos.composicoes.flatMap((c) => [...c.custos.values()].map((v) => v.custo)))).toBe(228_977.2)
    })
  })

  describe('20 composições (custo publicado ± R$ 0,01 e RUP = coeficiente) + a do empate', () => {
    // Plano 00006, tabela 4.2. Mão de obra na ordem do Analítico; "principal" pela regra D-6 (oficial de maior coeficiente).
    const casos: { cod: string; un: string; uf: string; csd: number; ccd: number; mo: [string, number][]; principal: string }[] = [
      { cod: '104658', un: 'M2', uf: 'SP', csd: 208.85, ccd: 205.36, mo: [['SERVENTE', 1.279], ['PEDREIRO', 0.639]], principal: 'PEDREIRO' },
      { cod: '103332', un: 'M2', uf: 'SP', csd: 123.96, ccd: 119.05, mo: [['SERVENTE', 0.8112688], ['PEDREIRO', 1.6225376]], principal: 'PEDREIRO' },
      { cod: '87879', un: 'M2', uf: 'BA', csd: 6.14, ccd: 5.93, mo: [['SERVENTE', 0.0255], ['PEDREIRO', 0.0681]], principal: 'PEDREIRO' },
      { cod: '87529', un: 'M2', uf: 'MG', csd: 43.76, ccd: 42.27, mo: [['SERVENTE', 0.2362], ['PEDREIRO', 0.4724]], principal: 'PEDREIRO' },
      { cod: '87414', un: 'M2', uf: 'RJ', csd: 32.01, ccd: 31.02, mo: [['SERVENTE', 0.11529], ['GESSEIRO', 0.36407]], principal: 'GESSEIRO' },
      { cod: '87630', un: 'M2', uf: 'PR', csd: 50.01, ccd: 48.77, mo: [['SERVENTE', 0.123], ['PEDREIRO', 0.245]], principal: 'PEDREIRO' },
      { cod: '87263', un: 'M2', uf: 'RS', csd: 120.6, ccd: 119.41, mo: [['SERVENTE', 0.1674], ['AZULEJISTA OU LADRILHEIRO', 0.5203]], principal: 'AZULEJISTA OU LADRILHEIRO' },
      { cod: '88489', un: 'M2', uf: 'PE', csd: 14.18, ccd: 13.82, mo: [['SERVENTE', 0.0544], ['PINTOR', 0.1631]], principal: 'PINTOR' },
      { cod: '92413', un: 'M2', uf: 'GO', csd: 118.57, ccd: 114.02, mo: [['CARPINTEIRO DE FORMAS', 2.052], ['AJUDANTE DE CARPINTEIRO', 0.376]], principal: 'CARPINTEIRO DE FORMAS' },
      { cod: '98557', un: 'M2', uf: 'CE', csd: 44.88, ccd: 44.0, mo: [['IMPERMEABILIZADOR', 0.4299], ['AJUDANTE ESPECIALIZADO', 0.0969]], principal: 'IMPERMEABILIZADOR' },
      { cod: '89357', un: 'M', uf: 'AM', csd: 40.38, ccd: 38.84, mo: [['ENCANADOR OU BOMBEIRO HIDRÁULICO', 0.488576], ['AUXILIAR DE ENCANADOR OU BOMBEIRO HIDRÁULICO', 0.488576]], principal: 'ENCANADOR OU BOMBEIRO HIDRÁULICO' },
      { cod: '92762', un: 'KG', uf: 'DF', csd: 10.93, ccd: 10.84, mo: [['ARMADOR', 0.0392], ['AJUDANTE DE ARMADOR', 0.0064]], principal: 'ARMADOR' },
      { cod: '103681', un: 'M3', uf: 'SC', csd: 904.47, ccd: 897.96, mo: [['SERVENTE', 1.145], ['PEDREIRO', 1.428], ['CARPINTEIRO DE FORMAS', 0.357]], principal: 'PEDREIRO' },
      { cod: '104219', un: 'M2', uf: 'PA', csd: 97.44, ccd: 95.66, mo: [['SERVENTE', 0.547], ['PEDREIRO', 0.547]], principal: 'PEDREIRO' },
      { cod: '91833', un: 'M', uf: 'MT', csd: 20.11, ccd: 19.42, mo: [['ELETRICISTA', 0.08], ['AUXILIAR DE ELETRICISTA', 0.08]], principal: 'ELETRICISTA' },
      { cod: '88789', un: 'M2', uf: 'ES', csd: 396.92, ccd: 393.54, mo: [['SERVENTE', 0.691], ['AZULEJISTA OU LADRILHEIRO', 1.382]], principal: 'AZULEJISTA OU LADRILHEIRO' },
      { cod: '92270', un: 'M2', uf: 'TO', csd: 191.85, ccd: 189.85, mo: [['CARPINTEIRO DE FORMAS', 0.792], ['AJUDANTE DE CARPINTEIRO', 0.179]], principal: 'CARPINTEIRO DE FORMAS' },
      { cod: '94201', un: 'M2', uf: 'MS', csd: 69.53, ccd: 68.56, mo: [['TELHADISTA', 0.1682705], ['SERVENTE', 0.5295536]], principal: 'TELHADISTA' },
      { cod: '93358', un: 'M3', uf: 'PI', csd: 93.59, ccd: 88.84, mo: [['SERVENTE', 3.9557667]], principal: 'SERVENTE' },
      { cod: '100700', un: 'UN', uf: 'RN', csd: 998.96, ccd: 986.78, mo: [['SERVENTE', 1.8305384], ['PEDREIRO', 1.7058427], ['CARPINTEIRO DE ESQUADRIAS', 4.7714472]], principal: 'CARPINTEIRO DE ESQUADRIAS' },
      { cod: '103669', un: 'M3', uf: 'SP', csd: 1050.19, ccd: 1027.49, mo: [['SERVENTE', 7.377], ['PEDREIRO', 2.459], ['CARPINTEIRO DE FORMAS', 2.459]], principal: 'PEDREIRO' },
    ]

    it.each(casos)('$cod ($uf): custo CSD e CCD ± R$ 0,01, unidade, RUP = coeficiente publicado e função principal', (c) => {
      for (const [dados, esperado] of [[csd, c.csd], [ccd, c.ccd]] as const) {
        const comp = dados.custos.composicoes.find((x) => x.codigo === c.cod)!
        expect(comp.unidade).toBe(c.un)
        expect(Math.abs(comp.custos.get(c.uf)!.custo - esperado)).toBeLessThanOrEqual(0.005)
      }
      const mo = csd.analitico.composicoes.get(c.cod)!.maoDeObra
      expect(mo.map((f) => [normalizar(f.funcao), f.coeficiente])).toEqual(c.mo.map(([f, k]) => [normalizar(f), k]))
      expect(normalizar(funcaoPrincipal(mo)!.funcao)).toBe(normalizar(c.principal))
      // O recorte da UF leva o custo e o mesmo coeficiente
      const r = recorteDe(csd, c.uf).composicoes.find((x) => x.codigo === c.cod)!
      expect(r.maoDeObra.map((f) => f.coeficiente)).toEqual(c.mo.map(([, k]) => k))
      expect(Math.abs(r.custoUnitario - c.csd)).toBeLessThanOrEqual(0.005)
    })
  })

  describe('CR-1 a CR-7 com a planilha real (duração, equipe e BAC)', () => {
    const dim = (dados: DadosSinapi, cod: string, uf: string, q: number, equipe: number) => {
      const comp = recorteDe(dados, uf).composicoes.find((c) => c.codigo === cod)!
      const eq = equipeDaComposicao(comp.maoDeObra)!
      const rup = eq.principal.coeficiente
      const dias = scheduleDays(durationFromTeam(q, rup, equipe, horasPorDia(480)))
      const rec = recursosDaEquipe(rotuloFuncao(eq.principal.funcao), equipe, eq.proporcoes).map((r) => `${r.resource} ${r.units}`)
      return { hh: totalManHours(q, rup), dias, rec, bac: q * comp.custoUnitario }
    }

    it('CR-1: 103332 SP, 640 m², equipe 4 → 33 d.u., Pedreiro 4 + Servente 2, BAC R$ 79.334,40', () => {
      const r = dim(csd, '103332', 'SP', 640, 4)
      expect(r.hh).toBeCloseTo(1038.424064, 9)
      expect([r.dias, r.rec]).toEqual([33, ['Pedreiro 4', 'Servente 2']])
      expect(r.bac).toBeCloseTo(79334.4, 2)
    })
    it('CR-2: 104658 SP, 100 m², equipe 2 → 4 d.u., Pedreiro 2 + Servente 4, BAC R$ 20.885,00', () => {
      const r = dim(csd, '104658', 'SP', 100, 2)
      expect(r.hh).toBeCloseTo(63.9, 9)
      expect([r.dias, r.rec]).toEqual([4, ['Pedreiro 2', 'Servente 4']])
      expect(r.bac).toBeCloseTo(20885, 2)
    })
    it('CR-3: 103681 SC, 320 m³, equipe 4 → 15 d.u., Pedreiro 4 + Servente 4 + Carpinteiro 1, BAC R$ 289.430,40', () => {
      const r = dim(csd, '103681', 'SC', 320, 4)
      expect(r.hh).toBeCloseTo(456.96, 9)
      expect([r.dias, r.rec]).toEqual([15, ['Pedreiro 4', 'Servente 4', 'Carpinteiro 1']])
      expect(r.bac).toBeCloseTo(289430.4, 2)
    })
    it('CR-4: 100700 RN, 10 un, equipe 1 → 6 d.u., BAC R$ 9.989,60', () => {
      const r = dim(csd, '100700', 'RN', 10, 1)
      expect([r.dias, r.rec]).toEqual([6, ['Carpinteiro de esquadrias 1', 'Servente 1', 'Pedreiro 1']])
      expect(r.bac).toBeCloseTo(9989.6, 2)
    })
    it('CR-5: 93358 PI, 50 m³, equipe 3 → 9 d.u., só Servente 3, BAC R$ 4.679,50', () => {
      const r = dim(csd, '93358', 'PI', 50, 3)
      expect(r.hh).toBeCloseTo(197.788335, 9)
      expect([r.dias, r.rec]).toEqual([9, ['Servente 3']])
      expect(r.bac).toBeCloseTo(4679.5, 2)
    })
    it('CR-6: 89357 AM CCD, 3.600 m, equipe 6 → 37 d.u., Encanador 6 + Auxiliar de encanador… 6, BAC R$ 139.824,00', () => {
      const r = dim(ccd, '89357', 'AM', 3600, 6)
      expect(r.hh).toBeCloseTo(1758.8736, 9)
      expect([r.dias, r.rec]).toEqual([37, ['Encanador 6', 'Auxiliar de encanador ou bombeiro hidráulico 6']])
      expect(r.bac).toBeCloseTo(139824, 2)
    })
    it('CR-7: 92413 GO, 1.500 m², equipe 6 → 65 d.u., Carpinteiro 6 + Ajudante de carpinteiro 2, BAC R$ 177.855,00', () => {
      const r = dim(csd, '92413', 'GO', 1500, 6)
      expect([r.dias, r.rec]).toEqual([65, ['Carpinteiro 6', 'Ajudante de carpinteiro 2']])
      expect(r.bac).toBeCloseTo(177855, 2)
    })
    it('CR-8: 103669 (empate) → principal PEDREIRO 2,459; Servente 3,0 e Carpinteiro de formas 1,0', () => {
      const eq = equipeDaComposicao(csd.analitico.composicoes.get('103669')!.maoDeObra)!
      expect(eq.principal).toMatchObject({ funcao: 'PEDREIRO', coeficiente: 2.459 })
      expect(eq.proporcoes).toEqual([{ recurso: 'Servente', proporcao: 3 }, { recurso: 'Carpinteiro', proporcao: 1 }])
    })
  })

  describe('CR-13 e CR-14 (supervisão fora da principal e dos recursos, EO-1)', () => {
    it('CR-13: 107113 SP (custo R$ 97,45/m): principal SERVENTE, 10 d.u., Servente 2, engenheiro nas notas', () => {
      // Valores publicados em 09/2026: SERVENTE 1,5815891 e ENGENHEIRO CIVIL DE OBRA PLENO 0,004143 (o plano os arredondava para 1,5816 e 0,0041)
      const comp = recorteDe(csd, 'SP').composicoes.find((c) => c.codigo === '107113')!
      expect(comp.custoUnitario).toBe(97.45)
      expect(comp.unidade).toBe('M')
      expect(comp.maoDeObra.map((f) => [f.funcao, f.coeficiente])).toEqual([['ENGENHEIRO CIVIL DE OBRA PLENO', 0.004143], ['SERVENTE', 1.5815891]])
      const eq = equipeDaComposicao(comp.maoDeObra)!
      expect(eq.principal.funcao).toBe('SERVENTE')
      expect(totalManHours(100, eq.principal.coeficiente)).toBeCloseTo(158.15891, 9)
      expect(scheduleDays(durationFromTeam(100, eq.principal.coeficiente, 2, 8))).toBe(10) // 9,8849 → 10 (antes da EO-1: 1 d e 772 serventes)
      const recursos = recursosDaEquipe('Servente', 2, eq.proporcoes)
      expect(recursos).toEqual([{ resource: 'Servente', units: 2 }])
      const notas = notasDaTarefaSinapi({ codigo: '107113', quantidade: 100, unidade: 'M', fonte: 'SP 09/2026 não desonerado', maoDeObra: comp.maoDeObra, recursos })
      expect(notas).toContain('Supervisão (administração local): Engenheiro civil de obra pleno: 0,41 h, não alocado.')
    })

    it('CR-14: 101183 (estacão; SEM CUSTO, fora de todo recorte): principal PEDREIRO 0,276, 1 d.u. com q 50 e equipe 2; encarregado e engenheiro não alocados', () => {
      const comp = csd.analitico.composicoes.get('101183')!
      expect(comp.situacao).toBe('SEM CUSTO')
      expect(comp.maoDeObra.map((f) => [f.funcao, f.coeficiente])).toEqual([['ENGENHEIRO CIVIL DE OBRA PLENO', 0.035], ['ENCARREGADO GERAL', 0.351], ['SERVENTE', 1.128], ['PEDREIRO', 0.276]])
      const eq = equipeDaComposicao(comp.maoDeObra)!
      expect(eq.principal.funcao).toBe('PEDREIRO')
      expect(totalManHours(50, 0.276)).toBeCloseTo(13.8, 9)
      expect(scheduleDays(durationFromTeam(50, 0.276, 2, 8))).toBe(1) // 0,8625 → 1 (antes da EO-1, pelo encarregado: 17,55 HH → 2 d)
      expect(eq.supervisao.map((f) => f.funcao)).toEqual(['ENGENHEIRO CIVIL DE OBRA PLENO', 'ENCARREGADO GERAL'])
      // Servente: 2 × 1,128 ÷ 0,276 = 8,17 → ⌈8,17 − 0,05⌉ = 9
      expect(recursosDaEquipe('Pedreiro', 2, eq.proporcoes).map((r) => `${r.resource} ${r.units}`)).toEqual(['Pedreiro 2', 'Servente 9'])
      expect(recorteDe(csd, 'SP').composicoes.some((c) => c.codigo === '101183')).toBe(false)
    })
  })

  it('tempo de leitura registrado (CSD + CCD + Analítico) e menor que 2 minutos', () => {
    expect(tempoLeituraMs).toBeLessThan(120_000)
  })
})
