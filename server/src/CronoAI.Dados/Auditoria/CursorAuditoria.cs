namespace CronoAI.Dados.Auditoria;

/// <summary>
/// Posição de uma leitura paginada da trilha: o par (em, id) do ÚLTIMO item entregue. A trilha é lida por keyset, nunca por
/// OFFSET: o identity não é monotônico por commit, então a ordem estável é (em, id).
/// </summary>
/// <param name="Em">Instante (UTC) do último item da página.</param>
/// <param name="Id">Id do último item da página.</param>
public sealed record CursorAuditoria(DateTime Em, long Id);
