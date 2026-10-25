namespace CronoAI.Dominio;

/// <summary>
/// Marca a entidade cuja escrita grava, na mesma transação, um registro de auditoria (ADR 00009). O interceptor do
/// <c>CronoDbContext</c> só audita quem a implementa e exige uma lista branca de campos para o tipo.
/// </summary>
public interface IAuditavel
{
    #region Propriedades

    /// <summary>Identificador da entidade (uuid); vai para <c>auditoria.entidade_id</c>.</summary>
    Guid Id { get; }

    #endregion
}
