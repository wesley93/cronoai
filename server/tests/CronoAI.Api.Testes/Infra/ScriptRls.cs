using System.Globalization;
using System.Text.RegularExpressions;

namespace CronoAI.Api.Testes.Infra;

/// <summary>Resultado de um DML rodado pelo <see cref="ScriptRls"/>: linhas afetadas ou o SQLSTATE do erro.</summary>
public sealed record ResultadoDml(long? Afetadas, string? SqlState, string Erro);

/// <summary>
/// Controle por MUTAÇÃO dos testes de RLS (plano 00014, seção 11.0). Numa transação do superusuário da fixture (que nunca é
/// confirmada: a conexão fecha com a transação aberta e o PostgreSQL a desfaz) o script (1) prepara o estado, (2) AFROUXA a
/// política ou desliga o gatilho, (3) assume o papel <c>cronoai_app</c> com o contexto (<c>app.usuario_id</c> e
/// <c>app.empresa_id</c>) e (4) roda o MESMO DML do teste negativo, devolvendo as linhas afetadas. Se o negativo depende da
/// política, a mutação faz o DML afetar as linhas proibidas.
/// O DML roda dentro de um bloco <c>DO</c> (<c>GET DIAGNOSTICS ROW_COUNT</c>): sem <c>WHERE</c> e sem <c>RETURNING</c>, para a
/// política de SELECT não mascarar o <c>USING</c>/<c>WITH CHECK</c> afrouxado. Só o superusuário da fixture o executa.
/// </summary>
public static partial class ScriptRls
{
    #region Métodos públicos

    /// <summary>Roda <paramref name="dml"/> como <c>cronoai_app</c> com o contexto dado, depois do <paramref name="preparo"/> e da <paramref name="mutacao"/>.</summary>
    public static async Task<ResultadoDml> ExecutarAsync(
        BancoPostgresFixture banco,
        Guid? usuario,
        Guid? empresa,
        string dml,
        string? mutacao = null,
        string? preparo = null)
    {
        ArgumentNullException.ThrowIfNull(banco);
        var script = string.Join(
            "\n",
            "BEGIN;",
            (preparo ?? "SELECT 1") + ";",
            (mutacao ?? "SELECT 1") + ";",
            "SET LOCAL ROLE cronoai_app;",
            $"SELECT set_config('app.usuario_id', '{usuario?.ToString("D") ?? ""}', true), set_config('app.empresa_id', '{empresa?.ToString("D") ?? ""}', true);",
            "DO $$ DECLARE n bigint; BEGIN " + dml + "; GET DIAGNOSTICS n = ROW_COUNT; PERFORM set_config('teste.afetadas', n::text, true); END $$;",
            "SELECT 'AFETADAS=' || current_setting('teste.afetadas');");

        var (codigo, saida, erro) = await banco.ExecutarScriptComoSuperusuarioAsync(script);
        // O psql imprime o resultado de cada comando do script ("BEGIN", "SET"...): a linha que interessa é a das afetadas.
        var linha = saida.Split('\n').Select(l => l.Trim()).LastOrDefault(l => l.StartsWith("AFETADAS=", StringComparison.Ordinal));
        if (codigo == 0 && linha is not null)
        {
            return new ResultadoDml(long.Parse(linha["AFETADAS=".Length..], CultureInfo.InvariantCulture), null, "");
        }

        var estado = SqlStateRegex().Match(erro);
        if (!estado.Success)
        {
            // Falha que não é erro de SQL do DML (script quebrado, psql fora do ar): o teste não pode seguir adiante fingindo resultado.
            throw new InvalidOperationException("Script de RLS falhou sem SQLSTATE (psql " + codigo + "): " + erro + saida);
        }

        return new ResultadoDml(null, estado.Groups[1].Value, erro);
    }

    #endregion

    #region Métodos privados

    // Com VERBOSITY=verbose o psql escreve "ERROR:  42501: mensagem".
    [GeneratedRegex(@"ERROR:\s+([0-9A-Z]{5}):")]
    private static partial Regex SqlStateRegex();

    #endregion
}
