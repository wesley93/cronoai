namespace CronoAI.Dominio;

/// <summary>
/// Os 7 perfis da SPEC-02 (seção 3). Enum como texto + CHECK no banco (ADR 00004): o teste de banco confere que o CHECK
/// <c>ck_membro_perfil</c> tem exatamente estes valores. O perfil é do MEMBRO da empresa (um por usuário e empresa, Q1).
/// </summary>
public static class Perfis
{
    #region Campos

    public const string Administrador = "administrador";

    public const string EngenheiroPlanejamento = "engenheiro_planejamento";

    public const string EngenheiroObra = "engenheiro_obra";

    public const string Suprimentos = "suprimentos";

    /// <summary>"Empreiteiro" é o mesmo perfil (Q2). Nenhuma rota do ciclo 00014 coloca alguém nele.</summary>
    public const string Encarregado = "encarregado";

    public const string GestorPortfolio = "gestor_portfolio";

    public const string Diretoria = "diretoria";

    private static readonly string[] _todos =
    [
        Administrador,
        EngenheiroPlanejamento,
        EngenheiroObra,
        Suprimentos,
        Encarregado,
        GestorPortfolio,
        Diretoria,
    ];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todos => _todos;

    #endregion

    #region Métodos públicos

    public static bool EhValido(string? perfil) => perfil is not null && _todos.Contains(perfil, StringComparer.Ordinal);

    /// <summary>
    /// Par perfil × escopo aceito (mesma regra do CHECK <c>ck_membro_perfil_escopo</c>): administrador só <c>todas</c>;
    /// gestor e diretoria <c>todas</c> ou <c>carteiras</c>; os demais só <c>vinculadas</c>.
    /// </summary>
    public static bool ParValido(string? perfil, string? escopoObras)
    {
        if (!EhValido(perfil) || !EscoposObras.EhValido(escopoObras))
        {
            return false;
        }

        return perfil switch
        {
            Administrador => escopoObras == EscoposObras.Todas,
            GestorPortfolio or Diretoria => escopoObras is EscoposObras.Todas or EscoposObras.Carteiras,
            _ => escopoObras == EscoposObras.Vinculadas,
        };
    }

    /// <summary>
    /// Escopo derivado pelo servidor quando o perfil só admite um (administrador e perfis de obra). Gestor e diretoria
    /// têm dois escopos válidos e o cliente precisa escolher: devolve <c>null</c>.
    /// </summary>
    public static string? EscopoUnico(string? perfil) => perfil switch
    {
        Administrador => EscoposObras.Todas,
        EngenheiroPlanejamento or EngenheiroObra or Suprimentos or Encarregado => EscoposObras.Vinculadas,
        _ => null,
    };

    #endregion
}
