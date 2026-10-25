using System.Globalization;
using CronoAI.Api.Sessao;

namespace CronoAI.Api.Borda;

/// <summary>
/// Filtro de endpoint da exportação: gasta uma requisição da cota do usuário da sessão e responde 429 com <c>Retry-After</c>
/// quando a cota acaba. Roda DEPOIS da autenticação e da autorização, por isso só usuário autenticado e com empresa ativa
/// consome cota.
/// </summary>
public sealed class LimiteDeExportacaoFilter : IEndpointFilter
{
    #region Campos

    private readonly LimitadorDeExportacao _limitador;

    #endregion

    #region Construtor

    public LimiteDeExportacaoFilter(LimitadorDeExportacao limitador)
    {
        _limitador = limitador;
    }

    #endregion

    #region Métodos públicos

    public async ValueTask<object?> InvokeAsync(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        ArgumentNullException.ThrowIfNull(context);
        ArgumentNullException.ThrowIfNull(next);
        var http = context.HttpContext;
        var usuarioId = http.RequestServices.GetRequiredService<ContextoSessao>().UsuarioId
            ?? throw new InvalidOperationException("Exportação sem usuário na sessão (a autorização deveria ter barrado).");

        if (!_limitador.TentarAdquirir(usuarioId, out var espera))
        {
            http.Response.Headers.RetryAfter = ((int)Math.Ceiling(espera.TotalSeconds)).ToString(CultureInfo.InvariantCulture);

            // Genérico: sem usuário, IP nem configuração.
            return TypedResults.Problem(statusCode: StatusCodes.Status429TooManyRequests, title: "Muitas requisições. Tente novamente em instantes.");
        }

        return await next(context);
    }

    #endregion
}
