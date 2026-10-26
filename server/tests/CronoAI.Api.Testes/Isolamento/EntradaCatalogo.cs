using System.Net;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>Uma rota do catálogo com o cenário de isolamento dela.</summary>
/// <param name="Metodo">Método HTTP.</param>
/// <param name="Padrao">Padrão da rota.</param>
/// <param name="Cenario">Cenário exigido.</param>
/// <param name="Corpo">Corpo JSON de uma chamada válida (escritas), recebendo o id de uma empresa de OUTRO inquilino.</param>
/// <param name="Recurso">Recurso real da empresa B que ocupa o <c>{id}</c> (e o <c>{usuarioId}</c>) da rota.</param>
/// <param name="SemVinculo">Cenário da obra REAL da mesma empresa sem vínculo com o usuário (rota com <c>{id}</c> de obra).</param>
public sealed record EntradaCatalogo(
    string Metodo,
    string Padrao,
    CenarioIsolamento Cenario,
    Func<Guid, object?>? Corpo = null,
    RecursoAlheio Recurso = RecursoAlheio.Nenhum,
    SemVinculoDoCenario? SemVinculo = null)
{
    #region Propriedades

    public string Chave => $"{Metodo} {Padrao}";

    #endregion
}

/// <summary>
/// Obra REAL da mesma empresa que o usuário NÃO enxerga (sem vínculo): quem é o usuário (perfil) e o status esperado. O status é
/// 404 quando o perfil TEM a ação (o RLS esconde a obra); é 403 quando a ação é só de perfis de escopo "todas" (que veem todas as obras,
/// então não existe usuário com a ação e sem alcance): nesse caso <paramref name="NaoSeAplica"/> traz a justificativa.
/// </summary>
/// <param name="Perfil">Perfil do usuário do cenário (escopo <c>vinculadas</c>, sem nenhum vínculo).</param>
/// <param name="Esperado">Status esperado.</param>
/// <param name="NaoSeAplica">Justificativa quando o cenário "tem a ação e não tem a obra" não se aplica à rota.</param>
public sealed record SemVinculoDoCenario(string Perfil, HttpStatusCode Esperado, string? NaoSeAplica = null);
