using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes;

public sealed class OpenApiTestes
{
    #region Métodos públicos

    [Fact]
    public async Task Documento_openapi_so_em_desenvolvimento()
    {
        await using var desenvolvimento = new ApiFactory(ApiFactory.ConexaoSemBanco, "Development");
        using var clienteDev = desenvolvimento.CreateClient();
        var emDev = await clienteDev.GetAsync("/openapi/v1.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, emDev.StatusCode);
        Assert.Contains("\"openapi\"", await emDev.Content.ReadAsStringAsync(TestContext.Current.CancellationToken), StringComparison.Ordinal);

        await using var producao = new ApiFactory(ApiFactory.ConexaoSemBanco, "Production");
        using var clienteProd = producao.CreateClient();
        var emProd = await clienteProd.GetAsync("/openapi/v1.json", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.NotFound, emProd.StatusCode);
    }

    [Fact]
    public void Contrato_das_rotas_de_dado_declara_exatamente_os_status_do_plano()
    {
        // AC-21: o contrato versionado (o OpenAPI regenerado no build) declara, em cada rota de dado, EXATAMENTE os status que o
        // handler pode devolver (Results<...> + ProducesProblem do pipeline): nada de status inalcançável e nenhum faltando.
        var documento = JsonDocument.Parse(File.ReadAllText(CaminhoDoContrato())).RootElement.GetProperty("paths");
        var esperado = new (string Metodo, string Rota, string Status)[]
        {
            ("get", "/api/v1/obras", "200,401,403"),
            ("post", "/api/v1/obras", "201,400,401,403,409,413"),
            ("get", "/api/v1/obras/{id}", "200,401,403,404"),
            ("put", "/api/v1/obras/{id}", "200,400,401,403,404,409,413"),
            ("post", "/api/v1/obras/{id}/arquivar", "200,400,401,403,404,409,413"),
            ("post", "/api/v1/obras/{id}/restaurar", "200,400,401,403,404,409,413"),
            ("get", "/api/v1/obras/{id}/auditoria", "200,400,401,403,404"),
            ("get", "/api/v1/obras/{id}/acessos", "200,401,403,404"),
            ("post", "/api/v1/obras/{id}/acessos", "201,400,401,403,404,409,413"),
            ("post", "/api/v1/obras/{id}/acessos/{usuarioId}/revogar", "204,400,401,403,404,413"),
            ("get", "/api/v1/membros", "200,401,403"),
            ("put", "/api/v1/membros/{usuarioId}", "200,400,401,403,404,409,413"),
            ("post", "/api/v1/membros/{usuarioId}/remover", "200,400,401,403,404,409,413"),
            ("post", "/api/v1/membros/{usuarioId}/reativar", "200,400,401,403,404,409,413"),
        };

        foreach (var (metodo, rota, status) in esperado)
        {
            var declarados = string.Join(',', documento.GetProperty(rota).GetProperty(metodo).GetProperty("responses").EnumerateObject().Select(r => r.Name).Order(StringComparer.Ordinal));

            Assert.True(status == declarados, $"{metodo.ToUpperInvariant()} {rota}: contrato declara [{declarados}], o plano exige [{status}]");
        }

        // /eu ganha perfil e escopoObras (nulos sem empresa ativa).
        var eu = JsonDocument.Parse(File.ReadAllText(CaminhoDoContrato())).RootElement.GetProperty("components").GetProperty("schemas").GetProperty("EuResposta").GetProperty("properties");
        Assert.True(eu.TryGetProperty("perfil", out _) && eu.TryGetProperty("escopoObras", out _));
    }

    #endregion

    #region Métodos privados

    private static string CaminhoDoContrato()
    {
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !File.Exists(Path.Combine(pasta.FullName, "CronoAI.slnx")))
        {
            pasta = pasta.Parent;
        }

        return Path.Combine(pasta?.FullName ?? throw new InvalidOperationException("CronoAI.slnx não encontrado."), "openapi", "CronoAI.Api.json");
    }

    #endregion
}
