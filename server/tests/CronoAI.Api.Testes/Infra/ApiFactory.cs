using CronoAI.Api.Testes.Infra.IdpTeste;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Host da API para testes. Recebe a string de conexão do papel <c>cronoai_app</c> (nunca a do superusuário ou do
/// migrador) e o ambiente (<c>Development</c>/<c>Production</c>). Base <c>https://localhost</c> (o cookie
/// <c>__Host-</c> é <c>Secure</c>), anel do Data Protection em pasta temporária e, se houver <see cref="Idp"/>,
/// OIDC apontado ao emissor em memória. Valores lidos na montagem do Program (OIDC, anel, flags) entram por
/// <c>UseSetting</c>, não por <c>ConfigureAppConfiguration</c> (que chega tarde demais).
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    #region Campos

    /// <summary>Porta fechada: simula banco indisponível sem depender de Docker.</summary>
    public const string ConexaoSemBanco = "Host=127.0.0.1;Port=1;Database=inexistente;Username=cronoai_app;Timeout=2";

    private readonly string _stringConexao;
    private readonly string _ambiente;
    private readonly Action<IServiceCollection>? _configurarServicos;
    private readonly string _pastaAnel = Path.Combine(Path.GetTempPath(), "cronoai-anel-" + Guid.NewGuid().ToString("N"));

    #endregion

    #region Construtor

    public ApiFactory(string stringConexao, string ambiente = "Production", Action<IServiceCollection>? configurarServicos = null)
    {
        _stringConexao = stringConexao;
        _ambiente = ambiente;
        _configurarServicos = configurarServicos;
        ClientOptions.BaseAddress = new Uri("https://localhost");
        ClientOptions.AllowAutoRedirect = false;
        ClientOptions.HandleCookies = true;
    }

    #endregion

    #region Propriedades

    /// <summary>Emissor OIDC em memória; sem ele, o esquema OIDC não é registrado.</summary>
    public IdpEmMemoria? Idp { get; init; }

    /// <summary>Relógio do teste; sem ele, o relógio do sistema.</summary>
    public RelogioTeste? Relogio { get; init; }

    /// <summary>Provedor de log em memória.</summary>
    public LogsEmMemoria? Logs { get; init; }

    /// <summary>Não configura <c>DataProtection:CaminhoAnel</c> (para provar a falha fechada fora de Development).</summary>
    public bool SemAnelDeChaves { get; init; }

    /// <summary>Configurações adicionais (chave com ":") aplicadas por <c>UseSetting</c>; sobrescrevem as padrão.</summary>
    public IDictionary<string, string?> Configuracoes { get; } = new Dictionary<string, string?>();

    /// <summary>Pasta do anel de chaves deste host (para outro host decifrar o mesmo cookie).</summary>
    public string PastaAnel => _pastaAnel;

    #endregion

    #region Métodos públicos

    /// <summary>Cliente HTTPS sem redirecionamento automático e com cookies (um "navegador").</summary>
    public HttpClient CriarNavegador() => CreateClient();

    #endregion

    #region Métodos protegidos

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_ambiente);

        var configuracoes = new Dictionary<string, string?>
        {
            ["ConnectionStrings:Cronoai"] = _stringConexao,
            // Limites altos por padrão: cada teste cria o próprio host. Testes de taxa sobrescrevem.
            ["Borda:LimiteAutenticacaoPorMinuto"] = "1000",
            ["Borda:LimiteSaudePorMinuto"] = "1000",
        };
        if (!SemAnelDeChaves)
        {
            configuracoes["DataProtection:CaminhoAnel"] = _pastaAnel;
        }

        if (Idp is not null)
        {
            configuracoes["Autenticacao:Oidc:Autoridade"] = Idp.Emissor;
            configuracoes["Autenticacao:Oidc:IdCliente"] = Idp.IdCliente;
            configuracoes["Autenticacao:Oidc:SegredoCliente"] = Idp.SegredoCliente;
        }

        foreach (var (chave, valor) in Configuracoes)
        {
            configuracoes[chave] = valor;
        }

        foreach (var (chave, valor) in configuracoes)
        {
            builder.UseSetting(chave, valor);
        }

        builder.ConfigureTestServices(servicos =>
        {
            if (Relogio is not null)
            {
                servicos.AddSingleton<TimeProvider>(Relogio);
            }

            if (Logs is not null)
            {
                servicos.AddSingleton<ILoggerProvider>(Logs);
            }

            if (Idp is not null)
            {
                // Configure (não PostConfigure): o PostConfigure da biblioteca cria o Backchannel a partir deste handler.
                servicos.Configure<OpenIdConnectOptions>("oidc", opcoes => opcoes.BackchannelHttpHandler = Idp);
            }

            _configurarServicos?.Invoke(servicos);
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing && Directory.Exists(_pastaAnel))
        {
            try
            {
                Directory.Delete(_pastaAnel, recursive: true);
            }
            catch (IOException)
            {
                // Pasta temporária de teste: se ainda estiver em uso, o sistema limpa depois.
            }
        }
    }

    #endregion
}
