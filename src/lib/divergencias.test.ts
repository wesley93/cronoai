import { describe, expect, it } from 'vitest'
import type { ProjectMeta, Task } from '@/types/domain'
import fixture from './__fixtures__/mspdi-divergencias.xml?raw'
import { calendarioPadrao, compilarCalendarios, diasParaMinutos } from './calendarioTrabalho'
import { brazilianHolidays } from './calendar'
import { CAUSAS_DIVERGENCIA, ROTULO_CAUSA, calcularDivergencias } from './divergencias'
import { computeSchedule, optsDaObra } from './cpm'
import { configFeriadosPadrao, criarFeriadosPorAno } from './feriadosObra'
import { parseMspdiXml } from './msProjectXmlParser'

/**
 * Importa o XML, calcula a previsão e compara com as datas do arquivo (a mesma conta da store). Com `aplicarFeriadosDaObra`, o calendário
 * importado passa a aplicar os feriados da obra (a ação "Aplicar feriados da obra" do usuário).
 */
function divergenciasDe(xml: string, alterar?: (tasks: Task[]) => Task[], aplicarFeriadosDaObra = false) {
  const r = parseMspdiXml(xml)
  const tasks = alterar ? alterar(r.tasks) : r.tasks
  const meta = { name: 'Obra', company: '', manager: '', startDate: r.meta.startDate!, statusDate: r.meta.statusDate!, ...r.meta } as ProjectMeta
  const calendarios = aplicarFeriadosDaObra ? r.calendarios.map((c) => ({ ...c, aplicaFeriadosObra: true })) : r.calendarios
  const feriados = configFeriadosPadrao()
  const cals = compilarCalendarios(meta.startDate, calendarios, r.calendarioPadraoUid, { feriadosPorAno: criarFeriadosPorAno(feriados) })
  const schedule = computeSchedule(tasks, cals, optsDaObra(meta, 'forecast', meta.statusDate))
  return calcularDivergencias(tasks, schedule, cals, meta, { calendarios, calendarioPadraoUid: r.calendarioPadraoUid, feriados })
}

const dias = (n: number) => diasParaMinutos(n)

// Ciclo 00005 (achado a): o import não injeta mais os feriados nacionais. A fixture não traz feriados; o calendário importado fica como
// está e as datas do CronoAI batem com as do arquivo nas tarefas sem outra causa. Antes → depois (D-2 a D-6, importando sem aplicar):
// D-2 +1 d.u. → igual ao arquivo; D-3 +1 d.u. → igual; D-4 −4 → −5; D-6 −4 → −5; D-5 +1 → +1.
describe('painel de divergências com a fixture importada, sem feriados injetados (CF-7)', () => {
  const lista = divergenciasDe(fixture)
  const d = (uid: number) => lista.find((x) => x.uid === uid)!

  it('D-1, D-2 e D-3 não divergem (antes, D-2 e D-3 apareciam por causa do feriado de 07/09 injetado); sobram D-4 e D-6', () => {
    expect(lista.map((x) => x.uid)).toEqual([4, 5])
  })

  it('D-4: agendada manualmente: calculada 07/09 a 08/09, −5 d.u. (antes: 08/09 a 09/09, −4), causa "agendada manualmente no MS Project"', () => {
    expect([d(4).inicioCalculado, d(4).terminoCalculado, d(4).diferencaInicioDu, d(4).diferencaTerminoDu]).toEqual(['2026-09-07', '2026-09-08', -5, -5])
    expect([d(4).causa, d(4).detalhe]).toEqual(['manual', 'Agendada manualmente no MS Project: o CronoAI a calcula automaticamente.'])
  })

  it('D-6: a sucessora da manual aponta para o UID da manual: 09/09, −5 d.u. (antes: 10/09, −4)', () => {
    expect([d(5).inicioCalculado, d(5).terminoCalculado, d(5).diferencaTerminoDu]).toEqual(['2026-09-09', '2026-09-09', -5])
    expect([d(5).causa, d(5).predecessoraUid, d(5).detalhe]).toEqual(['predecessora', 4, 'Predecessora UID 4 agendada manualmente.'])
  })

  it('D-5: depois de importar, a duração da T1 passa a 6 d: 07/09 no término contra 04/09 do arquivo, +1 d.u., "alterada no CronoAI"', () => {
    const alterada = divergenciasDe(fixture, (tasks) => tasks.map((t) => (t.uid === 1 ? { ...t, duracaoMin: dias(6) } : t)))
    const t1 = alterada.find((x) => x.uid === 1)!
    // sem o feriado de 07/09: 31/08, 01, 02, 03, 04 e 07/09 (antes, com o feriado injetado, terminava 08/09)
    expect([t1.inicioCalculado, t1.terminoCalculado, t1.terminoArquivo, t1.diferencaInicioDu, t1.diferencaTerminoDu]).toEqual(['2026-08-31', '2026-09-07', '2026-09-04', 0, 1])
    expect([t1.causa, t1.detalhe]).toEqual(['alterada', 'Alterada no CronoAI depois da importação (duração, % concluído ou restrição diferente do arquivo).'])
  })

  it('o painel só usa texto fixo e UIDs: o nome da tarefa não entra na frase da causa', () => {
    for (const x of lista) expect(x.detalhe).not.toContain(x.nome)
  })
})

