namespace CronoAI.Api.Sessao;

/// <summary>Sessão válida que o navegador já tinha ao fazer um novo login: é encerrada no servidor.</summary>
/// <param name="SessaoId">Sessão anterior.</param>
/// <param name="UsuarioId">Usuário dono dela (o RLS só permite encerrar a própria).</param>
public sealed record SessaoAnterior(Guid SessaoId, Guid UsuarioId);
