using Microsoft.EntityFrameworkCore;

namespace CronoAI.Dados;

/// <summary>
/// Fábrica singleton: monta as opções do provedor uma vez (mesmo cache de modelo e de serviços do EF) e cria um
/// contexto novo por chamada, com o contexto de banco recebido.
/// </summary>
public sealed class FabricaCronoDbContext : IFabricaCronoDbContext
{
    #region Campos

    private readonly DbContextOptions<CronoDbContext> _opcoes;

    #endregion

    #region Construtor

    public FabricaCronoDbContext(string stringConexao)
    {
        var construtor = new DbContextOptionsBuilder<CronoDbContext>();
        CronoDbContextConfiguracao.Configurar(construtor, stringConexao);
        _opcoes = construtor.Options;
    }

    #endregion

    #region Métodos públicos

    public CronoDbContext Criar(ContextoSessaoBanco contexto)
    {
        ArgumentNullException.ThrowIfNull(contexto);
        return new CronoDbContext(_opcoes, contexto);
    }

    #endregion
}
