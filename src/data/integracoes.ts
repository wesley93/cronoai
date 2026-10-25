// Integrações da Fase 2 mostradas como INFORMAÇÃO na tela "Integrações" (SPEC-15, RF-15.5): nenhuma tem campo nem conexão no front-only.
// Cada cartão cita a spec e a área que precisa aprovar antes de existir. Sem URL de provedor, sem credencial, sem `VITE_*`.

export const ESTADOS_INTEGRACAO = ['configurada', 'nao-configurada', 'requer-servidor', 'aguardando-aprovacao'] as const
export type EstadoIntegracao = (typeof ESTADOS_INTEGRACAO)[number]

export interface IntegracaoFase2 {
  id: string
  titulo: string
  /** O que a integração faria na Fase 2 (texto fixo, sem dado de provedor). */
  descricao: string
  /** Spec que a define. */
  spec: string
  /** Áreas que aprovam antes de a integração existir (CLAUDE.md › Validações com outras áreas). */
  areas: readonly string[]
}

export const INTEGRACOES_FASE2: readonly IntegracaoFase2[] = [
  { id: 'whatsapp', titulo: 'WhatsApp', descricao: 'Receber o apontamento de campo por mensagem.', spec: 'SPEC-08', areas: ['Segurança da Informação', 'Jurídico'] },
  { id: 'ia-transcricao', titulo: 'IA e transcrição', descricao: 'Interpretar relatos de texto e de voz e propor atualizações na EAP.', spec: 'SPEC-08', areas: ['Segurança da Informação', 'Jurídico'] },
  { id: 'erp', titulo: 'ERP', descricao: 'Trazer pedidos, notas e custo real do ERP da empresa.', spec: 'SPEC-09 e SPEC-10', areas: ['TI dona do ERP', 'Segurança da Informação'] },
  { id: 'email-teams', titulo: 'E-mail e Teams', descricao: 'Enviar relatórios e alertas por e-mail e pelo Teams.', spec: 'SPEC-11', areas: ['Segurança da Informação'] },
  { id: 'login', titulo: 'Login corporativo', descricao: 'Entrar com a identidade da empresa, com perfis e trilha de auditoria.', spec: 'SPEC-02', areas: ['Segurança da Informação', 'Infraestrutura'] },
]
