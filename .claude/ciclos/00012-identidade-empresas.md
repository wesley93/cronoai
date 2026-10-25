---
issue: —
spec: SPEC-02 (RF-02.1, RF-02.2 base, RF-02.3b, RNF-02.1, RNF-02.2 parcial, RNF-02.3), SPEC-01 (RF-01.1, RF-01.1a), SPEC-12 (RF-12.5, RF-12.9), ASVS 5.0.0 V6–V10, PLANO-FASE-2 §5.2 e §8
branch: feat/00012-identidade-empresas
base: feat/00011-backend-esqueleto (PR empilhado enquanto o 00011 não entrar na master)
faixa: 3 (T5, T8)
ficha_ou_plano: .claude/ciclos/00012-identidade-empresas-plano.md
inicio: 2026-10-25
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-CICLO.md`) para o CronoAI em 25/10/2026.

# Ciclo 00012 — Identidade (OIDC genérico + usuário de desenvolvimento), empresas e isolamento em toda rota

## Resumo
- **O que é:** o backend passa a saber quem chama e de qual empresa. Contém:
  - login OIDC genérico (código + PKCE S256), sem provedor fixo no código;
  - usuário de desenvolvimento só em `Development` com a flag; fora dele, a API não sobe;
  - sessão em cookie `__Host-cronoai-sessao` (`HttpOnly`, `Secure`, `SameSite=Lax`), revogável no servidor, sem token no navegador;
  - tabelas `empresa`, `usuario`, `membro_empresa` e `sessao`, com RLS forçado e filtro global do EF;
  - `GET /api/v1/eu` e `GET`/`PUT /api/v1/empresas/atual`;
  - teste que enumera toda rota registrada e reprova rota sem cenário de isolamento;
  - testes de pool provando que a conexão reciclada não carrega a empresa do dono anterior;
  - regras R14 a R17 no `validar-regras`; ADRs 00005 e 00006.
- **Decidido:**
  - gate G1 = (a) emissor OIDC em memória nos testes; G2 = (a) empresa só pela semente e pelos testes; G3 = (a) tabela `sessao` revogável;
  - decisões de design do plano §15 (RLS + filtro + coluna com `FORCE`, 404 entre empresas, sem e-mail nem `cnpj`, `/api/v1/eu`, `SaveTokens = false`, `SameSite=Lax`, `usuario` fora do RLS até o 00014, id de sessão uuid v4 por CSPRNG, retenção de 30 dias);
  - emenda 01: os 10 ajustes do parecer do `dba` (`00012-tarefa0-dba.md`, `VEREDITO: AJUSTAR`);
  - rodada 02: semente exige só `Development` (B1, opção a); S-9 redefinida (vale o `ShowPII = false` explícito);
  - rodada 03: remoção dos controles bidirecionais antecipada do 00014 para este ciclo;
  - rodada 04: U+061C incluído na lista.
  - Todas: **decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR.** Os ADRs 00005 e 00006 ficam "Proposto" até o aceite do usuário.
  - R2-3 (404 inalcançável removido do `GET /empresas/atual`): escolha do dev, aceita pelo `arquiteto` e pelo orquestrador, também sujeita à revisão no PR.
- **O que você precisa fazer:**
  - revisar no PR o gate, as decisões de design e as decisões das rodadas;
  - fazer merge da `master` antes do PR; o PR é empilhado em `feat/00011-backend-esqueleto` se o 00011 não tiver entrado;
  - conferir os jobs do backend e o CodeQL C# verdes no PR;
  - levar à **Segurança da Informação**, ao **Jurídico** e à **Infraestrutura** os itens da última seção.
- **Estado:** validadores aprovados na rodada 04 (46dc9ae): `testes` APROVADO 182/182 3x, `arquiteto` APROVADO, `dba` OK; `seguranca` APROVADO desde a rodada 02. Auditoria independente: r01 REPROVADO (12 achados, sem defeito funcional) → rodada 05 (f328295) → **reauditoria APROVADA em fcdaf54**, sem achado novo. Estado: **aprovado**; falta o CI do PR.

## Pedido
"Pode fazer todas as fases" → PLANO-FASE-2 §5.2, ciclo 00012.

## Triagem
- **T5 SIM:** pacote novo `Microsoft.AspNetCore.Authentication.OpenIdConnect`; dado pessoal `nome_exibicao` e o par emissor + `sub`; cookie de sessão; token externo validado.
- **T8 SIM:** endpoints, autenticação e autorização, quatro tabelas, RLS e migração.
- **T1–T4, T6, T7 NÃO:** sem cálculo, MSPDI, estado salvo do front, IA, compose, CI ou Dockerfile.
- **Faixa 3.** O `classificar-diff.mjs` confirma: faixa 3, T8, `seguranca` obrigatório. `especialista-obra` não exigido.

## Commits
| SHA | Conteúdo |
|---|---|
| 5b466b6 | Plano do ciclo, parecer do `dba` (tarefa 0), gate e emenda 01 |
| 0ac8599 | E1: domínio, empresas, usuários e sessões com RLS e filtro por empresa |
| 9e929d3 | E2: login OIDC genérico, sessão em cookie, usuário de desenvolvimento, endpoints |
| ed6ab0b | E3: isolamento entre empresas em toda rota registrada |
| 74e41de | E4: ADRs 00005 e 00006, R14 a R17 no `validar-regras`, documentação |
| 8634188 | Rodada 02: 14 itens (fluxo de código exigido, `TypedResults`, nome saneado, logout do handler desligado, novo login encerra a sessão anterior e outros) |
| b5a3289 | Rodada 03: retry de nome só para rejeição do nome, `SessaoDoCookie` em `Sessao/`, 404 inalcançável removido, controles bidirecionais |
| 46dc9ae | Rodada 04: `NomeRejeitado` privado, U+061C, testes dos ramos 23514, comentário do P0001, robustez dos gatilhos de teste |
| 478303c | Registro do ciclo (rodadas 01 a 04) |
| f328295 | Rodada 05 (auditoria r01): predicados e efeito das políticas de RLS provados, flag como texto, semente na composição real, anel padrão, valor do token no log, detector de `usuario` com SQL cru, `ExpiraEm` removido, nome de política em bytes, gatilho de teste |

## Rodadas
| Rodada | testes | arquiteto | dba | seguranca |
|---|---|---|---|---|
| 01 (74e41de) | APROVADO com ressalva: 146/146 na 2ª execução; na 1ª, 2 falhas instáveis em `DataProtectionTestes` | REPROVADO: M1 (`Results.*` em vez de `TypedResults`) e B1 (semente × `CLAUDE.md`); N1–N6 não bloqueiam | OK: 3 baixos; os 10 ajustes da tarefa 0 atendidos | REPROVADO: 1 Médio (fluxo de código não exigido), 1 Baixo (nome do provedor), 5 Info |
| 02 (8634188) | APROVADO: 163/163 3x | REPROVADO: R2-1 (catch largo apaga o nome); R2-2 e R2-3 não bloqueiam | — | APROVADO: 1 Info (controles bidirecionais) |
| 03 (b5a3289) | APROVADO: 179/179 3x | REPROVADO (2ª revisão): `public static NomeRejeitado` na região privada; 4 observações. A 1ª revisão desta rodada deu APROVADO, mas não foi entregue (ver "Ressalvas") | — | — |
| 04 (46dc9ae) | APROVADO: 182/182 3x | APROVADO; 4 observações (B a D não bloqueiam) | OK: 3 baixos (revisão de `74e41de..46dc9ae`, pedida porque as rodadas 02 a 04 mexeram em `ConsultasIdentidade` e no retry) | — |
| auditoria r01 (478303c) | — | — | — | REPROVADO (`revisor` MODO AUDITAR): 1 Médio (AC-4 sem prova dos predicados) e 11 Baixos; nenhum defeito funcional; 56 de 57 evidências reexecutadas e conferidas |
| 05 (f328295) | gates reexecutados pelo orquestrador: 201/201 | — | — | — |
| reauditoria (fcdaf54) | — | — | — | APROVADO (`revisor` MODO AUDITAR, delta): os 12 achados conferidos no diff; gates reexecutados (201/201); mutação das políticas repetida num PostgreSQL descartável confirma o argumento do WHERE; achado 11 aceito como registro |

### Testes do backend, antes → depois
| Ponto | Total | Fonte |
|---|---|---|
| Fim do 00011 | 24 | registro do 00011 |
| E1 (0ac8599) | 80 | `dev-backend` |
| E2 (9e929d3) | 137 | `dev-backend` |
| E3 (ed6ab0b) e E4 (74e41de) | 146 | `dev-backend`; `testes` r01: 146/146 na 2ª execução |
| Rodada 02 (8634188) | 163 (+17) | `dev-backend` e `testes` r02, 3 execuções |
| Rodada 03 (b5a3289) | 179 (+16, todos em `NomeExibicaoTestes`) | `dev-backend` e `testes` r03, 3 execuções |
| Rodada 04 (46dc9ae) | 182 (+3: ramos 23514 com e sem `ck_usuario_nome_tamanho`, U+061C) | `dev-backend` e `testes` r04, 3 execuções |
| Rodada 05 (f328295) | 201 (+19: predicados e 4 negativos de RLS, detector da flag, semente na composição real, anel padrão, detector de `usuario`, nome em bytes) | `dev-backend`; orquestrador 1x (`total: 201 falhou: 0`) |

Regras do `validar-regras` (`node --test`): 39 na rodada 01, 40 nas rodadas 02 a 04.

### Matriz de verificação (HEAD f328295; gates reexecutados pelo orquestrador em f328295; demais linhas com a evidência da rodada indicada, mantida pela suíte completa verde)

| Item | Requisito | Verificação | Obrig. | Estado | Evidência |
|---|---|---|---|---|---|
| G-build | Build Release sem avisos | `dotnet build CronoAI.slnx -c Release --no-incremental` | sim | PASS | `0 Aviso(s) 0 Erro(s)` (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`)) |
| G-format | Format limpo | `dotnet format … --verify-no-changes` | sim | PASS | rc=0 (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`)) |
| G-restore | Lock files | `dotnet restore --locked-mode` | sim | PASS | projetos restaurados, sem erro (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`)) |
| G-vuln | Sem pacote vulnerável | `dotnet list … --vulnerable --include-transitive` | sim | PASS | "não tem nenhum pacote vulnerável" nos 4 projetos (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`)) |
| G-pending | Sem migração pendente | `dotnet ef migrations has-pending-model-changes --project src/CronoAI.Dados --no-build -c Release` com `ConnectionStrings__CronoaiMigracao` fictícia sem senha (o mesmo passo do `ci.yml`) | sim | PASS | `No changes have been made to the model since the last migration.` (orquestrador, f328295) |
| G-openapi | Contrato bate com o build | `git diff --exit-code -- server/openapi/` depois do `--no-incremental` | sim | PASS | `openapi-limpo` (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`)) |
| G-test | Suíte completa | `dotnet test --solution CronoAI.slnx -c Release --no-build` | sim | PASS | `total: 201 falhou: 0` (gates reexecutados pelo orquestrador em f328295 (`scratchpad\c12-r05-gates.log`), 1x); 182/182 3x na r04 (`testes`) e 1x na auditoria r01 |
| G-node | Regras R14 a R17 | `node --test .claude/scripts/lib/regras-cronoai.test.mjs` | sim | PASS | `tests 40 pass 40 fail 0` (orquestrador, f328295) |
| G-regras | validar-regras | `validar-regras.mjs --base feat/00011-backend-esqueleto --commits` | sim | PASS | `141 arquivo(s) … 0 bloqueia, 0 alerta` (orquestrador, f328295) |
| G-lint / G-tsc | Lint e tipos do front | `npm run lint`, `npm run typecheck` | sim | PASS | rc=0 nos dois (r03) |
| T-1 | Sem `Skip`, `Sleep`, `Task.Delay`, `Explicit` em `NomeExibicaoTestes.cs` | grep | sim | PASS | nenhuma ocorrência (r03) |
| T-2 | Sem bidi nem U+FFFD cru no fonte | `grep -nP` pelos bytes UTF-8 | sim | PASS | rc=1 em `NomeExibicaoTestes.cs` e em todos os `.cs` de `server/`; valores montados por `(char)0x…` (r03) |
| T-3 | Bidi e surrogates com valor exato | leitura | sim | PASS | Theory dos 11 pontos de código em duas posições; surrogate alto órfão, baixo órfão, invertido e par válido (r03) |
| T-4 | Gatilho de teste sempre removido | leitura | sim | PASS (com ressalva) | `await using var gatilho = await GatilhoDeFalhaAsync()` nos 3 testes; coleção única `ColecaoBanco`. Ressalva: DDL do helper sem proteção → rodada 04 (r03) |
| T-5 | Retry só para rejeição do nome | `Erro_que_nao_e_do_nome_propaga_e_o_nome_gravado_continua_intacto` (40001, P0001); `Nome_rejeitado_pelo_banco_grava_nulo_sem_recusar_o_login` (Theory desde 46dc9ae: 22021 e 23514 de `ck_usuario_nome_tamanho`) | sim | PASS | verdes; mutação feita pelo dev (catch antigo falha no P0001), não repetida pelo `testes` (r03) |
| T-6 | Corte sem partir par substituto | `NomeSeguro_corta_sem_partir_par_substituto`, `Login_com_emoji_na_posicao_199_200…` | sim | PASS | posições 198, 199 e 200 com valor exato (r03) |
| T-7 | `SessaoDoCookie` sem mudar comportamento | `Novo_login_no_mesmo_navegador_encerra_a_sessao_anterior`, `UsuarioDesenvolvimentoTestes`, V-1 | sim | PASS | verdes; cookie antigo 401 depois do 2º login (r03) |
| T-8 | `GET /empresas/atual` sem 404 | `EmpresaAtualTestes`, `IsolamentoRotasTestes`, `PoolApiTestes` | sim | PASS | verdes; 403 `empresa-ativa-necessaria` sem empresa ativa (r03) |
| AC-1 | Build, format, testes, OpenAPI | gates acima | sim | PASS | G-build, G-format, G-test, G-openapi (orquestrador, f328295) |
| AC-2 | Modelo, privilégios, migração | `MigracoesTestes`, `Dados/*Testes`, `has-pending-model-changes`, `database update` | sim | PASS | `Applying migration '20261025094206_Inicial'` e `'20261025113548_IdentidadeEmpresas'`, `Done.` (r01–r03). Catálogo real (`dba` r01): `cronoai_app` sem DELETE em `usuario`; só SELECT/INSERT em `empresa` e `membro_empresa`; DML completo só em `sessao`; nada no histórico |
| AC-3 | `Restrict`, 63 bytes, precisão | `ArquiteturaTestes`, `CatalogoTestes` | sim | PASS | `Fks_do_schema_sao_restrict` com `NotEmpty`; `Identificadores_cabem_em_63_bytes` cobre também `pg_policies` (r01); laço `Restrict` por último em `CronoDbContext.cs:67-70` (`arquiteto` r01) |
| AC-4 | RLS forçado, políticas exatas, dono sujeito, helper | `CatalogoTestes`, `RlsTestes`, `MigracaoDeDadosRlsTestes`, `PoliticasRlsComportamentoTestes` | sim | PASS | lista exata de 8 políticas `{cronoai_app}`; dono com contexto vazio e setado (r01). `dba` r01: `relforcerowsecurity=t` em `empresa`, `membro_empresa`, `sessao`; helper volta o `FORCE` mesmo com erro no DML. Predicados: `Predicados_das_politicas_sao_os_do_plano` compara `qual` e `with_check` exatos das 8 políticas; 4 negativos como `cronoai_app` (INSERT de sessão de outro usuário → 42501; vínculo com outra empresa → 42501; UPDATE trocando `usuario_id` → 42501; DELETE sem filtro só apaga a própria sessão). Mutação feita pelo dev: cada afrouxamento (`WITH CHECK (true)` / `USING (true)`) reprova o negativo e o catálogo; UPDATE/DELETE escritos sem `WHERE`, porque o `WHERE` faz a política de SELECT mascarar o afrouxamento (f328295) |
| AC-5 | Filtro, listas permitidas, contexto imutável | `ArquiteturaTestes`, `FiltroEmpresaTestes`, `ContextoTestes`, R16 | sim | PASS | teste previsto dividido em `Contexto_do_banco_e_imutavel` e `Contexto_da_sessao_so_pode_ser_preenchido_uma_vez` (`ContextoTestes.cs:11,21`) (r01) |
| AC-6 | Login OIDC, cookie, upsert, retenção | `OidcTestes`, `SessaoTestes` | sim | PASS | nomes previstos presentes (r01); upsert sem `COALESCE` com `Provedor_que_nao_manda_nome_grava_nulo_sem_manter_o_antigo` (8634188); mantido pelos 179/179 (r03) |
| AC-7 | Tokens inválidos | `OidcNegativosTestes` | sim | PASS | Theory de 8 casos (outra chave, emissor, audiência, expirado, nonce, state, `alg` none, PKCE); afirma 401, sem cookie, 0 usuários, sem sujeito, código nem `id_token` no log; `Id_token_no_retorno_de_autorizacao_nao_cria_sessao` com e sem `code` (r02) |
| AC-8 | Sem provedor fixo | `git grep -inE "microsoftonline\|login\.live\|accounts\.google\|keycloak\|okta\|auth0" -- server/src`; `Sem_autoridade_entrar_responde_503_e_api_sobe` | sim | PASS | grep vazio; teste verde (r01) |
| AC-9 | Usuário de desenvolvimento e semente | `UsuarioDesenvolvimentoTestes`, `SementeDesenvolvimentoTestes`, V-1, V-2 | sim | PASS | semente 2x: `2\|3\|4` (usuários, empresas, vínculos); rota sem os dois interruptores responde 404 (8634188) (r01–r03) |
| AC-10 | Expiração e revogação | `SessaoTestes`, `OidcTestes` | sim | PASS | 4 testes previstos (r01); `Novo_login_no_mesmo_navegador_encerra_a_sessao_anterior`: 1 sessão aberta de 2 (r02) |
| AC-11 | Endpoints | `EuTestes`, `EmpresaAtualTestes`, `Dados/SessaoTestes` | sim | PASS | `/eu` 200, sem cookie 401; `/empresas/atual` sem empresa ativa 403; `Definir_empresa_ativa_de_quem_nao_e_membro_devolve_false_sem_lancar` (r01, r02) |
| AC-12 | Isolamento em toda rota | `IsolamentoRotasTestes`, `PoolApiTestes` | sim | PASS | 7 testes; `DetectorDeRotas` usa `EndpointDataSource`; meta-teste em host separado acusa `GET /api/v1/__teste/sem-cenario` (r01). `PoolApiTestes` sem controle negativo na API: ver "Pendências" |
| AC-13 | Rate limiting e hosts | `BordaTestes` | sim | PASS | 4 testes previstos verdes (r01) |
| AC-14 | Data Protection | `DataProtectionTestes` | sim | PASS | verde nas 3 execuções da r02 e da r03; na r01, 2 falhas na 1ª execução (instável; asserção trocada por leitura de log em 8634188) |
| AC-15 | Logs sem dado pessoal | `LogsTestes`, `OidcNegativosTestes` | sim | PASS | log do login só com `usuario_id` (r01); código e `id_token` ausentes no log (r02) |
| AC-16 | Regras de .NET | `node --test`; `validar-regras` | sim | PASS | 40/40; 0 bloqueia (orquestrador, f328295). R15 linha a linha com teste (8634188) |
| AC-17 | Documentação e ADRs | diff e greps | sim | PASS | ADRs 00005 e 00006 `Proposto`; exceção do uuid v4 no ADR 00004 (linha 34); nota "sem `cnpj`" na SPEC-01 (linha 63); checklist V6–V10; `backend-dotnet.md`, `CLAUDE.md`, `server/README.md` (r01, r02) |
| AC-18 (diff) | Front intacto | `git diff --name-only feat/00011-backend-esqueleto...HEAD`; lint; tipos | sim | PASS | nada em `src/`, `e2e/`, `Dockerfile`, `docker/`, `docker-compose` nem `.github/`; lint e typecheck verdes (r01–r03) |
| AC-18 (`npm run ci`) | `npm run ci` verde | `npm run ci` no worktree c12 | sim | PASS | orquestrador, HEAD 46dc9ae: lint e tipos ok; `Test Files 10 passed (10)`, `Tests 67 passed (67)`; `Statements : 92.79% ( 1817/1958 )`; `✓ built`; exit=0 |
| AC-19 | Pool sem vazamento | `PoolRlsTestes`, `ConfiguracaoTestes`, R17 | sim | PASS | controle negativo `Sem_sobrescrita_e_sem_reset_o_valor_vaza` (pool 1, mesmo `pg_backend_pid`); `Sobrescrita_independe_do_reset`; concorrência com pool 3 e 60 operações; log `'No Reset On Close=true' não é permitido` (r01) |
| R-1 | Camadas | `ArquiteturaTestes` | sim | PASS | verde; `Dominio` sem pacote; `Api → Dados → Dominio` (r01) |
| R-2 | DDL só em migração, bootstrap ou `Rls/`; DML de migração só pelo helper | R15 + `git grep` | sim | PASS | `validar-regras` 0 bloqueia (orquestrador, f328295) |
| R-3 | Sem `Migrate(` na partida | `git grep "Migrate(" -- server/src` | sim | PASS | vazio (r01) |
| R-4 | Sem aviso novo | build | sim | PASS | 0 avisos com `--no-incremental` (r03) |
| R-5 | Estilo do ADR 00004 | leitura do `arquiteto` | sim | PASS | r03 (2ª revisão) acusou `public static bool NomeRejeitado` em `#region Métodos privados`; em 46dc9ae virou `private static` (`ServicoLogin.cs:179`); `arquiteto` r04 APROVADO |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes.Appsettings_sem_segredo_do_cliente_nem_flag_de_desenvolvimento`, R08 | sim | PASS | verde; `validar-regras` 0 bloqueia (r01, r03) |
| S-2 | Dependências, licenças, vulneráveis | `Directory.Packages.props` × §08; `--vulnerable --include-transitive` | sim | PASS | `Microsoft.AspNetCore.Authentication.OpenIdConnect` 10.0.13 e `Microsoft.IdentityModel.*` / `System.IdentityModel.Tokens.Jwt` 8.19.2, todos MIT; sem vulneráveis. Revisão de segurança e licença com a Segurança |
| S-3 | Atributos do cookie | `OidcTestes`; curl | sim | PASS | `Set-Cookie: __Host-cronoai-sessao=<redigido>; path=/; secure; samesite=lax; httponly` (r01) |
| S-4 | CSRF | `EmpresaAtualTestes.Escrita_sem_antiforgery_responde_400`, `Toda_escrita_exige_antiforgery` | sim | PASS | verdes (r01) |
| S-5 | Redirecionamento aberto | `OidcTestes.Retorno_externo_vai_para_a_raiz` | sim | PASS | verde (r01) |
| S-6 | Headers em 302/401/403/429 | `CabecalhosAutenticadosTestes.Cabecalhos_de_seguranca_em_302_401_403_429` | sim | PASS | verde; nosniff, CSP e Referrer-Policy no 204 real (r01) |
| S-7 | Sem CORS | `Sem_cabecalho_cors` | sim | PASS | verde (r01) |
| S-8 | Testes de banco como `cronoai_app` | leitura | sim | PASS | `StringConexaoApp`; migrador só nos testes "dono" e de helper; superusuário só na fixture (r01) |
| S-9 | `ShowPII` desligado | `git grep ShowPII -- server/src` | não | PASS (redefinido) | `IdentityModelEventSource.ShowPII = false` em `BordaExtensoes.cs`. O plano §3.7 manda definir; a S-9 pedia grep vazio. Vale a S-9 redefinida |
| S-OUT | Logout do handler desligado | `OidcTestes.Rotas_de_logout_do_handler_ficam_desligadas` | sim | PASS | `/signout-oidc` e `/signout-callback-oidc` 404; `/eu` continua 200 (r02, r03) |
| V-1 | Subida local com semente e `/eu` por curl | compose `db` (`-p cronoaiqa12c`, porta 15434), migração, semente 2x, API em Development | não | PASS | `Healthy`; `2\|3\|4`; login dev-a 204; `/empresas/atual` 403; login dev-b 204; cookie antigo 401, novo 200; `/signout-oidc` 404; 0 gatilhos de teste no banco (r03) |
| V-2 | API em Production com a flag não sobe | `dotnet run` com `ASPNETCORE_ENVIRONMENT=Production` | sim | PASS | `OptionsValidationException: O usuário de desenvolvimento só pode ser habilitado em Development`; semente: `A semente de desenvolvimento só roda em Development.` (r01) |
| PLANO | Todo teste previsto no §11 existe | grep de 70 nomes | sim | PASS | só `Contexto_do_banco_e_imutavel_e_sessao_preenchida_uma_vez` divergia (dividido em dois) (r01) |
| E2E | `npm run e2e` | — | não | NA | não rodado, por instrução (porta compartilhada); front intacto |
| R04 | Rodada 04: `NomeRejeitado` privado, U+061C, ramos 23514, comentário do P0001, robustez dos gatilhos | `testes` e `arquiteto` sobre 46dc9ae | sim | PASS | `testes` r04: T-1 a T-5 PASS (caso `nome-outra-constraint` propaga 23514 com "Nome Original" intacto; `nome-limite-do-nome` grava nulo; U+061C por `(char)`, grep sem byte cru; `try/finally` no `DisposeAsync`); mutação do dev: aceitar 23514 de qualquer constraint faz só `nome-outra-constraint` falhar (total 30, falhou 1); `arquiteto` r04 APROVADO; build 0 avisos |
| AUD | Auditoria independente | `revisor` MODO AUDITAR | sim | PASS | r01 (478303c): REPROVADO, 12 achados → rodada 05 (f328295) e registro (fcdaf54). Reauditoria em fcdaf54: **APROVADO**, sem achado novo; reexecutou restore, build (0 avisos), OpenAPI, format, `dotnet test` 201/201 (1m11s), has-pending, vulneráveis, `node --test` 40/40, `validar-regras` 0 bloqueia; mutação: UPDATE/DELETE afrouxados só aparecem sem `WHERE` (documentação: https://www.postgresql.org/docs/current/sql-createpolicy.html) |

## Ressalvas dos validadores e destino
| Origem | Ressalva | Destino |
|---|---|---|
| testes r01 | `DataProtectionTestes` instável (2 falhas na 1ª execução completa) | corrigido (8634188): `PartidaDoHost` lê o log "Hosting failed to start"; 163/163 3x. Causa raiz não explicada → pendência |
| testes r01 | Teste negativo do OIDC só afirma ausência do sujeito no log | corrigido (8634188): código e `id_token` também |
| testes r01 / r02 / r03 | `PoolApiTestes` sem controle negativo no nível da API | pendência registrada |
| testes r01 / arquiteto r01 | S-9 do plano pede grep vazio, código tem `ShowPII = false` | registrado: S-9 redefinida (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| testes r01 | `npm run ci` completo não rodado | executado pelo orquestrador em 46dc9ae: AC-18 (`npm run ci`) PASS (`scratchpad\c12-npm-ci.log`, exit=0) |
| testes r02 / r03 | `SpinWait` do `PartidaDoHost` sem mensagem própria | pendência registrada |
| testes r03 | `GatilhoDeFalhaAsync` e `GatilhoTemporario.DisposeAsync` sem proteção | corrigido (46dc9ae) |
| testes r03 | Mutação do T-5 não repetida pelo `testes` | registrado (feita pelo dev) |
| testes r03 | `GET /empresas/atual` com 200 não exercitado por curl | registrado: coberto por `EmpresaAtualTestes` e `PoolApiTestes` |
| arquiteto r01 | M1: `Results.*` em vez de `TypedResults`; OpenAPI errado | corrigido (8634188): uniões `Results<…>`, `.ProducesProblem`, OpenAPI regerado; regra em `backend-dotnet.md` |
| arquiteto r01 | B1: `CLAUDE.md` e README dizem que a semente exige a flag | corrigido (8634188): opção (a), "só Development" (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR) |
| arquiteto r01 | N1: campo estático sem `_` | corrigido (8634188): `AlgoritmosAssinatura.Assimetricos` em arquivo próprio |
| arquiteto r01 | N2: `Configure<OpcoesOidc>` e `RemoverPolitica` sem uso; chave duplicada | corrigido (8634188) |
| arquiteto r01 | N3: upsert com `COALESCE` mantém nome antigo (RNF-02.3) | corrigido (8634188), com teste |
| arquiteto r01 / seguranca r01 | N4 / Baixo: nome do provedor (NUL dá 500; corte parte emoji) | corrigido (8634188): controles removidos, corte por elemento de texto, nulo como último recurso; surrogate órfão em b5a3289 |
| arquiteto r01 | N5: teste aceita 404 ou 401 | corrigido (8634188): exige 404 |
| arquiteto r01 | N6: nomes de teste e arquivo diferentes do plano | registrado nesta matriz (AC-5, S-6) |
| arquiteto r01 | Desvios declarados 1–11 do dev | aceitos e registrados; índice extra confirmado pelo `dba` |
| arquiteto r01 / seguranca r01 | Requisição sem endpoint passa pela autorização; middleware terminal viraria bypass | corrigido (8634188): aviso em `Program.cs`, ADRs 00005/00006 e `backend-dotnet.md` |
| arquiteto r01 / seguranca r01 | Atalho do `GetDocument.Insider` | aceito; link da documentação no código e no README (8634188) |
| arquiteto r02 | R2-1: catch largo refaz o upsert com nome nulo em qualquer erro do PostgreSQL | corrigido (b5a3289): `NomeRejeitado` só para `EncoderFallbackException`, 22021 e 23514 de `ck_usuario_nome_tamanho` |
| arquiteto r02 | R2-2: `SessaoAnteriorAsync` público na região privada | corrigido (b5a3289): `SessaoDoCookie.ObterAnteriorAsync` em `Sessao/` |
| arquiteto r02 | R2-3: `GET /empresas/atual` com 404 não declarado | corrigido (b5a3289): caminho inalcançável removido; `SingleAsync` e 500 genérico |
| arquiteto r03 (1ª revisão) | Log `NomeDeExibicaoDescartado` com causa errada no falso positivo | pendência registrada |
| arquiteto r03 (1ª revisão) | `GatilhoTemporario` sem regions | registrado: padrão já aceito nos tipos aninhados de teste |
| arquiteto r03 (1ª revisão) | U+200B–U+200D e U+FEFF fora da lista | pendência registrada (decisão da Segurança) |
| arquiteto r03 (2ª revisão) | `public static NomeRejeitado` na região privada (bloqueante) | corrigido (46dc9ae) |
| arquiteto r03 (2ª revisão) | U+061C (Bidi_Control) fora da lista | corrigido (46dc9ae) |
| arquiteto r03 (2ª revisão) | Ramos 23514 com e sem `ck_usuario_nome_tamanho` sem teste | corrigido (46dc9ae) |
| arquiteto r03 (2ª revisão) | Ramo `EncoderFallbackException` sem teste | pendência registrada (fora da rodada 04) |
| arquiteto r03 (2ª revisão) | Comentário cita só o 40001, a teoria cobre também o P0001 | corrigido (46dc9ae) |
| arquiteto r03 (2ª revisão) | Log `NomeDeExibicaoDescartado` antes de propagar erro do sujeito (info) | pendência registrada |
| dba r01 | `DefinirEmpresaAtivaAsync` lança 23503 em vez de devolver `false` | corrigido (8634188), com teste |
| dba r01 | R15 confere o arquivo, não a linha | corrigido (8634188): teste linha a linha. O dev afirma que o código já conferia por linha (ver divergência) |
| dba r01 | Histórico de migrações sem privilégio para `cronoai_app` | registrado: confirmado no catálogo real e por `Aplicacao_nao_acessa_historico_de_migracoes` |
| dba r01 | Índice `ix_sessao_empresa_ativa_id_usuario_id` | manter; índice parcial a avaliar no 00014 |
| dba r01 | PgBouncer não testado; `app.*` não é segredo | pendência de área (Infraestrutura); registrado no ADR 00006 |
| seguranca r01 | Médio: fluxo de código não exigido (`id_token` sem `code` entra) | corrigido (8634188): `ExigirFluxoDeCodigoAsync` em `OnMessageReceived`; teste com e sem `code`; revalidado na r02 |
| seguranca r01 (info) | `alg=none` resolvido só em `OnTokenValidated` | corrigido (8634188): `ValidadorTokenAssinado` na origem; cada camada sozinha dá 401 |
| seguranca r01 (info) | `/signout-oidc` e `/signout-callback-oidc` respondem 200 | corrigido (8634188): 404 sem tocar a sessão |
| seguranca r01 (info) | Novo login não encerra a sessão anterior | corrigido (8634188), com teste |
| seguranca r02 (info) | Controles bidirecionais (Cf) passam no nome | corrigido (b5a3289): U+200E, U+200F, U+202A–U+202E, U+2066–U+2069; antecipado do 00014 (decidido pelo orquestrador com autorização do usuário, sujeito à revisão dele no PR). U+061C → corrigido (46dc9ae) |
| testes r04 | `DROP` do gatilho usa o `CancellationToken` do teste: um timeout deixaria o gatilho no banco | corrigido (f328295): `CancellationToken.None` |
| arquiteto r04 | B: helper `Executar` assíncrono sem sufixo `Async` | corrigido (f328295): `ExecutarAsync` |
| arquiteto r04 | C: comentário do `catch` de `GatilhoDeFalhaAsync` otimista se o próprio dispose lançar | registrado (só teste) |
| arquiteto r04 / dba r04 | D / 8: comentário diz que o 40001 chega embrulhado em `InvalidOperationException`; não há estratégia de retry em `src/` | registrado: sem `EnableRetryOnFailure`, o EF Core usa a estratégia sem retry, que embrulha o erro transitório em `InvalidOperationException` sem repetir; o comentário está correto e o teste não paga atrasos |
| arquiteto r04 | A: o rascunho deste registro entrou no commit 46dc9ae do dev | registrado: finalizado no commit de documentação seguinte |
| dba r04 | 6: `RemoverPolitica` removido | registrado: `IdentidadeEmpresas.Down()` só faz `DropTable`, que remove as políticas junto; sem efeito na reversão |
| dba r04 | 7: gatilho de teste sem `CREATE OR REPLACE`/`DROP ... IF EXISTS` antes do `CREATE TRIGGER` | corrigido (f328295) |
| dba r04 | 1: com `NomeRejeitado`, a 2ª tentativa grava nulo e apaga o nome antigo | registrado: comportamento documentado (RNF-02.3, nome sempre o do último login); decisão de produto sujeita à revisão do usuário no PR |
| auditoria r01 | 1 [Médio] AC-4: predicados (`qual`/`with_check`) sem prova; um `WITH CHECK (true)` passaria | corrigido (f328295): predicados exatos + 4 negativos com mutação |
| auditoria r01 | 2: teste da flag deixa passar `"Habilitado": "true"` como texto | corrigido (f328295): detector com teste de 7 casos |
| auditoria r01 | 3: "roda como cronoai_app" usava a fábrica do teste | corrigido (f328295): teste renomeado e novo teste pela composição real do host |
| auditoria r01 | 4: anel padrão de Development não testado | corrigido (f328295): `%LOCALAPPDATA%/CronoAI/chaves`, fora da raiz do git |
| auditoria r01 | 5: valor do `id_token` não procurado no log do login bem-sucedido | corrigido (f328295): valor do token e do código |
| auditoria r01 | 6: detector de acesso a `usuario` não pega SQL cru e compara só o nome do arquivo | corrigido (f328295): SQL cru e caminho completo, com meta-teste |
| auditoria r01 | 7: `SessaoValidada.ExpiraEm` sem uso | corrigido (f328295): removido |
| auditoria r01 | 8: matriz T-5 cita teste renomeado | corrigido neste registro |
| auditoria r01 | 9: linhas da matriz com evidência anterior à última mudança | corrigido neste registro: gates reexecutados pelo orquestrador em f328295 |
| auditoria r01 | 10: ressalva do `npm run ci` contradiz a matriz | corrigido neste registro |
| auditoria r01 | 11: 3º retorno da validação não levado ao usuário | registrado: o usuário autorizou a sessão a seguir sem parar por todas as fases ("não pare de trabalhar até finalizar todas as specs"; "Pode fazer todas as fases"). O impasse (rodadas 02 a 05 e a reprovação da auditoria r01) fica aqui para a revisão dele no PR; nenhuma decisão de escopo foi tomada no lugar dele |
| auditoria r01 | 12: helper de política conta caracteres e fala em bytes | corrigido (f328295): `UTF8.GetByteCount >= 63`, com teste multibyte |
| reauditoria | A rodada 05 não passou pelo agente `testes` (o processo pede o `testes` sempre que o código muda) | registrado: a revalidação da rodada 05 foi feita pelos gates do orquestrador em f328295 e pela reexecução independente da reauditoria em fcdaf54 (201/201) |
| reauditoria | A mutação das políticas usou a imagem `postgres:17-alpine`, baixada e removida no mesmo comando | registrado: download feito pelo auditor sem pedido explícito do usuário; avisado ao usuário no relatório da sessão |

## Pendências registradas
- **Controle negativo do `PoolApiTestes`:** existe só no nível de dados (`PoolRlsTestes.Sem_sobrescrita_e_sem_reset_o_valor_vaza`). O teste da API prova o comportamento, mas não prova que detectaria um vazamento.
- **`SpinWait` do `PartidaDoHost`:** só espera. Se o marcador não aparecer, quem falha é o `Assert.Contains` do chamador, sem mensagem própria.
- **Causa raiz da instabilidade do `DataProtectionTestes`:** não explicada. O teste passou a ler o log "Hosting failed to start" e depende desse texto.
- **Log `NomeDeExibicaoDescartado`:** sai antes de propagar um erro que veio do sujeito ou do emissor, com a causa errada. Sem perda de dado (info).
- **Ramo `EncoderFallbackException` do `NomeRejeitado`:** sem teste. Hoje não acontece, por causa do `NomeSeguro`.
- **U+200B–U+200D e U+FEFF:** fora da lista de caracteres removidos. A decisão é da Segurança.
- **404 do `GET /empresas/atual`:** se algum ciclo conceder DELETE em `empresa`, reavaliar e anotar no ADR 00006.
- **Índice parcial** `WHERE empresa_ativa_id IS NOT NULL`: avaliar no 00014.
- **`usuario` fora do RLS:** reavaliação no 00014.
- **Herdado do 00011, ainda aberto:** teste da R08 fora da CI; cobertura do backend não coletada.
- **Antes do PR:** fazer merge da `master`. PR empilhado em `feat/00011-backend-esqueleto` se o 00011 não tiver entrado.

## Validação de outras áreas (não substitui o parecer delas)
- **Segurança da Informação:**
  - provedor OIDC real e MFA; cliente registrado só com authorization code (implícito e híbrido desligados);
  - método de autenticação do cliente (segredo ou `private_key_jwt`); logout no provedor;
  - tempos de sessão (30 min / 8 h sugeridos) e limites de taxa;
  - pacote `Microsoft.AspNetCore.Authentication.OpenIdConnect` 10.0.13 e família `Microsoft.IdentityModel.*` 8.19.2: revisão de segurança e de licença antes de produção; reconferir o `alg=none` a cada atualização;
  - IdP de teste em memória (código próprio);
  - aceite dos itens ASVS 5.0.0 V6–V10 e fumaça com o provedor real;
  - lista de caracteres invisíveis removidos do nome.
- **Jurídico:**
  - dado pessoal: `nome_exibicao` e o par emissor + `sub`;
  - retenção da sessão (`sessao`, 30 dias sugeridos) e de `ultimo_acesso_em`; pseudonimização (`UPDATE`, nunca `DELETE`);
  - risco residual: `usuario` legível entre empresas pelo `cronoai_app` até o 00014;
  - termos multiempresa (controlador × operador); licenças MIT;
  - com o usuário: como empresas passam a existir fora do local (G2).
- **Infraestrutura:**
  - PgBouncer em modo de transação vaza as variáveis de sessão; exigiria `set_config(..., true)` com interceptor de transação;
  - `ForwardedHeaders` (sem isso, o limite por IP vira um limite único) e `AllowedHosts` de produção;
  - Data Protection fora da máquina local: guarda e proteção do anel;
  - TLS/HSTS, `redirect_uri` e domínio; cofre para o `SegredoCliente`;
  - papel de backup (`pg_dump` e RLS) e papel de limpeza em produção.
