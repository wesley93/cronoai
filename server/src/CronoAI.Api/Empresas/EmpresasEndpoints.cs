using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Identidade;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Empresas;

/// <summary>
/// Empresa ativa da sessão. A empresa vem SEMPRE da sessão, nunca do corpo nem da URL, exceto no PUT que a
/// escolhe (e só entre as do usuário). Recurso de outra empresa e recurso inexistente respondem 404 idêntico.
/// </summary>
public static class EmpresasEndpoints
{
    #region Métodos públicos

    public static RouteGroupBuilder MapearEmpresas(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var grupo = api.MapGroup("/empresas");

        // Política EmpresaAtiva: sem empresa ativa → 403 (empresa-ativa-necessaria).
        grupo.MapGet("/atual", async Task<Results<Ok<EmpresaResumo>, ProblemHttpResult>> (ContextoSessao contexto, CronoDbContext db, CancellationToken cancelamento) =>
            {
                var empresaId = contexto.EmpresaId;
                var empresa = await db.Empresas
                    .Where(e => e.Id == empresaId)
                    .Select(e => new EmpresaResumo(e.Id, e.Nome))
                    .SingleOrDefaultAsync(cancelamento);
                return empresa is null ? NaoEncontrada() : TypedResults.Ok(empresa);
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status403Forbidden);

        grupo.MapPut("/atual", async Task<Results<Ok<EmpresaResumo>, ProblemHttpResult>> (TrocarEmpresaAtivaRequisicao requisicao, ContextoSessao contexto, ConsultasIdentidade consultas, CancellationToken cancelamento) =>
            {
                if (contexto.SessaoId is not { } sessaoId || contexto.UsuarioId is not { } usuarioId)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Autenticação necessária.");
                }

                // Empresa alheia ou inexistente: o mesmo 404 (o 403 revelaria que ela existe).
                var minhas = await consultas.MinhasEmpresasAsync(usuarioId, cancelamento);
                var escolhida = minhas.FirstOrDefault(e => e.Id == requisicao.EmpresaId);
                if (escolhida is null || !await consultas.DefinirEmpresaAtivaAsync(sessaoId, usuarioId, escolhida.Id, cancelamento))
                {
                    return NaoEncontrada();
                }

                return TypedResults.Ok(new EmpresaResumo(escolhida.Id, escolhida.Nome));
            })
            .ProducesProblem(StatusCodes.Status400BadRequest)
            .ProducesProblem(StatusCodes.Status401Unauthorized)
            .ProducesProblem(StatusCodes.Status404NotFound);

        return api;
    }

    #endregion

    #region Métodos privados

    private static ProblemHttpResult NaoEncontrada() =>
        TypedResults.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    #endregion
}
