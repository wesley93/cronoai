namespace CronoAI.Api.Auditoria;

/// <summary>
/// Resultado discriminado de uma leitura da trilha; o endpoint só o traduz em <c>TypedResults</c>. Leva a
/// <see cref="Pagina"/> (trilha da obra) ou a <see cref="Exportacao"/> (CSV), conforme a leitura.
/// </summary>
public sealed class ResultadoLeituraAuditoria
{
    #region Construtor

    private ResultadoLeituraAuditoria(StatusLeituraAuditoria status, PaginaAuditoria? pagina, ExportacaoAuditoria? exportacao, IDictionary<string, string[]>? erros)
    {
        Status = status;
        Pagina = pagina;
        Exportacao = exportacao;
        Erros = erros;
    }

    #endregion

    #region Propriedades

    public StatusLeituraAuditoria Status { get; }

    public PaginaAuditoria? Pagina { get; }

    public ExportacaoAuditoria? Exportacao { get; }

    public IDictionary<string, string[]>? Erros { get; }

    #endregion

    #region Métodos públicos

    public static ResultadoLeituraAuditoria DePagina(PaginaAuditoria pagina) => new(StatusLeituraAuditoria.Ok, pagina, null, null);

    public static ResultadoLeituraAuditoria DeExportacao(ExportacaoAuditoria exportacao) => new(StatusLeituraAuditoria.Ok, null, exportacao, null);

    public static ResultadoLeituraAuditoria Invalida(string campo, string mensagem) =>
        new(StatusLeituraAuditoria.Invalida, null, null, new Dictionary<string, string[]> { [campo] = [mensagem] });

    public static ResultadoLeituraAuditoria NaoEncontrada() => new(StatusLeituraAuditoria.NaoEncontrada, null, null, null);

    #endregion
}
