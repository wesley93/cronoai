namespace CronoAI.Api.Obras;

/// <summary>
/// Resultado discriminado de uma escrita de obra. O serviço decide o desfecho; o endpoint só o traduz em
/// <c>TypedResults</c>. Os valores de <see cref="TipoDoConflito"/> são os <c>type</c> curtos do ProblemDetails 409.
/// </summary>
public sealed class ResultadoEscritaObra
{
    #region Campos

    public const string ConflitoDeVersao = "conflito-de-versao";

    public const string ObraArquivada = "obra-arquivada";

    public const string ObraNaoArquivada = "obra-nao-arquivada";

    public const string ObraNomeDuplicado = "obra-nome-duplicado";

    /// <summary><c>type</c> curto do 403 de campo de cadastro (extensão <c>campos</c>).</summary>
    public const string CampoNaoPermitidoTipo = "campo-nao-permitido";

    #endregion

    #region Construtor

    private ResultadoEscritaObra(
        StatusResultadoObra status,
        ObraResposta? obra,
        string? tipoDoConflito,
        ObraResposta? estadoAtual,
        IDictionary<string, string[]>? erros,
        IReadOnlyList<string>? camposNaoPermitidos = null)
    {
        Status = status;
        Obra = obra;
        TipoDoConflito = tipoDoConflito;
        EstadoAtual = estadoAtual;
        Erros = erros;
        CamposNaoPermitidos = camposNaoPermitidos;
    }

    #endregion

    #region Propriedades

    public StatusResultadoObra Status { get; }

    /// <summary>A obra gravada (só em <see cref="StatusResultadoObra.Ok"/>).</summary>
    public ObraResposta? Obra { get; }

    public string? TipoDoConflito { get; }

    /// <summary>A obra como está no banco (só nos conflitos de versão e de arquivamento).</summary>
    public ObraResposta? EstadoAtual { get; }

    /// <summary>Erros por campo (só em <see cref="StatusResultadoObra.Invalida"/>).</summary>
    public IDictionary<string, string[]>? Erros { get; }

    /// <summary>Nomes (só os nomes, nunca os valores) dos campos de cadastro que o perfil não pode mudar (só em <see cref="StatusResultadoObra.CampoNaoPermitido"/>).</summary>
    public IReadOnlyList<string>? CamposNaoPermitidos { get; }

    #endregion

    #region Métodos públicos

    public static ResultadoEscritaObra Sucesso(ObraResposta obra) => new(StatusResultadoObra.Ok, obra, null, null, null);

    public static ResultadoEscritaObra Invalida(string campo, string mensagem) =>
        new(StatusResultadoObra.Invalida, null, null, null, new Dictionary<string, string[]> { [campo] = [mensagem] });

    public static ResultadoEscritaObra NaoEncontrada() => new(StatusResultadoObra.NaoEncontrada, null, null, null, null);

    public static ResultadoEscritaObra CampoNaoPermitido(IReadOnlyList<string> campos) =>
        new(StatusResultadoObra.CampoNaoPermitido, null, null, null, null, campos);

    public static ResultadoEscritaObra Conflito(string tipo, ObraResposta? estadoAtual) =>
        new(StatusResultadoObra.Conflito, null, tipo, estadoAtual, null);

    #endregion
}
