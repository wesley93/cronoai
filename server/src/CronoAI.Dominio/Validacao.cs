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

    public static void Utc(DateTime valor, string parametro)
    {
        if (valor.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("O instante precisa ser UTC (timestamptz).", parametro);
        }
    }

    #endregion
}
