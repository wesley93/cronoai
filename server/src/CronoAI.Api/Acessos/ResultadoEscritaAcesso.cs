namespace CronoAI.Api.Acessos;

/// <summary>Resultado discriminado de uma escrita de acesso de obra: o serviço decide o desfecho e o endpoint o traduz em <c>TypedResults</c>.</summary>
public sealed class ResultadoEscritaAcesso
{
    #region Campos

    /// <summary><c>type</c> curto do 409 de vínculo repetido.</summary>
    public const string AcessoExistente = "acesso-existente";

    #endregion

    #region Construtor

    private ResultadoEscritaAcesso(StatusResultadoAcesso status, AcessoObraResposta? acesso, IDictionary<string, string[]>? erros)
    {
        Status = status;
        Acesso = acesso;
        Erros = erros;
    }

    #endregion

    #region Propriedades

    public StatusResultadoAcesso Status { get; }

    /// <summary>O vínculo criado (só ao conceder, em <see cref="StatusResultadoAcesso.Ok"/>).</summary>
    public AcessoObraResposta? Acesso { get; }

    /// <summary>Erros por campo (só em <see cref="StatusResultadoAcesso.Invalida"/>).</summary>
    public IDictionary<string, string[]>? Erros { get; }

    #endregion

    #region Métodos públicos

    public static ResultadoEscritaAcesso Sucesso(AcessoObraResposta? acesso) => new(StatusResultadoAcesso.Ok, acesso, null);

    public static ResultadoEscritaAcesso Invalida(string campo, string mensagem) =>
        new(StatusResultadoAcesso.Invalida, null, new Dictionary<string, string[]> { [campo] = [mensagem] });

    public static ResultadoEscritaAcesso NaoEncontrado() => new(StatusResultadoAcesso.NaoEncontrado, null, null);

    public static ResultadoEscritaAcesso Existente() => new(StatusResultadoAcesso.Conflito, null, null);

    #endregion
}
