namespace CronoAI.Dominio;

/// <summary>
/// Carteira de obras da empresa (RF-14.8): agrupa obras por região, cliente ou gestor. Neste ciclo só o MODELO existe (a API
/// é do 00014b). Carteira arquivada NÃO concede acesso às obras (Q4). <see cref="Versao"/> é incrementada por gatilho.
/// </summary>
public sealed class Carteira : IDadoDeEmpresa, IArquivavel
{
    #region Campos

    public const int TamanhoMaximoNome = 200;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private Carteira()
    {
    }

    private Carteira(Guid id, Guid empresaId, string nome, string tipo, DateTime criadaEm)
    {
        Id = id;
        EmpresaId = empresaId;
        Nome = nome;
        Tipo = tipo;
        CriadaEm = criadaEm;
        AtualizadaEm = criadaEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public string Nome { get; private set; } = "";

    /// <summary>Um dos <see cref="TiposCarteira"/> (rótulo: não concede acesso).</summary>
    public string Tipo { get; private set; } = "";

    /// <summary>Nasce 1 (default do banco); o gatilho soma 1 em todo <c>UPDATE</c>. Fica 0 até o primeiro <c>SaveChanges</c>.</summary>
    public long Versao { get; private set; }

    public DateTime CriadaEm { get; private set; }

    public DateTime AtualizadaEm { get; private set; }

    public DateTime? ArquivadaEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    public static Carteira Criar(Guid empresaId, string nome, string tipo, DateTime criadaEmUtc, Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId);
        Validacao.Utc(criadaEmUtc, nameof(criadaEmUtc));

        var nomeAparado = nome?.Trim() ?? "";
        if (nomeAparado.Length is < 1 or > TamanhoMaximoNome)
        {
            throw Validacao.Campo("nome", $"O nome deve ter entre 1 e {TamanhoMaximoNome} caracteres.");
        }

        if (nomeAparado.Any(char.IsControl))
        {
            throw Validacao.Campo("nome", "O nome não pode ter caracteres de controle.");
        }

        if (!TiposCarteira.EhValido(tipo))
        {
            throw Validacao.Campo("tipo", "Tipo de carteira inválido.");
        }

        return new Carteira(id ?? Guid.CreateVersion7(), empresaId, nomeAparado, tipo, criadaEmUtc);
    }

    #endregion
}
