# CronoAI — backend (.NET 10 + PostgreSQL 17)

Esqueleto do ciclo 00011: sem regra de negócio. Só ambiente **local**; hospedagem e deploy são da equipe de
Infraestrutura. Decisões e convenções: `.claude/adrs/00004-estrutura-convencoes-backend.md`.

```
server/
  CronoAI.slnx                  solução
  src/CronoAI.Api               host (minimal APIs, health, OpenAPI, erros, headers)
  src/CronoAI.Dados             DbContext e migrações (EF Core + Npgsql)
  tests/CronoAI.Api.Testes      xUnit v3 + Testcontainers
  db/bootstrap/                 provisionamento local de papéis e schema (usado pelo compose e pelos testes)
  openapi/CronoAI.Api.json      contrato gerado no build e versionado
```

Direção das dependências: `Api → Dados → Dominio` (o `Dominio` nasce no 00012). Nenhum projeto referencia a `Api`.

## Banco local (Docker Compose)

1. Crie o `.env` na **raiz do repositório** a partir do `.env.example` (ele é ignorado pelo git) com **três senhas
   fortes e locais**: `CRONOAI_DB_SENHA` (superusuário de bootstrap, usado só pelo contêiner),
   `CRONOAI_DB_SENHA_MIGRADOR` e `CRONOAI_DB_SENHA_APP`. Nunca versione valores reais.
2. Suba o banco (porta só em `127.0.0.1:5432`; se já houver PostgreSQL local, defina `CRONOAI_DB_PORTA`):

   ```bash
   docker compose --profile backend up -d db
   ```

   Na 1ª subida (volume vazio) o bootstrap `db/bootstrap/01-papeis-e-schema.sh` cria o schema `cronoai` e os papéis:
   - `cronoai_migrador`: dono do schema, roda as migrações (DDL);
   - `cronoai_app`: só DML, sem DDL, sem superusuário, `search_path = cronoai`. É o único papel que a API usa.
3. **Recriar papéis ou trocar senhas** exige apagar o volume (apaga os dados locais):

   ```bash
   docker compose --profile backend down -v
   ```

   Se o bootstrap falhar (ex.: senha vazia no `.env`), o contêiner fica `unhealthy`: corrija o `.env` e faça o `down -v`.

## Strings de conexão (sem senha no repositório)

Use `dotnet user-secrets` (fora do repositório) ou variáveis de ambiente. Nenhum `appsettings*.json` leva senha.

```bash
cd server/src/CronoAI.Api
dotnet user-secrets set "ConnectionStrings:Cronoai" "Host=127.0.0.1;Port=5432;Database=cronoai;Username=cronoai_app;Password=<senha-app>;Timeout=5;Command Timeout=30;Maximum Pool Size=20"
```

Para as migrações use a variável do **migrador** (PowerShell: `$env:ConnectionStrings__CronoaiMigracao = "..."`):

```bash
export ConnectionStrings__CronoaiMigracao="Host=127.0.0.1;Port=5432;Database=cronoai;Username=cronoai_migrador;Password=<senha-migrador>"
```

## Comandos

```bash
cd server
dotnet tool restore                                           # dotnet-ef fixado em .config/dotnet-tools.json
dotnet ef database update --project src/CronoAI.Dados         # aplica migrações (string do migrador)
dotnet run --project src/CronoAI.Api                          # http://127.0.0.1:5280 (/health/live, /health/ready)
dotnet build CronoAI.slnx -c Release                          # avisos são erros; regera openapi/CronoAI.Api.json
dotnet test --solution CronoAI.slnx                           # inclui testes de integração (exige Docker)
dotnet format CronoAI.slnx --verify-no-changes
dotnet list CronoAI.slnx package --vulnerable --include-transitive
dotnet ef migrations add <Nome> --project src/CronoAI.Dados  # nova migração (nunca editar uma já aplicada)
```

A API **nunca** aplica migração na partida (o `cronoai_app` nem teria permissão). Aplicar fora da máquina local é
decisão da Infraestrutura (`dotnet ef migrations script --idempotent` ou *bundle*).

O `dotnet test` usa o Microsoft.Testing.Platform (obrigatório no SDK 10 com xunit.v3; ver `global.json`). Os testes
de integração sobem um PostgreSQL descartável (Testcontainers) com usuário e senhas **aleatórios por execução** e
rodam o mesmo bootstrap do compose. Filtro por classe: `dotnet test --solution CronoAI.slnx -- --filter-class "*SaudeTestes"`.

## Pendências (fora do ciclo)

- Revisão de segurança (Segurança da Informação) e de licença (Jurídico) dos pacotes e imagens antes de produção.
- Versão e collation do PostgreSQL de produção, TLS, HSTS e forma de aplicar migrações: Infraestrutura.
