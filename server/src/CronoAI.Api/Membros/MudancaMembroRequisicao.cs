namespace CronoAI.Api.Membros;

/// <summary>Corpo de <c>POST /api/v1/membros/{usuarioId}/remover</c> e <c>.../reativar</c>.</summary>
/// <param name="Versao">Versão do membro que o cliente leu (obrigatória).</param>
/// <param name="Motivo">Motivo opcional (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record MudancaMembroRequisicao(long? Versao, string? Motivo);
