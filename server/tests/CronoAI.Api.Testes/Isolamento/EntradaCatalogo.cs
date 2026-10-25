namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Uma rota do catálogo com o cenário de isolamento dela.</summary>
/// <param name="Metodo">Método HTTP.</param>
/// <param name="Padrao">Padrão da rota.</param>
/// <param name="Cenario">Cenário exigido.</param>
/// <param name="Corpo">Corpo JSON de uma chamada válida (escritas), recebendo o id de uma empresa de OUTRO inquilino.</param>
public sealed record EntradaCatalogo(string Metodo, string Padrao, CenarioIsolamento Cenario, Func<Guid, object?>? Corpo = null)
{
    #region Propriedades

    public string Chave => $"{Metodo} {Padrao}";

    #endregion
}
