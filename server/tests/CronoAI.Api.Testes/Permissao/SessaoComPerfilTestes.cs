using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dados;
using CronoAI.Dados.Identidade;
using CronoAI.Dominio;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Permissao;

/// <summary>
/// Sessão com perfil (plano 00014, T57 a T59): perfil e escopo vêm na MESMA consulta que valida a sessão; a remoção lógica do membro
/// derruba a sessão na requisição seguinte e tira a empresa de todos os fluxos de identidade; <c>/eu</c> informa o perfil.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class SessaoComPerfilTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public SessaoComPerfilTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Sessao_traz_perfil_em_uma_consulta()
    {
        var empresa = await _dados.CriarEmpresaAsync();
        var usuario = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, usuario, Perfis.GestorPortfolio, EscoposObras.Carteiras);
        var sessao = await _dados.CriarSessaoAsync(usuario, empresa);

        // Pela consulta de identidade: UMA instrução SQL devolve a sessão válida COM perfil e escopo.
        var sonda = new SondaDeComandos();
        var consultas = new ConsultasIdentidade(new FabricaComSonda(_banco, sonda));
        var validada = await consultas.ValidarSessaoAsync(sessao.Id, usuario, DateTime.UtcNow, TestContext.Current.CancellationToken);

        Assert.NotNull(validada);
        Assert.Equal(Perfis.GestorPortfolio, validada.Perfil);
        Assert.Equal(EscoposObras.Carteiras, validada.EscopoObras);
        Assert.Equal(empresa, validada.EmpresaAtivaId);
        Assert.Single(sonda.Comandos);

        // Pela API: cada requisição autenticada faz UMA validação de sessão (uma instrução que lê cronoai.sessao), e o perfil
        // da sessão chega ao ContextoSessao sem consulta extra.
        var sondaDaApi = new SondaDeComandos();
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(
            _banco.StringConexaoApp,
            "Production",
            servicos => servicos.AddSingleton<IFabricaCronoDbContext>(new FabricaComSonda(_banco, sondaDaApi)))
        { Idp = idp };
        var cenario = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, Perfis.EngenheiroObra, EscoposObras.Vinculadas);
        using var navegador = cenario.Navegador;
        var antes = sondaDaApi.Comandos.Count;

        using var resposta = await navegador.GetAsync("/api/v1/obras", TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        var daRequisicao = sondaDaApi.Comandos.Skip(antes).ToList();
        Assert.Single(daRequisicao, comando => comando.Contains("cronoai.sessao", StringComparison.Ordinal));

        // Controle negativo: sem empresa ativa o perfil e o escopo são nulos (a consulta não inventa perfil).
        var semEmpresa = await _dados.CriarSessaoAsync(usuario);
        var semAtiva = await consultas.ValidarSessaoAsync(semEmpresa.Id, usuario, DateTime.UtcNow, TestContext.Current.CancellationToken);
        Assert.NotNull(semAtiva);
        Assert.Null(semAtiva.Perfil);
        Assert.Null(semAtiva.EscopoObras);
    }

    [Fact]
    public async Task Remocao_logica_nos_fluxos_de_identidade()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var empresa = await _dados.CriarEmpresaAsync();
        var consultas = _dados.Consultas;
        var cenario = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, Perfis.EngenheiroObra, EscoposObras.Vinculadas);
        using var navegador = cenario.Navegador;

        // Antes da remoção, os mesmos pontos funcionam (controle negativo).
        using (var antes = await navegador.GetAsync("/api/v1/obras", TestContext.Current.CancellationToken))
        {
            Assert.Equal(HttpStatusCode.OK, antes.StatusCode);
        }

        Assert.Contains(await consultas.MinhasEmpresasAsync(cenario.UsuarioId, TestContext.Current.CancellationToken), e => e.Id == empresa);

        await _dados.RemoverMembroAsync(empresa, cenario.UsuarioId);

        // 1. A requisição SEGUINTE com o cookie dele: sessão rejeitada (401).
        using (var depois = await navegador.GetAsync("/api/v1/obras", TestContext.Current.CancellationToken))
        {
            Assert.Equal(HttpStatusCode.Unauthorized, depois.StatusCode);
        }

        // 2. "Minhas empresas" não traz mais a empresa.
        Assert.DoesNotContain(await consultas.MinhasEmpresasAsync(cenario.UsuarioId, TestContext.Current.CancellationToken), e => e.Id == empresa);

        // 3. Definir a empresa ativa não vale para quem foi removido (mesmo com a sessão aberta e o vínculo físico existindo).
        var sessao = await _dados.CriarSessaoAsync(cenario.UsuarioId);
        Assert.False(await consultas.DefinirEmpresaAtivaAsync(sessao.Id, cenario.UsuarioId, empresa, TestContext.Current.CancellationToken));

        // 4. Um novo login funciona (o usuário segue ativo), mas sem a empresa: /eu sem ela e PUT /empresas/atual → 404.
        var novoLogin = await CenarioLogin.EntrarAsync(fabrica, idp, cenario.UsuarioId, cenario.Sujeito);
        using var navegadorNovo = novoLogin.Navegador;
        var eu = await navegadorNovo.GetFromJsonAsync<JsonElement>("/api/v1/eu", TestContext.Current.CancellationToken);
        Assert.Empty(eu.GetProperty("empresas").EnumerateArray());
        Assert.Equal(JsonValueKind.Null, eu.GetProperty("empresaAtivaId").ValueKind);

        using var troca = await ClienteAutenticado.EscreverAsync(navegadorNovo, HttpMethod.Put, "/api/v1/empresas/atual", new { empresaId = empresa });
        Assert.Equal(HttpStatusCode.NotFound, troca.StatusCode);
    }

    [Fact]
    public async Task Eu_traz_perfil_e_escopo()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var empresa = await _dados.CriarEmpresaAsync();
        var gestor = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, Perfis.GestorPortfolio, EscoposObras.Carteiras);
        using var navegadorDoGestor = gestor.Navegador;

        var eu = await navegadorDoGestor.GetFromJsonAsync<JsonElement>("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(Perfis.GestorPortfolio, eu.GetProperty("perfil").GetString());
        Assert.Equal(EscoposObras.Carteiras, eu.GetProperty("escopoObras").GetString());
        Assert.Equal(empresa, eu.GetProperty("empresaAtivaId").GetGuid());

        // Sem empresa ativa (usuário com DUAS empresas, que ainda não escolheu): perfil e escopo nulos.
        var duasEmpresas = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 2);
        using var navegador = duasEmpresas.Navegador;
        var semAtiva = await navegador.GetFromJsonAsync<JsonElement>("/api/v1/eu", TestContext.Current.CancellationToken);

        Assert.Equal(JsonValueKind.Null, semAtiva.GetProperty("empresaAtivaId").ValueKind);
        Assert.Equal(JsonValueKind.Null, semAtiva.GetProperty("perfil").ValueKind);
        Assert.Equal(JsonValueKind.Null, semAtiva.GetProperty("escopoObras").ValueKind);
    }

    #endregion
}
