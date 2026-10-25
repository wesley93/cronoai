using CronoAI.Api.Testes.Infra;
using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Fábricas e regras da obra no domínio (sem banco).</summary>
public sealed class ObraTestes
{
    #region Campos

    private static readonly DateTime _criada = new(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);
    private static readonly Guid _empresa = Guid.CreateVersion7();

    #endregion

    #region Métodos públicos

    [Fact]
    public void Obra_criar_aceita_o_caso_valido()
    {
        // Controle negativo do Theory abaixo: o mesmo caso, sem defeito, passa.
        var obra = Obra.Criar(_empresa, Valida(), _criada);

        Assert.Equal(7, obra.Id.Version);
        Assert.Equal(_empresa, obra.EmpresaId);
        Assert.Equal("Obra Ficticia", obra.Nome);
        Assert.Equal(_criada, obra.CriadaEm);
        Assert.Equal(_criada, obra.AtualizadaEm);
        Assert.Null(obra.ArquivadaEm);
        Assert.Equal("{}", obra.OpcoesCronograma);
    }

    [Theory]
    [InlineData("nome", "")]
    [InlineData("nome", "   ")]
    [InlineData("nome", "201")]
    [InlineData("nome", "nulo")]
    [InlineData("nome", "tabulacao")]
    [InlineData("uf", "sp")]
    [InlineData("uf", "S")]
    [InlineData("municipioIbge", "3550307")]
    [InlineData("municipioIbge", "355030")]
    [InlineData("sinapi", "so-uf")]
    [InlineData("sinapi", "so-regime")]
    [InlineData("sinapiUf", "xx")]
    [InlineData("sinapiRegime", "x")]
    [InlineData("sinapiDataBase", "dia-2")]
    [InlineData("opcoesCronograma", "array")]
    [InlineData("opcoesCronograma", "texto")]
    [InlineData("opcoesCronograma", "malformado")]
    [InlineData("opcoesCronograma", "profundo")]
    [InlineData("opcoesCronograma", "nulo-no-texto")]
    [InlineData("opcoesCronograma", "grande")]
    [InlineData("responsavelId", "vazio")]
    public void Obra_criar_recusa_campos_invalidos(string campo, string defeito)
    {
        var dados = defeito switch
        {
            "" => Valida() with { Nome = "" },
            "   " => Valida() with { Nome = "   " },
            "201" => Valida() with { Nome = new string('n', 201) },
            "nulo" => Valida() with { Nome = "Obra\0Nula" },
            "tabulacao" => Valida() with { Nome = "Obra\tTab" },
            "sp" => Valida() with { Uf = "sp" },
            "S" => Valida() with { Uf = "S" },
            "3550307" => Valida() with { MunicipioIbge = "3550307" },
            "355030" => Valida() with { MunicipioIbge = "355030" },
            "so-uf" => Valida() with { SinapiUf = "PE", SinapiRegime = null, SinapiDataBase = null },
            "so-regime" => Valida() with { SinapiUf = null, SinapiRegime = RegimesSinapi.Desonerado, SinapiDataBase = null },
            "xx" => ComSinapi() with { SinapiUf = "xx" },
            "x" => ComSinapi() with { SinapiRegime = "x" },
            "dia-2" => ComSinapi() with { SinapiDataBase = new DateOnly(2026, 9, 2) },
            "array" => Valida() with { OpcoesCronograma = "[1,2]" },
            "texto" => Valida() with { OpcoesCronograma = "\"x\"" },
            "malformado" => Valida() with { OpcoesCronograma = "{\"a\":" },
            "profundo" => Valida() with { OpcoesCronograma = Aninhado(17) },
            "nulo-no-texto" => Valida() with { OpcoesCronograma = "{\"a\":\"x\\u0000y\"}" },
            "grande" => Valida() with { OpcoesCronograma = "{\"a\":\"" + new string('x', 17000) + "\"}" },
            "vazio" => Valida() with { ResponsavelId = Guid.Empty },
            _ => throw new InvalidOperationException(defeito),
        };

        var erro = Assert.Throws<ArgumentException>(() => Obra.Criar(_empresa, dados, _criada));

        Assert.Equal(campo, erro.ParamName);
    }

