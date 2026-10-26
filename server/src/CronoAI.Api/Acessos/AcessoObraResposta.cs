using CronoAI.Dominio;

namespace CronoAI.Api.Acessos;

/// <summary>Vínculo de um membro a uma obra como a API o devolve. Sem nome nem perfil: quem quiser o nome consulta a listagem de membros.</summary>
/// <param name="UsuarioId">Membro vinculado à obra.</param>
/// <param name="CriadoEm">Instante em que o acesso foi concedido (UTC).</param>
public sealed record AcessoObraResposta(Guid UsuarioId, DateTime CriadoEm)
{
    #region Métodos públicos

    public static AcessoObraResposta De(AcessoObra acesso)
    {
        ArgumentNullException.ThrowIfNull(acesso);
        return new AcessoObraResposta(acesso.UsuarioId, acesso.CriadoEm);
    }

    #endregion
}
