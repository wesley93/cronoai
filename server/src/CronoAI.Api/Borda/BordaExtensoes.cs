using System.Globalization;
using System.Reflection;
using System.Threading.RateLimiting;
using CronoAI.Api.Autenticacao;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Logging;

namespace CronoAI.Api.Borda;

/// <summary>
/// Borda da API: Data Protection (anel fora do repositório, falha fechada fora de Development), guarda de
/// <c>No Reset On Close</c>, limites de taxa por IP e silêncio do IdentityModel (sem PII em log).
/// </summary>
public static class BordaExtensoes
{
    #region Campos

    /// <summary>Nome da política de taxa de login (entrar, desenvolvimento, sair).</summary>
    public const string PoliticaAutenticacao = "autenticacao";

    /// <summary>Nome da política de taxa de <c>/health/ready</c>.</summary>
    public const string PoliticaSaude = "saude";

    private static readonly TimeSpan _janela = TimeSpan.FromMinutes(1);

    #endregion

    #region Métodos públicos

    public static WebApplicationBuilder AdicionarBorda(this WebApplicationBuilder builder)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var configuracao = builder.Configuration;

        // Nenhum token, claim ou chave do IdentityModel em log.
        IdentityModelEventSource.ShowPII = false;
        builder.Logging.AddFilter("Microsoft.IdentityModel", LogLevel.Warning);

        AdicionarGuardas(builder);
        AdicionarDataProtection(builder);
        AdicionarLimitesDeTaxa(builder, configuracao.GetValue<string>("Autenticacao:Oidc:CaminhoRetorno") ?? OpcoesOidc.CaminhoRetornoPadrao);
        return builder;
    }

    #endregion

    #region Métodos privados

    private static void AdicionarGuardas(WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton<IValidateOptions<OpcoesConexaoBanco>, ValidadorOpcoesConexaoBanco>();
        builder.Services.AddOptions<OpcoesConexaoBanco>()
            .Configure<IConfiguration>((opcoes, configuracao) => opcoes.StringConexao = configuracao.GetConnectionString("Cronoai"))
            .ValidateOnStart();

        builder.Services.AddSingleton<IValidateOptions<OpcoesDataProtection>, ValidadorOpcoesDataProtection>();
        var opcoesProtecao = builder.Services.AddOptions<OpcoesDataProtection>()
            .Bind(builder.Configuration.GetSection(OpcoesDataProtection.Secao));

        // O gerador do contrato OpenAPI (build) sobe o host em Production, sem anel de chaves: só ele pula a falha
        // fechada (padrão documentado da Microsoft). Execução real e testes continuam validando na partida.
        if (Assembly.GetEntryAssembly()?.GetName().Name != "GetDocument.Insider")
        {
            opcoesProtecao.ValidateOnStart();
        }
    }

    private static void AdicionarDataProtection(WebApplicationBuilder builder)
    {
        // ApplicationName fixo: sem ele o isolamento padrão usa o caminho do conteúdo e trocar de pasta invalida tudo.
        var protecao = builder.Services.AddDataProtection().SetApplicationName("CronoAI");

        var caminho = builder.Configuration[$"{OpcoesDataProtection.Secao}:CaminhoAnel"];
        if (string.IsNullOrWhiteSpace(caminho) && builder.Environment.IsDevelopment())
        {
            // Fora do repositório e do contexto do Docker.
            caminho = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CronoAI", "chaves");
        }

        // Fora de Development sem caminho: o validador (ValidateOnStart) impede a partida. Chaves só em disco local;
        // proteção do anel em produção é decisão da Infraestrutura/Segurança.
        if (!string.IsNullOrWhiteSpace(caminho))
        {
            protecao.PersistKeysToFileSystem(new DirectoryInfo(caminho));
        }
    }

    private static void AdicionarLimitesDeTaxa(WebApplicationBuilder builder, string caminhoRetorno)
    {
        builder.Services.Configure<OpcoesBorda>(builder.Configuration.GetSection(OpcoesBorda.Secao));

        builder.Services.AddRateLimiter(opcoes =>
        {
            opcoes.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            opcoes.OnRejected = async (contexto, cancelamento) =>
            {
                if (contexto.Lease.TryGetMetadata(MetadataName.RetryAfter, out var espera))
                {
                    contexto.HttpContext.Response.Headers.RetryAfter = ((int)Math.Ceiling(espera.TotalSeconds)).ToString(CultureInfo.InvariantCulture);
                }

                // ProblemDetails genérico; sem IP, usuário ou detalhe de configuração.
                await Results.Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Muitas requisições. Tente novamente em instantes.")
                    .ExecuteAsync(contexto.HttpContext);
            };

            opcoes.AddPolicy(PoliticaAutenticacao, http => JanelaFixa("autenticacao", http, LimiteAutenticacao(http)));
            opcoes.AddPolicy(PoliticaSaude, http => JanelaFixa("saude", http, http.RequestServices.GetRequiredService<IOptions<OpcoesBorda>>().Value.LimiteSaudePorMinuto));

            // O retorno do OIDC é caminho de middleware (não é endpoint): limitador global só nele.
            opcoes.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(http =>
                http.Request.Path.StartsWithSegments(caminhoRetorno, StringComparison.OrdinalIgnoreCase)
                    ? JanelaFixa("retorno-oidc", http, LimiteAutenticacao(http))
                    : RateLimitPartition.GetNoLimiter("livre"));
        });
    }

    private static int LimiteAutenticacao(HttpContext http) =>
        http.RequestServices.GetRequiredService<IOptions<OpcoesBorda>>().Value.LimiteAutenticacaoPorMinuto;

    // Janela fixa por IP, sem fila. Sem IP (TestServer): uma partição "desconhecido".
    private static RateLimitPartition<string> JanelaFixa(string nome, HttpContext http, int limite)
    {
        var ip = http.Connection.RemoteIpAddress?.ToString() ?? "desconhecido";
        return RateLimitPartition.GetFixedWindowLimiter($"{nome}:{ip}", _ => new FixedWindowRateLimiterOptions
        {
            PermitLimit = limite,
            Window = _janela,
            QueueLimit = 0,
            AutoReplenishment = true,
        });
    }

    #endregion
}
