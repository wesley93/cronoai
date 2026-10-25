using System.Net;
using System.Net.Http.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Isolamento;

/// <summary>
/// Teste GENÉRICO de isolamento: enumera todas as rotas registradas (<c>EndpointDataSource</c>) e reprova a rota sem
/// cenário no catálogo versionado. O host é Development com o usuário de desenvolvimento ligado, para a lista
/// completa de rotas existir. O retorno do OIDC é caminho de middleware (não é endpoint) e tem testes próprios.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class IsolamentoRotasTestes
{
    #region Campos

    private const string Flag = "Autenticacao:UsuarioDesenvolvimento:Habilitado";

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public IsolamentoRotasTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Toda_rota_registrada_tem_cenario_de_isolamento()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);
        var registradas = Rotas(fabrica);

        var semCenario = DetectorDeRotas.RotasSemCenario(registradas, CatalogoRotas.Entradas);

        Assert.Empty(semCenario);
        Assert.NotEmpty(registradas);
    }

    [Fact]
    public async Task Catalogo_nao_tem_rota_inexistente()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);

        var inexistentes = DetectorDeRotas.EntradasInexistentes(Rotas(fabrica), CatalogoRotas.Entradas);

        Assert.Empty(inexistentes);
    }

    [Fact]
    public async Task Rotas_anonimas_sao_so_as_da_lista()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);

        var anonimasForaDaLista = Rotas(fabrica).Where(r => r.Anonima && !CatalogoRotas.AnonimasPermitidas.Contains(r.Chave)).Select(r => r.Chave).ToList();
        var listadasMasProtegidas = Rotas(fabrica).Where(r => !r.Anonima && CatalogoRotas.AnonimasPermitidas.Contains(r.Chave)).Select(r => r.Chave).ToList();

        Assert.Empty(anonimasForaDaLista);
        Assert.Empty(listadasMasProtegidas);
    }

    [Fact]
    public async Task Toda_rota_nao_anonima_responde_401_sem_sessao()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);
        var falhas = new List<string>();

        foreach (var rota in Rotas(fabrica).Where(r => !r.Anonima))
        {
            using var anonimo = fabrica.CriarNavegador();
            using var resposta = await EnviarAsync(anonimo, rota, Guid.NewGuid(), antiforgery: null);
            if (resposta.StatusCode != HttpStatusCode.Unauthorized)
            {
                falhas.Add($"{rota.Chave} respondeu {(int)resposta.StatusCode} sem sessão");
            }
        }

        Assert.Empty(falhas);
    }

    [Fact]
    public async Task Toda_escrita_exige_antiforgery()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
        using var navegador = cenario.Navegador;
        var falhas = new List<string>();

        // Escritas autenticadas, sem o cabeçalho X-XSRF-TOKEN (a rota de desenvolvimento é isenta, só existe em Development).
        foreach (var rota in Rotas(fabrica).Where(r => r.EhEscrita && !r.Anonima))
        {
            using var resposta = await EnviarAsync(navegador, rota, Guid.NewGuid(), antiforgery: null);
            if (resposta.StatusCode != HttpStatusCode.BadRequest)
            {
                falhas.Add($"{rota.Chave} respondeu {(int)resposta.StatusCode} sem antiforgery");
            }
        }

        Assert.Empty(falhas);
    }

    [Fact]
    public async Task Usuario_da_empresa_A_nao_ve_dado_da_empresa_B_em_nenhuma_rota()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = CriarFabrica(idp);
        var nomeDaB = "Empresa-B-MARCADOR-" + Guid.NewGuid().ToString("N");
        var nomeDaObraB = "Obra-B-MARCADOR-" + Guid.NewGuid().ToString("N");
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaAsync(nomeDaB);
        await _dados.VincularAsync(empresaB, usuarioB);

        // O {id} das rotas de obra é uma obra REAL da empresa B (nunca um guid aleatório: o 404 viria por "não existir").
        var obraB = await _dados.CriarObraAsync(empresaB, usuarioB, DadosTeste.DadosObraValidos(nomeDaObraB));

        // Marcadores de vazamento: nomes e ids de B. NÃO o id da obra: ele está na URL e pode voltar no ProblemDetails sem vazamento.
        var marcadores = new[] { nomeDaB, nomeDaObraB, empresaB.ToString("D"), usuarioB.ToString("D") };
        var falhas = new List<string>();

        foreach (var entrada in CatalogoRotas.Entradas.Where(e => e.Cenario != CenarioIsolamento.DesenvolvimentoApenas))
        {
            // Sessão nova por rota (a rota "sair" encerra a sessão): usuário A, membro só da empresa A.
            var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 1);
            using var navegador = cenario.Navegador;
            var rota = new RotaRegistrada(entrada.Metodo, entrada.Padrao, entrada.Cenario == CenarioIsolamento.Anonima);
            var token = rota.EhEscrita ? await ClienteAutenticado.ObterTokenAntiforgeryAsync(navegador) : null;

            using var resposta = await EnviarAsync(navegador, rota, empresaB, token, entrada.Recurso == RecursoAlheio.Obra ? obraB.Id : null);
            var corpo = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

            if (entrada.Cenario == CenarioIsolamento.ComIdDeOutraEmpresa && resposta.StatusCode != HttpStatusCode.NotFound)
            {
                falhas.Add($"{entrada.Chave} com id de outra empresa respondeu {(int)resposta.StatusCode} (esperado 404)");
            }

            foreach (var marcador in marcadores.Where(m => corpo.Contains(m, StringComparison.OrdinalIgnoreCase)))
            {
                falhas.Add($"{entrada.Chave} vazou dado da empresa B ({marcador[..Math.Min(12, marcador.Length)]}…)");
            }
        }

        Assert.Empty(falhas);
    }

    [Fact]
    public async Task Concretizacao_de_id_usa_obra_real_da_empresa_B()
    {
        // Meta-teste: o {id} concretizado É uma obra existente e da empresa B. Com um id aleatório o teste genérico passaria
        // por "não existir" sem provar nada; o controle negativo abaixo mostra que este meta-teste acusaria isso.
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var obraB = await _dados.CriarObraAsync(empresaB, usuarioB);

        var comId = CatalogoRotas.Entradas.Where(e => e.Padrao.Contains("{id}", StringComparison.Ordinal)).ToList();
        Assert.NotEmpty(comId);

        // Toda rota com {id} declara de que recurso real ele é: nenhuma cai no guid aleatório sem querer.
        Assert.All(comId, e => Assert.Equal(RecursoAlheio.Obra, e.Recurso));
        Assert.All(
            CatalogoRotas.Entradas.Where(e => e.Cenario == CenarioIsolamento.ComIdDeOutraEmpresa && e.Padrao.Contains("{id}", StringComparison.Ordinal)),
            e => Assert.Equal(RecursoAlheio.Obra, e.Recurso));

        foreach (var entrada in comId)
        {
            var caminho = DetectorDeRotas.Concretizar(entrada.Padrao, obraB.Id);
            var id = Guid.Parse(System.Text.RegularExpressions.Regex.Match(caminho, "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").Value);

            Assert.Equal(obraB.Id, id);
            Assert.Equal(empresaB.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.obra WHERE id = '{id}'"));

            // Controle negativo: sem o recurso, o id concretizado NÃO existe (é o defeito que este meta-teste existe para barrar).
            var aleatorio = Guid.Parse(System.Text.RegularExpressions.Regex.Match(DetectorDeRotas.Concretizar(entrada.Padrao), "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").Value);
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE id = '{aleatorio}'"));
        }
    }

    [Fact]
    public async Task Detector_acusa_rota_nova_sem_cenario()
    {
        // Host SEPARADO: uma rota nova entra por IStartupFilter, sem entrada no catálogo; o detector precisa acusá-la.
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp, "Development", servicos => servicos.AddSingleton<IStartupFilter, FiltroRotaNova>())
        {
            Idp = idp,
            Configuracoes = { [Flag] = "true" },
        };

        var semCenario = DetectorDeRotas.RotasSemCenario(Rotas(fabrica), CatalogoRotas.Entradas);

        Assert.Contains("GET /api/v1/__teste/sem-cenario", semCenario);
    }

    #endregion

    #region Métodos privados

    private ApiFactory CriarFabrica(IdpEmMemoria idp) =>
        new(_banco.StringConexaoApp, "Development") { Idp = idp, Configuracoes = { [Flag] = "true" } };

    private static IReadOnlyList<RotaRegistrada> Rotas(ApiFactory fabrica) =>
        DetectorDeRotas.Enumerar(fabrica.Services.GetRequiredService<EndpointDataSource>());

    private static async Task<HttpResponseMessage> EnviarAsync(HttpClient navegador, RotaRegistrada rota, Guid empresaAlheia, string? antiforgery, Guid? obraAlheia = null)
    {
        var entrada = CatalogoRotas.Entradas.FirstOrDefault(e => e.Chave == rota.Chave);
        using var requisicao = new HttpRequestMessage(new HttpMethod(rota.Metodo), DetectorDeRotas.Concretizar(rota.Padrao, obraAlheia));
        if (antiforgery is not null)
        {
            requisicao.Headers.Add("X-XSRF-TOKEN", antiforgery);
        }

        if (rota.EhEscrita)
        {
            requisicao.Content = JsonContent.Create(entrada?.Corpo?.Invoke(empresaAlheia) ?? new { });
        }

        return await navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);
    }

    #endregion

    #region Tipos auxiliares

    /// <summary>Acrescenta uma rota nova ao host de teste (fora do catálogo).</summary>
    private sealed class FiltroRotaNova : IStartupFilter
    {
        public Action<IApplicationBuilder> Configure(Action<IApplicationBuilder> next)
        {
            return aplicacao =>
            {
                next(aplicacao);
                aplicacao.UseEndpoints(rotas => rotas.MapGet("/api/v1/__teste/sem-cenario", () => Results.Ok()));
            };
        }
    }

    #endregion
}
