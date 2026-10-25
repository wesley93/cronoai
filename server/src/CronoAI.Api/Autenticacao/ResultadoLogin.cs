namespace CronoAI.Api.Autenticacao;

/// <summary>Resultado de um login bem-sucedido: usuário e sessão criados no servidor.</summary>
/// <param name="UsuarioId">Usuário.</param>
/// <param name="SessaoId">Sessão (uuid v4 por CSPRNG).</param>
public sealed record ResultadoLogin(Guid UsuarioId, Guid SessaoId);
