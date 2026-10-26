namespace CronoAI.Dominio;

/// <summary>
/// Entidade que pertence a uma obra. A linha de trilha dela leva <c>obra_id</c>, e a política de leitura da trilha usa
/// esse valor para mostrá-la só a quem enxerga a obra. A própria <see cref="Obra"/> grava o seu <c>Id</c>.
/// </summary>
public interface IDadoDeObra
{
    #region Propriedades

    Guid ObraId { get; }

    #endregion
}
