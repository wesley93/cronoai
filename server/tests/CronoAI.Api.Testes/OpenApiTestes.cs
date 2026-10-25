using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

public sealed class OpenApiTestes
{
    #region Métodos públicos

    [Fact]
    public async Task Documento_openapi_so_em_desenvolvimento()
    {
        await using var desenvolvimento = new ApiFactory(ApiFactory.ConexaoSemBanco, "Development");
        using var clienteDev = desenvolvimento.CreateClient();
        var emDev = await clienteDev.GetAsync("/openapi/v1.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, emDev.StatusCode);
        Assert.Contains("\"openapi\"", await emDev.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);

        await using var producao = new ApiFactory(ApiFactory.ConexaoSemBanco, "Production");
        using var clienteProd = producao.CreateClient();
        var emProd = await clienteProd.GetAsync("/openapi/v1.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, emProd.StatusCode);
    }

    #endregion
}
