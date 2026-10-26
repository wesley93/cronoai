namespace CronoAI.Dominio;

/// <summary>Ações gravadas na trilha. Ampliar exige migração (o CHECK <c>ck_auditoria_acao</c> as lista).</summary>
public static class AcoesAuditoria
{
    #region Campos

    public const string Criar = "criar";

    public const string Alterar = "alterar";

    public const string Arquivar = "arquivar";

    public const string Restaurar = "restaurar";

    /// <summary>Revogar vínculo (DELETE físico auditado) ou remover membro (remoção lógica). <c>aceitar</c> fica para o 00014c.</summary>
    public const string Remover = "remover";

    private static readonly string[] _todas = [Criar, Alterar, Arquivar, Restaurar, Remover];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todas => _todas;

    #endregion

    #region Métodos públicos

    public static bool EhValida(string? acao) => acao is not null && _todas.Contains(acao, StringComparer.Ordinal);

    #endregion
}
