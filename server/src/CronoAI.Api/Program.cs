using CronoAI.Api;
using CronoAI.Api.Autenticacao;
using CronoAI.Api.Borda;
using CronoAI.Api.Desenvolvimento;
using CronoAI.Api.Empresas;
using CronoAI.Api.Sessao;
using CronoAI.Dados;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
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
// Fábrica singleton: cada DbContext nasce com um contexto de banco imutável (o scoped dos endpoints sai da sessão).
builder.Services.AddSingleton<IFabricaCronoDbContext>(servicos =>
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
    return new FabricaCronoDbContext(montador.ConnectionString);
});

builder.AdicionarBorda();
builder.AdicionarAutenticacao();

// Usuário de desenvolvimento: falha fechada na partida fora de Development (ValidateOnStart).
builder.Services.AddSingleton<IValidateOptions<OpcoesUsuarioDesenvolvimento>, ValidadorOpcoesUsuarioDesenvolvimento>();
builder.Services.AddOptions<OpcoesUsuarioDesenvolvimento>()
    .Bind(builder.Configuration.GetSection(OpcoesUsuarioDesenvolvimento.Secao))
    .ValidateOnStart();
builder.Services.AddSingleton<SementeDesenvolvimento>();

// Vivo = só o processo (sem dependências); pronto = inclui o banco. Corpo apenas "Healthy"/"Unhealthy".
const string TagPronto = "ready";
builder.Services.AddHealthChecks()
    .AddDbContextCheck<CronoDbContext>(tags: [TagPronto]);

var app = builder.Build();

// Comando de semente: só em Development, como cronoai_app; não sobe o servidor.
if (args.Length > 0 && args[0] == "semear-desenvolvimento")
{
    await app.Services.GetRequiredService<SementeDesenvolvimento>().ExecutarAsync();
    return;
}

// Ordem preservada: cabeçalhos de segurança primeiro (também em 302, 401, 403 e 429), depois erros.
app.UseMiddleware<CabecalhosSegurancaMiddleware>();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseRouting();
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
// ATENÇÃO: nada de middleware terminal (Run/Map de ramo) depois daqui. O tratador de resultado da autorização deixa
// passar a requisição SEM endpoint (rota inexistente) para o 404; um terminal depois de UseAuthorization a serviria
// sem autenticação (ADR 00006). Rota nova = endpoint, com cenário no catálogo de isolamento.

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false })
    .AllowAnonymous()
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
})
    .AllowAnonymous()
    .RequireRateLimiting(BordaExtensoes.PoliticaSaude)
    .ExcludeFromDescription();

// Mapa da API exposto só em desenvolvimento.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

// Grupo versionado. Fallback de autorização = autenticado; antiforgery em toda escrita do grupo.
var api = app.MapGroup("/api/v1").AddEndpointFilter<FiltroAntiforgery>();
api.MapearAutenticacao();
api.MapearEu();
api.MapearEmpresas();
app.MapearDesenvolvimento();

app.Run();

/// <summary>Marcador para o <c>WebApplicationFactory</c> dos testes de integração.</summary>
public partial class Program;
