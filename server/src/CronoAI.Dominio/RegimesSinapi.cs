namespace CronoAI.Dominio;

/// <summary>Regime de encargos da obra para o SINAPI. Enum como texto + CHECK no banco (ADR 00004).</summary>
public static class RegimesSinapi
{
    #region Campos

    public const string Desonerado = "desonerado";

    public const string NaoDesonerado = "nao_desonerado";

    private static readonly string[] _todos = [Desonerado, NaoDesonerado];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todos => _todos;

    #endregion

    #region Métodos públicos

    public static bool EhValido(string? regime) => regime is not null && _todos.Contains(regime, StringComparer.Ordinal);

    #endregion
}
