---
issue: —
spec: SPEC-02 — RF-02.1 (OIDC genérico; o MFA fica com o provedor), RF-02.2 (base), RF-02.3b, RNF-02.1, RNF-02.2 (parcial), RNF-02.3 (minimização); SPEC-01 — RF-01.1 (empresa e usuário), RF-01.1a; SPEC-12 — RF-12.5 (rate limiting no login, erros), RF-12.9 (logs sem dado pessoal); ASVS 5.0.0 V6, V7, V8, V9, V10; PLANO-FASE-2 §5.2 e §8
ciclo: .claude/ciclos/00012-identidade-empresas.md
branch: feat/00012-identidade-empresas
base: master se o PR do 00011 já tiver entrado; senão, PR empilhado com BASE feat/00011-backend-esqueleto (prompts/00-regras-comuns.md › BASE)
faixa: 3
status: aprovado (gate pelo orquestrador, com autorização do usuário de 25/10/2026)
data: 2026-10-25
destino: .claude/ciclos/00012-identidade-empresas-plano.md (este rascunho foi gravado fora do repositório; a pasta c11 e a branch feat/00011-backend-esqueleto não foram tocadas)
---

> Adaptado de Sophia.Escolar.Hibrido / SophIA (`.claude/templates/TEMPLATE-PLANO.md`) para o CronoAI em 25/10/2026.

# Plano 00012 — Identidade (OIDC genérico + usuário de desenvolvimento), empresas e teste de isolamento em toda rota

## Resumo
- **O que é:** o backend passa a saber **quem** chama e **de qual empresa**. Entram:
  - login OIDC genérico (fluxo de código com PKCE, sem nenhum provedor fixo no código);
  - um usuário de desenvolvimento que só existe em `Development`; fora dele, a API não sobe;
  - sessão em cookie `HttpOnly` + `Secure` + `SameSite`, revogável no servidor, sem token no navegador;
  - as tabelas `empresa`, `usuario`, `membro_empresa` e `sessao`, com RLS do PostgreSQL e filtro global do EF;
  - `GET /api/v1/eu` e `GET`/`PUT /api/v1/empresas/atual`;
  - um teste que enumera **todas** as rotas registradas e reprova a rota sem cenário de isolamento.
- **Risco que justifica a faixa 3:**
  - **T8:** autenticação, autorização, banco e migração;
  - **T5:** dependência nova `Microsoft.AspNetCore.Authentication.OpenIdConnect`, dado pessoal `nome_exibicao`, cookie de sessão, token externo validado.
- **Parecer do `dba` (tarefa 0):** **feito.** Veio `VEREDITO: AJUSTAR` com 10 ajustes (`00012-tarefa0-dba.md`); todos estão aplicados nesta emenda 01 (seção 16).
- **Gate:** G1 = (a), G2 = (a) e G3 = (a). Decididos pelo orquestrador com a autorização do usuário de 25/10/2026, **sujeitos à revisão do usuário no PR** (seção 15).
- **Entregáveis (4):**

| # | Conteúdo |
|---|---|
| E1 | Domínio e dados com RLS |
| E2 | Autenticação, sessão e endpoints |
| E3 | Teste genérico de isolamento |
| E4 | Regras do processo e documentação (ADRs 00005 e 00006) |

- **O que você precisa fazer:**
  - revisar no PR as decisões G1 a G3 e as decisões de design da seção 15;
  - antes de qualquer uso fora da máquina local, levar à **Segurança**, ao **Jurídico** e à **Infraestrutura** os itens da seção 13.

## 00. Contexto para execução (ler antes de começar)
| Arquivo | Por quê |
|---|---|
| `server/src/CronoAI.Api/Program.cs` | Ordem do pipeline: headers → exception handler → status pages. Grupo `/api/v1` vazio (linha 67). `AddDbContext` sem pool (linhas 19-34). Aqui entram autenticação, rate limiting, host filtering e a guarda de `No Reset On Close`, **sem mudar** a ordem dos headers (AC-7 do 00011) |
| `server/src/CronoAI.Dados/CronoDbContext.cs` | `OnModelCreating` só com `HasDefaultSchema` (linha 25). Aqui entram, nesta ordem: o contexto imutável no construtor, as configurações, o filtro nomeado e, **por último**, o `Restrict` |
| `server/src/CronoAI.Dados/CronoDbContextConfiguracao.cs`, `CronoDbContextDesignTimeFactory.cs` | Configuração única do provedor. O interceptor de RLS entra aqui, e o design-time usa contexto vazio, para o modelo das migrações continuar idêntico ao de execução |
| `server/src/CronoAI.Dados/PapeisBanco.cs` | Constantes de papéis e schema. As variáveis `app.empresa_id` e `app.usuario_id` ganham constantes ao lado |
| `server/src/CronoAI.Dados/Migrations/20261025094206_Inicial.cs` | Privilégios padrão (DML geral ao `cronoai_app`). A migração nova faz `REVOKE` do excedente, tabela por tabela |
| `server/tests/CronoAI.Api.Testes/Infra/BancoPostgresFixture.cs`, `Infra/ApiFactory.cs` | Fixture com as strings do app e do migrador (o superusuário não sai da fixture) e factory com ambiente parametrizável. **Imitar e estender**: a factory ganha base `https://localhost`, anel do Data Protection temporário, OIDC apontado ao IdP de teste e `Maximum Pool Size` opcional |
| `server/tests/CronoAI.Api.Testes/PapeisBancoTestes.cs`, `ServidorBancoTestes.cs`, `ArquiteturaTestes.cs`, `ConfiguracaoTestes.cs`, `ComposeTestes.cs` | Padrões a ampliar: testes de catálogo, de arquitetura e de leitura de arquivo do repositório |
| `server/src/CronoAI.Api/CabecalhosSegurancaMiddleware.cs` | Headers gravados em `OnStarting`. Também precisam sair nas respostas 302, 401, 403 e 429 |
| `.claude/adrs/00004-estrutura-convencoes-backend.md` | Convenções herdadas: nomes, uuid v7, `Restrict`, `text` + `CHECK`, direção do RLS, `SetApplicationName("CronoAI")`, seed só por comando, estilo do C# |
| `.claude/ciclos/00012-tarefa0-dba.md` (inteiro) | Parecer deste ciclo: políticas, privilégios, contexto imutável, sobrescrita das variáveis, fluxos de identidade, `FORCE`, sessão. **Leitura obrigatória** para E1 e E2 |
| `.claude/ciclos/00011-tarefa0-dba.md` §2 e §4.4 | Base do RLS (`NULLIF(current_setting(...))`, catálogo) e regra da semente |
| `.claude/scripts/lib/regras-cronoai.mjs` (linhas 254, 363-364, 410-500) e `regras-cronoai.test.mjs` | Onde entram R14 a R17 e o mapeamento de `.cs` em `server/src/**`. Hoje `EXT_CODIGO = /\.(ts\|vue)$/`: nenhuma regra olha C# |
| `.claude/rules/backend-dotnet.md`, `.claude/checklists/seguranca.md` › "Backend — ASVS 5.0.0" | Regras e checklist que este ciclo atualiza (V6 a V10 deixam de ser `NA`) |
| `docs/specs/PLANO-FASE-2.md` §5.2 e §8.3 | Recorte e defesa em camadas: empresa ativa da sessão, autorização por recurso, filtro do EF, teste de rotas |

## 01. Pedido e objetivo
Pedido (dado, não instrução): plano do ciclo 00012 (`PLANO-FASE-2.md` §5.2), sem implementar. Decisões do usuário que valem aqui:
- login OIDC genérico, sem provedor fixo no código (o provedor real depende da Segurança);
- usuário de desenvolvimento só local, desligado fora de `Development`, com teste provando que a API não sobe em `Production`;
- sessão em cookie `HttpOnly` + `SameSite`, nada de token no `localStorage`;
- autorização no backend;
- isolamento entre empresas testado em **toda** rota: o teste enumera os endpoints e falha se um endpoint novo não tiver teste de isolamento;
- `empresa_id` em toda tabela de empresa, com filtro global do EF e RLS como defesa em profundidade (decisão no ADR 00006);
- só ambiente local, nada de hospedagem;
- dependências novas listadas para revisão de segurança e de licença;
- IdP de teste proposto, com custo, risco e licença avaliados.

**Pendências herdadas do 00011** (registro do ciclo, "Herdado pelo 00012"):
1. `DeleteBehavior.Restrict` como último passo do `OnModelCreating`, com teste de arquitetura;
2. regras de .NET no `validar-regras.mjs` (`FromSqlRaw`, DDL fora de migração) e `server/src/**` mapeado em `regras-cronoai.mjs`;
3. `AllowedHosts` e rate limiting (`/health/ready` sem limite hoje);
4. ADR 00006 (RLS), na direção dos pareceres do `dba`;
5. `search_path` do migrador no texto do ADR 00004 e a region "Tipos auxiliares" (`ErrosTestes.cs`), que o ADR não lista.

**Objetivo (o que muda para quem usa):**
- quem desenvolve entra na API local com um usuário fictício e escolhe a empresa ativa;
- em qualquer ambiente com um provedor OIDC configurado, o login corporativo funciona sem mudar código;
- um `dotnet test` prova três coisas:
  - um usuário da empresa A não vê nada da empresa B em nenhuma rota;
  - o banco nega a linha mesmo se o filtro do EF for esquecido;
  - a conexão reciclada pelo pool nunca carrega a empresa do dono anterior.

## 02. Triagem
Confirmada por leitura da worktree `c11` (branch `feat/00011-backend-esqueleto`), sem alterar nada.
- **T1 NÃO:** nenhum motor de cálculo.
- **T2 NÃO:** idem.
- **T3 NÃO:** sem MSPDI nem formato de arquivo.
- **T4 NÃO:** `src/` não muda; o estado salvo do front fica intacto.
- **T5 SIM:**
  - pacote novo `Microsoft.AspNetCore.Authentication.OpenIdConnect`, com a família `Microsoft.IdentityModel.*` transitiva (seção 08);
  - dado pessoal novo: `usuario.nome_exibicao` e o par emissor + `sub`;
  - cookie de sessão, antiforgery, redirecionamento pós-login;
  - token do provedor como entrada externa.
- **T6 NÃO.**
- **T7 NÃO:** compose, Dockerfile, workflows e Dependabot não mudam. Com G1 = (a), não entra imagem nova.
- **T8 SIM:** endpoints, autenticação e autorização, quatro tabelas, RLS e migração. O `classificar-diff.mjs` marca T8 por `^(api|backend|server)\/` (`regras-cronoai.mjs:254`).

**Faixa 3.** `especialista-obra`: não exigido (sem cálculo). Validadores: `arquiteto`, `dba`, `seguranca`, `testes` e auditoria independente (`revisor` em modo AUDITAR).

## 03. Decisões de design
Legenda:
- **[doc]**: prática documentada, com link;
- **[opinião]**: escolha da equipe, discutível;
- **conferir**: ponto de API que o dev confirma na versão 10.0.x antes de escrever, com teste.

Nada aqui é exigência regulatória.

