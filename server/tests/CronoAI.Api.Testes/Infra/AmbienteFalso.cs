using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;

namespace CronoAI.Api.Testes.Infra;

/// <summary>Ambiente de hospedagem de mentira, para exercitar guardas que dependem de <c>IsDevelopment()</c> sem subir o host.</summary>
public sealed class AmbienteFalso : IHostEnvironment
{
    #region Construtor

    public AmbienteFalso(string nome)
    {
        EnvironmentName = nome;
    }

    #endregion

    #region Propriedades

    public string EnvironmentName { get; set; }

    public string ApplicationName { get; set; } = "CronoAI.Api.Testes";

    public string ContentRootPath { get; set; } = AppContext.BaseDirectory;

    public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();

    #endregion
}
