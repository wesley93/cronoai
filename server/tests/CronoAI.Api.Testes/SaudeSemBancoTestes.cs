using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

/// <summary>Saúde com o banco indisponível (porta fechada): não depende de Docker.</summary>
public sealed class SaudeSemBancoTestes
{
    #region Métodos públicos

    [Fact]
    public async Task Live_responde_200_mesmo_sem_banco()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/live", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("Healthy", await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Ready_responde_503_sem_banco_e_sem_detalhe()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/ready", TestContext.Current.CancellationToken);
        var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, resposta.StatusCode);
        Assert.Equal("Unhealthy", corpo);
        Assert.DoesNotContain("Npgsql", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Host", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("127.0.0.1", corpo, StringComparison.Ordinal);
    }

    #endregion
}
