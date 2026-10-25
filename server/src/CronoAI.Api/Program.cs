using CronoAI.Api;
using CronoAI.Dados;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Logs estruturados em JSON; nunca corpo/cabeçalhos de requisição nem string de conexão (RF-12.9).
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();

// Sem o cabeçalho "Server": não anuncia a tecnologia.
builder.WebHost.ConfigureKestrel(kestrel => kestrel.AddServerHeader = false);

builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

// A API conecta como cronoai_app (só DML). A senha vem de user-secrets/variável de ambiente, nunca do appsettings.
// AddDbContext (e não pool): os ciclos seguintes terão filtro por empresa dependente da requisição.
builder.Services.AddDbContext<CronoDbContext>((servicos, opcoes) =>
{
    var ambiente = servicos.GetRequiredService<IHostEnvironment>();
    var configuracao = servicos.GetRequiredService<IConfiguration>();
    var stringConexao = configuracao.GetConnectionString("Cronoai");
    if (string.IsNullOrWhiteSpace(stringConexao))
    {
        throw new InvalidOperationException("ConnectionStrings:Cronoai não configurada (veja server/README.md).");
    }

    // A mensagem de erro do PostgreSQL pode trazer valores de linha: detalhe só em Development.
    var montador = new NpgsqlConnectionStringBuilder(stringConexao) { IncludeErrorDetail = ambiente.IsDevelopment() };
    CronoDbContextConfiguracao.Configurar(opcoes, montador.ConnectionString);
});

// Vivo = só o processo (sem dependências); pronto = inclui o banco. Corpo apenas "Healthy"/"Unhealthy".
const string TagPronto = "ready";
builder.Services.AddHealthChecks()
    .AddDbContextCheck<CronoDbContext>(tags: [TagPronto]);

var app = builder.Build();

app.UseMiddleware<CabecalhosSegurancaMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false })
    .ExcludeFromDescription();
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = registro => registro.Tags.Contains(TagPronto),
    ResultStatusCodes =
    {
        [HealthStatus.Healthy] = StatusCodes.Status200OK,
        [HealthStatus.Degraded] = StatusCodes.Status200OK,
        [HealthStatus.Unhealthy] = StatusCodes.Status503ServiceUnavailable,
    },
}).ExcludeFromDescription();

// Mapa da API exposto só em desenvolvimento.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// Grupo versionado: os endpoints de negócio começam no ciclo 00012.
app.MapGroup("/api/v1");

app.Run();

/// <summary>Marcador para o <c>WebApplicationFactory</c> dos testes de integração.</summary>
public partial class Program;
