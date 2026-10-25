using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>
/// Os oito caminhos em que o retorno do provedor deve ser recusado: sem cookie de sessão, sem usuário nem sessão
/// novos e sem pilha na resposta. O IdP em memória é mais permissivo que um provedor real; estes testes negativos
/// compensam (a fumaça com o provedor real é da Segurança).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class OidcNegativosTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public OidcNegativosTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("assinatura_com_outra_chave")]
    [InlineData("emissor_errado")]
    [InlineData("audiencia_errada")]
    [InlineData("token_expirado")]
    [InlineData("nonce_errado")]
    [InlineData("state_adulterado")]
    [InlineData("alg_none")]
    [InlineData("pkce_verificador_nao_confere")]
    public async Task Token_recusado_nao_cria_sessao(string caso)
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        var definicao = new DefinicaoToken { Sujeito = sujeito };
        Func<RetornoAutorizacao, RetornoAutorizacao>? adulterar = null;

        switch (caso)
        {
            case "assinatura_com_outra_chave": definicao.AssinarComOutraChave = true; break;
            case "emissor_errado": definicao.Emissor = "https://outro-emissor.teste"; break;
            case "audiencia_errada": definicao.Audiencia = "outro-cliente"; break;
            case "token_expirado": definicao.Validade = TimeSpan.FromHours(-1); break;
            case "nonce_errado": definicao.Nonce = "nonce-que-nao-foi-pedido"; break;
            case "alg_none": definicao.AlgNone = true; break;
            case "pkce_verificador_nao_confere": definicao.AdulterarCodeChallenge = true; break;
            case "state_adulterado":
                adulterar = r => r with { Campos = new Dictionary<string, string>(r.Campos) { ["state"] = "estado-forjado" } };
                break;
            default: throw new InvalidOperationException(caso);
        }

        idp.ProximoToken = definicao;
        var logs = new LogsEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Logs = logs };
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await ClienteAutenticado.LoginOidcAsync(navegador, idp, adulterar: adulterar);
        var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        // 401 genérico em ProblemDetails, sem pilha nem detalhe interno.
        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
        Assert.DoesNotContain("   at ", corpo, StringComparison.Ordinal);
        Assert.DoesNotContain("Exception", corpo, StringComparison.Ordinal);
        Assert.DoesNotContain("IDX", corpo, StringComparison.Ordinal);

        // Nenhum cookie de sessão válido, nenhum usuário e nenhuma sessão nova.
        var cookiesDeSessao = resposta.Headers.TryGetValues("Set-Cookie", out var cookies)
            ? cookies.Where(c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal) && !c.Contains("1970", StringComparison.Ordinal))
            : [];
        Assert.Empty(cookiesDeSessao);
        Assert.Equal(0, await ConsultaBanco.ContarUsuariosAsync(_banco, idp.Emissor, sujeito));
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, eu.StatusCode);

        // O log da falha não traz o sujeito, o token nem o código de autorização.
        Assert.DoesNotContain(sujeito, logs.Tudo, StringComparison.Ordinal);
        Assert.NotNull(idp.UltimoCodigo);
        Assert.DoesNotContain(idp.UltimoCodigo!, logs.Tudo, StringComparison.Ordinal);
        if (idp.UltimoIdToken is not null)
        {
            Assert.DoesNotContain(idp.UltimoIdToken, logs.Tudo, StringComparison.Ordinal);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task Id_token_no_retorno_de_autorizacao_nao_cria_sessao(bool comCode)
    {
        // O canal do navegador (form_post/query) NÃO pode entregar id_token: só o fluxo de código vale. Mesmo um
        // token válido (assinado, nonce correto) é recusado, com ou sem code: sem PKCE nem autenticação do cliente.
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        var logs = new LogsEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Logs = logs };
        using var navegador = fabrica.CriarNavegador();
        string? idTokenInjetado = null;

        using var resposta = await ClienteAutenticado.LoginOidcAsync(navegador, idp, adulterar: retorno =>
        {
            var campos = new Dictionary<string, string>(retorno.Campos);
            idTokenInjetado = idp.EmitirFrontChannel(retorno.Nonce, sujeito);
            campos["id_token"] = idTokenInjetado;
            if (!comCode)
            {
                campos.Remove("code");
            }

            return retorno with { Campos = campos };
        });

        Assert.Equal(HttpStatusCode.Unauthorized, resposta.StatusCode);
        var cookies = resposta.Headers.TryGetValues("Set-Cookie", out var valores) ? valores : [];
        Assert.DoesNotContain(cookies, c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal) && !c.Contains("1970", StringComparison.Ordinal));
        Assert.Equal(0, await ConsultaBanco.ContarUsuariosAsync(_banco, idp.Emissor, sujeito));
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, eu.StatusCode);
        Assert.DoesNotContain(idTokenInjetado!, logs.Tudo, StringComparison.Ordinal);
    }


    #endregion
}
