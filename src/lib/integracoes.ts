// Estado e rótulos dos cartões da tela "Integrações" (SPEC-15, RF-15.1): sempre texto + ícone, nunca só cor.
import type { EstadoIntegracao } from '@/data/integracoes'

const ROTULO_ESTADO: Record<Exclude<EstadoIntegracao, 'aguardando-aprovacao'>, string> = {
  configurada: 'Configurada',
  'nao-configurada': 'Não configurada',
  'requer-servidor': 'Requer servidor (Fase 2)',
}

/** "Configurada", "Não configurada", "Requer servidor (Fase 2)" ou "Aguardando aprovação de {área}". */
export function rotuloDoEstado(estado: EstadoIntegracao, area?: string): string {
  if (estado === 'aguardando-aprovacao') return area ? `Aguardando aprovação de ${area}` : 'Aguardando aprovação'
  return ROTULO_ESTADO[estado]
}

/** Cartão SINAPI: "Configurada" quando a obra tem um recorte importado e legível; senão "Não configurada". */
export function estadoCartaoSinapi(temRecorte: boolean): EstadoIntegracao {
  return temRecorte ? 'configurada' : 'nao-configurada'
}
