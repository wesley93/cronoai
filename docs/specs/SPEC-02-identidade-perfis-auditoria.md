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
| Gestor de portfólio | Ver e comparar todas as obras da empresa (ou de uma carteira), atribuir obras e frentes a engenheiros, aprovar linhas de base; não edita o avanço |
| Diretoria (leitura) | Dashboards, EVM e relatórios |

## 4. Requisitos funcionais
- **RF-02.1** Login via provedor corporativo (OIDC/SAML, ex.: Entra ID) com MFA, conforme política de Segurança.
- **RF-02.2** Autorização no **backend** (o front apenas esconde botões; ocultar não substitui a checagem).
- **RF-02.3** Permissão por obra: o usuário só enxerga as obras às quais está vinculado. Engenheiro pode ter várias obras; gestor de portfólio vê a carteira inteira da empresa (ou as carteiras que lhe forem atribuídas). **Ciclo 00014:** garantido no BANCO (RLS por obra, escopos `todas`, `vinculadas` e `carteiras`; [ADR 00010](../../.claude/adrs/00010-perfis-e-permissao-por-obra.md)). Até o 00014b trazer a API de carteiras, o escopo `carteiras` enxerga zero obras (falha fechada).
- **RF-02.3a** Permissão por frente: encarregado e empreiteiro só veem e apontam as frentes atribuídas (SPEC-01 RF-01.1c). **Nota (ciclo 00014): só o MODELO e o vínculo existem** (`frente`, `acesso_frente`, FKs e RLS de escrita); nenhum dado é filtrado por frente ainda, porque tarefa (00015) e relato (00018) não existem. "Encarregado só vê as suas frentes" **não está cumprido**; a API de frentes é do 00014b e o filtro de dado nasce com as tabelas filhas.
- **RF-02.3b** Isolamento entre empresas testado em toda rota da API: um usuário da empresa A nunca acessa dado da empresa B, nem por id adivinhado (teste automatizado obrigatório).
- **RF-02.4** Auditoria de toda escrita: avanço, custo, vínculo, duração, linha de base, data de status, cenário, pedido, aprovação/rejeição de relato. Guarda `antes`/`depois`, usuário, IP, origem (UI, importação, WhatsApp, API) e motivo opcional. **Nota (ciclo 00013, Q6): IP pendente do Jurídico.** A trilha implementada NÃO guarda IP (privacidade por padrão); o restante do requisito (antes/depois, usuário, origem e motivo) está coberto para a obra. Quando o Jurídico decidir se e como gravar IP (inteiro, truncado ou nunca), entra uma coluna nova por migração.
- **RF-02.5** A auditoria é *append-only*: sem edição nem exclusão pela aplicação; exportável em CSV. **Ciclo 00013:** garantido no banco em três camadas (ADR 00009) e exportável em CSV com neutralização de fórmula (`GET /api/v1/auditoria/exportacao.csv`).
- **RF-02.6** "Quatro olhos" opcional para nova linha de base: propor → aprovar por outro engenheiro. **(recomendação)**

## 5. Requisitos não funcionais
- **RNF-02.1** Sessão com expiração e renovação segura; tokens fora do `localStorage` (cookie `HttpOnly` + `SameSite`).
- **RNF-02.2** Conformidade com [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/), nível 2.
- **RNF-02.3** Telefone e nome de encarregados tratados como dado pessoal (SPEC-12).

## 6. Critérios de aceite
- [ ] Usuário sem vínculo com a obra recebe 403 na API (testado também sem passar pela UI). **Nota (ciclo 00014, decisão do gate sujeita à revisão do usuário no PR): a obra sem vínculo responde 404, idêntico ao de inexistente, e não 403**, para não revelar que ela existe (a regra do [ADR 00006](../../.claude/adrs/00006-isolamento-entre-empresas-rls.md) e a RFC 9110 admitem o 404 para ocultar o recurso). O 403 `acao-nao-permitida` vale para a ação que o perfil não pode, sobre obra que ele enxerga. O critério NÃO foi reescrito: a divergência vai ao usuário.
- [ ] Toda alteração de avanço mostra o autor no registro de decisões.
- [ ] Encarregado não consegue aprovar o próprio relato.
