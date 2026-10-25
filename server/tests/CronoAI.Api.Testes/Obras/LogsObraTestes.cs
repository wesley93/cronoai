using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Obras;

/// <summary>As escritas de obra só registram ids em log (RF-12.9): nunca nome, motivo nem o conteúdo da obra.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class LogsObraTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public LogsObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Escritas_de_obra_nao_logam_nome_motivo_nem_conteudo()
    {
        var logs = new LogsEmMemoria();
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, logs: logs);
        var sufixo = Guid.NewGuid().ToString("N");
        var nome = "NOME-SECRETO-" + sufixo;
        var nomeNovo = "NOME-NOVO-" + sufixo;
        var motivo = "MOTIVO-SECRETO-" + sufixo;
        var opcao = "OPCAO-SECRETA-" + sufixo;

        var corpo = AmbienteApi.CorpoValido(nome);
        corpo["motivo"] = motivo;
        corpo["opcoesCronograma"] = JsonSerializer.SerializeToElement(new { chave = opcao });
        var criada = await api.CriarObraAsync(corpo);

        var atualizacao = AmbienteApi.CorpoDeAtualizacao(criada.Versao, nomeNovo);
        atualizacao["motivo"] = motivo;
        var alterada = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", atualizacao);
        Assert.Equal(HttpStatusCode.OK, alterada.Status);
        var arquivada = await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/arquivar", new { versao = alterada.Versao, motivo });
        Assert.Equal(HttpStatusCode.OK, arquivada.Status);
        await api.EscreverAsync(HttpMethod.Post, $"/api/v1/obras/{criada.Id}/restaurar", new { versao = arquivada.Versao, motivo });

        // Também as recusas (400, 409 e 404) não vazam o conteúdo.
        await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", AmbienteApi.CorpoDeAtualizacao(1, nomeNovo + "x"));
        await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", new { nome = nomeNovo, uf = "xx", motivo });
        await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{Guid.NewGuid()}", atualizacao);

        var tudo = logs.Tudo;
        foreach (var proibido in new[] { nome, nomeNovo, motivo, opcao, sufixo })
        {
            Assert.DoesNotContain(proibido, tudo, StringComparison.Ordinal);
        }

        // Controle negativo: o id da obra aparece (o log existe e é útil, só não leva conteúdo).
        Assert.Contains(criada.Id.ToString("D"), tudo, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Em_Development_o_409_de_nome_duplicado_nao_deixa_o_nome_em_nenhum_log_da_aplicacao()
    {
        // ATENÇÃO ao que este teste prova: hoje o EF não loga nada (o contexto nasce de uma fábrica sem ILoggerFactory), então ele
        // passaria mesmo sem a mitigação. Prova só que, de ponta a ponta, o nome repetido não vai a log NENHUM da aplicação em
        // Development. A proteção da configuração é o teste do appsettings logo abaixo.
        // Em Development o Npgsql inclui o detalhe do erro (a linha, com o nome) e o EF logaria a exceção do 23505. O
        // appsettings.Development.json silencia as categorias Update e Database.Command do EF.
        var logs = new LogsEmMemoria();
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, logs: logs, ambiente: "Development");
        var nome = "NOME-DUPLICADO-" + Guid.NewGuid().ToString("N");
        await api.CriarObraAsync(AmbienteApi.CorpoValido(nome));

        var repetida = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", AmbienteApi.CorpoValido(nome));

        Assert.Equal(HttpStatusCode.Conflict, repetida.Status);
        Assert.DoesNotContain(nome, logs.Tudo, StringComparison.Ordinal);
        Assert.DoesNotContain("ux_obra_empresa_nome_ativa", logs.Tudo, StringComparison.Ordinal);
    }

    [Fact]
    public void Appsettings_Development_silencia_o_log_de_comandos_e_de_gravacao_do_EF()
    {
        // Guarda da mitigação: hoje o contexto do EF nasce de uma fábrica sem ILoggerFactory (o EF não loga), então o teste de
        // comportamento acima não distingue; se alguém ligar o log do EF, estas duas categorias continuam silenciosas em
        // Development (a exceção do 23505 e os parâmetros de comando levariam o nome da obra ao log).
        var pasta = new DirectoryInfo(AppContext.BaseDirectory);
        while (pasta is not null && !File.Exists(Path.Combine(pasta.FullName, "CronoAI.slnx")))
        {
            pasta = pasta.Parent;
        }

        Assert.NotNull(pasta);
        using var json = JsonDocument.Parse(File.ReadAllText(Path.Combine(pasta.FullName, "src", "CronoAI.Api", "appsettings.Development.json")));
        var niveis = json.RootElement.GetProperty("Logging").GetProperty("LogLevel");

        Assert.Equal("None", niveis.GetProperty("Microsoft.EntityFrameworkCore.Update").GetString());
        Assert.Equal("None", niveis.GetProperty("Microsoft.EntityFrameworkCore.Database.Command").GetString());
    }

    #endregion
}
