using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Autenticacao;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dados.Identidade;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Npgsql;

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

    [Theory]
    [InlineData(0x200E)]
    [InlineData(0x200F)]
    [InlineData(0x202A)]
    [InlineData(0x202B)]
    [InlineData(0x202C)]
    [InlineData(0x202D)]
    [InlineData(0x202E)]
    [InlineData(0x2066)]
    [InlineData(0x2067)]
    [InlineData(0x2068)]
    [InlineData(0x2069)]
    public void NomeSeguro_remove_controles_bidirecionais(int pontoDeCodigo)
    {
        // Os controles bidirecionais invertem a ordem de exibição (nome forjado na tela): fora, em qualquer posição.
        var controle = ((char)pontoDeCodigo).ToString();

        Assert.Equal("Ana Silva", ServicoLogin.NomeSeguro("Ana" + controle + " Silva"));
        Assert.Equal("Ana", ServicoLogin.NomeSeguro(controle + "Ana" + controle));
    }

    [Fact]
    public void NomeSeguro_remove_surrogate_orfao()
    {
        // Os valores são montados aqui (o xUnit troca surrogate órfão por U+FFFD ao serializar dados de teoria).
        var altoOrfao = ((char)0xD800).ToString();
        var baixoOrfao = ((char)0xDC00).ToString();

        Assert.Equal("AnaSilva", ServicoLogin.NomeSeguro("Ana" + altoOrfao + "Silva"));
        Assert.Equal("Bia", ServicoLogin.NomeSeguro(baixoOrfao + "Bia"));
        Assert.Equal("Cris", ServicoLogin.NomeSeguro("Cris" + altoOrfao));
        Assert.Null(ServicoLogin.NomeSeguro(baixoOrfao + altoOrfao)); // baixo antes de alto: nenhum é par válido
        Assert.Equal("a" + Emoji + "b", ServicoLogin.NomeSeguro("a" + Emoji + altoOrfao + "b")); // par válido preservado
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

    [Fact]
    public async Task Nome_com_surrogate_orfao_e_saneado_e_gravado()
    {
        var servico = CriarServico();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");

        var resultado = await servico.EntrarAsync("https://idp-nome.teste", sujeito, "Ana" + (char)0xD800 + "Silva" + (char)0xDC00, desenvolvimento: false, cancelamento: TestContext.Current.CancellationToken);

        Assert.NotNull(resultado);
        Assert.Equal("AnaSilva", await new ConsultasIdentidade(_banco.FabricaApp).ObterNomeExibicaoAsync(resultado.UsuarioId, TestContext.Current.CancellationToken));
    }

    [Theory]
    [InlineData("nome-que-explode", "40001")] // serialization_failure (transitório)
    [InlineData("nome-erro-comum", "P0001")] // raise_exception genérico
    public async Task Erro_que_nao_e_do_nome_propaga_e_o_nome_gravado_continua_intacto(string nomeQueDisparaOGatilho, string sqlStateEsperado)
    {
        // Falha REAL do banco, com SQLSTATE que nada tem a ver com o nome (40001, serialization_failure), disparada por
        // um gatilho de teste. Antes (catch de qualquer PostgresException) o login tentava de novo com nome nulo e APAGAVA
        // o nome já gravado: este teste falha com o catch antigo (verificado por mutação, ver registro da rodada).
        var servico = CriarServico();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        var consultas = new ConsultasIdentidade(_banco.FabricaApp);
        var original = await servico.EntrarAsync("https://idp-nome.teste", sujeito, "Nome Original", desenvolvimento: false, cancelamento: TestContext.Current.CancellationToken);
        Assert.NotNull(original);

        await using var gatilho = await GatilhoDeFalhaAsync();
        var erro = await Record.ExceptionAsync(() => servico.EntrarAsync("https://idp-nome.teste", sujeito, nomeQueDisparaOGatilho, desenvolvimento: false, cancelamento: TestContext.Current.CancellationToken));

        var pg = ProcurarPostgres(erro);
        Assert.NotNull(pg);
        Assert.Equal(sqlStateEsperado, pg.SqlState);
        Assert.Equal("Nome Original", await consultas.ObterNomeExibicaoAsync(original.UsuarioId, TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Nome_rejeitado_pelo_banco_com_22021_grava_nulo_sem_recusar_o_login()
    {
        var servico = CriarServico();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");

        await using var gatilho = await GatilhoDeFalhaAsync();
        var resultado = await servico.EntrarAsync("https://idp-nome.teste", sujeito, "nome-rejeitado", desenvolvimento: false, cancelamento: TestContext.Current.CancellationToken);

        Assert.NotNull(resultado);
        Assert.Null(await new ConsultasIdentidade(_banco.FabricaApp).ObterNomeExibicaoAsync(resultado.UsuarioId, TestContext.Current.CancellationToken));
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

    private ServicoLogin CriarServico() =>
        new(new ConsultasIdentidade(_banco.FabricaApp), TimeProvider.System, Options.Create(new OpcoesSessao()), NullLogger<ServicoLogin>.Instance);

    private static PostgresException? ProcurarPostgres(Exception? erro)
    {
        for (var atual = erro; atual is not null; atual = atual.InnerException)
        {
            if (atual is PostgresException pg)
            {
                return pg;
            }
        }

        return null;
    }

    // Gatilho de TESTE em cronoai.usuario (criado e removido pelo migrador, dono da tabela): falha com SQLSTATE escolhido
    // conforme o nome gravado. Os testes da coleção rodam em série, então não afeta os demais.
    private async Task<GatilhoTemporario> GatilhoDeFalhaAsync()
    {
        var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        foreach (var sql in new[]
        {
            "CREATE FUNCTION cronoai.t_nome_falha() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.nome_exibicao = 'nome-que-explode' THEN RAISE EXCEPTION 'falha simulada' USING ERRCODE = '40001'; ELSIF NEW.nome_exibicao = 'nome-erro-comum' THEN RAISE EXCEPTION 'erro comum'; ELSIF NEW.nome_exibicao = 'nome-rejeitado' THEN RAISE EXCEPTION 'nome rejeitado' USING ERRCODE = '22021'; END IF; RETURN NEW; END $$",
            "CREATE TRIGGER t_nome_falha BEFORE INSERT OR UPDATE ON cronoai.usuario FOR EACH ROW EXECUTE FUNCTION cronoai.t_nome_falha()",
        })
        {
            await using var comando = new NpgsqlCommand(sql, conexao);
            await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
        }

        return new GatilhoTemporario(conexao);
    }

    private static async Task<string?> LerNomeAsync(HttpClient navegador)
    {
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        var json = await eu.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        return json.GetProperty("nomeExibicao").GetString();
    }

    #endregion

    #region Tipos auxiliares

    private sealed class GatilhoTemporario : IAsyncDisposable
    {
        private readonly NpgsqlConnection _conexao;

        public GatilhoTemporario(NpgsqlConnection conexao)
        {
            _conexao = conexao;
        }

        public async ValueTask DisposeAsync()
        {
            foreach (var sql in new[] { "DROP TRIGGER IF EXISTS t_nome_falha ON cronoai.usuario", "DROP FUNCTION IF EXISTS cronoai.t_nome_falha()" })
            {
                await using var comando = new NpgsqlCommand(sql, _conexao);
                await comando.ExecuteNonQueryAsync();
            }

            await _conexao.DisposeAsync();
        }
    }

    #endregion
}
