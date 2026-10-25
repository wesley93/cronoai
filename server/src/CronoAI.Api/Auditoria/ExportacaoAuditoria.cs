namespace CronoAI.Api.Auditoria;

/// <summary>Exportação já validada: intervalo em UTC, obra opcional e o nome fixo do arquivo (nunca vem do usuário).</summary>
/// <param name="DeUtc">Início inclusivo (00:00 UTC do dia <c>de</c>).</param>
/// <param name="AteExclusivoUtc">Fim exclusivo (00:00 UTC do dia seguinte a <c>ate</c>).</param>
/// <param name="ObraId">Obra (já conferida como visível) ou nulo para todas.</param>
/// <param name="NomeDoArquivo">Nome do arquivo no download, montado só com a data do servidor.</param>
public sealed record ExportacaoAuditoria(DateTime DeUtc, DateTime AteExclusivoUtc, Guid? ObraId, string NomeDoArquivo);
