/// <reference types="node" />
// Leitor de zip para o xlsx do SINAPI, sem dependência (D-1). O arquivo é entrada externa: limites conferidos ANTES de descompactar,
// por entrada lida (zip bomb), mais tamanho real e CRC-32 depois. Nada é gravado em disco. As mensagens não repetem conteúdo do arquivo.
// Referências: PKWARE APPNOTE; Node.js zlib (maxOutputLength, crc32); OWASP File Upload Cheat Sheet.
import { crc32, inflateRawSync } from 'node:zlib'

const MiB = 1024 * 1024

export interface LimitesZip {
  /** Tamanho do arquivo inteiro. */
  maxArquivo: number
  maxEntradas: number
  /** Tamanho declarado (descompactado) de UMA entrada lida. */
  maxEntrada: number
  /** Soma dos tamanhos declarados das entradas lidas. */
  maxSomaLidas: number
  /** Descompactado ÷ comprimido de uma entrada lida. */
  maxRazao: number
}

/** Medido em 09/2026: 13,6 MB, 30 entradas, maior entrada 22 MiB, ~72 MB lidos, razão 11,2 nas entradas lidas (59,7 numa não lida). */
export const LIMITES_ZIP_PADRAO: LimitesZip = {
  maxArquivo: 64 * MiB,
  maxEntradas: 200,
  maxEntrada: 64 * MiB,
  maxSomaLidas: 256 * MiB,
  maxRazao: 200,
}

export class ErroZip extends Error {}

export interface EntradaZip {
  nome: string
  metodo: 0 | 8
  tamanhoComprimido: number
  tamanhoDeclarado: number
  crc32: number
  deslocamentoLocal: number
}

export interface LeitorZip {
  entradas: readonly EntradaZip[]
  /** Descompacta uma entrada (com todas as conferências). `undefined` se o nome não existe. */
  ler(nome: string): Buffer | undefined
}

const SIG_EOCD = 0x06054b50
const SIG_ZIP64_LOCALIZADOR = 0x07064b50
const SIG_DIR_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50

/** Nome citado em mensagem só se for um caminho simples (nada do arquivo com texto livre). */
const alvo = (nome: string) => (/^[\w./-]{1,100}$/.test(nome) ? `A entrada "${nome}"` : 'Uma entrada')

