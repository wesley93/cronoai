using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Dígito verificador e formato do código de município do IBGE (fórmula fixada por casos; sem banco).</summary>
public sealed class CodigoMunicipioIbgeTestes
{
    #region Métodos públicos

    // 3550308, 2611606 e 5300108 foram conferidos à mão (DV 8, 6 e 8); 2699999 é fictício. O usuário os confere contra a
    // lista oficial do IBGE antes do merge (V-1 do plano 00013).
    [Theory]
    [InlineData("3550308")]
    [InlineData("2611606")]
    [InlineData("5300108")]
    [InlineData("2699999")]
    public void CodigoMunicipioIbge_aceita_dv_valido(string codigo)
    {
        Assert.True(CodigoMunicipioIbge.EhValido(codigo));
        CodigoMunicipioIbge.Validar(codigo, "municipioIbge");
    }

    [Theory]
    [InlineData("3550307")] // DV errado
    [InlineData("3550300")] // DV errado
    [InlineData("355030")] // 6 dígitos
    [InlineData("35503080")] // 8 dígitos
    [InlineData("35A0308")] // letra
    [InlineData(" 3550308")] // espaço
    [InlineData("")]
    [InlineData("٣٥٥٠٣٠٨")] // algarismos arábico-índicos: char.IsDigit aceitaria
    public void CodigoMunicipioIbge_recusa_dv_errado_e_formato(string codigo)
    {
        Assert.False(CodigoMunicipioIbge.EhValido(codigo));

        var erro = Assert.Throws<ArgumentException>(() => CodigoMunicipioIbge.Validar(codigo, "municipioIbge"));
        Assert.Equal("municipioIbge", erro.ParamName);
    }

    [Fact]
    public void CodigoMunicipioIbge_nulo_e_recusado()
    {
        Assert.False(CodigoMunicipioIbge.EhValido(null));
        Assert.Throws<ArgumentException>(() => CodigoMunicipioIbge.Validar(null, "municipioIbge"));
    }

    [Theory]
    [InlineData("355030", 8)]
    [InlineData("261160", 6)]
    [InlineData("530010", 8)]
    [InlineData("269999", 9)]
    [InlineData("359999", 0)] // soma 40: o resto 0 dá DV 0, não 10
    public void Digito_verificador_pela_formula(string seisPrimeiros, int esperado)
    {
        Assert.Equal(esperado, CodigoMunicipioIbge.CalcularDigitoVerificador(seisPrimeiros));
    }

    [Fact]
    public void Prefixo_da_uf_sao_os_dois_primeiros_digitos()
    {
        Assert.Equal(35, CodigoMunicipioIbge.PrefixoUf("3550308"));
        Assert.Equal(26, CodigoMunicipioIbge.PrefixoUf("2699999"));
    }

    #endregion
}
