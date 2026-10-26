using System.Net;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Uma rota do catálogo com o cenário de isolamento dela.</summary>
/// <param name="Metodo">Método HTTP.</param>
/// <param name="Padrao">Padrão da rota.</param>
/// <param name="Cenario">Cenário exigido.</param>
/// <param name="Corpo">Corpo JSON de uma chamada válida (escritas), recebendo o id de uma empresa de OUTRO inquilino.</param>
/// <param name="Recurso">Recurso real da empresa B que ocupa o <c>{id}</c> (e o <c>{usuarioId}</c>) da rota.</param>
/// <param name="SemVinculo">Cenário da obra REAL da mesma empresa sem vínculo com o usuário (rota com <c>{id}</c> de obra).</param>
/// <param name="CorpoDosRecursos">Corpo que depende dos recursos reais (ex.: o membro real da empresa de quem chama); tem precedência sobre <paramref name="Corpo"/>.</param>
public sealed record EntradaCatalogo(
    string Metodo,
    string Padrao,
    CenarioIsolamento Cenario,
    Func<Guid, object?>? Corpo = null,
    RecursoAlheio Recurso = RecursoAlheio.Nenhum,
    SemVinculoDoCenario? SemVinculo = null,
    Func<RecursosDeIsolamento, object?>? CorpoDosRecursos = null)
{
    #region Propriedades

    public string Chave => $"{Metodo} {Padrao}";

    #endregion
}
