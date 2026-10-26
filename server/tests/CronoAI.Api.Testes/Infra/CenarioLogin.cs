using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Infra;

/// <summary>Um usuário já logado (OIDC em memória), o "navegador" dele e as empresas de que é membro.</summary>
/// <param name="Navegador">Cliente com os cookies da sessão.</param>
/// <param name="UsuarioId">Usuário.</param>
/// <param name="Empresas">Empresas de que é membro (criadas antes do login).</param>
/// <param name="Sujeito">Sujeito (<c>sub</c>) usado no token.</param>
public sealed record CenarioLogin(HttpClient Navegador, Guid UsuarioId, IReadOnlyList<Guid> Empresas, string Sujeito)
{
    #region Métodos públicos

    /// <summary>
    /// Cria o usuário e <paramref name="quantidadeDeEmpresas"/> empresas (todas com ele como membro) ANTES do login e
    /// então entra pelo OIDC: com uma empresa ela já fica ativa; com várias, a ativa fica vazia.
    /// </summary>
    public static async Task<CenarioLogin> CriarAsync(ApiFactory fabrica, IdpEmMemoria idp, DadosTeste dados, int quantidadeDeEmpresas, string? nome = "Pessoa Ficticia")
    {
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        var usuarioId = await dados.CriarUsuarioAsync(sujeito, idp.Emissor, nome);
        var empresas = new List<Guid>();
        for (var i = 0; i < quantidadeDeEmpresas; i++)
        {
            empresas.Add(await dados.CriarEmpresaComMembrosAsync(usuarioId));
        }

        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = nome };
        var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();
        return new CenarioLogin(navegador, usuarioId, empresas, sujeito);
    }

    /// <summary>
    /// Cria um usuário NOVO, vinculado a uma empresa JÁ existente com o perfil e o escopo informados (como superusuário da fixture:
    /// o app não insere membro), e entra pelo OIDC. Com um vínculo só, a empresa fica ativa.
    /// </summary>
    public static async Task<CenarioLogin> NaEmpresaAsync(
        ApiFactory fabrica,
        IdpEmMemoria idp,
        DadosTeste dados,
        Guid empresaId,
        string perfil,
        string? escopoObras = null,
        string? nome = "Pessoa Ficticia")
    {
        var sujeito = "sub-" + Guid.NewGuid().ToString("N");
        var usuarioId = await dados.CriarUsuarioAsync(sujeito, idp.Emissor, nome);
        await dados.VincularAsync(empresaId, usuarioId, perfil, escopoObras);
        return await EntrarAsync(fabrica, idp, usuarioId, sujeito, nome, [empresaId]);
    }

    /// <summary>Entra pelo OIDC como um usuário que JÁ existe (o sujeito é o do token). Devolve o navegador com a sessão.</summary>
    public static async Task<CenarioLogin> EntrarAsync(ApiFactory fabrica, IdpEmMemoria idp, Guid usuarioId, string sujeito, string? nome = "Pessoa Ficticia", IReadOnlyList<Guid>? empresas = null)
    {
        idp.ProximoToken = new DefinicaoToken { Sujeito = sujeito, Nome = nome };
        var navegador = fabrica.CriarNavegador();
        (await ClienteAutenticado.LoginOidcAsync(navegador, idp)).Dispose();
        return new CenarioLogin(navegador, usuarioId, empresas ?? [], sujeito);
    }

    #endregion
}
