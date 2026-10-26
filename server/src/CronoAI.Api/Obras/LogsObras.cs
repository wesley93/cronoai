namespace CronoAI.Api.Obras;

/// <summary>
/// Mensagens de log das escritas de obra (LoggerMessage gerado em tempo de compilação). Só <c>obra_id</c>: nunca nome,
/// motivo, responsável nem o conteúdo de <c>opcoes_cronograma</c> (RF-12.9). O que mudou está na trilha de auditoria.
/// </summary>
public static partial class LogsObras
{
    #region Métodos públicos

    [LoggerMessage(EventId = 20, Level = LogLevel.Information, Message = "Obra criada obra_id={ObraId}")]
    public static partial void ObraCriada(this ILogger logger, Guid obraId);

    [LoggerMessage(EventId = 21, Level = LogLevel.Information, Message = "Obra alterada obra_id={ObraId}")]
    public static partial void ObraAlterada(this ILogger logger, Guid obraId);

    [LoggerMessage(EventId = 22, Level = LogLevel.Information, Message = "Obra arquivada obra_id={ObraId}")]
    public static partial void ObraArquivada(this ILogger logger, Guid obraId);

    [LoggerMessage(EventId = 23, Level = LogLevel.Information, Message = "Obra restaurada obra_id={ObraId}")]
    public static partial void ObraRestaurada(this ILogger logger, Guid obraId);

    [LoggerMessage(EventId = 24, Level = LogLevel.Information, Message = "Escrita de obra recusada por conflito obra_id={ObraId} tipo={Tipo}")]
    public static partial void EscritaRecusadaPorConflito(this ILogger logger, Guid obraId, string tipo);

    [LoggerMessage(EventId = 25, Level = LogLevel.Warning, Message = "Obra sumiu no meio da escrita (resposta 404) obra_id={ObraId}")]
    public static partial void ObraSumiuNoMeioDaEscrita(this ILogger logger, Guid obraId);

    [LoggerMessage(EventId = 26, Level = LogLevel.Information, Message = "Escrita de obra recusada por campo de cadastro não permitido ao perfil obra_id={ObraId}")]
    public static partial void EscritaRecusadaPorCampoNaoPermitido(this ILogger logger, Guid obraId);

    #endregion
}
