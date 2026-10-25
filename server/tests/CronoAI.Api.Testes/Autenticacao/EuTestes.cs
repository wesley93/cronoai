using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class EuTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public EuTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Eu_devolve_usuario_e_suas_empresas()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, quantidadeDeEmpresas: 1, nome: "Maria Ficticia");
        using var navegador = cenario.Navegador;
        var empresaAlheia = await _dados.CriarEmpresaComMembrosAsync(await _dados.CriarUsuarioAsync());

        using var resposta = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        var json = await resposta.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        Assert.Equal(cenario.UsuarioId, json.GetProperty("id").GetGuid());
        Assert.Equal("Maria Ficticia", json.GetProperty("nomeExibicao").GetString());
        var empresas = json.GetProperty("empresas").EnumerateArray().Select(e => e.GetProperty("id").GetGuid()).ToList();
        Assert.Equal(cenario.Empresas, empresas);
        Assert.DoesNotContain(empresaAlheia, empresas);
        Assert.Equal(cenario.Empresas[0], json.GetProperty("empresaAtivaId").GetGuid());
    }

    [Fact]
    public async Task Eu_sem_sessao_responde_401()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        // 401 em ProblemDetails, nunca 302 (um fetch não segue login por redirecionamento).
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
        Assert.Null(resposta.Headers.Location);
        Assert.Equal("application/problem+json", resposta.Content.Headers.ContentType?.MediaType);
    }

    #endregion
}
