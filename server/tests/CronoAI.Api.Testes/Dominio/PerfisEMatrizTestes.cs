using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Perfis, escopos, par perfil × escopo e a matriz perfil × ação (sem banco). Plano 00014, T01, T05 e T06.</summary>
public sealed class PerfisEMatrizTestes
{
    #region Campos

    // Pares válidos LITERAIS (parecer do dba, seção 1.1), independentes de Perfis.ParValido: se o código mudar, o teste reprova.
    private static readonly HashSet<(string, string)> _paresValidos =
    [
        ("administrador", "todas"),
        ("gestor_portfolio", "todas"),
        ("gestor_portfolio", "carteiras"),
        ("diretoria", "todas"),
        ("diretoria", "carteiras"),
        ("engenheiro_planejamento", "vinculadas"),
        ("engenheiro_obra", "vinculadas"),
        ("suprimentos", "vinculadas"),
        ("encarregado", "vinculadas"),
    ];

    // A tabela do plano (seção 3.5) COPIADA LITERALMENTE, em texto, e não derivada de AcoesPermissao: mudar a matriz exige
    // mudar este teste de propósito. S = permitido; os demais perfis sem a ação recebem 403 na API.
    private static readonly Dictionary<string, string[]> _tabelaDoPlano = new()
    {
        ["administrador"] = ["obras.ler", "obras.criar", "obras.editar", "obras.editar_cadastro", "obras.arquivar", "trilha.ler", "trilha.exportar", "membros.ler", "membros.gerir", "acessos_obra.ler", "acessos_obra.gerir"],
        ["engenheiro_planejamento"] = ["obras.ler", "obras.editar", "trilha.ler"],
        ["engenheiro_obra"] = ["obras.ler", "trilha.ler"],
        ["suprimentos"] = ["obras.ler"],
        ["encarregado"] = ["obras.ler"],
        ["gestor_portfolio"] = ["obras.ler", "trilha.ler", "membros.ler", "acessos_obra.ler", "acessos_obra.gerir"],
        ["diretoria"] = ["obras.ler"],
    };

    #endregion

    #region Métodos públicos

    public static TheoryData<string, string> TodosOsPares()
    {
        var dados = new TheoryData<string, string>();
        foreach (var perfil in new[] { "administrador", "engenheiro_planejamento", "engenheiro_obra", "suprimentos", "encarregado", "gestor_portfolio", "diretoria" })
        {
            foreach (var escopo in new[] { "todas", "vinculadas", "carteiras" })
            {
                dados.Add(perfil, escopo);
            }
        }

        return dados;
    }

    [Theory]
    [MemberData(nameof(TodosOsPares))]
    public void Membro_par_perfil_escopo(string perfil, string escopo)
    {
        var agora = DateTime.UtcNow;

        if (_paresValidos.Contains((perfil, escopo)))
        {
            var membro = MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), perfil, escopo, agora);
            Assert.Equal(perfil, membro.Perfil);
            Assert.Equal(escopo, membro.EscopoObras);
            Assert.True(Perfis.ParValido(perfil, escopo));
        }
        else
        {
            var erro = Assert.Throws<ArgumentException>(() => MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), perfil, escopo, agora));
            Assert.Equal("escopoObras", erro.ParamName);
            Assert.False(Perfis.ParValido(perfil, escopo));
        }
    }

    [Fact]
    public void Perfil_ou_escopo_desconhecido_e_recusado_na_chave_certa()
    {
        var agora = DateTime.UtcNow;

        Assert.Equal("perfil", Assert.Throws<ArgumentException>(() => MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), "dono", "todas", agora)).ParamName);
        Assert.Equal("escopoObras", Assert.Throws<ArgumentException>(() => MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), "administrador", "tudo", agora)).ParamName);
    }

    [Fact]
    public void Escopo_unico_so_existe_quando_o_perfil_admite_um_escopo()
    {
        Assert.Equal("todas", Perfis.EscopoUnico("administrador"));
        Assert.Equal("vinculadas", Perfis.EscopoUnico("engenheiro_obra"));
        Assert.Null(Perfis.EscopoUnico("gestor_portfolio"));
        Assert.Null(Perfis.EscopoUnico("diretoria"));
    }

    [Fact]
    public void Matriz_cobre_toda_acao_e_todo_perfil()
    {
        foreach (var perfil in Perfis.Todos)
        {
            foreach (var acao in AcoesPermissao.Todas)
            {
                // Toda célula existe: Permite não lança para perfil e ação conhecidos.
                _ = MatrizPermissoes.Permite(perfil, acao);
            }
        }

        // Sem padrão implícito: ação ou perfil desconhecido LANÇA (falha fechada), nunca devolve "não".
        Assert.Throws<ArgumentException>(() => MatrizPermissoes.Permite(Perfis.Administrador, "obras.inventada"));
        Assert.Throws<ArgumentException>(() => MatrizPermissoes.Permite("dono", AcoesPermissao.ObrasLer));
        Assert.Throws<ArgumentException>(() => MatrizPermissoes.Permite(null!, AcoesPermissao.ObrasLer));
        Assert.Equal(7, Perfis.Todos.Count);
        Assert.Equal(11, AcoesPermissao.Todas.Count);
    }

    [Fact]
    public void Matriz_igual_a_tabela_do_plano()
    {
        Assert.Equal(_tabelaDoPlano.Keys.Order(StringComparer.Ordinal), Perfis.Todos.Order(StringComparer.Ordinal));

        foreach (var (perfil, permitidas) in _tabelaDoPlano)
        {
            Assert.Equal(permitidas.Order(StringComparer.Ordinal), MatrizPermissoes.AcoesDo(perfil).Order(StringComparer.Ordinal));
            foreach (var acao in AcoesPermissao.Todas)
            {
                Assert.Equal(permitidas.Contains(acao), MatrizPermissoes.Permite(perfil, acao));
            }
        }
    }

    [Fact]
    public void Perfil_a_mais_no_codigo_reprova_a_comparacao_com_a_tabela()
    {
        // Controle do T06: a comparação enxerga uma célula diferente. A tabela de verdade tem o engenheiro de obra SEM exportar.
        var acoesDoEngenheiro = MatrizPermissoes.AcoesDo(Perfis.EngenheiroObra).ToHashSet(StringComparer.Ordinal);
        acoesDoEngenheiro.Add(AcoesPermissao.TrilhaExportar);

        Assert.NotEqual(_tabelaDoPlano["engenheiro_obra"].Order(StringComparer.Ordinal), acoesDoEngenheiro.Order(StringComparer.Ordinal));
    }

    #endregion
}
