namespace CronoAI.Api;

/// <summary>
/// Cabeçalhos de segurança para toda resposta da API (OWASP REST Security Cheat Sheet).
/// Gravados em <c>OnStarting</c>, porque o handler de exceções limpa os cabeçalhos da resposta
/// antes de escrever o ProblemDetails.
/// </summary>
public sealed class CabecalhosSegurancaMiddleware
{
    #region Campos

    private readonly RequestDelegate _next;

    #endregion

    #region Construtor

    public CabecalhosSegurancaMiddleware(RequestDelegate next)
    {
        _next = next;
    }

    #endregion

    #region Métodos públicos

    public Task InvokeAsync(HttpContext contexto)
    {
        contexto.Response.OnStarting(static estado =>
        {
            var cabecalhos = ((HttpContext)estado).Response.Headers;
            cabecalhos["X-Content-Type-Options"] = "nosniff";
            cabecalhos["Cache-Control"] = "no-store";
            cabecalhos["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'";
            cabecalhos["Referrer-Policy"] = "no-referrer";
            return Task.CompletedTask;
        }, contexto);

        return _next(contexto);
    }

    #endregion
}
