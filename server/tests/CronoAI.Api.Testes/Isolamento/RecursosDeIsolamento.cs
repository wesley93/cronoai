namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Os recursos REAIS que o montador único (<see cref="RequisicaoDeIsolamento"/>) pode colocar na rota.</summary>
/// <param name="Obra">Obra real (vai no <c>{id}</c> das rotas de obra).</param>
/// <param name="Membro">Membro real (vai no <c>{usuarioId}</c>).</param>
/// <param name="MembroDoChamador">Membro REAL da empresa de quem chama (destino do corpo de <c>POST /obras/{id}/acessos</c>): com um usuário
/// aleatório o 404 não provaria nada, porque a obra invisível é decidida antes de olhar o destino mas o 201 (com visibilidade) exigiria um membro de verdade.</param>
public sealed record RecursosDeIsolamento(Guid? Obra = null, Guid? Membro = null, Guid? MembroDoChamador = null)
{
    #region Propriedades

    /// <summary>Sem recursos: os parâmetros viram guids aleatórios (só serve a 401 e antiforgery; nunca prova isolamento).</summary>
    public static RecursosDeIsolamento Nenhum { get; } = new();

    #endregion
}
