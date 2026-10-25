namespace CronoAI.Dominio;

/// <summary>Validações de borda das fábricas do domínio (tamanho de texto e instante UTC).</summary>
internal static class Validacao
{
    #region Métodos públicos

    public static void TextoEntre(string? valor, int minimo, int maximo, string parametro)
    {
        if (valor is null || valor.Length < minimo || valor.Length > maximo)
        {
            throw new ArgumentException($"O valor deve ter entre {minimo} e {maximo} caracteres.", parametro);
        }
    }

    /// <summary>
    /// Erro de validação de UM campo do contrato: <see cref="ArgumentException.ParamName"/> leva a chave camelCase que a
    /// API devolve no <c>ValidationProblem</c> (nome que não é parâmetro do método, por isso não passa direto pelo construtor).
    /// </summary>
    public static ArgumentException Campo(string campo, string mensagem) => new(mensagem, campo);

    public static void Utc(DateTime valor, string parametro)
    {
        if (valor.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("O instante precisa ser UTC (timestamptz).", parametro);
        }
    }

    #endregion
}
