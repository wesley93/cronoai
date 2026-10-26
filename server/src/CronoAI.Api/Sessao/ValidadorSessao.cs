using CronoAI.Api.Autenticacao;
using CronoAI.Dados.Identidade;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

namespace CronoAI.Api.Sessao;

/// <summary>
/// <c>OnValidatePrincipal</c> do cookie: a CADA requisição faz UMA consulta (passo 6 do plano 00012, seção 3.9):
/// sessão aberta e não vencida, usuário ativo e vínculo vigente (membro não removido) com a empresa ativa, trazendo o perfil e o escopo. Falhou: rejeita o principal e
/// apaga o cookie (logout e desativação valem no servidor). Usa <see cref="ConsultasIdentidade"/> (fábrica), nunca
/// o <c>CronoDbContext</c> scoped.
/// </summary>
public static class ValidadorSessao
{
    #region Métodos públicos

    public static async Task ValidarAsync(CookieValidatePrincipalContext contexto)
    {
        var servicos = contexto.HttpContext.RequestServices;

        if (!Guid.TryParse(contexto.Principal?.FindFirst(EsquemasAutenticacao.ClaimSessao)?.Value, out var sessaoId)
            || !Guid.TryParse(contexto.Principal?.FindFirst(EsquemasAutenticacao.ClaimUsuario)?.Value, out var usuarioId))
        {
            await RejeitarAsync(contexto);
            return;
        }

        var consultas = servicos.GetRequiredService<ConsultasIdentidade>();
        var agora = servicos.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
        var validada = await consultas.ValidarSessaoAsync(sessaoId, usuarioId, agora, contexto.HttpContext.RequestAborted);

        // Sessão com emissor reservado (usuário de desenvolvimento) é recusada fora de Development (defesa em profundidade).
        var ambiente = servicos.GetRequiredService<IHostEnvironment>();
        if (validada is null || (validada.Emissor == EsquemasAutenticacao.EmissorDesenvolvimento && !ambiente.IsDevelopment()))
        {
            await RejeitarAsync(contexto);
            return;
        }

        servicos.GetRequiredService<ContextoSessao>().Preencher(sessaoId, usuarioId, validada.EmpresaAtivaId, validada.Perfil, validada.EscopoObras);
    }

    #endregion

    #region Métodos privados

    private static async Task RejeitarAsync(CookieValidatePrincipalContext contexto)
    {
        contexto.RejectPrincipal();
        await contexto.HttpContext.SignOutAsync(EsquemasAutenticacao.Cookie);
    }

    #endregion
}
