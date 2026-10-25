using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Host da API para testes. Recebe a string de conexão do papel <c>cronoai_app</c> (nunca a do
/// superusuário ou do migrador) e o ambiente (<c>Development</c>/<c>Production</c>).
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    #region Campos

    /// <summary>Porta fechada: simula banco indisponível sem depender de Docker.</summary>
    public const string ConexaoSemBanco = "Host=127.0.0.1;Port=1;Database=inexistente;Username=cronoai_app;Timeout=2";

    private readonly string _stringConexao;
    private readonly string _ambiente;
    private readonly Action<IServiceCollection>? _configurarServicos;

    #endregion

    #region Construtor

    public ApiFactory(string stringConexao, string ambiente = "Production", Action<IServiceCollection>? configurarServicos = null)
    {
        _stringConexao = stringConexao;
        _ambiente = ambiente;
        _configurarServicos = configurarServicos;
    }

    #endregion

    #region Métodos protegidos

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment(_ambiente);
        builder.ConfigureAppConfiguration((_, configuracao) =>
            configuracao.AddInMemoryCollection(new Dictionary<string, string?> { ["ConnectionStrings:Cronoai"] = _stringConexao }));
        if (_configurarServicos is not null)
        {
            builder.ConfigureServices(_configurarServicos);
        }
    }

    #endregion
}
