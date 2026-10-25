using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados;

/// <summary>
/// Configuração única do provedor, compartilhada pela API e pela factory de design-time,
/// para o modelo das migrações ser idêntico ao usado em execução.
/// </summary>
public static class CronoDbContextConfiguracao
{
    #region Métodos públicos

    /// <summary>Aplica Npgsql, <c>snake_case</c> e o histórico de migrações explícito no schema da aplicação.</summary>
    public static DbContextOptionsBuilder Configurar(DbContextOptionsBuilder opcoes, string stringConexao)
    {
        ArgumentNullException.ThrowIfNull(opcoes);
        ArgumentException.ThrowIfNullOrWhiteSpace(stringConexao);

        return opcoes
            .UseNpgsql(
                stringConexao,
                npgsql => npgsql.MigrationsHistoryTable(PapeisBanco.HistoricoMigracoes, PapeisBanco.Schema))
            .UseSnakeCaseNamingConvention();
    }

    #endregion
}
