namespace CronoAI.Dominio;

/// <summary>
/// Entidade removida de forma LÓGICA (<c>removido_em</c>), como <see cref="MembroEmpresa"/>. Na trilha, <c>removido_em</c>
/// de nulo para valor vira <c>remover</c>, e de valor para nulo vira <c>restaurar</c> (reativar).
/// </summary>
public interface IRemovivelLogicamente : IAuditavel
{
    #region Propriedades

    DateTime? RemovidoEm { get; }

    #endregion
}
