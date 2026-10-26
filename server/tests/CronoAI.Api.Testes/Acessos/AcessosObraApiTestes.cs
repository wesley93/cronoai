using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dados;
using CronoAI.Dominio;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Acessos;

/// <summary>
/// Acessos de obra pela API (plano 00014, T65 a T68): conceder, listar e revogar (apagando os acessos de frente junto, com uma linha
/// de trilha por vínculo), o mesmo 400 para todo destino inválido, o 409 do vínculo repetido (inclusive em paralelo) e o gestor de
/// portfólio só dentro do próprio alcance.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AcessosObraApiTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AcessosObraApiTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Conceder_listar_revogar_acesso()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var alvo = await EngenheiroAsync(api);

        // Conceder: 201 com Location e o vínculo no corpo.
        var concedido = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = alvo });
        Assert.Equal(HttpStatusCode.Created, concedido.Status);
        Assert.Contains($"/api/v1/obras/{obra.Id}/acessos", concedido.Cabecalhos["Location"], StringComparison.Ordinal);
        Assert.Equal(alvo, concedido.Corpo.GetProperty("usuarioId").GetGuid());

        // A listagem traz o vínculo.
        var lista = await api.LerAsync($"/api/v1/obras/{obra.Id}/acessos");
        Assert.Equal(HttpStatusCode.OK, lista.Status);
        Assert.Contains(lista.Corpo.EnumerateArray(), a => a.GetProperty("usuarioId").GetGuid() == alvo);

        // O alvo tem DUAS frentes nesta obra: revogar apaga também os acessos de frente, no mesmo salvamento.
        var frente1 = await _dados.CriarFrenteAsync(api.EmpresaId, obra.Id);
        var frente2 = await _dados.CriarFrenteAsync(api.EmpresaId, obra.Id);
        await _dados.CriarAcessoFrenteAsync(api.EmpresaId, obra.Id, frente1, alvo);
        await _dados.CriarAcessoFrenteAsync(api.EmpresaId, obra.Id, frente2, alvo);

        var revogado = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos/{alvo}/revogar", new { motivo = "Fim da participação" });
        Assert.Equal(HttpStatusCode.NoContent, revogado.Status);

        var depois = await api.LerAsync($"/api/v1/obras/{obra.Id}/acessos");
        Assert.DoesNotContain(depois.Corpo.EnumerateArray(), a => a.GetProperty("usuarioId").GetGuid() == alvo);
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{obra.Id}' AND usuario_id = '{alvo}'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_frente WHERE obra_id = '{obra.Id}' AND usuario_id = '{alvo}'"));

        // UMA linha de trilha "remover" por vínculo apagado: 1 do acesso de obra e 2 dos de frente, todas com a obra.
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND acao = 'remover' AND obra_id = '{obra.Id}'"));
        Assert.Equal("2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_frente' AND acao = 'remover' AND obra_id = '{obra.Id}'"));

        // Revogar de novo: o vínculo não existe mais (404).
        var denovo = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos/{alvo}/revogar", new { });
        Assert.Equal(HttpStatusCode.NotFound, denovo.Status);
    }

    [Fact]
    public async Task Conceder_acesso_destino_invalido_mesmo_400()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();

        var deOutraEmpresa = await _dados.CriarUsuarioAsync();
        await _dados.CriarEmpresaComMembrosAsync(deOutraEmpresa);
        var removido = await EngenheiroAsync(api);
        await _dados.RemoverMembroAsync(api.EmpresaId, removido);
        var escopoTodas = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, escopoTodas, Perfis.Administrador);
        var gestorDeCarteiras = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, gestorDeCarteiras, Perfis.GestorPortfolio, EscoposObras.Carteiras);

        // Membro de outra empresa, uuid inexistente, membro removido, membro de escopo "todas" e de escopo "carteiras": TODOS
        // recebem o mesmo 400, na chave usuarioId, com corpos iguais (exceto o traceId): nada revela se o usuário existe.
        var respostas = new List<AmbienteApi.RespostaJson>();
        foreach (var destino in new[] { deOutraEmpresa, Guid.NewGuid(), removido, escopoTodas, gestorDeCarteiras })
        {
            respostas.Add(await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = destino }));
        }

        Assert.All(respostas, r => Assert.Equal(HttpStatusCode.BadRequest, r.Status));
        Assert.All(respostas, r => Assert.True(r.Corpo.GetProperty("errors").TryGetProperty("usuarioId", out _)));
        Assert.Single(respostas.Select(r => r.CorpoSemTraceId()).Distinct(StringComparer.Ordinal));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{obra.Id}'"));

        // Controle negativo: um engenheiro ativo é aceito.
        var valido = await EngenheiroAsync(api);
        var ok = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = valido });
        Assert.Equal(HttpStatusCode.Created, ok.Status);
    }

    [Fact]
    public async Task Conceder_acesso_duplicado_409()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var alvo = await EngenheiroAsync(api);

        var primeiro = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = alvo });
        var repetido = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = alvo });

        Assert.Equal(HttpStatusCode.Created, primeiro.Status);
        Assert.Equal(HttpStatusCode.Conflict, repetido.Status);
        Assert.Equal("acesso-existente", repetido.Corpo.GetProperty("type").GetString());
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND obra_id = '{obra.Id}' AND acao = 'criar'"));

        // Dois em paralelo (token de antiforgery obtido UMA vez): um 201 e um 409, e uma única trilha.
        var outro = await EngenheiroAsync(api);
        var token = await ClienteAutenticado.ObterTokenAntiforgeryAsync(api.Navegador);
        var respostas = await Task.WhenAll(
            Enumerable.Range(0, 2).Select(async _ =>
            {
                await Task.Yield();
                return await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = outro }, token: token);
            }));

        Assert.Equal(1, respostas.Count(r => r.Status == HttpStatusCode.Created));
        Assert.Equal(1, respostas.Count(r => r.Status == HttpStatusCode.Conflict));
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{obra.Id}' AND usuario_id = '{outro}'"));
        Assert.Equal("2", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND obra_id = '{obra.Id}' AND acao = 'criar'"));
    }

    [Fact]
    public async Task Gestor_atribui_so_no_alcance()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var c = await CenarioPermissoes.CriarAsync(_dados, idp.Emissor);

        // C é gestor de escopo carteiras: só enxerga a obra2 (carteira K). Concede nela (201) e na obra1 recebe 404 (fora do alcance).
        var comoC = await CenarioLogin.EntrarAsync(fabrica, idp, c.C, c.Sujeitos[c.C], empresas: [c.EmpresaX]);
        using (var navegadorC = comoC.Navegador)
        {
            var naObra2 = await EnviarAsync(navegadorC, "POST", $"/api/v1/obras/{c.Obra2}/acessos", new { usuarioId = c.D });
            Assert.Equal(HttpStatusCode.Created, naObra2.Status);

            var naObra1 = await EnviarAsync(navegadorC, "POST", $"/api/v1/obras/{c.Obra1}/acessos", new { usuarioId = c.D });
            Assert.Equal(HttpStatusCode.NotFound, naObra1.Status);
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{c.Obra1}' AND usuario_id = '{c.D}'"));

            // Fora do alcance também vale para listar e revogar (404): a obra não existe para ele.
            using var lista = await navegadorC.GetAsync($"/api/v1/obras/{c.Obra1}/acessos", TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.NotFound, lista.StatusCode);
            var revogar = await EnviarAsync(navegadorC, "POST", $"/api/v1/obras/{c.Obra1}/acessos/{c.B}/revogar", new { });
            Assert.Equal(HttpStatusCode.NotFound, revogar.Status);
        }

        // G é gestor de escopo todas: concede na obra1 (201).
        var comoG = await CenarioLogin.EntrarAsync(fabrica, idp, c.G, c.Sujeitos[c.G], empresas: [c.EmpresaX]);
        using (var navegadorG = comoG.Navegador)
        {
            var naObra1 = await EnviarAsync(navegadorG, "POST", $"/api/v1/obras/{c.Obra1}/acessos", new { usuarioId = c.D });
            Assert.Equal(HttpStatusCode.Created, naObra1.Status);
        }
    }

    [Fact]
    public async Task Recusa_de_politica_com_obra_ainda_visivel_vira_500_generico_sem_detalhe()
    {
        // Seguranca 3 (rodada 02): o 42501 só vira 404 quando a obra DEIXOU de ser visível. Aqui o administrador é rebaixado no meio
        // da escrita para engenheiro VINCULADO à obra: a obra segue visível, a política de INSERT de acesso_obra recusa (42501) e a
        // exceção sobe como 500 genérico (ProblemDetails com traceId), sem nome de tabela, de política, de constraint nem SQL.
        using var idp = new IdpEmMemoria();
        var gancho = new GanchoUmaVez();
        await using var fabrica = new ApiFactory(
            _banco.StringConexaoApp,
            "Production",
            servicos => servicos.AddSingleton<IFabricaCronoDbContext>(new FabricaComGancho(_banco, gancho)))
        { Idp = idp };
        var empresa = await _dados.CriarEmpresaAsync();
        var outroAdministrador = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, outroAdministrador);
        var cenario = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, Perfis.Administrador);
        using var navegador = cenario.Navegador;
        var obra = await _dados.CriarObraAsync(empresa, cenario.UsuarioId);
        await _dados.CriarAcessoObraAsync(empresa, obra.Id, cenario.UsuarioId);
        var destino = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, destino, Perfis.EngenheiroObra);

        gancho.Armar(() => _banco.ProduzirEstadoComoSuperusuarioAsync(
            $"SELECT set_config('app.usuario_id', '{cenario.UsuarioId}', true), set_config('app.empresa_id', '{empresa}', true); "
            + $"UPDATE cronoai.membro_empresa SET perfil = 'engenheiro_obra', escopo_obras = 'vinculadas', atualizado_em = greatest(now(), criado_em) WHERE empresa_id = '{empresa}' AND usuario_id = '{cenario.UsuarioId}'"));

        var resposta = await EnviarAsync(navegador, "POST", $"/api/v1/obras/{obra.Id}/acessos", new { usuarioId = destino });

        Assert.True(gancho.Executou);
        Assert.Equal(HttpStatusCode.InternalServerError, resposta.Status);
        Assert.Equal(500, resposta.Corpo.GetProperty("status").GetInt32());
        Assert.True(resposta.Corpo.TryGetProperty("traceId", out _));
        foreach (var vazamento in new[] { "acesso_obra", "cronoai", "policy", "política", "violates", "row-level", "42501", "INSERT", "Npgsql", "Postgres" })
        {
            Assert.DoesNotContain(vazamento, resposta.Texto, StringComparison.OrdinalIgnoreCase);
        }

        // Nada gravado: nem o vínculo, nem a trilha dele.
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{obra.Id}' AND usuario_id = '{destino}'"));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'acesso_obra' AND obra_id = '{obra.Id}' AND acao = 'criar'"));
    }

    #endregion

    #region Métodos privados

    // Engenheiro de obra ativo da empresa do ambiente, sem nenhum vínculo.
    private async Task<Guid> EngenheiroAsync(AmbienteApi api)
    {
        var usuario = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, usuario, Perfis.EngenheiroObra);
        return usuario;
    }

    private static async Task<AmbienteApi.RespostaJson> EnviarAsync(HttpClient navegador, string metodo, string url, object corpo)
    {
        using var resposta = await ClienteAutenticado.EscreverAsync(navegador, new HttpMethod(metodo), url, corpo);
        return await AmbienteApi.RespostaJson.LerAsync(resposta);
    }

    #endregion
}