describe('depois de "Aplicar feriados da obra" ao calendário importado: as diferenças do ciclo 00004 voltam (CF-7)', () => {
  const lista = divergenciasDe(fixture, undefined, true)
  const d = (uid: number) => lista.find((x) => x.uid === uid)!

  it('D-1 igual ao arquivo; D-2 a D-6 voltam na ordem da EAP', () => {
    expect(lista.map((x) => x.uid)).toEqual([2, 3, 4, 5])
  })

  it('D-2: o feriado de 07/09 da obra: 08/09 a 14/09, +1 d.u., causa "feriado" com o texto novo', () => {
    expect([d(2).inicioArquivo, d(2).terminoArquivo, d(2).inicioCalculado, d(2).terminoCalculado]).toEqual(['2026-09-07', '2026-09-11', '2026-09-08', '2026-09-14'])
    expect(d(2).diferencaTerminoDu).toBe(1)
    expect([d(2).causa, d(2).detalhe]).toEqual(['feriado', 'Feriados da obra aplicados ao calendário importado.'])
  })

  it('D-3 +1, D-4 −4 e D-6 −4, como no ciclo 00004', () => {
    expect([d(3).inicioCalculado, d(3).terminoCalculado, d(3).diferencaInicioDu, d(3).diferencaTerminoDu]).toEqual(['2026-09-15', '2026-09-16', 1, 1])
    expect([d(3).causa, d(3).predecessoraUid, d(3).detalhe]).toEqual(['predecessora', 2, 'Efeito da predecessora UID 2.'])
    expect([d(4).inicioCalculado, d(4).terminoCalculado, d(4).diferencaInicioDu, d(4).diferencaTerminoDu]).toEqual(['2026-09-08', '2026-09-09', -4, -4])
    expect([d(5).inicioCalculado, d(5).terminoCalculado, d(5).diferencaTerminoDu]).toEqual(['2026-09-10', '2026-09-10', -4])
  })

  it('D-5: T1 com 6 d termina 08/09 (+1 d.u.)', () => {
    const t1 = divergenciasDe(fixture, (tasks) => tasks.map((t) => (t.uid === 1 ? { ...t, duracaoMin: dias(6) } : t)), true).find((x) => x.uid === 1)!
    expect([t1.terminoCalculado, t1.diferencaTerminoDu, t1.causa]).toEqual(['2026-09-08', 1, 'alterada'])
  })
})

describe('obra importada por versão anterior (legado): feriados nacionais injetados', () => {
  it('a marca feriadosNacionaisAplicados continua explicando a divergência, com o texto da época', () => {
    const r = parseMspdiXml(fixture)
    const meta = { name: 'Obra', company: '', manager: '', startDate: r.meta.startDate!, statusDate: r.meta.statusDate!, ...r.meta, feriadosNacionaisAplicados: true as const } as ProjectMeta
    // calendário com o 07/09 injetado como exceção (o que a versão anterior fazia)
    const injetado = r.calendarios.map((c) => ({ ...c, excecoes: [...c.excecoes, { data: '2026-09-07', intervalos: [] }] }))
    const cals = compilarCalendarios(meta.startDate, injetado, r.calendarioPadraoUid)
    const schedule = computeSchedule(r.tasks, cals, optsDaObra(meta, 'forecast', meta.statusDate))
    const x = calcularDivergencias(r.tasks, schedule, cals, meta).find((y) => y.uid === 2)!
    expect([x.causa, x.detalhe]).toEqual(['feriado', 'Feriados nacionais aplicados na importação por uma versão anterior do CronoAI (o arquivo não trazia feriados).'])
  })
})

