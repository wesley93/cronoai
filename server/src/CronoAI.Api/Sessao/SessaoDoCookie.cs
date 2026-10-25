using CronoAI.Api.Autenticacao;
using Microsoft.AspNetCore.Authentication;

namespace CronoAI.Api.Sessao;

/// <summary>
/// Leitura da sessão que o navegador já traz no cookie. O handler OIDC trata o retorno ANTES da autenticação padrão
/// do pipeline, então a autenticação do cookie é feita aqui (o <see cref="ValidadorSessao"/> preenche o
/// <see cref="ContextoSessao"/>). Um novo login encerra a sessão encontrada.
/// </summary>
public static class SessaoDoCookie
{
    #region Métodos públicos

    /// <summary>Sessão válida do cookie, ou <c>null</c> (sem cookie, vencida, encerrada ou usuário desativado).</summary>
    public static async Task<SessaoAnterior?> ObterAnteriorAsync(HttpContext http)
    {
        ArgumentNullException.ThrowIfNull(http);
        var resultado = await http.AuthenticateAsync(EsquemasAutenticacao.Cookie);
        var contexto = http.RequestServices.GetRequiredService<ContextoSessao>();
        return resultado.Succeeded && contexto.SessaoId is { } sessaoId && contexto.UsuarioId is { } usuarioId
            ? new SessaoAnterior(sessaoId, usuarioId)
            : null;
    }

    #endregion
}
