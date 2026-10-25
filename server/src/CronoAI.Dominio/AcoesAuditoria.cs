namespace CronoAI.Dominio;

/// <summary>Ações gravadas na trilha. Ampliar exige migração (o CHECK <c>ck_auditoria_acao</c> as lista).</summary>
public static class AcoesAuditoria
{
    #region Campos

    public const string Criar = "criar";

    public const string Alterar = "alterar";

    public const string Arquivar = "arquivar";

    public const string Restaurar = "restaurar";

    private static readonly string[] _todas = [Criar, Alterar, Arquivar, Restaurar];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todas => _todas;

    #endregion

    #region Métodos públicos

    public static bool EhValida(string? acao) => acao is not null && _todas.Contains(acao, StringComparer.Ordinal);

    #endregion
}
