using CronoAI.Dados;

namespace CronoAI.Api.Testes.Infra;

/// <summary>
/// Fábrica de contextos (papel da aplicação) com a <see cref="SondaDeComandos"/> ligada: permite contar os comandos que uma
/// requisição ou uma consulta de identidade envia ao banco.
/// </summary>
public sealed class FabricaComSonda : IFabricaCronoDbContext
{
    #region Campos

    private readonly BancoPostgresFixture _banco;
    private readonly SondaDeComandos _sonda;

    #endregion

    #region Construtor

    public FabricaComSonda(BancoPostgresFixture banco, SondaDeComandos sonda)
    {
        _banco = banco;
        _sonda = sonda;
    }

    #endregion

    #region Métodos públicos

    public CronoDbContext Criar(ContextoSessaoBanco contexto) => SondaDeComandos.CriarContexto(_banco, contexto, _sonda);

    #endregion
}
