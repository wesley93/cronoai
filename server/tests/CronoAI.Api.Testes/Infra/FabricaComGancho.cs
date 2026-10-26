using CronoAI.Dados;
using Microsoft.EntityFrameworkCore;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Fábrica de contextos (papel da aplicação) com um <see cref="GanchoUmaVez"/> ligado, para a API de teste: permite mudar o estado do
/// banco entre a leitura do serviço e a gravação, dentro da mesma requisição HTTP.
/// </summary>
public sealed class FabricaComGancho : IFabricaCronoDbContext
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly GanchoUmaVez _gancho;

    #endregion

    #region Construtor

    public FabricaComGancho(BancoPostgresFixture banco, GanchoUmaVez gancho)
    {
        _banco = banco;
        _gancho = gancho;
    }

    #endregion

    #region Métodos públicos

    public CronoDbContext Criar(ContextoSessaoBanco contexto)
    {
        var opcoes = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(opcoes, _banco.StringConexaoApp);
        opcoes.AddInterceptors(_gancho);
        return new CronoDbContext(opcoes.Options, contexto);
    }

    #endregion
}
