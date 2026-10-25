using CronoAI.Dominio;

namespace CronoAI.Dados.Auditoria;

/// <summary>
/// Metadados OBRIGATÓRIOS de uma escrita auditada: de onde veio, por quê, a correlação com os logs e o instante
/// (do <c>TimeProvider</c>, nunca <c>now()</c>). Imutável. O usuário NÃO está aqui: vem do contexto de banco da sessão,
/// nunca do corpo da requisição (ADR 00009).
/// </summary>
public sealed record MetadadosEscrita
{
    #region Construtor

    public MetadadosEscrita(string origem, string? motivo, Guid? correlacaoId, DateTime instanteUtc)
    {
        if (!OrigensAuditoria.EhValida(origem))
        {
            throw new ArgumentException("Origem de auditoria inválida.", nameof(origem));
        }

        // Texto livre: só a ausência (nulo ou em branco) vira nulo. O conteúdo NÃO é alterado (nem aparado): quem o exporta
        // neutraliza fórmula em CSV, inclusive a que começa com TAB ou CR.
        if (motivo is { Length: > RegistroAuditoria.TamanhoMaximoMotivo })
        {
            throw new ArgumentException($"O motivo deve ter no máximo {RegistroAuditoria.TamanhoMaximoMotivo} caracteres.", nameof(motivo));
        }

        // O PostgreSQL recusa NUL em text.
        if (motivo is not null && motivo.Contains('\0', StringComparison.Ordinal))
        {
            throw new ArgumentException("O motivo não pode ter o caractere nulo.", nameof(motivo));
        }

        if (instanteUtc.Kind != DateTimeKind.Utc)
        {
            throw new ArgumentException("O instante precisa ser UTC (timestamptz).", nameof(instanteUtc));
        }

        Origem = origem;
        Motivo = string.IsNullOrWhiteSpace(motivo) ? null : motivo;
        CorrelacaoId = correlacaoId;
        InstanteUtc = instanteUtc;
    }

    #endregion

    #region Propriedades

    public string Origem { get; }

    /// <summary>Texto livre opcional (até 500 caracteres): a interface avisa para não digitar dado pessoal.</summary>
    public string? Motivo { get; }

    public Guid? CorrelacaoId { get; }

    public DateTime InstanteUtc { get; }

    #endregion
}
