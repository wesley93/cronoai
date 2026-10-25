using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Empresas;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class EmpresaAtualTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public EmpresaAtualTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Login_com_uma_empresa_a_define_como_ativa()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        using var navegador = cenario.Navegador;

        using var atual = await navegador.GetAsync("/api/v1/empresas/atual", TestContext.Current.CancellationToken);
        var json = await atual.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, atual.StatusCode);
        Assert.Equal(cenario.Empresas[0], json.GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Login_com_varias_deixa_ativa_vazia()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 2);
        using var navegador = cenario.Navegador;

        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        var json = await eu.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(JsonValueKind.Null, json.GetProperty("empresaAtivaId").ValueKind);
        Assert.Equal(2, json.GetProperty("empresas").GetArrayLength());
    }

    [Fact]
    public async Task Empresa_atual_sem_empresa_ativa_responde_403()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 0);
        using var navegador = cenario.Navegador;

        using var atual = await navegador.GetAsync("/api/v1/empresas/atual", TestContext.Current.CancellationToken);
        var json = await atual.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Forbidden, atual.StatusCode);
        Assert.Equal("empresa-ativa-necessaria", json.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Trocar_para_empresa_propria_persiste()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 2);
        using var navegador = cenario.Navegador;
        var escolhida = cenario.Empresas[1];

        using var troca = await ClienteAutenticado.EscreverAsync(navegador, HttpMethod.Put, "/api/v1/empresas/atual", new { empresaId = escolhida });
        using var atual = await navegador.GetAsync("/api/v1/empresas/atual", TestContext.Current.CancellationToken);
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, troca.StatusCode);
        Assert.Equal(escolhida, (await atual.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("id").GetGuid());
        Assert.Equal(escolhida, (await eu.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("empresaAtivaId").GetGuid());
    }

    [Fact]
    public async Task Trocar_para_empresa_alheia_ou_inexistente_responde_404_identico()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        using var navegador = cenario.Navegador;
        var alheia = await _dados.CriarEmpresaComMembrosAsync(await _dados.CriarUsuarioAsync());

        using var paraAlheia = await ClienteAutenticado.EscreverAsync(navegador, HttpMethod.Put, "/api/v1/empresas/atual", new { empresaId = alheia });
        using var paraInexistente = await ClienteAutenticado.EscreverAsync(navegador, HttpMethod.Put, "/api/v1/empresas/atual", new { empresaId = Guid.NewGuid() });

        Assert.Equal(HttpStatusCode.NotFound, paraAlheia.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, paraInexistente.StatusCode);
        Assert.Equal(await CorpoSemTraceIdAsync(paraAlheia), await CorpoSemTraceIdAsync(paraInexistente));
        // A empresa ativa não mudou.
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(cenario.Empresas[0], (await eu.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken)).GetProperty("empresaAtivaId").GetGuid());
    }

    [Fact]
    public async Task Escrita_sem_antiforgery_responde_400()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 2);
        using var navegador = cenario.Navegador;

        using var semToken = await navegador.PutAsJsonAsync("/api/v1/empresas/atual", new { empresaId = cenario.Empresas[0] }, TestContext.Current.CancellationToken);
        using var comToken = await ClienteAutenticado.EscreverAsync(navegador, HttpMethod.Put, "/api/v1/empresas/atual", new { empresaId = cenario.Empresas[0] });

        Assert.Equal(HttpStatusCode.BadRequest, semToken.StatusCode);
        Assert.Equal(HttpStatusCode.OK, comToken.StatusCode);
    }

    #endregion

    #region Métodos privados

    private static async Task<string> CorpoSemTraceIdAsync(HttpResponseMessage resposta)
    {
        var json = await resposta.Content.ReadFromJsonAsync<Dictionary<string, JsonElement>>(TestContext.Current.CancellationToken);
        json!.Remove("traceId");
        return JsonSerializer.Serialize(json.OrderBy(p => p.Key, StringComparer.Ordinal).ToDictionary(p => p.Key, p => p.Value));
    }

    #endregion
}
