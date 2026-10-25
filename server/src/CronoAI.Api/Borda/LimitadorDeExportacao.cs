using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;

namespace CronoAI.Api.Borda;

/// <summary>
/// Cota da exportação CSV da trilha, POR USUÁRIO (RF-12.5). A rota é autenticada, então a partição é o usuário da sessão e não
/// o IP: requisição anônima nunca chega aqui (o 401 vem antes, na autorização) e, portanto, não gasta a cota de ninguém; dois
/// usuários atrás do mesmo IP não dividem a cota. Singleton, janela fixa de 1 minuto, sem fila.
/// </summary>
public sealed class LimitadorDeExportacao : IDisposable
{
    #region Campos

    private readonly PartitionedRateLimiter<Guid> _limitador;

    #endregion

    #region Construtor

    public LimitadorDeExportacao(IOptions<OpcoesBorda> opcoes)
    {
        var limite = opcoes.Value.LimiteExportacaoPorMinuto;
        _limitador = PartitionedRateLimiter.Create<Guid, Guid>(usuario =>
            RateLimitPartition.GetFixedWindowLimiter(usuario, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = limite,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true,
            }));
    }

    #endregion

    #region Métodos públicos

    /// <summary>Tenta gastar uma requisição da cota do usuário. Se negar, <paramref name="espera"/> é o <c>Retry-After</c>.</summary>
    public bool TentarAdquirir(Guid usuarioId, out TimeSpan espera)
    {
        using var permissao = _limitador.AttemptAcquire(usuarioId);
        espera = TimeSpan.FromMinutes(1);
        if (permissao.IsAcquired)
        {
            return true;
        }

        if (permissao.TryGetMetadata(MetadataName.RetryAfter, out var restante))
        {
            espera = restante;
        }

        return false;
    }

    public void Dispose() => _limitador.Dispose();

    #endregion
}
