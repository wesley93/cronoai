namespace CronoAI.Dominio;

/// <summary>
/// Usuário identificado pelo par (emissor, sujeito) do OIDC. Dado pessoal mínimo: só o nome de exibição;
/// o e-mail NÃO é guardado (RNF-02.3).
/// </summary>
public sealed class Usuario
{
    #region Campos

    public const int TamanhoMaximoEmissor = 2048;
    public const int TamanhoMaximoSujeito = 255;
    public const int TamanhoMaximoNome = 200;

    #endregion

    #region Construtor

    // Usado pelo EF Core na materialização.
    private Usuario()
    {
    }

    private Usuario(Guid id, string emissor, string sujeito, string? nomeExibicao, DateTime agora)
    {
        Id = id;
        Emissor = emissor;
        Sujeito = sujeito;
        NomeExibicao = nomeExibicao;
        CriadoEm = agora;
        UltimoAcessoEm = agora;
    }

    #endregion

    #region Propriedades

    public Guid Id { get; private set; }

    /// <summary><c>iss</c> validado do token (não a configuração).</summary>
    public string Emissor { get; private set; } = "";

    /// <summary><c>sub</c> do token, sem normalizar a caixa (OIDC Core, seção 2).</summary>
    public string Sujeito { get; private set; } = "";

    public string? NomeExibicao { get; private set; }

    public DateTime CriadoEm { get; private set; }

    public DateTime UltimoAcessoEm { get; private set; }

    /// <summary>Preenchido por quem administra; o login nunca reativa a conta.</summary>
    public DateTime? DesativadoEm { get; private set; }

    #endregion

    #region Métodos públicos

    public static Usuario Criar(string emissor, string sujeito, string? nomeExibicao, DateTime agoraUtc)
    {
        Validacao.TextoEntre(emissor, 1, TamanhoMaximoEmissor, nameof(emissor));
        Validacao.TextoEntre(sujeito, 1, TamanhoMaximoSujeito, nameof(sujeito));
        if (nomeExibicao is not null)
        {
            Validacao.TextoEntre(nomeExibicao, 0, TamanhoMaximoNome, nameof(nomeExibicao));
        }

        Validacao.Utc(agoraUtc, nameof(agoraUtc));
        return new Usuario(Guid.CreateVersion7(), emissor, sujeito, nomeExibicao, agoraUtc);
    }

    #endregion
}
