namespace CronoAI.Api.Auditoria;

/// <summary>Opções da leitura e da exportação da trilha (seção <c>Auditoria</c>).</summary>
public sealed class OpcoesAuditoria
{
    #region Campos

    public const string Secao = "Auditoria";

    #endregion

    #region Propriedades

    /// <summary>Linhas lidas por consulta na exportação (keyset de id); a escrita é em fluxo. Padrão 1.000.</summary>
    public int TamanhoPaginaExportacao { get; set; } = 1000;

    #endregion
}
