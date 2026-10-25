using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Identidade;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Composição da autenticação (ADR 00005): BFF com cookie de sessão revogável no servidor; OIDC genérico só com
/// <c>Autoridade</c> configurada; fallback de autorização = usuário autenticado; contexto de banco imutável por
/// requisição; antiforgery nas escritas.
/// </summary>
public static class AutenticacaoExtensoes
{
    #region Campos

    private static readonly string[] AlgoritmosAssimetricos =
    [
        SecurityAlgorithms.RsaSha256, SecurityAlgorithms.RsaSha384, SecurityAlgorithms.RsaSha512,
        SecurityAlgorithms.RsaSsaPssSha256, SecurityAlgorithms.RsaSsaPssSha384, SecurityAlgorithms.RsaSsaPssSha512,
        SecurityAlgorithms.EcdsaSha256, SecurityAlgorithms.EcdsaSha384, SecurityAlgorithms.EcdsaSha512,
    ];

    #endregion

    #region Métodos públicos

    public static WebApplicationBuilder AdicionarAutenticacao(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var servicos = builder.Services;

        servicos.TryAddSingleton(TimeProvider.System);
        servicos.Configure<OpcoesSessao>(builder.Configuration.GetSection(OpcoesSessao.Secao));
        servicos.Configure<OpcoesOidc>(builder.Configuration.GetSection(OpcoesOidc.Secao));

        // Fábrica singleton; consultas e login são singletons (sem estado de requisição). O contexto da requisição
        // e o CronoDbContext dos endpoints são scoped: o contexto de banco é fixado na criação do DbContext.
        servicos.AddSingleton<ConsultasIdentidade>();
        servicos.AddSingleton<ServicoLogin>();
        servicos.AddScoped<ContextoSessao>();
        servicos.AddScoped(sp => sp.GetRequiredService<IFabricaCronoDbContext>().Criar(sp.GetRequiredService<ContextoSessao>().ParaBanco()));

        var autenticacao = servicos.AddAuthentication(opcoes =>
        {
            opcoes.DefaultScheme = EsquemasAutenticacao.Cookie;
            opcoes.DefaultChallengeScheme = EsquemasAutenticacao.Cookie;
        });
        autenticacao.AddCookie(EsquemasAutenticacao.Cookie, ConfigurarCookie);
        servicos.AddOptions<CookieAuthenticationOptions>(EsquemasAutenticacao.Cookie)
            .Configure<IOptions<OpcoesSessao>, TimeProvider>((cookie, sessao, relogio) =>
            {
                cookie.ExpireTimeSpan = TimeSpan.FromMinutes(sessao.Value.InatividadeMinutos);
                cookie.TimeProvider = relogio;
            });

        // Sem Autoridade, o esquema OIDC não é registrado (falha fechada: /entrar responde 503).
        var oidc = builder.Configuration.GetSection(OpcoesOidc.Secao).Get<OpcoesOidc>() ?? new OpcoesOidc();
        if (!string.IsNullOrWhiteSpace(oidc.Autoridade))
        {
            autenticacao.AddOpenIdConnect(EsquemasAutenticacao.Oidc, opcoes => ConfigurarOidc(opcoes, oidc));
            servicos.AddOptions<OpenIdConnectOptions>(EsquemasAutenticacao.Oidc)
                .Configure<TimeProvider>((o, relogio) => o.TimeProvider = relogio);

        }

        servicos.AddAuthorizationBuilder()
            .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build())
            .AddPolicy(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva, politica => politica
                .RequireAuthenticatedUser()
                .AddRequirements(new RequisitoEmpresaAtiva()));
        servicos.AddScoped<IAuthorizationHandler, TratadorRequisitoEmpresaAtiva>();
        servicos.AddSingleton<IAuthorizationMiddlewareResultHandler, ResultadoAutorizacaoProblemDetails>();

        servicos.AddAntiforgery(opcoes =>
        {
            opcoes.Cookie.Name = EsquemasAutenticacao.NomeCookieAntiforgery;
            opcoes.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            opcoes.Cookie.SameSite = SameSiteMode.Strict;
            opcoes.Cookie.Path = "/";
            opcoes.HeaderName = EsquemasAutenticacao.CabecalhoAntiforgery;
        });

