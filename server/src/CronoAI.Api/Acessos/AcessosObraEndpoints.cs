using System.Diagnostics;
using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using CronoAI.Dominio;
using Microsoft.AspNetCore.Http.HttpResults;

namespace CronoAI.Api.Acessos;

/// <summary>
/// Acessos de membros a obras. A empresa e quem escreve vêm da sessão; a obra vem da URL e, se não for visível a quem pergunta
/// (inexistente, de outra empresa ou fora do alcance), responde 404 idêntico. Listar exige <c>acessos_obra.ler</c> e conceder ou
/// revogar exigem <c>acessos_obra.gerir</c> (administrador e gestor de portfólio, este só no próprio alcance, decidido pelo RLS).
/// </summary>
public static class AcessosObraEndpoints
{
    #region Campos

    // Corpo de escrita de acesso: 8 KB (um usuário e um motivo de até 500 caracteres cabem com folga).
    private const long LimiteDoCorpoEmBytes = 8192;

    #endregion

    #region Métodos públicos

    public static RouteGroupBuilder MapearAcessosObra(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var grupo = api.MapGroup("/obras/{id}").RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva);

        grupo.MapGet("/acessos", async Task<Results<Ok<IReadOnlyList<AcessoObraResposta>>, ProblemHttpResult>> (Guid id, ServicoAcessosObra servico, CancellationToken cancelamento) =>
            {
                var acessos = await servico.ListarAsync(id, cancelamento);
                return acessos is null ? NaoEncontrado() : TypedResults.Ok(acessos);
            })
            .RequerPermissao(AcoesPermissao.AcessosObraLer)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound);

        grupo.MapPost("/acessos", async Task<Results<Created<AcessoObraResposta>, ValidationProblem, ProblemHttpResult>> (Guid id, ConcederAcessoRequisicao requisicao, ServicoAcessosObra servico, CancellationToken cancelamento) =>
            {
                var resultado = await servico.ConcederAsync(id, requisicao, cancelamento);
                return resultado.Status switch
                {
                    // Não há GET de um vínculo: o Location é a coleção de acessos da obra, onde ele aparece.
                    StatusResultadoAcesso.Ok => TypedResults.Created($"/api/v1/obras/{id}/acessos", resultado.Acesso!),
                    StatusResultadoAcesso.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
                    StatusResultadoAcesso.NaoEncontrado => NaoEncontrado(),
                    StatusResultadoAcesso.Conflito => TypedResults.Problem(
                        statusCode: StatusCodes.Status409Conflict,
                        title: "O membro já tem acesso a esta obra.",
                        type: ResultadoEscritaAcesso.AcessoExistente),
                    _ => throw new UnreachableException($"Conceder acesso não devolve {resultado.Status}."),
                };
            })
            .RequerPermissao(AcoesPermissao.AcessosObraGerir)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status409Conflict)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        grupo.MapPost("/acessos/{usuarioId}/revogar", async Task<Results<NoContent, ValidationProblem, ProblemHttpResult>> (Guid id, Guid usuarioId, RevogarAcessoRequisicao requisicao, ServicoAcessosObra servico, CancellationToken cancelamento) =>
            {
                var resultado = await servico.RevogarAsync(id, usuarioId, requisicao, cancelamento);
                return resultado.Status switch
                {
                    StatusResultadoAcesso.Ok => TypedResults.NoContent(),
                    StatusResultadoAcesso.Invalida => TypedResults.ValidationProblem(resultado.Erros!),
                    StatusResultadoAcesso.NaoEncontrado => NaoEncontrado(),

                    // Revogar não cria vínculo: não há "já existe" aqui. Se aparecer, é defeito, e o 500 genérico o denuncia.
                    _ => throw new UnreachableException($"Revogar acesso não devolve {resultado.Status}."),
                };
            })
            .RequerPermissao(AcoesPermissao.AcessosObraGerir)
            .WithMetadata(new LimiteDeCorpoMetadata(LimiteDoCorpoEmBytes))
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden)
            .ProducesProblem(StatusCodes.Status404NotFound)
            .ProducesProblem(StatusCodes.Status413PayloadTooLarge);

        return api;
    }

    #endregion

    #region Métodos privados

    private static ProblemHttpResult NaoEncontrado() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    #endregion
}
