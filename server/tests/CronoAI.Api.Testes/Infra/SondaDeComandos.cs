using System.Data.Common;
using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Sonda SÓ de teste: registra, em ordem, o texto de cada comando que o EF envia ao banco. Prova a ORDEM do lote (a trilha
/// entra ANTES do <c>UPDATE</c>/<c>DELETE</c> que depois falha): injetar a falha na própria trilha não provaria atomicidade
/// nenhuma. Não altera o comando nem o resultado.
/// </summary>
public sealed class SondaDeComandos : DbCommandInterceptor
{
    #region Campos

    private readonly List<string> _comandos = [];
    private readonly Lock _trava = new();

    #endregion

    #region Propriedades

    /// <summary>Texto dos comandos vistos até agora, na ordem em que foram enviados.</summary>
    public IReadOnlyList<string> Comandos
    {
        get
        {
            lock (_trava)
            {
                return [.. _comandos];
            }
        }
    }

    #endregion

    #region Métodos públicos

    /// <summary>Contexto do EF (papel da aplicação) com a sonda ligada, para o contexto de banco informado.</summary>
    public static CronoDbContext CriarContexto(BancoPostgresFixture banco, ContextoSessaoBanco contexto, SondaDeComandos sonda)
    {
        ArgumentNullException.ThrowIfNull(banco);
        ArgumentNullException.ThrowIfNull(sonda);
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, banco.StringConexaoApp);
        opcoes.AddInterceptors(sonda);
        return new CronoDbContext(opcoes.Options, contexto);
    }

    public override ValueTask<InterceptionResult<DbDataReader>> ReaderExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<DbDataReader> result,
        CancellationToken cancellationToken = default)
    {
        Registrar(command);
        return base.ReaderExecutingAsync(command, eventData, result, cancellationToken);
    }

    public override ValueTask<InterceptionResult<int>> NonQueryExecutingAsync(
        DbCommand command,
        CommandEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        Registrar(command);
        return base.NonQueryExecutingAsync(command, eventData, result, cancellationToken);
    }

    #endregion

    #region Métodos privados

    private void Registrar(DbCommand comando)
    {
        lock (_trava)
        {
            _comandos.Add(comando.CommandText);
        }
    }

    #endregion
}
