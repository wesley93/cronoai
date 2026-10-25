# ADRs — índice

> Criado para o CronoAI em 25/10/2026, no formato do processo SophIA.

Architecture Decision Records do CronoAI. Novos ADRs pelo comando `/adr {título}` (`.claude/commands/adr.md`): arquivo `{NNNNN}-{titulo-kebab}.md` nesta pasta, numeração de 5 dígitos, status `Proposto` até o usuário aceitar. Decisão com impacto de infraestrutura, segurança, jurídico ou financeiro só vira `Aceito` depois da validação da área responsável.

Candidatas conhecidas: as **Decisões em aberto** D1–D4 de `docs/specs/README.md` (stack do backend, front, repositório, provedor de IA), quando o usuário decidir.

| ADR | Título | Data | Status |
|---|---|---|---|
| [00001](00001-stack-backend-dotnet-10.md) | Stack do backend: .NET 10 + PostgreSQL | 2026-10-25 | Aceito (stack); Infra/Segurança pendentes |
| [00002](00002-armazenamento-local-fase-1.md) | Armazenamento local da Fase 1: IndexedDB, uma entrada por obra | 2026-10-25 | Aceito (revisar no PR) |
