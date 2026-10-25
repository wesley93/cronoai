using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary>Empresa ativa obrigatória, correlação e origem da trilha e a ausência de rota <c>DELETE</c>.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AutorizacaoObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AutorizacaoObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Rotas_de_obra_sem_empresa_ativa_403()
    {
        // Usuário logado, sem nenhuma empresa (a ativa fica vazia).
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, empresas: 0);
        var id = Guid.NewGuid();
        var corpo = AmbienteApi.CorpoDeAtualizacao(1);

        var respostas = new[]
        {
            await api.LerAsync("/api/v1/obras"),
            await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido()),
            await api.LerAsync($"/api/v1/obras/{id}"),
            await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{id}", corpo),
            await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{id}/arquivar", new { versao = 1 }),
            await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{id}/restaurar", new { versao = 1 }),
        };

        Assert.All(respostas, r =>
        {
            Assert.Equal(HttpStatusCode.Forbidden, r.Status);
            Assert.Equal("empresa-ativa-necessaria", r.Corpo.GetProperty("type").GetString());
        });
    }

    [Fact]
    public async Task Escrita_grava_correlacao_do_traceparent_e_origem_ui()
    {
        // Instante fixo, perto de "agora" (o IdP em memória emite o id_token com o relógio real; um relógio distante o invalidaria) e
        // inteiro em segundos para comparar com o que o banco devolve (microssegundos).
        var agora = DateTimeOffset.UtcNow;
        var instante = new DateTimeOffset(agora.Year, agora.Month, agora.Day, agora.Hour, agora.Minute, agora.Second, TimeSpan.Zero);
        var relogio = new RelogioTeste(instante);
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, relogio: relogio);
        var traceId = Guid.NewGuid().ToString("N");
        var cabecalhos = new Dictionary<string, string> { ["traceparent"] = $"00-{traceId}-0123456789abcdef-01" };

        var criada = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido(), cabecalhos);

        Assert.Equal(HttpStatusCode.Created, criada.Status);
        var trilha = Assert.Single(await _dados.LerAuditoriaAsync(api.EmpresaId, criada.Id));
        Assert.Equal(OrigensAuditoria.Ui, trilha.Origem);
        Assert.Equal(Guid.ParseExact(traceId, "N"), trilha.CorrelacaoId);
        Assert.Equal(instante.UtcDateTime, trilha.Em);
        Assert.Equal(instante.UtcDateTime, criada.Corpo.GetProperty("criadaEm").GetDateTime());

        // Sem traceparent a requisição tem outro TraceId (nunca o do teste anterior).
        var outra = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido());
        var trilhaOutra = Assert.Single(await _dados.LerAuditoriaAsync(api.EmpresaId, outra.Id));
        Assert.NotEqual(trilha.CorrelacaoId, trilhaOutra.CorrelacaoId);
    }

    [Fact]
    public async Task Delete_de_obra_nao_existe_405()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync();

        var resposta = await api.EscreverAsync(HttpMethod.Delete, $"/api/v1/obras/{criada.Id}");

        Assert.Equal(HttpStatusCode.MethodNotAllowed, resposta.Status);
        Assert.Equal(HttpStatusCode.OK, (await api.LerAsync($"/api/v1/obras/{criada.Id}")).Status);
        Assert.Equal(1L, await _dados.LerVersaoAsync(api.EmpresaId, criada.Id));
    }

    #endregion
}
