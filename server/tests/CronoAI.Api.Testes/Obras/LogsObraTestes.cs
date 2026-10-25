using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary>As escritas de obra só registram ids em log (RF-12.9): nunca nome, motivo nem o conteúdo da obra.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class LogsObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public LogsObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Escritas_de_obra_nao_logam_nome_motivo_nem_conteudo()
    {
        var logs = new LogsEmMemoria();
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, logs: logs);
        var sufixo = Guid.NewGuid().ToString("N");
        var nome = "NOME-SECRETO-" + sufixo;
        var nomeNovo = "NOME-NOVO-" + sufixo;
        var motivo = "MOTIVO-SECRETO-" + sufixo;
        var opcao = "OPCAO-SECRETA-" + sufixo;

        var corpo = AmbienteApi.CorpoValido(nome);
        corpo["motivo"] = motivo;
        corpo["opcoesCronograma"] = JsonSerializer.SerializeToElement(new { chave = opcao });
        var criada = await api.CriarObraAsync(corpo);

        var atualizacao = AmbienteApi.CorpoDeAtualizacao(criada.Versao, nomeNovo);
        atualizacao["motivo"] = motivo;
        var alterada = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", atualizacao);
        Assert.Equal(HttpStatusCode.OK, alterada.Status);
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = alterada.Versao, motivo });
        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = arquivada.Versao, motivo });

        // Também as recusas (400, 409 e 404) não vazam o conteúdo.
        await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(1, nomeNovo + "x"));
        await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", new { nome = nomeNovo, uf = "xx", motivo });
        await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{Guid.NewGuid()}", atualizacao);

        var tudo = logs.Tudo;
        foreach (var proibido in new[] { nome, nomeNovo, motivo, opcao, sufixo })
        {
            Assert.DoesNotContain(proibido, tudo, StringComparison.Ordinal);
        }

        // Controle negativo: o id da obra aparece (o log existe e é útil, só não leva conteúdo).
        Assert.Contains(criada.Id.ToString("D"), tudo, StringComparison.OrdinalIgnoreCase);
    }

    #endregion
}
