using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Arquivar e restaurar: versionados, auditados e com 409 diante do estado errado.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ArquivamentoObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ArquivamentoObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Arquivar_e_restaurar_com_versao_e_auditoria()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao, motivo = "obra concluída" });

        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        Assert.Equal(2L, arquivada.Versao);
        Assert.Equal(JsonValueKind.String, arquivada.Corpo.GetProperty("arquivadaEm").ValueKind);
        Assert.Empty((await api.LerAsync("/api/v1/obras")).Corpo.EnumerateArray());

        var restaurada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = arquivada.Versao });

        Assert.Equal(HttpStatusCode.OK, restaurada.Status);
        Assert.Equal(3L, restaurada.Versao);
        Assert.Equal(JsonValueKind.Null, restaurada.Corpo.GetProperty("arquivadaEm").ValueKind);
        Assert.Single((await api.LerAsync("/api/v1/obras")).Corpo.EnumerateArray());

        var trilha = await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id);
        Assert.Equal([AcoesAuditoria.Criar, AcoesAuditoria.Arquivar, AcoesAuditoria.Restaurar], trilha.Select(t => t.Acao).ToArray());
        Assert.Equal("obra concluída", trilha[1].Motivo);
        Assert.Equal([1L, 2L, 3L], trilha.Select(t => t.VersaoDepois!.Value).ToArray());
    }

    [Fact]
    public async Task Arquivar_arquivada_e_restaurar_ativa_409()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        // Restaurar obra ativa.
        var restaurarAtiva = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = criada.Versao });
        Assert.Equal(HttpStatusCode.Conflict, restaurarAtiva.Status);
        Assert.Equal("obra-nao-arquivada", restaurarAtiva.Corpo.GetProperty("type").GetString());
        Assert.Equal(criada.Versao, restaurarAtiva.Corpo.GetProperty("estadoAtual").GetProperty("versao").GetInt64());

        // Arquivar obra arquivada (com a versão certa).
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao });
        var arquivarDeNovo = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = arquivada.Versao });
        Assert.Equal(HttpStatusCode.Conflict, arquivarDeNovo.Status);
        Assert.Equal("obra-arquivada", arquivarDeNovo.Corpo.GetProperty("type").GetString());
        Assert.NotEqual(JsonValueKind.Null, arquivarDeNovo.Corpo.GetProperty("estadoAtual").GetProperty("arquivadaEm").ValueKind);

        // Os conflitos não gravaram nada: criar + arquivar.
        Assert.Equal(2, (await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id)).Count);
        Assert.Equal(arquivada.Versao, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
    }

    [Fact]
    public async Task Arquivar_sem_versao_ou_com_versao_velha_recusa()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        var semVersao = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { motivo = "x" });
        var velha = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = 7 });

        Assert.Equal(HttpStatusCode.BadRequest, semVersao.Status);
        Assert.Equal("versao", Assert.Single(semVersao.Corpo.GetProperty("errors").EnumerateObject()).Name);
        Assert.Equal(HttpStatusCode.Conflict, velha.Status);
        Assert.Equal("conflito-de-versao", velha.Corpo.GetProperty("type").GetString());
        Assert.Equal(1L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
    }

    #endregion
}
