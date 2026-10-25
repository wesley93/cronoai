/// <reference types="node" />
// Monta zips sintéticos para os testes do leitor (inclusive malformados). Só para teste: nada daqui roda no CLI.
import { crc32, deflateRawSync } from 'node:zlib'

export interface EntradaSintetica {
  nome: string
  dados: Buffer | string
  /** 8 = deflate (padrão), 0 = armazenado, outro valor grava o número no cabeçalho (teste de método não suportado). */
  metodo?: number
  /** Sobrescreve o tamanho declarado (descompactado) no diretório central. */
  declarado?: number
  /** Sobrescreve o CRC-32. */
  crc?: number
  /** Bits de flag (bit 0 = criptografado, bit 11 = UTF-8). */
  flags?: number
  /** Sobrescreve o tamanho comprimido no diretório central. */
  comprimidoDeclarado?: number
  /** Grava este deslocamento local no diretório central. */
  deslocamentoLocal?: number
  /** Dados já comprimidos (para forçar fluxo maior que o declarado). */
  comprimidoBruto?: Buffer
}

export interface OpcoesZipSintetico {
  /** Corta o diretório central (truncado). */
  truncarDiretorio?: boolean
  /** Grava 0xFFFFFFFF no deslocamento do diretório (Zip64). */
  zip64?: boolean
  /** Número de disco ≠ 0 (multivolume). */
  multivolume?: boolean
  /** Coloca o localizador Zip64 antes do EOCD. */
  localizadorZip64?: boolean
  /** Comentário final. */
  comentario?: string
}

export function criarZipSintetico(entradas: EntradaSintetica[], opcoes: OpcoesZipSintetico = {}): Buffer {
  const partes: Buffer[] = []
  const central: Buffer[] = []
  let deslocamento = 0
  for (const e of entradas) {
    const dados = Buffer.isBuffer(e.dados) ? e.dados : Buffer.from(e.dados, 'utf8')
    const metodo = e.metodo ?? 8
    const comprimido = e.comprimidoBruto ?? (metodo === 8 ? deflateRawSync(dados) : dados)
    const nome = Buffer.from(e.nome, 'utf8')
    const flags = e.flags ?? 0x800
    const crc = e.crc ?? crc32(dados)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(metodo, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(comprimido.length, 18)
    local.writeUInt32LE(dados.length, 22)
    local.writeUInt16LE(nome.length, 26)
    partes.push(local, nome, comprimido)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(flags, 8)
    c.writeUInt16LE(metodo, 10)
    c.writeUInt32LE(crc, 16)
    c.writeUInt32LE(e.comprimidoDeclarado ?? comprimido.length, 20)
    c.writeUInt32LE(e.declarado ?? dados.length, 24)
    c.writeUInt16LE(nome.length, 28)
    c.writeUInt32LE(e.deslocamentoLocal ?? deslocamento, 42)
    central.push(c, nome)
    deslocamento += local.length + nome.length + comprimido.length
  }
  let diretorio = Buffer.concat(central)
  if (opcoes.truncarDiretorio) diretorio = diretorio.subarray(0, Math.max(0, diretorio.length - 20))
  const comentario = Buffer.from(opcoes.comentario ?? '', 'utf8')
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(opcoes.multivolume ? 1 : 0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entradas.length, 8)
  eocd.writeUInt16LE(entradas.length, 10)
  eocd.writeUInt32LE(Buffer.concat(central).length, 12)
  eocd.writeUInt32LE(opcoes.zip64 ? 0xffffffff : deslocamento, 16)
  eocd.writeUInt16LE(comentario.length, 20)
  const localizador = Buffer.alloc(opcoes.localizadorZip64 ? 20 : 0)
  if (opcoes.localizadorZip64) localizador.writeUInt32LE(0x07064b50, 0)
  return Buffer.concat([...partes, diretorio, localizador, eocd, comentario])
}
