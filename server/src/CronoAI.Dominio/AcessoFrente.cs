namespace CronoAI.Dominio;

/// <summary>
/// Vínculo de um membro a uma frente de obra (RF-02.3a). Quem tem frente precisa ter a obra (FK para <c>acesso_obra</c>).
/// Neste ciclo só o VÍNCULO existe: nenhum dado é filtrado por frente ainda (tarefa e relato nascem nos ciclos 00015 e
/// 00018). A API fica para o 00014b.
/// </summary>
public sealed class AcessoFrente : IDadoDeEmpresa, IDadoDeObra, IVinculoRemovivel
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private AcessoFrente()
    {
    }

    private AcessoFrente(Guid id, Guid empresaId, Guid obraId, Guid frenteId, Guid usuarioId, DateTime criadoEm)
    {
        Id = id;
        EmpresaId = empresaId;
        ObraId = obraId;
        FrenteId = frenteId;
        UsuarioId = usuarioId;
        CriadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public Guid ObraId { get; private set; }

    public Guid FrenteId { get; private set; }

    public Guid UsuarioId { get; private set; }

    public DateTime CriadoEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    public static AcessoFrente Criar(Guid empresaId, Guid obraId, Guid frenteId, Guid usuarioId, DateTime criadoEmUtc, Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId, obraId, frenteId, usuarioId);
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        return new AcessoFrente(id ?? Guid.CreateVersion7(), empresaId, obraId, frenteId, usuarioId, criadoEmUtc);
    }

    #endregion
}
