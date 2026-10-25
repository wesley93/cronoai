# CronoAI — backend (.NET 10 + PostgreSQL 17)

Esqueleto (ciclo 00011), identidade, empresas e isolamento (ciclo 00012) e obras, trilha de auditoria e concorrência otimista (ciclo 00013); ainda sem tarefas, perfis nem cálculo. Só ambiente
**local**; hospedagem e deploy são da equipe de Infraestrutura. Decisões e convenções:
`.claude/adrs/00004-estrutura-convencoes-backend.md` (estrutura), `00005-autenticacao-oidc-bff-sessao.md` (login e sessão) e
`00006-isolamento-entre-empresas-rls.md` (empresas, RLS e teste de rotas) e `00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md` (obras, trilha e versão).

```
server/
  CronoAI.slnx                  solução
  src/CronoAI.Api               host (minimal APIs, autenticação, health, OpenAPI, erros, headers)
  src/CronoAI.Dominio           entidades (Empresa, Usuario, MembroEmpresa, Sessao, Obra, RegistroAuditoria, UF e município de referência), sem nenhum pacote
  src/CronoAI.Dados             DbContext, RLS, interceptor da trilha de auditoria e migrações (EF Core + Npgsql)
  tests/CronoAI.Api.Testes      xUnit v3 + Testcontainers
  db/bootstrap/                 provisionamento local de papéis e schema (usado pelo compose e pelos testes)
  openapi/CronoAI.Api.json      contrato gerado no build e versionado
```

Direção das dependências: `Api → Dados → Dominio`. Nenhum projeto referencia a `Api`; o `Dominio` não referencia EF nem ASP.NET.

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
dotnet user-secrets set "ConnectionStrings:Cronoai" "Host=127.0.0.1;Port=5432;Database=cronoai;Username=cronoai_app;Password=<senha-app>;SSL Mode=Disable;Timeout=5;Command Timeout=30;Maximum Pool Size=20"
```

Para as migrações use a variável do **migrador** (PowerShell: `$env:ConnectionStrings__CronoaiMigracao = "..."`):

```bash
export ConnectionStrings__CronoaiMigracao="Host=127.0.0.1;Port=5432;Database=cronoai;Username=cronoai_migrador;Password=<senha-migrador>;SSL Mode=Disable"
```

`SSL Mode=Disable` vale **só para o PostgreSQL local** em `127.0.0.1` (o contêiner do compose não tem TLS) e fica nas strings
locais acima, nunca no `appsettings.json`. **Em produção o TLS (e o `SSL Mode` das strings) é da Infraestrutura** (RF-12.7;
ADR 00004).

## Identidade, empresas e usuário de desenvolvimento (ciclo 00012)

A API só entende quem chama pelo **cookie de sessão** (`__Host-cronoai-sessao`, `Secure`, `HttpOnly`, `SameSite=Lax`): para testar
à mão no navegador, use HTTPS (certificado de desenvolvimento do .NET) ou um cliente que aceite cookie `Secure` em
`localhost`. Rotas: `GET /api/v1/eu`, `GET`/`PUT /api/v1/empresas/atual`, `GET /api/v1/autenticacao/entrar`, `POST
/api/v1/autenticacao/sair` e `GET /api/v1/autenticacao/antiforgery` (as escritas exigem o cabeçalho `X-XSRF-TOKEN`).

**Semente de desenvolvimento**: exige só o ambiente `Development` (o `launchSettings.json` já define), recusa em qualquer outro e
conecta como `cronoai_app`. Cria dev-a, dev-b e 3 empresas fictícias (ids fixos; idempotente).

**Login do usuário de desenvolvimento** (só local, nunca em produção). A rota só existe com DOIS interruptores: ambiente
`Development` **e** a flag abaixo, que **não** fica em nenhum `appsettings*.json`:

```bash
cd server/src/CronoAI.Api
dotnet run -- semear-desenvolvimento      # só Development
dotnet user-secrets set "Autenticacao:UsuarioDesenvolvimento:Habilitado" "true"
dotnet run                                # POST /api/v1/autenticacao/desenvolvimento/entrar com {"usuario":"dev-a"} ou "dev-b"
```

Com a flag ligada fora de `Development`, a API **não sobe** (`OptionsValidationException`).

**Login OIDC genérico** (sem provedor fixo no código). Sem `Autoridade`, o esquema não é registrado e `/entrar` responde 503.
O segredo do cliente só por user-secrets ou variável de ambiente (nunca em `appsettings`):

```bash
dotnet user-secrets set "Autenticacao:Oidc:Autoridade" "<url do emissor>"
dotnet user-secrets set "Autenticacao:Oidc:IdCliente" "<id do cliente>"
dotnet user-secrets set "Autenticacao:Oidc:SegredoCliente" "<segredo>"      # opcional: Escopos (padrão "openid profile") e CaminhoRetorno
```

**Contrato OpenAPI no build**: o gerador (`GetDocument.Insider`) sobe o host em `Production`, sem anel de chaves; por isso só ele
pula o `ValidateOnStart` do anel (padrão da [documentação](https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi#customizing-run-time-behavior-during-build-time-document-generation)).
A execução real e os testes validam normalmente.

**Data Protection**: em `Development` o anel de chaves fica em `%LOCALAPPDATA%/CronoAI/chaves` (fora do repositório; mude com
`DataProtection:CaminhoAnel`). Fora de `Development` o caminho é obrigatório, senão a API não sobe. Perder o anel derruba as sessões
(não os dados). `AllowedHosts` é `localhost;127.0.0.1;[::1]`; produção por variável de ambiente (Infraestrutura).

## Obras, trilha de auditoria e concorrência (ciclo 00013)

Rotas (todas exigem sessão e **empresa ativa**; as escritas exigem o cabeçalho `X-XSRF-TOKEN`):

| Rota | O que faz |
|---|---|
| `GET /api/v1/obras?incluirArquivadas=` | lista as obras da empresa ativa (sem as arquivadas por padrão) |
| `POST /api/v1/obras` | cria a obra (201 com `Location`; nome único entre as não arquivadas, sem diferenciar caixa) |
| `GET` / `PUT /api/v1/obras/{id}` | lê e substitui a obra |
| `POST /api/v1/obras/{id}/arquivar` e `/restaurar` | "apagar" é arquivar; não há `DELETE` |
| `GET /api/v1/obras/{id}/auditoria?cursor=&limite=` | trilha da obra, do mais novo ao mais antigo (cursor opaco, `limite` de 1 a 200) |
| `GET /api/v1/auditoria/exportacao.csv?de=&ate=&obraId=` | CSV da trilha (até 366 dias; limite de taxa próprio) |

- **Concorrência otimista:** `PUT`, `arquivar` e `restaurar` levam `versao` (a que o cliente leu) no corpo. Versão velha, obra arquivada ou nome repetido respondem **409** em ProblemDetails (`type` = `conflito-de-versao`, `obra-arquivada`, `obra-nao-arquivada` ou `obra-nome-duplicado`) com o `estadoAtual` da obra quando ela é visível. Obra de outra empresa responde **404**, igual à inexistente.
- **Auditoria:** toda escrita grava, na mesma transação, quem, o quê (só os campos alterados da lista branca), quando, a origem (`ui`), a correlação com o log e o `motivo` opcional (texto livre: **não digite dado pessoal**). A trilha é append-only no banco (nem o dono altera ou apaga com `UPDATE`/`DELETE`/`TRUNCATE`). **Não há IP** (pendência do Jurídico) nem nome de usuário (só o `usuarioId`).
- **CSV:** UTF-8 com BOM, separador `;`, `CRLF`, todo campo entre aspas; células que começam com `=`, `+`, `-`, `@`, TAB ou CR saem com o prefixo `'`.
- **Municípios:** a lista oficial ainda não foi carregada (`municipio_referencia` vazia): o código é validado por formato, prefixo da UF e dígito verificador, então um código inexistente com dígito coincidente passa até a carga. Os **27 códigos de UF** semeados pela migração precisam ser conferidos contra a fonte oficial do IBGE antes do merge.

