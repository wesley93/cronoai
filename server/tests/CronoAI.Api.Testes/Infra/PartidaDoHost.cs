using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Prova que o host NÃO sobe e por quê, sem depender de COMO a exceção chega ao teste. O
/// <c>WebApplicationFactory</c> executa o ponto de entrada em outra thread e a exceção da partida pode chegar
/// embrulhada de formas diferentes sob carga (a suíte completa mostrou o tipo esperado ausente da cadeia em alguns casos).
/// O host registra a causa em log (<c>Hosting failed to start</c>) ANTES de lançar: o texto do log é a fonte estável.
/// </summary>
public static class PartidaDoHost
{
    #region Métodos públicos

    /// <summary>Exige que <c>CreateClient()</c> falhe e devolve o texto da exceção mais o log da partida.</summary>
    public static string ExigirFalha(ApiFactory fabrica, string marcadorDaCausa)
    {
        ArgumentNullException.ThrowIfNull(fabrica);
        var logs = fabrica.Logs ?? throw new InvalidOperationException("A fábrica precisa de Logs para diagnosticar a partida.");

        var erro = Record.Exception(() => fabrica.CreateClient());

        Assert.True(erro is not null, "o host subiu, mas deveria falhar na partida");
        SpinWait.SpinUntil(() => logs.Tudo.Contains(marcadorDaCausa, StringComparison.Ordinal), TimeSpan.FromSeconds(5));
        return erro + "\n" + logs.Tudo;
    }

    #endregion
}
