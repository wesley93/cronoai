namespace CronoAI.Api.Membros;

/// <summary>
/// Mensagens de log das escritas de membro e de acesso de obra (LoggerMessage gerado em tempo de compilação). Só ids
/// (<c>usuario_id</c>, <c>obra_id</c>): nunca nome de exibição, motivo, perfil digitado nem nada do corpo (RF-12.9). O que mudou
/// está na trilha de auditoria.
/// </summary>
public static partial class LogsMembros
{
    #region Métodos públicos

    [LoggerMessage(EventId = 30, Level = LogLevel.Information, Message = "Membro alterado usuario_id={UsuarioId}")]
    public static partial void MembroAlterado(this ILogger logger, Guid usuarioId);

    [LoggerMessage(EventId = 31, Level = LogLevel.Information, Message = "Membro removido usuario_id={UsuarioId}")]
    public static partial void MembroRemovido(this ILogger logger, Guid usuarioId);

    [LoggerMessage(EventId = 32, Level = LogLevel.Information, Message = "Membro reativado usuario_id={UsuarioId}")]
    public static partial void MembroReativado(this ILogger logger, Guid usuarioId);

    [LoggerMessage(EventId = 33, Level = LogLevel.Information, Message = "Escrita de membro recusada por conflito usuario_id={UsuarioId} tipo={Tipo}")]
    public static partial void EscritaDeMembroRecusada(this ILogger logger, Guid usuarioId, string tipo);

    [LoggerMessage(EventId = 34, Level = LogLevel.Information, Message = "Acesso de obra concedido obra_id={ObraId} usuario_id={UsuarioId}")]
    public static partial void AcessoDeObraConcedido(this ILogger logger, Guid obraId, Guid usuarioId);

    [LoggerMessage(EventId = 35, Level = LogLevel.Information, Message = "Acesso de obra revogado obra_id={ObraId} usuario_id={UsuarioId} acessos_de_frente_removidos={Frentes}")]
    public static partial void AcessoDeObraRevogado(this ILogger logger, Guid obraId, Guid usuarioId, int frentes);

    [LoggerMessage(EventId = 36, Level = LogLevel.Warning, Message = "Obra deixou de ser visível no meio da escrita de acesso (resposta 404) obra_id={ObraId}")]
    public static partial void ObraInvisivelNoMeioDaEscritaDeAcesso(this ILogger logger, Guid obraId);

    #endregion
}
