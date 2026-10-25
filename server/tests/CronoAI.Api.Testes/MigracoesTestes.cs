using CronoAI.Api.Testes.Infra;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
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
    public async Task Migracoes_aplicam_e_reaplicam()
    {
        // O banco do contêiner nasceu limpo e a fixture migrou uma vez como cronoai_migrador.
        await using var contexto = _banco.CriarContextoMigrador();

        var aplicadas = (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).ToList();

        Assert.Equal(3, aplicadas.Count);
        Assert.EndsWith("_Inicial", aplicadas[0], StringComparison.Ordinal);
        Assert.EndsWith("_IdentidadeEmpresas", aplicadas[1], StringComparison.Ordinal);
        Assert.EndsWith("_ObrasAuditoria", aplicadas[2], StringComparison.Ordinal);

        // O 2º MigrateAsync não lança e não altera nada.
        await contexto.Database.MigrateAsync(TestContext.Current.CancellationToken);
        Assert.Equal(3, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
    }

    [Fact]
    public async Task Migracao_ObrasAuditoria_down_remove_tudo_e_reaplica()
    {
        // Desfaz a 3ª migração e a refaz, como o migrador. O Down não pode deixar tabela nem função para trás. Termina com o
        // banco como estava (reaplicado e com o seed fictício da fixture): os outros testes da coleção não notam.
        await using var contexto = _banco.CriarContextoMigrador();
        var migrador = contexto.GetService<IMigrator>();
        var aplicadas = (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).ToList();
        Assert.Equal(3, aplicadas.Count);
        try
        {
            await migrador.MigrateAsync(aplicadas[1], TestContext.Current.CancellationToken);

            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relname IN ('obra', 'auditoria', 'uf_referencia', 'municipio_referencia')"));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'cronoai' AND p.proname IN ('obra_incrementa_versao', 'auditoria_recusa_alteracao')"));
            Assert.Equal(2, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
        }
        finally
        {
            await migrador.MigrateAsync(cancellationToken: CancellationToken.None);
            await _banco.SemearMunicipioFicticioAsync();
        }

        Assert.Equal(3, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
        Assert.Equal("27", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM cronoai.uf_referencia"));
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
