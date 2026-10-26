using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary>
/// Permissão por obra e por perfil nas rotas de obra (plano 00014, T51 a T54 e T60): obra sem vínculo responde 404 idêntico ao de
/// inexistente; cadastro só pelo administrador (403 <c>campo-nao-permitido</c>, o que fecha o oráculo do 409 de nome); criar,
/// arquivar e restaurar só pelo administrador; responsável da obra precisa ser membro ativo.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PermissaoObrasTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public PermissaoObrasTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Obra_sem_vinculo_404_identico_ao_inexistente()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var engenheiro = await api.NovoUsuarioNaEmpresaAsync(Perfis.EngenheiroPlanejamento);
        var inexistente = Guid.NewGuid();
        var trilhaAntes = await ContarTrilhaAsync(obra.Id);

        // GET, PUT e trilha da obra REAL sem vínculo: o mesmo 404 (corpo igual, exceto traceId) que o de uma obra que não existe.
        var corpoDoPut = AmbienteApi.CorpoDeAtualizacao(obra.Versao, "Nome Que Nao Pode Gravar");
        foreach (var (metodo, caminho) in new[] { ("GET", "/api/v1/obras/{0}"), ("PUT", "/api/v1/obras/{0}"), ("GET", "/api/v1/obras/{0}/auditoria") })
        {
            var existente = await EnviarAsync(engenheiro.Navegador, metodo, string.Format(System.Globalization.CultureInfo.InvariantCulture, caminho, obra.Id), corpoDoPut);
            var ausente = await EnviarAsync(engenheiro.Navegador, metodo, string.Format(System.Globalization.CultureInfo.InvariantCulture, caminho, inexistente), corpoDoPut);

            Assert.Equal(HttpStatusCode.NotFound, existente.Status);
            Assert.Equal(HttpStatusCode.NotFound, ausente.Status);
            Assert.Equal(ausente.CorpoSemTraceId(), existente.CorpoSemTraceId());
        }

        // A obra segue intacta e nada foi auditado.
        Assert.Equal(obra.Versao.ToString(System.Globalization.CultureInfo.InvariantCulture), await _banco.ConsultarComoSuperusuarioAsync($"SELECT versao FROM cronoai.obra WHERE id = '{obra.Id}'"));
        Assert.Equal(trilhaAntes, await ContarTrilhaAsync(obra.Id));

        // Controle negativo: com o vínculo, o mesmo usuário lê a obra (200).
        await _dados.CriarAcessoObraAsync(api.EmpresaId, obra.Id, engenheiro.UsuarioId);
        var comVinculo = await EnviarAsync(engenheiro.Navegador, "GET", $"/api/v1/obras/{obra.Id}", null);
        Assert.Equal(HttpStatusCode.OK, comVinculo.Status);
    }

    [Fact]
    public async Task Listagem_de_obras_por_escopo()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };
        var c = await CenarioPermissoes.CriarAsync(_dados, idp.Emissor);

        async Task<List<Guid>> ListarAsync(Guid usuario)
        {
            var login = await CenarioLogin.EntrarAsync(fabrica, idp, usuario, c.Sujeitos[usuario], empresas: [usuario == c.Z ? c.EmpresaY : c.EmpresaX]);
            using var navegador = login.Navegador;
            using var resposta = await navegador.GetAsync("/api/v1/obras", TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
            var json = JsonDocument.Parse(await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken)).RootElement;
            return json.EnumerateArray().Select(o => o.GetProperty("id").GetGuid()).Order().ToList();
        }

        var todasDeX = new[] { c.Obra1, c.Obra2, c.Obra3 }.Order().ToList();
        Assert.Equal(todasDeX, await ListarAsync(c.A));
        Assert.Equal([c.Obra1], await ListarAsync(c.B));
        Assert.Empty(await ListarAsync(c.D));
        Assert.Equal(todasDeX, await ListarAsync(c.G));
        Assert.Equal([c.Obra2], await ListarAsync(c.C));

        // Nenhuma obra da empresa Y aparece para a empresa X, e a empresa Y só vê a dela.
        Assert.DoesNotContain(c.ObraY, await ListarAsync(c.A));
        Assert.Equal([c.ObraY], await ListarAsync(c.Z));
    }

    [Fact]
    public async Task Cadastro_da_obra_so_administrador()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var outra = await api.CriarObraAsync();
        var engenheiro = await api.NovoUsuarioNaEmpresaAsync(Perfis.EngenheiroPlanejamento);
        await _dados.CriarAcessoObraAsync(api.EmpresaId, obra.Id, engenheiro.UsuarioId);
        var nomeAtual = obra.Corpo.GetProperty("nome").GetString()!;
        var trilhaAntes = await ContarTrilhaAsync(obra.Id);

        // Mudar o NOME: 403 campo-nao-permitido, só os nomes dos campos, sem gravar e sem auditar.
        var renomear = await EnviarAsync(engenheiro.Navegador, "PUT", $"/api/v1/obras/{obra.Id}", AmbienteApi.CorpoDeAtualizacao(obra.Versao, "Nome Novo Do Engenheiro"));
        Assert.Equal(HttpStatusCode.Forbidden, renomear.Status);
        Assert.Equal("campo-nao-permitido", renomear.Corpo.GetProperty("type").GetString());
        Assert.Equal(["nome"], renomear.Corpo.GetProperty("campos").EnumerateArray().Select(c => c.GetString()).ToList());
        Assert.DoesNotContain("Nome Novo Do Engenheiro", renomear.Texto, StringComparison.Ordinal);
        Assert.Equal(nomeAtual, await _banco.ConsultarComoSuperusuarioAsync($"SELECT nome FROM cronoai.obra WHERE id = '{obra.Id}'"));
        Assert.Equal(trilhaAntes, await ContarTrilhaAsync(obra.Id));

        // Vários campos de cadastro juntos: todos os nomes, na ordem do contrato.
        var muitos = AmbienteApi.CorpoDeAtualizacao(obra.Versao, "Outro Nome");
        muitos["uf"] = "BA";
        var varios = await EnviarAsync(engenheiro.Navegador, "PUT", $"/api/v1/obras/{obra.Id}", muitos);
        Assert.Equal(["nome", "uf"], varios.Corpo.GetProperty("campos").EnumerateArray().Select(c => c.GetString()).ToList());

        // Município, responsável e SINAPI também são cadastro.
        foreach (var (campo, ajuste) in new (string, Action<Dictionary<string, object?>>)[]
        {
            ("municipioIbge", corpo => corpo["municipioIbge"] = "3550308"),
            ("responsavelId", corpo => corpo["responsavelId"] = api.UsuarioId),
            ("sinapi", corpo => corpo["sinapi"] = new { uf = "PE", regime = "desonerado", dataBase = "2026-01-01" }),
        })
        {
            var corpo = AmbienteApi.CorpoDeAtualizacao(obra.Versao, nomeAtual);
            ajuste(corpo);
            var resposta = await EnviarAsync(engenheiro.Navegador, "PUT", $"/api/v1/obras/{obra.Id}", corpo);
            Assert.Equal(HttpStatusCode.Forbidden, resposta.Status);
            Assert.Equal([campo], resposta.Corpo.GetProperty("campos").EnumerateArray().Select(c => c.GetString()).ToList());
        }

        // Ordem das recusas: 409 de versão ANTES do 403 de campo (a obra existe e é visível ao engenheiro).
        var versaoVelha = await EnviarAsync(engenheiro.Navegador, "PUT", $"/api/v1/obras/{obra.Id}", AmbienteApi.CorpoDeAtualizacao(obra.Versao + 5, "Outro Nome Ainda"));
        Assert.Equal(HttpStatusCode.Conflict, versaoVelha.Status);
        Assert.Equal("conflito-de-versao", versaoVelha.Corpo.GetProperty("type").GetString());

        // Controle negativo: só dataStatus (cadastro igual, inclusive com espaços nas pontas no nome) → 200.
        var soStatus = AmbienteApi.CorpoDeAtualizacao(obra.Versao, "  " + nomeAtual + "  ");
        soStatus["dataStatus"] = "2026-12-01";
        var ok = await EnviarAsync(engenheiro.Navegador, "PUT", $"/api/v1/obras/{obra.Id}", soStatus);
        Assert.Equal(HttpStatusCode.OK, ok.Status);
        Assert.Equal("2026-12-01", ok.Corpo.GetProperty("dataStatus").GetString());

        // O administrador renomeia (200) e, ao pegar o nome de outra ativa, recebe 409 obra-nome-duplicado.
        var renomeado = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", AmbienteApi.CorpoDeAtualizacao(ok.Versao, "Nome Do Administrador"));
        Assert.Equal(HttpStatusCode.OK, renomeado.Status);
        var duplicado = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", AmbienteApi.CorpoDeAtualizacao(renomeado.Versao, outra.Corpo.GetProperty("nome").GetString()));
        Assert.Equal(HttpStatusCode.Conflict, duplicado.Status);
        Assert.Equal("obra-nome-duplicado", duplicado.Corpo.GetProperty("type").GetString());
    }

    [Fact]
    public async Task Criar_arquivar_restaurar_so_administrador()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var trilhaAntes = await ContarTrilhaDaEmpresaAsync(api.EmpresaId);
        var obrasAntes = await ContarObrasAsync(api.EmpresaId);

        // Os outros 6 perfis: 403, sem obra criada nem trilha. Cada um enxerga a obra (vínculo ou escopo todas).
        foreach (var perfil in Perfis.Todos.Where(p => p != Perfis.Administrador))
        {
            var escopo = Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas;
            var usuario = await api.NovoUsuarioNaEmpresaAsync(perfil, escopo);
            if (escopo == EscoposObras.Vinculadas)
            {
                await _dados.CriarAcessoObraAsync(api.EmpresaId, obra.Id, usuario.UsuarioId);
            }

            var criar = await EnviarAsync(usuario.Navegador, "POST", "/api/v1/obras", AmbienteApi.CorpoValido("Obra Que Nao Pode " + perfil));
            var arquivar = await EnviarAsync(usuario.Navegador, "POST", $"/api/v1/obras/{obra.Id}/arquivar", new { versao = obra.Versao });
            var restaurar = await EnviarAsync(usuario.Navegador, "POST", $"/api/v1/obras/{obra.Id}/restaurar", new { versao = obra.Versao });

            Assert.All(new[] { criar, arquivar, restaurar }, r =>
            {
                Assert.Equal(HttpStatusCode.Forbidden, r.Status);
                Assert.Equal("acao-nao-permitida", r.Corpo.GetProperty("type").GetString());
            });
        }

        Assert.Equal(trilhaAntes, await ContarTrilhaDaEmpresaAsync(api.EmpresaId));
        Assert.Equal(obrasAntes, await ContarObrasAsync(api.EmpresaId));
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE empresa_id = '{api.EmpresaId}' AND nome LIKE 'Obra Que Nao Pode%'"));

        // Controle negativo: o administrador cria (201), arquiva (200) e restaura (200).
        var criada = await api.CriarObraAsync();
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = criada.Versao });
        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        var restaurada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = arquivada.Versao });
        Assert.Equal(HttpStatusCode.OK, restaurada.Status);
    }

    [Fact]
    public async Task Responsavel_da_obra_precisa_estar_ativo()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();

        var removido = await api.NovoUsuarioNaEmpresaAsync(Perfis.EngenheiroObra);
        await _dados.RemoverMembroAsync(api.EmpresaId, removido.UsuarioId);
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(await _dados.CriarUsuarioAsync());
        var alheio = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresaB, alheio);
        var inexistente = Guid.NewGuid();

        Dictionary<string, object?> CorpoComResponsavel(Guid responsavel)
        {
            var corpo = AmbienteApi.CorpoValido();
            corpo["responsavelId"] = responsavel;
            return corpo;
        }

        // Criar: removido, de outra empresa e inexistente dão o MESMO 400 em responsavelId (não revela existência).
        var respostasDeCriar = new List<AmbienteApi.RespostaJson>();
        foreach (var responsavel in new[] { removido.UsuarioId, alheio, inexistente })
        {
            respostasDeCriar.Add(await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", CorpoComResponsavel(responsavel)));
        }

        Assert.All(respostasDeCriar, r => Assert.Equal(HttpStatusCode.BadRequest, r.Status));
        Assert.All(respostasDeCriar, r => Assert.True(r.Corpo.GetProperty("errors").TryGetProperty("responsavelId", out _)));
        Assert.Single(respostasDeCriar.Select(r => r.CorpoSemTraceId()).Distinct(StringComparer.Ordinal));

        // Editar: idem.
        var respostasDeEditar = new List<AmbienteApi.RespostaJson>();
        foreach (var responsavel in new[] { removido.UsuarioId, alheio, inexistente })
        {
            var corpo = AmbienteApi.CorpoDeAtualizacao(obra.Versao, obra.Corpo.GetProperty("nome").GetString());
            corpo["responsavelId"] = responsavel;
            respostasDeEditar.Add(await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", corpo));
        }

        Assert.All(respostasDeEditar, r => Assert.Equal(HttpStatusCode.BadRequest, r.Status));
        Assert.Single(respostasDeEditar.Select(r => r.CorpoSemTraceId()).Distinct(StringComparer.Ordinal));

        // Controle negativo: membro ATIVO é aceito (201 e 200).
        var ativo = await api.NovoUsuarioNaEmpresaAsync(Perfis.EngenheiroObra);
        var criada = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", CorpoComResponsavel(ativo.UsuarioId));
        Assert.Equal(HttpStatusCode.Created, criada.Status);
        var corpoDeEdicao = AmbienteApi.CorpoDeAtualizacao(obra.Versao, obra.Corpo.GetProperty("nome").GetString());
        corpoDeEdicao["responsavelId"] = ativo.UsuarioId;
        var editada = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{obra.Id}", corpoDeEdicao);
        Assert.Equal(HttpStatusCode.OK, editada.Status);
    }

    #endregion

    #region Métodos privados

    private async Task<int> ContarTrilhaAsync(Guid obra) =>
        int.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE obra_id = '{obra}'"), System.Globalization.CultureInfo.InvariantCulture);

    private async Task<int> ContarTrilhaDaEmpresaAsync(Guid empresa) =>
        int.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE empresa_id = '{empresa}'"), System.Globalization.CultureInfo.InvariantCulture);

    private async Task<int> ContarObrasAsync(Guid empresa) =>
        int.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.obra WHERE empresa_id = '{empresa}'"), System.Globalization.CultureInfo.InvariantCulture);

    // Requisição (com antiforgery nas escritas) como o navegador dado; devolve a resposta já lida.
    private static async Task<AmbienteApi.RespostaJson> EnviarAsync(HttpClient navegador, string metodo, string url, object? corpo)
    {
        using var resposta = metodo == "GET"
            ? await navegador.GetAsync(url, TestContext.Current.CancellationToken)
            : await ClienteAutenticado.EscreverAsync(navegador, new HttpMethod(metodo), url, corpo);
        return await AmbienteApi.RespostaJson.LerAsync(resposta);
    }

    #endregion
}