describe('causas da divergência por precedência', () => {
  const padrao = calendarioPadrao(brazilianHolidays(2026))
  const tarefa = (uid: number, duracaoDias: number, over: Partial<Task> = {}): Task => ({
    uid, wbs: String(uid), name: `T${uid}`, outlineLevel: 1, isSummary: false, duracaoMin: dias(duracaoDias), predecessors: [],
    percentComplete: 0, bac: 0, actualCost: 0, resources: [], ...over,
  })
  const meta = (statusDate: string, extra: Partial<ProjectMeta> = {}): ProjectMeta => ({ name: 'O', company: '', manager: '', startDate: '2026-08-03', statusDate, ...extra })
  const calcular = (tasks: Task[], m: ProjectMeta) => {
    const cals = compilarCalendarios(m.startDate, [padrao], 1)
    return calcularDivergencias(tasks, computeSchedule(tasks, cals, optsDaObra(m, 'forecast', m.statusDate)), cals, m)
  }
  const arquivo = (inicio: string, termino: string, d: number, extra: Partial<NonNullable<Task['arquivo']>> = {}) => ({ inicio, termino, duracaoMin: dias(d), percentComplete: 0, ...extra })

  it('data de status: tarefa que o arquivo agenda antes da data de status e o CronoAI move para depois', () => {
    const t = tarefa(1, 5, { arquivo: arquivo('2026-08-03', '2026-08-07', 5) })
    const [x] = calcular([t], meta('2026-08-05'))
    expect([x.inicioCalculado, x.terminoCalculado, x.causa]).toEqual(['2026-08-06', '2026-08-12', 'status'])
    // Sem mover o restante, o CronoAI calcula as mesmas datas do arquivo e não há divergência
    expect(calcular([t], meta('2026-08-05', { opcoesCronograma: { logica: 'retida', moverRestante: false } }))).toEqual([])
  })

  it('nivelamento: o arquivo atrasa a tarefa por nivelamento de recursos', () => {
    const t = tarefa(1, 5, { arquivo: arquivo('2026-08-10', '2026-08-14', 5, { nivelamento: true }) })
    const [x] = calcular([t], meta('2026-07-31'))
    expect([x.inicioCalculado, x.causa]).toEqual(['2026-08-03', 'nivelamento'])
  })

  it('restrição em conflito com o vínculo (HonorConstraints 0 no arquivo: o vínculo prevalecia lá)', () => {
    const mso = { tipo: 'MSO' as const, data: '2026-08-06' }
    const a = tarefa(1, 5, { arquivo: arquivo('2026-08-03', '2026-08-07', 5) })
    const b = tarefa(2, 2, { predecessors: [{ uid: 1, type: 'FS', lag: { tipo: 'util', minutos: 0 } }], restricao: mso, arquivo: arquivo('2026-08-10', '2026-08-11', 2, { restricao: mso }) })
    const lista = calcular([a, b], meta('2026-07-31'))
    expect(lista.map((x) => [x.uid, x.inicioCalculado, x.terminoCalculado, x.causa])).toEqual([[2, '2026-08-06', '2026-08-07', 'restricao']])
  })

  it('sem causa conhecida: "não identificada"; tarefa sem datas do arquivo não é comparada', () => {
    const t = tarefa(1, 5, { arquivo: arquivo('2026-08-04', '2026-08-08', 5) })
    expect(calcular([t], meta('2026-07-31')).map((x) => [x.uid, x.causa, x.detalhe])).toEqual([[1, 'nao-identificada', 'Causa não identificada.']])
    expect(calcular([tarefa(1, 5)], meta('2026-07-31'))).toEqual([])
  })

  it('tarefa com calendário próprio diverge pelo calendário; a restrição inferida do import não conta como alteração', () => {
    const sab = { ...padrao, uid: 2, nome: 'Sábado', semana: padrao.semana.map((d, i) => (i === 6 ? [{ de: 480, ate: 720 }] : d)) }
    const m = meta('2026-07-31')
    const cals = compilarCalendarios(m.startDate, [padrao, sab], 1)
    const t = tarefa(1, 12, { calendarioUid: 2, restricao: { tipo: 'SNET', data: '2026-08-03', inferida: true }, arquivo: arquivo('2026-08-03', '2026-08-18', 12) })
    const lista = calcularDivergencias([t], computeSchedule([t], cals, optsDaObra(m, 'forecast', m.statusDate)), cals, m)
    expect(lista.map((x) => [x.terminoCalculado, x.causa, x.detalhe])).toEqual([['2026-08-17', 'feriado', 'Calendário da tarefa (UID do calendário em 2).']])
  })

  it('todas as causas têm rótulo e a lista está na ordem de precedência', () => {
    expect([...CAUSAS_DIVERGENCIA]).toEqual(['alterada', 'manual', 'feriado', 'restricao', 'status', 'nivelamento', 'predecessora', 'nao-identificada'])
    for (const c of CAUSAS_DIVERGENCIA) expect(ROTULO_CAUSA[c].length).toBeGreaterThan(3)
  })
})
