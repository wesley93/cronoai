using CronoAI.Api.Autenticacao;
using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http.HttpResults;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Desenvolvimento;

/// <summary>
/// Login do usuário de desenvolvimento: mesmo <see cref="ServicoLogin"/> do login real (uma porta só). Mapeado
/// APENAS com <c>Development</c> + flag; fora do OpenAPI. Isento de antiforgery (não faz parte do grupo
/// <c>/api/v1</c> com o filtro) porque só existe em Development.
/// </summary>
public static class DesenvolvimentoEndpoints
{
    #region Métodos públicos

    public static void MapearDesenvolvimento(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        var habilitado = app.Services.GetRequiredService<IOptions<OpcoesUsuarioDesenvolvimento>>().Value.Habilitado;
        if (!(app.Environment.IsDevelopment() && habilitado))
        {
            return;
        }

        app.MapPost("/api/v1/autenticacao/desenvolvimento/entrar", async Task<Results<NoContent, ProblemHttpResult>> (
                DesenvolvimentoEntrarRequisicao requisicao,
                HttpContext http,
                ServicoLogin login) =>
            {
                (string? Sujeito, string? Nome) escolhido = requisicao.Usuario switch
                {
                    IdsDesenvolvimento.SujeitoDevA => (IdsDesenvolvimento.SujeitoDevA, IdsDesenvolvimento.NomeDevA),
                    IdsDesenvolvimento.SujeitoDevB => (IdsDesenvolvimento.SujeitoDevB, IdsDesenvolvimento.NomeDevB),
                    _ => (null, null),
                };
                if (escolhido.Sujeito is null)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Usuário de desenvolvimento desconhecido.");
                }

                var anterior = await SessaoDoCookie.ObterAnteriorAsync(http);
                var resultado = await login.EntrarAsync(EsquemasAutenticacao.EmissorDesenvolvimento, escolhido.Sujeito, escolhido.Nome, desenvolvimento: true, anterior, http.RequestAborted);
                if (resultado is null)
                {
                    return TypedResults.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Não foi possível autenticar.");
                }

                await http.SignInAsync(
                    EsquemasAutenticacao.Cookie,
                    PrincipalDeSessao.Criar(resultado.SessaoId, resultado.UsuarioId),
                    new AuthenticationProperties { IsPersistent = false });
                return TypedResults.NoContent();
            })
            .AllowAnonymous()
            .RequireRateLimiting(BordaExtensoes.PoliticaAutenticacao)
            .ExcludeFromDescription();
    }

    #endregion
}