## Comandos

```bash
cd server
dotnet tool restore                                           # dotnet-ef fixado em .config/dotnet-tools.json
dotnet ef database update --project src/CronoAI.Dados         # aplica migrações (string do migrador)
dotnet run --project src/CronoAI.Api                          # http://127.0.0.1:5280 (/health/live, /health/ready)
dotnet run --project src/CronoAI.Api -- semear-desenvolvimento # semente fictícia (só Development)
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
rodam o mesmo bootstrap do compose. Filtro por classe (de dentro de `server/`): `cd server && dotnet test --solution CronoAI.slnx -- --filter-class "*SaudeTestes"`.
O `--solution` só existe com esse runner, configurado no `server/global.json`: na raiz do repositório o comando falha.

**Ryuk (Testcontainers):** o contêiner de limpeza monta o socket do Docker. A CI fixa a imagem por versão + digest com
`TESTCONTAINERS_RYUK_CONTAINER_IMAGE=testcontainers/ryuk:0.14.0@sha256:7c1a8a9a47c780ed0f983770a662f80deb115d95cce3e2daa3d12115b8cd28f0`
(versão que o Testcontainers 4.16.0 usa por padrão). Para o mesmo rigor local, exporte a variável antes do `dotnet test`.
Atualize versão e digest junto com o pacote.

## Pendências (fora do ciclo)

- Revisão de segurança (Segurança da Informação) e de licença (Jurídico) dos pacotes e imagens antes de produção.
- **Cobertura de testes:** o `coverlet.collector` foi removido (não mede sob o Microsoft.Testing.Platform). **A cobertura do
  backend ainda não é coletada.** A extensão de cobertura do MTP é dependência nova: entra em ciclo próprio, com revisão de
  segurança e licença.
- Versão e collation do PostgreSQL de produção, TLS, HSTS e forma de aplicar migrações: Infraestrutura.
