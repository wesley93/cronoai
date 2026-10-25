using CronoAI.Api.Empresas;
using CronoAI.Api.Sessao;
using CronoAI.Dados.Identidade;

namespace CronoAI.Api.Autenticacao;

/// <summary>Quem sou eu: <c>GET /api/v1/eu</c> (usuário, empresas e empresa ativa). Não exige empresa ativa.</summary>
public static class EuEndpoints
{
    #region Métodos públicos

    public static RouteGroupBuilder MapearEu(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);

        api.MapGet("/eu", async (ContextoSessao contexto, ConsultasIdentidade consultas, CancellationToken cancelamento) =>
        {
            if (contexto.UsuarioId is not { } usuarioId)
            {
                return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Autenticação necessária.");
            }

            var nome = await consultas.ObterNomeExibicaoAsync(usuarioId, cancelamento);
            var empresas = await consultas.MinhasEmpresasAsync(usuarioId, cancelamento);
            var resposta = new EuResposta(
                usuarioId,
                nome,
                empresas.Select(e => new EmpresaResumo(e.Id, e.Nome)).ToList(),
                contexto.EmpresaId);
            return Results.Ok(resposta);
        }).Produces<EuResposta>();

        return api;
    }

    #endregion
}
