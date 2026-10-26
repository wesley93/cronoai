using Microsoft.EntityFrameworkCore.Diagnostics;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Gancho SÓ de teste: executa uma ação (uma única vez, depois de armada) imediatamente antes do primeiro <c>SaveChanges</c>
/// do contexto que o carrega. Simula "o estado mudou no meio da escrita" (por exemplo, o chamador foi rebaixado por outra pessoa
/// depois de o serviço conferir tudo e antes de o banco gravar).
/// </summary>
public sealed class GanchoUmaVez : SaveChangesInterceptor
{
    #region Campos

    private Func<Task>? _acao;

    #endregion

    #region Propriedades

    /// <summary>Verdadeiro depois que a ação armada rodou.</summary>
    public bool Executou { get; private set; }

    #endregion

    #region Métodos públicos

    /// <summary>Arma a ação para o próximo <c>SaveChanges</c> (só vale uma vez).</summary>
    public void Armar(Func<Task> acao)
    {
        ArgumentNullException.ThrowIfNull(acao);
        Executou = false;
        _acao = acao;
    }

    public override async ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        var acao = Interlocked.Exchange(ref _acao, null);
        if (acao is not null)
        {
            Executou = true;
            await acao();
        }

        return result;
    }

    #endregion
}
