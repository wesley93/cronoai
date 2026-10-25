using CronoAI.Api.Sessao;
using CronoAI.Dados;
using CronoAI.Dados.Identidade;
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
        grupo.MapGet("/atual", async (ContextoSessao contexto, CronoDbContext db, CancellationToken cancelamento) =>
            {
                var empresaId = contexto.EmpresaId;
                var empresa = await db.Empresas
                    .Where(e => e.Id == empresaId)
                    .Select(e => new EmpresaResumo(e.Id, e.Nome))
                    .SingleOrDefaultAsync(cancelamento);
                return empresa is null ? NaoEncontrada() : Results.Ok(empresa);
            })
            .RequireAuthorization(RequisitoEmpresaAtiva.PoliticaEmpresaAtiva)
            .Produces<EmpresaResumo>();

        grupo.MapPut("/atual", async (TrocarEmpresaAtivaRequisicao requisicao, ContextoSessao contexto, ConsultasIdentidade consultas, CancellationToken cancelamento) =>
            {
                if (contexto.SessaoId is not { } sessaoId || contexto.UsuarioId is not { } usuarioId)
                {
                    return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Autenticação necessária.");
                }

                // Empresa alheia ou inexistente: o mesmo 404 (o 403 revelaria que ela existe).
                var minhas = await consultas.MinhasEmpresasAsync(usuarioId, cancelamento);
                var escolhida = minhas.FirstOrDefault(e => e.Id == requisicao.EmpresaId);
                if (escolhida is null || !await consultas.DefinirEmpresaAtivaAsync(sessaoId, usuarioId, escolhida.Id, cancelamento))
                {
                    return NaoEncontrada();
                }

                return Results.Ok(new EmpresaResumo(escolhida.Id, escolhida.Nome));
            })
            .Produces<EmpresaResumo>();

        return api;
    }

    #endregion

    #region Métodos privados

    private static IResult NaoEncontrada() =>
        Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Recurso não encontrado.");

    #endregion
}
