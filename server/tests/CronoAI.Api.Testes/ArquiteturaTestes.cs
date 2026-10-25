using CronoAI.Dados;

namespace CronoAI.Api.Testes;

public sealed class ArquiteturaTestes
{
    #region Métodos públicos

    [Fact]
    public void Dados_nao_referencia_Api_e_Api_referencia_Dados()
    {
        // Direção: Api -> Dados -> Dominio (futuro). Nenhum projeto referencia a Api.
        var referenciadosPeloDados = typeof(CronoDbContext).Assembly.GetReferencedAssemblies().Select(a => a.Name);
        var referenciadosPelaApi = typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name);

        Assert.DoesNotContain("CronoAI.Api", referenciadosPeloDados);
        Assert.Contains("CronoAI.Dados", referenciadosPelaApi);
    }

    #endregion
}
