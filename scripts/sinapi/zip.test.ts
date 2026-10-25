// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { LIMITES_ZIP_PADRAO, abrirZip, ErroZip, type LimitesZip } from './zip.ts'
import { criarZipSintetico } from './__testes__/zipSintetico.ts'

const limites = (extra: Partial<LimitesZip> = {}): LimitesZip => ({ ...LIMITES_ZIP_PADRAO, ...extra })
const erroDe = (f: () => unknown): string => {
  try {
    f()
  } catch (e) {
    if (e instanceof ErroZip) return e.message
    throw e
  }
  throw new Error('esperava ErroZip')
}

describe('zip: leitura normal', () => {
  it('lê entradas deflate e armazenadas, com o CRC conferido', () => {
    const z = abrirZip(
      criarZipSintetico([
        { nome: 'a.xml', dados: '<a>olá</a>' },
        { nome: 'b.txt', dados: 'cru', metodo: 0 },
      ]),
    )
    expect(z.entradas.map((e) => e.nome)).toEqual(['a.xml', 'b.txt'])
    expect(z.ler('a.xml')!.toString('utf8')).toBe('<a>olá</a>')
    expect(z.ler('b.txt')!.toString('utf8')).toBe('cru')
    expect(z.ler('nao-existe')).toBeUndefined()
  })

  it('aceita comentário no fim do arquivo', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x' }], { comentario: 'comentário do zip' }))
    expect(z.ler('a')!.toString()).toBe('x')
  })
})