export function abrirZip(dados: Uint8Array, limites: LimitesZip = LIMITES_ZIP_PADRAO): LeitorZip {
  if (dados.byteLength > limites.maxArquivo) throw new ErroZip(`O arquivo xlsx passa do limite de ${Math.round(limites.maxArquivo / MiB)} MiB.`)
  const buf = Buffer.from(dados.buffer, dados.byteOffset, dados.byteLength)
  if (buf.length < 22) throw new ErroZip('O arquivo não é um zip válido (curto demais).')

  // Fim do diretório central: nos últimos 22 + 65.535 bytes (o comentário é opcional)
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new ErroZip('O arquivo não é um zip válido (fim do diretório central não encontrado).')
  if (eocd >= 20 && buf.readUInt32LE(eocd - 20) === SIG_ZIP64_LOCALIZADOR) throw new ErroZip('Zip64 não é suportado.')

  const disco = buf.readUInt16LE(eocd + 4)
  const discoDir = buf.readUInt16LE(eocd + 6)
  const totalNoDisco = buf.readUInt16LE(eocd + 8)
  const total = buf.readUInt16LE(eocd + 10)
  const tamanhoDir = buf.readUInt32LE(eocd + 12)
  const deslocamentoDir = buf.readUInt32LE(eocd + 16)
  if (disco !== 0 || discoDir !== 0 || totalNoDisco !== total) throw new ErroZip('Zip em vários volumes não é suportado.')
  if (total === 0xffff || tamanhoDir === 0xffffffff || deslocamentoDir === 0xffffffff) throw new ErroZip('Zip64 não é suportado.')
  if (total > limites.maxEntradas) throw new ErroZip(`O zip tem mais de ${limites.maxEntradas} entradas.`)
  if (deslocamentoDir + tamanhoDir > eocd) throw new ErroZip('Diretório central truncado ou fora do arquivo.')

  const entradas: EntradaZip[] = []
  const nomes = new Set<string>()
  let p = deslocamentoDir
  for (let i = 0; i < total; i++) {
    if (p + 46 > deslocamentoDir + tamanhoDir || buf.readUInt32LE(p) !== SIG_DIR_CENTRAL) throw new ErroZip('Diretório central truncado ou corrompido.')
    const flags = buf.readUInt16LE(p + 8)
    const metodo = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const comprimido = buf.readUInt32LE(p + 20)
    const declarado = buf.readUInt32LE(p + 24)
    const nNome = buf.readUInt16LE(p + 28)
    const nExtra = buf.readUInt16LE(p + 30)
    const nComentario = buf.readUInt16LE(p + 32)
    const discoInicial = buf.readUInt16LE(p + 34)
    const local = buf.readUInt32LE(p + 42)
    const fim = p + 46 + nNome + nExtra + nComentario
    if (fim > deslocamentoDir + tamanhoDir) throw new ErroZip('Diretório central truncado ou corrompido.')
    if (flags & 0x1 || flags & 0x40) throw new ErroZip('Entrada criptografada não é suportada.')
    if (metodo !== 0 && metodo !== 8) throw new ErroZip('Método de compressão não suportado (só armazenado e deflate).')
    if (comprimido === 0xffffffff || declarado === 0xffffffff || local === 0xffffffff) throw new ErroZip('Zip64 não é suportado.')
    if (discoInicial !== 0) throw new ErroZip('Zip em vários volumes não é suportado.')
    // Bit 11 = nome em UTF-8; senão o nome é só identificador (os xlsx usam nomes ASCII)
    const nome = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nNome)
    if (nomes.has(nome)) throw new ErroZip('O zip tem nomes de entrada repetidos.')
    nomes.add(nome)
    if (local + 30 > deslocamentoDir || local >= buf.length) throw new ErroZip('Entrada com deslocamento fora do arquivo.')
    entradas.push({ nome, metodo, tamanhoComprimido: comprimido, tamanhoDeclarado: declarado, crc32: crc, deslocamentoLocal: local })
    p = fim
  }

  let somaLidas = 0
  const lidas = new Set<string>()

  function ler(nome: string): Buffer | undefined {
    const e = entradas.find((x) => x.nome === nome)
    if (!e) return undefined
    // Conferências ANTES de descompactar (o declarado vem do arquivo, mas limita o que o inflate pode produzir)
    if (e.tamanhoDeclarado > limites.maxEntrada) throw new ErroZip(`${alvo(nome)} passa do limite de ${Math.round(limites.maxEntrada / MiB)} MiB descompactada.`)
    if (e.metodo === 8 && e.tamanhoDeclarado / Math.max(1, e.tamanhoComprimido) > limites.maxRazao) {
      throw new ErroZip(`${alvo(nome)} tem razão de compressão acima de ${limites.maxRazao} (possível zip bomb).`)
    }
    if (e.metodo === 0 && e.tamanhoComprimido !== e.tamanhoDeclarado) throw new ErroZip(`${alvo(nome)} está inconsistente (armazenada com tamanhos diferentes).`)
    if (!lidas.has(nome)) {
      if (somaLidas + e.tamanhoDeclarado > limites.maxSomaLidas) throw new ErroZip(`A soma das entradas lidas passa de ${Math.round(limites.maxSomaLidas / MiB)} MiB.`)
      somaLidas += e.tamanhoDeclarado
      lidas.add(nome)
    }
    const l = e.deslocamentoLocal
    if (l + 30 > buf.length || buf.readUInt32LE(l) !== SIG_LOCAL) throw new ErroZip(`${alvo(nome)} tem cabeçalho local inválido.`)
    const inicio = l + 30 + buf.readUInt16LE(l + 26) + buf.readUInt16LE(l + 28)
    const fim = inicio + e.tamanhoComprimido
    if (fim > deslocamentoDir) throw new ErroZip(`${alvo(nome)} passa do fim dos dados do arquivo.`)
    const bruto = buf.subarray(inicio, fim)
    let saida: Buffer
    if (e.metodo === 0) saida = Buffer.from(bruto)
    else {
      try {
        // maxOutputLength = declarado + 1: um fluxo maior que o declarado estoura aqui, sem encher a memória
        saida = inflateRawSync(bruto, { maxOutputLength: e.tamanhoDeclarado + 1 })
      } catch (erro) {
        const codigo = (erro as { code?: string }).code
        if (codigo === 'ERR_BUFFER_TOO_LARGE') throw new ErroZip(`${alvo(nome)} descompacta além do tamanho declarado (possível zip bomb).`)
        throw new ErroZip(`${alvo(nome)} está corrompida.`)
      }
    }
    if (saida.length !== e.tamanhoDeclarado) throw new ErroZip(`${alvo(nome)} não tem o tamanho declarado.`)
    if (crc32(saida) !== e.crc32) throw new ErroZip(`${alvo(nome)} falhou na conferência do CRC-32.`)
    return saida
  }

  return { entradas, ler }
}
