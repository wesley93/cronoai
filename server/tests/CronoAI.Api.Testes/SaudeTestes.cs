using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

/// <summary>Saúde com banco migrado: precisa do contêiner PostgreSQL (coleção Banco).</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
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
    public async Task Ready_responde_200_com_banco_migrado()
    {
        // Conexão do papel cronoai_app, como a API real.
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp);
        using var cliente = fabrica.CreateClient();

        var resposta = await cliente.GetAsync("/health/ready", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal("Healthy", await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));
    }

    #endregion
}
