using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Responde 403 em ProblemDetails com o tipo curto da causa: <c>empresa-ativa-necessaria</c> (sem empresa ativa) ou
/// <c>acao-nao-permitida</c> (o perfil não pode a ação). Sem empresa ativa o primeiro tem precedência. Os demais resultados seguem
/// o tratador padrão (401 pelo cookie, 403 genérico). Requisição sem endpoint (rota inexistente) não é desafiada: segue para o 404.
/// </summary>
public sealed class ResultadoAutorizacaoProblemDetails : IAuthorizationMiddlewareResultHandler
{
    #region Campos

    private readonly AuthorizationMiddlewareResultHandler _padrao = new();

    #endregion

    #region Métodos públicos

    public async Task HandleAsync(RequestDelegate next, HttpContext context, AuthorizationPolicy policy, PolicyAuthorizationResult authorizeResult)
    {
        // O fallback de autorização (autenticado) também avalia requisições SEM endpoint (rota inexistente). Não há
        // recurso a proteger: segue o pipeline, e o 404 sai em ProblemDetails (não revela rotas nem vira 401 enganoso).
        if (context.GetEndpoint() is null)
        {
            await next(context);
            return;
        }

        if (authorizeResult.Forbidden && authorizeResult.AuthorizationFailure is { } falha)
        {
            if (falha.FailureReasons.Any(r => r.Message == RequisitoEmpresaAtiva.MotivoEmpresaAtivaNecessaria))
            {
                await Results.Problem(
                    statusCode: StatusCodes.Status403Forbidden,
                    title: "É necessário escolher a empresa ativa.",
                    type: RequisitoEmpresaAtiva.MotivoEmpresaAtivaNecessaria).ExecuteAsync(context);
                return;
            }

            if (falha.FailureReasons.Any(r => r.Message == RequisitoPermissao.MotivoAcaoNaoPermitida))
            {
                await Results.Problem(
                    statusCode: StatusCodes.Status403Forbidden,
                    title: "O seu perfil não permite esta ação.",
                    type: RequisitoPermissao.MotivoAcaoNaoPermitida).ExecuteAsync(context);
                return;
            }
        }

        await _padrao.HandleAsync(next, context, policy, authorizeResult);
    }

    #endregion
}
