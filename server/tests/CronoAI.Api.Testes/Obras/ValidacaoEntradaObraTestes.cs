using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Validação da entrada que fica entre o domínio e o banco: UF inexistente e a borda do teto de <c>opcoes_cronograma</c>.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ValidacaoEntradaObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ValidacaoEntradaObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Uf_inexistente_da_400_na_chave_uf_ao_criar_e_ao_atualizar()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        corpo["uf"] = "XX";

        var criar = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        // A chave é SEMPRE "uf" (antes dependia de qual FK do banco reclamava primeiro) e a mensagem é a certa.
        Assert.Equal(HttpStatusCode.BadRequest, criar.Status);
        var erro = Assert.Single(criar.Corpo.GetProperty("errors").EnumerateObject());
        Assert.Equal("uf", erro.Name);
        Assert.Equal("UF inexistente.", erro.Value[0].GetString());

        var obra = await api.CriarObraAsync();
        var atualizar = AmbienteApi.CorpoDeAtualizacao(obra.Versao);
        atualizar["uf"] = "XX";
        var put = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", atualizar);
        Assert.Equal(HttpStatusCode.BadRequest, put.Status);
        Assert.Equal("uf", Assert.Single(put.Corpo.GetProperty("errors").EnumerateObject()).Name);

        // O 400 não depende da obra existir (a lista de UF é global): obra inexistente com UF inválida também é 400.
        var emInexistente = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{Guid.NewGuid()}", atualizar);
        Assert.Equal(HttpStatusCode.BadRequest, emInexistente.Status);

        // Controle negativo: a UF existente passa.
        Assert.Equal(HttpStatusCode.Created, (await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido())).Status);
    }

    [Fact]
    public async Task Sinapi_uf_inexistente_da_400_na_chave_sinapi_uf()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        corpo["sinapi"] = new { uf = "XX", regime = "desonerado", dataBase = "2026-09-01" };

        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.Status);
        Assert.Equal("sinapi.uf", Assert.Single(resposta.Corpo.GetProperty("errors").EnumerateObject()).Name);
    }

    [Fact]
    public async Task Opcoes_na_borda_do_teto_do_jsonb_1365_pares_passam_e_1366_dao_400()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);

        // 1365 pares compactos = 16380 bytes no texto do jsonb (cabe): o banco aceita e a API devolve 201.
        var cabe = AmbienteApi.CorpoValido();
        cabe["opcoesCronograma"] = JsonDocument.Parse(DadosTeste.ParesCompactos(1365)).RootElement.Clone();
        Assert.Equal(HttpStatusCode.Created, (await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", cabe)).Status);

        // 1366 pares: o texto compacto tem 13659 bytes (folga), mas o jsonb escreve 16392 (não cabe). A API recusa com 400
        // ANTES de gravar (o banco recusaria com 23514 e levaria a linha inteira ao erro).
        var estoura = AmbienteApi.CorpoValido();
        estoura["opcoesCronograma"] = JsonDocument.Parse(DadosTeste.ParesCompactos(1366)).RootElement.Clone();
        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", estoura);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.Status);
        Assert.Equal("opcoesCronograma", Assert.Single(resposta.Corpo.GetProperty("errors").EnumerateObject()).Name);
    }

    [Theory]
    [InlineData("1e131071")]
    [InlineData("1e-16383")]
    [InlineData("1E5")]
    public async Task Opcoes_com_numero_exponencial_dao_400_no_post_e_no_put(string numero)
    {
        // {"a":1e131071} tem 14 bytes e o jsonb o escreve com ~131 KB: ~1.000 chaves montariam ~131 MB no PostgreSQL (DoS).
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        corpo["opcoesCronograma"] = JsonDocument.Parse("{\"a\":" + numero + "}").RootElement.Clone();

        var post = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.BadRequest, post.Status);
        Assert.Equal("opcoesCronograma", Assert.Single(post.Corpo.GetProperty("errors").EnumerateObject()).Name);

        // PUT com DOIS expoentes: também 400 (antes a trilha estouraria o CHECK do "depois" e daria 500) e a obra fica intacta.
        var obra = await api.CriarObraAsync();
        var atualizacao = AmbienteApi.CorpoDeAtualizacao(obra.Versao);
        atualizacao["opcoesCronograma"] = JsonDocument.Parse("{\"a\":" + numero + ",\"b\":1e-16383}").RootElement.Clone();
        var put = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", atualizacao);

        Assert.Equal(HttpStatusCode.BadRequest, put.Status);
        Assert.Equal(obra.Versao, await _dados.LerVersaoAsync(api.EmpresaId, obra.Id));
        Assert.Single(await _dados.LerAuditoriaAsync(api.EmpresaId, obra.Id));
    }

    [Fact]
    public async Task Opcoes_com_numero_decimal_longo_mas_dentro_do_teto_passam()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        corpo["opcoesCronograma"] = JsonDocument.Parse("{\"a\":1234567890.12345678901234567890,\"b\":[-0.000001,42]}").RootElement.Clone();

        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.Created, resposta.Status);
    }

    #endregion
}
