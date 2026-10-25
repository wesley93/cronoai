using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes;

/// <summary>Cabeçalhos de segurança também nas respostas 302, 401, 403 e 429 (AC-7 do ciclo 00011 estendido).</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class CabecalhosAutenticadosTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public CabecalhosAutenticadosTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Cabecalhos_de_seguranca_em_302_401_403_429()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Configuracoes = { ["Borda:LimiteSaudePorMinuto"] = "2" } };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 0);
        using var logado = cenario.Navegador;
        using var anonimo = fabrica.CriarNavegador();

        using var redirecionamento = await anonimo.GetAsync("/api/v1/autenticacao/entrar", TestContext.Current.CancellationToken);
        using var naoAutenticado = await anonimo.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        using var proibido = await logado.GetAsync("/api/v1/empresas/atual", TestContext.Current.CancellationToken);
        (await anonimo.GetAsync("/health/ready", TestContext.Current.CancellationToken)).Dispose();
        (await anonimo.GetAsync("/health/ready", TestContext.Current.CancellationToken)).Dispose();
        using var limitado = await anonimo.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Redirect, redirecionamento.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, naoAutenticado.StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, proibido.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, limitado.StatusCode);
        foreach (var resposta in new[] { redirecionamento, naoAutenticado, proibido, limitado })
        {
            Assert.Equal("nosniff", Unico(resposta, "X-Content-Type-Options"));
            Assert.Equal("no-store", Unico(resposta, "Cache-Control"));
            Assert.Equal("default-src 'none'; frame-ancestors 'none'", Unico(resposta, "Content-Security-Policy"));
            Assert.Equal("no-referrer", Unico(resposta, "Referrer-Policy"));
        }
    }

    #endregion

    #region Métodos privados

    private static string Unico(HttpResponseMessage resposta, string nome)
    {
        Assert.True(resposta.Headers.TryGetValues(nome, out var valores), $"cabeçalho {nome} ausente em {(int)resposta.StatusCode}");
        return Assert.Single(valores);
    }

    #endregion
}
