import { describe, expect, it } from 'vitest'
import { ESTADOS_INTEGRACAO, INTEGRACOES_FASE2 } from '@/data/integracoes'
import { estadoCartaoSinapi, rotuloDoEstado } from './integracoes'

describe('integrações: estados e rótulos (RF-15.1)', () => {
  it('rótulo em texto de cada estado', () => {
    expect(rotuloDoEstado('configurada')).toBe('Configurada')
    expect(rotuloDoEstado('nao-configurada')).toBe('Não configurada')
    expect(rotuloDoEstado('requer-servidor')).toBe('Requer servidor (Fase 2)')
    expect(rotuloDoEstado('aguardando-aprovacao', 'Segurança da Informação')).toBe('Aguardando aprovação de Segurança da Informação')
    expect(rotuloDoEstado('aguardando-aprovacao')).toBe('Aguardando aprovação')
    expect(ESTADOS_INTEGRACAO).toHaveLength(4)
  })

  it('cartão SINAPI: configurada só com recorte', () => {
    expect(estadoCartaoSinapi(true)).toBe('configurada')
    expect(estadoCartaoSinapi(false)).toBe('nao-configurada')
  })

  it('os 5 cartões da Fase 2 citam spec e área, sem campo de credencial nem endereço de provedor', () => {
    expect(INTEGRACOES_FASE2.map((i) => i.id)).toEqual(['whatsapp', 'ia-transcricao', 'erp', 'email-teams', 'login'])
    for (const i of INTEGRACOES_FASE2) {
      expect(i.spec).toMatch(/^SPEC-\d{2}/)
      expect(i.areas.length).toBeGreaterThan(0)
      expect(JSON.stringify(i)).not.toMatch(/https?:|token|senha|chave|segredo|baileys/i)
    }
    expect(INTEGRACOES_FASE2.find((i) => i.id === 'erp')).toMatchObject({ spec: 'SPEC-09 e SPEC-10', areas: ['TI dona do ERP', 'Segurança da Informação'] })
    expect(INTEGRACOES_FASE2.find((i) => i.id === 'login')).toMatchObject({ spec: 'SPEC-02', areas: ['Segurança da Informação', 'Infraestrutura'] })
  })
})
