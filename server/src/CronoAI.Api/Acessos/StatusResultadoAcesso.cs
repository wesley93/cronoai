namespace CronoAI.Api.Acessos;

/// <summary>Desfecho de uma escrita de acesso de obra no <see cref="ServicoAcessosObra"/>.</summary>
public enum StatusResultadoAcesso
{
    /// <summary>Escrita feita: 201 (conceder) ou 204 (revogar).</summary>
    Ok,

    /// <summary>Entrada inválida (motivo, usuário destino): 400 com o campo.</summary>
    Invalida,

    /// <summary>Obra invisível (inexistente, de outra empresa ou sem vínculo) OU vínculo inexistente: 404 idêntico.</summary>
    NaoEncontrado,

    /// <summary>O vínculo já existe: 409 <c>acesso-existente</c>.</summary>
    Conflito,
}
