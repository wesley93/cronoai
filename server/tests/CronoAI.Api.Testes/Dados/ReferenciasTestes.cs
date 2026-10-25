using CronoAI.Api.Testes.Infra;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Listas globais de UF e município: conteúdo da migração, só leitura para a aplicação e o procedimento da FK futura.</summary>
[Collection(ColecaoBanco.Nome)]
[Trait("Categoria", "Integracao")]
public sealed class ReferenciasTestes
{
    #region Campos

    // Os 27 códigos vêm do parecer do dba e NÃO foram verificados numa fonte oficial: o usuário os confere contra a
    // tabela do IBGE antes do merge (V-1 do plano 00013). Este teste fixa o que a migração semeou.
    private static readonly string[] _ufsEsperadas =
    [
        "AC|12|Acre", "AL|27|Alagoas", "AM|13|Amazonas", "AP|16|Amapá", "BA|29|Bahia", "CE|23|Ceará",
        "DF|53|Distrito Federal", "ES|32|Espírito Santo", "GO|52|Goiás", "MA|21|Maranhão", "MG|31|Minas Gerais",
        "MS|50|Mato Grosso do Sul", "MT|51|Mato Grosso", "PA|15|Pará", "PB|25|Paraíba", "PE|26|Pernambuco",
        "PI|22|Piauí", "PR|41|Paraná", "RJ|33|Rio de Janeiro", "RN|24|Rio Grande do Norte", "RO|11|Rondônia",
        "RR|14|Roraima", "RS|43|Rio Grande do Sul", "SC|42|Santa Catarina", "SE|28|Sergipe", "SP|35|São Paulo",
        "TO|17|Tocantins",
    ];

    private readonly BancoPostgresFixture _banco;
    private readonly DadosTeste _dados;

    #endregion

    #region Construtor

    public ReferenciasTestes(BancoPostgresFixture banco)
    {
        _banco = banco;
        _dados = new DadosTeste(banco);
    }

    #endregion

    #region Métodos públicos

    [Fact]
    public async Task Uf_referencia_tem_as_27_ufs_da_tabela()
    {
        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio);

        var linhas = await contexto.Database
            .SqlQuery<string>($"SELECT sigla || '|' || codigo_ibge::text || '|' || nome AS \"Value\" FROM cronoai.uf_referencia")
            .ToListAsync(TestContext.Current.CancellationToken);

