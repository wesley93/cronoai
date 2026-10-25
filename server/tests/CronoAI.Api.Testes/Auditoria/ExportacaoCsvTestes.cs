using System.Net;
using System.Text;
using CronoAI.Api.Auditoria;
using CronoAI.Api.Testes.Infra;

namespace CronoAI.Api.Testes.Auditoria;

/// <summary><c>GET /api/v1/auditoria/exportacao.csv</c>: formato, neutralização de fórmula, filtros, keyset e limite de taxa.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ExportacaoCsvTestes
{
    #region Campos

    private static readonly string[] _motivosMaliciosos =
    [
        "=HYPERLINK(\"http://exemplo.invalid\")",
        "+1",
        "-1",
        "@x",
        "\tx",
        "\rx",
    ];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ExportacaoCsvTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Exportacao_csv_formato()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var criada = await api.CriarObraAsync(Corpo("revisão de prazo"));
        await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{criada.Id}", Atualizacao(criada.Versao, "segunda linha"));

        var (status, bytes, cabecalhos) = await api.LerBytesAsync(UrlDeHoje());

        Assert.Equal(HttpStatusCode.OK, status);
        Assert.Equal("text/csv; charset=utf-8", cabecalhos["Content-Type"]);
        var disposicao = cabecalhos["Content-Disposition"];
        Assert.StartsWith("attachment", disposicao, StringComparison.Ordinal);
        Assert.Contains($"auditoria-{DateTime.UtcNow:yyyyMMdd}.csv", disposicao, StringComparison.Ordinal);

        // BOM, cabeçalho do plano, CRLF e todo campo entre aspas (o leitor do teste exige as três coisas).
        var linhas = CsvTeste.Ler(CsvTeste.TextoSemBom(bytes));
        Assert.Equal(
            ["id", "em_utc", "obra_id", "usuario_id", "entidade", "entidade_id", "acao", "origem", "versao_depois", "motivo", "antes", "depois", "correlacao_id"],
            linhas[0]);
        Assert.Equal(3, linhas.Count);
        Assert.All(linhas, l => Assert.Equal(13, l.Length));

        var criar = linhas[1];
        Assert.Equal(criada.Id.ToString("D"), criar[2]);
        Assert.Equal(api.UsuarioId.ToString("D"), criar[3]);
        Assert.Equal("obra", criar[4]);
        Assert.Equal("criar", criar[6]);
        Assert.Equal("ui", criar[7]);
        Assert.Equal("1", criar[8]);
        Assert.Equal("revisão de prazo", criar[9]);
        Assert.Equal("", criar[10]);
        Assert.Contains("\"nome\"", criar[11], StringComparison.Ordinal);
        Assert.Matches("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,7})?Z$", criar[1]);
        Assert.Equal("alterar", linhas[2][6]);
        Assert.Equal("2", linhas[2][8]);

        // O arquivo não tem o nome do usuário nem IP.
        Assert.DoesNotContain("Pessoa Ficticia", Encoding.UTF8.GetString(bytes), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Exportacao_csv_neutraliza_texto_malicioso_ponta_a_ponta()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        foreach (var motivo in _motivosMaliciosos)
        {
            await api.CriarObraAsync(Corpo(motivo));
        }

        await api.CriarObraAsync(Corpo("revisão de prazo"));

        var (status, bytes, _) = await api.LerBytesAsync(UrlDeHoje());

        Assert.Equal(HttpStatusCode.OK, status);
        var motivosNoArquivo = CsvTeste.Ler(CsvTeste.TextoSemBom(bytes)).Skip(1).Select(l => l[9]).ToList();
        Assert.Equal(7, motivosNoArquivo.Count);

        // Cada motivo perigoso sai com o prefixo ' (as aspas do arquivo já foram desfeitas pelo leitor)...
        foreach (var motivo in _motivosMaliciosos)
        {
            Assert.Contains("'" + motivo, motivosNoArquivo);
            Assert.DoesNotContain(motivo, motivosNoArquivo);
        }

        // ...e o motivo comum (controle negativo) sai intacto.
        Assert.Contains("revisão de prazo", motivosNoArquivo);
        Assert.DoesNotContain("'revisão de prazo", motivosNoArquivo);
    }

    [Fact]
    public async Task Exportacao_filtros_e_teto_de_366_dias()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var obra1 = await api.CriarObraAsync();
        var obra2 = await api.CriarObraAsync();
        var hoje = DateOnly.FromDateTime(DateTime.UtcNow);

        // Filtro por obra.
        var daObra1 = CsvTeste.Ler(CsvTeste.TextoSemBom((await api.LerBytesAsync(UrlDeHoje() + $"&obraId={obra1.Id}")).Bytes));
        Assert.Equal(2, daObra1.Count);
        Assert.Equal(obra1.Id.ToString("D"), daObra1[1][2]);
        Assert.NotEqual(obra2.Id.ToString("D"), daObra1[1][2]);

        // Filtro por período: ontem não tem nada (só o cabeçalho).
        var ontem = hoje.AddDays(-1);
        var vazio = CsvTeste.Ler(CsvTeste.TextoSemBom((await api.LerBytesAsync($"/api/v1/auditoria/exportacao.csv?de={ontem:yyyy-MM-dd}&ate={ontem:yyyy-MM-dd}")).Bytes));
        Assert.Single(vazio);

        // Teto: 366 dias (inclusive) passa; 367 não.
        var passa = await api.LerBytesAsync($"/api/v1/auditoria/exportacao.csv?de={hoje.AddDays(-365):yyyy-MM-dd}&ate={hoje:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.OK, passa.Status);
        var longo = await api.LerAsync($"/api/v1/auditoria/exportacao.csv?de={hoje.AddDays(-366):yyyy-MM-dd}&ate={hoje:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, longo.Status);
        Assert.Equal("ate", Assert.Single(longo.Corpo.GetProperty("errors").EnumerateObject()).Name);

        // de > ate, sem de e sem ate: 400 com o campo.
        var invertido = await api.LerAsync($"/api/v1/auditoria/exportacao.csv?de={hoje:yyyy-MM-dd}&ate={ontem:yyyy-MM-dd}");
        var semDe = await api.LerAsync($"/api/v1/auditoria/exportacao.csv?ate={hoje:yyyy-MM-dd}");
        var semAte = await api.LerAsync($"/api/v1/auditoria/exportacao.csv?de={hoje:yyyy-MM-dd}");
        Assert.Equal(HttpStatusCode.BadRequest, invertido.Status);
        Assert.Equal("de", Assert.Single(semDe.Corpo.GetProperty("errors").EnumerateObject()).Name);
        Assert.Equal("ate", Assert.Single(semAte.Corpo.GetProperty("errors").EnumerateObject()).Name);
    }

    [Fact]
    public async Task Exportacao_com_obra_de_outra_empresa_404()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var usuarioB = await _dados.CriarUsuarioAsync();
        var empresaB = await _dados.CriarEmpresaComMembrosAsync(usuarioB);
        var daB = await _dados.CriarObraAsync(empresaB, usuarioB);
        var propria = await api.CriarObraAsync();

        var alheia = await api.LerAsync(UrlDeHoje() + $"&obraId={daB.Id}");

        Assert.Equal(HttpStatusCode.NotFound, alheia.Status);
        Assert.DoesNotContain(daB.Nome, alheia.Texto, StringComparison.Ordinal);

        // Sem filtro de obra, a exportação da empresa A NUNCA traz a trilha de B (RLS e filtro da empresa ativa).
        var tudo = await api.LerBytesAsync(UrlDeHoje());
        var texto = Encoding.UTF8.GetString(tudo.Bytes);
        Assert.DoesNotContain(daB.Id.ToString("D"), texto, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(usuarioB.ToString("D"), texto, StringComparison.OrdinalIgnoreCase);

        // Controle negativo: com a obra da própria empresa, 200.
        var daA = await api.LerBytesAsync(UrlDeHoje() + $"&obraId={propria.Id}");
        Assert.Equal(HttpStatusCode.OK, daA.Status);
    }

    [Fact]
    public async Task Exportacao_percorre_por_keyset_sem_repetir_nem_pular()
    {
        // Páginas de 2 linhas (configuradas só neste teste): 5 registros = 3 consultas (2, 2, 1) e 4 registros = 2 páginas
        // cheias e uma terceira vazia que encerra o laço.
        var configuracoes = new Dictionary<string, string?> { [$"{OpcoesAuditoria.Secao}:TamanhoPaginaExportacao"] = "2" };
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, configuracoes: configuracoes);
        var cinco = await CriarComAlteracoesAsync(api, 4);
        var quatro = await CriarComAlteracoesAsync(api, 3);

        foreach (var (obra, quantidade) in new[] { (cinco, 5), (quatro, 4) })
        {
            var esperados = (await _dados.LerAuditoriaAsync(api.EmpresaId, obra.Id)).Select(r => r.Id).Order().ToList();
            var arquivo = await api.LerBytesAsync(UrlDeHoje() + $"&obraId={obra.Id}");

            var linhas = CsvTeste.Ler(CsvTeste.TextoSemBom(arquivo.Bytes)).Skip(1).ToList();

            Assert.Equal(quantidade, linhas.Count);
            Assert.Equal(esperados, linhas.Select(l => long.Parse(l[0], System.Globalization.CultureInfo.InvariantCulture)).ToList());
            Assert.Equal(quantidade, linhas.Select(l => l[0]).Distinct().Count());
        }

        // Sem o filtro de obra, as duas trilhas vêm juntas, em ordem crescente de id e sem repetição.
        var todas = CsvTeste.Ler(CsvTeste.TextoSemBom((await api.LerBytesAsync(UrlDeHoje())).Bytes)).Skip(1)
            .Select(l => long.Parse(l[0], System.Globalization.CultureInfo.InvariantCulture)).ToList();
        Assert.Equal(9, todas.Count);
        Assert.Equal(todas.Order().ToList(), todas);
        Assert.Equal(9, todas.Distinct().Count());
    }

    [Fact]
    public async Task Exportacao_limite_de_taxa_429()
    {
        var configuracoes = new Dictionary<string, string?> { ["Borda:LimiteExportacaoPorMinuto"] = "3" };
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados, configuracoes: configuracoes);

        for (var i = 0; i < 3; i++)
        {
            Assert.Equal(HttpStatusCode.OK, (await api.LerBytesAsync(UrlDeHoje())).Status);
        }

        var quarta = await api.LerBytesAsync(UrlDeHoje());

        Assert.Equal(HttpStatusCode.TooManyRequests, quarta.Status);
        Assert.True(quarta.Cabecalhos.ContainsKey("Retry-After"));
        Assert.True(int.Parse(quarta.Cabecalhos["Retry-After"], System.Globalization.CultureInfo.InvariantCulture) >= 1);

        // Controle negativo: o limite é só da exportação; o resto da API segue respondendo.
        Assert.Equal(HttpStatusCode.OK, (await api.LerAsync("/api/v1/obras")).Status);
    }

    #endregion

    #region Métodos privados

    private static string UrlDeHoje()
    {
        var hoje = DateOnly.FromDateTime(DateTime.UtcNow);
        return $"/api/v1/auditoria/exportacao.csv?de={hoje.AddDays(-1):yyyy-MM-dd}&ate={hoje.AddDays(1):yyyy-MM-dd}";
    }

    private static Dictionary<string, object?> Corpo(string motivo)
    {
        var corpo = AmbienteApi.CorpoValido();
        corpo["motivo"] = motivo;
        return corpo;
    }

    private static Dictionary<string, object?> Atualizacao(long versao, string motivo)
    {
        var corpo = AmbienteApi.CorpoDeAtualizacao(versao, "Obra Renomeada " + Guid.NewGuid().ToString("N")[..8]);
        corpo["motivo"] = motivo;
        return corpo;
    }

    // Obra com 1 + alteracoes linhas de trilha.
    private static async Task<AmbienteApi.RespostaJson> CriarComAlteracoesAsync(AmbienteApi api, int alteracoes)
    {
        var atual = await api.CriarObraAsync();
        var id = atual.Id;
        for (var i = 0; i < alteracoes; i++)
        {
            atual = await api.EscreverAsync(HttpMethod.Put, $"/api/v1/obras/{id}", AmbienteApi.CorpoDeAtualizacao(atual.Versao, $"Edicao {i} " + Guid.NewGuid().ToString("N")[..8]));
            Assert.Equal(HttpStatusCode.OK, atual.Status);
        }

        return atual;
    }

    #endregion
}
