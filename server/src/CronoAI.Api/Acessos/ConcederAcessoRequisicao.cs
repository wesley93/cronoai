namespace CronoAI.Api.Acessos;

/// <summary>
/// Corpo de <c>POST /api/v1/obras/{id}/acessos</c>: concede a um membro o acesso à obra. O <c>usuarioId</c> é o ALVO legítimo
/// (conferido como membro ativo da empresa da obra, de escopo <c>vinculadas</c>); o corpo nunca leva empresa.
/// </summary>
/// <param name="UsuarioId">Membro que receberá o acesso. Membro de outra empresa, inexistente, removido ou de escopo diferente de <c>vinculadas</c> recebe o mesmo 400.</param>
/// <param name="Motivo">Motivo opcional (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record ConcederAcessoRequisicao(Guid? UsuarioId, string? Motivo);
