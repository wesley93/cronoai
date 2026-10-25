namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Redirecionamento pós-login só para caminho local (evita redirecionamento aberto): começa com <c>/</c>, não com
/// <c>//</c> nem <c>/\</c>, sem caractere de controle e com até 2048 caracteres; senão volta para <c>/</c>.
/// </summary>
public static class RetornoLocal
{
    #region Campos

    public const int TamanhoMaximo = 2048;

    #endregion

    #region Métodos públicos

    public static string Sanitizar(string? retorno)
    {
        if (string.IsNullOrEmpty(retorno) || retorno.Length > TamanhoMaximo)
        {
            return "/";
        }

        if (retorno[0] != '/' || retorno.StartsWith("//", StringComparison.Ordinal) || retorno.StartsWith("/\\", StringComparison.Ordinal))
        {
            return "/";
        }

        return retorno.Any(char.IsControl) ? "/" : retorno;
    }

    #endregion
}
