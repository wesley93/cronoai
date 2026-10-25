---
issue: —
spec: SPEC-01 (esqueleto), SPEC-12 parte 2 (base), PLANO-FASE-2 §5.1
branch: feat/00011-backend-esqueleto
base: master (bdcfe88)
faixa: 3 (T7, T8)
ficha_ou_plano: .claude/ciclos/00011-backend-esqueleto-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00011 — Esqueleto do backend .NET 10 + PostgreSQL 17 (só local)

## Resumo
- **O que é:** a solução `server/` (Api, Dados, testes) com PostgreSQL 17 local. Contém:
  - papéis separados `cronoai_migrador` (dono do schema) e `cronoai_app` (só DML);
  - schema `cronoai`, migração `Inicial`, `/health/live` e `/health/ready`;
  - OpenAPI versionado, ProblemDetails, logs JSON e headers de segurança;
  - testes xUnit v3 com Testcontainers;
  - job de CI só com build e testes (sem deploy), CodeQL C# e Dependabot NuGet/docker-compose.
- **Decidido:** gate da fase (PF-1 MSPDI no front, PF-2 `decimal`, PF-3 paralelo) e do ciclo (minimal APIs com `MapGroup`, Testcontainers, PostgreSQL 17 Debian), mais as emendas 01 (parecer do dba), 02 (AC-2 com o compose do front preservado) e 03 (R08 com string de conexão). Tudo foi decidido pelo orquestrador, com a autorização do usuário para seguir sem parar por todas as fases, **sujeito à revisão dele no PR**. O ADR 00004 fica "Proposto" até o aceite do usuário.
- **O que você precisa fazer:**
  - abrir o PR e conferir o job "Backend: build e testes (.NET)" e o CodeQL C# verdes (AC-8, AC-10);
  - depois da 1ª execução verde, incluir o job novo na proteção da `master`;
  - levar à **Segurança da Informação**, ao **Jurídico** e à **Infraestrutura** os itens da última seção.
- **Estado:** aprovado. Validadores e auditoria independente aprovados (adfb2f3); AC-8 e AC-10 só no PR.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-2, ciclo 00011.

## Triagem
- **T7 SIM:** compose, CI, CodeQL, Dependabot.
- **T8 SIM:** backend novo.
- **T1–T6 NÃO:** nenhum cálculo, MSPDI, estado salvo do front, tela, dependência npm nem IA.
- **Faixa 3.** O `classificar-diff.mjs` confirma: "Faixa exigida (mínima): 3 — T7, T8; seguranca OBRIGATÓRIO".

## Commits
| SHA | Conteúdo |
|---|---|
| f27485c, 5f6b828 | Plano da fase, plano do ciclo, gate e papéis antecipados no plano da fase |
| 87098d6 | E1: solução, compose `backend`, bootstrap, migração `Inicial`, saúde, OpenAPI, ProblemDetails, headers, testes |
| 38026d6 | E2: job do backend na CI, CodeQL C#, Dependabot, documentação, regra `backend-dotnet.md`, ADR 00004 |
| d654714 | Emenda 02 do AC-2 |
| 2840245 | Rodada 02: 15 itens dos validadores |
| 075f968 | Emenda 03 (R08 com string de conexão) |
| 0d89b9f | R08 endurecida (espaço em volta do `=`, valor iniciado por símbolo, JSON) e filtro do README |
| 0fbecb6 | Rodada 03 (auditoria): R08 avalia só o valor da senha, com teste versionado (16/16); headers no 500; ADR 00004 × código alinhados; `SSL Mode=Disable` só local; coverlet removido |

