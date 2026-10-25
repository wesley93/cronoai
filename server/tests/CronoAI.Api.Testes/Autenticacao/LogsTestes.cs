using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class LogsTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public LogsTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Fluxo_de_login_nao_registra_dado_pessoal_nem_token()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        var nome = "Joana Ficticia da Silva";
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = nome };
        var logs = new LogsEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Logs = logs };
        using var navegador = fabrica.CriarNavegador();
        string? codigo = null;

        using var retorno = await ClienteAutenticado.LoginOidcAsync(navegador, idp, adulterar: r =>
        {
            codigo = r.Campos["code"];
            return r;
        });
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        var cookie = retorno.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal)).Split(';')[0]["__Host-cronoai-sessao=".Length..];
        var usuarioId = await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito);

        var tudo = logs.Tudo;

        // Nada de nome, sub, código de autorização, cookie ou segredo do cliente em log...
        Assert.DoesNotContain(nome, tudo, StringComparison.Ordinal);
        Assert.DoesNotContain(sujeito, tudo, StringComparison.Ordinal);
        Assert.DoesNotContain(codigo!, tudo, StringComparison.Ordinal);
        Assert.DoesNotContain(cookie, tudo, StringComparison.Ordinal);
        Assert.DoesNotContain(idp.SegredoCliente, tudo, StringComparison.Ordinal);
        Assert.DoesNotContain("id_token", tudo, StringComparison.OrdinalIgnoreCase);
        // ...e só o usuario_id identifica quem entrou.
        Assert.Contains($"usuario_id={usuarioId}", tudo, StringComparison.Ordinal);
    }

    #endregion
}
