using System.Security.Cryptography;
using CronoAI.Dados;
using Docker.DotNet.Models;
using DotNet.Testcontainers.Configurations;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using Testcontainers.PostgreSql;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// PostgreSQL descartável para os testes de integração (Testcontainers). Usuário, senha e banco do
/// superusuário e as senhas dos dois papéis são aleatórios por execução (o padrão da biblioteca é fixo).
/// Roda o MESMO bootstrap do compose como superusuário, migra uma vez como <c>cronoai_migrador</c> e
/// entrega só as strings do migrador e do app. A conexão de superusuário não sai desta classe.
/// </summary>
public sealed class BancoPostgresFixture : IAsyncLifetime
{
    #region Campos

    // Mesma referência (tag + digest) do docker-compose.yml.
    public const string Imagem = "postgres:17@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe";

    // Mesmos argumentos de initdb do compose (UTF-8, ICU pt-BR, scram também no loopback).
    public const string ArgumentosInitdb = "--encoding=UTF8 --locale-provider=icu --icu-locale=pt-BR --locale=C.UTF-8 --auth-host=scram-sha-256";

    private const string CaminhoScriptNoContainer = "/tmp/01-papeis-e-schema.sh";

    private readonly string _usuarioSuper = "su_" + Aleatorio(6);
    private readonly string _senhaSuper = Aleatorio(18);
    private readonly string _bancoNome = "db_" + Aleatorio(6);
    private readonly string _senhaMigrador = Aleatorio(18);
    private readonly string _senhaApp = Aleatorio(18);
    private PostgreSqlContainer? _container;

    #endregion

    #region Propriedades

    /// <summary>String do papel <c>cronoai_app</c> (a mesma que a API usa).</summary>
    public string StringConexaoApp { get; private set; } = "";

    /// <summary>String do papel <c>cronoai_migrador</c> (dono do schema).</summary>
    public string StringConexaoMigrador { get; private set; } = "";

    /// <summary>Fábrica de contextos conectados como <c>cronoai_app</c> (o papel da API).</summary>
    public IFabricaCronoDbContext FabricaApp => new FabricaCronoDbContext(StringConexaoApp);

    /// <summary>Fábrica de contextos conectados como <c>cronoai_migrador</c> (dono; também sujeito ao RLS).</summary>
    public IFabricaCronoDbContext FabricaMigrador => new FabricaCronoDbContext(StringConexaoMigrador);

    #endregion

    #region Métodos públicos

    public async ValueTask InitializeAsync()
    {
        _container = new PostgreSqlBuilder(Imagem)
            .WithUsername(_usuarioSuper)
            .WithPassword(_senhaSuper)
            .WithDatabase(_bancoNome)
            .WithEnvironment("POSTGRES_INITDB_ARGS", ArgumentosInitdb)
            // Senhas dos papéis no ambiente do contêiner (e não na linha de comando do exec, que o Testcontainers loga).
            .WithEnvironment("CRONOAI_SENHA_MIGRADOR", _senhaMigrador)
            .WithEnvironment("CRONOAI_SENHA_APP", _senhaApp)
            .WithCommand("-c", "timezone=UTC", "-c", "log_statement=none")
            // Porta publicada só em 127.0.0.1 (o padrão do Testcontainers publica em todas as interfaces).
            .WithCreateParameterModifier(parametros =>
                parametros.HostConfig!.PortBindings = new Dictionary<string, IList<PortBinding>>
                {
                    ["5432/tcp"] = [new PortBinding { HostIP = "127.0.0.1", HostPort = "" }],
                })
            .Build();

        await _container.StartAsync();

        await ExecutarBootstrapAsync();

        StringConexaoMigrador = MontarStringConexao(PapeisBanco.Migrador, _senhaMigrador);
        StringConexaoApp = MontarStringConexao(PapeisBanco.Aplicacao, _senhaApp);

        // Migra uma vez por coleção, como o migrador (a API nunca migra na partida).
        await using var contexto = CriarContextoMigrador();
        await contexto.Database.MigrateAsync();
    }

    public async ValueTask DisposeAsync()
    {
        NpgsqlConnection.ClearAllPools();
        if (_container is not null)
        {
            await _container.DisposeAsync();
        }
    }

    /// <summary>
    /// Executa uma consulta como superusuário pelo socket local do contêiner (sem expor a conexão aos testes)
    /// e devolve a saída do psql (sem cabeçalho nem alinhamento).
    /// </summary>
    public async Task<string> ConsultarComoSuperusuarioAsync(string sql)
    {
        var resultado = await _container!.ExecAsync(
            ["psql", "-U", _usuarioSuper, "-d", _bancoNome, "-At", "-c", sql]);
        if (resultado.ExitCode != 0)
        {
            throw new InvalidOperationException($"psql falhou (código {resultado.ExitCode}): {Mascarar(resultado.Stderr)}");
        }

        return resultado.Stdout.Trim();
    }

    /// <summary>Cria um contexto do EF conectado como migrador (DDL).</summary>
    public CronoDbContext CriarContextoMigrador()
    {
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, StringConexaoMigrador);
        return new CronoDbContext(opcoes.Options, ContextoSessaoBanco.Vazio);
    }

    #endregion

    #region Métodos privados

    private async Task ExecutarBootstrapAsync()
    {
        var script = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "bootstrap", "01-papeis-e-schema.sh"));
        await _container!.CopyAsync(script, CaminhoScriptNoContainer, fileMode: UnixFileModes.UserRead | UnixFileModes.UserWrite | UnixFileModes.UserExecute);

        // POSTGRES_USER, POSTGRES_DB e as senhas dos papéis já estão no ambiente do contêiner.
        var resultado = await _container.ExecAsync(["bash", CaminhoScriptNoContainer]);
        if (resultado.ExitCode != 0)
        {
            throw new InvalidOperationException($"Bootstrap do banco falhou (código {resultado.ExitCode}): {Mascarar(resultado.Stderr)}");
        }
    }

    private string MontarStringConexao(string usuario, string senha)
    {
        return new NpgsqlConnectionStringBuilder
        {
            Host = "127.0.0.1",
            Port = _container!.GetMappedPublicPort(5432),
            Database = _bancoNome,
            Username = usuario,
            Password = senha,
            // TLS desligado só aqui: PostgreSQL descartável em 127.0.0.1, sem TLS. Em produção o TLS é da Infraestrutura.
            SslMode = SslMode.Disable,
            Timeout = 15,
            CommandTimeout = 30,
            MaxPoolSize = 20,
        }.ConnectionString;
    }

    // Credenciais são descartáveis, mas não vão para mensagens de erro de qualquer forma.
    private string Mascarar(string texto)
    {
        return texto
            .Replace(_senhaSuper, "***", StringComparison.Ordinal)
            .Replace(_senhaMigrador, "***", StringComparison.Ordinal)
            .Replace(_senhaApp, "***", StringComparison.Ordinal);
    }

    private static string Aleatorio(int bytes)
    {
        return Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(bytes));
    }

    #endregion
}
