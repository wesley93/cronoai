using CronoAI.Api.Testes.Infra;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Testes de catálogo (pg_catalog), lidos como <c>cronoai_app</c>: FKs, nomes, RLS e políticas.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class CatalogoTestes
{
    #region Campos

    // Tabelas do schema fora do RLS por decisão (ADR 00006): usuario (aceito com condições) e o histórico de migrações.
    private static readonly string[] _tabelasForaDoRls = ["usuario", "__ef_migrations_history"];

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public CatalogoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Fks_do_schema_sao_restrict()
    {
        // confdeltype 'r' = RESTRICT. Qualquer outra coisa (cascata, set null, no action) reprova.
        var fora = await ListarAsync(
            "SELECT k.conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = 'cronoai' AND k.contype = 'f' AND k.confdeltype <> 'r'");

        Assert.Empty(fora);
        Assert.NotEmpty(await ListarAsync(
            "SELECT k.conname FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace WHERE n.nspname = 'cronoai' AND k.contype = 'f'"));
    }

    [Fact]
    public async Task Identificadores_cabem_em_63_bytes()
    {
        // 63 bytes é o limite do PostgreSQL: nome com exatamente 63 é sinal de truncamento silencioso.
        var suspeitos = await ListarAsync(
            """
            SELECT c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'cronoai' AND octet_length(c.relname) >= 63
            UNION ALL
            SELECT k.conname
              FROM pg_constraint k JOIN pg_namespace n ON n.oid = k.connamespace
             WHERE n.nspname = 'cronoai' AND octet_length(k.conname) >= 63
            UNION ALL
            SELECT p.policyname
              FROM pg_policies p
             WHERE p.schemaname = 'cronoai' AND octet_length(p.policyname) >= 63
            UNION ALL
            SELECT c.relname
              FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'cronoai'
             GROUP BY c.relname HAVING count(*) > 1
            """);

        Assert.Empty(suspeitos);
    }

    [Fact]
    public async Task Toda_tabela_tem_rls_forcado_ou_esta_na_lista_global()
    {
        var tabelas = await ListarAsync(
            "SELECT c.relname || '|' || c.relrowsecurity::text || '|' || c.relforcerowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relkind = 'r'");

        Assert.NotEmpty(tabelas);
        foreach (var linha in tabelas)
        {
            var partes = linha.Split('|');
            if (_tabelasForaDoRls.Contains(partes[0]))
            {
                continue;
            }

            Assert.True(partes[1] == "true" && partes[2] == "true", $"RLS forçado ausente em {partes[0]}");
        }

        // As tabelas de dado do ciclo estão de fato presentes e protegidas.
        foreach (var esperada in new[] { "empresa", "membro_empresa", "sessao" })
        {
            Assert.Contains($"{esperada}|true|true", tabelas);
        }
    }

    [Fact]
    public async Task Politicas_sao_por_comando_e_so_para_cronoai_app()
    {
        var politicas = await ListarAsync(
            "SELECT tablename || '|' || cmd || '|' || roles::text || '|' || permissive FROM pg_policies WHERE schemaname = 'cronoai' ORDER BY 1");

        // Nenhum "ALL", nenhum papel além do cronoai_app, e exatamente os comandos do plano (sem UPDATE/DELETE em empresa e membro_empresa).
        var esperadas = new[]
        {
            "empresa|INSERT|{cronoai_app}|PERMISSIVE",
            "empresa|SELECT|{cronoai_app}|PERMISSIVE",
            "membro_empresa|INSERT|{cronoai_app}|PERMISSIVE",
            "membro_empresa|SELECT|{cronoai_app}|PERMISSIVE",
            "sessao|DELETE|{cronoai_app}|PERMISSIVE",
            "sessao|INSERT|{cronoai_app}|PERMISSIVE",
            "sessao|SELECT|{cronoai_app}|PERMISSIVE",
            "sessao|UPDATE|{cronoai_app}|PERMISSIVE",
        };
        Assert.Equal(esperadas.OrderBy(x => x, StringComparer.Ordinal), politicas.OrderBy(x => x, StringComparer.Ordinal));
    }

    #endregion

    #region Métodos privados

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
