using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
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

        Assert.Equal(4, aplicadas.Count);
        Assert.EndsWith("_Inicial", aplicadas[0], StringComparison.Ordinal);
        Assert.EndsWith("_IdentidadeEmpresas", aplicadas[1], StringComparison.Ordinal);
        Assert.EndsWith("_ObrasAuditoria", aplicadas[2], StringComparison.Ordinal);
        Assert.EndsWith("_PerfisPermissoes", aplicadas[3], StringComparison.Ordinal);

        // O 2º MigrateAsync não lança e não altera nada.
        await contexto.Database.MigrateAsync(TestContext.Current.CancellationToken);
        Assert.Equal(4, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
    }

    [Fact]
    public async Task Migracao_ObrasAuditoria_down_remove_tudo_e_reaplica()
    {
        // Desfaz as duas últimas migrações (PerfisPermissoes e ObrasAuditoria) e as refaz, como o migrador, num banco ISOLADO:
        // a trilha append-only e os dados dos demais testes da coleção não podem ser tocados. O Down não pode deixar tabela nem
        // função para trás.
        var nome = "iso_" + Guid.NewGuid().ToString("N")[..10];
        var (migrador, _) = await _banco.CriarBancoIsoladoAsync(nome);
        try
        {
            await using var contexto = ContextoMigradorDe(migrador);
            var executor = contexto.GetService<IMigrator>();
            await executor.MigrateAsync(cancellationToken: TestContext.Current.CancellationToken);
            var aplicadas = (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).ToList();
            Assert.Equal(4, aplicadas.Count);

            await executor.MigrateAsync(aplicadas[1], TestContext.Current.CancellationToken);

            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relname IN ('obra', 'auditoria', 'uf_referencia', 'municipio_referencia', 'acesso_obra', 'frente', 'carteira')", nome));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync(
                "SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'cronoai' AND p.proname IN ('obra_incrementa_versao', 'auditoria_recusa_alteracao', 'incrementa_versao', 'membro_exige_administrador', 'membro_garante_administrador')", nome));
            Assert.Equal(2, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());

            await executor.MigrateAsync(cancellationToken: TestContext.Current.CancellationToken);
            Assert.Equal(4, (await contexto.Database.GetAppliedMigrationsAsync(TestContext.Current.CancellationToken)).Count());
            Assert.Equal("27", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM cronoai.uf_referencia", nome));
        }
        finally
        {
            await _banco.DescartarBancoIsoladoAsync(nome);
        }
    }

    [Fact]
    public async Task Migracao_PerfisPermissoes_up_down_up()
    {
        // T34. Banco isolado com membros ANTES da migração: o backfill (Q10) os torna administradores de escopo "todas"; o Down
        // devolve o pg_policies IDÊNTICO ao do ciclo 00013 (capturado do banco real, não escrito à mão), devolve o INSERT ao app e
        // remove tabelas e colunas; o Up de novo passa e o modelo não tem mudança pendente.
        var nome = "iso_" + Guid.NewGuid().ToString("N")[..10];
        var (migrador, _) = await _banco.CriarBancoIsoladoAsync(nome);
        try
        {
            await using var contexto = ContextoMigradorDe(migrador);
            var executor = contexto.GetService<IMigrator>();
            var todas = contexto.Database.GetMigrations().ToList();
            var anterior = todas[2];
            Assert.EndsWith("_ObrasAuditoria", anterior, StringComparison.Ordinal);
            await executor.MigrateAsync(anterior, TestContext.Current.CancellationToken);

            var empresa1 = Guid.CreateVersion7();
            var empresa2 = Guid.CreateVersion7();
            var (u1, u2, u3) = (Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7());
            var agora = DateTime.UtcNow.ToString("O", System.Globalization.CultureInfo.InvariantCulture);
            await _banco.ProduzirEstadoComoSuperusuarioAsync(
                $"INSERT INTO cronoai.usuario (id, emissor, sujeito, criado_em, ultimo_acesso_em) VALUES ('{u1}', 'https://idp.teste', 's1-{u1:N}', '{agora}', '{agora}'), ('{u2}', 'https://idp.teste', 's2-{u2:N}', '{agora}', '{agora}'), ('{u3}', 'https://idp.teste', 's3-{u3:N}', '{agora}', '{agora}'); "
                + $"INSERT INTO cronoai.empresa (id, nome, criada_em) VALUES ('{empresa1}', 'Empresa Ficticia 1', '{agora}'), ('{empresa2}', 'Empresa Ficticia 2', '{agora}'); "
                + $"INSERT INTO cronoai.membro_empresa (empresa_id, usuario_id, criado_em) VALUES ('{empresa1}', '{u1}', '{agora}'), ('{empresa1}', '{u2}', '{agora}'), ('{empresa2}', '{u3}', '{agora}')",
                nome);
            var politicasAntes = await ListarPoliticasAsync(nome);
            Assert.NotEmpty(politicasAntes);

            // (boot) Controle: sem o backfill o NOT NULL falha (prova que o backfill é necessário).
            var (codigoSemBackfill, _, erroSemBackfill) = await _banco.ExecutarScriptComoSuperusuarioAsync(
                "BEGIN; ALTER TABLE cronoai.membro_empresa ADD COLUMN perfil text; ALTER TABLE cronoai.membro_empresa ALTER COLUMN perfil SET NOT NULL; ROLLBACK;",
                nome);
            Assert.NotEqual(0, codigoSemBackfill);
            Assert.Contains("23502", erroSemBackfill, StringComparison.Ordinal);

            await executor.MigrateAsync(todas[3], TestContext.Current.CancellationToken);

            Assert.Equal("3", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM cronoai.membro_empresa WHERE perfil = 'administrador' AND escopo_obras = 'todas' AND atualizado_em = criado_em AND removido_em IS NULL", nome));
            Assert.Equal("f", await _banco.ConsultarComoSuperusuarioAsync("SELECT has_table_privilege('cronoai_app', 'cronoai.membro_empresa', 'INSERT')", nome));

            await executor.MigrateAsync(anterior, TestContext.Current.CancellationToken);

            Assert.Equal(politicasAntes, await ListarPoliticasAsync(nome));
            Assert.Equal("t", await _banco.ConsultarComoSuperusuarioAsync("SELECT has_table_privilege('cronoai_app', 'cronoai.membro_empresa', 'INSERT')", nome));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM information_schema.columns WHERE table_schema = 'cronoai' AND table_name = 'membro_empresa' AND column_name IN ('perfil', 'escopo_obras', 'removido_em', 'atualizado_em')", nome));
            Assert.Equal("0", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relname IN ('acesso_obra', 'frente', 'acesso_frente', 'carteira', 'carteira_obra', 'acesso_carteira')", nome));
            Assert.DoesNotContain("remover", await _banco.ConsultarComoSuperusuarioAsync("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ck_auditoria_acao'", nome), StringComparison.Ordinal);

            await executor.MigrateAsync(todas[3], TestContext.Current.CancellationToken);

            Assert.Equal("3", await _banco.ConsultarComoSuperusuarioAsync("SELECT count(*) FROM cronoai.membro_empresa WHERE perfil = 'administrador'", nome));
            Assert.False(contexto.Database.HasPendingModelChanges());
        }
        finally
        {
            await _banco.DescartarBancoIsoladoAsync(nome);
        }
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

    #region Métodos privados

    private static CronoDbContext ContextoMigradorDe(string stringConexao)
    {
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, stringConexao);
        return new CronoDbContext(opcoes.Options, ContextoSessaoBanco.Vazio);
    }

    // Todas as políticas (tabela, comando, nome, USING e WITH CHECK normalizados), ordenadas, do banco isolado.
    private async Task<List<string>> ListarPoliticasAsync(string banco)
    {
        var saida = await _banco.ConsultarComoSuperusuarioAsync(
            @"SELECT tablename || '|' || cmd || '|' || policyname || '|' ||
                     regexp_replace(coalesce(qual, '<nulo>'), '[[:space:]]+', ' ', 'g') || '|' ||
                     regexp_replace(coalesce(with_check, '<nulo>'), '[[:space:]]+', ' ', 'g')
                FROM pg_policies WHERE schemaname = 'cronoai' ORDER BY 1",
            banco);
        return saida.Split('\n', StringSplitOptions.RemoveEmptyEntries).ToList();
    }

    #endregion
}
