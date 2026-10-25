namespace CronoAI.Api.Testes.Infra;

/// <summary>Relógio controlado pelo teste (<see cref="TimeProvider"/>): sessão, cookie e limpeza leem o tempo daqui.</summary>
public sealed class RelogioTeste : TimeProvider
{
    #region Campos

    private DateTimeOffset _agora;

    #endregion

    #region Construtor

    public RelogioTeste()
        : this(DateTimeOffset.UtcNow)
    {
    }

    public RelogioTeste(DateTimeOffset inicio)
    {
        _agora = inicio;
    }

    #endregion

    #region Métodos públicos

    public override DateTimeOffset GetUtcNow() => _agora;

    /// <summary>Avança (ou recua, com valor negativo) o relógio.</summary>
    public void Avancar(TimeSpan intervalo) => _agora += intervalo;

    #endregion
}
