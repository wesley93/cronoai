namespace CronoAI.Api.Testes.Infra;

/// <summary>Procura um tipo de exceção na cadeia (a partida do host embrulha a exceção original).</summary>
public static class Excecoes
{
    #region Métodos públicos

    public static T? Procurar<T>(Exception? excecao)
        where T : Exception
    {
        for (var atual = excecao; atual is not null; atual = atual.InnerException)
        {
            if (atual is T encontrada)
            {
                return encontrada;
            }

            if (atual is AggregateException agregada)
            {
                foreach (var interna in agregada.InnerExceptions)
                {
                    var achada = Procurar<T>(interna);
                    if (achada is not null)
                    {
                        return achada;
                    }
                }
            }
        }

        return null;
    }

    #endregion
}
