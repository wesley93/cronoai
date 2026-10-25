namespace CronoAI.Dominio;

/// <summary>
/// Unidade da federação (lista nacional, global, sem empresa). Semeada pela migração e somente leitura para a
/// aplicação. O código é o do IBGE (2 dígitos, prefixo do código do município).
/// </summary>
public sealed class UfReferencia
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private UfReferencia()
    {
    }

    #endregion

    #region Propriedades

    /// <summary>Sigla com 2 letras maiúsculas (PK).</summary>
    public string Sigla { get; private set; } = "";

    /// <summary>Código IBGE da UF (11 a 53).</summary>
    public short CodigoIbge { get; private set; }

    public string Nome { get; private set; } = "";

    #endregion
}
