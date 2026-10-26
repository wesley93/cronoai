using System.Net;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Obra REAL da mesma empresa que o usuário NÃO enxerga (sem vínculo): quem é o usuário (perfil) e o status esperado. O status é
/// 404 quando o perfil TEM a ação (o RLS esconde a obra); é 403 quando a ação é só de perfis de escopo "todas" (que veem todas as obras,
/// então não existe usuário com a ação e sem alcance): nesse caso <paramref name="NaoSeAplica"/> traz a justificativa.
/// </summary>
/// <param name="Perfil">Perfil do usuário do cenário (escopo <c>vinculadas</c>, sem nenhum vínculo).</param>
/// <param name="Esperado">Status esperado.</param>
/// <param name="NaoSeAplica">Justificativa quando o cenário "tem a ação e não tem a obra" não se aplica à rota.</param>
/// <param name="Escopo">Escopo de obras do usuário do cenário; nulo = o único do perfil (ou <c>carteiras</c> para gestor e diretoria, sem nenhuma carteira atribuída).</param>
public sealed record SemVinculoDoCenario(string Perfil, HttpStatusCode Esperado, string? NaoSeAplica = null, string? Escopo = null);