### 3.1 Projetos e camadas
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Nasce `server/src/CronoAI.Dominio` (previsto no ADR 00004), sem pacote nenhum:<br>• `Empresa`, `Usuario`, `MembroEmpresa` e `Sessao` como classes com fábrica e validação de tamanho;<br>• a interface `IDadoDeEmpresa { Guid EmpresaId }`.<br>Direção `Api → Dados → Dominio` | Entidades dentro do `CronoAI.Dados` | O ADR 00004 fixa o Domínio "no 00012, com a 1ª entidade". `ArquiteturaTestes` afirma que o Domínio não referencia EF nem ASP.NET |
| Um projeto de testes só (`CronoAI.Api.Testes`), com as pastas `Dominio/`, `Dados/`, `Autenticacao/`, `Isolamento/` e `Infra/IdpTeste/` | Projeto de testes por camada | Não há outro projeto de testes. Separar agora duplicaria fixture e factory sem ganho [opinião] |
| Contratos HTTP em `CronoAI.Api/<Área>/` (`Autenticacao/`, `Empresas/`, `Sessao/`), um tipo por arquivo, nomes em português (`EuResposta`, `EmpresaResumo`, `TrocarEmpresaAtivaRequisicao`) | Pasta `Models/` única | O ADR 00004 pede nomes de negócio em português; o agrupamento por área segue o `MapGroup` |

