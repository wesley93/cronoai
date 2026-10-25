# 00005 - Autenticação: OIDC genérico, BFF com cookie de sessão revogável e usuário de desenvolvimento

**Data**: 2026-10-25
**Status**: Proposto (aceite do usuário pendente; provedor OIDC real, MFA, tempos de sessão, método de autenticação do cliente e logout no provedor dependem da Segurança da Informação; retenção de `sessao` e dados pessoais, do Jurídico)
**Spec/decisão relacionada**: SPEC-02 (RF-02.1, RF-02.2 base, RNF-02.1 a 02.3), SPEC-12 (RF-12.5, RF-12.9), ASVS 5.0.0 V6 a V10, plano do ciclo 00012 (seções 3.2 a 3.4, 3.7 e 3.8), `PLANO-FASE-2.md` §3 e §8

Classificação: o que é **opinião da equipe** vem marcado; o resto é prática documentada (links) ou consequência de teste. Nada aqui é exigência regulatória.

## Contexto
O backend precisa saber quem chama. O usuário decidiu: login OIDC genérico (sem provedor fixo no código), sessão em cookie `HttpOnly`/`SameSite` sem token no `localStorage`, autorização no servidor, usuário de desenvolvimento só local e desligado fora de `Development`.

## Decisão

### BFF com cookie; o OIDC só autentica
- O handler OIDC ([doc](https://learn.microsoft.com/aspnet/core/security/authentication/configure-oidc-web-authentication)) autentica no `GET /api/v1/autenticacao/entrar`; o cookie guarda a sessão. Fluxo de código com PKCE S256 (RFC 7636, RFC 9700), cliente confidencial, `MapInboundClaims=false`, `GetClaimsFromUserInfoEndpoint=false` e **`SaveTokens=false`**: nenhum token do provedor é guardado. O cookie leva só `sid` e `usuario_id`.
- `RequireHttpsMetadata=true` sempre. Nos testes, o emissor responde em `https://idp.teste` pelo `BackchannelHttpHandler`; nenhum código de teste vai para produção.
- **Configuração genérica** `Autenticacao:Oidc:{Autoridade, IdCliente, SegredoCliente, Escopos, CaminhoRetorno}`. Sem `Autoridade` o esquema não é registrado e `/entrar` responde 503 (falha fechada, a API sobe). `SegredoCliente` só por user-secrets ou variável de ambiente. Nenhum host de provedor no código (verificado por `git grep`).
- **A API responde 401/403 em ProblemDetails, nunca 302.** O desafio padrão é o cookie; só `/entrar` desafia o OIDC.
- **Usuário provisionado no 1º login** por (`iss` **validado**, `sub`): upsert `INSERT ... ON CONFLICT (emissor, sujeito) DO UPDATE ... RETURNING id`, que nunca toca em `desativado_em` (o login não reativa conta). Sem normalizar a caixa do `sub` (OIDC Core, seção 2). Do token só se guarda `name`; **o e-mail não é guardado** (minimização). Sem vínculo de contas entre emissores (risco de tomada de conta, [OWASP OAuth2](https://cheatsheetseries.owasp.org/cheatsheets/OAuth2_Cheat_Sheet.html)).
- **Redirecionamento pós-login só para caminho local** (começa com `/`, não com `//` nem `/\`, até 2048 caracteres, sem controle); senão `/` ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Unvalidated_Redirects_and_Forwards_Cheat_Sheet.html)).
- **Logout local**: `POST /api/v1/autenticacao/sair` encerra a sessão no servidor e apaga o cookie. Logout no provedor exigiria guardar o `id_token`: pendente com a Segurança.

### Retorno do provedor: só o fluxo de código
O handler processa um retorno de autorização (`form_post`) só com `id_token`, sem `code`: o login passaria sem PKCE e sem autenticação do cliente. `OnMessageReceived` recusa (401 genérico, sem cookie nem usuário) qualquer retorno com `id_token` ou `access_token` no canal do navegador, ou sem `code`. As rotas de logout do handler (`/signout-oidc`, `/signout-callback-oidc`) ficam desligadas (404) até a Segurança decidir o logout no provedor. Um novo login no mesmo navegador encerra a sessão anterior (se o cookie ainda era válido).

### Achados de teste que mudaram o desenho (comportamento do handler, versão 10.0.13)
1. **`id_token` sem assinatura (`alg=none`) foi aceito** quando recebido do endpoint de token (OIDC Core 3.1.3.7, regra 6, permite validar só por TLS). `RequireSignedTokens` e `ValidAlgorithms` nas opções não mudaram o resultado. O aplicativo exige a assinatura e só aceita algoritmos assimétricos conhecidos em `OnTokenValidated` (caso `alg_none` de `OidcNegativosTestes`) e, na origem, com um `TokenHandler` (`ValidadorTokenAssinado`) que força `RequireSignedTokens` e a lista de algoritmos. Vale reavaliar a cada atualização do pacote.
2. **`OnTokenValidated` dispara antes da conferência do `nonce`**: criar usuário e sessão ali deixava rastro de um retorno que seria recusado. O login acontece em **`OnTicketReceived`**, depois de toda a validação.
3. **`Fail()` em `OnTicketReceived` é ignorado** pelo handler (o login seguiria com o principal do provedor): a recusa usa `HandleResponse()` e responde 401.
4. **A claim `iss` é removida por padrão** (`ClaimActions`): o aplicativo a mantém (`ClaimActions.Remove("iss")`) porque ela é o emissor validado que vira `usuario.emissor`.

### Sessão revogável no servidor (tabela `sessao`)
- O cookie `__Host-cronoai-sessao` (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, sem `Domain`; [doc](https://learn.microsoft.com/aspnet/core/security/authentication/cookie)) é cifrado pelo Data Protection e leva `sid` e `usuario_id`. A cada requisição, `OnValidatePrincipal` faz **uma** consulta: sessão aberta e não vencida, usuário ativo, vínculo vigente com a empresa ativa. Falhou: rejeita e apaga o cookie ([OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)).
- **Tempos [opinião, parecer final da Segurança]**: inatividade deslizante de 30 min **só no ticket**; prazo absoluto de 8 h em `sessao.expira_em`. Sem `ultima_atividade_em` (evita uma escrita por requisição). Consequência registrada: cookie roubado e em uso continua deslizando até o teto; a revogação vale na requisição seguinte. Instantes vêm do `TimeProvider`, como parâmetro.
- **`sessao.id` é uuid v4 de CSPRNG** (`RandomNumberGenerator`), exceção à regra do uuid v7 (que carrega o instante e não é controle de segurança). Sessão nova a cada login (sem fixação).
- **Empresa ativa** em `sessao.empresa_ativa_id`, com FK composta `(empresa_ativa_id, usuario_id) → membro_empresa`: o banco garante que é uma empresa do usuário. Escolha ao entrar: um vínculo, já ativa; vários, vazia até o `PUT`; nenhum, `empresas: []`.
- **Retenção**: limpeza oportunista no login, só das sessões **do próprio usuário** terminadas há mais de 30 dias (configurável; prazo final do Jurídico). Limpeza em lote e índice `(expira_em)` ficam para o 00023.
- **Antiforgery** nas escritas (`GET /api/v1/autenticacao/antiforgery` + `X-XSRF-TOKEN`, [doc](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery)) e **sem CORS** (mesma origem). **Fallback de autorização = autenticado**; política `EmpresaAtiva` nas rotas de dado de empresa. Requisição **sem endpoint** (rota inexistente) não é desafiada: segue para o 404 (o fallback também avalia essas requisições).
- Borda: `AllowedHosts` (`localhost;127.0.0.1;[::1]`, produção por variável de ambiente, Infra), rate limiting por IP com 429 + `Retry-After` (login, retorno do OIDC por limitador global, `/health/ready`), Data Protection com `SetApplicationName("CronoAI")` e anel fora do repositório (fora de `Development` sem `DataProtection:CaminhoAnel` a API não sobe), `IdentityModelEventSource.ShowPII=false`.

### Usuário de desenvolvimento
- **Dois interruptores**: ambiente `Development` **e** `Autenticacao:UsuarioDesenvolvimento:Habilitado=true`, esta última fora de qualquer `appsettings*.json` versionado (user-secrets ou variável de ambiente).
- **Falha fechada na partida** (`ValidateOnStart`): flag fora de `Development` → `OptionsValidationException`, o host não sobe. A rota só é mapeada com os dois interruptores e fica fora do OpenAPI.
- Mesmo `ServicoLogin` do login real (uma porta só); emissor reservado `urn:cronoai:desenvolvimento` recusado fora de `Development` (inclusive em cookie já emitido). Usuários fictícios `dev-a` e `dev-b`.
- **Semente** `dotnet run --project server/src/CronoAI.Api -- semear-desenvolvimento`: só em `Development`, como `cronoai_app`; três empresas com ids fixos fictícios; `ON CONFLICT DO NOTHING`; um `DbContext` por empresa.
- **Empresa só por semente em `Development` e pelos testes** (decisão G2). Como empresas passam a existir fora do local é decisão do usuário e do Jurídico, em ciclo próprio.

### Emissor OIDC de teste (decisão G1)
Emissor em memória (`HttpMessageHandler` com metadados, JWKS e `/token`; chave RSA por execução; confere PKCE S256, cliente e `redirect_uri`), com chaves de "mau comportamento" para os testes negativos. Sem imagem nem rede nem dependência nova. Pode ser mais permissivo que um provedor real: por isso os oito casos negativos e, antes de produção, uma fumaça com o provedor real (Segurança). Descartados: Keycloak via Testcontainers (T7, partida lenta), Duende IdentityServer (licença comercial), OpenIddict (dependência maior).

## Alternativas descartadas
| Alternativa | Motivo |
|---|---|
| SPA com tokens no navegador | RNF-02.1 proíbe token no `localStorage`; sem chamada a outra API em nome do usuário, guardar token só amplia a superfície |
| Ticket inteiro no cookie, sem tabela | Logout e desativação não valeriam no servidor |
| Pacote ou código de um provedor específico | Decisão do usuário |
| Esquema de autenticação paralelo para o usuário de desenvolvimento | Duas portas de entrada; ficou uma só |
| Guardar o e-mail | Minimização (RNF-02.3, LGPD) |

## Consequências
**Positivas:** login testado contra token inválido (oito casos), sessão revogável, nenhum token no navegador nem no banco, usuário de desenvolvimento que não sobe em produção.
**Negativas / trade-offs:** uma consulta a mais por requisição; usuários sem empresa ficam sem acesso até alguém (fora do escopo) criar empresa; o comportamento do handler (item "Achados") precisa ser reconferido a cada atualização do pacote.
**Dependências novas (revisão de segurança e licença antes de produção):** `Microsoft.AspNetCore.Authentication.OpenIdConnect` 10.0.13 (MIT) e, transitivas, `Microsoft.IdentityModel.*` 8.19.2 e `System.IdentityModel.Tokens.Jwt` 8.19.2 (MIT).
**Pendências:** provedor OIDC real e MFA, tempos de sessão, método de autenticação do cliente, logout no provedor e fumaça com o provedor real (Segurança); retenção de `sessao`, `ultimo_acesso_em` e pseudonimização de `usuario` (Jurídico); `ForwardedHeaders` (IP real no rate limiting), TLS/HSTS, `redirect_uri`, guarda do anel do Data Protection (Infraestrutura).
