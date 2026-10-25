using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

[Collection(ColecaoBanco.Nome)]
public sealed class SaudeTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public SaudeTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Live_responde_200_mesmo_sem_banco()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/live", TestContext.Current.CancellationToken);

        Assert.Equal(System.Net.HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("Healthy", await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    [Trait("Categoria", "Integracao")]
    public async Task Ready_responde_200_com_banco_migrado()
    {
        // Conexão do papel cronoai_app, como a API real.
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        Assert.Equal(System.Net.HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("Healthy", await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Ready_responde_503_sem_banco_e_sem_detalhe()
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/ready", TestContext.Current.CancellationToken);
        var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, resposta.StatusCode);
        Assert.Equal("Unhealthy", corpo);
        Assert.DoesNotContain("Npgsql", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Host", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("password", corpo, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("127.0.0.1", corpo, StringComparison.Ordinal);
    }

    #endregion
}
