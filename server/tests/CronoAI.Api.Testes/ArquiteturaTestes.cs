using CronoAI.Dados;

namespace CronoAI.Api.Testes;

public sealed class ArquiteturaTestes
{
    #region Métodos públicos

    [Fact]
    public void Dados_nao_referencia_Api_e_Api_nao_e_referenciada()
    {
        // Direção: Api -> Dados -> Dominio (futuro). Nenhum projeto referencia a Api.
        var referenciados = typeof(CronoDbContext).Assembly.GetReferencedAssemblies().Select(a => a.Name);

        Assert.DoesNotContain("CronoAI.Api", referenciados);
        Assert.Contains("CronoAI.Dados", typeof(Program).Assembly.GetReferencedAssemblies().Select(a => a.Name));
    }

    #endregion
}
