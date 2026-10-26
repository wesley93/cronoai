using System.Net;
using CronoAI.Api.Testes.Infra;
using CronoAI.Api.Testes.Infra.IdpTeste;
using CronoAI.Api.Testes.Isolamento;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Membros;

/// <summary>
/// Propriedades transversais das 5 escritas novas (membros e acessos de obra; plano 00014, T69 a T71): cada uma grava
/// EXATAMENTE a trilha esperada, os logs não levam nome nem motivo, e sem empresa ativa todas as 7 rotas respondem 403.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class EscritasNovasTestes
{
    #region Campos

    private const string Raiz = "/api/v1";

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public EscritasNovasTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Toda_rota_de_escrita_nova_gera_uma_trilha()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var alvo = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, alvo, Perfis.EngenheiroObra);

        // Cada escrita nova do catálogo, a trilha esperada (entidade|ação, na ordem em que cabe) e o delta EXATO de linhas.
        var casos = new Dictionary<string, (Func<Task<AmbienteApi.RespostaJson>> Executar, string[] Esperado)>(StringComparer.Ordinal)
        {
            ["PUT " + Raiz + "/membros/{usuarioId}"] = (
                async () => await api.EscreverAsync(HttpMethod.Put, $"{Raiz}/membros/{alvo}", new { perfil = "suprimentos", versao = await VersaoAsync(alvo) }),
                ["membro_empresa|alterar"]),
            ["POST " + Raiz + "/membros/{usuarioId}/remover"] = (
                async () => await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/membros/{alvo}/remover", new { versao = await VersaoAsync(alvo) }),
                ["membro_empresa|remover"]),
            ["POST " + Raiz + "/membros/{usuarioId}/reativar"] = (
                async () => await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/membros/{alvo}/reativar", new { versao = await VersaoAsync(alvo) }),
                ["membro_empresa|restaurar"]),
            ["POST " + Raiz + "/obras/{id}/acessos"] = (
                async () => await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos", new { usuarioId = alvo }),
                ["acesso_obra|criar"]),
            ["POST " + Raiz + "/obras/{id}/acessos/{usuarioId}/revogar"] = (
                async () =>
                {
                    // Com DUAS frentes do usuário na obra: 1 + 2 linhas "remover" (o vínculo de obra e um por acesso de frente).
                    var f1 = await _dados.CriarFrenteAsync(api.EmpresaId, obra.Id);
                    var f2 = await _dados.CriarFrenteAsync(api.EmpresaId, obra.Id);
                    await _dados.CriarAcessoFrenteAsync(api.EmpresaId, obra.Id, f1, alvo);
                    await _dados.CriarAcessoFrenteAsync(api.EmpresaId, obra.Id, f2, alvo);
                    return await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos/{alvo}/revogar", new { });
                },
                ["acesso_frente|remover", "acesso_frente|remover", "acesso_obra|remover"]),
        };

        // Rota de escrita nova do catálogo SEM caso aqui reprova (e caso sem rota também).
        var escritasDoCatalogo = CatalogoRotas.Entradas
            .Where(e => e.Metodo is "POST" or "PUT" && (e.Padrao.StartsWith(Raiz + "/membros", StringComparison.Ordinal) || e.Padrao.Contains("/acessos", StringComparison.Ordinal)))
            .Select(e => e.Chave)
            .Order(StringComparer.Ordinal)
            .ToList();
        Assert.Equal(escritasDoCatalogo, casos.Keys.Order(StringComparer.Ordinal).ToList());

        // A ordem de execução importa (remover antes de reativar; conceder antes de revogar).
        foreach (var chave in new[]
        {
            "PUT " + Raiz + "/membros/{usuarioId}",
            "POST " + Raiz + "/membros/{usuarioId}/remover",
            "POST " + Raiz + "/membros/{usuarioId}/reativar",
            "POST " + Raiz + "/obras/{id}/acessos",
            "POST " + Raiz + "/obras/{id}/acessos/{usuarioId}/revogar",
        })
        {
            var (executar, esperado) = casos[chave];
            var antes = await UltimoIdDaTrilhaAsync(api.EmpresaId);

            var resposta = await executar();

            Assert.True((int)resposta.Status is 200 or 201 or 204, $"{chave} respondeu {(int)resposta.Status}: {resposta.Texto}");
            var novas = (await _banco.ConsultarComoSuperusuarioAsync($"SELECT entidade || '|' || acao FROM cronoai.auditoria WHERE empresa_id = '{api.EmpresaId}' AND id > {antes} ORDER BY entidade, acao"))
                .Split('\n', StringSplitOptions.RemoveEmptyEntries);
            Assert.True(esperado.Order(StringComparer.Ordinal).SequenceEqual(novas.Order(StringComparer.Ordinal)), $"{chave}: trilha esperada [{string.Join(", ", esperado)}], gravada [{string.Join(", ", novas)}]");
        }
    }

    [Fact]
    public async Task Logs_sem_nome_nem_motivo()
    {
        var logs = new LogsEmMemoria();
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, logs: logs);
        var nomeSensivel = "Nome Sensivel Ficticio " + Guid.NewGuid().ToString("N")[..8];
        var motivoSensivel = "motivo-sensivel-" + Guid.NewGuid().ToString("N")[..8];
        var obra = await api.CriarObraAsync();
        var alvo = await _dados.CriarUsuarioAsync(nome: nomeSensivel);
        await _dados.VincularAsync(api.EmpresaId, alvo, Perfis.EngenheiroObra);

        var versao = (await VersaoAsync(alvo));
        Assert.Equal(HttpStatusCode.OK, (await api.EscreverAsync(HttpMethod.Put, $"{Raiz}/membros/{alvo}", new { perfil = "suprimentos", versao, motivo = motivoSensivel })).Status);
        Assert.Equal(HttpStatusCode.Created, (await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos", new { usuarioId = alvo, motivo = motivoSensivel })).Status);
        Assert.Equal(HttpStatusCode.NoContent, (await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos/{alvo}/revogar", new { motivo = motivoSensivel })).Status);
        Assert.Equal(HttpStatusCode.OK, (await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/membros/{alvo}/remover", new { versao = await VersaoAsync(alvo), motivo = motivoSensivel })).Status);
        Assert.Equal(HttpStatusCode.OK, (await api.EscreverAsync(HttpMethod.Post, $"{Raiz}/membros/{alvo}/reativar", new { versao = await VersaoAsync(alvo), motivo = motivoSensivel })).Status);

        // Nenhum log leva o nome de exibição nem o motivo; os logs de escrita levam os ids.
        Assert.DoesNotContain(nomeSensivel, logs.Tudo, StringComparison.Ordinal);
        Assert.DoesNotContain(motivoSensivel, logs.Tudo, StringComparison.Ordinal);
        Assert.Contains($"usuario_id={alvo}", logs.Tudo, StringComparison.OrdinalIgnoreCase);
        Assert.Contains($"obra_id={obra.Id}", logs.Tudo, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Rotas_novas_sem_empresa_ativa_403()
    {
        using var idp = new IdpEmMemoria();
        await using var fabrica = new ApiFactory(_banco.StringConexaoApp) { Idp = idp };

        // Usuário com DUAS empresas e nenhuma ativa: as 7 rotas novas respondem 403 empresa-ativa-necessaria.
        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, _dados, 2);
        using var navegador = cenario.Navegador;
        var qualquer = Guid.NewGuid();
        var rotas = new (string Metodo, string Caminho, object? Corpo)[]
        {
            ("GET", $"{Raiz}/membros", null),
            ("PUT", $"{Raiz}/membros/{qualquer}", new { perfil = "suprimentos", versao = 1 }),
            ("POST", $"{Raiz}/membros/{qualquer}/remover", new { versao = 1 }),
            ("POST", $"{Raiz}/membros/{qualquer}/reativar", new { versao = 1 }),
            ("GET", $"{Raiz}/obras/{qualquer}/acessos", null),
            ("POST", $"{Raiz}/obras/{qualquer}/acessos", new { usuarioId = qualquer }),
            ("POST", $"{Raiz}/obras/{qualquer}/acessos/{qualquer}/revogar", new { }),
        };

        foreach (var (metodo, caminho, corpo) in rotas)
        {
            using var resposta = metodo == "GET"
                ? await navegador.GetAsync(caminho, TestContext.Current.CancellationToken)
                : await ClienteAutenticado.EscreverAsync(navegador, new HttpMethod(metodo), caminho, corpo);
            var lida = await AmbienteApi.RespostaJson.LerAsync(resposta);

            Assert.True(lida.Status == HttpStatusCode.Forbidden, $"{metodo} {caminho} respondeu {(int)lida.Status}");
            Assert.Equal("empresa-ativa-necessaria", lida.Corpo.GetProperty("type").GetString());
        }
    }

    [Theory]
    [InlineData("PUT /membros/{usuarioId}")]
    [InlineData("POST /membros/{usuarioId}/remover")]
    [InlineData("POST /membros/{usuarioId}/reativar")]
    [InlineData("POST /obras/{id}/acessos")]
    [InlineData("POST /obras/{id}/acessos/{usuarioId}/revogar")]
    public async Task Corpo_acima_do_limite_de_8_KB_responde_413_e_nao_grava(string rota)
    {
        // S-6 (auditoria): as 5 escritas novas declaram o limite de corpo (8 KB). Corpo de 9 KB: 413 e NADA gravado (nem estado, nem
        // trilha). Sem o LimiteDeCorpoMetadata da rota o corpo passaria à validação e o caso cairia (controle por mutação).
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra = await api.CriarObraAsync();
        var alvo = await _dados.CriarUsuarioAsync();
        await _dados.VincularAsync(api.EmpresaId, alvo, Perfis.EngenheiroObra);
        if (rota.EndsWith("/reativar", StringComparison.Ordinal))
        {
            await _dados.RemoverMembroAsync(api.EmpresaId, alvo);
        }

        if (rota.EndsWith("/revogar", StringComparison.Ordinal))
        {
            await _dados.CriarAcessoObraAsync(api.EmpresaId, obra.Id, alvo);
        }

        var trilhaAntes = await UltimoIdDaTrilhaAsync(api.EmpresaId);
        var versao = await VersaoAsync(alvo);
        var motivoGrande = new string('x', 9 * 1024);
        var (metodo, url, corpo) = rota switch
        {
            "PUT /membros/{usuarioId}" => (HttpMethod.Put, $"{Raiz}/membros/{alvo}", (object)new { perfil = "suprimentos", versao, motivo = motivoGrande }),
            "POST /membros/{usuarioId}/remover" => (HttpMethod.Post, $"{Raiz}/membros/{alvo}/remover", new { versao, motivo = motivoGrande }),
            "POST /membros/{usuarioId}/reativar" => (HttpMethod.Post, $"{Raiz}/membros/{alvo}/reativar", new { versao, motivo = motivoGrande }),
            "POST /obras/{id}/acessos" => (HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos", new { usuarioId = alvo, motivo = motivoGrande }),
            _ => (HttpMethod.Post, $"{Raiz}/obras/{obra.Id}/acessos/{alvo}/revogar", new { motivo = motivoGrande }),
        };

        var resposta = await api.EscreverAsync(metodo, url, corpo);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, resposta.Status);
        Assert.Equal(trilhaAntes, await UltimoIdDaTrilhaAsync(api.EmpresaId));
        Assert.Equal("engenheiro_obra", await _banco.ConsultarComoSuperusuarioAsync($"SELECT perfil FROM cronoai.membro_empresa WHERE usuario_id = '{alvo}'"));
        var removidoEsperado = rota.EndsWith("/reativar", StringComparison.Ordinal);
        Assert.Equal(removidoEsperado ? "1" : "0", await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.membro_empresa WHERE usuario_id = '{alvo}' AND removido_em IS NOT NULL"));
        var vinculoEsperado = rota.EndsWith("/revogar", StringComparison.Ordinal) ? "1" : "0";
        Assert.Equal(vinculoEsperado, await _banco.ConsultarComoSuperusuarioAsync($"SELECT count(*) FROM cronoai.acesso_obra WHERE obra_id = '{obra.Id}' AND usuario_id = '{alvo}'"));
    }

    #endregion

    #region Métodos privados

    private async Task<long> UltimoIdDaTrilhaAsync(Guid empresa) =>
        long.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT coalesce(max(id), 0) FROM cronoai.auditoria WHERE empresa_id = '{empresa}'"), System.Globalization.CultureInfo.InvariantCulture);

    // xmin do vínculo: é a versão que a API devolve (inteiro, só igualdade).
    private async Task<long> VersaoAsync(Guid usuario) =>
        long.Parse(await _banco.ConsultarComoSuperusuarioAsync($"SELECT xmin::text FROM cronoai.membro_empresa WHERE usuario_id = '{usuario}'"), System.Globalization.CultureInfo.InvariantCulture);

    #endregion
}
