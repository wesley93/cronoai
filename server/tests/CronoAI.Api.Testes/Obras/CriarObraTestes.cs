using System.Net;
using System.Text.Json;
using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Obras;

/// <summary><c>POST /api/v1/obras</c>: criação, validação por campo, atribuição em massa e limite de corpo.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class CriarObraTestes
{
    #region Campos

    private static readonly string[] _textosDoBanco = ["violates", "constraint", "fk_obra", "ck_obra", "ux_obra", "postgres", "23503", "23514"];

    private static readonly int[] _umEDois = [1, 2];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public CriarObraTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Criar_obra_201_versao_1_location_e_auditoria()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        corpo["dataStatus"] = "2026-10-01";
        corpo["opcoesCronograma"] = JsonSerializer.SerializeToElement(new { tipo = "predial", dias = _umEDois });

        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.Created, resposta.Status);
        Assert.Equal(1L, resposta.Versao);
        Assert.Equal($"/api/v1/obras/{resposta.Id}", resposta.Cabecalhos["Location"]);
        Assert.Equal("2026-10-01", resposta.Corpo.GetProperty("dataStatus").GetString());
        Assert.Equal("predial", resposta.Corpo.GetProperty("opcoesCronograma").GetProperty("tipo").GetString());
        Assert.Equal(JsonValueKind.Null, resposta.Corpo.GetProperty("arquivadaEm").ValueKind);

        // Uma linha de trilha, com o usuário DA SESSÃO.
        var trilha = Assert.Single(await _dados.LerAuditoriaAsync(api.EmpresaId, resposta.Id));
        Assert.Equal(AcoesAuditoria.Criar, trilha.Acao);
        Assert.Equal(api.UsuarioId, trilha.UsuarioId);
        Assert.Equal(1L, trilha.VersaoDepois);
    }

    [Fact]
    public async Task Criar_obra_ignora_empresa_id_e_versao_do_corpo()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var outraEmpresa = await _dados.CriarEmpresaComMembrosAsync(await _dados.CriarUsuarioAsync());
        var corpo = AmbienteApi.CorpoValido();
        corpo["empresaId"] = outraEmpresa;
        corpo["versao"] = 9;
        corpo["id"] = Guid.NewGuid();
        corpo["criadaEm"] = "2001-01-01T00:00:00Z";

        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.Created, resposta.Status);
        Assert.Equal(1L, resposta.Versao);
        Assert.NotEqual(corpo["id"], resposta.Id);
        Assert.Equal(api.EmpresaId.ToString("D"), await _banco.ConsultarComoSuperusuarioAsync($"SELECT empresa_id FROM cronoai.obra WHERE id = '{resposta.Id}'"));
        Assert.DoesNotContain("2001", resposta.Corpo.GetProperty("criadaEm").GetString(), StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("nome-vazio", "nome")]
    [InlineData("nome-201", "nome")]
    [InlineData("nome-nulo", "nome")]
    [InlineData("uf-minuscula", "uf")]
    [InlineData("uf-1-letra", "uf")]
    [InlineData("uf-inexistente", "uf|municipioIbge")]
    [InlineData("municipio-6-digitos", "municipioIbge")]
    [InlineData("municipio-dv-errado", "municipioIbge")]
    [InlineData("municipio-de-outra-uf", "municipioIbge")]
    [InlineData("sinapi-parcial", "sinapi")]
    [InlineData("sinapi-regime", "sinapi.regime")]
    [InlineData("sinapi-dia-2", "sinapi.dataBase")]
    [InlineData("sinapi-uf-inexistente", "sinapi.uf")]
    [InlineData("opcoes-array", "opcoesCronograma")]
    [InlineData("opcoes-texto", "opcoesCronograma")]
    [InlineData("opcoes-profundas", "opcoesCronograma")]
    [InlineData("motivo-501", "motivo")]
    public async Task Criar_obra_valida_entrada(string caso, string chavesAceitas)
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var corpo = AmbienteApi.CorpoValido();
        switch (caso)
        {
            case "nome-vazio": corpo["nome"] = ""; break;
            case "nome-201": corpo["nome"] = new string('n', 201); break;
            case "nome-nulo": corpo["nome"] = "Obra\0Nula"; break;
            case "uf-minuscula": corpo["uf"] = "pe"; break;
            case "uf-1-letra": corpo["uf"] = "P"; break;
            case "uf-inexistente": corpo["uf"] = "XX"; break;
            case "municipio-6-digitos": corpo["municipioIbge"] = "269999"; break;
            case "municipio-dv-errado": corpo["municipioIbge"] = "2699998"; break;
            case "municipio-de-outra-uf": corpo["uf"] = "SP"; break;
            case "sinapi-parcial": corpo["sinapi"] = new { uf = "PE" }; break;
            case "sinapi-regime": corpo["sinapi"] = new { uf = "PE", regime = "x", dataBase = "2026-09-01" }; break;
            case "sinapi-dia-2": corpo["sinapi"] = new { uf = "PE", regime = "desonerado", dataBase = "2026-09-02" }; break;
            case "sinapi-uf-inexistente": corpo["sinapi"] = new { uf = "XX", regime = "desonerado", dataBase = "2026-09-01" }; break;
            case "opcoes-array": corpo["opcoesCronograma"] = JsonSerializer.SerializeToElement(_umEDois); break;
            case "opcoes-texto": corpo["opcoesCronograma"] = JsonSerializer.SerializeToElement("texto"); break;
            case "opcoes-profundas": corpo["opcoesCronograma"] = JsonDocument.Parse(Aninhado(17)).RootElement.Clone(); break;
            case "motivo-501": corpo["motivo"] = new string('m', 501); break;
            default: throw new InvalidOperationException(caso);
        }

        var resposta = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo);

        Assert.Equal(HttpStatusCode.BadRequest, resposta.Status);
        var chaves = resposta.Corpo.GetProperty("errors").EnumerateObject().Select(p => p.Name).ToList();
        var chave = Assert.Single(chaves);
        Assert.Contains(chave, chavesAceitas.Split('|'));

        // Nenhum texto do PostgreSQL nem nome de constraint vai ao cliente.
        foreach (var proibido in _textosDoBanco)
        {
            Assert.DoesNotContain(proibido, resposta.Texto, StringComparison.OrdinalIgnoreCase);
        }

        // Controle negativo: o corpo sem defeito é aceito (com SINAPI completo e opções no limite de profundidade).
        var valido = AmbienteApi.CorpoValido();
        valido["sinapi"] = new { uf = "PE", regime = "desonerado", dataBase = "2026-09-01" };
        valido["opcoesCronograma"] = JsonDocument.Parse(Aninhado(16)).RootElement.Clone();
        Assert.Equal(HttpStatusCode.Created, (await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", valido)).Status);
    }

    [Fact]
    public async Task Responsavel_alheio_ou_inexistente_da_o_mesmo_400()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var membroDeB = await _dados.CriarUsuarioAsync();
        await _dados.CriarEmpresaComMembrosAsync(membroDeB);

        var corpoAlheio = AmbienteApi.CorpoValido();
        corpoAlheio["responsavelId"] = membroDeB;
        var corpoInexistente = AmbienteApi.CorpoValido();
        corpoInexistente["responsavelId"] = Guid.NewGuid();

        var alheio = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpoAlheio);
        var inexistente = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpoInexistente);

        // Não revela se o usuário existe: mesmo status e mesmo corpo (exceto o traceId).
        Assert.Equal(HttpStatusCode.BadRequest, alheio.Status);
        Assert.Equal(HttpStatusCode.BadRequest, inexistente.Status);
        Assert.Equal(alheio.CorpoSemTraceId(), inexistente.CorpoSemTraceId());
        Assert.Equal("responsavelId", Assert.Single(alheio.Corpo.GetProperty("errors").EnumerateObject()).Name);

        // Controle negativo: membro da própria empresa é aceito.
        var corpoDeA = AmbienteApi.CorpoValido();
        corpoDeA["responsavelId"] = api.UsuarioId;
        var criada = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpoDeA);
        Assert.Equal(HttpStatusCode.Created, criada.Status);
        Assert.Equal(api.UsuarioId, criada.Corpo.GetProperty("responsavelId").GetGuid());
    }

    [Fact]
    public async Task Corpo_acima_do_limite_413()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);

        // Campo desconhecido só para encher o corpo (o contrato o ignora): 65 KB recusa, 60 KB passa.
        var grande = AmbienteApi.CorpoValido();
        grande["enchimento"] = new string('x', 66000);
        var medio = AmbienteApi.CorpoValido();
        medio["enchimento"] = new string('x', 60000);

        var recusada = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", grande);
        var aceita = await api.EscreverAsync(HttpMethod.Post, "/api/v1/obras", medio);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, recusada.Status);
        Assert.Equal(HttpStatusCode.Created, aceita.Status);
    }

    [Fact]
    public async Task Corpo_em_fluxo_sem_tamanho_acima_do_limite_tambem_recusa()
    {
        await using var api = await AmbienteApi.CriarAsync(_banco, _dados);
        var token = await ClienteAutenticado.ObterTokenAntiforgeryAsync(api.Navegador);
        var grande = System.Text.Json.JsonSerializer.Serialize(new Dictionary<string, object?> { ["nome"] = "Obra Ficticia Fluxo", ["uf"] = "PE", ["municipioIbge"] = "2699999", ["enchimento"] = new string('x', 70000) });

        // Sem Content-Length (chunked): quem vigia é o limite fixado no recurso do servidor.
        using var requisicao = new HttpRequestMessage(HttpMethod.Post, "/api/v1/obras") { Content = new StreamContent(new MemoryStream(System.Text.Encoding.UTF8.GetBytes(grande))) };
        requisicao.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");
        requisicao.Headers.Add("X-XSRF-TOKEN", token);
        requisicao.Headers.TransferEncodingChunked = true;
        using var resposta = await api.Navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, resposta.StatusCode);
    }

    #endregion

    #region Métodos privados

    // {"a":{"a":...}} com a profundidade pedida (o objeto de fora conta como nível 1).
    private static string Aninhado(int niveis)
    {
        var texto = "1";
        for (var i = 0; i < niveis; i++)
        {
            texto = "{\"a\":" + texto + "}";
        }

        return texto;
    }

    #endregion
}
