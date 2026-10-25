namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Uma rota do catálogo com o cenário de isolamento dela.</summary>
/// <param name="Metodo">Método HTTP.</param>
/// <param name="Padrao">Padrão da rota.</param>
/// <param name="Cenario">Cenário exigido.</param>
/// <param name="Corpo">Corpo JSON de uma chamada válida (escritas), recebendo o id de uma empresa de OUTRO inquilino.</param>
/// <param name="Recurso">Recurso real da empresa B que ocupa o <c>{id}</c> da rota (rota com <c>{id}</c> de obra declara <see cref="RecursoAlheio.Obra"/>).</param>
public sealed record EntradaCatalogo(string Metodo, string Padrao, CenarioIsolamento Cenario, Func<Guid, object?>? Corpo = null, RecursoAlheio Recurso = RecursoAlheio.Nenhum)
{
    #region Propriedades

    public string Chave => $"{Metodo} {Padrao}";

    #endregion
}
