# ADRs — índice

> Criado para o CronoAI em 25/10/2026, no formato do processo SophIA.

Architecture Decision Records do CronoAI. Novos ADRs pelo comando `/adr {título}` (`.claude/commands/adr.md`): arquivo `{NNNNN}-{titulo-kebab}.md` nesta pasta, numeração de 5 dígitos, status `Proposto` até o usuário aceitar. Decisão com impacto de infraestrutura, segurança, jurídico ou financeiro só vira `Aceito` depois da validação da área responsável.

Candidatas conhecidas: as **Decisões em aberto** D1–D4 de `docs/specs/README.md` (stack do backend, front, repositório, provedor de IA), quando o usuário decidir.

| ADR | Título | Data | Status |
|---|---|---|---|
| [00001](00001-stack-backend-dotnet-10.md) | Stack do backend: .NET 10 + PostgreSQL | 2026-10-25 | Aceito (stack); Infra/Segurança pendentes |
| [00004](00004-estrutura-convencoes-backend.md) | Estrutura, convenções e ferramentas do backend .NET | 2026-10-25 | Proposto |
| [00005](00005-autenticacao-oidc-bff-sessao.md) | Autenticação: OIDC genérico, BFF com cookie de sessão revogável e usuário de desenvolvimento | 2026-10-25 | Proposto |
| [00006](00006-isolamento-entre-empresas-rls.md) | Isolamento entre empresas: coluna, filtro do EF, RLS e teste de rotas | 2026-10-25 | Proposto |
| [00009](00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md) | Trilha de auditoria append-only e concorrência otimista da obra | 2026-10-25 | Proposto |
| [00010](00010-perfis-e-permissao-por-obra.md) | Perfis e permissão por obra: visibilidade no banco, ação na aplicação | 2026-10-25 | Proposto |
