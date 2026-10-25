namespace CronoAI.Api.Autenticacao;

/// <summary>Token de antiforgery para enviar no cabeçalho <c>X-XSRF-TOKEN</c> nas escritas.</summary>
/// <param name="Token">Valor do token.</param>
public sealed record AntiforgeryResposta(string Token);
