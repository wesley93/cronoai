using System.Text;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CronoAI.Dados.Rls;

/// <summary>
/// Helper único das migrações para RLS (ADR 00006): <c>ENABLE</c> + <c>FORCE</c> e políticas POR COMANDO,
/// sempre <c>TO cronoai_app</c> (papel novo nasce sem acesso) e com <c>WITH CHECK</c> explícito. Política para o
/// migrador é proibida: anularia o <c>FORCE</c>. Este arquivo é o único, fora de <c>Migrations/</c>, autorizado a
/// montar DDL de RLS (regra R15). A trilha (<c>auditoria</c>) só admite política de SELECT e de INSERT (append-only,
/// ADR 00009): criar ou substituir política de UPDATE ou DELETE nela LANÇA, sem depender de regex nem de revisor.
/// </summary>
public static class MigrationBuilderRlsExtensoes
{
    #region Campos

    /// <summary>Usuário do contexto: subconsulta escalar (o planner avalia uma vez; vazio vira NULL, nunca erro de cast).</summary>
    public static readonly string ExpressaoUsuario = Expressao(PapeisBanco.VariavelUsuario);

    /// <summary>Empresa do contexto: idem.</summary>
    public static readonly string ExpressaoEmpresa = Expressao(PapeisBanco.VariavelEmpresa);

    private const string TabelaAuditoria = "auditoria";

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

    /// <summary>Política de UPDATE, com <c>USING</c> e <c>WITH CHECK</c> explícitos. Recusada na trilha.</summary>
    public static void PoliticaUpdate(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando, string comCheck)
    {
        RecusarEscritaNaTrilha(tabela, "UPDATE");
        Criar(migrationBuilder, tabela, nome, "UPDATE", $"USING ({usando}) WITH CHECK ({comCheck})");
    }

    /// <summary>Política de DELETE (<c>USING</c>). Recusada na trilha.</summary>
    public static void PoliticaDelete(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando)
    {
        RecusarEscritaNaTrilha(tabela, "DELETE");
        Criar(migrationBuilder, tabela, nome, "DELETE", $"USING ({usando})");
    }

    /// <summary>Substitui a política de SELECT (<c>DROP POLICY</c> + <c>CREATE POLICY</c> na mesma migração).</summary>
    public static void SubstituirPoliticaSelect(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando)
    {
        Remover(migrationBuilder, tabela, nome);
        PoliticaSelect(migrationBuilder, tabela, nome, usando);
    }

    /// <summary>Substitui a política de INSERT.</summary>
    public static void SubstituirPoliticaInsert(this MigrationBuilder migrationBuilder, string tabela, string nome, string comCheck)
    {
        Remover(migrationBuilder, tabela, nome);
        PoliticaInsert(migrationBuilder, tabela, nome, comCheck);
    }

    /// <summary>Substitui a política de UPDATE. Recusada na trilha.</summary>
    public static void SubstituirPoliticaUpdate(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando, string comCheck)
    {
        RecusarEscritaNaTrilha(tabela, "UPDATE");
        Remover(migrationBuilder, tabela, nome);
        PoliticaUpdate(migrationBuilder, tabela, nome, usando, comCheck);
    }

    /// <summary>Substitui a política de DELETE. Recusada na trilha.</summary>
    public static void SubstituirPoliticaDelete(this MigrationBuilder migrationBuilder, string tabela, string nome, string usando)
    {
        RecusarEscritaNaTrilha(tabela, "DELETE");
        Remover(migrationBuilder, tabela, nome);
        PoliticaDelete(migrationBuilder, tabela, nome, usando);
    }

    /// <summary>
    /// Remove uma política SEM substituta (o comando passa a não ter política: o RLS nega). Recusada na trilha: ali só se
    /// substitui (SELECT e INSERT), nunca se tira a política.
    /// </summary>
    public static void RemoverPolitica(this MigrationBuilder migrationBuilder, string tabela, string nome)
    {
        ValidarNomeDeTabela(tabela);
        if (string.Equals(tabela, TabelaAuditoria, StringComparison.Ordinal))
        {
            throw new ArgumentException("A trilha não admite remover política: só substituir a de SELECT e a de INSERT (append-only, ADR 00009).", nameof(tabela));
        }

        Remover(migrationBuilder, tabela, nome);
    }

    #endregion

    #region Métodos privados

    private static string Expressao(string variavel) =>
        $"(SELECT NULLIF(current_setting('{variavel}', true), '')::uuid)";

    private static string Qualificada(string tabela)
    {
        ValidarNomeDeTabela(tabela);
        return $"{PapeisBanco.Schema}.{tabela}";
    }

    // O identificador vai SEM aspas ao SQL, e o PostgreSQL o converte para minúsculas: "Auditoria" seria a trilha e escaparia da
    // comparação Ordinal dos guardas abaixo. Por isso só se aceita nome de tabela já em minúsculas, sem aspas, ponto nem espaço.
    private static void ValidarNomeDeTabela(string tabela)
    {
        if (string.IsNullOrEmpty(tabela) || !NomeDeTabelaValido(tabela))
        {
            throw new ArgumentException("Nome de tabela inválido: só minúsculas, dígitos e sublinhado (o identificador não leva aspas).", nameof(tabela));
        }
    }

    private static bool NomeDeTabelaValido(string tabela)
    {
        if (!(tabela[0] is >= 'a' and <= 'z' or '_'))
        {
            return false;
        }

        return tabela.All(c => c is >= 'a' and <= 'z' or >= '0' and <= '9' or '_');
    }

    private static void RecusarEscritaNaTrilha(string tabela, string comando)
    {
        ValidarNomeDeTabela(tabela);
        if (string.Equals(tabela, TabelaAuditoria, StringComparison.Ordinal))
        {
            throw new ArgumentException($"A trilha é append-only: política de {comando} em auditoria é proibida (ADR 00009).", nameof(tabela));
        }
    }

    private static void Remover(MigrationBuilder migrationBuilder, string tabela, string nome)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        migrationBuilder.Sql($"DROP POLICY {nome} ON {Qualificada(tabela)};");
    }

    private static void Criar(MigrationBuilder migrationBuilder, string tabela, string nome, string comando, string clausula)
    {
        ArgumentNullException.ThrowIfNull(migrationBuilder);
        // Bytes, não caracteres (o limite do PostgreSQL é em bytes). 63 já conta como suspeito: coerente com o teste de catálogo.
        if (Encoding.UTF8.GetByteCount(nome) >= 63)
        {
            throw new ArgumentException("Nome de política com 63 bytes ou mais (o PostgreSQL trunca em silêncio; o catálogo trata 63 bytes como suspeita de truncamento).", nameof(nome));
        }

        migrationBuilder.Sql(
            $"CREATE POLICY {nome} ON {Qualificada(tabela)} AS PERMISSIVE FOR {comando} TO {PapeisBanco.Aplicacao} {clausula};");
    }

    #endregion
}
