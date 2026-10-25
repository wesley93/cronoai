namespace CronoAI.Api.Autenticacao;

/// <summary>
/// OIDC genérico (seção <c>Autenticacao:Oidc</c>): nenhum provedor fixo no código. Sem <see cref="Autoridade"/> o
/// esquema não é registrado e <c>/entrar</c> responde 503 (falha fechada). <see cref="SegredoCliente"/> só por
/// user-secrets ou variável de ambiente.
/// </summary>
public sealed class OpcoesOidc
{
    #region Campos

    public const string Secao = "Autenticacao:Oidc";

    public const string CaminhoRetornoPadrao = "/signin-oidc";

    #endregion

    #region Propriedades

    /// <summary>URL do emissor (autoridade) do provedor.</summary>
    public string? Autoridade { get; set; }

    public string? IdCliente { get; set; }

    /// <summary>Segredo do cliente confidencial. Nunca em appsettings versionado.</summary>
    public string? SegredoCliente { get; set; }

    /// <summary>Escopos separados por espaço.</summary>
    public string Escopos { get; set; } = "openid profile";

    /// <summary>Caminho do retorno do provedor (callback do handler).</summary>
    public string CaminhoRetorno { get; set; } = CaminhoRetornoPadrao;

    #endregion
}
