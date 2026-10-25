using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Dez edições simultâneas da mesma versão: uma vence, nove recebem 409 e a trilha tem uma só alteração.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ConcorrenciaObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ConcorrenciaObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Concorrencia_paralela_um_sucesso_nove_409()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        var chamadas = Enumerable.Range(0, 10).Select(async i =>
        {
            await Task.Yield();
            return await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(criada.Versao, $"Edicao {i} " + Guid.NewGuid().ToString("N")[..8]));
        }).ToList();
        var respostas = await Task.WhenAll(chamadas);

        Assert.Equal(1, respostas.Count(r => r.Status == HttpStatusCode.OK));
        Assert.Equal(9, respostas.Count(r => r.Status == HttpStatusCode.Conflict));
        Assert.All(respostas.Where(r => r.Status == HttpStatusCode.Conflict), r =>
        {
            Assert.Equal("conflito-de-versao", r.Corpo.GetProperty("type").GetString());
            Assert.Equal(2L, r.Corpo.GetProperty("estadoAtual").GetProperty("versao").GetInt64());
        });
        Assert.Equal(2L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));

        // Criação + exatamente UMA alteração.
        var trilha = await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id);
        Assert.Equal([AcoesAuditoria.Criar, AcoesAuditoria.Alterar], trilha.Select(t => t.Acao).ToArray());
    }

    [Fact]
    public async Task Versoes_sequenciais_todas_passam()
    {
        // Controle negativo: sem concorrência, as mesmas dez edições (cada uma com a versão que acabou de ler) passam todas.
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var atual = await api.CriarObraAsync();

        for (var i = 0; i < 10; i++)
        {
            atual = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{atual.Id}", AmbienteApi.CorpoDeAtualizacao(atual.Versao, $"Sequencial {i} " + Guid.NewGuid().ToString("N")[..8]));
            Assert.Equal(HttpStatusCode.OK, atual.Status);
        }

        Assert.Equal(11L, atual.Versao);
        Assert.Equal(11, (await _dados.LerAuditoriaAsync(api.EmpresaId, atual.Id)).Count);
    }

    #endregion
}
