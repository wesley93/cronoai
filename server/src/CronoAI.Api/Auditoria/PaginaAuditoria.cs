namespace CronoAI.Api.Auditoria;

/// <summary>Página da trilha de uma obra, do mais novo para o mais antigo.</summary>
/// <param name="Itens">Registros da página.</param>
/// <param name="ProximoCursor">Cursor opaco da próxima página (envie em <c>cursor</c>), ou nulo na última.</param>
public sealed record PaginaAuditoria(IReadOnlyList<RegistroAuditoriaResposta> Itens, string? ProximoCursor);
