# CronoAI — backend (.NET 10 + PostgreSQL 17)

Esqueleto (ciclo 00011), identidade, empresas e isolamento (ciclo 00012), obras, trilha de auditoria e concorrência otimista (ciclo 00013) e perfis e permissão por obra (ciclo 00014); ainda sem tarefas nem cálculo. Só ambiente
**local**; hospedagem e deploy são da equipe de Infraestrutura. Decisões e convenções:
`.claude/adrs/00004-estrutura-convencoes-backend.md` (estrutura), `00005-autenticacao-oidc-bff-sessao.md` (login e sessão) e
`00006-isolamento-entre-empresas-rls.md` (empresas, RLS e teste de rotas), `00009-trilha-de-auditoria-append-only-e-concorrencia-da-obra.md` (obras, trilha e versão) e `00010-perfis-e-permissao-por-obra.md` (perfis, RLS por obra e matriz).

```
server/
  CronoAI.slnx                  solução
  src/CronoAI.Api               host (minimal APIs, autenticação, health, OpenAPI, erros, headers)
  src/CronoAI.Dominio           entidades (Empresa, Usuario, MembroEmpresa, Sessao, Obra, Frente, Carteira, vínculos, RegistroAuditoria, UF e município de referência) e a matriz perfil × ação, sem nenhum pacote
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

**Semente de desenvolvimento**: exige o ambiente `Development` (o `launchSettings.json` já define), recusa em qualquer outro e cria
os usuários como `cronoai_app`. **Desde o ciclo 00014 as empresas e os membros são criados com a string do MIGRADOR**
(`ConnectionStrings:CronoaiMigracao`, a mesma das migrações), porque o papel da aplicação não insere `membro_empresa`: sem ela a
semente falha. A string é lida só dentro do comando. Cria dev-a (administrador), dev-b e 3 empresas fictícias (ids fixos;
idempotente); na empresa compartilhada o dev-b é engenheiro de obra vinculado a UMA obra fictícia (os dois logins mostram a diferença).

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

**Banco local criado antes da troca do id da migração `ObrasAuditoria`** (rodadas 01 e 02 do ciclo, enquanto ela não estava mergeada): quem já a aplicou localmente precisa rodar `docker compose --profile backend down -v` antes de subir de novo (apaga os dados locais) e reaplicar as migrações; o id novo é `20261025201449_ObrasAuditoria`.

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
- **CSV:** UTF-8 com BOM, separador `;`, `CRLF`, todo campo entre aspas; células que começam com `=`, `+`, `-`, `@`, TAB ou CR saem com o prefixo `'`. **O arquivo termina numa linha de controle `#fim;<n>`** (n = número de registros): **sem essa linha o CSV está cortado** (a conexão ou o servidor falhou no meio) e não deve ser usado. A conferência (n igual ao número de registros) deve ser feita com um **parser RFC 4180**, que lê campos entre aspas com quebra de linha dentro, e não linha a linha: um `motivo` com CR ou LF no meio de um campo faz uma contagem de linhas divergir da de registros. Datas de 2000-01-01 até hoje + 1 ano (400 fora disso); o limite de taxa da exportação é por usuário, não por IP.
- **Municípios:** a lista oficial ainda não foi carregada (`municipio_referencia` vazia): o código é validado por formato, prefixo da UF e dígito verificador, então um código inexistente com dígito coincidente passa até a carga. Os **27 códigos de UF** semeados pela migração precisam ser conferidos contra a fonte oficial do IBGE antes do merge.

## Perfis, permissões, membros e acessos de obra (ciclo 00014)

Os 7 perfis (`administrador`, `engenheiro_planejamento`, `engenheiro_obra`, `suprimentos`, `encarregado`, `gestor_portfolio`, `diretoria`) e a
matriz perfil × ação estão em `CronoAI.Dominio/MatrizPermissoes.cs` (tabela do plano 00014, seção 3.5, revisável no PR). O banco decide **quais
obras** o membro vê (escopo `todas`, `vinculadas` por `acesso_obra` ou `carteiras`) e a API decide **o que** ele faz. **Obra sem vínculo → 404**
(igual ao inexistente); **ação fora da matriz → 403** `acao-nao-permitida`. O escopo `carteiras` enxerga **zero obras** até o ciclo 00014b trazer a API de
carteiras. `GET /api/v1/eu` devolve `perfil` e `escopoObras` da empresa ativa. O perfil `encarregado` ainda não pode ser atribuído (400 `perfil-indisponivel`).

| Rota (todas exigem sessão e empresa ativa; escritas exigem `X-XSRF-TOKEN`, corpo até 8 KB) | Ação da matriz | Quem |
|---|---|---|
| `GET /api/v1/membros?incluirRemovidos=` | `membros.ler` (+ `membros.gerir` com `incluirRemovidos=true`) | administrador, gestor de portfólio |
| `PUT /api/v1/membros/{usuarioId}` | `membros.gerir` | administrador |
| `POST /api/v1/membros/{usuarioId}/remover` e `/reativar` | `membros.gerir` | administrador |
| `GET /api/v1/obras/{id}/acessos` | `acessos_obra.ler` | administrador, gestor de portfólio (no alcance) |
| `POST /api/v1/obras/{id}/acessos` e `/{usuarioId}/revogar` | `acessos_obra.gerir` | administrador, gestor de portfólio (no alcance) |

- **Membros:** `versao` (o `xmin` do vínculo, só igualdade) no corpo do `PUT`, `remover` e `reativar`; versão velha → 409 `conflito-de-versao` com `estadoAtual`. Outros 409: `ultimo-administrador` (nenhuma empresa fica sem administrador; confere no `COMMIT`, com a trilha desfeita junto), `membro-responsavel` (extensões `obras` e `frentes` só com ids), `membro-removido` e `membro-nao-removido`. Remover é **lógico**: a sessão do removido cai na próxima requisição.
- **Acessos de obra:** o destino inválido (membro de outra empresa, inexistente, removido, ou de escopo diferente de `vinculadas`) recebe sempre o mesmo 400 em `usuarioId`; vínculo repetido → 409 `acesso-existente`; revogar apaga antes os acessos de frente do usuário na obra, no mesmo salvamento (uma linha de trilha `remover` por vínculo) e é um `POST` (corpo em `DELETE` não tem semântica definida).
- **Primeiro administrador:** nenhuma rota cria empresa nem administrador. Em desenvolvimento, pela semente; fora dele o comando administrativo (credencial dedicada) é pendência da Infraestrutura. O papel da aplicação **não** insere `membro_empresa`; o convite é do ciclo 00014c.
- **Banco local criado antes do ciclo 00014:** a migração `PerfisPermissoes` faz o backfill (todo membro existente vira `administrador` de escopo `todas`: confira `SELECT empresa_id, count(*) FROM cronoai.membro_empresa GROUP BY 1` antes de aplicar fora do local). O `Down` só vale em banco sem trilha `remover`.

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
