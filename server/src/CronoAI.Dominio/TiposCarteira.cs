namespace CronoAI.Dominio;

/// <summary>
/// Tipo (rótulo) da carteira de obras (RF-14.8). Só rotula: quem enxerga o quê vem de <c>acesso_carteira</c>, nunca do tipo.
/// </summary>
public static class TiposCarteira
{
    #region Campos

    public const string Regional = "regional";

    public const string Cliente = "cliente";

    public const string Gestor = "gestor";

    private static readonly string[] _todos = [Regional, Cliente, Gestor];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todos => _todos;

    #endregion

    #region Métodos públicos

    public static bool EhValido(string? tipo) => tipo is not null && _todos.Contains(tipo, StringComparer.Ordinal);

    #endregion
}
