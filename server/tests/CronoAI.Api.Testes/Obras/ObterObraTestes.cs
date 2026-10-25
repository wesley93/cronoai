using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary><c>GET /api/v1/obras/{id}</c>: 404 idêntico para obra inexistente e para obra de outra empresa.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ObterObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ObterObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obter_inexistente_e_de_outra_empresa_404_identico()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB);

        var alheia = await api.LerAsync($"/api/v1/obras/{daB.Id}");
        var inexistente = await api.LerAsync($"/api/v1/obras/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, alheia.Status);
        Assert.Equal(HttpStatusCode.NotFound, inexistente.Status);
        Assert.Equal(alheia.CorpoSemTraceId(), inexistente.CorpoSemTraceId());
        Assert.DoesNotContain(daB.Nome, alheia.Texto, StringComparison.Ordinal);

        // Controle negativo: obra da própria empresa é lida (inclusive arquivada).
        var propria = await api.CriarObraAsync();
        Assert.Equal(HttpStatusCode.OK, (await api.LerAsync($"/api/v1/obras/{propria.Id}")).Status);
        await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{propria.Id}/arquivar", new { versao = propria.Versao });
        var arquivada = await api.LerAsync($"/api/v1/obras/{propria.Id}");
        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        Assert.NotEqual(System.Text.Json.JsonValueKind.Null, arquivada.Corpo.GetProperty("arquivadaEm").ValueKind);
    }

    #endregion
}