## Rodadas
| Rodada | testes | arquiteto | dba | seguranca |
|---|---|---|---|---|
| 01 (38026d6) | REPROVADO: comando de teste errado na raiz; AC-2 | REPROVADO: 5 médios | OK (4 baixos) | APROVADO (4 baixos) |
| 02 (2840245/d654714) | só AC-8/AC-10 NOT_RUN (PR) | APROVADO, com a emenda 03 registrada | — | APROVADO (1 baixo: R08, corrigido em 0d89b9f) |
| auditoria r01 (0d89b9f) | — | — | — | REPROVADO: 1 médio (AC-13 E2E) + 8 baixos → rodada 03 (0fbecb6) e registro |

### Matriz de verificação (HEAD adfb2f3; reexecutada pela auditoria)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| AC-1 | Build e format limpos | `cd server && dotnet build CronoAI.slnx -c Release`; `dotnet format … --verify-no-changes` | sim | PASS | `0 Aviso(s) 0 Erro(s)`; exit 0 (`testes`, rodada 02) |
| AC-2 | Banco local, bootstrap, conexão; falha clara sem senha; front sem `.env` | compose `-p qa00011b --profile backend up -d --wait db`; `compose config` sem `.env` | sim | PASS | caminho feliz `Healthy` com os 3 papéis; sem `CRONOAI_DB_SENHA`, `Exited (1)` "superuser password is not specified"; sem a senha do migrador ou do app, `Exited (1)` "bootstrap do CronoAI falhou: variável … não definida; rode … down -v"; senha curta recusada; `compose config` sem `.env` lista só `app` |
| AC-2 (literal) | 2º item: migração como migrador e API como `cronoai_app` | auditoria: compose `-p aud11` porta 15433; `dotnet ef database update`; API Release; curl | sim | PASS | `aud11-db-1 Up (healthy) 127.0.0.1:15433->5432`; "Applying migration '20261025094206_Inicial'. Done."; `/health/ready` → `HTTP/1.1 200 OK … Healthy`; sem header `Server` (Kestrel real); `/openapi/v1.json` 200 em Development; 404 `application/problem+json` com `traceId` |
| AC-16 (literal) | Saídas da tarefa 9 | `psql` no compose da auditoria | sim | PASS | `SHOW password_encryption` = `scram-sha-256`; `pg_hba_file_rules`: `local … trust` (socket) e todas as linhas `host` com `scram-sha-256`; `TimeZone` `UTC`; `datlocprovider|datlocale` = `i|pt-BR`; "PostgreSQL 17.11 (Debian 17.11-1.pgdg13+2)"; `cronoai_app` e `cronoai_migrador` com `rolsuper|rolcreatedb|rolcreaterole|rolbypassrls` = `f|f|f|f` |
| AC-3 | Saúde | `SaudeTestes`, `SaudeSemBancoTestes` + curl | sim | PASS | `/health/live` 200; `/health/ready` 200 com banco e 503 "Unhealthy" sem banco |
| AC-4 / P-1 | Migração aplica e reaplica; modelo sem pendência | `MigracoesTestes` + `has-pending-model-changes` com string fictícia | sim | PASS | "No changes have been made to the model since the last migration." |
| AC-5 | OpenAPI gerado e versionado; só em Development | `OpenApiTestes` + `git diff --exit-code -- server/openapi/` | sim | PASS | diff vazio; 200 em dev, 404 em produção |
| AC-6 | Erros em ProblemDetails, sem pilha em produção | `ErrosTestes` + curl | sim | PASS | 404 `application/problem+json` com `traceId` |
| AC-7 | Headers de segurança em toda resposta (inclusive 500); sem `Server` | `CabecalhosTestes` (200, 404, opção do Kestrel) + `ErrosTestes` (500 em Production com os 4 headers) | sim | PASS | nosniff, no-store, CSP `default-src 'none'; frame-ancestors 'none'`, no-referrer, também no 500 (0fbecb6); `AddServerHeader == false` |
| AC-8 | Job do backend na CI | execução no PR | sim | NOT_RUN | depende do push/PR; actionlint 1.7.7 EXIT=0 |
| AC-9 | Sem pacote vulnerável | `dotnet list … --vulnerable --include-transitive` | sim | PASS | nenhum nos 3 projetos |
| AC-10 | CodeQL C# | execução no PR | sim | NOT_RUN | depende do PR |
| AC-11 | Dependabot NuGet e docker-compose | `dependabot.yml` | sim | PASS | `nuget` em `/server` e `docker-compose` na raiz, majors ignoradas |
| AC-12 | Documentação e ADR | diff | sim | PASS | `CLAUDE.md`, `docs/devops.md`, SPEC-01, `backend-dotnet.md`, `regras-comuns.md`, ADR 00004 (Proposto), checklist ASVS 5.0.0 (V1–V17 conferidos na tag v5.0.0) |
| AC-13 | Front intacto | `npm run lint`, `typecheck`, `test:coverage`; `docker build` + smoke | sim | PASS | lint/tipos ok; 67 testes, 92,79%; imagem: healthz/raiz/SPA 200, sem `server/` (orquestrador) |
| AC-13 e2e | E2E do front | `CI=1 npm run e2e` na worktree c11 (`CI=1` impede reaproveitar servidor de outra pasta na porta 4173; `--strictPort` falharia se a porta estivesse ocupada) | sim | PASS | `6 passed (50.5s)` (orquestrador, sobre 0d89b9f) |
| AC-14 / S-10 | `cronoai_app` com menor privilégio | `PapeisBancoTestes` | sim | PASS | `current_user=cronoai_app`; SQLSTATE 42501 ao criar objeto em `cronoai` e `public`; privilégios padrão dão DML |
| AC-15 | Schema e histórico; `search_path` | testes | sim | PASS | `cronoai.__ef_migrations_history`; `search_path = cronoai` |
| AC-16 / S-9 | UTF-8, ICU pt-BR, UTC, scram, sem `trust` fora do socket | `ServidorBancoTestes` + `psql` | sim | PASS | `password_encryption=scram-sha-256`; `pg_hba` com `trust` só em `local`; UTC; `datlocale=pt-BR`; PG 17.11 Debian |
| S-2 | Dependências listadas, auditadas e com licença | `server/Directory.Packages.props` × §08 do plano; `dotnet list … --vulnerable --include-transitive`; `NuGetAudit` | sim | PASS | Npgsql.EFCore.PostgreSQL 10.0.3 (PostgreSQL License), EFCore.NamingConventions 10.0.1 (Apache-2.0), Microsoft.* 10.0.13 (MIT), dotnet-ef 10.0.13 (MIT), xunit.v3 4.0.2 e xunit.runner.visualstudio 3.1.5 (Apache-2.0), Microsoft.NET.Test.Sdk 18.11.0 (MIT), Testcontainers.PostgreSql 4.16.0 (MIT); coverlet removido na rodada 03; nenhum vulnerável; NU1903/NU1904 como erro |
| S-8 | `server/` fora da imagem do front | `.dockerignore` contém `server`; `docker build` + `ls /usr/share/nginx/html` + `find` de `*.csproj` | sim | PASS | build ok; html só com `50x.html assets favicon.svg index.html`; nenhum `.csproj` na imagem (orquestrador) |
| R-1..R-5 | Camadas, DDL só em migração/bootstrap, sem migrar na partida, sem warning, 63 bytes | `ArquiteturaTestes`, greps, build | sim | PASS | Dados não referencia Api; `git grep` de DDL e `Migrate(` vazio em `server/src` |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes.Json_do_servidor_sem_senha` + R08 com teste versionado | sim | PASS | todo `*.json` de `server/src` com `(password\|pwd)\s*=`; `node --test .claude/scripts/lib/regras-cronoai.test.mjs` → tests 16, pass 16 (7 acusa, 9 não acusa); `validar-regras --base origin/master --commits` 0 bloqueia (0fbecb6) |
| S-3 | Imagem por digest, mesma no compose e na fixture | `ComposeTestes.Imagem_e_initdb_do_compose_batem_com_a_fixture` | sim | PASS | mesmo `postgres:17@sha256:b8faeff7…` e mesmos argumentos de initdb |
| S-4 | Workflow mínimo | actionlint + leitura | sim | PASS | `contents: read`; `persist-credentials: false`; sem `secrets.`, deploy ou push; Ryuk por digest no job |
| S-5 | Compose endurecido | leitura + subida real | sim | PASS | 127.0.0.1, `no-new-privileges`, `cap_drop ALL` + mínimos, `read_only` + tmpfs, `restart: "no"`, healthcheck exige o papel |
| S-6 / S-7 | Logs sem dado sensível; sem detalhe interno | greps + testes | sim | PASS | sem `EnableSensitiveDataLogging`/`UseHttpLogging`; `IncludeErrorDetail` só em dev |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | PASS | **APROVADO** na reauditoria (adfb2f3): nenhum achado; EVIDENCIAS-CONFERIDAS 24 de 25. A 25ª é o E2E, que o auditor não pôde reexecutar por instrução (porta compartilhada); entre 0d89b9f e adfb2f3 nenhum arquivo de `src/`, `e2e/`, `Dockerfile`, `nginx` ou `package*.json` mudou. Reexecutou: restore travado, format, build Release (0 avisos), `dotnet test` 24/24, diff do OpenAPI vazio, modelo sem pendência, sem vulneráveis, `validar-regras` 0 bloqueia, R08 16/16 + 16/16 + 12/12, `docker build` do front sem `server/` (uid 101) |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| testes r01 | Comando `dotnet test --solution` falha na raiz | corrigido (2840245): `cd server && …` nos docs |
| testes r01 / arquiteto r01 / dba r01 | AC-2: banco subia sem papéis, ~100 s até `unhealthy` | emenda 02 (d654714) + `restart: "no"`, healthcheck rápido, `falhar()` (2840245) |
| testes r01 / arquiteto r01 | `Password=nao-usada` no `ApiFactory` | removido (2840245) |
| arquiteto r01 | Laço `DeleteBehavior.Restrict` fora da tarefa | removido; ADR: aplicar no 00012 como último passo (2840245) |
| arquiteto r01 | Convenções de estilo sem fonte | levadas ao ADR 00004 "Estilo do C#" (2840245); alinhadas ao código na rodada 03 |
| arquiteto r01 | Checklist mistura ASVS 4.0.3 e 5.0 | ASVS 5.0.0, V1–V17 conferidos na tag (2840245) |
| arquiteto r01 | Compose × fixture divergem com o Dependabot | `ComposeTestes` (2840245) |
| arquiteto r01 | Testes sem banco presos à coleção; `async` sem `await`; nome do teste de arquitetura | corrigidos (2840245) |
| arquiteto r01 / auditoria r01 | coverlet inerte sob MTP | removido (0fbecb6); cobertura do backend ainda não coletada |
| arquiteto r01 | `TreatWarningsAsErrors` bloqueia NU1901/NU1902 | `WarningsNotAsErrors` (2840245) |
| arquiteto r01 | Nome do check CodeQL muda | registrado: avisar no PR (só "Recomendado") |
| arquiteto r01 | `dba.md` cita localStorage | ajustar no merge da `master` |
| arquiteto r02 | R08 fora do escopo | emenda 03 (075f968) |
| seguranca r01 | Teste do header `Server` não prova nada | prova pela opção do Kestrel (2840245) |
| seguranca r01 | Ryuk sem digest | digest no job `backend` (2840245); porta do Ryuk em 0.0.0.0 → pendência de estação (Infra/Segurança) |
| seguranca r01 | Bootstrap aceita senha fraca/marcador/repetida | recusa (2840245) |
| seguranca r01 | Varredura de senha só em appsettings | todo `*.json` de `server/src` (2840245) |
| seguranca r01 (info) | Senhas no `-v` do psql; log do servidor | `\getenv`, `log_min_error_statement=panic` (2840245) |
| seguranca r01 (info) | Senha no histórico do shell | aviso no README (2840245) |
| seguranca r01 (info) | `AllowedHosts: *`, `/health/ready` sem rate limit | 00012+ e Infraestrutura |
| seguranca r02 | R08 deixa passar 3 formas | 0d89b9f + teste versionado (0fbecb6) |
| dba r01 | `search_path` do migrador; `REVOKE CONNECT` no `postgres`; bootstrap não idempotente; nota da collation ICU; porta < 49152; porta do Testcontainers | corrigidos/documentados (2840245) |
| auditoria r01 | AC-13 E2E como NOT_RUN não obrigatório | E2E executado (`6 passed`) |
| auditoria r01 | S-2 e S-8 sem linha; AC-2/AC-16 sem saída literal | linhas acrescentadas |
| auditoria r01 | R08: 12 casos sem teste versionado; 4 divergências; texto da emenda 03 × código | 0fbecb6 (teste `node --test`, 16/16) + texto da emenda 03 alinhado ao código |
| auditoria r01 | AC-7 sem prova no 500 | headers afirmados no teste do 500 (0fbecb6) |
| auditoria r01 | ADR 00004 × código (campos, regions, exemplo do SophIA) | ADR ajustado (opinião da equipe), regions completadas, exemplo removido (0fbecb6) |
| auditoria r01 | `Ssl Mode` desligado só no local | `SSL Mode=Disable` só nas strings locais e na fixture; produção com a Infra (0fbecb6) |

## Pendências registradas
- **Teste da R08 fora da CI:** roda só pelo comando do `.claude/scripts/README.md`. Levar para a CI num ciclo de processo.
- **Region fora da lista do ADR:** `ErrosTestes.cs` usa "Tipos auxiliares", que o ADR 00004 não lista. É estilo; alinhar no 00012.
- **Cobertura do backend não é coletada:** o `coverlet.collector` foi removido porque não mede sob o Microsoft.Testing.Platform. A extensão de cobertura do MTP é dependência nova, num próximo ciclo.
- **Ryuk:** publica a porta em 0.0.0.0 na máquina do dev (comportamento do Testcontainers). Mitigação de estação (IP padrão do Docker, firewall) com Infra/Segurança.
- **Não idempotente:** o bootstrap só roda em volume vazio; `docker compose up -d` sem `--wait` sai 0 com o `db` em `Exited (1)`. O `--wait` está documentado.
- **Herdado pelo 00012:** `DeleteBehavior.Restrict` como último passo do `OnModelCreating`, com teste de arquitetura; regras de .NET no `validar-regras` (`FromSqlRaw`, DDL fora de migração); `search_path` do migrador no texto do ADR.
- **Antes do PR:** fazer merge da `master`, porque os ciclos 00004 a 00010 da Fase 1 mexem em `CLAUDE.md`, `docs/devops.md` e `ci.yml`. Único conflito previsto: `.claude/adrs/README.md`, onde se mantêm as linhas 00002, 00003 e 00004.

## Validação de outras áreas (não substitui o parecer delas)
- **Segurança da Informação:** pacotes NuGet novos, imagens `postgres:17` e `testcontainers/ryuk:0.14.0`, action `actions/setup-dotnet@v6`, CodeQL C# `build-mode: none`, pinagem de actions por SHA, Secret scanning/Push protection, aceite do ASVS L2, orientação para estações de dev.
- **Jurídico:** licenças PostgreSQL License, Apache-2.0 e MIT.
- **Infraestrutura:** versão e collation do PostgreSQL de produção, TLS/HSTS/proxy, onde ficam o anel e a chave do Data Protection, aplicação de migrações fora da máquina local, minutos do Actions e Code Security.
