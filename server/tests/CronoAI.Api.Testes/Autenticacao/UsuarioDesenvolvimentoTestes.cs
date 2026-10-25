using System.Net;
using System.Net.Http.Json;
using CronoAI.Api.Desenvolvimento;
using CronoAI.Api.Testes.Infra;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>
/// Usuário de desenvolvimento: dois interruptores (Development e flag), falha fechada na partida, mesma porta do login
/// real, recusa do emissor reservado fora de Development.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class UsuarioDesenvolvimentoTestes
{
    #region Campos

    private const string Flag = "Autenticacao:UsuarioDesenvolvimento:Habilitado";
    private const string RotaDesenvolvimento = "/api/v1/autenticacao/desenvolvimento/entrar";

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public UsuarioDesenvolvimentoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("Production")]
    [InlineData("Staging")]
    [InlineData("Homologacao")]
    public void Api_nao_sobe_fora_de_Development_com_usuario_dev_ligado(string ambiente)
    {
        using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco, ambiente) { Configuracoes = { [Flag] = "true" } };

        var erro = Record.Exception(() => fabrica.CreateClient());

        var validacao = Excecoes.Procurar<OptionsValidationException>(erro);
        Assert.NotNull(validacao);
        Assert.Contains("usuário de desenvolvimento", string.Join(' ', validacao.Failures), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("Development", "false")]
    [InlineData("Production", "false")]
    public async Task Rota_dev_nao_existe_sem_os_dois_interruptores(string ambiente, string flag)
    {
        await using var fabrica = new ApiFactory(ApiFactory.ConexaoSemBanco, ambiente) { Configuracoes = { [Flag] = flag } };
        using var navegador = fabrica.CriarNavegador();

        var rotas = fabrica.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().Select(e => e.RoutePattern.RawText).ToList();
        using var resposta = await navegador.PostAsJsonAsync(RotaDesenvolvimento, new { usuario = "dev-a" }, TestContext.Current.CancellationToken);

        Assert.DoesNotContain(RotaDesenvolvimento, rotas);
        // Sem a rota, a requisição anônima cai no 404 (nem chega a pedir login).
        Assert.True(resposta.StatusCode is HttpStatusCode.NotFound or HttpStatusCode.Unauthorized);
        Assert.NotEqual(HttpStatusCode.NoContent, resposta.StatusCode);
    }

    [Fact]
    public async Task Development_com_flag_entra_como_dev_a_e_dev_b()
    {
        await using var fabrica = CriarFabricaDev();
        await fabrica.Services.GetRequiredService<SementeDesenvolvimento>().ExecutarAsync(TestContext.Current.CancellationToken);

        foreach (var (usuario, nomeEsperado) in new[] { ("dev-a", IdsDesenvolvimento.NomeDevA), ("dev-b", IdsDesenvolvimento.NomeDevB) })
        {
            using var navegador = fabrica.CriarNavegador();

            using var login = await ClienteAutenticado.LoginDesenvolvimentoAsync(navegador, usuario);
            using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
            var corpo = await eu.Content.ReadFromJsonAsync<Dictionary<string, System.Text.Json.JsonElement>>(TestContext.Current.CancellationToken);

            Assert.Equal(HttpStatusCode.NoContent, login.StatusCode);
            Assert.Equal(HttpStatusCode.OK, eu.StatusCode);
            Assert.Equal(nomeEsperado, corpo!["nomeExibicao"].GetString());
        }
    }

    [Fact]
    public async Task Usuario_dev_desconhecido_responde_400()
    {
        await using var fabrica = CriarFabricaDev();
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await ClienteAutenticado.LoginDesenvolvimentoAsync(navegador, "dev-c");

        Assert.Equal(HttpStatusCode.BadRequest, resposta.StatusCode);
    }

    [Fact]
    public async Task Sessao_de_emissor_dev_recusada_fora_de_Development()
    {
        // Login em Development; o MESMO cookie, apresentado a um host de Production com o mesmo anel de chaves.
        await using var dev = CriarFabricaDev();
        using var navegadorDev = dev.CriarNavegador();
        using var login = await ClienteAutenticado.LoginDesenvolvimentoAsync(navegadorDev, "dev-a");
        var cookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal)).Split(';')[0];

        await using var producao = new ApiFactory(_banco.StringConexaoApp, "Production") { Configuracoes = { ["DataProtection:CaminhoAnel"] = dev.PastaAnel } };
        using var navegadorProducao = producao.CriarNavegador();
        using var requisicao = new HttpRequestMessage(HttpMethod.Get, "/api/v1/eu");
        requisicao.Headers.Add("Cookie", cookie);

        using var resposta = await navegadorProducao.SendAsync(requisicao, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);

        // Controle: o mesmo cookie vale no host de Development.
        using var ok = await navegadorDev.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
    }

    #endregion

    #region Métodos privados

    private ApiFactory CriarFabricaDev() => new(_banco.StringConexaoApp, "Development") { Configuracoes = { [Flag] = "true" } };

    #endregion
}
