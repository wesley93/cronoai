namespace CronoAI.Dominio;

/// <summary>Vínculo usuário-empresa. PK composta (empresa, usuário). Perfis e remoção ficam para o ciclo 00014.</summary>
public sealed class MembroEmpresa : IDadoDeEmpresa
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private MembroEmpresa()
    {
    }

    private MembroEmpresa(Guid empresaId, Guid usuarioId, DateTime criadoEm)
    {
        EmpresaId = empresaId;
        UsuarioId = usuarioId;
        CriadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid EmpresaId { get; private set; }

    public Guid UsuarioId { get; private set; }

    public DateTime CriadoEm { get; private set; }

    #endregion

    #region Métodos públicos

    public static MembroEmpresa Criar(Guid empresaId, Guid usuarioId, DateTime criadoEmUtc)
    {
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        return new MembroEmpresa(empresaId, usuarioId, criadoEmUtc);
    }

    #endregion
}
