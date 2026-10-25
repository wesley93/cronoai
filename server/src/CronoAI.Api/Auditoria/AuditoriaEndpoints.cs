using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CronoAI.Api.Auditoria;

/// <summary>
/// Leitura e exportação da trilha de auditoria da empresa ativa. Só leitura: nada aqui escreve na trilha. Obra inexistente e
/// obra de outra empresa respondem o mesmo 404. A exportação tem limite de taxa próprio (RF-12.5) e sai em CSV seguro.
/// </summary>
public static class AuditoriaEndpoints
{
    #region Métodos públicos

    public static RouteGroupBuilder MapearAuditoria(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);

        api.MapGet("/obras/{id}/auditoria", async Task<Results<Ok<PaginaAuditoria>, ValidationProblem, ProblemHttpResult>> (Guid id, ServicoAuditoria servico, CancellationToken cancelamento, string? cursor = null, int? limite = null) =>
            {
                var resultado = await servico.TrilhaDaObraAsync(id, cursor, limite, cancelamento);
                return resultado.Status switch
                {
                    StatusLeituraAuditoria.Ok => TypedResults.Ok(resultado.Pagina!),
                    StatusLeituraAuditoria.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
                    _ => NaoEncontrada(),
                };
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        api.MapGet("/auditoria/exportacao.csv", async Task<Results<PushStreamHttpResult, ValidationProblem, ProblemHttpResult>> (ServicoAuditoria servico, CancellationToken cancelamento, DateOnly? de = null, DateOnly? ate = null, Guid? obraId = null) =>
            {
                var resultado = await servico.PrepararExportacaoAsync(de, ate, obraId, cancelamento);
                return resultado.Status switch
                {
                    // Nome fixo (a data do servidor), nunca texto do usuário; o arquivo é escrito em fluxo, página por página.
                    StatusLeituraAuditoria.Ok => TypedResults.Stream(
                        fluxo => servico.EscreverExportacaoAsync(fluxo, resultado.Exportacao!, cancelamento),
                        "text/csv; charset=utf-8",
                        resultado.Exportacao!.NomeDoArquivo),
                    StatusLeituraAuditoria.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
                    _ => NaoEncontrada(),
                };
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .AddEndpointFilter<LimiteDeExportacaoFilter>()
            .Produces<string>(StatusCodes.Status200OK, contentType: "text/csv")
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status429TooManyRequests);

        return api;
    }

    #endregion

    #region Métodos privados

    private static ProblemHttpResult NaoEncontrada() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    #endregion
}
