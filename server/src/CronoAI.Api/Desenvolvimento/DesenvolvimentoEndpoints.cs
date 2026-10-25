using CronoAI.Api.Autenticacao;
using CronoAI.Api.Borda;
using Microsoft.AspNetCore.Authentication;

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
        var habilitado = app.Services.GetRequiredService<Microsoft.Extensions.Options.IOptions<OpcoesUsuarioDesenvolvimento>>().Value.Habilitado;
        if (!(app.Environment.IsDevelopment() && habilitado))
        {
            return;
        }

        app.MapPost("/api/v1/autenticacao/desenvolvimento/entrar", async (
                DesenvolvimentoEntrarRequisicao requisicao,
                HttpContext http,
                ServicoLogin login) =>
            {
                var (sujeito, nome) = requisicao.Usuario switch
                {
                    IdsDesenvolvimento.SujeitoDevA => (IdsDesenvolvimento.SujeitoDevA, IdsDesenvolvimento.NomeDevA),
                    IdsDesenvolvimento.SujeitoDevB => (IdsDesenvolvimento.SujeitoDevB, IdsDesenvolvimento.NomeDevB),
                    _ => (null, null),
                };
                if (sujeito is null)
                {
                    return Results.Problem(statusCode: StatusCodes.Status400BadRequest, title: "Usuário de desenvolvimento desconhecido.");
                }

                var resultado = await login.EntrarAsync(EsquemasAutenticacao.EmissorDesenvolvimento, sujeito, nome, desenvolvimento: true, http.RequestAborted);
                if (resultado is null)
                {
                    return Results.Problem(statusCode: StatusCodes.Status401Unauthorized, title: "Não foi possível autenticar.");
                }

                await http.SignInAsync(
                    EsquemasAutenticacao.Cookie,
                    PrincipalDeSessao.Criar(resultado.SessaoId, resultado.UsuarioId),
                    new AuthenticationProperties { IsPersistent = false });
                return Results.NoContent();
            })
            .AllowAnonymous()
            .RequireRateLimiting(BordaExtensoes.PoliticaAutenticacao)
            .ExcludeFromDescription();
    }

    #endregion
}
