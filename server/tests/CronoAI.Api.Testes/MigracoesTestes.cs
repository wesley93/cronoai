using CronoAI.Api.Testes.Infra;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes;

[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class MigracoesTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public MigracoesTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Migracao_IdentidadeEmpresas_aplica_e_reaplica()
    {
        // O banco do contêiner nasceu limpo e a fixture migrou uma vez como cronoai_migrador.
        await using var contexto = _banco.CriarContextoMigrador();

        var aplicadas = (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).ToList();

        Assert.Equal(2, aplicadas.Count);
        Assert.EndsWith("_Inicial", aplicadas[0], StringComparison.Ordinal);
        Assert.EndsWith("_IdentidadeEmpresas", aplicadas[1], StringComparison.Ordinal);

        // O 2º MigrateAsync não lança e não altera nada.
        await contexto.Database.MigrateAsync(TestContext.Current.CancellationToken);
        Assert.Equal(2, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
    }

    [Fact]
    public void Modelo_sem_mudanca_pendente()
    {
        using var contexto = _banco.CriarContextoMigrador();

        Assert.False(contexto.Database.HasPendingModelChanges());
    }

    [Fact]
    public async Task Historico_de_migracoes_no_schema_cronoai()
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand(
            "SELECT to_regclass('cronoai.__ef_migrations_history') IS NOT NULL, to_regclass('public.\"__EFMigrationsHistory\"') IS NULL",
            conexao);

        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await leitor.ReadAsync(TestContext.Current.CancellationToken));

        Assert.True(leitor.GetBoolean(0), "histórico deveria estar em cronoai.__ef_migrations_history");
        Assert.True(leitor.GetBoolean(1), "não deve existir public.\"__EFMigrationsHistory\"");
    }

    #endregion
}
