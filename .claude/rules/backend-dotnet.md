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
- **Nada de middleware terminal (`Run`/`Map` de ramo) depois de `UseAuthorization`**: o tratador de resultado deixa passar a requisição sem endpoint para o 404, e um terminal ali a serviria sem autenticação.
- Handlers de endpoint devolvem `TypedResults` (uniões `Results<…>`), e o status que vem do pipeline (401, 403, 400 do antiforgery, 429) é declarado com `.ProducesProblem(...)`.
- Retorno do OIDC: só o fluxo de **código** (id_token ou access_token no retorno do navegador, ou retorno sem `code`, são recusados em `OnMessageReceived`); logout do provedor desligado até a Segurança decidir.
- Sessão: cookie `__Host-` revogável no servidor (tabela `sessao`, uuid v4 por CSPRNG); nenhum token do provedor guardado; o login acontece em `OnTicketReceived` e exige `id_token` assinado. O usuário de desenvolvimento só existe com `Development` + flag fora de `appsettings` versionado, e a API não sobe com a flag em outro ambiente.
- Regras automáticas **R14 a R19** em `.claude/scripts/lib/regras-cronoai.mjs` (SQL bruto, DDL fora de migração/`Rls/`, DML de migração fora do helper, `IgnoreQueryFilters`, conexão crua, escrita fora do `SaveChanges` auditado e migração que mexe nas garantias da trilha), com casos em `regras-cronoai.test.mjs` (`node --test`).

## Obras, auditoria e concorrência (ciclo 00013, ADR 00009)

- **Entidade auditável** (`IAuditavel`) só é gravada por **`CronoDbContext.SalvarAuditadoAsync(MetadadosEscrita)`**: o `AuditoriaInterceptor` grava a trilha **na mesma transação** (mesmo `SaveChanges`). `SaveChanges` comum com entidade auditável, remoção de entidade auditável e escrita sem usuário no contexto **lançam** (falha fechada). `usuario_id` vem do contexto de banco da sessão, nunca do corpo.
- **Lista branca** (`ListaBrancaAuditoria`): só os campos listados entram em `antes`/`depois` (chaves em `snake_case`, só os alterados); nova entidade auditável sem lista reprova o teste de arquitetura. Nunca nome, e-mail, emissor, sujeito nem IP na trilha.
- **R18 (bloqueia)**: `ExecuteUpdate`/`ExecuteDelete` só em `ConsultasIdentidade.cs` (`sessao`) e nenhum SQL de escrita em `obra`/`auditoria` (com ou sem schema, aspas ou `ONLY`; acusado na própria linha do SQL) fora de migração. **R19 (alerta)**: migração que cita `auditoria` com `DISABLE`/`DROP TRIGGER`, `ENABLE TRIGGER` sem `ALWAYS`, `DISABLE ROW LEVEL SECURITY`, `CREATE`/`DROP`/`ALTER POLICY`, `CASCADE`, `CREATE OR REPLACE FUNCTION`, `OWNER TO`, `GRANT` ou `NO FORCE` (também com o SQL em várias linhas). O `DbSet` da trilha só recebe `Add`/`AddRange`; leitura só em `ConsultasAuditoria`.
- **Concorrência**: `versao` (inteiro) **no corpo** de `PUT`, `arquivar` e `restaurar` (ausente → 400); fluxo carregar → comparar → aplicar → salvar auditado; versão velha → **409** em ProblemDetails com `type` curto e `estadoAtual`; obra de outra empresa ou que sumiu → **404** (nunca 409). `obra.versao` é incrementada por **gatilho**: o domínio e o EF nunca a calculam.
- **Erro do banco → campo do contrato** pelo `SqlState` e pelo **nome da constraint** (`MapeadorErrosObra`), percorrendo a cadeia de `InnerException`; nunca a mensagem do PostgreSQL; constraint não mapeada → 500 genérico. Sem `catch` amplo.
- **"Apagar" é arquivar** (`arquivada_em`); o app não tem `DELETE` em `obra` e não há rota `DELETE`. Nome único entre as obras não arquivadas (índice parcial, fora do modelo do EF: só o teste de banco o protege).
- **Transação explícita (00015):** dentro dela, `DbUpdateConcurrencyException` ou `DbUpdateException` exige `ROLLBACK`; senão a trilha (gravada antes do `UPDATE`) fica registrando uma alteração que não aconteceu. Nunca terminar em commit depois de erro de gravação.
- **UF**: `ServicoObras` confere a UF (e a do SINAPI) na lista nacional e devolve 400 na chave `uf` / `sinapi.uf`; a FK do banco é a rede de segurança.
- **Logs em `Development`**: `Microsoft.EntityFrameworkCore.Update` e `Database.Command` em `None` no `appsettings.Development.json` (o Npgsql inclui o detalhe do erro, com a linha, só em `Development`).
- **Corpo de escrita limitado** (64 KB nas escritas de obra) pelo `LimiteDeCorpoMiddleware`, que também vale para corpo sem `Content-Length`.
- **CSV de exportação**: UTF-8 com BOM, `;`, `CRLF`, todo campo entre aspas e **neutralização de `=`, `+`, `-`, `@`, TAB e CR** no início de toda célula (`EscritorCsvAuditoria`); escrita linha a linha com `flush` por página e **linha final `#fim;<n>`** (sem ela o arquivo está cortado); cota **por usuário**, não por IP; datas de 2000-01-01 a hoje + 1 ano.
- **Testes de banco da trilha e das políticas de escrita**: UPDATE (`WITH CHECK`) e DELETE (`USING`) **sem `WHERE` e sem `RETURNING`**, e no UPDATE sem ler coluna no `SET`; um teste negativo como `cronoai_app` por política de escrita; controle por mutação (afrouxe a política e veja o teste falhar). Teste que cria gatilho ou função temporária: `CREATE OR REPLACE`, `DROP ... IF EXISTS` antes e limpeza em `try/finally` com `CancellationToken.None`. Limite de nome de objeto em **bytes** (`Encoding.UTF8.GetByteCount(nome) >= 63`).
- **Teste de isolamento por rota** usa um recurso **real** da outra empresa no `{id}` (`RecursoAlheio` no catálogo). Um ÚNICO montador de requisição (`RequisicaoDeIsolamento`) decide o `{id}` e é testado direto pelo meta-teste `Concretizacao_de_id_usa_obra_real_da_empresa_B`; rotas de coleção ficam fora do `MapGroup` (barra final) e o teste `Toda_rota_de_obras_e_auditoria_exige_a_politica_empresa_ativa` confere a política de todas.

## SQL e migrações

- EF Core + Npgsql é o único acesso a dados. `FromSql`/`ExecuteSql` **interpolados** (viram parâmetros); `FromSqlRaw`/`ExecuteSqlRaw` com texto montado são proibidos. SQL bruto qualifica o schema (`cronoai.`).
- **Toda DDL de tabela só em migração** (`dotnet ef migrations add`). Nunca editar migração aplicada. A única exceção é o provisionamento local de papéis e schema em `server/db/bootstrap/` (`CREATE ROLE`/`CREATE SCHEMA`/`GRANT`/`REVOKE`/`ALTER ROLE`).
- **Nunca** aplicar migração na partida da API (`Migrate(` só em teste). Aplicação em dev: `dotnet ef database update` com a string do migrador.
- Seed só por comando explícito em `Development` (`dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento`), nunca em migração. **Única exceção (00013, Q3):** dado nacional imutável necessário à integridade, em tabela de referência global sem RLS e por `InsertData` (as 27 UFs).
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
