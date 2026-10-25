using CronoAI.Dados.Auditoria;
using CronoAI.Dados.Rls;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados;

/// <summary>
/// Configuração única do provedor, compartilhada pela API e pela factory de design-time,
/// para o modelo das migrações ser idêntico ao usado em execução.
/// </summary>
public static class CronoDbContextConfiguracao
{
    #region Métodos públicos

    /// <summary>
    /// Aplica Npgsql, <c>snake_case</c>, o histórico de migrações explícito no schema da aplicação e o interceptor
    /// que fixa as variáveis de sessão do RLS em toda abertura de conexão, mais o interceptor da trilha de auditoria.
    /// </summary>
    public static DbContextOptionsBuilder Configurar(DbContextOptionsBuilder opcoes, string stringConexao)
    {
        ArgumentNullException.ThrowIfNull(opcoes);
        ArgumentException.ThrowIfNullOrWhiteSpace(stringConexao);

        return opcoes
            .UseNpgsql(
                stringConexao,
                npgsql => npgsql.MigrationsHistoryTable(PapeisBanco.HistoricoMigracoes, PapeisBanco.Schema))
            .UseSnakeCaseNamingConvention()
            .AddInterceptors(ContextoSessaoInterceptor.Instancia, AuditoriaInterceptor.Instancia);
    }

    #endregion
}
