using CronoAI.Dados;

namespace CronoAI.Api.Testes.Dominio;

public sealed class ContextoTestes
{
    #region Métodos públicos

    [Fact]
    public void Contexto_do_banco_e_imutavel()
    {
        // Sem setters públicos: a instância nunca muda depois de criada (o contexto do EF a recebe no construtor).
        var propriedades = typeof(ContextoSessaoBanco).GetProperties()
            .Where(p => p.DeclaringType == typeof(ContextoSessaoBanco) && p.GetIndexParameters().Length == 0 && !p.GetMethod!.IsStatic);

        Assert.All(propriedades, p => Assert.True(p.SetMethod is null || p.SetMethod.ReturnParameter.GetRequiredCustomModifiers().Any(m => m.Name == "IsExternalInit"), $"{p.Name} tem setter mutável"));
    }

    [Fact]
    public void Contextos_nomeados_tem_so_o_que_dizem()
    {
        var usuario = Guid.CreateVersion7();
        var empresa = Guid.CreateVersion7();

        Assert.Equal(new ContextoSessaoBanco(usuario, null), ContextoSessaoBanco.DoUsuario(usuario));
        Assert.Equal(new ContextoSessaoBanco(null, empresa), ContextoSessaoBanco.DaEmpresa(empresa));
        Assert.Equal(new ContextoSessaoBanco(null, null), ContextoSessaoBanco.Vazio);
    }

    #endregion
}
