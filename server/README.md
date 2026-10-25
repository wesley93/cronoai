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
   `CRONOAI_DB_SENHA_MIGRADOR` e `CRONOAI_DB_SENHA_APP`. Nunca versione valores reais. O bootstrap **recusa** senha
   ausente, com menos de 16 caracteres, igual ao marcador do `.env.example` ou repetida entre os três papéis.
   Dica: prefira gerar a senha (ex.: `openssl rand -hex 16`) e gravá-la direto no `.env`, sem digitá-la no terminal:
   comandos com senha ficam no histórico do shell.
2. Suba o banco (porta só em `127.0.0.1:5432`; se já houver PostgreSQL local, defina `CRONOAI_DB_PORTA`, de preferência
   abaixo de 49152 para não colidir com as portas efêmeras do sistema):

   ```bash
   docker compose --profile backend up -d --wait db
   ```

   O `--wait` faz o comando **falhar** se o contêiner não ficar `healthy` (a causa está em `docker compose logs db`).

   Na 1ª subida (volume vazio) o bootstrap `db/bootstrap/01-papeis-e-schema.sh` cria o schema `cronoai` e os papéis:
   - `cronoai_migrador`: dono do schema, roda as migrações (DDL);
   - `cronoai_app`: só DML, sem DDL, sem superusuário, `search_path = cronoai`. É o único papel que a API usa.
3. **Recriar papéis ou trocar senhas** exige apagar o volume (apaga os dados locais):

   ```bash
   docker compose --profile backend down -v
   ```

   Se o bootstrap falhar (senha ausente, curta, de exemplo ou repetida), o contêiner **não fica healthy** e o log diz a causa
   ("bootstrap do CronoAI falhou: ..."). Corrija o `.env`, rode o `down -v` acima e suba de novo. O bootstrap roda só em
   volume vazio e não é idempotente; o serviço `db` não reinicia sozinho justamente para não subir sem os papéis.
4. **Collation ICU:** a versão da collation (ICU pt-BR) muda com a imagem do PostgreSQL. Ao atualizar a imagem, rode
   `REINDEX` nos índices de texto e `ALTER DATABASE cronoai REFRESH COLLATION VERSION;`. A collation de produção é da
   Infraestrutura.

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
dotnet test --solution CronoAI.slnx                           # inclui testes de integração (exige Docker); só de dentro de server/
dotnet format CronoAI.slnx --verify-no-changes
dotnet list CronoAI.slnx package --vulnerable --include-transitive
dotnet ef migrations add <Nome> --project src/CronoAI.Dados  # nova migração (nunca editar uma já aplicada)
```

A API **nunca** aplica migração na partida (o `cronoai_app` nem teria permissão). Aplicar fora da máquina local é
decisão da Infraestrutura (`dotnet ef migrations script --idempotent` ou *bundle*).

O `dotnet test` usa o Microsoft.Testing.Platform (obrigatório no SDK 10 com xunit.v3; ver `global.json`). Os testes
de integração sobem um PostgreSQL descartável (Testcontainers) com usuário e senhas **aleatórios por execução** e
rodam o mesmo bootstrap do compose. Filtro por classe: `dotnet test --solution CronoAI.slnx -- --filter-class "*SaudeTestes"`.
O `--solution` só existe com esse runner, configurado no `server/global.json`: na raiz do repositório o comando falha.

**Ryuk (Testcontainers):** o contêiner de limpeza monta o socket do Docker. A CI fixa a imagem por versão + digest com
`TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.14.0@sha256:7c1a8a9a47c780ed0f983770a662f80deb115d95cce3e2daa3d12115b8cd28f0`
(versão que o Testcontainers 4.16.0 usa por padrão). Para o mesmo rigor local, exporte a variável antes do `dotnet test`.
Atualize versão e digest junto com o pacote.

## Pendências (fora do ciclo)

- Revisão de segurança (Segurança da Informação) e de licença (Jurídico) dos pacotes e imagens antes de produção.
- **Cobertura de testes:** o `coverlet.collector` não mede sob o Microsoft.Testing.Platform, então **hoje a cobertura do backend
  não é coletada**. Trocar por uma extensão de cobertura do MTP é dependência nova: fica para o próximo ciclo, com revisão
  de segurança e licença.
- Versão e collation do PostgreSQL de produção, TLS, HSTS e forma de aplicar migrações: Infraestrutura.
