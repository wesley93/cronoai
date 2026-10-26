using System.Net;
using System.Text.Json;
using CronoAI.Api.Sessao;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dominio;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Permissao;

/// <summary>
/// Matriz perfil × rota pela API, sem UI (plano 00014, T50 e T42). A tabela de resultados é LITERAL e independente da
/// <c>MatrizPermissoes</c>: se o código mudar uma célula, o teste reprova. Cada perfil entra com uma obra VISÍVEL a ele (vínculo ou
/// escopo todas), então a diferença de status é só de perfil (403 <c>acao-nao-permitida</c>), nunca de alcance.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class MatrizPerfilRotaTestes
{
    #region Campos

    private const string Flag = "Autenticacao:UsuarioDesenvolvimento:Habilitado";

    // Ordem das colunas: administrador, engenheiro_planejamento, engenheiro_obra, suprimentos, encarregado, gestor_portfolio, diretoria.
    private static readonly string[] _perfis =
    [
        "administrador", "engenheiro_planejamento", "engenheiro_obra", "suprimentos", "encarregado", "gestor_portfolio", "diretoria",
    ];

    private static readonly (string Metodo, string Rota, int[] Esperado)[] _tabela =
    [
        ("GET", "/obras", [200, 200, 200, 200, 200, 200, 200]),
        ("GET", "/obras/{obra}", [200, 200, 200, 200, 200, 200, 200]),
        ("POST", "/obras", [201, 403, 403, 403, 403, 403, 403]),
        ("PUT", "/obras/{obra}", [200, 200, 403, 403, 403, 403, 403]),
        ("POST", "/obras/{obra}/arquivar", [200, 403, 403, 403, 403, 403, 403]),
        ("POST", "/obras/{arquivada}/restaurar", [200, 403, 403, 403, 403, 403, 403]),
        ("GET", "/obras/{obra}/auditoria", [200, 200, 200, 403, 403, 200, 403]),
        ("GET", "/auditoria/exportacao.csv", [200, 403, 403, 403, 403, 403, 403]),
    ];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public MatrizPerfilRotaTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    public static TheoryData<string> TodosOsPerfis() => [.. _perfis];

    [Theory]
    [MemberData(nameof(TodosOsPerfis))]
    public async Task Matriz_perfil_x_rota(string perfil)
    {
        var coluna = Array.IndexOf(_perfis, perfil);
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        var empresa = await _dados.CriarEmpresaAsync();
        var tecnico = DadosTeste.AdministradorDe(empresa);
        var obra = await _dados.CriarObraAsync(empresa, tecnico);
        var arquivada = await _dados.CriarObraAsync(empresa, tecnico);
        await _banco.ProduzirEstadoComoSuperusuarioAsync($"UPDATE cronoai.obra SET arquivada_em = greatest(now(), criada_em) WHERE id = '{arquivada.Id}'");

        // Todo perfil vê as duas obras: gestor, diretoria e administrador têm escopo todas; os demais, vínculo explícito.
        var escopo = Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas;
        var cenario = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, perfil, escopo);
        if (escopo == EscoposObras.Vinculadas)
        {
            await _dados.CriarAcessoObraAsync(empresa, obra.Id, cenario.UsuarioId);
            await _dados.CriarAcessoObraAsync(empresa, arquivada.Id, cenario.UsuarioId);
        }

        using var navegador = cenario.Navegador;
        var trilhaAntes = await ContarAsync($"SELECT count(*) FROM cronoai.auditoria WHERE empresa_id = '{empresa}'");
        var obrasAntes = await ContarAsync($"SELECT count(*) FROM cronoai.obra WHERE empresa_id = '{empresa}'");
        var escritasPermitidas = 0;
        var obrasCriadas = 0;

        foreach (var (metodo, rota, esperado) in _tabela)
        {
            var url = "/api/v1" + rota.Replace("{obra}", obra.Id.ToString("D"), StringComparison.Ordinal).Replace("{arquivada}", arquivada.Id.ToString("D"), StringComparison.Ordinal);
            if (rota.StartsWith("/auditoria/exportacao", StringComparison.Ordinal))
            {
                var hoje = DateOnly.FromDateTime(DateTime.UtcNow);
                url += $"?de={hoje.AddDays(-30):yyyy-MM-dd}&ate={hoje:yyyy-MM-dd}";
            }

            using var resposta = await EnviarAsync(navegador, metodo, url, rota, obra.Id, arquivada.Id);
            var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

            Assert.True((int)resposta.StatusCode == esperado[coluna], $"{perfil} {metodo} {rota}: esperado {esperado[coluna]}, veio {(int)resposta.StatusCode}: {corpo}");
            if (esperado[coluna] == 403)
            {
                // 403 por perfil: type curto, sem revelar a obra.
                Assert.Equal("acao-nao-permitida", JsonDocument.Parse(corpo).RootElement.GetProperty("type").GetString());
            }
            else if (metodo != "GET")
            {
                escritasPermitidas++;
                obrasCriadas += rota == "/obras" ? 1 : 0;
            }
        }

        // Nenhuma escrita nem trilha nos 403: só as escritas PERMITIDAS deixaram rastro (uma linha de trilha cada).
        Assert.Equal(trilhaAntes + escritasPermitidas, await ContarAsync($"SELECT count(*) FROM cronoai.auditoria WHERE empresa_id = '{empresa}'"));
        Assert.Equal(obrasAntes + obrasCriadas, await ContarAsync($"SELECT count(*) FROM cronoai.obra WHERE empresa_id = '{empresa}'"));
    }

    [Fact]
    public async Task Toda_rota_de_dado_declara_acao_da_matriz()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);

        var problemas = await RotasDeDadoSemUmaAcaoAsync(fabrica);
        var comAcao = RotasDeDado(fabrica).Count;

        Assert.Empty(problemas);

        // Controle: a enumeração enxerga rotas de dado (8 neste ciclo; rota nova tem de declarar a ação).
        Assert.True(comAcao >= 8, $"esperava ao menos 8 rotas de dado, achou {comAcao}");
    }

    [Fact]
    public async Task Detector_de_acao_acusa_rota_de_dado_sem_permissao()
    {
        // Host SEPARADO: uma rota de dado nova entra por IStartupFilter SEM declarar ação; o detector precisa acusá-la.
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp, "Development", servicos => servicos.AddSingleton<IStartupFilter, FiltroRotaDeDadoSemAcao>())
        {
            Idp = idp,
            Configuracoes = { [Flag] = "true" },
        };

        var problemas = await RotasDeDadoSemUmaAcaoAsync(fabrica);

        Assert.Contains(problemas, p => p.Contains("/api/v1/obras/__teste/sem-acao", StringComparison.Ordinal));
    }

    #endregion

    #region Métodos privados

    private ApiFactory CriarFabrica(IdpEmMemoria idp) =>
        new(_banco.StringConexaoApp, "Development") { Idp = idp, Configuracoes = { [Flag] = "true" } };

    // Rotas de dado: tudo em /api/v1 fora de autenticação, /eu, /empresas e das rotas só de desenvolvimento.
    private static List<RouteEndpoint> RotasDeDado(ApiFactory fabrica) =>
        fabrica.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>()
            .Where(e => e.RoutePattern.RawText is { } texto
                && texto.StartsWith("/api/v1/", StringComparison.Ordinal)
                && !texto.StartsWith("/api/v1/autenticacao", StringComparison.Ordinal)
                && texto != "/api/v1/eu"
                && !texto.StartsWith("/api/v1/empresas", StringComparison.Ordinal))
            .ToList();

    private static async Task<List<string>> RotasDeDadoSemUmaAcaoAsync(ApiFactory fabrica)
    {
        var provedor = fabrica.Services.GetRequiredService<IAuthorizationPolicyProvider>();
        var problemas = new List<string>();
        foreach (var endpoint in RotasDeDado(fabrica))
        {
            var politicas = endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>().Select(a => a.Policy).Where(PoliticasPermissao.EhDePermissao).ToList();
            if (politicas.Count != 1)
            {
                problemas.Add($"{endpoint.RoutePattern.RawText}: {politicas.Count} políticas de permissão (esperava exatamente 1)");
                continue;
            }

            var politica = await provedor.GetPolicyAsync(politicas[0]!);
            var requisitos = politica?.Requirements.OfType<RequisitoPermissao>().ToList() ?? [];
            if (requisitos.Count != 1 || !AcoesPermissao.EhValida(requisitos[0].Acao))
            {
                problemas.Add($"{endpoint.RoutePattern.RawText}: ação ausente ou fora da matriz");
            }
        }

        return problemas;
    }

    private async Task<int> ContarAsync(string sql) =>
        int.Parse(await _banco.ConsultarComoSuperusuarioAsync(sql), System.Globalization.CultureInfo.InvariantCulture);

    private async Task<HttpResponseMessage> EnviarAsync(HttpClient navegador, string metodo, string url, string rota, Guid obra, Guid arquivada)
    {
        if (metodo == "GET")
        {
            return await navegador.GetAsync(url, TestContext.Current.CancellationToken);
        }

        object corpo = rota switch
        {
            "/obras" => new { nome = "Obra Ficticia " + Guid.NewGuid().ToString("N")[..10], uf = "PE", municipioIbge = "2699999" },
            "/obras/{obra}" => new { versao = await VersaoAsync(obra), nome = await NomeAsync(obra), uf = "PE", municipioIbge = "2699999", dataStatus = "2026-11-15" },
            "/obras/{obra}/arquivar" => new { versao = await VersaoAsync(obra) },
            _ => new { versao = await VersaoAsync(arquivada) },
        };
        return await ClienteAutenticado.EscreverAsync(navegador, new HttpMethod(metodo), url, corpo);
    }

    private async Task<long> VersaoAsync(Guid obra) =>
        long.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.obra WHERE id = '{obra}'"), System.Globalization.CultureInfo.InvariantCulture);

    private Task<string> NomeAsync(Guid obra) => _banco.ConsultarComoSuperusuarioAsync($"SELECT nome FROM cronoai.obra WHERE id = '{obra}'");

    #endregion

    #region Tipos auxiliares

    /// <summary>Acrescenta uma rota de DADO nova (em /api/v1/obras) sem declarar nenhuma ação da matriz.</summary>
    private sealed class FiltroRotaDeDadoSemAcao : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return aplicacao =>
            {
                next(aplicacao);
                aplicacao.UseEndpoints(rotas => rotas.MapGet("/api/v1/obras/__teste/sem-acao", () => Results.Ok()));
            };
        }
    }

    #endregion
}
