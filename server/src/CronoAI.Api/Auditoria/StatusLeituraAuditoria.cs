namespace CronoAI.Api.Auditoria;

/// <summary>Desfecho de uma leitura da trilha no <see cref="ServicoAuditoria"/>.</summary>
public enum StatusLeituraAuditoria
{
    /// <summary>Pedido válido: 200.</summary>
    Ok,

    /// <summary>Parâmetro inválido: 400 com o campo.</summary>
    Invalida,

    /// <summary>Obra inexistente OU de outra empresa (indistinguíveis de propósito): 404.</summary>
    NaoEncontrada,
}
