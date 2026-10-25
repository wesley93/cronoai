namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Mensagens de log do login (LoggerMessage gerado em tempo de compilação). Só <c>usuario_id</c>: nunca nome,
/// <c>sub</c>, e-mail, token, código ou cookie (RF-12.9).
/// </summary>
public static partial class LogsAutenticacao
{
    #region Métodos públicos

    [LoggerMessage(EventId = 1, Level = LogLevel.Warning, Message = "Login recusado: emissor reservado fora do fluxo de desenvolvimento")]
    public static partial void LoginRecusadoEmissorReservado(this ILogger logger);

    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "Login recusado: emissor ou sujeito fora dos limites")]
    public static partial void LoginRecusadoDadosInvalidos(this ILogger logger);

    [LoggerMessage(EventId = 3, Level = LogLevel.Warning, Message = "Login recusado: usuario_id={UsuarioId} desativado")]
    public static partial void LoginRecusadoUsuarioDesativado(this ILogger logger, Guid usuarioId);

    [LoggerMessage(EventId = 4, Level = LogLevel.Information, Message = "Login concluído usuario_id={UsuarioId}")]
    public static partial void LoginConcluido(this ILogger logger, Guid usuarioId);

    [LoggerMessage(EventId = 5, Level = LogLevel.Warning, Message = "Falha no retorno do provedor OIDC ({Tipo})")]
    public static partial void FalhaNoRetornoOidc(this ILogger logger, string tipo);

    #endregion
}
