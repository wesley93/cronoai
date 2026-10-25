namespace CronoAI.Api.Autenticacao;

/// <summary>Tempos da sessão (seção <c>Autenticacao:Sessao</c>). Valores sugeridos; o parecer final é da Segurança.</summary>
public sealed class OpcoesSessao
{
    #region Campos

    public const string Secao = "Autenticacao:Sessao";

    #endregion

    #region Propriedades

    /// <summary>Inatividade deslizante, só no ticket do cookie.</summary>
    public int InatividadeMinutos { get; set; } = 30;

    /// <summary>Prazo absoluto, gravado em <c>sessao.expira_em</c>.</summary>
    public int DuracaoMaximaHoras { get; set; } = 8;

    /// <summary>Retenção das sessões terminadas do próprio usuário (limpeza oportunista no login).</summary>
    public int RetencaoDias { get; set; } = 30;

    #endregion
}
