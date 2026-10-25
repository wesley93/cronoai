using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Autenticacao;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>
/// Nome de exibição vindo do provedor é dado externo: sem controle (inclui U+0000), cortado sem partir par substituto,
/// gravado como veio no token (nulo se o provedor não mandou, sem preservar valor antigo) e nunca motivo para recusar o login.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class NomeExibicaoTestes
{
    #region Campos

    private const string Emoji = "\U0001F600";

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public NomeExibicaoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("Ana\u0000Silva", "AnaSilva")]
    [InlineData("  \u0001Bia\u0007 Souza\u001f  ", "Bia Souza")]
    [InlineData("\u0000\u0001\u0002", null)]
    [InlineData("   ", null)]
    public void NomeSeguro_remove_controle_e_normaliza(string entrada, string? esperado)
    {
        Assert.Equal(esperado, ServicoLogin.NomeSeguro(entrada));
    }

    [Fact]
    public void NomeSeguro_corta_sem_partir_par_substituto()
    {
        // Emoji ocupa 2 unidades UTF-16. Termina exatamente em 200: cabe inteiro.
        var cabe = new string('a', 198) + Emoji + "zzz";
        Assert.Equal(new string('a', 198) + Emoji, ServicoLogin.NomeSeguro(cabe));

        // Começaria na unidade 200 e terminaria na 201: sai inteiro, sem metade de par.
        var naoCabe = new string('a', 199) + Emoji;
        Assert.Equal(new string('a', 199), ServicoLogin.NomeSeguro(naoCabe));
        Assert.DoesNotContain(ServicoLogin.NomeSeguro(naoCabe)!, c => char.IsSurrogate(c));
    }

    [Fact]
    public async Task Login_com_caractere_nulo_no_nome_funciona_e_grava_nome_limpo()
    {
        var nome = await LogarEObterNomeAsync("Ana\u0000Silva");

        Assert.Equal("AnaSilva", nome.Nome);
        Assert.Equal(HttpStatusCode.Redirect, nome.StatusDoLogin);
    }

    [Theory]
    [InlineData(198, "zzz", 198, true)]
    [InlineData(199, "", 199, false)]
    [InlineData(200, "x", 200, false)]
    public async Task Login_com_emoji_na_posicao_199_200_nao_e_recusado_nem_parte_o_par(int antes, string depois, int letrasEsperadas, bool emojiEsperado)
    {
        var nome = new string('a', antes) + (antes == 200 ? "" : Emoji) + depois;

        var resultado = await LogarEObterNomeAsync(nome);

        Assert.Equal(HttpStatusCode.Redirect, resultado.StatusDoLogin);
        var esperado = new string('a', letrasEsperadas) + (emojiEsperado ? Emoji : "");
        Assert.Equal(esperado, resultado.Nome);
        Assert.DoesNotContain(resultado.Nome!, c => char.IsSurrogate(c) && !emojiEsperado);
    }

    [Fact]
    public async Task Nome_so_com_caracteres_de_controle_grava_nulo_sem_recusar_o_login()
    {
        var resultado = await LogarEObterNomeAsync("\u0000\u0001");

        Assert.Equal(HttpStatusCode.Redirect, resultado.StatusDoLogin);
        Assert.Null(resultado.Nome);
    }

    [Fact]
    public async Task Provedor_que_nao_manda_nome_grava_nulo_sem_manter_o_antigo()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        // 1º login com nome; 2º sem a claim "name": minimização, o nome antigo não é preservado.
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = "Nome Antigo" };
        using (var primeiro = fabrica.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(primeiro, idp)).Dispose();
            Assert.Equal("Nome Antigo", await LerNomeAsync(primeiro));
        }

        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = null };
        using var segundo = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(segundo, idp)).Dispose();

        Assert.Null(await LerNomeAsync(segundo));
    }

    #endregion

    #region Métodos privados

    private async Task<(HttpStatusCode StatusDoLogin, string? Nome)> LogarEObterNomeAsync(string nomeDoProvedor)
    {
        using var idp = new IdpEmMemoria();
        idp.ProximoToken = new DefinicaoToken { Nome = nomeDoProvedor };
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var retorno = await ClienteAutenticado.LoginOidcAsync(navegador, idp);

        return (retorno.StatusCode, retorno.StatusCode == HttpStatusCode.Redirect ? await LerNomeAsync(navegador) : null);
    }

    private static async Task<string?> LerNomeAsync(HttpClient navegador)
    {
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        var json = await eu.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        return json.GetProperty("nomeExibicao").GetString();
    }

    #endregion
}
