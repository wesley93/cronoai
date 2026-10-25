using CronoAI.Api.Testes.Infra;
using Npgsql;

namespace CronoAI.Api.Testes;

/// <summary>
/// Prova o menor privilégio do papel da aplicação. Todas as consultas "como app" usam a string do
/// cronoai_app; o superusuário nunca aparece (testes de segurança conectados como superusuário
/// passariam por engano).
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PapeisBancoTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public PapeisBancoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Papel_da_aplicacao_nao_e_superusuario_nem_bypassrls()
    {
        await using var conexao = await AbrirAsync(_banco.StringConexaoApp);
        await using var comando = new NpgsqlCommand(
            "SELECT current_user, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user",
            conexao);

        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await leitor.ReadAsync(TestContext.Current.CancellationToken));

        Assert.Equal("cronoai_app", leitor.GetString(0));
        Assert.False(leitor.GetBoolean(1), "rolsuper");
        Assert.False(leitor.GetBoolean(2), "rolbypassrls");
        Assert.False(leitor.GetBoolean(3), "rolcreatedb");
        Assert.False(leitor.GetBoolean(4), "rolcreaterole");
    }

    [Theory]
    [InlineData("CREATE TABLE cronoai.t_x(id int)")]
    [InlineData("CREATE TABLE public.t_x(id int)")]
    public async Task Papel_da_aplicacao_nao_cria_objeto(string ddl)
    {
        await using var conexao = await AbrirAsync(_banco.StringConexaoApp);
        await using var comando = new NpgsqlCommand(ddl, conexao);

        var erro = await Assert.ThrowsAsync<PostgresException>(() => comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    [Fact]
    public async Task Privilegios_padrao_dao_DML_ao_app_em_tabela_nova_do_migrador()
    {
        // Não dá para provar com transação revertida: o app (outra sessão) não enxerga tabela não confirmada.
        // A tabela é criada e confirmada pelo migrador e removida no finally.
        var tabela = "cronoai.t_priv_" + Guid.NewGuid().ToString("N");
        await using var migrador = await AbrirAsync(_banco.StringConexaoMigrador);
        await Executar(migrador, $"CREATE TABLE {tabela}(id int)");
        try
        {
            await using var app = await AbrirAsync(_banco.StringConexaoApp);
            await Executar(app, $"INSERT INTO {tabela}(id) VALUES (1)");
            await Executar(app, $"UPDATE {tabela} SET id = 2");
            await using (var selecao = new NpgsqlCommand($"SELECT id FROM {tabela}", app))
            {
                Assert.Equal(2, await selecao.ExecuteScalarAsync(TestContext.Current.CancellationToken));
            }

            await Executar(app, $"DELETE FROM {tabela}");
        }
        finally
        {
            await Executar(migrador, $"DROP TABLE {tabela}");
        }
    }

    [Fact]
    public async Task Sessao_da_aplicacao_usa_search_path_cronoai()
    {
        await using var conexao = await AbrirAsync(_banco.StringConexaoApp);
        await using var comando = new NpgsqlCommand("SHOW search_path", conexao);

        Assert.Equal("cronoai", await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken));
    }

    #endregion

    #region Métodos privados

    private static async Task<NpgsqlConnection> AbrirAsync(string stringConexao)
    {
        var conexao = new NpgsqlConnection(stringConexao);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        return conexao;
    }

    private static async Task Executar(NpgsqlConnection conexao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    #endregion
}
