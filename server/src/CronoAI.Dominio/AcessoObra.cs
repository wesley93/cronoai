namespace CronoAI.Dominio;

/// <summary>
/// Vínculo de um membro de escopo <c>vinculadas</c> a uma obra (RF-02.3). Só se insere ou apaga (nunca se atualiza); o
/// <c>DELETE</c> grava <c>remover</c> na trilha. Quem concedeu fica na trilha (<c>auditoria.usuario_id</c>), não em coluna.
/// </summary>
public sealed class AcessoObra : IDadoDeEmpresa, IDadoDeObra, IVinculoRemovivel
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private AcessoObra()
    {
    }

    private AcessoObra(Guid id, Guid empresaId, Guid obraId, Guid usuarioId, DateTime criadoEm)
    {
        Id = id;
        EmpresaId = empresaId;
        ObraId = obraId;
        UsuarioId = usuarioId;
        CriadoEm = criadoEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public Guid ObraId { get; private set; }

    public Guid UsuarioId { get; private set; }

    public DateTime CriadoEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    /// <summary>Cria o vínculo com id uuid v7. Passe <paramref name="id"/> só para ids fixos fictícios (semente e testes).</summary>
    public static AcessoObra Criar(Guid empresaId, Guid obraId, Guid usuarioId, DateTime criadoEmUtc, Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId, obraId, usuarioId);
        Validacao.Utc(criadoEmUtc, nameof(criadoEmUtc));
        return new AcessoObra(id ?? Guid.CreateVersion7(), empresaId, obraId, usuarioId, criadoEmUtc);
    }

    #endregion
}
