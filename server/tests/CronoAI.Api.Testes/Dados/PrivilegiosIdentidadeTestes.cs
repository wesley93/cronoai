using CronoAI.Api.Testes.Infra;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Privilégios do <c>cronoai_app</c> por tabela (<c>has_table_privilege</c>) e acesso ao histórico de migrações.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PrivilegiosIdentidadeTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public PrivilegiosIdentidadeTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Theory]
    [InlineData("usuario", "SELECT", true)]
    [InlineData("usuario", "INSERT", true)]
    [InlineData("usuario", "UPDATE", true)]
    [InlineData("usuario", "DELETE", false)]
    [InlineData("empresa", "SELECT", true)]
    [InlineData("empresa", "INSERT", true)]
    [InlineData("empresa", "UPDATE", false)]
    [InlineData("empresa", "DELETE", false)]
    [InlineData("membro_empresa", "SELECT", true)]
    [InlineData("membro_empresa", "INSERT", true)]
    [InlineData("membro_empresa", "UPDATE", false)]
    [InlineData("membro_empresa", "DELETE", false)]
    [InlineData("sessao", "SELECT", true)]
    [InlineData("sessao", "INSERT", true)]
    [InlineData("sessao", "UPDATE", true)]
    [InlineData("sessao", "DELETE", true)]
    public async Task Privilegios_da_aplicacao_por_tabela(string tabela, string privilegio, bool esperado)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT has_table_privilege('cronoai_app', @tabela, @privilegio)", conexao);
        comando.Parameters.AddWithValue("tabela", "cronoai." + tabela);
        comando.Parameters.AddWithValue("privilegio", privilegio);

        var tem = (bool)(await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;

        Assert.Equal(esperado, tem);
    }

    [Fact]
    public async Task Aplicacao_nao_acessa_historico_de_migracoes()
    {
        // O histórico nasce antes dos privilégios padrão do Inicial: o app não pode lê-lo.
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT count(*) FROM cronoai.__ef_migrations_history", conexao);

        var erro = await Assert.ThrowsAsync<PostgresException>(() => comando.ExecuteScalarAsync(TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
    }

    #endregion
}
