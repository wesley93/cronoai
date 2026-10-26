namespace CronoAI.Dados.Identidade;

/// <summary>
/// Membro da empresa na listagem de membros: o único lugar que junta o vínculo ao nome de exibição (dado pessoal mínimo). Nunca
/// leva emissor, sujeito, e-mail nem IP.
/// </summary>
/// <param name="UsuarioId">Usuário.</param>
/// <param name="NomeExibicao">Nome de exibição vindo do provedor (pode ser nulo).</param>
/// <param name="Perfil">Perfil do membro.</param>
/// <param name="EscopoObras">Escopo de obras do membro.</param>
/// <param name="RemovidoEm">Instante da remoção lógica, ou nulo se ativo.</param>
/// <param name="Versao">Versão da linha (xmin), só para igualdade.</param>
public sealed record MembroListado(Guid UsuarioId, string? NomeExibicao, string Perfil, string EscopoObras, DateTime? RemovidoEm, uint Versao);
