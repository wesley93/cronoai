---
paths:
  - "server/**"
---

> Criado para o CronoAI em 25/10/2026 (ciclo 00011), no formato do processo SophIA.

# Backend (.NET 10 + EF Core + PostgreSQL)

Fonte da verdade: `CLAUDE.md` e o [ADR 00004](../adrs/00004-estrutura-convencoes-backend.md) (convenções que todos os ciclos 00012 a 00023 herdam). Mexer em `server/` é **T8** (faixa 3 se tocar banco, migração, dependência ou segurança). Comandos: `server/README.md`.

## Estrutura e código

- `Api → Dados → Dominio`: nenhum projeto referencia a `Api`; o `Dominio` (00012) sem pacote de EF nem de ASP.NET. `ArquiteturaTestes` guarda a regra.
- Endpoints: **minimal APIs** com `MapGroup("/api/v1/...")` e `TypedResults`. Fora de `/api/v1`: só `/health/*` e, em `Development`, `/openapi`.
- Nomes de negócio em português (`Obra`, `Tarefa`, `CronoDbContext`); padrões do framework em inglês (`Program`, `*Middleware`). Comentários em português explicando o porquê.
- Estilo do C# (construtor, `#region`, campos, um tipo por arquivo): seção "Estilo do C#" do [ADR 00004](../adrs/00004-estrutura-convencoes-backend.md).
- `TreatWarningsAsErrors` ligado. Supressão só no `server/.editorconfig`, com comentário do porquê. `dotnet format --verify-no-changes` limpo.

## Isolamento entre empresas e identidade (ADR 00005 e 00006)

- **Três camadas + teste de rotas**: `empresa_id` + `IDadoDeEmpresa`, filtro global nomeado `"Empresa"` do EF e **RLS forçado** (`ENABLE` + `FORCE`, políticas por comando, `TO cronoai_app`, `WITH CHECK`). Política para o migrador é proibida.
- **Empresa ativa só da sessão**, nunca do corpo, da URL ou de cabeçalho. O `CronoDbContext` recebe o `ContextoSessaoBanco` imutável no construtor (`IFabricaCronoDbContext`); fluxos de identidade usam a fábrica, nunca o contexto scoped da requisição.
- O interceptor sobrescreve **sempre** `app.usuario_id` e `app.empresa_id` (vazios incluídos) em toda abertura de conexão; **nenhuma conexão crua** (`NpgsqlConnection`/`NpgsqlDataSource`) em `server/src` fora do design-time (R17). `No Reset On Close=true` impede a partida.
- `IgnoreQueryFilters` e `DbSet<Usuario>` só em `Identidade/ConsultasIdentidade.cs` (R16 e teste de arquitetura), sempre com filtro explícito por usuário.
- **Migração de dados** em tabela com RLS só por `ExecutarDmlComRls` (NO FORCE → DML → FORCE na transação), com a chamada e o SQL na mesma linha (R15); DML solto afeta zero linhas sem erro.
- **Carregar antes de atualizar**: recurso de outra empresa → 404 (nunca 403 nem 409). Um `UPDATE` cross-empresa sob RLS vira `DbUpdateConcurrencyException`.
- **Rota nova**: entrada em `tests/.../Isolamento/CatalogoRotas.cs` com o cenário (rota com `{id}` ganha `ComIdDeOutraEmpresa`). Fallback de autorização = autenticado; rota anônima só com `AllowAnonymous()` e na lista `AnonimasPermitidas`; escrita exige antiforgery.
- Sessão: cookie `__Host-` revogável no servidor (tabela `sessao`, uuid v4 por CSPRNG); nenhum token do provedor guardado; o login acontece em `OnTicketReceived` e exige `id_token` assinado. O usuário de desenvolvimento só existe com `Development` + flag fora de `appsettings` versionado, e a API não sobe com a flag em outro ambiente.
- Regras automáticas **R14 a R17** em `.claude/scripts/lib/regras-cronoai.mjs` (SQL bruto, DDL fora de migração/`Rls/`, DML de migração fora do helper, `IgnoreQueryFilters`, conexão crua), com casos em `regras-cronoai.test.mjs` (`node --test`).

## SQL e migrações

- EF Core + Npgsql é o único acesso a dados. `FromSql`/`ExecuteSql` **interpolados** (viram parâmetros); `FromSqlRaw`/`ExecuteSqlRaw` com texto montado são proibidos. SQL bruto qualifica o schema (`cronoai.`).
- **Toda DDL de tabela só em migração** (`dotnet ef migrations add`). Nunca editar migração aplicada. A única exceção é o provisionamento local de papéis e schema em `server/db/bootstrap/` (`CREATE ROLE`/`CREATE SCHEMA`/`GRANT`/`REVOKE`/`ALTER ROLE`).
- **Nunca** aplicar migração na partida da API (`Migrate(` só em teste). Aplicação em dev: `dotnet ef database update` com a string do migrador.
- Seed só por comando explícito em `Development` (`dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento`), nunca em migração.
- Modelo muda → migração nova no mesmo diff; `has-pending-model-changes` precisa dar "sem mudança".

## Papéis e segredos

- A API e os testes de API conectam como **`cronoai_app`** (só DML, sem DDL, sem superusuário, sem `BYPASSRLS`). O superusuário só existe no bootstrap e dentro da fixture dos testes. Teste de segurança do banco conectado como superusuário passa por engano: proibido.
- Duas strings: `ConnectionStrings:Cronoai` (app) e `ConnectionStrings:CronoaiMigracao` (migrador). **Nenhuma senha** em `appsettings*.json`, código, fixture, log ou workflow: `user-secrets`, variável de ambiente ou `.env` não versionado. `ConfiguracaoTestes` reprova senha em `appsettings`.
- Nunca logar string de conexão; `EnableSensitiveDataLogging` e `UseHttpLogging` proibidos; `Include Error Detail` do Npgsql só em `Development`.
- Erro ao cliente em ProblemDetails (RFC 9457) com `traceId`, sem pilha, SQL ou estrutura interna. Saúde responde só `Healthy`/`Unhealthy`.

## Testes

- xUnit v3 com `Assert` nativo (sem FluentAssertions: licença comercial). `cd server && dotnet test --solution CronoAI.slnx` (Microsoft.Testing.Platform, ver `server/global.json`; na raiz falha); filtro por classe: `-- --filter-class "*Classe"`.
- Integração com Testcontainers (exige Docker), mesma imagem, digest e argumentos de `initdb` do compose, credenciais **aleatórias por execução**, bootstrap compartilhado, migração uma vez por coleção. Cada teste cria os próprios dados com ids novos, sem `TRUNCATE`.
- Efeito colateral em tabela de teste: criar e remover no `finally` (o app não enxerga transação não confirmada de outra sessão).

## Dependências

- Central Package Management (`Directory.Packages.props`), *lock files* (`restore --locked-mode` na CI), NuGet Audit bloqueando alta/crítica, só nuget.org. Pacote ou imagem novos: só se o plano prevê; sempre com **revisão de segurança e de licença** antes de produção.
- Imagem `postgres` Debian por tag + digest, a mesma no compose e na fixture. `docker compose` só local: sem deploy, sem push de imagem (Inviolável 8).
