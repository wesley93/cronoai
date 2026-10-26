namespace CronoAI.Dominio;

/// <summary>
/// Inclusão de uma obra numa carteira (relação N:N, Q4: uma obra pode estar numa regional e num cliente). Só se insere ou
/// apaga. A trilha dela é da empresa (<c>obra_id</c> nulo): só o administrador a lê.
/// </summary>
public sealed class CarteiraObra : IDadoDeEmpresa, IVinculoRemovivel
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private CarteiraObra()
    {
    }

    private CarteiraObra(Guid id, Guid empresaId, Guid carteiraId, Guid obraId, DateTime criadoEm)
    {
        Id = id;
        EmpresaId = empresaId;
        CarteiraId = carteiraId;
        ObraId = obraId;
        CriadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public Guid CarteiraId { get; private set; }

    public Guid ObraId { get; private set; }

    public DateTime CriadoEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    public static CarteiraObra Criar(Guid empresaId, Guid carteiraId, Guid obraId, DateTime criadoEmUtc, Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId, carteiraId, obraId);
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        return new CarteiraObra(id ?? Guid.CreateVersion7(), empresaId, carteiraId, obraId, criadoEmUtc);
    }

    #endregion
}
