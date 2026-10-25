namespace CronoAI.Api.Obras;

/// <summary>Corpo de <c>POST /api/v1/obras/{id}/arquivar</c> e <c>/restaurar</c>.</summary>
/// <param name="Versao">Versão da obra que o cliente leu (obrigatória).</param>
/// <param name="Motivo">Motivo opcional (até 500 caracteres) para a trilha de auditoria. Não digite dado pessoal.</param>
public sealed record MudancaArquivamentoRequisicao(long? Versao, string? Motivo);