        return builder;
    }

    #endregion

    #region Métodos privados

    private static void ConfigurarCookie(CookieAuthenticationOptions opcoes)
    {
        // __Host-: Secure, Path=/ e sem Domain. SameSite=Lax: o retorno do provedor é navegação entre sites.
        opcoes.Cookie.Name = EsquemasAutenticacao.NomeCookieSessao;
        opcoes.Cookie.HttpOnly = true;
        opcoes.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        opcoes.Cookie.SameSite = SameSiteMode.Lax;
        opcoes.Cookie.Path = "/";
        opcoes.Cookie.IsEssential = true;
        opcoes.SlidingExpiration = true;

        // API: 401/403 em ProblemDetails, nunca 302 (um fetch não segue login por redirecionamento).
        opcoes.Events = new CookieAuthenticationEvents
        {
            OnRedirectToLogin = contexto => ResponderAsync(contexto.HttpContext, StatusCodes.Status401Unauthorized, "Autenticação necessária."),
            OnRedirectToAccessDenied = contexto => ResponderAsync(contexto.HttpContext, StatusCodes.Status403Forbidden, "Acesso negado."),
            OnValidatePrincipal = ValidadorSessao.ValidarAsync,
        };
    }

    private static void ConfigurarOidc(OpenIdConnectOptions opcoes, OpcoesOidc oidc)
    {
        opcoes.SignInScheme = EsquemasAutenticacao.Cookie;
        opcoes.Authority = oidc.Autoridade;
        opcoes.ClientId = oidc.IdCliente;
        opcoes.ClientSecret = oidc.SegredoCliente;
        opcoes.CallbackPath = oidc.CaminhoRetorno;

        // Fluxo de código + PKCE S256 com cliente confidencial; HTTPS nos metadados SEMPRE.
        opcoes.ResponseType = "code";
        opcoes.UsePkce = true;
        opcoes.RequireHttpsMetadata = true;

        // O OIDC só autentica: nenhum token do provedor é guardado e nenhuma claim é remapeada.
        opcoes.SaveTokens = false;
        opcoes.MapInboundClaims = false;
        opcoes.GetClaimsFromUserInfoEndpoint = false;

        // O handler apaga a claim "iss" por padrão; ela é o emissor VALIDADO que vira usuario.emissor.
        opcoes.ClaimActions.Remove("iss");

        opcoes.Scope.Clear();
        foreach (var escopo in oidc.Escopos.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            opcoes.Scope.Add(escopo);
        }

        opcoes.Events = new OpenIdConnectEvents
        {
            OnTokenValidated = ExigirTokenAssinadoAsync,
            OnTicketReceived = EntrarComTokenValidadoAsync,
            OnRemoteFailure = FalhaRemotaAsync,
        };
    }

    // O handler aceitou, em teste, um id_token SEM assinatura (alg=none) recebido do endpoint de token (OIDC Core
    // 3.1.3.7, regra 6, permite confiar só no TLS). Aqui a assinatura é exigida mesmo assim: sem sinal de assinatura
    // ou com algoritmo fora da lista assimétrica, o retorno é recusado (Fail é honrado em OnTokenValidated).
    private static Task ExigirTokenAssinadoAsync(TokenValidatedContext contexto)
    {
        var algoritmo = contexto.SecurityToken?.Header?.Alg;
        var assinatura = contexto.SecurityToken?.RawSignature;

        if (string.IsNullOrEmpty(assinatura) || algoritmo is null || !AlgoritmosAssimetricos.Contains(algoritmo))
        {
            contexto.Fail("id_token sem assinatura válida.");
        }

        return Task.CompletedTask;
    }

    // OnTicketReceived (e não OnTokenValidated): só dispara DEPOIS de toda a validação (assinatura, iss, aud, exp,
    // state e nonce). No OnTokenValidated o nonce ainda não foi conferido e o login criaria usuário e sessão para um
    // retorno que será recusado. Troca o principal por um que só carrega sid e usuario_id: o cookie nunca leva
    // claim do provedor.
    private static async Task EntrarComTokenValidadoAsync(TicketReceivedContext contexto)
    {
        var emissor = contexto.Principal?.FindFirstValue("iss");
        var sujeito = contexto.Principal?.FindFirstValue("sub");
        var nome = contexto.Principal?.FindFirstValue("name");
        if (string.IsNullOrEmpty(emissor) || string.IsNullOrEmpty(sujeito))
        {
            await RecusarAsync(contexto);
            return;
        }

        var login = contexto.HttpContext.RequestServices.GetRequiredService<ServicoLogin>();
        var resultado = await login.EntrarAsync(emissor, sujeito, nome, desenvolvimento: false, contexto.HttpContext.RequestAborted);
        if (resultado is null)
        {
            await RecusarAsync(contexto);
            return;
        }

        contexto.Principal = PrincipalDeSessao.Criar(resultado.SessaoId, resultado.UsuarioId);
        contexto.Properties ??= new AuthenticationProperties();
        contexto.Properties.IsPersistent = false;
    }

    // Fail() em OnTicketReceived é IGNORADO pelo handler (o login seguiria com o principal do provedor): a recusa
    // precisa tratar a resposta aqui (HandleResponse) e devolver 401 genérico, sem cookie.
    private static async Task RecusarAsync(TicketReceivedContext contexto)
    {
        contexto.HandleResponse();
        await ResponderAsync(contexto.HttpContext, StatusCodes.Status401Unauthorized, "Não foi possível autenticar.");
    }

    // Qualquer falha no retorno (token inválido, state/nonce, código recusado): 401 genérico, sem detalhe nem pilha.
    private static async Task FalhaRemotaAsync(RemoteFailureContext contexto)
    {
        var logger = contexto.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("CronoAI.Api.Autenticacao");
        logger.FalhaNoRetornoOidc(contexto.Failure?.GetType().Name ?? "desconhecido");
        contexto.HandleResponse();
        await ResponderAsync(contexto.HttpContext, StatusCodes.Status401Unauthorized, "Não foi possível autenticar.");
    }

    private static Task ResponderAsync(HttpContext http, int status, string titulo)
    {
        // Sem IP, usuário ou detalhe de configuração; só o tipo padrão e o traceId.
        return Results.Problem(statusCode: status, title: titulo).ExecuteAsync(http);
    }

    #endregion
}