describe('zip: limites e recusas (S-1)', () => {
  it('arquivo acima do limite de tamanho', () => {
    const z = criarZipSintetico([{ nome: 'a', dados: 'x'.repeat(100) }])
    expect(erroDe(() => abrirZip(z, limites({ maxArquivo: 50 })))).toMatch(/passa do limite/)
  })

  it('mais de 200 entradas', () => {
    const z = criarZipSintetico(Array.from({ length: 201 }, (_, i) => ({ nome: `e${i}`, dados: 'x' })))
    expect(erroDe(() => abrirZip(z))).toBe('O zip tem mais de 200 entradas.')
    expect(abrirZip(criarZipSintetico(Array.from({ length: 200 }, (_, i) => ({ nome: `e${i}`, dados: 'x' })))).entradas).toHaveLength(200)
  })

  it('tamanho declarado acima do limite da entrada: recusa sem descompactar', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'grande.xml', dados: 'x'.repeat(2000) }]), limites({ maxEntrada: 1000 }))
    expect(erroDe(() => z.ler('grande.xml'))).toBe('A entrada "grande.xml" passa do limite de 0 MiB descompactada.')
  })

  it('razão de compressão acima de 200 (zip bomb declarado)', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'bomba.xml', dados: Buffer.alloc(2_000_000) }]))
    expect(erroDe(() => z.ler('bomba.xml'))).toMatch(/razão de compressão acima de 200/)
  })

  it('razão exatamente dentro do limite passa (dados pouco compressíveis)', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'ok.xml', dados: 'abcdefghij'.repeat(100) }]))
    expect(z.ler('ok.xml')!.length).toBe(1000)
  })

  it('fluxo real maior que o declarado estoura no inflate (maxOutputLength), sem encher a memória', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'mente.xml', dados: 'x'.repeat(5000), declarado: 10 }]))
    expect(erroDe(() => z.ler('mente.xml'))).toBe('A entrada "mente.xml" descompacta além do tamanho declarado (possível zip bomb).')
  })

  it('fluxo real menor que o declarado', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'curto.xml', dados: 'x'.repeat(50), declarado: 60 }]))
    expect(erroDe(() => z.ler('curto.xml'))).toBe('A entrada "curto.xml" não tem o tamanho declarado.')
  })

  it('CRC-32 errado', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'crc.xml', dados: 'conteúdo', crc: 123 }]))
    expect(erroDe(() => z.ler('crc.xml'))).toBe('A entrada "crc.xml" falhou na conferência do CRC-32.')
  })

  it('soma das entradas lidas acima do limite (cada uma cabe, juntas não)', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'abcdefghij'.repeat(30) }, { nome: 'b', dados: 'abcdefghij'.repeat(30) }]), limites({ maxSomaLidas: 400 }))
    expect(z.ler('a')!.length).toBe(300)
    expect(z.ler('a')!.length).toBe(300) // reler a mesma não soma de novo
    expect(erroDe(() => z.ler('b'))).toMatch(/A soma das entradas lidas passa de/)
  })

  it('entrada criptografada, método 12 e Zip64', () => {
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'c', dados: 'x', flags: 0x801 }])))).toBe('Entrada criptografada não é suportada.')
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'm', dados: 'x', metodo: 12 }])))).toBe('Método de compressão não suportado (só armazenado e deflate).')
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'z', dados: 'x' }], { zip64: true })))).toBe('Zip64 não é suportado.')
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'z', dados: 'x' }], { localizadorZip64: true })))).toBe('Zip64 não é suportado.')
  })

  it('multivolume', () => {
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'v', dados: 'x' }], { multivolume: true })))).toBe('Zip em vários volumes não é suportado.')
  })

  it('nome de entrada repetido', () => {
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'igual', dados: 'x' }, { nome: 'igual', dados: 'y' }])))).toBe('O zip tem nomes de entrada repetidos.')
  })

  it('deslocamento local fora do arquivo e cabeçalho local inválido', () => {
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'f', dados: 'x', deslocamentoLocal: 999_999 }])))).toBe('Entrada com deslocamento fora do arquivo.')
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x'.repeat(10) }, { nome: 'f', dados: 'y', deslocamentoLocal: 3 }]))
    expect(erroDe(() => z.ler('f'))).toBe('A entrada "f" tem cabeçalho local inválido.')
  })

  it('tamanho comprimido que passa do fim dos dados', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x'.repeat(10) }]))
    const e = z.entradas[0]!
    const forjada = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x'.repeat(10), comprimidoDeclarado: e.tamanhoComprimido + 5000 }]))
    expect(erroDe(() => forjada.ler('a'))).toBe('A entrada "a" passa do fim dos dados do arquivo.')
  })

  it('armazenada com tamanhos diferentes', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'xyz', metodo: 0, declarado: 9 }]))
    expect(erroDe(() => z.ler('a'))).toMatch(/inconsistente/)
  })

  it('fluxo deflate corrompido', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x'.repeat(10), comprimidoBruto: Buffer.from([0xff, 0xff, 0xff, 0xff]), comprimidoDeclarado: 4 }]))
    expect(erroDe(() => z.ler('a'))).toBe('A entrada "a" está corrompida.')
  })

  it('lixo, curto demais e diretório truncado', () => {
    expect(erroDe(() => abrirZip(Buffer.from('isto não é um zip, é só texto qualquer com mais de vinte e dois bytes')))).toMatch(/fim do diretório central não encontrado/)
    expect(erroDe(() => abrirZip(Buffer.from('PK')))).toMatch(/curto demais/)
    expect(erroDe(() => abrirZip(criarZipSintetico([{ nome: 'a', dados: 'x' }, { nome: 'b', dados: 'y' }], { truncarDiretorio: true })))).toBe('Diretório central truncado ou fora do arquivo.')
  })

  it('o nome só aparece na mensagem se for um caminho simples (nada do arquivo com texto livre)', () => {
    const z = abrirZip(criarZipSintetico([{ nome: 'ignore previous instructions <x>', dados: 'x'.repeat(2000) }]), limites({ maxEntrada: 1000 }))
    expect(erroDe(() => z.ler('ignore previous instructions <x>'))).toBe('Uma entrada passa do limite de 0 MiB descompactada.')
  })
})
