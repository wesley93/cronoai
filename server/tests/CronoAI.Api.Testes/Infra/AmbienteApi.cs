using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using CronoAI.Api.Testes.Infra.IdpTeste;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Host da API + IdP em memória + um usuário logado, membro de UMA empresa (a ativa), pronto para os testes de rotas. Reúne os
/// passos repetidos de cada teste (host, login OIDC, antiforgery) e as chamadas JSON de obra.
/// </summary>
public sealed class AmbienteApi : IAsyncDisposable
{
    #region Campos

    private readonly IdpEmMemoria _idp;
    private readonly ApiFactory _fabrica;

    #endregion

    #region Construtor

    private AmbienteApi(IdpEmMemoria idp, ApiFactory fabrica, CenarioLogin cenario)
    {
        _idp = idp;
        _fabrica = fabrica;
        Cenario = cenario;
    }

    #endregion

    #region Propriedades

    public CenarioLogin Cenario { get; }

    public HttpClient Navegador => Cenario.Navegador;

    public Guid EmpresaId => Cenario.Empresas[0];

    public Guid UsuarioId => Cenario.UsuarioId;

    public ApiFactory Fabrica => _fabrica;

    #endregion

    #region Métodos públicos

    public static async Task<AmbienteApi> CriarAsync(
        BancoPostgresFixture banco,
        DadosTeste dados,
        RelogioTeste? relogio = null,
        LogsEmMemoria? logs = null,
        IDictionary<string, string?>? configuracoes = null,
        int empresas = 1)
    {
        var idp = new IdpEmMemoria();
        var fabrica = new ApiFactory(banco.StringConexaoApp) { Idp = idp, Relogio = relogio, Logs = logs };
        foreach (var (chave, valor) in configuracoes ?? new Dictionary<string, string?>())
        {
            fabrica.Configuracoes[chave] = valor;
        }

        var cenario = await CenarioLogin.CriarAsync(fabrica, idp, dados, empresas);
        return new AmbienteApi(idp, fabrica, cenario);
    }

    /// <summary>Escrita com antiforgery; devolve o status e o corpo JSON (ou o texto, se não for JSON).</summary>
    public async Task<RespostaJson> EscreverAsync(HttpMethod metodo, string url, object? corpo = null, IDictionary<string, string>? cabecalhos = null)
    {
        var token = await ClienteAutenticado.ObterTokenAntiforgeryAsync(Navegador);
        using var requisicao = new HttpRequestMessage(metodo, url);
        requisicao.Headers.Add("X-XSRF-TOKEN", token);
        foreach (var (nome, valor) in cabecalhos ?? new Dictionary<string, string>())
        {
            requisicao.Headers.Add(nome, valor);
        }

        if (corpo is not null)
        {
            requisicao.Content = JsonContent.Create(corpo);

            // Como um navegador (fetch com JSON): envia o Content-Length. Sem isto o TestServer manda o corpo em fluxo, sem tamanho.
            await requisicao.Content.LoadIntoBufferAsync();
            _ = requisicao.Content.Headers.ContentLength;
        }

        using var resposta = await Navegador.SendAsync(requisicao, TestContext.Current.CancellationToken);
        return await RespostaJson.LerAsync(resposta);
    }

    public async Task<RespostaJson> LerAsync(string url)
    {
        using var resposta = await Navegador.GetAsync(url, TestContext.Current.CancellationToken);
        return await RespostaJson.LerAsync(resposta);
    }

    /// <summary>GET que devolve os bytes crus (o BOM do CSV não pode ser perdido pela decodificação) e os cabeçalhos.</summary>
    public async Task<(HttpStatusCode Status, byte[] Bytes, IReadOnlyDictionary<string, string> Cabecalhos)> LerBytesAsync(string url)
    {
        using var resposta = await Navegador.GetAsync(url, TestContext.Current.CancellationToken);
        var bytes = await resposta.Content.ReadAsByteArrayAsync(TestContext.Current.CancellationToken);
        var cabecalhos = resposta.Headers.Concat(resposta.Content.Headers)
            .ToDictionary(h => h.Key, h => string.Join(',', h.Value), StringComparer.OrdinalIgnoreCase);
        return (resposta.StatusCode, bytes, cabecalhos);
    }

    /// <summary>Cria uma obra pela API (POST) e devolve a resposta; falha o teste se não for 201.</summary>
    public async Task<RespostaJson> CriarObraAsync(object? corpo = null)
    {
        var resposta = await EscreverAsync(HttpMethod.Post, "/api/v1/obras", corpo ?? CorpoValido());
        Assert.Equal(HttpStatusCode.Created, resposta.Status);
        return resposta;
    }

    /// <summary>Corpo válido e fictício de criação (município 2699999 de PE). Nome único por chamada, salvo se informado.</summary>
    public static Dictionary<string, object?> CorpoValido(string? nome = null) => new()
    {
        ["nome"] = nome ?? "Obra Ficticia " + Guid.NewGuid().ToString("N")[..10],
        ["uf"] = "PE",
        ["municipioIbge"] = "2699999",
    };

    /// <summary>Corpo válido de substituição (PUT), com a versão lida.</summary>
    public static Dictionary<string, object?> CorpoDeAtualizacao(long versao, string? nome = null)
    {
        var corpo = CorpoValido(nome);
        corpo["versao"] = versao;
        return corpo;
    }

    public async ValueTask DisposeAsync()
    {
        Navegador.Dispose();
        await _fabrica.DisposeAsync();
        _idp.Dispose();
    }

    #endregion

    #region Tipos auxiliares

    /// <summary>Resposta já lida: status, corpo JSON (se houver) e texto.</summary>
    public sealed record RespostaJson(HttpStatusCode Status, JsonElement Corpo, string Texto, IReadOnlyDictionary<string, string> Cabecalhos)
    {
        public static async Task<RespostaJson> LerAsync(HttpResponseMessage resposta)
        {
            var texto = await resposta.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
            var corpo = default(JsonElement);
            if (texto.Length > 0 && resposta.Content.Headers.ContentType?.MediaType is "application/json" or "application/problem+json")
            {
                corpo = JsonDocument.Parse(texto).RootElement.Clone();
            }

            var cabecalhos = resposta.Headers.Concat(resposta.Content.Headers)
                .ToDictionary(h => h.Key, h => string.Join(',', h.Value), StringComparer.OrdinalIgnoreCase);
            return new RespostaJson(resposta.StatusCode, corpo, texto, cabecalhos);
        }

        /// <summary>Corpo sem <c>traceId</c> (que muda a cada requisição), ordenado: para comparar dois ProblemDetails.</summary>
        public string CorpoSemTraceId()
        {
            var json = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(Texto)!;
            json.Remove("traceId");
            return JsonSerializer.Serialize(json.OrderBy(p => p.Key, StringComparer.Ordinal).ToDictionary(p => p.Key, p => p.Value));
        }

        public Guid Id => Corpo.GetProperty("id").GetGuid();

        public long Versao => Corpo.GetProperty("versao").GetInt64();
    }

    #endregion
}
