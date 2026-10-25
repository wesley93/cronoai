using System.Net;
using System.Web;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>Login OIDC (código + PKCE S256) contra o emissor em memória: usuário, sessão e cookie.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class OidcTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public OidcTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Entrar_redireciona_ao_provedor_com_pkce_s256_state_e_nonce()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await navegador.GetAsync("/api/v1/autenticacao/entrar", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Redirect, resposta.StatusCode);
        var local = resposta.Headers.Location!;
        Assert.Equal("idp.teste", local.Host);
        var consulta = HttpUtility.ParseQueryString(local.Query);
        Assert.Equal("code", consulta["response_type"]);
        Assert.Equal("S256", consulta["code_challenge_method"]);
        Assert.False(string.IsNullOrEmpty(consulta["code_challenge"]));
        Assert.False(string.IsNullOrEmpty(consulta["state"]));
        Assert.False(string.IsNullOrEmpty(consulta["nonce"]));
        Assert.Equal(idp.IdCliente, consulta["client_id"]);
        Assert.Equal("https://localhost/signin-oidc", consulta["redirect_uri"]);
        Assert.Contains("openid", consulta["scope"]!, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Retorno_valido_cria_usuario_sessao_e_cookie_seguro()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = "Pessoa Ficticia" };
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var retorno = await ClienteAutenticado.LoginOidcAsync(navegador, idp);

        Assert.Equal(HttpStatusCode.Redirect, retorno.StatusCode);
        Assert.Equal("/", retorno.Headers.Location!.OriginalString);

        // Usuário com o emissor VALIDADO do token e uma sessão no servidor.
        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, idp.Emissor, sujeito));
        var usuarioId = await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito);
        Assert.Equal(1, await ConsultaBanco.ContarSessoesAsync(_banco, usuarioId!.Value));

        // Cookie: HttpOnly, Secure, SameSite=Lax, Path=/, sem Domain, nome com __Host-.
        var cookie = CookieDeSessao(retorno);
        Assert.StartsWith("__Host-cronoai-sessao=", cookie, StringComparison.Ordinal);
        var minusculo = cookie.ToLowerInvariant();
        Assert.Contains("httponly", minusculo, StringComparison.Ordinal);
        Assert.Contains("secure", minusculo, StringComparison.Ordinal);
        Assert.Contains("samesite=lax", minusculo, StringComparison.Ordinal);
        Assert.Contains("path=/", minusculo, StringComparison.Ordinal);
        Assert.DoesNotContain("domain=", minusculo, StringComparison.Ordinal);

        // Com o cookie, /eu responde 200.
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.OK, eu.StatusCode);
    }

    [Fact]
    public async Task Cookie_nao_guarda_tokens_do_provedor()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var retorno = await ClienteAutenticado.LoginOidcAsync(navegador, idp);
        var valor = CookieDeSessao(retorno).Split(';')[0]["__Host-cronoai-sessao=".Length..];

        // Decifra o ticket com o mesmo Data Protection do aplicativo.
        var opcoes = fabrica.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>().Get("cronoai-cookie");
        var ticket = opcoes.TicketDataFormat.Unprotect(Uri.UnescapeDataString(valor));

        Assert.NotNull(ticket);
        Assert.Empty(ticket.Properties.GetTokens());
        var tipos = ticket.Principal.Claims.Select(c => c.Type).Order().ToList();
        Assert.Equal(["sid", "usuario_id"], tipos);
    }

    [Fact]
    public async Task Logins_simultaneos_do_mesmo_sub_criam_um_usuario()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        // Cada "navegador" é um cliente com cookies próprios (vivem até o fim do teste).
        var navegadores = Enumerable.Range(0, 5).Select(_ => fabrica.CriarNavegador()).ToList();
        try
        {
            var redirecionamentos = await Task.WhenAll(navegadores.Select(async n =>
            {
                using var entrar = await n.GetAsync("/api/v1/autenticacao/entrar", TestContext.Current.CancellationToken);
                return entrar.Headers.Location!;
            }));

            // O IdP guarda uma definição de token por vez: autoriza em sequência e só depois volta em paralelo.
            var retornos = redirecionamentos.Select(local =>
            {
                idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
                return idp.Autorizar(local);
            }).ToList();

            var respostas = await Task.WhenAll(navegadores.Select((n, i) => ClienteAutenticado.VoltarDoProvedorAsync(n, retornos[i])));
            Assert.All(respostas, r => Assert.Equal(HttpStatusCode.Redirect, r.StatusCode));
        }
        finally
        {
            navegadores.ForEach(n => n.Dispose());
        }


        Assert.Equal(1, await ConsultaBanco.ContarUsuariosAsync(_banco, idp.Emissor, sujeito));
        var usuarioId = await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito);
        Assert.Equal(5, await ConsultaBanco.ContarSessoesAsync(_banco, usuarioId!.Value));
    }

    [Fact]
    public async Task Mesmo_sub_em_emissores_diferentes_sao_usuarios_diferentes()
    {
        using var idpA = new IdpEmMemoria("https://idp-a.teste");
        using var idpB = new IdpEmMemoria("https://idp-b.teste");
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        idpA.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        idpB.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        await using var fabricaA = new ApiFactory(_banco.StringConexaoApp) { Idp = idpA };
        await using var fabricaB = new ApiFactory(_banco.StringConexaoApp) { Idp = idpB };

        using (var navegadorA = fabricaA.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(navegadorA, idpA)).Dispose();
        }

        using (var navegadorB = fabricaB.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(navegadorB, idpB)).Dispose();
        }

        var idA = await ConsultaBanco.ObterUsuarioIdAsync(_banco, idpA.Emissor, sujeito);
        var idB = await ConsultaBanco.ObterUsuarioIdAsync(_banco, idpB.Emissor, sujeito);
        Assert.NotNull(idA);
        Assert.NotNull(idB);
        Assert.NotEqual(idA, idB);
    }

    [Fact]
    public async Task Login_nao_reativa_usuario_desativado()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        // 1º login cria o usuário; depois alguém o desativa.
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        using (var navegador = fabrica.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();
        }

        var usuarioId = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito))!.Value;
        var quando = DateTime.UtcNow.AddMinutes(-5);
        await ConsultaBanco.DesativarUsuarioAsync(_banco, usuarioId, quando);
        var sessoesAntes = await ConsultaBanco.ContarSessoesAsync(_banco, usuarioId);

        // 2º login: sem sessão, sem cookie, e desativado_em intacto.
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        using var outro = fabrica.CriarNavegador();
        using var retorno = await ClienteAutenticado.LoginOidcAsync(outro, idp);

        Assert.Equal(HttpStatusCode.Unauthorized, retorno.StatusCode);
        Assert.DoesNotContain(retorno.Headers.GetValues("Set-Cookie"), c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal) && !c.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase));
        Assert.Equal(sessoesAntes, await ConsultaBanco.ContarSessoesAsync(_banco, usuarioId));
        var depois = await ConsultaBanco.LerDesativadoEmAsync(_banco, usuarioId);
        Assert.NotNull(depois);
        Assert.Equal(quando, depois!.Value.ToUniversalTime(), TimeSpan.FromMilliseconds(5));
    }

    [Fact]
    public async Task Sem_autoridade_entrar_responde_503_e_api_sobe()
    {
        // Sem Autoridade o esquema OIDC não é registrado: a API sobe (live 200) e ninguém entra (503 em ProblemDetails).
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp);
        using var navegador = fabrica.CriarNavegador();

        using var live = await navegador.GetAsync("/health/live", TestContext.Current.CancellationToken);
        using var entrar = await navegador.GetAsync("/api/v1/autenticacao/entrar", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, live.StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, entrar.StatusCode);
        Assert.Equal("application/problem+json", entrar.Content.Headers.ContentType?.MediaType);
    }

    [Theory]
    [InlineData("https://evil.example/x")]
    [InlineData("//evil.example/x")]
    [InlineData("/\\evil.example")]
    public async Task Retorno_externo_vai_para_a_raiz(string retorno)
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await ClienteAutenticado.LoginOidcAsync(navegador, idp, retorno);

        Assert.Equal(HttpStatusCode.Redirect, resposta.StatusCode);
        Assert.Equal("/", resposta.Headers.Location!.OriginalString);
    }

    [Fact]
    public async Task Retorno_local_e_preservado()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        using var resposta = await ClienteAutenticado.LoginOidcAsync(navegador, idp, "/obras?pagina=2");

        Assert.Equal("/obras?pagina=2", resposta.Headers.Location!.OriginalString);
    }

    [Theory]
    [InlineData("/signout-oidc")]
    [InlineData("/signout-callback-oidc")]
    public async Task Rotas_de_logout_do_handler_ficam_desligadas(string caminho)
    {
        // Sem logout no provedor por ora: as rotas do handler respondem 404 e não tocam na sessão.
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();

        using var resposta = await navegador.GetAsync(caminho + "?sid=x&iss=" + Uri.EscapeDataString(idp.Emissor), TestContext.Current.CancellationToken);
        using var eu = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, resposta.StatusCode);
        Assert.Equal(HttpStatusCode.OK, eu.StatusCode);
    }

    [Fact]
    public async Task Novo_login_no_mesmo_navegador_encerra_a_sessao_anterior()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();

        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        using var primeiro = await ClienteAutenticado.LoginOidcAsync(navegador, idp);
        var cookieAntigo = CookieDeSessao(primeiro).Split(';')[0];
        var usuario = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito))!.Value;
        Assert.Equal(1, await ConsultaBanco.ContarSessoesAbertasAsync(_banco, usuario));

        // 2º login NO MESMO navegador (cookie ainda válido): a sessão anterior é encerrada no servidor.
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();

        Assert.Equal(1, await ConsultaBanco.ContarSessoesAbertasAsync(_banco, usuario));
        Assert.Equal(2, await ConsultaBanco.ContarSessoesAsync(_banco, usuario));
        using var requisicao = new HttpRequestMessage(HttpMethod.Get, "/api/v1/eu");
        requisicao.Headers.Add("Cookie", cookieAntigo);
        using var reuso = await fabrica.CriarNavegador().SendAsync(requisicao, TestContext.Current.CancellationToken);
        using var atual = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.Unauthorized, reuso.StatusCode);
        Assert.Equal(HttpStatusCode.OK, atual.StatusCode);
    }

    #endregion

    #region Métodos privados

    private static string CookieDeSessao(HttpResponseMessage resposta)
    {
        return resposta.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal));
    }

    #endregion
}
