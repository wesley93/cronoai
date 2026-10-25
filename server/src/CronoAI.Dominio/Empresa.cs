namespace CronoAI.Dominio;

/// <summary>Empresa (inquilino). Sem CNPJ por ora: minimização de dados (ADR 00006).</summary>
public sealed class Empresa
{
    #region Campos

    public const int TamanhoMaximoNome = 200;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private Empresa()
    {
    }

    private Empresa(Guid id, string nome, DateTime criadaEm)
    {
        Id = id;
        Nome = nome;
        CriadaEm = criadaEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public string Nome { get; private set; } = "";

    public DateTime CriadaEm { get; private set; }

    #endregion

    #region Métodos públicos

    /// <summary>Cria a empresa com id uuid v7. Passe <paramref name="id"/> só para ids fixos fictícios (semente).</summary>
    public static Empresa Criar(string nome, DateTime criadaEmUtc, Guid? id = null)
    {
        Validacao.TextoEntre(nome, 1, TamanhoMaximoNome, nameof(nome));
        Validacao.Utc(criadaEmUtc, nameof(criadaEmUtc));
        return new Empresa(id ?? Guid.CreateVersion7(), nome, criadaEmUtc);
    }

    #endregion
}
