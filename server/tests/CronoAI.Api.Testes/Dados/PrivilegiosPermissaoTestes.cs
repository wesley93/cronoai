using CronoAI.Api.Testes.Infra;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Privilégios por tabela e por coluna do papel da aplicação (T26) e índices do ciclo 00014 (T38), lidos como <c>cronoai_app</c>.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class PrivilegiosPermissaoTestes
{
    #region Campos

    private static readonly string[] _vinculos = ["acesso_obra", "acesso_frente", "carteira_obra", "acesso_carteira"];

    private readonly BancoPostgresFixture _banco;

    #endregion

    #region Construtor

    public PrivilegiosPermissaoTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Privilegios_por_tabela_e_coluna()
    {
        // membro_empresa: UPDATE só nas 4 colunas do plano; nunca nas imutáveis; sem INSERT e sem DELETE.
        foreach (var coluna in new[] { "perfil", "escopo_obras", "removido_em", "atualizado_em" })
        {
            Assert.True(await ColunaAsync("membro_empresa", coluna), $"UPDATE em {coluna} deveria ser permitido");
        }

        foreach (var coluna in new[] { "empresa_id", "usuario_id", "criado_em" })
        {
            Assert.False(await ColunaAsync("membro_empresa", coluna), $"UPDATE em {coluna} deveria ser recusado");
        }

        Assert.False(await TabelaAsync("membro_empresa", "INSERT"));
        Assert.False(await TabelaAsync("membro_empresa", "DELETE"));
        Assert.True(await TabelaAsync("membro_empresa", "SELECT"));

        // Sem DELETE em obra, frente, carteira e auditoria ("apagar" é arquivar; a trilha é append-only).
        foreach (var tabela in new[] { "obra", "frente", "carteira", "auditoria" })
        {
            Assert.False(await TabelaAsync(tabela, "DELETE"), $"DELETE em {tabela}");
        }

        // DELETE só nos 4 vínculos, e nenhum UPDATE neles (o vínculo só se insere ou apaga).
        foreach (var tabela in _vinculos)
        {
            Assert.True(await TabelaAsync(tabela, "DELETE"), $"DELETE em {tabela}");
            Assert.False(await TabelaAsync(tabela, "UPDATE"), $"UPDATE em {tabela}");
            Assert.True(await TabelaAsync(tabela, "INSERT"), $"INSERT em {tabela}");
        }

        // Trilha: só SELECT e INSERT.
        Assert.True(await TabelaAsync("auditoria", "SELECT"));
        Assert.True(await TabelaAsync("auditoria", "INSERT"));
        Assert.False(await TabelaAsync("auditoria", "UPDATE"));
        Assert.False(await TabelaAsync("auditoria", "TRUNCATE"));

        // Nenhuma tabela do schema com TRUNCATE, TRIGGER ou REFERENCES para a aplicação.
        var tabelas = await ListarAsync("SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cronoai' AND c.relkind = 'r' AND c.relname <> '__ef_migrations_history'");
        Assert.NotEmpty(tabelas);
        foreach (var tabela in tabelas)
        {
            foreach (var privilegio in new[] { "TRUNCATE", "TRIGGER", "REFERENCES" })
            {
                Assert.False(await TabelaAsync(tabela, privilegio), $"{privilegio} em {tabela}");
            }
        }

        // Controle negativo: um privilégio CONCEDIDO é verdadeiro (a consulta enxerga o que existe).
        Assert.True(await TabelaAsync("obra", "UPDATE"));
        Assert.True(await TabelaAsync("frente", "UPDATE"));
    }

    [Fact]
    public async Task Indices_previstos_sem_duplicata()
    {
        // Os índices do plano (seção 07.4) existem...
        var esperados = new[]
        {
            "ix_acesso_obra_usuario", "ix_acesso_obra_empresa_obra", "ix_acesso_frente_usuario", "ix_frente_empresa_obra",
            "ix_carteira_obra_obra", "ix_acesso_carteira_usuario", "ux_frente_obra_nome_ativa", "ux_carteira_empresa_tipo_nome_ativa",
        };
        var existentes = await ListarAsync("SELECT indexname FROM pg_indexes WHERE schemaname = 'cronoai'");
        Assert.All(esperados, nome => Assert.Contains(nome, existentes));

        // ...e nenhuma tabela tem dois índices com as MESMAS colunas na mesma ordem (a convenção do EF cria o índice da FK; o
        // índice declarado de mesmas colunas o substitui em vez de duplicar). A chave primária e as únicas contam.
        var duplicados = await ListarAsync(
            """
            SELECT c.relname || ' ' || i.indkey::text
              FROM pg_index i
              JOIN pg_class c ON c.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'cronoai'
             GROUP BY c.relname, i.indkey, i.indpred IS NULL
            HAVING count(*) > 1
            """);
        Assert.Empty(duplicados);
    }

    #endregion

    #region Métodos privados

    private async Task<bool> TabelaAsync(string tabela, string privilegio)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT has_table_privilege('cronoai_app', @tabela, @privilegio)", conexao);
        comando.Parameters.AddWithValue("tabela", "cronoai." + tabela);
        comando.Parameters.AddWithValue("privilegio", privilegio);
        return (bool)(await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

    private async Task<bool> ColunaAsync(string tabela, string coluna)
    {
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoApp);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var comando = new NpgsqlCommand("SELECT has_column_privilege('cronoai_app', @tabela, @coluna, 'UPDATE')", conexao);
        comando.Parameters.AddWithValue("tabela", "cronoai." + tabela);
        comando.Parameters.AddWithValue("coluna", coluna);
        return (bool)(await comando.ExecuteScalarAsync(TestContext.Current.CancellationToken))!;
    }

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
