// Exportação do histórico em JSON (ciclo 00007, E4, RNF-04.2, D-34): EX-1 com o Aurora fechado e retificado.
import { describe, expect, it } from 'vitest'
import { buildSeedState } from '@/stores/useProjectStore'
import type { Task } from '@/types/domain'
import { calcularObra } from './horizonte'
import { capturarFechamento, retificar, serializarDetalhe, validarCabecalhoFechamento } from './fechamentos'
import { FORMATO_HISTORICO, VERSAO_HISTORICO, montarExportacaoHistorico, nomeDoArquivoDeHistorico } from './exportacaoHistorico'

const seed = buildSeedState()
const calc = calcularObra(seed.tasks, seed.meta, seed.calendarios, seed.calendarioPadraoUid, { feriados: seed.feriados })
const fe1 = capturarFechamento({
  obraId: 'o1', id: 'f1', sequencia: 1, dataStatus: '2026-10-23', fechadoEm: '2026-10-25T15:00:00.000Z', linhaBase: 0, linhaBaseSalvaEm: '2026-04-27T12:00:00.000Z', versaoPremissas: 1, esquemaObra: 6,
  tarefas: JSON.parse(JSON.stringify(seed.tasks)) as Task[], cals: calc.calsPv, schedule: calc.sch, atrasoDiasUteis: calc.atraso.delayDays,
})
const r = retificar({ base: fe1, alteracoes: [{ uid: 104, pct: 45, custoReal: 75000 }], motivo: 'Medição revisada em campo', id: 'f2', sequencia: 2, fechadoEm: '2026-10-26T12:00:00.000Z', cabecalhos: [fe1.cabecalho] })
if (!r.ok) throw new Error(r.erro)

describe('exportação do histórico (EX-1)', () => {
  const e = montarExportacaoHistorico({
    exportadoEm: '2026-10-27T10:00:00.000Z',
    obra: { nome: seed.meta.name },
    dataStatus: '2026-10-23',
    linhasBase: seed.linhasBase,
    // fora de ordem de propósito: o arquivo sai por sequência
    fechamentos: [{ cabecalho: r.cabecalho, detalhe: r.detalhe }, fe1],
  })

  it('EX-1: formato, versão, as LBs e 2 fechamentos (cabeçalho e 20 tarefas cada); JSON.parse devolve exatamente os registros gravados', () => {
    const lido = JSON.parse(e.texto) as typeof e.exportacao
    expect([lido.formato, lido.versao, lido.exportadoEm]).toEqual([FORMATO_HISTORICO, VERSAO_HISTORICO, '2026-10-27T10:00:00.000Z'])
    expect(lido.obra).toEqual({ nome: 'Edifício Residencial Aurora - 12 Pavimentos' })
    expect(lido.linhasBase).toEqual(seed.linhasBase)
    expect(lido.fechamentos.map((f) => [f.cabecalho.id, f.cabecalho.sequencia, f.cabecalho.tipo, f.tarefas.length])).toEqual([['f1', 1, 'fechamento', 20], ['f2', 2, 'retificacao', 20]])
    // exatamente o que foi gravado (o cabeçalho e o detalhe em texto, como no IndexedDB)
    expect(lido.fechamentos[0].cabecalho).toEqual(JSON.parse(JSON.stringify(fe1.cabecalho)))
    expect(lido.fechamentos[0].tarefas).toEqual(JSON.parse(serializarDetalhe(fe1.detalhe).json).tarefas)
    expect(lido.fechamentos[1].tarefas).toEqual(JSON.parse(serializarDetalhe(r.detalhe).json).tarefas)
    // e o cabeçalho exportado continua legível pela validação de leitura
    expect(validarCabecalhoFechamento(lido.fechamentos[1].cabecalho)).toEqual(r.cabecalho)
  })

  it('o nome do arquivo: obra, "historico" e a data de status, sem acento nem símbolo', () => {
    expect(e.nomeArquivo).toBe('Edificio_Residencial_Aurora_12_Pavimentos_historico_2026-10-23.json')
    expect(nomeDoArquivoDeHistorico('Obra "Ação" / São Paulo!', '2026-11-06')).toBe('Obra_Acao_Sao_Paulo_historico_2026-11-06.json')
    expect(nomeDoArquivoDeHistorico('???', '2026-11-06')).toBe('Obra_historico_2026-11-06.json')
  })

  it('UF e município entram só quando informados; nada de dado pessoal além do autor declarado nos registros', () => {
    const com = montarExportacaoHistorico({ exportadoEm: 'x', obra: { nome: 'O', uf: 'SP', municipio: 'São Paulo' }, dataStatus: '2026-10-23', linhasBase: [], fechamentos: [fe1] })
    expect(com.exportacao.obra).toEqual({ nome: 'O', uf: 'SP', municipio: 'São Paulo' })
    expect(Object.keys(JSON.parse(e.texto)).sort()).toEqual(['exportadoEm', 'fechamentos', 'formato', 'linhasBase', 'obra', 'versao'])
  })
})
