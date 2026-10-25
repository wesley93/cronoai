using CronoAI.Api.Empresas;
using CronoAI.Api.Sessao;
using CronoAI.Dados.Identidade;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CronoAI.Api.Autenticacao;

/// <summary>Quem sou eu: <c>GET /api/v1/eu</c> (usuário, empresas e empresa ativa). Não exige empresa ativa.</summary>
public static class EuEndpoints
{
    #region Métodos públicos

    public static RouteGroupBuilder MapearEu(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);

        api.MapGet("/eu", async Task<Results<Ok<EuResposta>, ProblemHttpResult>> (ContextoSessao contexto, ConsultasIdentidade consultas, CancellationToken cancelamento) =>
            {
                if (contexto.UsuarioId is not { } usuarioId)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Autenticação necessária.");
                }

                var nome = await consultas.ObterNomeExibicaoAsync(usuarioId, cancelamento);
                var empresas = await consultas.MinhasEmpresasAsync(usuarioId, cancelamento);
                var resposta = new EuResposta(
                    usuarioId,
                    nome,
                    empresas.Select(e => new EmpresaResumo(e.Id, e.Nome)).ToList(),
                    contexto.EmpresaId);
                return TypedResults.Ok(resposta);
            })
            .ProducesProblem(StatusCodes.Status401Unauthorized);

        return api;
    }

    #endregion
}
