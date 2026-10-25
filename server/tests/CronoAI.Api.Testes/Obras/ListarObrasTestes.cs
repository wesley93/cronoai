using System.Net;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary><c>GET /api/v1/obras</c>: só a empresa ativa, sem as arquivadas por padrão.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ListarObrasTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ListarObrasTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Listar_exclui_arquivadas_por_padrao()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var ativa = await api.CriarObraAsync(AmbienteApi.CorpoValido("Obra Ativa " + Guid.NewGuid().ToString("N")[..8]));
        var arquivada = await api.CriarObraAsync(AmbienteApi.CorpoValido("Obra Arquivada " + Guid.NewGuid().ToString("N")[..8]));
        var aArquivar = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{arquivada.Id}/arquivar", new { versao = arquivada.Versao });
        Assert.Equal(HttpStatusCode.OK, aArquivar.Status);

        // Obra de OUTRA empresa: nunca aparece.
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB);

        var padrao = await api.LerAsync("/api/v1/obras");
        var todas = await api.LerAsync("/api/v1/obras?incluirArquivadas=true");

        Assert.Equal(HttpStatusCode.OK, padrao.Status);
        Assert.Equal([ativa.Id], padrao.Corpo.EnumerateArray().Select(o => o.GetProperty("id").GetGuid()).ToArray());
        Assert.Equal(new[] { ativa.Id, arquivada.Id }.Order(), todas.Corpo.EnumerateArray().Select(o => o.GetProperty("id").GetGuid()).Order());
        Assert.DoesNotContain(daB.Id.ToString("D"), todas.Texto, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(daB.Nome, todas.Texto, StringComparison.Ordinal);
    }

    #endregion
}
