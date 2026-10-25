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

    #endregion
}
