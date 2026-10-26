namespace CronoAI.Dominio;

/// <summary>
/// Atribuição de uma carteira a um membro de escopo <c>carteiras</c>: ele enxerga as obras da carteira (não arquivada).
/// Só se insere ou apaga. A trilha dela é da empresa (<c>obra_id</c> nulo).
/// </summary>
public sealed class AcessoCarteira : IDadoDeEmpresa, IVinculoRemovivel
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private AcessoCarteira()
    {
    }

    private AcessoCarteira(Guid id, Guid empresaId, Guid carteiraId, Guid usuarioId, DateTime criadoEm)
    {
        Id = id;
        EmpresaId = empresaId;
        CarteiraId = carteiraId;
        UsuarioId = usuarioId;
        CriadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public Guid CarteiraId { get; private set; }

    public Guid UsuarioId { get; private set; }

    public DateTime CriadoEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    public static AcessoCarteira Criar(Guid empresaId, Guid carteiraId, Guid usuarioId, DateTime criadoEmUtc, Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId, carteiraId, usuarioId);
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        return new AcessoCarteira(id ?? Guid.CreateVersion7(), empresaId, carteiraId, usuarioId, criadoEmUtc);
    }

    #endregion
}
