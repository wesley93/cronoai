namespace CronoAI.Dominio;

/// <summary>
/// Município da lista oficial (global, sem empresa). A tabela nasce VAZIA: a carga depende da lista oficial do IBGE,
/// insumo pendente do usuário (ciclo 00013, Q7). Somente leitura para a aplicação.
/// </summary>
public sealed class MunicipioReferencia
{
    #region Construtor

    // Usado pelo EF Core na materialização.
    private MunicipioReferencia()
    {
    }

    #endregion

    #region Propriedades

    /// <summary>Código IBGE com 7 dígitos (PK; texto para preservar zeros).</summary>
    public string CodigoIbge { get; private set; } = "";

    /// <summary>Sigla da UF.</summary>
    public string Uf { get; private set; } = "";

    public string Nome { get; private set; } = "";

    #endregion
}
