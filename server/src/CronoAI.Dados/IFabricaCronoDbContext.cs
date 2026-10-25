namespace CronoAI.Dados;

/// <summary>
/// Cria <see cref="CronoDbContext"/> com um contexto de banco explícito. Os fluxos de identidade (login,
/// validação de sessão, semente) usam a fábrica e nunca o contexto scoped da requisição.
/// </summary>
public interface IFabricaCronoDbContext
{
    #region Métodos públicos

    CronoDbContext Criar(ContextoSessaoBanco contexto);

    #endregion
}
