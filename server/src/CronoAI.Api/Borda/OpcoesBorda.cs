namespace CronoAI.Api.Borda;

/// <summary>Limites de taxa por IP (seção <c>Borda</c>). Atrás de proxy dependem de ForwardedHeaders (Infraestrutura).</summary>
public sealed class OpcoesBorda
{
    #region Campos

    public const string Secao = "Borda";

    #endregion

    #region Propriedades

    /// <summary>Requisições por minuto, por IP, em entrar, desenvolvimento, sair e no retorno do OIDC.</summary>
    public int LimiteAutenticacaoPorMinuto { get; set; } = 10;

    /// <summary>Requisições por minuto, por IP, em <c>/health/ready</c>.</summary>
    public int LimiteSaudePorMinuto { get; set; } = 60;

    #endregion
}
