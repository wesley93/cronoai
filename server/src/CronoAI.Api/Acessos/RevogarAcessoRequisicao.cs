namespace CronoAI.Api.Acessos;

/// <summary>
/// Corpo de <c>POST /api/v1/obras/{id}/acessos/{usuarioId}/revogar</c>. É um POST (e não um DELETE com corpo) porque a semântica de
/// corpo em DELETE é indefinida (RFC 9110, seção 9.3.5).
/// </summary>
/// <param name="Motivo">Motivo opcional (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record RevogarAcessoRequisicao(string? Motivo);
