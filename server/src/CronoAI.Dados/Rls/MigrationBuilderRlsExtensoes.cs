using Microsoft.EntityFrameworkCore.Migrations;

namespace CronoAI.Dados.Rls;

/// <summary>
/// Helper único das migrações para RLS (ADR 00006): <c>ENABLE</c> + <c>FORCE</c> e políticas POR COMANDO,
/// sempre <c>TO cronoai_app</c> (papel novo nasce sem acesso) e com <c>WITH CHECK</c> explícito. Política para o
/// migrador é proibida: anularia o <c>FORCE</c>. Este arquivo é o único, fora de <c>Migrations/</c>, autorizado a
/// montar DDL de RLS (regra R15).
/// </summary>
public static class MigrationBuilderRlsExtensoes
{
    #region Campos

    /// <summary>Usuário do contexto: subconsulta escalar (o planner avalia uma vez; vazio vira NULL, nunca erro de cast).</summary>
    public static readonly string ExpressaoUsuario = Expressao(PapeisBanco.VariavelUsuario);

    /// <summary>Empresa do contexto: idem.</summary>
    public static readonly string ExpressaoEmpresa = Expressao(PapeisBanco.VariavelEmpresa);

    #endregion

    #region Métodos públicos

    /// <summary>Liga o RLS e o FORCE (o dono também se sujeita às políticas).</summary>
    public static void HabilitarRlsForcado(this MigrationBuilder migrationBuilder, string tabela)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        migrationBuilder.Sql($"ALTER TABLE {Qualificada(tabela)} ENABLE ROW LEVEL SECURITY;");
        migrationBuilder.Sql($"ALTER TABLE {Qualificada(tabela)} FORCE ROW LEVEL SECURITY;");
    }

    /// <summary>Política de SELECT (<c>USING</c>) para o papel da aplicação.</summary>
    public static void PoliticaSelect(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando) =>
        Criar(migrationBuilder, tabela, nome, "SELECT", $"USING ({usando})");

    /// <summary>Política de INSERT (<c>WITH CHECK</c>) para o papel da aplicação.</summary>
    public static void PoliticaInsert(this MigrationBuilder migrationBuilder, string tabela, string nome, string comCheck) =>
        Criar(migrationBuilder, tabela, nome, "INSERT", $"WITH CHECK ({comCheck})");

    /// <summary>Política de UPDATE, com <c>USING</c> e <c>WITH CHECK</c> explícitos.</summary>
    public static void PoliticaUpdate(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando, string comCheck) =>
        Criar(migrationBuilder, tabela, nome, "UPDATE", $"USING ({usando}) WITH CHECK ({comCheck})");

    /// <summary>Política de DELETE (<c>USING</c>).</summary>
    public static void PoliticaDelete(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando) =>
        Criar(migrationBuilder, tabela, nome, "DELETE", $"USING ({usando})");

    /// <summary>Remove a política (usado no <c>Down()</c>).</summary>
    public static void RemoverPolitica(this MigrationBuilder migrationBuilder, string tabela, string nome)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        migrationBuilder.Sql($"DROP POLICY IF EXISTS {nome} ON {Qualificada(tabela)};");
    }

    #endregion

    #region Métodos privados

    private static string Expressao(string variavel) =>
        $"(SELECT NULLIF(current_setting('{variavel}', true), '')::uuid)";

    private static string Qualificada(string tabela) => $"{PapeisBanco.Schema}.{tabela}";

    private static void Criar(MigrationBuilder migrationBuilder, string tabela, string nome, string comando, string clausula)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        if (nome.Length > 63)
        {
            throw new ArgumentException("Nome de política acima de 63 bytes (o PostgreSQL trunca em silêncio).", nameof(nome));
        }

        migrationBuilder.Sql(
            $"CREATE POLICY {nome} ON {Qualificada(tabela)} AS PERMISSIVE FOR {comando} TO {PapeisBanco.Aplicacao} {clausula};");
    }

    #endregion
}
