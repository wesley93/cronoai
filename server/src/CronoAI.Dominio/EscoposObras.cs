namespace CronoAI.Dominio;

/// <summary>
/// Quais obras o membro enxerga (o RLS decide no banco): todas as da empresa, só as vinculadas por <c>acesso_obra</c> ou
/// as das carteiras atribuídas. O banco não cita os perfis (exceto administrador e gestor): cita o escopo.
/// </summary>
public static class EscoposObras
{
    #region Campos

    public const string Todas = "todas";

    public const string Vinculadas = "vinculadas";

    public const string Carteiras = "carteiras";

    private static readonly string[] _todos = [Todas, Vinculadas, Carteiras];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todos => _todos;

    #endregion

    #region Métodos públicos

    public static bool EhValido(string? escopo) => escopo is not null && _todos.Contains(escopo, StringComparer.Ordinal);

    #endregion
}
