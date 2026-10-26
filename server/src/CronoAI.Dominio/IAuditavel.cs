namespace CronoAI.Dominio;

/// <summary>
/// Marca a entidade cuja escrita grava, na mesma transação, um registro de auditoria (ADR 00009). O interceptor do
/// <c>CronoDbContext</c> só audita quem a implementa e exige uma lista branca de campos para o tipo.
/// </summary>
public interface IAuditavel
{
    #region Propriedades

    /// <summary>
    /// Identificador da entidade (uuid); vai para <c>auditoria.entidade_id</c>. Entidade com <c>id</c> próprio devolve o
    /// <c>Id</c>; <c>membro_empresa</c> devolve o <c>UsuarioId</c> (único dentro da empresa da linha de trilha).
    /// </summary>
    Guid EntidadeId { get; }

    #endregion
}
