using System.Net;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Catálogo VERSIONADO de rotas e cenários de isolamento. Rota nova sem entrada aqui reprova o teste genérico:
/// o autor é obrigado a declarar o cenário (e, para rota com <c>{id}</c>, um <c>ComIdDeOutraEmpresa</c>).
/// </summary>
public static class CatalogoRotas
{
    #region Campos

    private const string Raiz = "/api/v1";

    // Justificativa do "não se aplica" (ciclo 00014): a ação só existe para o administrador (escopo todas), que enxerga todas as obras.
    private const string SoAdministrador = "ação só do administrador, que enxerga todas as obras da empresa: não há usuário com a ação e sem alcance; o perfil sem a ação recebe 403 antes de carregar a obra";

    public static readonly IReadOnlyList<EntradaCatalogo> Entradas =
    [
        new("GET", "/health/live", CenarioIsolamento.Anonima),
        new("GET", "/health/ready", CenarioIsolamento.Anonima),
        new("GET", "/openapi/{documentName}.json", CenarioIsolamento.Anonima),
        new("GET", Raiz + "/autenticacao/entrar", CenarioIsolamento.Anonima),
        new("POST", Raiz + "/autenticacao/desenvolvimento/entrar", CenarioIsolamento.DesenvolvimentoApenas, _ => new { usuario = "dev-a" }),
        new("POST", Raiz + "/autenticacao/sair", CenarioIsolamento.SemRecurso),
        new("GET", Raiz + "/autenticacao/antiforgery", CenarioIsolamento.SemRecurso),
        new("GET", Raiz + "/eu", CenarioIsolamento.SemRecurso),
        new("GET", Raiz + "/empresas/atual", CenarioIsolamento.SemRecurso),
        new("PUT", Raiz + "/empresas/atual", CenarioIsolamento.ComIdDeOutraEmpresa, empresaAlheia => new { empresaId = empresaAlheia }),

        // Obras (ciclo 00013): o {id} é uma obra REAL da empresa B (meta-teste Concretizacao_de_id_usa_obra_real_da_empresa_B).
        new("GET", Raiz + "/obras", CenarioIsolamento.SemRecurso),
        new("POST", Raiz + "/obras", CenarioIsolamento.SemRecurso, _ => CorpoDeObra()),
        new("GET", Raiz + "/obras/{id}", CenarioIsolamento.ComIdDeOutraEmpresa, Recurso: RecursoAlheio.Obra, SemVinculo: new("engenheiro_obra", HttpStatusCode.NotFound)),
        new("PUT", Raiz + "/obras/{id}", CenarioIsolamento.ComIdDeOutraEmpresa, _ => CorpoDeAtualizacao(), RecursoAlheio.Obra, new("engenheiro_planejamento", HttpStatusCode.NotFound)),
        new("POST", Raiz + "/obras/{id}/arquivar", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { versao = 1 }, RecursoAlheio.Obra, new("engenheiro_obra", HttpStatusCode.Forbidden, SoAdministrador)),
        new("POST", Raiz + "/obras/{id}/restaurar", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { versao = 1 }, RecursoAlheio.Obra, new("engenheiro_obra", HttpStatusCode.Forbidden, SoAdministrador)),

        // Trilha de auditoria (ciclo 00013, E3): a da obra tem {id} (obra REAL de B); a exportação é por empresa da sessão.
        new("GET", Raiz + "/obras/{id}/auditoria", CenarioIsolamento.ComIdDeOutraEmpresa, Recurso: RecursoAlheio.Obra, SemVinculo: new("engenheiro_obra", HttpStatusCode.NotFound)),
        new("GET", Raiz + "/auditoria/exportacao.csv", CenarioIsolamento.SemRecurso),

        // Membros (ciclo 00014, E3): o {usuarioId} é um membro REAL da empresa B.
        new("GET", Raiz + "/membros", CenarioIsolamento.SemRecurso),
        new("PUT", Raiz + "/membros/{usuarioId}", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { perfil = "engenheiro_obra", versao = 1 }, RecursoAlheio.Membro),
        new("POST", Raiz + "/membros/{usuarioId}/remover", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { versao = 1 }, RecursoAlheio.Membro),
        new("POST", Raiz + "/membros/{usuarioId}/reativar", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { versao = 1 }, RecursoAlheio.Membro),

        // Acessos de obra (ciclo 00014, E3): a obra é REAL de B e, na revogação, o {usuarioId} é membro REAL de B. O corpo do conceder
        // leva um usuário qualquer: a obra invisível (404) é decidida ANTES de olhar o destino, então o 404 prova a obra e não o corpo.
        // Quem tem a ação e não tem a obra é o gestor de portfólio sem carteira atribuída (escopo carteiras).
        new("GET", Raiz + "/obras/{id}/acessos", CenarioIsolamento.ComIdDeOutraEmpresa, Recurso: RecursoAlheio.Obra, SemVinculo: new("gestor_portfolio", HttpStatusCode.NotFound, Escopo: "carteiras")),
        new("POST", Raiz + "/obras/{id}/acessos", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { usuarioId = Guid.NewGuid() }, RecursoAlheio.Obra, new("gestor_portfolio", HttpStatusCode.NotFound, Escopo: "carteiras")),
        new("POST", Raiz + "/obras/{id}/acessos/{usuarioId}/revogar", CenarioIsolamento.ComIdDeOutraEmpresa, _ => new { }, RecursoAlheio.ObraEMembro, new("gestor_portfolio", HttpStatusCode.NotFound, Escopo: "carteiras")),
    ];

    /// <summary>Únicas rotas que podem ser anônimas (AllowAnonymous), por chave.</summary>
    public static readonly IReadOnlySet<string> AnonimasPermitidas = new HashSet<string>(StringComparer.Ordinal)
    {
        "GET /health/live",
        "GET /health/ready",
        "GET /openapi/{documentName}.json",
        "GET " + Raiz + "/autenticacao/entrar",
        "POST " + Raiz + "/autenticacao/desenvolvimento/entrar",
    };

    #endregion

    #region Métodos privados

    // Corpo válido e fictício (município 2699999 de PE, dígito verificador conferido). Nome único por chamada.
    private static object CorpoDeObra() =>
        new { nome = "Obra Ficticia " + Guid.NewGuid().ToString("N")[..10], uf = "PE", municipioIbge = "2699999" };

    private static object CorpoDeAtualizacao() =>
        new { versao = 1, nome = "Obra Ficticia " + Guid.NewGuid().ToString("N")[..10], uf = "PE", municipioIbge = "2699999" };

    #endregion
}
