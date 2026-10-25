using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>Borda: limites de taxa por IP (429 com Retry-After), host fora de AllowedHosts e ausência de CORS.</summary>
public sealed class BordaTestes
{
    #region Campos

    private const string LimiteLogin = "Borda:LimiteAutenticacaoPorMinuto";
    private const string LimiteSaude = "Borda:LimiteSaudePorMinuto";

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Limite_de_login_responde_429_com_retry_after()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco) { Configuracoes = { [LimiteLogin] = "3" } };
        using var navegador = fabrica.CriarNavegador();

        var respostas = new List<HttpResponseMessage>();
        for (var i = 0; i < 4; i++)
        {
            respostas.Add(await navegador.GetAsync("/api/v1/autenticacao/entrar", TestContext.Current.CancellationToken));
        }

        // As 3 primeiras passam (503: sem provedor configurado); a 4ª é barrada pelo limitador.
        Assert.All(respostas.Take(3), r => Assert.Equal(HttpStatusCode.ServiceUnavailable, r.StatusCode));
        var barrada = respostas[3];
        Assert.Equal(HttpStatusCode.TooManyRequests, barrada.StatusCode);
        Assert.True(barrada.Headers.TryGetValues("Retry-After", out var espera));
        Assert.True(int.Parse(espera.Single(), System.Globalization.CultureInfo.InvariantCulture) > 0);
        Assert.Equal("application/problem+json", barrada.Content.Headers.ContentType?.MediaType);
        respostas.ForEach(r => r.Dispose());
    }

    [Fact]
    public async Task Limite_no_retorno_oidc()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco) { Idp = idp, Configuracoes = { [LimiteLogin] = "3" } };
        using var navegador = fabrica.CriarNavegador();

        var codigos = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            using var resposta = await navegador.GetAsync("/signin-oidc?code=x&state=y", TestContext.Current.CancellationToken);
            codigos.Add(resposta.StatusCode);
        }

        // O retorno do OIDC é caminho de middleware (fora do EndpointDataSource): o limitador global o cobre.
        Assert.All(codigos.Take(3), c => Assert.NotEqual(HttpStatusCode.TooManyRequests, c));
        Assert.Equal(HttpStatusCode.TooManyRequests, codigos[3]);
    }

    [Fact]
    public async Task Limite_em_health_ready()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco) { Configuracoes = { [LimiteSaude] = "3" } };
        using var navegador = fabrica.CriarNavegador();

        var codigos = new List<HttpStatusCode>();
        for (var i = 0; i < 4; i++)
        {
            using var resposta = await navegador.GetAsync("/health/ready", TestContext.Current.CancellationToken);
            codigos.Add(resposta.StatusCode);
        }

        Assert.All(codigos.Take(3), c => Assert.Equal(HttpStatusCode.ServiceUnavailable, c));
        Assert.Equal(HttpStatusCode.TooManyRequests, codigos[3]);
    }

    [Fact]
    public async Task Host_nao_permitido_responde_400()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var navegador = fabrica.CriarNavegador();
        using var requisicao = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        requisicao.Headers.Host = "intruso.example";

        using var resposta = await navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);
        using var permitido = await navegador.GetAsync("/health/live", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
        Assert.Equal(HttpStatusCode.OK, permitido.StatusCode);
    }

    [Fact]
    public async Task Sem_cabecalho_cors()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var navegador = fabrica.CriarNavegador();
        using var requisicao = new HttpRequestMessage(HttpMethod.Get, "/health/live");
        requisicao.Headers.Add("Origin", "https://outra-origem.example");

        using var resposta = await navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);

        Assert.False(resposta.Headers.Contains("Access-Control-Allow-Origin"));
        Assert.False(resposta.Headers.Contains("Access-Control-Allow-Credentials"));
    }

    #endregion
}
