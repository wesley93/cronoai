namespace CronoAI.Dominio;

/// <summary>
/// Canal de negócio da escrita (RF-02.4), não o protocolo. Neste ciclo só <see cref="Ui"/> é usada; os demais valores
/// entram com a importação (00019), o WhatsApp (Fase 3) e a API de integração (00022).
/// </summary>
public static class OrigensAuditoria
{
    #region Campos

    public const string Ui = "ui";

    public const string Importacao = "importacao";

    public const string Whatsapp = "whatsapp";

    public const string Api = "api";

    private static readonly string[] _todas = [Ui, Importacao, Whatsapp, Api];

    #endregion

    #region Propriedades

    public static IReadOnlyList<string> Todas => _todas;

    #endregion

    #region Métodos públicos

    public static bool EhValida(string? origem) => origem is not null && _todas.Contains(origem, StringComparer.Ordinal);

    #endregion
}
