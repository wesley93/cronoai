using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Http.Metadata;

namespace CronoAI.Api.Borda;

/// <summary>
/// Aplica o limite de corpo declarado no endpoint (<see cref="IRequestSizeLimitMetadata"/>, ex.: <c>RequestSizeLimitAttribute</c>)
/// em qualquer servidor: recusa com 413 o corpo cujo <c>Content-Length</c> já excede o limite e, para corpo sem tamanho
/// declarado (chunked), conta os bytes lidos e recusa com 413 ao passar do limite (e também o fixa no
/// <see cref="IHttpMaxRequestBodySizeFeature"/>, que o Kestrel aplica). Não é
/// terminal: só curto-circuita a requisição grande demais e roda ANTES da autenticação, pois o custo de recusar é mínimo.
/// </summary>
public sealed class LimiteDeCorpoMiddleware
{
    #region Campos

    private readonly RequestDelegate _proximo;

    #endregion

    #region Construtor

    public LimiteDeCorpoMiddleware(RequestDelegate proximo)
    {
        _proximo = proximo;
    }

    #endregion

    #region Métodos públicos

    public async Task InvokeAsync(HttpContext contexto)
    {
        ArgumentNullException.ThrowIfNull(contexto);
        var limite = contexto.GetEndpoint()?.Metadata.GetMetadata<IRequestSizeLimitMetadata>()?.MaxRequestBodySize;
        if (limite is { } maximo)
        {
            if (contexto.Request.ContentLength > maximo)
            {
                // Sem tamanho nem valor no corpo da resposta: só o tipo padrão e o traceId.
                await Results.Problem(statusCode: StatusCodes.Status413PayloadTooLarge, title: "O corpo da requisição excede o limite permitido.")
                    .ExecuteAsync(contexto);
                return;
            }

            // Corpo sem tamanho declarado (chunked) ou com tamanho mentiroso: o fluxo conta o que é lido e recusa com 413.
            contexto.Request.Body = new CorpoLimitadoStream(contexto.Request.Body, maximo);

            // O Kestrel também aplica o limite na leitura quando o recurso aceita a mudança.
            var recurso = contexto.Features.Get<IHttpMaxRequestBodySizeFeature>();
            if (recurso is { IsReadOnly: false })
            {
                recurso.MaxRequestBodySize = maximo;
            }
        }

        await _proximo(contexto);
    }

    #endregion
}
