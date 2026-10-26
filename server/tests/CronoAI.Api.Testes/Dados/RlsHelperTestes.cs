using CronoAI.Dados.Rls;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CronoAI.Api.Testes.Dados;

/// <summary>Helper de RLS das migrações (sem banco): nome de política limitado em BYTES.</summary>
public sealed class RlsHelperTestes
{
    #region Métodos públicos

    [Theory]
    [InlineData(31, "\u00E9", true)] // 31 × 2 bytes = 62 bytes: cabe
    [InlineData(32, "\u00E9", false)] // 32 caracteres, mas 64 bytes: recusado (Length diria 32)
    [InlineData(62, "a", true)]
    [InlineData(63, "a", false)] // 63 bytes: suspeito de truncamento, igual ao teste de catálogo
    public void Nome_de_politica_e_limitado_em_bytes(int repeticoes, string unidade, bool aceito)
    {
        var nome = string.Concat(Enumerable.Repeat(unidade, repeticoes));
        var migracao = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");

        var erro = Record.Exception(() => migracao.PoliticaSelect("empresa", nome, "true"));

        if (aceito)
        {
            Assert.Null(erro);
        }
        else
        {
            Assert.IsType<ArgumentException>(erro);
        }
    }

    [Fact]
    public void Helper_recusa_politica_de_escrita_na_auditoria()
    {
        var migracao = new MigrationBuilder("Npgsql.EntityFrameworkCore.PostgreSQL");

        // A trilha é append-only (ADR 00009): só SELECT e INSERT. A guarda é do helper, sem depender de regex nem de revisor.
        Assert.Throws<ArgumentException>(() => migracao.PoliticaUpdate("auditoria", "pol_x", "true", "true"));
        Assert.Throws<ArgumentException>(() => migracao.PoliticaDelete("auditoria", "pol_x", "true"));
        Assert.Throws<ArgumentException>(() => migracao.SubstituirPoliticaUpdate("auditoria", "pol_x", "true", "true"));
        Assert.Throws<ArgumentException>(() => migracao.SubstituirPoliticaDelete("auditoria", "pol_x", "true"));
        Assert.Throws<ArgumentException>(() => migracao.RemoverPolitica("auditoria", "pol_auditoria_select"));

        // Controle: a mesma chamada em outra tabela passa, e a trilha aceita substituir SELECT e INSERT.
        Assert.Null(Record.Exception(() => migracao.PoliticaUpdate("obra", "pol_x", "true", "true")));
        Assert.Null(Record.Exception(() => migracao.PoliticaDelete("acesso_obra", "pol_x", "true")));
        Assert.Null(Record.Exception(() => migracao.SubstituirPoliticaUpdate("obra", "pol_x", "true", "true")));
        Assert.Null(Record.Exception(() => migracao.SubstituirPoliticaSelect("auditoria", "pol_auditoria_select", "true")));
        Assert.Null(Record.Exception(() => migracao.SubstituirPoliticaInsert("auditoria", "pol_auditoria_insert", "true")));
    }

    #endregion
}
