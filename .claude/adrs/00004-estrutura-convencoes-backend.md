# 00004 - Estrutura, convenções e ferramentas do backend .NET

**Data**: 2026-10-25
**Status**: Proposto (aceite do usuário pendente; dependências e imagens aguardam revisão de Segurança e Jurídico; versão e collation de produção, TLS e forma de aplicar migrações com a Infraestrutura)
**Spec/decisão relacionada**: ADR 00001 (stack), SPEC-01, SPEC-12 (RF-12.4, RF-12.5, RF-12.9), `PLANO-FASE-2.md`, plano do ciclo 00011 e parecer do `dba` (`.claude/ciclos/00011-tarefa0-dba.md`)

## Contexto
O ciclo 00011 cria o esqueleto do backend em `server/`. Tudo o que for fixado aqui é herdado pelos ciclos 00012 a 00023, e algumas escolhas (schema, collation, papéis, convenção de nomes) são caras de mudar depois que houver dados e migrações. Classificação: opinião da equipe, boas práticas gerais e, onde indicado, documentação oficial; nada aqui é exigência regulatória.

## Decisão

### Estrutura e ferramentas
- **Layout:** `server/CronoAI.slnx`; `src/CronoAI.Api` (host, endpoints), `src/CronoAI.Dados` (DbContext e migrações), `tests/CronoAI.Api.Testes`, `db/bootstrap/`, `openapi/`. O `CronoAI.Dominio` nasce no 00012. Dependências: `Api → Dados → Dominio`; nenhum projeto referencia a `Api`; o `Dominio` sem pacote de EF nem ASP.NET (motor puro e testável como o `src/lib` do front).
- **Endpoints:** minimal APIs com `MapGroup("/api/v1/...")` e `TypedResults` ([comparação oficial](https://learn.microsoft.com/aspnet/core/fundamentals/apis)).
- **Acesso a dados:** EF Core + Npgsql; SQL bruto só com `FromSql`/`ExecuteSql` interpolados ([doc](https://learn.microsoft.com/ef/core/querying/sql-queries)); `FromSqlRaw`/`ExecuteSqlRaw` com texto montado proibidos.
- **Migrações:** EF Core Migrations no `CronoAI.Dados`, `dotnet-ef` como ferramenta local fixada. Aplicadas por `dotnet ef database update` (string do migrador) em dev e por `MigrateAsync` nos testes, **nunca na partida da API** ([doc](https://learn.microsoft.com/ef/core/managing-schemas/migrations/applying)). Fora da máquina local, `migrations script --idempotent` ou *bundle*: escolha da Infraestrutura.
- **Bootstrap local de papéis e schema** (`server/db/bootstrap/01-papeis-e-schema.sh`): provisionamento, **não** DDL de tabela; toda tabela continua só em migração. Mesma fonte no compose (somente leitura em `/docker-entrypoint-initdb.d`, só em volume vazio) e na fixture dos testes.
- **Testes:** xUnit v3 com `Assert` nativo (o FluentAssertions 8+ tem licença comercial), Testcontainers com usuário, senha e banco aleatórios por execução (o padrão da biblioteca é fixo) e `Microsoft.Testing.Platform` (`global.json`, exigido pelo SDK 10 com xunit.v3). Comando: `cd server && dotnet test --solution CronoAI.slnx` (o `--solution` só existe com esse runner, lido do `global.json` de `server/`; na raiz o comando falha).
- **Cadeia de suprimentos:** Central Package Management, *lock files* com `--locked-mode`, NuGet Audit (`all`, NU1903/NU1904 como erro), source mapping só nuget.org, SDK fixado em `global.json`.
- **Nomes no C#:** domínio em português; padrões de framework em inglês onde o framework impõe.

### Estilo do C# (aceito junto com este ADR; a regra `.claude/rules/backend-dotnet.md` apenas aponta para cá)
- **Construtor explícito**, sem construtor primário; campos `private readonly` com prefixo `_` e nome descritivo e sem abreviação (ex.: `_banco`, `_stringConexao`, `_ambiente`).
- **`#region`** fixos em todo tipo escrito à mão que tenha membros, nesta ordem quando existirem: Campos (inclui constantes), Construtor, Propriedades, Métodos públicos, Métodos protegidos, Métodos privados, Tipos auxiliares (classes aninhadas de apoio, como o filtro de teste de `ErrosTestes`). Ficam de fora: código gerado (migrações e `Program.cs` com instruções de topo).
- **Um tipo público por arquivo.**
- Comentários em português, explicando o porquê (fórmula ou regra citada quando houver).
- Fonte: opinião da equipe (convenção do projeto); não é exigência de framework nem regulatória. Migrações geradas pelo EF ficam fora da análise de estilo (`server/.editorconfig`).

### Convenções de banco (herdadas dos ciclos 00012 a 00023; parecer do `dba`, §1)
- **Nomes:** `snake_case` (`EFCore.NamingConventions`), tabelas no singular, sem palavras reservadas. Unidade no nome da coluna (`duracao_min`, `lag_min`, `folga_total_min`, `inicio_restricao_local`).
- **Schema:** `cronoai` (`HasDefaultSchema`), criado no bootstrap, dono `cronoai_migrador`. Histórico de migrações explícito: `cronoai.__ef_migrations_history`.
- **Identificadores até 63 bytes:** o PostgreSQL trunca em silêncio; compostos longos são nomeados à mão, com teste de catálogo (`Identificadores_cabem_em_63_bytes`).
- **Papéis (constantes em `PapeisBanco`):** bootstrap (superusuário, só local, a aplicação nunca usa); `cronoai_migrador` (`LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, dono do schema, roda migrações); `cronoai_app` (mesmos atributos, dono de nada, só DML por privilégios padrão da migração `Inicial`, sem DDL, `search_path = cronoai`; o migrador também tem `search_path = cronoai`). A API e os testes de API conectam como `cronoai_app`. Migração que cita `cronoai_app` falha em ambiente sem o papel: falha ruidosa, desejável.
- **Chaves:** PK `uuid` v7 gerado na aplicação (`Guid.CreateVersion7`, `ValueGeneratedNever`, atribuído na fábrica do domínio); o v7 **não é controle de segurança**. **Exceção:** `sessao.id` é uuid v4 gerado por CSPRNG (`RandomNumberGenerator`), porque é identificador de segurança e o v7 carrega o instante (ADR 00005). `auditoria.id` como `bigint generated always as identity`. `uid_msproject` `integer` único por obra, nunca PK.
- **FKs:** sem cascata (`DeleteBehavior.Restrict`). **Aplicado no 00012** como último passo do `OnModelCreating` do `CronoDbContext` (depois das configurações por entidade, que o sobrescreveriam), com teste de arquitetura (`Modelo_so_tem_fks_restrict`) e de catálogo (`Fks_do_schema_sao_restrict`).
- **Tempo:** `timestamptz` (UTC, `DateTime` Kind UTC) para instante real; `date` (`DateOnly`) para data de calendário; `timestamp` sem fuso para o relógio local da obra (sufixo `_local`, Kind Unspecified, com teste de `Kind`; ADR 00003); minutos em `integer`.
- **Dinheiro e números:** `numeric` com precisão explícita em toda propriedade `decimal` (`HasPrecision` obrigatório, com teste de arquitetura a partir do 00012); nunca `money` nem `double precision`. Precisões a fechar no 00015.
- **Enum:** `text` + `CHECK`, não `CREATE TYPE ... AS ENUM`.
- **Concorrência:** `xmin` como versão da linha, exposta como `versao` opaca (só igualdade), **para entidade sem filhos**; contador explícito na `obra` para a versão do agregado, porque o `xmin` da obra não muda quando uma tarefa muda. **Aplicado no 00013** ([ADR 00009](00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md)): `obra.versao bigint` por gatilho `BEFORE UPDATE`, `versao` inteira obrigatória no corpo das escritas, 409 com o estado atual e 404 (nunca 409) para obra de outra empresa. **Aplicado no 00014** ([ADR 00010](00010-perfis-e-permissao-por-obra.md)): `membro_empresa` (entidade sem filhos) usa o `xmin` como `versao` opaca (só igualdade; `IsRowVersion()` do Npgsql, sem coluna na migração), e `frente` e `carteira` ganham o contador por gatilho (função genérica `incrementa_versao`).
- **Multiempresa:** `empresa_id` em toda tabela de dado de empresa (denormalizado, FK composta `(empresa_id, obra_id)`) + filtro global do EF, sem pool de DbContext: o contexto nasce de uma fábrica própria (`IFabricaCronoDbContext`) com o contexto de banco imutável. Direção do RLS: variável de sessão `app.empresa_id` setada por parâmetro num interceptor de conexão, `FORCE ROW LEVEL SECURITY` e teste de catálogo. Decisão formal no [ADR 00006](00006-isolamento-entre-empresas-rls.md) (00012): RLS com `FORCE`, contexto imutável por `DbContext`, interceptor que sobrescreve sempre as duas variáveis e teste genérico de rotas.
- **Data Protection:** `SetApplicationName("CronoAI")` fixo; anel de chaves fora do repositório e do contexto do Docker (uso a partir do 00012).
- **Seed:** só por comando explícito em `Development`, nunca em migração. **Exceção registrada no 00013 (Q3):** dado **nacional imutável necessário à integridade** pode ser semeado por migração, em tabela de referência global sem RLS e por `InsertData` (as 27 UFs em `uf_referencia`; os códigos do IBGE foram conferidos só de memória e a conferência na fonte oficial é pendência do usuário antes do merge). Seed de dado de desenvolvimento continua só por comando. **Exceção de execução (00014, Q8):** como o papel da aplicação não insere `membro_empresa`, a semente cria empresa e membros pelo `ProvisionamentoEmpresa` (`CronoAI.Dados/Rls/`), com a string do **migrador** (`ConnectionStrings:CronoaiMigracao`) lida SÓ dentro do comando `semear-desenvolvimento`, depois da checagem de `Development`, numa transação (`NO FORCE` → `INSERT` → `SET CONSTRAINTS ... IMMEDIATE` → `FORCE`) e sem trilha; é a única exceção da regra R18, e o comando de produção da Q8 (credencial dedicada) é pendência da Infraestrutura.
- **Tabelas de referência globais:** lista nacional sem `empresa_id` e **sem RLS** (`uf_referencia`, `municipio_referencia`), só `SELECT` para `cronoai_app` (`REVOKE INSERT, UPDATE, DELETE` na migração) e na lista global do teste de catálogo. A carga da lista de municípios é por comando administrativo fora da API, a partir do arquivo oficial fornecido pelo usuário.
- **Servidor local:** `postgres:17` (Debian, glibc) por tag + digest, a mesma referência no compose e na fixture; `initdb` com `--encoding=UTF8 --locale-provider=icu --icu-locale=pt-BR --locale=C.UTF-8 --auth-host=scram-sha-256`; `timezone=UTC` e `log_statement=none`; nunca `POSTGRES_HOST_AUTH_METHOD=trust` (só o socket local do contêiner é `trust`, alcançável por `docker exec`). Mudar a collation depois exige reindexar. **Collation e versão de produção: Infraestrutura.**

## Justificativa
- Papéis separados já no 00011: RLS (00012) e append-only (00013) só valem contra um papel que não seja dono nem superusuário; sem isso os testes de isolamento passariam por engano.
- Schema próprio e histórico explícito: alvo exato para `GRANT`/`REVOKE`/`pg_dump -n`; trocar depois reescreve o snapshot e todas as migrações.
- Imagem Debian em vez de Alpine: musl pode ordenar texto acentuado diferente de um banco gerenciado típico (opinião).
- Camadas mínimas agora: projeto sem conteúdo é indireção sem valor; o `Dados` nasce já porque mover migrações de assembly é caro.

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| Controllers | Mais cerimônia por endpoint; minimal APIs cobrem o OpenAPI nativo (decisão do gate, sujeita à revisão do usuário) |
| Um papel só de banco | Testes de RLS e auditoria passariam por engano como superusuário |
| `public` como schema | Mistura com objetos de extensão e não dá alvo exato de privilégios |
| `postgres:17-alpine` | Collation e locale (musl) |
| `Database.Migrate()` na partida | Várias instâncias e DDL no usuário da aplicação |
| FluentAssertions | Licença comercial (8+) |

## Consequências
**Positivas:** base de segurança de banco testada em todo `dotnet test`; convenções fixadas antes da 1ª tabela; CI sem segredo.
**Negativas / trade-offs:** exige Docker para os testes de integração; recriar papéis ou senhas locais exige `docker compose --profile backend down -v`; o `--auth-host=scram-sha-256` e a collation ICU pt-BR podem diferir do banco de produção até a Infraestrutura decidir.
**TLS:** `SSL Mode=Disable` só nas strings de conexão **locais** documentadas no `server/README.md` (compose sem TLS), nunca no `appsettings.json`; em produção o TLS é da Infraestrutura (RF-12.7).
**Cobertura:** o `coverlet.collector` foi removido; a cobertura do backend ainda não é coletada (extensão de cobertura do Microsoft.Testing.Platform em ciclo próprio).
**Pendências:** revisão de segurança e licença de pacotes e imagens antes de produção; precisão de dinheiro e `time` × minutos (00015); particionamento da auditoria (decidido no 00013, [ADR 00009](00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md): não particionar agora, com gatilho de reavaliação se o Jurídico exigir retenção por prazo).
