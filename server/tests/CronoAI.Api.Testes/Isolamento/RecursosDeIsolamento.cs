namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Os recursos REAIS que o montador único (<see cref="RequisicaoDeIsolamento"/>) pode colocar na rota.</summary>
/// <param name="Obra">Obra real (vai no <c>{id}</c> das rotas de obra).</param>
/// <param name="Membro">Membro real (vai no <c>{usuarioId}</c>).</param>
public sealed record RecursosDeIsolamento(Guid? Obra = null, Guid? Membro = null)
{
    #region Propriedades

    /// <summary>Sem recursos: os parâmetros viram guids aleatórios (só serve a 401 e antiforgery; nunca prova isolamento).</summary>
    public static RecursosDeIsolamento Nenhum { get; } = new();

    #endregion
}
