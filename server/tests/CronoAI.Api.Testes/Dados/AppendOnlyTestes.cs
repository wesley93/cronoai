using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>
/// Append-only da trilha em TRÊS camadas independentes, cada uma provada sozinha com controle negativo:
/// (1) REVOKE para o app, (2) RLS só com SELECT e INSERT e (3) gatilho de instrução com ENABLE ALWAYS, que vale até para o dono.
/// </summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class AppendOnlyTestes
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public AppendOnlyTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Auditoria_app_nao_altera_nem_apaga()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        foreach (var sql in new[] { "UPDATE", "DELETE", "TRUNCATE" })
        {
            await using var comoApp = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresa));
            var erro = await Assert.ThrowsAsync<PostgresException>(() => sql switch
            {
                "UPDATE" => comoApp.Database.ExecuteSqlAsync($"UPDATE cronoai.auditoria SET motivo = {"x"}", TestContext.Current.CancellationToken),
                "DELETE" => comoApp.Database.ExecuteSqlAsync($"DELETE FROM cronoai.auditoria", TestContext.Current.CancellationToken),
                _ => comoApp.Database.ExecuteSqlAsync($"TRUNCATE cronoai.auditoria", TestContext.Current.CancellationToken),
            });
            Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        }

        // A linha continua lá.
        Assert.Single(await _dados.LerAuditoriaAsync(empresa, obra.Id));

        // Controle negativo: no mesmo contexto o app ESCREVE em obra (o teste enxerga um UPDATE permitido).
        await using var escrita = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresa));
        Assert.Equal(1, await escrita.Database.ExecuteSqlAsync($"UPDATE cronoai.obra SET nome = {"Outro " + Guid.NewGuid().ToString("N")}", TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Auditoria_gatilho_recusa_ate_o_dono()
    {
        // O dono (migrador) tem os privilégios, e o RLS forçado esconde as linhas: só o gatilho de instrução recusa, e
        // recusa até com ZERO linhas afetadas e no TRUNCATE (que gatilho por linha não cobre).
        foreach (var sql in new[]
        {
            "UPDATE cronoai.auditoria SET motivo = 'x'",
            "UPDATE cronoai.auditoria SET motivo = 'x' WHERE false",
            "DELETE FROM cronoai.auditoria",
            "DELETE FROM cronoai.auditoria WHERE false",
            "TRUNCATE cronoai.auditoria",
        })
        {
            var erro = await Assert.ThrowsAsync<PostgresException>(() => ComoDonoAsync(sql));
            Assert.Equal(PostgresErrorCodes.RestrictViolation, erro.SqlState);
        }

        // Controle negativo: uma gêmea sem o gatilho aceita o mesmo UPDATE (o teste enxerga a diferença). Em transação
        // desfeita: nada fica no schema.
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var transacao = await conexao.BeginTransactionAsync(TestContext.Current.CancellationToken);
        try
        {
            foreach (var sql in new[]
            {
                "CREATE TABLE cronoai.auditoria_controle (LIKE cronoai.auditoria)",
                "UPDATE cronoai.auditoria_controle SET motivo = 'x'",
                "DELETE FROM cronoai.auditoria_controle",
                "TRUNCATE cronoai.auditoria_controle",
            })
            {
                await using var comando = new NpgsqlCommand(sql, conexao, transacao);
                await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
            }
        }
        finally
        {
            await transacao.RollbackAsync(CancellationToken.None);
        }
    }

    [Theory]
    [InlineData("UPDATE cronoai.auditoria SET motivo = 'x'", "UPDATE cronoai.auditoria_controle_t18 SET motivo = 'x'")]
    [InlineData("DELETE FROM cronoai.auditoria", "DELETE FROM cronoai.auditoria_controle_t18")]
    [InlineData("TRUNCATE cronoai.auditoria", "TRUNCATE cronoai.auditoria_controle_t18")]
    public async Task Auditoria_gatilho_independe_dos_privilegios(string comando, string comandoNaGemea)
    {
        // Em transação desfeita (bootstrap, só na fixture), o app GANHA UPDATE, DELETE e TRUNCATE na trilha e age sob o
        // próprio papel: o gatilho ainda recusa. A gêmea sem gatilho, com o MESMO GRANT, aceita o mesmo comando.
        const string concessao = "GRANT UPDATE, DELETE, TRUNCATE ON cronoai.auditoria TO cronoai_app; ";

        var gemea = await _banco.ExecutarScriptComoSuperusuarioAsync(
            "BEGIN; CREATE TABLE cronoai.auditoria_controle_t18 (LIKE cronoai.auditoria); "
            + "GRANT UPDATE, DELETE, TRUNCATE ON cronoai.auditoria_controle_t18 TO cronoai_app; "
            + $"SET LOCAL ROLE cronoai_app; {comandoNaGemea}; ROLLBACK;");
        Assert.Equal(0, gemea.CodigoSaida);

        var alvo = await _banco.ExecutarScriptComoSuperusuarioAsync($"BEGIN; {concessao}SET LOCAL ROLE cronoai_app; {comando}; ROLLBACK;");

        Assert.NotEqual(0, alvo.CodigoSaida);
        Assert.Contains("23001", alvo.Erro, StringComparison.Ordinal);
        Assert.Contains("append-only", alvo.Erro, StringComparison.Ordinal);

        // Nada ficou concedido (a transação foi desfeita).
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var consulta = new NpgsqlCommand("SELECT has_table_privilege('cronoai_app', 'cronoai.auditoria', 'UPDATE')", conexao);
        Assert.False((bool)(await consulta.ExecuteScalarAsync(TestContext.Current.CancellationToken))!);
    }

    [Fact]
    public async Task Auditoria_catalogo()
    {
        // Gatilho: BEFORE, de instrução, UPDATE + DELETE + TRUNCATE (tgtype 2+8+16+32 = 58) e ENABLE ALWAYS ('A').
        var gatilhos = await ListarAsync(
            "SELECT tgname || '|' || tgenabled::text || '|' || tgtype::int::text FROM pg_trigger WHERE tgrelid = 'cronoai.auditoria'::regclass AND NOT tgisinternal");
        Assert.Equal(["trg_auditoria_append_only|A|58"], gatilhos);

        // Privilégios do app: só SELECT e INSERT; nunca TRIGGER nem REFERENCES.
        foreach (var (privilegio, esperado) in new[] { ("SELECT", true), ("INSERT", true), ("UPDATE", false), ("DELETE", false), ("TRUNCATE", false), ("TRIGGER", false), ("REFERENCES", false) })
        {
            Assert.Equal(esperado, await TemPrivilegioAsync("auditoria", privilegio));
        }

        // Políticas: só SELECT e INSERT.
        var comandos = await ListarAsync("SELECT cmd FROM pg_policies WHERE schemaname = 'cronoai' AND tablename = 'auditoria' ORDER BY 1");
        Assert.Equal(["INSERT", "SELECT"], comandos);

        // Dono = migrador.
        var dono = await ListarAsync("SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid = c.relowner WHERE c.oid = 'cronoai.auditoria'::regclass");
        Assert.Equal(["cronoai_migrador"], dono);

        // Controle negativo: o mesmo catálogo em obra mostra UPDATE e o gatilho de linha (BEFORE, ROW, UPDATE = 1+2+16 = 19, 'O').
        Assert.True(await TemPrivilegioAsync("obra", "UPDATE"));
        Assert.Equal(["trg_obra_versao|O|19"], await ListarAsync(
            "SELECT tgname || '|' || tgenabled::text || '|' || tgtype::int::text FROM pg_trigger WHERE tgrelid = 'cronoai.obra'::regclass AND NOT tgisinternal"));
    }

    [Fact]
    public async Task Obra_sem_delete_para_aplicacao()
    {
        var (empresa, usuario) = await CriarContextoAsync();
        var obra = await _dados.CriarObraAsync(empresa, usuario);

        await using var comoApp = _dados.Fabrica.Criar(DadosTeste.ComoAdministrador(empresa));
        var erro = await Assert.ThrowsAsync<PostgresException>(() => comoApp.Database.ExecuteSqlAsync($"DELETE FROM cronoai.obra WHERE id = {obra.Id}", TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);
        Assert.False(await TemPrivilegioAsync("obra", "DELETE"));
        Assert.Equal(1L, await _dados.LerVersaoAsync(empresa, obra.Id));
    }

    #endregion

    #region Métodos privados

    private async Task<(Guid Empresa, Guid Usuario)> CriarContextoAsync()
    {
        var usuario = await _dados.CriarUsuarioAsync();
        return (await _dados.CriarEmpresaComMembrosAsync(usuario), usuario);
    }

    private async Task ComoDonoAsync(string sql)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand(sql, conexao);
        await comando.ExecuteNonQueryAsync(TestContext.Current.CancellationToken);
    }

    private async Task<bool> TemPrivilegioAsync(string tabela, string privilegio)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT has_table_privilege('cronoai_app', @tabela, @privilegio)", conexao);
        comando.Parameters.AddWithValue("tabela", "cronoai." + tabela);
        comando.Parameters.AddWithValue("privilegio", privilegio);
        return (bool)(await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

    // Catálogo lido pelo app (pg_trigger, pg_policies e pg_class são legíveis por qualquer papel).
    private async Task<List<string>> ListarAsync(string sql)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand(sql, conexao);
        var itens = new List<string>();
        await using var leitor = await comando.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        while (await leitor.ReadAsync(TestContext.Current.CancellationToken))
        {
            itens.Add(leitor.GetString(0));
        }

        return itens;
    }

    #endregion
}
