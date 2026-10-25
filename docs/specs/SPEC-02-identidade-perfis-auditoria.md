# SPEC-02 — Identidade, perfis de acesso e trilha de auditoria

| Campo | Valor |
|---|---|
| Status | Proposta |
| Fase | 2 |
| Prioridade | Alta |
| Esforço | M |
| Depende de | SPEC-01 |
| Validar com | Segurança da Informação (provedor de identidade, MFA), Jurídico/RH (dados de trabalhadores) |

## 1. Problema
Hoje qualquer pessoa aprova apontamentos, aplica cenários e altera custos. O "registro de decisões" ([WbsModule.vue](../../src/modules/WbsModule.vue)) não diz **quem** fez cada coisa.

## 2. Objetivo
Login corporativo, permissões por perfil e por obra, e uma trilha de auditoria imutável que responda: quem mudou, o quê, quando, de onde e com qual evidência.

## 3. Perfis (proposta)

| Perfil | Pode |
|---|---|
| Administrador da empresa | Criar obras, gerir usuários e premissas padrão |
| Engenheiro de planejamento | Tudo na obra: importar/exportar MS Project, linha de base, cenários, aprovar apontamentos |
| Engenheiro de obra | Aprovar apontamentos, gerir restrições e insumos; não altera linha de base |
| Suprimentos | Insumos, pedidos e entregas |
| Encarregado / mestre | Enviar relatos (WhatsApp ou app); ver só as próprias frentes |
| Diretoria (leitura) | Dashboards, EVM e relatórios |

## 4. Requisitos funcionais
- **RF-02.1** Login via provedor corporativo (OIDC/SAML, ex.: Entra ID) com MFA, conforme política de Segurança.
- **RF-02.2** Autorização no **backend** (o front apenas esconde botões; ocultar não substitui a checagem).
- **RF-02.3** Permissão por obra: o usuário só enxerga as obras às quais está vinculado.
- **RF-02.4** Auditoria de toda escrita: avanço, custo, vínculo, duração, linha de base, data de status, cenário, pedido, aprovação/rejeição de relato. Guarda `antes`/`depois`, usuário, IP, origem (UI, importação, WhatsApp, API) e motivo opcional.
- **RF-02.5** A auditoria é *append-only*: sem edição nem exclusão pela aplicação; exportável em CSV.
- **RF-02.6** "Quatro olhos" opcional para nova linha de base: propor → aprovar por outro engenheiro. **(recomendação)**

## 5. Requisitos não funcionais
- **RNF-02.1** Sessão com expiração e renovação segura; tokens fora do `localStorage` (cookie `HttpOnly` + `SameSite`).
- **RNF-02.2** Conformidade com [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), nível 2.
- **RNF-02.3** Telefone e nome de encarregados tratados como dado pessoal (SPEC-12).

## 6. Critérios de aceite
- [ ] Usuário sem vínculo com a obra recebe 403 na API (testado também sem passar pela UI).
- [ ] Toda alteração de avanço mostra o autor no registro de decisões.
- [ ] Encarregado não consegue aprovar o próprio relato.
