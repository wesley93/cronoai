namespace CronoAI.Dados.Auditoria;

/// <summary>Campo da lista branca de uma entidade auditável.</summary>
/// <param name="Propriedade">Nome da propriedade CLR da entidade.</param>
/// <param name="Chave">Chave no JSON da trilha (igual ao nome da coluna, em <c>snake_case</c>).</param>
/// <param name="EhJson">O valor é texto JSON (<c>jsonb</c>) e entra aninhado, não como string.</param>
public sealed record CampoAuditado(string Propriedade, string Chave, bool EhJson = false);
