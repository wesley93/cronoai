using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Autenticacao;

/// <summary>Ciclo de vida da sessão: retenção, inatividade, teto de duração, logout e desativação (relógio controlado).</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class SessaoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public SessaoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Login_apaga_sessoes_proprias_vencidas_alem_da_retencao()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        using (var primeiro = fabrica.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(primeiro, idp)).Dispose();
        }

        var usuario = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito))!.Value;
        var outro = await _dados.CriarUsuarioAsync();
        var agora = DateTime.UtcNow;

        // Do usuário: terminada há 31 dias (apagada) e há 29 dias (mantida). De outro usuário: 31 dias (intacta).
        await _dados.CriarSessaoAsync(usuario, null, agora.AddDays(-40), agora.AddDays(-31));
        await _dados.CriarSessaoAsync(usuario, null, agora.AddDays(-35), agora.AddDays(-29));
        await _dados.CriarSessaoAsync(outro, null, agora.AddDays(-40), agora.AddDays(-31));
        var antesDoUsuario = await ConsultaBanco.ContarSessoesAsync(_banco, usuario);

        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        using (var segundo = fabrica.CriarNavegador())
        {
            (await ClienteAutenticado.LoginOidcAsync(segundo, idp)).Dispose();
        }

        // antes: 1 do 1º login + 2 antigas = 3; depois: +1 novo, -1 (a de 31 dias) = 3.
        Assert.Equal(3, antesDoUsuario);
        Assert.Equal(3, await ConsultaBanco.ContarSessoesAsync(_banco, usuario));
        Assert.Equal(1, await ConsultaBanco.ContarSessoesAsync(_banco, outro));
    }

    [Fact]
    public async Task Sessao_expira_por_inatividade()
    {
        var relogio = new RelogioTeste();
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Relogio = relogio };
        using var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();

        relogio.Avancar(TimeSpan.FromMinutes(29));
        using var antes = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
        relogio.Avancar(TimeSpan.FromMinutes(31));
        using var depois = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, antes.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, depois.StatusCode);
    }

    [Fact]
    public async Task Sessao_expira_pela_duracao_maxima_mesmo_com_uso()
    {
        var relogio = new RelogioTeste();
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp, Relogio = relogio };
        using var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();

        // Uso a cada 20 minutos mantém o cookie deslizando, mas o teto absoluto de 8 h vale: 23 × 20 = 460 min.
        for (var i = 0; i < 23; i++)
        {
            relogio.Avancar(TimeSpan.FromMinutes(20));
            using var uso = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, uso.StatusCode);
        }

        relogio.Avancar(TimeSpan.FromMinutes(21)); // 481 min > 8 h
        using var depois = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Unauthorized, depois.StatusCode);
    }

    [Fact]
    public async Task Sair_encerra_a_sessao_no_servidor()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();
        using var login = await ClienteAutenticado.LoginOidcAsync(navegador, idp);
        var cookie = login.Headers.GetValues("Set-Cookie").Single(c => c.StartsWith("__Host-cronoai-sessao=", StringComparison.Ordinal)).Split(';')[0];
        var usuario = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito))!.Value;
        Assert.Equal(1, await ConsultaBanco.ContarSessoesAbertasAsync(_banco, usuario));

        using var sair = await ClienteAutenticado.EscreverAsync(navegador, HttpMethod.Post, "/api/v1/autenticacao/sair");

        // O cookie antigo, reapresentado, não vale mais (revogação no servidor), e encerrada_em foi gravado.
        using var requisicao = new HttpRequestMessage(HttpMethod.Get, "/api/v1/eu");
        requisicao.Headers.Add("Cookie", cookie);
        using var reuso = await fabrica.CriarNavegador().SendAsync(requisicao, TestContext.Current.CancellationToken);
        Assert.Equal(HttpStatusCode.NoContent, sair.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, reuso.StatusCode);
        Assert.Equal(0, await ConsultaBanco.ContarSessoesAbertasAsync(_banco, usuario));
    }

    [Fact]
    public async Task Usuario_desativado_perde_a_sessao_na_proxima_requisicao()
    {
        using var idp = new IdpEmMemoria();
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito };
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        using var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();
        using var antes = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        var usuario = (await ConsultaBanco.ObterUsuarioIdAsync(_banco, idp.Emissor, sujeito))!.Value;
        await ConsultaBanco.DesativarUsuarioAsync(_banco, usuario, DateTime.UtcNow);
        using var depois = await navegador.GetAsync("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, antes.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, depois.StatusCode);
    }

    #endregion
}
