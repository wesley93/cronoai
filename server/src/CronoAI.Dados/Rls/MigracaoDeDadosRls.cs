using Microsoft.EntityFrameworkCore.Migrations;

namespace CronoAI.Dados.Rls;

/// <summary>
/// Único caminho permitido para DML em migração sobre tabela com RLS (regra R15). Com <c>FORCE</c> e políticas
/// <c>TO cronoai_app</c>, o dono (migrador) vê ZERO linhas mesmo com as variáveis de sessão setadas: um
/// <c>UPDATE</c> afetaria zero linhas SEM erro. O helper alterna, na transação da migração,
/// <c>NO FORCE</c> → DML → <c>FORCE</c>. Como a DDL do PostgreSQL é transacional, um erro desfaz também o
/// <c>NO FORCE</c>. O DML deve levar filtro explícito por empresa. Em produção, o momento de aplicar (lock curto
/// da tabela) é da Infraestrutura.
/// </summary>
public static class MigracaoDeDadosRls
{
    #region Métodos públicos

    /// <summary>Acrescenta à migração o DML da tabela entre <c>NO FORCE</c> e <c>FORCE</c>.</summary>
    public static void ExecutarDmlComRls(this MigrationBuilder migrationBuilder, string tabela, string sqlDml)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        foreach (var sql in GerarSql(tabela, sqlDml))
        {
            migrationBuilder.Sql(sql);
        }
    }

    /// <summary>Os três comandos, na ordem. Exposto para o teste executá-los na transação de um banco real.</summary>
    public static IReadOnlyList<string> GerarSql(string tabela, string sqlDml)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tabela);
        ArgumentException.ThrowIfNullOrWhiteSpace(sqlDml);
        var qualificada = $"{PapeisBanco.Schema}.{tabela}";
        return
        [
            $"ALTER TABLE {qualificada} NO FORCE ROW LEVEL SECURITY;",
            sqlDml,
            $"ALTER TABLE {qualificada} FORCE ROW LEVEL SECURITY;",
        ];
    }

    #endregion
}
