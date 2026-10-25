namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Tipo de cenário de isolamento exigido de cada rota registrada (catálogo versionado).</summary>
public enum CenarioIsolamento
{
    /// <summary>Rota anônima de propósito: só as da lista fixa (saúde, OpenAPI em Development, início do login).</summary>
    Anonima,

    /// <summary>Rota autenticada sem recurso por id: a resposta não pode conter dado de outra empresa.</summary>
    SemRecurso,

    /// <summary>Rota que recebe id de recurso: com id de outra empresa responde 404, sem dado dela.</summary>
    ComIdDeOutraEmpresa,

    /// <summary>Rota que só existe em Development com a flag; tem testes próprios.</summary>
    DesenvolvimentoApenas,
}
