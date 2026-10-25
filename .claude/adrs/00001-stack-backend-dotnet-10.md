# 00001 - Stack do backend: .NET 10 + PostgreSQL

**Data**: 2026-10-25
**Status**: Aceito pelo usuário (stack) — hospedagem, banco gerenciado e provedor de login pendentes com Infraestrutura e Segurança
**Spec/decisão relacionada**: D1 (`docs/specs/README.md`), SPEC-01, SPEC-02, SPEC-06 (RF-06.6 `.mpp`)

## Contexto
O CronoAI é front-only (estado no `localStorage`). A SPEC-01 exige um backend único dono dos dados, com várias obras, autenticação (SPEC-02) e leitura de `.mpp` (SPEC-06). O `SPEC.md` original admitia .NET ou Python/FastAPI; a decisão D1 estava em aberto.

## Decisão
O backend será em **.NET 10** (ASP.NET Core Web API) com **PostgreSQL**, conforme decidido pelo usuário em 25/10/2026.

## Justificativa
- **.NET 10 é LTS** (lançado em nov/2025, suporte até nov/2028), conforme a [política de suporte do .NET](https://dotnet.microsoft.com/platform/support/policy/dotnet-core). Prática geral: preferir LTS para sistema de produção.
- **`.mpp` via MPXJ:** a leitura do formato nativo do MS Project (RF-06.6) tem biblioteca para .NET ([MPXJ](https://www.mpxj.org/)). Antes do uso, verificar a compatibilidade da versão com .NET 10 e a licença (LGPL) com o Jurídico.
- **Alinhamento interno (opinião):** os guias da Sophia citam .NET + PostgreSQL como stack aprovada da Infraestrutura, o que tende a facilitar a hospedagem. Confirmar com a Infra.
- SDK 10.0.402 já instalado na máquina de desenvolvimento.

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| .NET 8 | Recomendação anterior da SPEC-01; o suporte termina antes (nov/2026) |
| Python/FastAPI | Leitura de `.mpp` exigiria ponte Java/MPXJ; fora do padrão interno citado |

## Consequências
**Positivas**
- O agente `dev-backend` e o prompt do `dba` passam a ter alvo definido.
- A SPEC-01 pode ser planejada (motor de cálculo com testes de paridade com o TypeScript atual).

**Negativas / trade-offs**
- Haverá dois motores de cálculo (TS e C#) até o front só exibir o que o servidor calcula. Os testes de paridade bloqueiam divergência (SPEC-01 › Riscos).
- **Front (D2):** os guias internos citam React como front aprovado. O CronoAI é Vue 3; a decisão D2 continua em aberto e deve ser confirmada com a Infra antes da publicação.
- Nada vai para servidor sem a equipe de **Infraestrutura** (hospedagem, banco, backups), e o provedor de login (SPEC-02) depende da **Segurança da Informação**.
