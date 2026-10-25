using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

public sealed class CabecalhosTestes
{
    #region Métodos públicos

    [Theory]
    [InlineData("/health/live")]
    [InlineData("/api/v1/nao-existe")]
    public async Task Respostas_trazem_cabecalhos_de_seguranca(string caminho)
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync(caminho, TestContext.Current.CancellationToken);

        Assert.Equal("nosniff", Unico(resposta.Headers, "X-Content-Type-Options"));
        Assert.Equal("no-store", Unico(resposta.Headers, "Cache-Control"));
        Assert.Equal("default-src 'none'; frame-ancestors 'none'", Unico(resposta.Headers, "Content-Security-Policy"));
        Assert.Equal("no-referrer", Unico(resposta.Headers, "Referrer-Policy"));
    }

    [Fact]
    public async Task Sem_cabecalho_Server()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/live", TestContext.Current.CancellationToken);

        Assert.False(resposta.Headers.Contains("Server"));
    }

    #endregion

    #region Métodos privados

    private static string Unico(System.Net.Http.Headers.HttpResponseHeaders cabecalhos, string nome)
    {
        Assert.True(cabecalhos.TryGetValues(nome, out var valores), $"cabeçalho {nome} ausente");
        return Assert.Single(valores);
    }

    #endregion
}