        Assert.Equal(27, linhas.Count);
        Assert.Equal(_ufsEsperadas.Order(StringComparer.Ordinal), linhas.Order(StringComparer.Ordinal));
        Assert.Equal(27, linhas.Select(l => l.Split('|')[0]).Distinct().Count());
        Assert.Equal(27, linhas.Select(l => l.Split('|')[1]).Distinct().Count());
    }

    [Fact]
    public void Municipio_referencia_vazia_apos_migracao()
    {
        // Contado pela fixture logo depois da migração, antes do seed fictício dos testes: a migração não carrega município.
        Assert.Equal(0, _banco.MunicipiosAposMigracao);
    }

    [Theory]
    [InlineData("uf_referencia")]
    [InlineData("municipio_referencia")]
    public async Task Referencias_globais_so_leitura_para_aplicacao(string tabela)
    {
        Assert.True(await TemPrivilegioAsync(tabela, "SELECT"));
        foreach (var privilegio in new[] { "INSERT", "UPDATE", "DELETE" })
        {
            Assert.False(await TemPrivilegioAsync(tabela, privilegio), $"{tabela} {privilegio}");
        }

        await using var contexto = _dados.Fabrica.Criar(ContextoSessaoBanco.Vazio);
        var erro = await Assert.ThrowsAsync<PostgresException>(() => tabela == "uf_referencia"
            ? contexto.Database.ExecuteSqlAsync($"INSERT INTO cronoai.uf_referencia (sigla, codigo_ibge, nome) VALUES ({"ZZ"}, {(short)99}, {"Ficticia"})", TestContext.Current.CancellationToken)
            : contexto.Database.ExecuteSqlAsync($"INSERT INTO cronoai.municipio_referencia (codigo_ibge, uf, nome) VALUES ({"1234567"}, {"PE"}, {"Ficticio"})", TestContext.Current.CancellationToken));

        Assert.Equal(PostgresErrorCodes.InsufficientPrivilege, erro.SqlState);

        // Controle negativo: o mesmo teste de privilégio enxerga o INSERT que a aplicação TEM em obra.
        Assert.True(await TemPrivilegioAsync("obra", "INSERT"));
    }

    [Fact]
    public async Task Fk_de_municipio_pos_carga_com_not_valid_e_validate()
    {
        // Procedimento do ciclo da carga oficial, provado numa tabela gêmea (nunca na obra) e desfeito no fim:
        // ADD CONSTRAINT ... NOT VALID aceita a linha ANTIGA fora da lista e recusa a NOVA; VALIDATE falha até corrigir.
        await using var conexao = new NpgsqlConnection(_banco.StringConexaoMigrador);
        await conexao.OpenAsync(TestContext.Current.CancellationToken);
        await using var transacao = await conexao.BeginTransactionAsync(TestContext.Current.CancellationToken);
        try
        {
            await Executar(conexao, transacao, "CREATE TABLE cronoai.obra_controle_municipio (id int PRIMARY KEY, uf text NOT NULL, municipio_ibge text NOT NULL)");
            await Executar(conexao, transacao, "INSERT INTO cronoai.obra_controle_municipio VALUES (1, 'PE', '1111111')");
            await Executar(
                conexao,
                transacao,
                "ALTER TABLE cronoai.obra_controle_municipio ADD CONSTRAINT fk_controle_municipio FOREIGN KEY (municipio_ibge, uf) REFERENCES cronoai.municipio_referencia (codigo_ibge, uf) NOT VALID");

            // Linha nova fora da lista: recusada mesmo com NOT VALID. Dentro da lista (seed fictício da fixture): aceita.
            await Executar(conexao, transacao, "SAVEPOINT nova_fora");
            var recusada = await Assert.ThrowsAsync<PostgresException>(() => Executar(conexao, transacao, "INSERT INTO cronoai.obra_controle_municipio VALUES (2, 'PE', '2222222')"));
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, recusada.SqlState);
            await Executar(conexao, transacao, "ROLLBACK TO SAVEPOINT nova_fora");
            await Executar(conexao, transacao, "INSERT INTO cronoai.obra_controle_municipio VALUES (3, 'PE', '2699999')");

            // VALIDATE falha enquanto a linha antiga estiver fora da lista, e passa depois de corrigida.
            await Executar(conexao, transacao, "SAVEPOINT validar");
            var falhou = await Assert.ThrowsAsync<PostgresException>(() => Executar(conexao, transacao, "ALTER TABLE cronoai.obra_controle_municipio VALIDATE CONSTRAINT fk_controle_municipio"));
            Assert.Equal(PostgresErrorCodes.ForeignKeyViolation, falhou.SqlState);
            await Executar(conexao, transacao, "ROLLBACK TO SAVEPOINT validar");
            await Executar(conexao, transacao, "UPDATE cronoai.obra_controle_municipio SET municipio_ibge = '2699999' WHERE id = 1");
            await Executar(conexao, transacao, "ALTER TABLE cronoai.obra_controle_municipio VALIDATE CONSTRAINT fk_controle_municipio");
        }
        finally
        {
            await transacao.RollbackAsync(CancellationToken.None);
        }
    }

    #endregion

    #region Métodos privados

    private static async Task Executar(NpgsqlConnection conexao, NpgsqlTransaction transacao, string sql)
    {
        await using var comando = new NpgsqlCommand(sql, conexao, transacao);
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

    #endregion
}
