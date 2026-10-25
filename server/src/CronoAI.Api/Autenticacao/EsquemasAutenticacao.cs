namespace CronoAI.Api.Autenticacao;

/// <summary>Nomes dos esquemas de autenticação e das claims do cookie de sessão.</summary>
public static class EsquemasAutenticacao
{
    #region Campos

    /// <summary>Cookie de sessão (BFF): único esquema de autenticação/desafio da API.</summary>
    public const string Cookie = "cronoai-cookie";

    /// <summary>OIDC genérico: só autentica no <c>/entrar</c>; registrado apenas com <c>Autoridade</c> configurada.</summary>
    public const string Oidc = "oidc";

    /// <summary>Claim com o id da sessão no servidor.</summary>
    public const string ClaimSessao = "sid";

    /// <summary>Claim com o id do usuário.</summary>
    public const string ClaimUsuario = "usuario_id";

    /// <summary>Nome do cookie de sessão (prefixo __Host-: Secure, Path=/, sem Domain).</summary>
    public const string NomeCookieSessao = "__Host-cronoai-sessao";

    /// <summary>Nome do cookie de antiforgery.</summary>
    public const string NomeCookieAntiforgery = "__Host-cronoai-af";

    /// <summary>Cabeçalho que carrega o token de antiforgery nas escritas.</summary>
    public const string CabecalhoAntiforgery = "X-XSRF-TOKEN";

    /// <summary>Emissor reservado do usuário de desenvolvimento: recusado fora de <c>Development</c>.</summary>
    public const string EmissorDesenvolvimento = "urn:cronoai:desenvolvimento";

    #endregion
}