    [Fact]
    public void Obra_criar_aceita_o_limite_de_profundidade_e_sinapi_completo()
    {
        var obra = Obra.Criar(
            _empresa,
            Valida() with
            {
                SinapiUf = "PE",
                SinapiRegime = RegimesSinapi.NaoDesonerado,
                SinapiDataBase = new DateOnly(2026, 9, 1),
                OpcoesCronograma = Aninhado(16),
                DataStatus = null,
            },
            _criada);

        Assert.Equal("PE", obra.SinapiUf);
        Assert.Null(obra.DataStatus);
    }

    [Fact]
    public void Obra_criar_exige_instante_utc_e_empresa()
    {
        Assert.Throws<ArgumentException>(() => Obra.Criar(_empresa, Valida(), DateTime.SpecifyKind(_criada, DateTimeKind.Unspecified)));
        Assert.Throws<ArgumentException>(() => Obra.Criar(Guid.Empty, Valida(), _criada));
    }

    [Fact]
    public void Obra_nome_e_aparado_nas_pontas()
    {
        var obra = Obra.Criar(_empresa, Valida() with { Nome = "  Obra A  " }, _criada);

        Assert.Equal("Obra A", obra.Nome);
    }

    [Fact]
    public void Obra_arquivar_e_restaurar_so_mudam_arquivamento()
    {
        var obra = Obra.Criar(_empresa, Valida(), _criada);
        var arquivada = _criada.AddHours(1);
        var restaurada = _criada.AddHours(2);

        obra.Arquivar(arquivada);

        Assert.Equal(arquivada, obra.ArquivadaEm);
        Assert.Equal(arquivada, obra.AtualizadaEm);
        Assert.Equal("Obra Ficticia", obra.Nome);
        Assert.Throws<InvalidOperationException>(() => obra.Arquivar(arquivada.AddMinutes(1)));

        obra.Restaurar(restaurada);

        Assert.Null(obra.ArquivadaEm);
        Assert.Equal(restaurada, obra.AtualizadaEm);
        Assert.Equal(_criada, obra.CriadaEm);
        Assert.Equal("Obra Ficticia", obra.Nome);
        Assert.Throws<InvalidOperationException>(() => obra.Restaurar(restaurada.AddMinutes(1)));
    }

    [Fact]
    public void Obra_instante_anterior_a_criacao_e_recusado()
    {
        var obra = Obra.Criar(_empresa, Valida(), _criada);

        Assert.Throws<ArgumentException>(() => obra.Arquivar(_criada.AddSeconds(-1)));
        Assert.Throws<ArgumentException>(() => obra.Alterar(Valida() with { Nome = "Outra" }, _criada.AddSeconds(-1)));
    }

    [Fact]
    public void Obra_alterar_devolve_se_mudou_e_so_toca_em_atualizada_em_quando_muda()
    {
        var obra = Obra.Criar(_empresa, Valida(), _criada);
        var depois = _criada.AddMinutes(5);

        // Sem mudança (inclusive nome com espaços nas pontas e opções reordenadas): nada muda.
        Assert.False(obra.Alterar(Valida() with { Nome = "  Obra Ficticia  " }, depois));
        Assert.Equal(_criada, obra.AtualizadaEm);

        Assert.True(obra.Alterar(Valida() with { Nome = "Obra Ficticia 2" }, depois));
        Assert.Equal("Obra Ficticia 2", obra.Nome);
        Assert.Equal(depois, obra.AtualizadaEm);
    }

