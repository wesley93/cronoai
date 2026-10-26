using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Membros;

/// <summary>
/// Gestão de membros pela API (plano 00014, T61 a T64): listar com nome e sem identidade externa, trocar perfil com versão por
/// <c>xmin</c>, remover e reativar com a trilha, e o 404 idêntico para membro de outra empresa.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class MembrosApiTestes
{
    #region Campos

    // Nada da identidade externa nem e-mail pode sair na listagem (minimização, RNF-02.3).
    private static readonly string[] _identidadeExterna = ["emissor", "sujeito", "email", "https://idp.teste"];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public MembrosApiTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Listar_membros()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var nomeDoColega = "Colega Ficticio " + Guid.NewGuid().ToString("N")[..8];
        var colega = await _dados.CriarUsuarioAsync(nome: nomeDoColega);
        await _dados.VincularAsync(api.EmpresaId, colega, Perfis.EngenheiroObra);
        var removido = await _dados.CriarUsuarioAsync(nome: "Removido Ficticio " + Guid.NewGuid().ToString("N")[..8]);
        await _dados.VincularAsync(api.EmpresaId, removido, Perfis.Suprimentos);
        await _dados.RemoverMembroAsync(api.EmpresaId, removido);

        var nomeDeOutraEmpresa = "Outra Empresa Ficticia " + Guid.NewGuid().ToString("N")[..8];
        var deFora = await _dados.CriarUsuarioAsync(nome: nomeDeOutraEmpresa);
        await _dados.CriarEmpresaComMembrosAsync(deFora);

        // Administrador: 200, só os membros ATIVOS de X, com nome e perfil, sem emissor nem sujeito, sem ninguém da outra empresa.
        var lista = await api.LerAsync("/api/v1/membros");
        Assert.Equal(HttpStatusCode.OK, lista.Status);
        var itens = lista.Corpo.EnumerateArray().ToList();
        Assert.Contains(itens, i => i.GetProperty("usuarioId").GetGuid() == colega && i.GetProperty("nomeExibicao").GetString() == nomeDoColega && i.GetProperty("perfil").GetString() == Perfis.EngenheiroObra);
        Assert.DoesNotContain(itens, i => i.GetProperty("usuarioId").GetGuid() == removido);
        Assert.DoesNotContain(itens, i => i.GetProperty("usuarioId").GetGuid() == deFora);
        Assert.DoesNotContain(nomeDeOutraEmpresa, lista.Texto, StringComparison.Ordinal);
        Assert.All(_identidadeExterna, proibido => Assert.DoesNotContain(proibido, lista.Texto, StringComparison.OrdinalIgnoreCase));

        // incluirRemovidos=true: só o administrador (traz o removido, com removidoEm).
        var comRemovidos = await api.LerAsync("/api/v1/membros?incluirRemovidos=true");
        Assert.Equal(HttpStatusCode.OK, comRemovidos.Status);
        var doRemovido = comRemovidos.Corpo.EnumerateArray().Single(i => i.GetProperty("usuarioId").GetGuid() == removido);
        Assert.NotEqual(JsonValueKind.Null, doRemovido.GetProperty("removidoEm").ValueKind);

        // Gestor de portfólio: lista (200), mas com incluirRemovidos=true recebe 403 (listar removidos é gerir).
        var gestor = await api.NovoUsuarioNaEmpresaAsync(Perfis.GestorPortfolio, EscoposObras.Todas);
        using (var resposta = await gestor.Navegador.GetAsync("/api/v1/membros", TestContext.Current.CancellationToken))
        {
            Assert.Equal(HttpStatusCode.OK, resposta.StatusCode);
        }

        using (var resposta = await gestor.Navegador.GetAsync("/api/v1/membros?incluirRemovidos=true", TestContext.Current.CancellationToken))
        {
            Assert.Equal(HttpStatusCode.Forbidden, resposta.StatusCode);
            Assert.Equal("acao-nao-permitida", (await AmbienteApi.RespostaJson.LerAsync(resposta)).Corpo.GetProperty("type").GetString());
        }

        // Os outros perfis: 403 em ambas as formas.
        foreach (var perfil in new[] { Perfis.EngenheiroPlanejamento, Perfis.EngenheiroObra, Perfis.Suprimentos, Perfis.Encarregado, Perfis.Diretoria })
        {
            var usuario = await api.NovoUsuarioNaEmpresaAsync(perfil, Perfis.EscopoUnico(perfil) ?? EscoposObras.Todas);
            using var resposta = await usuario.Navegador.GetAsync("/api/v1/membros", TestContext.Current.CancellationToken);
            Assert.Equal(HttpStatusCode.Forbidden, resposta.StatusCode);
        }
    }

    [Fact]
    public async Task Alterar_perfil()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        // Empresa com UM administrador (o logado) e um engenheiro.
        var empresa = await _dados.CriarEmpresaAsync(comAdministradorTecnico: false);
        var admin = await CenarioLogin.NaEmpresaAsync(fabrica, idp, _dados, empresa, Perfis.Administrador);
        using var navegador = admin.Navegador;
        var engenheiro = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, engenheiro, Perfis.EngenheiroObra);
        var trilhaAntes = await ContarTrilhaDoMembroAsync(engenheiro);

        var atual = await LerMembroAsync(navegador, engenheiro);

        // 200 com a nova versão e UMA linha de trilha "alterar" (perfil e escopo em antes e depois). O escopo é derivado para o
        // engenheiro (perfil de escopo único): o corpo não o traz.
        var alterado = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "engenheiro_planejamento", versao = atual.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, alterado.Status);
        Assert.Equal("engenheiro_planejamento", alterado.Corpo.GetProperty("perfil").GetString());
        Assert.Equal("vinculadas", alterado.Corpo.GetProperty("escopoObras").GetString());
        Assert.NotEqual(atual.GetProperty("versao").GetInt64(), alterado.Corpo.GetProperty("versao").GetInt64());
        Assert.Equal(trilhaAntes + 1, await ContarTrilhaDoMembroAsync(engenheiro));
        Assert.Equal(
            "alterar|engenheiro_obra|engenheiro_planejamento",
            await _banco.ConsultarComoSuperusuarioAsync($"SELECT acao || '|' || (antes->>'perfil') || '|' || (depois->>'perfil') FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{engenheiro}' ORDER BY id DESC LIMIT 1"));

        // Versão velha: 409 conflito-de-versao com o estado atual (e sem gravar).
        var velha = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "suprimentos", versao = atual.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.Conflict, velha.Status);
        Assert.Equal("conflito-de-versao", velha.Corpo.GetProperty("type").GetString());
        Assert.Equal("engenheiro_planejamento", velha.Corpo.GetProperty("estadoAtual").GetProperty("perfil").GetString());

        var versaoAtual = alterado.Corpo.GetProperty("versao").GetInt64();

        // Par inválido (engenheiro com escopo "todas"): 400 em escopoObras. Gestor sem escopo: 400 (precisa escolher).
        var parInvalido = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "engenheiro_obra", escopoObras = "todas", versao = versaoAtual });
        Assert.Equal(HttpStatusCode.BadRequest, parInvalido.Status);
        Assert.True(parInvalido.Corpo.GetProperty("errors").TryGetProperty("escopoObras", out _));
        var semEscopo = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "gestor_portfolio", versao = versaoAtual });
        Assert.Equal(HttpStatusCode.BadRequest, semEscopo.Status);
        Assert.True(semEscopo.Corpo.GetProperty("errors").TryGetProperty("escopoObras", out _));

        // encarregado: 400 perfil-indisponivel (sem login de trabalhador até RH e Jurídico).
        var encarregado = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "encarregado", versao = versaoAtual });
        Assert.Equal(HttpStatusCode.BadRequest, encarregado.Status);
        Assert.Equal("perfil-indisponivel", encarregado.Corpo.GetProperty("type").GetString());

        // versão ausente: 400.
        var semVersao = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "suprimentos" });
        Assert.Equal(HttpStatusCode.BadRequest, semVersao.Status);

        // Atribuição em massa: empresaId e usuarioId no corpo são ignorados (o alvo é o da URL, a empresa é a da sessão).
        var empresaDeFora = await _dados.CriarEmpresaComMembrosAsync(await _dados.CriarUsuarioAsync());
        var massa = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "suprimentos", versao = versaoAtual, empresaId = empresaDeFora, usuarioId = Guid.NewGuid() });
        Assert.Equal(HttpStatusCode.OK, massa.Status);
        Assert.Equal(empresa.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.membro_empresa WHERE usuario_id = '{engenheiro}'"));

        // Corpo grande: 413 (limite de 8 KB das escritas novas).
        var grande = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{engenheiro}", new { perfil = "suprimentos", versao = massa.Corpo.GetProperty("versao").GetInt64(), motivo = new string('x', 9000) });
        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, grande.Status);

        // Rebaixar o ÚLTIMO administrador: 409 ultimo-administrador, SEM trilha (a trilha inserida no lote desfaz junto), sem vazar
        // nome de constraint nem mensagem do banco.
        var eu = await LerMembroAsync(navegador, admin.UsuarioId);
        var trilhaDoAdminAntes = await ContarTrilhaDoMembroAsync(admin.UsuarioId);
        var rebaixar = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{admin.UsuarioId}", new { perfil = "engenheiro_obra", versao = eu.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.Conflict, rebaixar.Status);
        Assert.Equal("ultimo-administrador", rebaixar.Corpo.GetProperty("type").GetString());
        Assert.DoesNotContain("ck_empresa", rebaixar.Texto, StringComparison.Ordinal);
        Assert.DoesNotContain("constraint", rebaixar.Texto, StringComparison.OrdinalIgnoreCase);
        Assert.Equal(trilhaDoAdminAntes, await ContarTrilhaDoMembroAsync(admin.UsuarioId));
        Assert.Equal("administrador", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE usuario_id = '{admin.UsuarioId}'"));

        // Controle negativo: com um SEGUNDO administrador, rebaixar o primeiro passa.
        var segundo = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(empresa, segundo, Perfis.Administrador);
        var comSegundo = await EnviarAsync(navegador, "PUT", $"/api/v1/membros/{admin.UsuarioId}", new { perfil = "engenheiro_obra", versao = eu.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, comSegundo.Status);
    }

    [Fact]
    public async Task Remover_e_reativar()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var alvo = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, alvo, Perfis.EngenheiroObra);
        var atual = await LerMembroAsync(api.Navegador, alvo);

        // Remover: 200, removidoEm preenchido e UMA trilha "remover".
        var removido = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/membros/{alvo}/remover", new { versao = atual.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, removido.Status);
        Assert.NotEqual(JsonValueKind.Null, removido.Corpo.GetProperty("removidoEm").ValueKind);
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{alvo}' AND acao = 'remover'"));

        // Remover de novo: 409 membro-removido.
        var denovo = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/membros/{alvo}/remover", new { versao = removido.Corpo.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.Conflict, denovo.Status);
        Assert.Equal("membro-removido", denovo.Corpo.GetProperty("type").GetString());

        // Reativar: 200 e UMA trilha "restaurar". Reativar ativo: 409 membro-nao-removido.
        var reativado = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/membros/{alvo}/reativar", new { versao = removido.Corpo.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.OK, reativado.Status);
        Assert.Equal(JsonValueKind.Null, reativado.Corpo.GetProperty("removidoEm").ValueKind);
        Assert.Equal("1", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{alvo}' AND acao = 'restaurar'"));
        var ativo = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/membros/{alvo}/reativar", new { versao = reativado.Corpo.GetProperty("versao").GetInt64() });
        Assert.Equal(HttpStatusCode.Conflict, ativo.Status);
        Assert.Equal("membro-nao-removido", ativo.Corpo.GetProperty("type").GetString());

        // Membro responsável por obra: 409 membro-responsavel com a lista de ids (nunca nomes) e nada gravado.
        var responsavel = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, responsavel, Perfis.EngenheiroObra);
        var corpoDaObra = AmbienteApi.CorpoValido("Obra Do Responsavel " + Guid.NewGuid().ToString("N")[..6]);
        corpoDaObra["responsavelId"] = responsavel;
        var obra = await api.CriarObraAsync(corpoDaObra);
        var versaoDoResponsavel = (await LerMembroAsync(api.Navegador, responsavel)).GetProperty("versao").GetInt64();

        var recusado = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/membros/{responsavel}/remover", new { versao = versaoDoResponsavel });
        Assert.Equal(HttpStatusCode.Conflict, recusado.Status);
        Assert.Equal("membro-responsavel", recusado.Corpo.GetProperty("type").GetString());
        Assert.Equal([obra.Id], recusado.Corpo.GetProperty("obras").EnumerateArray().Select(o => o.GetGuid()).ToList());
        Assert.DoesNotContain("Obra Do Responsavel", recusado.Texto, StringComparison.Ordinal);
        Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE usuario_id = '{responsavel}' AND removido_em IS NOT NULL"));
    }

    [Fact]
    public async Task Membro_de_outra_empresa_404_identico()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var deY = await _dados.CriarUsuarioAsync();
        var empresaY = await _dados.CriarEmpresaAsync();
        await _dados.VincularAsync(empresaY, deY, Perfis.EngenheiroObra);
        var inexistente = Guid.NewGuid();
        var versaoDeY = await _banco.ConsultarComoSuperusuarioAsync($"SELECT xmin::text FROM cronoai.membro_empresa WHERE usuario_id = '{deY}'");

        foreach (var (metodo, sufixo, corpo) in new (string, string, object)[]
        {
            ("PUT", "", new { perfil = "suprimentos", versao = 1 }),
            ("POST", "/remover", new { versao = 1 }),
            ("POST", "/reativar", new { versao = 1 }),
        })
        {
            var alheio = await api.EscreverAsync(new HttpMethod(metodo), $"/api/v1/membros/{deY}{sufixo}", corpo);
            var ausente = await api.EscreverAsync(new HttpMethod(metodo), $"/api/v1/membros/{inexistente}{sufixo}", corpo);

            Assert.Equal(HttpStatusCode.NotFound, alheio.Status);
            Assert.Equal(HttpStatusCode.NotFound, ausente.Status);
            Assert.Equal(ausente.CorpoSemTraceId(), alheio.CorpoSemTraceId());
        }

        // A empresa Y segue intacta (perfil e versão).
        Assert.Equal("engenheiro_obra", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE usuario_id = '{deY}'"));
        Assert.Equal(versaoDeY, await _banco.ConsultarComoSuperusuarioAsync($"SELECT xmin::text FROM cronoai.membro_empresa WHERE usuario_id = '{deY}'"));

        // Controle negativo: um membro de X responde 200.
        var deX = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, deX, Perfis.EngenheiroObra);
        var versao = (await LerMembroAsync(api.Navegador, deX)).GetProperty("versao").GetInt64();
        var ok = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/membros/{deX}", new { perfil = "suprimentos", versao });
        Assert.Equal(HttpStatusCode.OK, ok.Status);
    }

    #endregion

    #region Métodos privados

    private async Task<int> ContarTrilhaDoMembroAsync(Guid usuario) =>
        int.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.auditoria WHERE entidade = 'membro_empresa' AND entidade_id = '{usuario}'"), System.Globalization.CultureInfo.InvariantCulture);

    // O membro como a listagem o devolve (com a versão que a API usa).
    private static async Task<JsonElement> LerMembroAsync(HttpClient navegador, Guid usuario)
    {
        using var resposta = await navegador.GetAsync("/api/v1/membros?incluirRemovidos=true", TestContext.Current.CancellationToken);
        var lida = await AmbienteApi.RespostaJson.LerAsync(resposta);
        return lida.Corpo.EnumerateArray().Single(i => i.GetProperty("usuarioId").GetGuid() == usuario);
    }

    private static async Task<AmbienteApi.RespostaJson> EnviarAsync(HttpClient navegador, string metodo, string url, object corpo)
    {
        using var resposta = await ClienteAutenticado.EscreverAsync(navegador, new HttpMethod(metodo), url, corpo);
        return await AmbienteApi.RespostaJson.LerAsync(resposta);
    }

    #endregion
}
