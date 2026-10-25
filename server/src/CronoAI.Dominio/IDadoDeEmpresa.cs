namespace CronoAI.Dominio;

/// <summary>
/// Marca toda entidade que pertence a uma empresa. O <c>CronoDbContext</c> aplica o filtro global
/// nomeado "Empresa" automaticamente a quem a implementa (ADR 00006).
/// </summary>
public interface IDadoDeEmpresa
{
    #region Propriedades

    /// <summary>Empresa dona do dado (denormalizada em toda tabela de empresa).</summary>
    Guid EmpresaId { get; }

    #endregion
}