    [Fact]
    public void Obra_alterar_compara_opcoes_pelo_significado_nao_pelo_texto()
    {
        var obra = Obra.Criar(_empresa, Valida() with { OpcoesCronograma = "{\"b\":1,\"a\":[1,2]}" }, _criada);

        // Mesma informação, outra ordem de chaves e outros espaços (o jsonb faz isso): não é mudança.
        Assert.False(obra.Alterar(Valida() with { OpcoesCronograma = "{ \"a\": [1, 2], \"b\": 1.0 }" }, _criada.AddMinutes(1)));
        Assert.Equal("{\"b\":1,\"a\":[1,2]}", obra.OpcoesCronograma);

        // Valor diferente: é mudança.
        Assert.True(obra.Alterar(Valida() with { OpcoesCronograma = "{\"a\":[1,3],\"b\":1}" }, _criada.AddMinutes(1)));
    }

    [Fact]
    public void Obra_arquivada_nao_pode_ser_alterada()
    {
        var obra = Obra.Criar(_empresa, Valida(), _criada);
        obra.Arquivar(_criada.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() => obra.Alterar(Valida() with { Nome = "Outra" }, _criada.AddMinutes(2)));
    }

    [Fact]
    public void Obra_opcoes_o_teto_vale_para_o_texto_do_jsonb_nao_para_o_texto_compacto()
    {
        // O jsonb escreve ": " e ", ": cada par de "kNNNN":1 passa de 10 para 12 bytes. 1365 pares = 16380 bytes no banco
        // (cabe em 16384); 1366 = 16392 (não cabe), embora o texto COMPACTO de 1366 pares (13659 bytes) caiba folgado.
        var cabe = Obra.Criar(_empresa, Valida() with { OpcoesCronograma = DadosTeste.ParesCompactos(1365) }, _criada);
        Assert.Equal(1365, System.Text.Json.JsonDocument.Parse(cabe.OpcoesCronograma).RootElement.EnumerateObject().Count());

        var compacto = DadosTeste.ParesCompactos(1366);
        Assert.True(System.Text.Encoding.UTF8.GetByteCount(compacto) < 16384);
        var erro = Assert.Throws<ArgumentException>(() => Obra.Criar(_empresa, Valida() with { OpcoesCronograma = compacto }, _criada));
        Assert.Equal("opcoesCronograma", erro.ParamName);
    }

    [Theory]
    [InlineData("{\"a\":1e131071}")]
    [InlineData("{\"a\":1e-16383}")]
    [InlineData("{\"a\":1E5}")]
    [InlineData("{\"a\":[1,2.5e3]}")]
    [InlineData("{\"a\":123456789012345678901234567890123}")] // 33 caracteres
    public void Obra_opcoes_recusa_numero_exponencial_ou_com_mais_de_32_caracteres(string json)
    {
        // O jsonb escreve o número por extenso: 1e131071 (8 bytes de texto) vira ~131 KB no banco.
        var erro = Assert.Throws<ArgumentException>(() => Obra.Criar(_empresa, Valida() with { OpcoesCronograma = json }, _criada));

        Assert.Equal("opcoesCronograma", erro.ParamName);
    }

    [Fact]
    public void Obra_opcoes_aceita_numero_decimal_normal_e_longo_ate_32_caracteres()
    {
        // Controle negativo: 32 caracteres passam (decimal longo, negativo, inteiro grande).
        foreach (var numero in new[] { "1234567890123456789012345678901", "-1234567890.12345678901234567890", "0.5", "-12", "1234567890.12345678901234567890" })
        {
            Assert.True(numero.Length <= 32);
            Obra.Criar(_empresa, Valida() with { OpcoesCronograma = "{\"a\":" + numero + "}" }, _criada);
        }
    }

    #endregion

    #region Métodos privados



    private static DadosObra ComSinapi() =>
        Valida() with { SinapiUf = "PE", SinapiRegime = RegimesSinapi.Desonerado, SinapiDataBase = new DateOnly(2026, 9, 1) };

    private static DadosObra Valida() =>
        new("Obra Ficticia", "PE", "2699999", null, new DateOnly(2026, 10, 1), null, null, null);

    // {"a":{"a":...}} com a profundidade pedida (o objeto de fora conta como nível 1).
    private static string Aninhado(int niveis)
    {
        var texto = "1";
        for (var i = 0; i < niveis; i++)
        {
            texto = "{\"a\":" + texto + "}";
        }

        return texto;
    }

    #endregion
}
