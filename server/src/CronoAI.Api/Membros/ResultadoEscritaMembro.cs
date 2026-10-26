namespace CronoAI.Api.Membros;

/// <summary>
/// Resultado discriminado de uma escrita de membro. O serviço decide o desfecho; o endpoint só o traduz em <c>TypedResults</c>. Os
/// valores de <see cref="TipoDoConflito"/> são os <c>type</c> curtos do ProblemDetails 409.
/// </summary>
public sealed class ResultadoEscritaMembro
{
    #region Campos

    public const string ConflitoDeVersao = "conflito-de-versao";

    public const string UltimoAdministrador = "ultimo-administrador";

    public const string MembroResponsavel = "membro-responsavel";

    public const string MembroRemovido = "membro-removido";

    public const string MembroNaoRemovido = "membro-nao-removido";

    /// <summary><c>type</c> curto do 400 de perfil que a API ainda não atribui.</summary>
    public const string PerfilIndisponivelTipo = "perfil-indisponivel";

    #endregion

    #region Construtor

    private ResultadoEscritaMembro(
        StatusResultadoMembro status,
        MembroResposta? membro,
        string? tipoDoConflito,
        MembroResposta? estadoAtual,
        IDictionary<string, string[]>? erros,
        IReadOnlyList<Guid>? obras = null,
        IReadOnlyList<Guid>? frentes = null)
    {
        Status = status;
        Membro = membro;
        TipoDoConflito = tipoDoConflito;
        EstadoAtual = estadoAtual;
        Erros = erros;
        Obras = obras;
        Frentes = frentes;
    }

    #endregion

    #region Propriedades

    public StatusResultadoMembro Status { get; }

    /// <summary>O membro gravado (só em <see cref="StatusResultadoMembro.Ok"/>).</summary>
    public MembroResposta? Membro { get; }

    public string? TipoDoConflito { get; }

    /// <summary>O membro como está no banco (só nos conflitos de versão, de removido e de não removido).</summary>
    public MembroResposta? EstadoAtual { get; }

    /// <summary>Erros por campo (só em <see cref="StatusResultadoMembro.Invalida"/>).</summary>
    public IDictionary<string, string[]>? Erros { get; }

    /// <summary>Ids das obras de que o membro é responsável (só em <see cref="MembroResponsavel"/>; nunca nomes).</summary>
    public IReadOnlyList<Guid>? Obras { get; }

    /// <summary>Ids das frentes de que o membro é responsável (só em <see cref="MembroResponsavel"/>).</summary>
    public IReadOnlyList<Guid>? Frentes { get; }

    #endregion

    #region Métodos públicos

    public static ResultadoEscritaMembro Sucesso(MembroResposta membro) => new(StatusResultadoMembro.Ok, membro, null, null, null);

    public static ResultadoEscritaMembro Invalida(string campo, string mensagem) =>
        new(StatusResultadoMembro.Invalida, null, null, null, new Dictionary<string, string[]> { [campo] = [mensagem] });

    public static ResultadoEscritaMembro PerfilIndisponivel() => new(StatusResultadoMembro.PerfilIndisponivel, null, null, null, null);

    public static ResultadoEscritaMembro NaoEncontrado() => new(StatusResultadoMembro.NaoEncontrado, null, null, null, null);

    public static ResultadoEscritaMembro Conflito(string tipo, MembroResposta? estadoAtual) =>
        new(StatusResultadoMembro.Conflito, null, tipo, estadoAtual, null);

    public static ResultadoEscritaMembro ConflitoDeResponsavel(IReadOnlyList<Guid> obras, IReadOnlyList<Guid> frentes) =>
        new(StatusResultadoMembro.Conflito, null, MembroResponsavel, null, null, obras, frentes);

    #endregion
}
