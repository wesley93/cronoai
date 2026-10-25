using CronoAI.Api.Borda;
using CronoAI.Api.Sessao;
using CronoAI.Dados.Identidade;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;

namespace CronoAI.Api.Autenticacao;

/// <summary>Rotas de autenticação: <c>entrar</c> (OIDC), <c>sair</c> e o token de antiforgery.</summary>
public static class AutenticacaoEndpoints
{
    #region Métodos públicos

    public static RouteGroupBuilder MapearAutenticacao(this RouteGroupBuilder api)
    {
        ArgumentNullException.ThrowIfNull(api);
        var grupo = api.MapGroup("/autenticacao");

        // Só este GET desafia o OIDC. Sem Autoridade configurada o esquema não existe: 503 (a API sobe e ninguém entra).
        grupo.MapGet("/entrar", async (HttpContext http, string? retorno, IAuthenticationSchemeProvider esquemas) =>
            {
                if (await esquemas.GetSchemeAsync(EsquemasAutenticacao.Oidc) is null)
                {
                    return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable, title: "Login corporativo não configurado.");
                }

                var propriedades = new AuthenticationProperties { RedirectUri = RetornoLocal.Sanitizar(retorno) };
                return Results.Challenge(propriedades, [EsquemasAutenticacao.Oidc]);
            })
            .AllowAnonymous()
            .RequireRateLimiting(BordaExtensoes.PoliticaAutenticacao);

        // Logout local: encerra a sessão NO SERVIDOR e apaga o cookie. Logout no provedor fica pendente (Segurança).
        grupo.MapPost("/sair", async (HttpContext http, ContextoSessao contexto, ConsultasIdentidade consultas, TimeProvider relogio) =>
            {
                if (contexto.SessaoId is { } sessaoId && contexto.UsuarioId is { } usuarioId)
                {
                    await consultas.EncerrarSessaoAsync(sessaoId, usuarioId, relogio.GetUtcNow().UtcDateTime, http.RequestAborted);
                }

                await http.SignOutAsync(EsquemasAutenticacao.Cookie);
                return Results.NoContent();
            })
            .RequireRateLimiting(BordaExtensoes.PoliticaAutenticacao);

        // Token de antiforgery para as escritas (cabeçalho X-XSRF-TOKEN). Exige sessão: o token é ligado ao usuário.
        grupo.MapGet("/antiforgery", (HttpContext http, IAntiforgery antiforgery) =>
        {
            var tokens = antiforgery.GetAndStoreTokens(http);
            return TypedResults.Ok(new AntiforgeryResposta(tokens.RequestToken ?? ""));
        });

        return api;
    }

    #endregion
}