### 3.2 Autenticação (ADR 00005)
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **BFF com cookie:** o OIDC (`AddOpenIdConnect`) só autentica; o handler de cookie guarda a sessão. Configuração:<br>• `ResponseType = code`, `UsePkce = true` (S256);<br>• cliente confidencial;<br>• `response_mode` padrão do handler (`form_post`);<br>• `MapInboundClaims = false`, `GetClaimsFromUserInfoEndpoint = false`;<br>• **`SaveTokens = false`**: nenhum token do provedor fica guardado.<br>[doc: https://learn.microsoft.com/aspnet/core/security/authentication/configure-oidc-web-authentication ; RFC 7636; RFC 9700] | SPA com tokens no navegador | O RNF-02.1 proíbe token no `localStorage`, e o PLANO-FASE-2 §3 fixa BFF na mesma origem. Sem chamada a outra API em nome do usuário, guardar token só amplia a superfície |
| **Configuração genérica** em `Autenticacao:Oidc:{Autoridade, IdCliente, SegredoCliente, Escopos, CaminhoRetorno}`, com escopos padrão `openid profile`.<br>• Sem `Autoridade`, o esquema OIDC **não é registrado** e `GET /api/v1/autenticacao/entrar` responde 503: a API sobe e ninguém entra (falha fechada).<br>• `SegredoCliente` só por user-secrets ou variável de ambiente | Código ou pacote de um provedor específico | Decisão do usuário; teste e grep provam a ausência de host de provedor (AC-8). Segredo × `private_key_jwt`: Segurança |
| **Validação do token:** emissor dos metadados, audiência = `IdCliente`, assinatura pelo JWKS, validade, `nonce` e `state`. `RequireHttpsMetadata = true` **sempre**; nos testes, o IdP em memória responde em `https://idp.teste` por `BackchannelHttpHandler` | Desligar HTTPS em teste | Nenhum código de teste em produção |
| **Usuário provisionado no 1º login (JIT)** por (`iss` **validado** do token, `sub`):<br>• upsert `INSERT ... ON CONFLICT (emissor, sujeito) DO UPDATE SET ultimo_acesso_em, nome_exibicao ... RETURNING id`, por `SqlQuery<Guid>` **interpolado** (conferir o nome da coluna escalar no EF 10);<br>• **nunca** toca em `desativado_em`: o login não reativa conta;<br>• sem normalizar a caixa do `sub`;<br>• do token só se guarda `name` → `nome_exibicao`; **o e-mail não é guardado** | Guardar o e-mail; normalizar o `sub` | Minimização (RNF-02.3, LGPD). O `sub` diferencia maiúsculas (OIDC Core §2). Guardar o `iss` validado evita usuário duplicado por diferença de barra final (parecer, ajuste 9) |
| Sem vínculo de contas: o mesmo `sub` vindo de emissores diferentes gera usuários diferentes | Juntar contas pelo e-mail | Risco de tomada de conta [doc: https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html] |
| **Redirecionamento pós-login** (`?retorno=`): só caminho local. Começa com `/`, não com `//` nem `/\`, e tem até 2048 caracteres; senão vai para `/` | Lista de origens absolutas | Evita redirecionamento aberto [doc: https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html] |
| **API responde 401, nunca 302.** `DefaultChallengeScheme` = cookie, com `OnRedirectToLogin` → 401 e `OnRedirectToAccessDenied` → 403, ambos em ProblemDetails. Só `GET /entrar` desafia o OIDC | OIDC como desafio padrão | Um cliente `fetch` não segue login por redirecionamento |
| **Logout local:** `POST /api/v1/autenticacao/sair` encerra a sessão no servidor e apaga o cookie | Logout iniciado no provedor | Exige guardar o `id_token`. Fica pendente com a Segurança |

### 3.3 Sessão (G3 = (a))
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Sessão registrada no servidor:** tabela `sessao`. O cookie, cifrado e autenticado pelo Data Protection, carrega só `sid` e `usuario_id`. A cada requisição, `OnValidatePrincipal` faz **uma** consulta: sessão aberta e não vencida, usuário ativo e vínculo com a empresa ativa. Se falhar, `RejectPrincipal` e o cookie é apagado | (b) ticket inteiro no cookie + `versao_sessao`; (c) só cookie | Logout e desativação valem no servidor [doc: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html ; ASVS 5.0 V7] |
| **Empresa ativa em `sessao.empresa_ativa_id`**, com FK composta `(empresa_ativa_id, usuario_id) → membro_empresa(empresa_id, usuario_id)`, na ordem da PK | Claim no cookie | O banco garante que a empresa ativa é uma das do usuário. A checagem de FK ignora o RLS |
| **Tempos:**<br>• a inatividade (deslizante, padrão **30 min**) fica **só no ticket do cookie**;<br>• o banco guarda o prazo absoluto `expira_em` (padrão **8 h**) e o encerramento;<br>• sem `ultima_atividade_em`;<br>• instantes vêm do `TimeProvider` e vão como **parâmetro** (não `now()` do banco);<br>• configuração em `Autenticacao:Sessao:*` | Gravar atividade a cada requisição | Evita uma escrita por requisição. Consequência registrada: um cookie roubado e em uso continua deslizando até o teto de 8 h; a revogação vale na requisição seguinte [opinião; parecer §6] |
| **`sessao.id` = uuid v4 gerado por CSPRNG** (`RandomNumberGenerator`, 16 bytes, com os bits de versão e variante ajustados). É exceção à regra do v7, registrada no ADR 00004 | `Guid.NewGuid()`; v7 | É identificador de segurança. A documentação não promete aleatoriedade criptográfica do `NewGuid`, e o v7 carrega o instante [opinião; parecer, ajuste 8] |
| **Retenção:** limpeza oportunista no login. Apaga só as sessões **do próprio usuário** terminadas (`expira_em` ou `encerrada_em`) há mais de `Autenticacao:Sessao:RetencaoDias`, padrão **30 dias**. Passa pelo RLS. A limpeza em lote e o índice `(expira_em)` ficam para o 00023 | Job agora | Sem jobs até a Fase 3. O prazo final é do Jurídico |
| **Cookie** `__Host-cronoai-sessao`: `HttpOnly`, `Secure` (`SecurePolicy.Always`), `SameSite=Lax`, `Path=/`, sem `Domain`. Antiforgery em `__Host-cronoai-af` | `SameSite=Strict` | O retorno do provedor é navegação entre sites [doc: https://learn.microsoft.com/aspnet/core/security/authentication/cookie] |
| **Escolha da empresa ao entrar** (RF-01.1a):<br>• um vínculo → ela já fica ativa;<br>• vários → ativa vazia até o `PUT`;<br>• nenhum → `empresas: []` | Sempre exigir a escolha | Atalho para o caso comum [opinião] |

### 3.4 Usuário de desenvolvimento e semente
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Dois interruptores:** `Development` **e** `Autenticacao:UsuarioDesenvolvimento:Habilitado=true`. A flag não fica em nenhum `appsettings*.json` versionado: vem de user-secrets ou de variável de ambiente | Flag no `appsettings.Development.json` | Um servidor subido por engano em `Development` não ganha login falso sem um segundo ato |
| **Falha fechada na partida:** `ValidateOnStart()` [doc: https://learn.microsoft.com/dotnet/core/extensions/options#options-validation].<br>• Com a flag fora de `Development`, o host lança `OptionsValidationException` e **não sobe**.<br>• A rota só é mapeada com os dois interruptores | Só não mapear a rota | Decisão do usuário |
| **Mesmo caminho do login real:**<br>• `POST /api/v1/autenticacao/desenvolvimento/entrar` com `{ "usuario": "dev-a" \| "dev-b" }` chama o mesmo `ServicoLogin`;<br>• emissor reservado `urn:cronoai:desenvolvimento`, nomes fictícios;<br>• fora do OpenAPI;<br>• isento de antiforgery, com justificativa: só existe em `Development` | Esquema de autenticação paralelo | Uma porta só. Dois usuários servem ao E2E do 00019 |
| Sessão com emissor reservado é **recusada fora de `Development`** | Confiar no anel diferente | Defesa em profundidade |
| **Semente** `dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento`:<br>• recusa fora de `Development`; conecta como `cronoai_app`, **nunca** como superusuário;<br>• cria os usuários de desenvolvimento pelo **mesmo upsert do login** (emissor reservado), antes dos vínculos;<br>• três empresas com **ids fixos fictícios** (constantes no código): "Construtora Fictícia A", "Construtora Fictícia B" e "Construtora Fictícia Compartilhada";<br>• `INSERT ... ON CONFLICT (id) DO NOTHING` e `ON CONFLICT (empresa_id, usuario_id) DO NOTHING`, **um `DbContext` por empresa**, com `empresa_id` = id dela | Semear no login ou em migração; ler para decidir se insere | ADR 00004 (seed só por comando). Sob RLS, a leitura exigiria contexto; o `DO NOTHING` só precisa da política de INSERT (parecer, ajuste 6) |

### 3.5 Isolamento (ADR 00006): coluna + filtro do EF + RLS + teste de rotas
**Decisão:** as três camadas mais o teste de rotas. Fontes:
- [doc PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [doc EF Core multitenancy](https://learn.microsoft.com/ef/core/miscellaneous/multitenancy)
- [OWASP IDOR Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)
- pareceres do `dba` (00011 §2; 00012 §1-§4)

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Empresa ativa só da sessão**, nunca do corpo nem da URL | Cabeçalho `X-Empresa` | PLANO-FASE-2 §8.3 |
| **Contexto do banco imutável por `DbContext`:**<br>• o record `ContextoSessaoBanco(Guid? UsuarioId, Guid? EmpresaId)` (Dados) entra **no construtor** do `CronoDbContext`;<br>• `IFabricaCronoDbContext.Criar(ContextoSessaoBanco)` cria os contextos;<br>• o `CronoDbContext` scoped dos endpoints é criado pela fábrica a partir do `ContextoSessao` da requisição (Api), que é **preenchido uma vez só** pelo validador (uma segunda atribuição lança exceção);<br>• o validador e os fluxos de identidade **nunca** resolvem o contexto scoped: usam a fábrica | `ContextoSessao` scoped e mutável lido pelo interceptor | Com contexto mutável, uma conexão aberta antes da mudança ficaria com variáveis velhas (parecer §1, condição 3). Se algo resolver o contexto scoped antes da validação, ele nasce vazio: zero linhas, nunca vazamento |
| **Filtro global nomeado `"Empresa"`:**<br>• aplicado automaticamente a todo `IDadoDeEmpresa`, com `EmpresaId == ContextoBanco.EmpresaId`;<br>• sem empresa, nenhuma linha;<br>• desligar só com `IgnoreQueryFilters(["Empresa"])` (conferir a assinatura no EF Core 10) [doc: https://learn.microsoft.com/ef/core/querying/filters].<br>Neste ciclo, só `MembroEmpresa` implementa a interface. `Empresa` e `Sessao` ficam só com RLS e são consultadas por id explícito | Filtro manual por entidade | Entidade nova com `EmpresaId` fica coberta automaticamente (teste de arquitetura) |
| **Interceptor singleton** (`ConnectionOpened`/`ConnectionOpenedAsync`) lê `((CronoDbContext)eventData.Context).ContextoBanco` (conferir que o `ConnectionEndEventData` expõe o contexto).<br>• Executa, em **toda** abertura, um `SELECT` com `set_config('app.usuario_id', @u, false)` e `set_config('app.empresa_id', @e, false)`.<br>• As duas variáveis são **sempre sobrescritas**, inclusive com texto vazio quando não há contexto.<br>• Os valores vão como parâmetros (guid em minúsculas ou vazio); os nomes são constantes do código.<br>[doc: https://learn.microsoft.com/ef/core/logging-events-diagnostics/interceptors ; https://www.postgresql.org/docs/current/functions-admin.html#FUNCTIONS-ADMIN-SET] | Pular o comando com contexto vazio; `set_config(..., true)` por transação | Com a sobrescrita, o vazamento pelo pool não depende do reset do Npgsql. O `DISCARD ALL` do reset vira a segunda rede ([doc](https://www.postgresql.org/docs/current/sql-discard.html)). O modo por transação exigiria transação em toda leitura (parecer §1) |
| **Guarda de partida:** a API recusa subir se `ConnectionStrings:Cronoai` tiver `No Reset On Close=true` (`NpgsqlConnectionStringBuilder.NoResetOnClose`) [doc: https://www.npgsql.org/doc/connection-string-parameters.html] | Confiar no padrão | Tira a segunda rede de forma silenciosa |
| **Toda conexão passa pelo interceptor:** a regra **R17** proíbe `NpgsqlConnection` e `NpgsqlDataSource` em `server/src/**`, exceto no design-time. `NpgsqlConnectionStringBuilder` é permitido | Conexão crua para "consulta rápida" | Conexão fora do EF não seta as variáveis (parecer §1.2, item 6) |
| **RLS com `ENABLE` + `FORCE`.**<br>• Políticas **`TO cronoai_app`**, **uma por comando** (nada de `FOR ALL`), com `WITH CHECK` explícito em INSERT e UPDATE.<br>• Leitura das variáveis por subconsulta escalar `(SELECT NULLIF(current_setting(nome, true), '')::uuid)`.<br>• Helper único em `CronoAI.Dados/Rls/` [doc: https://www.postgresql.org/docs/current/sql-createpolicy.html] | Só o filtro do EF; `FOR ALL`; política sem `TO` | Comando sem política fica negado. Um papel novo nasce sem acesso. Política para o migrador é **proibida**: anularia o `FORCE` |
| **Políticas** (tabela completa no §07):<br>• `empresa`: SELECT, INSERT;<br>• `membro_empresa`: SELECT, INSERT;<br>• `sessao`: SELECT, INSERT, UPDATE, DELETE por `usuario_id`.<br>**Nenhuma** política de UPDATE/DELETE em `empresa` e `membro_empresa` | Políticas para o futuro | Menor privilégio do ciclo; o 00013 e o 00014 concedem o que usarem |
| **`FORCE` mantido.** Consequências:<br>• o dono (`cronoai_migrador`) também vê zero linhas: teste `Dono_tambem_se_sujeita_ao_rls`;<br>• DML de migração em tabela com RLS afetaria zero linhas **sem erro**. Por isso, toda migração de dados usa o helper `Rls/MigracaoDeDadosRls`, que, na transação da migração, faz `ALTER TABLE ... NO FORCE ROW LEVEL SECURITY` → DML (com filtro explícito por empresa no SQL) → `FORCE` de novo.<br>A **R15** acusa DML em `Migrations/` fora do helper | Tirar o `FORCE`; política para o migrador; setar `app.*` na migração | Como as políticas são `TO cronoai_app`, setar a variável não basta para o migrador. A alternância dentro da transação é a outra via do parecer (§2.1). Como a DDL é transacional, um erro desfaz também o `NO FORCE` |
| **`usuario` fora do RLS, aceito com condições** (parecer §3):<br>• teste de arquitetura limita o acesso a `DbSet<Usuario>` (`.Usuarios` e `Set<Usuario>`) a `ConsultasIdentidade.cs` e à semente;<br>• colunas mínimas;<br>• `REVOKE DELETE`;<br>• **reavaliar no 00014** (listagem de membros).<br>`__ef_migrations_history` também fica fora do RLS, sem privilégio nenhum para o `cronoai_app` | RLS em `usuario` agora | O upsert do login e a busca por (`emissor`, `sujeito`) acontecem antes de existir `usuario_id`. **Risco residual registrado no ADR 00006:** o `cronoai_app` lê usuários de todas as empresas; só o código protege essa tabela |
| **Lista permitida de `IgnoreQueryFilters`:** só `CronoAI.Dados/Identidade/ConsultasIdentidade.cs`, sempre com filtro explícito por `UsuarioId` (**R16**) | Proibir sem exceção | A validação de sessão lê o vínculo antes de a empresa estar no contexto |
| **Mapeamento de erros:**<br>• recurso de outra empresa → **404**, com corpo idêntico ao de "não existe";<br>• sem empresa ativa → 403 (`empresa-ativa-necessaria`);<br>• `42501` em INSERT → 500 genérico (é bug de servidor), com log sem dado pessoal.<br>**Regra para o 00013 no ADR 00006:** um `UPDATE` de outra empresa afeta zero linhas sob RLS e vira `DbUpdateConcurrencyException`, que daria 409. Por isso, **carregar pelo caminho filtrado antes** (404 se ausente) e só então atualizar | 403 para recurso alheio | O 403 revela que o recurso existe; o 409 seria enganoso (parecer §7) |
| **Fallback de autorização = autenticado.** Política `EmpresaAtiva` nas rotas de dado de empresa; rotas anônimas só com `AllowAnonymous()` e na lista do teste [doc: https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/security] | Marcação rota a rota | Quem esquece a marcação ganha 401, não exposição |
| **Limite honesto no ADR 00006:** a variável de sessão **não é segredo**. Quem tem a credencial do `cronoai_app` e executa SQL livre escolhe a empresa. O RLS protege contra filtro esquecido e erro de código, não contra quem já executa SQL | — | Parecer §1 |

### 3.6 Teste genérico de isolamento (E3)
- **Fonte:** `EndpointDataSource` do host de teste (`RouteEndpoint` + `HttpMethodMetadata`) [doc: https://learn.microsoft.com/aspnet/core/fundamentals/routing]. O retorno do OIDC é caminho de middleware, não endpoint, e tem testes próprios.
- **Catálogo versionado** (`Isolamento/CatalogoRotas.cs`): cada `MÉTODO padrão` tem um cenário (`Anonima`, `SemRecurso`, `ComIdDeOutraEmpresa` ou `DesenvolvimentoApenas`). O teste reprova:
  1. rota fora do catálogo;
  2. rota do catálogo que não existe mais;
  3. rota anônima fora da lista (`/health/live`, `/health/ready`, `/openapi/v1.json` em `Development`, `GET /api/v1/autenticacao/entrar` e a rota de desenvolvimento);
  4. rota não anônima que não responda 401 sem sessão;
  5. escrita sem antiforgery, salvo a rota de desenvolvimento;
  6. cenário entre empresas que não dê 404, ou corpo que contenha um marcador da empresa B.
- **Meta-teste:** um host separado injeta, por `IStartupFilter`, a rota `/api/v1/__teste/sem-cenario`, e o detector precisa acusá-la. A rota de erro proposital do teste de pool (§11) também fica em host separado, fora do catálogo.
- Nos ciclos seguintes, cada rota com `{id}` ganha um cenário `ComIdDeOutraEmpresa`.

### 3.7 Borda
| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| **Data Protection:**<br>• `SetApplicationName("CronoAI")`;<br>• em `Development`, `PersistKeysToFileSystem` em `DataProtection:CaminhoAnel`, com padrão fora do repositório (`%LOCALAPPDATA%/CronoAI/chaves`);<br>• **fora de `Development` sem `CaminhoAnel`, a API não sobe**;<br>• testes usam pasta temporária<br>[doc: https://learn.microsoft.com/aspnet/core/security/data-protection/configuration/overview] | Chaves efêmeras | Reiniciar derrubaria as sessões. A guarda do anel em produção é da Infra |
| `AllowedHosts` = `localhost;127.0.0.1;[::1]`; produção por variável de ambiente (Infra) [doc: https://learn.microsoft.com/aspnet/core/fundamentals/servers/kestrel/host-filtering] | `*` | Pendência do 00011 |
| **Rate limiting** por IP, janela fixa, 429 em ProblemDetails com `Retry-After`:<br>• `autenticacao` (padrão 10/min): `entrar`, desenvolvimento e `sair`;<br>• limitador global no caminho de retorno do OIDC;<br>• `saude` (padrão 60/min): `/health/ready`.<br>`UseRateLimiter` antes de `UseAuthentication` [doc: https://learn.microsoft.com/aspnet/core/performance/rate-limit] | Sem limite até o 00023 | RF-12.5. Atrás de proxy depende de `ForwardedHeaders` (Infra) |
| **Antiforgery** nas escritas autenticadas: `GET /api/v1/autenticacao/antiforgery` + cabeçalho `X-XSRF-TOKEN` + filtro com `IAntiforgery.ValidateRequestAsync` [doc: https://learn.microsoft.com/aspnet/core/security/anti-request-forgery] | Só `SameSite` | Defesa em profundidade [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) |
| **Sem CORS** | Liberar a origem do Vite | Mesma origem (PLANO-FASE-2 §3) |
| `IdentityModelEventSource.ShowPII` = `false`; `Microsoft.IdentityModel` em `Warning` | — | Evita token e claims em log |

### 3.8 IdP de teste (G1 = (a))
| Opção | Custo | Risco | Licença |
|---|---|---|---|
| **(a) Emissor OIDC em memória — escolhida.** `TestServer` com:<br>• `/.well-known/openid-configuration`, `/jwks`, `/authorize`, `/token`;<br>• chave RSA gerada por execução;<br>• assinatura com `JsonWebTokenHandler` (transitivo do pacote OIDC);<br>• conferência de PKCE S256, cliente e `redirect_uri`;<br>• chaves de "mau comportamento" para os testes negativos | ~250 linhas de teste; sem imagem nem rede | Pode ser mais permissivo que um provedor real. Mitigação: testes negativos + fumaça com o provedor real (Segurança) | Nada novo (se a CPM exigir referência direta, `Microsoft.IdentityModel.JsonWebTokens`, MIT) |
| (b) Keycloak via Testcontainers | Imagem grande, partida lenta, raspagem de HTML | T7, revisão da Segurança, instabilidade | MIT / Apache-2.0 |
| (c) Só o usuário de desenvolvimento | Mínimo | OIDC sem prova automática | — |

Descartadas: Duende IdentityServer (licença comercial) e OpenIddict (dependência maior, sem ganho nos negativos) [opinião].

### 3.9 Sequência dos fluxos de identidade (parecer §1.1)
Cada passo usa um `CronoDbContext` próprio, criado pela fábrica com o contexto indicado. Nenhum usa o contexto scoped da requisição.

| Passo | Contexto do banco | Por quê |
|---|---|---|
| 1. Upsert do usuário no login (OIDC ou desenvolvimento) | nenhum (`usuario` sem RLS) | `ON CONFLICT DO UPDATE` sob RLS exigiria políticas de SELECT e UPDATE |
| 2. Limpeza oportunista das sessões do usuário | `usuario_id` do passo 1 | Política de DELETE de `sessao` |
| 3. Criar a `sessao` | `usuario_id` | Política de INSERT (`WITH CHECK usuario_id = U`) |
| 4. "Minhas empresas" e empresa ativa automática (um vínculo) | `usuario_id` | Políticas de `membro_empresa`/`empresa` por membro |
| 5. Gravar `empresa_ativa_id` (login ou `PUT /empresas/atual`) | `usuario_id` | A FK composta confere o vínculo; ela ignora o RLS |
| 6. Validação por requisição | `usuario_id` do cookie (autenticado pelo Data Protection), sem empresa | Sem o `usuario_id` no contexto, a leitura de `sessao` daria zero linhas |
| 7. Endpoint de dado | `usuario_id` + `empresa_ativa_id` lidos no passo 6, fixados no `ContextoSessao` | Filtro do EF + RLS |

## 04. Caso de referência (T1/T2)
Não se aplica — sem cálculo.

## 05. MS Project e arquivos (T3)
Não se aplica — sem MSPDI nem arquivo.

## 06. Estado salvo (T4)
Não se aplica — `src/` não muda.

## 07. Dados (T8 com banco)
Parecer do `dba`: **`00012-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, ajustes aplicados** (seção 16). O modelo abaixo é o revisado.

| Tabela | Colunas (tipo, nulidade) | Chaves e restrições | RLS |
|---|---|---|---|
| `usuario` | `id uuid` (v7)<br>`emissor text NOT NULL`, `CHECK char_length BETWEEN 1 AND 2048`, com o `iss` validado<br>`sujeito text NOT NULL`, `CHECK char_length BETWEEN 1 AND 255`, sem normalizar caixa<br>`nome_exibicao text NULL`, `<= 200`<br>`criado_em timestamptz NOT NULL`<br>`ultimo_acesso_em timestamptz NOT NULL`<br>`desativado_em timestamptz NULL` | PK `id`; `UNIQUE (emissor, sujeito)` | **Não** (§3.5, com condições) |
| `empresa` | `id uuid` (v7)<br>`nome text NOT NULL`, `CHECK char_length BETWEEN 1 AND 200`<br>`criada_em timestamptz NOT NULL` | PK `id`. **Sem `cnpj`** (minimização; emenda da SPEC-01 §5 no E4) | Sim, `FORCE` |
| `membro_empresa` | `empresa_id uuid NOT NULL`<br>`usuario_id uuid NOT NULL`<br>`criado_em timestamptz NOT NULL` | PK `(empresa_id, usuario_id)`; FKs `RESTRICT`; índice `(usuario_id)` | Sim, `FORCE` |
| `sessao` | `id uuid` (v4 por CSPRNG)<br>`usuario_id uuid NOT NULL`<br>`empresa_ativa_id uuid NULL`<br>`criada_em timestamptz NOT NULL`<br>`expira_em timestamptz NOT NULL`<br>`encerrada_em timestamptz NULL` | PK `id`; FK `usuario_id → usuario` `RESTRICT`; FK composta `(empresa_ativa_id, usuario_id) → membro_empresa(empresa_id, usuario_id)` `RESTRICT`, `MATCH SIMPLE` (nulo não confere); `CHECK (expira_em > criada_em)`; `CHECK (encerrada_em IS NULL OR encerrada_em >= criada_em)`; índice `(usuario_id)` | Sim, `FORCE` |

**Privilégios e políticas.** `U` e `E` = `(SELECT NULLIF(current_setting('app.usuario_id' | 'app.empresa_id', true), '')::uuid)`. As políticas são todas `TO cronoai_app`, com `ENABLE` + `FORCE`.

| Tabela | Privilégios do `cronoai_app` (migração `IdentidadeEmpresas`) | Políticas |
|---|---|---|
| `usuario` | SELECT, INSERT, UPDATE. `REVOKE DELETE` | — (sem RLS) |
| `empresa` | SELECT, INSERT. `REVOKE UPDATE, DELETE` | SELECT `USING (id = E OR EXISTS (SELECT 1 FROM cronoai.membro_empresa m WHERE m.empresa_id = empresa.id AND m.usuario_id = U))`; INSERT `WITH CHECK (id = E)` |
| `membro_empresa` | SELECT, INSERT. `REVOKE UPDATE, DELETE` | SELECT `USING (usuario_id = U OR empresa_id = E)`; INSERT `WITH CHECK (empresa_id = E)` |
| `sessao` | SELECT, INSERT, UPDATE, DELETE (o DELETE serve só à limpeza oportunista) | SELECT `USING (usuario_id = U)`; INSERT `WITH CHECK (usuario_id = U)`; UPDATE `USING (usuario_id = U) WITH CHECK (usuario_id = U)`; DELETE `USING (usuario_id = U)` |
| `__ef_migrations_history` | nenhum (conferir com teste: o histórico nasce antes dos privilégios padrão do `Inicial`) | — |

- **Subconsulta da política de `empresa`:** é avaliada com o RLS de `membro_empresa` e não tem recursão (parecer §4, pergunta 6).
- **Exposição aceita:** um membro vê os `usuario_id` dos colegas da empresa ativa. Nenhum endpoint do 00012 os lista; o 00014 decide por perfil.
- **Opcional futuro [opinião do `dba`]:** trocar o `ALTER DEFAULT PRIVILEGES` por concessão explícita por tabela.
- **Migração `IdentidadeEmpresas`** contém:
  - as quatro tabelas;
  - RLS e políticas pelo helper;
  - os `REVOKE` acima.
- **Sem migração de dados** neste ciclo. O helper `MigracaoDeDadosRls` nasce já, com teste, para a regra valer desde a primeira migração de dados.
- **Consultas previstas** (todas pelo EF ou com `FromSql`/`SqlQuery` interpolados):
  - upsert com `RETURNING id`;
  - validação de sessão: uma consulta com `JOIN` de `sessao`, `usuario` e `membro_empresa` por `sid`;
  - "minhas empresas": `membro_empresa` ⋈ `empresa` por `usuario_id`;
  - troca da empresa ativa: `UPDATE sessao`;
  - limpeza: `DELETE FROM sessao WHERE usuario_id = U AND (expira_em < corte OR encerrada_em < corte)`.
- **Índices:** PKs, `UNIQUE`, `(usuario_id)` em `membro_empresa` e em `sessao`. Nada extra antes de medir; `(expira_em)` entra no 00023 com a limpeza em lote.
- **Convenções:**
  - `Restrict` por último, com teste no modelo e no catálogo;
  - nomes até 63 bytes, inclusive políticas;
  - `HasPrecision` obrigatório.
- **Notas para os próximos ciclos** (vão no ADR 00006):
  - **00013:** carregar antes de atualizar. Um `UPDATE` de outra empresa sob RLS vira `DbUpdateConcurrencyException`; o certo é 404, não 409.
  - **00014, remoção de membro:** a política de `sessao` por usuário impede o administrador de encerrar ou anular a sessão de **outro** usuário, e a FK composta é `RESTRICT`. Vai precisar de política (ex.: UPDATE de `sessao` com `empresa_ativa_id = E`) ou de `ON DELETE SET NULL (empresa_ativa_id)` (PostgreSQL 15+; conferir se o EF exprime isso).
  - **00014, `usuario`:** reavaliar a tabela sob RLS ("o próprio ou membro da empresa ativa"), com variáveis de login.
  - **00023:** limpeza de `sessao` em lote, com papel ou política próprios (nunca `BYPASSRLS`), e índice `(expira_em)`. O `pg_dump` de backup local precisa do papel de bootstrap ou de `--enable-row-security`.

## 08. Segurança
**Superfície nova:**
- quatro rotas autenticadas e duas anônimas de login;
- o retorno do OIDC (middleware);
- os cookies de sessão e de antiforgery;
- o token externo;
- dado pessoal (`nome_exibicao` e o par emissor + `sub`);
- RLS;
- a dependência nova.

| Ameaça | Mitigação | Teste |
|---|---|---|
| IDOR / vazamento entre empresas | Empresa da sessão, filtro do EF, RLS `FORCE` `TO cronoai_app`, 404 | E3; `RlsTestes` |
| Vazamento pelo pool de conexões | Sobrescrita das duas variáveis em toda abertura; contexto imutável; guarda de `No Reset On Close`; R17 | `PoolRlsTestes` (6 testes) |
| Filtro esquecido em migração de dados | Helper `NO FORCE`/`FORCE` na transação; R15 | `Helper_de_migracao_de_dados_*` |
| Token forjado ou reaproveitado | JWKS, `iss`, `aud`, `exp`, `nonce`, `state`, PKCE | `OidcNegativosTestes` |
| Fixação ou roubo de sessão | Sessão nova por login; cookie `__Host-`; revogação no servidor; teto de 8 h | AC-6, AC-10 |
| CSRF | `SameSite=Lax` + antiforgery | AC-11, E3 |
| Login falso fora do local | Dois interruptores, `ValidateOnStart`, recusa do emissor reservado | AC-9 |
| Reativação de conta desativada pelo login | Upsert sem tocar `desativado_em` | `Login_nao_reativa_usuario_desativado` |
| Redirecionamento aberto | Só caminho local | S-5 |
| Força bruta / DoS | Rate limiting | AC-13 |
| Host header | `AllowedHosts` | AC-13 |
| Dado pessoal em log | Só `usuario_id`; `ShowPII=false` | AC-15 |
| Leitura de usuários entre empresas | Acesso a `DbSet<Usuario>` restrito por teste; reavaliação no 00014 | `Usuario_so_e_acessado_em_identidade_e_semente` |
| Teste que passa por engano | Testes de banco como `cronoai_app`; controle negativo do pool | S-8; `Sem_sobrescrita_e_sem_reset_o_valor_vaza` |

**Dependências novas** (revisão de segurança e de licença antes de produção; o NuGet Audit bloqueia alta e crítica):

| Pacote | Onde | Licença | Observação |
|---|---|---|---|
| `Microsoft.AspNetCore.Authentication.OpenIdConnect` 10.0.x (linha dos `Microsoft.*` 10.0.13) | `CronoAI.Api` | MIT | Fora do shared framework |
| Transitivas: `Microsoft.IdentityModel.Protocols.OpenIdConnect`, `.Protocols`, `.Tokens`, `.JsonWebTokens`, `.Logging`, `.Abstractions` e, se vier, `System.IdentityModel.Tokens.Jwt` | via o pacote acima | MIT | Versões a registrar pelos *lock files*. A família já teve aviso de segurança: `--vulnerable --include-transitive` na matriz (S-2) |
| Cookies, Antiforgery, RateLimiting, Data Protection, HostFiltering | shared framework | MIT | Sem pacote |

**ASVS 5.0.0.** A numeração dos itens será conferida na tag `v5.0.0`; nenhum número de requisito foi inventado aqui.
- **V6:** autenticação delegada; sem senha local; MFA do provedor.
- **V7:** cookie `__Host-`, inatividade e teto, encerramento no servidor, sessão nova no login, retenção.
- **V8:** fallback autenticado, `EmpresaAtiva`, 404 entre empresas, RLS, teste de rotas.
- **V9:** `id_token` validado (assinatura, `alg`, `iss`, `aud`, `exp`) e descartado.
- **V10:** código + PKCE S256, `state`/`nonce`, cliente confidencial, `redirect_uri` exata.

## 09. Entregáveis
| # | Entregável | Fronteira | Critérios de aceite | Commit |
|---|---|---|---|---|
| E1 | Domínio e dados:<br>• `CronoAI.Dominio` e as entidades;<br>• contexto imutável, fábrica, filtro nomeado, `Restrict` por último;<br>• interceptor, guarda de `No Reset On Close`, helpers de RLS e de migração de dados;<br>• `ConsultasIdentidade`;<br>• migração `IdentidadeEmpresas`;<br>• testes de catálogo, RLS, pool e arquitetura | `server/src/CronoAI.Dominio/**`, `server/src/CronoAI.Dados/**`, `server/CronoAI.slnx`, `server/tests/.../{Dominio,Dados}/**`, `ArquiteturaTestes.cs`, `Infra/DadosTeste.cs` | AC-1 (parcial), AC-2 a AC-5, AC-19, R-1 a R-5 | `feat(server): empresas, usuários e sessões com RLS e filtro por empresa` |
| E2 | Autenticação e sessão:<br>• borda (Data Protection, hosts, rate limiting);<br>• cookie, OIDC genérico, usuário de desenvolvimento, semente;<br>• `/eu`, `/empresas/atual`, antiforgery;<br>• IdP de teste;<br>• OpenAPI regenerado | `server/src/CronoAI.Api/**`, `server/Directory.Packages.props`, `packages.lock.json`, `server/openapi/CronoAI.Api.json`, `server/tests/.../{Autenticacao,Empresas,Infra}/**`, `ConfiguracaoTestes.cs`, `CabecalhosTestes.cs` | AC-1, AC-6 a AC-11, AC-13 a AC-15, S-1 a S-9 | `feat(server): login OIDC genérico, sessão em cookie e usuário de desenvolvimento local` |
| E3 | Teste genérico de isolamento, meta-teste, concorrência e erro no nível da API | `server/tests/.../Isolamento/**` | AC-12 | `test(server): isolamento entre empresas em toda rota registrada` |
| E4 | Processo e documentação:<br>• regras R14 a R17 e `.cs` de `server/src/**` mapeado, com testes;<br>• ADRs 00005 e 00006 e ajustes no ADR 00004;<br>• emenda da SPEC-01 §5;<br>• documentação | `.claude/scripts/lib/regras-cronoai.mjs`, `regras-cronoai.test.mjs`, `.claude/adrs/**`, `.claude/rules/backend-dotnet.md`, `.claude/checklists/seguranca.md`, `CLAUDE.md`, `server/README.md`, `docs/specs/SPEC-01-arquitetura-backend.md` (§5, nota) | AC-16, AC-17 | `docs(processo): ADRs de autenticação e isolamento e regras de .NET no validar-regras` |

Cerca de 65 arquivos, dos quais ~8 gerados. Cada entregável passa sozinho em `dotnet build -c Release`, `dotnet test` e `npm run ci`. Dependências entre entregáveis:
- o E3 depende do E2;
- o E4 corre em paralelo depois do E1.

## 10. Tarefas
| # | E | Tarefa | Agente | Arquivos | Depende de |
|---|---|---|---|---|---|
| 0 | — | **Feita:** levantamento do modelo. `00012-tarefa0-dba.md`, `VEREDITO: AJUSTAR`, 10 ajustes aplicados na emenda 01 (seção 16) | dba (leitura) | — | — |
| 1 | E1 | `CronoAI.Dominio`:<br>• `.csproj` sem pacotes, `.slnx`, referência `Dados → Dominio`;<br>• entidades com fábricas: `Guid.CreateVersion7()` em geral; `Sessao` com id v4 de `RandomNumberGenerator`, recebendo os instantes como argumento;<br>• `IDadoDeEmpresa` | dev-backend | `server/src/CronoAI.Dominio/**`, `server/CronoAI.slnx`, `CronoAI.Dados.csproj` | gate |
| 2 | E1 | `CronoAI.Dados`:<br>• `ContextoSessaoBanco` (record) e `IFabricaCronoDbContext`;<br>• `CronoDbContext(options, ContextoSessaoBanco)` com a propriedade `ContextoBanco`;<br>• uma `IEntityTypeConfiguration` por entidade (tipos, `CHECK`s do §07, índices, FK composta na ordem da PK, `ValueGeneratedNever`);<br>• filtro `"Empresa"` automático;<br>• **último passo:** `Restrict` em toda FK;<br>• constantes `app.*` em `PapeisBanco` | dev-backend | `CronoDbContext.cs`, `ContextoSessaoBanco.cs`, `FabricaCronoDbContext.cs`, `Configuracoes/*.cs`, `PapeisBanco.cs` | 1 |
| 3 | E1 | RLS:<br>• `Rls/MigrationBuilderRlsExtensoes.cs`: `ENABLE` + `FORCE` e políticas por comando `TO cronoai_app` com `WITH CHECK`;<br>• `Rls/MigracaoDeDadosRls.cs`: `NO FORCE` → DML → `FORCE` na transação;<br>• `Rls/ContextoSessaoInterceptor.cs`: singleton; sobrescreve **sempre** as duas variáveis; parâmetros; síncrono e assíncrono;<br>• registro em `CronoDbContextConfiguracao`; design-time com contexto vazio | dev-backend | `Rls/*.cs`, `CronoDbContextConfiguracao.cs`, `CronoDbContextDesignTimeFactory.cs` | 2 |
| 4 | E1 | `Identidade/ConsultasIdentidade.cs`, único arquivo com `IgnoreQueryFilters(["Empresa"])` e com acesso a `DbSet<Usuario>` fora da semente:<br>• upsert `ON CONFLICT ... DO UPDATE ... RETURNING id`, sem tocar `desativado_em`;<br>• validação de sessão em uma consulta;<br>• "minhas empresas";<br>• limpeza oportunista | dev-backend | `Identidade/ConsultasIdentidade.cs` | 3 |
| 5 | E1 | `dotnet ef migrations add IdentidadeEmpresas` (string do migrador), com o helper de RLS e os `REVOKE` do §07. `has-pending-model-changes` limpo | dev-backend | `Migrations/*_IdentidadeEmpresas*.cs`, snapshot | 3 |
| — | E1 | **Checkpoint:** o orquestrador confere a migração contra o §07: políticas, `TO`, `WITH CHECK`, `FORCE`, `REVOKE`, `CHECK`s e FK composta | orquestrador | — | 5 |
| 6 | E1 | Testes E1 (seção 11: `Dados/`, `Dominio/`, arquitetura, pool). `Infra/DadosTeste.cs` cria dados como `cronoai_app`, pela fábrica, com contexto | dev-backend | `server/tests/.../{Dominio,Dados}/**`, `ArquiteturaTestes.cs`, `Infra/DadosTeste.cs` | 4, 5 |
| 7 | E2 | Borda:<br>• Data Protection com `ValidateOnStart`;<br>• **guarda de `No Reset On Close`**;<br>• `AllowedHosts`;<br>• rate limiter;<br>• ordem do pipeline preservando os headers | dev-backend | `Program.cs`, `Borda/*.cs`, `appsettings.json` | E1 |
| 8 | E2 | Cookie e sessão:<br>• esquema `__Host-cronoai-sessao`;<br>• eventos 401/403;<br>• `ValidadorSessao` em `OnValidatePrincipal`, pela fábrica com o `usuario_id` do cookie (passo 6 do §3.9);<br>• `ContextoSessao` preenchido uma vez;<br>• `CronoDbContext` scoped criado pela fábrica a partir dele;<br>• políticas (fallback, `EmpresaAtiva`), filtro de antiforgery, `TimeProvider` | dev-backend | `Sessao/*.cs`, `Autenticacao/ConfiguracaoAutenticacao.cs`, `Program.cs` | 7 |
| 9 | E2 | OIDC genérico (registrado só com `Autoridade`) e `ServicoLogin`, que segue os passos 1 a 5 do §3.9, cada um com seu contexto. Rotas `entrar` (retorno local), `sair` e `antiforgery` | dev-backend | `Autenticacao/*.cs` | 8 |
| 10 | E2 | Usuário de desenvolvimento (opções com `ValidateOnStart`, rota condicional, recusa do emissor reservado) e `semear-desenvolvimento` (§3.4: ids fixos, upsert do login, `DO NOTHING`, um contexto por empresa) | dev-backend | `Desenvolvimento/*.cs`, `Program.cs` | 9 |
| 11 | E2 | `GET /api/v1/eu`, `GET` e `PUT /api/v1/empresas/atual`, com contratos; o OpenAPI é regerado | dev-backend | `Empresas/*.cs`, `Autenticacao/EuEndpoints.cs`, `server/openapi/CronoAI.Api.json` | 9 |
| 12 | E2 | IdP de teste e apoio:<br>• `ApiFactory` com `https://localhost`, anel temporário, OIDC no IdP e `Maximum Pool Size`/`No Reset On Close` configuráveis;<br>• `ClienteAutenticado`, `RelogioTeste : TimeProvider`, `LogsEmMemoria` | dev-backend | `Infra/IdpTeste/*.cs`, `Infra/*.cs` | 8 |
| 13 | E2 | Testes E2 (seção 11) | dev-backend | `server/tests/.../{Autenticacao,Empresas}/**`, `ConfiguracaoTestes.cs`, `CabecalhosTestes.cs` | 10, 11, 12 |
| 14 | E3 | Catálogo, `IsolamentoRotasTestes`, meta-teste e testes de concorrência e de caminho de erro no nível da API | dev-backend | `server/tests/.../Isolamento/**` | E2 |
| 15 | E4 | `regras-cronoai.mjs`: `.cs` de `server/src/**` passa a ser código para as regras de backend. Regras novas, todas bloqueando:<br>• **R14** `FromSqlRaw`/`ExecuteSqlRaw`/`SqlQueryRaw`;<br>• **R15** DDL (`CREATE`/`ALTER`/`DROP` de `TABLE`/`INDEX`/`POLICY`/`ROLE`/`SCHEMA`, `ENABLE`/`FORCE`/`NO FORCE ROW LEVEL SECURITY`) fora de `Migrations/` e `CronoAI.Dados/Rls/`, **e** DML (`INSERT INTO`, `UPDATE ... SET`, `DELETE FROM`) em `Migrations/` fora do helper;<br>• **R16** `IgnoreQueryFilters` fora de `ConsultasIdentidade.cs`;<br>• **R17** `NpgsqlConnection`/`NpgsqlDataSource` fora do design-time (com `NpgsqlConnectionStringBuilder` permitido).<br>Casos "acusa/não acusa" em `regras-cronoai.test.mjs` | dev-backend | `.claude/scripts/lib/regras-cronoai.mjs`, `regras-cronoai.test.mjs` | E1 |
| 16 | E4 | ADR 00005 (§3.2-3.4, §3.8) e ADR 00006 (§3.5-3.6, §3.9, notas do §07, PgBouncer, limite da variável, risco residual de `usuario`), ambos `Proposto`; índice dos ADRs | orquestrador (`/adr`), revisão do arquiteto | `.claude/adrs/00005-*.md`, `00006-*.md`, `README.md` | gate |
| 17 | E4 | Ajustes de documentação e regras:<br>• ADR 00004: `Restrict` aplicado, `search_path` do migrador, region "Tipos auxiliares", **exceção do uuid v4 em `sessao`**, ponteiro para o ADR 00006;<br>• `backend-dotnet.md`: RLS, contexto imutável, sobrescrita, migração de dados por helper, carregar antes de atualizar, `IgnoreQueryFilters`, catálogo de rotas, conexão só pelo EF;<br>• checklist ASVS V6-V10;<br>• SPEC-01 §5: nota "sem `cnpj` por ora";<br>• `CLAUDE.md` e `server/README.md` | dev-backend | arquivos do E4 | 16 |
| 18 | — | Evidências:<br>• `dotnet build/test/format/list --vulnerable`;<br>• `node --test .claude/scripts/lib/regras-cronoai.test.mjs`;<br>• `validar-regras.mjs` e `classificar-diff.mjs --faixa 3`;<br>• `npm run ci`;<br>• `git grep` de hosts de provedor;<br>• subida local com semente e curl em `/eu` | orquestrador | — | 14, 17 |

### Grafo
```
gate ─ 1 ─ 2 ─ 3 ─┬─ 4 ─┐
                  └─ 5 ─┴─ [checkpoint] ─ 6                     (E1)
E1 ─ 7 ─ 8 ─┬─ 9 ─┬─ 10 ─┐
            │     └─ 11 ─┼─ 13                                  (E2)
            └─ 12 ───────┘
E2 ─ 14                                                         (E3)
E1 ─ 15 ─┐
gate ─ 16 ┴─ 17 ─ 18                                            (E4)
```

## 11. Testes previstos
Projeto `server/tests/CronoAI.Api.Testes`.
- **(I)** = integração (Docker), conectada como **`cronoai_app`**, salvo indicação.
- **(mig)** = conexão do migrador.
- Ambiente `Production` por padrão.

| Critério | Teste | Arquivo | Resultado esperado |
|---|---|---|---|
| AC-2 (I, mig) | `Migracao_IdentidadeEmpresas_aplica_e_reaplica` | `MigracoesTestes.cs` | 2 migrações aplicadas; o 2º `MigrateAsync` não lança |
| AC-2 | `Modelo_sem_mudanca_pendente` (existente) | `MigracoesTestes.cs` | `false` |
| AC-2 (I) | `Usuario_unico_por_emissor_e_sujeito` | `Dados/UsuarioTestes.cs` | `23505` |
| AC-2 (I) | `Checks_de_tamanho_e_datas` (Theory: emissor vazio, sujeito com 256 caracteres, `expira_em <= criada_em`, `encerrada_em < criada_em`) | `Dados/RestricoesTestes.cs` | `23514` |
| AC-2 (I) | `Sessao_so_aponta_para_empresa_da_qual_o_usuario_e_membro` | `Dados/SessaoTestes.cs` | `23503` |
| AC-2 (I) | `Privilegios_da_aplicacao_por_tabela` | `Dados/PrivilegiosIdentidadeTestes.cs` | `has_table_privilege` igual à tabela do §07 (ex.: `empresa` UPDATE = f, `sessao` DELETE = t) |
| AC-2 (I) | `Aplicacao_nao_acessa_historico_de_migracoes` | idem | `SELECT` em `cronoai.__ef_migrations_history` → `42501` |
| AC-3 | `Modelo_so_tem_fks_restrict` | `ArquiteturaTestes.cs` | Toda FK com `Restrict` |
| AC-3 (I) | `Fks_do_schema_sao_restrict` | `Dados/CatalogoTestes.cs` | `confdeltype = 'r'` em toda FK de `cronoai` |
| AC-3 (I) | `Identificadores_cabem_em_63_bytes` | idem | Nenhum nome truncado ou duplicado (`pg_class`, `pg_constraint`, `pg_policies`) |
| AC-3 | `Decimais_tem_precisao_explicita` | `ArquiteturaTestes.cs` | Toda propriedade `decimal` com precisão (nenhuma hoje) |
| AC-4 (I) | `Toda_tabela_tem_rls_forcado_ou_esta_na_lista_global` | `Dados/CatalogoTestes.cs` | `relrowsecurity` e `relforcerowsecurity` verdadeiros, exceto em `usuario` e `__ef_migrations_history` |
| AC-4 (I) | `Politicas_sao_por_comando_e_so_para_cronoai_app` | idem | Em `pg_policies`: `roles = {cronoai_app}`; nenhum `cmd = ALL`; os comandos exatamente os do §07 (sem UPDATE/DELETE em `empresa` e `membro_empresa`) |
| AC-4 (I) | `Sem_contexto_a_aplicacao_nao_ve_empresa_membro_nem_sessao` | `Dados/RlsTestes.cs` | `count(*)` = 0 nas três |
| AC-4 (I) | `Politica_de_empresa_por_membro_e_por_empresa_ativa` | idem | Contexto só de usuário membro de 2 empresas → vê 2; não membro → 0; contexto só de empresa → só a ativa |
| AC-4 (I) | `Com_contexto_A_FromSql_sem_filtro_do_EF_so_ve_A` | idem | Só linhas de A ou do usuário |
| AC-4 (I) | `Insert_com_empresa_diferente_do_contexto_falha` | idem | `42501` |
| AC-4 (I) | `Usuario_nao_ve_nem_altera_sessao_de_outro` | idem | Contexto B: `SELECT` = 0 e `UPDATE` da sessão de A = 0 linhas |
| AC-4 (I, mig) | `Dono_tambem_se_sujeita_ao_rls` | idem | Migrador sem contexto **e** com `app.*` setado → 0 linhas (as políticas são `TO cronoai_app`) |
| AC-4 (I, mig) | `Helper_de_migracao_de_dados_afeta_as_linhas_e_reativa_o_force` e `..._com_erro_desfaz_e_mantem_o_force` | `Dados/MigracaoDeDadosRlsTestes.cs` | Na transação, o SQL do helper atualiza 1 linha de teste; depois `relforcerowsecurity = t`; com erro, rollback e `FORCE` intacto |
| AC-19 (I) | `Sem_sobrescrita_e_sem_reset_o_valor_vaza` (controle negativo) | `Dados/PoolRlsTestes.cs` | `NpgsqlConnection` crua, `Maximum Pool Size=1`, `No Reset On Close=true`: `set_config`, fecha, reabre (mesmo `pg_backend_pid()`) → o valor **continua lá**. Com o padrão → vazio |
| AC-19 (I) | `Sobrescrita_independe_do_reset` | idem | `No Reset On Close=true`, pool 1: contexto A pelo EF, depois contexto vazio pelo EF na mesma conexão física → 0 linhas e `current_setting` vazio |
| AC-19 (I) | `Conexao_devolvida_ao_pool_nao_carrega_contexto` | idem | Padrão, pool 1, mesmo `pg_backend_pid()` → 0 linhas |
| AC-19 (I) | `Concorrencia_com_pool_pequeno_nao_mistura_empresas` | idem | `Task.WhenAll` de 60 operações alternando A e B, pool 3: cada uma só vê a sua empresa |
| AC-19 | `No_reset_on_close_impede_a_partida` | `ConfiguracaoTestes.cs` | Host com `No Reset On Close=true` → exceção na partida |
| AC-5 | `Entidade_com_EmpresaId_implementa_IDadoDeEmpresa_e_tem_filtro_Empresa` | `ArquiteturaTestes.cs` | Filtro nomeado presente |
| AC-5 (I) | `Filtro_do_EF_sem_empresa_ativa_nao_devolve_nada` | `Dados/FiltroEmpresaTestes.cs` | 0 |
| AC-5 | `Contexto_do_banco_e_imutavel_e_sessao_preenchida_uma_vez` | `Dominio/ContextoTestes.cs` | `ContextoSessaoBanco` sem setters; 2ª atribuição ao `ContextoSessao` lança exceção |
| AC-5 | `Usuario_so_e_acessado_em_identidade_e_semente` | `ArquiteturaTestes.cs` | Varredura de `server/src/**/*.cs`: `.Usuarios`/`Set<Usuario>` só em `ConsultasIdentidade.cs` e `SementeDesenvolvimento.cs` |
| R-1 | `Dominio_nao_referencia_EF_nem_AspNetCore` + o existente | `ArquiteturaTestes.cs` | Sem referências proibidas |
| AC-6 (I) | `Entrar_redireciona_ao_provedor_com_pkce_s256_state_e_nonce` | `Autenticacao/OidcTestes.cs` | 302 com `code`, `S256`, `state` e `nonce` |
| AC-6 (I) | `Retorno_valido_cria_usuario_sessao_e_cookie_seguro` | idem | 1 usuário com `emissor` = `iss` do token; 1 sessão; cookie com `httponly`, `secure`, `samesite=lax`, `path=/`, sem `domain` |
| AC-6 (I) | `Cookie_nao_guarda_tokens_do_provedor` | idem | `GetTokens()` vazio; só as claims `sid` e `usuario_id` |
| AC-6 (I) | `Logins_simultaneos_do_mesmo_sub_criam_um_usuario` / `Mesmo_sub_em_emissores_diferentes_sao_usuarios_diferentes` | idem | 1 linha / 2 linhas |
| AC-6 (I) | `Login_nao_reativa_usuario_desativado` | idem | Usuário com `desativado_em` → sem sessão; `desativado_em` inalterado |
| AC-6 (I) | `Login_apaga_sessoes_proprias_vencidas_alem_da_retencao` | `Autenticacao/SessaoTestes.cs` | Sessões de A com 31 dias apagadas; com 29 dias mantidas; as de B intactas |
| AC-7 (I) | `Token_recusado_nao_cria_sessao` (8 casos) | `Autenticacao/OidcNegativosTestes.cs` | Sem cookie; 0 linhas novas; sem pilha |
| AC-8 | `Sem_autoridade_entrar_responde_503_e_api_sobe` | `OidcTestes.cs` | `/health/live` 200; `/entrar` 503 em ProblemDetails |
| AC-8 / S-1 | `Appsettings_sem_segredo_do_cliente_nem_flag_de_desenvolvimento` | `ConfiguracaoTestes.cs` | Nenhum `*.json` de `server/src` com `SegredoCliente` preenchido nem `Habilitado: true` |
| AC-9 | `Api_nao_sobe_fora_de_Development_com_usuario_dev_ligado` (Production, Staging, Homologacao) | `Autenticacao/UsuarioDesenvolvimentoTestes.cs` | `OptionsValidationException` com "usuário de desenvolvimento" |
| AC-9 | `Rota_dev_nao_existe_sem_os_dois_interruptores` | idem | Fora do `EndpointDataSource`; 404 |
| AC-9 (I) | `Development_com_flag_entra_como_dev_a_e_dev_b` | idem | `/eu` com o nome fictício certo |
| AC-9 (I) | `Sessao_de_emissor_dev_recusada_fora_de_Development` | idem | 401 |
| AC-9 (I) | `Semente_recusa_fora_de_Development`, `Semente_e_idempotente_com_ids_fixos` | `Autenticacao/SementeDesenvolvimentoTestes.cs` | Exceção; 2 execuções → as 3 empresas com os ids constantes e 4 vínculos, sem duplicar |
| AC-10 (I) | `Sessao_expira_por_inatividade` / `..._pela_duracao_maxima_mesmo_com_uso` | `SessaoTestes.cs` | +31 min → 401; uso a cada 20 min, 8 h + 1 min → 401 |
| AC-10 (I) | `Sair_encerra_a_sessao_no_servidor` / `Usuario_desativado_perde_a_sessao_na_proxima_requisicao` | idem | Cookie antigo → 401; `encerrada_em` preenchido |
| AC-11 (I) | `Eu_devolve_usuario_e_suas_empresas`, `Eu_sem_sessao_responde_401` | `Autenticacao/EuTestes.cs` | Sem a empresa B; 401 sem 302 |
| AC-11 (I) | `Login_com_uma_empresa_a_define_como_ativa`, `Login_com_varias_deixa_ativa_vazia`, `Empresa_atual_sem_empresa_ativa_responde_403`, `Trocar_para_empresa_propria_persiste`, `Trocar_para_empresa_alheia_ou_inexistente_responde_404_identico`, `Escrita_sem_antiforgery_responde_400` | `Empresas/EmpresaAtualTestes.cs` | Conforme o §3.5 |
| AC-13 | `Limite_de_login_responde_429_com_retry_after`, `Limite_no_retorno_oidc`, `Limite_em_health_ready`, `Host_nao_permitido_responde_400` | `Autenticacao/BordaTestes.cs` | 4ª requisição (limite de teste 3/min) → 429 com `Retry-After`; host estranho → 400 |
| S-6 / S-7 / S-5 | `Cabecalhos_de_seguranca_em_302_401_403_429`, `Sem_cabecalho_cors`, `Retorno_externo_vai_para_a_raiz` | `CabecalhosTestes.cs`, `BordaTestes.cs`, `OidcTestes.cs` | Headers presentes; sem `Access-Control-Allow-Origin`; redireciona para `/` |
| AC-14 | `Fora_de_Development_sem_anel_configurado_api_nao_sobe` | `Autenticacao/DataProtectionTestes.cs` | `OptionsValidationException` |
| AC-15 (I) | `Fluxo_de_login_nao_registra_dado_pessoal_nem_token` | `Autenticacao/LogsTestes.cs` | Sem nome, `sub`, token, código nem cookie; com o `usuario_id` |
| AC-12 (I) | `Toda_rota_registrada_tem_cenario_de_isolamento`, `Catalogo_nao_tem_rota_inexistente`, `Rotas_anonimas_sao_so_as_da_lista`, `Toda_rota_nao_anonima_responde_401_sem_sessao`, `Toda_escrita_exige_antiforgery`, `Usuario_da_empresa_A_nao_ve_dado_da_empresa_B_em_nenhuma_rota` | `Isolamento/IsolamentoRotasTestes.cs` | Lista de falhas vazia |
| AC-12 | `Detector_acusa_rota_nova_sem_cenario` | idem | A lista contém `GET /api/v1/__teste/sem-cenario` |
| AC-12 (I) | `Requisicoes_concorrentes_de_empresas_diferentes_nao_vazam` | `Isolamento/PoolApiTestes.cs` | API com `Maximum Pool Size=3`: 60 requisições paralelas A/B a `/eu` e `/empresas/atual`; nenhum marcador da outra |
| AC-12 (I) | `Requisicao_que_falha_apos_abrir_conexao_nao_contamina_a_seguinte` | idem | Rota de erro (host separado) abre a conexão como A e lança → 500; a seguinte, como B, na mesma conexão (pool 1), não vê A |
| AC-16 | Casos de R14 a R17 | `.claude/scripts/lib/regras-cronoai.test.mjs` | `node --test` verde. **Acusa:**<br>• `FromSqlRaw(`;<br>• `CREATE POLICY` em `CronoAI.Api`;<br>• `UPDATE cronoai.empresa SET` em `Migrations/`;<br>• `IgnoreQueryFilters(` fora da lista;<br>• `new NpgsqlConnection(` em `server/src`.<br>**Não acusa:**<br>• DDL em `Migrations/` e `Rls/`;<br>• DML em `Rls/MigracaoDeDadosRls.cs`;<br>• `NpgsqlConnectionStringBuilder`;<br>• comentário;<br>• `server/tests/**` |

## 12. Critérios de aceite e escopo fechado
- **AC-1:** build Release com 0 avisos; `format` limpo; `dotnet test` verde; diff do OpenAPI vazio após o build.
- **AC-2:** a migração `IdentidadeEmpresas` produz o modelo do §07 (tipos, `CHECK`s, FK composta, privilégios). Aplica, reaplica e não deixa pendência.
- **AC-3:** FKs `RESTRICT` no modelo e no catálogo, com o laço por último. Identificadores até 63 bytes. Teste de precisão presente.
- **AC-4:** RLS forçado em toda tabela fora da lista global. Políticas `TO cronoai_app`, por comando, com `WITH CHECK`, exatamente as do §07. Como `cronoai_app`:
  - sem contexto → 0 linhas;
  - com contexto A → só A, inclusive por `FromSql`.

  O dono também se sujeita ao RLS, e o helper de migração de dados reativa o `FORCE`.
- **AC-5:**
  - filtro `"Empresa"` automático;
  - `IgnoreQueryFilters` só em `ConsultasIdentidade.cs`;
  - `DbSet<Usuario>` só em `ConsultasIdentidade.cs` e na semente;
  - contexto do banco imutável por `DbContext`.
- **AC-6:**
  - login OIDC com código + PKCE S256 cria usuário (com o `iss` validado) e sessão;
  - cookie conforme o §3.3, sem token guardado;
  - o upsert não reativa conta desativada;
  - a limpeza oportunista respeita a retenção e só toca o próprio usuário.
- **AC-7:** os oito casos negativos não criam sessão nem usuário.
- **AC-8:** nenhum provedor fixo. Provas:
  - `git grep -inE "microsoftonline|login\.live|accounts\.google|keycloak|okta|auth0" -- server/src` vazio;
  - sem `Autoridade`, `/entrar` responde 503 e a API sobe.
- **AC-9:**
  - o usuário de desenvolvimento só existe com `Development` + flag;
  - com a flag fora de `Development`, a API não sobe;
  - sem os dois interruptores, a rota não existe;
  - o emissor reservado é recusado fora de `Development`;
  - a flag não aparece em nenhum `appsettings` versionado;
  - a semente é idempotente, usa ids fixos e roda como `cronoai_app`.
- **AC-10:** inatividade de 30 min e teto de 8 h, configuráveis. Sair encerra a sessão no servidor; o usuário desativado perde a sessão.
- **AC-11:** `/eu` e `/empresas/atual` (`GET`, `PUT`) com os status do §11. A API responde 401, nunca 302.
- **AC-12:**
  - o teste genérico enumera todas as rotas;
  - o meta-teste prova que o detector funciona;
  - sem vazamento em concorrência nem depois de erro.
- **AC-13:** 429 com `Retry-After` em login, retorno do OIDC e `/health/ready`; host fora de `AllowedHosts` → 400.
- **AC-14:** `SetApplicationName("CronoAI")`; anel fora do repositório; fora de `Development` sem anel, a API não sobe.
- **AC-15:** o fluxo de login não registra nome, `sub`, token, código nem cookie.
- **AC-16:** R14 a R17 no `validar-regras`, com `.cs` de `server/src/**` mapeado e casos versionados verdes. `validar-regras --base {BASE}` com 0 bloqueios.
- **AC-17:** documentação atualizada:
  - ADRs 00005 e 00006 (`Proposto`);
  - ADR 00004 ajustado (inclui a exceção do v4);
  - `backend-dotnet.md`, checklist ASVS V6-V10, nota da SPEC-01 §5;
  - `CLAUDE.md` e `server/README.md`.
- **AC-18:** front intacto. `npm run ci` verde; nada em `src/`, `e2e/`, `Dockerfile`, `docker/` ou `.github/`.
- **AC-19:** sem vazamento pelo pool. Provas:
  - o controle negativo prova que o teste detecta vazamento;
  - a sobrescrita vale mesmo com o reset desligado;
  - concorrência com pool pequeno sem mistura;
  - `No Reset On Close=true` impede a partida;
  - nenhuma conexão crua em `server/src` (R17).

### Matriz de verificação prevista
| Item | Requisito | Verificação | Obrig. |
|---|---|---|---|
| AC-1 | Build, format, testes, OpenAPI | comandos do AC-1 | sim |
| AC-2 | Modelo, privilégios e migração | `MigracoesTestes`, `Dados/*Testes`, `has-pending-model-changes` | sim |
| AC-3 | `Restrict`, 63 bytes, precisão | `ArquiteturaTestes`, `CatalogoTestes` | sim |
| AC-4 | RLS forçado, políticas exatas, eficácia como `cronoai_app`, dono sujeito, helper | `CatalogoTestes`, `RlsTestes`, `MigracaoDeDadosRlsTestes` | sim |
| AC-5 | Filtro, listas permitidas, contexto imutável | `ArquiteturaTestes`, `FiltroEmpresaTestes`, `ContextoTestes`, R16 | sim |
| AC-6 | Login OIDC, cookie, upsert, retenção | `OidcTestes`, `SessaoTestes` | sim |
| AC-7 | Tokens inválidos | `OidcNegativosTestes` | sim |
| AC-8 | Sem provedor fixo | `git grep` + testes | sim |
| AC-9 | Usuário de desenvolvimento e semente | `UsuarioDesenvolvimentoTestes`, `SementeDesenvolvimentoTestes` | sim |
| AC-10 | Expiração e revogação | `SessaoTestes` | sim |
| AC-11 | Endpoints | `EuTestes`, `EmpresaAtualTestes` | sim |
| AC-12 | Isolamento em toda rota | `IsolamentoRotasTestes`, `PoolApiTestes` | sim |
| AC-13 | Rate limiting e hosts | `BordaTestes` | sim |
| AC-14 | Data Protection | `DataProtectionTestes` | sim |
| AC-15 | Logs sem dado pessoal | `LogsTestes` | sim |
| AC-16 | Regras de .NET | `node --test`; `validar-regras` | sim |
| AC-17 | Documentação e ADRs | diff | sim |
| AC-18 | Front intacto | `npm run ci`; `git diff --name-only` | sim |
| AC-19 | Pool sem vazamento | `PoolRlsTestes`, `ConfiguracaoTestes`, R17 | sim |
| R-1 | Camadas | `ArquiteturaTestes` | sim |
| R-2 | DDL só em migração, bootstrap ou `Rls/`; DML de migração só pelo helper | R15 + `git grep` | sim |
| R-3 | Sem `Migrate(` na partida | `git grep "Migrate(" -- server/src` vazio | sim |
| R-4 | Sem warning novo | build | sim |
| R-5 | Estilo do ADR 00004 | leitura do `arquiteto` | sim |
| S-1 | Sem segredo versionado | `ConfiguracaoTestes`, R08 | sim |
| S-2 | Dependências, licenças, vulneráveis | `Directory.Packages.props` × §08; `--vulnerable --include-transitive` | sim |
| S-3 | Atributos do cookie | `OidcTestes` | sim |
| S-4 | CSRF | `EmpresaAtualTestes`, `IsolamentoRotasTestes` | sim |
| S-5 | Redirecionamento aberto | `OidcTestes` | sim |
| S-6 | Headers em 302/401/403/429 | `CabecalhosTestes` | sim |
| S-7 | Sem CORS | `BordaTestes` | sim |
| S-8 | Testes de banco como `cronoai_app` (superusuário só na fixture) | leitura | sim |
| S-9 | `ShowPII` desligado | `git grep ShowPII -- server/src` vazio | não |
| V-1 | Subida local com semente e `/eu` por curl | orquestrador | não |
| AUD | Auditoria independente | `revisor` em modo AUDITAR | sim |

**Validadores** (etapa 6, em paralelo, com `LINT`/`TYPECHECK`/`TESTES-AFETADOS` e as saídas `dotnet` no prompt):
- **`arquiteto`:** plano, camadas, contexto imutável, filtro, `Restrict`, estilo, escopo;
- **`dba`:** migração, políticas, `FORCE`, privilégios, `CHECK`s, consultas, testes de catálogo e de pool;
- **`seguranca`:** §08, ASVS V6-V10, dependências, cookie, CSRF, redirecionamento, usuário de desenvolvimento, logs;
- **`testes`:** execução completa e matriz;
- **auditoria independente:** `revisor` em modo AUDITAR, depois dos quatro.

### Fora do escopo (explícito)
- Front: `src/`, proxy do Vite, telas de login e de escolha de empresa (00019).
- Perfis, vínculo com obra e frente, gestão de membros, remoção de membro, convites, e-mail (00014).
- RLS em `usuario` (reavaliação no 00014).
- Obra, trilha de auditoria e concorrência otimista (00013). Login e logout vão só para log estruturado.
- **Criação de empresa por API ou por comando de operador** (G2 = (a)).
- `cnpj` em `empresa`.
- MFA imposto pela aplicação, SAML, logout no provedor, refresh/access token.
- Provedor OIDC real e registro do cliente nele.
- Keycloak ou qualquer IdP em contêiner; perfil novo no compose.
- Limpeza de sessões em lote, papel de limpeza e índice `(expira_em)` (00023). Neste ciclo, só a limpeza oportunista no login.
- Migração de dados (o helper nasce, mas nenhuma migração de dados acontece).
- Trocar `ALTER DEFAULT PRIVILEGES` por concessão explícita por tabela.
- `ForwardedHeaders`, TLS/HSTS, domínio, proxy reverso, PgBouncer (Infra).
- CI, Dependabot, compose e Dockerfile; teste da R08 na CI; cobertura do backend; API no compose.
- E-mail, telefone ou foto do usuário; vínculo de contas entre emissores.
- Qualquer regra de cronograma.

## 13. Validações com outras áreas
| Tema | Área | Antes de quê |
|---|---|---|
| Provedor OIDC real e MFA. Método de autenticação do cliente. Logout no provedor. Tempos de sessão (30 min / 8 h sugeridos). Limites de taxa | **Segurança da Informação** | Login real fora do local |
| Pacote OIDC e a família `Microsoft.IdentityModel.*`. IdP de teste em memória (código próprio). Aceite dos itens ASVS V6-V10 | **Segurança da Informação** | Uso em produção |
| Dado pessoal: `nome_exibicao` e o par emissor + `sub`. Retenção de `sessao` (30 dias sugeridos) e de `ultimo_acesso_em`. Pseudonimização (`UPDATE`, nunca `DELETE`). Risco residual de `usuario` legível entre empresas pelo papel da aplicação. Termos multiempresa (controlador × operador). Licenças MIT | **Jurídico** | Dados reais |
| `AllowedHosts` e `ForwardedHeaders` (IP real para o rate limiting). TLS/HSTS. Guarda do anel do Data Protection. `redirect_uri` e domínio. **Pooler de conexões:** PgBouncer em modo de transação vaza as variáveis de sessão entre clientes; exige trocar para `set_config(..., true)` com interceptor de transação. Papel de backup (`pg_dump` e RLS) e papel de limpeza em produção | **Infraestrutura** | Primeiro ambiente fora do local (não bloqueia este ciclo) |
| Como empresas passam a existir fora do local (G2 = (a)) | **Usuário + Jurídico** | Piloto |

## 14. Riscos e pós-entrega
- **IdP em memória mais permissivo que um provedor real.** Mitigação: testes negativos + fumaça com o provedor real (Segurança).
- **`ValidateOnStart` × gerador de OpenAPI do build:** conferir na tarefa 7. Plano B: o gerador roda em `Development` com a flag desligada.
- **Testes existentes rodam em `Production`:** a `ApiFactory` precisa fornecer `DataProtection:CaminhoAnel` (tarefa 12).
- **Cookie `Secure`/`__Host-` no `TestServer`:** exige base `https://localhost`. O teste manual com um provedor real local exige HTTPS (certificado de desenvolvimento).
- **APIs a conferir:**
  - filtros nomeados do EF 10;
  - `SqlQuery<Guid>` com `RETURNING`;
  - `eventData.Context` no evento de conexão;
  - `MATCH SIMPLE`;
  - privilégio do histórico de migrações.

  Todos com teste. Plano B do upsert: inserir e reler no `23505`.
- **Alternância `NO FORCE`/`FORCE` no helper:** precisa do lock da tabela na transação da migração (curto, só local por ora). Em produção, o momento de aplicar é da Infra.
- **Desempenho:** uma consulta a mais por requisição e a subconsulta da política. Medir no 00015 (RNF-01.1).
- **Crescimento de `sessao`:** usuários que não voltam acumulam linhas até a limpeza em lote (00023).
- **Rate limiting atrás de proxy sem `ForwardedHeaders`** (Infra).
- **Perda do anel:** derruba as sessões. Aceitável; documentado.
- **Conflitos de merge** com a Fase 1: fazer merge da `master` antes do PR. PR empilhado se o 00011 não tiver entrado.
- **Rollback:** reverter os commits. `Down()` da migração remove políticas e tabelas; o banco local sai com `docker compose --profile backend down -v`.
- **Publicação:** nenhuma (Inviolável 8). Versão: decisão do usuário no `/entregar`.

## 15. Perguntas de gate e decisões
**Decididas pelo orquestrador, com a autorização do usuário de 25/10/2026, sujeitas à revisão dele no PR:**
- **G1 = (a):** emissor OIDC em memória nos testes (§3.8). Sem imagem nem dependência nova; T7 continua NÃO.
- **G2 = (a):** empresa só pela semente em `Development` e pelos testes. A criação real fica para um ciclo próprio, com o Jurídico. Fora do local, um usuário OIDC entra mas fica sem empresa.
- **G3 = (a):** tabela `sessao` revogável no servidor (§3.3).

Para referência, as alternativas descartadas foram:
- **G1 (b):** Keycloak via Testcontainers;
- **G1 (c):** só o usuário de desenvolvimento;
- **G2 (b):** `POST /api/v1/empresas` em autoatendimento;
- **G2 (c):** comando de operador;
- **G3 (b):** `versao_sessao` no usuário;
- **G3 (c):** só cookie.

**Decisões de design tomadas no plano, revisáveis no PR:**
- RLS + filtro do EF + coluna, com `FORCE`;
- 404 para recurso de outra empresa;
- e-mail não guardado, sem `cnpj`;
- `/api/v1/eu` em vez de `/me` (PLANO-FASE-2 §5.2; nomes em português do ADR 00004);
- `SaveTokens = false`, `SameSite=Lax`;
- `usuario` fora do RLS até o 00014;
- id da sessão em uuid v4 gerado por CSPRNG;
- retenção de 30 dias, até o parecer do Jurídico.

## 16. Emenda 01 (25/10/2026) — parecer do `dba` da tarefa 0
Parecer: `00012-tarefa0-dba.md`, `VEREDITO: AJUSTAR`. Os 10 ajustes e onde foram aplicados:

| # | Ajuste do parecer | Aplicado em |
|---|---|---|
| 1 | Interceptor sobrescreve **sempre** as duas variáveis; contexto imutável por `DbContext` (fábrica); guarda contra `No Reset On Close=true`; conexão crua proibida em `server/src` | §3.5, §3.9, tarefas 2, 3, 7, 8, 15 (R17), AC-5, AC-19 |
| 2 | Testes de pool: controle negativo, sobrescrita independente do reset, concorrência com pool pequeno, caminho de erro, guarda de configuração | §11 (`PoolRlsTestes`, `PoolApiTestes`, `No_reset_on_close_impede_a_partida`), AC-12, AC-19 |
| 3 | Sequência explícita dos fluxos de identidade, cada etapa com seu `DbContext` | §3.9, tarefas 8 e 9, ADR 00006 (tarefa 16) |
| 4 | Políticas `TO cronoai_app`, por comando, com `WITH CHECK`; sem UPDATE/DELETE em `empresa`/`membro_empresa`; `REVOKE DELETE` em `usuario`; DELETE só em `sessao`; testes de privilégios e do histórico | §3.5, §07, tarefas 3 e 5, §11 (`Politicas_sao_por_comando_...`, `Privilegios_...`, `Aplicacao_nao_acessa_historico_...`), AC-2, AC-4 |
| 5 | `FORCE` mantido; regra de migração de dados por helper; R15 estendida a DML de migração; teste "dono também se sujeita"; política para o migrador proibida | §3.5, §07, tarefas 3 e 15, §11, AC-4, R-2. **Nota do arquiteto:** como as políticas são `TO cronoai_app`, setar `app.*` não libera o migrador. O helper usa a outra via do parecer (`NO FORCE` → DML → `FORCE` na mesma transação), e o teste "dono" afirma 0 linhas também com as variáveis setadas |
| 6 | Semente com ids fixos fictícios, `ON CONFLICT DO NOTHING`, um contexto por empresa, usuários pelo upsert do login, nunca superusuário | §3.4, tarefa 10, §11, AC-9 |
| 7 | `usuario` fora do RLS com teste de arquitetura do `DbSet<Usuario>`; risco residual no ADR 00006; reavaliação no 00014 | §3.5, §07, §08, §11 (`Usuario_so_e_acessado_em_identidade_e_semente`), AC-5, §13 (Jurídico) |
| 8 | `sessao`: id por CSPRNG; `CHECK`s de datas; limpeza oportunista com retenção configurável (30 dias); inatividade só no ticket; lote e `(expira_em)` no 00023 | §3.3, §07, tarefas 1 e 4, §11, AC-6, Fora do escopo |
| 9 | `usuario`: `CHECK` de tamanho mínimo do emissor; `iss` validado; upsert com `RETURNING id` sem tocar `desativado_em`; emenda da SPEC-01 §5 (sem `cnpj`) | §3.2, §07, tarefas 4 e 17, §11 (`Login_nao_reativa_...`, `Checks_...`), AC-6 |
| 10 | ADR 00006: mapeamento 404/409/500, PgBouncer, remoção de membro no 00014, limite da variável. ADR 00004: exceção do v4 | §3.5, §07 (notas), §13 (Infra), tarefas 16 e 17 |

---

CONHECIMENTO NOVO:
- Políticas `TO cronoai_app` combinadas com `FORCE` deixam o dono (migrador) sem nenhuma política aplicável: ele vê zero linhas **mesmo com `app.*` setado**. Migração de dados, portanto, não funciona "setando o contexto"; precisa alternar `NO FORCE`/`FORCE` dentro da transação da migração — onde se aplica: helper `MigracaoDeDadosRls` e toda migração de dados a partir do 00013.
- O teste genérico de rotas pelo `EndpointDataSource` não enxerga caminhos de middleware de autenticação (retorno do OIDC); eles precisam de testes e de limitador próprios — onde se aplica: todo handler remoto novo.
- O cookie `__Host-`/`Secure` exige `BaseAddress = https://localhost` no `WebApplicationFactory` — onde se aplica: todos os testes autenticados.
- `ValidateOnStart` só dispara no `StartAsync`. Reprova o `WebApplicationFactory`, mas pode não reprovar o gerador de OpenAPI do build — conferir; onde se aplica: toda "falha fechada na partida".
- Rotas injetadas só no host de teste (meta-teste, erro proposital) precisam de host separado, senão entram no `EndpointDataSource` do teste de catálogo e o reprovam — onde se aplica: E3.
