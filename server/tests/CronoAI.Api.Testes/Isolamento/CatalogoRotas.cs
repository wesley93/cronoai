namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Catálogo VERSIONADO de rotas e cenários de isolamento. Rota nova sem entrada aqui reprova o teste genérico:
/// o autor é obrigado a declarar o cenário (e, para rota com <c>{id}</c>, um <c>ComIdDeOutraEmpresa</c>).
/// </summary>
public static class CatalogoRotas
{
    #region Campos

    private const string Raiz = "/api/v1";

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
}
