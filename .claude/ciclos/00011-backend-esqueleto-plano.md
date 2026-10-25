---
issue: —
spec: SPEC-01 — RF-01.2 (pipeline do contrato OpenAPI), RNF-01.3 (parcial: PostgreSQL local), RNF-01.4; SPEC-12 — RF-12.4, RF-12.5 (parcial: erros sem detalhe interno, headers, menor privilégio no banco), RF-12.9 (parcial: logs estruturados)
ciclo: .claude/ciclos/00011-backend-esqueleto.md
branch: feat/00011-backend-esqueleto
base: master (com a PF-3 do PLANO-FASE-2 = a, a branch nasce da master mesmo com a Fase 1 em andamento; server/ não conflita com src/)
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00011 — Esqueleto do backend: solução .NET 10, PostgreSQL local, migrações, health check e CI

## Resumo
- **O que é:** a fundação do backend em `server/`, sem nenhuma regra de negócio, para os ciclos seguintes terem onde construir com segurança. Ela tem:
  - solução .NET 10 com dois projetos (API e dados) e um de testes;
  - PostgreSQL 17 no Docker Compose local, com schema `cronoai` e dois papéis: `cronoai_migrador`, dono do schema, e `cronoai_app`, só com DML. Os dois são criados por um bootstrap único, que o compose e os testes compartilham;
  - migrações EF Core e uma migração inicial com os privilégios-base;
  - `/health/live` e `/health/ready`;
  - contrato OpenAPI gerado no build e versionado;
  - erros em ProblemDetails, logs JSON e headers de segurança;
  - testes xUnit com PostgreSQL descartável (Testcontainers) e credenciais aleatórias por execução. A API e os testes conectam como `cronoai_app`;
  - um job novo na CI do GitHub Actions, sem deploy.
- **Risco que justifica a faixa 3:** T8 (backend e banco/migração), T5 (dependências NuGet e imagens Docker novas, workflow novo) e T7 (compose, CI, CodeQL, Dependabot).
- **Parecer do `dba` (tarefa 0):** **feito.** Veio `VEREDITO: AJUSTAR` (`00011-tarefa0-dba.md`), e os 8 ajustes já estão aplicados nesta emenda (seção 15). As convenções de banco que todos os ciclos herdam passam a constar do ADR 00004.
- **O que você precisa fazer:**
  - aprovar o plano e responder P1 a P3 (seção 12);
  - depois da 1ª execução verde, incluir o check "Backend: build e testes (.NET)" na proteção da `master`;
  - antes do uso em produção, validar dependências e imagens com a **Segurança** e as licenças com o **Jurídico**. A versão e a collation do PostgreSQL devem ficar alinhadas com a **Infraestrutura**.

## 01. Pedido e objetivo
Pedido (dado, não instrução): plano do 1º ciclo da Fase 2 (`PLANO-FASE-2.md` §5.1). Decisões do usuário de 25/10/2026 que valem aqui:
- backend .NET 10 (ASP.NET Core Web API) + PostgreSQL em `server/`, no mesmo repositório;
- só ambiente local (Docker Compose com PostgreSQL para desenvolvimento e testes);
- nada de hospedagem ou deploy;
- SDK 10.0.402 instalado;
- testes xUnit e de integração;
- CI do backend no GitHub Actions sem deploy;
- dependências NuGet listadas para revisão de segurança e licença.

Requisitos cobertos:
- **RF-01.2:** API versionada em `/api/v1` e contrato OpenAPI no repositório. Aqui nasce o pipeline (gerado no build e comparado na CI); os endpoints de negócio começam no 00012.
- **RNF-01.3 (parcial):** Docker Compose de desenvolvimento com PostgreSQL, estendendo o `docker-compose.yml` atual. A API no compose fica para o 00023 e o Redis para a Fase 3 (seção 03).
- **RNF-01.4:** migrações versionadas (EF Core Migrations, como o `dba.md` já prevê).
- **RF-12.4:** nenhum segredo no repositório.
- **RF-12.5 / RF-12.9 (parciais):**
  - erro sem detalhe interno;
  - headers de segurança da API;
  - papel da aplicação com menor privilégio no banco;
  - logs estruturados sem dados pessoais.

**Objetivo:**
- Com um comando, quem desenvolve sobe o PostgreSQL local já com schema e papéis, roda a API e vê `/health/ready` saudável.
- Um `dotnet test` prova, num banco limpo e descartável:
  - que a migração aplica;
  - que o papel da aplicação não cria objeto nem é superusuário;
  - que erros não vazam detalhes;
  - que os headers estão lá.
- O PR só entra com o job do backend verde.

### Contexto para execução (ler antes)
| Arquivo | Por quê |
|---|---|
| `.claude/adrs/00001-stack-backend-dotnet-10.md` | Stack decidida; LTS até nov/2028; Infra e Segurança pendentes |
| `PLANO-FASE-2.md` §3 e §8 (entregue com este plano; vai para `docs/specs/`) | Projetos, direção de dependências e o Definition of Done de backend que nasce aqui |
| `00011-tarefa0-dba.md` (parecer da tarefa 0; vai para `.claude/ciclos/`) | **Fonte das convenções de banco.** §1 (convenções do ADR 00004), §2.4 (papéis), §4.2 (`Inicial`), §4.3 (testes novos), §6 (imagem, Testcontainers, compose, pg_hba, bootstrap). Seguir o esboço de bootstrap do §6.4: `.sh` com `psql -v ON_ERROR_STOP=1` e variáveis psql entre aspas, **sem** bloco `DO` |
| `docker-compose.yml` (todo) | **Imitar o endurecimento**: portas só em `127.0.0.1`, `no-new-privileges`, `cap_drop`, `read_only` + `tmpfs`, imagem por versão + digest, comentários de uso no topo. O serviço novo entra **em perfil**, para não mudar o `docker compose up --build app` |
| `.github/workflows/ci.yml` (todo) | **Imitar**: `permissions: contents: read` no topo, `persist-credentials: false`, `timeout-minutes`, `concurrency`, nomes de passo em português, artefato só na falha. **Não renomear** o job "Lint, tipos, testes e build" (proteção da `master`) |
| `.github/workflows/codeql.yml` | Hoje só `javascript-typescript`; o C# entra aqui |
| `.github/dependabot.yml` | Padrão de grupos e de `ignore` de major a imitar no ecossistema `nuget` |
| `.claude/rules/docker-ci.md` | Regras de compose, actions oficiais, sem push nem deploy, check obrigatório sem filtro `paths`, actionlint |
| `.gitignore`, `.dockerignore` | `.env*` já ignorados (manter); `bin/`, `obj/` e `server/` entram aqui |
| `docs/devops.md` §2–§4 | Tabela de workflows e proteção da `master` (linha nova para o job do backend) |
| `.claude/checklists/seguranca.md` › Backend | Itens que este ciclo já precisa cumprir (erro sem detalhe, sem segredo) e onde entra a seção ASVS L2 |
| `.claude/scripts/README.md` › Triagem e `lib/regras-cronoai.mjs:254` | `server/` já marca T8; `testar-afetado.mjs` e `auditar-dependencias.mjs` só tratam npm (os comandos .NET entram em `regras-comuns.md`) |
| `docs/specs/SPEC-01-arquitetura-backend.md` §3, §4 (RF-01.2), §6 | Arquitetura alvo e RNF |

## 02. Triagem
Confirmada por leitura do repositório em 25/10/2026 (branch `feat/00004-motor-minutos-calendarios`, sem alterar nada; não existe `server/`).

- **T1 NÃO:** nenhum arquivo em `src/lib/cpm.ts` ou `calendar.ts` é tocado.
- **T2 NÃO:** nenhum motor financeiro tocado.
- **T3 NÃO:** sem MSPDI nem formato de arquivo do app.
- **T4 NÃO:** o estado salvo do front não muda.
- **T5 SIM:**
  - dependências NuGet novas (seção 08);
  - imagens Docker novas: `postgres` no compose; `postgres` e `testcontainers/ryuk` puxadas pelo Testcontainers nos testes;
  - action nova `actions/setup-dotnet` (oficial, `actions/*`);
  - CodeQL ampliado;
  - `.env.example` com três variáveis de senha (só os nomes);
  - papéis e privilégios do banco.
- **T6 NÃO.**
- **T7 SIM:** `docker-compose.yml`, `.dockerignore`, `.github/workflows/ci.yml`, `codeql.yml`, `dependabot.yml`.
- **T8 SIM:** `server/` (backend, banco, migração, bootstrap). O `classificar-diff.mjs` marca T8 por `^(api|backend|server)\/` (`regras-cronoai.mjs:254`).

**Faixa 3.** `especialista-obra`: não exigido (nenhum cálculo).

