using CronoAI.Api.Testes.Infra;
using Microsoft.AspNetCore.Server.Kestrel.Core;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

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
    public void Kestrel_nao_anuncia_cabecalho_Server()
    {
        // O TestServer não usa o Kestrel e nunca emitiria "Server": ausência na resposta não provaria nada.
        // Prova-se a configuração real do host (Program.cs: AddServerHeader = false).
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);

        var opcoes = fabrica.Services.GetRequiredService<IOptions<KestrelServerOptions>>().Value;

        Assert.False(opcoes.AddServerHeader);
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
