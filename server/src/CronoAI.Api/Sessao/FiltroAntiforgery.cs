using Microsoft.AspNetCore.Antiforgery;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Endpoint filter de antiforgery nas escritas (qualquer método que não seja GET, HEAD, OPTIONS ou TRACE) do
/// grupo <c>/api/v1</c>. Corre depois da autorização: sem sessão a resposta é 401, nunca 400. Defesa em
/// profundidade além do <c>SameSite=Lax</c> do cookie.
/// </summary>
public sealed class FiltroAntiforgery : IEndpointFilter
{
    #region Métodos públicos

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (HttpMethods.IsGet(http.Request.Method) || HttpMethods.IsHead(http.Request.Method)
            || HttpMethods.IsOptions(http.Request.Method) || HttpMethods.IsTrace(http.Request.Method))
        {
            return await next(context);
        }

        try
        {
            await http.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(http);
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Token antiforgery ausente ou inválido.");
        }

        return await next(context);
    }

    #endregion
}