## 03. Decisões de design
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Layout:**<br>• `server/CronoAI.slnx`;<br>• `server/src/CronoAI.Api` (host, endpoints, composição);<br>• `server/src/CronoAI.Dados` (DbContext e migrações);<br>• `server/db/bootstrap/` (provisionamento local de papéis e schema);<br>• `server/tests/CronoAI.Api.Testes`.<br>O `CronoAI.Dominio` nasce no 00012, com a 1ª entidade | Quatro camadas já agora (Application/Domain/Infrastructure/Api) | Projeto sem conteúdo é indireção sem valor (`checklists/qualidade.md › Simplicidade`). O `Dados` nasce já porque **mover migrações de assembly depois é caro**: muda o namespace, exige `MigrationsAssembly` e mexe no histórico |
| **Direção de dependências:** `Api → Dados → Dominio`; nenhum projeto referencia `Api`; o `Dominio` (futuro) sem pacote de EF ou ASP.NET | Domínio com atributos do EF | Mantém o motor puro e testável como o `src/lib` do front (paridade, SPEC-01 §3). Fica no ADR 00004 e num teste de arquitetura |
| **Formato `.slnx`** (padrão do `dotnet new sln` no SDK 10; conferir na página de [mudanças do SDK 10](https://learn.microsoft.com/dotnet/core/compatibility/sdk/10.0/dotnet-new-sln-slnx-default)) | `.sln` clássico | Arquivo XML legível e com diff limpo. Se alguma ferramenta da Infra não ler `.slnx`, `dotnet sln migrate` reverte |
| **Endpoints com minimal APIs e grupos** (`MapGroup("/api/v1")`): **P1** | Controllers | Ver P1. A documentação compara as duas abordagens em [Choose between controller-based APIs and minimal APIs](https://learn.microsoft.com/aspnet/core/fundamentals/apis) |
| **EF Core + Npgsql** como único acesso a dados. SQL bruto só com `FromSql`/`ExecuteSql` **interpolados**, que viram parâmetros; `FromSqlRaw`/`ExecuteSqlRaw` com texto montado são proibidos ([SQL queries — EF Core](https://learn.microsoft.com/ef/core/querying/sql-queries)). SQL bruto futuro qualifica o schema (`cronoai.`) | Dapper ao lado do EF | Dois caminhos de acesso dobram a superfície de revisão de SQL. O EF parametriza por padrão (OWASP: consultas parametrizadas, RF-12.5) |
| **Nomes em `snake_case`, tabelas no singular**, via `EFCore.NamingConventions` (mantido na organização do EF Core; Apache-2.0). Confirmado pelo `dba` (parecer §1.1) | Convenção manual no `OnModelCreating` | A manual precisa cobrir tabelas, colunas, chaves, índices e FKs, e erra em tipos próprios. Uma dependência pequena e mantida custa menos (opinião) |
| **Schema próprio `cronoai`** (`HasDefaultSchema("cronoai")`); histórico de migrações **explícito no mesmo schema** (`MigrationsHistoryTable("__ef_migrations_history", "cronoai")`); o schema nasce no **bootstrap**, com dono `cronoai_migrador` (parecer §1.2) | `public` | Alvo exato para `GRANT`/`REVOKE`/`ALTER DEFAULT PRIVILEGES` e para `pg_dump -n`. Não mistura com objetos de extensão. Trocar depois exige reescrever o snapshot e todas as migrações. Fixar o nome do histórico evita depender do que o plugin de nomes faz com `__EFMigrationsHistory` |
| **Papéis do banco já neste ciclo** (parecer §2.4):<br>• **bootstrap** (`POSTGRES_USER`): superusuário, só local; cria papéis e schema na 1ª subida; **a aplicação nunca usa**;<br>• **`cronoai_migrador`**: `LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, dono do schema `cronoai`; roda `dotnet ef database update` e o `MigrateAsync` dos testes;<br>• **`cronoai_app`**: os mesmos atributos, dono de nada, só DML (via privilégios padrão), **sem DDL**, `search_path = cronoai`.<br>Nomes dos papéis como constantes documentadas no ADR 00004 | Um papel só até o 00013 (versão anterior deste plano) | O RLS (00012) e o append-only (00013) só valem contra um papel que não seja dono nem superusuário. Sem a separação agora, os testes de isolamento e de auditoria **passariam por engano**, conectados como superusuário. O papel sem `CREATE` torna a migração na partida da API **impossível**, não só proibida. Uma migração que cita `cronoai_app` falha em ambiente sem o papel: falha ruidosa, desejável |
| **Bootstrap único** em `server/db/bootstrap/01-papeis-e-schema.sh`. Ele usa `psql -v ON_ERROR_STOP=1`, senhas passadas por `-v` e referenciadas como variável psql entre aspas, sem bloco `DO`. Conteúdo:<br>• `CREATE ROLE` ×2;<br>• `CREATE SCHEMA cronoai AUTHORIZATION cronoai_migrador`;<br>• `ALTER ROLE cronoai_app SET search_path = cronoai`;<br>• `REVOKE ALL ON DATABASE … FROM PUBLIC`;<br>• `REVOKE CREATE ON SCHEMA public FROM PUBLIC`;<br>• `GRANT CONNECT` aos dois papéis.<br>Montado **somente leitura** em `/docker-entrypoint-initdb.d` no compose (roda só em volume vazio) e executado pela fixture dos testes como superusuário. É a **mesma fonte** nos dois lugares | Papéis criados por migração; scripts separados para compose e testes | Criar papel exige privilégio que o migrador não deve ter. Duas fontes divergiriam. Não é "DDL solto": é provisionamento local de papéis e schema (o ADR 00004 diz isso); **toda DDL de tabela continua só em migração** |
| **Migrações:** EF Core Migrations no `CronoAI.Dados`; `dotnet-ef` como **ferramenta local** fixada (`server/.config/dotnet-tools.json`). Aplicação:<br>• em dev, por `dotnet ef database update` com a string do **migrador**;<br>• nos testes, por `MigrateAsync()` na fixture, como migrador;<br>• **nunca na partida da API**.<br>Para quem aplicar fora da máquina, no futuro: `dotnet ef migrations script --idempotent` ou *bundle* (a escolha é da Infra) | `Database.Migrate()` ao iniciar | A documentação desaconselha aplicar migrações em tempo de execução em produção: várias instâncias, privilégios de DDL no usuário da aplicação ([Applying Migrations](https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying)) |
| **Migração `Inicial` com a base de privilégios** (recomendação do `dba`, parecer §4.2). O `Up()` usa `migrationBuilder.Sql`, executado pelo `cronoai_migrador`:<br>• `GRANT USAGE ON SCHEMA cronoai TO cronoai_app`;<br>• `ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cronoai_app`;<br>• `ALTER DEFAULT PRIVILEGES IN SCHEMA cronoai GRANT USAGE, SELECT ON SEQUENCES TO cronoai_app`.<br>O `Down()` faz os `REVOKE` equivalentes. Nenhuma tabela de domínio. A CI verifica "modelo sem mudança pendente" (`dotnet ef migrations has-pending-model-changes`, [EF Core 8+](https://learn.microsoft.com/ef/core/managing-schemas/migrations/managing#checking-for-pending-model-changes)) | (a) `Inicial` vazia com os `GRANT` no bootstrap; (b) tabela "de exemplo" | (a) seria aceitável, mas os privilégios ficariam fora do versionamento das migrações. Na migração, eles são versionados, revisados no diff e testados (seção 11), e a `Inicial` deixa de ser arquivo sem efeito. (b) seria lixo de schema |
| **Duas strings de conexão** (parecer §2.4):<br>• `ConnectionStrings:Cronoai` (papel `cronoai_app`): API e testes de API;<br>• `ConnectionStrings:CronoaiMigracao` (papel `cronoai_migrador`): factory de design-time, `dotnet ef` e fixture.<br>Parâmetros do Npgsql explícitos: `Timeout`, `Command Timeout`, `Maximum Pool Size` finito; `Include Error Detail` **só em `Development`** (a mensagem pode trazer valores de linha); `Ssl Mode` desligado só no local (TLS de produção é da Infra, RF-12.7) | Uma string só | O papel de cada processo fica explícito. A API não tem como fazer DDL nem por engano |
| **Factory de design-time** (`IDesignTimeDbContextFactory`) lendo `ConnectionStrings__CronoaiMigracao` do ambiente, com erro claro sem ela e **sem valor padrão com senha**. Na CI, o job define uma string **fictícia sem senha** (`Host=localhost;Database=cronoai;Username=ef_design`) só para construir o modelo. Conferir que `has-pending-model-changes` não abre conexão (parecer §4.1) | Senha padrão na factory; segredo na CI | A CI continua sem segredo, e o passo de "modelo sem mudança pendente" não quebra por falta de variável |
| **Testes de integração com Testcontainers**, com **usuário, senha e banco explícitos e aleatórios por execução** (`.WithUsername`, `.WithPassword(Guid)`, `.WithDatabase`). Depois de subir, a fixture roda o **bootstrap** como superusuário e entrega duas strings (migrador e app), com senhas aleatórias. A conexão de superusuário só existe dentro da fixture. **P2** | PostgreSQL do compose ou `services:` do Actions | Ver P2. Correção da premissa anterior: o `Testcontainers.PostgreSql` 4.x usa por padrão credenciais fixas (`postgres`/`postgres`/`postgres`) e conecta como superusuário (parecer §6.2; conferir na versão adotada). Por isso as credenciais são definidas explicitamente |
| **Isolamento entre testes:** um contêiner por coleção, migração **uma vez**; cada teste cria os próprios dados com ids novos, sem `TRUNCATE` (parecer §6.3). Banco limpo por teste, quando um ciclo precisar: `CREATE DATABASE … TEMPLATE` | Contêiner por teste | Tempo de suíte; a partir do 00012 isso também exercita o isolamento entre empresas |
| **xUnit v3** (`xunit.v3`) e o `Assert` nativo | xUnit v2; FluentAssertions | A v2 está em manutenção ([what's new in v3](https://xunit.net/docs/getting-started/v3/whats-new)). O **FluentAssertions 8+ tem licença comercial** (Xceed) para uso em empresa: fora, para não criar pendência de licença |
| **Imagem `postgres:17` (Debian, glibc) por tag + digest**, a mesma referência no compose e na fixture. Versão: **P3** (o `dba` concorda com a 17) | `postgres:17-alpine` | A Alpine usa musl, e o suporte a locale e collation difere da glibc: a ordenação de texto acentuado (pt-BR) e o `ILIKE` podem divergir do banco gerenciado típico, sem aviso ([variantes](https://hub.docker.com/_/postgres); parecer §6.1). Opinião |
| **Encoding e collation fixados no `initdb`** e registrados no ADR 00004: `POSTGRES_INITDB_ARGS="--encoding=UTF8 --locale-provider=icu --icu-locale=pt-BR --locale=C.UTF-8"` ([locale providers](https://www.postgresql.org/docs/current/locale.html#LOCALE-PROVIDERS)). Isso dá UTF-8 com ordenação ICU pt-BR para os nomes exibidos em tela. Conferir ao subir que a imagem aceita a combinação | `C.UTF-8` puro (ordem por byte); padrão da imagem (`en_US.utf8`) | Mudar a collation depois exige reindexar. Nomes de obras, tarefas e pessoas aparecem ordenados na tela e devem seguir a ordem do português (opinião). A collation de produção é da **Infraestrutura** (pendência) |
| **Servidor local com `-c timezone=UTC -c log_statement=none`** (parecer §1.4 e §6.4) | Fuso padrão da imagem | Higiene: o instante é sempre UTC (`timestamptz`), e o relógio da obra é `timestamp` sem fuso (ADR 00003), nunca convertido pelo fuso da sessão. Sem log de comandos, valores de linha não vão para o log do PostgreSQL |
| **Autenticação do PostgreSQL:** **nunca** `POSTGRES_HOST_AUTH_METHOD=trust`. Com senha definida, as conexões TCP exigem `scram-sha-256` (conferir na tag: `SHOW password_encryption` e `SELECT * FROM pg_hba_file_rules`, com a saída anexada à matriz). O socket local dentro do contêiner continua `trust`, padrão da imagem, alcançável só por `docker exec`: aceitável em desenvolvimento ([pg_hba.conf](https://www.postgresql.org/docs/current/auth-pg-hba-conf.html)) | `trust` "por ser local" | Porta aberta em `127.0.0.1` ainda é alcançável por qualquer processo da máquina |
| **Configuração e segredos:**<br>• nenhuma senha em `appsettings*.json`;<br>• desenvolvimento: `dotnet user-secrets` (fora do repositório, [Safe storage of app secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets)) ou variáveis `ConnectionStrings__Cronoai` e `ConnectionStrings__CronoaiMigracao`;<br>• compose: **três** variáveis obrigatórias (`${VAR:?…}`) no `.env`, já ignorado: `CRONOAI_DB_SENHA` (bootstrap), `CRONOAI_DB_SENHA_MIGRADOR` e `CRONOAI_DB_SENHA_APP`;<br>• `.env.example` só com os nomes e um marcador, sem valor de exemplo;<br>• CI sem nenhum segredo (Testcontainers com credenciais aleatórias definidas na fixture, mais a string fictícia sem senha da factory) | Senha padrão "postgres" no compose ou no `appsettings.Development.json` | Inviolável 5 e RF-12.4. Senha fixa de exemplo tende a ir para outros ambientes |
| **Health checks** ([documentação](https://learn.microsoft.com/aspnet/core/host-and-deploy/health-checks)):<br>• `/health/live`: só o processo, sem dependências;<br>• `/health/ready`: `AddDbContextCheck<CronoDbContext>()`, do pacote oficial `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore`, com a conexão do `cronoai_app`.<br>Os dois são anônimos e respondem só `Healthy`/`Unhealthy`, sem exceção nem detalhe. Ficam fora de `/api/v1` e do OpenAPI | `AspNetCore.HealthChecks.NpgSql` (Xabaril); endpoint único | Pacote oficial e sem dependência de terceiro. A separação vivo × pronto é prática geral (o processo vivo não reinicia por queda do banco) |
| **Erros:** `AddProblemDetails()` + `UseExceptionHandler()` + `UseStatusCodePages()` ([Handle errors in ASP.NET Core APIs](https://learn.microsoft.com/aspnet/core/fundamentals/error-handling-api)): ProblemDetails (RFC 9457) com `traceId` e **sem pilha** fora de `Development` | Página de exceção do desenvolvedor sempre | RF-12.5 (erro sem detalhe interno) |
| **Logs:** `ILogger` com o formatador JSON do console ([Console log formatting](https://learn.microsoft.com/dotnet/core/extensions/console-log-formatter)); sem `UseHttpLogging` de corpo ou headers; `EnableSensitiveDataLogging` **nunca**; string de conexão nunca logada | Serilog | Sem dependência nova. Estruturado e sem dados pessoais (RF-12.9). Coletor e retenção são da Infra |
| **Headers de segurança da API** num middleware pequeno: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer`; Kestrel com `AddServerHeader = false` ([OWASP REST Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html), prática geral) | Pacote `NetEscapades.AspNetCore.SecurityHeaders` | Cinco linhas não justificam dependência |
| **Kestrel em `http://127.0.0.1:5280`** (`launchSettings.json`), sem HTTPS/HSTS configurados | Certificado de desenvolvimento e redirecionamento HTTPS | Em dev a API só escuta na interface local. TLS e HSTS de produção são da **Infraestrutura** (RF-12.7): pendência registrada |
| **OpenAPI:** `Microsoft.AspNetCore.OpenApi`; documento em `/openapi/v1.json` **só em `Development`**. Gerado também **no build** em `server/openapi/CronoAI.Api.json` (`Microsoft.Extensions.ApiDescription.Server`, [build-time](https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi#generate-openapi-documents-at-build-time)) e **versionado**. A CI falha se o gerado diferir do versionado | Swashbuckle/Scalar; documento só em tempo de execução | Atende a RF-01.2 desde o 1º endpoint. Sem UI interativa. Hoje o documento sai sem `paths`, e isso é esperado |
| **Higiene de build** (`server/Directory.Build.props`): `net10.0`, `Nullable`, `ImplicitUsings`, `TreatWarningsAsErrors`, `AnalysisLevel` `latest-recommended`; supressões só no `.editorconfig`, com comentário do porquê | Avisos livres | "Build sem warning novo" (`dev-backend.md`) |
| **Cadeia de suprimentos NuGet:**<br>• [Central Package Management](https://learn.microsoft.com/nuget/consume-packages/central-package-management);<br>• *lock files* com `--locked-mode` na CI ([locking dependencies](https://learn.microsoft.com/nuget/consume-packages/package-references-in-project-files#locking-dependencies));<br>• [NuGet Audit](https://learn.microsoft.com/nuget/concepts/auditing-packages) com `NuGetAuditMode=all` e `WarningsAsErrors` NU1903;NU1904;<br>• [Package Source Mapping](https://learn.microsoft.com/nuget/consume-packages/package-source-mapping) só para nuget.org | Versões soltas em cada `.csproj`; sem auditoria | Mesma política do front (audit de produção zerado). Evita confusão de dependência entre fontes |
| **SDK fixado** em `server/global.json` (`10.0.402`, `rollForward: latestPatch`) | Sem `global.json` | A CI e a máquina usam o mesmo SDK |
| **CI:** job novo **no `ci.yml`**, "Backend: build e testes (.NET)", sem filtro `paths`. Passos:<br>• restore travado;<br>• `dotnet format --verify-no-changes`;<br>• build;<br>• testes (inclui os de integração com Docker do runner);<br>• diff do OpenAPI;<br>• `has-pending-model-changes` com a string fictícia sem senha.<br>Resultados de teste como artefato só na falha. **Sem deploy, sem imagem, sem segredo** | Workflow separado com `paths: server/**` | Check obrigatório com filtro `paths` fica pendente e trava o merge (`rules/docker-ci.md`) |
| **CodeQL** com `csharp` (`build-mode: none`) ao lado de `javascript-typescript` | `autobuild` | O modo sem build não depende do restore. Se a Segurança quiser mais precisão, troca por `manual` |
| **Dependabot** com o ecossistema `nuget` em `/server` (majors ignoradas, grupos minor/patch). O digest da imagem do compose usa o ecossistema `docker-compose`, se o Dependabot do repositório o suportar (conferir na implementação) | Atualização manual | Mesma política do npm e do Docker já configurados |
| **Compose:** serviço `db` no **perfil `backend`** (`docker compose --profile backend up -d db`):<br>• imagem `postgres:17@sha256:…`, com `POSTGRES_INITDB_ARGS` e `command` com `timezone` e `log_statement`;<br>• porta `127.0.0.1:5432`, volume nomeado `cronoai_pgdados`;<br>• bootstrap montado somente leitura e healthcheck `pg_isready`;<br>• endurecimento: `no-new-privileges`, `cap_drop: [ALL]` com o mínimo que o entrypoint precisa (`CHOWN`, `DAC_OVERRIDE`, `FOWNER`, `SETGID`, `SETUID`) e `read_only` com `tmpfs` em `/var/run/postgresql` e `/tmp`;<br>• as três senhas obrigatórias | Sem perfil; API no compose; Redis | Sem perfil, o `docker compose up` do front passaria a subir o banco. API em container: no 00023. Redis: não há fila nem cache (Fase 3). Se o endurecimento impedir o PostgreSQL de iniciar, o dev registra o desvio e o `seguranca` decide |
| **Processo:**<br>• `regras-comuns.md › Checagens` ganha `dotnet build`, `dotnet test` e `dotnet list package --vulnerable --include-transitive`;<br>• nova regra `.claude/rules/backend-dotnet.md` (`paths: server/**`);<br>• `CLAUDE.md`: stack, comandos, mapa e agentes ativos;<br>• ADR 00004 | Estender agora `testar-afetado.mjs`/`auditar-dependencias.mjs` para .NET | Os scripts são npm-cêntricos. Estendê-los é um ciclo de processo à parte |
| **Convenção de nomes no C#:** domínio em português (`Obra`, `Tarefa`, `CronoDbContext`), padrões de framework em inglês onde o framework impõe (`Program`, `*Middleware`, `*Extensions`); PascalCase do .NET | Tudo em inglês | `CLAUDE.md`: termos de negócio em português |

**ADR:** propor `/adr` **00004 — Estrutura, convenções e ferramentas do backend .NET**, com status `Proposto` até o seu aceite. Se a Fase 1 criar ADRs antes, usar o próximo número livre. O ADR registra:
- **Estrutura e ferramentas:**
  - layout e direção de dependências;
  - minimal APIs (conforme P1);
  - EF Core + Npgsql;
  - migrações sem aplicação na partida e bootstrap local de papéis e schema (não é DDL de tabela);
  - Testcontainers com credenciais aleatórias;
  - CPM, lock e audit;
  - nomes em português no C#.
- **Convenções de banco do parecer do `dba` (§1), herdadas pelos ciclos 00012 a 00023:**
  - **Nomes:** `snake_case`, tabelas no singular, sem palavras reservadas.
  - **Histórico de migrações:** nome explícito, `cronoai.__ef_migrations_history`.
  - **Identificadores até 63 bytes:** o PostgreSQL trunca em silêncio; compostos longos são nomeados à mão, com teste de catálogo.
  - **Unidade no nome da coluna:** `duracao_min`, `lag_min`, `folga_total_min`, `inicio_restricao_local`.
  - **Schema:** `cronoai`.
  - **Papéis:** `cronoai_migrador` × `cronoai_app`, como constantes.
  - **Chaves:**
    - PK `uuid` v7 gerado na aplicação (`Guid.CreateVersion7`, `ValueGeneratedNever`, atribuído na fábrica do domínio). O v7 **não é controle de segurança**;
    - **`auditoria.id` como `bigint generated always as identity`**;
    - `uid_msproject` `integer` único por obra, nunca PK.
  - **FKs:** sem cascata (`DeleteBehavior.Restrict` global).
  - **Tempo:**
    - **`timestamptz`** para instante real (UTC, `DateTime` com Kind UTC);
    - **`date`** para datas de calendário (`DateOnly`);
    - **`timestamp` sem fuso** para o relógio local da obra (sufixo `_local`, Kind Unspecified, com teste de `Kind`);
    - minutos em `integer`.
  - **Dinheiro e números:** **`numeric` com precisão explícita** em toda propriedade `decimal` (`HasPrecision` obrigatório, com teste de arquitetura a partir do 00012); nunca `money` nem `double precision`.
  - **Enum:** `text` + `CHECK`, não `CREATE TYPE … AS ENUM`.
  - **Concorrência:** **`xmin` como versão da linha**, exposta como `versao` opaca, e **contador explícito na `obra`** para a versão do agregado. O `xmin` da obra não muda quando uma tarefa muda.
  - **Multiempresa:** **`empresa_id` em toda tabela de dado de empresa** (denormalizado, com FK composta `(empresa_id, obra_id)`) + **filtro global do EF**, com `AddDbContext` e não pool de DbContext. **Direção do RLS:** variável de sessão `app.empresa_id`, setada por parâmetro num interceptor de conexão, com `FORCE ROW LEVEL SECURITY` e teste de catálogo. A decisão formal fica no ADR 00006 (00012).
  - **Data Protection:** `SetApplicationName("CronoAI")` fixo e anel de chaves fora do repositório e do contexto do Docker (uso a partir do 00012).
  - **Seed:** só por comando explícito em `Development`, nunca em migração.
  - **Encoding, collation e fuso** do servidor local, com a ressalva de que a produção é da Infra.

## 04. Caso de referência (T1/T2)
Não se aplica: nenhum cálculo é criado ou alterado.

## 05. MS Project e arquivos (T3)
Não se aplica: sem MSPDI, CSV ou formato de arquivo do app.

## 06. Estado salvo (T4)
Não se aplica: o estado do front (IndexedDB, `cronoai-state-v1`) não é tocado.

## 07. Dados (T8 com banco)
**Parecer do `dba` (tarefa 0): feito em 25/10/2026.** Veio `VEREDITO: AJUSTAR` (`00011-tarefa0-dba.md`), e os ajustes estão aplicados nesta emenda. O ciclo não cria tabela de domínio, mas fixa a base que todos os ciclos herdam:

| Tema | Decisão | Origem |
|---|---|---|
| Nomes | `snake_case` via `EFCore.NamingConventions`; tabelas no singular; histórico `cronoai.__ef_migrations_history` explícito; identificadores até 63 bytes; unidade no nome da coluna | Parecer §1.1 |
| Schema | `cronoai`, criado no bootstrap, dono `cronoai_migrador`; `REVOKE CREATE ON SCHEMA public FROM PUBLIC` | §1.2 |
| Papéis | bootstrap (superusuário, só local) × `cronoai_migrador` (dono do schema) × `cronoai_app` (só DML, sem DDL, `NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, `search_path = cronoai`) | §2.4 |
| Privilégios | Na migração `Inicial`: `GRANT USAGE` no schema e `ALTER DEFAULT PRIVILEGES` (DML nas tabelas, `USAGE, SELECT` nas sequências) para o `cronoai_app`, rodados pelo migrador | §4.2 |
| Chaves | `uuid` v7 na aplicação; `auditoria.id` `bigint identity` (00013); FKs `Restrict` | §1.3 |
| Tipos | `timestamptz` (UTC), `date`, `timestamp` sem fuso (`_local`), minutos `integer`, `numeric` com precisão explícita, enum como `text` + `CHECK` | §1.4, §1.5 |
| Concorrência | `xmin` por linha (exposto como `versao`); contador de agregado na `obra` quando necessário (00015/00021) | §1.6 |
| Multiempresa | `empresa_id` + FK composta + filtro EF; RLS como direção (ADR 00006, 00012) | §2 |
| Imagem e servidor | `postgres:17` Debian com digest; UTF-8 + ICU pt-BR; `timezone=UTC`; `log_statement=none`; sem `trust` | §6.1, §6.4 |
| Testes | Testcontainers com usuário e senha aleatórios; bootstrap na fixture; API e testes como `cronoai_app` | §6.2 |

**Pendências registradas (não decididas neste ciclo):**
- **Precisão do dinheiro e do percentual** (proposta do `dba`: valor digitado `numeric(18,2)`, valor derivado gravado `numeric(20,6)`, percentual conforme as casas que o front aceita) e **`time` × minutos desde 00:00** (`smallint`) para os intervalos do calendário: fecham no **00015**, com o `especialista-obra` e a Controladoria. A PF-2 do plano da fase também pesa aqui.
- **Particionamento da `auditoria` por mês:** fecha no plano do **00013**, com estimativa de volume. **Recomendação do `dba`: não particionar agora.** Os custos são três: PK com a chave de partição, rotina de criação de partição sem jobs até a Fase 3, e descarte de partição em conflito com o append-only. Se for particionar, a tabela já nasce particionada no 00013.
- `NULL` × 0 por coluna de avanço e custo: 00015.
- Collation e versão de produção, e a forma de aplicar migrações fora da máquina local: **Infraestrutura**.

**Isolamento por empresa:** sem tabela de dado neste ciclo. O pré-requisito (papel da aplicação que não é dono nem superusuário) fica pronto aqui, e a regra vale a partir do 00012 (`PLANO-FASE-2.md` §8.3).

## 08. Segurança

| Superfície | Ameaça | Mitigação | Item |
|---|---|---|---|
| Dependências NuGet novas | Pacote vulnerável ou malicioso; confusão de fonte; licença incompatível | Lista abaixo para revisão; CPM + *lock files* + `--locked-mode`; NuGet Audit bloqueando alta/crítica; source mapping só nuget.org; licenças só permissivas | S-2 |
| Imagens Docker | Imagem trocada na origem (tag mutável) | `postgres:17` (Debian) por tag + digest, a mesma referência no compose e na fixture. `testcontainers/ryuk` (o *resource reaper*, que monta o socket do Docker) registrado para a Segurança | S-3 |
| Compose `db` | Banco exposto na rede; privilégios demais; autenticação fraca | Porta só em `127.0.0.1`; `no-new-privileges`; `cap_drop` + mínimos; volume nomeado; três senhas obrigatórias; **nunca** `POSTGRES_HOST_AUTH_METHOD=trust`; `scram-sha-256` no TCP (evidência de `pg_hba_file_rules` e `password_encryption`) | S-5, S-9 |
| Papéis do banco | Aplicação com DDL ou superusuário; teste de segurança que passa por engano conectado como superusuário | `cronoai_app` sem DDL, sem superusuário, sem `BYPASSRLS`; a API e os testes de API conectam como `cronoai_app`; o superusuário só existe no bootstrap e na fixture; testes de catálogo (`pg_roles`, `CREATE TABLE` recusado com `42501`) | S-10 |
| Segredos | Senha no repositório, no `appsettings`, na CI ou no log | Nenhuma senha versionada; `.env` já ignorado (`.gitignore`, `.dockerignore`); `.env.example` só com os três nomes e um marcador. **CI sem segredo:** o Testcontainers recebe usuário e senha **aleatórios por execução**, definidos explicitamente na fixture (o padrão da biblioteca é fixo, `postgres`/`postgres`), e a factory de design-time usa uma string fictícia **sem senha**. Teste reprova senha em `appsettings*.json`; string de conexão nunca logada | S-1 |
| Erros | Pilha, SQL ou estrutura interna ao cliente | ProblemDetails sem pilha fora de `Development`; `Include Error Detail` do Npgsql só em `Development`; teste com exceção forçada em ambiente `Production` | S-7 |
| OpenAPI | Mapa da API exposto em produção | Documento em tempo de execução só em `Development` | S-7 |
| Health checks | Vazamento de detalhe (mensagem do Npgsql, host, versão) | Resposta só com o estado | S-7 |
| Headers | Sniffing de tipo, cache de resposta, enquadramento | Middleware da seção 03; `Server` removido | S-4b |
| Logs | Dado pessoal, string de conexão, valores de linha | JSON estruturado; sem log de corpo ou headers; `EnableSensitiveDataLogging` ausente; `log_statement=none` no PostgreSQL | S-6 |
| Workflow | Token com escrita, segredo, deploy, action de terceiro, injeção via `github.event` | `permissions: contents: read`; `persist-credentials: false`; só `actions/*` e `github/*`; sem push nem deploy; sem `${{ github.event.* }}` em `run:`; actionlint | S-4 |
| Imagem do front | `server/` entrando no contexto de build do Nginx | `server` no `.dockerignore`; `docker build` + smoke test do `docs/devops.md` | S-8 |

**Dependências novas (versões finais conferidas na implementação; todas para revisão de segurança e licença antes de produção):**

| Pacote / imagem / ferramenta | Projeto | Licença (conferir) | Por quê |
|---|---|---|---|
| `Npgsql.EntityFrameworkCore.PostgreSQL` 10.x (traz `Npgsql` e `Microsoft.EntityFrameworkCore` 10) | Dados | PostgreSQL License; MIT | Provedor EF Core do PostgreSQL |
| `EFCore.NamingConventions` 10.x | Dados | Apache-2.0 | `snake_case` |
| `Microsoft.EntityFrameworkCore.Design` 10.x (`PrivateAssets=all`) | Dados | MIT | Ferramentas de migração em tempo de design |
| `Microsoft.AspNetCore.OpenApi` 10.x | Api | MIT | Documento OpenAPI |
| `Microsoft.Extensions.ApiDescription.Server` 10.x (`PrivateAssets=all`) | Api | MIT | Gerar o OpenAPI no build |
| `Microsoft.Extensions.Diagnostics.HealthChecks.EntityFrameworkCore` 10.x | Api | MIT | `/health/ready` |
| `dotnet-ef` 10.x (ferramenta local) | `server/.config` | MIT | `migrations add`, `database update`, `has-pending-model-changes` |
| `xunit.v3`, `xunit.runner.visualstudio` | Testes | Apache-2.0 | Testes |
| `Microsoft.NET.Test.Sdk` | Testes | MIT | Execução dos testes |
| `Microsoft.AspNetCore.Mvc.Testing` 10.x | Testes | MIT | `WebApplicationFactory` ([integration tests](https://learn.microsoft.com/aspnet/core/test/integration-tests)) |
| `Testcontainers.PostgreSql` 4.x | Testes | MIT | PostgreSQL descartável ([Testcontainers for .NET](https://dotnet.testcontainers.org/)); depende da P2 |
| `coverlet.collector` | Testes | MIT | Cobertura (medida, sem limiar neste ciclo) |
| Imagem `postgres:17` (Debian, digest) | compose, testes | PostgreSQL License | Banco local |
| Imagem `testcontainers/ryuk` (puxada pelo Testcontainers) | testes | MIT | Limpeza de contêineres |
| Action `actions/setup-dotnet` (v5 ou a vigente) | CI | MIT (oficial) | SDK na CI |

Validação com a **Segurança da Informação:** dependências, imagens e a action nova, **antes do uso em produção** (não bloqueia o merge local; registrar no PR). O `seguranca` confere S-1 a S-10.

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit (Conventional Commits) |
|---|---|---|---|---|
| E1 | Solução .NET, PostgreSQL local com papéis e schema, migração inicial com privilégios, health check, OpenAPI, erros, logs, headers e testes | `server/**` (inclui `server/db/bootstrap/`), `docker-compose.yml`, `.env.example`, `.gitignore`, `.dockerignore` | AC-1 a AC-7, AC-13 a AC-16 | `feat(server): esqueleto do backend .NET 10 com PostgreSQL local, papéis, migrações e health check (ciclo 00011)` |
| E2 | CI do backend, CodeQL C#, Dependabot NuGet, documentação, regra e ADR 00004 | `.github/**`, `CLAUDE.md`, `docs/devops.md`, `docs/specs/SPEC-01…` (§3, diagrama), `.claude/rules/backend-dotnet.md`, `.claude/skills/desenvolver-recurso/etapas/regras-comuns.md`, `.claude/agents/{dev-backend,dba}.md` (cabeçalho), `.claude/checklists/seguranca.md` (seção ASVS L2), `.claude/adrs/00004-…`, `.claude/adrs/README.md` | AC-8 a AC-12 | `ci(server): build e testes do backend, CodeQL C#, Dependabot NuGet e documentação (ciclo 00011)` |

São cerca de 48 arquivos, dos quais cerca de 10 gerados por ferramenta (*lock files*, migração e *designer*, snapshot do modelo, OpenAPI). Cada entregável passa sozinho no `npm run ci` (o front não muda). O E1 passa também em `dotnet build` e `dotnet test` locais. O E2 é provado pela execução da CI no PR.

## 10. Tarefas
| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | **Feita:** levantamento das convenções de banco. Parecer `00011-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, ajustes aplicados na emenda 01 (seção 15) | dba (leitura) | — (ciclo) | — |
| 1 | E1 | Base de build: `global.json` (10.0.402, `latestPatch`), `Directory.Build.props` (seção 03), `Directory.Packages.props` (versões da seção 08), `nuget.config` (só nuget.org, source mapping), `.editorconfig` do C#, `CronoAI.slnx`. Na raiz: `.gitignore` com `server/**/bin/`, `obj/`, `TestResults/`, `*.user`; `.dockerignore` com `server` | dev-backend | `server/global.json`, `server/Directory.Build.props`, `server/Directory.Packages.props`, `server/nuget.config`, `server/.editorconfig`, `server/CronoAI.slnx`, `.gitignore`, `.dockerignore` | gate |
| 2 | E1 | `CronoAI.Dados`:<br>• `.csproj`;<br>• `CronoDbContext` sem entidades, com `HasDefaultSchema("cronoai")`, `snake_case` e `MigrationsHistoryTable("__ef_migrations_history", "cronoai")`;<br>• constantes dos papéis;<br>• factory de design-time lendo `ConnectionStrings__CronoaiMigracao` (erro claro sem ela, sem valor padrão com senha);<br>• `server/.config/dotnet-tools.json` com `dotnet-ef`;<br>• migração `Inicial` com o `Up()` de privilégios e o `Down()` com os `REVOKE` (seção 03);<br>• *lock file* | dev-backend | `server/src/CronoAI.Dados/CronoAI.Dados.csproj`, `CronoDbContext.cs`, `PapeisBanco.cs`, `CronoDbContextDesignTimeFactory.cs`, `Migrations/*` (gerados + `Sql` à mão no `Inicial`), `packages.lock.json`, `server/.config/dotnet-tools.json` | 1 |
| — | E1 | **Checkpoint:** arquivos criados, `dotnet build` limpo sem warning, migração `Inicial` com os privilégios; o orquestrador confere contra a seção 03 antes da tarefa 3 | orquestrador | — | 2 |
| 3 | E1 | `CronoAI.Api`:<br>• `Program.cs` com ProblemDetails, exception handler, status code pages, logs JSON, Kestrel sem header `Server`, middleware de headers e grupo `/api/v1` vazio;<br>• `AddDbContext` (não pool) lendo `ConnectionStrings:Cronoai` (papel `cronoai_app`), com `Include Error Detail` só em `Development`;<br>• `appsettings.json`/`appsettings.Development.json` **sem senha** (só host, porta, banco, usuário, timeouts e pool);<br>• `launchSettings.json` em `http://127.0.0.1:5280`;<br>• `public partial class Program` | dev-backend | `server/src/CronoAI.Api/CronoAI.Api.csproj`, `Program.cs`, `CabecalhosSegurancaMiddleware.cs`, `appsettings.json`, `appsettings.Development.json`, `Properties/launchSettings.json`, `packages.lock.json` | 2 |
| 4 | E1 | Health checks `/health/live` (sem dependências, por *tag*) e `/health/ready` (`AddDbContextCheck`), anônimos, corpo só com o estado, fora do OpenAPI | dev-backend | `server/src/CronoAI.Api/Program.cs` (ou `Saude/SaudeExtensions.cs`) | 3 |
| 5 | E1 | OpenAPI: `AddOpenApi`/`MapOpenApi` só em `Development`; geração no build para `server/openapi/CronoAI.Api.json`; arquivo versionado | dev-backend | `server/src/CronoAI.Api/CronoAI.Api.csproj`, `Program.cs`, `server/openapi/CronoAI.Api.json` | 3 |
| 6 | E1 | Bootstrap e compose:<br>• `server/db/bootstrap/01-papeis-e-schema.sh` (seção 03; `psql -v ON_ERROR_STOP=1`, variáveis psql entre aspas, sem `DO`);<br>• serviço `db` no perfil `backend`: `postgres:17@sha256:…`, `POSTGRES_INITDB_ARGS`, `command` com `-c timezone=UTC -c log_statement=none`, bootstrap montado `:ro`, três senhas `${VAR:?…}`, volume, healthcheck, endurecimento;<br>• comentários de uso no topo (bash e PowerShell);<br>• `.env.example` com as três variáveis e um marcador;<br>• `server/README.md` com `user-secrets` das duas strings, `dotnet ef database update` com a string do migrador e "recriar papéis = `docker compose --profile backend down -v`" | dev-backend | `server/db/bootstrap/01-papeis-e-schema.sh`, `docker-compose.yml`, `.env.example`, `server/README.md` | 1 |
| 7 | E1 | Projeto de testes:<br>• `.csproj`;<br>• fixture `BancoPostgresFixture`: Testcontainers com a mesma imagem, digest e `POSTGRES_INITDB_ARGS` do compose, usuário, senha e banco **aleatórios**; roda o bootstrap como superusuário, `MigrateAsync` como migrador uma vez por coleção e expõe as duas strings;<br>• `ApiFactory : WebApplicationFactory<Program>` com a string do **`cronoai_app`** e ambiente configurável;<br>• testes de saúde e de migração (seção 11);<br>• traço `Categoria=Integracao` | dev-backend | `server/tests/CronoAI.Api.Testes/CronoAI.Api.Testes.csproj`, `Infra/BancoPostgresFixture.cs`, `Infra/ApiFactory.cs`, `SaudeTestes.cs`, `MigracoesTestes.cs`, `packages.lock.json` | 4, 6 |
| 8 | E1 | Testes de erro (endpoint que lança, injetado **só no host de teste** por `IStartupFilter`), headers, OpenAPI por ambiente, configuração sem senha, arquitetura, **papéis e privilégios** e **servidor** (seção 11) | dev-backend | `ErrosTestes.cs`, `CabecalhosTestes.cs`, `OpenApiTestes.cs`, `ConfiguracaoTestes.cs`, `ArquiteturaTestes.cs`, `PapeisBancoTestes.cs`, `ServidorBancoTestes.cs` | 5, 7 |
| 9 | E1 | Evidências locais:<br>• `docker compose --profile backend up -d db` → `healthy`;<br>• o compose sem uma das três variáveis recusa subir;<br>• `dotnet ef database update` (migrador);<br>• `dotnet run` + `curl` em `/health/live`, `/health/ready` (com o banco e com ele parado) e `/openapi/v1.json`;<br>• como superusuário via `docker exec`: `SHOW password_encryption`, `SELECT * FROM pg_hba_file_rules`, `SHOW timezone`, `SHOW server_encoding` e o provedor e locale de `pg_database`;<br>• `dotnet test` completo, `npm run ci`, `docker build -t cronoai:local .` + smoke test do front e `dotnet list package --vulnerable --include-transitive`.<br>Trechos literais na matriz | orquestrador | — (ciclo) | 8 |
| 10 | E2 | `ci.yml`: job "Backend: build e testes (.NET)" (`timeout-minutes: 15`):<br>• checkout sem credenciais e `actions/setup-dotnet` com `global-json-file: server/global.json` e cache NuGet pelos *lock files*;<br>• `dotnet restore --locked-mode`, `dotnet format --verify-no-changes`, `dotnet build --no-restore -c Release` e `dotnet test --no-build -c Release`;<br>• `git diff --exit-code server/openapi/`;<br>• `dotnet tool restore` + `dotnet ef migrations has-pending-model-changes`, com `ConnectionStrings__CronoaiMigracao` **fictícia sem senha** no `env:` do passo (`Host=localhost;Database=cronoai;Username=ef_design`);<br>• `TestResults` como artefato só na falha | dev-backend | `.github/workflows/ci.yml` | E1 |
| 11 | E2 | `codeql.yml`: matriz com `csharp` (`build-mode: none`) e `javascript-typescript`, `category` por linguagem; `dependabot.yml`: `nuget` em `/server` (majors ignoradas, grupos minor/patch, prefixo `chore(deps)`) e digest do compose se suportado | dev-backend | `.github/workflows/codeql.yml`, `.github/dependabot.yml` | E1 |
| 12 | E2 | Documentação:<br>• `CLAUDE.md`: tabela de stack (linha Backend), comandos `dotnet`/compose, mapa com `server/`, ponteiro para o ADR 00004, agentes `dev-backend`/`dba` ativos;<br>• `docs/devops.md`: workflow novo, check obrigatório novo, como subir o banco local e os papéis;<br>• `SPEC-01` §3: diagrama da Fase 2 (PostgreSQL 17; Redis, jobs e pgvector como Fase 3) | dev-backend | `CLAUDE.md`, `docs/devops.md`, `docs/specs/SPEC-01-arquitetura-backend.md` | 10, 11 |
| 13 | E2 | Processo:<br>• `.claude/rules/backend-dotnet.md` (`paths: server/**`: convenções do ADR 00004, SQL, migrações, papéis, segredos, testes como `cronoai_app`);<br>• `regras-comuns.md › Checagens` com os comandos .NET;<br>• cabeçalhos de `dev-backend.md`/`dba.md` ("ativo a partir do 00011");<br>• `checklists/seguranca.md` com a seção "Backend — ASVS L2" (esqueleto por capítulo);<br>• **ADR 00004** com todas as convenções da seção 03 e linha no índice;<br>• parecer da tarefa 0 copiado para `.claude/ciclos/00011-tarefa0-dba.md` | orquestrador | `.claude/rules/backend-dotnet.md`, `.claude/skills/desenvolver-recurso/etapas/regras-comuns.md`, `.claude/agents/dev-backend.md`, `.claude/agents/dba.md`, `.claude/checklists/seguranca.md`, `.claude/adrs/00004-estrutura-convencoes-backend.md`, `.claude/adrs/README.md`, `.claude/ciclos/00011-tarefa0-dba.md` | gate (ADR), 12 |
| 14 | E2 | Evidências:<br>• `actionlint` (container `rhysd/actionlint`);<br>• `classificar-diff.mjs --base master --faixa 3`;<br>• `validar-regras.mjs`;<br>• execução do job no PR (link e trecho), quando você der o push | orquestrador | — (ciclo) | 13 |

### Grafo
```
gate ─ 1 ─┬─ 2 ─ [checkpoint] ─ 3 ─┬─ 4 ─┐
          │                        └─ 5 ─┼─ 8 ─ 9                   (E1)
          └─ 6 ─────────────────────── 7 ┘
E1 ─┬─ 10 ─┐
    └─ 11 ─┴─ 12 ─ 13 ─ 14                                          (E2)
gate ─ ADR 00004 (rascunho em paralelo; entra no commit do E2)
```
- A tarefa 6 (bootstrap e compose) corre em paralelo às tarefas 2 a 5 (arquivos disjuntos). A 7 depende da 6, porque a fixture roda o mesmo bootstrap.
- O E2 depende do E1: o job precisa da solução para rodar.

## 11. Testes previstos
Projeto `server/tests/CronoAI.Api.Testes` (xUnit v3). Os testes marcados com (I) precisam de Docker (Testcontainers) e levam `Categoria=Integracao`. Conexões: **(app)** = `cronoai_app`, como a API; **(mig)** = `cronoai_migrador`; o superusuário só aparece dentro da fixture.

| Critério | Teste | Arquivo | Valor/resultado esperado |
|---|---|---|---|
| AC-3 | `Live_responde_200_mesmo_sem_banco` | `SaudeTestes.cs` | Factory com string para porta fechada: `GET /health/live` → 200, corpo `Healthy` |
| AC-3 (I, app) | `Ready_responde_200_com_banco_migrado` | `SaudeTestes.cs` | 200, corpo `Healthy` |
| AC-3 | `Ready_responde_503_sem_banco_e_sem_detalhe` | `SaudeTestes.cs` | 503, corpo exatamente `Unhealthy`; o corpo não contém "Npgsql", "Host", "password" nem a porta |
| AC-4, AC-15, P-1 (I, mig) | `Migracao_inicial_aplica_em_banco_limpo` | `MigracoesTestes.cs` | `GetAppliedMigrationsAsync()` = 1 migração, com nome terminando em `_Inicial` |
| P-1 (I, mig) | `Reaplicar_migracoes_nao_altera_o_banco` | `MigracoesTestes.cs` | 2º `MigrateAsync()` sem exceção; ainda 1 migração aplicada |
| AC-4 | `Modelo_sem_mudanca_pendente` | `MigracoesTestes.cs` | `Database.HasPendingModelChanges()` = `false` (API do EF Core 9+; a CI repete pela CLI) |
| AC-15 (I) | `Historico_de_migracoes_no_schema_cronoai` | `MigracoesTestes.cs` | `to_regclass('cronoai.__ef_migrations_history')` não nulo e `to_regclass('public.__EFMigrationsHistory')` nulo |
| AC-14 (I, app) | `Papel_da_aplicacao_nao_e_superusuario_nem_bypassrls` | `PapeisBancoTestes.cs` | `pg_roles` do `current_user`: `rolsuper`, `rolbypassrls`, `rolcreatedb`, `rolcreaterole` = `false`; `current_user` = `cronoai_app` |
| AC-14 (I, app) | `Papel_da_aplicacao_nao_cria_objeto` | `PapeisBancoTestes.cs` | `CREATE TABLE cronoai.t_x(id int)` e `CREATE TABLE public.t_x(id int)` falham com SQLSTATE `42501` |
| AC-14 (I, mig + app) | `Privilegios_padrao_dao_DML_ao_app_em_tabela_nova_do_migrador` | `PapeisBancoTestes.cs` | Numa transação revertida ao fim, o migrador cria `cronoai.t_priv(id int)` e o app consegue `INSERT`, `SELECT`, `UPDATE` e `DELETE`. Prova os `ALTER DEFAULT PRIVILEGES` da `Inicial` |
| AC-15 (I, app) | `Sessao_da_aplicacao_usa_search_path_cronoai` | `PapeisBancoTestes.cs` | `SHOW search_path` = `cronoai` |
| R-5 (I) | `Identificadores_cabem_em_63_bytes` | `PapeisBancoTestes.cs` | Nenhum nome em `pg_class`/`pg_constraint` do schema `cronoai` com 63 bytes (sinal de truncamento) nem duplicado. Passa vazio hoje e protege a partir do 00012 |
| AC-16 (I) | `Servidor_em_utf8_icu_ptbr_e_utc` | `ServidorBancoTestes.cs` | `SHOW server_encoding` = `UTF8`; `SHOW timezone` = `UTC`; `pg_database` do banco com provedor ICU (`i`) e locale `pt-BR` (coluna `datlocale` na 17; conferir) |
| AC-6 | `Excecao_vira_problem_details_sem_pilha_em_producao` | `ErrosTestes.cs` | Ambiente `Production`, endpoint de teste que lança `InvalidOperationException("detalhe-secreto")`: 500, `application/problem+json`, `traceId` presente, corpo **sem** "detalhe-secreto", "at " nem "InvalidOperationException" |
| AC-6 | `Rota_inexistente_404_em_problem_details` | `ErrosTestes.cs` | `GET /api/v1/nao-existe` → 404, `application/problem+json` |
| AC-7 | `Respostas_trazem_cabecalhos_de_seguranca` | `CabecalhosTestes.cs` | Em `/health/live` e no 404: `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, CSP `default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy: no-referrer` |
| AC-7 | `Sem_cabecalho_Server` | `CabecalhosTestes.cs` | Header `Server` ausente |
| AC-5 | `Documento_openapi_so_em_desenvolvimento` | `OpenApiTestes.cs` | `Development`: `GET /openapi/v1.json` → 200 e `"openapi"` no corpo; `Production`: 404 |
| AC-5 | (CI) diff do arquivo gerado | `ci.yml` | `git diff --exit-code server/openapi/` sem diferença |
| S-1 | `Appsettings_sem_senha` | `ConfiguracaoTestes.cs` | Nenhum `appsettings*.json` de `server/src` contém `Password=`, `Pwd=` nem `Senha` (sem diferenciar maiúsculas) |
| R-1 | `Dados_nao_referencia_Api_e_Api_nao_e_referenciada` | `ArquiteturaTestes.cs` | `typeof(CronoDbContext).Assembly.GetReferencedAssemblies()` sem `CronoAI.Api` |
| AC-13 | (orquestrador) front intacto | — | `npm run ci` verde; `docker build -t cronoai:local .` e smoke test (`/healthz`, `/`, headers) |

Fixtures: nenhuma. Nenhum dado real ou pessoal.

## 12. Critérios de aceite e escopo fechado
- **AC-1:** `dotnet build server/CronoAI.slnx -c Release` sem erros e **sem warnings** (warnings são erros pelo `Directory.Build.props`); `dotnet format --verify-no-changes` limpo.
- **AC-2:**
  - `docker compose --profile backend up -d db` deixa o `db` `healthy`, com o bootstrap aplicado: papéis `cronoai_migrador` e `cronoai_app`, schema `cronoai`.
  - Com as duas strings por `user-secrets` ou variável, `dotnet ef database update` (migrador) aplica e `dotnet run` responde `/health/ready` 200 conectado como `cronoai_app`.
  - Sem qualquer uma das três variáveis de senha, o compose recusa subir com mensagem clara.
  - `docker compose up --build app` (front) continua sem subir o banco.
- **AC-3:** `/health/live` 200 sem banco; `/health/ready` 200 com banco e 503 sem banco, sem detalhe no corpo.
- **AC-4:** a migração `Inicial` aplica em banco limpo, reaplicar não muda nada, e o modelo não tem mudança pendente (teste e CLI).
- **AC-5:** `server/openapi/CronoAI.Api.json` gerado no build e versionado (OpenAPI 3.x, sem `paths` por enquanto); servido em tempo de execução só em `Development`.
- **AC-6:** exceção não tratada → 500 em ProblemDetails com `traceId` e sem pilha nem mensagem interna em `Production`; 404 também em ProblemDetails.
- **AC-7:** headers de segurança da seção 03 em toda resposta; sem `Server`.
- **AC-8:** o job "Backend: build e testes (.NET)" roda em todo PR e push na `master`, sem filtro `paths`.
  - Sem segredo: o único valor de conexão no workflow é a string fictícia sem senha.
  - Sem deploy, com `permissions: contents: read`.
  - Passa em: restore travado, format, build, testes (inclusive integração), diff do OpenAPI, `has-pending-model-changes`.
- **AC-9:** NuGet Audit configurado para bloquear vulnerabilidade alta/crítica (NU1903/NU1904 como erro); `dotnet list package --vulnerable --include-transitive` sem itens.
- **AC-10:** CodeQL analisa C# e JavaScript/TypeScript, com uma categoria por linguagem.
- **AC-11:** Dependabot com `nuget` em `/server`, majors ignoradas.
- **AC-12:** atualizados no E2:
  - `CLAUDE.md`, `docs/devops.md`, SPEC-01 §3;
  - `regras-comuns.md`, `rules/backend-dotnet.md`, cabeçalhos dos agentes;
  - seção ASVS L2 do checklist;
  - ADR 00004 com as convenções do parecer do `dba` (seção 03) e o índice.
- **AC-13:** o front não muda de comportamento: `npm run ci` e E2E verdes; a imagem do front não recebe `server/`.
- **AC-14:** o `cronoai_app` não é superusuário, não tem `BYPASSRLS`, `CREATEDB` nem `CREATEROLE` e não cria objeto em `cronoai` nem em `public`. Recebe DML em tabela nova do migrador pelos privilégios padrão da `Inicial`. A API e os testes de API conectam como ele.
- **AC-15:** schema `cronoai` com o histórico `cronoai.__ef_migrations_history`; nenhum objeto da aplicação em `public`; `search_path` do app = `cronoai`.
- **AC-16:** servidor local em UTF-8 com collation ICU pt-BR e `timezone=UTC`; autenticação TCP por `scram-sha-256` e nenhuma regra `trust` fora do socket local (evidência de `pg_hba_file_rules` e `password_encryption`); compose sem `POSTGRES_HOST_AUTH_METHOD`.

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 | Build limpo | `dotnet build server/CronoAI.slnx -c Release` + `dotnet format --verify-no-changes` (saída literal) | sim |
| AC-2 | Banco local, bootstrap e conexão | Tarefa 9: `docker compose ps` (`healthy`), `\du` e `\dn` via `docker exec`, `curl -i http://127.0.0.1:5280/health/ready`; compose sem cada variável (mensagem de erro) | sim (`NOT_RUN` só se o Docker faltar, com motivo) |
| AC-3 | Saúde | `SaudeTestes` (3) + `curl` da tarefa 9 | sim |
| AC-4 | Migração | `MigracoesTestes` (3) + `dotnet ef migrations has-pending-model-changes` | sim |
| AC-5 | OpenAPI | `OpenApiTestes` + diff na CI | sim |
| AC-6 | Erros | `ErrosTestes` (2) | sim |
| AC-7 | Headers | `CabecalhosTestes` (2) | sim |
| AC-8 | CI | Execução do job no PR (link + trecho) + actionlint | sim |
| AC-9 | NuGet Audit | `Directory.Build.props:{linha}` + saída de `dotnet list package --vulnerable --include-transitive` | sim |
| AC-10 | CodeQL C# | Execução no PR | sim |
| AC-11 | Dependabot | `dependabot.yml:{linha}` + revisão | sim |
| AC-12 | Documentação e ADR | Revisão do diff | sim |
| AC-13 | Front intacto | `npm run ci`, `npm run e2e`, `docker build` + smoke test (`docs/devops.md`) | sim |
| AC-14 | Papel da aplicação com menor privilégio | `PapeisBancoTestes` (3: superusuário/bypassrls, não cria objeto, privilégios padrão) | sim |
| AC-15 | Schema e histórico | `Historico_de_migracoes_no_schema_cronoai`, `Sessao_da_aplicacao_usa_search_path_cronoai` | sim |
| AC-16 | Encoding, collation, fuso, autenticação | `ServidorBancoTestes` + tarefa 9: saída de `SHOW password_encryption` e `SELECT * FROM pg_hba_file_rules` | sim |
| P-1 | Migração em banco limpo e reaplicação | `MigracoesTestes` | sim |
| R-1 | Direção de dependências | `ArquiteturaTestes` + leitura dos `.csproj` | sim |
| R-2 | Nenhum DDL fora de migração, exceto o bootstrap local de papéis e schema | `git grep -nE "CREATE TABLE\|ALTER TABLE\|ExecuteSqlRaw\|FromSqlRaw" server/src` = só `Migrations/`; `server/db/bootstrap/` só com `CREATE ROLE`/`CREATE SCHEMA`/`GRANT`/`REVOKE`/`ALTER ROLE` | sim |
| R-3 | Migração não aplicada na partida | `git grep -n "Migrate(" server/src` vazio fora dos testes | sim |
| R-4 | Sem warning novo; supressões comentadas | Build + revisão do `.editorconfig` | sim |
| R-5 | Identificadores até 63 bytes | `Identificadores_cabem_em_63_bytes` | sim |
| S-1 | Sem segredo versionado; CI sem segredo | `ConfiguracaoTestes` + `validar-regras.mjs` + `git grep -niE "password=\|pwd=" -- server docker-compose.yml .env.example .github`. Fixture com `.WithUsername`/`.WithPassword` aleatórios (leitura de `BancoPostgresFixture.cs:{linha}`) | sim |
| S-2 | Dependências listadas, auditadas e com licença registrada | Seção 08 × `Directory.Packages.props`; saída do `dotnet list package --vulnerable --include-transitive` | sim |
| S-3 | Imagens por digest, Debian, mesma referência | `docker-compose.yml:{linha}` e `BancoPostgresFixture.cs:{linha}` | sim |
| S-4 | Workflow mínimo e sem deploy | actionlint + revisão: `permissions`, `persist-credentials: false`, sem `secrets.`, sem push | sim |
| S-4b | Headers da API | = AC-7 | sim |
| S-5 | Compose `db` endurecido | `docker compose config` + revisão (porta em `127.0.0.1`, `no-new-privileges`, `cap_drop`, bootstrap `:ro`) | sim |
| S-6 | Logs sem dados pessoais nem dados sensíveis | `git grep -n "EnableSensitiveDataLogging\|UseHttpLogging" server/src` vazio; `log_statement=none`; logs JSON na tarefa 9 | sim |
| S-7 | Sem detalhe interno (erro, saúde, OpenAPI fora de dev) | AC-3, AC-5, AC-6; `Include Error Detail` só em `Development` (leitura) | sim |
| S-8 | `server/` fora da imagem do front | `.dockerignore:{linha}` + `docker build` | sim |
| S-9 | Autenticação do PostgreSQL | = AC-16 (`pg_hba_file_rules`, `password_encryption`, sem `trust`) | sim |
| S-10 | Testes de segurança do banco não usam superusuário | `ApiFactory.cs:{linha}` com a string do app + `Papel_da_aplicacao_nao_e_superusuario_nem_bypassrls` | sim |
| V-1 | — | Não se aplica: sem tela | não |
| N-1, M-1 | — | Não se aplica: sem cálculo nem MSPDI | não |

**Validadores obrigatórios:**
- `arquiteto` (revisão: layout, direção de dependências, aderência à seção 03, escopo);
- `dba` (revisão: migração `Inicial`, bootstrap, papéis e privilégios, convenções do ADR 00004, compose do banco);
- `seguranca` (S-1 a S-10, dependências, workflow, compose);
- `testes` (executa `dotnet test` e `npm run ci`, preenche a matriz);
- **auditoria independente** (`revisor` em `MODO: AUDITAR`).

Todos em lote ao fim de cada entregável; a auditoria no fim do ciclo. `especialista-obra`: não se aplica (nenhum cálculo).

### Perguntas de gate (até 3)

**P1 — Estilo dos endpoints: minimal APIs ou controllers?**
- **(a)** Minimal APIs com grupos por área (`MapGroup("/api/v1/obras")`), filtros de endpoint para validação e `TypedResults`, que alimentam o OpenAPI. **Recomendação (opinião):** menos cerimônia, e o OpenAPI nativo do .NET 10 cobre `TypedResults` sem anotação extra. O teste genérico de isolamento do 00012 enumera os endpoints do mesmo jeito nas duas opções.
- **(b)** Controllers (`[ApiController]`), padrão mais conhecido, com filtros de ação e *model binding* mais rico. Exige mais código por endpoint.
- *Por que importa:* vale para todos os endpoints da Fase 2. Trocar depois é reescrever a camada de API.

**P2 — PostgreSQL dos testes de integração: Testcontainers ou o do compose?**
- **(a)** Testcontainers. Cada execução sobe um PostgreSQL descartável com **usuário, senha e banco aleatórios definidos pela fixture** (o padrão da biblioteca é fixo, por isso são explícitos), roda o mesmo bootstrap do compose, migra do zero e descarta o contêiner ao fim. Funciona igual na máquina (Docker 29.8 presente) e no runner `ubuntu-latest` do Actions, **sem segredo na CI**. **Recomendação (opinião):** o teste não depende do estado do banco de desenvolvimento e prova papéis, privilégios e migração em banco limpo a cada execução. Custo: o pacote `Testcontainers.PostgreSql` e a imagem `testcontainers/ryuk` para a Segurança revisar, e alguns segundos para subir o contêiner.
- **(b)** O PostgreSQL do compose na máquina e `services: postgres` no Actions. Sem dependência nova, mas os testes passam a depender de um banco já de pé e limpo, com o bootstrap aplicado, e a CI precisa de senhas (mesmo que descartáveis) no workflow.
- *Por que importa:* define a dependência nova, se a CI precisa de segredo e se o teste "em banco limpo" vale em todo ciclo.

**P3 — Versão do PostgreSQL local.**
- **(a)** A versão que a **Infraestrutura** oferecer para produção. Até a resposta, a **17**, imagem Debian (suporte até nov/2029, pela [política de versões do PostgreSQL](https://www.postgresql.org/support/versioning/)). **Recomendação (opinião; o `dba` concorda):** a 17 já está consolidada e é ampla a oferta dela em serviços gerenciados (a confirmar com a Infra). Trocar depois é uma linha no compose e uma na fixture, desde que nenhum ciclo use recurso exclusivo de versão (`NULLS NOT DISTINCT` exige 15 ou mais, e a 17 tem).
- **(b)** A **16**, citada na SPEC-01 §3 (suporte até nov/2028).
- **(c)** A **18** (mais nova; tem `uuidv7()` nativo). O plano gera UUID v7 na aplicação e não depende disso.
- *Por que importa:* fixa a imagem local e a dos testes. A divergência com a produção só aparece quando a Infra decidir.

### Fora do escopo
- Qualquer entidade, tabela de domínio, endpoint de negócio, autenticação, autorização ou auditoria (00012 em diante).
- Políticas de RLS, interceptor de `app.empresa_id` e teste de catálogo de RLS (00012, ADR 00006).
- Tabela de auditoria, `REVOKE` específicos e particionamento (00013; recomendação do `dba`: não particionar agora).
- Precisão de dinheiro e percentual, `time` × minutos e `NULL` × 0 (00015).
- Seed de desenvolvimento (00012+, por comando explícito, nunca em migração).
- Configuração do Data Protection em código (00012); aqui só a convenção no ADR 00004.
- Projeto `CronoAI.Dominio` e testes de domínio (00012).
- `server/Dockerfile`, serviço `api` no compose, imagem da API na CI (00023); Redis, filas e jobs (Fase 3).
- HTTPS, HSTS, certificados, TLS do PostgreSQL, domínio, hospedagem, deploy, publicação de imagem, registro de imagens: **Infraestrutura**.
- Swagger UI, Scalar ou qualquer UI de documentação.
- Extensão dos scripts `testar-afetado.mjs`, `auditar-dependencias.mjs` e `regras-cronoai.mjs` para .NET (ciclo de processo à parte; T1/T2 do motor no 00016). A regra "sem `FromSqlRaw`/`IgnoreQueryFilters`" no `validar-regras.mjs` fica para o 00012.
- Limiar de cobertura do backend (medida informativa neste ciclo).
- Qualquer alteração em `src/`, `e2e/`, no `Dockerfile` do front e no `docker/nginx.conf`.
- Fixação de actions por SHA (próxima etapa recomendada em `docs/devops.md`, com a Segurança).

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Dependências NuGet, imagens `postgres` e `testcontainers/ryuk`, action `actions/setup-dotnet` | **Segurança da Informação** | Uso em produção (registrar no PR) |
| Licenças PostgreSQL License, Apache-2.0, MIT (seção 08) | **Jurídico** | Uso em produção |
| Versão e **collation** do PostgreSQL de produção (P3; a local é ICU pt-BR), papéis equivalentes em produção e a forma de aplicar migrações (script idempotente ou *bundle*) | **Infraestrutura** | Primeiro ambiente fora da máquina local (não bloqueia este ciclo) |
| Minutos do GitHub Actions com o job novo e o CodeQL C# (repositório privado exige Code Security para CodeQL, `docs/devops.md`) | **Infraestrutura + Segurança** | Merge (informativo) |

## 14. Riscos e pós-entrega
- **Rollback:**
  - reverter os commits remove `server/` e o job, sem efeito no front (AC-13);
  - o volume local do banco sai com `docker compose --profile backend down -v`;
  - nenhum dado de usuário está em jogo.
- **Bootstrap só roda em volume vazio:** mudar papéis ou senhas exige `docker compose --profile backend down -v` (documentado no `server/README.md`).
- **Migração que cita `cronoai_app` falha** em banco sem o papel. É desejável (falha ruidosa) e fica documentado no ADR 00004.
- **Docker indisponível:** os testes (I), AC-2, AC-14 a AC-16 ficam `NOT_RUN` localmente, com o motivo. A execução do job no PR vira a evidência e precisa estar verde antes do merge.
- **Testcontainers no Windows:**
  - exige Docker Desktop com contêineres Linux;
  - atrás de proxy corporativo, o *pull* do Docker Hub pode falhar ou esbarrar no limite de taxa (registrar, sem contornar controles);
  - o Ryuk precisa do socket do Docker.
- **Endurecimento do contêiner do PostgreSQL** (`read_only`, `cap_drop`) pode impedir a inicialização. O dev registra o ajuste mínimo e o motivo, e o `seguranca` aceita ou não.
- **ICU pt-BR no `initdb`:** se a combinação de argumentos não for aceita pela imagem, o dev registra o erro e volta ao `dba` antes de trocar a collation (mudar depois exige reindexar).
- **`has-pending-model-changes` abrir conexão** contrariaria a premissa da string fictícia. Se acontecer, o passo usa o banco do Testcontainers (com o `dba` e o `seguranca` cientes), sem introduzir segredo.
- **`latest-recommended` + warnings como erro** pode acusar regras do analisador em código gerado (migrações). O plano permite excluir `Migrations/` da análise no `.editorconfig`, com comentário.
- **Proteção da `master`:**
  - incluir o check novo depois da 1ª execução verde (você, em Settings › Rules);
  - renomear o job depois quebra a regra.
- **Conflitos com a Fase 1 em paralelo** (PF-3): `CLAUDE.md`, `docs/devops.md` e `ci.yml` também mudam nos ciclos 00004 a 00010; fazer merge da `master` antes do PR.
- **Versão/tag:** nenhuma; a versão é decisão sua no `/entregar`.
- **Publicação:** nenhuma. Os workflows não publicam imagem nem fazem deploy (Inviolável 8).

## 15. Emenda 01 (25/10/2026) — parecer do `dba` da tarefa 0
Parecer: `00011-tarefa0-dba.md`, `VEREDITO: AJUSTAR`. Os 8 ajustes e onde foram aplicados:

| # | Ajuste do parecer | Aplicado em |
|---|---|---|
| 1 | Papéis `cronoai_migrador` (dono do schema) e `cronoai_app` (só DML, sem DDL, sem superusuário, sem `BYPASSRLS`) **já no 00011**; duas strings de conexão; bootstrap em `server/db/bootstrap/` compartilhado por compose e fixture; testes de API como `cronoai_app` | §03 (papéis, bootstrap, strings), §07, §08 (S-10), tarefas 2, 3, 6 e 7, AC-2, AC-14 |
| 2 | Schema `cronoai`; histórico de migrações no mesmo schema, com nome explícito | §03, §07, tarefa 2, AC-15 |
| 3 | `Inicial` com `GRANT USAGE` + `ALTER DEFAULT PRIVILEGES` (**escolhida a opção recomendada pelo `dba`**: na migração, não no bootstrap) + os 5 testes novos, e mais um que prova os privilégios padrão | §03, tarefa 2, §11 (`PapeisBancoTestes`, `Historico_…`, `Identificadores_…`) |
| 4 | Testcontainers com usuário e senha aleatórios por execução; frase de S-1 corrigida (o padrão da biblioteca é fixo) | §03, §08 (S-1), tarefa 7, P2 |
| 5 | `postgres:17` Debian com digest; UTF-8 + ICU pt-BR decididos e registrados no ADR 00004; `timezone=UTC`; nunca `trust`; evidência de `pg_hba_file_rules` e `password_encryption`; três senhas no `.env.example` | §03, §08 (S-9), tarefas 6 e 9, AC-16, P3 |
| 6 | CI com string fictícia sem senha para a factory de design-time e o `has-pending-model-changes` | §03, tarefa 10, AC-8, §14 |
| 7 | ADR 00004 com as convenções do §1 do parecer | §03 (parágrafo ADR), tarefa 13, AC-12 |
| 8 | Pendências: precisão do dinheiro e `time` × minutos no 00015; particionamento da auditoria no 00013 (recomendação: não particionar agora) | §07 (pendências), Fora do escopo |

## Decisões do gate
- **Tarefa 0 (`dba`): feita em 25/10/2026.** Veio `VEREDITO: AJUSTAR`, e os 8 ajustes estão aplicados nesta emenda (seção 15). A condição "convenções de banco com parecer do `dba` antes do gate" está cumprida. O `dba` revisa de novo na validação do E1.
- **P1, P2 e P3:** decididas pelo orquestrador; ver "Decisões do gate — registro final" no fim deste plano.

## Decisões do gate — registro final (25/10/2026)
Decididas pelo orquestrador com a autorização do usuário para seguir sem parar por todas as fases, **sujeitas à revisão dele no PR**:
- **P1 → minimal APIs com `MapGroup`.**
- **P2 → Testcontainers**, com usuário, senha e banco aleatórios por execução (emenda 01).
- **P3 → PostgreSQL 17 em imagem Debian, por digest** (o dba concorda), até a Infraestrutura indicar a versão do banco gerenciado.
- Tarefa 0 do `dba` feita (VEREDITO: AJUSTAR) e os 8 ajustes aplicados na emenda 01.

## Emenda 02 (25/10/2026) — AC-2 com o compose do front preservado
Origem: validação (arquiteto, testes e dba). O `${VAR:?}` no compose faria o `docker compose up app` do front falhar sem `.env`, porque o Compose interpola o arquivo inteiro antes de filtrar perfis. Isso violaria o 4º item do AC-2 e o AC-13. Decisão do orquestrador, com autorização do usuário, **sujeita à revisão dele no PR**:
- **Novo texto do 3º item do AC-2:** sem qualquer uma das três senhas, o serviço `db` **não fica `healthy`** (o healthcheck exige o efeito do bootstrap) e **o log do contêiner diz a causa e como corrigir**. Sem `CRONOAI_DB_SENHA`, a própria imagem recusa inicializar.
- **Evidências na tarefa 9:**
  - (a) `docker compose up app` sem `.env` funciona;
  - (b) log do `db` sem `CRONOAI_DB_SENHA`;
  - (c) `db` não `healthy` e com a causa no log, sem a senha do migrador.
- O `server/README.md` e o `docs/devops.md` documentam `docker compose --profile backend up -d --wait db`, que falha com código ≠ 0 se o banco não ficar `healthy`.
