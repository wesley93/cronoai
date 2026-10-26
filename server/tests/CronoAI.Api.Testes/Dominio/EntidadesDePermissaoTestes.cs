using CronoAI.Dominio;

namespace CronoAI.Api.Testes.Dominio;

/// <summary>Fábricas e regras das entidades novas do ciclo 00014 (sem banco): membro, frente, carteira e vínculos. T02, T03, T04 e T07.</summary>
public sealed class EntidadesDePermissaoTestes
{
    #region Campos

    private static readonly DateTime _t0 = new(2026, 10, 25, 12, 0, 0, DateTimeKind.Utc);

    #endregion

    #region Métodos públicos

    [Fact]
    public void Membro_remover_e_reativar_so_mudam_remocao()
    {
        var membro = MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), Perfis.EngenheiroObra, EscoposObras.Vinculadas, _t0);
        var depois = _t0.AddHours(1);

        membro.Remover(depois);

        Assert.Equal(depois, membro.RemovidoEm);
        Assert.Equal(depois, membro.AtualizadoEm);
        Assert.Equal(Perfis.EngenheiroObra, membro.Perfil);
        Assert.Equal(EscoposObras.Vinculadas, membro.EscopoObras);
        Assert.Equal(_t0, membro.CriadoEm);
        Assert.Throws<InvalidOperationException>(() => membro.Remover(depois.AddHours(1)));
        Assert.Throws<InvalidOperationException>(() => membro.AlterarPerfil(Perfis.Suprimentos, EscoposObras.Vinculadas, depois));

        var reativado = depois.AddHours(2);
        membro.Reativar(reativado);

        Assert.Null(membro.RemovidoEm);
        Assert.Equal(reativado, membro.AtualizadoEm);
        Assert.Equal(_t0, membro.CriadoEm);
        Assert.Throws<InvalidOperationException>(() => membro.Reativar(reativado));

        // Instante anterior à criação é recusado (os CHECKs do banco o recusariam).
        Assert.Throws<ArgumentException>(() => membro.Remover(_t0.AddMinutes(-1)));
    }

    [Fact]
    public void Membro_alterar_perfil_sem_mudanca_devolve_falso_e_nao_toca_em_nada()
    {
        var membro = MembroEmpresa.Criar(Guid.CreateVersion7(), Guid.CreateVersion7(), Perfis.EngenheiroObra, EscoposObras.Vinculadas, _t0);

        Assert.False(membro.AlterarPerfil(Perfis.EngenheiroObra, EscoposObras.Vinculadas, _t0.AddHours(1)));
        Assert.Equal(_t0, membro.AtualizadoEm);

        Assert.True(membro.AlterarPerfil(Perfis.GestorPortfolio, EscoposObras.Carteiras, _t0.AddHours(2)));
        Assert.Equal(Perfis.GestorPortfolio, membro.Perfil);
        Assert.Equal(_t0.AddHours(2), membro.AtualizadoEm);
    }

    [Fact]
    public void Frente_criar_valida_campos()
    {
        var empresa = Guid.CreateVersion7();
        var obra = Guid.CreateVersion7();

        // Caso válido (CN): nome aparado, id v7.
        var frente = Frente.Criar(empresa, obra, "  Fundação  ", null, "Mestre Fictício", _t0);
        Assert.Equal("Fundação", frente.Nome);
        Assert.Equal(7, frente.Id.Version);
        Assert.Equal(obra, frente.ObraId);
        Assert.Equal("Mestre Fictício", frente.ResponsavelTexto);
        Assert.Null(Frente.Criar(empresa, obra, "Estrutura", Guid.CreateVersion7(), null, _t0).ResponsavelTexto);

        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "", null, null, _t0)).ParamName);
        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "   ", null, null, _t0)).ParamName);
        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, new string('x', 201), null, null, _t0)).ParamName);
        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "Fun\0dação", null, null, _t0)).ParamName);
        Assert.Equal("responsavelTexto", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "A", null, new string('x', 121), _t0)).ParamName);
        Assert.Equal("responsavelTexto", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "A", null, "Mes\ttre", _t0)).ParamName);
        Assert.Equal("responsavelTexto", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "A", null, "", _t0)).ParamName);

        // Os dois responsáveis juntos: no máximo um (membro OU texto).
        Assert.Equal("responsavelTexto", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "A", Guid.CreateVersion7(), "Alguém", _t0)).ParamName);
        Assert.Equal("responsavelId", Assert.Throws<ArgumentException>(() => Frente.Criar(empresa, obra, "A", Guid.Empty, null, _t0)).ParamName);

        // Limites exatos passam.
        Assert.Equal(200, Frente.Criar(empresa, obra, new string('x', 200), null, new string('y', 120), _t0).Nome.Length);
    }

    [Fact]
    public void Carteira_criar_valida_tipo_e_nome()
    {
        var empresa = Guid.CreateVersion7();

        foreach (var tipo in new[] { "regional", "cliente", "gestor" })
        {
            Assert.Equal(tipo, Carteira.Criar(empresa, " Nordeste ", tipo, _t0).Tipo);
        }

        Assert.Equal("Nordeste", Carteira.Criar(empresa, " Nordeste ", "regional", _t0).Nome);
        Assert.Equal("tipo", Assert.Throws<ArgumentException>(() => Carteira.Criar(empresa, "X", "outro", _t0)).ParamName);
        Assert.Equal("tipo", Assert.Throws<ArgumentException>(() => Carteira.Criar(empresa, "X", "", _t0)).ParamName);
        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Carteira.Criar(empresa, "", "regional", _t0)).ParamName);
        Assert.Equal("nome", Assert.Throws<ArgumentException>(() => Carteira.Criar(empresa, new string('x', 201), "regional", _t0)).ParamName);
    }

    [Fact]
    public void Vinculos_recusam_ids_vazios()
    {
        var (e, o, u, f, c) = (Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7(), Guid.CreateVersion7());

        // Casos válidos (CN) criam com id v7.
        Assert.Equal(7, AcessoObra.Criar(e, o, u, _t0).Id.Version);
        Assert.Equal(7, AcessoFrente.Criar(e, o, f, u, _t0).Id.Version);
        Assert.Equal(7, CarteiraObra.Criar(e, c, o, _t0).Id.Version);
        Assert.Equal(7, AcessoCarteira.Criar(e, c, u, _t0).Id.Version);

        var vazio = Guid.Empty;
        Assert.Throws<ArgumentException>(() => AcessoObra.Criar(vazio, o, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoObra.Criar(e, vazio, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoObra.Criar(e, o, vazio, _t0));
        Assert.Throws<ArgumentException>(() => AcessoFrente.Criar(vazio, o, f, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoFrente.Criar(e, vazio, f, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoFrente.Criar(e, o, vazio, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoFrente.Criar(e, o, f, vazio, _t0));
        Assert.Throws<ArgumentException>(() => CarteiraObra.Criar(vazio, c, o, _t0));
        Assert.Throws<ArgumentException>(() => CarteiraObra.Criar(e, vazio, o, _t0));
        Assert.Throws<ArgumentException>(() => CarteiraObra.Criar(e, c, vazio, _t0));
        Assert.Throws<ArgumentException>(() => AcessoCarteira.Criar(vazio, c, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoCarteira.Criar(e, vazio, u, _t0));
        Assert.Throws<ArgumentException>(() => AcessoCarteira.Criar(e, c, vazio, _t0));
        Assert.Throws<ArgumentException>(() => MembroEmpresa.Criar(vazio, u, Perfis.Administrador, EscoposObras.Todas, _t0));
        Assert.Throws<ArgumentException>(() => MembroEmpresa.Criar(e, vazio, Perfis.Administrador, EscoposObras.Todas, _t0));
        Assert.Throws<ArgumentException>(() => Frente.Criar(vazio, o, "A", null, null, _t0));
        Assert.Throws<ArgumentException>(() => Carteira.Criar(vazio, "A", "regional", _t0));

        // Instante não UTC também é recusado.
        Assert.Throws<ArgumentException>(() => AcessoObra.Criar(e, o, u, DateTime.SpecifyKind(_t0, DateTimeKind.Unspecified)));
    }

    #endregion
}
