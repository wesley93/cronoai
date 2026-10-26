namespace CronoAI.Dominio;

/// <summary>
/// Frente de serviço de uma obra (RF-01.1c). Neste ciclo só o MODELO existe (a API é do 00014b) e a frente ainda não filtra
/// nenhum dado: o filtro por frente nasce com as tabelas filhas (tarefa, relato). O responsável é um membro
/// (<see cref="ResponsavelId"/>) OU um texto livre (<see cref="ResponsavelTexto"/>, Q2: o encarregado ainda não faz login);
/// no máximo um dos dois. O texto livre é dado pessoal de trabalhador: fica FORA da lista branca da trilha e dos logs.
/// <see cref="Versao"/> é incrementada por gatilho (padrão da obra).
/// </summary>
public sealed class Frente : IDadoDeEmpresa, IDadoDeObra, IArquivavel
{
    #region Campos

    public const int TamanhoMaximoNome = 200;

    public const int TamanhoMaximoResponsavelTexto = 120;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private Frente()
    {
    }

    private Frente(Guid id, Guid empresaId, Guid obraId, string nome, Guid? responsavelId, string? responsavelTexto, DateTime criadaEm)
    {
        Id = id;
        EmpresaId = empresaId;
        ObraId = obraId;
        Nome = nome;
        ResponsavelId = responsavelId;
        ResponsavelTexto = responsavelTexto;
        CriadaEm = criadaEm;
        AtualizadaEm = criadaEm;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    public Guid EmpresaId { get; private set; }

    public Guid ObraId { get; private set; }

    public string Nome { get; private set; } = "";

    public Guid? ResponsavelId { get; private set; }

    public string? ResponsavelTexto { get; private set; }

    /// <summary>Nasce 1 (default do banco); o gatilho soma 1 em todo <c>UPDATE</c>. Fica 0 até o primeiro <c>SaveChanges</c>.</summary>
    public long Versao { get; private set; }

    public DateTime CriadaEm { get; private set; }

    public DateTime AtualizadaEm { get; private set; }

    public DateTime? ArquivadaEm { get; private set; }

    Guid IAuditavel.EntidadeId => Id;

    #endregion

    #region Métodos públicos

    public static Frente Criar(
        Guid empresaId,
        Guid obraId,
        string nome,
        Guid? responsavelId,
        string? responsavelTexto,
        DateTime criadaEmUtc,
        Guid? id = null)
    {
        Validacao.IdsObrigatorios(empresaId, obraId);
        Validacao.Utc(criadaEmUtc, nameof(criadaEmUtc));

        var nomeAparado = nome?.Trim() ?? "";
        if (nomeAparado.Length is < 1 or > TamanhoMaximoNome)
        {
            throw Validacao.Campo("nome", $"O nome deve ter entre 1 e {TamanhoMaximoNome} caracteres.");
        }

        if (nomeAparado.Any(char.IsControl))
        {
            // Inclui \0 (o PostgreSQL recusa NUL em text), tabulação e quebras de linha.
            throw Validacao.Campo("nome", "O nome não pode ter caracteres de controle.");
        }

        if (responsavelId == Guid.Empty)
        {
            throw Validacao.Campo("responsavelId", "O responsável é inválido.");
        }

        if (responsavelTexto is not null)
        {
            if (responsavelTexto.Length is < 1 or > TamanhoMaximoResponsavelTexto)
            {
                throw Validacao.Campo("responsavelTexto", $"O responsável em texto deve ter entre 1 e {TamanhoMaximoResponsavelTexto} caracteres.");
            }

            if (responsavelTexto.Any(char.IsControl))
            {
                throw Validacao.Campo("responsavelTexto", "O responsável em texto não pode ter caracteres de controle.");
            }
        }

        if (responsavelId is not null && responsavelTexto is not null)
        {
            throw Validacao.Campo("responsavelTexto", "Informe o responsável como membro OU como texto, não os dois.");
        }

        return new Frente(id ?? Guid.CreateVersion7(), empresaId, obraId, nomeAparado, responsavelId, responsavelTexto, criadaEmUtc);
    }

    #endregion
}
