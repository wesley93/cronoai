using System.Globalization;
using System.Security.Claims;

namespace CronoAI.Api.Autenticacao;

/// <summary>
/// Monta a identidade que vai para o cookie: SÓ <c>sid</c> e <c>usuario_id</c>. Nenhum token, nome, e-mail ou
/// <c>sub</c> do provedor é guardado (minimização, RNF-02.3).
/// </summary>
public static class PrincipalDeSessao
{
    #region Métodos públicos

    public static ClaimsPrincipal Criar(Guid sessaoId, Guid usuarioId)
    {
        var identidade = new ClaimsIdentity(
            [
                new Claim(EsquemasAutenticacao.ClaimSessao, sessaoId.ToString("D", CultureInfo.InvariantCulture)),
                new Claim(EsquemasAutenticacao.ClaimUsuario, usuarioId.ToString("D", CultureInfo.InvariantCulture)),
            ],
            EsquemasAutenticacao.Cookie);
        return new ClaimsPrincipal(identidade);
    }

    #endregion
}
