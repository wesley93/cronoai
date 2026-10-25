namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Recurso REAL de outra empresa que o teste genérico de isolamento coloca no <c>{id}</c> da rota. Com um id aleatório o 404
/// viria por "não existir" e o teste passaria sem provar o isolamento (lacuna do ciclo 00012, fechada no 00013).
/// </summary>
public enum RecursoAlheio
{
    /// <summary>A rota não tem <c>{id}</c> de recurso (o id, se houver, é aleatório).</summary>
    Nenhum,

    /// <summary>O <c>{id}</c> é uma obra existente da empresa B.</summary>
    Obra,
}
