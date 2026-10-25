using CronoAI.Api.Testes.Infra;
using CronoAI.Dados.Rls;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Helper de migração de dados sob FORCE, executado como o migrador (dono): NO FORCE → DML → FORCE na transação.
/// Usa uma tabela de teste própria (criada e removida no teste), nunca as do domínio.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class MigracaoDeDadosRlsTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public MigracaoDeDadosRlsTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Helper_de_migracao_de_dados_afeta_as_linhas_e_reativa_o_force()
    {
        var tabela = "t_rls_" + Guid.NewGuid().ToString("N")[..12];
        await using var conexao = await PrepararTabelaAsync(tabela);
        try
        {
            // Sem o helper, o dono vê zero linhas: o UPDATE afeta 0 sem erro (o perigo que o helper evita).
            Assert.Equal(0, await ExecutarAsync(conexao, $"UPDATE cronoai.{tabela} SET valor = 2 WHERE id = 1"));

            await using var transacao = await conexao.BeginTransactionAsync(TestContext.Current.CancellationToken);
            var sqls = MigracaoDeDadosRls.GerarSql(tabela, $"UPDATE cronoai.{tabela} SET valor = 2 WHERE id = 1");
            Assert.Equal(3, sqls.Count);
            await ExecutarAsync(conexao, sqls[0], transacao);
            var afetadas = await ExecutarAsync(conexao, sqls[1], transacao);
            await ExecutarAsync(conexao, sqls[2], transacao);
            await transacao.CommitAsync(TestContext.Current.CancellationToken);

            Assert.Equal(1, afetadas);
            Assert.True(await ForcadoAsync(conexao, tabela));
        }
        finally
        {
            await ExecutarAsync(conexao, $"DROP TABLE cronoai.{tabela}");
        }
    }

    [Fact]
    public async Task Helper_de_migracao_de_dados_com_erro_desfaz_e_mantem_o_force()
    {
        var tabela = "t_rls_" + Guid.NewGuid().ToString("N")[..12];
        await using var conexao = await PrepararTabelaAsync(tabela);
        try
        {
            await using var transacao = await conexao.BeginTransactionAsync(TestContext.Current.CancellationToken);
            var sqls = MigracaoDeDadosRls.GerarSql(tabela, $"UPDATE cronoai.{tabela} SET coluna_inexistente = 2");
            await ExecutarAsync(conexao, sqls[0], transacao);
            await Assert.ThrowsAsync<PostgresException>(() => ExecutarAsync(conexao, sqls[1], transacao));
            await transacao.RollbackAsync(TestContext.Current.CancellationToken);

            // O NO FORCE também foi desfeito: a DDL é transacional.
            Assert.True(await ForcadoAsync(conexao, tabela));
        }
        finally
        {
            await ExecutarAsync(conexao, $"DROP TABLE cronoai.{tabela}");
        }
    }

    #endregion

    #region Métodos privados

    // Tabela com 1 linha (inserida antes do RLS) e RLS forçado, como as de domínio.
    private async Task<NpgsqlConnection> PrepararTabelaAsync(string tabela)
    {
        var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await ExecutarAsync(conexao, $"CREATE TABLE cronoai.{tabela} (id int PRIMARY KEY, valor int NOT NULL)");
        await ExecutarAsync(conexao, $"INSERT INTO cronoai.{tabela} VALUES (1, 1)");
        await ExecutarAsync(conexao, $"ALTER TABLE cronoai.{tabela} ENABLE ROW LEVEL SECURITY");
        await ExecutarAsync(conexao, $"ALTER TABLE cronoai.{tabela} FORCE ROW LEVEL SECURITY");
        return conexao;
    }

    private static async Task<int> ExecutarAsync(NpgsqlConnection conexao, string sql, NpgsqlTransaction? transacao = null)
    {
        await using var comando = new NpgsqlCommand(sql, conexao, transacao);
        return await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private static async Task<bool> ForcadoAsync(NpgsqlConnection conexao, string tabela)
    {
        await using var comando = new NpgsqlCommand("SELECT relforcerowsecurity FROM pg_class WHERE oid = @oid::regclass", conexao);
        comando.Parameters.AddWithValue("oid", "cronoai." + tabela);
        return (bool)(await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

    #endregion
}
