using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary><c>PUT /api/v1/obras/{id}</c>: substituição com versão, 409 com o estado atual e 404 para obra alheia.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AtualizarObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AtualizarObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Atualizar_com_versao_atual_200_e_auditoria()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();
        var novoNome = "Obra Renomeada " + Guid.NewGuid().ToString("N")[..8];
        var corpo = AmbienteApi.CorpoDeAtualizacao(criada.Versao, novoNome);
        corpo["motivo"] = "revisão de prazo";

        var resposta = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", corpo);

        Assert.Equal(HttpStatusCode.OK, resposta.Status);
        Assert.Equal(2L, resposta.Versao);
        Assert.Equal(novoNome, resposta.Corpo.GetProperty("nome").GetString());

        // Uma linha nova: ação alterar, só o campo que mudou, com o motivo.
        var trilha = await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id);
        Assert.Equal(2, trilha.Count);
        var alterar = trilha[1];
        Assert.Equal(AcoesAuditoria.Alterar, alterar.Acao);
        Assert.Equal("revisão de prazo", alterar.Motivo);
        Assert.Equal(2L, alterar.VersaoDepois);
        using var depois = JsonDocument.Parse(alterar.Depois!);
        Assert.Equal(["nome"], depois.RootElement.EnumerateObject().Select(p => p.Name).ToArray());
    }

    [Fact]
    public async Task Atualizar_sem_versao_400()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        var resposta = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoValido());

        Assert.Equal(HttpStatusCode.BadRequest, resposta.Status);
        Assert.Equal("versao", Assert.Single(resposta.Corpo.GetProperty("errors").EnumerateObject()).Name);
        Assert.Equal(1L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
    }

    [Fact]
    public async Task Atualizar_com_versao_velha_409_com_estado_atual_sem_gravar()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();
        var nomeDaPrimeira = "Gravado pela primeira aba " + Guid.NewGuid().ToString("N")[..8];
        var primeira = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(criada.Versao, nomeDaPrimeira));
        Assert.Equal(HttpStatusCode.OK, primeira.Status);

        // A segunda aba ainda tem a versão 1.
        var segunda = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(criada.Versao, "Nao Deve Gravar"));

        Assert.Equal(HttpStatusCode.Conflict, segunda.Status);
        Assert.Equal("conflito-de-versao", segunda.Corpo.GetProperty("type").GetString());
        var estado = segunda.Corpo.GetProperty("estadoAtual");
        Assert.Equal(2L, estado.GetProperty("versao").GetInt64());
        Assert.Equal(nomeDaPrimeira, estado.GetProperty("nome").GetString());

        // Nada foi sobrescrito e nada foi auditado a mais (criar + a primeira alteração).
        Assert.Equal(2L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
        Assert.Equal(2, (await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id)).Count);

        // Controle negativo: relida a obra, o PUT com a versão certa passa (versão 3).
        var terceira = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(2, "Obra Depois de Reler " + Guid.NewGuid().ToString("N")[..8]));
        Assert.Equal(HttpStatusCode.OK, terceira.Status);
        Assert.Equal(3L, terceira.Versao);
    }

    [Theory]
    [InlineData("PUT")]
    [InlineData("arquivar")]
    [InlineData("restaurar")]
    public async Task Escrita_em_obra_de_outra_empresa_404_sem_alterar_nem_auditar(string operacao)
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB);

        // Com a versão CERTA da obra de B: se fosse "carregar depois", sairia 409. O correto é 404, nunca 409.
        var resposta = operacao switch
        {
            "PUT" => await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{daB.Id}", AmbienteApi.CorpoDeAtualizacao(daB.Versao, "Invasao")),
            "arquivar" => await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{daB.Id}/arquivar", new { versao = daB.Versao }),
            _ => await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{daB.Id}/restaurar", new { versao = daB.Versao }),
        };

        Assert.Equal(HttpStatusCode.NotFound, resposta.Status);
        Assert.DoesNotContain(daB.Nome, resposta.Texto, StringComparison.Ordinal);
        Assert.Equal(daB.Versao, await _dados.LerVersaoAsync(empresaB, daB.Id));
        Assert.Single(await _dados.LerAuditoriaAsync(empresaB, daB.Id));
    }

    [Fact]
    public async Task Atualizar_sem_mudanca_nao_incrementa_nem_audita()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var nome = "Obra Sem Mudanca " + Guid.NewGuid().ToString("N")[..8];
        var criada = await api.CriarObraAsync(AmbienteApi.CorpoValido(nome));

        // Mesmos dados (o nome com espaços nas pontas é aparado: continua o mesmo).
        var resposta = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(criada.Versao, "  " + nome + "  "));

        Assert.Equal(HttpStatusCode.OK, resposta.Status);
        Assert.Equal(1L, resposta.Versao);
        Assert.Equal(1L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
        Assert.Single(await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id));
    }

    [Fact]
    public async Task Atualizar_obra_arquivada_409()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao });

        var resposta = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(arquivada.Versao, "Tentativa em Arquivada"));

        Assert.Equal(HttpStatusCode.Conflict, resposta.Status);
        Assert.Equal("obra-arquivada", resposta.Corpo.GetProperty("type").GetString());
        Assert.NotEqual(JsonValueKind.Null, resposta.Corpo.GetProperty("estadoAtual").GetProperty("arquivadaEm").ValueKind);
        Assert.Equal(arquivada.Versao, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
    }

    #endregion
}
